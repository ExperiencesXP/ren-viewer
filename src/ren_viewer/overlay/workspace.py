"""Copy-on-write overlay so original game files stay untouched."""

from __future__ import annotations

import hashlib
from pathlib import Path

from ren_viewer.rpa.writer import write_rpa

APP_DIR_NAME = "ren-viewer"


def app_data_dir() -> Path:
    home = Path.home()
    for candidate in (
        Path.home() / "AppData" / "Local" / APP_DIR_NAME,
        home / ".local" / "share" / APP_DIR_NAME,
        home / f".{APP_DIR_NAME}",
    ):
        if candidate.parent.exists():
            candidate.mkdir(parents=True, exist_ok=True)
            return candidate
    fallback = home / f".{APP_DIR_NAME}"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def game_id(basedir: Path) -> str:
    digest = hashlib.sha1(str(basedir.resolve()).encode("utf-8")).hexdigest()[:12]
    return f"{basedir.name}-{digest}"


def overlay_dir_for(basedir: Path) -> Path:
    path = app_data_dir() / "workspaces" / game_id(basedir) / "overlay"
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_overlay(overlay: Path, logical: str, data: bytes) -> Path:
    dest = overlay / Path(logical.replace("\\", "/"))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def export_patch_rpa(overlay: Path, dest: Path, key: int = 0xDEADBEEF) -> Path:
    files: dict[str, bytes] = {}
    if overlay.is_dir():
        for disk in overlay.rglob("*"):
            if disk.is_file():
                files[disk.relative_to(overlay).as_posix()] = disk.read_bytes()
    return write_rpa(dest, files, key=key)
