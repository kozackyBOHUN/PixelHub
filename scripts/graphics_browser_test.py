"""Technical graphics acceptance; generated test PNG is a color pattern, not a game asset."""
import json
import os
import struct
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('PIXELHUB_URL','http://127.0.0.1:5173/').rstrip('/')+'/'
OUT=Path('artifacts/graphics-contract');OUT.mkdir(parents=True,exist_ok=True)
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
colors=[(17,77,201,255),(226,145,31,255)]
raw=b''.join(b'\0'+b''.join(bytes(colors[x%2])for x in range(24))for y in range(24))
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',24,24,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
atlas_raw=b''.join(b'\0'+b''.join(bytes((40+(y//25)*20,70+(x//25)*50,155,255))if x%25<24 and y%25<24 else bytes((0,0,0,0))for x in range(49))for y in range(199))
worker_png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',49,199,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(atlas_raw))+chunk(b'IEND',b'')
cargo_raw=b''.join(b'\0'+bytes((192,55,145,255))*24 for _ in range(24))
cargo_png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',24,24,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(cargo_raw))+chunk(b'IEND',b'')
with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    else:options['channel']=os.environ.get('BROWSER_CHANNEL','chrome')
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1440,'height':1100})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/assets/manifest.json',lambda route:route.fulfill(content_type='application/json',body=json.dumps({'version':1,'assets':{'floor/base':{'path':'assets/test/floor.png'}}})))
    page.route('**/assets/test/floor.png',lambda route:route.fulfill(content_type='image/png',body=png))
    page.route('**/assets/workers/default/idle.png',lambda route:route.fulfill(content_type='image/png',body=worker_png))
    page.route('**/assets/cargo/box/red.png',lambda route:route.fulfill(content_type='image/png',body=cargo_png))
    page.goto(BASE+'?test=1')
    page.wait_for_function('''() => window.pixelhub && window.pixelhub.renderer.assets.diagnostics().some(r=>r.id==='floor/base'&&r.status==='ready')''')
    page.wait_for_function("() => window.pixelhub.renderer.assets.diagnostics().some(r=>r.id==='worker/default/idle'&&r.status==='ready')")
    metadata=page.evaluate('''() => {
        const r=window.pixelhub.renderer;
        return {frames:['idle','walk','pull','push'].reduce((sum,state)=>sum+Object.values(r.registry.get('worker/default/'+state).frames).reduce((s,fs)=>s+fs.length,0),0),bodyDirections:r.registry.get('jack/default/body').directions.length,tile:r.camera.tile};
    }''')
    assert metadata=={'frames':112,'bodyDirections':16,'tile':48},metadata
    pixels=page.evaluate('''() => {
        const {game:g,renderer:r}=window.pixelhub;
        const snapshot=()=>JSON.stringify({round:g.round,time:g.time,pose:g.pose,task:g.task,crates:g.crates,ledger:g.ledger,cmrs:g.cmrs,purchased:g.purchased,workers:g.workers.map(w=>({pose:w.pose,task:w.task,carried:w.carried,source:w.source}))});
        const before=snapshot();
        r.camera.setZoom(1.5);r.camera.move(24,-12);
        for(let i=0;i<5;i++)r.draw(g);
        if(snapshot()!==before)throw Error('Renderer modified the simulation');
        const result=[];for(let x=0;x<8;x++){
            const point=r.gridToScreen({x:1+(x+.5)/24,y:.5});
            const pixel=[...r.ctx.getImageData(Math.floor(point.x),Math.floor(point.y),1,1).data];result.push(pixel);
        }
        return result;
    }''')
    assert pixels==[list(colors[x%2])for x in range(8)],pixels
    worker_sample=page.evaluate('''() => {
        const {renderer:r,game:g}=window.pixelhub;r.draw(g);
        const actor=r.scene.connections[0].actor,def=r.registry.get(actor.assetId),origin=r.gridToScreen(actor.point);
        const x=origin.x+(12-def.anchorX)*r.camera.scale,y=origin.y+(12-def.anchorY)*r.camera.scale;
        return {pixel:[...r.ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data],expected:[40+actor.direction*20,70+actor.frame*50,155,255]};
    }''')
    assert worker_sample['pixel']==worker_sample['expected'],worker_sample
    page.evaluate('() => {const g=window.pixelhub.game;g.accept();g.advance(1.2)}')
    page.wait_for_function("() => window.pixelhub.renderer.assets.diagnostics().some(r=>r.id==='cargo/box/red'&&r.status==='ready')")
    cargo_pixel=page.evaluate('''() => {const r=window.pixelhub.renderer;r.draw(window.pixelhub.game);const p=r.gridToScreen({x:-.5,y:2.5});return [...r.ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data]}''')
    assert cargo_pixel==[192,55,145,255],cargo_pixel
    page.get_by_role('button',name='Diagnostyka · G',exact=True).click()
    page.locator('#graphics-panel summary').click()
    page.select_option('#asset-select','worker/default/push')
    page.locator('#asset-direction').fill('7')
    page.locator('#asset-frame').fill('3')
    page.wait_for_timeout(100)
    page.locator('#asset-preview').screenshot(path=str(OUT/'worker-NW-push.png'))
    page.select_option('#asset-select','demo/rack');page.wait_for_timeout(100)
    page.locator('#asset-preview').screenshot(path=str(OUT/'modular-rack.png'))
    page.select_option('#asset-select','demo/vehicle10');page.wait_for_timeout(100)
    page.locator('#asset-preview').screenshot(path=str(OUT/'vehicle-10.png'))
    gaps=page.evaluate('() => window.pixelhub.renderer.diagnostics().connections.map(c=>c.gapSource)')
    assert max(gaps)<=1,gaps
    # Scroll/middle-drag and zoom are view changes; no worker task has been created.
    assert page.evaluate('() => !window.pixelhub.game.task && window.pixelhub.game.cash===50')
    page.screenshot(path=str(OUT/'diagnostics.png'),full_page=True)
    assert not errors,errors
    result={'metadata':metadata,'real_png_replacement':True,'truck_cargo_pixel':cargo_pixel,'directional_png_atlas':worker_sample,'nearest_pixels':pixels,'max_hand_gap_source':max(gaps),'renderer_read_only':True,'javascript_errors':errors}
    (OUT/'results.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    browser.close()
print('PixelHub graphics contract: PNG replacement, exact scale, sockets, camera, modules and diagnostics passed.')

