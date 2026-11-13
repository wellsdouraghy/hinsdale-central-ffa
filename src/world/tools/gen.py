#!/usr/bin/env python3
"""Offline generator for the world module (run manually; needs pillow numpy scipy shapely).
Reads public/data/campus.json + the satellite image and writes into public/assets/world/:
  ground_macro.jpg  - cleaned ground albedo (shadows/cars removed, grass re-greened)
  ground_mask.png   - surface weights  R=asphalt G=concrete B=synthetic(track/turf/court) A=255-dirt*255 (grass = rest)
  roofs.jpg         - satellite crop of the play area used for projected roof textures
  gen.json          - school wings (heights), tree positions, house roof colours
Usage: python gen.py [debug_dir]
"""
import json, sys, os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
from shapely.geometry import Polygon, box, Point, LineString, MultiPolygon
from shapely.ops import unary_union
from shapely import affinity
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/assets/world'); os.makedirs(OUT, exist_ok=True)
DBG = sys.argv[1] if len(sys.argv) > 1 else None
D = json.load(open(os.path.join(ROOT, 'public/data/campus.json')))
img = Image.open(os.path.join(ROOT, 'public/assets/satellite/campus_z19.jpg')).convert('RGB')
A = np.asarray(img).astype(np.float32)
H, W, _ = A.shape
X0, X1, Z0, Z1 = -394.85, 394.85, -305.44, 305.44
sx = W / (X1 - X0); sz = H / (Z1 - Z0)
PLAY = dict(minX=-222, maxX=292, minZ=-212, maxZ=214)
LEAN = (3.5 / 10.0, 2.0 / 10.0)   # imagery is off-nadir: roofs appear shifted by LEAN*height
random.seed(7); np.random.seed(7)

def P(x, z): return ((x - X0) * sx, (z - Z0) * sz)
def raster(polys=(), lines=(), dx=0, dz=0):
    """polys: list of (outer_rings, inner_rings); lines: list of (pts, width_m)"""
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for outers, inners in polys:
        for r in outers: d.polygon([P(x + dx, z + dz) for x, z in r], fill=255)
        for r in inners: d.polygon([P(x + dx, z + dz) for x, z in r], fill=0)
    for pts, wm in lines:
        w = max(1, int(round(wm * sx)))
        pp = [P(x, z) for x, z in pts]
        d.line(pp, fill=255, width=w, joint='curve')
        for p in pp: d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    return np.asarray(m) > 0
def dilate(m, meters): 
    r = max(1, int(round(meters * sx)))
    return ndi.distance_transform_edt(~m) <= r
def erode(m, meters):
    r = max(1, int(round(meters * sx)))
    return ndi.distance_transform_edt(m) > r

R, G, B = A[..., 0], A[..., 1], A[..., 2]
L = (R + G + B) / 3
mx = A.max(axis=2); mn = A.min(axis=2)
S = (mx - mn) / np.maximum(mx, 1)

# ---------------------------------------------------------------- OSM rasters
SCHOOL_ID = 7822857
def bheight(b):
    t = b['tags']
    if b['id'] == SCHOOL_ID: return 10.0
    if t.get('building') == 'garage': return 3.0
    return 6.5
# Only school-owned structures are built in 3D; the surrounding neighbourhood is repainted as wooded lawn.
KEEP = {SCHOOL_ID, 587068096, 227528871, 227528875, 1443736359}
bld = np.zeros((H, W), bool)
for b in D['buildings']:
    if b['id'] not in KEEP: continue
    h = bheight(b)
    bld |= raster([(b['outer'], b['inner'])])
    bld |= raster([(b['outer'], b['inner'])], dx=LEAN[0] * h, dz=LEAN[1] * h)
bld_d = dilate(bld, 1.2)

