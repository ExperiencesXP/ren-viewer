"""In-memory session for the currently opened game."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path

from ren_viewer.overlay.workspace import overlay_dir_for, write_overlay
from ren_viewer.script.decompile import DecompileError, decompile, is_compiled
from ren_viewer.script.graph import build_graph
from ren_viewer.script.index import ScriptIndex, auto_images_from_paths, index_text
from ren_viewer.vfs.game import GameVFS, open_game


class _IndexCancelled(Exception):
    """Indexer aborted because the session closed."""


SCRIPT_EXTS = (".rpy", ".rpym", ".rpyc", ".rpymc")
HEURISTIC_DIRS = (
    "images/",
    "image/",
    "cg/",
    "cgs/",
    "ev/",
    "event/",
    "scene/",
    "scenes/",
)
HEURISTIC_DIR_NAMES = frozenset(part.rstrip("/") for part in HEURISTIC_DIRS)
GENERAL_ART_DIRS = frozenset({"images", "image"})
SKIP_UNDER_GENERAL = frozenset({"navigation", "icons"})
GALLERY_EXTS = {
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "avif",
    "bmp",
    "ico",
    "webm",
    "mp4",
}


def _dir_parts(path: str) -> list[str]:
    parts = path.replace("\\", "/").lower().split("/")
    return parts[:-1] if len(parts) > 1 else []


def _in_heuristic_dir(path: str) -> bool:
    """Usual Ren'Py art folders, minus UI clutter under images/ and image/."""
    dirs = _dir_parts(path)
    if not any(d in HEURISTIC_DIR_NAMES for d in dirs):
        return False
    if any(d in GENERAL_ART_DIRS for d in dirs) and any(d in SKIP_UNDER_GENERAL for d in dirs):
        return False
    return True


