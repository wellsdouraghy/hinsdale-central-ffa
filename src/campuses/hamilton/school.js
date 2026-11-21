// Alexander Hamilton High School's own buildings, hand-authored over the LA County footprints in OSM. Heights were
// measured from Google Photorealistic 3D Tiles (tools/data/tile_heights_fine.json), materials and roof shapes follow
// the aerial / 3D imagery: Brown Hall (1931, Northern Italian Renaissance: salmon brick, cast stone, orange clay-tile
// hip roof, bell tower with a verdigris copper cupola), the Norman J. Pattiz Concert Hall, the cream classroom blocks,
// the two gyms, the tennis courts on top of the car-park deck and the solar carports of the south lot.
import * as THREE from 'three';
import { ANG, gp, CLAY, BRICK_TINT, kitWalls, flatBuilding, hipRoof, minAreaOBB, wallLadder, wallDecal, storeyWalls, storeyBlock, canopy, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, signedArea, makeCanvas, canvasTexture, mulberry32, SKIN_STUCCO, SKIN_BRICK, STYLES } from './kit.js';
import { paintedQuad } from '../../world/fields.js';
import { turfNoise } from '../../world/landmarks.js';

export const G = (a, b) => gp(0, 0, a, b);                                   // street-grid metres -> world [x, z]
export const GR = (a0, b0, a1, b1) => [G(a0, b0), G(a1, b0), G(a1, b1), G(a0, b1)];   // grid-aligned rectangle ring
export const ROT = -ANG;                                                      // Bucket.box rotY aligned with the street grid
const ID = (n) => 424940000 + n;
// every OSM footprint inside the school fence (built here, or demolished since the county survey and skipped)
export const SCHOOL_IDS = new Set([958, 984, 993, 995, 997, 1010, 1016, 1017, 1028, 1030, 1035, 1041, 1047, 1052, 1064, 1065, 1072, 1076, 1082, 1086, 1087, 1102, 1103, 1125, 1127].map(ID));
export const CREAM = [0.74, 0.67, 0.5], TAN = [0.72, 0.6, 0.43], GREY = [0.6, 0.6, 0.57], GREEN = [0.05, 0.3, 0.13];

export function gbox(B, key, surface, a, b, y, w, h, d, s = 1, rot = ROT) { const p = G(a, b); B.v(key).box(p[0], y + h / 2, p[1], w, h, d, rot, s); if (surface) B.c(surface).box(p[0], y + h / 2, p[1], w, h, d, rot); return p; }
export function simplify(ring, tol = 0.6) {
  let r = ensureCCW(ring).slice(); let changed = true;
  while (changed && r.length > 4) {
    changed = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1e-6; const dist = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / L;
      if (dist < tol && r.length > 4) { r.splice(i, 1); changed = true; break; }
    }
  }
  return r;
}
// local frame of a building: centre (cx, cz), long axis at `deg` (atan2(z, x)); u along the axis, v to its left-hand side
function frame(cx, cz, deg) {
  const tx = Math.cos(deg * Math.PI / 180), tz = Math.sin(deg * Math.PI / 180); const uc = cx * tx + cz * tz, vc = -cx * tz + cz * tx;
  const W = (u, v) => [(uc + u) * tx - (vc + v) * tz, (uc + u) * tz + (vc + v) * tx];
  return { tx, tz, W, rotY: Math.atan2(-tz, tx), box: (u0, u1, v0, v1) => ({ tx, tz, u0: uc + u0, u1: uc + u1, v0: vc + v0, v1: vc + v1 }), rect: (u0, u1, v0, v1) => [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)] };
}
// roof ladder on the longest edge of a ring whose outward normal satisfies pick(nx, nz): exits above the parapet
function ladderOn(ctx, ring, pick, t, roofY, top, near) {
  const r = ensureCCW(ring); let best = null;
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.L > 5 && pick(F.nx, F.nz) && (!best || F.L > best.L)) best = F; }
  if (!best) return null; if (near) t = Math.max(0.08, Math.min(0.92, ((near[0] - best.ax) * best.tx + (near[1] - best.az) * best.tz) / best.L)); const p = best.P(best.L * t, 0, 0.14); wallLadder(ctx, p[0], p[2], best.nx, best.nz, roofY, top); return best;
}
function longestEdge(ring, pick) { const r = ensureCCW(ring); let best = null; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (pick(F.nx, F.nz) && (!best || F.L > best.L)) best = F; } return best; }
const sign = (ctx, lines, o) => ctx.M.textDecal(lines, { align: 'center', weight: 700, spacing: '8px', ...o });

