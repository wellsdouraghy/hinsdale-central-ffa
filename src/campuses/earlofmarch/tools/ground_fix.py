#!/usr/bin/env python3
"""Earl of March: paving from truth inside the fence (run after gen.py; needs numpy pillow scipy shapely).

gen.py's classifier reads open ground only (lidar says where the crowns and roofs are), so its paving is already close;
what it cannot give is a HARD edge (rules F34 / F42): its outlines wobble with the photo's shadows and the soft mask
fades paving into lawn. This script
  1. vectorises the classifier's asphalt and concrete inside the fence line into clean polygons (1 m cells -> union ->
     round-buffer smoothing -> simplify), drops scraps, keeps real islands, and applies the hand corrections of
     data/extra.py (PAVED_ADD / PAVED_CUT / CONCRETE: outlines traced on gridded nadir 3D-tiles shots);
  2. writes them to data/paved.json and ../paved.js (the builder lays kerbs on the same outlines);
  3. repaints ground_mask.png / ground_macro.jpg / surface_classes.png inside the fence from those polygons with a
     hard edge: paved inside, lawn outside (thin OSM footways stay asphalt paths), repainted pixels take the class's
     median tone with low-frequency noise.
The first run saves the classifier's own output as data/cache/*.orig so a re-run starts from it (not idempotent
otherwise: MAP_NOTES "a re-run of ground_fix.py on baked files").   Usage: python ground_fix.py [debug.jpg]
"""
import json, os, sys, shutil, math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from shapely.geometry import Polygon, box as sbox, MultiPolygon, LineString, Point
from shapely.ops import unary_union
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
import extra
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/campuses/earlofmarch'); CACHE = os.path.join(HERE, 'data', 'cache')
X0, X1, Z0, Z1 = -360.0, 360.0, -330.0, 330.0
os.makedirs(CACHE, exist_ok=True)
for f in ('ground_mask.png', 'ground_macro.jpg', 'surface_classes.png'):
    o = os.path.join(CACHE, f + '.orig'); stamp = os.path.join(CACHE, f + '.stamp'); src = os.path.join(OUT, f)
    # (gen.py rewrites the files: a newer file than the stamp is a fresh classifier output)
    if not os.path.exists(o) or not os.path.exists(stamp) or os.path.getmtime(src) > os.path.getmtime(stamp) + 1: shutil.copyfile(src, o)
D = json.load(open(os.path.join(OUT, 'campus.json')))
mask0 = np.asarray(Image.open(os.path.join(CACHE, 'ground_mask.png.orig')).convert('RGBA')).copy(); H, W = mask0.shape[:2]; sx = W / (X1 - X0)
macro0 = np.asarray(Image.open(os.path.join(CACHE, 'ground_macro.jpg.orig')).convert('RGB')).astype(np.float32)
cls0 = np.asarray(Image.open(os.path.join(CACHE, 'surface_classes.png.orig')).convert('L')).copy()    # 1 m cells
EDGE = Polygon(extra.PLAY_EDGE); AREA = EDGE.buffer(6)
GRASS, ASPH, CONC, SYN, DIRT = 0, 1, 2, 3, 4
def P(x, z): return ((x - X0) * sx, (z - Z0) * sx)
def raster(geoms, scale=None, size=None):
    w, h = size or (W, H); s = scale or sx; m = Image.new('L', (w, h), 0); d = ImageDraw.Draw(m)
    for g in geoms:
        for q in (g.geoms if hasattr(g, 'geoms') else [g]):
            if q.is_empty or q.geom_type != 'Polygon': continue
            d.polygon([((x - X0) * s, (z - Z0) * s) for x, z in q.exterior.coords], fill=255)
            for r in q.interiors: d.polygon([((x - X0) * s, (z - Z0) * s) for x, z in r.coords], fill=0)
    return np.asarray(m) > 0
bld = unary_union([Polygon(b['outer'][0]).buffer(0) for b in D['buildings'] if len(b['outer'][0]) >= 3])
inside = raster([AREA], 1.0, (cls0.shape[1], cls0.shape[0]))
def vectorise(c, close=2, open_=1, min_area=30, hole=14, smooth=1.1):
    m = (cls0 == c) & inside
    m = ndi.binary_opening(ndi.binary_closing(m, iterations=close), iterations=open_)
    lab, n = ndi.label(m)
    if n: sizes = ndi.sum(m, lab, np.arange(1, n + 1)); m &= ~np.isin(lab, 1 + np.where(sizes < min_area)[0])
    lab, n = ndi.label(~m)
    if n: sizes = ndi.sum(~m, lab, np.arange(1, n + 1)); m |= np.isin(lab, 1 + np.where(sizes < hole)[0])
    jj, ii = np.where(m); rows = {}
    for j, i in zip(jj, ii): rows.setdefault(j, []).append(i)
    boxes = []
    for j, cols in rows.items():      # run-length boxes per row
        cols.sort(); s = cols[0]; p = s
        for i in cols[1:] + [None]:
            if i is None or i != p + 1: boxes.append(sbox(X0 + s, Z0 + j, X0 + p + 1, Z0 + j + 1)); s = i
            p = i if i is not None else p
    g = unary_union(boxes)
    g = g.buffer(smooth, join_style=1).buffer(-2 * smooth, join_style=1).buffer(smooth, join_style=1).simplify(0.45)
    return g
