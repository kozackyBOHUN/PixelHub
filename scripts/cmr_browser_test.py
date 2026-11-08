"""CMR browser acceptance against a production preview; cargo uses the physical engine."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('PIXELHUB_URL','http://127.0.0.1:5173/').rstrip('/')+'/'
OUT=Path('artifacts/cmr');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'?test=1');page.wait_for_function('()=>window.pixelhub')
    def jump(n):
        page.select_option('#dev-round',str(n));page.click('#dev-jump');page.wait_for_function('(n)=>window.pixelhub.game.round===n && document.querySelector("#round").textContent===`Runda ${n}/30`',arg=n,timeout=30000)
    jump(3)
    incoming=page.locator('.cmr-card.inbound')
    assert incoming.count()==3
    assert [incoming.nth(i).locator('.cmr-tile').count() for i in range(3)]==[8,8,4]
    boxes=[incoming.nth(i).bounding_box() for i in range(3)]
    assert boxes[0]['y']<boxes[1]['y']<boxes[2]['y']
    incoming.nth(2).click();page.wait_for_function('()=>document.querySelectorAll(".cmr-card.inbound")[2].getAttribute("aria-pressed")==="true"')
    page.get_by_role('button',name='Podstaw · rampa 1',exact=True).click()
    assert page.evaluate('()=>window.pixelhub.game.crates.filter(c=>c.loc.kind==="inbound").length')==4
    page.screenshot(path=str(OUT/'round3-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(OUT/'round3-mobile.png'),full_page=True)
    assert page.locator('#cmrs').bounding_box()['height']<200
    assert page.evaluate('()=>document.documentElement.scrollWidth<=window.innerWidth')
    page.set_viewport_size({'width':1440,'height':1000})
    jump(2)
    card=page.locator('.cmr-card.outbound').first
    card.click();page.get_by_role('button',name='Podstaw · rampa 1',exact=True).click()
    result=page.evaluate('''()=>{
      const g=window.pixelhub.game;g.advance(1.2);
      const c=g.crates.find(c=>(c.dispatchRound??c.dueRound)<=g.round&&c.loc.kind==='floor');
      const floor={...c.loc};g.selectWorker();if(!g.choose(c.id)||!g.order({kind:'outbound',lane:0,depth:1}))throw Error(g.message);
      g.advance(200);return {id:c.id,floor,loc:c.loc,counts:g.progress(g.cmrAt('outbound'))};
    }''')
    assert result['loc']['kind']=='outbound',result
    page.wait_for_function('()=>document.querySelectorAll(".cmr-card.outbound .loaded").length===1')
    assert '1/2' in card.inner_text()
    page.get_by_role('button',name='Zapisz',exact=True).click()
    page.reload();page.wait_for_function('()=>window.pixelhub')
    page.wait_for_function('()=>document.querySelectorAll(".cmr-card.outbound .loaded").length===1')
    assert page.evaluate('(id)=>window.pixelhub.game.crates.find(c=>c.id===id).loc.kind',result['id'])=='outbound'
    page.screenshot(path=str(OUT/'live-load.png'),full_page=True)
    page.evaluate("""(data)=>{const g=window.pixelhub.game;g.selectWorker();if(!g.choose(data.id)||!g.order(data.floor))throw Error(g.message);g.advance(200);}""",result)
    page.wait_for_function('()=>document.querySelectorAll(".cmr-card.outbound .loaded").length===0')
    assert page.evaluate('(id)=>window.pixelhub.game.crates.find(c=>c.id===id).loc.kind',result['id'])=='floor'
    assert not errors,errors
    print(json.dumps({'round3':'vertical 8/8/4, third selectable','mobile':'390px, bounded lists, no horizontal overflow','load':'physical LOWER -> 1/2 and correct tile; persisted on reload','errors':errors}))
    browser.close()
