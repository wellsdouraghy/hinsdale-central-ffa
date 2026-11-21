#!/usr/bin/env python3
"""Earl of March: the overview image of the menus, the loading screen and the minimap (descriptor files.map).
The satellite photo is years older than the campus as built (rule F53): inside the re-traced outlines of data/extra.py
(the portable yard, the grades 7-8 plaza, the Mlacak forecourt) it is replaced by top-down renders of the GAME (our own
pixels, nothing from the 3D tiles), feathered over 3 m. Renders: dev/earlofmarch.html, __s(name, 'x,H,z,0,-90', fov)
   (fog off: __scene.fog.density = 0)
   m_yard (-40, 600, -22) fov 16.7 | m_se (155, 400, 55) fov 17.06 | m_ml (62, 300, 150) fov 15.2
Usage: python mapimg.py SHOT_DIR      (needs numpy pillow scipy shapely)   -> public/campuses/earlofmarch/map.jpg (2 px / m)
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from shapely.geometry import Polygon
from shapely.ops import unary_union
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
import extra
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..')); OUT = os.path.join(ROOT, 'public/campuses/earlofmarch')
X0, X1, Z0, Z1, S = -360.0, 360.0, -330.0, 330.0, 2.0
sat = Image.open(os.path.join(OUT, 'satellite.jpg')).convert('RGB').resize((int((X1 - X0) * S), int((Z1 - Z0) * S)), Image.LANCZOS); W, H = sat.size
out = np.asarray(sat).astype(np.float32)
import json
from shapely.geometry import box as sbox
D = json.load(open(os.path.join(OUT, 'campus.json'))); big = unary_union([Polygon(b['outer'][0]).buffer(0) for b in D['buildings'] if b['tags'].get('building') != 'portable_classroom' and len(b['outer'][0]) >= 3]).buffer(1.5)
yard = Polygon(extra._YARD).intersection(sbox(-106, -110, 40, 34)).difference(Polygon(extra.track_ring(extra.TRACK['w'] + 4)))   # (not the wood and the track south of the yard: the photo is right there)
ml = unary_union([Polygon(r).buffer(0) for op, r in extra.EPOCH if Polygon(r).buffer(0).centroid.y > 110])
AREAS = [('m_yard.jpg', -40, 600, -22, 16.7, unary_union([yard] + [Polygon(r).buffer(5) for _, _, r in extra.BUILDINGS] + [Polygon(r) for op, r in extra.EPOCH if op == 'lawn' and Polygon(r).centroid.y < -80])),
         ('m_se.jpg', 155, 400, 55, 17.06, Polygon(extra._SE).buffer(3).difference(big)), ('m_ml.jpg', 62, 300, 150, 15.2, ml.buffer(2).difference(big))]
jj, ii = np.mgrid[0:H, 0:W]; wx = X0 + (ii + 0.5) / S; wz = Z0 + (jj + 0.5) / S
for name, cx, ch, cz, fov, poly in AREAS:
    im = Image.open(os.path.join(sys.argv[1], name)).convert('RGB'); a = np.asarray(im).astype(np.float32); h, w = a.shape[:2]; k = h / 2 / (ch * math.tan(math.radians(fov / 2)))
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for g in (poly.geoms if hasattr(poly, 'geoms') else [poly]): d.polygon([((x - X0) * S, (z - Z0) * S) for x, z in g.exterior.coords], fill=255)
    px = w / 2 + (wx - cx) * k; pz = h / 2 + (wz - cz) * k; ok = (px >= 0) & (px < w - 1) & (pz >= 0) & (pz < h - 1)
    al = ndi.gaussian_filter((np.asarray(m) > 0).astype(np.float32) * ok, 3.0)[..., None]; al = np.clip(al * 1.6 - 0.3, 0, 1) * ok[..., None]
    smp = a[np.clip(pz, 0, h - 1).astype(int), np.clip(px, 0, w - 1).astype(int)]
    # the render is brighter and more saturated than the photo: pull it toward the photo's tone under the same mask
    sel = al[..., 0] > 0.5; gain = (out[sel].mean(axis=0) / np.maximum(smp[sel].mean(axis=0), 1)) ** 0.6; smp = smp * gain[None, None, :]
    out = out * (1 - al) + smp * al
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, 'map.jpg'), quality=84)
print('map.jpg', W, H, os.path.getsize(os.path.join(OUT, 'map.jpg')) // 1024, 'kB')
