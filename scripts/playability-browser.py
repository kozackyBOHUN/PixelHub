
import functools,http.server,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path("artifacts");out.mkdir(exist_ok=True)
server=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(http.server.SimpleHTTPRequestHandler,directory="dist"))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(channel="chrome")
 page=browser.new_page(viewport={"width":1440,"height":1000})
 errors=[]; page.on("pageerror",lambda e:errors.append(str(e)))
 page.goto(f"http://127.0.0.1:{server.server_port}/?test=1")
 page.wait_for_function("window.pixelhub?.renderer.scene.game")
 page.locator(".cmr-card").first.click()
 page.wait_for_function("window.pixelhub.game.cmrs[0].state==='docked'")
 page.evaluate("document.querySelector('#dev-finish').click()")
 page.wait_for_function("window.pixelhub.game.status==='summary'")
 page.evaluate("window.pixelhub.game.money(900,'Test')")
 assert "Odprawa" in page.locator("#end-title").inner_text()
 page.screenshot(path=out/"odprawa.png")
 page.locator("#development").click()
 page.screenshot(path=out/"inwestycje.png")
 page.locator('[data-investment="cold"] button').first.click()
 assert page.evaluate("window.pixelhub.game.coldStock")==4
 def cell(x,y):
  pt=page.evaluate("([x,y])=>window.pixelhub.renderer.gridToScreen({x:x+.5,y:y+.5})",[x,y])
  box=page.locator("#world").bounding_box()
  page.mouse.click(box["x"]+pt["x"],box["y"]+pt["y"])
 cell(0,0); assert page.evaluate("window.pixelhub.game.coldStock")==4
 cell(6,0);cell(9,0)
 page.keyboard.press("Escape")
 assert page.evaluate("window.pixelhub.game.coldStock")==2
 page.locator(".cold-resume").click()
 cell(12,0);cell(14,0)
 page.screenshot(path=out/"chlodnia.png")
 page.locator('[data-investment="piesek"] button').click()
 assert page.evaluate("window.pixelhub.game.usesPiesek")
 page.locator('[data-investment="mix"] button').first.click()
 site=page.evaluate("window.pixelhub.game.findSorterSite()")
 assert site
 cell(site["x"],site["y"])
 assert page.evaluate("window.pixelhub.game.sorters.length")==1
 page.locator("#continue").click()
 page.wait_for_function("window.pixelhub.game.trucks[0]?.state==='docked'")
 page.screenshot(path=out/"mix.png")
 for lane in range(2):
  loc=page.evaluate("window.pixelhub.game.stock.find(c=>c.active && c.loc.kind==='floor').loc")
  page.locator("#workers button").first.click()
  cell(loc["x"],loc["y"]);cell(21,1+lane)
  page.wait_for_function("window.pixelhub.game.carried")
  if lane==0: page.screenshot(path=out/"piesek.png")
  page.evaluate("window.pixelhub.game.advance(130)")
 page.locator("#truck-controls button").filter(has_text="Wyślij").first.click()
 page.wait_for_function("!!window.pixelhub.game.trucks[0].trip")
 page.evaluate("window.pixelhub.game.step(window.pixelhub.game.trucks[0].trip.returnAt-window.pixelhub.game.time)"); assert page.evaluate("window.pixelhub.game.trucks[0].state")=="arriving"
 page.screenshot(path=out/"powrot.png")
 page.wait_for_function("window.pixelhub.game.trucks[0].state === 'docked'")
 assert page.evaluate("window.pixelhub.game.trucks[0].state==='docked'")
 page.locator(".cmr-card").first.click()
 page.evaluate("document.querySelector('#dev-finish').click()")
 page.wait_for_function("window.pixelhub.game.status==='summary'")
 page.reload()
 page.wait_for_function("window.pixelhub?.game.coldCells.length===4")
 assert page.evaluate("window.pixelhub.game.usesPiesek")
 assert not errors,errors
 print("PASS")
