// Marin Academy's own buildings, hand-authored over the OSM footprints. The campus climbs ~11 m from Mission Ave to the
// gyms and drops ~4 m to 5th Ave, so every building stands on the real terrain (`sited`: datum = its lowest ground, each
// wall starts at its own ground) and its roof is an ABSOLUTE height (metres above the Championship Field): 3D-tiles roof
// samples calibrated against the lidar ground next to the building (tools/terrain.py; method in MAP_NOTES.md "Marin on real terrain"); materials and roof shapes follow the aerial / 3D imagery:
// cream stucco + clay-tile hip roofs (Foster Hall, Thacher Hall, the Leadership Center and Library south of Mission
// Ave), white modern boxes (Science + Innovation Center, Visual Arts), the barrel-vaulted Old Gym with its solar array
// and the Athletic Center with its curved roof and translucent sea-green walls.
import * as THREE from 'three';
import { sited, atGround, onSlope, edgeGround, guardRail, terraceBlocks, ANG, UX, UZ, rect, gp, CLAY, CLAY_DARK, kitWalls, flatBuilding, hipBuilding, hipRoof, wellRoof, boxFromRect, ringLadder, wallDecal, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, makeCanvas, canvasTexture, mulberry32 , hillFence , hedgeMass } from './kit.js';
import { doorFromKit, roofUnit } from '../../world/facade.js';
import { propKit } from '../../world/props.js';
import { paintedQuad } from '../../world/fields.js';
import { bleachers } from '../../world/landmarks.js';

// Roof / eave heights of the school's hand-modelled buildings, metres above the Championship Field (y = 0): the 3D-tiles
// roof samples inside each footprint with the ONE constant offset to the DEM (tools/terrain.py; parapet or eave, so a
// little above the sampled deck). Re-measured after the DEM registration fix: the old values came from an offset fitted
// locally to a DEM that was stretched north-south, and were up to 1.4 m (the service building 3 m) off.
const TOP = { fosterWing: 12.0, thacher: 8.9, thacherWing: 8.3, science: 13.45, oldGym: 16.9, athletic: 16.4, athleticEast: 19.6, visArts: 4.6, campus76: 13.0, service: 15.6,
  leadership: 6.2 /* (floor = the Mission Ave walk, 1.6 m: at 5.8 the north wall stood in a 0.4 m cut behind a concrete block) */, leadershipEast: 5.8, library: 6.1, libraryWest: 5.7 /* (hip roofs: the eave is the LOW end of the samples, their 10th percentile) */, pac: 8.3, pacLow: 5.8, founders: 7.5 };

export const SCHOOL_IDS = new Set([652917773, 652917775, 652917776, 652917777, 652917778, 652917779, 652917780, 652917781, 652917782, 652917783, 652917784, 652917785, 1460794276]);
const FOSTER_ROOF = [1.75, 1.42, 1.18];   // weathered grey-brown shingle (Street View), as a tint of the tile texture
const ROT = -ANG;                                   // Bucket.box rotY that aligns a box with the street grid

function gridBox(B, key, surface, cx, cy, cz, w, h, d, s = 1) { B.v(key).box(cx, cy, cz, w, h, d, ROT, s); if (surface) B.c(surface).box(cx, cy, cz, w, h, d, ROT); }

function signTexture(lines, o = {}) {
  const W = o.w || 1024, H = o.h || 256, c = makeCanvas(W, H), g = c.getContext('2d');
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, W, H); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([txt, size, color, font], i) => { g.fillStyle = color || '#1b1b1b'; g.font = `${font || '700'} ${size}px Georgia, "Times New Roman", serif`; if (g.letterSpacing !== undefined) g.letterSpacing = o.spacing || '6px'; g.fillText(txt, W / 2, H * (i + 0.5) / lines.length + (o.dy || 0)); });
  return canvasTexture(c, { repeat: false });
}

// solar array lying on a flat roof: rows of tilted panels (grid aligned)
function solarRows(ctx, cx, cz, w, d, y, rows) {
  const { B } = ctx; const pitch = d / rows;
  for (let r = 0; r < rows; r++) {
    const b = -d / 2 + (r + 0.5) * pitch; const p = gp(cx, cz, 0, b);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p[0], y + 0.42, p[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.26, ROT, 0, 'YXZ')), new THREE.Vector3(w, 0.05, pitch * 0.78));
    B.v('solar').boxM(m, 0.5);
    B.v('galv').box(p[0], y + 0.14, p[1], w, 0.06, 0.08, ROT);
  }
  B.c('glass').box(cx, y + 0.35, cz, w, 0.7, d, ROT);
}

