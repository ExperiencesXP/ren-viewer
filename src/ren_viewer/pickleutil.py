"""Restricted unpickling for RPA indexes and save files."""

from __future__ import annotations

import codecs
import collections
import copyreg
import io
import pickle


_ALLOWED = {
    ("builtins", "set"): set,
    ("builtins", "frozenset"): frozenset,
    ("builtins", "bytes"): bytes,
    ("builtins", "bytearray"): bytearray,
    ("builtins", "str"): str,
    ("builtins", "list"): list,
    ("builtins", "tuple"): tuple,
    ("builtins", "dict"): dict,
    ("builtins", "int"): int,
    ("builtins", "object"): object,
    ("__builtin__", "set"): set,
    ("__builtin__", "frozenset"): frozenset,
    ("__builtin__", "bytes"): bytes,
    ("__builtin__", "bytearray"): bytearray,
    ("__builtin__", "str"): bytes,
    ("__builtin__", "unicode"): str,
    ("__builtin__", "list"): list,
    ("__builtin__", "tuple"): tuple,
    ("__builtin__", "dict"): dict,
    ("__builtin__", "int"): int,
    ("__builtin__", "long"): int,
    ("__builtin__", "object"): object,
    ("collections", "OrderedDict"): collections.OrderedDict,
    ("copy_reg", "_reconstructor"): copyreg._reconstructor,
    ("copyreg", "_reconstructor"): copyreg._reconstructor,
    ("codecs", "encode"): codecs.encode,
    ("_codecs", "encode"): codecs.encode,
}


class RestrictedUnpickler(pickle.Unpickler):
    def find_class(self, module: str, name: str):
        key = (module, name)
        if key in _ALLOWED and _ALLOWED[key] is not None:
            return _ALLOWED[key]
        raise pickle.UnpicklingError(f"refusing to unpickle {module}.{name}")


def loads(data: bytes):
    unpickler = RestrictedUnpickler(io.BytesIO(data), encoding="latin-1")
    return unpickler.load()


def dumps(obj: object, protocol: int = 2) -> bytes:
    return pickle.dumps(obj, protocol=protocol)


def as_text(value: object) -> str:
    if isinstance(value, bytes):
        for enc in ("utf-8", "latin-1"):
            try:
                return value.decode(enc)
            except UnicodeDecodeError:
                continue
        return value.decode("latin-1", errors="replace")
    return str(value)
