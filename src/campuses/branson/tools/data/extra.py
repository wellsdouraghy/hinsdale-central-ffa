"""Hand-digitised Branson features that OpenStreetMap does not have (from the Esri imagery + Google 3D tiles, checked
against the school's own campus map): the Commons (2010), the Douglas Fine Arts Center (2010), Tom Ryan Field and the
tennis courts. Local metres (+x east, +z south). Imported by osm.py; ids are 9e9 + n so they never collide with OSM."""
import math
def obb(cx, cz, w, d, ang):
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    return [[round(cx + a * c - b * s, 2), round(cz + a * s + b * c, 2)] for a, b in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
def uv(o, ang, u0, u1, v0, v1):
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    return [[round(o[0] + u * c - v * s, 2), round(o[1] + u * s + v * c, 2)] for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
CO, CA = (-140.4, -13.2), 41.5         # the Commons: north corner and the bearing of its long axis
# Tom Ryan Field, painted lines: the four corners read off a nadir Google 3D-tiles view (a true rectangle there: 94.6 x 51.2 m,
# bearing -8.94 deg). The Esri photo is sheared here (the touchlines read -5.3 deg, the goal lines 9.6 deg): the first build
# fitted a compromise rectangle (-4.26 deg, centre 3 m off) that lay on the lawn at one corner and under the gym at another.
FIELD = dict(cx=-33.2, cz=92.3, ang=-8.94, L=94.6, W=51.2)
TENNIS = dict(cx=-96.7, cz=-27.2, ang=32.2)
BUILDINGS = [
    (9000000001, dict(building='school', name='The Commons (north wing)', part='commons_n'), uv(CO, CA, 0, 33, 0, 8.8)),
    (9000000002, dict(building='school', name='The Commons', part='commons_hall'), uv(CO, CA, 8.5, 42, 8.8, 19.5)),
    (9000000003, dict(building='school', name='The Commons (south wing)', part='commons_s'), uv(CO, CA, 13, 33, 19.5, 25)),
    (9000000004, dict(building='school', name='Douglas Fine Arts Center (studios)', part='arts_w'), obb(37.0, 9.5, 16, 13, -9)),
    (9000000005, dict(building='school', name='Douglas Fine Arts Center (Maxwell Music Hall)', part='arts_e'), obb(61.0, 15.3, 23, 10, -9)),
    (9000000006, dict(building='school', name='Douglas Fine Arts Center (link)', part='arts_link'), obb(47.5, 10.5, 6, 5, -9)),
    # Tallant Science Center: the faceted modern building at the south end of the quad (OSM / county footprints lack it;
    # outline from the 2 m tile-height grid: flat roof at 9.5-10 m, checked against the nadir tiles view)
    (9000000007, dict(building='school', name='Tallant Science Center', part='tallant'),
     [[-153, 159], [-139, 159], [-133, 163], [-133, 169], [-138, 171.5], [-141, 173.5], [-146, 175.5], [-151, 177.5], [-153, 182], [-157, 182], [-161, 178], [-161, 171], [-159, 165], [-155, 161]]),
]
AREAS = [
    (9000000101, dict(leisure='pitch', sport='soccer', surface='artificial_turf', name='Tom Ryan Field'), obb(FIELD['cx'], FIELD['cz'], FIELD['L'] + 5, FIELD['W'] + 4, FIELD['ang'])),
    (9000000102, dict(leisure='pitch', sport='tennis', name='Tennis Courts'), obb(TENNIS['cx'], TENNIS['cz'], 36.6, 33.5, TENNIS['ang'])),
]

# Paved outlines traced from nadir Google 3D-tiles views (tools/ground_fix.py paints them as asphalt; streets are painted by
# the engine from the street design): the car park north of the tennis shed, the visitor lot in front of Katharine Branson
# Hall, the gym service drive down to the Bridge.
PAVED = [
    [(-181.5, -27.5), (-153, -43.2), (-110.3, -55.2), (-105.7, -38.8), (-149, -26.8), (-176, -12.5)],   # faculty car park along Fernhill (aisle + stalls both sides)
    [(-95.9, -56.5), (-77.8, -60.5), (-75.5, -64.6), (-58.6, -68.1), (-58, -62.9), (-66.1, -58.8), (-51.6, -44.8), (-46.9, -47.7), (-46.3, -36.7), (-53.3, -35.5), (-66.1, -42.5), (-82.4, -53.6), (-92.9, -52.4)],
    [(-30, -26.7), (-16, -33.2), (-12.5, -25), (-5.5, -20.3), (12, -21.5), (13.1, -6.4), (15.5, -1.7), (12, -0.5), (0.3, -5.2), (-16, -8.7), (-23, -13.3), (-30, -22.7)],
    [(-112, 58), (-102.7, 62.7), (-96.8, 70.9), (-109.1, 72.6), (-121.3, 76.7), (-122.5, 93), (-120.7, 95.3), (-126.6, 95.9), (-134.1, 84.3), (-143.5, 88.3), (-144.6, 86), (-134.1, 80.8), (-123.6, 70.9)],
]
# the loop round the rain garden: carriageway + the parking bays on its outer side (cx, cz, outer a, b, inner a, b)
PAVED_RINGS = [(-89.0, 49.5, 27.0, 20.5, 12.5, 8.0)]
# OSM service ways: paved width (the faculty car park is an aisle with stalls on both sides)
SERVICE_W = {570965048: 5.0, 570965046: 6.0, 570965047: 4.5, 785563172: 4.0}
