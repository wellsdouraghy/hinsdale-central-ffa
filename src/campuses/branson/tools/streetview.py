#!/usr/bin/env python3
"""The Branson School: Street View reference pass for every building in the play area outside the school, and the school's
street faces (Google Street View Static API; MAP_NOTES.md "Street-level imagery for facades").

For each OSM building the script picks the street point a pedestrian sees it from (nearest street with a clear line to
the footprint), asks the free metadata endpoint for the panorama there, then fetches ONE 640 x 640 view aimed at the
building from the panorama's real position (two for large or corner buildings). Images are cached under
tools/data/streetview/ (gitignored: the imagery may not be redistributed, never commit it) with index.json (building id,
pano id, date, position, heading, fov). They are then read by a person / agent and typed into tools/data/facades_src.json;
tools/facades.py turns that into src/campuses/branson/facades.js, which town.js / school.js consume.

  python streetview.py plan     metadata only (free): writes index.json with the planned views
  python streetview.py fetch    downloads the images that are not cached yet and prints the request count
  python streetview.py extra ID HEADING FOV [PITCH]   one more view from the building's panorama

The key is read from .env.local (VITE_GOOGLE_TILES_KEY) and never printed; it is website-restricted, so every request
sends `Referer: http://localhost:5173/`.
"""
import json, math, os, sys, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
PUB = os.path.join(ROOT, 'public/campuses/branson')
OUT = os.path.join(HERE, 'data', 'streetview')
ORIGIN = (37.96545, -122.56545)
phi = math.radians(ORIGIN[0])
M_LAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
SCHOOL = {975106452, 975107315, 976780018, 976780019, 976135756, 976479989, 976475035, 978513427, 976778295, 9000000001, 9000000002, 9000000003, 9000000004, 9000000005, 9000000006}
STREETS = ('primary', 'tertiary', 'residential', 'unclassified', 'service')
# the school's faces from the streets that pass it (Fernhill Ave, Park Drive, Circle Drive): name -> (target x, z)
SCHOOL_VIEWS = {'s_kbh_fernhill': (-38, -60), 's_gate': (0, -97), 's_tennis_lot': (-110, -45), 's_crossways': (36, -63), 's_newhouse': (50, -13), 's_arts': (50, 10),
                's_field_park': (-30, 75), 's_gym': (-98, 90), 's_loop': (-95, 48), 's_commons': (-125, 15), 's_kbh_south': (-30, 10), 's_quad': (-160, 135), 's_kbh_east': (-10, -25), 's_fernhill_west': (-170, -50)}

def key():
    for line in open(os.path.join(ROOT, '.env.local')):
        if line.startswith('VITE_GOOGLE_TILES_KEY='): return line.split('=', 1)[1].strip().strip('"')
    raise SystemExit('no key in .env.local')
def ll(x, z): return ORIGIN[0] - z / M_LAT, ORIGIN[1] + x / M_LON
def xz(lat, lon): return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT
REQ = {'meta': 0, 'image': 0}
def get(url, binary=False):
    req = urllib.request.Request(url, headers={'Referer': 'http://localhost:5173/', 'User-Agent': 'campus-map-builder/1.0'})
    raw = urllib.request.urlopen(req, timeout=40).read()
    return raw if binary else json.loads(raw)
def centroid(r): return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)
def area(r): return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
def seg_hit(p, q, a, b):
    d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0])
    if abs(d) < 1e-9: return False
    t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d; u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d
    return 0.02 < t < 0.98 and 0 <= u <= 1
def ring_dist(r, x, z):
    best = (1e9, 0, 0)
    for i in range(len(r)):
        ax, az = r[i]; bx, bz = r[(i + 1) % len(r)]; dx, dz = bx - ax, bz - az; d2 = dx * dx + dz * dz or 1e-9
        t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / d2)); px, pz = ax + dx * t, az + dz * t; d = math.hypot(x - px, z - pz)
        if d < best[0]: best = (d, px, pz)
    return best

