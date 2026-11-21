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
import { buildBlocks, roofPlant, ladderAt } from './school.js';

const UX = Math.cos(CIVIC_FRAME.ang), UZ = Math.sin(CIVIC_FRAME.ang);
export const CW = (u, v) => [CIVIC_FRAME.cx + u * UX - v * UZ, CIVIC_FRAME.cz + u * UZ + v * UX];
export const civicBlocks = () => CIVIC_BLOCKS.map((b) => ({ ...b, ring: ensureCCW(b.ring.map((p) => [p[0], p[1]])) }));
const MLACAK = new Set(['arena', 'aisle', 'low', 'annex']);
export const LIB_FLOOR = 0.36, ARENA_FLOOR = 0.36;
// doors the tiles / Street View show, in the civic frame [u, v, opts] (rule F47)
export const CIVIC_DOORS = [];   // (set from the nadir tiles in CIVIC_DOORS_W below)
export const CIVIC_DOORS_W = [[47.5, 138.0, { w: 3.8, id: 'library' }], [45.6, 161.5, { w: 3.8, id: 'Mlacak Centre' }], [-40.0, 205.5, { id: 'Mlacak hall', w: 1.9 }]];   // WORLD [x, z, opts]
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
  for (const d of doors) door(ctx, F, d.u, y0, { ...d, h: 2.3, frame: 'frame' });
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
  if (o.kind === 'lib2' && L > 6) { if (o.glazed) { holes.push([0.6, L - 0.6, y0 + 0.3, y0 + 3.6]); units.push([0.6, L - 0.6, y0 + 0.3, y0 + 3.6, 1.5]); }
    const n = Math.max(1, Math.floor((L - 2) / 5.2)); for (let i = 0; i < n; i++) { const c = 1 + (L - 2) * (i + 0.5) / n; holes.push([c - 1.5, c + 1.5, y0 + 5.2, y0 + 7.0]); units.push([c - 1.5, c + 1.5, y0 + 5.2, y0 + 7.0, 1.5]); if (!o.glazed && free(c - 1.5, c + 1.5)) { holes.push([c - 1.5, c + 1.5, y0 + 1.0, y0 + 3.0]); units.push([c - 1.5, c + 1.5, y0 + 1.0, y0 + 3.0, 1.5]); } } }
  else if (o.kind === 'lib1' && L > 5 && !o.blank) { const n = Math.max(1, Math.floor((L - 1.6) / 4.6)); for (let i = 0; i < n; i++) { const c = 0.8 + (L - 1.6) * (i + 0.5) / n; if (!free(c - 1.2, c + 1.2) || top - y0 < 3.4) continue; holes.push([c - 1.2, c + 1.2, y0 + 1.0, y0 + 2.7]); units.push([c - 1.2, c + 1.2, y0 + 1.0, y0 + 2.7, 1.2]); } }
  const m = mat(ctx, two ? MAT.charcoal : MAT.blockWhite); cutRects(L, y0 - 0.9, top, holes, (a, b, c, d) => wallRect(m, F, a, b, c, d, 0, [o.uOff + a, c, o.uOff + b, d])); m.setColor(1, 1, 1);
  if (o.kind === 'lib2' && L > 6) { const cd = mat(ctx, MAT.cedar); wallRect(cd, F, 0.4, L - 0.4, y0 + 3.75, y0 + 5.05, 0.03, [o.uOff, 0, o.uOff + L, 1.3]); fbox(cd, F, 0.4, L - 0.4, y0 + 3.75, y0 + 5.05, 0, 0.03, 1, 0, 'stb'); cd.setColor(1, 1, 1); }
  for (const [a, b, c, d, mod] of units) ribbon(ctx, F, a, b, c, d, { frame: 'blackMetal', module: mod, depth: 0.18 });
  for (const d of doors) door(ctx, F, d.u, y0, { frame: 'blackMetal', ...d });
  fbox(B.v(two ? 'blackMetal' : 'frameAlu'), F, -0.06, L + 0.06, top - 0.16, top, -0.02, 0.08, 1, 0, 'fstb');
}

export function buildCivic(ctx) {
  const { B } = ctx; const blocks = civicBlocks(); const rnd = mulberry32(2500);
  const doorsW = [...CIVIC_DOORS.map(([u, v, o]) => ({ p: CW(u, v), o: o || {} })), ...CIVIC_DOORS_W.map(([x, z, o]) => ({ p: [x, z], o: o || {} }))];
  const onWall = (F) => doorsW.map((d) => { const du = (d.p[0] - F.ax) * F.tx + (d.p[1] - F.az) * F.tz, dn = (d.p[0] - F.ax) * F.nx + (d.p[1] - F.az) * F.nz; return Math.abs(dn) < 1.6 && du > 1.2 && du < F.L - 1.2 ? { u: du, ...d.o } : null; }).filter(Boolean);
  const flat = blocks.filter((b) => b.kind !== 'annex'), annex = blocks.filter((b) => b.kind === 'annex');
  const edges = buildBlocks(ctx, flat, { id: 'civic', bottom: -0.6, floor: (F) => Math.max(LIB_FLOOR, groundAt(ctx, F) + 0.02), floorOf: () => LIB_FLOOR, floorMax: true,
    top: (b) => b.deck + (MLACAK.has(b.kind) ? 0.12 : 0.3), tint: (b) => (MLACAK.has(b.kind) ? [0.95, 0.45, 0.36] : [1.85, 1.82, 1.7]), parapetMat: (b) => (MLACAK.has(b.kind) ? MAT.shake : 'alu'),
    step: (F, y0, top, { block: b, uOff }) => { const m = mat(ctx, MLACAK.has(b.kind) ? MAT.shake : b.kind === 'lib1' ? MAT.blockWhite : MAT.charcoal); wallRect(m, F, 0, F.L, y0, top, 0, [uOff, y0, uOff + F.L, top]); m.setColor(1, 1, 1); },
    wall: (F, y0, top, { block: b, uOff }) => { const doors = onWall(F);
      if (MLACAK.has(b.kind)) { if (top - y0 < 2.6) { const m = mat(ctx, MAT.mlacakWall); wallRect(m, F, 0, F.L, y0 - 0.9, top, 0, [uOff, y0, uOff + F.L, top]); m.setColor(1, 1, 1); return false; } shakeWall(ctx, F, y0, top, { uOff, doors, base: b.kind === 'low' ? 2.3 : 2.45 }); return doors.length > 0; }
      const mx = F.ax + F.tx * F.L / 2, mz = F.az + F.tz * F.L / 2; const faces = F.nx * UX + F.nz * UZ;   // > 0: the forecourt side (north-east)
      libWall(ctx, F, y0, top, { kind: b.kind, uOff, doors, glazed: b.kind === 'lib2' && faces > 0.5, blank: ctx.groundY(mx + F.nx, mz + F.nz) > y0 + 0.4 }); return true; } });
  // the annex: pale walls under grey-shingled hips, the verdigris cupola over its entrance
  for (const b of annex) { const ring = b.ring; const g = Math.max(...ring.map((p) => ctx.groundY(p[0], p[1]))); const eave = Math.max(g + 2.7, 4.6), rise = 3.3; const w = mat(ctx, MAT.blockWhite);
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; if (flat.some((f) => pointInRing((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, offsetRing(f.ring, 0.4)))) continue; w.wall(p[0], p[1], q[0], q[1], g - 2.6, eave, 1); (ctx.walls = ctx.walls || []).push({ id: 'civic:annex', a: p, b: q, floor: g, top: eave, open: false }); }
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
