// Earl of March Secondary School: the 1971 building and the 2015 grades 7-8 wing as roof blocks (blocks.js: the one OSM
// footprint split along the lidar roof levels by tools/blocks.py), and the portable classrooms west of it.
// Every block is a prism up to its measured deck with a parapet; each ring edge is an outside wall (the school's own wall
// kit, kit.js), a step up from a lower roof, or nothing (the neighbour is as high or higher).
import { pointInRing, mulberry32, makeCanvas, canvasTexture } from '../../world/util.js';
import { roofUnit, wallLadder } from '../../world/facade.js';
import { minAreaOBB, hipRoof, wallDecal } from '../marin/kit.js';
import { SCHOOL_BLOCKS, SCHOOL_RING } from './blocks.js';
import { curtainWall, portalWall, entryWall, slotWall } from './kit.js';
import { MAT, mat, brick, hasPack, bayWall, boxWall, newWall, fascia, door, ribbon, glass, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, SW, SUV, SCHOOL_ROT, SCHOOL_ID, ROOF_BROWN, ROOF_GREY, ROOF_DARK, BRICK_S, PO, centroid } from './kit.js';
void ROOF_DARK;

export const FLOOR = 0.0;       // the school's ground-floor datum (lidar: the ground 2 m outside its walls is -0.18 .. +0.13)
const PAR = 0.38;               // parapet above the deck
// What stands where on the outside walls (from the 3D-tiles obliques and Street View; positions in the building frame
// u, v: see kit.js SW). Matched to an edge by the nearest point within `r` metres of the wall line.
//   kind: 'bay' (classroom wall) | 'box' (blank brick) | 'new' ; ground: 'strip' | 'glass' | 'none' ; doors: [[u, v, opts]]
export const WALL_SPEC = [
  { at: [17.7, -22], kind: 'bay', ground: 'glass' },      // the main entrance front in the notch between the north wing and the east block (salmon pavers in front of it)
  // blank brick boxes under the precast fascia (gyms / auditorium): WORLD points on the wall
  { atW: [101.8, -8.4], kind: 'box' },                    // the east block's north wall: blank brick with the crest (Street View d_main, n6)
  { atW: [115.4, -10.7], kind: 'box' }, { atW: [123.5, -7.9], kind: 'box' }, { atW: [134.2, -2.4], kind: 'box' },   // the east block's bus-loop side (e1, e2, d_east): brick and precast boxes round a recessed entrance
  { atW: [72.7, 56.8], kind: 'box', slots: [{ u: 3.2, w: 1.6, dark: true }] },   // the gym wall on the south-west yard (w1): blank brick, one steel door, a dark glazed slot at the inside corner
  // (fix round 1) the 2015 wing's south front, wall by wall (Street View f_78a, tiles to_78s / to_78pav; kit.js): slotsW / bandsW = WORLD points on the wall
  { atW: [113.5, 86.3], kind: 'curtain' },                                        // the long wall on the play yard: the green curtain-wall band between brick piers
  { atW: [131.97, 71.74], kind: 'portal' },                                       // the glazed box in its silver portal frame, 2 m proud of that wall
  { atW: [137.97, 71.27], kind: 'entry' },                                        // the corner beside it: the grades 7-8 entrance under its canopy and oriel
  { atW: [151.1, 64.1], kind: 'slots', slotsW: [[144.2, 70.6, 2.0], [159.7, 56.1, 2.4]], bandsW: [[148.0, 67.0, 3.5]] },   // the east part: brick, two tall green slots, a pale panel band
];
// Every door (rule F47), WORLD [x, z, opts], on the wall it is nearest to: the main entrance (wide, under a precast canopy), the
// grades 7-8 entrance on the low block, and one exit per wing where the tiles / Street View show a door or a worn path to one.
export const DOORS = [
  [80.0, -14.7, { w: 3.8, id: 'main' }],                                        // Street View d_main / d_78: dark doors in the glazed ground storey behind the salmon pavers
  // (fix round 1) the grades 7-8 entrance is in the corner beside the glazed box on the south front (Street View f_78a: dark doors under the canopy; tiles: the
  // paved forecourt in front of it), not in the middle of the low block's lawn side, where the tiles show grass against the wall; the low block's own
  // door is at the end of the wall that faces the paver forecourt (tiles to_lowend).
  [137.97, 71.27, { w: 3.8, canopy: { w: 6.4, d: 2.4, y: 3.12 }, id: 'grades 7-8' }],
  [163.25, 48.55, { id: 'grades 7-8 east' }],
  [72.7, 56.8, { id: 'gym', solid: true, w: 1.9 }],                             // Street View w1: a single steel door in the gym wall on the south-west yard
  [134.2, -2.4, { id: 'east' }],                                                // Street View d_east: the recessed glazed entrance of the east block
];
// (round 2: seven more doors had been placed "one per wing"; no Street View frame or tiles view shows them (d_ne / d_main2 show the north-east
// face without one), so they are gone: rule F47, every door is real or removed.)
// roof ladders, WORLD [x, z]: on clear outside wall (snapped to the nearest wall) and between roofs (snapped to the nearest step)
// solar arrays, [u0, v0, u1, v1] in the building frame, read off nadir tiles with the frame's grid drawn on them (fix round 1: ref_r1..r3_uv): the north-west
// wing, the strip beside RB, midC, the whole gym roof, and six groups on the 2015 wing. Rows run along u, 2 m apart, tilted to the south-east.
export const SOLAR = [[-34.5, -98, -17.5, -74], [-37, -40, -29.5, -10], [-34, -4, -6, 9], [-34.5, 12, -4.5, 39.5],
  [20, 48.5, 30, 57], [10.5, 61, 30.5, 77], [-7, 58.5, -0.5, 69], [-29.5, 47.5, -17, 53.5], [-26, 58, -17, 68.5], [-42.5, 57, -32.5, 68]];