// ============================================================================================ Brown Hall
function brownHall(ctx, raw) {
  const { B } = ctx; const ring = simplify(raw, 0.8); const eave = 12.2; const fr = frame(136.0, 7.2, 100.3);   // u south, v west (front = -v, Robertson Blvd)
  storeyWalls(ctx, ring, eave, { key: 'brick', tex: 'hamBrick', storeys: 3, bay: 3.7, winW: 2.1, winH: 2.25, sill: 1.05, doors: false, piers: true, arcadeTop: true });   // round-arched top storey, as in the photos
  B.c('brick').prism(ring, 0, eave, 1, true); B.v('concrete').poly(ring, null, eave - 0.03, (x, z) => [x / 3, z / 3]);
  (ctx.buildingRings = ctx.buildingRings || []).push(ring);
  hipRoof(ctx, fr.box(-51.3, 46.8, -10.4, 12.2), eave, 4.9, { tint: CLAY, tex: 'hamTile', overhang: 0.75 });
  hipRoof(ctx, fr.box(-14.0, 9.9, -13.3, 13.3), eave + 0.5, 5.3, { tint: CLAY, tex: 'hamTile', overhang: 0.7 });               // the cross roof of the entrance pavilion
  // cast-stone frontispiece: three arched doorways under five tall arched windows, name in the frieze
  { const a = fr.W(-12.4, -13.25), b = fr.W(8.0, -13.25); const F = edgeFrame(a[0], a[1], b[0], b[1]); const L = F.L; const ls = B.v('limestone'), fm = B.v('frame'), gl = B.v('glassInt');
    fbox(ls, F, 0, L, 0, eave + 0.45, 0, 0.16, 1 / 3, 0, 'fst'); { const c = F.P(L / 2, eave / 2, 0.08); B.c('concrete').box(c[0], c[1], c[2], L, eave, 0.2, F.rotY); }
    fbox(ls, F, -0.3, L + 0.3, eave + 0.45, eave + 0.75, 0, 0.36, 1 / 3, 0, 'fstb'); fbox(ls, F, -0.2, L + 0.2, 4.55, 4.85, 0, 0.3, 1 / 3, 0, 'fstb');
    const arch = (c, w2, y0, y1, out) => {   // glazed opening with a round head and a moulded surround
      wallRect(gl, F, c - w2, c + w2, y0, y1, out, [c + 1, 2, c, 3]);
      const N = 8; for (let k = 0; k < N; k++) { const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N; gl.tri(F.P(c, y1, out), F.P(c + Math.cos(a0) * w2, y1 + Math.sin(a0) * w2, out), F.P(c + Math.cos(a1) * w2, y1 + Math.sin(a1) * w2, out));
        const r2 = w2 + 0.16; quadFacing(fm, F.P(c + Math.cos(a0) * w2, y1 + Math.sin(a0) * w2, out + 0.03), F.P(c + Math.cos(a0) * r2, y1 + Math.sin(a0) * r2, out + 0.03), F.P(c + Math.cos(a1) * r2, y1 + Math.sin(a1) * r2, out + 0.03), F.P(c + Math.cos(a1) * w2, y1 + Math.sin(a1) * w2, out + 0.03), [F.nx, 0, F.nz]); }
      fbox(fm, F, c - w2 - 0.16, c - w2, y0, y1, out, out + 0.04, 1, 0, 'fs'); fbox(fm, F, c + w2, c + w2 + 0.16, y0, y1, out, out + 0.04, 1, 0, 'fs'); fbox(fm, F, c - 0.04, c + 0.04, y0, y1 + w2 * 0.9, out, out + 0.03, 1, 0, 'fs'); fbox(fm, F, c - w2, c + w2, y1 - 0.04, y1 + 0.04, out, out + 0.03, 1, 0, 'ftb');
    };
    for (let k = 0; k < 5; k++) { const c = L / 2 + (k - 2) * 3.6; arch(c, 1.05, 5.6, 9.6, 0.17); fbox(ls, F, c - 1.45, c + 1.45, 5.3, 5.5, 0.16, 0.34, 1 / 3, 0, 'fstb'); }
    // pilasters between the windows carry an architrave at 11.0 m; above it the frieze is one clear plane for the name
    // (they used to run on up to the cornice, 12 cm proud of the lettering, and cut it into "ALEX NDER H MILTO")
    const fz = eave - 1.2;
    for (let k = 0; k < 6; k++) { const c = L / 2 + (k - 2.5) * 3.6; fbox(ls, F, c - 0.32, c + 0.32, 4.85, fz - 0.22, 0.16, 0.3, 1 / 3, 0, 'fs'); fbox(ls, F, c - 0.4, c + 0.4, fz - 0.22, fz, 0.16, 0.34, 1 / 3, 0, 'fstb'); }
    fbox(ls, F, -0.1, L + 0.1, fz, fz + 0.16, 0.16, 0.38, 1 / 3, 0, 'fstb');
    for (let k = 0; k < 3; k++) arch(L / 2 + (k - 1) * 4.4, 1.25, 1.25, 3.3, 0.17);
    wallDecal(ctx, sign(ctx, ['ALEXANDER HAMILTON HIGH SCHOOL'], { w: 2048, h: 128, font: 92, color: '#4a3524', family: 'Georgia, "Times New Roman", serif' }), F, L / 2, eave - 0.42, 16.5, 1.0, 0.175);
    // entrance terrace and stairs down to the lawn: the collision is one smooth ramp (no risers to snag on)
    const py = 1.2, dep = 4.2, sw = 15; const st = B.v('concrete'), col = B.c('concrete');
    fbox(st, F, L / 2 - sw / 2 - 1.2, L / 2 + sw / 2 + 1.2, 0, py, 0.16, dep, 1 / 3, 0, 'fst'); { const c = F.P(L / 2, py / 2, dep / 2); col.box(c[0], c[1], c[2], sw + 2.4, py, dep, F.rotY); }
    for (let k = 0; k < 8; k++) fbox(st, F, L / 2 - sw / 2, L / 2 + sw / 2, 0, py - (k + 1) * 0.15, dep + k * 0.34, dep + (k + 1) * 0.34, 1 / 3, 0, 'ft');
    quadFacing(col, F.P(L / 2 - sw / 2, py, dep), F.P(L / 2 + sw / 2, py, dep), F.P(L / 2 + sw / 2, 0, dep + 2.8), F.P(L / 2 - sw / 2, 0, dep + 2.8), [0, 1, 0]);
    for (const s of [-1, 1]) { const u = L / 2 + s * (sw / 2 + 0.6); fbox(B.v('limestone'), F, u - 0.6, u + 0.6, 0, py + 0.75, dep, dep + 3.0, 1 / 3, 0, 'fst'); const c = F.P(u, (py + 0.75) / 2, dep + 1.5); col.box(c[0], c[1], c[2], 1.2, py + 0.75, 3.0, F.rotY);
      const l = F.P(u, 0, dep + 2.4); B.v('blackMetal').cyl(l[0], py + 0.75, l[2], 0.06, 0.05, 2.1, 8, 1, false); B.v('lightEmit').cyl(l[0], py + 2.85, l[2], 0.2, 0.2, 0.36, 10, 1, true); }
  }
  // bell tower (photos): square brick shaft out of the roof, a cream cast-stone belfry with two round-arched openings a
  // side between corner pilasters, a cornice, an octagonal drum and a small verdigris copper dome with a finial.
  // Solid exactly as drawn (anyone dropped on it slides / walks off).
  { const c = fr.W(-2.0, -0.5); const sTop = 18.0, bTop = 22.6, w = 6.2; const br = B.v('brick', true); br.setColor(...BRICK_TINT); br.box(c[0], (eave + 2 + sTop) / 2, c[1], w, sTop - eave - 2, w, fr.rotY, 1 / 2.2); br.setColor(1, 1, 1);
    const ls = B.v('limestone'), dk = B.v('blackMetal'), col = B.c('concrete');
    B.c('brick').box(c[0], (eave + sTop) / 2, c[1], w, sTop - eave, w, fr.rotY);
    ls.box(c[0], sTop + 0.18, c[1], w + 0.7, 0.36, w + 0.7, fr.rotY, 1 / 3); col.box(c[0], sTop + 0.18, c[1], w + 0.7, 0.36, w + 0.7, fr.rotY);                 // string course under the belfry
    ls.box(c[0], (sTop + 0.36 + bTop) / 2, c[1], w - 0.3, bTop - sTop - 0.36, w - 0.3, fr.rotY, 1 / 3); col.box(c[0], (sTop + 0.36 + bTop) / 2, c[1], w - 0.3, bTop - sTop - 0.36, w - 0.3, fr.rotY);
    const hb = (w - 0.3) / 2; const r4 = fr.rect(-2.0 - hb, -2.0 + hb, -0.5 - hb, -0.5 + hb);
    for (let i = 0; i < 4; i++) { const a = r4[i], b = r4[(i + 1) % 4]; let F = edgeFrame(a[0], a[1], b[0], b[1]); if ((F.nx * ((a[0] + b[0]) / 2 - c[0]) + F.nz * ((a[1] + b[1]) / 2 - c[1])) < 0) F = edgeFrame(b[0], b[1], a[0], a[1]);
      for (const du of [-1.3, 1.3]) { const uc = F.L / 2 + du, r = 0.78, y0 = sTop + 0.9, y1 = 20.9;       // arched opening: dark recess, moulded archivolt, sill
        wallRect(dk, F, uc - r, uc + r, y0, y1, 0.012); const N = 8; for (let k = 0; k < N; k++) { const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N; const p = (an, rr, o) => F.P(uc + Math.cos(an) * rr, y1 + Math.sin(an) * rr, o); dk.tri(F.P(uc, y1, 0.012), p(a0, r, 0.012), p(a1, r, 0.012)); quadFacing(ls, p(a0, r, 0.06), p(a0, r + 0.16, 0.06), p(a1, r + 0.16, 0.06), p(a1, r, 0.06), [F.nx, 0, F.nz]); }
        fbox(ls, F, uc - r - 0.18, uc + r + 0.18, y0 - 0.2, y0, 0, 0.14, 1 / 3, 0, 'fstb'); fbox(ls, F, uc - 0.05, uc + 0.05, y0, y0 + 0.95, 0.012, 0.07, 1, 0, 'fs'); fbox(ls, F, uc - r, uc + r, y0 + 0.9, y0 + 0.98, 0.012, 0.07, 1, 0, 'ftb'); }
      for (const u of [0.32, F.L / 2, F.L - 0.32]) fbox(ls, F, u - 0.3, u + 0.3, sTop + 0.36, bTop - 0.3, 0, 0.1, 1 / 3, 0, 'fs');   // corner + centre pilasters
    }
    ls.box(c[0], bTop + 0.1, c[1], w + 0.2, 0.2, w + 0.2, fr.rotY, 1 / 3).box(c[0], bTop + 0.35, c[1], w + 0.8, 0.3, w + 0.8, fr.rotY, 1 / 3); col.box(c[0], bTop + 0.25, c[1], w + 0.8, 0.5, w + 0.8, fr.rotY);   // cornice
    ls.cyl(c[0], bTop + 0.5, c[1], 2.05, 2.05, 1.2, 8, 1 / 3, true); col.box(c[0], bTop + 1.1, c[1], 3.6, 1.2, 3.6, fr.rotY);                                       // octagonal drum
    const cu = B.v('paint', true); cu.setColor(0.2, 0.44, 0.36); const R = 2.15; let py = bTop + 1.7, pr = R;
    cu.cyl(c[0], bTop + 1.7 - 0.12, c[1], R + 0.12, R + 0.12, 0.12, 12, 1, true);
    for (let k = 1; k <= 5; k++) { const an = k / 5 * Math.PI / 2 * 0.94; const ny = bTop + 1.7 + Math.sin(an) * R * 0.82, nr = Math.max(0.22, Math.cos(an) * R); cu.cyl(c[0], py, c[1], pr, nr, ny - py, 12, 1, k === 5); B.c('metal').cyl(c[0], py, c[1], pr, nr, ny - py, 12, 1, k === 5); py = ny; pr = nr; }
    cu.cyl(c[0], py, c[1], 0.3, 0.2, 0.5, 8, 1, true); cu.setColor(0.55, 0.5, 0.3).cyl(c[0], py + 0.5, c[1], 0.05, 0.025, 1.3, 6, 1, true); cu.setColor(1, 1, 1);
  }
}

