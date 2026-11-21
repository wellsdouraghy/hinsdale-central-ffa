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
     [[-152, 159], [-139, 159], [-133, 163], [-133, 169], [-138, 171.5], [-141, 173.5], [-146, 175.5], [-151, 177.5], [-153, 182], [-156.5, 182], [-158.5, 178], [-157.5, 171.5], [-155.5, 165], [-153.5, 161]]),   # (west side kept 1 m clear of New Oaks' footprint)
]
AREAS = [
    (9000000101, dict(leisure='pitch', sport='soccer', surface='artificial_turf', name='Tom Ryan Field'), obb(FIELD['cx'], FIELD['cz'], FIELD['L'] + 5, FIELD['W'] + 4, FIELD['ang'])),
    (9000000102, dict(leisure='pitch', sport='tennis', name='Tennis Courts'), obb(TENNIS['cx'], TENNIS['cz'], 36.6, 33.5, TENNIS['ang'])),
]

# Paved outlines traced from nadir Google 3D-tiles views (tools/ground_fix.py paints them as asphalt; streets are painted by
# the engine from the street design): the car park north of the tennis shed, the visitor lot in front of Katharine Branson
# Hall, the gym service drive down to the Bridge.
PAVED = [
    [(-156.3, -3.5), (-149.2, -11.8), (-145.3, -8.7), (-137.4, -2.3), (-145.3, 8.3), (-146, 10.7), (-150, 9.9), (-152.4, 5.2), (-157.9, 2)],   # the Commons' service yard under its west gable
    [(-181.5, -27.5), (-153, -43.2), (-110.3, -55.2), (-105.7, -38.8), (-149, -26.8), (-176, -12.5)],   # faculty car park along Fernhill (aisle + stalls both sides)
    [(-95.9, -56.5), (-88, -57.6), (-82.5, -62), (-76, -64.8), (-58.6, -68.6), (-50, -68.9), (-43.5, -69.2), (-40.2, -64), (-42.3, -60.2), (-46.2, -54.5), (-46.3, -36.7), (-53.3, -35.5), (-57.5, -34), (-59.5, -36.5), (-70.3, -45.2), (-71.7, -44), (-75, -46.6), (-79.2, -41.5), (-81.5, -42.5), (-90.5, -48.5), (-92.9, -52.4)],   # the faculty car park north of the tennis shed: the whole lot (nadir tiles, QA round 4), not a Y-shaped drive
    [[-29, -25.5], [-19.5, -37], [-16.5, -37.5], [-14, -34.5], [-12.5, -25], [-5.5, -20.3], [12, -21.5], [13.1, -6.4], [15.5, -1.7], [12, -0.5], [0.3, -5.2], [-16, -8.7], [-23, -13.3], [-30, -22.7]],   # the visitor lot (fix round 5: on north along the hall's green strip to the lane)
    [(-112, 58), (-102.7, 62.7), (-96.8, 70.9), (-109.1, 72.6), (-121.3, 76.7), (-122.5, 93), (-120.7, 95.3), (-126.6, 95.9), (-134.1, 84.3), (-143.5, 88.3), (-144.6, 86), (-134.1, 80.8), (-123.6, 70.9)],
]
# The car-park loop (nadir tiles, 12.5 px/m): a one-way lane round an island whose north half is a boulder garden and whose
# south half is a stall row; a second stall row on the outer south-east kerb. Asphalt = LOOP_OUTER minus LOOP_GARDEN.
LOOP_OUTER = [[-106.8, 44.4], [-101.6, 40.8], [-95.2, 37.2], [-87.2, 35.2], [-75.2, 35.6], [-66.4, 37.8], [-62.4, 39.8], [-68.4, 45.2], [-67.6, 48.3], [-66.0, 51.0], [-66.5, 55.4], [-68.1, 59.4], [-71.1, 62.5], [-74.4, 65.0], [-77.7, 67.1], [-81.3, 68.7], [-85.0, 69.8], [-89.0, 70.2], [-93.1, 69.6], [-95.6, 66.0], [-101.6, 65.3], [-107.2, 62.4], [-109.7, 58.0], [-110.4, 53.2], [-109.2, 47.6]]
LOOP_GARDEN = [[-103.6, 51.6], [-100.8, 47.6], [-95.2, 44.0], [-87.2, 41.6], [-80.0, 42.0], [-76.2, 45.6], [-77.6, 47.2], [-84.0, 49.2], [-88.0, 51.6], [-92.0, 53.6], [-98.4, 56.0], [-102.8, 54.8]]
# the Commons' dining terrace: a paved stone plaza between the hall's south-east end and the loop
TERRACE = [[-120.4, 26.4], [-112.4, 17.6], [-108.0, 21.2], [-103.2, 23.6], [-98.4, 27.2], [-92.5, 28.2], [-87.0, 28.5], [-86.6, 35.2], [-95.2, 37.2], [-101.6, 40.8], [-106.8, 44.4], [-109.6, 42.0], [-115.2, 34.0]]
# the paved court between New House and the Fine Arts studios, its lawn panel and the brick square with the sculpture
ARTS_PLAZA = [[19.6, -9.3], [21.5, -9.6], [36.5, -10.2], [37.0, -12.6], [42.5, -13.0], [46.0, -11.5], [45.8, -1.0], [47.3, 8.0], [44.5, 8.4], [43.6, 1.6], [33.5, 3.6], [33.2, -6.0], [22.0, -5.5], [19.8, -5.3]]   # (QA round 4: the walk from the drive, the strip south along the studios' east wall, the corner by New House's porch)
ARTS_LAWN = [[22.6, -5.0], [32.7, -5.5], [33.0, 3.2], [24.0, 4.6]]   # (a lawn panel south of the walk: outside the paved outline now)
ARTS_BRICK = [[36.0, -7.0], [41.5, -7.0], [41.5, -1.5], [36.0, -1.5]]
# asphalt drive along Katharine Branson Hall's south front, and the paved strips of the quad (line, width)
PAVED_LINES = [([[-176.9, 5.2], [-166.6, 14.6], [-156.3, 21.0], [-150.0, 30.5]], 3.4), ([[-73.1, 3.0], [-62, 1.4], [-56, 2.6], [-50, 4.9], [-44, 6.6], [-38, 7.7], [-32, 9.2], [-27, 12], [-22.5, 15.8], [-17.5, 23.5]], 3.0)]
PATHS = [([[-165.8, 127.2], [-158.8, 117.3]], 5.0), ([[-176.3, 138.8], [-167.0, 149.3], [-153.0, 156.3]], 3.5), ([[-153.0, 122.5], [-146.0, 148.2]], 3.0),
         ([[-87.3, 18.4], [-86.6, 14.5], [-82.0, 9.5], [-73.5, 3.4]], 2.0)]   # the walk from the head of the Alumni Steps up to the hall's south drive