// glazed ridge skylights on the 2015 wing (the strip the first pass drew as a solar array), [u0, v0, u1, v1], and one pyramid [u, v, half]
export const SKYLIGHTS = [[-36, 43.5, -27, 46.7], [-24.5, 43.5, -14.5, 46.7], [-12.5, 43.5, -8, 46.7]];
export const PYRAMID = [9, 43.6, 1.6];
export const LADDERS = [[79.6, 64.6], [39.0, -64.6], [125.0, 75.5]];   // (fix round 1: the third stood on the curtain-wall band; it is on the brick pier at that wall's east end now)
export const ROOF_LADDERS = [[39.8, -9.0], [60.7, 3.6], [148.8, 37.4]];

const outFrame = (ring, i) => { const a = ring[i], b = ring[(i + 1) % ring.length]; let F = edgeFrame(a[0], a[1], b[0], b[1]); const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (pointInRing(mx + F.nx * 0.25, mz + F.nz * 0.25, ring)) F = edgeFrame(b[0], b[1], a[0], a[1]); F.i = i; return F; };
export const schoolBlocks = () => SCHOOL_BLOCKS.map((b) => ({ ...b, ring: ensureCCW(b.ring.map((p) => [p[0], p[1]])) }));
export const schoolRing = () => ensureCCW(SCHOOL_RING.map((p) => [p[0], p[1]]));