// ============================================================================================ classroom blocks
function classrooms(ctx, ring) {
  const { B } = ctx;
  // the long three-storey block west of Brown Hall: cream, brick end bays, stair penthouse on the roof
  { const r = simplify(ring(1010), 1.6); const b = storeyBlock(ctx, r, 13.0, { key: 'stucco', tint: CREAM, storeys: 3, bay: 4.1, winW: 2.6, winH: 1.9, units: 5, keepCentre: true });
    const o = frame(96.1, -4.1, 102.0); const p = o.W(-22, 2); B.v('stucco', true).setColor(...CREAM).box(p[0], b.roofY + 1.5, p[1], 12, 3.0, 9, o.rotY, 0.45); B.v('stucco', true).setColor(1, 1, 1); B.c('concrete').box(p[0], b.roofY + 1.5, p[1], 12, 3.0, 9, o.rotY);
    ladderOn(ctx, r, (nx) => nx < -0.8, 0.72, b.roofY, b.top); ctx.roofSpots.push([...o.W(18, 0), b.roofY]); }
  // the library / science block on the quad
  { const r = simplify(ring(1103), 1.0); const b = storeyBlock(ctx, r, 11.1, { key: 'stucco', tint: GREY, storeys: 3, bay: 4.6, winW: 3.2, winH: 1.7, frame: 'frameAlu', trim: 'whitePanel', units: 4, keepCentre: true });
    ladderOn(ctx, r, (nx, nz) => nz > 0.8, 0.3, b.roofY, b.top); const o = frame(43.2, -41.4, 108.7); ctx.roofSpots.push([...o.W(4, 0), b.roofY]); }
  // the newer north block along Cattaraugus Ave (tan, three low storeys, plant all over the roof)
  { const r = simplify(ring(1017), 0.9); const b = storeyBlock(ctx, r, 10.1, { key: 'stucco', tint: TAN, storeys: 3, bay: 3.9, winW: 2.2, winH: 1.55, sill: 0.95, units: 7, noHeli: true });
    ladderOn(ctx, r, (nx, nz) => nz > 0.8, 0.5, b.roofY, b.top); }
  // shops building south of Brown Hall (brick, two storeys)
  { const r = simplify(ring(993), 1.0); const b = storeyBlock(ctx, r, 7.4, { key: 'brick', tex: 'hamBrick', storeys: 2, bay: 4.4, winW: 2.8, winH: 1.8, units: 2, keepCentre: true });
    ladderOn(ctx, r, (nx, nz) => nz > 0.8, 0.82, b.roofY, b.top); const o = frame(94.5, 66.0, 18.8); ctx.roofSpots.push([...o.W(0, 0), b.roofY]); }
  // cafeteria / student store: one tall brick storey, lunch terrace on the south side
  { const r = simplify(ring(1102), 1.0); const b = flatBuilding(ctx, r, 5.8, 'hamLow', { skin: SKIN_BRICK, units: 3, surface: 'brick' }); ctx.flatRoofs.push({ ring: b.ring, roofY: b.roofY, area: Math.abs(signedArea(b.ring)), school: true, noHeli: true });
    ladderOn(ctx, r, (nx) => nx < -0.8, 0.5, b.roofY, 5.83); }
}

