// Earl of March Secondary School: the 1971 building and the 2015 grades 7-8 wing as roof blocks (blocks.js: the one OSM
// footprint split along the lidar roof levels by tools/blocks.py), and the portable classrooms west of it.
// Every block is a prism up to its measured deck with a parapet; each ring edge is an outside wall (the school's own wall
// kit, kit.js), a step up from a lower roof, or nothing (the neighbour is as high or higher).
import { pointInRing, mulberry32 } from '../../world/util.js';
import { roofUnit, wallLadder } from '../../world/facade.js';
import { minAreaOBB, hipRoof, wallDecal } from '../marin/kit.js';
import { SCHOOL_BLOCKS, SCHOOL_RING } from './blocks.js';
import { MAT, mat, brick, hasPack, bayWall, boxWall, newWall, fascia, door, ribbon, glass, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, SW, SUV, SCHOOL_ROT, SCHOOL_ID, ROOF_BROWN, ROOF_GREY, ROOF_DARK, BRICK_S, PO, centroid } from './kit.js';

export const FLOOR = 0.0;       // the school's ground-floor datum (lidar: the ground 2 m outside its walls is -0.18 .. +0.13)
const PAR = 0.38;               // parapet above the deck
// What stands where on the outside walls (from the 3D-tiles obliques and Street View; positions in the building frame
// u, v: see kit.js SW). Matched to an edge by the nearest point within `r` metres of the wall line.
//   kind: 'bay' (classroom wall) | 'box' (blank brick) | 'new' ; ground: 'strip' | 'glass' | 'none' ; doors: [[u, v, opts]]
export const WALL_SPEC = [
  { at: [17.7, -22], kind: 'bay', ground: 'glass' },      // the main entrance front in the notch between the north wing and the east block (salmon pavers in front of it)
  { at: [45, 10], kind: 'bay', ground: 'glass' },         // the east block's two-storey glazed front on the bus loop (Street View e3)
];
// Every door (rule F47), WORLD [x, z, opts], on the wall it is nearest to: the main entrance (wide, under a precast canopy), the
// grades 7-8 entrance on the low block, and one exit per wing where the tiles / Street View show a door or a worn path to one.
export const DOORS = [
  [80.0, -14.7, { w: 3.8, canopy: { w: 9, d: 3.2 }, id: 'main' }], [159.2, 33.0, { w: 3.8, canopy: { w: 7, d: 2.6 }, id: 'grades 7-8' }],
  [53.2, -49.6, { id: 'north-east' }], [11.5, -49.0, { id: 'north' }], [7.0, -12.9, { id: 'west' }], [35.1, 30.0, { id: 'south-west' }],
  [72.7, 56.8, { id: 'gym', solid: true, w: 1.9 }], [79.8, 74.3, { id: 'yard' }], [113.5, 86.3, { id: 'south yard' }], [151.0, 64.1, { id: 'south-east' }], [134.2, -2.4, { id: 'east', solid: true }],
];
// roof ladders, WORLD [x, z]: on clear outside wall (snapped to the nearest wall) and between roofs (snapped to the nearest step)
export const SOLAR = [[-34.5, -98, -17.5, -74], [-37, -40, -29.5, -10], [-34, -4, -6, 9], [6, 47.5, 30, 78], [-36, 43.5, -8, 46.8], [-8, 56, -2, 69]];
export const LADDERS = [[66.0, 50.3], [39.0, -64.6], [121.5, 78.8]];
export const ROOF_LADDERS = [[39.8, -9.0], [60.7, 3.6], [148.8, 37.4]];

const outFrame = (ring, i) => { const a = ring[i], b = ring[(i + 1) % ring.length]; let F = edgeFrame(a[0], a[1], b[0], b[1]); const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (pointInRing(mx + F.nx * 0.25, mz + F.nz * 0.25, ring)) F = edgeFrame(b[0], b[1], a[0], a[1]); F.i = i; return F; };
export const schoolBlocks = () => SCHOOL_BLOCKS.map((b) => ({ ...b, ring: ensureCCW(b.ring.map((p) => [p[0], p[1]])) }));
export const schoolRing = () => ensureCCW(SCHOOL_RING.map((p) => [p[0], p[1]]));

