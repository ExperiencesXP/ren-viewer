"""Write RPA-3.0 archives."""

from __future__ import annotations

import zlib
from pathlib import Path

from ren_viewer.pickleutil import dumps

DEFAULT_KEY = 0xDEADBEEF


def write_rpa(
    dest: str | Path,
    files: dict[str, bytes],
    *,
    key: int = DEFAULT_KEY,
    padding: int = 0,
) -> Path:
    """Write an RPA-3.0 archive. `files` maps logical paths to raw bytes."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    index: dict[str, list[tuple[int, int, bytes]]] = {}
    placeholder = b"RPA-3.0 " + (b"0" * 16) + b" " + (b"0" * 8) + b"\n"

    with dest.open("wb") as fh:
        fh.write(placeholder)
        for logical, data in sorted(files.items(), key=lambda kv: kv[0].replace("\\", "/")):
            path = logical.replace("\\", "/").lstrip("/")
            if padding:
                fh.write(b"\x00" * (padding % 16))
            offset = fh.tell()
            fh.write(data)
            length = len(data)
            index[path] = [(offset ^ key, length ^ key)]
        index_offset = fh.tell()
        fh.write(zlib.compress(dumps(index, protocol=2), 9))
        fh.seek(0)
        header = f"RPA-3.0 {index_offset:016x} {key:08x}\n".encode("ascii")
        if len(header) > len(placeholder):
            raise ValueError("RPA header overflow")
        fh.write(header)
    return dest
