// Branson-local building pieces the shared kits do not have: plain stucco blocks, arched openings, window rows, gable and
// lean-to roofs on a given axis, solar arrays on a roof slope, tile rims, free-standing name boards.
// Heights are LOCAL to the Builder (inside `sited` / `atGround` y = 0 is the floor or the ground).
import { edgeFrame, quadFacing } from '../../world/facade.js';
import { ensureCCW, wallDecal, atGround, ringKey } from '../marin/kit.js';
import { propKit } from '../../world/props.js';

const RAD = Math.PI / 180;
export const BR_CLAY = [9.5, 4.3, 2.7];        // bright terracotta barrel tile (Katharine Branson Hall, the quad): 3D tiles obliques
export const BR_TAN = [8.6, 7.3, 5.2];        // the gym's tan composition shingle
export const BR_SEAM = [6.6, 6.4, 5.9];       // the Commons: light grey standing seam
export const WHITE = [0.72, 0.71, 0.68];         // white stucco, toned down (no blown-out whites)
export const CREAM = [0.86, 0.75, 0.52];

/** Edge frames of a CCW ring whose outward normal really points out (tested against the centroid). */
export function outFrames(ringIn) {
  const ring = ensureCCW(ringIn); const out = []; const inR = (x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; let F = edgeFrame(a[0], a[1], b[0], b[1]); const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (inR(mx + F.nx * 0.25, mz + F.nz * 0.25)) F = edgeFrame(b[0], b[1], a[0], a[1]); F.i = i; out.push(F); }   // (point-in-ring, not the centroid: concave plans)
  return out;
}
/** Plain stucco block over a ring: walls y0..y1 in `color`, a flat roof (roofCol), collision. */
export function plainBlock(ctx, ring, y0, y1, color = WHITE, roofCol = [0.62, 0.62, 0.6], bucket = 'stucco') {
  const { B } = ctx; const st = B.v(bucket, true); st.setColor(...color); st.prism(ring, y0, y1, 0.45, false); st.setColor(1, 1, 1);
  if (roofCol) { B.v('paint', true).setColor(...roofCol).poly(ring, null, y1, (x, z) => [x / 3, z / 3]); B.v('paint', true).setColor(1, 1, 1); }
  B.c('concrete').prism(ring, y0, y1, 1, true);
}
/** Coloured cover on a flat roof (no satellite photo on modelled roofs, rule F35). */
export function roofCover(ctx, ring, y, color) { const pt = ctx.B.v('paint', true); pt.setColor(...color).poly(inset(ensureCCW(ring), 0.35), null, y, (x, z) => [x / 3, z / 3]); pt.setColor(1, 1, 1); }
/** True when the ground at a wall point stands above local height y (a window there would be buried). */
const buried = (ctx, F, u, y) => ctx.groundY && ctx.groundY(F.ax + F.tx * u + F.nx * 0.4, F.az + F.tz * u + F.nz * 0.4) > (ctx.B.off ? ctx.B.off.y : 0) + y - 0.2;
/**
 * Stucco walls with real openings for a whole footprint (the school's own style instead of the generic facade kit):
 * per storey a row of tall windows (arched on the ground floor when opts.arched), an arched door on every wall over
 * `doorMin` metres, nothing on party walls (opts.others: rings that may stand against a wall). Walls + collision.
 */
