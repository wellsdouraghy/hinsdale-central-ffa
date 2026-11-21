#!/usr/bin/env python3
"""Earl of March Secondary School: Street View reference views (Google Street View Static API; MAP_NOTES.md
"Street-level imagery for facades"). Images are cached under tools/data/streetview/ (gitignored: the imagery may not be
redistributed, never commit it) with index.json (name, pano id, date, position, heading, fov).

  python streetview.py cover [step]                 free metadata scan: where panoramas exist (writes cover.json)
  python streetview.py view NAME X Z TX TZ [FOV] [PITCH]   one 640 x 640 view from the panorama nearest (X, Z), aimed at (TX, TZ)
  python streetview.py batch FILE                   lines of "NAME X Z TX TZ [FOV] [PITCH]"

The key is read from .env.local (VITE_GOOGLE_TILES_KEY) and never printed; it is website-restricted, so every request
sends `Referer: http://localhost:5173/`.
"""
import json, math, os, sys, time, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(HERE, 'data', 'streetview')
ORIGIN = (45.32305, -75.89570)
phi = math.radians(ORIGIN[0])
M_LAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
def key():
    for line in open(os.path.join(ROOT, '.env.local')):
        if line.startswith('VITE_GOOGLE_TILES_KEY='): return line.split('=', 1)[1].strip().strip('"')
    raise SystemExit('no key in .env.local')
def ll(x, z): return ORIGIN[0] - z / M_LAT, ORIGIN[1] + x / M_LON
def xz(lat, lon): return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT
def get(url, binary=False):
    req = urllib.request.Request(url, headers={'Referer': 'http://localhost:5173/', 'User-Agent': 'campus-map-builder/1.0'})
    try: raw = urllib.request.urlopen(req, timeout=40).read()
    except Exception as e: raise SystemExit('request failed: %s' % getattr(e, 'code', type(e).__name__))   # (never print the URL: it carries the key)
    return raw if binary else json.loads(raw)
def meta(x, z, radius=25):
    lat, lon = ll(x, z)
    return get('https://maps.googleapis.com/maps/api/streetview/metadata?' + urllib.parse.urlencode({'location': '%.6f,%.6f' % (lat, lon), 'radius': int(radius), 'source': 'outdoor', 'key': key()}))
def load():
    p = os.path.join(OUT, 'index.json'); return json.load(open(p)) if os.path.exists(p) else {}
def view(name, x, z, tx, tz, fov=75, pitch=4):
    os.makedirs(OUT, exist_ok=True); idx = load()
    m = meta(x, z)
    if m.get('status') != 'OK': print(name, 'no panorama', m.get('status')); return
    px, pz = xz(m['location']['lat'], m['location']['lng'])
    heading = (math.degrees(math.atan2(tx - px, -(tz - pz))) + 360) % 360
    img = get('https://maps.googleapis.com/maps/api/streetview?' + urllib.parse.urlencode({'size': '640x640', 'pano': m['pano_id'], 'heading': '%.1f' % heading, 'pitch': pitch, 'fov': fov, 'key': key()}), True)
    open(os.path.join(OUT, name + '.jpg'), 'wb').write(img)
    idx[name] = dict(pano=m['pano_id'], date=m.get('date'), pos=[round(px, 1), round(pz, 1)], target=[tx, tz], heading=round(heading, 1), fov=fov, pitch=pitch)
    json.dump(idx, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
    print(name, 'pano at (%.1f, %.1f)' % (px, pz), m.get('date'), 'heading %.0f' % heading, len(img), 'bytes')
if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'cover':
        st = float(sys.argv[2]) if len(sys.argv) > 2 else 40; seen = {}; os.makedirs(OUT, exist_ok=True)
        z = -260.0
        while z <= 300:
            x = -260.0
            while x <= 300:
                m = meta(x, z, st * 0.6)
                if m.get('status') == 'OK':
                    px, pz = xz(m['location']['lat'], m['location']['lng']); seen[m['pano_id']] = [round(px, 1), round(pz, 1), m.get('date')]
                x += st
            z += st
        json.dump(seen, open(os.path.join(OUT, 'cover.json'), 'w')); print('panoramas', len(seen))
    elif cmd == 'view':
        a = sys.argv[2:]; view(a[0], *map(float, a[1:5]), *(map(float, a[5:7])))
    elif cmd == 'batch':
        for line in open(sys.argv[2]):
            a = line.split()
            if not a or a[0].startswith('#'): continue
            view(a[0], *map(float, a[1:5]), *(map(float, a[5:7]))); time.sleep(0.2)
