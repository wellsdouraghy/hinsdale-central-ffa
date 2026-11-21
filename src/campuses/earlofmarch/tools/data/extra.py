"""Earl of March: hand-traced outlines shared by the offline tools (mirrored in ../../kit.js: keep the two in step).
Coordinates: campus frame, x east, z south, metres from the origin (45.32305, -75.89570)."""
# The play-area fence line (ctx.playEdge, rule F48), clockwise from the south-west corner: west through the wood beside the
# track, the far (north-west) kerb of The Parkway, across it north-east of the car park's second entrance, past the south-west
# wall of 2 The Parkway, the wood line along the north car park, the bus loop and the east drive, then the near side of
# Campeau Drive (the road itself stays outside), and the line between the Mlacak Centre and the March Tennis Club's courts.
PLAY_EDGE = [[-176, 226.5], [-176, -50.7], [-164.3, -61.9], [-146.0, -76.1], [-47.0, -153.1], [-36.9, -160.2], [12.1, -197.2], [26.2, -207.3], [37.2, -215.3],
             [47, -191], [50.5, -184.5], [66, -157.5], [72, -152.5], [125, -99], [146, -74], [168, -46], [184, -24], [201, 4], [212, 22], [215, 45], [218, 68], [228, 84], [237, 85],
             [222.0, 93.4], [197.0, 113.2], [165.5, 143.7], [137.2, 174.9], [126.6, 186.6], [117.1, 195.0], [94.9, 222.4], [87.1, 232], [18, 232], [-27, 226.5]]
BUILDINGS = []
AREAS = []

# The running track (nadir 3D tiles, 5 m grid): a plain grey oval, no lane paint; straights 91 m, inside radius 32 m, 7.5 m
# wide; centre (-117.3, 80.5), long axis 2.4 deg west of south. Infield: a grass pitch, goals at both ends.
import math
TRACK = dict(cx=-117.3, cz=80.5, ang=-2.4, half=45.5, r=32.0, w=7.5)
def track_ring(off, n=24):
    """Oval at `off` metres outside the track's inside edge (off = 0 inside edge, off = w outside edge)."""
    t = TRACK; a = math.radians(t['ang']); ax, az = math.sin(a), math.cos(a); px, pz = az, -ax; R = t['r'] + off; pts = []
    for k in range(n + 1):
        th = math.pi * k / n; pts.append((t['cx'] + ax * t['half'] + px * R * math.cos(th) + ax * R * math.sin(th), t['cz'] + az * t['half'] + pz * R * math.cos(th) + az * R * math.sin(th)))
    for k in range(n + 1):
        th = math.pi + math.pi * k / n; pts.append((t['cx'] - ax * t['half'] + px * R * math.cos(th) + ax * R * math.sin(th), t['cz'] - az * t['half'] + pz * R * math.cos(th) + az * R * math.sin(th)))
    return [[round(x, 2), round(z, 2)] for x, z in pts]
# hand corrections to the vectorised paving (traced on gridded nadir tiles): added asphalt, cut-outs (lawn), concrete
PAVED_ADD = []
PAVED_CUT = [track_ring(TRACK['w'] + 3.0)]
CONCRETE = []
# Surfaces painted from their designed outline with their own tone: (outer ring, [holes], class, rgb as baked into the macro).
# The track is a pale grey asphalt oval (class asphalt keeps footsteps, stall and kerb tests right; the tone is the tiles').
TONED = [(track_ring(TRACK['w']), [track_ring(0.0)], 'asphalt', (126, 125, 122))]
# the library / Mlacak forecourt: banded concrete paving between the library's east wall and the drop-off loop (nadir tiles)
# (fix round 1: the forecourt's one irregular outline is replaced by the traced paver plaza, drop-off loop and island in EPOCH below)
# the March Tennis Club's courts south of the fence (OSM 228647260 clay, 1502896439 hard): seen from the Mlacak lot, painted only
TONED += [([[-53.7, 253.8], [-27.2, 228.2], [16.2, 272.8], [-10.2, 298.4]], [], 'dirt', (150, 78, 58)), ([[-81.6, 280.9], [-55.1, 255.2], [-11.6, 299.8], [-38.1, 325.5]], [], 'concrete', (58, 84, 128))]

