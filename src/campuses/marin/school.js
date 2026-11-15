// Marin Academy's own buildings, hand-authored over the OSM footprints. Heights were measured from Google
// Photorealistic 3D Tiles (tools/data/tile_heights.json); materials and roof shapes follow the aerial / 3D imagery:
// cream stucco + clay-tile hip roofs (Foster Hall, Thacher Hall, the Leadership Center and Library south of Mission
// Ave), white modern boxes (Science + Innovation Center, Visual Arts), the barrel-vaulted Old Gym with its solar array
// and the Athletic Center with its curved roof and translucent sea-green walls.
import * as THREE from 'three';
import { ANG, UX, UZ, rect, gp, CLAY, CLAY_DARK, kitWalls, flatBuilding, hipBuilding, hipRoof, wellRoof, boxFromRect, ringLadder, wallDecal, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, makeCanvas, canvasTexture, mulberry32 } from './kit.js';
import { doorFromKit, roofUnit } from '../../world/facade.js';
import { propKit } from '../../world/props.js';
import { paintedQuad } from '../../world/fields.js';
import { bleachers } from '../../world/landmarks.js';

export const SCHOOL_IDS = new Set([652917773, 652917775, 652917776, 652917777, 652917778, 652917779, 652917780, 652917781, 652917782, 652917783, 652917784, 652917785, 1460794276]);
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
  const { B } = ctx;
  // three-storey Italianate mansion (the original 1890s building) + the lower north wing
  const main = rect(-18.0, -45.3, 22.4, 19.4), eave = 8.8;
  hipBuilding(ctx, main, eave, 'maFoster', { rise: 2.3, overhang: 0.95, tint: CLAY_DARK, roofs: [boxFromRect(-18.0, -45.3, 22.4, 19.4)] });
  // attic half-storey stepping up out of the main roof under its own hip (the stepped multi-hip silhouette)
  { const ah = 2.5; B.v('stucco', true).setColor(0.95, 0.83, 0.5).box(-18.0, eave + 0.9 + ah / 2, -45.3, 12.6, ah, 10.2, ROT, 0.45); B.c('concrete').box(-18.0, eave + 0.9 + ah / 2, -45.3, 12.6, ah, 10.2, ROT);
    hipRoof(ctx, boxFromRect(-18.0, -45.3, 12.6, 10.2), eave + 0.9 + ah, 2.0, { overhang: 0.8, tint: CLAY_DARK });
    for (const a of [-3.6, 0, 3.6]) { const q = gp(-18.0, -45.3, a, 5.13); B.v('glassInt').box(q[0], eave + 2.35, q[1], 1.5, 1.1, 0.05, ROT); B.v('whitePanel').box(q[0], eave + 1.72, q[1], 1.8, 0.1, 0.12, ROT).box(q[0], eave + 2.98, q[1], 1.8, 0.1, 0.12, ROT); } }
  const wing = rect(-14.9, -66.6, 13.2, 23.4);
  hipBuilding(ctx, wing, 6.2, 'maFoster', { rise: 2.0, overhang: 0.6, tint: CLAY_DARK, roofs: [boxFromRect(-14.9, -66.6, 13.2, 23.4)] });
  // dormers on the south and west roof slopes
  { const p = gp(-18.0, -45.3, 0, 7.6); B.v('stucco', true).setColor(0.95, 0.83, 0.5).box(p[0], eave + 0.95, p[1], 3.0, 1.5, 3.4, ROT, 0.45); hipRoof(ctx, boxFromRect(p[0], p[1], 3.4, 3.8), eave + 1.7, 0.9, { overhang: 0.2, noCollision: true, caps: false, tint: CLAY_DARK }); const q = gp(-18.0, -45.3, 0, 9.32); B.v('glassInt').box(q[0], eave + 1.0, q[1], 2.2, 1.0, 0.04, ROT); B.c('concrete').box(p[0], eave + 1.3, p[1], 3.2, 2.4, 3.6, ROT); }   // central dormer over the entrance
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
      const s2 = B.v('shingles', true); s2.setColor(...CLAY_DARK);
      quadFacing(s2, Fs.P(-0.4, 5.3, 0), Fs.P(Fs.L + 0.4, 5.3, 0), Fs.P(Fs.L + 0.4, top + 0.42, dep + 0.5), Fs.P(-0.4, top + 0.42, dep + 0.5), [0, 1, 0], [[0, 0], [Fs.L / 3, 0], [Fs.L / 3, 1.3], [0, 1.3]]); s2.setColor(1, 1, 1);
      quadFacing(B.v('whitePanel'), Fs.P(-0.4, top + 0.4, 0), Fs.P(Fs.L + 0.4, top + 0.4, 0), Fs.P(Fs.L + 0.4, top + 0.4, dep + 0.5), Fs.P(-0.4, top + 0.4, dep + 0.5), [0, -1, 0]);
      quadFacing(B.c('concrete'), Fs.P(-0.4, 5.3, 0), Fs.P(Fs.L + 0.4, 5.3, 0), Fs.P(Fs.L + 0.4, top + 0.42, dep + 0.5), Fs.P(-0.4, top + 0.42, dep + 0.5), [0, 1, 0]);   // the whole visible roof, end overhangs included
      fbox(B.v('whitePanel'), Fs, -0.2, Fs.L + 0.2, top, top + 0.4, dep - 0.6, dep - 0.1, 1, 0, 'fstb');
      for (const u of sd < 0 ? [Fs.L - 0.5, Fs.L * 0.62, Fs.L * 0.3] : [0.5, Fs.L * 0.38, Fs.L * 0.7]) { const c = Fs.P(u, 0, dep - 0.35); B.v('whitePanel').box(c[0], py + (top - py) / 2, c[2], 0.42, top - py, 0.42, ROT); B.c('concrete').box(c[0], top / 2, c[2], 0.45, top, 0.45, ROT); }
      fbox(B.v('whitePanel'), Fs, sd < 0 ? Fs.L * 0.15 : 0.6, sd < 0 ? Fs.L - 0.6 : Fs.L * 0.85, py, py + 0.95, dep - 0.22, dep - 0.02, 1, 0, 'fstb');
    }
    const F = edgeFrame(...gp(-18.0, -45.3, pw / 2 + 0.4, 9.7), ...gp(-18.0, -45.3, -pw / 2 - 0.4, 9.7));
    const sh = B.v('shingles', true); sh.setColor(...CLAY_DARK);
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
  const { B } = ctx; const eave = 8.8;
  const main = rect(10.6, -1.3, 11.2, 33.4), west = rect(1.6, 9.2, 7.0, 10.6);
  hipBuilding(ctx, main, eave, 'maMission', { roofs: [] });
  // real roof: tiled hip perimeter round a flat grey deck carrying a long white monitor / plant enclosure
  { const wr = wellRoof(ctx, boxFromRect(10.6, -1.3, 11.2, 33.4), eave, 2.0, 2.9, { overhang: 0.8 }); const p = gp(10.6, -1.3, 0, -3); B.v('whitePanel').box(p[0], wr.deck + 0.9, p[1], 3.4, 1.8, 17, ROT); B.v('frameAlu').box(p[0], wr.deck + 1.85, p[1], 3.7, 0.1, 17.3, ROT); B.c('metal').box(p[0], wr.deck + 0.9, p[1], 3.4, 1.8, 17, ROT); const q = gp(10.6, -1.3, 0, 10.5); roofUnit(ctx, q[0], wr.deck, q[1], ROT, mulberry32(5)); }
  hipBuilding(ctx, west, 5.6, 'maMission', { rise: 1.7, overhang: 0.5, roofs: [boxFromRect(1.6, 9.2, 7.0, 10.6)] });
  // east side: a long glazed gallery under a flat canopy looking over the field
  const F = edgeFrame(...gp(10.6, -1.3, 5.6, -13), ...gp(10.6, -1.3, 5.6, 13));
  fbox(B.v('whitePanel'), F, -0.3, F.L + 0.3, 3.7, 4.0, 0, 3.0, 1, 0, 'fstb');
  for (let u = 0.2; u <= F.L; u += (F.L - 0.4) / 5) { const p = F.P(u, 0, 2.7); B.v('whitePanel').cyl(p[0], 0, p[2], 0.14, 0.14, 3.7, 10, 1, false); B.c('metal').box(p[0], 1.85, p[2], 0.3, 3.7, 0.3); }
  { const c = F.P(F.L / 2, 3.85, 1.5); B.c('metal').box(c[0], c[1], c[2], F.L + 0.6, 0.3, 3.0, F.rotY); }
}