// ============================================================================================ Foster Hall
function fosterHall(ctx) {
  // stands on its porch terrace (flattened in sitework): ridge 21.9 m, wing eave 12.4 m above the field
  const main = rect(-18.0, -45.3, 22.4, 19.4); const pc = gp(-18.0, -45.3, 0, 9.7 + 1.7);   // (roof: grey-brown composition shingle in Street View, not red clay)
  sited(ctx, main, (base) => fosterHallAt(ctx, main, TOP.fosterWing - base), { base: ctx.groundY(pc[0], pc[1]) });
}
function fosterHallAt(ctx, main, wingEave) {
  const { B } = ctx; const eave = 8.8;
  // three-storey Italianate mansion (the original 1890s building) + the low north wing (one tall storey: it was drawn
  // two storeys high before the heights were measured against the ground it stands on)
  hipBuilding(ctx, main, eave, 'maFoster', { rise: 2.3, overhang: 0.95, tint: FOSTER_ROOF, roofs: [boxFromRect(-18.0, -45.3, 22.4, 19.4)] });
  // attic half-storey stepping up out of the main roof under its own hip (the stepped multi-hip silhouette)
  { const ah = 2.5; B.v('stucco', true).setColor(0.95, 0.83, 0.5).box(-18.0, eave + 0.9 + ah / 2, -45.3, 12.6, ah, 10.2, ROT, 0.45); B.c('concrete').box(-18.0, eave + 0.9 + ah / 2, -45.3, 12.6, ah, 10.2, ROT);
    hipRoof(ctx, boxFromRect(-18.0, -45.3, 12.6, 10.2), eave + 0.9 + ah, 2.0, { overhang: 0.8, tint: FOSTER_ROOF });
    for (const a of [-3.6, 0, 3.6]) { const q = gp(-18.0, -45.3, a, 5.13); B.v('glassInt').box(q[0], eave + 2.35, q[1], 1.5, 1.1, 0.05, ROT); B.v('whitePanel').box(q[0], eave + 1.72, q[1], 1.8, 0.1, 0.12, ROT).box(q[0], eave + 2.98, q[1], 1.8, 0.1, 0.12, ROT); } }
  const wing = rect(-14.9, -66.6, 13.2, 23.4);
  hipBuilding(ctx, wing, wingEave, 'maFoster', { rise: 2.5, overhang: 0.6, tint: FOSTER_ROOF, roofs: [boxFromRect(-14.9, -66.6, 13.2, 23.4)] });
  // dormers on the south and west roof slopes
  { const p = gp(-18.0, -45.3, 0, 7.6); B.v('stucco', true).setColor(0.95, 0.83, 0.5).box(p[0], eave + 0.95, p[1], 3.0, 1.5, 3.4, ROT, 0.45); hipRoof(ctx, boxFromRect(p[0], p[1], 3.4, 3.8), eave + 1.7, 0.9, { overhang: 0.2, noCollision: true, caps: false, tint: FOSTER_ROOF }); const q = gp(-18.0, -45.3, 0, 9.32); B.v('glassInt').box(q[0], eave + 1.0, q[1], 2.2, 1.0, 0.04, ROT); B.c('concrete').box(p[0], eave + 1.3, p[1], 3.2, 2.4, 3.6, ROT); }   // central dormer over the entrance
  B.v('stucco', true).setColor(1, 1, 1);
  // chimneys
  for (const [a, b] of [[-8.4, -4], [8.4, -4]]) { const p = gp(-18.0, -45.3, a, b); B.solidBox('brickRed', 'brick', p[0], eave + 2.2, p[1], 0.9, 3.4, 0.9, ROT, 0.5); B.v('concrete').box(p[0], eave + 3.95, p[1], 1.1, 0.12, 1.1, ROT); }
  // south porch: raised deck, square white columns, clay-tile shed roof, broad steps down to the circle
  const dep = 3.4, pw = 17.6, py = 0.45, top = 4.1;
  const c0 = gp(-18.0, -45.3, 0, 9.7 + dep / 2);
  gridBox(B, 'concrete', 'concrete', c0[0], py / 2, c0[1], pw, py, dep, 1 / 3);
  for (let k = 0; k < 2; k++) { const s = gp(-18.0, -45.3, 0, 9.7 + dep + 0.2 + k * 0.4); gridBox(B, 'concrete', null, s[0], (py - (k + 1) * 0.15) / 2, s[1], 7.0, py - (k + 1) * 0.15, 0.4, 1 / 3); }
  { const a = gp(-18.0, -45.3, -3.5, 9.7 + dep), b = gp(-18.0, -45.3, 3.5, 9.7 + dep), c = gp(-18.0, -45.3, 3.5, 9.7 + dep + 1.1), d = gp(-18.0, -45.3, -3.5, 9.7 + dep + 1.1); quadFacing(B.c('concrete'), [a[0], py, a[1]], [b[0], py, b[1]], [c[0], 0, c[1]], [d[0], 0, d[1]], [0, 1, 0]); }
  for (let i = 0; i < 6; i++) {
    const a = -pw / 2 + 0.5 + i * (pw - 1) / 5; const p = gp(-18.0, -45.3, a, 9.7 + dep - 0.35);
    B.v('whitePanel').box(p[0], py + (top - py) / 2, p[1], 0.42, top - py, 0.42, ROT); B.v('whitePanel').box(p[0], py + 0.2, p[1], 0.6, 0.4, 0.6, ROT).box(p[0], top - 0.12, p[1], 0.6, 0.24, 0.6, ROT);
    B.c('concrete').box(p[0], top / 2, p[1], 0.45, top, 0.45, ROT);
  }
  { // entablature + tiled shed roof
    const e = gp(-18.0, -45.3, 0, 9.7 + dep - 0.35); B.v('whitePanel').box(e[0], top + 0.2, e[1], pw, 0.4, 0.5, ROT);
    // wraparound: the porch returns along the west and east sides under the same brown shed roof
    for (const sd of [-1, 1]) {
      const Fs = sd < 0 ? edgeFrame(...gp(-18.0, -45.3, -11.2, 9.7 + dep), ...gp(-18.0, -45.3, -11.2, -3.6)) : edgeFrame(...gp(-18.0, -45.3, 11.2, -3.6), ...gp(-18.0, -45.3, 11.2, 9.7 + dep));
      fbox(B.v('concrete'), Fs, 0, Fs.L, 0, py, 0, dep, 1 / 3, 0, 'fst'); { const c = Fs.P(Fs.L / 2, py / 2, dep / 2); B.c('concrete').box(c[0], c[1], c[2], Fs.L, py, dep, Fs.rotY); }
      const s2 = B.v('shingles', true); s2.setColor(...FOSTER_ROOF);
      quadFacing(s2, Fs.P(-0.4, 5.3, 0), Fs.P(Fs.L + 0.4, 5.3, 0), Fs.P(Fs.L + 0.4, top + 0.42, dep + 0.5), Fs.P(-0.4, top + 0.42, dep + 0.5), [0, 1, 0], [[0, 0], [Fs.L / 3, 0], [Fs.L / 3, 1.3], [0, 1.3]]); s2.setColor(1, 1, 1);
      quadFacing(B.v('whitePanel'), Fs.P(-0.4, top + 0.4, 0), Fs.P(Fs.L + 0.4, top + 0.4, 0), Fs.P(Fs.L + 0.4, top + 0.4, dep + 0.5), Fs.P(-0.4, top + 0.4, dep + 0.5), [0, -1, 0]);
      quadFacing(B.c('concrete'), Fs.P(-0.4, 5.3, 0), Fs.P(Fs.L + 0.4, 5.3, 0), Fs.P(Fs.L + 0.4, top + 0.42, dep + 0.5), Fs.P(-0.4, top + 0.42, dep + 0.5), [0, 1, 0]);   // the whole visible roof, end overhangs included
      fbox(B.v('whitePanel'), Fs, -0.2, Fs.L + 0.2, top, top + 0.4, dep - 0.6, dep - 0.1, 1, 0, 'fstb');
      for (const u of sd < 0 ? [Fs.L - 0.5, Fs.L * 0.62, Fs.L * 0.3] : [0.5, Fs.L * 0.38, Fs.L * 0.7]) { const c = Fs.P(u, 0, dep - 0.35); B.v('whitePanel').box(c[0], py + (top - py) / 2, c[2], 0.42, top - py, 0.42, ROT); B.c('concrete').box(c[0], top / 2, c[2], 0.45, top, 0.45, ROT); }
      fbox(B.v('whitePanel'), Fs, sd < 0 ? Fs.L * 0.15 : 0.6, sd < 0 ? Fs.L - 0.6 : Fs.L * 0.85, py, py + 0.95, dep - 0.22, dep - 0.02, 1, 0, 'fstb');
    }
    const F = edgeFrame(...gp(-18.0, -45.3, pw / 2 + 0.4, 9.7), ...gp(-18.0, -45.3, -pw / 2 - 0.4, 9.7));
    const sh = B.v('shingles', true); sh.setColor(...FOSTER_ROOF);
    quadFacing(sh, F.P(0, 5.3, 0), F.P(F.L, 5.3, 0), F.P(F.L, top + 0.42, dep + 0.5), F.P(0, top + 0.42, dep + 0.5), [0, 1, 0], [[0, 0], [F.L / 3, 0], [F.L / 3, 1.3], [0, 1.3]]);
    quadFacing(B.v('whitePanel'), F.P(0, top + 0.4, 0), F.P(F.L, top + 0.4, 0), F.P(F.L, top + 0.4, dep + 0.5), F.P(0, top + 0.4, dep + 0.5), [0, -1, 0]);
    quadFacing(B.c('concrete'), F.P(0, 5.3, 0), F.P(F.L, 5.3, 0), F.P(F.L, top + 0.42, dep + 0.5), F.P(0, top + 0.42, dep + 0.5), [0, 1, 0]);
    sh.setColor(1, 1, 1);
    // front door + name over it
    const Fd = edgeFrame(...gp(-18.0, -45.3, 6, 9.72), ...gp(-18.0, -45.3, -6, 9.72));
    const lift = { ...Fd, P: (u, y, o) => { const q = Fd.P(u, y, o); q[1] += py; return q; } };
    fbox(B.v('whitePanel'), Fd, 6 - 1.5, 6 + 1.5, py, py + 3.2, 0, 0.1, 1, 0, 'fst');
    doorFromKit(ctx, { ...lift, P: (u, y, o = 0) => lift.P(u, y, o + 0.4) }, 6, { frame: 'frame', top: 'none', tint: [1, 1, 1] });
    // name board on the porch entablature, large enough to read from the circle
    { const fa = gp(-18.0, -45.3, 5.2, 9.7 + dep - 0.08), fb = gp(-18.0, -45.3, -5.2, 9.7 + dep - 0.08); const Ff = edgeFrame(fa[0], fa[1], fb[0], fb[1]);
      fbox(B.v('whitePanel'), Ff, -0.2, Ff.L + 0.2, top + 0.02, top + 1.0, -0.1, 0.04, 1, 0, 'fstb');
      wallDecal(ctx, signTexture([['FOSTER HALL', 132, '#5a1712', '800']], { w: 1536, h: 160, spacing: '14px' }), Ff, Ff.L / 2, top + 0.5, 10.0, 0.86, 0.05); }
  }
  // porch balustrade (cover) either side of the steps
  for (const s of [-1, 1]) { const p = gp(-18.0, -45.3, s * 6.25, 9.7 + dep - 0.1); gridBox(B, 'whitePanel', 'concrete', p[0], py + 0.5, p[1], 5.1, 1.0, 0.25); }
  ctx.shrubs.push([...(() => { const p = gp(-18.0, -45.3, -6.3, 9.7 + dep + 0.9); return [p[0], 0, p[1]]; })(), 5.4, 0.9, ROT]);
  ctx.shrubs.push([...(() => { const p = gp(-18.0, -45.3, 6.3, 9.7 + dep + 0.9); return [p[0], 0, p[1]]; })(), 5.4, 0.9, ROT]);
}

// ============================================================================================ Thacher Hall
function thacherHall(ctx) {
  // built into the slope between the circle (+4.5 m) and the field terrace (+1.1 m): two storeys toward the field, one
  // toward the circle. Eave 8.9 m above the field (main), 8.3 m (west wing).
  const main = rect(10.6, -1.3, 11.2, 33.4); const e = gp(10.6, -1.3, 7.6, 0);
  sited(ctx, main, (base) => thacherHallAt(ctx, main, TOP.thacher - base, TOP.thacherWing - base), { base: ctx.groundY(e[0], e[1]) });
}
function thacherHallAt(ctx, main, eave, eaveW) {
  const { B } = ctx; const west = rect(1.6, 9.2, 7.0, 10.6);
  hipBuilding(ctx, main, eave, 'maMission', { roofs: [] });
  // real roof: tiled hip perimeter round a flat grey deck carrying a long white monitor / plant enclosure
  { const wr = wellRoof(ctx, boxFromRect(10.6, -1.3, 11.2, 33.4), eave, 2.0, 2.9, { overhang: 0.8 }); const p = gp(10.6, -1.3, 0, -3); B.v('whitePanel').box(p[0], wr.deck + 0.9, p[1], 3.4, 1.8, 17, ROT); B.v('frameAlu').box(p[0], wr.deck + 1.85, p[1], 3.7, 0.1, 17.3, ROT); B.c('metal').box(p[0], wr.deck + 0.9, p[1], 3.4, 1.8, 17, ROT); const q = gp(10.6, -1.3, 0, 10.5); roofUnit(ctx, q[0], wr.deck, q[1], ROT, mulberry32(5)); }
  hipBuilding(ctx, west, eaveW, 'maMission', { rise: 1.5, overhang: 0.5, roofs: [boxFromRect(1.6, 9.2, 7.0, 10.6)] });
  // east side: a long glazed gallery under a flat canopy looking over the field
  const F = edgeFrame(...gp(10.6, -1.3, 5.6, -13), ...gp(10.6, -1.3, 5.6, 13));
  fbox(B.v('whitePanel'), F, -0.3, F.L + 0.3, 3.7, 4.0, 0, 3.0, 1, 0, 'fstb');
  for (let u = 0.2; u <= F.L; u += (F.L - 0.4) / 5) { const p = F.P(u, 0, 2.7); B.v('whitePanel').cyl(p[0], 0, p[2], 0.14, 0.14, 3.7, 10, 1, false); B.c('metal').box(p[0], 1.85, p[2], 0.3, 3.7, 0.3); }
  { const c = F.P(F.L / 2, 3.85, 1.5); B.c('metal').box(c[0], c[1], c[2], F.L + 0.6, 0.3, 3.0, F.rotY); }
}

