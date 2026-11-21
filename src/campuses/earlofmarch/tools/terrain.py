#!/usr/bin/env python3
"""Real ground heights for Earl of March (run after gen.py; needs numpy scipy + dem.py's modules).

Source: NRCan HRDEM, City of Ottawa lidar 2020, 1 m bare-earth DTM (see dem.py). The site is NOT flat enough to be a
flat campus: the built part (school, car parks, track) lies within +-0.6 m of one level, but the Canadian Shield rock
knolls in the woods beside the track, west of the portables and south of the school stand 3-6 m above it.

Writes
  public/campuses/earlofmarch/terrain.bin   int16 little-endian, centimetres above y = 0 (the ground round the school,
                                            CGVD2013 93.66 m), 2 m grid over the satellite rectangle (361 x 331, row 0 = north);
                                            the outer 40 m are blended into the 20 m backdrop grid
  public/campuses/earlofmarch/gen.json      patched in place: terrain = 20 m backdrop grid (+-1500 m, decimetres, signed),
                                            fieldLevel = the datum
and VALIDATES the baked file (rules F24 / F25), failing the bake when the mean |error| is over 1.5 m:
  1. against MRDEM-30 (NRCan's 30 m model derived from Copernicus radar: an independent source in the same datum) at a
     7 x 7 lattice over the satellite rectangle + named spots;
  2. against the CDEM point service (1 : 50 000 contour model, CGVD28: integer metres, a looser cross-check, reported);
  3. tools/data/tile_ground.json (Google 3D tiles on open ground, dev/earlofmarch-tiles.html) when present: tile minus
     game must be ONE constant in every quadrant.
Usage: python terrain.py [debug_dir]
"""
import json, os, sys, math, time, urllib.request
import numpy as np
from scipy import ndimage as ndi
import dem
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/campuses/earlofmarch')
DBG = sys.argv[1] if len(sys.argv) > 1 else None
SAT = (-360.0, 360.0, -330.0, 330.0)
PLAY = dict(minX=-176, maxX=250, minZ=-200, maxZ=240)
Y0 = 93.66      # CGVD2013 m: median of the DTM on a ring 2 m outside the school's walls (min 93.46, max 93.78)
NEAR = dem.lidar('dtm'); FAR = dem.lidar_far()
assert NEAR.covers(500) and FAR.covers(1650)

# ------------------------------------------------------------------ backdrop grid (20 m, +-1500 m)
TS, TN, T0 = 20.0, 151, -1500.0
tx = T0 + np.arange(TN) * TS; TXg, TZg = np.meshgrid(tx, tx)
inner = (np.abs(TXg) < 470) & (np.abs(TZg) < 440)
nearS = dem.Dem(ndi.gaussian_filter(NEAR.a, 6), NEAR.m); farS = dem.Dem(ndi.gaussian_filter(FAR.a, 0.8), FAR.m)
TER = np.where(inner, nearS.at(TXg, TZg), farS.at(TXg, TZg)) - Y0
def backdrop(x, z):
    fx = np.clip((np.asarray(x, float) - T0) / TS, 0, TN - 1.001); fz = np.clip((np.asarray(z, float) - T0) / TS, 0, TN - 1.001)
    i = np.floor(fx).astype(int); j = np.floor(fz).astype(int); a = fx - i; b = fz - j
    return TER[j, i] * (1 - a) * (1 - b) + TER[j, i + 1] * a * (1 - b) + TER[j + 1, i] * (1 - a) * b + TER[j + 1, i + 1] * a * b

