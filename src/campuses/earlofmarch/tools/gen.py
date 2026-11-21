#!/usr/bin/env python3
"""Offline generator for Earl of March (run by hand; needs pillow numpy scipy shapely + dem.py's modules).
Reads public/campuses/earlofmarch/campus.json + satellite.jpg and the lidar DTM / DSM (dem.py) and writes into
public/campuses/earlofmarch/:
  ground_macro.jpg    - cleaned ground albedo (roofs / cars / canopies removed, lawns re-greened)
  ground_mask.png     - surface weights  R=asphalt G=concrete B=synthetic A=255-dirt*255 (grass = rest)
  roofs.jpg           - satellite crop (legacy roof atlas; school roofs are modelled, rule F35)
  surface_classes.png - 1 m class grid (grass, asphalt, concrete, rubber, dirt)
  gen.json            - trees, per-building heights / roof kinds / colours
What is different from the earlier campuses (all of it because Ottawa has open 1 m lidar with a first-return surface):
  * canopy and roofs are MEASURED (DSM - DTM), not guessed from the photo's colour: the ground classifier only reads
    pixels of open ground, and everything under a crown is filled from the map (car parks, drives, paths) or left lawn;
  * every building's height is the lidar roof against the lidar ground on its own outline (eave = low quantile, ridge =
    high quantile), with the tiles as the cross-check in the hand-off (rules A2, F32);
  * every tree is a crown top of the canopy-height model, drawn at its measured height (rule F44 for the whole wood).
Then run tools/terrain.py (terrain.bin, backdrop grid, validation) and tools/ground_fix.py (paving from truth).
Usage: python gen.py [debug_dir]
"""
import json, sys, os, math, random
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from shapely.geometry import Polygon, Point
from shapely import contains_xy
import dem
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
import extra
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/campuses/earlofmarch')
DBG = sys.argv[1] if len(sys.argv) > 1 else None
D = json.load(open(os.path.join(OUT, 'campus.json')))
img = Image.open(os.path.join(OUT, 'satellite.jpg')).convert('RGB')
A = np.asarray(img).astype(np.float32)
H, W, _ = A.shape
X0, X1, Z0, Z1 = -360.0, 360.0, -330.0, 330.0
sx = W / (X1 - X0); sz = H / (Z1 - Z0)
Y0 = 93.66
EDGE = Polygon(extra.PLAY_EDGE); EDGE_PAD = EDGE.buffer(26)
PLAY = dict(minX=-176, maxX=237, minZ=-215.3, maxZ=232)
random.seed(71); np.random.seed(71)

def P(x, z): return ((x - X0) * sx, (z - Z0) * sz)
def raster(polys=(), lines=()):
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for outers, inners in polys:
        for r in outers: d.polygon([P(x, z) for x, z in r], fill=255)
        for r in inners: d.polygon([P(x, z) for x, z in r], fill=0)
    for pts, wm in lines:
        w = max(1, int(round(wm * sx))); pp = [P(x, z) for x, z in pts]
        d.line(pp, fill=255, width=w, joint='curve')
        for p in pp: d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    return np.asarray(m) > 0
def dilate(m, meters): return ndi.distance_transform_edt(~m) <= max(1, int(round(meters * sx)))
def inplay(x, z, pad=0): return (EDGE_PAD if pad else EDGE).contains(Point(x, z))

