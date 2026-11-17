"""Desktop window matrix and one-click phase, purchase and movement acceptance."""
import json
import math
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import expect, sync_playwright
from browser_options import browser_options

base = os.environ.get("PIXELHUB_URL", "http://127.0.0.1:5173/").rstrip("/")
out = Path("artifacts/window-phases")
out.mkdir(parents=True, exist_ok=True)
sizes = [(1280, 720), (1366, 768), (1536, 864), (1920, 1080), (2560, 1440)]

with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options())
    result = []
    for zoom in [1, 1.25]:
        profile = TemporaryDirectory(prefix="pixelhub-zoom-")
        context = p.chromium.launch_persistent_context(profile.name, **browser_options())
        settings = context.pages[0]
        settings.goto("chrome://settings/appearance")
        settings.evaluate("zoom => chrome.settingsPrivate.setDefaultZoom(zoom)", zoom)
        page = context.new_page()
        page.goto(base + "/?test=1")
        page.wait_for_function("() => window.pixelhub")
        card = page.locator(".cmr-card.inbound").first
        card.click()
        expect(card).to_contain_text("zlecono podstawienie")
        card.click()
        assert page.evaluate("() => window.pixelhub.game.crates.length") == 8
        page.evaluate("() => window.pixelhub.game.advance(1.2)")
        for width, height in sizes:
            css = {"width": math.floor(width / zoom), "height": math.floor(height / zoom)}
            page.set_viewport_size({"width": width, "height": height})
            assert abs(page.evaluate("()=>devicePixelRatio")-zoom)<0.01
            page.wait_for_function("""() => {
                const r=window.pixelhub.renderer;
                return Math.abs(r.canvas.clientWidth-r.camera.width)<=2 && Math.abs(r.canvas.clientHeight-r.camera.height)<=2;
            }""")
            layout = page.evaluate("""() => {
              const bounds = id => document.querySelector(id).getBoundingClientRect().toJSON();
              const r=window.pixelhub.renderer;
              const q=r.gridToScreen({x:-.5,y:window.pixelhub.game.rampRow(0)+.5}), rect=r.canvas.getBoundingClientRect();
              return {strip:bounds('#cmrs'), canvas:bounds('#world'), controls:bounds('.controls'),
                tile:r.camera.tile, width:innerWidth,height:innerHeight,
                scroll:document.documentElement.scrollHeight,
                click:{x:rect.left+q.x*rect.width/r.canvas.width,y:rect.top+q.y*rect.height/r.canvas.height}};
            }""")
            for name in ["strip", "canvas", "controls"]:
                assert layout[name]["top"] >= 0 and layout[name]["bottom"] <= css["height"] + 1, (width,height,zoom,name,layout[name])
            assert abs(layout["width"]-css["width"])<=1 and abs(layout["height"]-css["height"])<=1, layout
            assert layout["scroll"] <= css["height"] + 1, layout
            assert layout["canvas"]["height"] >= 160 and layout["tile"] >= 18, layout
            page.mouse.click(layout["click"]["x"],layout["click"]["y"])
            expect(page.locator("#inspect")).to_contain_text("TUTORIAL-")
            result.append({"width":width,"height":height,"zoom":zoom,"tile":layout["tile"]})
        context.close()
        profile.cleanup()

    page = browser.new_page(viewport={"width": 1366, "height": 768})
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto(base+"/?test=1")
    page.wait_for_function("() => window.pixelhub")
    page.locator("#lab").evaluate("(d)=>d.open=true")
    page.select_option("#dev-round","5")
    page.click("#dev-jump")
    expect(page.locator("#round")).to_have_text("Runda 5/30")
    assert page.evaluate("() => window.pixelhub.game.buy('worker')") is False
    assert not page.locator("#upgrades").is_visible()
    page.click("#dev-finish")
    expect(page.locator("#end-title")).to_have_text("Odprawa · runda 6",timeout=120000)
    page.locator(".round-receipt > summary").click()
    expect(page.locator("#totals")).to_contain_text("Pracownicy")
    assert page.evaluate("() => window.pixelhub.game.settlement.wages") == 20
    page.screenshot(path=str(out/"summary.png"))
    page.click("#development")
    expect(page.locator("#end-title")).to_have_text("Inwestycje magazynu")
    hire=page.locator('[data-investment="workers"] button')
    cash=page.evaluate("()=>window.pixelhub.game.cash")
    hire.dblclick()
    assert page.evaluate("()=>window.pixelhub.game.pendingWorkers.length")==1
    assert page.evaluate("()=>window.pixelhub.game.workers.length")==1
    assert page.evaluate("()=>window.pixelhub.game.cash")==cash-180
    page.click("#phase-save")
    page.reload()
    expect(page.locator("#end-title")).to_have_text("Inwestycje magazynu")
    assert page.evaluate("()=>window.pixelhub.game.pendingWorkers.length")==1
    page.screenshot(path=str(out/"development.png"))
    page.click("#continue")
    expect(page.locator("#round")).to_have_text("Runda 6/30")
    assert page.evaluate("()=>window.pixelhub.game.workers.length")==2
    assert not page.locator("#end").is_visible()
    page.screenshot(path=str(out/"round6.png"))
    assert not errors, errors
    (out/"report.json").write_text(json.dumps({"desktop":result,"shopSave":"PASS","javascriptErrors":errors},indent=2),encoding="utf-8")
    browser.close()
print("10 desktop layouts, resize hit testing, summary, purchase and shop reload passed.")
