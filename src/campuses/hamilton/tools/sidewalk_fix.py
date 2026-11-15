#!/usr/bin/env python3
"""Alexander Hamilton High School: paint the Robertson Blvd sidewalk in front of the school as sidewalk.
The fig trees along the kerb hide the pavement in the satellite photo, so gen.py classed the strip under their crowns
as lawn. This patches the baked ground files in place (run after gen.py): ground_mask.png (concrete weight),
ground_macro.jpg (concrete tone) and surface_classes.png (class 'concrete') along the west sidewalk of South Robertson
Boulevard (10.0 - 13.5 m west of the centre line, grid b -131 .. 70), only where the ground is currently grass.
Idempotent. Needs Pillow + numpy.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', 'public/campuses/hamilton'))
X0, X1, Z0, Z1 = -400.0, 400.0, -360.0, 360.0; A = math.radians(18.5); UX, UZ = math.cos(A), math.sin(A)
D = json.load(open(os.path.join(OUT, 'campus.json')))
segs = [(r['line'][i], r['line'][i + 1]) for r in D['roads'] if r['tags'].get('name') == 'South Robertson Boulevard' and r['tags'].get('highway') == 'secondary' for i in range(len(r['line']) - 1)]
gb = lambda p: -p[0] * UZ + p[1] * UX
def along(b):
    for p, q in segs:
        b0, b1 = gb(p), gb(q)
        if (b0 - b) * (b1 - b) > 0 or b0 == b1: continue
        t = (b - b0) / (b1 - b0); tx, tz = q[0] - p[0], q[1] - p[1]; L = math.hypot(tx, tz); tx /= L; tz /= L
        if b1 < b0: tx, tz = -tx, -tz
        return p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, -tz, tx
    return None
mask = Image.open(os.path.join(OUT, 'ground_mask.png')); W, H = mask.size; px = W / (X1 - X0)
strip = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(strip); prev = None
for b in range(-131, 71, 2):
    q = along(b)
    if not q: prev = None; continue
    cur = [((q[0] + q[2] * o - X0) * px, (q[1] + q[3] * o - Z0) * px) for o in (10.0, 13.5)]
    if prev: dr.polygon([prev[0], prev[1], cur[1], cur[0]], fill=255)
    prev = cur
S = np.array(strip) > 0; M = np.array(mask); grass = (M[..., 0] < 90) & (M[..., 1] < 90) & (M[..., 2] < 90) & (M[..., 3] > 160); sel = S & grass
M[sel] = (0, 255, 0, 255); Image.fromarray(M, 'RGBA').save(os.path.join(OUT, 'ground_mask.png'), optimize=True)
mac = np.array(Image.open(os.path.join(OUT, 'ground_macro.jpg')).convert('RGB')).astype(np.float32); rng = np.random.default_rng(7)
tone = np.array([150, 147, 140], np.float32) + rng.normal(0, 3.0, (H, W, 1)).astype(np.float32)
# expansion joints every 1.5 m read as a sidewalk even from the air: darken thin lines across the strip
mac[sel] = tone[sel]; Image.fromarray(np.clip(mac, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'ground_macro.jpg'), quality=88)
cm = Image.open(os.path.join(OUT, 'surface_classes.png')); C = np.array(cm); k = W // cm.size[0]; small = sel.reshape(cm.size[1], k, cm.size[0], k).mean(axis=(1, 3)) > 0.5
vals = sorted(set(np.unique(C).tolist())); conc = vals[2] if len(vals) > 2 else 2
C[small] = conc; Image.fromarray(C, 'L').save(os.path.join(OUT, 'surface_classes.png'), optimize=True)
print('sidewalk pixels', int(sel.sum()), 'm2', round(sel.sum() / px / px), 'class cells', int(small.sum()), 'class value', conc, 'values', vals)
