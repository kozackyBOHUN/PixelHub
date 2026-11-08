"""Acceptance for installed production sprite PNGs, without mocked image requests."""
import base64,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('PIXELHUB_URL','http://127.0.0.1:5173/').rstrip('/')+'/'
OUT=Path('artifacts/sprites-v1');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL','chrome'),headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1100})
    errors=[];failed=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('response',lambda r:failed.append(r.url) if r.status>=400 and '/assets/' in r.url else None)
    page.goto(BASE+'?test=1');page.wait_for_function('()=>window.pixelhub')
    page.wait_for_function('()=>!!window.pixelhub.renderer.registry.get("worker/default/walk").frames')
    report=page.evaluate('''async()=>{
      const {game:g,renderer:r}=window.pixelhub;g.speed=0;
      await r.assets.installManifest(r.registry);
      await Promise.all(r.registry.all().map(d=>r.assets.ready(d)));
      const resources=r.assets.diagnostics();
      if(resources.length!==65||resources.some(d=>d.status!=='ready')||r.assets.manifestError)throw Error(JSON.stringify(resources));
      const snap=()=>JSON.stringify([g.crates,g.ledger,g.pose,g.task,g.cmrs,g.time,g.status]);
      const before=snap();r.draw(g);if(snap()!==before)throw Error('Renderer changed simulation');
      let frames=0;
      const preview=document.createElement('canvas');
      for(const state of ['idle','walk','push','pull'])for(let d=0;d<8;d++)for(let f=0;f<(state==='idle'?2:4);f++){r.preview(preview,'worker/default/'+state,d,f);frames++;}
      g.accept();g.step(1.2);r.camera.zoom=1;r.draw(g);
      window.productionScene=r.surface.toDataURL();r.camera.zoom=.5;r.draw(g);
      g.selectWorker();if(!g.choose(g.crates[0].id)||!g.order({kind:'floor',x:3,y:5}))throw Error(g.message);
      let gap=0,lift=0,arcs=0,samples=0;const states=new Set(),shots={};
      for(let i=0;g.task&&i<10000;i++){
        g.step(.1);r.draw(g);samples++;
        for(const c of r.diagnostics().connections){gap=Math.max(gap,c.gapSource);states.add(c.state);}
        lift=Math.max(lift,g.forkHeight);
        const s=g.task?.steps[0];const arc=!!g.carried&&s&&s.a.d!==s.b.d;if(arc)arcs++;
        const state=r.diagnostics().connections[0]?.state;
        const label=arc?'loaded-arc':state;
        if(label&&!shots[label]){
          const p=r.camera.worldToScreen({x:g.transportGeometry.head.x+.5,y:g.transportGeometry.head.y+.5});
          const c=document.createElement('canvas');c.width=c.height=480;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
          ctx.drawImage(r.surface,p.x-60,p.y-60,120,120,0,0,480,480);shots[label]=c.toDataURL();
        }
      }
      if(g.task||g.crates[0].loc.kind!=='floor')throw Error('Physical transport unfinished');
      if(gap>1||!arcs||lift<.99)throw Error(JSON.stringify({gap,arcs,lift}));
      g.assertInvariant();window.productionShots=shots;
      return {resources:resources.length,ready:resources.every(d=>d.status==='ready'),workerFrames:frames,states:[...states],samples,loadedArcSamples:arcs,maxHandGapSource:gap,maxLiftSource:lift*3,rendererReadOnly:true};
    }''')
    for name,data in {'game':page.evaluate('()=>window.productionScene'),**page.evaluate('()=>window.productionShots')}.items():
        (OUT/(name+'.png')).write_bytes(base64.b64decode(data.split(',')[1]))
    page.locator('#graphics-panel').evaluate('(d)=>d.open=true')
    page.select_option('#asset-select','demo/vehicle10');page.wait_for_timeout(100)
    page.locator('#asset-preview').screenshot(path=str(OUT/'vehicle10.png'))
    page.select_option('#asset-select','demo/rack');page.wait_for_timeout(100)
    page.locator('#asset-preview').screenshot(path=str(OUT/'rack.png'))
    assert not errors,errors
    assert not failed,failed
    report.update(javascriptErrors=errors,failedAssetRequests=failed)
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report));browser.close()
