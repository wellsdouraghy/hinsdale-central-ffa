#!/usr/bin/env python3
"""Offline generator for the Branson campus (run manually; needs pillow numpy scipy shapely).
Reads public/campuses/branson/campus.json + satellite.jpg + tools/data/tile_heights.json and writes into public/campuses/branson/:
  ground_macro.jpg    - cleaned ground albedo (roofs/cars/canopies removed, lawns re-greened)
  ground_mask.png     - surface weights  R=asphalt G=concrete B=synthetic(turf) A=255-dirt*255 (grass = rest)
  roofs.jpg           - satellite crop used for projected flat-roof textures
  surface_classes.png - 1 m class grid (grass, asphalt, concrete, rubber, dirt)
  gen.json            - trees, per-building heights / roof kinds / colours, roofs rect
Usage: python gen.py [debug_dir]

AFTER this script run tools/terrain.py: it bakes the real ground (public/campuses/branson/terrain.bin, USGS 3DEP) and patches
gen.json in place: per-building heights against the ground round each footprint (this script still measures against the
lowest ground nearby, which reads hillside houses a storey too tall), the un-faded backdrop grid, tree base heights.
Then tools/mask_fix.mjs and tools/macro_fix.js as before. Street View attributes: tools/streetview.py + tools/facades.py.
"""
import json, sys, os, math, random
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from shapely.geometry import Polygon, Point, LineString
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/campuses/branson')
DBG = sys.argv[1] if len(sys.argv) > 1 else None
D = json.load(open(os.path.join(OUT, 'campus.json')))
img = Image.open(os.path.join(OUT, 'satellite.jpg')).convert('RGB')
A = np.asarray(img).astype(np.float32)
H, W, _ = A.shape
X0, X1, Z0, Z1 = -330.0, 330.0, -300.0, 300.0
sx = W / (X1 - X0); sz = H / (Z1 - Z0)
PLAY = dict(minX=-215, maxX=82, minZ=-100, maxZ=172)
LEAN = (0.0, 0.0)          # this imagery is close to nadir: footprints sit on the roofs
random.seed(11); np.random.seed(11)
# open play space the canopy scan must keep clear (x0, z0, x1, z1): the car-park loop, the dining terrace, the visitor lot, the quad lawn
NO_TREES = [(-118, 28, -62, 70), (-122, 22, -98, 42), (-22, -30, 14, 0), (-170, 118, -148, 150), (-124, -66, -62, -40)]
# specimen trees named on the school's campus map (kind 0 broadleaf, 1 conifer; x, z, kind, size)
LANDMARK_TREES = [(13.5, -40.0, 1, 2.3), (62.0, -8.0, 1, 2.0), (-112.0, 12.0, 0, 1.5)]   # Blue Atlas Cedar by the gate, Deodar Cedar at New House, the Live Oak at the Commons

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
areas = {a['id']: a for a in D['areas']}
def apoly(i): return [(areas[i]['outer'], areas[i]['inner'])]
bld = np.zeros((H, W), bool)
for b in D['buildings']: bld |= raster([(b['outer'], b['inner'])])
bld_d = dilate(bld, 1.0)
TURF = 9000000101; TENNIS = 9000000102
turf = raster(apoly(TURF))
pool_deck = np.zeros((H, W), bool)
tennis = raster(apoly(TENNIS))
parking = np.zeros((H, W), bool)
for a in D['areas']:
    if a['tags'].get('amenity') == 'parking': parking |= raster([(a['outer'], a['inner'])])