areas = {a['id']: a for a in D['areas']}
def apoly(i): return [(areas[i]['outer'], areas[i]['inner'])]
turf_ids = [220203558, 220203563]
tennis = raster(apoly(220203565))
track = raster([(areas[2912049]['outer'], [])])
turf = raster(apoly(220203558)) | raster(apoly(220203563))
parking = np.zeros((H, W), bool)
baseball = np.zeros((H, W), bool)
for a in D['areas']:
    t = a['tags']
    if t.get('amenity') == 'parking': parking |= raster([(a['outer'], a['inner'])])
    if t.get('sport') == 'baseball': baseball |= raster([(a['outer'], a['inner'])])
baseball = dilate(baseball, 6)
ROADW = {'secondary': 13.0, 'tertiary': 10.0, 'residential': 8.0, 'service': 5.5}
road = np.zeros((H, W), bool); foot = np.zeros((H, W), bool)
for r in D['roads']:
    hw = r['tags'].get('highway')
    if hw == 'footway': foot |= raster(lines=[(r['line'], 2.2)])
    elif hw in ROADW: road |= raster(lines=[(r['line'], ROADW[hw])])

# ---------------------------------------------------------------- classification
shadow = L < 62
paved_c = (S < 0.30) & (L > 92) & ~shadow
red = (R - G > 22) & (R > 110)
turfgreen = (G - R > 18) & (G - B > 12)
dirtc = (R - G > 6) & (R - B > 38) & (L > 105) & ~red
GRASS, ASPH, CONC, SYN, DIRT = 0, 1, 2, 3, 4
cls = np.full((H, W), 255, np.uint8)           # 255 = unknown
cls[~shadow & ~paved_c] = GRASS
foot_d = dilate(foot, 1.5)
cls[paved_c] = ASPH
cls[paved_c & ((L >= 190) | (foot_d & (L >= 150)))] = CONC
cls[paved_c & foot & ~road] = CONC
cls[paved_c & road] = ASPH
# shadows: use OSM prior where available
cls[shadow & road] = ASPH
cls[shadow & foot & ~road] = CONC
cls[parking] = ASPH
# (infield clay is painted procedurally at runtime: see fields.js)
syn = tennis | turf | (dilate(track, 1.0) & (red | turfgreen | (L > 175)))
cls[bld_d] = 255
# fill unknown with nearest known
unk = cls == 255
idx = ndi.distance_transform_edt(unk, return_distances=False, return_indices=True)
cls = cls[idx[0], idx[1]]
# majority smoothing (removes cars/branches speckle): per-class blurred votes
def votes(c, sigma): return ndi.gaussian_filter((cls == c).astype(np.float32), sigma)
v = np.stack([votes(c, 2.2) for c in range(5)], 0)
v[CONC] *= 1.15   # keep thin sidewalks alive
cls = v.argmax(0).astype(np.uint8)
cls[syn] = SYN
# ---- outside the school grounds: keep only the street network (+ kerb-side sidewalks), everything else is lawn
grounds = raster([(areas[8286233]['outer'], [])])
campus = dilate(grounds, 16)
street = np.zeros((H, W), bool); walk = np.zeros((H, W), bool)
for r in D['roads']:
    hw = r['tags'].get('highway')
    if hw in ('secondary', 'tertiary', 'residential'): street |= raster(lines=[(r['line'], ROADW[hw] + 3.0)])
    elif hw == 'footway': walk |= raster(lines=[(r['line'], 2.6)])
walk &= dilate(street, 7)
outside = ~campus
was_paved = (cls == ASPH) | (cls == CONC)
cls[outside & ~(was_paved & (street | walk))] = GRASS
cls[outside & was_paved & walk & ~street] = CONC
repaint = outside & ~street & ~walk          # former houses / driveways / yards
# the water tower's leaning image smears over the lawn: force grass there
a_ = P(-50, 104); b_ = P(-10, 142); cls[int(a_[1]):int(b_[1]), int(a_[0]):int(b_[0])] = np.where(cls[int(a_[1]):int(b_[1]), int(a_[0]):int(b_[0])] == SYN, SYN, GRASS)
# grass under/around building footprints inside lots stays whatever was filled.
print('class fractions', [(cls == c).mean().round(3) for c in range(5)])

