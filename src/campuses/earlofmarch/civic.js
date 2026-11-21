// The John G. Mlacak Centre (arena + community halls, 2500 Campeau Drive) and the Ottawa Public Library's Beaverbrook
// branch against its north end: the two public buildings inside the fence south of the school. Roof blocks from the
// lidar (blocks.js CIVIC_BLOCKS, tools/blocks.py); looks from the 3D-tiles obliques and Street View:
//   arena hall + west aisle: flat red-brown roofs; the walls are a steep skirt of weathered grey cedar shakes that
//     overhangs a low board-formed concrete base;
//   south-west annex: grey-shingled hipped roofs over pale walls, a verdigris cupola over the entrance;
//   library: a two-storey charcoal panel box with cedar boards and a glazed north-east front, on pale masonry wings.
import { pointInRing, mulberry32 } from '../../world/util.js';
import { polyRoof, minAreaOBB } from '../marin/kit.js';
import { CIVIC_BLOCKS, CIVIC_FRAME } from './blocks.js';
import { offsetRing } from './lib.js';
import { MAT, mat, hasPack, ribbon, door, cutRects, quadFacing, wallRect, fbox, ensureCCW } from './kit.js';
import { buildBlocks, roofPlant, ladderAt, outFrame } from './school.js';

const UX = Math.cos(CIVIC_FRAME.ang), UZ = Math.sin(CIVIC_FRAME.ang);
export const CW = (u, v) => [CIVIC_FRAME.cx + u * UX - v * UZ, CIVIC_FRAME.cz + u * UZ + v * UX];
export const civicBlocks = () => CIVIC_BLOCKS.map((b) => ({ ...b, kind: (b.kind === 'lib1' || b.kind === 'libTop') && b.deck > 8 ? 'lib2' : b.kind, ring: ensureCCW(b.ring.map((p) => [p[0], p[1]])) }));   // (every two-storey piece of the library is the charcoal box with its cedar band: the leftover piece at 9.8 m and the raised top too)
const MLACAK = new Set(['arena', 'aisle', 'low', 'annex']);
export const LIB_FLOOR = 0.36, ARENA_FLOOR = 0.36;
// doors the tiles / Street View show, in the civic frame [u, v, opts] (rule F47)
export const CIVIC_DOORS = [];   // (set from the nadir tiles in CIVIC_DOORS_W below)
// WORLD [x, z, opts]. Street View d_ml: the Mlacak Centre's entrance under a name fascia at the roof edge, between the arena's shake roof and the
// library; d_ml2 / d_lib: the library's glazed front on the forecourt with a white name band beside it (its wording is not legible in any frame:
// the branch's name is used). (round 2: a third door on the arena's west side had no evidence and is gone.)
export const CIVIC_DOORS_W = [[47.5, 138.0, { w: 3.8, id: 'library', sign: { lines: ['OTTAWA PUBLIC LIBRARY', 'BEAVERBROOK'], y: 3.0 } }], [45.6, 161.5, { w: 3.8, id: 'Mlacak Centre', sign: { lines: ['JOHN G. MLACAK', 'CENTRE'], w: 7.4, h: 1.75, over: true, atW: [45.69, 159.92], shake: true } }]]   // (fix round 1, Street View f_ml: the white name band spans the entrance recess above the doors; two lines so the letters are 0.5 m and read from the forecourt);
export const CIVIC_LADDERS = [[-2.0, 139.6]];   // WORLD

export function civicPads(ctx) {
  const T = ctx.terrain; if (!T) return;
  // the library and the arena's north-east side stand on the forecourt's level; round the arena's west and south sides the
  // ground is 1.3-1.6 m higher (lidar) and stays as it is: the shake skirt comes down to it. Inside the footprints the
  // ground is cut to the floor so nothing pokes through (map check `interior`).
  for (const b of civicBlocks()) { const lib = !MLACAK.has(b.kind); const r = offsetRing(b.ring, lib ? 2.2 : -0.4);
    ctx.flatten({ outline: r }, lib ? { y: LIB_FLOOR - 0.02, blend: 3.5 } : { blend: 0, y: (x, z) => Math.min(T.heightAt(x, z), ARENA_FLOOR + 1.9) }); }
}
const groundAt = (ctx, F) => { let m = -1e9; for (const t of [0.05, 0.3, 0.5, 0.7, 0.95]) m = Math.max(m, ctx.groundY(F.ax + F.tx * F.L * t + F.nx * 0.5, F.az + F.tz * F.L * t + F.nz * 0.5)); return m; };

