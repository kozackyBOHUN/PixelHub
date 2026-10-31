"""Real mouse acceptance run, with intermediate geometry and transport snapshots."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
import os

Path('artifacts').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(os.environ.get('PIXELHUB_URL', 'http://127.0.0.1:5173/') + '?test=1')
    page.wait_for_function('window.pixelhub && document.querySelector("#message").textContent.length > 0')
    assert page.locator('#round').inner_text() == 'Runda 1/2'
    assert page.locator('#cash').inner_text() == '50 $'
    assert page.locator('#cmr .crate').count() == 4

    def advance(seconds):
        page.evaluate('(s)=>window.pixelhub.game.advance(s)', seconds)

    def clickcell(x, y):
        box = page.locator('canvas').bounding_box()
        page.mouse.click(box['x'] + (210 + (x + .5) * 49) / 1400 * box['width'], box['y'] + (205 + (y + .5) * 49) / 650 * box['height'])

    def worker():
        pos = page.evaluate('window.pixelhub.game.transportGeometry.head')
        clickcell(pos['x'], pos['y'])

    def cratecell(crate_id):
        loc = page.evaluate('(id)=>pixelhub.game.crates.find(c=>c.id===id).loc', crate_id)
        if loc['kind'] == 'floor':
            return loc['x'], loc['y']
        return (-1 - loc['depth'] if loc['kind'] == 'inbound' else 20 + loc['depth']), 2 + loc['lane']

    def run_until(phase=None):
        # Runs the public simulation, checks every 50ms frame, renders that same
        # frame, and verifies continuity. No assignments to game state or cash.
        return page.evaluate('''(phase)=>{
            const g=pixelhub.game;let n=0;const seen=new Set();
            while(g.task&&g.status==='playing'&&n++<20000){
                if(phase&&g.task.phase===phase)return {reached:true,seen:[...seen]};
                const old=g.transportGeometry, count=g.crates.length;
                seen.add(g.task.phase);g.advance(.05);g.assertInvariant();
                const now=g.transportGeometry;
                if(Math.hypot(now.back.x-old.back.x,now.back.y-old.back.y)>.1*g.speed)throw Error('Pallet discontinuity');
                if(Math.hypot(now.head.x-old.head.x,now.head.y-old.head.y)>.1*g.speed)throw Error('Worker discontinuity');
                if(Math.abs(Math.hypot(now.head.x-now.hitch.x,now.head.y-now.hitch.y)-.58)>1e-7)throw Error('Broken drawbar');
                if(count!==g.crates.length)throw Error('Cargo duplicated or lost');
                pixelhub.renderer.draw(g);
            }
            if(g.task||g.status==='lost')throw Error(g.message+' / '+g.status);
            return {reached:false,seen:[...seen]};
        }''', phase)

    def move(crate_id, dx, dy, inspect=False):
        worker()
        clickcell(*cratecell(crate_id))
        clickcell(dx, dy)
        assert page.evaluate('!!pixelhub.game.task'), page.evaluate('pixelhub.game.message')
        if inspect:
            for phase in ['INSERT_FORKS', 'LIFT', 'PULL']:
                assert run_until(phase)['reached'], phase
                advance(.25)
                page.screenshot(path=f'artifacts/transport-{phase.lower()}.png', full_page=True)
            # Capture the first loaded arc halfway through its actual trajectory.
            assert run_until('MANEUVER')['reached']
            duration = page.evaluate('pixelhub.game.task.steps[0].duration')
            advance(duration / 2)
            page.screenshot(path='artifacts/transport-turn.png', full_page=True)
            assert run_until('LOWER')['reached']
            advance(.35)
            page.screenshot(path='artifacts/transport-lower.png', full_page=True)
            assert run_until('WITHDRAW_FORKS')['reached']
            advance(.35)
            page.screenshot(path='artifacts/transport-withdraw.png', full_page=True)
        run_until()

    page.locator('#cmr').click()
    advance(1.1)
    worker()
    clickcell(-2, 2)
    assert page.evaluate('pixelhub.game.source') is None
    page.locator('#cancel').click()
    storage = [(3, 5), (2, 5), (3, 4), (2, 4)]
    for i, (crate_id, (x, y)) in enumerate(zip(['1-0-0', '1-0-1', '1-1-0', '1-1-1'], storage)):
        page.locator(f'[data-speed="{[1,2,4,1][i]}"]').click()
        move(crate_id, x, y, inspect=i == 0)
    advance(1.1)
    page.wait_for_function('document.querySelector("#end").open')
    assert page.evaluate('pixelhub.game.status') == 'summary'
    page.screenshot(path='artifacts/round-1.png', full_page=True)
    page.locator('#continue').click()
    page.wait_for_function('document.querySelector("#round").textContent === "Runda 2/2"')
    page.locator('[data-speed="1"]').click()
    page.locator('#cmr').click()
    advance(1.1)
    # Clear accessible stored crates first; send colour pairs before wages exhaust cash.
    for i, crate_id in enumerate(['1-1-0', '1-1-1', '1-0-0', '1-0-1']):
        move(crate_id, 21 if i % 2 == 0 else 20, 2)
        if i % 2:
            page.wait_for_function('!document.querySelector("#dispatch").hidden')
            page.screenshot(path='artifacts/loaded-bus.png', full_page=True)
            page.locator('#dispatch').click()
            assert page.evaluate('pixelhub.game.deliveryRemaining') > 29
            advance(30)
    page.set_viewport_size({'width': 760, 'height': 900})
    for i, crate_id in enumerate(['2-0-0', '2-0-1', '2-1-0', '2-1-1']):
        move(crate_id, 2, 3)
        move(crate_id, 21 if i % 2 == 0 else 20, 2)
        if i % 2:
            page.wait_for_function('!document.querySelector("#dispatch").hidden')
            page.locator('#dispatch').click()
            advance(30)
    page.wait_for_function('document.querySelector("#end").open')
    assert page.evaluate('pixelhub.game.status') == 'won'
    assert page.evaluate('pixelhub.game.crates.filter(c=>c.loc.kind==="delivered").length') == 8
    page.screenshot(path='artifacts/victory-mobile.png', full_page=True)
    page.locator('#restart').click()
    page.wait_for_function('!document.querySelector("#end").open')
    advance(180)
    page.wait_for_function('document.querySelector("#end").open')
    assert page.locator('#end-title').inner_text() == 'Bankructwo'
    assert not errors, errors
    print(json.dumps({'browser':'Chromium','scenario':'mouse: two rounds, physical pickup/turn/lower/withdraw, per-frame invariants and continuity, x1/x2/x4, resize, restart, bankruptcy','console_errors':errors,'result':'PASS'}, ensure_ascii=False))
    browser.close()