export function stuccoWalls(ctx, ringIn, h, opts = {}) {
  const ring = ensureCCW(ringIn); const color = opts.color || CREAM; plainBlock(ctx, ring, opts.y0 ?? -0.6, h, color, opts.cap || null, opts.bucket || 'stucco');
  const base = ctx.B.off ? ctx.B.off.y : 0;
  if (ctx.terrain) { const plan = ctx.wallPlans ? ctx.wallPlans.get(ringKey(ring)) : null; (ctx.footprints = ctx.footprints || []).push({ id: opts.id || ringIn.id || ctx.siteName || null, ring, roof: base + h, floor: plan ? plan.maxLevel : base }); }   // map check: interior, fill
  const others = opts.others || []; const inAny = (x, z) => others.some((r) => r !== ringIn && pointIn(x, z, r));
  for (const F of outFrames(ring)) { if (F.L < 2.6) continue; const mx = F.ax + F.tx * F.L / 2, mz = F.az + F.tz * F.L / 2; if (inAny(mx + F.nx * 0.8, mz + F.nz * 0.8)) continue;
    // (fix round 6) opts.per(F) -> { up, top }: this wall's floor stands `up` above the building's and its top `top` above h (a taller part of one footprint)
    const per = opts.per ? opts.per(F) || {} : {}; const hW = h + (per.top || 0);
    // the floor this wall's openings stand on: the building's floor (opts.floor, local) or the ground at the wall, whichever is
    // higher, so no sill is ever below grade and no wall stays blank because the datum is lower than the ground here
    let gw = -1e9; if (ctx.groundY) for (const t of [0.1, 0.5, 0.9]) gw = Math.max(gw, ctx.groundY(F.ax + F.tx * F.L * t + F.nx * 0.5, F.az + F.tz * F.L * t + F.nz * 0.5) - base); const f0 = Math.max((opts.floor || 0) + (per.up || 0), gw > -1e8 ? gw : 0, 0);
    // a wall whose ground lies well below the floor (a building on a bank): a plain base course from the ground up to the floor line
    // and no door hanging in the air (opts.plinth = colour)
    let gLow = 1e9; if (ctx.groundY) for (let t = 0.05; t <= 0.96; t += 0.1) gLow = Math.min(gLow, ctx.groundY(F.ax + F.tx * F.L * t + F.nx * 0.4, F.az + F.tz * F.L * t + F.nz * 0.4) - base); const hung = opts.plinth && gLow < 1e8 && f0 - gLow > 0.6;
    if (hung) { const yb = Math.min(gLow, opts.y0 ?? -0.6) - 0.5, yt = f0 + 0.04; const bk = ctx.B.v(opts.bucket || 'stucco', true); bk.setColor(...opts.plinth); const o = 0.07, S = 0.45;   // (faces drawn from outside only: a box here showed its inner face to the roof-skin check's rays)
      quadFacing(bk, F.P(-o, yb, o), F.P(F.L + o, yb, o), F.P(F.L + o, yt, o), F.P(-o, yt, o), [F.nx, 0, F.nz], [[0, yb * S], [F.L * S, yb * S], [F.L * S, yt * S], [0, yt * S]]); quadFacing(bk, F.P(-o, yt, 0), F.P(F.L + o, yt, 0), F.P(F.L + o, yt, o), F.P(-o, yt, o), [0, 1, 0]);
      quadFacing(bk, F.P(-o, yb, 0), F.P(-o, yb, o), F.P(-o, yt, o), F.P(-o, yt, 0), [-F.tx, 0, -F.tz]); quadFacing(bk, F.P(F.L + o, yb, 0), F.P(F.L + o, yb, o), F.P(F.L + o, yt, o), F.P(F.L + o, yt, 0), [F.tx, 0, F.tz]); bk.setColor(1, 1, 1); }
    const hh = hW - f0; if (hh < 2.4) continue; const st = Math.max(1, Math.min(opts.storeys || 9, Math.round(hh / 3.3))); const fh = hh / st;
    if (opts.glazedEnds && F.L < opts.glazedEnds && opts.gableGlass) { gableGlazing(ctx, F, f0 + 0.15, hW, opts.gableRise || 0, { trim: [0.8, 0.8, 0.78] }); continue; }
    if (opts.glazedEnds && F.L < opts.glazedEnds) { archOpening(ctx, F, F.L / 2, f0 + 0.25, Math.min(F.L - 2.4, 7), Math.max(1.6, hh - 0.4 - Math.min(F.L - 2.4, 7) / 2 + (opts.gableRise || 0) * 0.6), { trim: [0.75, 0.75, 0.73], mullions: 5, bars: [f0 + 1.3, f0 + 2.4, f0 + 3.5] }); continue; }
    // Rule F47: a door only where the tiles or photos show one. The kit's default (a door on every wall over 13 m) is switched off per wall by
    // opts.noDoor = [[x, z], ...] (a wall whose door would stand within 3 m of a listed point gets a window there instead). A door whose floor stands
    // above the ground (opts.stoops, up to 2 m) gets a stoop and a flight of steps down to the ground instead of being dropped.
    const m = 1.0; const nA = Math.max(1, Math.floor((F.L - 2 * m) / (opts.pitch || 2.7))); const uDoor = opts.arched ? m + (F.L - 2 * m) / nA * ((nA >> 1) + 0.5) : F.L / 2; const pD = F.P(uDoor, 0, 0);
    const stoop = hung && opts.stoops && f0 - gLow < 2.0; const banned = (opts.noDoor || []).some(([x, z]) => Math.hypot(pD[0] - x, pD[2] - z) < 3);
    const door = F.L > (per.doorMin || opts.doorMin || 13) && (!hung || stoop) && !banned; const note = (u) => { if (stoop) doorStoop(ctx, F, u, f0, { id: opts.id || ringIn.id, cheek: color }); else noteDoor(ctx, F, u, opts.id || ringIn.id); };
    for (let s = 0; s < st; s++) { const y = f0 + s * fh; const w = opts.w || 1.15, pitch = opts.pitch || 2.7;
      if (s === 0 && opts.arched) { const n = Math.max(1, Math.floor((F.L - 2 * m) / pitch)); const stp = (F.L - 2 * m) / n; for (let k = 0; k < n; k++) { const u = m + stp * (k + 0.5); if (door && k === (n >> 1)) { archOpening(ctx, F, u, y + 0.05, 1.7, 1.75, { kind: 'door', trim: opts.trim }); note(u); } else archOpening(ctx, F, u, y + 0.75, w, Math.min(1.75, fh - 1.9), { trim: opts.trim, mullions: 2, bars: [y + 1.6] }); } }
      else { if (s === 0 && door) { archOpening(ctx, F, F.L / 2, y + 0.05, 1.7, 1.75, { kind: 'door', trim: opts.trim }); note(F.L / 2); if (F.L / 2 - 1.6 - m > pitch) { tallRow(ctx, F, m, F.L / 2 - 1.6, y + 0.8, y + Math.min(fh - 0.55, 2.75), w, pitch); tallRow(ctx, F, F.L / 2 + 1.6, F.L - m, y + 0.8, y + Math.min(fh - 0.55, 2.75), w, pitch); } }
        else tallRow(ctx, F, m, F.L - m, y + 0.8, y + Math.min(fh - 0.55, 2.75), w, pitch); } } }
  return ring;
}
/** Every door drawn on a school wall is noted (world position on the wall, the way out): grounds.js lays an apron and a walk at each (rule F8). */
export const noteDoor = (ctx, F, u, id) => { const p = F.P(u, 0, 0); (ctx.doors = ctx.doors || []).push({ x: +p[0].toFixed(2), z: +p[2].toFixed(2), nx: +F.nx.toFixed(3), nz: +F.nz.toFixed(3), id: id || null }); };
/**
 * A door whose floor stands above the ground (fix round 6, rule F47): a stoop at the threshold and a straight flight down to the ground, in concrete with
 * pale nosings, low rendered cheek walls each side; collision on the stoop and on the plane through the nosings (rule D18). yTop is the floor (local).
 * The door is noted at the foot of the flight (grounds.js lays the walk from there).
 */