// ============================================================================================ Norman J. Pattiz Concert Hall
function pattizHall(ctx, raw) {
  const { B } = ctx; const r = simplify(raw, 1.2); const h = 10.6;
  const b = flatBuilding(ctx, r, h, 'hamAud', { skin: SKIN_BRICK, units: 2, surface: 'brick' }); ctx.flatRoofs.push({ ring: b.ring, roofY: b.roofY, area: Math.abs(signedArea(b.ring)), school: true });
  // fly tower over the stage (west end) and the entrance front toward Robertson Blvd (east end)
  const o = frame(131.4, -72.6, 10.2); { const p = o.W(-16.5, 0); B.v('brick', true).setColor(...BRICK_TINT).box(p[0], b.roofY + 1.6, p[1], 10.5, 3.2, 21, o.rotY, 1 / 2.2); B.v('brick', true).setColor(1, 1, 1); B.v('concrete').box(p[0], b.roofY + 3.26, p[1], 10.9, 0.12, 21.4, o.rotY, 1 / 3); B.c('brick').box(p[0], b.roofY + 1.6, p[1], 10.5, 3.2, 21, o.rotY); }
  const F = longestEdge(r, (nx) => nx > 0.8);
  if (F) {
    const L = F.L, ls = B.v('limestone');
    fbox(ls, F, L / 2 - 6.5, L / 2 + 6.5, 0, 7.2, 0, 0.14, 1 / 3, 0, 'fst');
    for (let k = 0; k < 3; k++) { const c = L / 2 + (k - 1) * 4.0; fbox(B.v('frame'), F, c - 1.25, c + 1.25, 0, 2.9, 0.14, 0.2, 1, 0, 'fst'); wallRect(B.v('glassInt'), F, c - 1.1, c + 1.1, 0.25, 2.3, 0.205, [k + 1, 0.1, k, 0.9]); fbox(B.v('frame'), F, c - 0.04, c + 0.04, 0, 2.35, 0.205, 0.23, 1, 0, 'fs'); wallRect(B.v('glassInt'), F, c - 0.9, c + 0.9, 4.3, 6.4, 0.145, [k + 5, 2, k + 4, 3]); fbox(B.v('frame'), F, c - 1.0, c + 1.0, 4.2, 6.5, 0.14, 0.16, 1, 0, 'fstb'); }
    fbox(B.v('whitePanel'), F, L / 2 - 7.2, L / 2 + 7.2, 3.3, 3.75, 0, 2.6, 1, 0, 'fstb'); { const c = F.P(L / 2, 3.52, 1.3); B.c('metal').box(c[0], c[1], c[2], 14.4, 0.45, 2.6, F.rotY); }
    for (const du of [-6.6, 6.6]) { const p = F.P(L / 2 + du, 0, 2.3); B.v('frame').box(p[0], 1.65, p[2], 0.25, 3.3, 0.25, F.rotY); B.c('metal').box(p[0], 1.65, p[2], 0.3, 3.3, 0.3, F.rotY); }
    // the name stands on its own cast-stone band: one plane, proud of the wall's pilasters and the downpipe (both used to cross the letters)
    { const bw = Math.min(L - 0.6, 14.4), sw = Math.min(12.4, bw - 1.2); fbox(ls, F, L / 2 - bw / 2, L / 2 + bw / 2, 7.2, 8.95, 0, 0.42, 1 / 3, 0, 'fstb'); fbox(ls, F, L / 2 - bw / 2 - 0.12, L / 2 + bw / 2 + 0.12, 8.95, 9.13, 0, 0.5, 1 / 3, 0, 'fstb');
      wallDecal(ctx, sign(ctx, ['NORMAN J. PATTIZ CONCERT HALL'], { w: 2048, h: 128, font: 88, color: '#3b2c20', family: 'Georgia, "Times New Roman", serif' }), F, L / 2, 8.08, sw, sw * 0.0629, 0.435); }
  }
  ladderOn(ctx, r, (nx, nz) => nz > 0.8, 0.3, b.roofY, h + 0.03);
  ctx.roofSpots.push([...o.W(8, 0), b.roofY]);
}

