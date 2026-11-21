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
export const WALL_SPEC = [];
export const DOORS = [];        // [u, v, { w, canopy, solid, id }]: every door the tiles / Street View show (rule F47), in the building frame
export const LADDERS = [];      // roof ladders: [u, v] on an outside wall (snapped to the nearest edge) or between two roofs

const outFrame = (ring, i) => { const a = ring[i], b = ring[(i + 1) % ring.length]; let F = edgeFrame(a[0], a[1], b[0], b[1]); const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (pointInRing(mx + F.nx * 0.25, mz + F.nz * 0.25, ring)) F = edgeFrame(b[0], b[1], a[0], a[1]); F.i = i; return F; };
export const schoolBlocks = () => SCHOOL_BLOCKS.map((b) => ({ ...b, ring: ensureCCW(b.ring.map((p) => [p[0], p[1]])) }));
export const schoolRing = () => ensureCCW(SCHOOL_RING.map((p) => [p[0], p[1]]));

function roofTint(b) { return b.kind === 'new' || b.kind === 'low' ? ROOF_GREY : b.kind === 'pent' ? ROOF_DARK : ROOF_BROWN; }

export function buildSchool(ctx) {
  const { B } = ctx; const blocks = schoolBlocks(); const rnd = mulberry32(1971);
  const doorsW = DOORS.map(([u, v, o]) => ({ p: SW(u, v), o: o || {} }));
  const edgesOut = [];   // outside wall frames (for ladders, signs)
  for (const b of blocks) {
    const ring = b.ring, n = ring.length, deck = b.deck, top = deck + (b.kind === 'pent' ? 0.9 : PAR); let uOff = 0;
    const others = blocks.filter((o) => o !== b);
    // ---- solid: the block up to its deck (cap = the roof you stand on)
    B.c('concrete').prism(ring, FLOOR - 0.8, deck, 1, true);
    { const g = mat(ctx, MAT.gravel, 1, roofTint(b)); g.poly(ring, null, deck + 0.005, (x, z) => [x / 3, z / 3]); g.setColor(1, 1, 1); }
    (ctx.buildingRings = ctx.buildingRings || []).push(ring); (ctx.footprints = ctx.footprints || []).push({ id: 'school:' + b.name, ring, roof: deck, floor: FLOOR });
    (ctx.flatRoofs = ctx.flatRoofs || []).push({ ring, roofY: deck, area: b.area, name: b.name });
    for (let i = 0; i < n; i++) {
      const F = outFrame(ring, i); if (F.L < 0.06) continue; const mx = F.ax + F.tx * F.L / 2, mz = F.az + F.tz * F.L / 2;
      const nb = others.find((o) => pointInRing(mx + F.nx * 0.4, mz + F.nz * 0.4, o.ring));
      const u0 = uOff; uOff += F.L;
      if (nb && nb.deck >= deck - 0.25) continue;      // the neighbour is as high or higher: its wall (or nothing) stands here
      const y0 = nb ? nb.deck : FLOOR; const step = !!nb;
      // doors on this wall
      const doors = step ? [] : doorsW.map((d) => { const du = (d.p[0] - F.ax) * F.tx + (d.p[1] - F.az) * F.tz, dn = (d.p[0] - F.ax) * F.nx + (d.p[1] - F.az) * F.nz; return Math.abs(dn) < 1.6 && du > 0.9 && du < F.L - 0.9 ? { u: du, ...d.o } : null; }).filter(Boolean);
      const spec = step ? null : WALL_SPEC.find((s) => { const p = SW(s.at[0], s.at[1]); const du = (p[0] - F.ax) * F.tx + (p[1] - F.az) * F.tz, dn = (p[0] - F.ax) * F.nx + (p[1] - F.az) * F.nz; return Math.abs(dn) < (s.r || 1.6) && du > -0.5 && du < F.L + 0.5; });
      const kind = (spec && spec.kind) || (b.kind === 'new' || b.kind === 'low' ? 'new' : b.kind === 'old' ? 'bay' : 'box');
      const o = { uOff: u0, doors, ...(spec || {}) };
      if (step) { if (b.kind === 'new' || b.kind === 'low') { const bk = mat(ctx, MAT.brickNew); wallRect(bk, F, 0, F.L, y0, top - 0.22, 0, [u0 * BRICK_S, y0 * BRICK_S, (u0 + F.L) * BRICK_S, (top - 0.22) * BRICK_S]); bk.setColor(1, 1, 1); fbox(B.v('frameAlu'), F, -0.08, F.L + 0.08, top - 0.22, top, -0.02, 0.1, 1, 0, 'fstb'); }
        else boxWall(ctx, F, y0, top, { uOff: u0, step: true, skin: b.kind === 'old' ? 'brick' : 'precast', fascia: b.kind === 'old' ? Math.min(0.6, top - y0) : 0.9 }); }
      else if (kind === 'new') newWall(ctx, F, y0, top, o);
      else if (kind === 'bay' && F.L > 4.2) bayWall(ctx, F, y0, top, o);
      else boxWall(ctx, F, y0, top, { ...o, skin: b.kind === 'pent' ? 'precast' : o.skin });
      if (!step) { (ctx.walls = ctx.walls || []).push({ id: 'school:' + b.name, a: [F.ax, F.az], b: [F.ax + F.tx * F.L, F.az + F.tz * F.L], floor: FLOOR, top, open: kind !== 'box' }); edgesOut.push({ F, b, top, deck }); }
      // ---- parapet: inner face, top, collision
      const pt = b.kind === 'new' || b.kind === 'low' ? B.v('frameAlu') : mat(ctx, MAT.precast, 0.92);
      quadFacing(pt, F.P(0, top, 0), F.P(F.L, top, 0), F.P(F.L, top, -0.3), F.P(0, top, -0.3), [0, 1, 0]);
      quadFacing(mat(ctx, MAT.precast, 0.75), F.P(0, deck, -0.3), F.P(F.L, deck, -0.3), F.P(F.L, top, -0.3), F.P(0, top, -0.3), [-F.nx, 0, -F.nz]);
      const pc = F.P(F.L / 2, (deck + top) / 2, -0.15); B.c('concrete').box(pc[0], pc[1], pc[2], F.L, top - deck, 0.3, F.rotY);
    }
    // ---- plant on the big roofs
    if (b.area > 500 && b.kind !== 'pent') { const o = minAreaOBB(ring); let k = 0; for (let t = 0; t < 60 && k < Math.min(5, Math.round(b.area / 900) + 1); t++) { const u = o.u0 + 4 + rnd() * (o.u1 - o.u0 - 8), v = o.v0 + 4 + rnd() * (o.v1 - o.v0 - 8); const x = u * o.tx - v * o.tz, z = u * o.tz + v * o.tx;
      if (![[0, 0], [3.4, 0], [-3.4, 0], [0, 3.4], [0, -3.4]].every(([dx, dz]) => pointInRing(x + dx, z + dz, ring))) continue; if ((ctx.roofClear || []).some((c) => Math.hypot(c[0] - x, c[1] - z) < c[2])) continue; ctx.onGround([x, z], () => roofUnit(ctx, x, 0, z, SCHOOL_ROT, rnd), { mode: deck }); (ctx.roofClear = ctx.roofClear || []).push([x, z, 9]); k++; } }
  }
  B.v('stucco', true).setColor(1, 1, 1);
  ctx.schoolEdges = edgesOut;
  // ---- ladders: one on every block that has no lower neighbour to step down to, on clear wall
  for (const [u, v, kind] of LADDERS) { const p = SW(u, v); let best = null;
    for (const e of edgesOut) { const F = e.F; const du = (p[0] - F.ax) * F.tx + (p[1] - F.az) * F.tz, dn = Math.abs((p[0] - F.ax) * F.nx + (p[1] - F.az) * F.nz); if (du > 0.8 && du < F.L - 0.8 && dn < 2.5 && (!best || dn < best.dn)) best = { F, du, dn, e }; }
    if (!best) { console.warn('[earlofmarch] ladder off the walls', u, v); continue; } const q = best.F.P(best.du, 0, PO + 0.02); void kind;
    wallLadder(ctx, q[0], q[2], best.F.nx, best.F.nz, best.e.top); }
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