# ---------------------------------------------------------------- mask (soft weights)
def soft(c, sigma=0.9): return ndi.gaussian_filter((cls == c).astype(np.float32), sigma)
wA, wC, wS, wD = soft(ASPH), soft(CONC), soft(SYN, 0.6), soft(DIRT, 1.2)
mask = np.stack([wA, wC, wS, 1 - wD], 2)
Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'ground_mask.png'), optimize=True)

# ---------------------------------------------------------------- macro albedo
def norm_blur(val, m, sigma):
    num = ndi.gaussian_filter(np.where(m, val, 0).astype(np.float32), sigma)
    den = ndi.gaussian_filter(m.astype(np.float32), sigma)
    return num / np.maximum(den, 1e-4), den
macro = A.copy()
# grass: green base modulated by low-frequency satellite luminance
twr = np.zeros((H, W), bool); twr[int(a_[1]):int(b_[1]), int(a_[0]):int(b_[0])] = True
gm = (cls == GRASS) & ~shadow & ~bld_d & ~twr
Lg, den = norm_blur(L, gm, 10)
gmean = L[gm].mean()
var = np.clip(np.where(den > 0.02, Lg / gmean, 1.0), 0.72, 1.3)
var = np.where(ndi.gaussian_filter(repaint.astype(np.float32), 6) > 0.02, 0.9 + 0.12 * ndi.gaussian_filter(np.random.rand(H, W).astype(np.float32), 40) / 0.012 * 0.0 + 0.0, var)
var = np.where(repaint, 0.86 + 0.5 * (ndi.gaussian_filter(np.random.rand(H, W).astype(np.float32), 30) - 0.5) * 12, var)
var = np.clip(var, 0.72, 1.3)
var = ndi.gaussian_filter(var, 4)
# a little hue variation: drier (brighter) patches go slightly yellow
t = np.clip((var - 0.85) / 0.4, 0, 1)[..., None]
g_dark = np.array([66, 92, 40], np.float32); g_light = np.array([112, 132, 58], np.float32)
grass_rgb = g_dark * (1 - t) + g_light * t
# paved: robust local base tone + thin bright markings
pm = ((cls == ASPH) | (cls == CONC)) & ~bld_d
q = 4
small = img.resize((W // q, H // q), Image.BOX)
As = np.asarray(small).astype(np.float32)
pm_s = np.asarray(Image.fromarray((pm & ~shadow).astype(np.uint8) * 255).resize((W // q, H // q), Image.BOX)) > 128
idx = ndi.distance_transform_edt(~pm_s, return_distances=False, return_indices=True)
base_s = np.stack([ndi.percentile_filter(As[..., c][idx[0], idx[1]], 62, size=11) for c in range(3)], 2)
base_s = ndi.gaussian_filter(base_s, (2, 2, 0))
base = np.asarray(Image.fromarray(base_s.clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32)
# desaturate the greenish cast of the imagery on pavement a bit, keep tone
base = ndi.gaussian_filter(base, (14, 14, 0))
bl = base.mean(2, keepdims=True)
gmean_p = float(bl[pm].mean())
bl = gmean_p + np.clip(bl - gmean_p, -22, 22) * 0.55      # compress tone variation of pavement
base = bl + (base - bl) * 0.25
conc_rgb = np.clip(bl * 0.25 + 122 + (base - bl), 0, 255) * np.array([1.0, 0.985, 0.95], np.float32)
base = base * 0.5
base[..., 2] *= 1.0
# markings: white top-hat of each channel (features thinner than ~1.3 m)
th = np.stack([A[..., c] - ndi.grey_opening(A[..., c], size=(6, 6)) for c in range(3)], 2)
thL = th.mean(2)
line = np.clip((thL - 24) / 26, 0, 1) * 0.75 * (cls == ASPH) * (~shadow)
blob = ndi.grey_opening(line, size=(3, 3))
line = np.clip(line - 4 * ndi.grey_dilation(blob, size=(7, 7)), 0, 1)
line = ndi.gaussian_filter(line, 0.5)[..., None]
linecol = np.clip(A * 1.05 + 10, 0, 215)
paved_rgb = base * (1 - line) + linecol * line
# conc gets brighter/cleaner tone
# dirt: warm tan from luminance
dm = (cls == DIRT)
Ld, dden = norm_blur(L, dm & ~shadow, 6)
dv = np.clip(np.where(dden > 0.02, Ld / max(L[dm].mean(), 1), 1), 0.8, 1.2)[..., None]
dirt_rgb = np.array([168, 128, 92], np.float32) * dv
# synthetic: satellite colour, shadows lifted
syn_rgb = A.copy()
sm = (cls == SYN)
lift = np.clip(70 / np.maximum(L, 1), 1, 2.2)[..., None]
syn_rgb = np.clip(syn_rgb * lift, 0, 255)

wG = np.clip(1 - wA - wC - wS - wD, 0, 1)
macro = (grass_rgb * wG[..., None] + paved_rgb * wA[..., None] + conc_rgb * wC[..., None]
         + syn_rgb * wS[..., None] + dirt_rgb * wD[..., None])
tot = (wG + wA + wC + wS + wD)[..., None]
macro = np.clip(macro / np.maximum(tot, 1e-3), 0, 255).astype(np.uint8)
Image.fromarray(macro).save(os.path.join(OUT, 'ground_macro.jpg'), quality=88)

# roofs crop (play area + margin), keep the px rect in gen.json
rx0, rz0 = int(P(-232, -222)[0]), int(P(-232, -222)[1]); rx1, rz1 = int(P(302, 224)[0]), int(P(302, 224)[1])
img.crop((rx0, rz0, rx1, rz1)).save(os.path.join(OUT, 'roofs.jpg'), quality=90)
roofs_rect = dict(minX=rx0 / sx + X0, maxX=rx1 / sx + X0, minZ=rz0 / sz + Z0, maxZ=rz1 / sz + Z0)

# ---------------------------------------------------------------- school wings
sb = [b for b in D['buildings'] if b['id'] == SCHOOL_ID][0]
foot_poly = Polygon(sb['outer'][0], sb['inner'])
if not foot_poly.is_valid: foot_poly = foot_poly.buffer(0)
# OSM is older than the imagery: two former courtyards now hold buildings (student services infill, fine-arts block)
infill_a = Polygon(sb['inner'][1]).intersection(box(20.0, -131.0, 70.0, -97.0))
infill_b = Polygon(sb['inner'][2]).intersection(box(72.0, -123.0, 91.5, -96.0))
annex = box(97.0, 29.3, 117.0, 56.0)
foot_poly = unary_union([foot_poly, infill_a.buffer(0.05), infill_b.buffer(0.05), annex]).buffer(0)
# Hand-authored height regions (x0,z0,x1,z1,height,name) in OSM ground coordinates, in priority order.
# Heights were measured from Google Photorealistic 3D Tiles (roof sampling on a 3 m grid).
REGIONS = [
    (22.0, 26.0, 44.0, 54.0, 6.0, 'addition'),
    (97.0, 29.3, 117.0, 56.0, 6.5, 'annex'),
    (108.0, -106.0, 160.0, -52.0, 13.5, 'fieldhouse'),
    (92.0, -104.0, 108.0, -66.0, 11.5, 'fieldhouseW'),
    (116.0, 4.0, 158.0, 34.0, 15.5, 'southeast'),
    (45.0, -27.5, 87.0, -18.0, 5.0, 'lowN'),
    (80.0, -18.0, 87.0, 56.0, 5.0, 'lowE'),
    (-8.0, -27.5, 45.0, 27.5, 12.0, 'gymW'),
    (45.0, -18.0, 80.0, 56.0, 11.0, 'gymE'),
    (94.0, -45.0, 101.2, -5.0, 4.0, 'link'),
    (101.2, -52.0, 122.0, 3.0, 7.0, 'low7'),
    (95.0, -5.0, 116.0, 29.3, 8.0, 'low8'),
    (122.0, -52.0, 153.0, -28.0, 11.0, 'e11'),
    (80.5, -97.0, 92.0, -58.0, 7.0, 'low7b'),
    (31.0, -131.0, 55.0, -80.0, 11.0, 'ss'),
    (55.0, -131.0, 92.0, -97.0, 12.0, 'c12'),
    (55.0, -97.0, 80.5, -58.0, 12.0, 'c12'),
]
DEFAULT_H = 10.0
pieces = []
taken = []
for (x0, z0, x1, z1, h, name) in REGIONS:
    g = foot_poly.intersection(box(x0, z0, x1, z1))
    for t in taken: g = g.difference(t)
    g = g.buffer(0)
    if g.is_empty: continue
    taken.append(g)
    pieces.append((g, h, name))
rest = foot_poly
for t in taken: rest = rest.difference(t)
pieces.append((rest.buffer(0), DEFAULT_H, 'main'))
def polys(g):
    if g.geom_type == 'Polygon': return [g]
    return [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon' and p.area > 4]
flat = []
for g, h, name in pieces:
    for p in polys(g): flat.append((p.simplify(0.005), h, name))
fb = foot_poly.boundary
school = []
def base_at(p, x, z, nx, nz):
    """height of whatever is on the other side of piece p's wall at (x, z): 0 = open air (exterior / courtyard)"""
    pt = Point(x, z)
    if fb.distance(pt) < 0.05: return 0.0
    nb = 0.0
    for sgn in (1, -1):
        q_ = Point(x + sgn * nx * 0.3, z + sgn * nz * 0.3)
        if p.contains(q_): continue
        for p2, h2, _ in flat:
            if p2 is not p and p2.contains(q_): nb = max(nb, h2)
    return nb
n_split = 0
for p, h, name in flat:
    rings = []
    for ring in [p.exterior] + list(p.interiors):
        pts = list(ring.coords)[:-1]
        out_pts, base = [], []
        for i in range(len(pts)):
            a = pts[i]; b = pts[(i + 1) % len(pts)]
            Le = math.hypot(b[0] - a[0], b[1] - a[1])
            if Le < 1e-6: continue
            nx, nz = (b[1] - a[1]) / Le, -(b[0] - a[0]) / Le
            at = lambda t: base_at(p, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, nx, nz)
            # a wall can face a lower wing for part of its length and open air for the rest: split it there,
            # otherwise the open part would get no wall below the neighbour's roof (a see-through hole)
            n = max(1, int(math.ceil(Le / 0.35)))
            ts = [(k + 0.5) / n for k in range(n)]
            vals = [at(t) for t in ts]
            cuts = [0.0]; segv = [vals[0]]
            for k in range(1, n):
                if vals[k] != vals[k - 1]:
                    lo, hi = ts[k - 1], ts[k]
                    for _ in range(8):
                        mid = (lo + hi) / 2
                        if at(mid) == vals[k - 1]: lo = mid
                        else: hi = mid
                    cuts.append((lo + hi) / 2); segv.append(vals[k]); n_split += 1
            for t, v in zip(cuts, segv):
                out_pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); base.append(v)
        rings.append(dict(pts=[[round(x, 3), round(z, 3)] for x, z in out_pts], base=base))
    school.append(dict(name=name, h=h, outer=rings[0], holes=rings[1:], lean=[round(LEAN[0] * h, 2), round(LEAN[1] * h, 2)]))
print('edge splits', n_split)
print('school pieces', [(s['name'], s['h'], len(s['outer']['pts'])) for s in school])

# ---------------------------------------------------------------- house roof colours
houses = {}
for b in D['buildings']:
    if b['id'] not in KEEP: continue
    c = Polygon(b['outer'][0]).representative_point()
    h = bheight(b)
    px, pz = P(c.x + LEAN[0] * h, c.y + LEAN[1] * h)
    px = int(min(max(px, 4), W - 5)); pz = int(min(max(pz, 4), H - 5))
    col = A[pz - 3:pz + 4, px - 3:px + 4].reshape(-1, 3).mean(0)
    houses[str(b['id'])] = [int(v) for v in col]

# ---------------------------------------------------------------- trees
excl = dilate(bld, 2.5) | dilate((cls == ASPH) | (cls == CONC), 1.2) | (cls == SYN) | (cls == DIRT)
for a in D['areas']:
    if a['tags'].get('leisure') == 'pitch' or a['tags'].get('natural') == 'water':
        excl |= raster([(a['outer'], a['inner'])])
excl |= dilate(raster([(sb['outer'], [])]), 9)
# keep the open campus lawns open: hand-authored no-tree boxes (x0,z0,x1,z1)
for (x0, z0, x1, z1) in [(-200, -190, -100, 12), (-100, -30, -20, 110), (-10, 55, 140, 190), (196, -170, 290, 190), (-200, 10, -95, 128)]:
    a = P(x0, z0); b = P(x1, z1); excl[int(a[1]):int(b[1]), int(a[0]):int(b[0])] = True
dark = ndi.uniform_filter((L < 70).astype(np.float32), int(7 * sx))
trees = []
occ = []
def far_enough(x, z, d):
    for (tx, tz) in occ[-4000:]:
        if (tx - x) ** 2 + (tz - z) ** 2 < d * d: return False
    return True
grid = {}
def ok_spacing(x, z, d):
    gx, gz = int(x // 12), int(z // 12)
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for (tx, tz) in grid.get((gx + i, gz + j), []):
                if (tx - x) ** 2 + (tz - z) ** 2 < d * d: return False
    return True
def add_tree(x, z, kind, s):
    grid.setdefault((int(x // 12), int(z // 12)), []).append((x, z))
    trees.append([round(x, 1), round(z, 1), kind, round(s, 2)])
def free(x, z):
    px, pz = P(x, z); px = int(px); pz = int(pz)
    return 0 <= px < W and 0 <= pz < H and not excl[pz, px]
# hand-placed campus trees (kind 0 deciduous, 1 conifer) read off the imagery
HAND = [(-206, -178, 1, 1.0), (-207, -168, 1, 1.1), (-205, -158, 1, 1.0), (-206, -148, 1, 0.9), (-110, -180, 1, 1.1), (-108, -170, 1, 1.2), (-107, -158, 1, 1.0),
        (-205, -45, 1, 1.0), (-206, -32, 1, 1.1), (-204, -20, 1, 1.0), (-203, 20, 1, 1.0),
        (-185, -190, 0, 1.0), (-160, -190, 0, 0.9), (-130, -190.5, 0, 1.0), (-98, -188, 0, 1.0), (-70, -190, 0, 1.1), (-30, -186, 0, 1.0), (10, -180, 0, 0.9), (50, -182, 0, 1.0), (90, -182, 0, 1.0), (125, -184, 0, 0.9),
        (-100, -45, 0, 0.9), (-104, -20, 0, 1.0), (-98, 0, 0, 0.8), (-22, 150, 0, 1.0), (-70, 122, 0, 0.9), (-80, 150, 0, 1.1), (-60, 165, 0, 1.0), (-25, 175, 0, 1.0),
        (166, -120, 0, 0.8), (165, -45, 1, 0.8), (128, -126, 0, 1.1), (147, -125, 0, 1.2), (60, -80, 0, 0.7), (188, -150, 0, 0.9), (189, -120, 0, 0.9), (190, -90, 0, 1.0), (190, -55, 0, 0.9), (192, 95, 0, 1.0), (193, 125, 0, 0.9), (192, 160, 0, 1.0),
        (-15, 60, 0, 0.7), (-18, 35, 0, 0.7), (-14, -30, 0, 0.8)]
for z_ in range(0, 9): HAND.append((40 + z_ * 7.5, 192.5 + (z_ % 2) * 1.5, 1, 0.9 + 0.2 * (z_ % 3) / 2))
for (x, z, k, s) in HAND: add_tree(x, z, k, s)
# street trees
for r in D['roads']:
    hw = r['tags'].get('highway')
    if hw not in ('residential', 'tertiary', 'secondary'): continue
    ls = LineString(r['line']); off = ROADW[hw] / 2 + 3.2
    for side in (1, -1):
        d = random.uniform(3, 12)
        while d < ls.length:
            p = ls.interpolate(d); p2 = ls.interpolate(min(d + 1, ls.length))
            tx, tz = p2.x - p.x, p2.y - p.y; ln = math.hypot(tx, tz) or 1
            x = p.x + side * (-tz / ln) * off + random.uniform(-0.7, 0.7); z = p.y + side * (tx / ln) * off + random.uniform(-0.7, 0.7)
            if free(x, z) and ok_spacing(x, z, 8) and random.random() < 0.8:
                add_tree(x, z, 0, random.uniform(0.85, 1.25))
            d += random.uniform(11, 19)
# yard / woodland trees weighted by imagery darkness (bare canopies + their shadows)
SH = (-3.5, -6.0)   # canopy shadow offset
n_try = 60000
for _ in range(n_try):
    x = random.uniform(X0 + 3, X1 - 3); z = random.uniform(Z0 + 3, Z1 - 3)
    if not free(x, z): continue
    px, pz = P(x + SH[0], z + SH[1]); px = int(min(max(px, 0), W - 1)); pz = int(min(max(pz, 0), H - 1))
    inplay = PLAY['minX'] < x < PLAY['maxX'] and PLAY['minZ'] < z < PLAY['maxZ']
    pr = min(1.0, dark[pz, px] * 2.2) ** 1.5
    if not inplay: pr = max(pr, 0.5)
    elif repaint[min(max(int(P(x, z)[1]), 0), H - 1), min(max(int(P(x, z)[0]), 0), W - 1)]: pr = max(pr, 0.4)
    if random.random() > pr: continue
    if not ok_spacing(x, z, 7.5 if inplay else 7.0): continue
    add_tree(x, z, 1 if random.random() < 0.13 else 0, random.uniform(0.7, 1.3))
print('trees', len(trees), 'in play', sum(1 for t in trees if PLAY['minX'] < t[0] < PLAY['maxX'] and PLAY['minZ'] < t[1] < PLAY['maxZ']))

json.dump(dict(school=school, houses=houses, trees=trees, roofs=roofs_rect, lean=LEAN, classes=['grass', 'asphalt', 'concrete', 'rubber', 'dirt']),
          open(os.path.join(OUT, 'gen.json'), 'w'), separators=(',', ':'))
# low-res class map for surface lookups at runtime (1 px = 1 m), value = class id
cm = Image.fromarray(cls).resize((int(X1 - X0), int(Z1 - Z0)), Image.NEAREST)
cm.save(os.path.join(OUT, 'surface_classes.png'), optimize=True)

if DBG:
    os.makedirs(DBG, exist_ok=True)
    pal = np.array([[90, 140, 60], [70, 70, 75], [200, 200, 195], [200, 60, 50], [190, 150, 100]], np.uint8)
    vis = pal[cls]
    im = Image.fromarray(vis); d = ImageDraw.Draw(im)
    for t in trees:
        p = P(t[0], t[1]); r = 9
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], outline=(0, 60, 0) if t[2] == 0 else (0, 0, 120), width=3)
    im.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(DBG, 'classes.jpg'), quality=85)
    Image.fromarray(macro).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(DBG, 'macro.jpg'), quality=85)
    im2 = img.copy(); d = ImageDraw.Draw(im2)
    for s in school:
        col = (255, 0, 255)
        d.line([P(x, z) for x, z in s['outer']['pts'] + s['outer']['pts'][:1]], fill=col, width=2)
        d.line([P(x + s['lean'][0], z + s['lean'][1]) for x, z in s['outer']['pts'] + s['outer']['pts'][:1]], fill=(255, 255, 0), width=2)
    a = P(-40, -170); b = P(170, 70)
    im2.crop((int(a[0]), int(a[1]), int(b[0]), int(b[1]))).resize((int((b[0]-a[0])*1.8), int((b[1]-a[1])*1.8)), Image.LANCZOS).save(os.path.join(DBG, 'school_pieces.jpg'), quality=85)