asph = vectorise(ASPH, smooth=1.5); conc = vectorise(CONC, close=1, open_=1, min_area=18, hole=8, smooth=0.7)
# the public streets are the engine's (graded, painted from the design): keep the campus paving off their corridors
for r in D['roads']:
    if r['tags'].get('highway') in ('secondary', 'secondary_link', 'tertiary', 'residential'): asph = asph.difference(LineString(r['line']).buffer(5.0, cap_style=2)); conc = conc.difference(LineString(r['line']).buffer(5.0, cap_style=2))
asph = asph.buffer(-0.6).buffer(0.6).simplify(0.9); conc = conc.simplify(0.5)
# hand corrections (traced on gridded nadir tiles)
for r in getattr(extra, 'PAVED_ADD', []): asph = asph.union(Polygon(r))
for r in getattr(extra, 'PAVED_CUT', []): asph = asph.difference(Polygon(r)); conc = conc.difference(Polygon(r))
for r in getattr(extra, 'CONCRETE', []): conc = conc.union(Polygon(r)); asph = asph.difference(Polygon(r))
# fix round 1 (rule F53): the newest imagery's outlines, applied in order over everything above
for op, r in getattr(extra, 'EPOCH', []):
    g = Polygon(r).buffer(0)
    if op == 'lawn': asph = asph.difference(g); conc = conc.difference(g)
    elif op == 'asphalt': asph = asph.union(g); conc = conc.difference(g)
    else: conc = conc.union(g); asph = asph.difference(g)
asph = asph.difference(bld.buffer(0.05)).intersection(AREA); conc = conc.difference(bld.buffer(0.05)).difference(asph).intersection(AREA)
def polys(g, min_area):
    out = []
    for q in (g.geoms if hasattr(g, 'geoms') else [g]):
        if q.geom_type != 'Polygon' or q.area < min_area: continue
        if q.area / (q.length / 2) < 2.0: continue   # (fix round 1: a sliver under 2 m wide is a leftover of a cut, e.g. the strip south of the track; its kerb was a stray zigzag on the lawn)
        out.append(dict(outer=[[round(x, 2), round(z, 2)] for x, z in list(q.exterior.coords)[:-1]], holes=[[[round(x, 2), round(z, 2)] for x, z in list(r.coords)[:-1]] for r in q.interiors if Polygon(r).area >= 10], area=round(q.area)))
    return sorted(out, key=lambda p: -p['area'])
PA, PC = polys(asph, 30), polys(conc, 14)
json.dump(dict(asphalt=PA, concrete=PC), open(os.path.join(HERE, 'data', 'paved.json'), 'w'))
open(os.path.join(HERE, '..', 'paved.js'), 'w').write('// Earl of March: paved outlines inside the fence (asphalt car parks and drives, concrete walks and forecourts): generated by tools/ground_fix.py\n// from the photo classifier + the hand corrections in tools/data/extra.py. The baked ground mask is painted from the same polygons with a hard edge.\nexport const PAVED = %s;\n' % json.dumps(dict(asphalt=PA, concrete=PC), separators=(',', ':')))
print('asphalt polygons', len(PA), 'area', sum(p['area'] for p in PA), 'vertices', sum(len(p['outer']) + sum(len(h) for h in p['holes']) for p in PA), '| concrete', len(PC), 'area', sum(p['area'] for p in PC))

# ---------------------------------------------------------------- repaint inside the fence (hard edges)
def P2(polys_):
    g = []
    for p in polys_:
        q = Polygon(p['outer'], p['holes'])
        g.append(q if q.is_valid else q.buffer(0))
    return g
mA = raster(P2(PA)); mC = raster(P2(PC)); inn = raster([AREA])
# thin paths: OSM footways / paths inside the fence stay as they were classified (asphalt), with a crisp edge
foot = Image.new('L', (W, H), 0); fd = ImageDraw.Draw(foot)
for r in D['roads']:
    if r['tags'].get('highway') in ('footway', 'path', 'cycleway'): fd.line([P(x, z) for x, z in r['line']], fill=255, width=int(round(2.2 * sx)), joint='curve')
