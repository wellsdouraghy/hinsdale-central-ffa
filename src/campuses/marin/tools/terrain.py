#!/usr/bin/env python3
"""Real ground heights for the Marin Academy campus (run by hand after gen.py; needs numpy scipy shapely tifffile).

Source: USGS 3DEP (public domain, bare-earth lidar DEM, no roofs / trees), fetched from the National Map ImageServer and
cached under tools/data/dem/ (not committed). Google 3D-tiles samples (tools/data/tile_heights.json) are used only for
ROOF heights: on open ground they agree with the DEM to ~0.5 m after a constant offset, but their coarse LODs smear the
steep hillside north-east of campus by up to 20 m, and they cannot see the ground under canopies.

Writes
  public/campuses/marin/terrain.bin   int16 little-endian, centimetres above the Championship Field (y = 0), 2 m grid
                                      over the satellite rectangle (331 x 301, row 0 = north); the outer 40 m are blended
                                      into the 20 m backdrop grid so the drawn ground and the backdrop hills meet
  public/campuses/marin/gen.json      patched in place:
     terrain      20 m backdrop grid (+-1500 m, decimetres, signed, no fade)
     buildings    per building: g = [min, max, mean] ground on its outline (m), top = roof height above y = 0,
                  h = wall height above the UPHILL ground, hd = above the downhill ground, lv = storeys, roof / rise
     trees        base heights dropped (the engine plants them on the terrain)
Usage: python terrain.py [debug_dir]
"""
import json, os, sys, math, urllib.request
import numpy as np, tifffile
from scipy import ndimage as ndi
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely import contains_xy, prepare
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/campuses/marin')
DBG = sys.argv[1] if len(sys.argv) > 1 else None
LAT0, LON0 = 37.97575, -122.53505
phi = math.radians(LAT0)
M_LAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
SAT = (-330.0, 330.0, -300.0, 300.0)
PLAY = dict(minX=-186, maxX=182, minZ=-176, maxZ=204)
ANG = math.radians(7.2); UX, UZ = math.cos(ANG), math.sin(ANG)
def G(a, b): return (a * UX - b * UZ, a * UZ + b * UX)

def fetch(name, half_x, half_z, px_x, px_z):
    p = os.path.join(HERE, 'data', 'dem', name)
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        w, e, s, n = LON0 - half_x / M_LON, LON0 + half_x / M_LON, LAT0 - half_z / M_LAT, LAT0 + half_z / M_LAT
        url = ('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=%.7f,%.7f,%.7f,%.7f'
               '&bboxSR=4326&imageSR=4326&size=%d,%d&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image') % (w, s, e, n, px_x, px_z)
        req = urllib.request.Request(url, headers={'User-Agent': 'campus-terrain-bake'})
        open(p, 'wb').write(urllib.request.urlopen(req, timeout=180).read())
    return tifffile.imread(p).astype(np.float64)
class Dem:
    def __init__(self, a, hx, hz): self.a, self.hx, self.hz = a, hx, hz
    def at(self, x, z):
        a = self.a; x = np.asarray(x, float); z = np.asarray(z, float)
        fx = np.clip((x + self.hx) / (2 * self.hx) * a.shape[1] - 0.5, 0, a.shape[1] - 1.001); fz = np.clip((z + self.hz) / (2 * self.hz) * a.shape[0] - 0.5, 0, a.shape[0] - 1.001)
        i = np.floor(fx).astype(int); j = np.floor(fz).astype(int); u = fx - i; v = fz - j
        return a[j, i] * (1 - u) * (1 - v) + a[j, i + 1] * u * (1 - v) + a[j + 1, i] * (1 - u) * v + a[j + 1, i + 1] * u * v
NEAR = Dem(fetch('dem_1m.tif', 480, 450, 960, 900), 480, 450)        # 1 m
FAR = Dem(fetch('dem_10m.tif', 1700, 1700, 340, 340), 1700, 1700)    # 10 m