export function doorStoop(ctx, F, uc, yTop, o = {}) {
  const { B } = ctx; const base = B.off ? B.off.y : 0; const w = o.w || 2.4, dep = o.stoop || 0.6, tr = o.tread || 0.28;   /* (a short stoop and 0.28 m treads: the hall's south drive runs 2.2 m from the wall) */ const P = (u, y, out) => F.P(uc + u, y, out);
  const gAt = (d) => { const p = P(0, 0, d); return ctx.groundY(p[0], p[2]) - base; };
  let n = Math.max(2, Math.ceil((yTop - gAt(dep + 1.6)) / 0.165)); let run = n * tr; let yFoot = gAt(dep + run + 0.3); n = Math.max(2, Math.ceil((yTop - yFoot) / 0.165)); run = n * tr; yFoot = gAt(dep + run + 0.3);   // (risers of 0.165 at most: the nosing plane stays under 31 deg, the controller stalls on 36)
  const riser = (yTop - yFoot) / n, tread = run / n; const yLow = Math.min(yFoot, gAt(0.3), gAt(dep)) - 0.6; const mat = B.v(o.bucket || 'concrete'), col = B.c('concrete'), lime = B.v('limestone');
  { const c = P(0, (yTop + yLow) / 2, dep / 2); mat.box(c[0], c[1], c[2], w + 0.5, yTop - yLow, dep, F.rotY, 1 / 3); col.box(c[0], c[1], c[2], w + 0.5, yTop - yLow, dep, F.rotY); }
  for (let k = 0; k < n - 1; k++) { const yT = yTop - riser * (k + 1); const c = P(0, (yT + yLow) / 2, dep + tread * (k + 0.5)); mat.box(c[0], c[1], c[2], w, yT - yLow, tread + 0.02, F.rotY, 1 / 3); const q = P(0, yT + 0.006, dep + tread * (k + 1) - 0.04); lime.box(q[0], q[1], q[2], w, 0.012, 0.08, F.rotY, 1 / 3); }
  quadFacing(col, P(-w / 2, yTop + 0.01, dep - 0.05), P(w / 2, yTop + 0.01, dep - 0.05), P(w / 2, yFoot + riser * 0.4, dep + run - tread), P(-w / 2, yFoot + riser * 0.4, dep + run - tread), [0, 1, 0]);
  quadFacing(col, P(-w / 2, yFoot + riser * 0.4, dep + run - tread), P(w / 2, yFoot + riser * 0.4, dep + run - tread), P(w / 2, yFoot - 0.05, dep + run + 0.25), P(-w / 2, yFoot - 0.05, dep + run + 0.25), [0, 1, 0]);
  const ck = o.cheek || CREAM; const L = dep + run;
  for (const sd of [-1, 1]) { const u = sd * (w / 2 + 0.2); for (const bk of [B.v('stucco', true), col]) { if (bk.setColor) bk.setColor(ck[0], ck[1], ck[2]);
      quadFacing(bk, P(u - 0.15, yTop + 0.55, 0), P(u + 0.15, yTop + 0.55, 0), P(u + 0.15, yFoot + 0.55, L), P(u - 0.15, yFoot + 0.55, L), [0, 1, 0]);
      for (const s2 of [-0.15, 0.15]) quadFacing(bk, P(u + s2, yLow, 0), P(u + s2, yLow, L), P(u + s2, yFoot + 0.55, L), P(u + s2, yTop + 0.55, 0), [Math.sign(s2) * F.tx, 0, Math.sign(s2) * F.tz]);
      quadFacing(bk, P(u - 0.15, yLow, L), P(u + 0.15, yLow, L), P(u + 0.15, yFoot + 0.55, L), P(u - 0.15, yFoot + 0.55, L), [F.nx, 0, F.nz]); if (bk.setColor) bk.setColor(1, 1, 1); } }
  const foot = P(0, 0, L + 0.4); (ctx.doors = ctx.doors || []).push({ x: +foot[0].toFixed(2), z: +foot[2].toFixed(2), nx: +F.nx.toFixed(3), nz: +F.nz.toFixed(3), id: o.id || null, steps: n, rise: +(yTop - yFoot).toFixed(2) });
  return { n, riser, tread, run, yFoot };
}
const pointIn = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
function tallRow(ctx, F, u0, u1, y0, y1, w, pitch) { const n = Math.max(0, Math.floor((u1 - u0) / pitch)); if (!n) return; const stp = (u1 - u0) / n; for (let k = 0; k < n; k++) { const u = u0 + stp * (k + 0.5); winRow(ctx, F, u - w / 2 - 0.05, u + w / 2 + 0.05, y0, y1, w, w); } }   // (one window: the span is a little over one pitch)
const QF = (b, p0, p1, p2, p3, ua, ub, uc, ud) => { const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2]; const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; if (n[0] * QF.n[0] + n[2] * QF.n[1] >= 0) b.quad(p0, p1, p2, p3, ua, ub, uc, ud); else b.quad(p0, p3, p2, p1, ua, ud, uc, ub); };
QF.n = [0, 0];
const triF = (b, p0, p1, p2, n) => { const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2]; const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) b.tri(p0, p1, p2, [0.5, 0.5], [0.5, 1], [0.4, 1]); else b.tri(p0, p2, p1, [0.5, 0.5], [0.4, 1], [0.5, 1]); };
/** A fully glazed gable end on a wall frame: glass from y0 up to the roof line (eave height `eave` at both ends, `rise` more at
 * the middle), behind a grid of pale mullions and transoms (the Commons hall: 3D-tiles oblique). */