def plan():
    D = json.load(open(os.path.join(PUB, 'campus.json'))); gen = json.load(open(os.path.join(PUB, 'gen.json')))
    roads = [r for r in D['roads'] if r['tags'].get('highway') in STREETS]
    pts = []   # street sample points every 5 m
    for r in roads:
        L = r['line']
        for i in range(len(L) - 1):
            ax, az = L[i]; bx, bz = L[i + 1]; n = max(1, int(math.hypot(bx - ax, bz - az) / 5))
            for k in range(n): pts.append((ax + (bx - ax) * k / n, az + (bz - az) * k / n, r['tags'].get('name', '')))
    rings = {b['id']: b['outer'][0] for b in D['buildings'] if len(b['outer'][0]) >= 3}
    views = {}; k = key(); panos = {}
    def meta(x, z):
        lat, lon = ll(x, z); q = (round(lat, 5), round(lon, 5))
        if q not in panos:
            REQ['meta'] += 1
            panos[q] = get('https://maps.googleapis.com/maps/api/streetview/metadata?' + urllib.parse.urlencode({'location': '%.6f,%.6f' % (lat, lon), 'radius': 25, 'source': 'outdoor', 'key': k}))
        return panos[q]
    def view(name, target, ring, cands, extra=None):
        for (sx, sz, street, d) in cands[:4]:
            m = meta(sx, sz)
            if m.get('status') != 'OK': continue
            px, pz = xz(m['location']['lat'], m['location']['lng'])
            if ring: dd, tx, tz = ring_dist(ring, px, pz); cx, cz = centroid(ring); tx, tz = (tx + cx) / 2, (tz + cz) / 2
            else: tx, tz = target; dd = math.hypot(tx - px, tz - pz)
            dist = math.hypot(tx - px, tz - pz)
            if dist < 3: continue
            heading = (math.degrees(math.atan2(tx - px, -(tz - pz))) + 360) % 360       # 0 = north (-z), 90 = east (+x)
            half = 12.0
            if ring: half = max(abs(((p[0] - px) * -(tz - pz) + (p[1] - pz) * (tx - px)) / dist) for p in ring)   # half width seen from the pano
            fov = max(55, min(110, math.degrees(2 * math.atan2(half + 2.5, max(4, dd + 2))) * 1.15))
            pitch = 12 if dd < 12 else 8 if dd < 22 else 5
            v = dict(pano=m['pano_id'], date=m.get('date', ''), px=round(px, 1), pz=round(pz, 1), heading=round(heading, 1), fov=round(fov), pitch=pitch, street=street, dist=round(dd, 1), target=[round(tx, 1), round(tz, 1)])
            if extra: v.update(extra)
            views[name] = v; return True
        return False
    n_none = 0
    for b in D['buildings']:
        info = gen['buildings'].get(str(b['id']))
        if not info or not info.get('play') or b['id'] in SCHOOL: continue
        ring = b['outer'][0]
        if len(ring) < 3 or area(ring) < 14: continue
        cx, cz = centroid(ring); cands = []
        for (sx, sz, street) in pts:
            d, qx, qz = ring_dist(ring, sx, sz)
            if d < 6 or d > 60: continue
            blocked = sum(1 for oid, o in rings.items() if oid != b['id'] and abs(o[0][0] - sx) < 90 and abs(o[0][1] - sz) < 90 and any(seg_hit((sx, sz), (qx, qz), o[i], o[(i + 1) % len(o)]) for i in range(len(o))))
            cands.append((sx, sz, street, d + 40 * blocked))
        cands.sort(key=lambda c: c[3])
        # spread the candidates: best, then the best at least 12 m away, ...
        pick = []
        for c in cands:
            if all(math.hypot(c[0] - p[0], c[1] - p[1]) > 12 for p in pick): pick.append(c)
            if len(pick) >= 4: break
        tags = {kk: v for kk, v in b['tags'].items() if kk in ('name', 'shop', 'amenity', 'building', 'addr:housenumber', 'addr:street', 'office', 'cuisine')}
        ok = view(str(b['id']), None, ring, pick, dict(id=b['id'], tags=tags, c=[round(cx, 1), round(cz, 1)], area=round(area(ring))))
        if not ok: n_none += 1; continue
        # a second view for big buildings (another street / the other end of the frontage)
        if area(ring) > 420 and len(pick) > 1:
            v0 = views[str(b['id'])]; far = [c for c in pick if math.hypot(c[0] - v0['px'], c[1] - v0['pz']) > 18 and c[3] < 60]
            if far: view(str(b['id']) + '_b', None, ring, far, dict(id=b['id'], tags=tags, c=[round(cx, 1), round(cz, 1)], area=round(area(ring))))
    for name, t in SCHOOL_VIEWS.items():
        cands = sorted(((sx, sz, st, math.hypot(sx - t[0], sz - t[1])) for (sx, sz, st) in pts if 8 < math.hypot(sx - t[0], sz - t[1]) < 90), key=lambda c: c[3])
        view(name, t, None, cands, dict(school=1))
    os.makedirs(OUT, exist_ok=True)
    json.dump(views, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
    print('planned views', len(views), 'buildings without coverage', n_none, 'metadata requests (free)', REQ['meta'])

def fetch():
    views = json.load(open(os.path.join(OUT, 'index.json'))); k = key()
    for name, v in views.items():
        p = os.path.join(OUT, name + '.jpg')
        if os.path.exists(p): continue
        url = 'https://maps.googleapis.com/maps/api/streetview?' + urllib.parse.urlencode({'size': '640x640', 'pano': v['pano'], 'heading': v['heading'], 'pitch': v['pitch'], 'fov': v['fov'], 'key': k})
        open(p, 'wb').write(get(url, True)); REQ['image'] += 1
    print('image requests this run', REQ['image'], 'cached views', sum(1 for n in views if os.path.exists(os.path.join(OUT, n + '.jpg'))))

def extra(name, heading, fov, pitch=8):
    views = json.load(open(os.path.join(OUT, 'index.json'))); v = dict(views[name]); k = key()
    n = 1
    while name + '_x%d' % n in views: n += 1
    v.update(heading=float(heading), fov=float(fov), pitch=float(pitch)); views[name + '_x%d' % n] = v
    url = 'https://maps.googleapis.com/maps/api/streetview?' + urllib.parse.urlencode({'size': '640x640', 'pano': v['pano'], 'heading': v['heading'], 'pitch': v['pitch'], 'fov': v['fov'], 'key': k})
    open(os.path.join(OUT, name + '_x%d.jpg' % n), 'wb').write(get(url, True))
    json.dump(views, open(os.path.join(OUT, 'index.json'), 'w'), indent=1); print('fetched', name + '_x%d' % n)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    if cmd == 'plan': plan()
    elif cmd == 'fetch': fetch()
    elif cmd == 'extra': extra(*sys.argv[2:])
