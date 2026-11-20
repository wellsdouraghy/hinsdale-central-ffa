#!/usr/bin/env python3
"""Tree cover from the Google 3D-tiles surface (QA: "Ross is a wooded valley, near-continuous cover"; the first scan
planted one small tree per ~10 m of canopy and half of them drew as 7 m ornamentals).
  - every scanned tree gets its real height: scale = (tile surface - ground) / 15.5 m (the tree model's height), 0.9 .. 1.6;
    conifer (kind 1) where the canopy stands over 27 m (the redwoods along the creek and on the south hill)
  - canopy without a trunk is filled on a jittered 7.5 m grid: tile surface >= 6 m over the ground, outside buildings
    (+3.5 m), paving, the pitch, the courts, the dining terrace, Prize Day Field and the cedar's island
Patches gen.json `trees` ([x, z, kind, scale]) in place; idempotent (filled trees carry a scale ending in 5 hundredths and
are dropped before refilling). Ground = terrain.bin. Run after ground_fix.py. Usage: python canopy_fill.py"""
import json, os, sys, math
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, 'data')); import extra
OUT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', 'public/campuses/branson'))
D = json.load(open(os.path.join(OUT, 'campus.json'))); G = json.load(open(os.path.join(OUT, 'gen.json')))
Hh = np.fromfile(os.path.join(OUT, 'terrain.bin'), '<i2').reshape(301, 331) * 0.01
TH = json.load(open(os.path.join(HERE, 'data', 'tile_heights.json')))
cls = np.array(Image.open(os.path.join(OUT, 'surface_classes.png')))
def ground(x, z): return float(Hh[min(300, max(0, int(round((z + 300) / 2)))), min(330, max(0, int(round((x + 330) / 2))))])
def tile(x, z):
    for k in ('fine', 'wide'):
        g = TH[k]; j = int(round((z - g['z0']) / g['step'])); i = int(round((x - g['x0']) / g['step']))
        if 0 <= j < len(g['rows']) and 0 <= i < len(g['rows'][0]) and g['rows'][j][i] is not None: return g['rows'][j][i] + 16.28
    return None
def canopy(x, z):
    t = tile(x, z); return None if t is None else t - ground(x, z)
def inside(x, z, r):
    c = False
    for i in range(len(r)):
        a, b = r[i], r[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]: c = not c
    return c
rings = [b['outer'][0] for b in D['buildings'] if len(b['outer'][0]) >= 3]
boxes = [(min(p[0] for p in r) - 4, max(p[0] for p in r) + 4, min(p[1] for p in r) - 4, max(p[1] for p in r) + 4, r) for r in rings]
OFF = [(0, 0)] + [(3.5 * math.cos(a * math.pi / 4), 3.5 * math.sin(a * math.pi / 4)) for a in range(8)]
def near_building(x, z):
    for x0, x1, z0, z1, r in boxes:
        if x0 <= x <= x1 and z0 <= z <= z1 and any(inside(x + dx, z + dz, r) for dx, dz in OFF): return True
    return False
F = extra.FIELD; pitch = extra.obb(F['cx'], F['cz'], F['L'] + 14, F['W'] + 12, F['ang']); courts = extra.obb(extra.TENNIS['cx'], extra.TENNIS['cz'], 36.6 + 6, 33.5 + 6, extra.TENNIS['ang'])
def paved(x, z):
    j, i = int(z + 300), int(x + 330)
    return any(cls[min(599, max(0, j + dj)), min(659, max(0, i + di))] in (1, 2, 3) for dj, di in ((0, 0), (2, 0), (-2, 0), (0, 2), (0, -2)))
def blocked(x, z):
    return (inside(x, z, pitch) or inside(x, z, courts) or math.hypot(x + 106, z - 31) < 12 or math.hypot(x - 52, z - 67) < 13 or math.hypot(x + 1, z + 33) < 14
            or (-60 < x < -10 and 4 < z < 26) or paved(x, z) or near_building(x, z))          # (Katharine Branson Hall's south lawn keeps only its scanned specimen trees)
trees = [t[:4] for t in G['trees'] if round(t[3] * 100) % 10 != 5]; n_scan = len(trees); rng = np.random.default_rng(1920)
def scale(c, kind):
    s = round(float(np.clip(c / (14.5 if kind else 15.5), 0.9, 1.9 if kind else 1.6)), 2); return s + 0.01 if round(s * 100) % 10 == 5 else s
for t in trees:
    c = canopy(t[0], t[1])
    if c is None: t[3] = max(t[3], 0.92); continue
    if c < 5: t[3] = 0.74; continue                                   # open ground in the tiles: a young / ornamental tree
    t[2] = 1 if c > 27 else t[2]; t[3] = scale(c, t[2])
occ = {}
def key(x, z): return (int(x // 7), int(z // 7))
for t in trees: occ.setdefault(key(t[0], t[1]), []).append(t)
def crowded(x, z, d):
    kx, kz = key(x, z)
    return any(math.hypot(t[0] - x, t[1] - z) < d for a in (-1, 0, 1) for b in (-1, 0, 1) for t in occ.get((kx + a, kz + b), ()))
added = 0
for z in np.arange(-296, 297, 7.5):
    for x in np.arange(-326, 327, 7.5):
        px, pz = float(x + rng.uniform(-2.6, 2.6)), float(z + rng.uniform(-2.6, 2.6)); c = canopy(px, pz)
        if c is None or c < 6 or blocked(px, pz) or crowded(px, pz, 6.2): continue
        kind = 1 if c > 27 else 0; s = math.floor(float(np.clip(c / (14.5 if kind else 15.5), 0.9, 1.9 if kind else 1.6)) * 10) / 10 + 0.05
        t = [round(px, 1), round(pz, 1), kind, round(s, 2)]; trees.append(t); occ.setdefault(key(px, pz), []).append(t); added += 1
G['trees'] = trees; json.dump(G, open(os.path.join(OUT, 'gen.json'), 'w'), separators=(',', ':'))
inp = [t for t in trees if -215 < t[0] < 82 and -100 < t[1] < 184]
print('trees: %d scanned (re-scaled), %d filled in, %d total, %d in play; conifers %d; mean scale %.2f' % (n_scan, added, len(trees), len(inp), sum(1 for t in trees if t[2] == 1), float(np.mean([t[3] for t in trees]))))
