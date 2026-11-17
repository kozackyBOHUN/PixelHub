"""CMR browser acceptance against a production preview; cargo uses the physical engine."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_options import browser_options
BASE=os.environ.get('PIXELHUB_URL','http://127.0.0.1:5173/').rstrip('/')+'/'
OUT=Path('artifacts/cmr');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(**browser_options())
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'?test=1');page.wait_for_function('()=>window.pixelhub')
    page.locator('#lab').evaluate('(d)=>d.open=true')
    def jump(n):
        page.select_option('#dev-round',str(n));page.click('#dev-jump');page.wait_for_function('(n)=>window.pixelhub.game.round===n && document.querySelector("#round").textContent===`Runda ${n}/30`',arg=n,timeout=30000)
    jump(3)
    incoming=page.locator('.cmr-card.inbound')
    assert incoming.count()==page.evaluate('()=>window.pixelhub.game.cmrs.length')
    assert page.evaluate('()=>window.pixelhub.game.config.arrivals.length')==3
    assert [incoming.nth(i).locator('.cmr-tile').count() for i in range(3)]==[8,8,4]
    boxes=[incoming.nth(i).bounding_box() for i in range(3)]
    assert boxes[0]['x']<boxes[1]['x']<boxes[2]['x'] and max(b['y'] for b in boxes)-min(b['y'] for b in boxes)<2
    incoming.nth(2).click();page.wait_for_function('()=>document.querySelectorAll(".cmr-card.inbound")[2].getAttribute("aria-pressed")==="true"')
    assert page.evaluate('()=>window.pixelhub.game.crates.filter(c=>c.loc.kind==="inbound").length')==4
    page.screenshot(path=str(OUT/'round3-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(OUT/'round3-mobile.png'),full_page=True)
    assert page.locator('#cmrs').bounding_box()['height']<200
    assert page.evaluate('()=>document.documentElement.scrollWidth<=window.innerWidth')
    page.set_viewport_size({'width':1440,'height':1000})
    jump(4)
    assert page.locator('.cmr-card.outbound').count()==0
    result=page.evaluate("""()=>{
      const g=window.pixelhub.game;
      const ids=[];
      for(const [lane,color] of ['red','blue'].entries()){
        const c=g.crates.find(c=>c.destinationColor===color&&c.dispatchRound<=g.round&&c.loc.kind==='floor');
        g.selectWorker();
        if(!g.choose(c.id)||!g.order({kind:'outbound',lane,depth:1,bay:0}))throw Error(g.message);
        g.advance(200);
        if(c.loc.kind!=='outbound')throw Error('Pallet not loaded');
        ids.push(c.id);
      }
      return {ids,truck:g.shippingAt().id};
    }""")
    dispatch=page.locator('#truck-controls button').first
    assert 'Wyślij' in dispatch.inner_text()
    assert '45' in dispatch.inner_text()
    page.screenshot(path=str(OUT/'live-load.png'),full_page=True)
    dispatch.click()
    page.wait_for_function('()=>document.querySelector("#trip-clock").textContent.includes("powrót za")')
    page.evaluate('()=>window.pixelhub.game.advance(5)')
    assert page.evaluate('()=>window.pixelhub.game.shipped.length')==0
    page.click('#save')
    page.reload();page.wait_for_function('()=>window.pixelhub')
    assert page.evaluate('()=>window.pixelhub.game.trucks[0].state')=='in-transit'
    page.screenshot(path=str(OUT/'trip-countdown.png'),full_page=True)
    page.evaluate('()=>window.pixelhub.game.advance(45)')
    assert page.evaluate('(ids)=>ids.every(id=>window.pixelhub.game.shipped.includes(id))',result['ids'])
    assert page.evaluate('()=>window.pixelhub.game.shippingAt()?.id')==result['truck']
    assert page.evaluate('()=>window.pixelhub.game.tripHistory.at(-1).cost')==45
    page.locator('#lab').evaluate('(d)=>d.open=true')
    page.click('#dev-finish')
    page.wait_for_function('()=>window.pixelhub.game.status==="summary"',timeout=60000)
    page.locator('.round-receipt > summary').click()
    assert '45' in page.locator('.round-receipt').inner_text()
    page.screenshot(path=str(OUT/'round2-receipt.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.locator('#end').evaluate('(d)=>d.scrollWidth<=d.clientWidth')
    page.screenshot(path=str(OUT/'round2-receipt-mobile.png'),full_page=True)
    page.click('#development')
    assert page.locator('#end-title').inner_text()=='Inwestycje magazynu'
    assert page.locator('[data-investment="workers"]').is_visible()
    page.click('#continue')
    page.wait_for_function('()=>window.pixelhub.game.round===5')
    assert not errors,errors
    print(json.dumps({'round3':'8/8/4, third docks on one click','mobile':'390px, horizontal strip','shipping':'mixed load, live countdown, reload, return, receipt and investments','errors':errors}))
    browser.close()