// ============================================================================================ gyms
function gyms(ctx, ring) {
  const { B } = ctx; const cream = { skin: SKIN_STUCCO };
  // the halls stand in the low wings: fill the hidden space between the wing roof and the hall roof with solid layers
  const solidCore = (r, y0, y1) => { for (let y = y0 + 0.8; y < y1 - 0.3; y += 0.8) B.c('concrete').poly(ensureCCW(r), null, y); };
  // boys' gym: low locker / office wings round the big hall, "HOME OF THE YANKEES" on the wall facing the field
  { const r = simplify(ring(1016), 1.0); const lo = flatBuilding(ctx, r, 5.0, 'hamLowCream', { ...cream, units: 1 }); ctx.flatRoofs.push({ ring: lo.ring, roofY: lo.roofY, area: 400, school: true, noHeli: true });
    const hall = ensureCCW(GR(-42.5, 29.5, -10.5, 58.5)); const wI = hall.findIndex((a, i) => { const b = hall[(i + 1) % 4]; const F = edgeFrame(a[0], a[1], b[0], b[1]); return F.nx < -0.8; }); const hi = flatBuilding(ctx, hall, 9.2, 'hamGym', { ...cream, plainEdges: [wI] });   /* west wall left blank for the sign */ ctx.flatRoofs.push({ ring: hi.ring, roofY: hi.roofY, area: 900, school: true }); ctx.roofSpots.push([...G(-26.5, 44), hi.roofY]); solidCore(hall, lo.roofY, hi.roofY);
    ladderOn(ctx, r, (nx) => nx < -0.8, 0.3, lo.roofY, 5.03); { const p = G(-43.0 - 0.02, 36); wallLadder(ctx, p[0], p[1], -Math.cos(ANG), -Math.sin(ANG), hi.roofY, 9.23); }   // roof to roof: second ladder up the hall from the west wing
    const F = longestEdge(hall, (nx) => nx < -0.8); if (F) { fbox(B.v('paint', true).setColor(0.05, 0.27, 0.13), F, F.L / 2 - 5.2, F.L / 2 + 5.2, 5.5, 8.3, 0, 0.2, 1, 0, 'fstb'); B.v('paint', true).setColor(1, 1, 1); wallDecal(ctx, sign(ctx, ['HAMILTON', 'HOME OF THE YANKEES'], { w: 1280, h: 320, font: 100, color: '#f1efe6', weight: 800 }), F, F.L / 2, 6.9, 9.6, 2.4, 0.22); } }
  // girls' gym: two halls end to end with a low west wing
  { const r = simplify(ring(997), 1.0); const lo = flatBuilding(ctx, r, 4.6, 'hamLowCream', { ...cream }); ctx.flatRoofs.push({ ring: lo.ring, roofY: lo.roofY, area: 300, school: true, noHeli: true });
    const n = GR(-50.5, -69.5, -34, -31.5), s = GR(-59.5, -24, -36, 5); const a = flatBuilding(ctx, n, 9.0, 'hamGym', { ...cream }), b = flatBuilding(ctx, s, 8.6, 'hamGymPlain', { ...cream });
    ctx.flatRoofs.push({ ring: a.ring, roofY: a.roofY, area: 600, school: true, noHeli: true }, { ring: b.ring, roofY: b.roofY, area: 680, school: true }); ctx.roofSpots.push([...G(-47.7, -9.5), b.roofY]); solidCore(n, lo.roofY, a.roofY); solidCore(s, lo.roofY, b.roofY);
    ladderOn(ctx, r, (nx) => nx < -0.8, 0.5, lo.roofY, 4.63, G(-60, -52)); { const p = G(-47, -24.02); wallLadder(ctx, p[0], p[1], Math.sin(ANG), -Math.cos(ANG), b.roofY, 8.63); } }
}