D = json.load(open(os.path.join(OUT, 'campus.json')))
gen = json.load(open(os.path.join(OUT, 'gen.json')))
areas = {a['id']: a for a in D['areas']}
# y = 0: the Championship Field turf (median of the DEM inside the pitch, clear of the edges)
turf = Polygon(areas[652917770]['outer'][0]).buffer(-8)
tx0, tz0, tx1, tz1 = turf.bounds
pts = [(x, z) for x in np.arange(tx0, tx1, 2) for z in np.arange(tz0, tz1, 2) if turf.contains(Point(x, z))]
Y0 = float(np.median(NEAR.at([p[0] for p in pts], [p[1] for p in pts])))
print('field level (NAVD88 m)', round(Y0, 2), 'samples', len(pts))

# ------------------------------------------------------------------ backdrop grid (20 m, +-1500 m)
TS, TN, T0 = 20.0, 151, -1500.0
tx = T0 + np.arange(TN) * TS; TXg, TZg = np.meshgrid(tx, tx)
inner = (np.abs(TXg) < 440) & (np.abs(TZg) < 410)
TER = np.where(inner, ndi.gaussian_filter(NEAR.a, 6)[np.clip(((TZg + 450) / 900 * 900).astype(int), 0, 899), np.clip(((TXg + 480) / 960 * 960).astype(int), 0, 959)], FAR.at(TXg, TZg)) - Y0
def backdrop(x, z):
    fx = np.clip((np.asarray(x, float) - T0) / TS, 0, TN - 1.001); fz = np.clip((np.asarray(z, float) - T0) / TS, 0, TN - 1.001)
    i = np.floor(fx).astype(int); j = np.floor(fz).astype(int); a = fx - i; b = fz - j
    return TER[j, i] * (1 - a) * (1 - b) + TER[j, i + 1] * a * (1 - b) + TER[j + 1, i] * (1 - a) * b + TER[j + 1, i + 1] * a * b

# ------------------------------------------------------------------ play-area heightfield (2 m over the satellite rectangle)
STEP = 2.0
xs = np.arange(SAT[0], SAT[1] + 0.01, STEP); zs = np.arange(SAT[2], SAT[3] + 0.01, STEP)
Xg, Zg = np.meshgrid(xs, zs)
sm = ndi.gaussian_filter(NEAR.a, 0.9)        # 1 m lidar noise / kerb steps: ~1 m gaussian before the 2 m resample
Hn = Dem(sm, 480, 450).at(Xg, Zg) - Y0
edge = np.minimum(np.minimum(Xg - SAT[0], SAT[1] - Xg), np.minimum(Zg - SAT[2], SAT[3] - Zg))
w = np.clip(edge / 40.0, 0, 1); w = w * w * (3 - 2 * w)
Hf = Hn * w + backdrop(Xg, Zg) * (1 - w)
cm = np.round(Hf * 100).astype('<i2')
cm.tofile(os.path.join(OUT, 'terrain.bin'))
print('terrain.bin', cm.shape[::-1], 'range', Hf.min().round(1), Hf.max().round(1), 'play range',
      Hf[(Zg > PLAY['minZ']) & (Zg < PLAY['maxZ']) & (Xg > PLAY['minX']) & (Xg < PLAY['maxX'])].min().round(1), Hf[(Zg > PLAY['minZ']) & (Zg < PLAY['maxZ']) & (Xg > PLAY['minX']) & (Xg < PLAY['maxX'])].max().round(1))
gy, gx = np.gradient(Hf, STEP); slope = np.degrees(np.arctan(np.hypot(gx, gy)))
inp = (Zg > PLAY['minZ']) & (Zg < PLAY['maxZ']) & (Xg > PLAY['minX']) & (Xg < PLAY['maxX'])
print('play-area slope: >20deg %.1f%%  >35deg %.1f%%  >42deg %.1f%%' % tuple(100 * (slope[inp] > t).mean() for t in (20, 35, 42)))
def ground(x, z): return Dem(sm, 480, 450).at(x, z) - Y0

