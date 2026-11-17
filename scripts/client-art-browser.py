import functools
import gzip
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

out = Path("docs/screenshots/clients")
out.mkdir(parents=True, exist_ok=True)
# Serve the build under a project path, matching GitHub Pages.
class ProjectHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        project = "/PixelHub"
        if path.startswith(project + "/"):
            path = path[len(project):]
        return super().translate_path(path)

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(ProjectHandler, directory="dist"))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = os.environ.get("PIXELHUB_TEST_URL", f"http://127.0.0.1:{server.server_port}/PixelHub/") + "?dev=1"
with gzip.open("public/story-scenarios.json.gz", "rt", encoding="utf8") as stream:
    checkpoint = json.load(stream)["scenarios"]["3"]
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel=os.environ.get("PIXELHUB_BROWSER") or None)
    def new_page(width, height, *, seeded=False):
        page = browser.new_page(viewport={"width": width, "height": height})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("response", lambda response: errors.append(f"{response.status} {response.url}") if response.status >= 400 else None)
        if seeded:
            page.add_init_script(f"localStorage.setItem('pixelhub-0.3-balance-campaign-story-developer', {json.dumps(checkpoint)});")
        page.goto(url)
        page.wait_for_function("window.pixelhub?.renderer.scene.game")
        return page

    gallery = new_page(1920, 1080)
    tools = gallery.locator("details").filter(has=gallery.locator("#dev-panel"))
    tools.locator("summary").first.click()
    gallery.locator(".client-art-preview > summary").click()
    for scale in (1, 2):
        grid = gallery.locator(f'.client-art-grid[data-scale="{scale}"]')
        grid.wait_for(state="visible")
        images = grid.locator("img")
        assert images.count() == 24
        for image in images.all():
            image.evaluate("img => img.decode()")
            assert image.evaluate("img => img.naturalWidth") in (48, 72)
            assert image.evaluate("img => getComputedStyle(img).imageRendering") == "pixelated"
            assert image.bounding_box()["width"] == scale * image.evaluate("img => img.naturalWidth")
        grid.screenshot(path=out / f"szesc-postaci-x{scale}.png")
    gallery.close()

    for width, height in [(1920, 1080), (1366, 768), (390, 844)]:
        page = new_page(width, height, seeded=True)
        page.evaluate("document.querySelector('#dev-finish').click()")
        page.wait_for_function("window.pixelhub.game.status === 'summary'", timeout=90_000)
        dialog = page.locator("#STORY-pieczywo")
        toggle = dialog.locator("summary")
        before = page.evaluate("JSON.stringify([window.pixelhub.game.cash, window.pixelhub.game.time, window.pixelhub.game.crates, window.pixelhub.game.cmrs])")
        toggle.focus()
        page.keyboard.press("Enter")
        image = dialog.locator(".client-portrait")
        image.evaluate("img => img.decode()")
        assert image.get_attribute("src").endswith("henryk_portrait_worried.png")
        assert image.bounding_box()["width"] == (72 if width < 700 else 144)
        assert dialog.locator(".client-dialog-body").evaluate("el => getComputedStyle(el).borderImageSlice") == "8 fill"
        assert dialog.get_by_role("button", name="Przyjmij").evaluate("el => getComputedStyle(el).borderImageSlice") == "6 fill"
        assert dialog.locator("h3").inner_text() == "Henryk · Piekarnia pod Młynem"
        assert dialog.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
        if width == 1366:
            dialog.screenshot(path=out / "henryk-dialog.png")
        if width == 390:
            dialog.screenshot(path=out / "henryk-dialog-mobile.png")
        page.keyboard.press("Escape")
        assert dialog.get_attribute("open") is None
        assert toggle.evaluate("el => document.activeElement === el")
        after = page.evaluate("JSON.stringify([window.pixelhub.game.cash, window.pixelhub.game.time, window.pixelhub.game.crates, window.pixelhub.game.cmrs])")
        assert before == after
        toggle.press("Enter")
        accept = width == 1366
        dialog.get_by_role("button", name="Przyjmij" if accept else "Odmów").click()
        assert page.evaluate("window.pixelhub.game.contracts['STORY-pieczywo']") == ("accepted" if accept else "rejected")
        if accept:
            assert image.get_attribute("src").endswith("henryk_portrait_happy.png")
            page.locator("#development").click()
            page.locator("#continue").click()
            assert page.evaluate("window.pixelhub.game.cmrs.some(cmr => cmr.id === 'STORY-pieczywo')")
        page.close()
    assert not errors, errors
    print("PASS: 24 graphics, two scales, three viewports, keyboard and real Henryk decisions")
