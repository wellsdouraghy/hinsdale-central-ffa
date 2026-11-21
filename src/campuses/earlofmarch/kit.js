// Earl of March Secondary School (Kanata, Ottawa): outlines, materials and the school's own wall kit.
// The 1971 building (Balharrie, Helmer and Gibson) is a precast-and-brick frame: exposed-aggregate concrete fins every
// ~6 m, a deep precast fascia, red-orange brick panels between them, ribbon windows in dark bronze frames right under the
// fascia and a second strip on the ground floor; the gym and auditorium boxes are blank brick under the same fascia and
// the two raised roofs are clad in precast. The 2015 grades 7-8 wing is red brick with white panel bays and green glass
// under a thin metal coping. None of that is the shared facade kit's brick-and-limestone school, so the walls are built
// here (rule F36). Heights are ABSOLUTE (y = 0 is the ground round the school; the site is level to +-0.2 m there).
import * as THREE from 'three';
import { addMaterials as addMarinMaterials, wallDecal } from '../marin/kit.js';
import { edgeFrame, quadFacing, wallRect, fbox, BRICK_S } from '../../world/facade.js';
import { ensureCCW, makeCanvas, canvasTexture, mulberry32 } from '../../world/util.js';

import { SCHOOL_FRAME } from './blocks.js';

// ------------------------------------------------------------------------------------------ outlines (mirrored in tools/data/extra.py)
// The play-area fence line (ctx.playEdge, rule F48), clockwise from the south-west corner.
export const PLAY_EDGE = [[-176, 226.5], [-176, -50.7], [-164.3, -61.9], [-146.0, -76.1], [-47.0, -153.1], [-36.9, -160.2], [12.1, -197.2], [26.2, -207.3], [37.2, -215.3],
  [47, -191], [50.5, -184.5], [66, -157.5], [72, -152.5], [125, -99], [146, -74], [168, -46], [184, -24], [201, 4], [212, 22], [215, 45], [218, 68], [228, 84], [237, 85],
  [222.0, 93.4], [197.0, 113.2], [165.5, 143.7], [137.2, 174.9], [126.6, 186.6], [117.1, 195.0], [94.9, 222.4], [87.1, 232], [18, 232], [-27, 226.5]];
export const SCHOOL_ID = 68609482, MLACAK_ID = 69099636, LIBRARY_ID = 576122574, TOWER_ID = 618611877;
// the school's own frame: u along its long walls (43.3 deg north of east), v across; origin (84, 16)
const UX = Math.cos(SCHOOL_FRAME.ang), UZ = Math.sin(SCHOOL_FRAME.ang);
export const SW = (u, v) => [SCHOOL_FRAME.cx + u * UX - v * UZ, SCHOOL_FRAME.cz + u * UZ + v * UX];
export const SUV = (x, z) => [(x - SCHOOL_FRAME.cx) * UX + (z - SCHOOL_FRAME.cz) * UZ, -(x - SCHOOL_FRAME.cx) * UZ + (z - SCHOOL_FRAME.cz) * UX];
export const SCHOOL_ROT = -SCHOOL_FRAME.ang;   // rotY of a box whose long side runs along u
export const STREET_W = { secondary: 14.0, secondary_link: 6.5, tertiary: 9.0, residential: 7.5 };
export const isStreet = (r) => STREET_W[r.tags.highway] !== undefined;
export const centroid = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
export const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
export const lineDist = (x, z, L) => { let m = 1e9; for (let i = 0; i < L.length - 1; i++) m = Math.min(m, segDist(x, z, L[i], L[i + 1])); return m; };

