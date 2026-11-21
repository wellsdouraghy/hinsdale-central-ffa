#!/usr/bin/env python3
"""Earl of March Secondary School: stitch Esri World Imagery tiles (zoom 19) into public/campuses/earlofmarch/satellite.jpg covering SAT.
Needs pillow. Usage: python sat.py [tile_cache_dir]
"""
import io, math, os, sys, urllib.request
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/campuses/earlofmarch')
ORIGIN = (45.32305, -75.89570)            # lat, lon: the middle of the school site
SAT = dict(minX=-360.0, maxX=360.0, minZ=-330.0, maxZ=330.0)
ZOOM = 19
PX_PER_M = 4.0                               # output resolution (0.25 m / px, about native at this latitude)
URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%d/%d/%d'   # z / y / x
CACHE = sys.argv[1] if len(sys.argv) > 1 else None

phi = math.radians(ORIGIN[0])
M_LAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)


def ll(x, z): return ORIGIN[0] - z / M_LAT, ORIGIN[1] + x / M_LON
def tile_xy(lat, lon):
    n = 2 ** ZOOM
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def get(tx, ty):
    if CACHE:
        p = os.path.join(CACHE, '%d_%d.jpg' % (tx, ty))
        if os.path.exists(p): return Image.open(p).convert('RGB')
    req = urllib.request.Request(URL % (ZOOM, ty, tx), headers={'User-Agent': 'campus-map-builder/1.0'})
    raw = urllib.request.urlopen(req, timeout=60).read()
    if CACHE:
        os.makedirs(CACHE, exist_ok=True); open(p, 'wb').write(raw)
    return Image.open(io.BytesIO(raw)).convert('RGB')


def main():
    lat0, lon0 = ll(SAT['minX'], SAT['minZ']); lat1, lon1 = ll(SAT['maxX'], SAT['maxZ'])
    fx0, fy0 = tile_xy(lat0, lon0); fx1, fy1 = tile_xy(lat1, lon1)
    tx0, ty0, tx1, ty1 = int(fx0), int(fy0), int(fx1), int(fy1)
    mosaic = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            mosaic.paste(get(tx, ty), ((tx - tx0) * 256, (ty - ty0) * 256))
    # the area is small enough that web-mercator is linear in local metres to well under a pixel
    crop = mosaic.crop((round((fx0 - tx0) * 256), round((fy0 - ty0) * 256), round((fx1 - tx0) * 256), round((fy1 - ty0) * 256)))
    W = int((SAT['maxX'] - SAT['minX']) * PX_PER_M); H = int((SAT['maxZ'] - SAT['minZ']) * PX_PER_M)
    crop.resize((W, H), Image.LANCZOS).save(os.path.join(OUT, 'satellite.jpg'), quality=90)
    print('satellite', W, H, 'from', crop.size, 'tiles', (tx1 - tx0 + 1) * (ty1 - ty0 + 1))


if __name__ == '__main__':
    main()
