#!/usr/bin/env python3
"""Earl of March: the overview image of the menus, the loading screen and the minimap (descriptor files.map).
(fix round 2) The whole image is a top-down render of the GAME (our own pixels, nothing from the 3D tiles and nothing from the
satellite photo). Round 1 pasted rendered patches into the photo, which is years older than the campus as built (rule F53): the
seams showed, and the photo's portables stood beside the rendered ones. One source, one epoch.
Renders: dev/earlofmarch.html, 4 x 4 nadir shots from 1500 m (lean under 1 m at a tile's edge), fog off, full-detail trees
(world.forceFullTrees(true): impostor cards read as crosses from above):
   map_<row>_<col>.jpg, 1024 x 1024 CSS px, camera (-270 + 180 col, 1500, -247.5 + 165 row, 0, -90), fov = 2 atan(95 / 1500): each covers 190 x 190 m
Usage: python mapimg.py SHOT_DIR      (needs numpy pillow)   -> public/campuses/earlofmarch/map.jpg (2 px / m)
"""
import os, sys
import numpy as np
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..')); OUT = os.path.join(ROOT, 'public/campuses/earlofmarch')
X0, X1, Z0, Z1, S = -360.0, 360.0, -330.0, 330.0, 2.0
W, H = int((X1 - X0) * S), int((Z1 - Z0) * S); out = Image.new('RGB', (W, H))
for j in range(4):
    for i in range(4):
        im = Image.open(os.path.join(sys.argv[1], 'map_%d_%d.jpg' % (j, i))).convert('RGB'); k = im.width / 190.0          # px per metre in the shot
        cx, cz = im.width / 2, im.height / 2; box = (cx - 90 * k, cz - 82.5 * k, cx + 90 * k, cz + 82.5 * k)               # the tile's own 180 x 165 m
        out.paste(im.crop(tuple(int(round(v)) for v in box)).resize((int(180 * S), int(165 * S)), Image.LANCZOS), (int(180 * S) * i, int(165 * S) * j))
a = np.asarray(out).astype(np.float32); g = a.mean(axis=2, keepdims=True); a = g + (a - g) * 0.88      # a little less saturated than the lit render: it sits under UI text
Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, 'map.jpg'), quality=84)
print('map.jpg', W, H, os.path.getsize(os.path.join(OUT, 'map.jpg')) // 1024, 'kB')