export function gableGlazing(ctx, F, y0, eave, rise, opts = {}) {
  QF.n = [F.nx, F.nz]; const { B } = ctx; const out = opts.out ?? 0.05; const m = opts.margin ?? 0.35; const u0 = m, u1 = F.L - m, mid = F.L / 2; const gl = B.v('glass'); const fr = B.v('paint', true); const t = 0.09;
  const top = (u) => eave + rise * (1 - Math.abs(u - mid) / mid) - 0.3; const P = (u, y, o = out) => F.P(u, y, o);
  const nb = Math.max(2, Math.round((u1 - u0) / 1.35 / 2) * 2), bw = (u1 - u0) / nb;
  for (let k = 0; k < nb; k++) { const a = u0 + bw * k, b = a + bw; QF(gl, P(a, y0), P(a, top(a)), P(b, top(b)), P(b, y0), [0, 0], [0, 1], [1, 1], [1, 0]); }
  fr.setColor(...(opts.trim || [0.78, 0.78, 0.76]));
  for (let k = 0; k <= nb; k++) { const u = u0 + bw * k; QF(fr, P(u - t / 2, y0, out + 0.02), P(u - t / 2, top(u), out + 0.02), P(u + t / 2, top(u), out + 0.02), P(u + t / 2, y0, out + 0.02)); }
  for (let y = y0; y < eave + rise; y += 1.25) for (let k = 0; k < nb; k++) { const a = u0 + bw * k, b = a + bw; if (y + t > Math.min(top(a), top(b))) continue; QF(fr, P(a, y - t / 2, out + 0.02), P(a, y + t / 2, out + 0.02), P(b, y + t / 2, out + 0.02), P(b, y - t / 2, out + 0.02)); }
  for (let k = 0; k < nb; k++) { const a = u0 + bw * k, b = a + bw; QF(fr, P(a, top(a) - t, out + 0.02), P(a, top(a) + t * 0.6, out + 0.02), P(b, top(b) + t * 0.6, out + 0.02), P(b, top(b) - t, out + 0.02)); }   // the raking head under the roof
  fr.setColor(1, 1, 1);
}
/** Arched opening drawn on a wall frame: a dark recess (rect + half round) with a pale surround. kind 'glass' | 'door'. */
export function archOpening(ctx, F, uc, y0, w, hRect, opts = {}) {
  QF.n = [F.nx, F.nz]; const { B } = ctx; const out = opts.out ?? 0.04; const r = w / 2; const N = 8; const mat = B.v(opts.kind === 'door' ? 'door' : 'glass');
  const P = (u, y, o = out) => F.P(uc + u, y, o);
  QF(mat, P(-r, y0), P(-r, y0 + hRect), P(r, y0 + hRect), P(r, y0), [0, 0], [0, 1], [1, 1], [1, 0]);
  for (let k = 0; k < N; k++) { const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N; triF(mat, P(0, y0 + hRect), P(-r * Math.cos(a1), y0 + hRect + r * Math.sin(a1)), P(-r * Math.cos(a0), y0 + hRect + r * Math.sin(a0)), [F.nx, 0, F.nz]); }
  const fr = B.v('paint', true); fr.setColor(...(opts.trim || [0.7, 0.69, 0.66])); const t = 0.14;
  for (const sd of [-1, 1]) { const u = sd * (r + t / 2); QF(fr, P(u - t / 2, y0, out + 0.02), P(u - t / 2, y0 + hRect, out + 0.02), P(u + t / 2, y0 + hRect, out + 0.02), P(u + t / 2, y0, out + 0.02)); }
  for (let k = 0; k < N; k++) { const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N; const q = (a, rr) => P(-rr * Math.cos(a), y0 + hRect + rr * Math.sin(a), out + 0.02); QF(fr, q(a0, r), q(a0, r + t), q(a1, r + t), q(a1, r)); }
  if (opts.mullions) { const m = B.v('paint', true); for (let k = 1; k < opts.mullions; k++) { const u = -r + w * k / opts.mullions; QF(m, P(u - 0.03, y0, out + 0.02), P(u - 0.03, y0 + hRect, out + 0.02), P(u + 0.03, y0 + hRect, out + 0.02), P(u + 0.03, y0, out + 0.02)); }
    for (const y of opts.bars || []) QF(m, P(-r, y - 0.03, out + 0.02), P(-r, y + 0.03, out + 0.02), P(r, y + 0.03, out + 0.02), P(r, y - 0.03, out + 0.02)); }
  fr.setColor(1, 1, 1);
}
/** Row of arched openings along a frame between u0 and u1. */
export function archRow(ctx, F, u0, u1, y0, w, hRect, pitch, opts) { const n = Math.max(1, Math.floor((u1 - u0) / pitch)); const st = (u1 - u0) / n; for (let k = 0; k < n; k++) archOpening(ctx, F, u0 + st * (k + 0.5), y0, w, hRect, opts); return n; }
/** Row of plain rectangular windows (glass + pale frame) along a frame. */
export function winRow(ctx, F, u0, u1, y0, y1, w, pitch, out = 0.04) {
  QF.n = [F.nx, F.nz]; const { B } = ctx; const n = Math.max(0, Math.floor((u1 - u0) / pitch)); if (!n) return 0; const st = (u1 - u0) / n; const gl = B.v('glass'), fr = B.v('paint', true); fr.setColor(0.7, 0.69, 0.66);
  for (let k = 0; k < n; k++) { const uc = u0 + st * (k + 0.5); QF(gl, F.P(uc - w / 2, y0, out), F.P(uc - w / 2, y1, out), F.P(uc + w / 2, y1, out), F.P(uc + w / 2, y0, out), [0, 0], [0, 1], [1, 1], [1, 0]);
    for (const [a, b, c, d] of [[-w / 2 - 0.08, w / 2 + 0.08, y1, y1 + 0.08], [-w / 2 - 0.08, w / 2 + 0.08, y0 - 0.1, y0], [-0.025, 0.025, y0, y1]]) QF(fr, F.P(uc + a, c, out + 0.02), F.P(uc + a, d, out + 0.02), F.P(uc + b, d, out + 0.02), F.P(uc + b, c, out + 0.02)); }
  fr.setColor(1, 1, 1); return n;
}