/** The arena's wall: a board-formed concrete base and, from `eave` up, a steep skirt of cedar shakes that overhangs it. */
function shakeWall(ctx, F, y0, top, o = {}) {
  const { B } = ctx; const eave = Math.min(top - 1.6, y0 + (o.base ?? 2.45)), out = o.out ?? 1.15, L = F.L;
  const cw = mat(ctx, MAT.mlacakWall); const holes = []; const doors = (o.doors || []).filter((d) => d.u > 1.2 && d.u < L - 1.2);
  for (const d of doors) holes.push([d.u - (d.w || 1.9) / 2, d.u + (d.w || 1.9) / 2, y0 - 0.5, y0 + 2.3]);
  cutRects(L, y0 - 0.9, eave, holes, (a, b, c, d) => wallRect(cw, F, a, b, c, d, 0, [o.uOff + a, c, o.uOff + b, d])); cw.setColor(1, 1, 1);
  for (const d of doors) door(ctx, F, d.u, y0, { ...d, h: 2.3, frame: 'frame', sign: d.sign ? { ...d.sign, out: out + 0.04, y: eave - y0 - 0.1 } : undefined });
  const sk = mat(ctx, MAT.shake); const sl = Math.hypot(out, top - eave);
  const a = F.P(-out, eave, out), b = F.P(L + out, eave, out), c = F.P(L, top, 0), d = F.P(0, top, 0);
  quadFacing(sk, a, b, c, d, [F.nx, 0.4, F.nz], [[o.uOff - out, 0], [o.uOff + L + out, 0], [o.uOff + L, sl], [o.uOff, sl]]); sk.setColor(1, 1, 1);
  const sf = mat(ctx, MAT.shake, 0.55); quadFacing(sf, F.P(-out, eave, 0), F.P(L + out, eave, 0), F.P(L + out, eave, out), F.P(-out, eave, out), [0, -1, 0]); sf.setColor(1, 1, 1);
  fbox(B.v('frame'), F, -out, L + out, eave - 0.14, eave + 0.02, out - 0.04, out + 0.03, 1, 0, 'fstb');   // eave board
  const col = B.c('wood'); quadFacing(col, a, b, c, d, [F.nx, 0.4, F.nz]); quadFacing(col, F.P(-out, eave, 0), F.P(L + out, eave, 0), F.P(L + out, eave, out), F.P(-out, eave, out), [0, -1, 0]);
}
/** The library's walls: charcoal panels with a cedar band and tall glazing (lib2), pale masonry with punched windows (lib1). */
function libWall(ctx, F, y0, top, o) {
  const { B } = ctx; const L = F.L, two = o.kind === 'lib2' || o.kind === 'libTop'; const holes = [], units = []; const doors = (o.doors || []).filter((d) => d.u > 1.2 && d.u < L - 1.2);
  for (const d of doors) holes.push([d.u - (d.w || 1.9) / 2, d.u + (d.w || 1.9) / 2, y0 - 0.5, y0 + 2.75]);
  const free = (a, b) => !doors.some((d) => d.u + 1.3 > a && d.u - 1.3 < b);
  // (fix round 1, Street View f_lib2 / l1 / d_lib) the forecourt front is a TWO-STOREY CURTAIN WALL with white fins under the charcoal roof edge (o.curtain);
  // every other wall of the box has a continuous ribbon of glazing along the ground floor over a pale masonry base, the charcoal panels and the cedar band above.
  if (o.kind === 'lib2' && o.curtain && L > 1.5) { let u = 0.3; const yb = top - 0.95; for (const d of [...doors].sort((p, q) => p.u - q.u).concat([{ u: L + 2.2, w: 3.8 }])) { const e = Math.min(L - 0.3, d.u - (d.w || 1.9) / 2 - 0.2); if (e - u > 0.8) { holes.push([u, e, y0 + 0.25, yb]); units.push([u, e, y0 + 0.25, yb, 1.3, 'curtain']); } if (d.u < L) { holes.push([d.u - (d.w || 1.9) / 2, d.u + (d.w || 1.9) / 2, y0 + 2.75, yb]); units.push([d.u - (d.w || 1.9) / 2, d.u + (d.w || 1.9) / 2, y0 + 2.85, yb, 1.3, 'curtain']); } u = d.u + (d.w || 1.9) / 2 + 0.2; } }
  else if (o.kind === 'lib2' && L > 1.0) { const m0 = L > 3.2 ? 0.6 : 0.12;
    if (!doors.length && top - y0 > 4) { holes.push([m0, L - m0, y0 + 1.15, y0 + 2.85]); units.push([m0, L - m0, y0 + 1.15, y0 + 2.85, 1.4]); }
    if (L > 3.2) { const n = Math.max(1, Math.floor((L - 1.2) / 5.2)), hw = Math.min(1.5, (L - 1.6) / 2); for (let i = 0; i < n; i++) { const c = 0.6 + (L - 1.2) * (i + 0.5) / n; holes.push([c - hw, c + hw, y0 + 5.35, y0 + 6.85]); units.push([c - hw, c + hw, y0 + 5.35, y0 + 6.85, 1.5]); } } }
  else if (o.kind === 'lib1' && o.glazed && L > 5 && top - y0 > 3.4) { let u = 0.5; const yb = Math.min(top - 0.5, y0 + 3.5); for (const d of [...doors].sort((p, q) => p.u - q.u).concat([{ u: L + 2.4, w: 3.8 }])) { const e = Math.min(L - 0.5, d.u - (d.w || 1.9) / 2 - 0.5); if (e - u > 1.5) { holes.push([u, e, y0 + 0.3, yb]); units.push([u, e, y0 + 0.3, yb, 1.5]); } u = d.u + (d.w || 1.9) / 2 + 0.5; } }   /* (the glazed ground floor on the forecourt side: d_lib, d_ml2) */
  else if (o.kind === 'lib1' && L > 5 && !o.blank) { const n = Math.max(1, Math.floor((L - 1.6) / 4.6)); for (let i = 0; i < n; i++) { const c = 0.8 + (L - 1.6) * (i + 0.5) / n; if (!free(c - 1.2, c + 1.2) || top - y0 < 3.4) continue; holes.push([c - 1.2, c + 1.2, y0 + 1.0, y0 + 2.7]); units.push([c - 1.2, c + 1.2, y0 + 1.0, y0 + 2.7, 1.2]); } }
  const m = mat(ctx, two ? MAT.charcoal : MAT.blockWhite); cutRects(L, o.foot ?? y0 - 0.9, top, holes, (a, b, c, d) => wallRect(m, F, a, b, c, d, 0, [o.uOff + a, c, o.uOff + b, d])); m.setColor(1, 1, 1);
  if (o.kind === 'lib2' && L > 2 && !o.curtain) { const cd = mat(ctx, MAT.cedar); cutRects(L, y0 + 5.15, y0 + 7.05, holes, (a, b, cc, d) => wallRect(cd, F, a, b, cc, d, 0.02, [o.uOff + a, cc, o.uOff + b, d])); cd.setColor(1, 1, 1); }
  if (o.kind === 'lib2' && !o.curtain && top - y0 > 4) { const bw = mat(ctx, MAT.blockWhite); cutRects(L, y0 - 0.2, y0 + 1.05, holes, (a, b, cc, d) => wallRect(bw, F, a, b, cc, d, 0.03, [o.uOff + a, cc, o.uOff + b, d])); bw.setColor(1, 1, 1); }   // the pale base under the ground-floor ribbon
  if (o.curtain) { const wp = B.v('whitePanel'); for (const [a, b, c, d, , k] of units) { if (k !== 'curtain') continue; const n = Math.max(1, Math.round((b - a) / 1.3)); for (let i = 0; i <= n; i++) { const u = a + (b - a) * i / n; fbox(wp, F, u - 0.045, u + 0.045, c, d, -0.1, 0.32, 1, 0, 'fs'); } fbox(B.v('blackMetal'), F, a, b, y0 + 4.3, y0 + 4.55, -0.16, -0.02, 1, 0, 'ftb'); } }   // white fins, the floor edge behind the glass   /* (round 2, pair l1: the cedar band is the strip the upper windows sit in, and it runs the whole wall: the ring is noded, so a wall is several short edges) */
  for (const [a, b, c, d, mod] of units) ribbon(ctx, F, a, b, c, d, { frame: 'blackMetal', module: mod, depth: 0.18 });
  // (fix round 2, tiles t_olib / QA pair_elib2) the curtain wall ends at the Mlacak link in a rust-orange panel: the short end piece of the front, above the ground storey
  if (o.curtain && o.orange) { const pt = B.v('paint', true); pt.setColor(0.72, 0.27, 0.08); fbox(pt, F, 0.12, L - 0.12, y0 + 2.95, top - 0.95, 0, 0.36, 1, 0, 'fstb'); pt.setColor(1, 1, 1); fbox(B.v('blackMetal'), F, 0.06, L - 0.06, y0 + 2.83, y0 + 2.95, 0, 0.4, 1, 0, 'fstb'); }
  for (const d of doors) door(ctx, F, d.u, y0, { frame: 'blackMetal', ...d, sign: d.sign && o.curtain ? { ...d.sign, y: top - y0 - 0.92, h: 0.8, w: 9 } : d.sign });   // (on the curtain wall the name band sits on the charcoal roof edge, not across the glass)
  fbox(B.v(two ? 'blackMetal' : 'frameAlu'), F, -0.06, L + 0.06, top - 0.16, top, -0.02, 0.08, 1, 0, 'fstb');
}

