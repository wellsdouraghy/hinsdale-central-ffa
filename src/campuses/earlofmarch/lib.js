// Small geometry helpers for the Earl of March builder: ring offsets, kerbs laid on the drawn ground, paving draped on the
// ground mesh's own triangles, a shingled mansard band. They started as the Branson builder's (src/campuses/branson/extras.js
// at dde5ebd) and are COPIED here on purpose: a campus must not change when another campus's builder is being edited.
import { edgeFrame, quadFacing } from '../../world/facade.js';
import { ensureCCW } from '../../world/util.js';

const BR_CLAY = [9.5, 4.3, 2.7];
/** Edge frames of a CCW ring whose outward normal really points out (tested against the centroid). */
export function outFrames(ringIn) {
  const ring = ensureCCW(ringIn); const out = []; const inR = (x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; let F = edgeFrame(a[0], a[1], b[0], b[1]); const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (inR(mx + F.nx * 0.25, mz + F.nz * 0.25)) F = edgeFrame(b[0], b[1], a[0], a[1]); F.i = i; out.push(F); }   // (point-in-ring, not the centroid: concave plans)
  return out;
}
/** Ring pulled toward its centroid by d metres (fine for near-convex footprints). */
export function inset(ring, d) { let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length; return ring.map((p) => { const L = Math.hypot(cx - p[0], cz - p[1]) || 1; return [p[0] + (cx - p[0]) * d / L, p[1] + (cz - p[1]) * d / L]; }); }
/** True offset of a ring: every edge moved d along its outward normal (d < 0: inward), neighbouring edges re-intersected (mitred, capped). */
export function offsetRing(ringIn, d) {
  const ring = ensureCCW(ringIn); const Fs = outFrames(ring); const n = ring.length;
  return ring.map((v, i) => { const A = Fs[(i + n - 1) % n], B = Fs[i]; const k = Math.max(0.35, 1 + A.nx * B.nx + A.nz * B.nz); return [v[0] + d * (A.nx + B.nx) / k, v[1] + d * (A.nz + B.nz) / k]; });
}
/**
 * The top of Tallant Science Center (tiles obliques from the north, north-west and west + nadir, fix round 8): the wall head is a white ledge `ledge`
 * wide at hW; inside it a band of clay barrel tiles slopes up over `run` to a white parapet band at h; the flat roof inside is `roofCol`. Heights
 * local. Visual + collision (the tile slope and the deck; the ledge is the wall prism's own cap).
 */
export function mansard(ctx, ringIn, hW, h, opts = {}) {
  const { B } = ctx; const ring = ensureCCW(ringIn); const n = ring.length; const ledge = opts.ledge ?? 1.3, run = opts.run ?? 1.6, pw = opts.parapet ?? 0.5; const tint = opts.tint || BR_CLAY, wh = opts.white || [0.8, 0.8, 0.78];
  const r1 = offsetRing(ring, -ledge), r2 = offsetRing(ring, -(ledge + run)), r3 = offsetRing(ring, -(ledge + run + pw)); const tl = B.v('shingles', true), pt = B.v('paint', true), col = B.c('concrete'); const sl = Math.hypot(run, h - hW); const Y = (p, y) => [p[0], y, p[1]];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; const L = Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]); const F = edgeFrame(ring[i][0], ring[i][1], ring[j][0], ring[j][1]); let nx = F.nx, nz = F.nz; if ((r1[i][0] - ring[i][0]) * nx + (r1[i][1] - ring[i][1]) * nz > 0) { nx = -nx; nz = -nz; }
    pt.setColor(wh[0], wh[1], wh[2]); quadFacing(pt, Y(ring[i], hW + 0.012), Y(ring[j], hW + 0.012), Y(r1[j], hW + 0.012), Y(r1[i], hW + 0.012), [0, 1, 0]); quadFacing(pt, Y(r2[i], h + 0.004), Y(r2[j], h + 0.004), Y(r3[j], h + 0.004), Y(r3[i], h + 0.004), [0, 1, 0]);
    tl.setColor(tint[0], tint[1], tint[2]); quadFacing(tl, Y(r1[i], hW + 0.012), Y(r1[j], hW + 0.012), Y(r2[j], h + 0.004), Y(r2[i], h + 0.004), [nx, 1, nz], [[0, 0], [L / 3, 0], [L / 3, sl / 3], [0, sl / 3]]); tl.setColor(1, 1, 1);
    quadFacing(col, Y(r1[i], hW), Y(r1[j], hW), Y(r2[j], h), Y(r2[i], h), [nx, 1, nz]); }
  const rc = opts.roofCol || [0.5, 0.5, 0.5]; pt.setColor(rc[0], rc[1], rc[2]); pt.poly(r3, null, h + 0.004, (x, z) => [x / 3, z / 3]); pt.setColor(1, 1, 1); col.poly(r2, null, h, (x, z) => [x / 3, z / 3]);
}
/** Concrete kerb along the edges of a paved outline (a hard edge between paving and planting, rule F42), following the ground.
 * Skipped where the far side is paved too (surfaceAt asphalt / concrete) unless opts.all. No collision (12 cm). */