ROADW = {'primary': 13.0, 'tertiary': 8.0, 'residential': 6.4, 'unclassified': 6.0, 'service': 4.4}   # Ross lanes are narrow, no kerb parking
STREETS = ('primary', 'tertiary', 'residential', 'unclassified')
road = np.zeros((H, W), bool); street = np.zeros((H, W), bool); walkband = np.zeros((H, W), bool); foot = np.zeros((H, W), bool)
for r in D['roads']:
    t = r['tags']; hw = t.get('highway')
    if hw in ('footway', 'path', 'steps', 'cycleway'): foot |= raster(lines=[(r['line'], 2.2)])
    elif hw in ROADW:
        w = ROADW[hw]
        if hw == 'service' and t.get('service') == 'parking_aisle': w = 6.0
        road |= raster(lines=[(r['line'], w)])
        if hw in STREETS:
            street |= raster(lines=[(r['line'], w)])
            if hw in ('primary', 'tertiary'): walkband |= raster(lines=[(r['line'], w + 4.4)])   # the hill lanes have no sidewalks

# ---------------------------------------------------------------- classification
GRASS, ASPH, CONC, SYN, DIRT = 0, 1, 2, 3, 4
shadow = L < 52
green = (G > R + 4) & (G > B + 8)
tan = (R > G) & (R - B > 34) & (L > 95) & (S > 0.2)
gray = ~green & ~tan & ~shadow
cls = np.full((H, W), 255, np.uint8)
cls[green] = GRASS
cls[tan] = DIRT
cls[gray] = ASPH
cls[gray & (L >= 168) & (S < 0.16)] = CONC
cls[bld_d] = 255
unk = cls == 255
idx = ndi.distance_transform_edt(unk, return_distances=False, return_indices=True)
cls = cls[idx[0], idx[1]]
def votes(c, sigma): return ndi.gaussian_filter((cls == c).astype(np.float32), sigma)
v = np.stack([votes(c, 3.0) for c in range(5)], 0)
v[CONC] *= 1.1
cls = v.argmax(0).astype(np.uint8)
# dirt only where it is real open ground (the dry hillside NE of campus); roofs / paving elsewhere read tan too
cls[cls == DIRT] = GRASS     # wooded town: bare tan patches are mulch / dry lawn (and roofs are masked)
# OSM priors: pavement where the map says so (canopies hide much of it in the imagery)
sidewalk = walkband & ~street & ~(green & ~dilate(street, 3.2))
cls[sidewalk & (cls != GRASS)] = CONC
cls[sidewalk & dilate(street, 3.0)] = CONC
cls[foot & ~road] = CONC
cls[parking] = ASPH
cls[road] = ASPH
cls[pool_deck & ~road] = CONC
cls[turf] = SYN
cls[tennis] = CONC
# under the oaks and redwoods the photo is shadow: anything still 'asphalt' more than 7 m from a road / car park / building is woodland floor
far_paved = ~dilate(road | parking | bld, 7.0)
cls[(cls == ASPH) & far_paved & (ndi.uniform_filter((green | shadow).astype(np.float32), int(10 * sx)) > 0.55)] = GRASS
print('class fractions', [(cls == c).mean().round(3) for c in range(5)])

# ---------------------------------------------------------------- mask (soft weights)
# visual-only paving for the mask (ground shader + grass blades); the class grid gameplay reads keeps `cls` as it is.
# Grid-aligned rectangles (cx, cz, w, d), rotated 7.2 deg like the street grid: the Library / Leadership Center courtyard.
# tools/mask_fix.mjs patches an existing ground_mask.png the same way without the Python imaging stack, and also makes
# the car parks wall-to-wall asphalt and despeckles concrete / grass blobs: RUN IT AFTER THIS SCRIPT (node src/campuses/branson/tools/mask_fix.mjs).
mcls = cls.copy()
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
g_dark = np.array([64, 88, 42], np.float32); g_light = np.array([116, 134, 60], np.float32)
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
conc_rgb = np.clip(bl * 0.25 + 124 + (base - bl), 0, 255) * np.array([1.0, 0.985, 0.95], np.float32)
base = base * 0.52
th = np.stack([A[..., c] - ndi.grey_opening(A[..., c], size=(6, 6)) for c in range(3)], 2)
thL = th.mean(2)
line = np.clip((thL - 24) / 26, 0, 1) * 0.75 * (cls == ASPH) * gray * ~bld_d * road
blob = ndi.grey_opening(line, size=(3, 3))
line = np.clip(line - 4 * ndi.grey_dilation(blob, size=(7, 7)), 0, 1)
line = ndi.gaussian_filter(line, 0.5)[..., None]
linecol = np.clip(A * 1.05 + 10, 0, 215)
paved_rgb = base * (1 - line) + linecol * line
dirt_rgb = np.array([150, 124, 84], np.float32) * (0.92 + 0.06 * noise)[..., None]
syn_rgb = np.array([44, 104, 54], np.float32) * np.ones((H, W, 1), np.float32)

