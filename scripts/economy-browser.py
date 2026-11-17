import functools,gzip,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_options import browser_options
out=Path("docs/screenshots/stability")
out.mkdir(parents=True,exist_ok=True)
server=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(http.server.SimpleHTTPRequestHandler,directory="dist"))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=os.environ.get("PIXELHUB_TEST_URL",f"http://127.0.0.1:{server.server_port}/")+"?dev=1"
with sync_playwright() as p:
 b=p.chromium.launch(**browser_options())
 page=b.new_page(viewport={"width":1366,"height":900})
 errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
 page.goto(url);page.wait_for_function("window.pixelhub?.renderer.scene.game")
 page.evaluate("document.querySelector('#dev-finish').click()")
 page.wait_for_function("window.pixelhub.game.status==='summary'",timeout=120000)
 assert page.evaluate("window.pixelhub.game.cash")==52
 assert page.evaluate("window.pixelhub.game.roundReport().ramps")==20
 page.screenshot(path=out/"round1-finances.png")
 page.get_by_role("button",name="Przejdź do inwestycji").click()
 page.get_by_role("button",name="Rozpocznij rundę 2",exact=True).click()
 page.evaluate("window.pixelhub.game.speed=0")
 def cell(x,y):
  pt=page.evaluate("([x,y])=>window.pixelhub.renderer.gridToScreen({x:x+.5,y:y+.5})",[x,y])
  rect=page.locator("#world").bounding_box();page.mouse.click(rect["x"]+pt["x"],rect["y"]+pt["y"])
 page.locator("#workers button").first.dispatch_event("click")
 cell(1,3)
 assert page.evaluate("!!window.pixelhub.game.cleaning")
 page.evaluate("""()=>{
 const g=window.pixelhub.game;
 for(let n=0;n<10000&&g.task;n++)g.step(.05);
 g.advance(.5);
 }""")
 page.screenshot(path=out/"cleaning-progress.png")
 before=page.evaluate("window.pixelhub.game.cash")
 page.evaluate("window.pixelhub.save()");page.reload()
 page.wait_for_function("window.pixelhub?.renderer.scene.game")
 page.evaluate("window.pixelhub.game.speed=1;window.pixelhub.game.advance(3)")
 assert page.evaluate("window.pixelhub.game.cash")==before-5
 assert page.evaluate("!window.pixelhub.game.isClutter({x:1,y:3})")
 page.reload();page.wait_for_function("window.pixelhub?.renderer.scene.game")
 assert page.evaluate("!window.pixelhub.game.isClutter({x:1,y:3})")
 assert not errors,errors
 # A legacy save is advertised explicitly and does not replace the story opening.
 with gzip.open("public/campaign-scenarios.json.gz","rt",encoding="utf8") as f: legacy=json.load(f)["scenarios"]["1"]
 old=b.new_page()
 old.add_init_script(f"localStorage.setItem('pixelhub-0.3-balance-campaign',{json.dumps(legacy)})")
 old.goto(url.split("?")[0]);old.wait_for_function("document.querySelector('#cash')?.textContent.includes('0')")
 assert old.get_by_role("button",name="Wczytaj wcześniejszą kampanię 0.3").count()==1
 assert old.evaluate("localStorage.getItem('pixelhub-0.3-balance-campaign')")==legacy
 print("PASS: exact round1 ledger, cleaning after reload, explicit legacy save")