# a tree island in the faculty car park (x, z, radius), the loop island's dry creek of pale cobbles, the dry clearing west of the
# faculty lot drive (nadir tiles: straw-coloured bare ground in the wood)
LOT_ISLANDS = [(-56.0, -51.0, 2.3)]
LOOP_SWALE = ([[-100.5, 50.8], [-95.5, 48.6], [-90.0, 46.6], [-84.0, 45.2], [-80.5, 44.6]], 2.2)
DRY = [[(-219, -31), (-212, -34.5), (-203, -34), (-197.5, -31), (-198.5, -26.5), (-204, -24), (-213, -24.5), (-218, -27)]]
# the floor of the wood round the red base, between the west drive and the faculty lot's entrance: bare earth and leaf litter under a closed canopy
# (nadir tiles: no lawn anywhere in this wood; every gap in the canopy shows dry ground)
LITTER = [[(-193.0, -36.5), (-183.5, -36.5), (-180.0, -31.5), (-180.5, -23.0), (-185.5, -16.5), (-192.0, -17.5)]]
# OSM service ways: paved width (the faculty car park is an aisle with stalls on both sides)
SERVICE_W = {570965048: 5.0, 570965046: 6.0, 570965047: 4.5, 785563172: 4.0}

# The neighbour's swimming pool north of Fernhill Ave (nadir tiles): water, paved deck, pool house
POOL = [[-189, -73], [-183, -71.5], [-186, -60], [-192, -61.5]]
POOL_DECK = [[-196, -76], [-179, -73.5], [-181, -69], [-185, -58], [-196, -59.5], [-196.5, -70]]
POOL_HOUSE = [[-195, -58], [-188, -58], [-188, -54], [-195, -54]]