/** Oriented box { cx, cz, ang (deg, direction of the ridge / u axis), L (along u), W (across) }. */
export const oW = (o) => { const c = Math.cos(o.ang * RAD), s = Math.sin(o.ang * RAD); return (u, v, y) => [o.cx + u * c - v * s, y, o.cz + u * s + v * c]; };
/** Bounding box of a set of points on a given axis: { cx, cz, ang, L, W }. */
export function boxOn(pts, ang) { const c = Math.cos(ang * RAD), s = Math.sin(ang * RAD); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const p of pts) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); } const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; return { cx: um * c - vm * s, cz: um * s + vm * c, ang, L: u1 - u0, W: v1 - v0 }; }

/**
 * Gable roof on an oriented box: ridge along u. Skin in the shingle bucket (tint), the same planes as collision, a solid
 * attic, a soffit, gable walls as the full roof profile (both windings). opts: ov (eave overhang), ovEnd (rake overhang),
 * tint, gableTint, gableBucket, ends: [bool, bool] (draw the gable wall at -L/2, +L/2).
 * Returns { W, hw, top, yAt(v) } for placing things on the slopes.
 */
export function gableRoof(ctx, o, eaveY, rise, opts = {}) {
  const { B } = ctx; const ov = opts.ov ?? 0.6, oe = opts.ovEnd ?? ov; const W = oW(o); const u0 = -o.L / 2 - oe, u1 = o.L / 2 + oe, hw = o.W / 2 + ov, top = eaveY + rise;
  const bk = B.v('shingles', true), col = B.c('concrete'); const t = opts.tint || BR_TAN; bk.setColor(t[0], t[1], t[2]); const sl = Math.hypot(hw, rise), S = 1 / 3;
  for (const sd of [-1, 1]) { const p0 = W(u0, sd * hw, eaveY), p1 = W(u1, sd * hw, eaveY), p2 = W(u1, 0, top), p3 = W(u0, 0, top); const uv = [[u0 * S, 0], [u1 * S, 0], [u1 * S, sl * S], [u0 * S, sl * S]]; quadFacing(bk, p0, p1, p2, p3, [0, 1, 0], uv); quadFacing(col, p0, p1, p2, p3, [0, 1, 0]); }
  quadFacing(bk, W(u0, -hw, eaveY), W(u1, -hw, eaveY), W(u1, hw, eaveY), W(u0, hw, eaveY), [0, -1, 0]);
  const wb = B.v(opts.gableBucket || 'stucco', true); const gt = opts.gableTint || [1, 1, 1]; wb.setColor(gt[0], gt[1], gt[2]); const dy = rise * ov / hw; const ends = opts.ends || [true, true];
  [-o.L / 2, o.L / 2].forEach((ug, k) => { if (!ends[k]) return; const a0 = W(ug, -o.W / 2, eaveY), a1 = W(ug, o.W / 2, eaveY), b0 = W(ug, -o.W / 2, eaveY + dy), b1 = W(ug, o.W / 2, eaveY + dy), tp = W(ug, 0, top);
    for (const [p, q, r] of [[a0, a1, b1], [a0, b1, b0], [b0, b1, tp]]) { wb.tri(p, q, r); wb.tri(q, p, r); col.tri(p, q, r); } });
  wb.setColor(1, 1, 1);
  if (opts.trim) { const tp = B.v('paint', true); tp.setColor(0.8, 0.8, 0.77); [u0, u1].forEach((ug, k) => { if (!ends[k]) return; for (const sd of [-1, 1]) tp.tube(W(ug, sd * hw, eaveY - 0.05), W(ug, 0, top - 0.05), 0.11, 5, 1); }); tp.setColor(1, 1, 1); }
  for (let y0 = 0; y0 + 0.25 < rise; y0 += 0.8) { const y1 = Math.min(y0 + 0.8, rise - 0.05), b = hw * (1 - y1 / rise); if (b < 0.15) break; const p = W(0, 0, eaveY + (y0 + y1) / 2); B.c('wood').box(p[0], p[1], p[2], o.L, y1 - y0, 2 * b, -o.ang * RAD); }
  bk.setColor(t[0] * 0.8, t[1] * 0.8, t[2] * 0.8); bk.tube(W(u0, 0, top), W(u1, 0, top), 0.13, 5, 1); bk.setColor(1, 1, 1);
  return { W, hw, top, eaveY, rise, yAt: (v) => eaveY + rise * (1 - Math.abs(v) / hw) };
}
/**
 * Hip roof over any (roughly convex) outline with an explicit ridge segment: every eave edge rises to the nearer ridge end, so the
 * planes follow the measured ridge instead of a single pitch (Katharine Branson Hall's north block and link: tiles height grid).
 * eaveY / ridgeY local heights; opts: tint, ov (eave overhang). Tiled planes, a soffit, walkable collision.
 */
