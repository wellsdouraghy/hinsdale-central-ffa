#!/usr/bin/env python3
"""Earl of March: lidar elevation for the campus frame (needs numpy tifffile fsspec aiohttp pyproj).

Source: Natural Resources Canada HRDEM, the City of Ottawa / Gatineau 2020 lidar project at 1 m (Open Government
Licence - Canada): a bare-earth DTM and a first-return DSM (roofs, tree crowns) as cloud-optimised GeoTIFFs on the
CanElevation bucket (found through the STAC API https://datacube.services.geo.ca/stac/api, collection hrdem-lidar).
Only the 512 px tiles under the requested window are read (HTTP range requests) and cached as .npy + .json under
tools/data/dem/ (gitignored). The files are in EPSG:3979 (NAD83(CSRS) / Canada Atlas Lambert, metres; heights CGVD2013):
at Kanata that grid is rotated ~17 deg from true north, so NOTHING here assumes an axis-aligned extent (rule F24): the
georeferencing is read from the GeoTIFF tags (ModelPixelScale / ModelTiepoint), and every sample goes
local (x east, z south) -> lat / lon -> EPSG:3979 through pyproj.

  python dem.py            fetch / check the windows the bake needs and print their extents
"""
import json, math, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'data', 'dem')
LAT0, LON0 = 45.32305, -75.89570
phi = math.radians(LAT0)
M_LAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
BUCKET = 'https://canelevation-dem.s3.ca-central-1.amazonaws.com/'
LIDAR = 'hrdem-lidar/VILLE_OTTAWA-Ottawa_Gatineau_2020-1m-%s.tif'       # %s = dtm | dsm
MRDEM = 'mrdem-30/mrdem-30-%s.tif'                                         # independent check: Copernicus-derived 30 m model
_tr = None
def tr():
    global _tr
    if _tr is None:
        from pyproj import Transformer
        _tr = Transformer.from_crs(4326, 3979, always_xy=True)
    return _tr
def to3979(x, z): return tr().transform(LON0 + np.asarray(x, float) / M_LON, LAT0 - np.asarray(z, float) / M_LAT)

def fetch(name, url, half, level=0):
    """Window of +-half metres round the origin from overview `level` (pixel = 2**level x the base pixel)."""
    p = os.path.join(CACHE, name + '.npy'); pj = os.path.join(CACHE, name + '.json')
    if os.path.exists(p) and os.path.exists(pj): return np.load(p), json.load(open(pj))
    import fsspec, tifffile
    os.makedirs(CACHE, exist_ok=True)
    f = fsspec.open(url, block_size=2 << 20).open(); tf = tifffile.TiffFile(f); base = tf.pages[0]; pg = tf.series[0].levels[level].pages[0]
    gk = base.tags['GeoKeyDirectoryTag'].value; epsg = [gk[i + 3] for i in range(4, len(gk), 4) if gk[i] == 3072]
    assert epsg == [3979], 'unexpected CRS %r' % (epsg,)
    sx, sy, _ = base.tags['ModelPixelScaleTag'].value; tp = base.tags['ModelTiepointTag'].value
    ox, oy = tp[3] - tp[0] * sx, tp[4] + tp[1] * sy
    sx *= base.imagewidth / pg.imagewidth; sy *= base.imagelength / pg.imagelength     # overview pixel size
    E0, N0 = to3979(0, 0)
    c0 = int((E0 - half - ox) / sx); c1 = int((E0 + half - ox) / sx) + 2; r0 = int((oy - (N0 + half)) / sy); r1 = int((oy - (N0 - half)) / sy) + 2
    tw, tl = pg.tilewidth, pg.tilelength; ntx = math.ceil(pg.imagewidth / tw)
    out = np.full((r1 - r0, c1 - c0), np.nan, np.float32)
    for tr_ in range(r0 // tl, (r1 - 1) // tl + 1):
        for tc in range(c0 // tw, (c1 - 1) // tw + 1):
            idx = tr_ * ntx + tc; n = pg.databytecounts[idx]
            if n == 0: continue
            f.seek(pg.dataoffsets[idx]); seg = np.squeeze(pg.decode(f.read(n), idx)[0]); y0 = tr_ * tl; x0 = tc * tw
            ys = slice(max(r0, y0), min(r1, y0 + tl)); xs = slice(max(c0, x0), min(c1, x0 + tw))
            out[ys.start - r0:ys.stop - r0, xs.start - c0:xs.stop - c0] = seg[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0]
    out[out < -1000] = np.nan
    meta = dict(e0=ox + c0 * sx, n0=oy - r0 * sy, sx=sx, sy=sy, shape=list(out.shape), epsg=3979, src=url, level=level)
    np.save(p, out); json.dump(meta, open(pj, 'w'))
    return out, meta

class Dem:
    """Bilinear sampler in the campus frame; pixel centres at e0 + (i + 0.5) sx, n0 - (j + 0.5) sy."""
    def __init__(self, a, meta): self.a, self.m = a.astype(np.float64), meta
    def at(self, x, z):
        a, m = self.a, self.m; E, N = to3979(x, z)
        fx = np.clip((E - m['e0']) / m['sx'] - 0.5, 0, a.shape[1] - 1.001); fy = np.clip((m['n0'] - N) / m['sy'] - 0.5, 0, a.shape[0] - 1.001)
        i = np.floor(fx).astype(int); j = np.floor(fy).astype(int); u = fx - i; v = fy - j
        return a[j, i] * (1 - u) * (1 - v) + a[j, i + 1] * u * (1 - v) + a[j + 1, i] * (1 - u) * v + a[j + 1, i + 1] * u * v
    def covers(self, half):
        """True when the window holds the +-half square of the campus frame (corners, after the grid rotation)."""
        m = self.m; ok = True
        for x, z in ((-half, -half), (half, -half), (half, half), (-half, half)):
            E, N = to3979(x, z); ok &= m['e0'] + m['sx'] <= E <= m['e0'] + (m['shape'][1] - 1) * m['sx'] and m['n0'] - (m['shape'][0] - 1) * m['sy'] <= N <= m['n0'] - m['sy']
        return bool(ok)

def lidar(kind, half=720): return Dem(*fetch('%s_%d' % (kind, half), BUCKET + LIDAR % kind, half))
def lidar_far(half=2400, level=3): return Dem(*fetch('dtm_far_%d' % half, BUCKET + LIDAR % 'dtm', half, level))
def mrdem(half=1200): return Dem(*fetch('mrdem_dtm_%d' % half, BUCKET + MRDEM % 'dtm', half))

if __name__ == '__main__':
    for name, d, need in (('dtm 1 m', lidar('dtm'), 500), ('dsm 1 m', lidar('dsm'), 500), ('dtm 8 m', lidar_far(), 1650)):
        a = d.a; print('%s: %d x %d px, pixel %.2f x %.2f m (EPSG:3979), range %.1f..%.1f, nodata %.2f %%, covers +-%d m: %s' % (name, a.shape[1], a.shape[0], d.m['sx'], d.m['sy'], np.nanmin(a), np.nanmax(a), 100 * np.isnan(a).mean(), need, d.covers(need)))
    E, N = to3979([0, 100, 0], [0, 0, -100]); print('grid convergence at the origin: %.2f deg (east axis), local 100 m = %.3f / %.3f m on the grid' % (math.degrees(math.atan2(N[1] - N[0], E[1] - E[0])), math.hypot(E[1] - E[0], N[1] - N[0]), math.hypot(E[2] - E[0], N[2] - N[0])))
