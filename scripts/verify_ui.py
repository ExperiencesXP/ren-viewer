"""Browser smoke: open a Ren'Py game and walk the main surfaces.

Point this at *your* game — there is no bundled title.

    set REN_VIEWER_GAME=path\to\your\renpy\game
    python scripts/verify_ui.py

The Vite UI should already be running (default http://127.0.0.1:5173).
Override with REN_VIEWER_URL if needed.
"""

from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright

GAME = os.environ.get("REN_VIEWER_GAME", "").strip()
URL = os.environ.get("REN_VIEWER_URL", "http://127.0.0.1:5173")
SHOTS = Path(__file__).resolve().parents[1] / "web" / "dist" / "_verify"


def main() -> None:
    if not GAME:
        raise SystemExit(
            "Set REN_VIEWER_GAME to a Ren'Py game folder (the directory that contains game/) "
            "or a .rpa path before running this smoke."
        )
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_selector("#game-path")
        page.fill("#game-path", GAME)
        page.get_by_role("button", name="Open").click()
        page.wait_for_selector(".shell", timeout=30000)
        page.screenshot(path=str(SHOTS / "01-overview.png"))
        assert page.locator(".topbar-title h2").inner_text().strip()

        for i, label in enumerate(["Files", "Scripts", "Story", "Characters", "Gallery", "Audio"], start=2):
            page.locator("nav.nav").get_by_role("button", name=label).click()
            page.wait_for_timeout(800)
            if label == "Files":
                page.wait_for_selector(".tree", timeout=15000)
                png = page.locator(".tree-row", has_text=".png").first
                if png.count():
                    png.click()
                    page.wait_for_timeout(800)
            if label == "Scripts":
                page.wait_for_timeout(1500)
            if label == "Story":
                page.wait_for_timeout(2500)
            if label in {"Characters", "Gallery"}:
                page.wait_for_timeout(2500)
            page.screenshot(path=str(SHOTS / f"{i:02d}-{label.lower()}.png"))

        body = page.content()
        assert "Ren-Viewer" in body
        browser.close()
        print("ok", SHOTS)


if __name__ == "__main__":
    main()