# ---- round 2: hand corrections traced on gridded nadir tiles with the vector outlines drawn on them (rules F34 / F42)
def obox(cx, cz, length, width, deg):
    a = math.radians(deg); ux, uz = math.cos(a), math.sin(a); hl, hw = length / 2, width / 2
    return [[round(cx + ux * su * hl - uz * sv * hw, 2), round(cz + uz * su * hl + ux * sv * hw, 2)] for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
# the bus loop's two islands: the classifier's outlines wobbled with the crowns' shadows; clean curves instead
_OVAL = [[84, -37], [88, -41], [94, -41.5], [99, -38], [100.5, -32], [98, -25.5], [93, -23.5], [87, -25], [83.5, -30]]
_BIG = [[100, -66], [108, -75], [116, -78], [122, -75], [129, -68], [137, -58], [144, -48], [146, -40], [143, -33], [136, -30], [128, -31], [121, -36], [115, -45], [108, -50], [102, -57]]
def _scaled(r, k):
    cx = sum(p[0] for p in r) / len(r); cz = sum(p[1] for p in r) / len(r); return [[round(cx + (p[0] - cx) * k, 2), round(cz + (p[1] - cz) * k, 2)] for p in r]
PAVED_ADD += [_scaled(_OVAL, 1.3), _scaled(_BIG, 1.12)]   # (paves over the old wobbly outline; the clean island is then cut out of it)
PAVED_CUT += [_OVAL, _BIG]
# the north car park's planted end islands and median (too narrow for the 1 m vectoriser): grass strips with kerbs
PAVED_CUT += [obox(-3.9, -129.8, 9, 2.6, 46), obox(10.1, -114.9, 9, 2.6, 46), obox(24, -101, 9, 2.6, 46), obox(36.3, -87.9, 9, 2.6, 46),
              obox(74.7, -122.8, 12, 5, 46), obox(88.6, -108.8, 9, 2.6, 46), obox(62.5, -106, 27, 3.5, 37)]


# =====================================================================================================================
# Fix round 1 (independent QA): ONE imagery epoch for buildings AND paving (rule F53). The Esri photo the classifier reads
# is years older than the Google 3D tiles (2025): the portable yard was re-laid, eight portables left, seven came, the
# grades 7-8 plaza and the Mlacak forecourt were not what the classifier made of them. Everything below is traced on
# gridded nadir tiles shots (5 m grid, dev/shots/earlofmarch-v2/ref_*_g.jpg, local only).
def band(pts, w):
    """Closed ring round a polyline of width w (mitred joins; the JS twin is lib.js lineRing)."""
    L, R, n = [], [], len(pts)
    for i in range(n):
        a, p, b = pts[max(0, i - 1)], pts[i], pts[min(n - 1, i + 1)]
        ax, az, bx, bz = p[0] - a[0], p[1] - a[1], b[0] - p[0], b[1] - p[1]; la, lb = math.hypot(ax, az), math.hypot(bx, bz)
        if la < 1e-9: ax, az, la = bx, bz, lb
        if lb < 1e-9: bx, bz, lb = ax, az, la
        ax, az, bx, bz = ax / la, az / la, bx / lb, bz / lb; mx, mz = ax + bx, az + bz; ml = math.hypot(mx, mz) or 1; mx, mz = mx / ml, mz / ml
        hw = w / 2 / max(0.45, mx * ax + mz * az); L.append([round(p[0] - mz * hw, 2), round(p[1] + mx * hw, 2)]); R.append([round(p[0] + mz * hw, 2), round(p[1] - mx * hw, 2)])
    return L + R[::-1]
def curve(pts, n=6):
    """Catmull-Rom through the points (for the sweeping walks): n pieces per span."""
    out = []; P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append([round(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3), 2) for j in (0, 1)])
    out.append(list(pts[-1])); return out

