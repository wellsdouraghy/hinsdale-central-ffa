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
  if (ctx.terrain) { const base = ctx.B.off ? ctx.B.off.y : 0; const plan = ctx.wallPlans ? ctx.wallPlans.get(ringKey(ring)) : null; (ctx.footprints = ctx.footprints || []).push({ id: opts.id || ringIn.id || ctx.siteName || null, ring, roof: base + h, floor: plan ? plan.maxLevel : base }); }   // map check: interior, fill
  const st = opts.storeys || Math.max(1, Math.round(h / 3.3)); const fh = h / st; const others = opts.others || []; const inAny = (x, z) => others.some((r) => r !== ringIn && pointIn(x, z, r));
  for (const F of outFrames(ring)) { if (F.L < 2.6) continue; const mx = F.ax + F.tx * F.L / 2, mz = F.az + F.tz * F.L / 2; if (inAny(mx + F.nx * 0.8, mz + F.nz * 0.8)) continue;
    const door = F.L > (opts.doorMin || 13); const m = 1.0;
    for (let s = 0; s < st; s++) { const y = s * fh; const w = opts.w || 1.15, pitch = opts.pitch || 2.7;
      if (s === 0 && opts.arched) { const n = Math.max(1, Math.floor((F.L - 2 * m) / pitch)); const stp = (F.L - 2 * m) / n; for (let k = 0; k < n; k++) { const u = m + stp * (k + 0.5); if (buried(ctx, F, u, 0.7)) continue; if (door && k === (n >> 1)) archOpening(ctx, F, u, 0.05, 1.7, 1.75, { kind: 'door', trim: opts.trim }); else archOpening(ctx, F, u, 0.75, w, Math.min(1.75, fh - 1.9), { trim: opts.trim, mullions: 2, bars: [1.6] }); } }
      else { if (s === 0 && door && !buried(ctx, F, F.L / 2, 0.3)) { archOpening(ctx, F, F.L / 2, 0.05, 1.7, 1.75, { kind: 'door', trim: opts.trim }); if (F.L / 2 - 1.6 - m > pitch) { tallRow(ctx, F, m, F.L / 2 - 1.6, y + 0.8, y + Math.min(fh - 0.55, 2.75), w, pitch); tallRow(ctx, F, F.L / 2 + 1.6, F.L - m, y + 0.8, y + Math.min(fh - 0.55, 2.75), w, pitch); } }
        else tallRow(ctx, F, m, F.L - m, y + 0.8, y + Math.min(fh - 0.55, 2.75), w, pitch); } } }
  return ring;
}
const pointIn = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
function tallRow(ctx, F, u0, u1, y0, y1, w, pitch) { const n = Math.max(0, Math.floor((u1 - u0) / pitch)); if (!n) return; const stp = (u1 - u0) / n; for (let k = 0; k < n; k++) { const u = u0 + stp * (k + 0.5); if (buried(ctx, F, u, y0)) continue; winRow(ctx, F, u - w / 2 - 0.05, u + w / 2 + 0.05, y0, y1, w, w); } }   // (one window: the span is a little over one pitch)
const QF = (b, p0, p1, p2, p3, ua, ub, uc, ud) => { const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2]; const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; if (n[0] * QF.n[0] + n[2] * QF.n[1] >= 0) b.quad(p0, p1, p2, p3, ua, ub, uc, ud); else b.quad(p0, p3, p2, p1, ua, ud, uc, ub); };
QF.n = [0, 0];
const triF = (b, p0, p1, p2, n) => { const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2]; const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) b.tri(p0, p1, p2, [0.5, 0.5], [0.5, 1], [0.4, 1]); else b.tri(p0, p2, p1, [0.5, 0.5], [0.4, 1], [0.5, 1]); };
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