function roofTint(b) { return b.kind === 'new' || b.kind === 'low' ? ROOF_GREY : b.kind === 'pent' ? ROOF_DARK : ROOF_BROWN; }

/**
 * Builds a set of roof blocks (rings noded where they meet): solid prism to the deck, roof cover, parapets, and for every
 * ring edge either an outside wall (o.wall), a step wall up from the lower neighbour (o.step) or nothing.
 * o: { id, floor(F) -> y of the wall's foot, top(block) -> parapet top, tint(block), wall(F, y0, top, info), step(F, y0, top, info), skipRoof(block), parapetMat(block) }
 */
export function buildBlocks(ctx, blocks, o) {
  const { B } = ctx; const edgesOut = []; edgesOut.steps = [];
  for (const b of blocks) {
    const ring = b.ring, n = ring.length, deck = b.deck, top = o.top(b); let uOff = 0; const others = blocks.filter((q) => q !== b);
    B.c('concrete').prism(ring, o.bottom ?? -1.2, deck, 1, true);
    if (!(o.skipRoof && o.skipRoof(b))) { const g = mat(ctx, MAT.gravel, 1, o.tint(b)); g.poly(ring, null, deck + 0.005, (x, z) => [x / 3, z / 3]); g.setColor(1, 1, 1); }
    (ctx.buildingRings = ctx.buildingRings || []).push(ring); (ctx.flatRoofs = ctx.flatRoofs || []).push({ ring, roofY: deck, area: b.area, name: o.id + ':' + b.name });
    let fmin = Infinity, fmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const F = outFrame(ring, i); if (F.L < 0.06) continue; const mx = F.ax + F.tx * F.L / 2, mz = F.az + F.tz * F.L / 2;
      const nb = others.find((q) => pointInRing(mx + F.nx * 0.4, mz + F.nz * 0.4, q.ring)); const u0 = uOff; uOff += F.L;
      if (nb && nb.deck >= deck - 0.25) continue;
      const step = !!nb, y0 = nb ? nb.deck : o.floor(F, b); const info = { block: b, uOff: u0, nb, deck };
      if (step) { o.step(F, y0, top, info); edgesOut.steps.push({ F, b, top, deck, y0 }); } else { const open = o.wall(F, y0, top, info) !== false; fmin = Math.min(fmin, y0); fmax = Math.max(fmax, y0); (ctx.walls = ctx.walls || []).push({ id: o.id + ':' + b.name, a: [F.ax, F.az], b: [F.ax + F.tx * F.L, F.az + F.tz * F.L], floor: y0, top, open }); edgesOut.push({ F, b, top, deck, y0 }); }
      if (top - deck > 0.05) { const pm = o.parapetMat ? o.parapetMat(b) : null; const pt = pm === 'alu' ? B.v('frameAlu') : mat(ctx, pm || MAT.precast, 0.92);
        quadFacing(pt, F.P(0, top, 0), F.P(F.L, top, 0), F.P(F.L, top, -0.3), F.P(0, top, -0.3), [0, 1, 0]);
        quadFacing(pm === 'alu' ? B.v('frameAlu') : mat(ctx, pm || MAT.precast, 0.75), F.P(0, deck, -0.3), F.P(F.L, deck, -0.3), F.P(F.L, top, -0.3), F.P(0, top, -0.3), [-F.nx, 0, -F.nz]);
        const pc = F.P(F.L / 2, (deck + top) / 2, -0.15); B.c('concrete').box(pc[0], pc[1], pc[2], F.L, top - deck, 0.3, F.rotY); }
    }
    (ctx.footprints = ctx.footprints || []).push({ id: o.id + ':' + b.name, ring, roof: deck, floor: Number.isFinite(fmin) ? (o.floorMax ? fmax : fmin) : (o.floorOf ? o.floorOf(b) : 0) });
  }
  B.v('stucco', true).setColor(1, 1, 1);
  return edgesOut;
}
export function roofPlant(ctx, blocks, rnd, rot, ok = () => true) {
  for (const b of blocks) { if (b.area < 500 || !ok(b)) continue; const ring = b.ring, o = minAreaOBB(ring); let k = 0;
    for (let t = 0; t < 80 && k < Math.min(5, Math.round(b.area / 900) + 1); t++) { const u = o.u0 + 4 + rnd() * (o.u1 - o.u0 - 8), v = o.v0 + 4 + rnd() * (o.v1 - o.v0 - 8); const x = u * o.tx - v * o.tz, z = u * o.tz + v * o.tx;
      if (![[0, 0], [3.4, 0], [-3.4, 0], [0, 3.4], [0, -3.4]].every(([dx, dz]) => pointInRing(x + dx, z + dz, ring))) continue; if ((ctx.roofClear || []).some((c) => Math.hypot(c[0] - x, c[1] - z) < c[2])) continue;
      ctx.onGround([x, z], () => roofUnit(ctx, x, 0, z, rot, rnd), { mode: b.deck }); (ctx.roofClear = ctx.roofClear || []).push([x, z, 9]); k++; } }
}
/** Wall ladder at world point p snapped onto the nearest outside wall of `edges` (from the wall's foot to its parapet). */
export function ladderAt(ctx, edges, p, out = PO + 0.02) { let best = null;
  for (const e of edges) { const F = e.F; const du = (p[0] - F.ax) * F.tx + (p[1] - F.az) * F.tz, dn = Math.abs((p[0] - F.ax) * F.nx + (p[1] - F.az) * F.nz); if (du > 0.8 && du < F.L - 0.8 && dn < 2.5 && (!best || dn < best.dn)) best = { F, du, dn, e }; }
  if (!best) { console.warn('[earlofmarch] ladder off the walls', p); return null; } const q = best.F.P(best.du, 0, out);
  ctx.onGround([q[0], q[2]], () => wallLadder(ctx, q[0], q[2], best.F.nx, best.F.nz, best.e.top - best.e.y0), { mode: best.e.y0 }); return q; }