// ------------------------------------------------------------------------------------------ materials
// Every school material is a keyed texture of the campus pack (tools/textures/campuses/earlofmarch/materials.json:
// generated from measurements on the reference photos). With the pack off (`?tex=0`) the same geometry falls back to the
// shared stucco tile tinted to the material's colour, so the "before" still loads.
export const MAT = {
  precast: { key: 'eomPrecast', pack: [1, 1, 1], flat: [0.50, 0.44, 0.33] },         // exposed-aggregate precast: fins, fascias, the raised roofs' cladding
  brickNew: { key: 'eomBrickNew', pack: [1, 1, 1], flat: [0.36, 0.13, 0.07] },       // the 2015 wing's smoother red brick
  shake: { key: 'eomShake', pack: [1, 1, 1], flat: [0.20, 0.19, 0.17] },             // the Mlacak Centre's weathered cedar shakes
  mlacakWall: { key: 'eomBoard', pack: [1, 1, 1], flat: [0.50, 0.47, 0.40] },        // its board-formed concrete base walls
  charcoal: { key: 'eomCharcoal', pack: [1, 1, 1], flat: [0.075, 0.08, 0.085] },     // the library's charcoal fibre-cement panels
  blockWhite: { key: 'eomBlockWhite', pack: [1, 1, 1], flat: [0.62, 0.61, 0.57] },   // ... and its pale masonry
  cedar: { key: 'eomCedar', pack: [1, 1, 1], flat: [0.42, 0.22, 0.09] },             // ... and its cedar boards
  siding: { key: 'eomSiding', pack: [1, 1, 1], flat: [0.56, 0.50, 0.40] },           // the portables' beige vertical siding
  gravel: { key: 'eomGravel', pack: [1, 1, 1], flat: [0.25, 0.18, 0.14] },           // ballasted roofs (tinted: brown on the 1971 roofs, grey on the 2015 wing)
  portRoof: { key: 'eomPortRoof', pack: [1, 1, 1], flat: [0.22, 0.10, 0.07] },       // the portables' red-brown ribbed metal roofs
  panelWhite: { key: 'eomPanel', pack: [1, 1, 1], flat: [0.70, 0.70, 0.68] },        // the 2015 wing's white panels
  tower: { key: 'eomTowerPanel', pack: [1, 1, 1], flat: [0.62, 0.62, 0.60] },        // 2 The Parkway: pale precast
  balcony: { key: 'eomAtrium', pack: [1, 1, 1], flat: [0.42, 0.20, 0.14] },          // The Atriums: red-brown brick
};
export const hasPack = (ctx, key) => !!(ctx.TX && ctx.TX.tex[key] && ctx.TX.tex[key].key);
/** Bucket of a MAT entry with its colour set (k = shade multiplier, tint = extra tint). */
export function mat(ctx, m, k = 1, tint) {
  const on = hasPack(ctx, m.key); const b = ctx.B.v(on ? m.key : 'stucco', true); const c = on ? m.pack : m.flat; const t = tint || [1, 1, 1];
  b.setColor(c[0] * k * t[0], c[1] * k * t[1], c[2] * k * t[2]); return b;
}
// the 1971 brick: the shared 'brick' bucket (the pack overrides its tile with the generated red-orange brick; without the pack the shared brick, tinted)
export const BRICK_TINT_FLAT = [1.0, 0.86, 0.78];
export function brick(ctx, k = 1) { const b = ctx.B.v('brick', true); const t = ctx.TX ? [1, 1, 1] : BRICK_TINT_FLAT; b.setColor(t[0] * k, t[1] * k, t[2] * k); return b; }
// roof ballast tints over the neutral gravel tile (judged beside the tiles nadir, sunlit)
// (fix round 1: the brown was salmon beside the tiles' darker red-brown ballast)
export const ROOF_BROWN = [0.66, 0.34, 0.28], ROOF_GREY = [1.9, 1.9, 1.82], ROOF_DARK = [0.7, 0.7, 0.7];