// Roof cover per block, each checked on a nadir tiles shot (rule F56; fix round 1): the 1971 roofs are dark red-brown ballast, EXCEPT the gym and the strip
// between the gym and the east block (kind 'oldW': re-roofed in white membrane, the gym under one large solar array); the 2015 wing and its low block are white
// membrane; the east block's penthouse is brown like the roof round it.
const isOld = (b) => b.kind === 'old' || b.kind === 'oldW';
function roofTint(b) { return b.kind === 'new' || b.kind === 'low' || b.kind === 'oldW' ? ROOF_GREY : ROOF_BROWN; }

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
      // a low step between two roofs (under 0.9 m) is a plain curb at the upper deck: with a parapet on it the step is a 1 m wall across the roof
      if (step && deck - nb.deck < 0.9) { o.step(F, y0, deck + 0.02, info); edgesOut.steps.push({ F, b, top: deck, deck, y0 }); continue; }
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
      else boxWall(ctx, F, y0, top, { uOff: u0, step: true, skin: isOld(b) ? 'brick' : 'precast', fascia: isOld(b) ? Math.min(0.6, top - y0) : 0.9 }); },
    wall: (F, y0, top, { block: b, uOff: u0 }) => {
      const doors = doorsW.map((d) => { const du = (d.p[0] - F.ax) * F.tx + (d.p[1] - F.az) * F.tz, dn = (d.p[0] - F.ax) * F.nx + (d.p[1] - F.az) * F.nz; return Math.abs(dn) < 1.6 && du > 0.9 && du < F.L - 0.9 ? { u: du, ...d.o } : null; }).filter(Boolean);
      const spec = WALL_SPEC.find((s) => { const p = s.atW || SW(s.at[0], s.at[1]); const du = (p[0] - F.ax) * F.tx + (p[1] - F.az) * F.tz, dn = (p[0] - F.ax) * F.nx + (p[1] - F.az) * F.nz; return Math.abs(dn) < (s.r || 1.6) && du > -0.5 && du < F.L + 0.5; });
      const kind = (spec && spec.kind) || (isNew(b) ? 'new' : isOld(b) ? 'bay' : 'box'); const o = { uOff: u0, doors, ...(spec || {}) };
      if (o.slotsW) o.slots = o.slotsW.map(([x, z, w]) => ({ u: (x - F.ax) * F.tx + (z - F.az) * F.tz, w, y0: 0.8, y1: 7.6 }));
      if (o.bandsW) o.bands = o.bandsW.map(([x, z, w]) => { const u = (x - F.ax) * F.tx + (z - F.az) * F.tz; return [u - w / 2, u + w / 2]; });
      if (kind === 'curtain') curtainWall(ctx, F, y0, top, o); else if (kind === 'portal') portalWall(ctx, F, y0, top, o); else if (kind === 'entry') entryWall(ctx, F, y0, top, o); else if (kind === 'slots') slotWall(ctx, F, y0, top, o);
      else if (b.kind === 'low' && !spec) { const n = Math.max(0, Math.round((F.L - 3) / 6.2)); slotWall(ctx, F, y0, top, { ...o, slots: Array.from({ length: n }, (_, i) => ({ u: 1.5 + (F.L - 3) * (i + 0.5) / n, w: 1.3, y0: 0.9, y1: 3.7 })) }); }   /* (tiles to_lowend / to_lowne: the low block is brick with a few narrow green windows, not white panel bays) */
      else if (kind === 'new') newWall(ctx, F, y0, top, o); else if (kind === 'bay' && F.L > 4.2) bayWall(ctx, F, y0, top, o); else { boxWall(ctx, F, y0, top, { ...o, skin: b.kind === 'pent' ? 'precast' : o.skin }); return doors.length > 0; }
      return true; } });
  for (const p of [...LADDERS, ...ROOF_LADDERS]) (ctx.roofClear = ctx.roofClear || []).push([p[0], p[1], 10]);   // no plant where a ladder lands (the trap sweep wedged a jumper between a unit and the parapet there)
  // solar arrays (nadir tiles; rule F35: geometry on a plain roof cover, no photo): [u0, v0, u1, v1] in the building frame
  for (const [u0, v0, u1, v1] of SOLAR) { const c = SW((u0 + u1) / 2, (v0 + v1) / 2); const blk = blocks.find((q) => pointInRing(c[0], c[1], q.ring)); if (!blk) continue; const d = blk.deck;
    // tilted racks (fix round 1): one row every 2 m, a 1.45 m panel from 0.16 m at its south-east edge up to 0.5 m (the map check wants solid within reach under every up-facing face: the deck), on a dark frame with a closed back
    const rows = Math.max(1, Math.round((v1 - v0) / 2.0)), pitch = (v1 - v0) / rows; const n = Math.max(1, Math.round((u1 - u0) / 1.05)); const fr = B.v('frame');
    for (let r = 0; r < rows; r++) { const va = v0 + pitch * r + 0.2, vb = va + Math.min(1.45, pitch - 0.4);
      const p = [SW(u0, va), SW(u1, va), SW(u1, vb), SW(u0, vb)]; const hi = (q) => [q[0], d + 0.5, q[1]], lo = (q) => [q[0], d + 0.16, q[1]], ft = (q) => [q[0], d, q[1]];
      quadFacing(B.v('solar'), hi(p[0]), hi(p[1]), lo(p[2]), lo(p[3]), [0, 1, 0], [[0, 0], [n, 0], [n, 2], [0, 2]]);
      quadFacing(fr, hi(p[0]), hi(p[1]), lo(p[2]), lo(p[3]), [0, -1, 0]);                                   // underside
      const back = [-(p[3][0] - p[0][0]), 0, -(p[3][1] - p[0][1])]; quadFacing(fr, ft(p[0]), ft(p[1]), hi(p[1]), hi(p[0]), back);   // the rack's back
      quadFacing(fr, ft(p[3]), ft(p[2]), lo(p[2]), lo(p[3]), [-back[0], 0, -back[2]]);                       // ... and its low front rail
      for (const [a, b2] of [[p[0], p[3]], [p[1], p[2]]]) { fr.tri(ft(a), hi(a), lo(b2)); fr.tri(lo(b2), hi(a), ft(a)); fr.tri(ft(a), lo(b2), ft(b2)); fr.tri(ft(b2), lo(b2), ft(a)); } }   // end cheeks
    for (let u = u0 + 4; u < u1; u += 8) for (let v = v0 + 4; v < v1; v += 8) { const q = SW(u, v); (ctx.roofClear = ctx.roofClear || []).push([q[0], q[1], 8]); }
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [(u0 + u1) / 2, (v0 + v1) / 2]]) { const q = SW(u, v); ctx.roofClear.push([q[0], q[1], 6]); } }
  // skylights: a glazed gable ridge on a white kerb; a glass pyramid
  { const gl = B.v('eomGlassGreen'), wp = B.v('whitePanel'); const add = blocks.find((q) => q.name === 'add'); const d = add ? add.deck : 9.3;
    for (const [u0, v0, u1, v1] of SKYLIGHTS) { const vm = (v0 + v1) / 2; const P = (u, v, y) => { const q = SW(u, v); return [q[0], d + y, q[1]]; };
      for (const [a, b2, c2, e] of [[[u0, v0], [u1, v0], [u1, v0], [u0, v0]], [[u1, v1], [u0, v1], [u0, v1], [u1, v1]], [[u0, v1], [u0, v0], [u0, v0], [u0, v1]], [[u1, v0], [u1, v1], [u1, v1], [u1, v0]]]) { const A = P(a[0], a[1], 0), Bq = P(b2[0], b2[1], 0), C = P(c2[0], c2[1], 0.45), D = P(e[0], e[1], 0.45); const m = SW((u0 + u1) / 2, vm); quadFacing(wp, A, Bq, C, D, [(A[0] + Bq[0]) / 2 - m[0], 0, (A[2] + Bq[2]) / 2 - m[1]]); }
      quadFacing(gl, P(u0, v0, 0.45), P(u1, v0, 0.45), P(u1, vm, 1.35), P(u0, vm, 1.35), [0, 1, 0]); quadFacing(gl, P(u1, v1, 0.45), P(u0, v1, 0.45), P(u0, vm, 1.35), P(u1, vm, 1.35), [0, 1, 0]);
      for (const u of [u0, u1]) { gl.tri(P(u, v0, 0.45), P(u, v1, 0.45), P(u, vm, 1.35)); gl.tri(P(u, v1, 0.45), P(u, v0, 0.45), P(u, vm, 1.35)); }
      const c = SW((u0 + u1) / 2, vm); B.c('metal').box(c[0], d + 0.5, c[1], u1 - u0, 1.0, v1 - v0, SCHOOL_ROT); for (let u = u0; u <= u1; u += 3) { const q = SW(u, vm); ctx.roofClear.push([q[0], q[1], 6]); } }
    { const [u, v, h] = PYRAMID; const P = (du, dv, y) => { const q = SW(u + du, v + dv); return [q[0], d + y, q[1]]; }; const apex = P(0, 0, 1.9); const cs = [[-h, -h], [h, -h], [h, h], [-h, h]];
      for (let k = 0; k < 4; k++) { const a = cs[k], b2 = cs[(k + 1) % 4]; quadFacing(wp, P(a[0], a[1], 0), P(b2[0], b2[1], 0), P(b2[0], b2[1], 0.4), P(a[0], a[1], 0.4), [P(a[0], a[1], 0)[0] + P(b2[0], b2[1], 0)[0] - 2 * apex[0], 0, P(a[0], a[1], 0)[2] + P(b2[0], b2[1], 0)[2] - 2 * apex[2]]); gl.tri(P(a[0], a[1], 0.4), P(b2[0], b2[1], 0.4), apex); gl.tri(P(b2[0], b2[1], 0.4), P(a[0], a[1], 0.4), apex); }
      const c = SW(u, v); B.c('metal').box(c[0], d + 0.7, c[1], h * 2, 1.4, h * 2, SCHOOL_ROT); ctx.roofClear.push([c[0], c[1], 7]); } }
  roofPlant(ctx, blocks, rnd, SCHOOL_ROT, (b) => b.kind !== 'pent');
  ctx.schoolEdges = edgesOut;
  // the school crest: a round medallion on the brick beside the main entrance (Street View d_main, n6: on the east block's north wall). An original
  // drawing in the school's green and gold (a lion's mane as a rayed disc); the real wall carries no lettering, so none is drawn.
  { const e = edgesOut.find((q) => Math.abs(q.F.ax + q.F.tx * q.F.L / 2 - 101.8) < 3 && Math.abs(q.F.az + q.F.tz * q.F.L / 2 + 8.4) < 3);
    if (e) { const c = makeCanvas(256, 256), g = c.getContext('2d'); g.clearRect(0, 0, 256, 256); g.fillStyle = '#c9a23a'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.fillStyle = '#0d3b24'; g.beginPath(); g.arc(128, 128, 104, 0, 7); g.fill();
      g.fillStyle = '#d9b246'; g.beginPath(); for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, r = k % 2 ? 58 : 84; g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.closePath(); g.fill(); g.fillStyle = '#0d3b24'; g.beginPath(); g.arc(128, 132, 40, 0, 7); g.fill();
      g.fillStyle = '#d9b246'; g.fillRect(108, 118, 14, 8); g.fillRect(134, 118, 14, 8); g.beginPath(); g.moveTo(118, 138); g.lineTo(138, 138); g.lineTo(128, 152); g.closePath(); g.fill();
      const tex = canvasTexture(c, { repeat: false, aniso: ctx.T.aniso }); wallDecal(ctx, tex, e.F, e.F.L * 0.45, FLOOR + 5.1, 1.8, 1.8, 0.03, { opaque: false }); } }
  for (const p of LADDERS) ladderAt(ctx, edgesOut, p);
  for (const p of ROOF_LADDERS) ladderAt(ctx, edgesOut.steps, p, 0.06);
}