// ============================================================================================ Science + Innovation Center
function scienceCenter(ctx, ring) { sited(ctx, ring, (base) => scienceCenterAt(ctx, ring, TOP.science - base)); }   // parapet 13.45 m above the field: three storeys toward the field, one at the gym plaza
function scienceCenterAt(ctx, ring, h) {
  const { B } = ctx;
  const { roofY } = flatBuilding(ctx, ring, h, 'maModern', { units: 3 });
  // stair / mechanical penthouse and a screened plant enclosure, as on the real roof
  const p = gp(21, -50, 0.5, -2); gridBox(B, 'whitePanel', 'metal', p[0], roofY + 1.2, p[1], 9.0, 2.4, 20.0);
  B.v('frameAlu').box(p[0], roofY + 2.45, p[1], 9.3, 0.1, 20.3, ROT);
  const q = gp(21, -50, 0, 14); gridBox(B, 'louver', 'metal', q[0], roofY + 0.9, q[1], 8.0, 1.8, 5.0, 2.2);
  // east entry canopy facing the field + building name
  const r = ensureCCW(ring); let best = null;
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.nx > 0.9 && (!best || F.L > best.L)) best = F; }
  if (best) atGround(ctx, ...((q0) => [q0[0], q0[2]])(best.P(best.L * 0.5, 0, 1.6)), () => {
    fbox(B.v('whitePanel'), best, best.L * 0.5 - 5, best.L * 0.5 + 5, 3.5, 3.85, 0, 3.2, 1, 0, 'fstb');
    const c = best.P(best.L * 0.5, 3.67, 1.6); B.c('metal').box(c[0], c[1], c[2], 10, 0.35, 3.2, best.rotY);
    for (const du of [-4.6, 4.6]) { const pp = best.P(best.L * 0.5 + du, 0, 2.9); B.v('frameAlu').cyl(pp[0], 0, pp[2], 0.1, 0.1, 3.5, 8, 1, false); B.c('metal').box(pp[0], 1.75, pp[2], 0.25, 3.5, 0.25); }
    // the name stands on the canopy's front edge on its own sign band (on the wall behind, half of it lay over the windows)
    { const sb = best.P(best.L * 0.5, 4.2, 3.1); B.v('whitePanel').box(sb[0], sb[1], sb[2], 9.8, 0.7, 0.1, best.rotY); B.c('metal').box(sb[0], sb[1], sb[2], 9.8, 0.7, 0.1, best.rotY); }
    wallDecal(ctx, ctx.M.textDecal(['SCIENCE + INNOVATION CENTER'], { w: 2048, h: 128, font: 84, color: '#3b4046', align: 'center', weight: 600, spacing: '10px' }), best, best.L * 0.5, 4.2, 8.8, 0.55, 3.17);
  }, 3);
  ringLadder(ctx, ring, 0, 0.5, roofY);
}

// ============================================================================================ Old Gym (barrel vault + solar)
function oldGym(ctx, ring) { sited(ctx, ring, (base) => oldGymAt(ctx, ring, TOP.oldGym - base)); }   // eaves 16.9 m, crown of the vault 19.2 m above the field (about 7 m / 9 m over the plaza: it was 9 m / 12.4 m)
function oldGymAt(ctx, ring, eave) {
  const { B } = ctx; const rise = 2.3;
  kitWalls(ctx, ring, eave, 'maGym');
  const r = ensureCCW(ring); B.c('concrete').prism(r, 0, eave, 1, true); B.v('whitePanel').poly(r, null, eave - 0.02, (x, z) => [x / 3, z / 3]);
  (ctx.buildingRings = ctx.buildingRings || []).push(r);
  // vault over the main hall: axis runs grid north-south
  const cx = 35.9, cz = -86.9, w = 22.6, d = 27.4, n = 12; const R = (w * w / 4 + rise * rise) / (2 * rise), a0 = Math.asin(w / 2 / R);
  const pt = (t, b) => { const a = -a0 + 2 * a0 * t; const p = gp(cx, cz, R * Math.sin(a), b); return [p[0], eave + R * Math.cos(a) - (R - rise), p[1]]; };
  const roof = B.v('whitePanel'), col = B.c('metal');
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n; const A = pt(t0, -d / 2 - 0.4), Bq = pt(t1, -d / 2 - 0.4), C = pt(t1, d / 2 + 0.4), Dd = pt(t0, d / 2 + 0.4);
    quadFacing(roof, A, Bq, C, Dd, [0, 1, 0]); quadFacing(col, A, Bq, C, Dd, [0, 1, 0]);
    // solar panels on the upper two thirds, in four blocks like the real array
    if (i >= 2 && i < n - 2) for (const [b0, b1] of [[-d / 2 + 1.2, -0.6], [0.6, d / 2 - 1.2]]) {
      const lift = (p) => [p[0], p[1] + 0.09, p[2]]; const P0 = lift(pt(t0 + 0.004, b0)), P1 = lift(pt(t1 - 0.004, b0)), P2 = lift(pt(t1 - 0.004, b1)), P3 = lift(pt(t0 + 0.004, b1));
      if (i === n / 2 - 1 || i === n / 2) continue;
      quadFacing(B.v('solar'), P0, P1, P2, P3, [0, 1, 0], [[0, 0], [1, 0], [1, 6], [0, 6]]);
    }
    // lunette end walls
    for (const b of [-d / 2, d / 2]) { const e0 = pt(t0, b), e1 = pt(t1, b), g0 = [e0[0], eave - 0.3, e0[2]], g1 = [e1[0], eave - 0.3, e1[2]]; const nrm = [-UZ * Math.sign(b), 0, UX * Math.sign(b)]; const sb = B.v('stucco', true); sb.setColor(0.94, 0.92, 0.86); quadFacing(sb, g0, g1, e1, e0, nrm, [[t0 * 8, 0], [t1 * 8, 0], [t1 * 8, 1], [t0 * 8, 1]]); quadFacing(B.c('concrete'), g0, g1, e1, e0, nrm); }
  }
  B.v('stucco', true).setColor(1, 1, 1);
  // arched window in each lunette + eave fascia
  for (const sgn of [-1, 1]) { const c = gp(cx, cz, 0, sgn * (d / 2 + 0.03)); B.v('glassInt').box(c[0], eave + 1.2, c[1], 7.0, 1.6, 0.05, ROT); B.v('frame').box(c[0], eave + 0.36, c[1], 7.3, 0.1, 0.1, ROT).box(c[0], eave + 2.04, c[1], 7.3, 0.1, 0.1, ROT); for (const k of [-3.6, -1.2, 1.2, 3.6]) { const m = gp(cx, cz, k, sgn * (d / 2 + 0.05)); B.v('frame').box(m[0], eave + 1.2, m[1], 0.09, 1.7, 0.09, ROT); } }
  const tex = ctx.M.textDecal(['MARIN ACADEMY', 'WILDCATS'], { w: 1280, h: 384, font: 118, color: '#b3261e', align: 'center', weight: 800, spacing: '10px' });
  const Fs = edgeFrame(...gp(cx, cz, w / 2, d / 2), ...gp(cx, cz, -w / 2, d / 2)); { const m = gp(cx, cz, 0, d / 2 + 0.6); const hw = eave + (ctx.B.off ? ctx.B.off.y : 0) - ctx.groundY(m[0], m[1]); wallDecal(ctx, tex, Fs, Fs.L / 2, eave - Math.max(hw * 0.27, 4.6), 7.6, 2.7, 0.18); }   /* (the south wall is 11 m tall on the real ground: under the clerestory, not a fixed share of the height) */   // on the plain band between the doors and the clerestory of the south wall
}

