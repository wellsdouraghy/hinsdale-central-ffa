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
    im = Image.new('L', (W, H), 0); ImageDraw.Draw(im).line([((x - X0) * ppm, (z - Z0) * ppm) for x, z in pts], fill=255, width=max(1, int(round(width * ppm))), joint='curve'); return np.array(im) > 0   # (joint: without it a kinked line leaves an open wedge on the outside of each bend: grass grew through the walks' pavers there)
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
# fix round 8 (rule F42): at the loop's west end the OSM service ways' paint spilled up to 1.5 m past the traced outline (kit.js LOOP_OUTER), so the kerb
# was skipped there and the drive faded into the lawn. Inside this window the paving is the traced outlines and nothing else.
LOOPW = (wx > -119) & (wx < -99.5) & (wz > 39) & (wz < 57.5); loopw_ok = poly_mask(extra.LOOP_OUTER) | poly_mask(extra.PAVED[4])
lots &= ~(LOOPW & ~loopw_ok); streets &= ~(LOOPW & ~loopw_ok)
for ix, iz, ir in extra.LOT_ISLANDS: lots &= ~((wx - ix) ** 2 + (wz - iz) ** 2 < ir * ir)
asph = mask[..., 0] > 128; conc = mask[..., 1] > 128
terrace = poly_mask(extra.TERRACE) & ~bld; plaza = poly_mask(extra.ARTS_PLAZA) & ~bld; brick = poly_mask(extra.ARTS_BRICK)
paths = np.zeros((H, W), bool)
for pts, wd in extra.PATHS: paths |= line_mask(pts, wd)
osm_paths = np.zeros((H, W), bool)
for r in D['roads']:
    if r['tags'].get('highway') in ('cycleway', 'footway', 'path', 'pedestrian', 'steps'): osm_paths |= line_mask(r['line'], 7)
walks = np.zeros((H, W), bool)
for pts, wd in extra.WALKS: walks |= line_mask(pts, wd)
walks |= ((wx - extra.PATIO[0]) ** 2 + (wz - extra.PATIO[1]) ** 2 < extra.PATIO[2] ** 2); walks |= poly_mask(extra.KBH_TERR); walks &= ~bld; court = poly_mask(extra.ENTR_COURT) & ~bld
paths &= ~bld; keep = terrace | plaza | paths | walks | court
courts = poly_mask(extra.obb(extra.TENNIS['cx'], extra.TENNIS['cz'], 36.6 + 3, 33.5 + 3, extra.TENNIS['ang']))
thin = conc & ~ndi.binary_opening(conc, iterations=max(1, int(1.6 * ppm)))      # paths under ~3 m wide
thin = ndi.binary_dilation(thin, iterations=1) & conc & osm_paths                 # (a thin strip away from any mapped path is glare, not paving)
# fix round 8: the academic quad's courtyard is lawn between its three paved strips (nadir tiles): the classifier's thin "paths" across it go back to lawn
QUAD = poly_mask([(-160.5, 114.5), (-151.5, 121.5), (-141.5, 147.5), (-150.5, 157), (-166, 151), (-174.5, 140.5)]); thin &= ~QUAD
# fix round 9: the lawn round Tallant's north door walk: the classifier's thin strips and soft fringes beside the walk and the quad path (kept as
# "path" next to the OSM footway) drew faint whitish smears on the grass. Inside this window only the digitised walks and paths are paving.
TALL = poly_mask([(-164, 147), (-141, 147), (-141, 161.5), (-164, 161.5)]); thin &= ~TALL
to_g = strict & ((asph & ~lots & ~streets) | (conc & ~thin & ~keep & ~courts & ~lots))
to_a = strict & lots & ~asph
n_g, n_a = int(to_g.sum() / ppm ** 2), int(to_a.sum() / ppm ** 2)
paint(to_g, GRASS, T_GRASS)
paint(QUAD & ~keep & ~bld & ~lots, GRASS, T_GRASS)   # (fix round 8: one lawn tone over the quad's courtyard; pale streaks of the photo read as paths fading into the grass)
paint(TALL & ~keep & ~bld & ~lots, GRASS, T_GRASS)   # (fix round 9: one lawn tone round Tallant's door walk; the walks are painted hard again in step 3)
# fix round 5: lawns and beds that are dry gold in the (summer) tiles keep the lawn class and take a pale olive / gold tone (soft edges)
for pts, tn in extra.DRY_LAWNS: paint(poly_mask(pts) & ~bld & (mask[..., 0] < 128) & (mask[..., 1] < 128) & (mask[..., 3] > 128), GRASS, np.array(tn, np.float32), 2)
paint(court, CONC, np.array((150, 144, 136), np.float32), 1, True)   # the forecourt of the hall's entrance: neutral paving under the real red tiles the builder lays (a red tone here bled over the drive's edge)
paint(strict & lots, ASPH, T_ASPH, 2, True)
# the school's own drives are pale concrete in the tiles (Park Drive from the gate to the Bridge, the loop, the gym service drive), not dark asphalt:
# same class (cars, kerbs and the street painter read 'asphalt'), the photo tone the shader takes its colour from made pale
pale = poly_mask(extra.LOOP_OUTER) | poly_mask(extra.PAVED[4])
for r in D['roads']:
    if r['id'] in (12187517, 570965050, 570965049, 570965051): pale |= line_mask([p for p in r['line'] if p[1] > -86], 7.4)