# ---- portables (tiles nadirs ref_p1..p5): OSM units that are gone, units the tiles show and OSM lacks (9.9 x 7.5 m like the OSM ones)
PORTABLES_GONE = [1303108341, 1303108342, 1303108343, 1303108344, 1303108350, 1303108351, 1303108352, 1303108353]
_PT = dict(building='portable_classroom', source='Google 3D tiles nadir (fix round 1)')
_ROW3 = [(-79.8, -27.4), (-86.75, -20.35), (-93.7, -13.3)]      # the three-unit row west of the yard, long sides end to end
BUILDINGS += [(9100001 + i, _PT, obox(x, z, 9.9, 7.5, 134.8)) for i, (x, z) in enumerate(_ROW3)]
BUILDINGS += [(9100004, _PT, obox(-77.0, 7.3, 9.9, 7.5, 137)), (9100005, _PT, obox(-59.0, 1.3, 9.9, 7.5, 132)),
              (9100006, _PT, obox(-36.2, 20.6, 9.9, 7.5, 45)), (9100007, _PT, obox(-29.1, 27.7, 9.9, 7.5, 45)), (9100008, _PT, obox(-31.0, -121.0, 9.9, 7.5, 138.7))]

# ---- paving, applied in order AFTER the classifier + the lists above: ('lawn' | 'asphalt' | 'concrete', ring)
EPOCH = []
# the portable yard north-west of the school: lawn crossed by concrete walks, one grey asphalt path curving round to the north
_YARD = [(-112, -92), (-46, -102), (-41, -97), (-35, -87), (-28.5, -77.5), (-22, -68), (-19.5, -63), (-21.5, -57), (-15.5, -50), (-13, -45), (-13, -30), (-14, -22),
         (-19.6, -18.5), (-30, -6), (-9.5, 19), (-3.5, 16), (3.5, 22.5), (30, 52), (33, 56), (20, 62), (-112, 62)]
EPOCH += [('lawn', _YARD), ('lawn', obox(-39.8, -106.0, 12.5, 9.5, 138.7)), ('lawn', obox(2.0, -91.4, 12.5, 9.5, 138.7))]
YARD_PATH = curve([(-41, -98), (-45, -93), (-52, -86), (-61, -79.5), (-70, -73), (-77, -66.5), (-80.5, -59), (-80.5, -52), (-78.5, -45), (-74, -39), (-67, -32), (-60, -26), (-54, -21)], 3)
EPOCH += [('asphalt', band(YARD_PATH, 5.5))]
EPOCH += [('concrete', band([(-55, -22), (-14, 19)], 7.0)),                                              # the main diagonal walk
          ('concrete', band(curve([(-14, 19), (-8.5, 29), (-2.5, 38), (3, 46.5), (7, 53), (14, 57), (24, 55), (33, 52)], 3), 2.8)),   # ... on past units 0 and 11 to the school's south-west yard
          ('concrete', band([(-13, 21), (-5, 17.5), (4, 13), (11, 7)], 3.5)),                            # ... and its branch between the rows to the lane along the school
          ('concrete', [(-52.5, -23.5), (-46, -30), (-43.5, -31.2), (-35.5, -32.6), (-19.6, -46.6), (-15, -51.5), (-12, -45), (-12, -22), (-14, -21), (-16, -23), (-17.5, -27.5), (-22, -29.5),
                        (-31, -28.5), (-36, -24), (-37.5, -18), (-40, -14.5), (-45, -17), (-50, -21)]),   # the apron south-east of the row 29 / 30 / 12, round the lawn island
          ('concrete', band([(-45.5, -38.5), (-26.7, -55), (-20, -62)], 5.0)),                           # the lane behind that row
          ('concrete', band([(-42, -96.5), (-35, -87), (-28.5, -77.5), (-22, -68), (-17.5, -61.5)], 5.5)),   # the walk from the north pad down to the yard
          ('concrete', [(-48, -97.5), (-42.5, -103), (-37, -98), (-42.5, -92)])]