// ============================================================================================ small buildings
function smallBuildings(ctx, ring) {
  for (const [n, h, style] of [[1125, 4.4, 'hamBungalow'], [1030, 4.0, 'hamBungalow'], [1041, 4.2, 'hamBungalow'], [958, 4.8, 'hamLowCream'], [1064, 3.8, 'hamBungalow'], [1072, 3.8, 'hamBungalow'], [1076, 3.6, 'hamService']]) {
    const r = simplify(ring(n), 0.6); flatBuilding(ctx, r, h, style, { skin: SKIN_STUCCO });
  }
  flatBuilding(ctx, GR(-86.7, 90, -69, 99), 4.2, 'hamBungalow', { skin: SKIN_STUCCO });            // the new field restroom / concession block
  flatBuilding(ctx, GR(-156.2, -92, -151, -75), 3.6, 'hamLowCream', { skin: SKIN_STUCCO });        // snack bar at the north end of the home stand
  flatBuilding(ctx, GR(-64, -89, -52, -83), 3.4, 'hamService', { skin: SKIN_STUCCO });             // contractor's store in the north yard
}

// ============================================================================================ tennis deck
// chain-link on top of a structure: mesh + top rail + posts, solid to players, bullets pass (metal:mesh)
function raisedFence(ctx, a, b, y0, h, gaps = []) {
  const { B } = ctx; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const cuts = [0, L]; for (const [g0, g1] of gaps) cuts.push(g0, g1); cuts.sort((p, q) => p - q);
  for (let k = 0; k < cuts.length - 1; k++) {
    const u0 = cuts[k], u1 = cuts[k + 1]; if (u1 - u0 < 0.1 || gaps.some(([g0, g1]) => (u0 + u1) / 2 > g0 && (u0 + u1) / 2 < g1)) continue;
    const p0 = [a[0] + tx * u0, a[1] + tz * u0], p1 = [a[0] + tx * u1, a[1] + tz * u1];
    B.v('chainlink').quad([p0[0], y0, p0[1]], [p0[0], y0 + h, p0[1]], [p1[0], y0 + h, p1[1]], [p1[0], y0, p1[1]], [u0 * 2, 0], [u0 * 2, h * 2], [u1 * 2, h * 2], [u1 * 2, 0]);
    B.v('blackMetal').tube([p0[0], y0 + h, p0[1]], [p1[0], y0 + h, p1[1]], 0.025, 5); const n = Math.max(1, Math.round((u1 - u0) / 3.2));
    for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; B.v('blackMetal').cyl(a[0] + tx * u, y0, a[1] + tz * u, 0.035, 0.035, h + 0.04, 6, 1, true); }
    B.c('metal:mesh').box((p0[0] + p1[0]) / 2, y0 + h / 2, (p0[1] + p1[1]) / 2, u1 - u0, h, 0.08, Math.atan2(-tz, tx));
  }
}
function tennisDeck(ctx) {
  const { B, quality } = ctx; const a0 = -153.5, a1 = -83, b0 = 129, b1 = 162, deck = 4.8, par = 0.45; const ring = ensureCCW(GR(a0, b0, a1, b1));
  const conc = B.v('concrete'), dark = B.v('blackMetal'); const stu = B.v('stucco', true); stu.setColor(...TAN);   // the deck is tan stucco over the concrete frame
  const ladP = G((a0 + a1) / 2 + 20, b0 - 0.02);   // roof-access ladder on the north wall (built with the ramp below)
  for (let i = 0; i < 4; i++) {
    const a = ring[i], b = ring[(i + 1) % 4]; const F = edgeFrame(a[0], a[1], b[0], b[1]); const L = F.L;
    wallRect(stu, F, 0, L, 0, deck + par, 0, [0, 0, L * 0.45, (deck + par) * 0.45]); fbox(stu, F, -0.05, L + 0.05, 3.9, deck + par, 0, 0.12, 0.45, 0, 'fstb');
    const nb = Math.round(L / 8.2); for (let k = 0; k < nb; k++) { const u0 = 0.6 + k * (L - 1.2) / nb + 0.35, u1 = 0.6 + (k + 1) * (L - 1.2) / nb - 0.35; wallRect(dark, F, u0, u1, 1.15, 3.5, 0.012); fbox(B.v('galv'), F, u0, u1, 1.9, 1.98, 0.012, 0.05, 1, 0, 'ftb'); fbox(B.v('galv'), F, u0, u1, 2.6, 2.68, 0.012, 0.05, 1, 0, 'ftb'); }
    quadFacing(conc, F.P(0, deck + par, 0), F.P(L, deck + par, 0), F.P(L, deck + par, -0.3), F.P(0, deck + par, -0.3), [0, 1, 0]); quadFacing(conc, F.P(0, deck, -0.3), F.P(L, deck, -0.3), F.P(L, deck + par, -0.3), F.P(0, deck + par, -0.3), [-F.nx, 0, -F.nz]);
    const pc = F.P(L / 2, deck + par / 2, -0.15); B.c('concrete').box(pc[0], pc[1], pc[2], L, par, 0.3, F.rotY);
    B.v('groundDecal').quad(F.P(0, 0.025, 0.02), F.P(L, 0.025, 0.02), F.P(L, 0.025, 1.5), F.P(0, 0.025, 1.5), [0, 0], [1, 0], [1, 1], [0, 1]);
    // court fence on the parapet, with a gate gap in the middle of each side (and a wide one where the ramp lands)
    // (plus a gate at the roof-access ladder, or the ladder would top out under the 2.9 m fence)
    const east = F.nx > 0.5; const gaps = east ? [[2.2, 7.8]] : [[L / 2 - 1.3, L / 2 + 1.3]];
    const lu = (ladP[0] - a[0]) * F.tx + (ladP[1] - a[1]) * F.tz, lv = (ladP[0] - a[0]) * F.nx + (ladP[1] - a[1]) * F.nz;
    if (Math.abs(lv) < 0.2 && lu > 1 && lu < L - 1) gaps.push([lu - 0.9, lu + 0.9]);
    raisedFence(ctx, F.P(0, 0, -0.15).filter((_, k2) => k2 !== 1), F.P(L, 0, -0.15).filter((_, k2) => k2 !== 1), deck + par, 2.9, gaps);
  }
  B.c('concrete').prism(ring, 0, deck, 1, false); B.c('concrete').poly(ring, null, deck);
  (ctx.buildingRings = ctx.buildingRings || []).push(ring);
  // four courts painted on the deck (green courts on a red-brown surround), nets as low solid mesh
  const ppm = quality === 'low' ? 8 : 12, W = Math.round((b1 - b0) * ppm), H = Math.round((a1 - a0) * ppm); const c = makeCanvas(W, H), g = c.getContext('2d');   // canvas X runs grid south (b), Y grid west (a1 - a): the convention of paintedQuad / the field
  g.fillStyle = '#8a4a3c'; g.fillRect(0, 0, W, H); g.strokeStyle = '#ece9e0'; g.lineWidth = Math.max(1.5, 0.06 * ppm);
  for (const ac of [-140.3, -125.8, -111.2, -96.4]) {
    const X = (b) => (b - b0) * ppm, Y = (a) => (a1 - a) * ppm, bc = 145.6; g.fillStyle = '#3d6f4d'; g.fillRect(X(bc - 11.885), Y(ac + 5.485), 23.77 * ppm, 10.97 * ppm);
    g.strokeRect(X(bc - 11.885), Y(ac + 5.485), 23.77 * ppm, 10.97 * ppm); g.strokeRect(X(bc - 11.885), Y(ac + 4.115), 23.77 * ppm, 8.23 * ppm); g.strokeRect(X(bc - 6.4), Y(ac + 4.115), 12.8 * ppm, 8.23 * ppm);
    g.beginPath(); g.moveTo(X(bc - 6.4), Y(ac)); g.lineTo(X(bc + 6.4), Y(ac)); g.stroke();
    const n0 = G(ac - 6.4, bc), n1 = G(ac + 6.4, bc); B.v('net').quad([n0[0], deck + 0.02, n0[1]], [n0[0], deck + 1.0, n0[1]], [n1[0], deck + 1.0, n1[1]], [n1[0], deck + 0.02, n1[1]], [0, 0], [0, 1], [12, 1], [12, 0]); B.v('net').quad([n1[0], deck + 0.02, n1[1]], [n1[0], deck + 1.0, n1[1]], [n0[0], deck + 1.0, n0[1]], [n0[0], deck + 0.02, n0[1]], [0, 0], [0, 1], [12, 1], [12, 0]);
    for (const n of [n0, n1]) B.v('blackMetal').cyl(n[0], deck, n[1], 0.05, 0.05, 1.07, 6, 1, true);
    const m = G(ac, bc); B.c('metal:mesh').box(m[0], deck + 0.5, m[1], 12.8, 1.0, 0.08, ROT);
  }
  turfNoise(g, W, H, 14, 5);
  { const m = G((a0 + a1) / 2, (b0 + b1) / 2); paintedQuad(ctx, c, m[0], m[1], b1 - b0, a1 - a0, ANG, { y: deck + 0.012, nScale: 0.6, rough: 0.92 }); }
  // car ramp up the east side (one smooth slope, kerb walls both sides) and a ladder on the north wall
  { const w = 5.4, aR = a1 + w / 2 + 0.1, bTop = 137, bBot = 160.5; const P = (a, b, y) => { const p = G(a, b); return [p[0], y, p[1]]; };
    const A = P(aR - w / 2, bBot, 0), Bq = P(aR + w / 2, bBot, 0), C = P(aR + w / 2, bTop, deck), D = P(aR - w / 2, bTop, deck); quadFacing(conc, A, Bq, C, D, [0, 1, 0], [[0, 0], [w / 3, 0], [w / 3, 8], [0, 8]]); quadFacing(B.c('concrete'), A, Bq, C, D, [0, 1, 0]);
    const E = P(aR - w / 2, b0 + 0.1, deck), Fq = P(aR + w / 2, b0 + 0.1, deck); quadFacing(conc, D, C, Fq, E, [0, 1, 0]); quadFacing(B.c('concrete'), D, C, Fq, E, [0, 1, 0]);   // landing level with the deck
    // solid side wall under the outer edge of the ramp + landing (triangle + rectangle), kerb on top
    const o0 = P(aR + w / 2, bBot, 0), o1 = P(aR + w / 2, bTop, 0), o2 = P(aR + w / 2, bTop, deck), o3 = P(aR + w / 2, b0 + 0.1, 0), o4 = P(aR + w / 2, b0 + 0.1, deck);
    // (texture coordinates in wall metres: without them the stucco smeared along the whole ramp)
    { const uvw = (p) => [Math.hypot(p[0] - o0[0], p[2] - o0[2]) * 0.45, p[1] * 0.45]; const T3 = (bk, a, b, c, uv) => (uv ? bk.tri(a, b, c, uvw(a), uvw(b), uvw(c)) : bk.tri(a, b, c)); const Q4 = (bk, a, b, c, d, uv) => (uv ? bk.quad(a, b, c, d, uvw(a), uvw(b), uvw(c), uvw(d)) : bk.quad(a, b, c, d));
      const n0 = P(aR - w / 2, b0 + 0.1, 0), n1 = P(aR - w / 2, b0 + 0.1, deck);
      for (const [bk, uv] of [[stu, true], [B.c('concrete'), false]]) { T3(bk, o0, o1, o2, uv); T3(bk, o1, o0, o2, uv); Q4(bk, o1, o3, o4, o2, uv); Q4(bk, o3, o1, o2, o4, uv); Q4(bk, o3, n0, n1, o4, uv); Q4(bk, n0, o3, o4, n1, uv); } }
    for (const [p, q] of [[o0, o2], [o2, o4]]) { const kb = B.v('concrete'); const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]; const len = Math.hypot(d[0], d[2]); const m = new THREE.Matrix4().compose(new THREE.Vector3((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 0.45, (p[2] + q[2]) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(d[0], d[2]), 0, 'YXZ')).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(d[1], len), 0, 0))), new THREE.Vector3(0.25, 0.9, Math.hypot(len, d[1]))); kb.boxM(m, 1 / 3); B.c('concrete').boxM(m); }
    const lp = ladP; wallLadder(ctx, lp[0], lp[1], Math.sin(ANG), -Math.cos(ANG), deck, deck + par); }
  stu.setColor(1, 1, 1);
  // floodlight masts at the corners (grapple poles)
  for (const [a, b] of [[a0 + 0.4, b0 + 0.4], [a1 - 0.4, b0 + 0.4], [a0 + 0.4, b1 - 0.4], [a1 - 0.4, b1 - 0.4], [(a0 + a1) / 2, b0 + 0.4], [(a0 + a1) / 2, b1 - 0.4]]) { const p = G(a, b); B.v('galv').cyl(p[0], deck, p[1], 0.09, 0.06, 6.2, 8, 1, true); B.v('lightEmit').box(p[0], deck + 6.25, p[1], 0.9, 0.22, 0.4, ROT); B.c('metal').box(p[0], deck + 3.1, p[1], 0.25, 6.2, 0.25); ctx.grapplePoles.push({ x: p[0], z: p[1], y0: deck + 0.5, y1: deck + 6.2, r: 0.09 }); }
}