// ============================================================================================ Science + Innovation Center
function scienceCenter(ctx, ring) {
  const { B } = ctx; const h = 13.0;
  const { roofY } = flatBuilding(ctx, ring, h, 'maModern', { units: 3 });
  // stair / mechanical penthouse and a screened plant enclosure, as on the real roof
  const p = gp(21, -50, 0.5, -2); gridBox(B, 'whitePanel', 'metal', p[0], roofY + 1.2, p[1], 9.0, 2.4, 20.0);
  B.v('frameAlu').box(p[0], roofY + 2.45, p[1], 9.3, 0.1, 20.3, ROT);
  const q = gp(21, -50, 0, 14); gridBox(B, 'louver', 'metal', q[0], roofY + 0.9, q[1], 8.0, 1.8, 5.0, 2.2);
  // east entry canopy facing the field + building name
  const r = ensureCCW(ring); let best = null;
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.nx > 0.9 && (!best || F.L > best.L)) best = F; }
  if (best) {
    fbox(B.v('whitePanel'), best, best.L * 0.5 - 5, best.L * 0.5 + 5, 3.5, 3.85, 0, 3.2, 1, 0, 'fstb');
    const c = best.P(best.L * 0.5, 3.67, 1.6); B.c('metal').box(c[0], c[1], c[2], 10, 0.35, 3.2, best.rotY);
    for (const du of [-4.6, 4.6]) { const pp = best.P(best.L * 0.5 + du, 0, 2.9); B.v('frameAlu').cyl(pp[0], 0, pp[2], 0.1, 0.1, 3.5, 8, 1, false); B.c('metal').box(pp[0], 1.75, pp[2], 0.25, 3.5, 0.25); }
    // the name stands on the canopy's front edge on its own sign band (on the wall behind, half of it lay over the windows)
    { const sb = best.P(best.L * 0.5, 4.2, 3.1); B.v('whitePanel').box(sb[0], sb[1], sb[2], 9.8, 0.7, 0.1, best.rotY); B.c('metal').box(sb[0], sb[1], sb[2], 9.8, 0.7, 0.1, best.rotY); }
    wallDecal(ctx, ctx.M.textDecal(['SCIENCE + INNOVATION CENTER'], { w: 2048, h: 128, font: 84, color: '#3b4046', align: 'center', weight: 600, spacing: '10px' }), best, best.L * 0.5, 4.2, 8.8, 0.55, 3.17);
  }
  ringLadder(ctx, ring, 0, 0.5, roofY);
}

