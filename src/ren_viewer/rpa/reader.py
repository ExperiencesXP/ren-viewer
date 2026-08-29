"""Ren'Py archive reader (RPA-1 / 2.0 / 3.0 / 3.2)."""

from __future__ import annotations

import zlib
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

from ren_viewer.pickleutil import as_text, loads


class RpaVersion(str, Enum):
    RPA1 = "1.0"
    RPA2 = "2.0"
    RPA3 = "3.0"
    RPA32 = "3.2"


@dataclass(frozen=True)
class RpaEntry:
    path: str
    offset: int
    length: int
    prefix: bytes = b""


@dataclass
class RpaArchive:
    path: Path
    version: RpaVersion
    key: int | None
    index_offset: int
    entries: dict[str, list[RpaEntry]] = field(default_factory=dict)
    size: int = 0

    def list_paths(self) -> list[str]:
        return sorted(self.entries)

    def read(self, logical_path: str) -> bytes:
        segs = self.entries.get(_norm(logical_path))
        if segs is None:
            raise FileNotFoundError(logical_path)
        chunks: list[bytes] = []
        with self.path.open("rb") as fh:
            for seg in segs:
                chunks.append(seg.prefix)
                if seg.length:
                    fh.seek(seg.offset)
                    data = fh.read(seg.length)
                    if len(data) != seg.length:
                        raise OSError(f"short read for {logical_path}")
                    chunks.append(data)
        return b"".join(chunks)

    def stat(self, logical_path: str) -> tuple[int, list[RpaEntry]]:
        segs = self.entries.get(_norm(logical_path))
        if segs is None:
            raise FileNotFoundError(logical_path)
        total = sum(len(s.prefix) + s.length for s in segs)
        return total, segs


def open_archive(path: str | Path) -> RpaArchive:
    path = Path(path)
    size = path.stat().st_size
    with path.open("rb") as fh:
        header = fh.readline()
        if header.startswith(b"RPA-3.2 "):
            version = RpaVersion.RPA32
            index_offset, key = _parse_v3_header(header)
            raw = _read_index(fh, index_offset)
            entries = _decode_index(raw, key)
        elif header.startswith(b"RPA-3.0 "):
            version = RpaVersion.RPA3
            index_offset, key = _parse_v3_header(header)
            raw = _read_index(fh, index_offset)
            entries = _decode_index(raw, key)
        elif header.startswith(b"RPA-2.0 "):
            version = RpaVersion.RPA2
            index_offset = int(header.split()[1], 16)
            key = None
            raw = _read_index(fh, index_offset)
            entries = _decode_index(raw, 0)
        elif path.suffix.lower() == ".rpi" or header[:2] == b"\x78\x9c":
            version = RpaVersion.RPA1
            index_offset = 0
            key = None
            fh.seek(0)
            raw = zlib.decompress(fh.read())
            entries = _decode_index(raw, 0)
            data_path = path.with_suffix(".rpa")
            if data_path.exists():
                path = data_path
                size = path.stat().st_size
        else:
            raise ValueError(f"{path.name} is not a Ren'Py archive")

    return RpaArchive(
        path=path,
        version=version,
        key=key,
        index_offset=index_offset,
        entries=entries,
        size=size,
    )


def _parse_v3_header(header: bytes) -> tuple[int, int]:
    parts = header.decode("ascii", errors="replace").split()
    if len(parts) < 3:
        raise ValueError(f"malformed RPA header: {header!r}")
    return int(parts[1], 16), int(parts[2], 16)


def _read_index(fh, index_offset: int) -> bytes:
    fh.seek(index_offset)
    blob = fh.read()
    try:
        return zlib.decompress(blob)
    except zlib.error as exc:
        raise ValueError("archive index is not zlib-compressed pickle") from exc


def _decode_index(raw: bytes, key: int) -> dict[str, list[RpaEntry]]:
    obj = loads(raw)
    if not isinstance(obj, dict):
        raise ValueError("archive index is not a dict")
    out: dict[str, list[RpaEntry]] = {}
    for name, segs in obj.items():
        path = _norm(as_text(name))
        decoded: list[RpaEntry] = []
        if not isinstance(segs, (list, tuple)):
            continue
        for seg in segs:
            offset, length, prefix = _seg(seg, key)
            decoded.append(RpaEntry(path=path, offset=offset, length=length, prefix=prefix))
        if decoded:
            out[path] = decoded
    return out


def _seg(seg: object, key: int) -> tuple[int, int, bytes]:
    if not isinstance(seg, (list, tuple)) or len(seg) < 2:
        raise ValueError(f"bad index segment: {seg!r}")
    offset = int(seg[0]) ^ key
    length = int(seg[1]) ^ key
    prefix = b""
    if len(seg) > 2 and seg[2]:
        p = seg[2]
        prefix = p if isinstance(p, bytes) else bytes(p)
    return offset, length, prefix


def _norm(path: str) -> str:
    return path.replace("\\", "/").lstrip("/")
