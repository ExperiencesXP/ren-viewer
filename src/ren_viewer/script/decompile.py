"""Decompile .rpyc / .rpymc to text. Uses unrpyc when available."""

from __future__ import annotations

import importlib
import tempfile
import traceback
import zlib
from pathlib import Path


class DecompileError(Exception):
    def __init__(self, message: str, dump: str | None = None):
        super().__init__(message)
        self.dump = dump


def is_compiled(name: str) -> bool:
    lower = name.lower()
    return lower.endswith(".rpyc") or lower.endswith(".rpymc")


def decompile(
    data: bytes,
    name: str = "script.rpyc",
    *,
    try_harder: bool = False,
    init_offset: bool = True,
) -> str:
    if not is_compiled(name):
        return _decode_text(data)

    errors: list[str] = []
    for fn in (_via_unrpyc, _via_rpycdec):
        try:
            text = fn(data, name, try_harder=try_harder, init_offset=init_offset)
            if text and text.strip() and not text.lstrip().startswith("# could not"):
                return text
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{fn.__name__}: {exc}")
    dump = _raw_dump(data)
    raise DecompileError("; ".join(errors) or "no decompiler available", dump=dump)


def _via_unrpyc(data: bytes, name: str, *, try_harder: bool = False, init_offset: bool = True) -> str:
    unrpyc = importlib.import_module("unrpyc")
    lower = name.lower()
    suffix = ".rpymc" if lower.endswith(".rpymc") else ".rpyc"
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"in{suffix}"
        src.write_bytes(data)
        ctx = unrpyc.Context()
        unrpyc.decompile_rpyc(
            src,
            ctx,
            overwrite=True,
            try_harder=try_harder,
            init_offset=init_offset,
        )
        out = src.with_suffix(".rpym" if suffix == ".rpymc" else ".rpy")
        if not out.is_file():
            raise FileNotFoundError("unrpyc produced no output")
        return out.read_text(encoding="utf-8", errors="replace")


def _via_rpycdec(data: bytes, name: str, *, try_harder: bool = False, init_offset: bool = True) -> str:
    rpycdec = importlib.import_module("rpycdec")
    decode = getattr(rpycdec, "decompile", None) or getattr(rpycdec, "decode", None)
    if decode is None:
        raise AttributeError("rpycdec has no decompile")
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / Path(name).name
        src.write_bytes(data)
        result = decode(str(src))
        if isinstance(result, str):
            return result
        out = src.with_suffix(".rpy")
        if out.is_file():
            return out.read_text(encoding="utf-8", errors="replace")
        raise FileNotFoundError("rpycdec produced no output")


def _raw_dump(data: bytes) -> str:
    try:
        payload = data
        if payload.startswith(b"RENPY RPC2"):
            payload = payload[10:]
            chunks: list[bytes] = []
            while len(payload) >= 4:
                n = int.from_bytes(payload[:4], "little")
                payload = payload[4:]
                chunks.append(payload[:n])
                payload = payload[n:]
            payload = b"".join(chunks)
        inflated = zlib.decompress(payload)
        return f"# zlib payload {len(inflated)} bytes; install unrpyc to decompile\n"
    except Exception:  # noqa: BLE001
        return f"# could not inflate {len(data)} byte rpyc\n{traceback.format_exc()}"


def _decode_text(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")