# bare earth where the tiles show construction staging (stacked lumber on the two rows that left, graded soil north of the path)
DIRT = [obox(-57.4, -70.7, 31, 9, -41.5), obox(-39.3, -53.3, 31, 8.5, -41.5), [(-90, -88), (-78, -96), (-62, -102), (-50, -104), (-48, -99), (-56, -91), (-66, -83), (-80, -80)]]
TONED += [(r, [], 'dirt', (158, 136, 104)) for r in DIRT]

# the grades 7-8 plaza south-east of the school (ref_s1 / ref_s2): lawn, two sweeping concrete walks, a paver forecourt, the painted asphalt play yard
_SE = [(146, 10), (152, 8), (163, 7), (172, 5), (183, 8), (190, 23), (195, 37), (198, 50), (199.5, 60), (198.5, 66.5), (160, 73.6), (141.5, 77.2), (135, 80.5), (110, 107), (99, 99), (130, 60), (140, 30)]
# (the two arcs agree with OSM footway 640379716, whose nodes were checked on the same nadir)
SE_ARC_IN = curve([(150.5, 18), (155, 20.5), (160, 22.5), (165, 25.5), (170, 29.5), (173.5, 33.5), (176.5, 39), (177.5, 42)], 4)
SE_ARC_OUT = curve([(149.5, 11), (156, 12.5), (163, 15), (169, 18.5), (174.5, 23), (178, 27.5), (176.5, 31), (174, 33.5)], 4)
SE_FORECOURT = [(167, 41), (176.5, 37.5), (178.4, 45), (178.6, 56.8), (163.5, 56.6), (160, 50)]
SE_PAVILION = [(125.5, 75), (135.4, 68.5), (140.6, 74), (146, 76.2), (133, 81.5), (128, 83.5), (123, 78)]
EAST_YARD = [(163.5, 56.6), (178.6, 56.8), (179.6, 68.4), (144.6, 74.7)]   # (fix round 2: pale concrete with four-square grids in the tiles, not dark asphalt)
EPOCH += [('lawn', _SE), ('concrete', EAST_YARD),
          ('concrete', SE_FORECOURT), ('concrete', band(SE_ARC_IN, 3.2)), ('concrete', band(SE_ARC_OUT, 3.0)),
          ('concrete', [(140, 21.5), (147.2, 13.9), (150, 10.5), (153, 13.5), (150, 22.5), (146.5, 25)]),
          ('concrete', band([(127, 79.7), (198, 66.9)], 3.6)), ('concrete', band([(162.6, 55.2), (141.5, 75.0)], 2.6)),
          # the narrow walks OSM has and the tiles show: along the east drive, the link from the outer arc to it, the frame east of the forecourt
          ('concrete', band([(145.1, 2.1), (151.3, 9.3), (156.5, 11.5), (165.1, 4.3)], 2.2)), ('concrete', band([(160.9, -0.1), (165.1, 4.3), (183.2, 22.8), (200.5, 40.6), (205.9, 44.7)], 2.2)),
          ('concrete', band([(178.3, 27.8), (183.2, 22.8), (194.3, 13.7)], 2.2)), ('concrete', band([(186.1, 70.2), (188.1, 57.9), (180.9, 57.8)], 2.0)), ('concrete', band([(178.6, 71.4), (180.9, 57.8), (179.7, 46.2), (177.9, 41.9)], 2.0)),
          ('concrete', SE_PAVILION), ('concrete', [(126, 76), (147, 75.5), (147, 78.6), (126, 82.4)])]   # (fix round 2: the walk along the court yard's north-west side is the yard's own border, YARD below)

