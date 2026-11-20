#!/usr/bin/env python3
"""The Branson School: fetch OpenStreetMap data (Overpass) and convert it to local metres.
Writes public/campuses/branson/campus.json in the same shape as public/data/campus.json
(+x east, +z south, origin = ORIGIN).  Usage: python osm.py [raw.json]   (raw.json = cached Overpass reply)
"""
import json, math, os, sys, urllib.request, urllib.parse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
import extra

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'public/campuses/branson')
ORIGIN = (37.96545, -122.56545)            # lat, lon: the middle of campus (the quad between the upper and lower school)
SAT = dict(minX=-330.0, maxX=330.0, minZ=-300.0, maxZ=300.0)   # must match sat.py
BBOX = (37.9618, -122.5700, 37.9691, -122.5609)
MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
           'https://overpass.private.coffee/api/interpreter']
QUERY = ('[out:json][timeout:90][bbox:%f,%f,%f,%f];(way["building"];relation["building"];way["highway"];way["leisure"];'
         'relation["leisure"];way["amenity"];relation["amenity"];way["landuse"];way["natural"];way["barrier"];way["waterway"];'
         'way["man_made"];node["natural"="tree"];node["highway"];node["amenity"];node["barrier"];node["man_made"];);out geom;') % BBOX

phi = math.radians(ORIGIN[0])
M_LAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
M_LON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)


def fetch():
    data = urllib.parse.urlencode({'data': QUERY}).encode()
    for u in MIRRORS:
        try:
            req = urllib.request.Request(u, data=data, headers={'User-Agent': 'campus-map-builder/1.0'})
            raw = urllib.request.urlopen(req, timeout=150).read()
            if raw[:1] == b'{': return json.loads(raw)
        except Exception as e:
            print('mirror failed', u, e)
    raise SystemExit('all Overpass mirrors failed')


def xz(lat, lon): return [round((lon - ORIGIN[1]) * M_LON, 2), round(-(lat - ORIGIN[0]) * M_LAT, 2)]
def ring(geom): return [xz(p['lat'], p['lon']) for p in geom]


def join(ways):
    """stitch relation member ways into closed rings"""
    segs = [w[:] for w in ways if len(w) > 1]; rings = []
    while segs:
        cur = segs.pop(0)
        while cur[0] != cur[-1]:
            for i, s in enumerate(segs):
                if s[0] == cur[-1]: cur += s[1:]; segs.pop(i); break
                if s[-1] == cur[-1]: cur += s[-2::-1]; segs.pop(i); break
            else: break
        if cur[0] == cur[-1] and len(cur) > 3: rings.append(cur)
    return rings


def main():
    raw = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else fetch()
    buildings, roads, areas, barriers, points = [], [], [], [], []
    AREA_KEYS = ('leisure', 'amenity', 'landuse', 'natural')
    for e in raw['elements']:
        t = e.get('tags', {})
        if e['type'] == 'node':
            if t: points.append(dict(id=e['id'], p=xz(e['lat'], e['lon']), tags=t))
            continue
        if e['type'] == 'way':
            g = ring(e['geometry']); closed = len(g) > 3 and g[0] == g[-1]
            if 'building' in t and closed: buildings.append(dict(id=e['id'], tags=t, outer=[g[:-1]], inner=[]))
            elif 'highway' in t and not (closed and t.get('area') == 'yes'): roads.append(dict(id=e['id'], tags=t, line=g))
            elif 'barrier' in t: barriers.append(dict(id=e['id'], tags=t, line=g))
            elif closed and any(k in t for k in AREA_KEYS) or (closed and 'highway' in t): areas.append(dict(id=e['id'], tags=t, outer=[g[:-1]], inner=[]))
            elif 'waterway' in t or 'man_made' in t: roads.append(dict(id=e['id'], tags=t, line=g)) if 'waterway' in t else None
        elif e['type'] == 'relation':
            outer = join([ring(m['geometry']) for m in e['members'] if m['type'] == 'way' and m.get('role') != 'inner' and 'geometry' in m])
            inner = join([ring(m['geometry']) for m in e['members'] if m['type'] == 'way' and m.get('role') == 'inner' and 'geometry' in m])
            if not outer: continue
            rec = dict(id=e['id'], tags=t, outer=[r[:-1] for r in outer], inner=[r[:-1] for r in inner])
            (buildings if 'building' in t else areas).append(rec)
    for i, t, r in extra.BUILDINGS: buildings.append(dict(id=i, tags=t, outer=[r], inner=[]))
    for i, t, r in extra.AREAS: areas.append(dict(id=i, tags=t, outer=[r], inner=[]))
    out = dict(
        frame=dict(origin_lat=ORIGIN[0], origin_lon=ORIGIN[1], meters_per_deg_lat=M_LAT, meters_per_deg_lon=M_LON, axes='+x east, +z south, y up (meters)'),
        satellite=dict(file='campuses/branson/satellite.jpg', **SAT, attribution='Esri World Imagery (Esri, Maxar, Earthstar Geographics, and the GIS User Community)'),
        attribution='Map data (c) OpenStreetMap contributors, ODbL',
        buildings=buildings, roads=roads, areas=areas, barriers=barriers, points=points)
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(os.path.join(OUT, 'campus.json'), 'w'), separators=(',', ':'))
    print('buildings', len(buildings), 'roads', len(roads), 'areas', len(areas), 'barriers', len(barriers), 'points', len(points))


if __name__ == '__main__':
    main()