export function ridgeRoof(ctx, ringIn, eaveY, ra, rb, ridgeY, opts = {}) {
  const { B } = ctx; const ring = ensureCCW(ringIn); const ov = opts.ov ?? 0.7; const t = opts.tint || BR_CLAY; const bk = B.v('shingles', true), col = B.c('concrete'); const n = ring.length;
  // eave line: each vertex pushed out along the bisector of its two edge normals
  const out = ring.map((p, i) => { const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n]; const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]]; const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1; let nx = e1[1] / l1 + e2[1] / l2, nz = -e1[0] / l1 - e2[0] / l2; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; if (pointIn(p[0] + nx * 0.2, p[1] + nz * 0.2, ring)) { nx = -nx; nz = -nz; } return [p[0] + nx * ov, p[1] + nz * ov]; });
  const R = [[ra[0], ridgeY, ra[1]], [rb[0], ridgeY, rb[1]]]; const near = (p) => (Math.hypot(p[0] - ra[0], p[1] - ra[1]) <= Math.hypot(p[0] - rb[0], p[1] - rb[1]) ? 0 : 1);
  const tri = (bkt, p0, p1, p2, uvs) => { const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2]; const ny = uz * vx - ux * vz; if (ny >= 0) bkt.tri(p0, p1, p2, ...(uvs || [])); else bkt.tri(p0, p2, p1, ...(uvs ? [uvs[0], uvs[2], uvs[1]] : [])); };
  bk.setColor(t[0], t[1], t[2]);
  for (let i = 0; i < n; i++) { const a2 = out[i], b2 = out[(i + 1) % n]; const a = [a2[0], eaveY, a2[1]], b = [b2[0], eaveY, b2[1]]; const ka = near(a2), kb = near(b2); const L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]); const S = 1 / 3;
    const sl = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (ka === kb) { tri(bk, a, b, R[ka], [[0, 0], [L * S, 0], [L * S / 2, sl(a, R[ka]) * S]]); tri(col, a, b, R[ka]); }
    else { tri(bk, a, b, R[kb], [[0, 0], [L * S, 0], [L * S, sl(b, R[kb]) * S]]); tri(bk, a, R[kb], R[ka], [[0, 0], [L * S, sl(b, R[kb]) * S], [0, sl(a, R[ka]) * S]]); tri(col, a, b, R[kb]); tri(col, a, R[kb], R[ka]); } }
  bk.setColor(t[0] * 0.8, t[1] * 0.8, t[2] * 0.8); bk.tube(R[0], R[1], 0.13, 5, 1); bk.setColor(1, 1, 1);
  const pt = B.v('paint', true); pt.setColor(0.78, 0.77, 0.73); for (let i = 0; i < n; i++) { const j = (i + 1) % n; quadFacing(pt, [ring[i][0], eaveY - 0.02, ring[i][1]], [ring[j][0], eaveY - 0.02, ring[j][1]], [out[j][0], eaveY - 0.02, out[j][1]], [out[i][0], eaveY - 0.02, out[i][1]], [0, -1, 0]); } pt.setColor(1, 1, 1);
  // a solid attic so nobody can stand inside the roof: slabs under the ridge, narrowing upward
  const c0 = [(ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2]; const rise = ridgeY - eaveY; for (let k = 0; k < 4; k++) { const f = (k + 0.5) / 4; const sc = 1 - (k + 1) / 4; if (sc <= 0.05) break; col.prism(ring.map((p) => [c0[0] + (p[0] - c0[0]) * sc * 0.9, c0[1] + (p[1] - c0[1]) * sc * 0.9]), eaveY + rise * (k / 4), eaveY + rise * ((k + 1) / 4), 1, true); void f; }
}
/** Solar array lying on a gable roof's slope: u range, v range (same sign = same slope). */
export function solarOn(ctx, roof, ua, ub, va, vb, lift = 0.09) {
  const p = (u, v) => roof.W(u, v, roof.yAt(v) + lift); const n = Math.max(1, Math.round(Math.abs(ub - ua) / 1.05)), m = Math.max(1, Math.round(Math.abs(vb - va) / 1.75));
  quadFacing(ctx.B.v('solar'), p(ua, va), p(ub, va), p(ub, vb), p(ua, vb), [0, 1, 0], [[0, 0], [n, 0], [n, m], [0, m]]);
}
/** Flat solar array at height y over a rectangle in a box frame. */
export function solarFlat(ctx, o, y, ua, ub, va, vb) { const W = oW(o); const n = Math.max(1, Math.round(Math.abs(ub - ua) / 1.05)), m = Math.max(1, Math.round(Math.abs(vb - va) / 1.75)); quadFacing(ctx.B.v('solar'), W(ua, va, y), W(ub, va, y), W(ub, vb, y + 0.25), W(ua, vb, y + 0.25), [0, 1, 0], [[0, 0], [n, 0], [n, m], [0, m]]); }

/**
 * Lean-to roof against a wall frame F (u along the wall, out = away from it): from yWall at the wall down to yEave at
 * `depth`, on square posts every `bay` (a colonnade). Skin both sides, slab + post collision.
 */