// ============================================================================================ Athletic Center (new gym)
function athleticCenter(ctx, ring) { sited(ctx, ring, (base) => athleticCenterAt(ctx, ring, TOP.athletic - base, TOP.athleticEast - base, base)); }   // roof 16.4 m (west) rising to 19.6 m (east) above the field
function athleticCenterAt(ctx, ring, lo, hi, base) {
  const { B } = ctx;
  kitWalls(ctx, ring, lo, 'maGymPlain');
  const r = ensureCCW(ring); B.c('concrete').prism(r, 0, lo, 1, false);
  (ctx.buildingRings = ctx.buildingRings || []).push(r);
  // curved roof: low over the west side (rounded plan), sweeping up to a high east wall of translucent panels
  const cx = -1.6, cz = -104.2, w = 34.6, d = 35.6, n = 10;
  const yAt = (t) => lo - 0.1 + (hi - lo + 0.1) * Math.sin(t * Math.PI / 2 * 0.92) / Math.sin(Math.PI / 2 * 0.92);
  const pt = (t, b) => { const p = gp(cx, cz, -w / 2 - 0.6 + (w + 1.6) * t, b); return [p[0], yAt(t), p[1]]; };
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n; const A = pt(t0, -d / 2 - 0.5), Bq = pt(t1, -d / 2 - 0.5), C = pt(t1, d / 2 + 0.5), Dd = pt(t0, d / 2 + 0.5);
    quadFacing(B.v('whitePanel'), A, Bq, C, Dd, [0, 1, 0]); quadFacing(B.c('metal'), A, Bq, C, Dd, [0, 1, 0]);
    quadFacing(B.v('panelGray'), [A[0], A[1] - 0.25, A[2]], [Bq[0], Bq[1] - 0.25, Bq[2]], [C[0], C[1] - 0.25, C[2]], [Dd[0], Dd[1] - 0.25, Dd[2]], [0, -1, 0]);
    // side infill between the wall top and the curved roof (north + south)
    for (const sgn of [-1, 1]) { const e0 = pt(t0, sgn * (d / 2 - 0.2)), e1 = pt(t1, sgn * (d / 2 - 0.2)); const nrm = [-UZ * sgn, 0, UX * sgn]; quadFacing(B.v('polyGreen'), [e0[0], lo, e0[2]], [e1[0], lo, e1[2]], [e1[0], e1[1] - 0.2, e1[2]], [e0[0], e0[1] - 0.2, e0[2]], nrm, [[t0 * 12, 0], [t1 * 12, 0], [t1 * 12, 0.5], [t0 * 12, 0.5]]); quadFacing(B.c('glass'), [e0[0], lo, e0[2]], [e1[0], lo, e1[2]], e1, e0, nrm); }
  }
  // fascia on the high and low edges
  for (const t of [0, 1]) { const a = pt(t, -d / 2 - 0.5), b = pt(t, d / 2 + 0.5); B.v('whitePanel').box((a[0] + b[0]) / 2, a[1] - 0.22, (a[2] + b[2]) / 2, 0.3, 0.5, d + 1.0, ROT); }
  // translucent panel cladding over the upper walls of the east and south faces, and the tall east clerestory
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.L < 8) continue;
    const east = F.nx > 0.8, south = F.nz > 0.8, north = F.nz < -0.8; if (!east && !south && !north) continue;
    const gE = ctx.terrain ? Math.max(0, edgeGround(ctx, a, b).max - base) : 0, y0 = Math.min(gE + 3.2, lo - 3.0);   // the panel band starts a door height above this wall's own ground
    wallRect(B.v('polyGreen'), F, 0.4, F.L - 0.4, y0, lo - 1.4, 0.17, [0, 0, F.L / 2.4, 1]);
    fbox(B.v('frameAlu'), F, 0.3, F.L - 0.3, y0 - 0.15, y0, 0, 0.2, 1, 0, 'fstb');
    if (east) { wallRect(B.v('polyGreen'), F, 0, F.L, lo, hi - 0.35, 0.02, [0, 0, F.L / 2.4, 0.9]); const c = F.P(F.L / 2, (lo + hi) / 2, -0.1); B.c('glass').box(c[0], c[1], c[2], F.L, hi - lo, 0.3, F.rotY);
      wallDecal(ctx, signTexture([['MARIN ACADEMY', 150, '#b3261e', '800'], ['ATHLETIC CENTER', 92, '#2a2d30', '600']], { w: 1536, h: 384 }), F, F.L * 0.5, y0 + 1.6, 8.4, 2.1, 0.2); }
  }
}

// ============================================================================================ Visual Arts Center
function visualArts(ctx, ring) {
  sited(ctx, ring, (base) => {
    const { roofY } = flatBuilding(ctx, ring, TOP.visArts - base, 'maVisArts', {});
    solarRows(ctx, -92.6, -22.2, 20, 7.6, roofY, 4); solarRows(ctx, -92.2, -4.2, 22, 9.6, roofY, 5);
    ringLadder(ctx, ring, 1, 0.5, roofY);
  });
}

