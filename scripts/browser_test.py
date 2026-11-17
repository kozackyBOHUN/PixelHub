"""PixelHub 0.3 browser acceptance. Run against an already running Vite/preview server."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_options import browser_options

BASE = os.environ.get('PIXELHUB_URL', 'http://127.0.0.1:5173/').rstrip('/') + '/'
OUT = Path('artifacts/browser-0.2')
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options())
    page = browser.new_page(viewport={'width':1440,'height':1100})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '?test=1')
    page.wait_for_function('() => window.pixelhub')
    page.get_by_role('button', name='Kamera −', exact=True).click()
    page.wait_for_timeout(100)
    page.locator('.cmr-card.inbound').first.click()
    page.evaluate('() => window.pixelhub.game.advance(1.2)')
    def click_cell(x, y):
        box = page.locator('#world').bounding_box()
        size = page.locator('#world').evaluate('(c) => ({w:c.width,h:c.height})')
        point = page.evaluate('([x,y]) => window.pixelhub.renderer.gridToScreen({x:x+.5,y:y+.5})', [x,y])
        page.mouse.click(box['x']+point['x']*box['width']/size['w'], box['y']+point['y']*box['height']/size['h'])
    for index in range(8):
        cargo = page.evaluate("() => window.pixelhub.game.crates.find(c => c.loc.kind === 'inbound' && window.pixelhub.game.accessible(c.loc))")
        assert cargo
        page.locator("#workers button").first.dispatch_event("click")
        click_cell(-1-cargo['loc']['depth'], cargo['loc']['row']+cargo['loc']['lane'])
        click_cell(21 - (index % 4)//2, 1 + index % 2)
        assert page.evaluate("() => !!window.pixelhub.game.task")
        page.evaluate("() => window.pixelhub.game.advance(200)")
        if index % 4 == 3:
            page.locator("#truck-controls button").first.click()
            page.evaluate("() => window.pixelhub.game.advance(32)")
    assert page.evaluate("() => window.pixelhub.game.cash") == 52
    page.wait_for_function("() => window.pixelhub.game.status === 'summary'")
    page.screenshot(path=str(OUT/'round1.png'), full_page=True)
    page.click('#development')
    page.click('#continue')
    page.get_by_role('button', name='Zapisz', exact=True).click()
    snapshot = '() => JSON.stringify({round:window.pixelhub.game.round,crates:window.pixelhub.game.crates,cash:window.pixelhub.game.cash})'
    before = page.evaluate(snapshot)
    page.reload()
    page.wait_for_function('() => window.pixelhub')
    assert page.evaluate(snapshot) == before
    # Cargo at the second ramp stays visible when the first ramp is empty.
    page.locator('#lab').evaluate('(d)=>d.open=true')
    page.select_option('#dev-round', '19')
    page.click('#dev-jump')
    page.wait_for_function('() => window.pixelhub.game.round === 19', timeout=20000)
    page.evaluate('''() => {
        const {game:g,renderer:r}=window.pixelhub;
        g.status='development';g.developmentRound=19;
        if(!g.buyModule('receiving')) throw Error('Second ramp unavailable');g.nextRound();
        const m=g.config.arrivals[0];
        if(!g.dockCMR(m.id,1)) throw Error('Docking at second ramp failed');
        g.advance(1.2);
        window.drawnCargo=new Set();
        window.originalCrate=r.crate;
        r.crate=function(c,...args){window.drawnCargo.add(c.id);return window.originalCrate.call(this,c,...args)};
    }''')
    page.wait_for_timeout(200)
    assert page.evaluate('''() => {
        const g=window.pixelhub.game;
        return g.inbound !== 'docked' && g.config.arrivals[0].palletIds.every(id=>window.drawnCargo.has(id));
    }''')
    page.evaluate('() => window.pixelhub.renderer.crate=window.originalCrate')
    for n, stock in [(18,39),(30,16)]:
        page.select_option('#dev-round', str(n))
        page.click('#dev-jump')
        page.wait_for_function('(n) => window.pixelhub.game.round === n', arg=n, timeout=20000)
        assert page.evaluate('() => window.pixelhub.game.stock.length') == stock
    # Expanded map has the same logical and rendered aspect ratio (dynamic Pixi texture).
    assert page.evaluate('() => window.pixelhub.sceneSprite.height === window.pixelhub.renderer.surface.height')
    page.locator('#world').screenshot(path=str(OUT/'round30.png'))
    page.click('#dev-finish')
    page.wait_for_function("() => window.pixelhub.game.status === 'won' || document.querySelector('#dev-status').textContent.startsWith('Error')", timeout=180000)
    assert page.evaluate('() => window.pixelhub.game.status') == 'won', page.locator('#dev-status').inner_text()
    assert page.evaluate('() => window.pixelhub.game.stock.length') == 0
    assert page.evaluate("() => window.pixelhub.game.crates.filter(c => c.loc.kind === 'delivered').length") >= 1018
    page.screenshot(path=str(OUT/'victory.png'), full_page=True)
    page.goto(BASE)
    page.wait_for_timeout(300)
    assert not page.locator('#dev-panel').is_visible()
    assert not errors, errors
    (OUT/'results.json').write_text(json.dumps({'mouse_round1':True,'save_load':True,'scenarios':[18,19,30],'second_ramp_visible':True,'final_stock':0,'delivered':'at least 1018','javascript_errors':errors}, indent=2), encoding='utf8')
    browser.close()
print('PixelHub 0.3: browser acceptance passed.')
