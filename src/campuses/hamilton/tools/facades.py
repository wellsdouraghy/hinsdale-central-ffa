#!/usr/bin/env python3
"""Alexander Hamilton High School: per-building facade attributes for the blocks around the school.
Reads tools/data/facades_src.json (what Street View shows for each building, typed in by hand after
tools/streetview.py) + campus.json + gen.json, writes src/campuses/hamilton/facades.json, which town.js imports:
storeys, wall material and colour, roof type and colour, kind (house / apt / shop / garage ...), fences, trees, signs.
Heights: gen.json measures every building against the ground around its own footprint (3D tiles); the Street View
storey count and the LA County height tag in OSM are cross-checked here and the storey count wins when they disagree.
"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..')); PUB = os.path.join(ROOT, 'public/campuses/hamilton')
WALL = {'s': 'stucco', 'w': 'siding', 'b': 'brick', 'c': 'block'}
COL = dict(white=[226, 222, 212], cream=[224, 211, 180], beige=[210, 194, 162], tan=[194, 170, 132], sand=[206, 182, 138], peach=[224, 188, 156], pink=[220, 178, 170], salmon=[206, 146, 118], yellow=[226, 198, 122],
           grey=[166, 166, 160], ltgrey=[198, 198, 192], dkgrey=[110, 112, 114], charcoal=[66, 66, 68], blue=[86, 114, 152], ltblue=[150, 176, 194], navy=[56, 68, 92], bluegrey=[112, 128, 142], teal=[72, 140, 138],
           green=[40, 120, 70], olive=[140, 136, 88], brown=[124, 94, 70], terracotta=[186, 98, 72], red=[168, 62, 52], taupe=[152, 140, 124], ivy=[74, 106, 58], orange=[214, 120, 40], brick=[168, 92, 70])
ROOF = dict(grey=[118, 118, 116], dkgrey=[80, 82, 86], brown=[112, 90, 72], tan=[150, 130, 104], ltgrey=[158, 158, 154], clay=[178, 94, 62], white=[205, 203, 196])
STREETS = ('secondary', 'tertiary', 'residential')

def area(r): return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
def centroid(r): return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)
def nearest(roads, x, z):
    best = None
    for r in roads:
        L = r['line']
        for i in range(len(L) - 1):
            ax, az = L[i]; bx, bz = L[i + 1]; dx, dz = bx - ax, bz - az; d2 = dx * dx + dz * dz or 1e-9
            t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / d2)); px, pz = ax + dx * t, az + dz * t; d = math.hypot(x - px, z - pz)
            if best is None or d < best[0]: best = (d, px, pz, r['tags'].get('highway'))
    return best

def parse(s):
    head, _, tail = s.partition('|'); st, wall, col, roof, rcol = head.split(); f = {}
    for tok in [t.strip() for t in tail.split(',') if t.strip()]:
        k, _, v = tok.partition('='); f[k] = v or True
    return int(st), wall, col, roof, rcol, f

def main():
    D = json.load(open(os.path.join(PUB, 'campus.json'))); G = json.load(open(os.path.join(PUB, 'gen.json')))
    S = json.load(open(os.path.join(HERE, 'data', 'facades_src.json')))['buildings']
    roads = [r for r in D['roads'] if r['tags'].get('highway') in STREETS and r['tags'].get('name')]
    by = {str(b['id']): b for b in D['buildings']}; out = {}; mism = []
    def base(k):
        b = by[k]; g = G['buildings'][k]; ring = b['outer'][0]; cx, cz = centroid(ring); d, px, pz, hw = nearest(roads, cx, cz)
        L = math.hypot(px - cx, pz - cz) or 1
        osm_h = b['tags'].get('height'); osm_h = float(osm_h) if osm_h and osm_h.replace('.', '').isdigit() else None
        lv = b['tags'].get('building:levels')
        return b, g, dict(front=[round((px - cx) / L, 3), round((pz - cz) / L, 3)], roadDist=round(d, 1), roadClass=hw, hGen=g['h'], hOsm=osm_h, **({'levelsOsm': lv} if lv else {}))
    for k, s in S.items():
        if 'read' not in s: continue
        b, g, e = base(k); st, wall, col, roof, rcol, f = parse(s['read']); kind = f.pop('k', None) or ('garage' if g['area'] < 60 else 'house')
        pitched = roof in ('hip', 'gable', 'tile')
        if kind == 'parking': h = e['hOsm'] or g['h']
        elif pitched:                                                                                     # eave height
            h = 2.6 if kind == 'garage' else st * 2.9 + (0.1 if st == 1 else 0)
            if e['hOsm'] and st > 1 and h > e['hOsm'] - 0.6: h = max(2.9, e['hOsm'] - 1.0)
        else:
            ref = g['h'] if g['roof'] == 'flat' else (e['hOsm'] or g['h']); want = st * 3.05 + 0.5
            h = ref if abs(ref - want) <= 1.7 or (e['hOsm'] and abs(e['hOsm'] - g['h']) <= 1.2) else want
            if kind in ('shop', 'gas') and st == 1: h = max(4.2, min(h + 0.5, 5.4))
        # cross-check: storeys implied by the measured heights vs Street View
        st_gen = max(1, round((g['h'] - (0.3 if g['roof'] == 'flat' else 0)) / 3.0)); st_osm = max(1, round(((e['hOsm'] or 0) - (0.5 if not pitched else 1.6)) / 3.0)) if e['hOsm'] else None
        if st_gen != st and kind not in ('parking', 'shop', 'gas'): mism.append((k, st, st_gen, st_osm, g['h'], e['hOsm']))
        e.update(src='streetview' if 'hidden' not in f and 'blurred' not in f else 'streetview-hidden', pano=s.get('date'), kind=kind, st=st, wall=WALL[wall], col=COL[col], colName=col, roof='hip' if roof == 'tile' and False else roof,
                 roofCol=ROOF[rcol], h=round(h, 1), stGen=st_gen, **({'stOsm': st_osm} if st_osm else {}))
        for key in ('accent', 'base', 'awning'):
            if isinstance(f.get(key), str): e[key] = COL.get(f[key], COL['white']); f.pop(key)
        if 'fence' in f: e['fence'] = f.pop('fence')
        if 'sign' in f: e['sign'] = f.pop('sign')
        e['trees'] = [t for t in ('palm', 'cypress', 'jacaranda') if f.pop(t, None)]
        e['feat'] = sorted(x for x in f if x not in ('hidden', 'blurred'))
        out[k] = e
    for k, s in S.items():
        if 'read' in s: continue
        b, g, e = base(k); p = out.get(s.get('parent') or '')
        small = g['area'] < 75; pitched = g['roof'] != 'flat'
        if p: e.update(src='parcel', parent=s['parent'], wall=p['wall'], col=p['col'], colName=p['colName'], roofCol=p['roofCol'] if p['roof'] != 'flat' else ROOF['grey'])
        else: e.update(src='none', wall='stucco', col=COL['cream'], colName='cream', roofCol=ROOF['grey'])
        st = 1 if small else max(1, min(3, round(g['h'] / 3.0)))
        e.update(kind='garage' if small else (p['kind'] if p and p['kind'] in ('apt', 'house') else 'house'), st=st, roof=('gable' if small else 'hip') if pitched else 'flat', h=round((2.6 if small else st * 2.9) if pitched else max(2.7, min(g['h'], st * 3.05 + 0.9)), 1), stGen=st, trees=[], feat=[])
        out[k] = e
    json.dump({'_about': 'Per-building facade attributes from Street View (see src/campuses/hamilton/tools/facades.py). Colours are sRGB 0-255.', 'buildings': out}, open(os.path.join(HERE, '..', 'facades.json'), 'w'), separators=(',', ':'))
    import collections
    print('buildings', len(out), 'from street view', sum(1 for v in out.values() if v['src'].startswith('streetview')), 'hidden', sum(1 for v in out.values() if v['src'] == 'streetview-hidden'), 'from parcel', sum(1 for v in out.values() if v['src'] == 'parcel'))
    print('roof', dict(collections.Counter(v['roof'] for v in out.values())), 'kind', dict(collections.Counter(v['kind'] for v in out.values())), 'wall', dict(collections.Counter(v['wall'] for v in out.values())))
    print('roof kind changed vs gen:', sum(1 for k, v in out.items() if (v['roof'] == 'flat') != (G['buildings'][k]['roof'] == 'flat')))
    print('storeys: street view vs measured height disagree for', len(mism), ':', ' '.join('%s sv%d gen%d osm%s (h %.1f/%s)' % m for m in mism))

if __name__ == '__main__': main()