// ============================================================================================ south campus
function leadershipCenter(ctx) {
  const { B } = ctx;
  // South campus falls ~4 m from Mission Ave to 5th Ave. Bodie Brizendine Leadership Center: long north-south bar (eave
  // 5.6 m above the field: 1.5 storeys on Mission Ave, 3 at its south end) + east wing toward the courtyard
  sited(ctx, rect(-12.4, 61.0, 10.6, 51.6), (base) => {
    const eave = TOP.leadership - base;
    hipBuilding(ctx, rect(-12.4, 61.0, 10.6, 51.6), eave, 'maMission', { roofs: [] });
    { const wr = wellRoof(ctx, boxFromRect(-12.4, 61.0, 10.6, 51.6), eave, 2.2, 2.9, { overhang: 0.8 }); const r2 = mulberry32(12); for (const b of [-17, -6, 5, 16]) { const p = gp(-12.4, 61.0, 0, b); roofUnit(ctx, p[0], wr.deck, p[1], ROT + Math.PI / 2, r2); } }
  });
  sited(ctx, rect(-2.3, 54.6, 10.4, 30.4), (base) => hipBuilding(ctx, rect(-2.3, 54.6, 10.4, 30.4), TOP.leadershipEast - base, 'maMission', { rise: 1.9, overhang: 0.7, roofs: [boxFromRect(-2.3, 54.6, 10.4, 30.4)] }));
  { const m = gp(-12.4, 61.0, 0, -26.4); atGround(ctx, m[0], m[1], (g) => { const F = edgeFrame(...gp(-12.4, 61.0, 5.3, -25.82), ...gp(-12.4, 61.0, -5.3, -25.82));
    wallDecal(ctx, signTexture([['MARIN ACADEMY', 120, '#3a2a1c']], { w: 1280, h: 200 }), F, F.L / 2, Math.max(3.2, 5.6 - g - 1.5), 7.2, 1.1, 0.09); }, 2); }
  // Library: bar along the pool side (eave 5.9 m above the field, three storeys over the pool deck) + west wing
  sited(ctx, rect(29.9, 60.4, 12.9, 42.4), (base) => {
    hipBuilding(ctx, rect(29.9, 60.4, 12.9, 42.4), TOP.library - base, 'maMission', { roofs: [] });
    const wr = wellRoof(ctx, boxFromRect(29.9, 60.4, 12.9, 42.4), TOP.library - base, 2.0, 3.3, { overhang: 0.8 }); const a = gp(29.9, 60.4, 0, -6.5); solarRows(ctx, a[0], a[1], 4.8, 20, wr.deck, 8); const r2 = mulberry32(13); for (const b of [9, 14.5]) { const p = gp(29.9, 60.4, 0, b); roofUnit(ctx, p[0], wr.deck, p[1], ROT + Math.PI / 2, r2); }
  });
  sited(ctx, rect(18.9, 58.6, 9.6, 34.6), (base) => hipBuilding(ctx, rect(18.9, 58.6, 9.6, 34.6), TOP.libraryWest - base, 'maMission', { rise: 2.0, overhang: 0.7, roofs: [boxFromRect(18.9, 58.6, 9.6, 34.6)] }));
  // courtyard between the two (a level terrace, flattened in sitework): paved patio, pergola on the Mission Ave side, cafe tables
  const cy = gp(7.7, 60.5, 0, 0); onSlope(ctx, cy[0], cy[1], 4, () => courtyard(ctx));
  courtSteps(ctx);
}
// The flight from the Mission Ave walk down to the forecourt, and the retaining blocks that hold the frontage strip either
// side of it (one wall each, coping, guard rail on the forecourt edge and along the flight).
function courtSteps(ctx) {
  const st0 = COURT_STAIR, ps = ctx.courtStair; if (!ps || !ctx.terrain) return; const st = { ...st0, bTop: ps.bTop, apron: ps.bTop - st0.bWalk }; const G = (a, b) => gp(0, 0, a, b);
  stairFlight(ctx, st, ps);
  // Either side of the flight the frontage strip is a PLANTED bank held by low walls (Street View: lawn and clipped hedges
  // between the sidewalk and the buildings, low concrete walls along the ramp), not a concrete block: a raised bed whose top
  // runs with the sidewalk (Mission Ave falls 7 % here: a level top was a wedge), ivy and a clipped hedge on it, a wall with
  // a coping on the forecourt side and along the flight, a guard rail over the drop. It carries on 2.1 m past each wing's
  // corner, where the lattice cell that straddles the edge of the forecourt dips in front of the north wall.
  const { B } = ctx; const conc = B.v('concrete'), col = B.c('concrete'), cope = B.v('limestone'), ivy = B.v('maHedge', true); const y0 = ps.botY - 0.5, bN = st.bWalk + 0.02;
  for (const [a0, a1, bS, wallA] of [[st.gapA[0] - 2.1, st.a0, st.westB, st.gapA[0]], [st.a1, st.gapA[1] + 2.1, st.eastB, st.gapA[1]]]) {
    const n = Math.max(2, Math.round((a1 - a0) / 1.4)); const top = (a) => { let m = -Infinity; for (let b = bN - 0.2; b <= bS + 0.001; b += 0.4) { const q = G(a, b); m = Math.max(m, ctx.groundY(q[0], q[1])); } return m + 0.06; };
    const hs = []; for (let i = 0; i <= n; i++) hs.push(top(a0 + (a1 - a0) * i / n)); for (let i = 1; i <= n; i++) hs[i] = Math.max(hs[i], hs[i - 1] - 0.18); for (let i = n - 1; i >= 0; i--) hs[i] = Math.max(hs[i], hs[i + 1] - 0.18);
    const P3 = (a, b, y) => { const q = G(a, b); return [q[0], y, q[1]]; }; let hMax = -Infinity;
    for (let i = 0; i < n; i++) { const u0 = a0 + (a1 - a0) * i / n, u1 = a0 + (a1 - a0) * (i + 1) / n, h0 = hs[i], h1 = hs[i + 1]; hMax = Math.max(hMax, h0, h1); const w = u1 - u0;
      ivy.setColor(0.5, 0.56, 0.46); quadFacing(ivy, P3(u0, bN, h0), P3(u1, bN, h1), P3(u1, bS, h1), P3(u0, bS, h0), [0, 1, 0], [[u0 / 2, 0], [u1 / 2, 0], [u1 / 2, (bS - bN) / 2], [u0 / 2, (bS - bN) / 2]]);
      quadFacing(col, P3(u0, bN, h0), P3(u1, bN, h1), P3(u1, bS, h1), P3(u0, bS, h0), [0, 1, 0]);
      for (const bk of [conc, col]) { const uv = bk === col ? undefined : [[0, 0], [w / 3, 0], [w / 3, 0.8], [0, 0.8]];
        quadFacing(bk, P3(u0, bS, y0), P3(u1, bS, y0), P3(u1, bS, h1), P3(u0, bS, h0), [-UZ, 0, UX], uv); quadFacing(bk, P3(u0, bN, y0), P3(u1, bN, y0), P3(u1, bN, h1), P3(u0, bN, h0), [UZ, 0, -UX], uv); }
      const south = u0 >= Math.min(wallA, st.a0) - 0.01 && u1 <= Math.max(wallA, st.a1) + 0.01;   // the stretch that faces the forecourt (the rest stands against a wing's north wall)
      if (south) quadFacing(cope, P3(u0, bS - 0.32, h0 + 0.04), P3(u1, bS - 0.32, h1 + 0.04), P3(u1, bS + 0.03, h1 + 0.04), P3(u0, bS + 0.03, h0 + 0.04), [0, 1, 0], [[0, 0], [w / 3, 0], [w / 3, 0.12], [0, 0.12]]);
      // a clipped hedge along the back of the bed (low: it must not hide the windows behind)
      { const m = G((u0 + u1) / 2, bS - 1.0); ctx.shrubs.push([m[0], (h0 + h1) / 2 + 0.04, m[1], w + 0.05, 0.7, ROT]); } }
    ivy.setColor(1, 1, 1);
    // the two ends: the wall along the flight (with its coping) and the outer end
    for (const [u, h, nrm, inner] of [[a0, hs[0], [-UX, 0, -UZ], a0 === st.a1], [a1, hs[n], [UX, 0, UZ], a1 === st.a0]]) { for (const bk of [conc, col]) quadFacing(bk, P3(u, bN, y0), P3(u, bS, y0), P3(u, bS, h), P3(u, bN, h), nrm, bk === col ? undefined : [[0, 0], [(bS - bN) / 3, 0], [(bS - bN) / 3, 0.8], [0, 0.8]]);
      if (inner) { const o = nrm[0] > 0 ? -1 : 1; quadFacing(cope, P3(u, bN, h + 0.04), P3(u, bS, h + 0.04), P3(u + o * 0.34, bS, h + 0.04), P3(u + o * 0.34, bN, h + 0.04), [0, 1, 0], [[0, 0], [1, 0], [1, 0.12], [0, 0.12]]);
        const p0 = G(u + o * 0.12, ps.bTop + 0.3), p1 = G(u + o * 0.12, bS - 0.15); if (h - ps.botY > 1.2) guardRail(ctx, p0[0], p0[1], p1[0], p1[1], h + 0.06); } }
    // guard rail on the forecourt edge
    { const e0 = Math.max(a0, Math.min(wallA, st.a0)), e1 = Math.min(a1, Math.max(wallA, st.a1)); const p0 = G(e0 + 0.1, bS - 0.14), p1 = G(e1 - 0.1, bS - 0.14); if (hMax - ps.botY > 1.2) guardRail(ctx, p0[0], p0[1], p1[0], p1[1], Math.max(top(e0), top(e1)) + 0.02); }
  }
  // the lawn strip in front of the two wings carries its clipped hedge against the wall too (Street View: about 1.2 m)
  for (const [u0, u1, bW] of [[-9.6, st.gapA[0] - 2.3, 38.9], [st.gapA[1] + 2.3, 30.6, 38.1]]) for (let u = u0; u < u1 - 0.5; u += 2.6) { const w = Math.min(2.6, u1 - u), m = G(u + w / 2, bW - 0.45); ctx.shrubs.push([m[0], ctx.groundY(m[0], m[1]) + 0.05, m[1], w, 1.1, ROT]); }
  // paving of the forecourt between the foot of the flight and the courtyard terrace
  { const pv = ctx.B.v('maPaver'); const y = (a, b) => { const q = G(a, b); return [q[0], ctx.groundY(q[0], q[1]) + 0.03, q[1]]; }; const b1 = 41.2; const cuts = [st.gapA[0], st.a0, st.a1, st.gapA[1]];
    for (let i = 0; i < 3; i++) for (let a = cuts[i]; a < cuts[i + 1] - 0.01; a += 1.9) { const a1 = Math.min(a + 1.9, cuts[i + 1]); const b0 = i === 0 ? st.westB : i === 2 ? st.eastB : st.bBot; quadFacing(pv, y(a, b0), y(a1, b0), y(a1, b1), y(a, b1), [0, 1, 0], [[a / 2.4, b0 / 2.4], [a1 / 2.4, b0 / 2.4], [a1 / 2.4, b1 / 2.4], [a / 2.4, b1 / 2.4]]); } }
}
function courtyard(ctx) {
  const { B } = ctx;
  const pv = B.v('maPaver'); const c = rect(7.7, 60.5, 10.4, 36), y = 0.03;   // wall to wall between the two buildings
  pv.quad([c[3][0], y, c[3][1]], [c[2][0], y, c[2][1]], [c[1][0], y, c[1][1]], [c[0][0], y, c[0][1]], [0, 0], [4.333, 0], [4.333, 15], [0, 15]);
  for (let i = 0; i < 4; i++) for (const b of [-20.3, -17.0]) { const p = gp(8.1, 60.5, -4.4 + i * 2.93, b); B.v('wood').box(p[0], 1.55, p[1], 0.22, 3.1, 0.22, ROT, 0.5); B.c('wood').box(p[0], 1.55, p[1], 0.3, 3.1, 0.3, ROT); }
  for (const b of [-20.3, -17.0]) { const p = gp(8.1, 60.5, 0, b); B.v('wood').box(p[0], 3.2, p[1], 10.2, 0.22, 0.16, ROT, 0.5); }
  for (let a = -4.8; a <= 4.81; a += 0.8) { const p = gp(8.1, 60.5, a, -18.65); B.v('wood').box(p[0], 3.38, p[1], 0.08, 0.16, 4.4, ROT, 0.5); }
  { const p = gp(8.1, 60.5, 0, -18.65); B.c('wood').box(p[0], 3.3, p[1], 10.2, 0.3, 4.4, ROT); }
  // round paver patio, planters against both buildings, benches, cafe chairs (the two courtyard trees come from gen.py)
  { const c0 = gp(8.1, 60.5, 0, 1.5); B.v('brickRed').cyl(c0[0], 0.0, c0[1], 3.6, 3.6, 0.045, 28, 0.5, true); B.v('limestone').cyl(c0[0], 0.0, c0[1], 3.9, 3.9, 0.035, 28, 1 / 3, true); }
  for (const [a, b, len] of [[-4.1, -12, 5], [-4.1, -1, 4], [-4.1, 12, 5], [4.1, -11, 4], [4.1, 3, 5], [4.1, 13.5, 4]]) { const p = gp(8.1, 60.5, a, b); B.solidBox('limestone', 'concrete', p[0], 0.36, p[1], 0.9, 0.72, len, ROT, 1 / 3); ctx.shrubs.push([p[0], 0.72, p[1], len - 0.6, 0.6, ROT + Math.PI / 2]); }
  for (const [a, b, r] of [[-2.9, -6.5, Math.PI / 2], [2.9, 8.5, -Math.PI / 2], [0, 16.6, 0]]) { const p = gp(8.1, 60.5, a, b); propKit.bench(ctx, p[0], p[1], ROT + r); }
  { const p = gp(8.1, 60.5, 3.2, -15.5); propKit.trashCan(ctx, p[0], p[1]); }
  for (const [a, b] of [[-2, -8], [2.2, -2], [-1.8, 5], [2.4, 11]]) for (let k = 0; k < 3; k++) { const an = k * 2.1 + a; const p = gp(8.1, 60.5, a + Math.cos(an) * 0.95, b + Math.sin(an) * 0.95); const ca = Math.cos(an), sa = Math.sin(an), R = -an + Math.PI / 2;   // bistro chair facing its table: slatted seat + back in aluminium on a dark frame
    B.v('paint', true).setColor(0.58, 0.59, 0.6).box(p[0], 0.45, p[1], 0.4, 0.03, 0.4, R).box(p[0] + ca * 0.2, 0.7, p[1] + sa * 0.2, 0.4, 0.28, 0.025, R);
    for (const sd of [-1, 1]) B.v('blackMetal').box(p[0] - ca * 0.17 - sa * sd * 0.185, 0.22, p[1] - sa * 0.17 + ca * sd * 0.185, 0.025, 0.44, 0.025, R).box(p[0] + ca * 0.2 - sa * sd * 0.185, 0.44, p[1] + sa * 0.2 + ca * sd * 0.185, 0.025, 0.88, 0.025, R); }
  B.v('paint', true).setColor(1, 1, 1);
  for (const [a, b] of [[-2, -8], [2.2, -2], [-1.8, 5], [2.4, 11]]) { const p = gp(8.1, 60.5, a, b); B.v('aluminum').cyl(p[0], 0.72, p[1], 0.55, 0.55, 0.04, 14, 1, true).cyl(p[0], 0, p[1], 0.04, 0.04, 0.72, 6, 1, false); B.c('metal').box(p[0], 0.4, p[1], 1.1, 0.8, 1.1); }
}

