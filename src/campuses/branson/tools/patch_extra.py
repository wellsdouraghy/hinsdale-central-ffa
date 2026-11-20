#!/usr/bin/env python3
"""Applies tools/data/extra.py to the baked data WITHOUT re-running the whole pipeline (osm.py -> gen.py -> terrain.py):
adds hand-digitised buildings that are not yet in campus.json / gen.json (heights from the tile grid over the terrain,
as terrain.py measures them), replaces the hand-digitised areas (the pitch), drops scanned trees inside new footprints
and updates gen.play. Idempotent. Run after editing extra.py; run tools/ground_fix.py afterwards.
Usage: python patch_extra.py"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, 'data')); import extra
OUT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', 'public/campuses/branson'))
PLAY = dict(minX=-215, maxX=82, minZ=-100, maxZ=184)
D = json.load(open(os.path.join(OUT, 'campus.json'))); G = json.load(open(os.path.join(OUT, 'gen.json')))
H = np.fromfile(os.path.join(OUT, 'terrain.bin'), '<i2').reshape(301, 331) * 0.01
TH = json.load(open(os.path.join(HERE, 'data', 'tile_heights.json')))['fine']
def ground(x, z): return float(H[int(round((z + 300) / 2)), int(round((x + 330) / 2))])
def tile(x, z):
    v = TH['rows'][int(round((z - TH['z0']) / TH['step']))][int(round((x - TH['x0']) / TH['step']))]; return None if v is None else v + 16.28
def inside(x, z, r):
    c = False
    for i in range(len(r)):
        a, b = r[i], r[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]: c = not c
    return c
ids = {b['id'] for b in D['buildings']}
for i, t, r in extra.BUILDINGS:
    if i in ids: continue
    D['buildings'].append(dict(id=i, tags=t, outer=[r], inner=[]))
    xs = [p[0] for p in r]; zs = [p[1] for p in r]
    roof = [tile(x, z) for x in np.arange(min(xs), max(xs), 2) for z in np.arange(min(zs), max(zs), 2) if inside(x, z, r)]; roof = [v for v in roof if v is not None]
    gs = [ground(p[0], p[1]) for p in r]; top = float(np.median(roof)); area = abs(sum(r[k - 1][0] * r[k][1] - r[k][0] * r[k - 1][1] for k in range(len(r)))) / 2
    G['buildings'][str(i)] = dict(h=round(top - max(gs), 1), roof='flat', rise=0.0, col=[200, 200, 196], area=round(area), play=True, g=[round(min(gs), 2), round(max(gs), 2), round(float(np.mean(gs)), 2)], top=round(top, 2), hd=round(top - min(gs), 1), lv=2)
    n0 = len(G['trees']); G['trees'] = [tr for tr in G['trees'] if not any(inside(tr[0] + dx, tr[1] + dz, r) for dx, dz in ((0, 0), (3, 0), (-3, 0), (0, 3), (0, -3)))]
    print('added', i, t['name'], G['buildings'][str(i)], 'trees dropped', n0 - len(G['trees']))
for i, t, r in extra.AREAS:
    for a in D['areas']:
        if a['id'] == i and a['outer'] != [r]: a['outer'] = [r]; print('area', i, t.get('name'), 'updated')
G['play'] = PLAY
for b in D['buildings']:
    v = G['buildings'].get(str(b['id']))
    if v is not None:
        r = b['outer'][0]; cx = sum(p[0] for p in r) / len(r); cz = sum(p[1] for p in r) / len(r)
        v['play'] = bool(PLAY['minX'] - 6 < cx < PLAY['maxX'] + 6 and PLAY['minZ'] - 6 < cz < PLAY['maxZ'] + 6) or bool(v.get('play'))
json.dump(D, open(os.path.join(OUT, 'campus.json'), 'w'), separators=(',', ':')); json.dump(G, open(os.path.join(OUT, 'gen.json'), 'w'), separators=(',', ':'))
