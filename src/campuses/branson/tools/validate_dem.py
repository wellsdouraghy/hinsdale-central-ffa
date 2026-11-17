#!/usr/bin/env python3
"""Rule F24: spot-check the baked terrain against USGS point elevations (EPQS, the same 3DEP data served per point,
so a registration or scale error in the bake shows as metres of error on any slope). Reads public/campuses/branson/
terrain.bin + gen.json (fieldLevel) and prints the error at a 6 x 6 lattice over the satellite rectangle (edges
included: there the bin is blended into the 20 m backdrop grid) plus named spots. Mean |error| over 1.5 m = fail.
Usage: python validate_dem.py"""
import json, os, sys, math, urllib.request, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', 'public/campuses/branson'))
LAT0, LON0 = 37.96545, -122.56545; phi = math.radians(LAT0)
M_LAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi); M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
NX, NZ, X0, Z0, STEP = 331, 301, -330.0, -300.0, 2.0
H = np.fromfile(os.path.join(OUT, 'terrain.bin'), '<i2').reshape(NZ, NX) * 0.01
Y0 = json.load(open(os.path.join(OUT, 'gen.json')))['fieldLevel']
def height(x, z):
    fx = min(max((x - X0) / STEP, 0), NX - 1.001); fz = min(max((z - Z0) / STEP, 0), NZ - 1.001); i, j = int(fx), int(fz); u, v = fx - i, fz - j
    return H[j, i] * (1 - u) * (1 - v) + H[j, i + 1] * u * (1 - v) + H[j + 1, i] * (1 - u) * v + H[j + 1, i + 1] * u * v
def epqs(x, z):
    url = 'https://epqs.nationalmap.gov/v1/json?x=%.7f&y=%.7f&units=Meters&wkid=4326&includeDate=false' % (LON0 + x / M_LON, LAT0 - z / M_LAT)
    for k in range(4):
        try: return float(json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'campus-terrain-bake'}), timeout=40))['value'])
        except Exception as e: time.sleep(1.5)
    return None
pts = [('grid', x, z) for z in (-296, -180, -60, 60, 180, 296) for x in (-326, -196, -66, 66, 196, 326)]
pts += [('field centre', -36, 95), ('field S edge', -36, 122), ('creek behind field', -36, 132), ('hill S of field', -36, 165), ('gym W', -120, 105), ('quad', -160, 135),
        ('bridge', -141, 88), ('loop', -90, 48), ('Commons', -131, 10), ('KBH lawn', -40, 22), ('visitor lot', 0, -12), ('tennis', -97, -27), ('Fernhill gate', 0, -97),
        ('Fine Arts', 55, 12), ('Ivy Dr', 60, 120), ('Southwood', -190, 60)]
rows = []
for name, x, z in pts:
    e = epqs(x, z)
    if e is None: print('  %-20s (%5d, %5d) EPQS failed' % (name, x, z)); continue
    g = height(x, z); edge = min(x + 330, 330 - x, z + 300, 300 - z) < 40
    rows.append((name, x, z, g, e - Y0, g - (e - Y0), edge)); print('  %-20s (%5d, %5d) game %6.2f  USGS %6.2f  err %+5.2f%s' % (name, x, z, g, e - Y0, g - (e - Y0), '  (edge blend)' if edge else ''))
err = np.array([abs(r[5]) for r in rows]); inner = np.array([abs(r[5]) for r in rows if not r[6]])
print('points %d: mean |err| %.2f m, median %.2f, max %.2f; inside the blend band (%d): mean %.2f, max %.2f' % (len(err), err.mean(), np.median(err), err.max(), len(inner), inner.mean(), inner.max()))
sys.exit(0 if err.mean() <= 1.5 else 1)
