#!/usr/bin/env python3
"""Offline generator for the Alexander Hamilton High School campus (Los Angeles) (run manually; needs pillow numpy scipy shapely).
Reads public/campuses/hamilton/campus.json + satellite.jpg + tools/data/tile_heights_fine.json and writes into public/campuses/hamilton/:
  ground_macro.jpg    - cleaned ground albedo (roofs/cars/canopies removed, lawns re-greened)
  ground_mask.png     - surface weights  R=asphalt G=concrete B=synthetic(turf) A=255-dirt*255 (grass = rest)
  roofs.jpg           - satellite crop used for projected flat-roof textures
  surface_classes.png - 1 m class grid (grass, asphalt, concrete, rubber, dirt)
  gen.json            - trees, per-building heights / roof kinds / colours, roofs rect
Usage: python gen.py [debug_dir]
"""
import json, sys, os, math, random
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from shapely.geometry import Polygon, Point, LineString
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/campuses/hamilton')
DBG = sys.argv[1] if len(sys.argv) > 1 else None
D = json.load(open(os.path.join(OUT, 'campus.json')))
img = Image.open(os.path.join(OUT, 'satellite.jpg')).convert('RGB')
A = np.asarray(img).astype(np.float32)
H, W, _ = A.shape
X0, X1, Z0, Z1 = -400.0, 400.0, -360.0, 360.0
sx = W / (X1 - X0); sz = H / (Z1 - Z0)
PLAY = dict(minX=-224, maxX=236, minZ=-196, maxZ=192)
LEAN = (0.0, 0.0)          # this imagery is close to nadir: footprints sit on the roofs
random.seed(11); np.random.seed(11)
ANG = math.radians(18.5); CA, SA = math.cos(ANG), math.sin(ANG)     # the street grid is rotated 18.5 deg (grid east = (cos, sin))
def toW(a, b): return (a * CA - b * SA, a * SA + b * CA)             # grid (a east, b south) -> world (x, z)
def toG(x, z): return (x * CA + z * SA, -x * SA + z * CA)
def grect(a0, b0, a1, b1): return [toW(a0, b0), toW(a1, b0), toW(a1, b1), toW(a0, b1)]
def gmask(a0, b0, a1, b1): return raster(polys=[([grect(a0, b0, a1, b1)], [])])
def stadium(ac, b0, b1, r, n=24):
    pts = [toW(ac + r * math.cos(math.pi + math.pi * i / n), b0 + r * math.sin(math.pi + math.pi * i / n)) for i in range(n + 1)]
    pts += [toW(ac + r * math.cos(math.pi * i / n), b1 + r * math.sin(math.pi * i / n)) for i in range(n + 1)]
    return pts

def P(x, z): return ((x - X0) * sx, (z - Z0) * sz)
def raster(polys=(), lines=()):
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for outers, inners in polys:
        for r in outers: d.polygon([P(x, z) for x, z in r], fill=255)
        for r in inners: d.polygon([P(x, z) for x, z in r], fill=0)
    for pts, wm in lines:
        w = max(1, int(round(wm * sx)))
        pp = [P(x, z) for x, z in pts]
        d.line(pp, fill=255, width=w, joint='curve')
        for p in pp: d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    return np.asarray(m) > 0
def dilate(m, meters): return ndi.distance_transform_edt(~m) <= max(1, int(round(meters * sx)))
def box(x0, z0, x1, z1):
    m = np.zeros((H, W), bool); a = P(x0, z0); b = P(x1, z1); m[max(0, int(a[1])):max(0, int(b[1])), max(0, int(a[0])):max(0, int(b[0]))] = True; return m
def inplay(x, z, pad=0): return PLAY['minX'] - pad < x < PLAY['maxX'] + pad and PLAY['minZ'] - pad < z < PLAY['maxZ'] + pad

R, G, B = A[..., 0], A[..., 1], A[..., 2]
L = (R + G + B) / 3
mx = A.max(axis=2); mn = A.min(axis=2)
S = (mx - mn) / np.maximum(mx, 1)


