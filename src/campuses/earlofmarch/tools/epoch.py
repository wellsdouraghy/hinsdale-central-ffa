#!/usr/bin/env python3
"""Earl of March: bring an existing campus.json to the imagery epoch of data/extra.py without a new Overpass download
(osm.py applies the same two lists when it runs): drops PORTABLES_GONE, adds / replaces extra.BUILDINGS, moves the road nodes of ROAD_MOVE. Idempotent.
Usage: python epoch.py
"""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
import extra
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
P = os.path.join(ROOT, 'public/campuses/earlofmarch/campus.json')
D = json.load(open(P)); n0 = len(D['buildings'])
gone = set(extra.PORTABLES_GONE); new = {i for i, _, _ in extra.BUILDINGS}
D['buildings'] = [b for b in D['buildings'] if b['id'] not in gone and b['id'] not in new]
for i, t, r in extra.BUILDINGS: D['buildings'].append(dict(id=i, tags=t, outer=[r], inner=[]))
moved = 0
for r in D['roads']:   # (fix round 2) road nodes moved onto the tiles' centreline: extra.ROAD_MOVE = { way id: [(old, new), ...] } (a moved node no longer matches: idempotent)
    for old, new in getattr(extra, 'ROAD_MOVE', {}).get(r['id'], []):
        for p in r['line']:
            if abs(p[0] - old[0]) < 0.6 and abs(p[1] - old[1]) < 0.6: p[0], p[1] = new[0], new[1]; moved += 1
for r in D['roads']:   # a way whose geometry is replaced outright (extra.ROAD_SET; the first node keeps its exact OSM coordinates)
    if r['id'] in getattr(extra, 'ROAD_SET', {}): n = extra.ROAD_SET[r['id']]; r['line'] = [r['line'][0]] + [list(map(float, q)) for q in n[1:]]
print('road nodes moved', moved)
json.dump(D, open(P, 'w'), separators=(',', ':'))
print('buildings', n0, '->', len(D['buildings']), '| portables', sum(1 for b in D['buildings'] if b['tags'].get('building') == 'portable_classroom'))
