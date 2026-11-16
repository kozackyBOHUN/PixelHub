"""Placement in Chrome, real pixel rendering and physical processing in round 8."""
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

base=os.environ.get("PIXELHUB_URL","http://127.0.0.1:5173/").rstrip("/")
out=Path("artifacts/sorter-update")
out.mkdir(parents=True,exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(channel=os.environ.get("BROWSER_CHANNEL","chrome"),headless=True)
    page=browser.new_page(viewport={"width":1536,"height":864})
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto(base+"/?test=1")
    page.wait_for_function("()=>window.pixelhub")
    page.locator("#lab").evaluate("(d)=>d.open=true")
    page.select_option("#dev-round","7")
    page.click("#dev-jump")
    expect(page.locator("#round")).to_have_text("Runda 7/30")
    page.click("#dev-finish")
    expect(page.locator("#end-title")).to_have_text("Bilans rundy 7",timeout=90000)
    page.click("#development")
    cash=page.evaluate("()=>window.pixelhub.game.cash")
    page.locator('[data-action="sorter"]').click()
    expect(page.locator("#sorter-placement")).to_be_visible()
    page.locator("#lab").evaluate("(d)=>d.open=false")

    def screen(x,y):
        return page.evaluate("""([x,y])=>{
          const r=window.pixelhub.renderer,p=r.gridToScreen({x:x+.5,y:y+.5});
          const b=r.canvas.getBoundingClientRect();
          return {x:b.left+p.x*b.width/r.canvas.width,y:b.top+p.y*b.height/r.canvas.height};
        }""",[x,y])

    page.click("#sorter-rotate")
    page.wait_for_function("()=>window.pixelhub.renderer.scene.sorterPreview?.d===2")
    for _ in range(3):
        page.keyboard.press("r")
    page.wait_for_function("()=>window.pixelhub.renderer.scene.sorterPreview?.d===0")
    invalid=screen(1,-6)
    page.mouse.click(invalid["x"],invalid["y"])
    expect(page.locator("#message")).to_contain_text("wolnych pól")
    assert page.evaluate("()=>window.pixelhub.game.cash")==cash
    assert page.evaluate("()=>window.pixelhub.game.sorter") is None
    target=screen(5,-5)
    page.mouse.move(target["x"],target["y"])
    page.wait_for_function("()=>window.pixelhub.renderer.scene.sorterPreview?.x===5")
    page.screenshot(path=str(out/"placement.png"))
    page.mouse.click(target["x"],target["y"])
    expect(page.locator("#shop-message")).to_contain_text("Sorter ustawiony")
    assert page.evaluate("()=>window.pixelhub.game.cash")==cash-160
    page.click("#phase-save")
    page.reload()
    expect(page.locator("#end-title")).to_have_text("Inwestycje magazynu")
    assert page.evaluate("()=>window.pixelhub.game.sorter")=={"x":5,"y":-5,"d":0}
    page.click("#continue")
    expect(page.locator("#round")).to_have_text("Runda 8/30")
    card=page.locator(".cmr-card").filter(has=page.locator(".mix-tile")).first
    expect(card.locator(".mix-tile i").first).to_be_visible()
    assert card.locator(".mix-tile i").count()>=4
    card.click()
    page.evaluate("()=>window.pixelhub.game.advance(1.2)")
    result=page.evaluate(r"""()=>{
      const {game:g,renderer:r}=window.pixelhub;
      r.draw(g);
      const m=g.crates.find(c=>c.mix&&c.loc.kind==='inbound');
      const cmds=r.lastCommands.filter(x=>x.id.startsWith('cargo/'+m.id+'/carton/')&&x.id.endsWith('/face'));
      const actual=cmds.map(c=>c.color);
      const held=g.stock.find(c=>c.loc.kind==='floor'&&c.dispatchRound>g.round&&!c.mix);
      const label=r.lastCommands.find(c=>c.id==='cargo/'+held.id+'/recipient-label');
      const box=r.lastCommands.find(c=>c.id==='cargo/'+held.id+'/box');
      const p=r.gridToScreen({x:label.point.x+label.width/2,y:label.point.y+label.height/2});
      const rgb=[...r.ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data].slice(0,3);
      const expected=label.color.match(/\w\w/g).map(s=>parseInt(s,16));
      const q=cmds[0];
      const hit=r.hitCargo(r.gridToScreen({x:q.point.x+q.width/2,y:q.point.y+q.height/2}));
      return {hit,id:m.id,location:m.loc,actual,cartons:m.mix.reduce((n,p)=>n+p.cartons,0),colors:m.mix.length,
        label:rgb,expected,box:box.assetId,passable:g.free()(g.sorter),
        arrows:r.lastCommands.filter(c=>/^sorter\/(input|output)\/arrow$/.test(c.id)).length};
    }""")
    assert len(result["actual"])==result["cartons"] and len(set(result["actual"]))==result["colors"],result
    assert result["label"]==result["expected"] and result["box"]=="cargo/box/gray",result
    assert result["passable"] is False and result["arrows"]==2 and result["hit"]==result["id"],result
    cargo=screen(-1-result["location"]["depth"],result["location"]["row"]+result["location"]["lane"])
    page.mouse.click(cargo["x"],cargo["y"])
    expect(page.locator("#inspect")).to_contain_text(result["id"])
    page.screenshot(path=str(out/"mix-and-sorter.png"))
    page.locator("#lab").evaluate("(d)=>d.open=true")
    page.click("#dev-finish")
    expect(page.locator("#end-title")).to_have_text("Bilans rundy 8",timeout=90000)
    assert page.evaluate("()=>window.pixelhub.game.completedRecipes.length")>=1
    assert not errors,errors
    browser.close()
print("Chrome: placement, invalid placement, rotation, reload, RGB label, MIX CMR and physical round 8 passed.")