# ---------------------------------------------------------------- OSM rasters
bld = np.zeros((H, W), bool)
for b in D['buildings']: bld |= raster([(b['outer'], b['inner'])])
bld_d = dilate(bld, 1.0)
ROADW = {'motorway': 16.0, 'motorway_link': 8.0, 'secondary': 20.0, 'tertiary': 11.5, 'residential': 9.6, 'service': 4.6}
STREETS = ('secondary', 'tertiary', 'residential')
road = np.zeros((H, W), bool); street = np.zeros((H, W), bool); walk = np.zeros((H, W), bool); foot = np.zeros((H, W), bool)
for r in D['roads']:
    t = r['tags']; hw = t.get('highway')
    if hw in ('footway', 'path', 'steps', 'cycleway', 'pedestrian'):
        (walk if t.get('footway') == 'sidewalk' else foot).__ior__(raster(lines=[(r['line'], 2.4)]))
    elif hw in ROADW:
        w = ROADW[hw]
        if hw == 'service' and t.get('service') == 'parking_aisle': w = 6.0
        if hw == 'service' and any(-150 < toG(*p)[0] < 178 and -128 < toG(*p)[1] < 66 for p in r['line']): continue   # stale drives across the rebuilt campus
        m = raster(lines=[(r['line'], w)]); road |= m
        if hw in STREETS: street |= m
# campus geometry measured off the imagery, in street-grid coordinates (a east, b south)
TRACK = dict(ac=-106.5, b0=-61.5, b1=36.5, rOut=40.5, rIn=30.7)
track_out = raster(polys=[([stadium(TRACK['ac'], TRACK['b0'], TRACK['b1'], TRACK['rOut'] + 0.6)], [])])
infield = gmask(-137.2, -70, -75.8, 45) & raster(polys=[([stadium(TRACK['ac'], TRACK['b0'], TRACK['b1'], TRACK['rIn'])], [])])
LOTS = [(-80, 87, 46, 161), (66, 44, 176, 67), (151, -30, 176, 12), (124, -134, 162, -129)]                # car parks (asphalt)
ASPHALT = [(-33, -76, 7, 26), (-60, 8, -5, 18), (-66, -112, -34, -76), (-5, 26, 7, 86), (-60, 68, -5, 87)]   # ball courts / service yards
CONCRETE = [(-160, 58, -60, 100), (-158, -98, -147, 60), (-66, -70, -60, 70), (-147, 77, -66, 87), (48, -93, 70, -24), (5, -92, 70, -80), (100, 15, 152, 23),
            (109, -96, 152, -89), (149, -34, 178, -30), (149, 12, 178, 22), (60, -134, 128, -126), (66, 23, 73, 44), (-150, 116, -84, 129), (-168, 96, -147, 163)]
DIRTS = [(5, -25, 68, 25), (-76, -131, 6, -76), (-34, -76, -9, -45), (148, 22, 178, 44)]                    # construction site + staging yards
LAWNS = [(150, -90, 177, -34), (152, 12, 177, 22), (125, -128, 177, -92), (100, -90, 112, 14), (8, -134, 60, -128), (-124, -124, -110, -110)]

# ---------------------------------------------------------------- classification
GRASS, ASPH, CONC, SYN, DIRT = 0, 1, 2, 3, 4
shadow = L < 46
green = (G > R + 4) & (G > B + 6)
tan = (R > G) & (R - B > 30) & (L > 95) & (S > 0.18)
gray = ~green & ~tan & ~shadow
cls = np.full((H, W), 255, np.uint8)
cls[green] = GRASS
cls[tan] = CONC
cls[gray] = ASPH
cls[gray & (L >= 150) & (S < 0.2)] = CONC
cls[bld_d] = 255
unk = cls == 255
idx = ndi.distance_transform_edt(unk, return_distances=False, return_indices=True)
cls = cls[idx[0], idx[1]]
def votes(c, sigma): return ndi.gaussian_filter((cls == c).astype(np.float32), sigma)
v = np.stack([votes(c, 5.0) for c in range(5)], 0)
v[CONC] *= 1.1
cls = v.argmax(0).astype(np.uint8)
# residential blocks: yards are grass, drives and patios concrete; only real car courts (big paved patches) stay asphalt
blocks = ~road
lab, n = ndi.label((cls == ASPH) & blocks)
if n:
    sizes = ndi.sum(np.ones_like(lab, np.float32), lab, index=np.arange(1, n + 1))
    smallA = np.isin(lab, np.nonzero(sizes < 420 * sx * sz)[0] + 1)
    cls[smallA & (L < 70)] = GRASS          # shadow under trees
    cls[smallA & (cls == ASPH)] = CONC