// ============================================================================================ Old Gym (barrel vault + solar)
function oldGym(ctx, ring) {
  const { B } = ctx; const eave = 9.0, rise = 3.4;
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
  const Fs = edgeFrame(...gp(cx, cz, w / 2, d / 2), ...gp(cx, cz, -w / 2, d / 2)); wallDecal(ctx, tex, Fs, Fs.L / 2, 6.6, 9.0, 3.2, 0.18);
}

// ============================================================================================ Athletic Center (new gym)
function athleticCenter(ctx, ring) {
  const { B } = ctx; const lo = 9.0, hi = 13.2;
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
    wallRect(B.v('polyGreen'), F, 0.4, F.L - 0.4, 3.9, lo - 1.4, 0.17, [0, 0, F.L / 2.4, 1]);
    fbox(B.v('frameAlu'), F, 0.3, F.L - 0.3, 3.75, 3.9, 0, 0.2, 1, 0, 'fstb');
    if (east) { wallRect(B.v('polyGreen'), F, 0, F.L, lo, hi - 0.35, 0.02, [0, 0, F.L / 2.4, 0.9]); const c = F.P(F.L / 2, (lo + hi) / 2, -0.1); B.c('glass').box(c[0], c[1], c[2], F.L, hi - lo, 0.3, F.rotY);
      wallDecal(ctx, signTexture([['MARIN ACADEMY', 150, '#b3261e', '800'], ['ATHLETIC CENTER', 92, '#2a2d30', '600']], { w: 1536, h: 384 }), F, F.L * 0.5, 2.6, 8.4, 2.1, 0.2); }
  }
}