foot = (np.asarray(foot) > 0) & inn & ~mA & ~mC & (mask0[..., 0] > 100)
if getattr(extra, 'FOOT_CUT', None): foot &= ~raster([Polygon(r).buffer(0) for r in extra.FOOT_CUT])
streets = np.zeros((H, W), bool)   # the engine repaints the graded streets itself; leave whatever is there
newA = (mA | foot); newC = mC & ~newA
A0 = mask0[..., 0] > 127; C0 = mask0[..., 1] > 127; G0 = ~(A0 | C0) & (mask0[..., 3] > 127)
mask = mask0.copy(); macro = macro0.copy()
rng = np.random.default_rng(5); noise = ndi.gaussian_filter(rng.random((H, W)).astype(np.float32), 22); noise = (noise - noise.mean()) / (noise.std() + 1e-6)
def tone(sel): return np.median(macro0[sel], axis=0) if sel.sum() > 500 else None
tA = tone(A0 & inn); tC = tone(C0 & inn); tG = tone(G0 & inn & (macro0[..., 1] > macro0[..., 0]))
print('tones asphalt', tA, 'concrete', tC, 'grass', tG)
gone = raster([Polygon(r).buffer(0) for op, r in getattr(extra, 'EPOCH', []) if op == 'lawn']) if getattr(extra, 'EPOCH', None) else np.zeros((H, W), bool)   # (the photo shows the old layout there: roofs that left, worn paths)
gone &= ~((macro0[..., 1] > macro0[..., 0] * 1.1) & (macro0[..., 1] > macro0[..., 2] * 1.15))   # (what is green in the photo keeps its own texture)
toG = inn & ~newA & ~newC & (A0 | C0 | gone)
ep = raster([Polygon(r).buffer(0) for op, r in getattr(extra, 'EPOCH', [])]) if getattr(extra, 'EPOCH', None) else np.zeros((H, W), bool)   # (inside the re-traced outlines every paved pixel takes the flat tone: no ghost of the old layout)
toA = inn & newA & (~A0 | ep); toC = inn & newC & (~C0 | ep)
for sel, t, k in ((toG, tG, 0.05), (toA, tA, 0.03), (toC, tC, 0.03)):
    if t is not None: macro[sel] = t[None, :] * (1 + k * noise[sel])[:, None]
mask[inn & newA] = [255, 0, 0, 255]; mask[inn & newC] = [0, 255, 0, 255]; mask[toG] = [0, 0, 0, 255]
# (grass that the classifier had right keeps its own soft dirt weights; only the paved channels are zeroed)
keepG = inn & ~newA & ~newC & ~toG; mask[keepG, 0] = 0; mask[keepG, 1] = 0
for ring, rgb in getattr(extra, 'RETONE', []):   # paving that keeps its outline and takes the tiles' tone
    m = raster([Polygon(ring)]) & inn & newA; macro[m] = np.array(rgb, np.float32)[None, :] * (1 + 0.03 * noise[m])[:, None]
# designed surfaces with their own tone (the track): painted last, hard-edged
CL = dict(grass=GRASS, asphalt=ASPH, concrete=CONC, dirt=DIRT); toned = []
for outer, holes, cname, rgb in getattr(extra, 'TONED', []):
    m = raster([Polygon(outer, holes)])
    if cname == 'dirt': m &= ~(inn & (newA | newC))   # (bare earth never covers a walk)
    toned.append((m, CL[cname])); macro[m] = np.array(rgb, np.float32)[None, :] * (1 + 0.035 * noise[m])[:, None]
    mask[m] = [255, 0, 0, 255] if cname == 'asphalt' else [0, 255, 0, 255] if cname == 'concrete' else [0, 0, 0, 255]
Image.fromarray(mask, 'RGBA').save(os.path.join(OUT, 'ground_mask.png'), optimize=True)
Image.fromarray(macro.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, 'ground_macro.jpg'), quality=88)
cw, ch = cls0.shape[1], cls0.shape[0]; small = lambda m: np.asarray(Image.fromarray(m.astype(np.uint8) * 255).resize((cw, ch), Image.BOX)) > 127
cls = cls0.copy(); i1 = small(inn); cls[i1 & small(newA)] = ASPH; cls[i1 & small(newC) & ~small(newA)] = CONC; cls[i1 & ~small(newA) & ~small(newC) & ((cls0 == ASPH) | (cls0 == CONC))] = GRASS
for m, c in toned: cls[small(m)] = c
Image.fromarray(cls).save(os.path.join(OUT, 'surface_classes.png'), optimize=True)
for f in ('ground_mask.png', 'ground_macro.jpg', 'surface_classes.png'): open(os.path.join(CACHE, f + '.stamp'), 'w').write('fixed')
print('repainted: to lawn %d m2, to asphalt %d m2, to concrete %d m2' % (toG.sum() / sx / sx, toA.sum() / sx / sx, toC.sum() / sx / sx))
if len(sys.argv) > 1:
    im = Image.open(os.path.join(OUT, 'satellite.jpg')).convert('RGB'); d = ImageDraw.Draw(im)
    for p in PA:
        d.line([P(*q) for q in p['outer'] + p['outer'][:1]], fill=(255, 255, 0), width=3)
        for h in p['holes']: d.line([P(*q) for q in h + h[:1]], fill=(255, 160, 0), width=3)
    for p in PC: d.line([P(*q) for q in p['outer'] + p['outer'][:1]], fill=(0, 255, 255), width=3)
    b = EDGE.bounds; im.crop((int(P(b[0] - 10, 0)[0]), int(P(0, b[1] - 10)[1]), int(P(b[2] + 10, 0)[0]), int(P(0, b[3] + 10)[1]))).resize((1500, int(1500 * (b[3] - b[1] + 20) / (b[2] - b[0] + 20)))).save(sys.argv[1], quality=88)
