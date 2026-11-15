#!/usr/bin/env python3
"""Alexander Hamilton High School: Street View reference pass for the buildings around the school.

For every OSM building in the play area that is not part of the school, pick the view a pedestrian has of it from
the nearest named street (Street View Static API), cache the image under tools/data/streetview/ (gitignored: the
imagery may not be redistributed) and write tools/data/streetview/index.json (pano id, date, heading, fov per building).
The images are then read by a person / agent and the result is typed into tools/data/facades_src.json, which
facades.py turns into public/campuses/hamilton/facades.json (per-building attributes consumed by town.js).

  python streetview.py plan      -> index.json with the planned views (free metadata requests only)
  python streetview.py fetch     -> downloads the images that are not cached yet (paid requests; prints the count)
  python streetview.py extra ID HEADING_OFFSET [FOV]   -> one more view of a building (second facade)

The key is read from .env.local (VITE_GOOGLE_TILES_KEY) and never printed; it is website-restricted, so every request
sends `Referer: http://localhost:5173/`.
"""
import json, math, os, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
PUB = os.path.join(ROOT, 'public/campuses/hamilton')
OUT = os.path.join(HERE, 'data', 'streetview')
ORIGIN = (34.03416, -118.39164)
phi = math.radians(ORIGIN[0])
M_LAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
SCHOOL = set(424940000 + n for n in [958, 984, 993, 995, 997, 1010, 1016, 1017, 1028, 1030, 1035, 1041, 1047, 1052, 1064, 1065, 1072, 1076, 1082, 1086, 1087, 1102, 1103, 1125, 1127])
STREETS = ('secondary', 'tertiary', 'residential')


def key():
    for line in open(os.path.join(ROOT, '.env.local')):
        if line.startswith('VITE_GOOGLE_TILES_KEY='): return line.split('=', 1)[1].strip().strip('"')
    raise SystemExit('no key in .env.local')


def ll(x, z): return ORIGIN[0] - z / M_LAT, ORIGIN[1] + x / M_LON
def xz(lat, lon): return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT


def get(url, binary=False):
    req = urllib.request.Request(url, headers={'Referer': 'http://localhost:5173/', 'User-Agent': 'campus-map-builder/1.0'})
    raw = urllib.request.urlopen(req, timeout=40).read()
    return raw if binary else json.loads(raw)


def area(r): return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
def centroid(r): return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)


def nearest_on_roads(roads, x, z):
    best = None
    for r in roads:
        L = r['line']
        for i in range(len(L) - 1):
            ax, az = L[i]; bx, bz = L[i + 1]; dx, dz = bx - ax, bz - az; d2 = dx * dx + dz * dz or 1e-9
            t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / d2)); px, pz = ax + dx * t, az + dz * t; d = math.hypot(x - px, z - pz)
            if best is None or d < best[0]: best = (d, px, pz, r['tags'].get('name', ''))
    return best


def mains():
    D = json.load(open(os.path.join(PUB, 'campus.json'))); G = json.load(open(os.path.join(PUB, 'gen.json')))
    roads = [r for r in D['roads'] if r['tags'].get('highway') in STREETS and r['tags'].get('name')]
    play = [b for b in D['buildings'] if G['buildings'].get(str(b['id']), {}).get('play') and b['id'] not in SCHOOL and len(b['outer'][0]) >= 3 and area(b['outer'][0]) >= 14]
    parcels = {}
    for b in play:
        ain = b['tags'].get('lacounty:ain', 'id%d' % b['id']).split(';')[0]; parcels.setdefault(ain, []).append(b)
    out = []
    for ain, bs in parcels.items():
        bs.sort(key=lambda b: -area(b['outer'][0]))
        for k, b in enumerate(bs):
            a = area(b['outer'][0]); cx, cz = centroid(b['outer'][0]); d, px, pz, street = nearest_on_roads(roads, cx, cz)
            # the view: the building on its parcel that a pedestrian sees (largest one, or a big one near the street)
            main = k == 0 or (a >= 90 and d < 32)
            out.append(dict(id=b['id'], ain=ain, main=main, parent=bs[0]['id'], area=round(a), c=[round(cx, 1), round(cz, 1)], street=street, road=[round(px, 1), round(pz, 1)], dist=round(d, 1),
                            osm_h=b['tags'].get('height'), levels=b['tags'].get('building:levels'), kind=b['tags'].get('building'), units=b['tags'].get('building:units'), year=b['tags'].get('start_date'), name=b['tags'].get('name'),
                            gen=G['buildings'][str(b['id'])], ring=b['outer'][0]))
    return out