// ============================================================================================ Visual Arts Center
function visualArts(ctx, ring) {
  const { roofY } = flatBuilding(ctx, ring, 5.6, 'maLow', {});
  solarRows(ctx, -92.6, -22.2, 20, 7.6, roofY, 4); solarRows(ctx, -92.2, -4.2, 22, 9.6, roofY, 5);
  ringLadder(ctx, ring, 1, 0.5, roofY);
}

// ============================================================================================ south campus
function leadershipCenter(ctx) {
  const { B } = ctx; const eave = 9.0;
  // Bodie Brizendine Leadership Center: long north-south bar + east wing toward the courtyard
  hipBuilding(ctx, rect(-12.4, 61.0, 10.6, 51.6), eave, 'maMission', { roofs: [] });
  { const wr = wellRoof(ctx, boxFromRect(-12.4, 61.0, 10.6, 51.6), eave, 2.2, 2.9, { overhang: 0.8 }); const r2 = mulberry32(12); for (const b of [-17, -6, 5, 16]) { const p = gp(-12.4, 61.0, 0, b); roofUnit(ctx, p[0], wr.deck, p[1], ROT + Math.PI / 2, r2); } }
  hipBuilding(ctx, rect(-2.3, 54.6, 10.4, 30.4), eave - 0.2, 'maMission', { rise: 2.2, overhang: 0.7, roofs: [boxFromRect(-2.3, 54.6, 10.4, 30.4)] });
  const F = edgeFrame(...gp(-12.4, 61.0, 5.3, -25.82), ...gp(-12.4, 61.0, -5.3, -25.82));
  wallDecal(ctx, signTexture([['MARIN ACADEMY', 120, '#3a2a1c']], { w: 1280, h: 200 }), F, F.L / 2, 4.3, 7.2, 1.1, 0.09);
  // Library: bar along the pool side + west wing
  hipBuilding(ctx, rect(29.9, 60.4, 12.9, 42.4), 9.4, 'maMission', { roofs: [] });
  { const wr = wellRoof(ctx, boxFromRect(29.9, 60.4, 12.9, 42.4), 9.4, 2.3, 3.3, { overhang: 0.8 }); const a = gp(29.9, 60.4, 0, -6.5); solarRows(ctx, a[0], a[1], 4.8, 20, wr.deck, 8); const r2 = mulberry32(13); for (const b of [9, 14.5]) { const p = gp(29.9, 60.4, 0, b); roofUnit(ctx, p[0], wr.deck, p[1], ROT + Math.PI / 2, r2); } }
  hipBuilding(ctx, rect(18.9, 58.6, 9.6, 34.6), 8.9, 'maMission', { rise: 2.2, overhang: 0.7, roofs: [boxFromRect(18.9, 58.6, 9.6, 34.6)] });
  // courtyard between the two: paved patio, pergola on the Mission Ave side, cafe tables
  const pv = B.v('maPaver'); const c = rect(7.7, 60.5, 10.4, 36), y = 0.03;   // wall to wall between the two buildings
  pv.quad([c[3][0], y, c[3][1]], [c[2][0], y, c[2][1]], [c[1][0], y, c[1][1]], [c[0][0], y, c[0][1]], [0, 0], [4.333, 0], [4.333, 15], [0, 15]);
  for (let i = 0; i < 4; i++) for (const b of [-21.5, -18.2]) { const p = gp(8.1, 60.5, -4.4 + i * 2.93, b); B.v('wood').box(p[0], 1.55, p[1], 0.22, 3.1, 0.22, ROT, 0.5); B.c('wood').box(p[0], 1.55, p[1], 0.3, 3.1, 0.3, ROT); }
  for (const b of [-21.5, -18.2]) { const p = gp(8.1, 60.5, 0, b); B.v('wood').box(p[0], 3.2, p[1], 10.2, 0.22, 0.16, ROT, 0.5); }
  for (let a = -4.8; a <= 4.81; a += 0.8) { const p = gp(8.1, 60.5, a, -19.85); B.v('wood').box(p[0], 3.38, p[1], 0.08, 0.16, 4.4, ROT, 0.5); }
  { const p = gp(8.1, 60.5, 0, -19.85); B.c('wood').box(p[0], 3.3, p[1], 10.2, 0.3, 4.4, ROT); }
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
  // Performing Arts Center: tall cream box (the theatre) with a glazed lobby toward Cottage Ave
  const { roofY } = flatBuilding(ctx, rings.pac, 10.0, 'maGymPlain', { units: 3 });
  const r = ensureCCW(rings.pac);
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]);
    if (F.nx > 0.9 && F.L > 10) {
      fbox(B.v('frameAlu'), F, 2, F.L - 2, 0, 4.4, 0, 2.6, 1, 0, 'st'); wallRect(B.v('glassInt'), F, 2.1, F.L - 2.1, 0.15, 4.2, 2.62, [311, 0, 307, 1]);
      for (let u = 2; u <= F.L - 1.99; u += (F.L - 4) / 6) fbox(B.v('frameAlu'), F, u - 0.05, u + 0.05, 0, 4.4, 2.6, 2.68, 1, 0, 'fs');
      fbox(B.v('frameAlu'), F, 2, F.L - 2, 2.5, 2.6, 2.6, 2.68, 1, 0, 'ftb'); fbox(B.v('whitePanel'), F, 1.6, F.L - 1.6, 4.4, 4.75, 0, 3.6, 1, 0, 'fstb');
      const c = F.P(F.L / 2, 2.3, 1.3); B.c('glass').box(c[0], c[1], c[2], F.L - 4, 4.6, 2.6, F.rotY); { const cc = F.P(F.L / 2, 4.575, 1.8); B.c('metal').box(cc[0], cc[1], cc[2], F.L - 3.2, 0.35, 3.6, F.rotY); }
      wallDecal(ctx, signTexture([['PERFORMING ARTS CENTER', 96, '#3a2a1c', '600']], { w: 1536, h: 160 }), F, F.L / 2, 6.4, 9.6, 1.0, 0.18);
    }
  }
  // roof ladder on the long west wall. (It used to sit on the 1.2 m jog at the north-west corner, where the parapets of
  // the two neighbouring walls closed the gap to less than a player's width: nobody could step off the top.)
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.nx < -0.9 && F.L > 15) { ringLadder(ctx, r, i, Math.abs(a[1] + (b[1] - a[1]) * 0.2 - 65) < Math.abs(a[1] + (b[1] - a[1]) * 0.8 - 65) ? 0.2 : 0.8, roofY); break; } }
  flatBuilding(ctx, rings.low, 6.6, 'maLowCream', { units: 1 });
  // Founders Hall: long two-storey white bar with a clay-tile mansard edge
  const f = flatBuilding(ctx, rings.founders, 8.6, 'maWhite', { units: 2 });
  const fr = f.ring; const sh = B.v('shingles', true); sh.setColor(...CLAY);
  for (let i = 0; i < fr.length; i++) { const a = fr[i], b = fr[(i + 1) % fr.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.L < 1) continue; quadFacing(sh, F.P(-0.5, 7.5, 0.62), F.P(F.L + 0.5, 7.5, 0.62), F.P(F.L, 8.7, 0.1), F.P(0, 8.7, 0.1), [F.nx, 1, F.nz], [[0, 0], [F.L / 3, 0], [F.L / 3, 0.45], [0, 0.45]]); quadFacing(B.v('whitePanel'), F.P(-0.5, 7.5, 0.0), F.P(F.L + 0.5, 7.5, 0.0), F.P(F.L + 0.5, 7.5, 0.62), F.P(-0.5, 7.5, 0.62), [0, -1, 0]); const mc = F.P(F.L / 2, 8.1, 0.31); B.c('concrete').box(mc[0], mc[1], mc[2], F.L + 1.0, 1.2, 0.62, F.rotY); }
  sh.setColor(1, 1, 1);
}

