"""Browser smoke: open DDLC and walk the main Ren-Viewer surfaces."""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

DDLC = r"D:\Steam\steamapps\common\Doki Doki Literature Club"
SHOTS = Path(__file__).resolve().parents[1] / "web" / "dist" / "_verify"
URL = "http://127.0.0.1:5173"


def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_selector("#game-path")
        page.fill("#game-path", DDLC)
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
