// Pitched roof over an arbitrary footprint, shared by the campus kits (each kit passes its own hipRoof).
//
// A roof is only opaque if it is a union of CLOSED convex pieces: the footprint is covered with a few maximal rectangles
// (in the frame of its oriented bounding box), every rectangle gets an ordinary hip roof at the same pitch, and the
// pieces simply intersect (the valleys between a house and its wing fall out of the depth buffer). A flat deck at the
// eave closes whatever the rectangles do not reach (slanted corners, slivers).
// Do NOT go back to "every eave edge rises to one ridge line": on L / T / U plans that folds faces over the yard,
// leaves vertical steps with arbitrary winding and shows the sky through the roof (see MAP_NOTES.md).
import { ensureCCW } from '../world/util.js';

// polygon cross-section at b = const: sorted [a0, a1] intervals
function cross(Q, b) {
  const xs = [];
  for (let i = 0; i < Q.length; i++) { const p = Q[i], q = Q[(i + 1) % Q.length]; if ((p[1] > b) !== (q[1] > b)) xs.push(p[0] + (b - p[1]) / (q[1] - p[1]) * (q[0] - p[0])); }
  xs.sort((x, y) => x - y); const iv = []; for (let i = 0; i + 1 < xs.length; i += 2) iv.push([xs[i], xs[i + 1]]);
  return iv;
}
function isect(A, B) {
  const out = []; for (const [a0, a1] of A) for (const [b0, b1] of B) { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (hi - lo > 0.05) out.push([lo, hi]); }
  return out;
}
// rectangles from the slabs between consecutive vertex levels, each grown through the neighbouring slabs that still
// contain it (tol: how far a rectangle may poke past a small jog in the wall)
function slabRects(Q, tol) {
  const lv = []; for (const b of Q.map((p) => p[1]).sort((x, y) => x - y)) if (!lv.length || b - lv[lv.length - 1] > 0.02) lv.push(b);
  const slabs = [];
  for (let i = 0; i + 1 < lv.length; i++) {
    const b0 = lv[i], b1 = lv[i + 1], e = Math.min(0.05, (b1 - b0) / 4);
    let iv = cross(Q, b0 + e); for (const b of [(b0 + b1) / 2, b1 - e]) iv = isect(iv, cross(Q, b));
    slabs.push({ b0, b1, iv });
  }
  const rects = [];
  slabs.forEach((s, i) => {
    for (const [a0, a1] of s.iv) {
      if (a1 - a0 < 0.8) continue;
      const fits = (k) => slabs[k].iv.some(([c0, c1]) => c0 <= a0 + tol && c1 >= a1 - tol);
      let lo = i, hi = i; while (lo > 0 && fits(lo - 1)) lo--; while (hi < slabs.length - 1 && fits(hi + 1)) hi++;
      rects.push({ a0, a1, b0: slabs[lo].b0, b1: slabs[hi].b1 });
    }
  });
  return rects;
}
/** Cover `ring` ([x, z] list) with up to `max` maximal rectangles { u0, u1, v0, v1 } in the frame (tx, tz) of `o`. */
export function roofRects(ring, o, { minSide = 1.8, tol = 0.35, max = 6 } = {}) {
  const P = ring.map(([x, z]) => [x * o.tx + z * o.tz, -x * o.tz + z * o.tx]); const all = [];
  for (const r of slabRects(P, tol)) all.push({ u0: r.a0, u1: r.a1, v0: r.b0, v1: r.b1 });
  for (const r of slabRects(P.map(([u, v]) => [v, u]), tol)) all.push({ u0: r.b0, u1: r.b1, v0: r.a0, v1: r.a1 });
  const area = (r) => (r.u1 - r.u0) * (r.v1 - r.v0);
  all.sort((p, q) => area(q) - area(p)); const keep = [];
  for (const r of all) {
    if (Math.min(r.u1 - r.u0, r.v1 - r.v0) < minSide) continue;
    // skip what an already kept rectangle mostly covers
    if (keep.some((k) => Math.max(0, Math.min(r.u1, k.u1) - Math.max(r.u0, k.u0)) * Math.max(0, Math.min(r.v1, k.v1) - Math.max(r.v0, k.v0)) > 0.8 * area(r))) continue;
    // eave lines that nearly coincide with one of a bigger piece are made the same line: the two roofs then share planes
    // exactly instead of lying a few centimetres apart (a faint step across the slope)
    for (const k of keep) for (const [e, es] of [['u0', ['u0', 'u1']], ['u1', ['u0', 'u1']], ['v0', ['v0', 'v1']], ['v1', ['v0', 'v1']]]) for (const f of es) if (Math.abs(r[e] - k[f]) < tol + 0.05) r[e] = k[f];
    if (Math.min(r.u1 - r.u0, r.v1 - r.v0) < minSide) continue;
    keep.push(r); if (keep.length >= max) break;
  }
  return keep;
}

/**
 * hipRoof(ctx, box, eaveY, rise, opts) is the kit's own builder; it must honour opts.caps === false and opts.planeUV
 * (uv from the face plane / world, so coplanar faces and soffits of two pieces carry the same texture and do not shimmer).
 * opts: tint, overhang, noCollision, fill (solid attic, where the kit's hipRoof has it), bucket (roofing material key instead of 'shingles':
 * a campus pack's keyed tile; handed on to hipRoof as opts.bucket).
 */