// ============================================================================================ canopies of the south lots
function canopies(ctx) {
  const { B } = ctx;
  // photovoltaic carports over the staff car park (tall steel T-frames, dark panels): solid decks you can fight on
  for (const [x0, y0, x1, y1] of [[-47.7, 92, -30, 138], [-24, 92, -9, 138], [-7.6, 92, 7, 118], [-7.6, 121.5, 7, 138], [-44.7, 143, 11, 156]]) { const p = G((x0 + x1) / 2, (y0 + y1) / 2); canopy(ctx, p[0], p[1], x1 - x0, y1 - y0, 4.3, ROT, { key: 'solar', uv: 0.25, span: 9 }); }
  // steel frame of the next carport going up along the west aisle (posts + beams only)
  for (let b = 88; b <= 148; b += 10) { for (const a of [-57.5, -50]) { const p = G(a, b); B.v('galv').box(p[0], 2.15, p[1], 0.24, 4.3, 0.24, ROT); B.c('metal').box(p[0], 2.15, p[1], 0.3, 4.3, 0.3, ROT); } const m = G(-53.75, b); B.v('galv').box(m[0], 4.42, m[1], 8.2, 0.24, 0.2, ROT); }
  for (const a of [-57.5, -50]) { const m = G(a, 118); B.v('galv').box(m[0], 4.2, m[1], 0.2, 0.2, 60.4, ROT); }
  // pale fabric-roofed lunch shelters east of the car park, and the two ticket canopies on the stadium plaza
  for (const [x0, y0, x1, y1] of [[20, 96, 31, 109], [36, 96, 50 - 4.5, 108], [20, 116, 32, 134], [35.5, 116, 45.5, 134]]) { const p = G((x0 + x1) / 2, (y0 + y1) / 2); B.v('awning', true).setColor(0.66, 0.66, 0.63); canopy(ctx, p[0], p[1], x1 - x0, y1 - y0, 3.3, ROT, { key: 'awning', under: 'galv', span: 6 }); }
  for (const [x0, x1] of [[-154.5, -141], [-139, -126.5]]) { const p = G((x0 + x1) / 2, 82); B.v('awning', true).setColor(0.13, 0.15, 0.16); canopy(ctx, p[0], p[1], x1 - x0, 8, 3.2, ROT, { key: 'awning', under: 'frame', span: 7 }); B.v('paint', true).setColor(0.85, 0.66, 0.08).box(p[0], 3.31, p[1], x1 - x0 + 0.06, 0.2, 8.06, ROT); }
  B.v('awning', true).setColor(1, 1, 1); B.v('paint', true).setColor(1, 1, 1);
}

// ============================================================================================ entry
export function buildSchool(ctx) {
  const { B, data } = ctx; const ring = (n) => data.buildings.find((b) => b.id === ID(n)).outer[0];
  B.v('stucco', true); B.v('brick', true); B.v('shingles', true); B.v('paint', true); B.v('awning', true);
  STYLES.hamTownBrick = { kind: 'gym', bay: 6.0, frame: 'frame', top: 'stone', tint: BRICK_TINT };   // brick boxes in town keep the shared brick
  STYLES.hamAud = { wall: 'hamBrick', kind: 'gym', bay: 6.0, frame: 'frame', top: 'stone', tint: BRICK_TINT };
  ctx.flatRoofs = ctx.flatRoofs || []; ctx.roofSpots = [];
  brownHall(ctx, ring(1082));
  classrooms(ctx, ring);
  pattizHall(ctx, ring(995));
  gyms(ctx, ring);
  smallBuildings(ctx, ring);
  tennisDeck(ctx);
  canopies(ctx);
  B.v('stucco', true).setColor(1, 1, 1); B.v('brick', true).setColor(1, 1, 1); B.v('shingles', true).setColor(1, 1, 1); B.v('paint', true).setColor(1, 1, 1);
}
