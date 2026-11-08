"""PixelHub 0.2 browser acceptance. Run against an already running Vite/preview server."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('PIXELHUB_URL', 'http://127.0.0.1:5173/').rstrip('/') + '/'
OUT = Path('artifacts/browser-0.2')
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    launch = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        launch['executable_path'] = os.environ['CHROMIUM_PATH']
    else:
        launch['channel'] = os.environ.get('BROWSER_CHANNEL', 'chrome')
    browser = p.chromium.launch(**launch)
    page = browser.new_page(viewport={'width':1440,'height':1100})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '?test=1')
    page.wait_for_function('() => window.pixelhub')
    page.get_by_role('button', name='Podstaw · rampa 1', exact=True).click()
    page.evaluate('() => window.pixelhub.game.advance(1.2)')
    def click_cell(x, y):
        box = page.locator('#world').bounding_box()
        size = page.locator('#world').evaluate('(c) => ({w:c.width,h:c.height})')
        page.mouse.click(box['x']+(210+(x+.5)*49)*box['width']/size['w'], box['y']+(110+(y+.5)*49)*box['height']/size['h'])
    for i, target in enumerate([(3,5),(2,5),(1,5),(16,5)]):
        pose = page.evaluate('() => window.pixelhub.game.pose')
        click_cell(pose['x'], pose['y'])
        c = page.evaluate('(i) => window.pixelhub.game.crates.find(c => c.id === `R01-P00${i+1}`)', i)
        click_cell(-1-c['loc']['depth'], 2+c['loc']['lane'])
        click_cell(*target)
        assert page.evaluate('() => !!window.pixelhub.game.task'), page.locator('#message').inner_text()
        # Advance time only: cargo is moved exclusively by the physical transport engine.
        page.evaluate('() => window.pixelhub.game.advance(200)')
    page.wait_for_function("() => window.pixelhub.game.status === 'summary'")
    page.screenshot(path=str(OUT/'round1.png'), full_page=True)
    page.get_by_role('button', name='Runda 2 →', exact=True).click()
    page.get_by_role('button', name='Zapisz', exact=True).click()
    snapshot = '() => JSON.stringify({round:window.pixelhub.game.round,crates:window.pixelhub.game.crates,cash:window.pixelhub.game.cash})'
    before = page.evaluate(snapshot)
    page.reload()
    page.wait_for_function('() => window.pixelhub')
    assert page.evaluate(snapshot) == before
    # Cargo at the second ramp stays visible when the first ramp is empty.
    page.select_option('#dev-round', '19')
    page.click('#dev-jump')
    page.wait_for_function('() => window.pixelhub.game.round === 19', timeout=20000)
    page.evaluate('''() => {
        const {game:g,renderer:r}=window.pixelhub;
        if(!g.buy('ramps')) throw Error('Second ramp unavailable');
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
    for n, stock in [(18,32),(30,18)]:
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
    assert page.evaluate("() => window.pixelhub.game.crates.filter(c => c.loc.kind === 'delivered').length") == 696
    page.screenshot(path=str(OUT/'victory.png'), full_page=True)
    page.goto(BASE)
    page.wait_for_timeout(300)
    assert not page.locator('#dev-panel').is_visible()
    assert not errors, errors
    (OUT/'results.json').write_text(json.dumps({'mouse_round1':True,'save_load':True,'scenarios':[18,19,30],'second_ramp_visible':True,'final_stock':0,'delivered':696,'javascript_errors':errors}, indent=2), encoding='utf8')
    browser.close()
print('PixelHub 0.2: browser acceptance passed.')
