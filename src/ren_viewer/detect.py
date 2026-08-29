"""Detect a Ren'Py game root and engine version without assuming a title."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

GAME_MARKERS = {".rpa", ".rpy", ".rpyc", ".rpym", ".rpymc"}


@dataclass
class GameLayout:
    basedir: Path
    gamedir: Path
    commondir: Path | None
    engine_family: str
    engine_vc: int | None
    python_major: int | None
    launcher: str | None
    is_lone_archive: bool = False
    lone_archive: Path | None = None
    warnings: list[str] = field(default_factory=list)


def detect(path: str | Path) -> GameLayout:
    path = Path(path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(path)

    if path.is_file() and path.suffix.lower() in {".rpa", ".rpi"}:
        gamedir = path.parent
        basedir = gamedir.parent if gamedir.name.lower() == "game" else gamedir
        return GameLayout(
            basedir=basedir,
            gamedir=gamedir,
            commondir=_common(basedir),
            engine_family=_engine_family(basedir),
            engine_vc=_vc_version(basedir),
            python_major=_python_major(basedir),
            launcher=_launcher(basedir),
            is_lone_archive=True,
            lone_archive=path,
        )

    if path.is_file() and path.suffix.lower() in {".rpyc", ".rpy", ".rpymc", ".rpym"}:
        gamedir = path.parent
        basedir = gamedir.parent if gamedir.name.lower() == "game" else gamedir
        return _layout(basedir, gamedir)

    basedir, gamedir = _dirs(path)
    return _layout(basedir, gamedir)


def _dirs(path: Path) -> tuple[Path, Path]:
    if (path / "game").is_dir() and _looks_like_gamedir(path / "game"):
        return path, path / "game"
    if path.name.lower() == "game" and _looks_like_gamedir(path):
        return path.parent, path
    if _looks_like_gamedir(path):
        return path.parent, path
    if (path / "game").is_dir():
        return path, path / "game"
    raise ValueError(
        f"{path} does not look like a Ren'Py game. "
        "Open the game folder (the one with game/) or a .rpa file."
    )


def _looks_like_gamedir(path: Path) -> bool:
    try:
        for child in path.iterdir():
            if child.suffix.lower() in GAME_MARKERS:
                return True
            if child.name.lower() in {"options.rpy", "options.rpyc", "script.rpy", "script.rpyc", "gui.rpy"}:
                return True
    except OSError:
        return False
    return False


def _layout(basedir: Path, gamedir: Path) -> GameLayout:
    return GameLayout(
        basedir=basedir,
        gamedir=gamedir,
        commondir=_common(basedir),
        engine_family=_engine_family(basedir),
        engine_vc=_vc_version(basedir),
        python_major=_python_major(basedir),
        launcher=_launcher(basedir),
    )


def _common(basedir: Path) -> Path | None:
    candidate = basedir / "renpy" / "common"
    return candidate if candidate.is_dir() else None


def _vc_version(basedir: Path) -> int | None:
    vc = basedir / "renpy" / "vc_version.py"
    if not vc.is_file():
        return None
    text = vc.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"vc_version\s*=\s*(\d+)", text)
    return int(m.group(1)) if m else None


def _engine_family(basedir: Path) -> str:
    vc = _vc_version(basedir)
    py = _python_major(basedir)
    if py == 3:
        return "8"
    if vc is not None:
        if vc >= 2300:
            return "7"
        if vc >= 600:
            return "6"
    if (basedir / "lib").is_dir():
        names = [p.name.lower() for p in (basedir / "lib").iterdir()]
        if any("py3" in n or "python3" in n for n in names):
            return "8"
    init = basedir / "renpy" / "version.py"
    if init.is_file():
        text = init.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"version_tuple\s*=\s*\((\d+),\s*(\d+)", text)
        if m:
            return m.group(1)
    return "unknown"


def _python_major(basedir: Path) -> int | None:
    lib = basedir / "lib"
    if not lib.is_dir():
        return None
    names = [p.name.lower() for p in lib.iterdir()]
    if any("python3" in n or n.startswith("py3") for n in names):
        return 3
    if any("python2" in n or "pythonlib2" in n or "windows-i686" in n for n in names):
        return 2
    return None


def _launcher(basedir: Path) -> str | None:
    for pattern in ("*.exe", "*.py", "*.sh", "*.app"):
        for p in basedir.glob(pattern):
            if p.name.lower().startswith("python"):
                continue
            if p.suffix.lower() == ".py" and p.name.lower() in {"renpy.py"}:
                return p.name
            if p.suffix.lower() in {".exe", ".sh"} or p.name.endswith(".app"):
                return p.name
    if (basedir / "renpy.py").is_file():
        return "renpy.py"
    return None
