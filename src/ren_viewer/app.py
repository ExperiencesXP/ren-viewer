"""FastAPI application: local API + static UI."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ren_viewer import __version__
from ren_viewer.extras.ddlc_chr import scan_chr
from ren_viewer.media.sniff import sniff
from ren_viewer.overlay.workspace import export_patch_rpa
from ren_viewer.session import close_session, current, has_session, open_session

STATIC_DIR = Path(__file__).resolve().parent / "static"
WEB_DIST = Path(__file__).resolve().parents[2] / "web" / "dist"


class OpenBody(BaseModel):
    path: str


class OverlayBody(BaseModel):
    path: str
    content_b64: str | None = None
    text: str | None = None


class ExportBody(BaseModel):
    dest: str
    filename: str = "z_renviewer.rpa"


def create_app() -> FastAPI:
    app = FastAPI(title="Ren-Viewer", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {"ok": True, "version": __version__, "open": has_session()}

    @app.post("/api/open")
    def api_open(body: OpenBody):
        try:
            session = open_session(body.path)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return _game_info(session)

    @app.post("/api/close")
    def api_close():
        close_session()
        return {"ok": True}

    @app.get("/api/game")
    def api_game():
        return _game_info(_require())

    @app.get("/api/vfs/tree")
    def api_tree(path: str = ""):
        session = _require()
        nodes = session.vfs.tree(path)
        return {"path": path, "nodes": [_node(n) for n in nodes]}

    @app.get("/api/vfs/stat")
    def api_stat(path: str):
        session = _require()
        src = session.vfs.source(path)
        if src is None:
            raise HTTPException(404, path)
        head = b""
        try:
            head = session.vfs.read(path)[:64]
        except Exception:  # noqa: BLE001
            pass
        info = sniff(head, path) if head else None
        return {
            "path": path,
            "size": src.length,
            "kind": info.kind if info else "binary",
            "sniffed": info.label if info else None,
            "mime": info.mime if info else "application/octet-stream",
            "source": src.__dict__,
        }

    @app.get("/api/vfs/file")
    def api_file(path: str, download: bool = False):
        session = _require()
        if not session.vfs.exists(path):
            raise HTTPException(404, path)
        data = session.vfs.read(path)
        info = sniff(data[: 64 * 1024], path)
        headers = {}
        if download:
            headers["Content-Disposition"] = f'attachment; filename="{Path(path).name}"'
        return Response(content=data, media_type=info.mime, headers=headers)

    @app.get("/api/scripts")
    def api_scripts():
        session = _require()
        return {"scripts": session.script_paths()}

    @app.get("/api/scripts/content")
    def api_script_content(path: str):
        session = _require()
        try:
            text = session.script_text(path)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        return {
            "path": path,
            "text": text,
            "error": session.decompile_errors.get(path),
        }

    @app.get("/api/index")
    def api_index():
        session = _require()
        idx = session.ensure_index()
        return {
            "name": idx.config_name,
            "version": idx.config_version,
            "save_directory": idx.save_directory,
            "labels": [
                {
                    "name": lab.name,
                    "file": lab.file,
                    "jumps": lab.jumps,
                    "calls": lab.calls,
                    "menus": [{"text": m.text, "target": m.target} for m in lab.menus],
                }
                for lab in idx.labels.values()
            ],
            "characters": [c.__dict__ for c in idx.characters],
            "images": [i.__dict__ for i in idx.images],
            "screens": idx.screens,
            "gallery_mentioned": idx.gallery_mentioned,
            "musicroom_mentioned": idx.musicroom_mentioned,
            "errors": session.decompile_errors,
        }

    @app.get("/api/graph")
    def api_graph():
        session = _require()
        g = session.graph()
        return {
            "nodes": [n.__dict__ for n in g.nodes],
            "edges": [e.__dict__ for e in g.edges],
            "entries": g.entries,
        }

    @app.get("/api/gallery")
    def api_gallery():
        session = _require()
        idx = session.ensure_index()
        heuristic_dirs = ("cg/", "cgs/", "ev/", "event/", "scene/", "scenes/")
        items = []
        seen: set[str] = set()
        for im in idx.images:
            name_l = im.name.lower()
            file_l = (im.file or "").lower()
            if im.kind == "auto" and any(part in file_l for part in heuristic_dirs):
                if im.file and im.file not in seen:
                    items.append({"name": im.name, "file": im.file, "origin": "heuristic"})
                    seen.add(im.file)
            elif any(tok in name_l.split() for tok in ("cg", "ev", "event")):
                items.append({"name": im.name, "file": im.file, "origin": "image"})
        for path in session.vfs.list_paths(include_basedir=False):
            low = path.lower()
            if any(d in low for d in heuristic_dirs) and low.rsplit(".", 1)[-1] in {
                "png",
                "jpg",
                "jpeg",
                "webp",
                "gif",
            }:
                if path not in seen:
                    items.append({"name": Path(path).stem, "file": path, "origin": "heuristic"})
                    seen.add(path)
        return {"gallery_mentioned": idx.gallery_mentioned, "items": items}

    @app.get("/api/audio")
    def api_audio():
        session = _require()
        items = []
        audio_ext = (".ogg", ".mp3", ".wav", ".opus", ".flac")
        for path, src in session.vfs.iter_files():
            if path.lower().endswith(audio_ext):
                items.append({"path": path, "size": src.length, "source": src.layer})
        return {"items": items}

    @app.get("/api/extras/chr")
    def api_chr():
        session = _require()
        return {"items": [e.__dict__ for e in scan_chr(session.vfs.basedir)]}

    @app.get("/api/search")
    def api_search(q: str = Query(min_length=1), limit: int = 80):
        session = _require()
        q_low = q.lower()
        hits = []
        for path in session.vfs.list_paths():
            if q_low in path.lower():
                hits.append({"kind": "file", "path": path, "preview": path})
                if len(hits) >= limit:
                    return {"hits": hits}
        try:
            idx = session.ensure_index()
        except Exception:  # noqa: BLE001
            return {"hits": hits}
        for lab in idx.labels.values():
            if q_low in lab.name.lower():
                hits.append({"kind": "label", "path": lab.file, "preview": lab.name})
            if len(hits) >= limit:
                break
        for path in session.script_paths():
            text = session.decompiled.get(path)
            if not text:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if q_low in line.lower():
                    hits.append({"kind": "script", "path": path, "line": i, "preview": line.strip()[:240]})
                    if len(hits) >= limit:
                        return {"hits": hits}
        return {"hits": hits}

    @app.post("/api/overlay")
    def api_overlay(body: OverlayBody):
        import base64

        session = _require()
        if body.text is not None:
            data = body.text.encode("utf-8")
        elif body.content_b64 is not None:
            data = base64.b64decode(body.content_b64)
        else:
            raise HTTPException(400, "provide text or content_b64")
        session.put_overlay(body.path, data)
        return {"ok": True, "path": body.path}

    @app.post("/api/export/rpa")
    def api_export(body: ExportBody):
        session = _require()
        dest = Path(body.dest)
        if dest.is_dir():
            dest = dest / body.filename
        path = export_patch_rpa(session.overlay, dest)
        return {"ok": True, "path": str(path)}

    @app.post("/api/dialog/folder")
    def api_folder_dialog():
        try:
            import tkinter as tk
            from tkinter import filedialog
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(500, f"folder dialog unavailable: {exc}") from exc
        root = tk.Tk()
        root.withdraw()
        try:
            root.wm_attributes("-topmost", 1)
        except Exception:  # noqa: BLE001
            pass
        chosen = filedialog.askdirectory(title="Open Ren'Py game")
        root.destroy()
        if not chosen:
            return {"path": None}
        return {"path": chosen}

    static = WEB_DIST if (WEB_DIST / "index.html").is_file() else STATIC_DIR
    if static.is_dir() and (static / "index.html").is_file():
        app.mount("/", StaticFiles(directory=str(static), html=True), name="ui")

        @app.get("/")
        def index():
            return FileResponse(static / "index.html")

    return app


app = create_app()


def _require():
    if not has_session():
        raise HTTPException(409, "no game open")
    return current()


def _game_info(session):
    layout = session.vfs.layout
    archives = []
    for arch in session.vfs.archives:
        archives.append(
            {
                "name": arch.path.name,
                "path": str(arch.path),
                "version": arch.version.value,
                "key": f"{arch.key:08x}" if arch.key is not None else None,
                "file_count": len(arch.entries),
                "size": arch.size,
            }
        )
    return {
        "name": session.name,
        "opened_path": session.opened_path,
        "basedir": str(layout.basedir),
        "gamedir": str(layout.gamedir),
        "engine_family": layout.engine_family,
        "engine_vc": layout.engine_vc,
        "python_major": layout.python_major,
        "launcher": layout.launcher,
        "languages": session.vfs.languages(),
        "archives": archives,
        "counts": session.vfs.counts(),
        "overlay": str(session.overlay),
        "is_lone_archive": layout.is_lone_archive,
    }


def _node(n):
    src = n.source.__dict__ if n.source else None
    return {
        "path": n.path,
        "name": n.name,
        "is_dir": n.is_dir,
        "size": n.size,
        "kind": n.kind,
        "sniffed": n.sniffed,
        "source": src,
    }


# silence unused import in type checkers
mimetypes.guess_type("")
