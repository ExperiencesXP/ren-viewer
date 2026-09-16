"""CLI: `ren-viewer [game-path]`."""

from __future__ import annotations

import argparse
import os
import threading
import time
import webbrowser

import uvicorn

from ren_viewer import __version__
from ren_viewer.session import open_session


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ren-viewer", description="Local Ren'Py resource studio")
    parser.add_argument("path", nargs="?", help="Game folder or .rpa file")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8741)
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser")
    parser.add_argument("--version", action="version", version=f"ren-viewer {__version__}")
    args = parser.parse_args(argv)

    if args.path:
        try:
            open_session(args.path)
        except Exception as exc:  # noqa: BLE001
            print(f"warning: could not open {args.path}: {exc}")

    url = f"http://{args.host}:{args.port}/"
    if not args.no_open:
        threading.Thread(target=_open_browser, args=(url,), daemon=True).start()

    print(f"Ren-Viewer {__version__}  {url}")
    uvicorn.run("ren_viewer.app:app", host=args.host, port=args.port, log_level="info")
    return 0


def _open_browser(url: str) -> None:
    time.sleep(0.6)
    if os.environ.get("REN_VIEWER_NO_BROWSER"):
        return
    webbrowser.open(url)


if __name__ == "__main__":
    raise SystemExit(main())