# ------------------------------------------------------------------ play-area heightfield (2 m over the satellite rectangle)
STEP = 2.0
xs = np.arange(SAT[0], SAT[1] + 0.01, STEP); zs = np.arange(SAT[2], SAT[3] + 0.01, STEP)
Xg, Zg = np.meshgrid(xs, zs)
SM = dem.Dem(ndi.gaussian_filter(NEAR.a, 0.9), NEAR.m)     # 1 m lidar noise / kerb steps: ~1 m gaussian before the 2 m resample
Hn = SM.at(Xg, Zg) - Y0
edge = np.minimum(np.minimum(Xg - SAT[0], SAT[1] - Xg), np.minimum(Zg - SAT[2], SAT[3] - Zg))
w = np.clip(edge / 40.0, 0, 1); w = w * w * (3 - 2 * w)
Hf = Hn * w + backdrop(Xg, Zg) * (1 - w)
cm = np.round(Hf * 100).astype('<i2'); cm.tofile(os.path.join(OUT, 'terrain.bin'))
inp = (Zg > PLAY['minZ']) & (Zg < PLAY['maxZ']) & (Xg > PLAY['minX']) & (Xg < PLAY['maxX'])
gy, gx = np.gradient(Hf, STEP); slope = np.degrees(np.arctan(np.hypot(gx, gy)))
print('terrain.bin %d x %d, range %.1f..%.1f m; play rectangle %.1f..%.1f (p2 %.2f, p50 %.2f, p98 %.2f)' % (cm.shape[1], cm.shape[0], Hf.min(), Hf.max(), Hf[inp].min(), Hf[inp].max(), *np.percentile(Hf[inp], [2, 50, 98])))
print('play-area slope: >20deg %.2f%%  >35deg %.2f%%  >42deg %.2f%%' % tuple(100 * (slope[inp] > t).mean() for t in (20, 35, 42)))
gen = json.load(open(os.path.join(OUT, 'gen.json')))
gen['terrain'] = dict(x0=T0, z0=T0, step=TS, n=TN, signed=1, h=[int(round(v * 10)) for v in TER.reshape(-1)])
gen['fieldLevel'] = Y0
json.dump(gen, open(os.path.join(OUT, 'gen.json'), 'w'), separators=(',', ':'))
print('backdrop grid range %.1f..%.1f m' % (TER.min(), TER.max()))

# ------------------------------------------------------------------ validation (F24): the BAKED file against independent sources
H = np.fromfile(os.path.join(OUT, 'terrain.bin'), '<i2').reshape(len(zs), len(xs)) * 0.01
def game(x, z):
    fx = min(max((x - SAT[0]) / STEP, 0), len(xs) - 1.001); fz = min(max((z - SAT[2]) / STEP, 0), len(zs) - 1.001); i, j = int(fx), int(fz); u, v = fx - i, fz - j
    return H[j, i] * (1 - u) * (1 - v) + H[j, i + 1] * u * (1 - v) + H[j + 1, i] * (1 - u) * v + H[j + 1, i + 1] * u * v
pts = [('grid', x, z) for z in (-326, -220, -110, 0, 110, 220, 326) for x in (-356, -240, -120, 0, 120, 240, 356)]
pts += [('track infield', -115, 85), ('north car park', 45, -120), ('bus loop', 135, -40), ('Mlacak forecourt', 62, 165), ('The Parkway', -90, -100), ('Campeau Drive', 170, 150),
        ('knoll W of track', -205, 125), ('knoll NE wood', 150, -140), ('knoll by portables', -128, -40), ('tennis club', -30, 265), ('Teron Road', 250, -110), ('portables', -20, 10)]
MR = dem.mrdem()
def box(x, z, r=15):   # the 30 m model against the mean of the 2 m game grid over its cell
    return float(np.mean([game(x + a, z + b) for a in range(-r, r + 1, 5) for b in range(-r, r + 1, 5)]))
rows = []
for name, x, z in pts:
    g = box(x, z); m = float(MR.at(x, z)) - Y0; edge_ = min(x - SAT[0], SAT[1] - x, z - SAT[2], SAT[3] - z) < 40
    rows.append((name, x, z, g, m, g - m, edge_))
