"""Unified virtual filesystem matching Ren'Py load order."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Literal

from ren_viewer.detect import GameLayout, detect
from ren_viewer.media.sniff import kind_from_name, sniff
from ren_viewer.rpa.reader import RpaArchive, open_archive

Layer = Literal["overlay", "tl", "loose", "archive", "common", "basedir"]


@dataclass(frozen=True)
class FileSource:
    layer: Layer
    path: str
    archive: str | None = None
    archive_path: str | None = None
    offset: int | None = None
    length: int = 0
    disk_path: str | None = None


@dataclass
class VfsNode:
    path: str
    name: str
    is_dir: bool
    size: int = 0
    kind: str = "dir"
    sniffed: str | None = None
    source: FileSource | None = None
    children: list[str] = field(default_factory=list)


@dataclass
class GameVFS:
    layout: GameLayout
    archives: list[RpaArchive]
    overlay_dir: Path | None = None
    language: str | None = None
    lone_only: Path | None = None
    _index: dict[str, FileSource] = field(default_factory=dict)
    _basedir_files: dict[str, FileSource] = field(default_factory=dict)

    @property
    def basedir(self) -> Path:
        return self.layout.basedir

    @property
    def gamedir(self) -> Path:
        return self.layout.gamedir

    def rebuild(self) -> None:
        self._index = {}
        self._basedir_files = {}
        if self.lone_only:
            self._index_lone()
        else:
            self._index_common()
            self._index_archives()
            self._index_loose(self.gamedir, layer="loose")
            if (self.gamedir / "libs" / "libs.txt").is_file():
                self._index_loose(self.gamedir / "libs", layer="loose")
            if (self.gamedir / "mods" / "mods.txt").is_file():
                self._index_loose(self.gamedir / "mods", layer="loose")
            if self.language:
                tl = self.gamedir / "tl" / self.language
                if tl.is_dir():
                    self._index_loose(tl, layer="tl")
            if self.overlay_dir and self.overlay_dir.is_dir():
                self._index_loose(self.overlay_dir, layer="overlay")
            self._index_basedir_extras()

    def list_paths(self, *, include_basedir: bool = True) -> list[str]:
        paths = set(self._index)
        if include_basedir:
            paths.update(self._basedir_files)
        return sorted(paths)

    def languages(self) -> list[str]:
        tl = self.gamedir / "tl"
        if not tl.is_dir():
            return []
        return sorted(p.name for p in tl.iterdir() if p.is_dir() and p.name != "None")

    def source(self, logical: str) -> FileSource | None:
        logical = _norm(logical)
        if logical.startswith("basedir/"):
            return self._basedir_files.get(logical)
        return self._index.get(logical)

    def exists(self, logical: str) -> bool:
        return self.source(logical) is not None

    def read(self, logical: str) -> bytes:
        src = self.source(logical)
        if src is None:
            raise FileNotFoundError(logical)
        if src.layer == "archive":
            arch = self._archive_by_name(src.archive or "")
            if arch is None:
                raise FileNotFoundError(logical)
            return arch.read(src.path)
        if src.disk_path:
            return Path(src.disk_path).read_bytes()
        raise FileNotFoundError(logical)

    def stat_size(self, logical: str) -> int:
        src = self.source(logical)
        if src is None:
            raise FileNotFoundError(logical)
        return src.length

    def iter_files(self) -> Iterator[tuple[str, FileSource]]:
        yield from sorted(self._index.items())

    def tree(self, prefix: str = "") -> list[VfsNode]:
        prefix = _norm(prefix).rstrip("/")
        dirs: dict[str, VfsNode] = {}
        files: list[VfsNode] = []

        def consider(logical: str, src: FileSource, skip_prefix: str = "") -> None:
            rel = logical
            if skip_prefix and rel.startswith(skip_prefix):
                rel = rel[len(skip_prefix) :].lstrip("/")
            if prefix:
                if rel == prefix:
                    files.append(self._file_node(logical, src, name=rel.split("/")[-1]))
                    return
                if not rel.startswith(prefix + "/"):
                    return
                rest = rel[len(prefix) + 1 :]
            else:
                rest = rel
            if "/" in rest:
                top = rest.split("/", 1)[0]
                dpath = f"{prefix}/{top}" if prefix else top
                node = dirs.get(dpath)
                if node is None:
                    dirs[dpath] = VfsNode(path=dpath, name=top, is_dir=True, kind="dir")
            else:
                files.append(self._file_node(logical, src, name=rest))

        for logical, src in self._index.items():
            consider(logical, src)
        if not prefix or prefix == "basedir" or prefix.startswith("basedir/"):
            for logical, src in self._basedir_files.items():
                consider(logical, src)

        nodes = list(dirs.values()) + files
        nodes.sort(key=lambda n: (not n.is_dir, n.name.lower()))
        return nodes

    def counts(self) -> dict[str, int]:
        counts = {"files": 0, "images": 0, "audio": 0, "video": 0, "scripts": 0, "fonts": 0, "other": 0}
        bucket = {
            "image": "images",
            "audio": "audio",
            "video": "video",
            "script": "scripts",
            "font": "fonts",
        }
        for path in self._index:
            counts["files"] += 1
            key = bucket.get(kind_from_name(path), "other")
            counts[key] += 1
        return counts

    def _file_node(self, logical: str, src: FileSource, name: str) -> VfsNode:
        return VfsNode(
            path=logical,
            name=name,
            is_dir=False,
            size=src.length,
            kind=kind_from_name(logical),
            source=src,
        )

    def _index_lone(self) -> None:
        assert self.lone_only is not None
        arch = open_archive(self.lone_only)
        self.archives = [arch]
        for p, segs in arch.entries.items():
            length = sum(len(s.prefix) + s.length for s in segs)
            self._put(
                p,
                FileSource(
                    layer="archive",
                    path=p,
                    archive=arch.path.name,
                    archive_path=str(arch.path),
                    offset=segs[0].offset if segs else None,
                    length=length,
                ),
            )

    def _index_archives(self) -> None:
        rpas = sorted(self.gamedir.glob("*.rpa"), key=lambda p: p.name, reverse=True)
        if self.layout.is_lone_archive and self.layout.lone_archive:
            rpas = [self.layout.lone_archive]
        self.archives = []
        for rpa_path in rpas:
            try:
                arch = open_archive(rpa_path)
            except Exception:
                continue
            self.archives.append(arch)
            for p, segs in arch.entries.items():
                length = sum(len(s.prefix) + s.length for s in segs)
                self._put(
                    p,
                    FileSource(
                        layer="archive",
                        path=p,
                        archive=arch.path.name,
                        archive_path=str(arch.path),
                        offset=segs[0].offset if segs else None,
                        length=length,
                    ),
                    overwrite=False,
                )

    def _index_loose(self, root: Path, layer: Layer) -> None:
        if not root.is_dir():
            return
        for disk in root.rglob("*"):
            if not disk.is_file():
                continue
            if disk.suffix.lower() in {".rpa", ".rpi", ".rpyb"}:
                continue
            rel = disk.relative_to(root).as_posix()
            self._put(
                rel,
                FileSource(
                    layer=layer,
                    path=rel,
                    disk_path=str(disk),
                    length=disk.stat().st_size,
                ),
                overwrite=True,
            )

    def _index_common(self) -> None:
        common = self.layout.commondir
        if not common:
            return
        for disk in common.rglob("*"):
            if not disk.is_file():
                continue
            rel = "common/" + disk.relative_to(common).as_posix()
            self._put(
                rel,
                FileSource(
                    layer="common",
                    path=rel,
                    disk_path=str(disk),
                    length=disk.stat().st_size,
                ),
                overwrite=False,
            )

    def _index_basedir_extras(self) -> None:
        skip = {"game", "renpy", "lib", "lib64", "tmp", "cache", "update", "saves"}
        basedir = self.basedir
        if not basedir.is_dir():
            return
        for child in basedir.iterdir():
            if child.name.lower() in skip or child.name.startswith("."):
                continue
            if child.suffix.lower() in {".exe", ".dll", ".sh", ".app"}:
                continue
            if child.is_file():
                logical = f"basedir/{child.name}"
                self._basedir_files[logical] = FileSource(
                    layer="basedir",
                    path=logical,
                    disk_path=str(child),
                    length=child.stat().st_size,
                )
            elif child.is_dir():
                for disk in child.rglob("*"):
                    if not disk.is_file():
                        continue
                    rel = disk.relative_to(basedir).as_posix()
                    logical = f"basedir/{rel}"
                    self._basedir_files[logical] = FileSource(
                        layer="basedir",
                        path=logical,
                        disk_path=str(disk),
                        length=disk.stat().st_size,
                    )

    def _put(self, logical: str, src: FileSource, overwrite: bool = True) -> None:
        logical = _norm(logical)
        if not overwrite and logical in self._index:
            return
        self._index[logical] = src

    def _archive_by_name(self, name: str) -> RpaArchive | None:
        for arch in self.archives:
            if arch.path.name == name:
                return arch
        return None


def open_game(path: str | Path, overlay_dir: Path | None = None, language: str | None = None) -> GameVFS:
    layout = detect(path)
    vfs = GameVFS(
        layout=layout,
        archives=[],
        overlay_dir=overlay_dir,
        language=language,
        lone_only=layout.lone_archive if layout.is_lone_archive else None,
    )
    vfs.rebuild()
    return vfs


def _norm(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")
