import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path("docs/screenshots")
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory="dist"))
threading.Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"http://127.0.0.1:{server.server_port}/?dev=1")
    page.wait_for_function("window.pixelhub?.renderer.scene.game")
    page.screenshot(path=out / "magazyn-lv1.png")
    page.locator(".cmr-card").first.click()
    page.wait_for_function("window.pixelhub.game.cmrs[0].state === 'docked'")
    page.screenshot(path=out / "cmr-i-rampa.png")
    tools = page.locator("details").filter(has=page.locator("#dev-panel"))
    tools.locator("summary").first.click()
    page.locator("#dev-round").select_option("25")
    page.locator("#dev-jump").click()
    page.wait_for_function("window.pixelhub.game.round === 25 && window.pixelhub.game.stock.length === 49")
    tools.locator("summary").first.click()
    page.screenshot(path=out / "magazyn-r25.png")
    assert not errors, errors