# the Mlacak Centre / library forecourt (ref_m1): a gridded paver plaza along the library, the drop-off loop round a planted island, the walk along its south-east side
ML_ISLAND = curve([(64, 137), (67, 134), (71, 132.5), (74.5, 133.5), (77.5, 136.5), (78.5, 139.5), (72, 147.5), (67.5, 152.5), (65, 151), (63, 146.5), (62.8, 141.5), (64, 137)], 3)[:-1]
ML_PLAZA = [(53.6, 124.6), (58, 127.2), (55.5, 132), (54.2, 138), (54.3, 145), (56, 150.5), (59.5, 154.5), (62, 157.5), (56.5, 163.5), (52.5, 167), (51, 174), (47, 176), (40, 160), (38, 152), (45, 138)]
EPOCH += [('asphalt', [(55, 125.5), (66, 127), (76, 131), (82, 138), (82, 142), (70, 158), (60, 158), (53, 148)]), ('lawn', ML_ISLAND),
          ('concrete', ML_PLAZA), ('concrete', band([(81.5, 141.5), (74.5, 149.5), (68.5, 156), (62, 158.5)], 3.5)),
          ('lawn', [(50.5, 127.5), (53.5, 126), (54, 131), (51.5, 137), (48.5, 136)]), ('lawn', [(45.5, 157), (49.5, 155.5), (51, 160), (48.5, 164), (46, 162.5)])]
# OSM footways the classifier painted as thin asphalt paths are not kept inside these outlines (the old layout)
FOOT_CUT = [_YARD, _SE]
# paving that keeps its outline but takes the tiles' tone: the lot west of the Mlacak annex is pale beige, not dark asphalt (ring, rgb in the macro)
RETONE = []   # (fix round 2: the lot west of the annex is re-traced as LOT2 below and takes its tone there)


# =====================================================================================================================
# Fix round 2 (independent QA, second review). Everything traced on gridded nadir 3D-tiles shots (dev/shots/earlofmarch-v3/t_n_*.jpg, local only).
# ---- The Parkway at the bend north-west of the track: two OSM nodes lie on the road's south-east edge (tiles AND photo): moved onto the centreline
ROAD_MOVE = {69092492: [((-159.9, -56.6), (-162.5, -57.5)), ((-141.7, -70.7), (-143.5, -72.2))]}

# ---- the car park west of the Mlacak annex (t_n_lot2): a crisp rectangle turned 28 deg, yellow stall lines; its south-west side runs on as the south
# edge of the drive in front of the annex. The classifier had made a rounded blob that spilled onto the lawn and the wood.
LOT2 = [(-77.0, 163.5), (-54.3, 178.4), (-50.0, 181.2), (-50.0, 225.7), (-98.4, 200.0)]
EPOCH += [('lawn', [(-115, 150), (-78, 150), (-52, 172), (-49.6, 181), (-49.6, 226.4), (-75, 236), (-115, 236)]), ('asphalt', LOT2),
          ('concrete', band([(-61.3, 196.9), (-66.3, 206.8)], 3.0))]          # the walk along the annex's north-west corner
# OSM's aisle looped through the old layout of this lot: the way now ends where the drive enters the lot (epoch.py / osm.py: ROAD_SET = { way id: line })
ROAD_SET = {549798901: [[35, 244], [-8, 222], [-19, 220], [-26, 219], [-30, 218], [-44, 217], [-58, 210.5]]}
RETONE += [(LOT2, (140, 131, 121)), ([(-50.5, 181), (-50.5, 226), (-36, 232), (-24, 232), (-24, 205)], (140, 131, 121))]   # (... and the drive in front of the annex, the same pale surface in the tiles)

# ---- the court yard south of the grades 7-8 wing (t_n_seplaza): a pale concrete pad 16.5 m wide in a frame of paler concrete walks on its north-west,
# south-west and south-east sides, running north-east to the walk in front of the wing. Yard frame: origin = the pad's west corner, a along its long
# side (north-east), b across (south-east).
YARD_O, YARD_A, YARD_B = (109.4, 109.7), (0.727, -0.687), (0.687, 0.727)
def yab(pts): return [(round(YARD_O[0] + a * YARD_A[0] + b * YARD_B[0], 2), round(YARD_O[1] + a * YARD_A[1] + b * YARD_B[1], 2)) for a, b in pts]
YARD_PAD = yab([(0, 0), (46.5, 0), (58, 7.5), (58, 16.5), (0, 16.5)])
EPOCH += [('lawn', yab([(0, -9), (33, -9), (33, -3.3), (0, -3.3)])), ('lawn', yab([(-3.3, 20), (45, 20), (45, 25), (-3.3, 25)])),
          ('concrete', yab([(-3.3, -3.3), (36, -3.3), (46.5, 0), (58, 7.5), (58, 16.5), (38.5, 16.5), (38.5, 20), (-3.3, 20)]))]
