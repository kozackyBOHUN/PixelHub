#!/usr/bin/env python3
"""PixelHub map/config invariant checker; run with python validate_config.py"""
import json
from pathlib import Path
c=json.loads((Path(__file__).parent/'game-config.json').read_text(encoding='utf8'))
m=c['map'];assert (m['columns'],m['rows'])==(20,6)
rooms=set();ramp=set();parts={}
for r in m['rooms']:
 cells={(x,y) for x in range(r['x'],r['x']+r['width']) for y in range(r['y'],r['y']+r['height'])}
 assert len(cells)==r['width']*r['height'] and not (rooms&cells)
 assert all(0<=x<20 and 0<=y<6 for x,y in cells)
 rooms|=cells;parts[r['id']]=cells
for r in m['docks']:
 cells={(x,y) for x in range(r['x'],r['x']+r['width']) for y in range(r['y'],r['y']+r['height'])}
 assert len(cells)==4 and not (rooms&cells) and not (ramp&cells)
 ramp|=cells
assert len(rooms)==36 and len(ramp)==8 and 120-len(rooms|ramp)==76
assert any(abs(x1-x2)+abs(y1-y2)==1 for x1,y1 in parts['canteen'] for x2,y2 in parts['locker'])
# Archived pack describes the original MVP. Check current runtime economics separately.
active=json.loads((Path(__file__).parent.parent/'src'/'game-config.json').read_text(encoding='utf8'))
assert (active['map']['columns'],active['map']['rows'])==(20,6)
assert {r['id']:(r['x'],r['y'],r['width'],r['height']) for r in active['map']['rooms']} == {
 'office':(4,3,4,3),'locker':(8,3,3,3),'toilet':(11,3,2,3),'canteen':(13,3,3,3)}
assert active['map']['docks']==m['docks']
campaign=json.loads((Path(__file__).parent.parent/'src'/'campaign-data.json').read_text(encoding='utf8'))
assert [r['number'] for r in campaign]==list(range(1,31))
assert sum(len(r['pallets']) for r in campaign)==696
assert sum(len(m['palletIds']) for r in campaign for m in r['departures'])==696
assert campaign[-1]['expectedStock']==0
assert active['economy']['initialCash']==50 and active['economy']['workerWagePerRound']==20
assert active['economy']['wageMode']=='per_completed_round'
assert 'workerWagePerFullGameMinute' not in active['economy']
assert len(c['rounds'])==2 and c['vehicles']['cargoLanes']==2 and c['vehicles']['cargoDepth']==2
print('PASS: archived MVP reference and approved PixelHub 0.2 geometry/economy/30-round campaign')