pale &= ~garden & ~bld & strict; pale &= ~(LOOPW & ~loopw_ok); paint(pale, ASPH, np.array((166, 159, 148), np.float32), 1, True)
# the faculty car park north of the tennis shed, the Commons' service yard and its drive read mid grey-tan in the tiles (worn asphalt), lighter than Fernhill Ave
mid = poly_mask(extra.PAVED[0]) | poly_mask(extra.PAVED[2])
for r in D['roads']:
    if r['id'] == 570965047: mid |= line_mask(r['line'], extra.SERVICE_W.get(r['id'], 4.5))
for ix, iz, ir in extra.LOT_ISLANDS: mid &= ~((wx - ix) ** 2 + (wz - iz) ** 2 < ir * ir)
mid &= ~bld & ~pale & strict; paint(mid, ASPH, np.array((138, 134, 127), np.float32), 1, True)
wl = poly_mask(extra.PAVED[1])   # the faculty car park on Fernhill Ave: pale grey paving in the tiles, not dark asphalt
for r in D['roads']:
    if r['id'] == 570965048: wl |= line_mask(r['line'], extra.SERVICE_W.get(r['id'], 4.5))
wl &= ~bld & strict; paint(wl, ASPH, np.array(extra.WEST_LOT_TONE, np.float32), 1, True)
paint(garden, DIRT, np.array((150, 128, 98), np.float32), 2, True)                    # the island's dry garden: decomposed granite
paint(line_mask(*extra.LOOP_SWALE) & garden, DIRT, np.array((176, 170, 158), np.float32), 2, True)   # ...with a dry creek of pale cobbles
for pts in extra.DRY: paint(poly_mask(pts) & ~streets & ~lots, DIRT, np.array((158, 134, 92), np.float32), 3)   # the dry clearing in the wood west of the faculty lot                    # the island's boulder garden: mulch
for pts in extra.LITTER: paint(poly_mask(pts) & ~streets & ~lots, DIRT, np.array((122, 108, 78), np.float32), 3)   # the wood floor round the red base: leaf litter, not lawn
Gd = extra.GARDEN; paint(poly_mask(extra.obb(-64.5, 17.0, 11.3, 8.1, -5.6)) & ~poly_mask(extra.obb(Gd['cx'], Gd['cz'], Gd['w'], Gd['d'], Gd['ang'])), GRASS, np.array((110, 116, 70), np.float32), 2)   # (the plot's outline before fix round 7: back to lawn where the new one does not cover it)
paint(poly_mask(extra.obb(Gd['cx'], Gd['cz'], Gd['w'], Gd['d'], Gd['ang'])) & ~bld, DIRT, np.array((128, 98, 80), np.float32), 2, True)   # the organic garden's fenced plot: bark mulch between the raised beds
print('play area: %d m2 of false paving -> lawn, %d m2 of car park filled in' % (n_g, n_a))
# 3. real paved places get one even class and tone (terrace: stone pavers; arts court: pale pavers + a brick square; quad strips)
paint(terrace, CONC, T_PAVER, 1, True); paint(paths, CONC, T_PAVER, 1, True); paint(walks & ~(mask[..., 0] > 128), CONC, np.array((160, 146, 122), np.float32), 1, True); paint(plaza, CONC, np.array((158, 142, 126), np.float32), 1, True); paint(brick, CONC, np.array((142, 92, 74), np.float32), 1, True)
# fix round 7: the neighbour's tennis court (green acrylic; class concrete) and the gravel garden in the south-west corner
C = extra.NB_COURT; paint(poly_mask(extra.obb(C['cx'], C['cz'], C['w'], C['d'], 0)), CONC, np.array((112, 132, 96), np.float32), 1, True)
paint(poly_mask(extra.NB_GRAVEL) & ~bld, DIRT, np.array((176, 160, 136), np.float32), 2, True)
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