# priors: mapped pavement wins over what the tree canopies / shadows suggest
cls[foot & ~road] = CONC
cls[dilate(walk, 0.3)] = CONC
cls[road] = ASPH
school = raster(polys=[([[toW(a, b) for a, b in [(-160, -134), (178, -134), (178, 67), (48, 67), (48, 163), (-160, 163)]]], [])])
cls[school & ~road] = CONC                # campus hardscape is concrete unless listed as asphalt below
for r_ in LAWNS: cls[gmask(*r_) & ~road] = GRASS
for r_ in CONCRETE: cls[gmask(*r_)] = CONC
for r_ in ASPHALT: cls[gmask(*r_)] = ASPH
for r_ in LOTS: cls[gmask(*r_)] = ASPH
for r_ in DIRTS: cls[gmask(*r_)] = DIRT
cls[track_out] = SYN
cls[infield] = GRASS
parking = np.zeros((H, W), bool)
for r_ in LOTS: parking |= gmask(*r_)
# despeckle: islands under ~30 m2 take the class around them
for c in range(5):
    lab, n = ndi.label(cls == c)
    if n == 0: continue
    sizes = ndi.sum(np.ones_like(lab, np.float32), lab, index=np.arange(1, n + 1))
    small = np.isin(lab, np.nonzero(sizes < 45 * sx * sz)[0] + 1)
    if small.any():
        idx = ndi.distance_transform_edt(small, return_distances=False, return_indices=True)
        cls[small] = cls[idx[0], idx[1]][small]
print('class fractions', [(cls == c).mean().round(3) for c in range(5)])

# ---------------------------------------------------------------- mask (soft weights)
mcls = cls.copy()
mcls[raster(polys=[([stadium(TRACK['ac'], TRACK['b0'], TRACK['b1'], TRACK['rOut'] + 0.6)], [])])] = SYN   # the whole oval is a painted overlay: no grass detail under it
def soft(c, sigma=0.9): return ndi.gaussian_filter((mcls == c).astype(np.float32), sigma)
wA, wC, wS, wD = soft(ASPH), soft(CONC), soft(SYN, 0.6), soft(DIRT, 1.2)
mask = np.stack([wA, wC, wS, 1 - wD], 2)
Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'ground_mask.png'), optimize=True)

# ---------------------------------------------------------------- macro albedo
def norm_blur(val, m, sigma):
    num = ndi.gaussian_filter(np.where(m, val, 0).astype(np.float32), sigma)
    den = ndi.gaussian_filter(m.astype(np.float32), sigma)
    return num / np.maximum(den, 1e-4), den
