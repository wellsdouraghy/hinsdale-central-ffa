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
FIELD = dict(cx=-35.9, cz=95.1, ang=-4.26, L=94.3, W=52.9)     # Tom Ryan Field, painted lines (103 x 58 yd)
TENNIS = dict(cx=-96.7, cz=-27.2, ang=32.2)
BUILDINGS = [
    (9000000001, dict(building='school', name='The Commons (north wing)', part='commons_n'), uv(CO, CA, 0, 33, 0, 8.8)),
    (9000000002, dict(building='school', name='The Commons', part='commons_hall'), uv(CO, CA, 8.5, 42, 8.8, 19.5)),
    (9000000003, dict(building='school', name='The Commons (south wing)', part='commons_s'), uv(CO, CA, 13, 33, 19.5, 25)),
    (9000000004, dict(building='school', name='Douglas Fine Arts Center (studios)', part='arts_w'), obb(37.0, 9.5, 16, 13, -9)),
    (9000000005, dict(building='school', name='Douglas Fine Arts Center (Maxwell Music Hall)', part='arts_e'), obb(61.0, 15.3, 23, 10, -9)),
    (9000000006, dict(building='school', name='Douglas Fine Arts Center (link)', part='arts_link'), obb(47.5, 10.5, 6, 5, -9)),
]
AREAS = [
    (9000000101, dict(leisure='pitch', sport='soccer', surface='artificial_turf', name='Tom Ryan Field'), obb(FIELD['cx'], FIELD['cz'], FIELD['L'] + 8, FIELD['W'] + 7, FIELD['ang'])),
    (9000000102, dict(leisure='pitch', sport='tennis', name='Tennis Courts'), obb(TENNIS['cx'], TENNIS['cz'], 36.6, 33.5, TENNIS['ang'])),
]