export function buildSchool(ctx) {
  const { B } = ctx; const blocks = schoolBlocks(); const rnd = mulberry32(1971);
  const doorsW = DOORS.map(([x, z, o]) => ({ p: [x, z], o: o || {} }));
  const isNew = (b) => b.kind === 'new' || b.kind === 'low';
  const edgesOut = buildBlocks(ctx, blocks, { id: 'school', bottom: FLOOR - 0.8, floor: () => FLOOR, top: (b) => b.deck + (b.kind === 'pent' ? 0.9 : PAR), tint: roofTint, parapetMat: (b) => (isNew(b) ? 'alu' : null),
    step: (F, y0, top, { block: b, uOff: u0 }) => {
      if (isNew(b)) { const bk = mat(ctx, MAT.brickNew); wallRect(bk, F, 0, F.L, y0, top - 0.22, 0, [u0 * BRICK_S, y0 * BRICK_S, (u0 + F.L) * BRICK_S, (top - 0.22) * BRICK_S]); bk.setColor(1, 1, 1); fbox(B.v('frameAlu'), F, -0.08, F.L + 0.08, top - 0.22, top, -0.02, 0.1, 1, 0, 'fstb'); }
      else boxWall(ctx, F, y0, top, { uOff: u0, step: true, skin: b.kind === 'old' ? 'brick' : 'precast', fascia: b.kind === 'old' ? Math.min(0.6, top - y0) : 0.9 }); },
    wall: (F, y0, top, { block: b, uOff: u0 }) => {
      const doors = doorsW.map((d) => { const du = (d.p[0] - F.ax) * F.tx + (d.p[1] - F.az) * F.tz, dn = (d.p[0] - F.ax) * F.nx + (d.p[1] - F.az) * F.nz; return Math.abs(dn) < 1.6 && du > 0.9 && du < F.L - 0.9 ? { u: du, ...d.o } : null; }).filter(Boolean);
      const spec = WALL_SPEC.find((s) => { const p = SW(s.at[0], s.at[1]); const du = (p[0] - F.ax) * F.tx + (p[1] - F.az) * F.tz, dn = (p[0] - F.ax) * F.nx + (p[1] - F.az) * F.nz; return Math.abs(dn) < (s.r || 1.6) && du > -0.5 && du < F.L + 0.5; });
      const kind = (spec && spec.kind) || (isNew(b) ? 'new' : b.kind === 'old' ? 'bay' : 'box'); const o = { uOff: u0, doors, ...(spec || {}) };
      if (kind === 'new') newWall(ctx, F, y0, top, o); else if (kind === 'bay' && F.L > 4.2) bayWall(ctx, F, y0, top, o); else { boxWall(ctx, F, y0, top, { ...o, skin: b.kind === 'pent' ? 'precast' : o.skin }); return doors.length > 0; }
      return true; } });
  for (const p of [...LADDERS, ...ROOF_LADDERS]) (ctx.roofClear = ctx.roofClear || []).push([p[0], p[1], 10]);   // no plant where a ladder lands (the trap sweep wedged a jumper between a unit and the parapet there)
  // solar arrays (nadir tiles; rule F35: geometry on a plain roof cover, no photo): [u0, v0, u1, v1] in the building frame
  for (const [u0, v0, u1, v1] of SOLAR) { const c = SW((u0 + u1) / 2, (v0 + v1) / 2); const blk = blocks.find((q) => pointInRing(c[0], c[1], q.ring)); if (!blk) continue; const y = blk.deck + 0.3;
    const rows = Math.max(1, Math.round((v1 - v0) / 3.4)); for (let r = 0; r < rows; r++) { const va = v0 + (v1 - v0) * r / rows + 0.35, vb = v0 + (v1 - v0) * (r + 1) / rows - 0.35; const n = Math.max(1, Math.round((u1 - u0) / 1.05));
      const p = [SW(u0, va), SW(u1, va), SW(u1, vb), SW(u0, vb)]; quadFacing(B.v('solar'), [p[0][0], y - 0.12, p[0][1]], [p[1][0], y - 0.12, p[1][1]], [p[2][0], y + 0.2, p[2][1]], [p[3][0], y + 0.2, p[3][1]], [0, 1, 0], [[0, 0], [n, 0], [n, 2], [0, 2]]);
      const m = SW((u0 + u1) / 2, (va + vb) / 2); B.v('frame').box(m[0], blk.deck + 0.14, m[1], u1 - u0, 0.28, 0.12, SCHOOL_ROT); }
    for (let u = u0 + 4; u < u1; u += 8) for (let v = v0 + 4; v < v1; v += 8) { const q = SW(u, v); (ctx.roofClear = ctx.roofClear || []).push([q[0], q[1], 8]); } }
  roofPlant(ctx, blocks, rnd, SCHOOL_ROT, (b) => b.kind !== 'pent');
  ctx.schoolEdges = edgesOut;
  for (const p of LADDERS) ladderAt(ctx, edgesOut, p);
  for (const p of ROOF_LADDERS) ladderAt(ctx, edgesOut.steps, p, 0.06);
}

