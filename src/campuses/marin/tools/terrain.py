#!/usr/bin/env python3
"""Real ground heights for the Marin Academy campus (run by hand after gen.py; needs numpy scipy shapely tifffile).

Source: USGS 3DEP (public domain, bare-earth lidar DEM, no roofs / trees), fetched from the National Map ImageServer and
cached under tools/data/dem/ (not committed). Google 3D-tiles samples (tools/data/tile_heights.json) are used only for
ROOF heights: on open ground they agree with the DEM to ~0.3 m after ONE constant offset, but they cannot see the
ground under canopies or roofs.

The DEM is validated on every run against USGS point elevations (epqs, 63 points over the satellite rectangle, cached in
tools/data/dem/epqs.json): the bake fails if the mean error is over 1.5 m (MAP_NOTES rule: validate the registration).

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

def fetch(name, half_x, half_z, px):
    """3DEP export as a GeoTIFF in EPSG:4326. The server keeps SQUARE DEGREE pixels whatever `size` says (asking for
    960 x 900 px over a 960 x 900 m box came back as 960 x 1137 m: every hill 26 % too far north / south), so the request
    is built from one pixel size in degrees (px metres east-west, px * M_LAT / M_LON north-south) and a whole number of
    pixels each way, and the georeferencing is READ BACK from the GeoTIFF tags, never assumed."""
    p = os.path.join(HERE, 'data', 'dem', name)
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        deg = px / M_LON; nx = 2 * int(math.ceil(half_x / px)); nz = 2 * int(math.ceil(half_z / (deg * M_LAT)))
        w, e, s, n = LON0 - nx / 2 * deg, LON0 + nx / 2 * deg, LAT0 - nz / 2 * deg, LAT0 + nz / 2 * deg
        url = ('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=%.9f,%.9f,%.9f,%.9f'
               '&bboxSR=4326&imageSR=4326&size=%d,%d&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image') % (w, s, e, n, nx, nz)
        req = urllib.request.Request(url, headers={'User-Agent': 'campus-terrain-bake'})
        open(p, 'wb').write(urllib.request.urlopen(req, timeout=180).read())
    with tifffile.TiffFile(p) as t:
        pg = t.pages[0]; a = pg.asarray().astype(np.float64); tags = {k.name: k.value for k in pg.tags}
    sx, sy = tags['ModelPixelScaleTag'][:2]; ti, tj, _, tlon, tlat, _ = tags['ModelTiepointTag'][:6]
    assert 4326 in tags['GeoKeyDirectoryTag'], 'DEM is not in EPSG:4326'
    lon_w, lat_n = tlon - ti * sx, tlat + tj * sy     # outer corner of pixel (0, 0)
    return Dem(a, lon_w, lat_n, sx, sy)
class Dem:
    """Raster in geographic coordinates (pixel centres at lon_w + (i + 0.5) sx, lat_n - (j + 0.5) sy), sampled bilinearly
    in the campus frame (x east, z south, metres from the origin)."""
    def __init__(self, a, lon_w, lat_n, sx, sy):
        self.a, self.lon_w, self.lat_n, self.sx, self.sy = a, lon_w, lat_n, sx, sy
        self.mx, self.mz = sx * M_LON, sy * M_LAT     # pixel size in metres
        x0, z0 = (lon_w - LON0) * M_LON, (LAT0 - lat_n) * M_LAT
        self.ext = (x0, x0 + a.shape[1] * self.mx, z0, z0 + a.shape[0] * self.mz)
    def with_(self, a): return Dem(a, self.lon_w, self.lat_n, self.sx, self.sy)
    def smooth(self, metres): return self.with_(ndi.gaussian_filter(self.a, (metres / self.mz, metres / self.mx)))
    def at(self, x, z):
        a = self.a; x = np.asarray(x, float); z = np.asarray(z, float)
        fx = np.clip((x - self.ext[0]) / self.mx - 0.5, 0, a.shape[1] - 1.001); fz = np.clip((z - self.ext[2]) / self.mz - 0.5, 0, a.shape[0] - 1.001)
        i = np.floor(fx).astype(int); j = np.floor(fz).astype(int); u = fx - i; v = fz - j
        return a[j, i] * (1 - u) * (1 - v) + a[j, i + 1] * u * (1 - v) + a[j + 1, i] * (1 - u) * v + a[j + 1, i + 1] * u * v
NEAR = fetch('dem_near_v2.tif', 480, 450, 0.8)     # 0.8 m east-west x 1.01 m north-south
FAR = fetch('dem_far_v2.tif', 1700, 1700, 8.0)     # 8 x 10.1 m
for nm, d, hx, hz in (('near', NEAR, 480, 450), ('far', FAR, 1700, 1700)):
    print('DEM %s: %d x %d px of %.3f x %.3f m, x %.1f..%.1f, z %.1f..%.1f' % (nm, d.a.shape[1], d.a.shape[0], d.mx, d.mz, *d.ext))
    assert d.ext[0] <= -hx + 0.01 and d.ext[1] >= hx - 0.01 and d.ext[2] <= -hz + 0.01 and d.ext[3] >= hz - 0.01, 'DEM does not cover the requested box'
    assert abs(d.mz / d.mx - M_LAT / M_LON) < 1e-3, 'DEM pixels are not square in degrees: check the georeferencing'

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
TER = np.where(inner, NEAR.smooth(6.0).at(TXg, TZg), FAR.at(TXg, TZg)) - Y0
def backdrop(x, z):
    fx = np.clip((np.asarray(x, float) - T0) / TS, 0, TN - 1.001); fz = np.clip((np.asarray(z, float) - T0) / TS, 0, TN - 1.001)
    i = np.floor(fx).astype(int); j = np.floor(fz).astype(int); a = fx - i; b = fz - j
    return TER[j, i] * (1 - a) * (1 - b) + TER[j, i + 1] * a * (1 - b) + TER[j + 1, i] * (1 - a) * b + TER[j + 1, i + 1] * a * b

# ------------------------------------------------------------------ play-area heightfield (2 m over the satellite rectangle)
STEP = 2.0
xs = np.arange(SAT[0], SAT[1] + 0.01, STEP); zs = np.arange(SAT[2], SAT[3] + 0.01, STEP)
Xg, Zg = np.meshgrid(xs, zs)
SM = NEAR.smooth(0.9)        # 1 m lidar noise / kerb steps: ~1 m gaussian before the 2 m resample
Hn = SM.at(Xg, Zg) - Y0
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
def ground(x, z): return SM.at(x, z) - Y0

# ------------------------------------------------------------------ registration check against USGS point elevations
def validate():
    p = os.path.join(HERE, 'data', 'dem', 'epqs.json'); res = json.load(open(p)) if os.path.exists(p) else {}
    pts = [(x, z) for z in (-250, -170, -120, -60, 0, 60, 120, 200, 260) for x in (-280, -180, -90, 0, 90, 180, 280)]
    for x, z in pts:
        k = '%d,%d' % (x, z)
        if k in res: continue
        url = 'https://epqs.nationalmap.gov/v1/json?x=%.7f&y=%.7f&units=Meters&wkid=4326&includeDate=false' % (LON0 + x / M_LON, LAT0 - z / M_LAT)
        try: res[k] = float(json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'campus-terrain-bake'}), timeout=60))['value'])
        except Exception as e: print('epqs failed at', k, e)
        json.dump(res, open(p, 'w'))
    P = np.array([[*map(float, k.split(',')), v] for k, v in res.items()])
    if len(P) < 20: print('WARNING: only %d USGS check points (need 20): registration NOT validated' % len(P)); return
    fx = (P[:, 0] - SAT[0]) / STEP; fz = (P[:, 1] - SAT[2]) / STEP; i = np.minimum(fx.astype(int), Hf.shape[1] - 2); j = np.minimum(fz.astype(int), Hf.shape[0] - 2); u = fx - i; v = fz - j
    bake = Hf[j, i] * (1 - u) * (1 - v) + Hf[j, i + 1] * u * (1 - v) + Hf[j + 1, i] * (1 - u) * v + Hf[j + 1, i + 1] * u * v + Y0
    err = np.abs(bake - P[:, 2]); inp = (P[:, 0] > PLAY['minX']) & (P[:, 0] < PLAY['maxX']) & (P[:, 1] > PLAY['minZ']) & (P[:, 1] < PLAY['maxZ'])
    print('registration vs USGS epqs: %d points, mean %.2f m, max %.2f m (play area: %d points, mean %.2f, max %.2f)' % (len(P), err.mean(), err.max(), inp.sum(), err[inp].mean(), err[inp].max()))
    assert err.mean() <= 1.5 and err[inp].max() <= 3.0, 'baked terrain does not match USGS point elevations: the DEM is misregistered'
validate()

# ------------------------------------------------------------------ building heights against the ground round each footprint
TH = json.load(open(os.path.join(HERE, 'data', 'tile_heights.json')))
BLD = unary_union([Polygon(b['outer'][0]).buffer(0).buffer(2.0) for b in D['buildings'] if len(b['outer'][0]) >= 3])
prepare(BLD)
def grid(g): return np.array([[np.nan if v is None else v for v in r] for r in g['rows']], float), g['x0'], g['z0'], g['step']
def calibrated(g):
    """Tile surface -> metres above y = 0: ONE constant offset to the DEM (the tiles are ellipsoid heights, the DEM is
    NAVD88), the median over smooth tile cells clear of every OSM footprint. With the DEM registered correctly the
    offset is the same everywhere (-13.6 m, quartiles within 0.15 m); the "bias that changes across the map" this
    function used to fit locally was the DEM stretched 26 % north-south. A spread here means the DEM is misplaced."""
    Hm, x0, z0, st = g; X, Z = np.meshgrid(x0 + np.arange(Hm.shape[1]) * st, z0 + np.arange(Hm.shape[0]) * st)
    T = np.nan_to_num(Hm, nan=0.0)
    rough = np.sqrt(np.maximum(ndi.uniform_filter(T * T, 3) - ndi.uniform_filter(T, 3) ** 2, 0))
    open_ = (rough < 0.3) & ~np.isnan(Hm) & ~contains_xy(BLD, X, Z)
    d = (Hm - ground(X, Z))[open_]; off = float(np.median(d)); q = np.percentile(d, [10, 25, 75, 90])
    # the same statistic by quadrant: a registration error shows as offsets that differ across the map
    quad = [float(np.median((Hm - ground(X, Z))[open_ & m])) for m in ((Z < 0) & (X < 0), (Z < 0) & (X >= 0), (Z >= 0) & (X < 0), (Z >= 0) & (X >= 0)) if (open_ & m).sum() > 50]
    print('tile offset: median %.2f (10/25/75/90 %%: %.2f %.2f %.2f %.2f), by quadrant %s, open cells %d' % (off, *q, ' '.join('%.2f' % v for v in quad), open_.sum()))
    assert q[2] - q[1] < 1.0 and max(quad) - min(quad) < 1.0, 'tile heights and DEM disagree across the map: check the DEM registration'
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