PALE = (150, 147, 144)
TONED += [(YARD_PAD, [], 'concrete', PALE), (EAST_YARD, [], 'concrete', PALE)]

# ---- the east drive (t_n_edrive): the lawn triangle between the bus loop and the school, the wooded island between the loop and the drive, and the
# parking pad along the school's north-east wall: clean curves instead of the classifier's wobble (pave a ring 3.5 m wide round each, cut the island).
def _closed(pts, n=4): return curve(list(pts) + [pts[0]], n)[:-1]
def _grow(r, d):
    from shapely.geometry import Polygon as _P
    return [(round(x, 2), round(z, 2)) for x, z in list(_P(r).buffer(d, join_style=1).simplify(0.2).exterior.coords)[:-1]]
E_TRI = _closed([(125.9, -17.7), (132, -18.7), (138.9, -18.4), (144.2, -16.0), (146.7, -9.2), (142.8, -5.4), (137.9, -5.6), (131.5, -11.5)])
E_WOOD = _closed([(144.2, -21.8), (151.2, -25.1), (159.9, -26.3), (166, -24.4), (171, -20.1), (175.9, -11.5), (180.9, -1.6), (185.8, 7), (187.6, 13.5)], 4)[:33] + [(184, 17), (172, 11), (164, 9), (162.5, 4.1), (148, -11), (146.4, -16.5)]
E_PAD = [(141.5, -4.5), (148, -11), (162.5, 4.1), (156, 10.6)]
_i = next(k for k, (op, r) in enumerate(EPOCH) if r is _SE)      # (before the grades 7-8 plaza's own outlines: its lawn and walks are applied over these)
EPOCH[_i:_i] = [('asphalt', _grow(E_TRI, 3.5)), ('lawn', E_TRI), ('asphalt', _grow(E_WOOD, 3.5)), ('lawn', E_WOOD), ('asphalt', E_PAD)]

# ---- bare earth (t_n_pads): brown soil with wheel tracks north of the yard path; the two rows that left are a lumber yard (stacks: grounds.js)
DIRT[2] = [(-84, -77), (-81, -87), (-73, -94), (-63, -102), (-53, -109), (-43, -115.5), (-38.5, -111.5), (-45.5, -104), (-50, -99), (-56, -92.5), (-62.5, -87.5), (-68.5, -81.5), (-75, -75.5), (-80.5, -74.5)]
TONED[:] = [t for t in TONED if t[2] != 'dirt' or t[3] != (158, 136, 104)]
TONED += [(DIRT[0], [], 'dirt', (150, 124, 90)), (DIRT[1], [], 'dirt', (150, 124, 90)), (DIRT[2], [], 'dirt', (128, 108, 82))]
# wheel tracks (pairs of ruts 1.8 m apart are drawn by ground_fix.py along these lines)
DIRT_TRACKS = [[(-80, -80), (-70, -88), (-60, -97), (-50, -106), (-42, -112)], [(-76, -79), (-66, -87), (-57, -94), (-52, -101)], [(-58, -100), (-52, -104), (-47, -103)],
               [(-52, -41), (-43, -49), (-35, -57), (-28, -63)], [(-70, -60), (-62, -67), (-53, -75), (-46, -81)]]

# ---- the March Tennis Club beyond the south fence (t_n_tennis): the north block is RED acrylic with four GREEN courts (not clay), the south-west block
# green with blue courts; lines, nets and the club's fence are grounds.js tennis()
TENNIS = [dict(ring=[[-53.7, 253.8], [-27.2, 228.2], [16.2, 272.8], [-10.2, 298.4]], surround=(150, 66, 54), court=(86, 140, 104)),
          dict(ring=[[-81.6, 280.9], [-55.1, 255.2], [-11.6, 299.8], [-38.1, 325.5]], surround=(82, 132, 104), court=(58, 88, 150))]
