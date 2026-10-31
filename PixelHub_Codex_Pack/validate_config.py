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
assert active['map']==m
assert active['economy']['initialCash']==50 and active['economy']['workerWagePerRound']==20
assert active['economy']['wageMode']=='per_completed_round'
assert 'workerWagePerFullGameMinute' not in active['economy']
assert len(c['rounds'])==2 and c['vehicles']['cargoLanes']==2 and c['vehicles']['cargoDepth']==2
print('PASS: precise PixelHub 20x6 geometry, rooms, ramps and MVP configuration')