export function leanTo(ctx, F, u0, u1, depth, yWall, yEave, opts = {}) {
  const { B } = ctx; const t = opts.tint || BR_TAN; const bk = B.v('shingles', true); bk.setColor(t[0], t[1], t[2]); const S = 1 / 3, sl = Math.hypot(depth, yWall - yEave);
  const a = F.P(u0, yWall, 0), b = F.P(u1, yWall, 0), c = F.P(u1, yEave, depth), d = F.P(u0, yEave, depth);
  quadFacing(bk, d, c, b, a, [0, 1, 0], [[u0 * S, 0], [u1 * S, 0], [u1 * S, sl * S], [u0 * S, sl * S]]);
  const lo = (p) => [p[0], p[1] - 0.16, p[2]]; const pt = B.v('paint', true); pt.setColor(0.78, 0.77, 0.73);
  quadFacing(pt, lo(a), lo(b), lo(c), lo(d), [0, -1, 0]); quadFacing(pt, d, c, lo(c), lo(d), [F.nx, 0, F.nz]);
  quadFacing(pt, a, d, lo(d), lo(a), [-F.tx, 0, -F.tz]); quadFacing(pt, b, c, lo(c), lo(b), [F.tx, 0, F.tz]);
  const col = B.c('concrete'); quadFacing(col, d, c, b, a, [0, 1, 0]); quadFacing(col, lo(a), lo(b), lo(c), lo(d), [0, -1, 0]); quadFacing(col, d, c, lo(c), lo(d), [F.nx, 0, F.nz]);
  const bay = opts.bay || 4.2; const n = Math.max(1, Math.round((u1 - u0) / bay));
  for (let k = 0; k <= n; k++) { const u = u0 + (u1 - u0) * k / n; const p = F.P(Math.min(u1 - 0.15, Math.max(u0 + 0.15, u)), 0, depth - 0.25); pt.box(p[0], (yEave - 0.16) / 2, p[2], 0.24, yEave - 0.16, 0.24, F.rotY); B.c('wood').box(p[0], (yEave - 0.16) / 2, p[2], 0.24, yEave - 0.16, 0.24, F.rotY); }
  pt.setColor(1, 1, 1); bk.setColor(1, 1, 1);
}
/** Ring pulled toward its centroid by d metres (fine for near-convex footprints). */
export function inset(ring, d) { let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length; return ring.map((p) => { const L = Math.hypot(cx - p[0], cz - p[1]) || 1; return [p[0] + (cx - p[0]) * d / L, p[1] + (cz - p[1]) * d / L]; }); }
/** Clay-tile rim just inside a flat roof's parapet: a band sloping down toward the middle (Tallant Science Center). */
export function tileRim(ctx, ringIn, yTop, w = 2.0, drop = 0.3, tint = BR_CLAY) {
  const ring = ensureCCW(ringIn); const a = inset(ring, 0.45), b = inset(ring, 0.45 + w); const bk = ctx.B.v('shingles', true); bk.setColor(tint[0], tint[1], tint[2]);
  for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length; const L = Math.hypot(a[j][0] - a[i][0], a[j][1] - a[i][1]); quadFacing(bk, [a[i][0], yTop, a[i][1]], [a[j][0], yTop, a[j][1]], [b[j][0], yTop - drop, b[j][1]], [b[i][0], yTop - drop, b[i][1]], [0, 1, 0], [[0, 0], [L / 3, 0], [L / 3, w / 3], [0, w / 3]]); }
  bk.setColor(1, 1, 1);
}
/**
 * Free-standing name board on two posts (the names are the school's own campus-map legend). Faces `deg` (0 = text read
 * from the south, i.e. the board's normal points +z); stands on the ground, registered as a prop.
 */
export function nameBoard(ctx, x, z, deg, lines, opts = {}) {
  const { B } = ctx; const w = opts.w || 2.3, h = opts.h || (lines.length > 1 ? 0.95 : 0.6), y0 = opts.y0 ?? (lines.length > 1 ? 0.95 : 1.15); const rot = deg * RAD; const tx = Math.cos(rot), tz = -Math.sin(rot);
  return atGround(ctx, x, z, () => {
    const pt = B.v('paint', true); pt.setColor(0.03, 0.12, 0.34); pt.box(x, y0 + h / 2, z, w, h, 0.1, rot); pt.setColor(0.16, 0.16, 0.17);
    for (const sd of [-1, 1]) pt.box(x + tx * sd * (w / 2 - 0.12), (y0 + h) / 2, z + tz * sd * (w / 2 - 0.12), 0.1, y0 + h + 0.06, 0.1, rot);
    pt.setColor(1, 1, 1); B.c('wood').box(x, (y0 + h) / 2, z, w, y0 + h, 0.14, rot);
    const cw = 1024, ch = Math.round(1024 * h / w); const font = Math.min(Math.round(ch / lines.length * 0.62), Math.round(cw * 1.55 / Math.max(...lines.map((l) => l.length))));
    const tex = ctx.M.textDecal(lines, { w: cw, h: ch, font, color: '#f2f2ee', align: 'center', weight: 700, spacing: '3px' });
    for (const sd of [1, -1]) { const a = [x - tx * sd * w / 2, z - tz * sd * w / 2], b = [x + tx * sd * w / 2, z + tz * sd * w / 2]; const F = edgeFrame(a[0], a[1], b[0], b[1]); wallDecal(ctx, tex, F, F.L / 2, y0 + h / 2, w - 0.1, h - 0.08, 0.056, { opaque: false }); }
    propKit.registerProp(ctx, 'sign', x, z, rot, w, 0.14, y0 + h);
  }, 0.5, 'min');
}

/** Gabled dormer on a gable roof (from gableRoof): at u along the ridge, on the slope of sign sd; w wide, its face `back`
 * metres up the slope from the eave line. Front wall with a window, two cheeks, its own little gable roof. */
