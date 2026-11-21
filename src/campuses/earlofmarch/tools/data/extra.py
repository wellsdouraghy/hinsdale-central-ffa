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
CONCRETE += [[[45.5, 131], [55, 126.5], [71, 142], [69, 158], [52, 163.5], [46.5, 152]]]
