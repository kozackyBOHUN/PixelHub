
import functools, http.server, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path("artifacts");out.mkdir(exist_ok=True)
def serve(folder):
 s=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=folder))
 threading.Thread(target=s.serve_forever,daemon=True).start()
 return f"http://127.0.0.1:{s.server_port}/"
a,b=serve("../PixelHub-readability-fix/dist"),serve("dist")
with sync_playwright() as p:
 br=p.chromium.launch(channel="chrome")
 for url,tag in [(b,"03")]:
  pg=br.new_page(viewport={"width":1440,"height":900})
  errors=[];pg.on("pageerror",lambda e:errors.append(str(e)))
  pg.goto(url+"?test=1")
  pg.wait_for_function("window.pixelhub?.renderer.scene.game")
  pg.wait_for_timeout(400);pg.screenshot(path=out/f"{tag}-start.png")
  pg.locator(".cmr-card").first.click()
  pg.wait_for_function("['arriving','docked'].includes(window.pixelhub.game.cmrs[0].state)")
  pg.wait_for_timeout(1200);pg.screenshot(path=out/f"{tag}-przyjazd.png")
  def cell(x,y):
   xy=pg.evaluate("([x,y])=>window.pixelhub.renderer.gridToScreen({x:x+.5,y:y+.5})",[x,y])
   box=pg.locator("#world").bounding_box()
   pg.mouse.click(box["x"]+xy["x"],box["y"]+xy["y"])
  pose=pg.evaluate("window.pixelhub.game.pose")
  cell(pose["x"],pose["y"])
  cargo=pg.evaluate("window.pixelhub.game.crates[0].loc")
  cell(-1-cargo["depth"],cargo["row"]+cargo["lane"])
  cell(3,3 if tag=="03" else 5)
  assert pg.evaluate("!!window.pixelhub.game.task")
  pg.wait_for_timeout(450);pg.screenshot(path=out/f"{tag}-rozladunek.png")
  pg.evaluate("window.pixelhub.game.advance(100)")
  pg.screenshot(path=out/f"{tag}-pracownik.png")
  pg.wait_for_function("""() => window.pixelhub.renderer.scene.queue.commands.some(
    c => c.kind==='badge' && c.text==='2') ||
    window.pixelhub.renderer.scene.queue.commands.some(c=>c.id.endsWith('/recipient-label'))""")
  pg.screenshot(path=out/"palety-skladowane.png")
  pg.evaluate("document.querySelector('#dev-finish').click()")
  pg.wait_for_function("window.pixelhub.game.status === 'summary'")
  pg.screenshot(path=out/f"{tag}-rozliczenie.png")
  pg.locator("#development").click()
  pg.evaluate("window.pixelhub.game.money(650,'Test')")
  assert pg.locator("#investment-cards .investment-card").count()==5
  pg.screenshot(path=out/"menu-inwestycji.png")
  pg.screenshot(path=out/f"{tag}-inwestycje.png")
  if tag=="03":
   before=pg.evaluate("window.pixelhub.game.cash")
   pg.locator('[data-investment="receiving"] button').click()
   assert pg.evaluate("window.pixelhub.game.cash")==before-200
   assert pg.locator('[data-investment="receiving"] .owned').count()==2
   assert pg.evaluate("window.pixelhub.game.inboundBayCount")==2
   assert pg.evaluate("window.pixelhub.game.contains({x:2,y:-2})")
   pg.locator('[data-investment="shipping"] button').click()
  pg.locator("#continue").click()
  pg.wait_for_function("window.pixelhub.game.round === 2 && window.pixelhub.game.trucks[0]?.state === 'docked'")
  if tag=="03":
   assert pg.evaluate("!window.pixelhub.game.contains({x:8,y:-2})")
   pg.screenshot(path=out/"03-moduly.png")
  pallets=pg.evaluate("""window.pixelhub.game.stock.filter(c=>c.active && c.loc.kind==='floor').map(c=>c.loc)""")
  assert len(pallets)==2
  pg.wait_for_timeout(250)
  pg.screenshot(path=out/"palety-do-wysylki.png")
  for lane, loc in enumerate(pallets):
   pg.locator("#workers button").first.click()
   cell(loc["x"],loc["y"])
   row=pg.evaluate("window.pixelhub.game.rampRow(0)")
   cell(21,row+lane)
   assert pg.evaluate("!!window.pixelhub.game.task")
   pg.evaluate("window.pixelhub.game.advance(100)")
  pg.locator("#cmr-actions button").filter(has_text="Wyślij").first.click()
  pg.wait_for_function("window.pixelhub.game.trucks[0].trip !== undefined")
  pg.screenshot(path=out/f"{tag}-wysylka.png")
  pg.evaluate("window.pixelhub.game.advance(90)")
  assert pg.evaluate("window.pixelhub.game.trucks[0].state === 'docked'")
  pg.evaluate("document.querySelector('#dev-finish').click()")
  pg.wait_for_function("window.pixelhub.game.status === 'summary'")
  assert pg.evaluate("window.pixelhub.game.tripHistory.length > 0")
  assert not errors,errors
  print(tag,"PASS")