export function polyRoofOf(hipRoof, minAreaOBB, ctx, ringIn, eaveY, rise, opts = {}) {
  const { B } = ctx; const ring = ensureCCW(ringIn); const o = minAreaOBB(ring); if (!o) return;
  const ov = opts.overhang === undefined ? 0.5 : opts.overhang; const t = opts.tint; const uvS = 1 / 3;
  const rects = roofRects(ring, o);
  if (!rects.length) { hipRoof(ctx, o, eaveY, rise, { tint: t, overhang: ov, noCollision: opts.noCollision, bucket: opts.bucket }); return; }   // nothing rectangular in it: one closed hip over the lot
  const bucket = B.v(opts.bucket || 'shingles', true); bucket.setColor(t[0], t[1], t[2]);
  // deck at the eave over the footprint: seen only where no rectangle reaches (it lies on the collision cap of the wall
  // prism, so it is solid wherever it shows). The overhangs are closed by each piece's own soffit.
  bucket.poly(ring, null, eaveY + 0.01, (x, z) => [x * uvS, z * uvS]);
  // equal pitch: the widest piece gets `rise`, narrower wings end lower
  const hwOf = (r) => Math.min(r.u1 - r.u0, r.v1 - r.v0) / 2 + ov; const pitch = rise / Math.max(...rects.map(hwOf));
  for (const r of rects) hipRoof(ctx, { tx: o.tx, tz: o.tz, u0: r.u0, u1: r.u1, v0: r.v0, v1: r.v1 }, eaveY, pitch * hwOf(r), { tint: t, overhang: ov, noCollision: opts.noCollision, fill: opts.fill, caps: false, planeUV: true, bucket: opts.bucket });
  // ridge / hip caps, only where the line is a real crease of the combined roof (not where it runs across or inside
  // another piece)
  const hAt = (r, u, v) => { const d = Math.min(u - r.u0 + ov, r.u1 + ov - u, v - r.v0 + ov, r.v1 + ov - v); return d < 0 ? -1e9 : pitch * d; };
  const top = (u, v) => { let h = -1e9; for (const r of rects) h = Math.max(h, hAt(r, u, v)); return h; };
  const W = (u, v, y) => [u * o.tx - v * o.tz, y, u * o.tz + v * o.tx];
  bucket.setColor(t[0] * 0.8, t[1] * 0.8, t[2] * 0.8);
  for (const r of rects) {
    const U0 = r.u0 - ov, U1 = r.u1 + ov, V0 = r.v0 - ov, V1 = r.v1 + ov, hw = hwOf(r); const long = U1 - U0 >= V1 - V0;
    const ra = long ? [U0 + hw, (V0 + V1) / 2] : [(U0 + U1) / 2, V0 + hw], rb = long ? [U1 - hw, (V0 + V1) / 2] : [(U0 + U1) / 2, V1 - hw];
    const segs = [[ra, rb, 0.14]];
    for (const c of [[U0, V0], [U1, V0], [U1, V1], [U0, V1]]) segs.push([c, Math.hypot(c[0] - ra[0], c[1] - ra[1]) <= Math.hypot(c[0] - rb[0], c[1] - rb[1]) ? ra : rb, 0.12]);
    for (const [p, q, rad] of segs) {
      const du = q[0] - p[0], dv = q[1] - p[1], L = Math.hypot(du, dv); if (L < 0.05) continue; const nu = -dv / L * 0.35, nv = du / L * 0.35;
      const crease = [0.25, 0.5, 0.75].some((k) => { const u = p[0] + du * k, v = p[1] + dv * k; return [-1, 1].every((s) => hAt(r, u + s * nu, v + s * nv) >= top(u + s * nu, v + s * nv) - 0.03); });
      if (crease) bucket.tube(W(p[0], p[1], eaveY + Math.max(0, hAt(r, p[0], p[1]))), W(q[0], q[1], eaveY + Math.max(0, hAt(r, q[0], q[1]))), rad, 5, 1);
    }
  }
  bucket.setColor(1, 1, 1);
  return { rects, pitch };
}

// ---- eaves next to a neighbour
function segDist(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz || 1e-9; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); }
function ringGap(A, B) { let d = 1e9; for (const [P, Q] of [[A, B], [B, A]]) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i], Q[(i + 1) % Q.length])); return d; }
/**
 * Overhang for a pitched roof on `ring` that keeps the slot between its eaves and the nearest other building (which may
 * overhang as much) at least `slot` wide: two eaves 0.5 - 0.9 m apart are a wedge a player slides into from the roof
 * and cannot leave (the capsule is 0.7 m wide). Far from any neighbour this is just `want`.
 */
export function eaveOverhang(ring, others, want, slot = 1.1, min = 0.1) {
  let gap = 1e9; for (const r of others) { if (r === ring || (r.length === ring.length && r[0][0] === ring[0][0] && r[0][1] === ring[0][1])) continue; gap = Math.min(gap, ringGap(ring, r)); if (gap < 0.01) break; }
  return Math.max(min, Math.min(want, (gap - slot) / 2));
}