export function kerb(ctx, ringIn, opts = {}) {
  // (fix round 8) heights from the ground AS DRAWN (terrain.meshHeightAt: the bilinear height is up to a few cm off the mesh on curved ground and buried
  // kerb pieces); opts.step = piece length (walks: 0.5 m, so a kerb stops within a quarter metre of a join); opts.paved(px, pz, s) replaces the
  // surface-class test of the far side (the class map is 1 m cells: beside a walk's own painted strip it broke the kerb at every kink)
  const ring = ensureCCW(ringIn); const w = opts.w || 0.22, hgt = opts.h || 0.12; const pt = ctx.B.v('paint', true); const col = opts.color || [0.5, 0.5, 0.48]; const g = meshY(ctx); const step = opts.step || 1.6;
  const Fs = outFrames(ring), ends = Fs.map(() => [false, false]);
  for (const F of Fs) { const n = Math.max(1, Math.ceil(F.L / step));
    for (let k = 0; k < n; k++) { const u0 = F.L * k / n, u1 = F.L * (k + 1) / n, um = (u0 + u1) / 2; const px = F.ax + F.tx * um + F.nx * 0.9, pz = F.az + F.tz * um + F.nz * 0.9; const s = ctx.surfaceAt(px, pz);
      if (!opts.all && (opts.paved ? opts.paved(px, pz, s) : (s === 'asphalt' || s === 'concrete'))) continue; if (opts.skip && opts.skip(px, pz)) continue; if (opts.off && opts.off(F.ax + F.tx * um, F.az + F.tz * um)) continue;   // (off: the kerb piece itself would lie on other paving, e.g. across a walk)
      if (k === 0) ends[F.i][0] = true; if (k === n - 1) ends[F.i][1] = true;
      const P = (u, o, dy) => { const x = F.ax + F.tx * u + F.nx * o, z = F.az + F.tz * u + F.nz * o; return [x, g(x, z) + dy, z]; };
      pt.setColor(col[0], col[1], col[2]); quadFacing(pt, P(u0, -w / 2, hgt), P(u1, -w / 2, hgt), P(u1, w / 2, hgt), P(u0, w / 2, hgt), [0, 1, 0]);
      pt.setColor(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8); quadFacing(pt, P(u0, w / 2, -0.05), P(u1, w / 2, -0.05), P(u1, w / 2, hgt), P(u0, w / 2, hgt), [F.nx, 0, F.nz]); quadFacing(pt, P(u0, -w / 2, -0.05), P(u1, -w / 2, -0.05), P(u1, -w / 2, hgt), P(u0, -w / 2, hgt), [-F.nx, 0, -F.nz]); } }
  // a mitre cap on every vertex where both edges are kerbed: separate pieces left an open wedge on the outside of each bend
  const nR = ring.length; for (let i = 0; i < nR; i++) { const A = Fs[(i + nR - 1) % nR], Bf = Fs[i]; const flipA = Math.hypot(A.ax - ring[i][0], A.az - ring[i][1]) < 1e-6, flipB = Math.hypot(Bf.ax - ring[i][0], Bf.az - ring[i][1]) > 1e-6;
    if (!ends[A.i][flipA ? 0 : 1] || !ends[Bf.i][flipB ? 1 : 0]) continue; const v = ring[i]; const dt = A.nx * Bf.nx + A.nz * Bf.nz; if (dt > 0.9995 || dt < -0.2) continue; const k = 1 + dt; const mx = (A.nx + Bf.nx) / k, mz = (A.nz + Bf.nz) / k;
    const Q = (ox, oz, dy) => [v[0] + ox, g(v[0] + ox, v[1] + oz) + dy, v[1] + oz]; const h2 = w / 2; pt.setColor(col[0], col[1], col[2]);
    quadFacing(pt, Q(A.nx * h2, A.nz * h2, hgt), Q(mx * h2, mz * h2, hgt), Q(Bf.nx * h2, Bf.nz * h2, hgt), Q(-mx * h2, -mz * h2, hgt), [0, 1, 0]); pt.setColor(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8);
    quadFacing(pt, Q(A.nx * h2, A.nz * h2, -0.05), Q(mx * h2, mz * h2, -0.05), Q(mx * h2, mz * h2, hgt), Q(A.nx * h2, A.nz * h2, hgt), [A.nx, 0, A.nz]); quadFacing(pt, Q(mx * h2, mz * h2, -0.05), Q(Bf.nx * h2, Bf.nz * h2, -0.05), Q(Bf.nx * h2, Bf.nz * h2, hgt), Q(mx * h2, mz * h2, hgt), [Bf.nx, 0, Bf.nz]); }
  pt.setColor(1, 1, 1);
}
/** The ground as drawn and collided (the mesh's own triangles), falling back to the builder's bilinear height. */
export const meshY = (ctx) => (ctx.terrain && ctx.terrain.meshHeightAt ? ctx.terrain.meshHeightAt : (x, z) => (ctx.groundY ? ctx.groundY(x, z) : 0));
/** Ear-clipping triangulation of a simple ring (either winding): [[a, b, c], ...]. */
export function earclip(ring) {
  let ar = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; ar += p[0] * q[1] - q[0] * p[1]; } const sg = ar >= 0 ? 1 : -1;
  const cr = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * sg; const idx = ring.map((_, i) => i); const out = []; let guard = 0;
  const inT = (p, a, b, c) => cr(a, b, p) > 1e-9 && cr(b, c, p) > 1e-9 && cr(c, a, p) > 1e-9;
  while (idx.length > 3 && guard++ < 4000) { let done = false, flat = -1, fv = 1e-7;
    for (let i = 0; i < idx.length; i++) { const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length]; const a = ring[ia], b = ring[ib], c = ring[ic]; const k = cr(a, b, c);
      if (Math.abs(k) < fv) { fv = Math.abs(k); flat = i; } if (k <= 1e-9) continue; if (idx.some((j) => j !== ia && j !== ib && j !== ic && inT(ring[j], a, b, c))) continue;
      out.push([a, b, c]); idx.splice(i, 1); done = true; break; }
    if (!done) { if (flat >= 0) idx.splice(flat, 1); else break; } }
  if (idx.length === 3) out.push(idx.map((k) => ring[k])); return out;
}
/**
 * A paved surface draped on the ground: the outline is cut into 1 m cells (clipped to the outline) and every vertex takes the drawn
 * ground height + dy, so paving that runs off its level pad onto a graded street edge or down a gentle slope neither floats nor
 * sinks (the arts court: its west end meets the drive 0.35 m higher, its south strip falls 0.7 m to the music hall).
 */
