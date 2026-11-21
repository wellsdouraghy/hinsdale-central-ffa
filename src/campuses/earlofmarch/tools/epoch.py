#!/usr/bin/env python3
"""Earl of March: bring an existing campus.json to the imagery epoch of data/extra.py without a new Overpass download
(osm.py applies the same two lists when it runs): drops PORTABLES_GONE, adds / replaces extra.BUILDINGS. Idempotent.
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
json.dump(D, open(P, 'w'), separators=(',', ':'))
print('buildings', n0, '->', len(D['buildings']), '| portables', sum(1 for b in D['buildings'] if b['tags'].get('building') == 'portable_classroom'))