// ------------------------------------------------------------------------------------------ portable classrooms
// 31 OSM footprints (building=portable_classroom), ~6.1 x 12 m, lidar eave 3.3-3.6 m: beige vertical siding, a low
// red-brown ribbed metal gable roof, a door with a small landing on the side that faces the walk between the rows.
export function buildPortables(ctx) {
  const { B, data, gen } = ctx; const list = data.buildings.filter((b) => b.tags.building === 'portable_classroom');
  const rings = list.map((b) => ensureCCW(b.outer[0]));
  list.forEach((b, k) => {
    const ring = rings[k], info = gen.buildings[String(b.id)] || { h: 3.4, top: 3.4, g: [0, 0, 0] }; const o = minAreaOBB(ring); if (!o) return;
    const base = ctx.groundY ? Math.max(...ring.map((p) => ctx.groundY(p[0], p[1]))) : 0; const eave = base + 3.15, rise = 0.75;
    const sd = mat(ctx, MAT.siding);
    for (let i = 0; i < ring.length; i++) { const F = outFrame(ring, i); if (F.L < 0.1) continue; const long = F.L > 8;
      const holes = []; const others = rings.some((r, j) => j !== k && pointInRing(F.ax + F.tx * F.L / 2 + F.nx * 0.6, F.az + F.tz * F.L / 2 + F.nz * 0.6, r));
      const mx = F.ax + F.tx * F.L / 2 + F.nx * 2.2, mz = F.az + F.tz * F.L / 2 + F.nz * 2.2; const paved = ctx.surfaceAt(mx, mz) !== 'grass';
      let hasDoor = false;
      if (long && !others) { const u1 = F.L * 0.28, u2 = F.L * 0.72; holes.push([u1 - 0.75, u1 + 0.75, base + 1.25, base + 2.45], [u2 - 0.75, u2 + 0.75, base + 1.25, base + 2.45]);
        if (paved && !ring.door) { hasDoor = true; ring.door = true; holes.push([F.L / 2 - 0.5, F.L / 2 + 0.5, base + 0.18, base + 2.3]); } }
      sd.setColor(...(hasPack(ctx, MAT.siding.key) ? MAT.siding.pack : MAT.siding.flat));
      { const rects = []; const ys = [base - 0.5, eave]; void ys; const emit = (a, c, y0, y1) => wallRect(sd, F, a, c, y0, y1, 0, [a, y0, c, y1]);
        // (cutRects inline: few holes)
        const hs = holes; const yb = [base - 0.5, eave, ...hs.flatMap((h) => [h[2], h[3]])].sort((p, q) => p - q);
        for (let j = 0; j < yb.length - 1; j++) { const a = yb[j], c = yb[j + 1]; if (c - a < 0.004) continue; const ym = (a + c) / 2; const row = hs.filter((h) => h[2] < ym && h[3] > ym).sort((p, q) => p[0] - q[0]); let u = 0; for (const h of row) { if (h[0] > u) emit(u, h[0], a, c); u = h[1]; } if (F.L - u > 0.004) emit(u, F.L, a, c); } void rects; }
      for (const h of holes) { if (h[3] - h[2] > 1.8) { const fr = B.v('frame'); wallRect(fr, F, h[0], h[1], h[2], h[3], -0.06); fbox(B.v('frameAlu'), F, h[1] - 0.2, h[1] - 0.1, h[2] + 0.95, h[2] + 1.03, -0.06, 0, 1, 0, 'fstb');
          const p = F.P(F.L / 2, 0, 0.75); B.v('concrete').box(p[0], base + 0.09 - 0.2, p[2], 1.7, 0.18 + 0.4, 1.5, F.rotY, 1 / 3); B.c('concrete').box(p[0], base + 0.09 - 0.2, p[2], 1.7, 0.18 + 0.4, 1.5, F.rotY);
          const q = F.P(F.L / 2, 0, 0); (ctx.doors = ctx.doors || []).push({ id: 'portable:' + b.id, x: q[0], z: q[2], nx: F.nx, nz: F.nz, y: base + 0.18, w: 1.0 }); }
        else { const fr = B.v('frameAlu'); wallRect(fr, F, h[0], h[1], h[2], h[3], -0.05); glass(ctx, F, h[0] + 0.05, h[1] - 0.05, h[2] + 0.05, h[3] - 0.05, -0.03, 1); fbox(fr, F, (h[0] + h[1]) / 2 - 0.025, (h[0] + h[1]) / 2 + 0.025, h[2], h[3], -0.05, 0.01, 1, 0, 'fs'); fbox(fr, F, h[0] - 0.05, h[1] + 0.05, h[2] - 0.06, h[2], 0, 0.04, 1, 0, 'fstb'); } }
      (ctx.walls = ctx.walls || []).push({ id: 'portable:' + b.id, a: [F.ax, F.az], b: [F.ax + F.tx * F.L, F.az + F.tz * F.L], floor: base, top: eave, open: long && !others });
    }
    sd.setColor(1, 1, 1);
    B.c('wood').prism(ring, base - 0.8, eave, 1, true);
    const rk = hasPack(ctx, MAT.portRoof.key) ? MAT.portRoof.key : 'shingles'; const tint = hasPack(ctx, MAT.portRoof.key) ? [1, 1, 1] : [6.0, 2.6, 1.9];
    hipRoof(ctx, o, eave, rise, { gable: true, overhang: 0.25, bucket: rk, tint, gableBucket: hasPack(ctx, MAT.siding.key) ? MAT.siding.key : 'stucco', gableTint: hasPack(ctx, MAT.siding.key) ? MAT.siding.pack : MAT.siding.flat, fill: true, caps: false });
    (ctx.buildingRings = ctx.buildingRings || []).push(ring); (ctx.footprints = ctx.footprints || []).push({ id: 'portable:' + b.id, ring, roof: eave, floor: base }); void info;
  });
  B.v('stucco', true).setColor(1, 1, 1);
}
export { outFrame, PAR };
void fascia; void door; void ribbon; void brick; void wallDecal; void SUV; void SCHOOL_ID; void centroid;