# ------------------------------------------------------------------ building heights against the ground round each footprint
TH = json.load(open(os.path.join(HERE, 'data', 'tile_heights.json')))
BLD = unary_union([Polygon(b['outer'][0]).buffer(0).buffer(2.0) for b in D['buildings'] if len(b['outer'][0]) >= 3])
prepare(BLD)
def grid(g): return np.array([[np.nan if v is None else v for v in r] for r in g['rows']], float), g['x0'], g['z0'], g['step']
def calibrated(g):
    """Tile surface -> metres above y = 0. The tile heights carry a bias that changes across the map (about -13 m on the
    flat blocks, 3 m more on the hillside north of the gyms, worse on the steep north-east slope where only coarse tile
    LODs load), so the offset to the DEM is fitted LOCALLY on open ground next to each building: smooth tile cells clear
    of every OSM footprint, outliers against the neighbourhood median dropped, gaussian weights (sigma 16 m)."""
    Hm, x0, z0, st = g; X, Z = np.meshgrid(x0 + np.arange(Hm.shape[1]) * st, z0 + np.arange(Hm.shape[0]) * st)
    T = np.nan_to_num(Hm, nan=0.0)
    rough = np.sqrt(np.maximum(ndi.uniform_filter(T * T, 3) - ndi.uniform_filter(T, 3) ** 2, 0))
    open_ = (rough < 0.3) & ~np.isnan(Hm) & ~contains_xy(BLD, X, Z)
    d = Hm - ground(X, Z)
    # neighbourhood median on 24 m blocks (3 x 3 blocks around each cell), then the outlier cut
    nb = max(1, int(round(24 / st))); by, bx = -(-Hm.shape[0] // nb), -(-Hm.shape[1] // nb); bm = np.full((by, bx), np.nan)
    for j in range(by):
        for i in range(bx):
            sl = (slice(max(0, (j - 1) * nb), (j + 2) * nb), slice(max(0, (i - 1) * nb), (i + 2) * nb)); v = d[sl][open_[sl]]
            if len(v) >= 6: bm[j, i] = np.median(v)
    med = np.repeat(np.repeat(bm, nb, 0), nb, 1)[:Hm.shape[0], :Hm.shape[1]]
    open_ &= np.abs(d - np.nan_to_num(med, nan=1e9)) < 1.5
    num = ndi.gaussian_filter(np.where(open_, d, 0.0), 16 / st); den = ndi.gaussian_filter(open_.astype(float), 16 / st)
    glob = float(np.median(d[open_]))
    off = np.where(den > 0.01, num / np.maximum(den, 1e-6), glob)
    print('tile offset: median %.2f, local %.2f..%.2f, open cells %d' % (glob, off.min(), off.max(), open_.sum()))
    return Hm - off, x0, z0, st
FINE = calibrated(grid(TH['fine'])); WIDE = calibrated(grid(TH['wide']))
def roof_samples(g, P_, ring_in):
    Hm, gx0, gz0, st = g; ins = []
    minx, minz, maxx, maxz = P_.bounds
    for j in range(max(0, int(math.floor((minz - gz0) / st))), min(Hm.shape[0] - 1, int(math.ceil((maxz - gz0) / st))) + 1):
        for i in range(max(0, int(math.floor((minx - gx0) / st))), min(Hm.shape[1] - 1, int(math.ceil((maxx - gx0) / st))) + 1):
            v = Hm[j, i]
            if not np.isnan(v) and ring_in.contains(Point(gx0 + i * st, gz0 + j * st)): ins.append(v)
    return ins
changed = []
for b in D['buildings']:
    v = gen['buildings'].get(str(b['id']))
    if not v: continue
    Pb = Polygon(b['outer'][0])
    if not Pb.is_valid: Pb = Pb.buffer(0)
    if Pb.is_empty: continue
    if Pb.geom_type != 'Polygon': Pb = max(Pb.geoms, key=lambda q: q.area)
    # ground on the outline, 1 m outside the walls (the lidar surface under a building is interpolated from there anyway)
    ring = Pb.buffer(1.0).exterior; n = max(8, int(ring.length / 1.5))
    gs = np.array([float(ground(*ring.interpolate(k / n, normalized=True).coords[0])) for k in range(n)])
    gmin, gmax, gmean = float(gs.min()), float(gs.max()), float(gs.mean())
    cx, cz = Pb.centroid.x, Pb.centroid.y
    ring_in = Pb.buffer(-1.0)
    if ring_in.is_empty: ring_in = Pb
    ins = roof_samples(FINE if (-214 < cx < 218 and -214 < cz < 218) else WIDE, Pb, ring_in)
    v.pop('y', None); v.pop('yTop', None)
    v['g'] = [round(gmin, 2), round(gmax, 2), round(gmean, 2)]
    old = (v['h'], v['roof'])
    if len(ins) >= 2:
        a = np.array(ins); med = float(np.median(a)); lo = float(np.percentile(a, 25)); hi = float(np.percentile(a, 92))
        # tree crowns over a roof push single samples up: clamp the top at 14 m over the uphill ground for houses
        if v['roof'] == 'flat':
            top = med; v['rise'] = 0.0
        else:
            top = lo; v['rise'] = round(float(np.clip(hi - lo, 1.2, 4.0)), 1)
        h_up = top - gmax; h_dn = top - gmin
        # a roof lower than ~2.4 m over the uphill ground is a tree-shadowed / mis-sampled footprint: one storey
        if h_up < 2.5: top = gmax + 2.7; h_up = 2.7; h_dn = top - gmin
        v['top'] = round(top, 2); v['h'] = round(h_up, 1); v['hd'] = round(h_dn, 1)
    else:
        v['top'] = round(gmax + v['h'], 2); v['hd'] = round(v['h'] + gmax - gmin, 1)
    v['lv'] = max(1, int(round((v['h'] - (0.5 if v['roof'] == 'flat' else 0.0)) / 3.1)))
    t = b['tags']
    if t.get('building:levels'): v['osmLv'] = t['building:levels']
    if v.get('play') and (abs(old[0] - v['h']) >= 1.0): changed.append((b['id'], t.get('name', ''), old[0], v['h'], v['hd'], round(gmax - gmin, 1), v['lv']))
print('buildings re-measured; in-play heights changed by >= 1 m:', len(changed))
for c in sorted(changed, key=lambda c: c[3] - c[2]): print('  %d %-28s h %.1f -> %.1f (downhill side %.1f, ground fall %.1f m, %d storeys)' % c)

gen['trees'] = [t[:4] for t in gen['trees']]
gen['terrain'] = dict(x0=T0, z0=T0, step=TS, n=TN, signed=1, h=[int(round(v * 10)) for v in TER.reshape(-1)])
gen['fieldLevel'] = round(Y0, 2)
json.dump(gen, open(os.path.join(OUT, 'gen.json'), 'w'), separators=(',', ':'))

if DBG:
    from PIL import Image
    os.makedirs(DBG, exist_ok=True)
    t = np.clip((Hf + 12) / 60, 0, 1); sh = np.clip(0.55 + 0.45 * (-gx * 0.7 - gy * 0.7) / 0.6, 0, 1)
    rgb = np.stack([60 + 180 * t, 170 - 60 * t, 90 - 40 * t], 2) * sh[..., None]; rgb[slope > 42] = [255, 0, 0]; rgb[(slope > 35) & (slope <= 42)] = [255, 160, 0]
    Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).resize((rgb.shape[1] * 3, rgb.shape[0] * 3), Image.NEAREST).save(os.path.join(DBG, 'terrain.png'))