// ============================================================================================ aquatic centre
function aquaticCenter(ctx) {
  const { B } = ctx;
  // pool house along Mission Ave (changing rooms / office), white flat roof
  const house = rect(58.6, 45.6, 33.5, 9.4);
  flatBuilding(ctx, house, 4.6, 'maLow', { roof: 'white' });
  // The pool itself is the shared water feature (descriptor `water`, see src/world/water.js): 25 yd lanes running
  // east-west, starting blocks along the east deck as in the imagery. Only the blocks are built (and solid) here.
  const pc = [53.1, 75.6]; const wc = [53.5, 73.6], pw = 23.6, pl = 33.6, lanes = 14;
  for (let i = 0; i < lanes; i++) { const p = gp(wc[0], wc[1], pw / 2 + 0.62, -pl / 2 + (i + 0.5) * pl / lanes); B.v('whitePanel').box(p[0], 0.4, p[1], 0.6, 0.58, 0.55, ROT); B.v('panelGray').box(p[0], 0.72, p[1], 0.7, 0.06, 0.62, ROT); B.c('concrete').box(p[0], 0.37, p[1], 0.65, 0.75, 0.6, ROT); }
  // deck enclosure: stucco wall toward 5th Ave and Cottage side, bleachers on the east deck, shade canopy, scoreboard
  const wall = (a0, b0, a1, b1, h = 2.3) => { const p = gp(pc[0], pc[1], (a0 + a1) / 2, (b0 + b1) / 2); const L = Math.hypot(a1 - a0, b1 - b0); const rot = ROT + (Math.abs(b1 - b0) > Math.abs(a1 - a0) ? Math.PI / 2 : 0); B.v('stucco', true).setColor(0.92, 0.88, 0.76).box(p[0], h / 2, p[1], L, h, 0.25, rot, 0.45); B.v('whitePanel').box(p[0], h + 0.04, p[1], L + 0.1, 0.08, 0.36, rot); B.c('concrete').box(p[0], h / 2, p[1], L, h, 0.25, rot); };
  wall(-17.2, 24.4, 6, 24.4); wall(10, 24.4, 18.6, 24.4);          // south (5th Ave) with a gate gap
  wall(-17.2, -18.4, -17.2, 4); wall(-17.2, 8.5, -17.2, 24.4);     // west (toward the Library) with a gate gap
  wall(18.6, -24, 18.6, -8); wall(18.6, -3.5, 18.6, 24.4);         // east (toward the car park)
  B.v('stucco', true).setColor(1, 1, 1);
  const bl = gp(pc[0], pc[1], -13.9, -19); bleachers(ctx, { x: bl[0], z: bl[1], dir: Math.atan2(-UX, -UZ), len: 21, rows: 4, run: 0.66, rise: 0.3, frontH: 0 });   // west deck, facing the blocks
  { // scoreboard at the south end
    const p = gp(pc[0], pc[1], -9, 23.6); const pt = B.v('paint', true); pt.setColor(0.04, 0.04, 0.05); pt.box(p[0], 4.1, p[1], 5.2, 2.2, 0.25, ROT); pt.setColor(0.62, 0.07, 0.06).box(p[0], 5.4, p[1], 5.2, 0.4, 0.27, ROT);
    for (const k of [-2.2, 2.2]) { const q = gp(pc[0], pc[1], -9 + k, 23.6); B.v('galv').cyl(q[0], 0, q[1], 0.07, 0.07, 3.0, 6, 1, false); }
    B.c('metal').box(p[0], 4.3, p[1], 5.2, 2.7, 0.3, ROT); B.v('paint', true).setColor(1, 1, 1);
  }
  // shade sails / canopy on steel posts over the north deck
  { const p = gp(pc[0], pc[1], 0, -21.6); const aw = B.v('awning', true); aw.setColor(0.86, 0.84, 0.78); aw.box(p[0], 3.3, p[1], 30, 0.06, 3.6, ROT); for (const a of [-14.5, -5, 5, 14.5]) { const q = gp(pc[0], pc[1], a, -20.2); B.v('galv').cyl(q[0], 0, q[1], 0.06, 0.06, 3.3, 6, 1, false); B.c('metal').box(q[0], 1.65, q[1], 0.2, 3.3, 0.2); } B.c('metal').box(p[0], 3.3, p[1], 30, 0.15, 3.6, ROT); aw.setColor(1, 1, 1); }
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
  { const r = flatBuilding(ctx, ring(1460794276), 4.2, 'maLow', { roof: 'white' }); ringLadder(ctx, ring(1460794276), 0, 0.5, r.roofY); }
  { const r = flatBuilding(ctx, ring(652917784), 4.6, 'maService', {}); ringLadder(ctx, ring(652917784), 2, 0.5, r.roofY); }
  leadershipCenter(ctx);
  performingArts(ctx, { pac: ring(652917778), low: ring(652917777), founders: ring(652917779) });
  aquaticCenter(ctx);
  B.v('stucco', true).setColor(1, 1, 1); B.v('shingles', true).setColor(1, 1, 1); B.v('paint', true).setColor(1, 1, 1);
}