wG = np.clip(1 - wA - wC - wS - wD, 0, 1)
macro = (grass_rgb * wG[..., None] + paved_rgb * wA[..., None] + conc_rgb * wC[..., None] + syn_rgb * wS[..., None] + dirt_rgb * wD[..., None])
tot = (wG + wA + wC + wS + wD)[..., None]
macro = np.clip(macro / np.maximum(tot, 1e-3), 0, 255).astype(np.uint8)
Image.fromarray(macro).save(os.path.join(OUT, 'ground_macro.jpg'), quality=88)

# roofs: the whole satellite image doubles as the roof atlas (flat roofs are projected from it)
img.save(os.path.join(OUT, 'roofs.jpg'), quality=88)
roofs_rect = dict(minX=X0, maxX=X1, minZ=Z0, maxZ=Z1)

# ---------------------------------------------------------------- buildings: heights, roof kind, colours
TH = json.load(open(os.path.join(HERE, 'data', 'tile_heights.json')))
def grid(g): return np.array([[np.nan if v is None else v for v in r] for r in g['rows']], float), g['x0'], g['z0'], g['step']
FINE = grid(TH['fine']); WIDE = grid(TH['wide'])
def sample(g, P_, ring_in, ring_out):
    Hm, gx0, gz0, st = g; ins, outs = [], []
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
    if Pb.is_empty or Pb.area < 12: continue
    c = Pb.representative_point(); cx, cz = Pb.centroid.x, Pb.centroid.y
    if not (X0 + 4 < cx < X1 - 4 and Z0 + 4 < cz < Z1 - 4): continue
    ring_in = Pb.buffer(-1.0); ring_out = Pb.buffer(5.5).difference(Pb.buffer(2.0))
    if ring_in.is_empty: ring_in = Pb
    fine_ok = -214 < cx < 218 and -214 < cz < 218
    ins, outs = sample(FINE if fine_ok else WIDE, Pb, ring_in, ring_out)
    h, kind, rise = 6.0, 'hip', 1.8
    if len(ins) >= 2 and len(outs) >= 3:
        g = float(np.percentile(outs, 15)); a = np.array(ins) - g
        med = float(np.median(a)); lo = float(np.percentile(a, 25)); hi = float(np.percentile(a, 92))
        spread = hi - lo
        flat = spread < 1.3 or Pb.area > 520
        # the hillside streets north of Mission Ave are all pitched-roof houses (the tile samples there are too coarse to tell)
        t_ = b['tags']; homey = t_.get('building') in ('house', 'residential', 'detached', 'garage')
        if Pb.area < 430 and not t_.get('name'): flat = False; hi = max(hi, lo + 1.5)   # Ross houses are all pitched
        if flat: h, kind, rise = max(3.0, min(med, 22.0)), 'flat', 0.0
        else: h, kind, rise = max(2.8, min(lo, 12.0)), 'hip', float(np.clip(hi - lo, 1.2, 4.0))
    # colours from the imagery: roof = median over the footprint core
    msk = raster([([list(ring_in.exterior.coords)] if ring_in.geom_type == 'Polygon' else [b['outer'][0]], [])])
    col = np.median(A[msk], axis=0) if msk.sum() > 8 else np.array([120, 110, 100])
    if kind == 'hip':   # roof colour: lift the shadowed side of the imagery to a believable shingle tone
        lum = float(col.mean()); col = col * (max(lum, 92.0) / max(lum, 1.0)); col = np.clip(col * 0.75 + np.array([112, 104, 98]) * 0.25, 60, 190)
    buildings[str(b['id'])] = dict(h=round(h, 1), roof=kind, rise=round(rise, 1), col=[int(v) for v in col], area=round(Pb.area), play=bool(inplay(cx, cz, 26)))