export function buildCivic(ctx) {
  const { B } = ctx; const blocks = civicBlocks(); const rnd = mulberry32(2500);
  const doorsW = [...CIVIC_DOORS.map(([u, v, o]) => ({ p: CW(u, v), o: o || {} })), ...CIVIC_DOORS_W.map(([x, z, o]) => ({ p: [x, z], o: o || {} }))];
  const onWall = (F) => doorsW.map((d) => { const du = (d.p[0] - F.ax) * F.tx + (d.p[1] - F.az) * F.tz, dn = (d.p[0] - F.ax) * F.nx + (d.p[1] - F.az) * F.nz; return Math.abs(dn) < 1.6 && du > 1.2 && du < F.L - 1.2 ? { u: du, ...d.o } : null; }).filter(Boolean);
  const flat = blocks.filter((b) => b.kind !== 'annex'), annex = blocks.filter((b) => b.kind === 'annex');
  const edges = buildBlocks(ctx, flat, { id: 'civic', bottom: -0.6, floor: (F) => Math.max(LIB_FLOOR, groundAt(ctx, F) + 0.02), floorOf: () => LIB_FLOOR, floorMax: true,
    top: (b) => b.deck + (MLACAK.has(b.kind) ? 0.12 : 0.3), tint: (b) => (MLACAK.has(b.kind) ? [0.95, 0.45, 0.36] : [1.85, 1.82, 1.7]), parapetMat: (b) => (MLACAK.has(b.kind) ? MAT.shake : 'alu'),
    step: (F, y0, top, { block: b, uOff }) => {
      // (round 2, pairs l1 / d_lib: the charcoal box is the library's UPPER storey: a cedar band with its windows runs round it above the lower roofs)
      if (b.kind === 'lib2' && F.L > 2 && top - y0 > 3.6) { const L = F.L, ya = y0 + 1.0, yb = y0 + 2.5; const holes = []; const n = L > 3.6 ? Math.max(1, Math.floor((L - 1) / 4.6)) : 0, hw = Math.min(1.3, (L - 1.4) / 2); for (let i = 0; i < n; i++) { const cc = 0.5 + (L - 1) * (i + 0.5) / n; holes.push([cc - hw, cc + hw, ya + 0.1, yb - 0.1]); }
        const m = mat(ctx, MAT.charcoal); cutRects(L, y0, top, [[0, L, ya, yb]], (a, bb, cc, d) => wallRect(m, F, a, bb, cc, d, 0, [uOff + a, cc, uOff + bb, d])); m.setColor(1, 1, 1);
        const cd = mat(ctx, MAT.cedar); cutRects(L, ya, yb, holes, (a, bb, cc, d) => wallRect(cd, F, a, bb, cc, d, 0.02, [uOff + a, cc, uOff + bb, d])); cd.setColor(1, 1, 1);
        for (const h of holes) ribbon(ctx, F, h[0], h[1], h[2], h[3], { frame: 'blackMetal', module: 1.3, depth: 0.14 }); fbox(B.v('blackMetal'), F, -0.06, L + 0.06, top - 0.16, top, -0.02, 0.08, 1, 0, 'fstb'); return; }
      const m = mat(ctx, MLACAK.has(b.kind) ? MAT.shake : b.kind === 'lib1' ? MAT.blockWhite : MAT.charcoal); wallRect(m, F, 0, F.L, y0, top, 0, [uOff, y0, uOff + F.L, top]); m.setColor(1, 1, 1); },
    wall: (F, y0, top, { block: b, uOff }) => { const doors = onWall(F);
      if (MLACAK.has(b.kind)) { if (top - y0 < 2.6) { const m = mat(ctx, MAT.mlacakWall); wallRect(m, F, 0, F.L, y0 - 0.9, top, 0, [uOff, y0, uOff + F.L, top]); m.setColor(1, 1, 1); return false; } shakeWall(ctx, F, y0, top, { uOff, doors, base: b.kind === 'low' ? 2.3 : 2.45 }); return doors.length > 0; }
      const mx = F.ax + F.tx * F.L / 2, mz = F.az + F.tz * F.L / 2; const faces = F.nx * UX + F.nz * UZ;   // > 0: the forecourt side (north-east)
      libWall(ctx, F, y0, top, { kind: b.kind, uOff, doors, glazed: faces > 0.5, curtain: b.kind === 'lib2' && faces > 0.5 && b.deck > 9.7 && b.deck < 9.9, orange: Math.hypot(mx - 43.3, mz - 145.3) < 3.5, blank: ctx.groundY(mx + F.nx, mz + F.nz) > y0 + 0.4 }); return true; } });
  // the annex: pale walls under grey-shingled hips, the verdigris cupola over its entrance
  for (const b of annex) { const ring = b.ring; const g = Math.max(...ring.map((p) => ctx.groundY(p[0], p[1]))); const eave = Math.max(g + 3.0, 4.9), rise = 3.3; const w = mat(ctx, MAT.blockWhite);
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; if (flat.some((f) => pointInRing((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, offsetRing(f.ring, 0.4)))) continue; const F = outFrame(ring, i); const gw = Math.max(g, groundAt(ctx, F)); libWall(ctx, F, gw, eave, { kind: 'lib1', uOff: 0, doors: [], blank: false, foot: gw - 2.6 });   /* (round 2: punched windows like the tiles' annex; it had 25-29 m of blank wall) */ (ctx.walls = ctx.walls || []).push({ id: 'civic:annex', a: [F.ax, F.az], b: [F.ax + F.tx * F.L, F.az + F.tz * F.L], floor: gw, top: eave, open: true }); }
    w.setColor(1, 1, 1); B.c('concrete').prism(ring, g - 1.2, eave, 1, true);
    polyRoof(ctx, ring, eave, rise, { tint: [5.2, 5.4, 5.6], overhang: 0.7, fill: true });
    (ctx.buildingRings = ctx.buildingRings || []).push(ring); (ctx.footprints = ctx.footprints || []).push({ id: 'civic:annex', ring, roof: eave, floor: g });
    const o = minAreaOBB(ring); const cu = (o.u0 + o.u1) / 2, cv = (o.v0 + o.v1) / 2, cx = cu * o.tx - cv * o.tz, cz = cu * o.tz + cv * o.tx; const pt = B.v('paint', true); pt.setColor(0.25, 0.5, 0.45);
    pt.cyl(cx, eave + rise - 0.6, cz, 1.5, 1.5, 1.3, 8, 1, false); pt.cyl(cx, eave + rise + 0.7, cz, 1.9, 0.1, 1.5, 8, 1, false); pt.setColor(1, 1, 1); B.c('metal').cyl(cx, eave + rise - 0.6, cz, 1.6, 1.6, 2.6, 8, 1, true); }
  for (const p of CIVIC_LADDERS) (ctx.roofClear = ctx.roofClear || []).push([p[0], p[1], 10]);
  roofPlant(ctx, flat, rnd, -CIVIC_FRAME.ang, (b) => b.kind !== 'libTop');
  ctx.civicEdges = edges;
  for (const p of CIVIC_LADDERS) ladderAt(ctx, edges, p, 0.06);
  void hasPack;
}