# ---------------------------------------------------------------- lidar on the image grid (0.5 m, then x2)
DTM = dem.lidar('dtm'); DSM = dem.lidar('dsm')
hx = X0 + (np.arange(W // 2) + 0.5) * 0.5; hz = Z0 + (np.arange(H // 2) + 0.5) * 0.5; HX, HZ = np.meshgrid(hx, hz)
nd_h = (DSM.at(HX, HZ) - DTM.at(HX, HZ)).astype(np.float32)
nd = np.repeat(np.repeat(nd_h, 2, 0), 2, 1)            # height above ground per image pixel
R, G, B = A[..., 0], A[..., 1], A[..., 2]
L = (R + G + B) / 3
mx = A.max(axis=2); mn = A.min(axis=2); S = (mx - mn) / np.maximum(mx, 1)

# ---------------------------------------------------------------- map rasters
areas = {a['id']: a for a in D['areas']}
bld = np.zeros((H, W), bool)
for b in D['buildings']: bld |= raster([(b['outer'], b['inner'])])
bld_d = dilate(bld, 1.2)
parking = np.zeros((H, W), bool)
for a in D['areas']:
    if a['tags'].get('amenity') == 'parking': parking |= raster([(a['outer'], a['inner'])])
ROADW = {'secondary': 15.0, 'secondary_link': 7.0, 'tertiary': 9.0, 'residential': 7.5, 'service': 6.0}
STREETS = ('secondary', 'secondary_link', 'tertiary', 'residential')
road = np.zeros((H, W), bool); street = np.zeros((H, W), bool); foot = np.zeros((H, W), bool)
for r in D['roads']:
    t = r['tags']; hw = t.get('highway')
    if hw in ('footway', 'path', 'cycleway'): foot |= raster(lines=[(r['line'], 2.4)])
    elif hw in ROADW:
        w = ROADW[hw]
        if hw == 'service' and t.get('service') == 'driveway': w = 4.5
        if hw == 'secondary' and t.get('lanes') in ('3', '4'): w = 18.0
        road |= raster(lines=[(r['line'], w)])
        if hw in STREETS: street |= raster(lines=[(r['line'], w)])
tall = nd > 2.2                                        # crowns, roofs, vehicles do not reach this
canopy = tall & ~bld_d
canopy = ndi.binary_opening(canopy, iterations=2)
openg = (nd < 0.6) & ~bld_d                            # open ground: the only pixels whose colour says anything about the surface

# ---------------------------------------------------------------- classification
GRASS, ASPH, CONC, SYN, DIRT = 0, 1, 2, 3, 4
shadow = L < 50
green = (G > R + 3) & (G > B + 6)
tan = (R > G + 6) & (R - B > 30) & (L > 100) & (S > 0.18)
gray = ~green & ~tan & ~shadow
cls = np.full((H, W), 255, np.uint8)
cls[openg & green] = GRASS
cls[openg & tan] = DIRT
cls[openg & gray] = ASPH
cls[openg & gray & (L >= 172) & (S < 0.14)] = CONC
known = cls != 255
def votes(c, sigma):
    num = ndi.gaussian_filter(((cls == c) & known).astype(np.float32), sigma); return num
v = np.stack([votes(c, 2.5) for c in range(5)], 0)
v[CONC] *= 1.05
den = ndi.gaussian_filter(known.astype(np.float32), 2.5)
c0 = v.argmax(0).astype(np.uint8)
cls = np.where(den > 0.25, c0, 255).astype(np.uint8)
# under crowns and round buildings nothing is known: lawn / woodland floor, unless the map says paving
cls[cls == 255] = GRASS
cls[(cls == ASPH) & canopy & ~dilate(road | parking, 1.5)] = GRASS
cls[parking] = ASPH
cls[road] = ASPH
cls[foot & ~road & ~parking & (cls == GRASS)] = ASPH          # the park and campus paths are asphalt (imagery, Street View)
cls[bld] = GRASS
# small islands of dirt are mulch beds / bare lawn; keep only patches of 60 m2 and more (ball diamond infields, worn goal mouths)
lab, n = ndi.label(cls == DIRT)
if n:
    sizes = ndi.sum(np.ones_like(lab), lab, np.arange(1, n + 1)); small = np.isin(lab, 1 + np.where(sizes < 60 * sx * sz)[0]); cls[small] = GRASS
# despeckle: paved or grass islands under 6 m2 take their surroundings
for c in (ASPH, CONC, GRASS):
    lab, n = ndi.label(cls == c)
    if not n: continue
    sizes = ndi.sum(np.ones_like(lab), lab, np.arange(1, n + 1)); small = np.isin(lab, 1 + np.where(sizes < 6 * sx * sz)[0])
    if small.any():
        idx = ndi.distance_transform_edt(small, return_distances=False, return_indices=True); cls[small] = cls[idx[0][small], idx[1][small]]
print('class fractions', [round(float((cls == c).mean()), 3) for c in range(5)])

# ---------------------------------------------------------------- mask (soft weights)
def soft(c, sigma=0.9): return ndi.gaussian_filter((cls == c).astype(np.float32), sigma)
wA, wC, wS, wD = soft(ASPH), soft(CONC), soft(SYN, 0.6), soft(DIRT, 1.2)
mask = np.stack([wA, wC, wS, 1 - wD], 2)
Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'ground_mask.png'), optimize=True)