@dataclass
class Session:
    vfs: GameVFS
    overlay: Path
    opened_path: str
    index: ScriptIndex | None = None
    decompiled: dict[str, str] = field(default_factory=dict)
    decompile_errors: dict[str, str] = field(default_factory=dict)
    _script_lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)
    _index_lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)
    _index_thread: threading.Thread | None = field(default=None, repr=False, compare=False)
    _index_state: str = "idle"
    _index_total: int = 0
    _index_done: int = 0
    _index_current: str | None = None
    _index_error: str | None = None
    _index_cancel: bool = False

    @property
    def name(self) -> str:
        if self.index and self.index.config_name:
            return self.index.config_name
        return self.vfs.basedir.name

    def script_paths(self) -> list[str]:
        paths = []
        for p in self.vfs.list_paths(include_basedir=False):
            lower = p.lower()
            if lower.endswith(SCRIPT_EXTS) or lower.endswith("_ren.py"):
                if p.startswith("common/"):
                    continue
                paths.append(p)
        return sorted(paths)

    def _cancelled(self) -> bool:
        with self._index_lock:
            return self._index_cancel

    def script_text(self, logical: str) -> str:
        with self._script_lock:
            cached = self.decompiled.get(logical)
            if cached is not None:
                return cached
        data = self.vfs.read(logical)
        if self._cancelled():
            raise _IndexCancelled()
        if is_compiled(logical):
            try:
                text = decompile(data, logical)
            except DecompileError as exc:
                with self._script_lock:
                    self.decompile_errors[logical] = str(exc)
                text = exc.dump or f"# decompile failed: {exc}\n"
        else:
            text = decompile(data, logical)
        if self._cancelled():
            raise _IndexCancelled()
        with self._script_lock:
            cached = self.decompiled.get(logical)
            if cached is not None:
                return cached
            self.decompiled[logical] = text
            return text

    def start_index(self) -> None:
        with self._index_lock:
            if self.index is not None:
                return
            if self._index_state == "running":
                return
            if self._index_thread is not None and self._index_thread.is_alive():
                return
            self._index_state = "running"
            self._index_error = None
            self._index_cancel = False
            thread = threading.Thread(target=self._build_index, name="ren-index", daemon=True)
            self._index_thread = thread
        thread.start()

    def _build_index(self) -> None:
        try:
            paths = self.script_paths()
            with self._index_lock:
                self._index_total = len(paths)
                self._index_done = 0
                self._index_current = None
            merged = ScriptIndex()
            for i, path in enumerate(paths):
                if self._cancelled():
                    return
                with self._index_lock:
                    self._index_current = path
                try:
                    text = self.script_text(path)
                except _IndexCancelled:
                    return
                except Exception as exc:  # noqa: BLE001
                    with self._script_lock:
                        self.decompile_errors[path] = str(exc)
                    with self._index_lock:
                        self._index_done = i + 1
                    continue
                if self._cancelled():
                    return
                merged.merge(index_text(text, path))
                with self._index_lock:
                    self._index_done = i + 1
            if self._cancelled():
                return
            merged.images.extend(auto_images_from_paths(self.vfs.list_paths(include_basedir=False)))
            with self._index_lock:
                self.index = merged
                self._index_state = "ready"
                self._index_current = None
                self._index_done = self._index_total
        except _IndexCancelled:
            return
        except Exception as exc:  # noqa: BLE001
            if self._cancelled():
                return
            with self._index_lock:
                self._index_state = "error"
                self._index_error = str(exc)
                self._index_current = None

    def ensure_index(self) -> ScriptIndex:
        self.start_index()
        thread = self._index_thread
        if thread is not None and thread is not threading.current_thread():
            thread.join()
        with self._index_lock:
            if self.index is None:
                raise RuntimeError(self._index_error or "index failed")
            return self.index

    def index_status(self) -> dict:
        self.start_index()
        with self._index_lock:
            state = self._index_state
            total = self._index_total
            done = self._index_done
            current = self._index_current
            error = self._index_error
        with self._script_lock:
            faults = len(self.decompile_errors)
        return {
            "state": state,
            "total": total,
            "done": done,
            "current": current,
            "error": error,
            "faults": faults,
        }

    def gallery_items(self) -> list[dict]:
        """Plates from heuristic folders always; script image statements once indexed."""
        items: list[dict] = []
        seen: set[str] = set()
        with self._index_lock:
            idx = self.index
        if idx is not None:
            for im in idx.images:
                name_l = im.name.lower()
                file_l = (im.file or "").replace("\\", "/").lower()
                if im.kind == "auto" and _in_heuristic_dir(file_l):
                    if im.file and im.file not in seen:
                        items.append({"name": im.name, "file": im.file, "origin": "heuristic"})
                        seen.add(im.file)
                elif any(tok in name_l.split() for tok in ("cg", "ev", "event")):
                    items.append({"name": im.name, "file": im.file, "origin": "image"})
                    if im.file:
                        seen.add(im.file)
        for path in self.vfs.list_paths(include_basedir=False):
            low = path.replace("\\", "/").lower()
            name = low.rsplit("/", 1)[-1]
            ext = name.rsplit(".", 1)[-1] if "." in name else ""
            if ext in GALLERY_EXTS and _in_heuristic_dir(low):
                if path not in seen:
                    items.append({"name": Path(path).stem, "file": path, "origin": "heuristic"})
                    seen.add(path)
        return items

    def graph(self):
        return build_graph(self.ensure_index())

    def put_overlay(self, logical: str, data: bytes) -> None:
        write_overlay(self.overlay, logical, data)
        self.vfs.rebuild()


_current: Session | None = None
_session_gate = threading.Lock()


def current() -> Session:
    session = _current
    if session is None:
        raise RuntimeError("no game open")
    return session


def has_session() -> bool:
    return _current is not None


def open_session(path: str) -> Session:
    global _current
    with _session_gate:
        _stop_session()
        vfs = open_game(path)
        overlay = overlay_dir_for(vfs.basedir)
        vfs.overlay_dir = overlay
        vfs.rebuild()
        session = Session(vfs=vfs, overlay=overlay, opened_path=str(Path(path).resolve()))
        _current = session
    session.start_index()
    return session


def close_session() -> None:
    with _session_gate:
        _stop_session()


def _stop_session() -> None:
    global _current
    session = _current
    _current = None
    if session is None:
        return
    with session._index_lock:
        session._index_cancel = True
        thread = session._index_thread
    if thread is not None and thread.is_alive() and thread is not threading.current_thread():
        thread.join(timeout=30)