TONED[:] = [t for t in TONED if t[3] not in ((150, 78, 58), (58, 84, 128))]
TONED += [(t['ring'], [], 'concrete', t['surround']) for t in TENNIS]
def _courts(t):   # four courts side by side along the block's long side, each 10.97 x 23.77 m with its own coloured margin (0.9 / 1.6 m); grounds.js draws the lines on the same frame
    A, B, C = t['ring'][0], t['ring'][1], t['ring'][2]; Ls = math.hypot(B[0] - A[0], B[1] - A[1]); sx, sz = (B[0] - A[0]) / Ls, (B[1] - A[1]) / Ls; Ll = math.hypot(C[0] - B[0], C[1] - B[1]); lx, lz = (C[0] - B[0]) / Ll, (C[1] - B[1]) / Ll
    P = lambda l, q: (round(A[0] + lx * l + sx * q, 2), round(A[1] + lz * l + sz * q, 2)); hw, hl = 10.97 / 2 + 0.9, 23.77 / 2 + 1.6
    return [[P(Ll * (k + 0.5) / 4 - hw, Ls / 2 - hl), P(Ll * (k + 0.5) / 4 + hw, Ls / 2 - hl), P(Ll * (k + 0.5) / 4 + hw, Ls / 2 + hl), P(Ll * (k + 0.5) / 4 - hw, Ls / 2 + hl)] for k in range(4)]
TONED += [(r, [], 'concrete', t['court']) for t in TENNIS for r in _courts(t)]

# ---- the apartment block's pool east of the east drive (t_n_edrive: a blue pool in a salmon deck, 20 m beyond the fence, seen from the drive)
POOL = dict(deck=[(209.5, -8.5), (228, -8.5), (228, 9.5), (209.5, 9.5)], water=[(217.2, -5.6), (226.2, -5.6), (226.2, 4.4), (217.2, 4.4)])
TONED += [(POOL['deck'], [], 'concrete', (176, 138, 122))]

# ---- woods (t_n_trkw, t_n_sep, t_n_lot2): where the tiles show CLOSED canopy. world.js fills these to a closed canopy with an understorey, ground_fix.py
# paints the forest floor under them (the photo's own pixels there are crown tops and read as lawn between the trunks).
WOODS = [
    [(-236, 50), (-214, 43), (-192, 46), (-179, 58), (-172, 72), (-170, 100), (-168, 120), (-164, 140), (-161, 165), (-163, 185), (-175, 198), (-205, 204), (-232, 198), (-246, 175), (-243, 140), (-232, 118), (-222, 100), (-232, 80)],   # west of the track
    [(-62, 30), (-50, 22), (-35, 24), (-22, 34), (-12, 48), (-10, 60), (-18, 70), (-35, 74), (-52, 72), (-62, 62), (-66, 45)],                                                                                                   # between the track and the south portables
    [(-66, 100), (-50, 90), (-30, 91), (-14, 99), (-6, 114), (-4, 134), (-9, 146), (-22, 151), (-31, 155), (-35, 162), (-40, 168), (-48, 171), (-60, 168.5), (-70, 166), (-79, 158), (-90, 157), (-94, 150), (-84, 143), (-74, 138), (-68, 125), (-70, 110)],   # between the Mlacak lot and the field
    [(149.5, 98.5), (158, 87.5), (170.5, 84), (183.5, 85.5), (194.5, 93.5), (204, 105), (207, 113), (196, 124), (180, 140), (165, 154), (152, 150), (140, 147), (130.5, 140), (129, 128), (123, 125), (135, 112)],                # south-east of the court yard
    [(-123, 180), (-110, 174), (-99, 177), (-97, 186), (-101, 197), (-99.5, 202.5), (-90, 208), (-78, 214.5), (-70, 219), (-68, 228), (-80, 236), (-128, 236), (-136, 220), (-133, 198)],                                         # south-west of the Mlacak lot (t_n_lot2)
]
SITE = dict(lot2=LOT2, yard=dict(o=YARD_O, a=YARD_A, b=YARD_B, pad=YARD_PAD), eastYard=EAST_YARD, ePad=E_PAD, tennis=TENNIS, pool=POOL, woods=WOODS, dirt=DIRT)
