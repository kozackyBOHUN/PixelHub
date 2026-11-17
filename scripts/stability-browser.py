import base64
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from browser_options import browser_options
out=Path("docs/screenshots/stability");out.mkdir(parents=True,exist_ok=True)
server=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(http.server.SimpleHTTPRequestHandler,directory="dist"))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=p.chromium.launch(**browser_options())
 page=b.new_page(viewport={"width":1366,"height":900})
 errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
 page.goto(f"http://127.0.0.1:{server.server_port}/?test=1")
 page.wait_for_function("window.pixelhub?.renderer.scene.game")
 result=page.evaluate("""async()=>{
  const {renderer:r}=window.pixelhub; let g=window.pixelhub.game;
  g.speed=0;
  const workers=r.assets.diagnostics().filter(x=>x.id.startsWith('worker/'));
  if(workers.length!==4||workers.some(x=>x.status!=='ready'))throw Error(JSON.stringify(workers));
  const snap=()=>{
    r.draw(g);
    const c=document.createElement('canvas');c.width=c.height=384;
    const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
    const pos=r.gridToScreen({x:g.transportGeometry.head.x+.5,y:g.transportGeometry.head.y+.5});
    ctx.drawImage(r.surface,pos.x-48,pos.y-48,96,96,0,0,384,384);
    return c.toDataURL();
  };
  const shots={standing:snap()};
  g.dockCMR(g.cmrs[0].id);g.step(1.1);
  r.draw(g);
  g.selectWorker();if(!g.choose(g.crates[0].id)||!g.order({kind:'floor',x:14,y:3}))throw Error(g.message);
  let gap=0,samples=0;
  for(let i=0;g.task&&i<15000;i++){
    g.step(.05);r.draw(g);samples++;
    const phase=g.transportState, s=g.task?.steps[0];
    for(const c of r.diagnostics().connections)gap=Math.max(gap,c.gapSource);
    const state=r.diagnostics().connections[0]?.state;
    const key=phase==='LIFT'?'lifting':phase==='LOWER'?'lowering':
      s&&s.a.d!==s.b.d?'turning':phase==='INSERT_FORKS'||phase==='WITHDRAW_FORKS'?'reversing':state;
    if(key&&!shots[key])shots[key]=snap();
    if(i===90){const before=JSON.stringify([g.pose,g.task,g.cash]);window.pixelhub.save();window.pixelhub.load();if(JSON.stringify([window.pixelhub.game.pose,window.pixelhub.game.task,window.pixelhub.game.cash])!==before)throw Error('reload mismatch');g=window.pixelhub.game;}
  }
  if(g.task)throw Error('unfinished movement');
  return {shots,workers,samples,gap};
 }""")
 for key,uri in result.pop("shots").items():
  (out/f"worker-{key}.png").write_bytes(base64.b64decode(uri.split(",")[1]))
 assert result["gap"]<=1,result
 assert not errors,errors
 # Inspect every atlas frame through the live asset painter.
 atlas=page.evaluate("""()=>{
  const {renderer:r}=window.pixelhub;
  const c=document.createElement('canvas');c.width=4*224;c.height=8*62;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#dce6dc';ctx.fillRect(0,0,c.width,c.height);
  let frames=0;
  ['idle','walk','pull','push'].forEach((state,column)=>{
    for(let direction=0;direction<8;direction++)for(let frame=0;frame<(state==='idle'?2:4);frame++){
      const tile=document.createElement('canvas');r.preview(tile,'worker/default/'+state,direction,frame);
      const def=r.registry.get('worker/default/'+state);
      const rect=def.frames[def.directions[direction]][frame].rect;
      const source=r.assets.ensure(def).value.image;
      ctx.drawImage(source,rect.x,rect.y,rect.width,rect.height,column*224+frame*54,direction*62,48,48);frames++;
    }
  });
  return {image:c.toDataURL(),frames};
 }""")
 (out/"worker-all-frames.png").write_bytes(base64.b64decode(atlas["image"].split(",")[1]))
 assert atlas["frames"]==112
 page.screenshot(path=out/"warehouse.png")
 print(json.dumps(result))
