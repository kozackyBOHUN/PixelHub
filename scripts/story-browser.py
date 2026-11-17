import functools
import http.server
import json
from pathlib import Path
import threading
import sys
import os

from playwright.sync_api import sync_playwright

out = Path(os.environ.get("PIXELHUB_SCREENSHOTS", "docs/screenshots/story"))
out.mkdir(parents=True, exist_ok=True)
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory="dist"))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/?dev=1"
save_key = "pixelhub-0.3-balance-campaign-story-developer"

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1440, "height": 1040})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_function("window.pixelhub?.renderer.scene.game")
    assert page.evaluate("window.pixelhub.game.cash") == 0
    page.screenshot(path=out / "01-pierwsza-runda.png")
    page.locator(".cmr-card").first.click()
    page.wait_for_function("window.pixelhub.game.cmrs[0].state === 'docked'")
    assert page.evaluate("window.pixelhub.game.crates.length") == 8

    def cell(x, y):
        point = page.evaluate("([x,y]) => window.pixelhub.renderer.gridToScreen({x:x+.5,y:y+.5})", [x,y])
        bounds = page.locator("#world").bounding_box()
        page.mouse.click(bounds["x"] + point["x"], bounds["y"] + point["y"])

    def solve(round_number):
        print(f"Solving round {round_number}", flush=True)
        page.evaluate("document.querySelector('#dev-finish').click()")
        page.wait_for_function(
            "n => window.pixelhub.game.round === n && ['summary','won'].includes(window.pixelhub.game.status)",
            arg=round_number, timeout=240_000,
        )

    def advance():
        page.evaluate("() => {const g=window.pixelhub.game;for(const offer of g.offers(g.round+1).filter(o=>o.type!=='story'))g.decideContract(offer.id,true)}")
        page.locator("#development").click()
        upcoming = page.evaluate("window.pixelhub.game.developmentRound")
        if upcoming in (5, 7):
            assert page.evaluate("window.pixelhub.game.buyModule('storage')")
        if upcoming == 8:
            assert page.evaluate("window.pixelhub.game.installSorter(window.pixelhub.game.findSorterSite())")
        page.locator("#continue").click()

    def restore_checkpoint(path):
        context = browser.new_context(viewport={"width": 1440, "height": 1040})
        context.add_init_script(f"if (!sessionStorage.checkpointLoaded) {{ localStorage.setItem({json.dumps(save_key)}, {json.dumps(path.read_text(encoding='utf8'))}); sessionStorage.checkpointLoaded = '1'; }}")
        # Separate browser contexts keep checkpoint saves isolated.
        next_page = context.new_page()
        next_page.on("pageerror", lambda error: errors.append(str(error)))
        next_page.goto(url)
        next_page.wait_for_function("window.pixelhub?.renderer.scene.game")
        return next_page

    page.locator("#workers button").first.click()
    cell(-1, 1)
    cell(5, 3)
    page.wait_for_function("!!window.pixelhub.game.task")
    page.evaluate("window.pixelhub.game.advance(120)")
    assert page.evaluate("window.pixelhub.game.cash") == 5
    cell(1, 3)
    page.wait_for_function("!!window.pixelhub.game.cleaning")
    page.screenshot(path=out / "02-sprzatanie.png")
    page.evaluate("window.pixelhub.game.advance(90)")
    assert page.evaluate("!window.pixelhub.game.isClutter({x:1,y:3})")
    page.reload()
    page.wait_for_function("window.pixelhub?.renderer.scene.game")
    assert page.evaluate("!window.pixelhub.game.isClutter({x:1,y:3})")

    page = restore_checkpoint(Path("artifacts/checkpoints/round-3.json"))
    solve(3)
    page.get_by_text("Zlecenie fabularne · Henryk", exact=True).click()
    page.locator("#STORY-pieczywo .client-portrait").wait_for(state="visible")
    page.wait_for_function("document.querySelector('#STORY-pieczywo .client-portrait').naturalWidth === 72")
    assert page.locator("#STORY-pieczywo .client-portrait").bounding_box()["width"] == 144
    page.screenshot(path=out / "03-henryk.png")
    page.locator("#STORY-pieczywo").get_by_role("button", name="Przyjmij").click()
    advance()
    for number in range(4, 9):
        solve(number)
        if number < 8:
            advance()
    page.get_by_text("Zlecenie fabularne · Henryk", exact=True).click()
    page.get_by_text("Ostatnio nam pomogłeś.", exact=False).wait_for()
    page.screenshot(path=out / "04-powrot-henryka.png")

    final_checkpoint = Path("artifacts/checkpoints/round-30.json")
    if "--opening-only" not in sys.argv:
        page = restore_checkpoint(final_checkpoint)
        solve(30)
        page.get_by_text("Ostatni magazyn · koniec pierwszego sezonu", exact=True).wait_for()
        page.screenshot(path=out / "05-final-sezonu.png")
        old = page.evaluate("({ cash: window.pixelhub.game.cash, levels: window.pixelhub.game.levels })")
        page.get_by_role("button", name="Kontynuuj prowadzenie magazynu").click()
        page.wait_for_function("window.pixelhub.game.round === 31")
        assert page.evaluate("({ cash: window.pixelhub.game.cash, levels: window.pixelhub.game.levels })") == old
        page.screenshot(path=out / "06-runda-31.png")
    assert not errors, errors
    print("PASS")
