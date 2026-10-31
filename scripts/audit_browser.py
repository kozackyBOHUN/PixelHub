"""Optional independent UI/renderer audit against an already running Vite server.

PIXELHUB_URL=http://127.0.0.1:5173/ python scripts/audit_browser.py
CHROMIUM_PATH and PIXELHUB_AUDIT_OUTPUT may override the defaults.
Simulation data is never assigned. Time advances through Game.advance; wrappers
record draw/step durations and exact crate draw angles. Performance uses a real
five-second x4 interval, with CDP CPU/heap and forced-GC follow-up observations.
Use an isolated source snapshot if other processes are editing source (Vite HMR
would invalidate the sampling globals). These are diagnostic measurements, not
hardware-independent performance thresholds.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, os, base64, time

out = Path(os.environ.get('PIXELHUB_AUDIT_OUTPUT', 'artifacts/audit'))
out.mkdir(parents=True, exist_ok=True)
report = {}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    errors, consoles, failed, http_errors = [], [], [], []
    page.on('pageerror',lambda x:errors.append(str(x)))
    page.on('console',lambda x:consoles.append({'type':x.type,'text':x.text,'location':x.location}) if x.type in ['error','warning'] else None)
    page.on('requestfailed',lambda x:failed.append({'url':x.url,'error':x.failure}))
    page.on('response',lambda x:http_errors.append({'url':x.url,'status':x.status}) if x.status>=400 else None)
    def load():
        page.goto(os.environ.get('PIXELHUB_URL','http://127.0.0.1:5173/')+'?test=1')
        page.wait_for_function('window.pixelhub && document.querySelector("#message").textContent.length')
    def cell(x,y):
        box=page.locator('canvas').bounding_box()
        page.mouse.click(box['x']+(210+(x+.5)*49)/1400*box['width'],box['y']+(205+(y+.5)*49)/650*box['height'])
    def worker():
        q=page.evaluate('pixelhub.game.transportGeometry.head'); cell(q['x'],q['y'])
    def finish():
        page.evaluate('''()=>{const g=pixelhub.game;let n=0;while(g.task&&n++<5000){g.advance(.05);g.assertInvariant()}if(g.task||g.status==='lost')throw Error('Task did not finish: '+g.message)}''')
    def move(crate_id,x,y):
        loc=page.evaluate('(id)=>pixelhub.game.crates.find(c=>c.id===id).loc',crate_id)
        worker()
        if loc['kind']=='floor':cell(loc['x'],loc['y'])
        else:cell(-1-loc['depth'] if loc['kind']=='inbound' else 20+loc['depth'],2+loc['lane'])
        cell(x,y)
        assert page.evaluate('!!pixelhub.game.task'),page.evaluate('pixelhub.game.message')
        finish()
    def snap(name):
        page.screenshot(path=str(out/(name+'.png')),full_page=True)
    def metrics():
        return {x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
    def instrument_crates():
        page.evaluate('''()=>{const r=pixelhub.renderer,crate=r.crate,rect=r.rect;window.crateAngles=[];window.drawEvents=[];r.crate=function(c,p,a=0,h=0){drawEvents.push('crate:'+c.id);crateAngles.push({id:c.id,angle:a,height:h,loc:{...c.loc}});return crate.call(this,c,p,a,h)};r.rect=function(x,y,w,h,col){if(x===-17&&y===-12&&w===32&&h===7&&col==='#dcb557')drawEvents.push('pallet');return rect.call(this,x,y,w,h,col)}}''')
    def phase_boundary(phase, name, crate_id):
        state=page.evaluate('''({phase,id})=>{const g=pixelhub.game,r=pixelhub.renderer;let n=0;while(g.task&&g.task.phase!==phase&&n++<5000)g.advance(.05);if(g.task?.phase!==phase)throw Error(phase+' not reached');while(g.task.phase===phase&&g.task.elapsed+.051<g.task.steps[0].duration)g.advance(.05);window.crateAngles=[];window.drawEvents=[];r.draw(g);const before={phase:g.task.phase,elapsed:g.task.elapsed,duration:g.task.steps[0].duration,heading:g.transportGeometry.heading,crate:crateAngles.find(c=>c.id===id),drawOrder:[...drawEvents],png:r.surface.toDataURL()};g.advance(.1);window.crateAngles=[];window.drawEvents=[];r.draw(g);return {before,after:{phase:g.task?.phase,crate:crateAngles.find(c=>c.id===id),drawOrder:[...drawEvents],png:r.surface.toDataURL()}}}''',{'phase':phase,'id':crate_id})
        for k in ['before','after']:
            (out/(name+'-'+k+'.png')).write_bytes(base64.b64decode(state[k].pop('png').split(',')[1]))
            order=state[k]['drawOrder']
            assert order.index('pallet')<order.index('crate:'+crate_id),state
        from math import sin, cos, atan2
        delta=state['after']['crate']['angle']-state['before']['crate']['angle']
        assert abs(atan2(sin(delta),cos(delta)))<1e-8, state
        return state
    load()
    report['browser'] = browser.version
    report['renderer'] = page.evaluate('''()=>{const a=document.createElement('canvas');const g=a.getContext('webgl2'); const e=g.getExtension('WEBGL_debug_renderer_info'); return {vendor:g.getParameter(e.UNMASKED_VENDOR_WEBGL),renderer:g.getParameter(e.UNMASKED_RENDERER_WEBGL)}}''')
    snap('desktop-initial')
    page.locator('#cmr').click(); page.wait_for_timeout(1100)
    worker(); cell(-2,2)
    report['blocked_source'] = page.evaluate('({source:pixelhub.game.source,highlight:pixelhub.game.highlight,message:pixelhub.game.message})')
    assert report['blocked_source']['source'] is None
    assert report['blocked_source']['highlight']=='1-0-0'
    page.keyboard.press('Escape')
    report['escape_selection'] = page.evaluate('({selected:pixelhub.game.selected,source:pixelhub.game.source,task:!!pixelhub.game.task})')
    assert report['escape_selection']=={'selected':False,'source':None,'task':False}
    worker(); cell(-1,2); cell(7,4)
    report['invalid_room'] = page.evaluate('({source:pixelhub.game.source,task:!!pixelhub.game.task,message:pixelhub.game.message})')
    assert not report['invalid_room']['task']
    page.set_viewport_size({'width':390,'height':844})
    report['mobile'] = page.evaluate('({viewport:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector("canvas").getBoundingClientRect().toJSON()})')
    assert report['mobile']['scroll']==report['mobile']['viewport']
    snap('mobile-source-selected')
    page.locator('#cancel').click()
    worker(); cell(-1,2)
    report['mobile_hit_source']=page.evaluate('pixelhub.game.source')
    assert report['mobile_hit_source']=='1-0-0'
    # Instrument real draw calls without changing model data.
    instrument_crates()
    cell(3,5)
    assert page.evaluate('!!pixelhub.game.task')
    # Exact before/after samples are read in one JS turn, avoiding rAF races.
    report['insert_forks_layering']=phase_boundary('INSERT_FORKS','insert','1-0-0')
    report['initial_lift_orientation']=phase_boundary('LIFT','lift','1-0-0')
    report['lower_orientation']=phase_boundary('LOWER','lower','1-0-0')
    page.evaluate('''()=>{const g=pixelhub.game;let n=0;while(g.task&&n++<5000)g.advance(.05);g.assertInvariant()}''')
    # Start another genuine mouse task and cancel while loaded.
    worker(); cell(-2,2); cell(2,5)
    assert page.evaluate('!!pixelhub.game.task')
    page.evaluate('''()=>{const g=pixelhub.game;let n=0;while(g.task&&!g.carried&&n++<5000)g.advance(.05);g.advance(.1);g.assertInvariant()}''')
    page.keyboard.press('Escape')
    report['cancel_loaded']=page.evaluate('''()=>{const g=pixelhub.game;let n=0;while(g.task&&n++<5000)g.advance(.05);g.assertInvariant();return {carried:g.carried,selected:g.selected,task:!!g.task,message:g.message,crates:g.crates.map(c=>({id:c.id,loc:c.loc}))}}''')
    assert report['cancel_loaded']['carried']=='1-0-1'
    assert report['cancel_loaded']['selected'] and not report['cancel_loaded']['task']
    snap('mobile-cancel-loaded')
    cell(2,5)
    report['cancel_reorder']=page.evaluate('({task:!!pixelhub.game.task,dest:pixelhub.game.task?.dest})')
    assert report['cancel_reorder']['task']
    # In a separate run, put down a rotated crate, then lift it from the floor.
    load();page.locator('#cmr').click();page.wait_for_timeout(1100)
    instrument_crates()
    worker();cell(-1,2);cell(3,5)
    page.evaluate('''()=>{const g=pixelhub.game;let n=0;while(g.task&&n++<5000)g.advance(.05);g.assertInvariant()}''')
    worker();cell(3,5);cell(2,3)
    assert page.evaluate('!!pixelhub.game.task'), page.evaluate('pixelhub.game.message')
    report['floor_lift_orientation']=phase_boundary('LIFT','floor-lift','1-0-0')
    # Cancel twice while recovering inserted forks, using actual Escape events.
    load();page.locator('#cmr').click();page.wait_for_timeout(1100)
    worker();cell(-1,2);cell(2,3)
    page.evaluate('''()=>{const g=pixelhub.game;let n=0;while(g.task?.phase!=='LIFT'&&n++<5000)g.advance(.05);if(g.task?.phase!=='LIFT')throw Error('No lift');g.advance(.2)}''')
    page.keyboard.press('Escape')
    page.evaluate('''()=>{const g=pixelhub.game;let n=0;while(!(g.task?.recovery&&g.task.phase==='WITHDRAW_FORKS')&&n++<5000){g.advance(.05);g.assertInvariant()}if(!g.task?.recovery)throw Error('No withdrawal recovery');g.advance(.2)}''')
    page.keyboard.press('Escape');finish()
    report['repeated_recovery_cancel']=page.evaluate('''()=>{const g=pixelhub.game,q=g.transportGeometry;return {task:!!g.task,carried:g.carried,selected:g.selected,location:g.crates.find(c=>c.id==='1-0-0').loc,finite:[q.head.x,q.head.y,q.back.x,q.back.y].every(Number.isFinite),unloadRewards:g.ledger.filter(e=>e.label==='Rozładunek').length}}''')
    assert report['repeated_recovery_cancel']=={'task':False,'carried':None,'selected':False,'location':{'kind':'inbound','lane':0,'depth':0},'finite':True,'unloadRewards':0}
    # Reach round2 with mouse orders, select loaded cargo, then dispatch it.
    load();page.locator('#cmr').click();page.wait_for_timeout(1100)
    for crate_id,(x,y) in zip(['1-0-0','1-0-1','1-1-0','1-1-1'],[(3,5),(2,5),(3,4),(2,4)]):move(crate_id,x,y)
    page.evaluate('pixelhub.game.advance(1.1)')
    page.wait_for_function('document.querySelector("#end").open')
    page.locator('#continue').click()
    move('1-1-0',21,2)
    worker();cell(21,2)
    assert page.evaluate('pixelhub.game.source')=='1-1-0'
    page.locator('#dispatch').click();cell(2,3)
    report['selected_source_dispatch']=page.evaluate('''()=>{const g=pixelhub.game;g.assertInvariant();return {source:g.source,task:!!g.task,carried:g.carried,loc:g.crates.find(c=>c.id==='1-1-0').loc,outbound:g.outbound}}''')
    assert report['selected_source_dispatch']=={'source':None,'task':False,'carried':None,'loc':{'kind':'delivery'},'outbound':'delivering'}
    page.evaluate('pixelhub.game.advance(30)')
    report['selected_source_delivered']=page.evaluate('''()=>{const g=pixelhub.game;g.assertInvariant();return {loc:g.crates.find(c=>c.id==='1-1-0').loc,deliveryRewards:g.ledger.filter(e=>e.label==='Dostawa').length}}''')
    assert report['selected_source_delivered']=={'loc':{'kind':'delivered'},'deliveryRewards':1}
    # New run, no model mutation; real x4 movement and timing, frame/CPU/memory instrumentation.
    load(); page.set_viewport_size({'width':1440,'height':1000})
    page.locator('#cmr').click(); page.wait_for_timeout(1100)
    page.locator('[data-speed="4"]').click()
    cdp=page.context.new_cdp_session(page); cdp.send('Performance.enable')
    page.evaluate('''()=>{window.samples={frames:[],draw:[],advance:[],long:[]};let last=performance.now();const cb=(t)=>{samples.frames.push(t-last);last=t;requestAnimationFrame(cb)};requestAnimationFrame(cb); const r=pixelhub.renderer,draw=r.draw;r.draw=function(g){const t=performance.now();try{return draw.call(this,g)}finally{samples.draw.push(performance.now()-t)}};const g=pixelhub.game, advance=g.advance;g.advance=function(s){const t=performance.now();try{return advance.call(this,s)}finally{samples.advance.push(performance.now()-t)}};new PerformanceObserver(l=>samples.long.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:false})}''')
    worker()
    before=metrics(); wall=time.perf_counter(); cell(-1,2); source_ms=(time.perf_counter()-wall)*1000
    wall=time.perf_counter(); cell(3,5); order_ms=(time.perf_counter()-wall)*1000
    report['planning']={'chooseMouseWallMs':source_ms,'orderMouseWallMs':order_ms,'cpuMetricDelta':{k:metrics().get(k,0)-before.get(k,0) for k in ['TaskDuration','ScriptDuration']}}
    page.evaluate('samples.frames=[];samples.draw=[];samples.advance=[]')
    m0=metrics(); gt=page.evaluate('pixelhub.game.time'); t0=time.perf_counter()
    page.wait_for_timeout(5000)
    m1=metrics(); real=time.perf_counter()-t0; gt1=page.evaluate('pixelhub.game.time')
    stats=page.evaluate('''()=>{const summarize=a=>{const b=[...a].sort((x,y)=>x-y);return {count:b.length,mean:b.reduce((s,x)=>s+x,0)/b.length,p50:b[Math.floor(b.length*.5)],p95:b[Math.floor(b.length*.95)],max:b.at(-1)}};return {frames:summarize(samples.frames),draw:summarize(samples.draw),advance:summarize(samples.advance),long:samples.long,task:pixelhub.game.task?.phase}}''')
    report['x4_5second_sample']={**stats,'wallSeconds':real,'gameSeconds':gt1-gt,'ratio':(gt1-gt)/real,'cpuTaskSeconds':m1['TaskDuration']-m0['TaskDuration'],'cpuScriptSeconds':m1['ScriptDuration']-m0['ScriptDuration'],'heapStart':m0['JSHeapUsedSize'],'heapEnd':m1['JSHeapUsedSize'],'domNodesStart':m0['Nodes'],'domNodesEnd':m1['Nodes']}
    cdp.send('HeapProfiler.enable');cdp.send('HeapProfiler.collectGarbage')
    m2=metrics()
    page.wait_for_timeout(3000)
    cdp.send('HeapProfiler.collectGarbage')
    m3=metrics()
    report['post_gc_memory']={'heapFirst':m2['JSHeapUsedSize'],'heapAfter3MoreSeconds':m3['JSHeapUsedSize'],'nodesFirst':m2['Nodes'],'nodesAfter3MoreSeconds':m3['Nodes']}
    snap('desktop-x4-moving')
    report['console']=consoles;report['exceptions']=errors;report['failedRequests']=failed;report['httpErrors']=http_errors
    (out/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
    print(json.dumps(report,ensure_ascii=False))
    assert not errors, errors
    assert not [e for e in consoles if e['type']=='error'],consoles
    browser.close()