function performingArts(ctx, rings) {
  const { B } = ctx;
  // Performing Arts Center: tall cream box (the theatre, parapet 7.7 m above the field) with a glazed lobby toward Cottage Ave
  sited(ctx, rings.pac, (base) => pacAt(ctx, rings, TOP.pac - base, base));
  sited(ctx, rings.low, (base) => flatBuilding(ctx, rings.low, TOP.pacLow - base, 'maLowCream', { units: 1 }));
  // Founders Hall: long two-storey white bar with a clay-tile mansard edge (parapet 7.4 m above the field)
  sited(ctx, rings.founders, (base) => {
    const H = TOP.founders - base; const f = flatBuilding(ctx, rings.founders, H, 'maCream', { units: 2 });
    const fr = f.ring; const sh = B.v('shingles', true); sh.setColor(...CLAY);
    for (let i = 0; i < fr.length; i++) { const a = fr[i], b = fr[(i + 1) % fr.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.L < 1) continue; quadFacing(sh, F.P(-0.5, H - 1.1, 0.62), F.P(F.L + 0.5, H - 1.1, 0.62), F.P(F.L, H + 0.1, 0.1), F.P(0, H + 0.1, 0.1), [F.nx, 1, F.nz], [[0, 0], [F.L / 3, 0], [F.L / 3, 0.45], [0, 0.45]]); quadFacing(B.v('whitePanel'), F.P(-0.5, H - 1.1, 0.0), F.P(F.L + 0.5, H - 1.1, 0.0), F.P(F.L + 0.5, H - 1.1, 0.62), F.P(-0.5, H - 1.1, 0.62), [0, -1, 0]); const mc = F.P(F.L / 2, H - 0.5, 0.31); B.c('concrete').box(mc[0], mc[1], mc[2], F.L + 1.0, 1.2, 0.62, F.rotY); }
    sh.setColor(1, 1, 1);
  });
}
function pacAt(ctx, rings, h, base) {
  const { B } = ctx;
  const { roofY } = flatBuilding(ctx, rings.pac, h, 'maPac', { units: 3 });
  const r = ensureCCW(rings.pac);
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]);
    if (F.nx > 0.9 && F.L > 10) atGround(ctx, ...((q0) => [q0[0], q0[2]])(F.P(F.L / 2, 0, 1.3)), (g) => {
      fbox(B.v('frameAlu'), F, 2, F.L - 2, 0, 4.4, 0, 2.6, 1, 0, 'st'); wallRect(B.v('glassInt'), F, 2.1, F.L - 2.1, 0.15, 4.2, 2.62, [311, 0, 307, 1]);
      for (let u = 2; u <= F.L - 1.99; u += (F.L - 4) / 6) fbox(B.v('frameAlu'), F, u - 0.05, u + 0.05, 0, 4.4, 2.6, 2.68, 1, 0, 'fs');
      fbox(B.v('frameAlu'), F, 2, F.L - 2, 2.5, 2.6, 2.6, 2.68, 1, 0, 'ftb'); fbox(B.v('whitePanel'), F, 1.6, F.L - 1.6, 4.4, 4.75, 0, 3.6, 1, 0, 'fstb');
      const c = F.P(F.L / 2, 2.3, 1.3); B.c('glass').box(c[0], c[1], c[2], F.L - 4, 4.6, 2.6, F.rotY); { const cc = F.P(F.L / 2, 4.575, 1.8); B.c('metal').box(cc[0], cc[1], cc[2], F.L - 3.2, 0.35, 3.6, F.rotY); }
      wallDecal(ctx, signTexture([['PERFORMING ARTS CENTER', 96, '#3a2a1c', '600']], { w: 1536, h: 160 }), F, F.L / 2, Math.max(5.6, base + h - g - 2.3), 9.6, 1.0, 0.18);
    }, 3);
  }
  // roof ladder on the long west wall. (It used to sit on the 1.2 m jog at the north-west corner, where the parapets of
  // the two neighbouring walls closed the gap to less than a player's width: nobody could step off the top.)
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.nx < -0.9 && F.L > 15) { ringLadder(ctx, r, i, Math.abs(a[1] + (b[1] - a[1]) * 0.2 - 65) < Math.abs(a[1] + (b[1] - a[1]) * 0.8 - 65) ? 0.2 : 0.8, roofY); break; } }
}

