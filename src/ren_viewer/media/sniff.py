"""Magic-byte media sniffing. Extensions in Ren'Py games often lie."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Sniff:
    kind: str
    mime: str
    label: str


def sniff(data: bytes, name: str = "") -> Sniff:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return Sniff("image", "image/png", "PNG")
    if data[:3] == b"\xff\xd8\xff":
        return Sniff("image", "image/jpeg", "JPEG")
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return Sniff("image", "image/webp", "WEBP")
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return Sniff("image", "image/gif", "GIF")
    if data[:4] == b"\x00\x00\x00\x0c" and data[4:8] == b"jP  ":
        return Sniff("image", "image/jp2", "JPEG2000")
    if len(data) > 12 and data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"avif", b"avis", b"mif1"):
            return Sniff("image", "image/avif", "AVIF")
        return Sniff("video", "video/mp4", "MP4")
    if data[:4] == b"OggS":
        if b"vorbis" in data[:4096] or b"OpusHead" in data[:4096] or b"\x01vorbis" in data[:80]:
            if b"video" in data[:4096] or b"theora" in data[:4096]:
                return Sniff("video", "video/ogg", "OGV")
            return Sniff("audio", "audio/ogg", "OGG")
        return Sniff("audio", "audio/ogg", "OGG")
    if data[:4] == b"fLaC":
        return Sniff("audio", "audio/flac", "FLAC")
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xfa", b"\xff\xf3", b"\xff\xf2"):
        return Sniff("audio", "audio/mpeg", "MP3")
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return Sniff("audio", "audio/wav", "WAV")
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return Sniff("video", "video/webm", "WEBM")
    if data[:4] == b"\x00\x01\x00\x00" or data[:4] == b"true" or data[:4] == b"OTTO":
        return Sniff("font", "font/otf", "FONT")
    if data[:5] == b"%PDF-":
        return Sniff("document", "application/pdf", "PDF")
    if data[:2] in (b"PK",) and ext in {"zip", "rpa"}:
        return Sniff("archive", "application/zip", "ZIP")
    if _looks_text(data):
        if ext in {"rpy", "rpym"} or name.endswith("_ren.py"):
            return Sniff("script", "text/plain", "RPY")
        if ext in {"json"}:
            return Sniff("text", "application/json", "JSON")
        if ext in {"txt", "md", "log", "xml", "html", "css", "py"}:
            return Sniff("text", "text/plain", "TEXT")
        return Sniff("text", "text/plain", "TEXT")
    if ext in {"rpyc", "rpymc"}:
        return Sniff("script", "application/octet-stream", "RPYC")
    if ext in {"rpyb"}:
        return Sniff("cache", "application/octet-stream", "RPYB")
    if ext in {"rpa", "rpi"}:
        return Sniff("archive", "application/octet-stream", "RPA")
    return Sniff("binary", "application/octet-stream", ext.upper() or "BIN")


def kind_from_name(name: str) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in {"png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "tga"}:
        return "image"
    if ext in {"ogg", "opus", "mp3", "wav", "flac"}:
        return "audio"
    if ext in {"webm", "ogv", "mp4", "mkv", "avi"}:
        return "video"
    if ext in {"ttf", "otf", "woff", "woff2"}:
        return "font"
    if ext in {"rpy", "rpym", "rpyc", "rpymc"} or name.endswith("_ren.py"):
        return "script"
    if ext in {"txt", "json", "xml", "md", "log", "html"}:
        return "text"
    if ext in {"rpa", "rpi"}:
        return "archive"
    return "binary"


def _looks_text(data: bytes) -> bool:
    sample = data[:1024]
    if not sample:
        return True
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
        return True
    except UnicodeDecodeError:
        pass
    textish = sum(32 <= b < 127 or b in (9, 10, 13) for b in sample)
    return textish / len(sample) > 0.85