# ---------------------------------------------------------------- macro albedo
def norm_blur(val, m, sigma):
    num = ndi.gaussian_filter(np.where(m, val, 0).astype(np.float32), sigma); den = ndi.gaussian_filter(m.astype(np.float32), sigma)
    return num / np.maximum(den, 1e-4), den
lawn = (cls == GRASS) & green & openg
Lg, den = norm_blur(L, lawn, 10)
gmean = L[lawn].mean() if lawn.any() else 110.0
var = np.clip(np.where(den > 0.04, Lg / gmean, 0.84), 0.72, 1.3)
under = ndi.gaussian_filter(((cls == GRASS) & ~lawn).astype(np.float32), 5)
noise = ndi.gaussian_filter(np.random.rand(H, W).astype(np.float32), 24); noise = (noise - noise.mean()) / (noise.std() + 1e-6)
var = var * (1 - under) + (0.82 + 0.05 * noise) * under
var = ndi.gaussian_filter(np.clip(var, 0.72, 1.3), 4)
t = np.clip((var - 0.85) / 0.4, 0, 1)[..., None]
g_dark = np.array([58, 84, 40], np.float32); g_light = np.array([104, 128, 58], np.float32)     # (the ground shader shows the macro ~1.3 x brighter in sun)
grass_rgb = g_dark * (1 - t) + g_light * t
pm = ((cls == ASPH) | (cls == CONC)) & openg & gray
q = 4
small = img.resize((W // q, H // q), Image.BOX); As = np.asarray(small).astype(np.float32)
pm_s = np.asarray(Image.fromarray(pm.astype(np.uint8) * 255).resize((W // q, H // q), Image.BOX)) > 128
idx = ndi.distance_transform_edt(~pm_s, return_distances=False, return_indices=True)
base_s = np.stack([ndi.percentile_filter(As[..., c][idx[0], idx[1]], 55, size=11) for c in range(3)], 2)
base_s = ndi.gaussian_filter(base_s, (2, 2, 0))
base = np.asarray(Image.fromarray(base_s.clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32)
base = ndi.gaussian_filter(base, (14, 14, 0))
bl = base.mean(2, keepdims=True)
gmean_p = float(bl[pm].mean()) if pm.any() else 120.0
bl = gmean_p + np.clip(bl - gmean_p, -22, 22) * 0.55
base = bl + (base - bl) * 0.25
conc_rgb = np.clip(bl * 0.25 + 124 + (base - bl), 0, 255) * np.array([1.0, 0.985, 0.95], np.float32)
paved_rgb = base * 0.56
dirt_rgb = np.array([150, 128, 96], np.float32) * (0.92 + 0.06 * noise)[..., None]
syn_rgb = np.array([44, 104, 54], np.float32) * np.ones((H, W, 1), np.float32)
wG = np.clip(1 - wA - wC - wS - wD, 0, 1)
macro = (grass_rgb * wG[..., None] + paved_rgb * wA[..., None] + conc_rgb * wC[..., None] + syn_rgb * wS[..., None] + dirt_rgb * wD[..., None])
tot = (wG + wA + wC + wS + wD)[..., None]
macro = np.clip(macro / np.maximum(tot, 1e-3), 0, 255).astype(np.uint8)
Image.fromarray(macro).save(os.path.join(OUT, 'ground_macro.jpg'), quality=88)
img.save(os.path.join(OUT, 'roofs.jpg'), quality=80)
roofs_rect = dict(minX=X0, maxX=X1, minZ=Z0, maxZ=Z1)

# ---------------------------------------------------------------- buildings: lidar roof against lidar ground on the building's own outline
def gridpts(Pb, step):
    minx, minz, maxx, maxz = Pb.bounds; gx = np.arange(minx, maxx + step, step); gz = np.arange(minz, maxz + step, step); XX, ZZ = np.meshgrid(gx, gz)
    m = contains_xy(Pb, XX, ZZ); return XX[m], ZZ[m]
buildings = {}
for b in D['buildings']:
    Pb = Polygon(b['outer'][0])
    if not Pb.is_valid: Pb = Pb.buffer(0)
    if Pb.is_empty or Pb.area < 10: continue
    if Pb.geom_type != 'Polygon': Pb = max(Pb.geoms, key=lambda g: g.area)
    cx, cz = Pb.centroid.x, Pb.centroid.y
    if not (X0 + 4 < cx < X1 - 4 and Z0 + 4 < cz < Z1 - 4): continue
    ring = Pb.buffer(1.2).exterior; n = max(8, int(ring.length / 1.5)); rp = [ring.interpolate(k / n, normalized=True).coords[0] for k in range(n)]
    gs = DTM.at([p[0] for p in rp], [p[1] for p in rp]) - Y0
    gmin, gmax, gmean = float(gs.min()), float(gs.max()), float(gs.mean())
    core = Pb.buffer(-0.9)
    if core.is_empty: core = Pb
    px_, pz_ = gridpts(core, 0.7 if Pb.area < 400 else 1.0)
    t_ = b['tags']; kind_ = t_.get('building')
    homey = kind_ in ('house', 'residential', 'detached', 'terrace', 'garage', 'church', 'portable_classroom') and Pb.area < 480
    h, kind, rise, top = 3.0, 'hip', 1.5, gmax + 3.0
    if len(px_) >= 4:
        a = DSM.at(px_, pz_) - Y0
        a = a[a > gmax + 1.6] if (a > gmax + 1.6).sum() >= 4 else a          # (cells that fell on the ground beside an offset outline)
        p10, p25, med, p92, p98 = [float(v) for v in np.percentile(a, [10, 25, 50, 92, 98])]
        spread = p92 - p10
        flat = (spread < 0.9) or (not homey and Pb.area > 500)
        if kind_ == 'portable_classroom': flat = False
        if flat: kind, rise, top = 'flat', 0.0, med
        else: kind, top, rise = 'hip', p10, float(np.clip(p98 - p10, 0.5, 6.0))
        h = top - gmax
        if h < 2.2: top = gmax + 2.6; h = 2.6
    msk = raster([([list(core.exterior.coords)] if core.geom_type == 'Polygon' else [b['outer'][0]], [])])
    col = np.median(A[msk], axis=0) if msk.sum() > 8 else np.array([120, 110, 100])
    if kind == 'hip': lum = float(col.mean()); col = col * (max(lum, 92.0) / max(lum, 1.0)); col = np.clip(col * 0.75 + np.array([112, 104, 98]) * 0.25, 60, 190)
    rec = dict(h=round(h, 1), roof=kind, rise=round(rise, 1), col=[int(v) for v in col], area=round(Pb.area), play=bool(inplay(cx, cz, 26)), inside=bool(inplay(cx, cz)),
               g=[round(gmin, 2), round(gmax, 2), round(gmean, 2)], top=round(top, 2), hd=round(top - gmin, 1), lv=max(1, int(round((h - (0.5 if kind == 'flat' else 0.0)) / 3.1))))
    if t_.get('building:levels'): rec['osmLv'] = t_['building:levels']
    buildings[str(b['id'])] = rec
print('buildings', len(buildings), 'near play', sum(1 for v in buildings.values() if v['play']), 'inside', sum(1 for v in buildings.values() if v['inside']), 'flat', sum(1 for v in buildings.values() if v['roof'] == 'flat'))

# ---------------------------------------------------------------- trees: crown tops of the canopy-height model
chm = np.where(dilate(bld, 1.5)[::2, ::2][:nd_h.shape[0], :nd_h.shape[1]], 0, nd_h); chm = np.where(chm > 60, 0, chm)
sm = ndi.gaussian_filter(chm, 1.5)                      # ~0.75 m: one top per crown, not per branch
peak = (sm == ndi.maximum_filter(sm, size=7)) & (sm > 3.6)
pj, pi = np.where(peak); order = np.argsort(-sm[pj, pi])
excl = dilate(bld, 2.2) | dilate(road, 0.6) | parking
trees = []; tgrid = {}
def ok_spacing(x, z, d):
    gx, gz = int(x // 12), int(z // 12)
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for (tx, tz) in tgrid.get((gx + i, gz + j), []):
                if (tx - x) ** 2 + (tz - z) ** 2 < d * d: return False
    return True
gyy, gxx = np.gradient(ndi.gaussian_filter(chm, 1.0), 0.5)
for k in order:
    j, i = pj[k], pi[k]; x, z = float(hx[i]), float(hz[j]); h = float(ndi.maximum_filter(chm, size=5)[j, i]) if False else float(chm[max(0, j - 2):j + 3, max(0, i - 2):i + 3].max())
    if h < 4.0 or h > 38: continue
    if excl[min(H - 1, j * 2), min(W - 1, i * 2)]: continue
    ip = inplay(x, z, 26)
    if not ok_spacing(x, z, (5.2 if ip else 6.6) if h > 9 else 4.2): continue
    # conifer or broadleaf: a spire (the crown falls steeply from its top) that is dark and not yellow-green in the photo
    jj, ii = min(H - 1, j * 2), min(W - 1, i * 2)
    ring_h = np.mean([chm[min(chm.shape[0] - 1, max(0, j + dj)), min(chm.shape[1] - 1, max(0, i + di))] for dj, di in ((5, 0), (-5, 0), (0, 5), (0, -5), (4, 4), (-4, 4), (4, -4), (-4, -4))])   # 2.5 m out
    spire = (h - ring_h) > 0.42 * h and h > 7
    dark = L[jj, ii] < 82 and G[jj, ii] - R[jj, ii] < 30
    kind = 1 if (spire and dark) else 0
    s = h / (14.5 if kind else 15.5)
    tgrid.setdefault((int(x // 12), int(z // 12)), []).append((x, z))
    trees.append([round(x, 1), round(z, 1), kind, round(float(np.clip(s, 0.42, 2.1)), 2)])
# canopy the crown tops leave uncovered (broad crowns, the leaf-off survey's thin spots): one more trunk wherever closed canopy
# stands more than 5.5 m from every tree, at the canopy's own height there
ntop = len(trees)
for z in np.arange(Z0 + 4, Z1 - 4, 3.6):
    for x in np.arange(X0 + 4, X1 - 4, 3.6):
        px, pz = x + random.uniform(-1.4, 1.4), z + random.uniform(-1.4, 1.4); i = int((px - X0) / 0.5); j = int((pz - Z0) / 0.5)
        if not (3 <= i < chm.shape[1] - 3 and 3 <= j < chm.shape[0] - 3): continue
        win = chm[j - 3:j + 4, i - 3:i + 4]; h = float(np.percentile(win, 80))
        if h < 5.0 or h > 36 or (win > 3).mean() < 0.8 or excl[min(H - 1, j * 2), min(W - 1, i * 2)]: continue
        if not ok_spacing(px, pz, 5.6 if inplay(px, pz, 26) else 7.2): continue
        tgrid.setdefault((int(px // 12), int(pz // 12)), []).append((px, pz)); trees.append([round(px, 1), round(pz, 1), 0, round(float(np.clip(h / 15.5, 0.42, 2.1)), 2)])
print('canopy fill', len(trees) - ntop)
print('trees', len(trees), 'near play', sum(1 for t in trees if inplay(t[0], t[1], 26)), 'conifers', sum(1 for t in trees if t[2] == 1), 'median height %.1f m' % float(np.median([t[3] * 15.5 for t in trees])))

json.dump(dict(trees=trees, buildings=buildings, terrain=None, roofs=roofs_rect, lean=[0, 0], play=PLAY, classes=['grass', 'asphalt', 'concrete', 'rubber', 'dirt']),
          open(os.path.join(OUT, 'gen.json'), 'w'), separators=(',', ':'))
Image.fromarray(cls).resize((int(X1 - X0), int(Z1 - Z0)), Image.NEAREST).save(os.path.join(OUT, 'surface_classes.png'), optimize=True)

if DBG:
    os.makedirs(DBG, exist_ok=True)
    pal = np.array([[90, 140, 60], [70, 70, 75], [200, 200, 195], [200, 60, 50], [190, 150, 100]], np.uint8)
    im = Image.fromarray(pal[cls]); d = ImageDraw.Draw(im)
    for t in trees:
        p = P(t[0], t[1]); r = 3 + t[3] * 6
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], outline=(0, 60, 0) if t[2] == 0 else (0, 0, 160), width=3)
    for b in D['buildings']:
        v = buildings.get(str(b['id']))
        if v: d.line([P(x, z) for x, z in b['outer'][0] + b['outer'][0][:1]], fill=(255, 0, 255) if v['roof'] == 'flat' else (255, 255, 0), width=2)
    d.line([P(x, z) for x, z in extra.PLAY_EDGE + extra.PLAY_EDGE[:1]], fill=(255, 255, 255), width=4)
    im.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(DBG, 'classes.jpg'), quality=85)
    Image.fromarray(macro).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(DBG, 'macro.jpg'), quality=85)
