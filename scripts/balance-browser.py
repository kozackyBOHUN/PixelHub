
import functools,http.server,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path("artifacts");out.mkdir(exist_ok=True)
httpd=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(http.server.SimpleHTTPRequestHandler,directory="dist"))
threading.Thread(target=httpd.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=p.chromium.launch(channel="chrome")
 page=b.new_page(viewport={"width":1440,"height":970})
 errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
 page.goto(f"http://127.0.0.1:{httpd.server_port}/?test=1")
 page.wait_for_function("window.pixelhub?.renderer.scene.game")
 page.locator(".cmr-card").first.click()
 page.wait_for_function("window.pixelhub.game.cmrs[0].state==='docked'")
 def click(x,y):
  point=page.evaluate("([x,y])=>window.pixelhub.renderer.gridToScreen({x:x+.5,y:y+.5})",[x,y])
  canvas=page.locator("#world").bounding_box()
  page.mouse.click(canvas["x"]+point["x"],canvas["y"]+point["y"])
 page.get_by_role("button",name="Pracownik 1 · 0/3").click()
 click(-1,1);click(6,3)
 assert page.evaluate("!!window.pixelhub.game.task")
 for x,y,d in [(-1,2,7),(-2,1,8),(-2,2,9)]:
  page.locator("#worker-queues section > button").first.click()
  click(x,y);click(d,3)
 assert page.evaluate("window.pixelhub.game.queue(0).length")==3
 page.screenshot(path=out/"kolejki.png")
 page.evaluate("window.pixelhub.game.advance(450)")
 page.wait_for_function("window.pixelhub.game.status==='summary'")
 page.locator("#development").click()
 page.locator("#continue").click()
 page.evaluate("document.querySelector('#dev-finish').click()")
 page.wait_for_function("window.pixelhub.game.status==='summary'")
 page.locator("#development").click()
 page.locator("#continue").click()
 page.evaluate("document.querySelector('#dev-finish').click()")
 page.wait_for_function("window.pixelhub.game.status==='summary'")
 page.get_by_role("button",name="Odrzuć").click()
 assert page.evaluate("Object.values(window.pixelhub.game.contracts).includes('rejected')")
 page.screenshot(path=out/"kontrakty.png")
 assert not errors,errors
 print("PASS")