print('buildings', len(buildings), 'in play', sum(1 for v in buildings.values() if v['play']), 'flat', sum(1 for v in buildings.values() if v['roof'] == 'flat'))

# ---------------------------------------------------------------- trees
excl = dilate(bld, 2.0) | dilate(road | parking, 0.8) | (cls == SYN) | pool_deck
excl |= dilate(raster(apoly(TURF)), 2) | dilate(tennis, 1.5)
# keep sight lines / play space open: hand-authored no-tree boxes (x0, z0, x1, z1)
for (x0, z0, x1, z1) in NO_TREES:
    excl |= box(x0, z0, x1, z1)
cano = ndi.uniform_filter(canopy.astype(np.float32), int(6 * sx))
trees = []
tgrid = {}
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
# hand-placed campus trees (kind 0 broadleaf, 1 conifer): the redwood / cedar grove on the circle, palms' stand-ins,
# the row along Mission Ave south of the field, the oaks east of the field
HAND = LANDMARK_TREES
for (x, z, k, s) in HAND: add_tree(x, z, k, s)
# street trees on the downtown blocks (south of Mission Ave)
for r in D['roads']:
    hw = r['tags'].get('highway')
    if hw not in STREETS: continue
    ls = LineString(r['line']); off = ROADW[hw] / 2 + 1.5
    for side in (1, -1):
        d = random.uniform(4, 14)
        while d < ls.length:
            p = ls.interpolate(d); p2 = ls.interpolate(min(d + 1, ls.length))
            tx, tz = p2.x - p.x, p2.y - p.y; ln = math.hypot(tx, tz) or 1
            x = p.x + side * (-tz / ln) * off; z = p.y + side * (tx / ln) * off
            px, pz = P(x, z); px = int(min(max(px, 0), W - 1)); pz = int(min(max(pz, 0), H - 1))
            if hw in ('primary', 'tertiary') and free(x, z) and ok_spacing(x, z, 9) and cano[pz, px] > 0.22: add_tree(x, z, 0, random.uniform(0.5, 0.75))
            d += random.uniform(11, 17)
# canopy-driven trees (yards, hillside woods)
for _ in range(90000):
    x = random.uniform(X0 + 3, X1 - 3); z = random.uniform(Z0 + 3, Z1 - 3)
    if not free(x, z): continue
    px, pz = P(x, z); px = int(px); pz = int(pz)
    pr = min(1.0, cano[pz, px] * 1.5) ** 1.6
    if random.random() > pr: continue
    ip = inplay(x, z)
    if not ok_spacing(x, z, 10.5 if ip else 9.0): continue
    dark = L[pz, px] < 70
    add_tree(x, z, 1 if random.random() < (0.2 if dark else 0.07) else 0, random.uniform(0.55, 0.98))
print('trees', len(trees), 'in play', sum(1 for t in trees if inplay(t[0], t[1])))

terrain = None   # tools/terrain.py bakes the real ground (USGS 3DEP) and the backdrop grid
json.dump(dict(trees=trees, buildings=buildings, terrain=terrain, roofs=roofs_rect, lean=LEAN, play=PLAY, classes=['grass', 'asphalt', 'concrete', 'rubber', 'dirt']),
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
    im.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(DBG, 'classes.jpg'), quality=85)
    Image.fromarray(macro).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(DBG, 'macro.jpg'), quality=85)