// ------------------------------------------------------------------------------------------ portable classrooms
// 31 OSM footprints (building=portable_classroom), ~6.1 x 12 m, lidar eave 3.3-3.6 m: beige vertical siding, a low
// red-brown ribbed metal gable roof, a door with a small landing on the side that faces the walk between the rows.
const GREY_ROOFED = new Set([677120890]);   // (fix round 1) the unit behind the north wing has a pale grey roof in the tiles (ref_p5)
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
        if (paved && !ring.door) { hasDoor = true; ring.door = true; holes.push([F.L / 2 - 0.5, F.L / 2 + 0.5, base + 0.04, base + 2.2]); } }
      sd.setColor(...(hasPack(ctx, MAT.siding.key) ? MAT.siding.pack : MAT.siding.flat));
      { const rects = []; const ys = [base - 0.5, eave]; void ys; const emit = (a, c, y0, y1) => wallRect(sd, F, a, c, y0, y1, 0, [a, y0, c, y1]);
        // (cutRects inline: few holes)
        const hs = holes; const yb = [base - 0.5, eave, ...hs.flatMap((h) => [h[2], h[3]])].sort((p, q) => p - q);
        for (let j = 0; j < yb.length - 1; j++) { const a = yb[j], c = yb[j + 1]; if (c - a < 0.004) continue; const ym = (a + c) / 2; const row = hs.filter((h) => h[2] < ym && h[3] > ym).sort((p, q) => p[0] - q[0]); let u = 0; for (const h of row) { if (h[0] > u) emit(u, h[0], a, c); u = h[1]; } if (F.L - u > 0.004) emit(u, F.L, a, c); } void rects; }
      for (const h of holes) { if (h[3] - h[2] > 1.8) { const fr = B.v('frame'); wallRect(fr, F, h[0], h[1], h[2], h[3], -0.06); fbox(B.v('frameAlu'), F, h[1] - 0.2, h[1] - 0.1, h[2] + 0.95, h[2] + 1.03, -0.06, 0, 1, 0, 'fstb');
          const p = F.P(F.L / 2, 0, 0.75); B.v('concrete').box(p[0], base + 0.04 - 0.22, p[2], 1.7, 0.44, 1.5, F.rotY, 1 / 3); /* (visual only: where the ground dips a few centimetres at the pad's outer edge a solid slab was a snag; the ground carries the player) */   /* (round 2: a flush pad; the 0.18 m slab stopped the walk test at its edge: the terrain controller's step-up wants a walkable landing normal) */
          const q = F.P(F.L / 2, 0, 0); (ctx.doors = ctx.doors || []).push({ id: 'portable:' + b.id, x: q[0], z: q[2], nx: F.nx, nz: F.nz, y: base + 0.04, w: 1.0 }); }
        else { const fr = B.v('frameAlu'); wallRect(fr, F, h[0], h[1], h[2], h[3], -0.05); glass(ctx, F, h[0] + 0.05, h[1] - 0.05, h[2] + 0.05, h[3] - 0.05, -0.03, 1); fbox(fr, F, (h[0] + h[1]) / 2 - 0.025, (h[0] + h[1]) / 2 + 0.025, h[2], h[3], -0.05, 0.01, 1, 0, 'fs'); fbox(fr, F, h[0] - 0.05, h[1] + 0.05, h[2] - 0.06, h[2], 0, 0.04, 1, 0, 'fstb'); } }
      (ctx.walls = ctx.walls || []).push({ id: 'portable:' + b.id, a: [F.ax, F.az], b: [F.ax + F.tx * F.L, F.az + F.tz * F.L], floor: base, top: eave, open: long && !others });
    }
    sd.setColor(1, 1, 1);
    B.c('wood').prism(ring, base - 0.8, eave, 1, true);
    const grey = GREY_ROOFED.has(b.id); const rk = grey ? 'stucco' : hasPack(ctx, MAT.portRoof.key) ? MAT.portRoof.key : 'shingles'; const tint = grey ? [0.42, 0.45, 0.5] : hasPack(ctx, MAT.portRoof.key) ? [1, 1, 1] : [6.0, 2.6, 1.9];
    hipRoof(ctx, o, eave, rise, { gable: true, overhang: 0.25, bucket: rk, tint, gableBucket: hasPack(ctx, MAT.siding.key) ? MAT.siding.key : 'stucco', gableTint: hasPack(ctx, MAT.siding.key) ? MAT.siding.pack : MAT.siding.flat, fill: true, caps: false });
    (ctx.buildingRings = ctx.buildingRings || []).push(ring); (ctx.footprints = ctx.footprints || []).push({ id: 'portable:' + b.id, ring, roof: eave, floor: base }); void info;
  });
  B.v('stucco', true).setColor(1, 1, 1);
}
export { outFrame, PAR };
void fascia; void door; void ribbon; void brick; void wallDecal; void SUV; void SCHOOL_ID; void centroid;