export function dormer(ctx, roof, o, u, sd, w = 2.4, opts = {}) {
  const { B } = ctx; const vF = sd * (roof.hw - (opts.back ?? 1.6)), yF = roof.yAt(vF), hF = opts.h ?? 1.5; const st = B.v('stucco', true); const tn = opts.wall || WHITE; st.setColor(tn[0], tn[1], tn[2]);
  const W = roof.W; const yE = yF + hF; const vB = sd * Math.max(0.2, roof.hw * (1 - (yE - roof.eaveY) / roof.rise));   // where the dormer's eave line meets the main slope
  const a = W(u - w / 2, vF, yF), b = W(u + w / 2, vF, yF), c = W(u + w / 2, vF, yE), d = W(u - w / 2, vF, yE); const n = W(0, sd, 0), n0 = W(0, 0, 0); const nrm = [n[0] - n0[0], 0, n[2] - n0[2]];
  quadFacing(st, a, b, c, d, nrm); quadFacing(B.c('concrete'), a, b, c, d, nrm);
  for (const s2 of [-1, 1]) { const p0 = W(u + s2 * w / 2, vF, yF), p1 = W(u + s2 * w / 2, vF, yE), p2 = W(u + s2 * w / 2, vB, yE); st.tri(p0, p1, p2); st.tri(p1, p0, p2); }
  st.setColor(1, 1, 1);
  const gl = B.v('glass'); const g0 = W(u - w / 2 + 0.45, vF + sd * 0.04, yF + 0.3), g1 = W(u + w / 2 - 0.45, vF + sd * 0.04, yF + 0.3), g2 = W(u + w / 2 - 0.45, vF + sd * 0.04, yE - 0.15), g3 = W(u - w / 2 + 0.45, vF + sd * 0.04, yE - 0.15); quadFacing(gl, g0, g1, g2, g3, nrm, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // the dormer roof runs back until its RIDGE meets the main slope (stopping where its eaves meet it leaves a hole under the ridge)
  const len = Math.min(Math.abs(vF) - 0.3, Math.abs(vF - vB) + (opts.rise ?? 0.95) * roof.hw / roof.rise + 0.2); const cc = W(u, vF - sd * (len / 2 - 0.15), 0);
  gableRoof(ctx, { cx: cc[0], cz: cc[2], ang: o.ang + 90, L: len, W: w }, yE, opts.rise ?? 0.95, { tint: opts.tint, ov: 0.25, ovEnd: 0.25, gableBucket: 'stucco', gableTint: tn, ends: sd > 0 ? [false, true] : [true, false] });
}

/** Concrete kerb along the edges of a paved outline (a hard edge between paving and planting, rule F42), following the ground.
 * Skipped where the far side is paved too (surfaceAt asphalt / concrete) unless opts.all. No collision (12 cm). */
export function kerb(ctx, ringIn, opts = {}) {
  const ring = ensureCCW(ringIn); const w = opts.w || 0.22, hgt = opts.h || 0.12; const pt = ctx.B.v('paint', true); const col = opts.color || [0.5, 0.5, 0.48]; const g = (x, z) => ctx.groundY(x, z);
  for (const F of outFrames(ring)) { const n = Math.max(1, Math.ceil(F.L / 1.6));
    for (let k = 0; k < n; k++) { const u0 = F.L * k / n, u1 = F.L * (k + 1) / n, um = (u0 + u1) / 2; const px = F.ax + F.tx * um + F.nx * 0.9, pz = F.az + F.tz * um + F.nz * 0.9; const s = ctx.surfaceAt(px, pz);
      if (!opts.all && (s === 'asphalt' || s === 'concrete')) continue; if (opts.skip && opts.skip(px, pz)) continue; if (opts.off && opts.off(F.ax + F.tx * um, F.az + F.tz * um)) continue;   // (off: the kerb piece itself would lie on other paving, e.g. across a walk)
      const P = (u, o, dy) => { const x = F.ax + F.tx * u + F.nx * o, z = F.az + F.tz * u + F.nz * o; return [x, g(x, z) + dy, z]; };
      pt.setColor(col[0], col[1], col[2]); quadFacing(pt, P(u0, -w / 2, hgt), P(u1, -w / 2, hgt), P(u1, w / 2, hgt), P(u0, w / 2, hgt), [0, 1, 0]);
      pt.setColor(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8); quadFacing(pt, P(u0, w / 2, -0.05), P(u1, w / 2, -0.05), P(u1, w / 2, hgt), P(u0, w / 2, hgt), [F.nx, 0, F.nz]); quadFacing(pt, P(u0, -w / 2, -0.05), P(u1, -w / 2, -0.05), P(u1, -w / 2, hgt), P(u0, -w / 2, hgt), [-F.nx, 0, -F.nz]); } }
  pt.setColor(1, 1, 1);
}
/**
 * A paved surface draped on the ground: the outline is cut into 1 m cells (clipped to the outline) and every vertex takes the drawn
 * ground height + dy, so paving that runs off its level pad onto a graded street edge or down a gentle slope neither floats nor
 * sinks (the arts court: its west end meets the drive 0.35 m higher, its south strip falls 0.7 m to the music hall).
 */
export function drapePoly(ctx, bucket, ringIn, dy, uvFn) {
  const ring = ensureCCW(ringIn); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const clip = (poly, a, b, c) => { const o = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; const dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c; if (dp >= 0) o.push(p); if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); o.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return o; };
  const V = (p) => [p[0], ctx.groundY(p[0], p[1]) + dy, p[1]];
  for (let cz = Math.floor(z0); cz < z1; cz++) for (let cx = Math.floor(x0); cx < x1; cx++) {
    let poly = clip(ring, 1, 0, cx); if (poly.length < 3) continue; poly = clip(poly, -1, 0, -(cx + 1)); if (poly.length < 3) continue; poly = clip(poly, 0, 1, cz); if (poly.length < 3) continue; poly = clip(poly, 0, -1, -(cz + 1)); if (poly.length < 3) continue;
    let ar = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; ar += p[0] * q[1] - q[0] * p[1]; } if (Math.abs(ar) < 1e-4) continue;
    const v0 = V(poly[0]); for (let i = 1; i < poly.length - 1; i++) { const a = V(poly[i]), b = V(poly[i + 1]); const ux = a[0] - v0[0], uz = a[2] - v0[2], vx = b[0] - v0[0], vz = b[2] - v0[2]; if (Math.abs(ux * vz - uz * vx) < 1e-6) continue;
      if (uz * vx - ux * vz >= 0) bucket.tri(v0, a, b, uvFn(v0[0], v0[2]), uvFn(a[0], a[2]), uvFn(b[0], b[2])); else bucket.tri(v0, b, a, uvFn(v0[0], v0[2]), uvFn(b[0], b[2]), uvFn(a[0], a[2])); } }
}
/** Closed ring round a polyline of width w (for kerbing a drive drawn as a line). */
export function lineRing(pts, w) { const L = [], R = []; for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const nx = -(b[1] - a[1]) / d * w / 2, nz = (b[0] - a[0]) / d * w / 2; L.push([pts[i][0] + nx, pts[i][1] + nz]); R.push([pts[i][0] - nx, pts[i][1] - nz]); } return [...L, ...R.reverse()]; }