// ============================================================================================ aquatic centre
// the stairs in the alley between the Library and the pool house (grid coordinates: a east, b south, metres from the
// origin): wall to wall, from the Mission Ave apron down to the pool deck. Earthworks in world.js sitework, built below.
export const POOL_STAIR = { a0: 43.76, a1: 47.03, bWalk: 35.3, apron: 0.6, tread: 0.30, landing: 0, warp: true };
// The steps from the Mission Ave sidewalk down into the Library / Leadership Center courtyard. On the correctly registered
// DEM the courtyard lies 1.6 m below the street and the step is at the building line (the 3D tiles show the sunken court
// behind a gateway on the street): a flight in the frontage strip between the back of the walk (b = bWalk) and the
// forecourt (level from b = bBot on), retaining blocks either side. Earthworks in world.js sitework (ctx.courtStair).
export const COURT_STAIR = { a0: 13.9, a1: 17.1, bWalk: 35.3, bBot: 38.6, tread: 0.28, landing: 0, apron: 0.3 /* at the least: the apron runs from the back of the walk to the top riser */, warp: true, gapA: [9.76, 21.29], westB: 39.26, eastB: 38.45 };
const POOL_HOUSE = rect(58.6, 45.6, 33.5, 9.4), POOL_HOUSE_TOP = 1.3;   // roof ~3.1 m over the Mission Ave sidewalk, ~5.2 m over the deck (tile roof samples: 1.2-1.3)
function aquaticCenter(ctx) { const c = gp(53.1, 75.6, 0, 0); atGround(ctx, c[0], c[1], () => aquaticCenterAt(ctx), 6, 'mean');
  sited(ctx, POOL_HOUSE, (base) => flatBuilding(ctx, POOL_HOUSE, POOL_HOUSE_TOP - base, 'maLow', { roof: 'white' }));
  // pool fence along the west (Library) and east (car park) deck edges, a gate gap in each
  const F = (a0, b0, a1, b1) => hillFence(ctx, [gp(53.1, 75.6, a0, b0), gp(53.1, 75.6, a1, b1)], { h: 1.8, black: true, every: 2.4 });
  F(-17.2, -18.4, -17.2, 4); F(-17.2, 8.5, -17.2, 19.0); F(18.6, -24, 18.6, -8); F(18.6, -3.5, 18.6, 19.0);
  // 5th Ave side as Street View shows it: the white wall stands back behind a planting bed (low clipped shrubs, young
  // trees, a path up to a black bar gate in the gap), with bar gates closing both ends
  { const P = (a0, b0) => gp(53.1, 75.6, a0, b0); const bar = (a0, b0, a1, b1) => hillFence(ctx, [P(a0, b0), P(a1, b1)], { h: 2.1, black: true, every: 1.0 });
    bar(6, 19.0, 10, 19.0); bar(-17.2, 19.0, -19.4, 19.0); bar(18.6, 19.0, 20.6, 19.0);
    if (!ctx.streets || ![[-9, 20.4], [14.5, 20.4]].some(([a0, b0]) => ctx.streets.surface(...P(a0, b0)))) {
      for (const [a0, w] of [[2.9, 2.6], [14.4, 7.4]]) { const c = P(a0, 20.4); hedgeMass(ctx, c[0], c[1], ctx.groundY(c[0], c[1]), w, 1.2, 0.95, ROT, 31 + Math.round(a0)); }
      // (west of the path: low clipped shrubs in the strip between the raised walk and the sidewalk)
      for (const [a0, len] of [[-16.6, 4.3], [-12.1, 4.3], [-7.6, 3.4]]) { const c = P(a0 + len / 2, 21.4); if (!ctx.streets || !ctx.streets.surface(c[0], c[1])) ctx.shrubs.push([c[0], ctx.groundY(c[0], c[1]) + 0.05, c[1], len, 0.55, ROT]); }   /* (the row ends a metre short of the path across the bed) */
      for (const [a0, b0] of [[8, 20.6], [19.6, 20.6]]) { const c = P(a0, b0); if (!ctx.streets || !ctx.streets.surface(c[0], c[1])) ctx.gen.trees.push([c[0], c[1], 0, 0.55]); } } }
  poolStairs(ctx);
}   // on the pool deck (one level pad, flattened in sitework)
// Stairs from the Mission Ave apron down to the pool deck, between the Library and the pool house: thirteen 16 cm risers
// on 30 cm treads, a landing at the top, steel handrails on both walls. Geometry from sitework (ctx.poolStair: levels and the number of risers).
function poolStairs(ctx) { const ps = ctx.poolStair; if (ps) stairFlight(ctx, { ...POOL_STAIR, bTop: ps.bTop, apron: ps.bTop - POOL_STAIR.bWalk }, ps); }
// One flight (grid coordinates, falling toward +b from st.bTop): drawn risers, collision on the plane through the nosings.
// st: { a0, a1, bTop, tread, landing (level top landing, m; default 0.5), apron (ramp from the ground to the landing; 2.2), warp (apron follows the ground at each corner: a sloping sidewalk) }
function stairFlight(ctx, st, ps) {
  const { B } = ctx; if (!ps) return; const G = (a, b) => gp(0, 0, a, b); const am = (st.a0 + st.a1) / 2, w = st.a1 - st.a0; const land = st.landing ?? 0.5, apron = st.apron ?? 2.2;
  const conc = B.v('concrete'), col = B.c('concrete'), y0 = ps.botY - 0.5;
  { // top landing: level for half a metre, then a concrete apron falling to the asphalt of the alley (the lattice ground dips toward the pool house there)
    const yT = ps.topY + 0.02, c = G(am, st.bTop - land / 2); if (land > 0) { conc.box(c[0], (y0 + yT) / 2, c[1], w, yT - y0, land, ROT, 1 / 3); col.box(c[0], (y0 + yT) / 2, c[1], w, yT - y0, land, ROT); }
    const bN = st.bTop - land - apron; let yN = yT; for (const a of [st.a0 + 0.5, am, st.a1 - 0.5]) { const q = G(a, bN); yN = Math.min(yN, ctx.groundY(q[0], q[1]) + 0.02); }
    const gN = (a) => { if (!st.warp) return yN; const q = G(a, bN - 0.15); const d = ctx.streets && ctx.streets.design(q[0], q[1]); return (d && d.zone === 'walk' ? d.y : ctx.groundY(q[0], q[1])) + 0.02; };   /* (warp: the apron starts on the sloping sidewalk, at its level at each corner) */
    const P3 = (a, b, y) => { const q = G(a, b); return [q[0], y, q[1]]; }; const q4 = [P3(st.a0, bN, gN(st.a0)), P3(st.a1, bN, gN(st.a1)), P3(st.a1, st.bTop - land, yT), P3(st.a0, st.bTop - land, yT)];
    quadFacing(conc, ...q4, [0, 1, 0], [[0, 0], [w / 3, 0], [w / 3, 0.57], [0, 0.57]]); quadFacing(col, ...q4, [0, 1, 0]); }
  for (let k = 0; k < ps.n - 1; k++) { const y = ps.topY - (k + 1) * ps.riser, c = G(am, st.bTop + (k + 0.5) * st.tread);
    conc.box(c[0], (y0 + y) / 2, c[1], w, y - y0, st.tread, ROT, 1 / 3);
    const nz = G(am, st.bTop + k * st.tread + 0.04); B.v('limestone').box(nz[0], y + 0.006, nz[1], w, 0.012, 0.08, ROT, 1 / 3); }   // nosing
  // Collision: the plane through the nosings, as on the spectator terrace. Riser boxes do not work with this controller:
  // on terrain campuses its step-up (0.45 m) only accepts a landing whose contact normal is walkable, and a capsule on a
  // 0.30 m tread always touches the next nosing (walk test: stuck on the second step). The pitch is 28 degrees.
  { const P3 = (a, b, y) => { const q = G(a, b); return [q[0], y, q[1]]; }; quadFacing(col, P3(st.a0, st.bTop, ps.topY + 0.02), P3(st.a1, st.bTop, ps.topY + 0.02), P3(st.a1, st.bTop + ps.n * st.tread, ps.botY), P3(st.a0, st.bTop + ps.n * st.tread, ps.botY), [0, 1, 0]); }
  // handrails: one on each wall, parallel to the pitch, with a level return at the top and bottom
  const g = B.v('galv');
  for (const a of [st.a0 + 0.09, st.a1 - 0.09]) { const P3 = (b, y) => { const q = G(a, b); return [q[0], y, q[1]]; };
    const t0 = P3(st.bTop - 0.35, ps.topY + 0.92), t1 = P3(st.bTop, ps.topY + 0.92), b1 = P3(st.bTop + ps.run, ps.botY + ps.riser + 0.92), b2 = P3(st.bTop + ps.run + 0.35, ps.botY + ps.riser + 0.92);
    g.tube(t0, t1, 0.022, 6).tube(t1, b1, 0.022, 6).tube(b1, b2, 0.022, 6);
    for (const f of [0, 0.33, 0.67, 1]) { const b = st.bTop + ps.run * f, y = ps.topY - (ps.topY - ps.botY - ps.riser) * f; g.tube(P3(b, y + 0.92), P3(b, y - 0.05), 0.016, 5); } }
}
function aquaticCenterAt(ctx) {
  const { B } = ctx;
  // pool house along Mission Ave (changing rooms / office), white flat roof
  // (built in aquaticCenter: it stands in the step between Mission Ave and the deck, on its own wall pads)
  // The pool itself is the shared water feature (descriptor `water`, see src/world/water.js): 25 yd lanes running
  // east-west, starting blocks along the east deck as in the imagery. Only the blocks are built (and solid) here.
  const pc = [53.1, 75.6]; const wc = [53.5, 73.6], pw = 23.6, pl = 33.6, lanes = 14;
  for (let i = 0; i < lanes; i++) { const p = gp(wc[0], wc[1], pw / 2 + 0.62, -pl / 2 + (i + 0.5) * pl / lanes); B.v('whitePanel').box(p[0], 0.4, p[1], 0.6, 0.58, 0.55, ROT); B.v('panelGray').box(p[0], 0.72, p[1], 0.7, 0.06, 0.62, ROT); B.c('concrete').box(p[0], 0.37, p[1], 0.65, 0.75, 0.6, ROT); }
  // deck enclosure: stucco wall toward 5th Ave and Cottage side, bleachers on the east deck, shade canopy, scoreboard
  const wall = (a0, b0, a1, b1, h = 2.3, dn = 0) => { const p = gp(pc[0], pc[1], (a0 + a1) / 2, (b0 + b1) / 2); const L = Math.hypot(a1 - a0, b1 - b0); const rot = ROT + (Math.abs(b1 - b0) > Math.abs(a1 - a0) ? Math.PI / 2 : 0); B.v('stucco', true).setColor(0.93, 0.93, 0.9).box(p[0], (h - dn) / 2, p[1], L, h + dn, 0.25, rot, 0.45); B.v('whitePanel').box(p[0], h + 0.04, p[1], L + 0.1, 0.08, 0.36, rot); B.c('concrete').box(p[0], (h - dn) / 2, p[1], L, h + dn, 0.25, rot); };
  wall(-14.4, 19.0, 6, 19.0, 2.4, 0.8); wall(10, 19.0, 18.6, 19.0, 2.4, 0.8);
  // West gate and the accessible way in (Street View: "entry ramp with steel handrails at left, black bar gates at both
  // ends"). 5th Ave falls to the west, so at the gate the sidewalk is 0.6 m below the deck: a concrete walk leaves the
  // sidewalk where it is level with the deck and runs along the foot of the wall to the gate (1:40 at its east end, then
  // level), a kerb and a steel handrail on the street side, three steps down to the drive at its west end.
  { const off = B.off ? B.off.y : 0; const lg = (a, b) => { const q = gp(pc[0], pc[1], a, b); return ctx.groundY(q[0], q[1]) - off; }; const P = (a, b) => gp(pc[0], pc[1], a, b);
    const conc = B.v('concrete'), col = B.c('concrete'), bm = B.v('blackMetal'), gv = B.v('galv');
    // gate: two posts, both leaves standing open into the deck
    for (const a of [-17.0, -14.4]) { const q = P(a + (a < -15 ? 0 : -0.06), 19.0); bm.box(q[0], 1.15, q[1], 0.12, 2.3, 0.12, ROT); B.c('metal').box(q[0], 1.15, q[1], 0.14, 2.3, 0.14, ROT); }
    for (const a of [-16.9, -14.56]) { const c = P(a, 18.33); for (const y of [0.12, 1.1, 2.08]) bm.box(c[0], y, c[1], 1.22, 0.04, 0.04, ROT + Math.PI / 2); for (let k = 0; k < 10; k++) { const q = P(a, 17.78 + k * 0.122); bm.box(q[0], 1.1, q[1], 0.022, 1.96, 0.022, ROT); } B.c('metal:mesh').box(c[0], 1.1, c[1], 1.22, 2.1, 0.06, ROT + Math.PI / 2); }
    // the walk: level from the gate to a = -9, then down to the ground at a = -2
    const aE = -2, yE = Math.max(lg(aE, 19.6), lg(aE, 20.3)) + 0.02, yAt = (a) => (a <= -9 ? 0.015 : 0.015 + (yE - 0.015) * (a + 9) / (aE + 9));
    const seg = (a0, a1) => { const y = yAt((a0 + a1) / 2), c = P((a0 + a1) / 2, 19.9), k = P((a0 + a1) / 2, 20.72); conc.box(c[0], y - 0.5, c[1], a1 - a0 + 0.01, 1.0, 1.5, ROT, 1 / 3); col.box(c[0], y - 0.5, c[1], a1 - a0 + 0.01, 1.0, 1.5, ROT);
      if (y - lg((a0 + a1) / 2, 21.3) > 0.12) { conc.box(k[0], y - 0.44, k[1], a1 - a0 + 0.01, 1.12, 0.14, ROT, 1 / 3); col.box(k[0], y - 0.44, k[1], a1 - a0 + 0.01, 1.12, 0.14, ROT); } };   // kerb on the street side where the walk stands above the bed
    seg(-17.4, -9); for (let a = -9; a < aE - 0.01; a += 1) seg(a, a + 1);
    { let y = yE; for (const [b0, b1] of [[19.15, 20.2], [20.2, 21.1], [21.1, 22.0]]) { y = Math.min(y, Math.max(lg(aE + 0.8, b0), lg(aE + 0.8, b1)) + 0.02); const c = P(aE + 0.8, (b0 + b1) / 2); conc.box(c[0], y - 0.4, c[1], 1.6, 0.8, b1 - b0, ROT, 1 / 3); col.box(c[0], y - 0.4, c[1], 1.6, 0.8, b1 - b0, ROT); } }   // the path across the bed to the sidewalk
    // steel handrail on the kerb, from the gate landing to where the walk is within a step of the bed
    let aR = -17.4; for (let a = -17.4; a <= aE; a += 0.5) if (yAt(a) - lg(a, 21.3) > 0.25) aR = a;
    if (aR > -16) { const y0 = yAt(-17.4), y1 = yAt(aR); for (const h of [0.92, 0.5]) { const p0 = P(-17.4, 20.72), p1 = P(aR, 20.72); gv.tube([p0[0], y0 + 0.12 + h, p0[1]], [p1[0], y1 + 0.12 + h, p1[1]], 0.02, 6); }
      for (let a = -17.4; a <= aR + 0.01; a += (aR + 17.4) / Math.max(1, Math.round((aR + 17.4) / 1.5))) { const q = P(a, 20.72); gv.box(q[0], yAt(a) + 0.58, q[1], 0.04, 0.92, 0.04, ROT); }
      const m = P((aR - 17.4) / 2, 20.72); B.c('metal').box(m[0], (y0 + y1) / 2 + 0.58, m[1], aR + 17.4, 0.95, 0.06, ROT); }
    // three steps down to the drive at the west end
    { const gW = Math.min(lg(-18.6, 19.6), lg(-18.6, 20.4)), n = Math.max(2, Math.round((0.015 - gW) / 0.16)), r = (0.015 - gW) / n; for (let k = 1; k < n; k++) { const c = P(-17.4 - (k - 0.5) * 0.3, 19.9), y = 0.015 - k * r; conc.box(c[0], y - 0.5, c[1], 0.3, 1.0, 1.5, ROT, 1 / 3); }
      { const Q = (a, b, y) => { const q = P(a, b); return [q[0], y, q[1]]; }; quadFacing(col, Q(-17.4, 19.15, 0.015), Q(-17.4, 20.65, 0.015), Q(-17.4 - n * 0.3, 20.65, gW), Q(-17.4 - n * 0.3, 19.15, gW), [0, 1, 0]); }   /* (collision: the plane through the nosings, see poolStairs) */
      for (const h of [0.92, 0.5]) { const p0 = P(-17.4, 20.72), p1 = P(-17.4 - (n - 1) * 0.3, 20.72); gv.tube([p0[0], 0.135 + h, p0[1]], [p1[0], gW + r + 0.12 + h, p1[1]], 0.02, 6); } for (const [a, y] of [[-17.4, 0.015], [-17.4 - (n - 1) * 0.3, gW + r]]) { const q = P(a, 20.72); gv.box(q[0], y + 0.58, q[1], 0.04, 0.92, 0.04, ROT); } } }
  // lettering as on the real wall: small 'AQUATIC CENTER' at the west end, 'MARIN ACADEMY' toward the east end
  { const A0 = gp(pc[0], pc[1], -14.4, 19.14), A1 = gp(pc[0], pc[1], 6, 19.14), B0 = gp(pc[0], pc[1], 10, 19.14), B1 = gp(pc[0], pc[1], 18.6, 19.14);
    const Fw = edgeFrame(A1[0], A1[1], A0[0], A0[1]), Fe = edgeFrame(B1[0], B1[1], B0[0], B0[1]);
    wallDecal(ctx, signTexture([['AQUATIC CENTER', 150, '#5a5d60', '600']], { w: 1536, h: 220 }), Fw, Fw.L - 3.4, 1.55, 3.6, 0.5, 0.02);
    wallDecal(ctx, signTexture([['MARIN ACADEMY', 150, '#8a8d90', '600']], { w: 1536, h: 220 }), Fe, Fe.L / 2, 1.55, 4.2, 0.6, 0.02); }          // south (5th Ave): the 3 m white wall Street View shows, with a gate gap
  // (west and east: a 1.8 m black pool fence, built on the finished ground in aquaticCenter below. The deck is at street
  // level; tall stucco walls on three sides made a pit of it.)
  B.v('stucco', true).setColor(1, 1, 1);
  const bl = gp(pc[0], pc[1], -13.9, -19); bleachers(ctx, { x: bl[0], z: bl[1], dir: Math.atan2(-UX, -UZ), len: 21, rows: 4, run: 0.66, rise: 0.3, frontH: 0 });   // west deck, facing the blocks
  { // scoreboard at the south end
    const p = gp(pc[0], pc[1], -9, 18.2); const pt = B.v('paint', true); pt.setColor(0.04, 0.04, 0.05); pt.box(p[0], 4.1, p[1], 5.2, 2.2, 0.25, ROT); pt.setColor(0.62, 0.07, 0.06).box(p[0], 5.4, p[1], 5.2, 0.4, 0.27, ROT);
    for (const k of [-2.2, 2.2]) { const q = gp(pc[0], pc[1], -9 + k, 18.2); B.v('galv').cyl(q[0], 0, q[1], 0.07, 0.07, 3.0, 6, 1, false); }
    B.c('metal').box(p[0], 4.3, p[1], 5.2, 2.7, 0.3, ROT); B.v('paint', true).setColor(1, 1, 1);
  }
  // shade sails / canopy on steel posts over the north deck
  { const p = gp(pc[0], pc[1], 0, -21.6); const aw = B.v('awning', true); aw.setColor(0.86, 0.84, 0.78); aw.box(p[0], 3.3, p[1], 30, 0.06, 3.6, ROT); for (const a of [-14.5, -5, 5, 14.5]) { const q = gp(pc[0], pc[1], a, -20.2); B.v('galv').cyl(q[0], 0, q[1], 0.06, 0.06, 3.3, 6, 1, false); B.c('metal').box(q[0], 1.65, q[1], 0.2, 3.3, 0.2); } B.c('metal').box(p[0], 3.3, p[1], 30, 0.15, 3.6, ROT); aw.setColor(1, 1, 1); }
}