# canopy = green with strong local texture (lawns are smooth)
Lf = ndi.gaussian_filter(L, 1.0)
tex = np.sqrt(np.maximum(ndi.uniform_filter(Lf * Lf, 9) - ndi.uniform_filter(Lf, 9) ** 2, 0))
canopy = green & ((tex > 9) | (L < 78))
canopy = ndi.gaussian_filter(canopy.astype(np.float32), 2.0) > 0.5
lawn = (cls == GRASS) & green & ~canopy & ~bld_d
# grass: green base modulated by low-frequency luminance; under canopies a darker, mulchy green
Lg, den = norm_blur(L, lawn, 10)
gmean = L[lawn].mean() if lawn.any() else 110.0
var = np.clip(np.where(den > 0.04, Lg / gmean, 0.86), 0.72, 1.3)
under = ndi.gaussian_filter(((cls == GRASS) & ~lawn).astype(np.float32), 5)
noise = ndi.gaussian_filter(np.random.rand(H, W).astype(np.float32), 24); noise = (noise - noise.mean()) / (noise.std() + 1e-6)
var = var * (1 - under) + (0.84 + 0.05 * noise) * under
var = ndi.gaussian_filter(np.clip(var, 0.72, 1.3), 4)
t = np.clip((var - 0.85) / 0.4, 0, 1)[..., None]
g_dark = np.array([66, 84, 44], np.float32); g_light = np.array([118, 128, 66], np.float32)
grass_rgb = g_dark * (1 - t) + g_light * t
# paved: robust local base tone + thin bright markings
pm = ((cls == ASPH) | (cls == CONC)) & ~bld_d
q = 4
small = img.resize((W // q, H // q), Image.BOX)
As = np.asarray(small).astype(np.float32)
pm_s = np.asarray(Image.fromarray((pm & gray).astype(np.uint8) * 255).resize((W // q, H // q), Image.BOX)) > 128
idx = ndi.distance_transform_edt(~pm_s, return_distances=False, return_indices=True)
base_s = np.stack([ndi.percentile_filter(As[..., c][idx[0], idx[1]], 62, size=11) for c in range(3)], 2)
base_s = ndi.gaussian_filter(base_s, (2, 2, 0))
base = np.asarray(Image.fromarray(base_s.clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32)
base = ndi.gaussian_filter(base, (14, 14, 0))
bl = base.mean(2, keepdims=True)
gmean_p = float(bl[pm].mean())
bl = gmean_p + np.clip(bl - gmean_p, -22, 22) * 0.55
base = bl + (base - bl) * 0.25
conc_rgb = np.clip(bl * 0.25 + 124 + (base - bl), 0, 255) * np.array([0.87, 0.855, 0.82], np.float32)
base = base * 0.52
th = np.stack([A[..., c] - ndi.grey_opening(A[..., c], size=(6, 6)) for c in range(3)], 2)
thL = th.mean(2)
line = np.clip((thL - 24) / 26, 0, 1) * 0.75 * (cls == ASPH) * gray * ~bld_d * road
blob = ndi.grey_opening(line, size=(3, 3))
line = np.clip(line - 4 * ndi.grey_dilation(blob, size=(7, 7)), 0, 1)
line = ndi.gaussian_filter(line, 0.5)[..., None] * 0.0     # street and stall paint are geometry in the builder: keep the asphalt clean
linecol = np.clip(A * 1.05 + 10, 0, 215)
paved_rgb = base * (1 - line) + linecol * line
dirt_rgb = np.array([150, 124, 84], np.float32) * (0.92 + 0.06 * noise)[..., None]
syn_rgb = np.array([168, 74, 56], np.float32) * np.ones((H, W, 1), np.float32)

wG = np.clip(1 - wA - wC - wS - wD, 0, 1)
macro = (grass_rgb * wG[..., None] + paved_rgb * wA[..., None] + conc_rgb * wC[..., None] + syn_rgb * wS[..., None] + dirt_rgb * wD[..., None])
tot = (wG + wA + wC + wS + wD)[..., None]
macro = np.clip(macro / np.maximum(tot, 1e-3), 0, 255).astype(np.uint8)
Image.fromarray(macro).save(os.path.join(OUT, 'ground_macro.jpg'), quality=88)

# roofs: the whole satellite image doubles as the roof atlas (flat roofs are projected from it)
img.resize((W * 3 // 4, H * 3 // 4), Image.LANCZOS).save(os.path.join(OUT, 'roofs.jpg'), quality=88)
roofs_rect = dict(minX=X0, maxX=X1, minZ=Z0, maxZ=Z1)


# ---------------------------------------------------------------- buildings: heights, roof kind, colours
TH = json.load(open(os.path.join(HERE, 'data', 'tile_heights_fine.json')))
Hm = np.array([[np.nan if v is None else v for v in r] for r in TH['rows']], float); gx0, gz0, st = TH['x0'], TH['z0'], TH['step']
def sample(P_, ring_in, ring_out):
    ins, outs = [], []
    minx, minz, maxx, maxz = P_.bounds
    i0 = max(0, int(math.floor((minx - 7 - gx0) / st))); i1 = min(Hm.shape[1] - 1, int(math.ceil((maxx + 7 - gx0) / st)))
    j0 = max(0, int(math.floor((minz - 7 - gz0) / st))); j1 = min(Hm.shape[0] - 1, int(math.ceil((maxz + 7 - gz0) / st)))
    for j in range(j0, j1 + 1):
        for i in range(i0, i1 + 1):
            v = Hm[j, i]
            if np.isnan(v): continue
            p = Point(gx0 + i * st, gz0 + j * st)
            if ring_in.contains(p): ins.append(v)
            elif ring_out.contains(p): outs.append(v)
    return ins, outs
buildings = {}
for b in D['buildings']:
    Pb = Polygon(b['outer'][0])
    if not Pb.is_valid: Pb = Pb.buffer(0)
    if Pb.is_empty or Pb.area < 12 or Pb.geom_type != 'Polygon': continue
    cx, cz = Pb.centroid.x, Pb.centroid.y
    if not (X0 + 4 < cx < X1 - 4 and Z0 + 4 < cz < Z1 - 4): continue
    ring_in = Pb.buffer(-1.0); ring_out = Pb.buffer(5.5).difference(Pb.buffer(2.0))
    if ring_in.is_empty or ring_in.geom_type != 'Polygon': ring_in = Pb
    t_ = b['tags']; osm_h = float(t_['height']) if t_.get('height', '').replace('.', '').isdigit() else None
    ins, outs = sample(Pb, ring_in, ring_out) if (gx0 + 8 < cx < TH['x1'] - 8 and gz0 + 8 < cz < TH['z1'] - 8) else ([], [])
    h, kind, rise = (osm_h or 5.0), 'hip', 1.6
    if len(ins) >= 2 and len(outs) >= 3:
        g = float(np.percentile(outs, 15)); a = np.array(ins) - g
        med = float(np.median(a)); lo = float(np.percentile(a, 25)); hi = float(np.percentile(a, 92))
        flat = (hi - lo) < 1.1 or Pb.area > 420
        if flat: h, kind, rise = max(3.0, min(med, 24.0)), 'flat', 0.0
        else: h, kind, rise = max(2.8, min(lo, 11.0)), 'hip', float(np.clip(hi - lo, 1.0, 3.2))
        if osm_h and abs(h - osm_h) > 4 and kind == 'flat': h = max(3.0, min(osm_h, 24.0))     # tree canopy over the roof / stale tiles: trust the county height
    else:
        # outside the tile grid: LA County height tag; big or boxy footprints are flat-roofed apartments
        o = Pb.minimum_rotated_rectangle
        flat = Pb.area > 330 or (osm_h or 0) > 7.5
        if flat: kind, rise, h = 'flat', 0.0, max(3.0, min(osm_h or 6.5, 30.0))
        else: kind, rise, h = 'hip', 1.6, max(2.8, min((osm_h or 5.0) - 1.2, 8.0))
    msk = raster([([list(ring_in.exterior.coords)], [])])
    col = np.median(A[msk], axis=0) if msk.sum() > 8 else np.array([120, 110, 100])
    if kind == 'hip':
        lum = float(col.mean()); col = col * (max(lum, 92.0) / max(lum, 1.0)); col = np.clip(col * 0.75 + np.array([112, 104, 98]) * 0.25, 60, 190)
    buildings[str(b['id'])] = dict(h=round(h, 1), roof=kind, rise=round(rise, 1), col=[int(v) for v in col], area=round(Pb.area), play=bool(inplay(cx, cz, 26)))
print('buildings', len(buildings), 'in play', sum(1 for v in buildings.values() if v['play']), 'flat', sum(1 for v in buildings.values() if v['roof'] == 'flat'), 'flat in play', sum(1 for v in buildings.values() if v['play'] and v['roof'] == 'flat'))

# ---------------------------------------------------------------- trees
excl = dilate(bld, 2.2) | dilate(road | parking, 1.0) | track_out
for r_ in ASPHALT + DIRTS + [(-160, -100, -60, 100), (-160, 96, -80, 163), (48, -93, 70, -24), (66, 23, 178, 67), (112, -92, 152, 18)]: excl |= gmask(*r_)
cano = ndi.uniform_filter(canopy.astype(np.float32), int(6 * sx))
trees = []; tgrid = {}
def ok_spacing(x, z, d):
    gx, gz = int(x // 12), int(z // 12)
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for (tx, tz) in tgrid.get((gx + i, gz + j), []):
                if (tx - x) ** 2 + (tz - z) ** 2 < d * d: return False
    return True
def add_tree(x, z, kind, s):
    tgrid.setdefault((int(x // 12), int(z // 12)), []).append((x, z))
    trees.append([round(x, 1), round(z, 1), kind, round(s, 2)])
def free(x, z):
    px, pz = P(x, z); px = int(px); pz = int(pz)
    return 0 <= px < W and 0 <= pz < H and not excl[pz, px]
# hand-placed campus trees in grid coords (a, b, kind 0 broadleaf / 1 conifer, scale): the big figs on the Robertson
# lawn, Italian cypresses against Brown Hall, the quad and courtyard trees, the row along Cattaraugus
HAND = [(158, -84, 0, 1.25), (170, -72, 0, 1.3), (157, -62, 0, 1.2), (171, -50, 0, 1.25), (158, -42, 0, 1.1), (171, 17, 0, 1.2), (158, 17.5, 0, 1.0),
        (135, -112, 0, 1.15), (150, -104, 0, 1.2), (166, -112, 0, 1.25), (144, -122, 0, 1.0), (165, -97, 0, 1.1), (128, -98, 0, 0.9),
        (151.5, -80, 1, 1.25), (151.5, -66, 1, 1.3), (151.5, -14, 1, 1.3), (151.5, 2, 1, 1.25), (154, -48, 1, 1.0), (154, -27, 1, 1.0),
        (105, -78, 0, 1.0), (106, -58, 0, 1.1), (105, -36, 0, 1.0), (106, -16, 0, 1.1), (105, 4, 0, 0.95),
        (58, -86, 0, 0.9), (53, -68, 0, 0.85), (62, -54, 0, 0.9), (55, -38, 0, 0.85),
        (16, -131, 0, 0.9), (30, -131, 0, 0.95), (44, -131, 0, 0.9), (58, -131, 0, 0.9), (72, -130, 0, 0.9), (-117, -117, 0, 1.0), (-134, -108, 0, 0.9),
        (-52, 78, 0, 0.8), (-122, 92, 0, 0.75), (-100, 110, 0, 0.7),
        (120, 60, 0, 0.8)]
for (a, b, k, s) in HAND:
    x, z = toW(a, b); add_tree(x, z, k, s)
# street trees along the residential streets (both sides, in the parkway strip), where the imagery has canopy
for r in D['roads']:
    hw = r['tags'].get('highway')
    if hw not in STREETS: continue
    ls = LineString(r['line']); off = ROADW[hw] / 2 + 1.3
    for side in (1, -1):
        d = random.uniform(4, 14)
        while d < ls.length:
            p = ls.interpolate(d); p2 = ls.interpolate(min(d + 1, ls.length))
            tx, tz = p2.x - p.x, p2.y - p.y; ln = math.hypot(tx, tz) or 1
            x = p.x + side * (-tz / ln) * off; z = p.y + side * (tx / ln) * off
            px, pz = P(x, z); px = int(min(max(px, 0), W - 1)); pz = int(min(max(pz, 0), H - 1))
            if free(x, z) and ok_spacing(x, z, 9) and cano[pz, px] > 0.2: add_tree(x, z, 0, random.uniform(0.55, 0.85))
            d += random.uniform(11, 17)
school_core = raster(polys=[([[toW(a, b) for a, b in [(-160, -134), (150, -134), (150, 67), (48, 67), (48, 163), (-160, 163)]]], [])])
for _ in range(120000):
    x = random.uniform(X0 + 3, X1 - 3); z = random.uniform(Z0 + 3, Z1 - 3)
    if not free(x, z): continue
    px, pz = P(x, z); px = int(px); pz = int(pz)
    if school_core[pz, px]: continue                         # campus trees are the hand-placed ones
    pr = min(1.0, cano[pz, px] * 1.5) ** 1.6
    if random.random() > pr: continue
    ip = inplay(x, z)
    if not ok_spacing(x, z, 11.0 if ip else 9.5): continue
    dark = L[pz, px] < 62
    add_tree(x, z, 1 if random.random() < (0.12 if dark else 0.04) else 0, random.uniform(0.55, 0.95))
print('trees', len(trees), 'in play', sum(1 for t in trees if inplay(t[0], t[1])))

json.dump(dict(trees=trees, buildings=buildings, roofs=roofs_rect, lean=LEAN, play=PLAY, ang=18.5, track=TRACK, classes=['grass', 'asphalt', 'concrete', 'rubber', 'dirt']),
          open(os.path.join(OUT, 'gen.json'), 'w'), separators=(',', ':'))
cm = Image.fromarray(cls).resize((int(X1 - X0), int(Z1 - Z0)), Image.NEAREST)
cm.save(os.path.join(OUT, 'surface_classes.png'), optimize=True)

if DBG:
    os.makedirs(DBG, exist_ok=True)
    pal = np.array([[90, 140, 60], [70, 70, 75], [200, 200, 195], [200, 60, 50], [190, 150, 100]], np.uint8)
    im = Image.fromarray(pal[cls]); d = ImageDraw.Draw(im)
    for t in trees:
        p = P(t[0], t[1]); r = 9
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], outline=(0, 60, 0) if t[2] == 0 else (0, 0, 120), width=3)
    for b in D['buildings']:
        v = buildings.get(str(b['id']))
        if v: d.line([P(x, z) for x, z in b['outer'][0] + b['outer'][0][:1]], fill=(255, 0, 255) if v['roof'] == 'flat' else (255, 255, 0), width=2)
    a = P(PLAY['minX'], PLAY['minZ']); b_ = P(PLAY['maxX'], PLAY['maxZ']); d.rectangle([a[0], a[1], b_[0], b_[1]], outline=(255, 255, 255), width=3)
    im.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(DBG, 'classes.jpg'), quality=80)
    Image.fromarray(macro).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(DBG, 'macro.jpg'), quality=80)