# Fix round 5 (nadir tiles): paved walks and door aprons (points, width), the round patio, the red tile forecourt of the hall's entrance;
# lawns and beds that are dry gold in the (summer) tiles, as (outline, tone); the faculty car park is pale grey paving
WALKS = [
    ([[-17.9, -36.5], [-16.2, -40], [-15.8, -48], [-16.6, -56], [-17.8, -61.5]], 2.6),   # the lane along the hall east wall
    ([[-22.3, 10.6], [-24.9, 13.9]], 2.0),   # the hall south door
    ([[2.6, 6.4], [-7, 18.6]], 3.2),   # the terrace along the hall south-east end
    ([[-7, 18.6], [-12, 23.5], [-15, 26.6]], 2.6),   # its walk to the round patio
    ([[2.6, 6.4], [5.5, 1.5], [7, -1.8]], 2.0),   # from the terrace to the visitor lot
    ([[-15.3, -7.0], [-14.2, -8.5]], 2.4),   # the hall north-east door
    ([[-44.7, -48.5], [-46.8, -48.2]], 2.4),   # north block, west door
    ([[-28.1, -63.9], [-26.9, -65.5], [-21.5, -63.6], [-17.9, -61.3]], 1.8),   # north block, north-east door
    ([[-19.9, -50.1], [-16.2, -50.5]], 2.2),   # north block, east door
    ([[-24.4, -34.7], [-23.5, -34.0], [-21.4, -36.7], [-19.3, -36.9]], 1.8),   # north block, court door
    ([[60.2, 10.2], [60.0, 8.6], [52, 7.4], [46.4, 6.9]], 1.8),   # Music Hall north door
    ([[-147.4, 95.4], [-151, 101], [-157, 110], [-159, 115]], 2.4),   # from the Bridge to the quad
]
PATIO = (-15, 27, 3.0)
ENTR_COURT = [[-40.44, -0.4], [-34.89, 3.71], [-38.57, 8.69], [-44.14, 4.58]]
DRY_LAWNS = [
    ([(-72, 5.5), (-60, 4), (-52, 6.5), (-44, 9), (-36, 10), (-30, 12), (-25, 16), (-19, 23), (-17, 30), (-30, 36), (-50, 34), (-70, 28), (-84, 20), (-80, 10)], (110, 116, 70)),   # the hall's south lawn: mown, pale olive
    ([(-150, -24), (-128, -30), (-116, -30), (-112, -12), (-122, -2), (-138, -16), (-146, -10)], (138, 126, 90)),   # the bank between the faculty car park and the Commons
    ([(-132, 50), (-112, 47), (-111, 57), (-124, 68), (-134, 62)], (140, 126, 90)),   # the bed south-west of the loop
    ([(-65.5, 49), (-59, 49), (-57.5, 58), (-63, 63.5), (-70, 67), (-78, 70.5), (-80, 69.5), (-73, 65), (-68, 60), (-65.5, 54)], (132, 112, 88)),   # the mulched bed south-east of the loop
]
WEST_LOT_TONE = (142, 144, 152)