def view_for(b, pano_xz):
    """heading / fov / pitch that frame the footprint from the panorama position"""
    px, pz = pano_xz; angs = [math.degrees(math.atan2(p[0] - px, -(p[1] - pz))) for p in b['ring']]   # bearing: 0 = north, 90 = east
    c = math.degrees(math.atan2(b['c'][0] - px, -(b['c'][1] - pz))); rel = [((a - c + 180) % 360) - 180 for a in angs]
    lo, hi = min(rel), max(rel); head = (c + (lo + hi) / 2) % 360; fov = max(50, min(110, (hi - lo) + 26))
    dist = math.hypot(b['c'][0] - px, b['c'][1] - pz); h = max(4.0, float(b['osm_h'] or b['gen']['h'] or 5))
    pitch = max(2, min(28, math.degrees(math.atan2(h * 0.55 - 2.5, max(6, dist - 5))) + 4))
    return round(head, 1), round(fov), round(pitch)


def plan():
    k = key(); os.makedirs(OUT, exist_ok=True); idx_path = os.path.join(OUT, 'index.json')
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    n = 0
    for b in mains():
        e = idx.get(str(b['id'])) or {}
        e.update({kk: b[kk] for kk in ('ain', 'main', 'parent', 'area', 'c', 'street', 'dist', 'osm_h', 'levels', 'kind', 'units', 'year', 'name')}); e['gen_h'] = b['gen']['h']; e['gen_roof'] = b['gen']['roof']
        if b['main'] and 'pano' not in e:
            lat, lon = ll(*b['road'])
            m = get('https://maps.googleapis.com/maps/api/streetview/metadata?' + urllib.parse.urlencode(dict(location='%.6f,%.6f' % (lat, lon), radius=40, source='outdoor', key=k))); n += 1
            if m.get('status') == 'OK':
                pxz = xz(m['location']['lat'], m['location']['lng']); head, fov, pitch = view_for(b, pxz)
                e.update(pano=m['pano_id'], date=m.get('date'), pano_xz=[round(pxz[0], 1), round(pxz[1], 1)], heading=head, fov=fov, pitch=pitch)
            else: e['pano'] = None; e['status'] = m.get('status')
            time.sleep(0.05)
        idx[str(b['id'])] = e
    json.dump(idx, open(idx_path, 'w'), indent=1)
    ms = [e for e in idx.values() if e.get('main')]
    print('buildings', len(idx), 'main views', len(ms), 'with pano', sum(1 for e in ms if e.get('pano')), 'metadata requests (free)', n)


def fetch_one(k, name, e):
    f = os.path.join(OUT, name + '.jpg')
    if os.path.exists(f): return 0
    raw = get('https://maps.googleapis.com/maps/api/streetview?' + urllib.parse.urlencode(dict(size='640x640', pano=e['pano'], heading=e['heading'], pitch=e['pitch'], fov=e['fov'], key=k)), binary=True)
    open(f, 'wb').write(raw); time.sleep(0.05); return 1


def fetch():
    k = key(); idx = json.load(open(os.path.join(OUT, 'index.json'))); n = 0
    for bid, e in idx.items():
        if e.get('main') and e.get('pano'): n += fetch_one(k, bid, e)
    print('image requests', n)


def extra(bid, off, fov=None):
    k = key(); idx = json.load(open(os.path.join(OUT, 'index.json'))); e = dict(idx[bid]); e['heading'] = (e['heading'] + float(off)) % 360
    if fov: e['fov'] = int(fov)
    print('image requests', fetch_one(k, '%s_x%s' % (bid, str(off).replace('-', 'm')), e))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    if cmd == 'plan': plan()
    elif cmd == 'fetch': fetch()
    elif cmd == 'extra': extra(*sys.argv[2:5])
