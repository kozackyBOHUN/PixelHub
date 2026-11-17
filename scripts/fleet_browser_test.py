"""Investment and vehicle rendering acceptance against the production preview."""
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from browser_options import browser_options

BASE = os.environ.get("PIXELHUB_URL", "http://127.0.0.1:5173/").rstrip("/")
OUT = Path("artifacts/fleet")
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(**browser_options())
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/?test=1")
    page.wait_for_function("() => window.pixelhub")
    page.locator("#lab").evaluate("(element) => element.open = true")
    page.select_option("#dev-round", "2")
    page.click("#dev-jump")
    expect(page.locator("#round")).to_have_text("Runda 2/30")
    page.click("#dev-finish")
    expect(page.locator("#end-title")).to_have_text("Odprawa · runda 3", timeout=60000)
    page.click("#development")
    expect(page.locator('[data-investment="mix"] button').first).to_be_visible()
    new_vehicle = page.locator('[data-action="buy-vehicle"]')
    expect(new_vehicle).to_contain_text("Wymagane minimum 2 rampy wysyłkowe")

    page.evaluate("() => window.pixelhub.game.money(2000, 'Budżet testowy')")
    cash = page.evaluate("() => window.pixelhub.game.cash")
    page.locator('[data-investment="storage"] button').click()
    assert page.evaluate("() => window.pixelhub.game.cash") == cash - 200
    page.locator('[data-investment="shipping"] button').click()
    page.locator(".investment-extras").evaluate("(d)=>d.open=true")
    expand = page.locator('[data-action="expand-vehicle-0"]')
    expand.dblclick()
    expect(expand).to_contain_text("6 od kolejnej rundy")
    expand.click()
    expect(expand).to_contain_text("8 od kolejnej rundy")
    new_vehicle.click()
    assert page.evaluate("() => window.pixelhub.game.plannedFleet") == [8, 4]
    page.screenshot(path=str(OUT / "investments.png"))
    page.reload()
    expect(page.locator("#end-title")).to_have_text("Inwestycje magazynu")
    expect(expand).to_contain_text("8 od kolejnej rundy")
    page.click("#continue")
    expect(page.locator("#round")).to_have_text("Runda 3/30")
    assert page.evaluate("()=>window.pixelhub.game.trucks[0].capacity")==8
    assert page.evaluate("()=>window.pixelhub.game.trucks[1].capacity")==4
    page.wait_for_function("""() => {
      const {game, renderer} = window.pixelhub;
      const commands = renderer.diagnostics().commands;
      const segments = (index) => commands.filter(c => c.id.includes('shipping-' + index + '/segment/'));
      return game.rampRow(0) === 1 && game.rampRow(1) === -3
        && segments(0).length === 4 && segments(1).length === 2;
    }""")
    page.screenshot(path=str(OUT / "fleet.png"))
    assert not errors, errors
    browser.close()
print("Chrome: early purchases, one charge per click, reload, 8/4 capacity and rendered ramp geometry passed.")