// Every school building the facade kit walls: [name, ring, roof / eave height above the field, style, forced level].
// sitework plans their walls on the natural ground and seats each wall piece on a level pad (kit.js planWalls).
export function schoolWalls(ctx) {
  const ring = (id) => ctx.data.buildings.find((b) => b.id === id).outer[0];
  return [
    ['Foster Hall', rect(-18.0, -45.3, 22.4, 19.4), null, 'maFoster', 'porch'], ['Foster Hall north wing', rect(-14.9, -66.6, 13.2, 23.4), TOP.fosterWing, 'maFoster'],
    ['Thacher Hall', rect(10.6, -1.3, 11.2, 33.4), TOP.thacher, 'maMission'], ['Thacher Hall west wing', rect(1.6, 9.2, 7.0, 10.6), TOP.thacherWing, 'maMission'],
    ['Science + Innovation Center', ring(652917782), TOP.science, 'maModern'], ['Old Gym', ring(652917783), TOP.oldGym, 'maGym'], ['Athletic Center', ring(652917773), TOP.athletic, 'maGymPlain'],
    ['Visual Arts Center', ring(652917785), TOP.visArts, 'maVisArts'], ['Campus building 1460794276', ring(1460794276), TOP.campus76, 'maLow'], ['Service building', ring(652917784), TOP.service, 'maService'],
    ['Leadership Center', rect(-12.4, 61.0, 10.6, 51.6), TOP.leadership, 'maMission'], ['Leadership Center east wing', rect(-2.3, 54.6, 10.4, 30.4), TOP.leadershipEast, 'maMission'],
    ['Library', rect(29.9, 60.4, 12.9, 42.4), TOP.library, 'maMission'], ['Library west wing', rect(18.9, 58.6, 9.6, 34.6), TOP.libraryWest, 'maMission'],
    ['Performing Arts Center', ring(652917778), TOP.pac, 'maPac'], ['Performing Arts low block', ring(652917777), TOP.pacLow, 'maLowCream'], ['Founders Hall', ring(652917779), TOP.founders, 'maCream'], ['Pool house', POOL_HOUSE, POOL_HOUSE_TOP, 'maLow'],
  ];
}

// ============================================================================================ entry
export function buildSchool(ctx) {
  const { B, data } = ctx; const ring = (id) => data.buildings.find((b) => b.id === id).outer[0];
  B.v('stucco', true); B.v('brick', true); B.v('shingles', true);
  fosterHall(ctx);
  thacherHall(ctx);
  scienceCenter(ctx, ring(652917782));
  oldGym(ctx, ring(652917783));
  athleticCenter(ctx, ring(652917773));
  visualArts(ctx, ring(652917785));
  sited(ctx, ring(1460794276), (base) => { const r = flatBuilding(ctx, ring(1460794276), TOP.campus76 - base, 'maLow', { roof: 'white' }); ringLadder(ctx, ring(1460794276), 0, 0.5, r.roofY); });
  sited(ctx, ring(652917784), (base) => { const r = flatBuilding(ctx, ring(652917784), Math.max(3.6, TOP.service - base), 'maService', {}); ringLadder(ctx, ring(652917784), 2, 0.5, r.roofY); });   // service building cut into the hill above the gyms (pad in sitework)
  leadershipCenter(ctx);
  performingArts(ctx, { pac: ring(652917778), low: ring(652917777), founders: ring(652917779) });
  aquaticCenter(ctx);
  // the Leadership Center's west wall stands ~2 m below the Cottage Ave sidewalk: a rail along the top of that drop
  hillFence(ctx, [gp(-12.4, 61.0, -6.9, -24.5), gp(-12.4, 61.0, -6.9, 24.5)], { h: 1.1, black: true, every: 2.0 });
  B.v('stucco', true).setColor(1, 1, 1); B.v('shingles', true).setColor(1, 1, 1); B.v('paint', true).setColor(1, 1, 1);
}
