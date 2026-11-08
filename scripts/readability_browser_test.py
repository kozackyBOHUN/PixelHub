"""Readability regression: real production PNGs and real built renderer."""
import json,base64,os
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path('artifacts/readability');OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('PIXELHUB_URL','http://127.0.0.1:5173/').rstrip('/')+'/'
with sync_playwright() as p:
    launch={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):
        launch['executable_path']=os.environ['CHROMIUM_PATH']
    else:
        launch['channel']=os.environ.get('BROWSER_CHANNEL','chrome')
    browser=p.chromium.launch(**launch)
    page=browser.new_page(viewport={'width':1600,'height':1100},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'?test=1&graphics=1')
    page.wait_for_function('()=>window.pixelhub')
    report=page.evaluate('''async()=>{
      const {game:g,renderer:r}=window.pixelhub;g.speed=0;r.debug=false;
      await r.assets.installManifest(r.registry);await Promise.all(r.registry.all().map(d=>r.assets.ready(d)));
      const assert=(v,m)=>{if(!v)throw Error(m)};
      assert(r.assets.diagnostics().every(x=>x.status==='ready'),'resource fallback');
      g.round=5;g.startRound();g.pose={x:3,y:4,d:0,mode:'pull'};
      g.crates=[];
      const colors=['red','blue','yellow','green','purple','orange','teal','pink'];
      const add=(id,color,x,y,remaining=0)=>g.crates.push({id,color,destinationColor:color,dispatchRound:5+remaining,dueRound:5+remaining,active:!remaining,paid:false,temperature:'standard',condition:'standard',loc:{kind:'floor',x,y}});
      for(let i=0;i<16;i++)add('ROW-'+i,colors[i%8],2+i,0,1+i%3);
      for(let i=0;i<8;i++)add('AISLE-'+i,colors[i],5+i,2,i%3);
      add('LOWER-LEFT','red',1,5,2);add('LOWER-RIGHT','blue',17,5,1);
      const snapshot=JSON.stringify([g.crates,g.pose,g.time,g.ledger]);
      r.camera.zoom=1;r.draw(g);r.canvas.width=r.surface.width;r.canvas.height=r.surface.height;
      // Read the rendered surface, independent of Pixi's next screen refresh.
      window.readabilityScene=r.surface.toDataURL();
      const commands=r.lastCommands;
      const boxes=commands.filter(c=>c.kind==='asset'&&c.id.endsWith('/box'));
      assert(boxes.every(c=>!c.angle),'tilted box');
      assert(boxes.every(c=>c.assetId!=='cargo/box/gray'),'future pallet loses destination colour');
      const due=commands.filter(c=>c.kind==='badge');assert(due.length>=20,'missing round badges');
      const roomPanels=commands.filter(c=>c.kind==='room');assert(roomPanels.length===4,'missing room partitions');
      assert(!commands.some(c=>c.kind==='asset'&&c.assetId.startsWith('wall/')),'tall wall over usable tiles');
      assert(JSON.stringify([g.crates,g.pose,g.time,g.ledger])===snapshot,'render mutates simulation');
      // Count destination colour pixels and verify the high contrast badge on a real loaded frame.
      const palettes={red:[217,80,80],blue:[57,139,198],yellow:[232,195,67],green:[89,165,106]};
      const coverage={};
      for(const [name,rgb] of Object.entries(palettes)){
        const d=r.registry.get('cargo/box/'+name),entry=await r.assets.ready(d);
        const c=document.createElement('canvas');c.width=c.height=24;const ctx=c.getContext('2d');ctx.drawImage(entry.value.image,0,0);
        const data=ctx.getImageData(0,0,24,24).data;let count=0;
        for(let i=0;i<data.length;i+=4)if(data[i]===rgb[0]&&data[i+1]===rgb[1]&&data[i+2]===rgb[2])count++;
        assert(count>=170,'destination colour is only a small stripe: '+name);coverage[name]=count;
      }
      const badge=commands.find(c=>c.id==='cargo/ROW-0/due'),p=r.camera.worldToScreen(badge.point),ctx=r.surface.getContext('2d');
      const pixel=ctx.getImageData(Math.round(p.x-5),Math.round(p.y-7),1,1).data;
      assert(pixel[0]<80&&pixel[1]<90,'badge has no dark backing');
      window.readabilityDetail=(()=>{const c=document.createElement('canvas');c.width=1060;c.height=400;const cx=c.getContext('2d');cx.imageSmoothingEnabled=false;const p=r.camera.worldToScreen({x:4,y:0});cx.drawImage(r.surface,p.x,p.y,530,200,0,0,1060,400);return c.toDataURL()})();
      return {readyAssets:r.assets.diagnostics().length,boxes:boxes.length,roundBadges:due.length,rooms:roomPanels.length,colourPixels:coverage,allBoxesUpright:true,noTallWallOverStorage:true,simulationUnchanged:true};
    }''')
    for name,key in [('warehouse','readabilityScene'),('detail','readabilityDetail')]:
        data=page.evaluate('key=>window[key]',key);(OUT/(name+'.png')).write_bytes(base64.b64decode(data.split(',')[1]))
    assert not errors,errors
    report.update(status='PASS',javascriptErrors=errors)
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report));browser.close()