export function addMaterials(ctx) {
  addMarinMaterials(ctx);   // stucco, solar, house walls, hedge ...
  const { M } = ctx; if (M.eomGlassGreen) return;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.eomGlassGreen = std({ color: 0x6f9c8c, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.5 });       // the 2015 wing's green-tinted glazing
  M.eomSpandrel = std({ color: 0x23262a, roughness: 0.35, metalness: 0.5 });                                 // dark spandrel glass / panel
  M.eomTrackGrey = std({ color: 0x8d8b86, roughness: 0.95 });
  M.eomRock = std({ vertexColors: true, roughness: 0.95, flatShading: true });                               // Canadian Shield outcrops: pink-grey granite gneiss
  { // painted court / field lines on a transparent canvas are made by the builders; a plain white line material:
    M.eomLine = std({ color: 0xe9e7df, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.eomLineYellow = std({ color: 0xd9b021, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); }
  { // lawn worn / mown turf of the track infield and the fields: a fine anisotropic mow pattern, tinted per field
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d'); const r = mulberry32(7); g.fillStyle = '#5c7d3a'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 5200; k++) { const x = r() * S, y = r() * S, l = 2 + r() * 5; const v = 0.82 + r() * 0.36; g.strokeStyle = `rgba(${70 * v | 0},${104 * v | 0},${44 * v | 0},${0.3 + r() * 0.4})`; g.lineWidth = 0.7 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 1.6, y + l); g.stroke(); }
    M.eomTurf = std({ map: canvasTexture(c, { aniso: ctx.T.aniso }), roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); }
}

// ------------------------------------------------------------------------------------------ wall pieces
let room = 0;
/** Glazing with the shared interior-mapped glass (uv = room index, as the facade kit writes it). */
export function glass(ctx, F, u0, u1, y0, y1, out, kind = 0) { room += 3; wallRect(ctx.B.v('glassInt'), F, u0, u1, y0, y1, out, [room + 1, kind * 2, room, kind * 2 + 1]); }
/** Calls emit(u0, u1, y0, y1) for every rectangle of the wall 0..L x yA..yB that no hole [u0, u1, y0, y1] covers. */
export function cutRects(L, yA, yB, holes, emit) {
  const ys = [yA, yB]; for (const h of holes) { if (h[2] > yA + 0.004 && h[2] < yB - 0.004) ys.push(h[2]); if (h[3] > yA + 0.004 && h[3] < yB - 0.004) ys.push(h[3]); }
  ys.sort((a, b) => a - b);
  for (let k = 0; k < ys.length - 1; k++) { const a = ys[k], b = ys[k + 1]; if (b - a < 0.004) continue; const ym = (a + b) / 2;
    const hs = holes.filter((h) => h[2] < ym && h[3] > ym).sort((p, q) => p[0] - q[0]); let u = 0;
    for (const h of hs) { if (h[0] > u + 0.004) emit(u, Math.min(L, h[0]), a, b); u = Math.max(u, h[1]); }
    if (L - u > 0.004) emit(u, L, a, b); }
}
/** A recessed strip of windows: dark frame reveals, mullions every `module` m, a transom when taller than 1.9 m. */
export function ribbon(ctx, F, u0, u1, y0, y1, o = {}) {
  const B = ctx.B, D = o.depth ?? 0.24, fr = B.v(o.frame || 'bronze'); const t = [F.tx, 0, F.tz];
  quadFacing(fr, F.P(u0, y0, 0), F.P(u0, y1, 0), F.P(u0, y1, -D), F.P(u0, y0, -D), t);
  quadFacing(fr, F.P(u1, y0, 0), F.P(u1, y1, 0), F.P(u1, y1, -D), F.P(u1, y0, -D), [-t[0], 0, -t[2]]);
  quadFacing(fr, F.P(u0, y1, 0), F.P(u1, y1, 0), F.P(u1, y1, -D), F.P(u0, y1, -D), [0, -1, 0]);
  quadFacing(o.sill || fr, F.P(u0, y0, 0.03), F.P(u1, y0, 0.03), F.P(u1, y0, -D), F.P(u0, y0, -D), [0, 1, 0]);
  wallRect(fr, F, u0, u1, y0, y1, -D);
  if (o.pane) wallRect(B.v(o.pane), F, u0 + 0.05, u1 - 0.05, y0 + 0.05, y1 - 0.05, -D + 0.03, [0, 0, (u1 - u0) / 1.4, (y1 - y0) / 1.4]);
  else glass(ctx, F, u0 + 0.05, u1 - 0.05, y0 + 0.05, y1 - 0.05, -D + 0.03, o.kind ?? 1);
  const fo0 = -D, fo1 = -D + 0.1; const n = Math.max(1, Math.round((u1 - u0) / (o.module || 1.5)));
  for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; fbox(fr, F, Math.max(u0, u - 0.03), Math.min(u1, u + 0.03), y0, y1, fo0, fo1, 1, 0, 'fs'); }
  fbox(fr, F, u0, u1, y0, y0 + 0.06, fo0, fo1, 1, 0, 'ft'); fbox(fr, F, u0, u1, y1 - 0.06, y1, fo0, fo1, 1, 0, 'fb');
  if (y1 - y0 > 1.9 && o.transom !== false) { const y = y0 + (o.transomAt ?? (y1 - y0) * 0.72); fbox(fr, F, u0, u1, y - 0.03, y + 0.03, fo0, fo1, 1, 0, 'ftb'); }
}
/** A pair (or more) of glazed doors in a recess, with a transom; the floor is `y0`. Noted in ctx.doors (rule F47: every door is real and gets its apron and walk). */
export function door(ctx, F, uc, y0, o = {}) {
  const B = ctx.B, w = o.w || 1.9, hd = 2.15, ht = o.h || 2.75, D = 0.4, fr = B.v(o.frame || 'bronze'); const u0 = uc - w / 2, u1 = uc + w / 2, t = [F.tx, 0, F.tz];
  quadFacing(fr, F.P(u0, y0, 0), F.P(u0, y0 + ht, 0), F.P(u0, y0 + ht, -D), F.P(u0, y0, -D), t);
  quadFacing(fr, F.P(u1, y0, 0), F.P(u1, y0 + ht, 0), F.P(u1, y0 + ht, -D), F.P(u1, y0, -D), [-t[0], 0, -t[2]]);
  quadFacing(fr, F.P(u0, y0 + ht, 0), F.P(u1, y0 + ht, 0), F.P(u1, y0 + ht, -D), F.P(u0, y0 + ht, -D), [0, -1, 0]);
  wallRect(fr, F, u0, u1, y0, y0 + ht, -D);
  const leaves = Math.max(1, Math.round(w / 0.95)), lw = (w - 0.12) / leaves;
  if (o.solid) { for (let i = 0; i < leaves; i++) { const a = u0 + 0.06 + i * lw; fbox(B.v(o.leaf || 'frame'), F, a + 0.02, a + lw - 0.02, y0 + 0.02, y0 + hd, -D, -D + 0.05, 1, 0, 'fs'); fbox(B.v('frameAlu'), F, a + lw - 0.2, a + lw - 0.1, y0 + 0.98, y0 + 1.06, -D + 0.05, -D + 0.1, 1, 0, 'fstb'); } }
  else { glass(ctx, F, u0 + 0.06, u1 - 0.06, y0 + hd + 0.06, y0 + ht - 0.06, -D + 0.03, 0);
    for (let i = 0; i < leaves; i++) { const a = u0 + 0.06 + i * lw, b = a + lw; glass(ctx, F, a + 0.09, b - 0.09, y0 + 0.25, y0 + hd - 0.09, -D + 0.05, 0);
      fbox(fr, F, a, a + 0.09, y0 + 0.02, y0 + hd, -D, -D + 0.08, 1, 0, 'fs'); fbox(fr, F, b - 0.09, b, y0 + 0.02, y0 + hd, -D, -D + 0.08, 1, 0, 'fs'); fbox(fr, F, a + 0.09, b - 0.09, y0 + 0.02, y0 + 0.25, -D, -D + 0.08, 1, 0, 'ft'); fbox(fr, F, a + 0.09, b - 0.09, y0 + hd - 0.09, y0 + hd, -D, -D + 0.08, 1, 0, 'fb');
      fbox(B.v('frameAlu'), F, a + 0.14, b - 0.14, y0 + 0.98, y0 + 1.05, -D + 0.08, -D + 0.13, 1, 0, 'fstb'); } }
  fbox(fr, F, u0, u1, y0 + hd, y0 + hd + 0.06, -D, -D + 0.1, 1, 0, 'ftb');
  fbox(B.v('concrete'), F, u0 - 0.3, u1 + 0.3, y0 - 0.25, y0 + 0.02, -D, 0.35, 1 / 3, 0, 'fst');   // threshold slab
  const p = F.P(uc, y0, 0); (ctx.doors = ctx.doors || []).push({ id: o.id || null, x: p[0], z: p[2], nx: F.nx, nz: F.nz, y: y0, w, canopy: !!o.canopy });
  if (o.sign) {   // a name band over the door (o.sign = { lines, w, out, y }): white panel, dark letters sized from the text
    const sw = o.sign.over ? o.sign.w : Math.min(F.L - 0.5, o.sign.w || Math.max(w + 1.2, 0.36 * Math.max(...o.sign.lines.map((l) => l.length)))), sh = o.sign.h || 0.34 + 0.4 * o.sign.lines.length, so = o.sign.out ?? 0.02, sy = y0 + (o.sign.y ?? ht + 0.12); const ucD = uc; uc = o.sign.over ? (o.sign.atW ? (o.sign.atW[0] - F.ax) * F.tx + (o.sign.atW[1] - F.az) * F.tz : uc) : Math.max(sw / 2 + 0.25, Math.min(F.L - sw / 2 - 0.25, uc));   /* (fix round 1: `over` = a fascia band wider than its wall, centred on the world point atW) */   /* (the band stays on its own wall: the Mlacak name ran behind the next wall and read "N G. MLACAK CENTRE") */
    fbox(B.v('whitePanel'), F, uc - sw / 2, uc + sw / 2, sy, sy + sh, so, so + 0.07, 1, 0, 'fstb'); { const pc = F.P(uc, sy + sh / 2, so - 0.1); B.c('metal').box(pc[0], pc[1], pc[2], sw, sh, 0.34, F.rotY); }   /* (a solid band: the map check wants a sign backed by something) */
    const cw2 = 1024, ch2 = Math.round(1024 * sh / sw); const font = Math.min(Math.round(ch2 / o.sign.lines.length * 0.6), Math.round(cw2 * 1.5 / Math.max(...o.sign.lines.map((l) => l.length))));
    const tex = ctx.M.textDecal(o.sign.lines, { w: cw2, h: ch2, font, color: '#1c2a33', align: 'center', weight: 700, spacing: '2px' }); wallDecal(ctx, tex, F, uc, sy + sh / 2, sw - 0.12, sh - 0.08, so + 0.076, { opaque: false }); uc = ucD; }
  if (o.canopy) { const cw = o.canopy.w || w + 2.4, cd = o.canopy.d || 2.2, cy = y0 + (o.canopy.y || 3.0); const pc = mat(ctx, MAT.precast); fbox(pc, F, uc - cw / 2, uc + cw / 2, cy, cy + 0.32, 0, cd, 1, 0, 'fstb'); const c = F.P(uc, cy + 0.16, cd / 2); B.c('concrete').box(c[0], c[1], c[2], cw, 0.32, cd, F.rotY); fbox(B.v('lightEmit'), F, uc - 0.4, uc + 0.4, cy - 0.03, cy, cd * 0.4, cd * 0.4 + 0.5, 1, 0, 'fsb'); }
  return [u0, u1, y0, y0 + ht];
}
const PO = 0.28;   // how far the precast fins and fascia stand out from the brick
/** Precast fascia along the head of a wall (top at `top`, `h` deep), wrapped PO round both ends so corners close. */
export function fascia(ctx, F, top, h, o = {}) {
  const pc = mat(ctx, MAT.precast, o.shade || 1); const e0 = o.e0 ?? PO, e1 = o.e1 ?? PO;
  fbox(pc, F, -e0, F.L + e1, top - h, top, 0, PO, 1, o.uOff || 0, 'fstb');
  const j = ctx.B.v('paint', true); j.setColor(0.16, 0.15, 0.13);   // panel joints
  for (let u = (o.joint || 3.05) / 2; u < F.L; u += o.joint || 3.05) wallRect(j, F, u - 0.01, u + 0.01, top - h + 0.02, top - 0.02, PO + 0.004);
  j.setColor(1, 1, 1);
}
/** One precast fin (column) on the wall face. */
export function fin(ctx, F, uc, y0, y1, w = 0.5, out = PO) { const a = Math.max(-out, uc - w / 2), b = Math.min(F.L + out, uc + w / 2); fbox(mat(ctx, MAT.precast, 0.97), F, a, b, y0, y1, 0, out, 1, 0, 'f'); fbox(mat(ctx, MAT.precast, 0.8), F, a, b, y0, y1, 0, out, 1, 0, 's'); }
function brickField(ctx, F, y0, y1, holes, uOff) { const bk = brick(ctx); cutRects(F.L, y0, y1, holes, (a, b, c, d) => wallRect(bk, F, a, b, c, d, 0, [(uOff + a) * BRICK_S, c * BRICK_S, (uOff + b) * BRICK_S, d * BRICK_S])); bk.setColor(1, 1, 1); }
function baseCourse(ctx, F, y0, spans) { const c = ctx.B.v('concrete'); cutRects(F.L, 0, 1, spans.map(([a, b]) => [a, b, -1, 2]), (a, b) => fbox(c, F, a, b, y0 - 0.4, y0 + 0.3, 0, 0.045, 1 / 3, 0, 'fst')); }

/**
 * The 1971 classroom wall: bays of ~6.1 m between precast fins, a deep precast fascia, a ribbon of windows right under it
 * and a second strip on the ground floor (o.ground: 'strip' | 'glass' = glazed to the floor | 'none'), a precast band at
 * the first floor. o.doors = [{ u, w, canopy, solid }] in metres along the wall. Floor at y0, parapet top at `top`.
 */
export function bayWall(ctx, F, y0, top, o = {}) {
  const L = F.L, uOff = o.uOff || 0; const fh = o.fascia ?? (top - y0 > 7 ? 1.9 : 1.1), wt = top - fh; const two = wt - y0 > 5.6;   /* (round 2, pairs n4 / n5 / d_78: the fascia is nearly a quarter of the wall) */
  const nb = Math.max(1, Math.round(L / (o.bay || 6.1))), bay = L / nb, pw = 0.5; const holes = [], units = [], doorSpans = [];
  const doors = (o.doors || []).filter((d) => d.u > 0.9 && d.u < L - 0.9);
  for (const d of doors) { const w = d.w || 1.9; holes.push([d.u - w / 2, d.u + w / 2, y0 - 0.5, y0 + (d.h || 2.75)]); doorSpans.push([d.u - w / 2 - 0.3, d.u + w / 2 + 0.3]); }
  const blank = o.blank || (() => false);
  for (let i = 0; i < nb; i++) {
    const a = i * bay + pw / 2 + 0.03, b = (i + 1) * bay - pw / 2 - 0.03; if (b - a < 1.3) continue; const um = (a + b) / 2;
    if (two && !blank(um, 1)) { holes.push([a, b, wt - 1.55, wt]); units.push([a, b, wt - 1.55, wt, 1]); }
    const hasDoor = doors.some((d) => d.u + (d.w || 1.9) / 2 > a && d.u - (d.w || 1.9) / 2 < b); if (hasDoor || blank(um, 0)) continue;
    const g = o.ground || 'strip';
    if (g === 'glass') { holes.push([a, b, y0 + 0.45, y0 + 2.95]); units.push([a, b, y0 + 0.45, y0 + 2.95, 0]); }
    else if (g === 'strip') { const ya = two ? y0 + 1.45 : wt - 1.5, yb = two ? y0 + 2.95 : wt; holes.push([a, b, ya, yb]); units.push([a, b, ya, yb, two ? 0 : 1]); }
  }
  brickField(ctx, F, y0 - 0.4, wt, holes, uOff);
  for (const [a, b, ya, yb, k] of units) ribbon(ctx, F, a, b, ya, yb, { kind: k, module: (b - a) / Math.max(2, Math.round((b - a) / 1.45)) });
  for (const d of doors) door(ctx, F, d.u, y0, d);
  baseCourse(ctx, F, y0, doorSpans);
  if (two) { const pc = mat(ctx, MAT.precast, 0.95); cutRects(L, 0, 1, doorSpans.map(([a, b]) => [a, b, 2, 3]), (a, b) => fbox(pc, F, a, b, y0 + 2.98, y0 + 3.85, 0, 0.09, 1, uOff, 'ftb')); }
  for (let i = 0; i <= nb; i++) { if (o.noEnds && (i === 0 || i === nb)) continue; fin(ctx, F, i * bay, y0 - 0.4, wt, pw); }
  fascia(ctx, F, top, fh, o);
}
/** A blank box wall (gym, auditorium, plant): brick (or precast panels, o.skin = 'precast') under the fascia, fins only at the corners and every o.bay. */
export function boxWall(ctx, F, y0, top, o = {}) {
  const L = F.L, uOff = o.uOff || 0; const fh = o.fascia ?? (top - y0 > 7 ? 1.8 : 1.1), wt = top - fh; const holes = [], doorSpans = [];
  const doors = (o.doors || []).filter((d) => d.u > 0.9 && d.u < L - 0.9);
  for (const d of doors) { const w = d.w || 1.9; holes.push([d.u - w / 2, d.u + w / 2, y0 - 0.5, y0 + (d.h || 2.75)]); doorSpans.push([d.u - w / 2 - 0.3, d.u + w / 2 + 0.3]); }
  const slots = (o.slots || []).filter((s) => s.u > 0.6 && s.u < L - 0.6);   // tall dark glazed slots (stair towers, the gym's corner)
  for (const s of slots) holes.push([s.u - s.w / 2, s.u + s.w / 2, y0 + (s.y0 ?? 0.3), Math.min(wt, y0 + (s.y1 ?? 99))]);
  if (o.skin === 'precast') { const pc = mat(ctx, MAT.precast, 0.98); cutRects(L, y0 - 0.4, wt, holes, (a, b, c, d) => wallRect(pc, F, a, b, c, d, 0, [uOff + a, c, uOff + b, d])); const j = ctx.B.v('paint', true); j.setColor(0.16, 0.15, 0.13); for (let u = 1.52; u < L - 0.5; u += 3.05) wallRect(j, F, u - 0.01, u + 0.01, y0, wt, 0.004); j.setColor(1, 1, 1); }
  else brickField(ctx, F, y0 - 0.4, wt, holes, uOff);
  for (const s of slots) ribbon(ctx, F, s.u - s.w / 2, s.u + s.w / 2, y0 + (s.y0 ?? 0.3), Math.min(wt, y0 + (s.y1 ?? 99)), { kind: 2, module: 1.2, pane: s.dark ? 'eomSpandrel' : undefined });
  for (const d of doors) door(ctx, F, d.u, y0, d);
  if (!o.step) baseCourse(ctx, F, y0, doorSpans);
  if (o.skin !== 'precast') { fin(ctx, F, 0, y0 - 0.4, wt, 0.6); fin(ctx, F, L, y0 - 0.4, wt, 0.6); if (o.bay) { const n = Math.max(1, Math.round(L / o.bay)); for (let i = 1; i < n; i++) fin(ctx, F, L * i / n, y0 - 0.4, wt, 0.5); }
    else { const j = ctx.B.v('paint', true); j.setColor(0.2, 0.1, 0.07); for (let u = 7.2; u < L - 3; u += 7.2) wallRect(j, F, u - 0.008, u + 0.008, y0, wt, 0.004); j.setColor(1, 1, 1); } }   /* brick control joints */
  if (fh > 0.05) fascia(ctx, F, top, fh, o);
}
/**
 * The 2015 wing: red brick piers, bays of white panel with two rows of green-glazed windows (one row on the low block),
 * a thin metal coping. o.doors as bayWall; o.glazed = [[u0, u1]] spans glazed full height (the entrance, the stair).
 */
export function newWall(ctx, F, y0, top, o = {}) {
  const B = ctx.B, L = F.L, uOff = o.uOff || 0; const wt = top - 0.22; const two = wt - y0 > 7; const holes = [], doorSpans = [], units = [];
  const doors = (o.doors || []).filter((d) => d.u > 0.9 && d.u < L - 0.9);
  for (const d of doors) { const w = d.w || 1.9; holes.push([d.u - w / 2, d.u + w / 2, y0 - 0.5, y0 + (d.h || 2.75)]); doorSpans.push([d.u - w / 2 - 0.3, d.u + w / 2 + 0.3]); }
  const glazed = (o.glazed || []).map(([a, b]) => [Math.max(0.3, a), Math.min(L - 0.3, b)]).filter(([a, b]) => b - a > 1.2);
  for (const [a, b] of glazed) { holes.push([a, b, y0 + 0.1, wt - 0.5]); units.push([a, b, y0 + 0.1, wt - 0.5, 'curtain']); }
  const nb = Math.max(1, Math.round(L / (o.bay || 7.4))), bay = L / nb; const panels = [];
  for (let i = 0; i < nb; i++) { const a = i * bay + Math.min(1.5, bay * 0.22), b = (i + 1) * bay - Math.min(1.5, bay * 0.22); if (b - a < 2 || L < 5) continue;
    if (glazed.some(([g0, g1]) => g1 > a - 0.2 && g0 < b + 0.2) || doorSpans.some(([d0, d1]) => d1 > a - 0.2 && d0 < b + 0.2) || (o.blank && o.blank((a + b) / 2))) continue;
    panels.push([a, b]); holes.push([a, b, y0 + 0.75, wt - 0.45]); }
  const bk = mat(ctx, MAT.brickNew); cutRects(L, y0 - 0.4, wt, holes, (a, b, c, d) => wallRect(bk, F, a, b, c, d, 0, [(uOff + a) * BRICK_S, c * BRICK_S, (uOff + b) * BRICK_S, d * BRICK_S])); bk.setColor(1, 1, 1);
  for (const [a, b] of panels) {   // a white panel bay standing 4 cm proud, with its windows cut in
    const ya = y0 + 0.75, yb = wt - 0.45; const rows = two ? [[y0 + 1.0, y0 + 3.0], [y0 + 4.75, y0 + 6.9]] : [[y0 + 1.0, Math.min(yb - 0.5, y0 + 3.6)]]; const wh = rows.map(([c, d]) => [a + 0.35, b - 0.35, c, d]);
    const wp = mat(ctx, MAT.panelWhite); cutRects(L, ya, yb, [[0, a, -99, 99], [b, L, -99, 99], ...wh], (p, q, c, d) => wallRect(wp, F, p, q, c, d, 0.04, [p, c, q, d]));
    fbox(wp, F, a, b, ya, yb, 0, 0.04, 1, 0, 's'); fbox(wp, F, a, b, yb, yb + 0.001, 0, 0.04, 1, 0, 't'); wp.setColor(1, 1, 1);
    for (const [p, q, c, d] of wh) ribbon(ctx, F, p, q, c, d, { frame: 'frameAlu', pane: 'eomGlassGreen', module: 1.25, depth: 0.16 }); }
  for (const [a, b, c, d] of units) ribbon(ctx, F, a, b, c, d, { frame: 'frameAlu', pane: 'eomGlassGreen', module: 1.5, depth: 0.2, transomAt: 2.6 });
  for (const d of doors) door(ctx, F, d.u, y0, { frame: 'frameAlu', ...d });
  baseCourse(ctx, F, y0, doorSpans);
  fbox(B.v('frameAlu'), F, -0.08, L + 0.08, wt, top, -0.02, 0.1, 1, 0, 'fstb');   // coping
}
// ------------------------------------------------------------------------------------------ the 2015 wing's own south front (fix round 1, rules A3 / F27 / F36 / F55)
// Street View f_78a (September 2019, from the east drive) + tiles obliques to_78s / to_78pav: the long wall on the play yard is a two-storey CURTAIN-WALL BAND
// in a pale metal frame (tall green glass below, a pale spandrel, dark windows alternating with green panels above) between brick end piers; next to it
// a GLAZED BOX in a thick silver portal frame stands 2 m proud and taller than the parapet; in the corner beside it the entrance: doors under a canopy
// and a glazed metal oriel over them; the east part's wall is plain brick with tall green slots and one pale panel band.
const brickNewField = (ctx, F, y0, y1, holes, uOff) => { const bk = mat(ctx, MAT.brickNew); cutRects(F.L, y0, y1, holes, (a, b, c, d) => wallRect(bk, F, a, b, c, d, 0, [(uOff + a) * BRICK_S, c * BRICK_S, (uOff + b) * BRICK_S, d * BRICK_S])); bk.setColor(1, 1, 1); };
const coping = (ctx, F, wt, top) => fbox(ctx.B.v('frameAlu'), F, -0.08, F.L + 0.08, wt, top, -0.02, 0.1, 1, 0, 'fstb');
export function curtainWall(ctx, F, y0, top, o = {}) {
  const B = ctx.B, L = F.L, uOff = o.uOff || 0, wt = top - 0.22; const a = Math.min(o.e0 ?? 6.5, L * 0.2), b = L - Math.min(o.e1 ?? 5.5, L * 0.2); const ya = y0 + 0.75, yb = Math.min(wt - 1.2, y0 + 7.7);
  brickNewField(ctx, F, y0 - 0.4, wt, [[a, b, ya, yb]], uOff);
  const wp = B.v('whitePanel'); const D = 0.16;
  fbox(wp, F, a - 0.22, a, ya - 0.22, yb + 0.22, 0, 0.1, 1, 0, 'fstb'); fbox(wp, F, b, b + 0.22, ya - 0.22, yb + 0.22, 0, 0.1, 1, 0, 'fstb'); fbox(wp, F, a, b, yb, yb + 0.22, 0, 0.1, 1, 0, 'fstb'); fbox(wp, F, a, b, ya - 0.22, ya, 0, 0.1, 1, 0, 'fstb');
  const y1 = ya + 2.75, y2 = y1 + 0.95; const n = Math.max(2, Math.round((b - a) / 2.9)), bw = (b - a) / n;
  ribbon(ctx, F, a, b, ya, y1, { frame: 'frameAlu', pane: 'eomGlassGreen', module: bw / 2, depth: D, transomAt: 2.05 });      // tall green glass at the ground
  wallRect(wp, F, a, b, y1, y2, -0.02, [0, 0, (b - a) / 1.4, 0.7]);                                                           // the pale spandrel
  ribbon(ctx, F, a, b, y2, yb, { frame: 'frameAlu', module: bw / 2, depth: D, kind: 1, transom: false });                    // the upper windows ...
  const gp = B.v('eomGlassGreen'); for (let i = 0; i < n; i++) wallRect(gp, F, a + i * bw + bw / 2 + 0.04, a + (i + 1) * bw - 0.04, y2 + 0.07, yb - 0.07, -D + 0.06, [0, 0, 1, 1]);   // ... every other light a green panel
  for (let i = 1; i < n; i++) fbox(wp, F, a + i * bw - 0.06, a + i * bw + 0.06, ya, yb, -D, 0.06, 1, 0, 'fs');                   // pale fins between the bays
  baseCourse(ctx, F, y0, []); coping(ctx, F, wt, top);
}
/** The glazed box: full-height green glazing in a thick silver portal (two cheeks and a roof slab standing `out` proud, the slab above the parapet). */
export function portalWall(ctx, F, y0, top, o = {}) {
  const B = ctx.B, L = F.L, out = o.out ?? 1.1, th = 0.5, up = o.up ?? 1.3; const al = B.v('frameAlu'); const yT = top + up;
  const m = B.v('eomSpandrel'); wallRect(m, F, 0, L, y0 - 0.4, y0 + 0.2, 0); 
  ribbon(ctx, F, th * 0.4, L - th * 0.4, y0 + 0.2, yT - th, { frame: 'frameAlu', pane: 'eomGlassGreen', module: (L - th * 0.8) / 6, depth: 0.12, transom: false });
  for (const y of [y0 + 2.75, y0 + 5.2, y0 + 7.6]) if (y < yT - th - 0.6) fbox(al, F, th * 0.4, L - th * 0.4, y - 0.04, y + 0.04, -0.12, -0.02, 1, 0, 'ftb');
  fbox(al, F, -0.25, th * 0.5, y0 - 0.3, yT, -0.3, out, 1, 0, 'fstb'); fbox(al, F, L - th * 0.5, L + 0.25, y0 - 0.3, yT, -0.3, out, 1, 0, 'fstb'); fbox(al, F, -0.25, L + 0.25, yT - th, yT, -0.3, out, 1, 0, 'fstb');
  // the box's back and lid above the roof (seen from the roofs and the air), and what a player can stand on / bump into
  const bk = F.P(L / 2, (top + yT) / 2 - 0.2, -1.6); B.v('frameAlu').box(bk[0], bk[1], bk[2], L + 0.5, yT - top + 0.4, 2.6, F.rotY); B.c('metal').box(bk[0], bk[1], bk[2], L + 0.5, yT - top + 0.4, 2.6, F.rotY);
  for (const u of [-0.25 + (th * 0.5 + 0.25) / 2, L + 0.25 - (th * 0.5 + 0.25) / 2]) { const c = F.P(u, (y0 + yT) / 2, out / 2); B.c('metal').box(c[0], c[1], c[2], th * 0.5 + 0.25, yT - y0, out, F.rotY); }
  { const c = F.P(L / 2, yT - th / 2, out / 2); B.c('metal').box(c[0], c[1], c[2], L + 0.5, th, out, F.rotY); }
}
/** The entrance wall in the corner: glazed doors under a canopy, glass to both sides, a glazed metal oriel over them. o.doors as the other walls. */
export function entryWall(ctx, F, y0, top, o = {}) {
  const B = ctx.B, L = F.L, uOff = o.uOff || 0, wt = top - 0.22; const al = B.v('frameAlu'); const holes = [], spans = [];
  const doors = (o.doors || []).filter((d) => d.u > 0.9 && d.u < L - 0.9); let u = 0.5;
  for (const d of [...doors].sort((p, q) => p.u - q.u).concat([{ u: L + 2.4, w: 3.8 }])) { const w = d.w || 1.9; if (d.u < L) { holes.push([d.u - w / 2, d.u + w / 2, y0 - 0.5, y0 + 2.75]); spans.push([d.u - w / 2 - 0.3, d.u + w / 2 + 0.3]); }
    const e = Math.min(L - 0.5, d.u - w / 2 - 0.25); if (e - u > 0.9) holes.push([u, e, y0 + 0.25, y0 + 2.75, 1]); u = d.u + w / 2 + 0.25; }
  brickNewField(ctx, F, y0 - 0.4, wt, holes.map((h) => h.slice(0, 4)), uOff);
  for (const h of holes) if (h[4]) ribbon(ctx, F, h[0], h[1], h[2], h[3], { frame: 'frameAlu', pane: 'eomGlassGreen', module: 1.2, depth: 0.14, transom: false });
  for (const d of doors) door(ctx, F, d.u, y0, { frame: 'frameAlu', ...d });
  // the oriel: a metal box 1.5 m proud from 3.6 m up to just under the coping, glazed on its face
  const oa = 0.35, ob = L - 0.35, ya = y0 + 3.6, yb = Math.min(wt - 0.5, y0 + 7.7), od = 1.5;
  fbox(al, F, oa, ob, ya, yb, 0, od, 1, 0, 'fstb'); { const c = F.P(L / 2, (ya + yb) / 2, od / 2); B.c('metal').box(c[0], c[1], c[2], ob - oa, yb - ya, od, F.rotY); }
  wallRect(B.v('eomGlassGreen'), F, oa + 0.4, ob - 0.4, ya + 0.45, yb - 0.45, od + 0.012, [0, 0, 4, 2]);
  const n = Math.max(2, Math.round((ob - oa - 0.8) / 1.3)); for (let i = 0; i <= n; i++) { const uu = oa + 0.4 + (ob - oa - 0.8) * i / n; wallRect(al, F, uu - 0.03, uu + 0.03, ya + 0.45, yb - 0.45, od + 0.02); }
  wallRect(al, F, oa + 0.4, ob - 0.4, (ya + yb) / 2 - 0.03, (ya + yb) / 2 + 0.03, od + 0.02);
  baseCourse(ctx, F, y0, spans); coping(ctx, F, wt, top);
}
/** Plain brick with tall green slots in pale frames and pale panel bands (o.slots = [{ u, w, y0, y1 }], o.bands = [[u0, u1]]): the 2015 wing's east part and its low block. */
export function slotWall(ctx, F, y0, top, o = {}) {
  const B = ctx.B, L = F.L, uOff = o.uOff || 0, wt = top - 0.22; const holes = [], spans = []; const wp = B.v('whitePanel');
  const doors = (o.doors || []).filter((d) => d.u > 0.9 && d.u < L - 0.9);
  for (const d of doors) { const w = d.w || 1.9; holes.push([d.u - w / 2, d.u + w / 2, y0 - 0.5, y0 + (d.h || 2.75)]); spans.push([d.u - w / 2 - 0.3, d.u + w / 2 + 0.3]); }
  const slots = (o.slots || []).filter((q) => q.u - q.w / 2 > 0.4 && q.u + q.w / 2 < L - 0.4 && !spans.some(([a, b]) => q.u + q.w / 2 > a && q.u - q.w / 2 < b)).map((q) => [q.u - q.w / 2, q.u + q.w / 2, y0 + (q.y0 ?? 0.9), Math.min(wt - 0.5, y0 + (q.y1 ?? 99))]);
  const bands = (o.bands || []).map(([a, b]) => [Math.max(0.2, a), Math.min(L - 0.2, b)]).filter(([a, b]) => b - a > 0.6);
  brickNewField(ctx, F, y0 - 0.4, wt, [...holes, ...slots], uOff);
  for (const [a, b, c, d] of slots) { ribbon(ctx, F, a, b, c, d, { frame: 'frameAlu', pane: 'eomGlassGreen', module: Math.min(1.3, b - a), depth: 0.14, transomAt: 2.0 }); fbox(wp, F, a - 0.14, a, c - 0.14, d + 0.14, 0, 0.06, 1, 0, 'fstb'); fbox(wp, F, b, b + 0.14, c - 0.14, d + 0.14, 0, 0.06, 1, 0, 'fstb'); fbox(wp, F, a, b, d, d + 0.14, 0, 0.06, 1, 0, 'ftb'); fbox(wp, F, a, b, c - 0.14, c, 0, 0.06, 1, 0, 'ftb'); }
  for (const [a, b] of bands) fbox(mat(ctx, MAT.panelWhite), F, a, b, y0 + 0.3, wt, 0, 0.05, 1, 0, 'fstb');
  ctx.B.v('stucco', true).setColor(1, 1, 1);
  for (const d of doors) door(ctx, F, d.u, y0, { frame: 'frameAlu', ...d });
  baseCourse(ctx, F, y0, spans); coping(ctx, F, wt, top);
}
export { edgeFrame, quadFacing, wallRect, fbox, BRICK_S, ensureCCW, PO };
