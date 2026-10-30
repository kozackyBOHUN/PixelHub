"""Browser acceptance test. Requires `npm run dev` and Python Playwright + Chromium."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
import os
Path('artifacts').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={"width":1440,"height":1000},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(os.environ.get('PIXELHUB_URL','http://127.0.0.1:5173/')+'?test=1')
    page.wait_for_function('window.pixelhub && document.querySelector("#message").textContent.length > 0')
    assert page.locator('#round').inner_text()=='Runda 1/2'
    assert page.locator('#cash').inner_text()=='50 $'
    assert page.locator('#cmr .crate').count()==4
    def advance(seconds):
        page.evaluate('(s)=>window.pixelhub.game.advance(s)',seconds)
    def clickcell(x,y):
        box=page.locator('canvas').bounding_box()
        page.mouse.click(box['x']+(210+(x+.5)*49)/1400*box['width'],box['y']+(205+(y+.5)*49)/650*box['height'])
    def worker():
        pos=page.evaluate('window.pixelhub.game.pose')
        clickcell(pos['x'],pos['y'])
    def move(cx,cy,dx,dy):
        worker();clickcell(cx,cy);clickcell(dx,dy)
        assert page.evaluate('!!window.pixelhub.game.task'),(cx,cy,dx,dy,page.evaluate('({message:pixelhub.game.message,source:pixelhub.game.source,pose:pixelhub.game.pose,selected:pixelhub.game.selected,status:pixelhub.game.status})'))
        page.evaluate('''()=>{let n=0;const g=window.pixelhub.game;while(g.task&&g.status==='playing'&&n++<20000)g.advance(.05);g.assertInvariant();if(g.task||g.status==='lost')throw Error(g.message)}''')
    page.locator('#cmr').click();advance(1.1)
    worker();clickcell(-2,2)
    assert page.evaluate('window.pixelhub.game.source') is None
    page.locator('#cancel').click()
    storage=[(2,3),(2,4),(1,3),(1,4)]
    for (cx,cy),(dx,dy) in zip([(-1,2),(-2,2),(-1,3),(-2,3)],storage):move(cx,cy,dx,dy)
    page.wait_for_function('document.querySelector("#end").open')
    assert page.evaluate('window.pixelhub.game.status')=='summary'
    page.screenshot(path='artifacts/round-1.png',full_page=True)
    page.locator('#continue').click()
    page.wait_for_function('document.querySelector("#round").textContent === "Runda 2/2"')
    page.locator('#cmr').click();advance(1.1)
    slots=[(21,2),(20,2),(21,3),(20,3)]
    for (cx,cy),(dx,dy) in zip(storage,slots):move(cx,cy,dx,dy)
    page.wait_for_function('!document.querySelector("#dispatch").hidden')
    page.screenshot(path='artifacts/loaded-bus.png',full_page=True)
    page.locator('#dispatch').click();assert page.evaluate('window.pixelhub.game.deliveryRemaining')>44
    advance(45)
    # Repeat clicks after resizing: exact same visual-to-logical coordinate conversion.
    page.set_viewport_size({'width':760,'height':900})
    for (cx,cy),(fx,fy),(dx,dy) in zip([(-1,2),(-2,2),(-1,3),(-2,3)],storage,slots):
        move(cx,cy,fx,fy);move(fx,fy,dx,dy)
    page.wait_for_function('!document.querySelector("#dispatch").hidden')
    page.locator('#dispatch').click();advance(45)
    page.wait_for_function('document.querySelector("#end").open')
    assert page.evaluate('window.pixelhub.game.status')=='won'
    assert page.evaluate('window.pixelhub.game.crates.filter(c=>c.loc.kind==="delivered").length')==8
    page.screenshot(path='artifacts/victory-mobile.png',full_page=True)
    page.locator('#restart').click()
    page.wait_for_function('!document.querySelector("#end").open')
    advance(180)
    page.wait_for_function('document.querySelector("#end").open')
    assert page.locator('#end-title').inner_text()=='Bankructwo'
    assert not errors,errors
    print(json.dumps({'browser':'Chromium','scenario':'2 rounds through canvas clicks, resize, restart, bankruptcy','console_errors':errors,'result':'PASS'},ensure_ascii=False))
    browser.close()
