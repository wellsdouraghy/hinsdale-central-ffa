#!/usr/bin/env python3
"""Patches the baked ground files in place (run after gen.py / patch_extra.py; idempotent on a fresh gen.py bake):
  1. Tom Ryan Field: the synthetic-turf class follows the corrected pitch outline (data/extra.py); the old outline goes
     back to lawn (the "turf wedge on the grass" at the north-west corner).
  2. Ground-class blobs (QA: white amoeba patches on asphalt and lawns): compact 'concrete' islands in the play area are
     tree-shadow / glare artefacts of the classifier, not paving. Islands under 450 m2 that are not path-shaped take the
     class that surrounds them (asphalt inside a car park, lawn otherwise) with that neighbour's tone.
  3. Real paved places get one even class and tone: the Commons dining terrace (uniform pavers), and all remaining
     concrete is toned down (no blown-out whites).
  4. Ross Creek: a gravel bed along the OSM waterway where the lidar channel is (terrain below its banks).
Writes ground_mask.png (R asphalt, G concrete, B synthetic, A = 255 - dirt), ground_macro.jpg, surface_classes.png (1 m).
Needs numpy scipy pillow. Usage: python ground_fix.py [debug_dir]"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, 'data')); import extra
OUT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', 'public/campuses/branson'))
X0, X1, Z0, Z1 = -330.0, 330.0, -300.0, 300.0; PLAY = (-215, 82, -100, 184)
D = json.load(open(os.path.join(OUT, 'campus.json')))
mask = np.array(Image.open(os.path.join(OUT, 'ground_mask.png')).convert('RGBA')).astype(np.float32); H, W = mask.shape[:2]; ppm = W / (X1 - X0)
macro_im = Image.open(os.path.join(OUT, 'ground_macro.jpg')).convert('RGB'); mW, mH = macro_im.size; macro = np.array(macro_im.resize((W, H), Image.LANCZOS)).astype(np.float32)
cls_im = Image.open(os.path.join(OUT, 'surface_classes.png')); cls = np.array(cls_im); cH, cW = cls.shape[:2]
GRASS, ASPH, CONC, SYN, DIRT = 0, 1, 2, 3, 4
rng = np.random.default_rng(7)
def poly_mask(pts, size=(W, H), scale=ppm):
    im = Image.new('L', size, 0); ImageDraw.Draw(im).polygon([((x - X0) * scale, (z - Z0) * scale) for x, z in pts], fill=255); return np.array(im) > 0
def line_mask(pts, width):
    im = Image.new('L', (W, H), 0); ImageDraw.Draw(im).line([((x - X0) * ppm, (z - Z0) * ppm) for x, z in pts], fill=255, width=max(1, int(round(width * ppm)))); return np.array(im) > 0
yy, xx = np.mgrid[0:H, 0:W]; wx = X0 + (xx + 0.5) / ppm; wz = Z0 + (yy + 0.5) / ppm
inplay = (wx > PLAY[0] - 20) & (wx < PLAY[1] + 20) & (wz > PLAY[2] - 20) & (wz < PLAY[3] + 20)
asph = mask[..., 0] > 128; conc = mask[..., 1] > 128; syn = mask[..., 2] > 128; dirt = mask[..., 3] < 128; grass = ~(asph | conc | syn | dirt)
def tone(sel, fallback):
    return np.median(macro[sel], axis=0) if sel.sum() > 50 else np.array(fallback, np.float32)
T_GRASS = tone(grass & inplay, (86, 110, 60)); T_ASPH = tone(asph & inplay, (92, 92, 94)); T_PAVER = np.array((150, 143, 131), np.float32); T_TURF = tone(syn, (58, 122, 62)); T_BED = np.array((90, 85, 75), np.float32)
def noise(n, amp): return ndi.gaussian_filter(rng.standard_normal((H, W)), 2.5)[n][:, None] * amp * 6
def paint(sel, c, t, amp=4, hard=False):
    if not sel.any(): return
    if hard:   # a crisp outline (rule F42: paving has an edge; the builder lays a kerb on it)
        tex = t[None, None, :] + ndi.gaussian_filter(rng.standard_normal((H, W)), 9.0)[..., None] * amp * 9; macro[sel] = tex[sel]
        mask[sel] = np.array({GRASS: (0, 0, 0, 255), ASPH: (255, 0, 0, 255), CONC: (0, 255, 0, 255), SYN: (0, 0, 255, 255), DIRT: (0, 0, 0, 0)}[c], np.float32)
        cs = np.array(Image.fromarray((sel * 255).astype(np.uint8)).resize((cW, cH), Image.BILINEAR)) > 127; cls[cs] = c; return
    edge = np.clip(ndi.gaussian_filter(ndi.binary_dilation(sel, iterations=3).astype(np.float32), 1.5) * 1.6, 0, 1)[..., None]   # soft join, the old outline fully covered
    tex = t[None, None, :] + ndi.gaussian_filter(rng.standard_normal((H, W)), 9.0)[..., None] * amp * 9
    macro[:] = macro * (1 - edge) + tex * edge
    m = np.array({GRASS: (0, 0, 0, 255), ASPH: (255, 0, 0, 255), CONC: (0, 255, 0, 255), SYN: (0, 0, 255, 255), DIRT: (0, 0, 0, 0)}[c], np.float32)
    mask[:] = mask * (1 - edge) + m[None, None, :] * edge
    cs = np.array(Image.fromarray((sel * 255).astype(np.uint8)).resize((cW, cH), Image.BILINEAR)) > 127; cls[cs] = c
# 1. the pitch
F = extra.FIELD; new_turf = poly_mask(extra.obb(F['cx'], F['cz'], F['L'] + 5, F['W'] + 4, F['ang']))
old = syn & ~new_turf & inplay
paint(ndi.binary_dilation(old, iterations=2) & ~new_turf, GRASS, T_GRASS); paint(new_turf, SYN, T_TURF, 1, True)
# 2. paving from digitised outlines. The classifier's asphalt / concrete in the play area is mostly tree shadow, roof
# spill and glare (amoeba blobs round every building). Truth instead: the car parks and service drives traced from nadir
# 3D-tiles views (tools/data/extra.py PAVED), OSM service ways, and the streets (the engine paints those from the street
# design); thin concrete (OSM paths), the courts and the dining terrace stay; everything else in play is lawn.
strict = (wx > PLAY[0] - 30) & (wx < PLAY[1] + 30) & (wz > PLAY[2] - 30) & (wz < PLAY[3] + 30)   # (30 m beyond the bounds: what a player sees over the fence)
lots = np.zeros((H, W), bool)
for pts in extra.PAVED: lots |= poly_mask(pts)
garden = poly_mask(extra.LOOP_GARDEN); lots |= poly_mask(extra.LOOP_OUTER)
for pts, wd in extra.PAVED_LINES: lots |= line_mask(pts, wd)
streets = np.zeros((H, W), bool)
for r in D['roads']:
    hw = r['tags'].get('highway')
    if hw in ('residential', 'tertiary', 'unclassified'): streets |= line_mask(r['line'], 11)
    elif hw == 'service': lots |= line_mask(r['line'], extra.SERVICE_W.get(r['id'], 4.5))
bld = np.zeros((H, W), bool)
for b_ in D['buildings']:
    if len(b_['outer'][0]) >= 3: bld |= poly_mask(b_['outer'][0])
lots &= ~ndi.binary_dilation(bld, iterations=2); lots &= ~garden
asph = mask[..., 0] > 128; conc = mask[..., 1] > 128
terrace = poly_mask(extra.TERRACE) & ~bld; plaza = poly_mask(extra.ARTS_PLAZA) & ~poly_mask(extra.ARTS_LAWN) & ~bld; brick = poly_mask(extra.ARTS_BRICK)
paths = np.zeros((H, W), bool)
for pts, wd in extra.PATHS: paths |= line_mask(pts, wd)
osm_paths = np.zeros((H, W), bool)
for r in D['roads']:
    if r['tags'].get('highway') in ('cycleway', 'footway', 'path', 'pedestrian', 'steps'): osm_paths |= line_mask(r['line'], 7)
paths &= ~bld; keep = terrace | plaza | paths
courts = poly_mask(extra.obb(extra.TENNIS['cx'], extra.TENNIS['cz'], 36.6 + 3, 33.5 + 3, extra.TENNIS['ang']))
thin = conc & ~ndi.binary_opening(conc, iterations=max(1, int(1.6 * ppm)))      # paths under ~3 m wide
thin = ndi.binary_dilation(thin, iterations=1) & conc & osm_paths                 # (a thin strip away from any mapped path is glare, not paving)
to_g = strict & ((asph & ~lots & ~streets) | (conc & ~thin & ~keep & ~courts & ~lots))
to_a = strict & lots & ~asph
n_g, n_a = int(to_g.sum() / ppm ** 2), int(to_a.sum() / ppm ** 2)
paint(to_g, GRASS, T_GRASS); paint(strict & lots, ASPH, T_ASPH, 2, True)
paint(garden, DIRT, np.array((96, 84, 62), np.float32), 2, True)                    # the island's boulder garden: mulch
print('play area: %d m2 of false paving -> lawn, %d m2 of car park filled in' % (n_g, n_a))
# 3. real paved places get one even class and tone (terrace: stone pavers; arts court: pale pavers + a brick square; quad strips)
paint(terrace, CONC, T_PAVER, 1, True); paint(paths, CONC, T_PAVER, 1, True); paint(plaza, CONC, np.array((158, 142, 126), np.float32), 1, True); paint(brick, CONC, np.array((142, 92, 74), np.float32), 1, True)
paint(poly_mask(extra.POOL_DECK) & ~bld, CONC, np.array((150, 140, 124), np.float32), 1, True)
# no blown-out paving anywhere in the photo (driveways and patios outside the play area included)
conc = (mask[..., 1] > 100); lum = macro.mean(axis=2); hot = (lum > 150) & ndi.binary_dilation(conc, iterations=3)
macro[hot] = macro[hot] * (150.0 / lum[hot])[:, None]
far = conc & ~strict; lum = macro.mean(axis=2); hot2 = far & (lum > 112); macro[hot2] = macro[hot2] * (112.0 / lum[hot2])[:, None]   # driveways and patios outside the play area: no bright blobs seen from the air
print('paving toned down: %d px' % int(hot.sum()))
# 4. Ross Creek bed
Hh = np.fromfile(os.path.join(OUT, 'terrain.bin'), '<i2').reshape(301, 331) * 0.01
ter = np.array(Image.fromarray(Hh.astype(np.float32)).resize((W, H), Image.BILINEAR)); bank = ndi.maximum_filter(ndi.gaussian_filter(ter, 2), size=int(14 * ppm))
for r in D['roads']:
    if r['tags'].get('name') != 'Ross Creek': continue
    bed = line_mask(r['line'], 3.2) & (ter < bank - 1.2) & ~(mask[..., 0] > 128)
    paint(bed, DIRT, T_BED, 3); print('creek bed px', int(bed.sum()))
Image.fromarray(np.clip(mask, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'ground_mask.png'), optimize=True)
Image.fromarray(np.clip(macro, 0, 255).astype(np.uint8)).resize((mW, mH), Image.LANCZOS).save(os.path.join(OUT, 'ground_macro.jpg'), quality=88)
Image.fromarray(cls).save(os.path.join(OUT, 'surface_classes.png'), optimize=True)
if len(sys.argv) > 1:
    os.makedirs(sys.argv[1], exist_ok=True); m = np.clip(mask, 0, 255).astype(np.uint8)
    x0, x1, z0, z1 = [int((v - (X0 if i < 2 else Z0)) * ppm) for i, v in enumerate((-220, 90, -105, 190))]
    Image.fromarray(m[z0:z1, x0:x1, :3]).save(os.path.join(sys.argv[1], 'mask_play.png')); Image.fromarray(np.clip(macro, 0, 255).astype(np.uint8)[z0:z1, x0:x1]).save(os.path.join(sys.argv[1], 'macro_play.jpg'), quality=85)