export function drapePoly(ctx, bucket, ringIn, dy, uvFn) {
  // (fix round 8, rules E22 / B12) the paving is cut along the ground mesh's OWN triangles (terrain.lattice: every cell split on its (a, b)-(a+1, b+1)
  // diagonal) and takes terrain.meshHeightAt, so it lies exactly dy above the drawn ground everywhere. Cutting it into 1 m cells on the bilinear height
  // let the ground poke through wherever a pad's blend bent it (a translucent patch at the kink of the Bridge walk, a smear across the patio walk).
  const ring = ensureCCW(ringIn); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const lat = ctx.terrain && ctx.terrain.lattice; const H = meshY(ctx);
  const cuts = (arr, lo, hi) => { const o = []; if (arr && arr.length > 1 && lo >= arr[0] && hi <= arr[arr.length - 1]) { let i = 0; while (i < arr.length - 2 && arr[i + 1] <= lo) i++; for (; i < arr.length; i++) { o.push(arr[i]); if (arr[i] >= hi) break; } } else for (let v = Math.floor(lo); v < hi + 1; v++) o.push(v); return o; };
  const xs = cuts(lat && lat.xs, x0, x1), zs = cuts(lat && lat.zs, z0, z1);
  const clip = (poly, a, b, c) => { const o = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; const dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c; if (dp >= 0) o.push(p); if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); o.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return o; };
  const V = (p) => [p[0], H(p[0], p[1]) + dy, p[1]];
  const emit = (poly) => { if (poly.length < 3) return; let ar = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; ar += p[0] * q[1] - q[0] * p[1]; } if (Math.abs(ar) < 1e-5) return;
    const v0 = V(poly[0]); for (let i = 1; i < poly.length - 1; i++) { const a = V(poly[i]), b = V(poly[i + 1]); const ux = a[0] - v0[0], uz = a[2] - v0[2], vx = b[0] - v0[0], vz = b[2] - v0[2]; if (Math.abs(ux * vz - uz * vx) < 1e-7) continue;
      if (uz * vx - ux * vz >= 0) bucket.tri(v0, a, b, uvFn(v0[0], v0[2]), uvFn(a[0], a[2]), uvFn(b[0], b[2])); else bucket.tri(v0, b, a, uvFn(v0[0], v0[2]), uvFn(b[0], b[2]), uvFn(a[0], a[2])); } };
  for (const tri of earclip(ring)) { let tx0 = Infinity, tz0 = Infinity, tx1 = -Infinity, tz1 = -Infinity; for (const p of tri) { tx0 = Math.min(tx0, p[0]); tx1 = Math.max(tx1, p[0]); tz0 = Math.min(tz0, p[1]); tz1 = Math.max(tz1, p[1]); }
    for (let j = 0; j < zs.length - 1; j++) { const za = zs[j], zb = zs[j + 1]; if (zb <= tz0 || za >= tz1) continue;
      for (let i = 0; i < xs.length - 1; i++) { const xa = xs[i], xb = xs[i + 1]; if (xb <= tx0 || xa >= tx1) continue;
        let poly = clip(tri, 1, 0, xa); if (poly.length < 3) continue; poly = clip(poly, -1, 0, -xb); if (poly.length < 3) continue; poly = clip(poly, 0, 1, za); if (poly.length < 3) continue; poly = clip(poly, 0, -1, -zb); if (poly.length < 3) continue;
        // the cell's diagonal runs from (xa, za) to (xb, zb): v >= u on one side (terrain.js meshHeightAt)
        const dx = xb - xa, dz = zb - za; const c0 = -dz * xa + dx * za; emit(clip(poly, -dz, dx, c0)); emit(clip(poly, dz, -dx, -c0)); } } }
}
/** Closed ring round a polyline of width w (for kerbing a drive drawn as a line). */
export function lineRing(pts, w) {   // (fix round 8: mitred joins, so a walk keeps its full width round a kink)
  const L = [], R = [], n = pts.length;
  for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], p = pts[i], b = pts[Math.min(n - 1, i + 1)]; let ax = p[0] - a[0], az = p[1] - a[1], bx = b[0] - p[0], bz = b[1] - p[1]; let la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 1e-9) { ax = bx; az = bz; la = lb; } if (lb < 1e-9) { bx = ax; bz = az; lb = la; } ax /= la || 1; az /= la || 1; bx /= lb || 1; bz /= lb || 1; let mx = ax + bx, mz = az + bz; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const hw = w / 2 / Math.max(0.45, mx * ax + mz * az); L.push([p[0] - mz * hw, p[1] + mx * hw]); R.push([p[0] + mz * hw, p[1] - mx * hw]); }
  return [...L, ...R.reverse()]; }
