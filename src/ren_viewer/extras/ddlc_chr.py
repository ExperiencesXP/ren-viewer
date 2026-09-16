"""Optional DDLC .chr extras. Not part of the engine VFS."""

from __future__ import annotations

import base64
from dataclasses import dataclass
from pathlib import Path

from ren_viewer.media.sniff import sniff


@dataclass
class ChrExtra:
    name: str
    path: str
    sniffed: str
    mime: str
    note: str
    decoded_text: str | None = None


def scan_chr(basedir: Path) -> list[ChrExtra]:
    folder = basedir / "characters"
    if not folder.is_dir():
        return []
    extras: list[ChrExtra] = []
    for path in sorted(folder.glob("*.chr")):
        data = path.read_bytes()
        info = sniff(data, path.name)
        note = "character file"
        decoded = None
        if info.label == "PNG":
            note = "PNG image disguised as .chr"
        elif info.label == "JPEG":
            note = "JPEG image disguised as .chr"
        elif info.label == "OGG":
            note = "OGG audio disguised as .chr (spectrogram easter egg in some titles)"
        elif info.kind == "text":
            note = "text payload"
            try:
                decoded = base64.b64decode(data, validate=False).decode("utf-8", errors="replace")
                if decoded and decoded.isprintable() or "\n" in decoded:
                    note = "base64-encoded text"
            except Exception:  # noqa: BLE001
                decoded = data.decode("utf-8", errors="replace")
        extras.append(
            ChrExtra(
                name=path.name,
                path=str(path),
                sniffed=info.label,
                mime=info.mime,
                note=note,
                decoded_text=decoded,
            )
        )
    return extras
