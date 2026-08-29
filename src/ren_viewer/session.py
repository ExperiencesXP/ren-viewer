"""In-memory session for the currently opened game."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ren_viewer.overlay.workspace import overlay_dir_for, write_overlay
from ren_viewer.script.decompile import DecompileError, decompile, is_compiled
from ren_viewer.script.graph import build_graph
from ren_viewer.script.index import ScriptIndex, auto_images_from_paths, index_text
from ren_viewer.vfs.game import GameVFS, open_game


SCRIPT_EXTS = (".rpy", ".rpym", ".rpyc", ".rpymc")


@dataclass
class Session:
    vfs: GameVFS
    overlay: Path
    opened_path: str
    index: ScriptIndex | None = None
    decompiled: dict[str, str] = field(default_factory=dict)
    decompile_errors: dict[str, str] = field(default_factory=dict)

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

    def script_text(self, logical: str) -> str:
        if logical in self.decompiled:
            return self.decompiled[logical]
        data = self.vfs.read(logical)
        if is_compiled(logical):
            try:
                text = decompile(data, logical)
            except DecompileError as exc:
                self.decompile_errors[logical] = str(exc)
                text = exc.dump or f"# decompile failed: {exc}\n"
        else:
            text = decompile(data, logical)
        self.decompiled[logical] = text
        return text

    def ensure_index(self) -> ScriptIndex:
        if self.index is not None:
            return self.index
        merged = ScriptIndex()
        for path in self.script_paths():
            try:
                text = self.script_text(path)
            except Exception as exc:  # noqa: BLE001
                self.decompile_errors[path] = str(exc)
                continue
            merged.merge(index_text(text, path))
        merged.images.extend(auto_images_from_paths(self.vfs.list_paths(include_basedir=False)))
        self.index = merged
        return merged

    def graph(self):
        return build_graph(self.ensure_index())

    def put_overlay(self, logical: str, data: bytes) -> None:
        write_overlay(self.overlay, logical, data)
        self.vfs.rebuild()


_current: Session | None = None


def current() -> Session:
    if _current is None:
        raise RuntimeError("no game open")
    return _current


def has_session() -> bool:
    return _current is not None


def open_session(path: str) -> Session:
    global _current
    vfs = open_game(path)
    overlay = overlay_dir_for(vfs.basedir)
    vfs.overlay_dir = overlay
    vfs.rebuild()
    _current = Session(vfs=vfs, overlay=overlay, opened_path=str(Path(path).resolve()))
    return _current


def close_session() -> None:
    global _current
    _current = None