e = np.array([abs(r[5]) for r in rows]); bias = float(np.mean([r[5] for r in rows])); inn = np.array([abs(r[5]) for r in rows if not r[6]])
print('MRDEM-30 (independent, CGVD2013): %d points, mean |err| %.2f m, median %.2f, max %.2f, bias %+.2f; inside the blend band (%d): mean %.2f, max %.2f' % (len(e), e.mean(), np.median(e), e.max(), bias, len(inn), inn.mean(), inn.max()))
for r in sorted(rows, key=lambda r: -abs(r[5]))[:6]: print('   worst: %-20s (%5d, %5d) game %6.2f  MRDEM %6.2f  err %+5.2f%s' % (r[0], r[1], r[2], r[3], r[4], r[5], '  (edge blend)' if r[6] else ''))
fail = e.mean() > 1.5
# registration test: the same comparison with the game grid shifted / scaled must be WORSE (a squashed or shifted bake shows here)
def score(sx=1.0, sz=1.0, dx=0.0, dz=0.0): return float(np.mean([abs(box(x * sx + dx, z * sz + dz) - (float(MR.at(x, z)) - Y0)) for _, x, z in pts]))
alt = {'as baked': score(), 'x 1.016 (grid metres read as true metres)': score(1.0159, 1.0159), 'rotated 17 deg (grid north read as north)': None, 'shift 30 m east': score(dx=30), 'shift 30 m south': score(dz=30), 'z x 1.26 (the Marin / Branson squash)': score(sz=1.26)}
ca, sa = math.cos(math.radians(17.2)), math.sin(math.radians(17.2))
alt['rotated 17 deg (grid north read as north)'] = float(np.mean([abs(box(x * ca - z * sa, x * sa + z * ca) - (float(MR.at(x, z)) - Y0)) for _, x, z in pts]))
print('registration (mean |err| vs MRDEM under deliberate mis-registration; "as baked" must be the smallest):')
for k, v in alt.items(): print('   %-46s %.2f' % (k, v))
if min(alt.values()) < alt['as baked'] - 0.05: fail = True; print('   !! a mis-registered variant fits better')
# CDEM point service (cached)
cp = os.path.join(dem.CACHE, 'cdem_points.json'); cache = json.load(open(cp)) if os.path.exists(cp) else {}
def cdem(x, z):
    k = '%d,%d' % (x, z)
    if k not in cache:
        url = 'https://geogratis.gc.ca/services/elevation/cdem/altitude?lat=%.6f&lon=%.6f' % (dem.LAT0 - z / dem.M_LAT, dem.LON0 + x / dem.M_LON)
        try: cache[k] = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'campus-terrain-bake'}), timeout=40)).get('altitude'); time.sleep(1.0)
        except Exception: cache[k] = None
        json.dump(cache, open(cp, 'w'))
    return cache[k]
c = [(n, x, z, box(x, z, 10), cdem(x, z)) for n, x, z in pts[::2]]; c = [r for r in c if r[4] is not None]
if c:
    d = np.array([r[3] - (r[4] - Y0) for r in c]); print('CDEM points (contour model, CGVD28, integer metres): %d points, mean |err| %.2f m, bias %+.2f, |err - bias| mean %.2f, max %.2f' % (len(d), np.abs(d).mean(), d.mean(), np.abs(d - d.mean()).mean(), np.abs(d - d.mean()).max()))
tg = os.path.join(HERE, 'data', 'tile_ground.json')
if os.path.exists(tg):
    T = json.load(open(tg)); d = np.array([[p[0], p[1], p[2] - game(p[0], p[1])] for p in T['points']]); off = float(np.median(d[:, 2]))
    q = [np.median(d[(np.sign(d[:, 0]) == a) & (np.sign(d[:, 1]) == b), 2]) for a in (-1, 1) for b in (-1, 1)]
    print('Google 3D tiles on open ground (%d points, viewer height %s): tile - game = %.2f (p10..p90 %.2f..%.2f); by quadrant NW %.2f SW %.2f NE %.2f SE %.2f; mean |residual| %.2f m' % (len(d), T.get('h'), off, *np.percentile(d[:, 2], [10, 90]), q[0], q[1], q[2], q[3], np.abs(d[:, 2] - off).mean()))
    if max(q) - min(q) > 1.0: fail = True; print('   !! the tile offset changes across the map (rule F25: a registration bug)')
if DBG:
    from PIL import Image
    os.makedirs(DBG, exist_ok=True)
    t = np.clip((Hf + 4) / 14, 0, 1); sh = np.clip(0.55 + 0.45 * (-gx * 0.7 - gy * 0.7) / 0.25, 0, 1)
    rgb = np.stack([60 + 180 * t, 170 - 60 * t, 90 - 40 * t], 2) * sh[..., None]; rgb[slope > 42] = [255, 0, 0]; rgb[(slope > 35) & (slope <= 42)] = [255, 160, 0]; rgb[(slope > 20) & (slope <= 35)] *= [1.0, 1.0, 0.4]
    Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).resize((rgb.shape[1] * 3, rgb.shape[0] * 3), Image.NEAREST).save(os.path.join(DBG, 'terrain.png'))
print('VALIDATION', 'FAILED' if fail else 'passed'); sys.exit(1 if fail else 0)
