// Gameplay cover that is also plausible scenery: parked cars, school buses, dumpsters, containers, barriers,
// benches, athletic equipment. Everything is merged into the shared static buckets and added to collision.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { bleachers, fence } from './landmarks.js';

// Optional prop registry for the map check (dev/mapcheck.html): footprint boxes of placed props, in Bucket.box terms
// (centre, size along local x / z, rotY). Purely informational: nothing in the game reads it.
// y: base height the prop was built at (the Builder ground offset: 0 on flat campuses, the ground under it with terrain)
export function registerProp(ctx, kind, x, z, rot, sx, sz, h) { (ctx.props || (ctx.props = [])).push({ kind, x, z, rot, sx, sz, h, y: ctx.B?.off?.y || 0 }); }

// ------------------------------------------------------------------------------------------ cars
const CAR_TYPES = {
  sedan: {
    L: 4.7, W: 1.82, H: 1.45,
    st: [[-2.36, 0.6, 0.84], [-2.3, 0.86, 0.96], [-1.75, 0.97, 1], [-1.2, 1.0, 1], [0.95, 0.97, 1], [1.2, 0.93, 1], [2.15, 0.77, 0.98], [2.33, 0.62, 0.9], [2.37, 0.5, 0.82]],
    cab: { xr: -1.3, xf: 1.05, rr: -0.72, rf: 0.32, roof: 1.45, belt: 0.98 }, wheels: [-1.42, 1.42], wr: 0.33,
  },
  suv: {
    L: 4.75, W: 1.9, H: 1.72,
    st: [[-2.38, 0.7, 0.86], [-2.33, 1.0, 0.97], [-1.8, 1.08, 1], [0.9, 1.06, 1], [1.2, 1.03, 1], [2.15, 0.92, 0.98], [2.34, 0.74, 0.92], [2.38, 0.56, 0.84]],
    cab: { xr: -2.28, xf: 1.05, rr: -2.02, rf: 0.38, roof: 1.72, belt: 1.07 }, wheels: [-1.42, 1.45], wr: 0.37,
  },
  hatch: {
    L: 4.2, W: 1.76, H: 1.5,
    st: [[-2.1, 0.62, 0.86], [-2.05, 0.92, 0.97], [-1.6, 0.99, 1], [0.8, 0.97, 1], [1.05, 0.93, 1], [1.92, 0.78, 0.98], [2.08, 0.62, 0.9], [2.12, 0.5, 0.82]],
    cab: { xr: -2.0, xf: 0.9, rr: -1.55, rf: 0.2, roof: 1.5, belt: 0.98 }, wheels: [-1.3, 1.28], wr: 0.32,
  },
};

function buildCarTemplate(t) {
  const hw = t.W / 2, yb = 0.24;
  // ---- body shell: loft cross-sections along x, smooth normals
  const pos = [], idx = []; const NS = 9;
  const sec = (x, yTop, ws) => {
    const w = hw * ws; const ym = yb + (yTop - yb) * 0.45;
    return [[x, yb, -w * 0.94], [x, ym, -w], [x, yTop - 0.07, -w * 0.97], [x, yTop, -w * 0.84], [x, yTop + 0.025, 0], [x, yTop, w * 0.84], [x, yTop - 0.07, w * 0.97], [x, ym, w], [x, yb, w * 0.94]];
  };
  const secs = t.st.map(([x, y, ws]) => sec(x, y, ws));
  for (const s of secs) for (const p of s) pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < secs.length - 1; i++) for (let k = 0; k < NS - 1; k++) { const a = i * NS + k, b = a + 1, c = a + NS + 1, d = a + NS; idx.push(a, b, c, a, c, d); }
  // end caps: closed fans on their own vertices (flat bumper faces; the old open fan left a notch under the plate with
  // the lower corners hanging like flaps), and a floor pan so the shell is not see-through from low angles
  const cap = (i, flip) => {
    const base = pos.length / 3; for (const p of secs[i]) pos.push(p[0], p[1], p[2]);
    const ci = pos.length / 3; let cy = 0; for (const p of secs[i]) cy += p[1]; cy /= NS; pos.push(secs[i][0][0], cy, 0);
    for (let k = 0; k < NS; k++) { const k1 = (k + 1) % NS; if (flip) idx.push(ci, base + k1, base + k); else idx.push(ci, base + k, base + k1); }
  };
  cap(0, true); cap(secs.length - 1, false);
  for (let i = 0; i < secs.length - 1; i++) {
    const base = pos.length / 3; for (const p of [secs[i][NS - 1], secs[i][0], secs[i + 1][0], secs[i + 1][NS - 1]]) pos.push(p[0], p[1], p[2]);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setIndex(idx); body.computeVertexNormals();
  body.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  // make sure the shell faces outward (check one triangle against the centre)
  {
    const p = body.attributes.position, n = body.attributes.normal; let dot = 0;
    for (let i = 0; i < p.count; i++) dot += n.getY(i) * (p.getY(i) - 0.6) + n.getZ(i) * p.getZ(i);
    if (dot < 0) { const ix = body.index.array; for (let i = 0; i < ix.length; i += 3) { const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; } body.computeVertexNormals(); }
  }
  // ---- cabin: painted roof + pillars frame, glass panels
  const c = t.cab; const bw = hw * 0.93, rw = hw * 0.76;
  const paint = [], glass = [];
  const quad = (arr, a, b, cc, d) => { arr.push(a, b, cc, a, cc, d); };
  const A = (x, y, z) => [x, y, z];
  const y0 = c.belt - 0.03, y1 = c.roof;
  // roof (slightly crowned via centre strip)
  quad(paint, A(c.rr, y1, -rw), A(c.rr, y1 + 0.02, 0), A(c.rf, y1 + 0.02, 0), A(c.rf, y1, -rw));
  quad(paint, A(c.rr, y1 + 0.02, 0), A(c.rr, y1, rw), A(c.rf, y1, rw), A(c.rf, y1 + 0.02, 0));
  // windshield + rear glass (inset frames are painted)
  const lerp3 = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
  const framed = (p0, p1, p2, p3, inset) => {
    // p0..p3 around the panel; glass = inset quad, paint = 4 border strips
    const ctr = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4, (p0[1] + p1[1] + p2[1] + p3[1]) / 4, (p0[2] + p1[2] + p2[2] + p3[2]) / 4];
    const g = [p0, p1, p2, p3].map((p) => lerp3(p, ctr, inset));
    quad(glass, g[0], g[1], g[2], g[3]);
    quad(paint, p0, p1, g[1], g[0]); quad(paint, p1, p2, g[2], g[1]); quad(paint, p2, p3, g[3], g[2]); quad(paint, p3, p0, g[0], g[3]);
  };
  framed(A(c.xf, y0, bw), A(c.xf, y0, -bw), A(c.rf, y1, -rw), A(c.rf, y1, rw), 0.1);          // windshield (faces +x)
  framed(A(c.xr, y0, -bw), A(c.xr, y0, bw), A(c.rr, y1, rw), A(c.rr, y1, -rw), 0.12);         // rear glass
  for (const sgn of [-1, 1]) {
    // side: split into front/rear door windows with a B pillar
    const xm = (c.rr + c.rf) / 2 - 0.05, pb = 0.06;
    const s0 = A(c.xr, y0, sgn * bw), s1 = A(xm - pb, y0, sgn * bw), s2 = A(xm - pb, y1, sgn * rw), s3 = A(c.rr, y1, sgn * rw);
    const f0 = A(xm + pb, y0, sgn * bw), f1 = A(c.xf, y0, sgn * bw), f2 = A(c.rf, y1, sgn * rw), f3 = A(xm + pb, y1, sgn * rw);
    if (sgn > 0) { framed(s0, s1, s2, s3, 0.13); framed(f0, f1, f2, f3, 0.13); quad(paint, s1, f0, f3, s2); }
    else { framed(s1, s0, s3, s2, 0.13); framed(f1, f0, f3, f2, 0.13); quad(paint, f0, s1, s2, f3); }
  }
  const toGeo = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr.flat(), 3)); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(arr.length * 2), 2)); return g; };
  return { body, cabPaint: toGeo(paint), glass: toGeo(glass), t };
}

const CAR_COLORS = [[0.85, 0.85, 0.84], [0.85, 0.85, 0.84], [0.03, 0.03, 0.035], [0.03, 0.03, 0.035], [0.5, 0.52, 0.54], [0.5, 0.52, 0.54], [0.2, 0.21, 0.23], [0.06, 0.12, 0.3], [0.42, 0.04, 0.04], [0.1, 0.2, 0.14], [0.55, 0.5, 0.42], [0.09, 0.2, 0.4]];

function placeCar(ctx, tpl, x, z, heading, color) {
  // heading: direction the car's nose (+x local) points, as atan2(-dz, dx) (Bucket.box rotY convention)
  const { B } = ctx; const t = tpl.t;
  const m = new THREE.Matrix4().makeRotationY(heading).setPosition(x, 0, z);
  B.v('gloss', true).setColor(color[0], color[1], color[2]).addGeometry(tpl.body, m).addGeometry(tpl.cabPaint, m);
  B.v('carGlass').addGeometry(tpl.glass, m);
  const c = Math.cos(heading), s = Math.sin(heading); const Wp = (u, y, d) => [x + u * c + d * s, y, z - u * s + d * c];
  const p = B.v('paint', true), rub = B.v('rubber');
  for (const wx of t.wheels) for (const sgn of [-1, 1]) {
    // the body has no arch cut-outs, so the wheel sits slightly proud with a dark arch disc behind it
    const a = Wp(wx, t.wr, sgn * (t.W / 2 - 0.22)), b = Wp(wx, t.wr, sgn * (t.W / 2 + 0.035));
    rub.tube(a, b, t.wr, 14);
    const disc = (r, col, dOut, cy, yMin = -1) => {
      p.setColor(col[0], col[1], col[2]); const ctr = Wp(wx, cy, sgn * (t.W / 2 + dOut));
      for (let k = 0; k < 14; k++) {
        const a0 = (k / 14) * Math.PI * 2, a1 = ((k + 1) / 14) * Math.PI * 2;
        const P = (ang) => [ctr[0] + Math.cos(ang) * r * c, Math.max(yMin, ctr[1] + Math.sin(ang) * r), ctr[2] - Math.cos(ang) * r * s];
        if (sgn > 0) p.tri(ctr, P(a0), P(a1)); else p.tri(ctr, P(a1), P(a0));
      }
    };
    disc(t.wr + 0.075, [0.015, 0.015, 0.015], 0.012, t.wr + 0.03, 0.24);   // arch shadow (stops at the sill: below it the disc hung in the air beside the tyre)
    disc(t.wr, [0.03, 0.03, 0.03], 0.036, t.wr);                      // tyre sidewall
    disc(t.wr * 0.6, [0.3, 0.31, 0.33], 0.04, t.wr);                // alloy
    disc(t.wr * 0.2, [0.1, 0.1, 0.1], 0.044, t.wr);
  }
  // lights, grille, plates
  const front = t.st[t.st.length - 2], rear = t.st[1];
  B.v('lightEmit').box(...Wp(front[0] + 0.015, front[1] - 0.06, -t.W * 0.33), 0.06, 0.11, 0.36, heading).box(...Wp(front[0] + 0.015, front[1] - 0.06, t.W * 0.33), 0.06, 0.11, 0.36, heading);
  p.setColor(0.02, 0.02, 0.02); p.box(...Wp(front[0] + 0.03, front[1] - 0.2, 0), 0.05, 0.16, t.W * 0.42, heading);
  p.setColor(0.5, 0.02, 0.02); p.box(...Wp(rear[0] - 0.02, rear[1] - 0.08, -t.W * 0.34), 0.06, 0.12, 0.36, heading).box(...Wp(rear[0] - 0.02, rear[1] - 0.08, t.W * 0.34), 0.06, 0.12, 0.36, heading);
  p.setColor(0.85, 0.85, 0.8); p.box(...Wp(rear[0] - 0.045, rear[1] - 0.26, 0), 0.02, 0.13, 0.32, heading);
  B.c('metal').box(x, t.cab.belt / 2 + 0.1, z, t.L, t.cab.belt, t.W, heading);
  registerProp(ctx, 'car', x, z, heading, t.L, t.W, t.H);
  const cm = Wp((t.cab.rr + t.cab.rf) / 2, 0, 0); B.c('glass').box(cm[0], (t.cab.belt + t.H) / 2 + 0.05, cm[2], (t.cab.xf - t.cab.xr) * 0.82, t.H - t.cab.belt, t.W * 0.84, heading);
}

function placeBus(ctx, x, z, heading) {
  const { B } = ctx; const c = Math.cos(heading), s = Math.sin(heading); const Wp = (u, y, d) => [x + u * c + d * s, y, z - u * s + d * c];
  const Y = [0.93, 0.62, 0.04], K = [0.03, 0.03, 0.03];
  const g = B.v('gloss', true); const p = B.v('paint', true);
  g.setColor(...Y).box(...Wp(-1.0, 1.9, 0), 9.4, 2.3, 2.44, heading);          // body
  g.box(...Wp(4.55, 1.35, 0), 1.7, 1.2, 2.2, heading);                           // hood
  g.setColor(0.95, 0.95, 0.93).box(...Wp(-1.0, 3.1, 0), 9.2, 0.12, 2.2, heading); // white roof cap
  p.setColor(...K);
  for (const y of [1.05, 1.45, 1.85]) for (const sd of [-1, 1]) p.box(...Wp(-1.0, y, sd * 1.225), 9.42, 0.06, 0.02, heading);
  p.box(...Wp(5.45, 0.65, 0), 0.18, 0.3, 2.44, heading); p.box(...Wp(-5.75, 0.65, 0), 0.18, 0.3, 2.44, heading);
  p.box(...Wp(5.41, 1.3, 0), 0.04, 0.7, 1.3, heading);                           // grille
  const gl = B.v('carGlass');
  for (const sd of [-1, 1]) gl.box(...Wp(-1.2, 2.45, sd * 1.228), 8.4, 0.72, 0.02, heading);
  for (let u = -5.2; u < 3.2; u += 0.76) for (const sd of [-1, 1]) p.box(...Wp(u, 2.45, sd * 1.235), 0.05, 0.74, 0.02, heading);
  gl.box(...Wp(3.72, 2.35, 0), 0.04, 1.05, 2.1, heading); gl.box(...Wp(-5.71, 2.4, 0), 0.04, 0.8, 1.6, heading);
  B.v('lightEmit').box(...Wp(5.42, 1.2, -0.85), 0.05, 0.2, 0.25, heading).box(...Wp(5.42, 1.2, 0.85), 0.05, 0.2, 0.25, heading);
  p.setColor(0.6, 0.03, 0.03).box(...Wp(-5.72, 1.3, -0.9), 0.04, 0.22, 0.22, heading).box(...Wp(-5.72, 1.3, 0.9), 0.04, 0.22, 0.22, heading).box(...Wp(-5.72, 2.95, -0.75), 0.04, 0.2, 0.2, heading).box(...Wp(-5.72, 2.95, 0.75), 0.04, 0.2, 0.2, heading);
  for (const wx of [-3.6, 3.9]) for (const sd of [-1, 1]) { B.v('rubber').tube(Wp(wx, 0.5, sd * 0.85), Wp(wx, 0.5, sd * 1.24), 0.5, 12); p.setColor(...K).box(...Wp(wx, 0.5, sd * 1.245), 0.9, 0.9, 0.01, heading); p.setColor(0.9, 0.62, 0.05).box(...Wp(wx, 0.5, sd * 1.25), 0.42, 0.42, 0.012, heading); }
  p.setColor(...K).box(...Wp(-1, 0.62, 0), 9.2, 0.3, 2.3, heading);
  B.c('metal').box(...Wp(-1.0, 1.6, 0), 9.4, 3.1, 2.44, heading); B.c('metal').box(...Wp(4.55, 1.0, 0), 1.9, 1.9, 2.3, heading);
  { const bc = Wp(-0.3, 0, 0); registerProp(ctx, 'bus', bc[0], bc[2], heading, 10.8, 2.44, 3.2); }
}

// ------------------------------------------------------------------------------------------ small props
function dumpster(ctx, x, z, rot, col = [0.1, 0.25, 0.16]) {
  const { B } = ctx; const p = B.v('paint', true);
  p.setColor(...col).box(x, 0.72, z, 2.0, 1.25, 1.3, rot); p.setColor(0.04, 0.04, 0.04).box(x, 1.4, z, 2.06, 0.1, 1.36, rot);
  p.setColor(col[0] * 0.6, col[1] * 0.6, col[2] * 0.6).box(x, 0.72, z, 2.08, 0.1, 1.38, rot);
  B.c('metal').box(x, 0.72, z, 2.0, 1.45, 1.3, rot);
  registerProp(ctx, 'dumpster', x, z, rot, 2.0, 1.3, 1.45);
}
function container(ctx, x, z, rot, col) {
  const { B } = ctx; const g = B.v('paint', true); const c = Math.cos(rot), s = Math.sin(rot);
  g.setColor(...col).box(x, 1.3, z, 6.06, 2.59, 2.44, rot);
  g.setColor(col[0] * 0.7, col[1] * 0.7, col[2] * 0.7);
  for (let u = -2.8; u <= 2.81; u += 0.35) for (const sd of [-1, 1]) g.box(x + u * c + sd * 1.235 * s, 1.3, z - u * s + sd * 1.235 * c, 0.12, 2.4, 0.03, rot);
  B.v('galv').box(x + 3.04 * c, 1.3, z - 3.04 * s, 0.04, 2.3, 0.05, rot).box(x + 3.04 * c + 0.5 * s, 1.3, z - 3.04 * s + 0.5 * c, 0.04, 2.3, 0.05, rot).box(x + 3.04 * c - 0.5 * s, 1.3, z - 3.04 * s - 0.5 * c, 0.04, 2.3, 0.05, rot);
  B.c('metal').box(x, 1.3, z, 6.06, 2.6, 2.44, rot);
  registerProp(ctx, 'container', x, z, rot, 6.06, 2.44, 2.6);
}
function barrier(ctx, x, z, rot, len = 3.0) {
  const { B } = ctx;
  B.v('concrete').box(x, 0.2, z, len, 0.4, 0.6, rot, 1 / 3).box(x, 0.62, z, len, 0.45, 0.3, rot, 1 / 3);
  B.c('concrete').box(x, 0.42, z, len, 0.85, 0.5, rot);
  registerProp(ctx, 'barrier', x, z, rot, len, 0.6, 0.85);
}
function bench(ctx, x, z, rot) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot);
  B.v('wood').box(x, 0.45, z, 1.8, 0.06, 0.45, rot, 0.5).box(x - 0.2 * s, 0.75, z - 0.2 * c, 1.8, 0.35, 0.05, rot, 0.5);
  B.v('blackMetal').box(x - 0.8 * c, 0.22, z + 0.8 * s, 0.06, 0.45, 0.45, rot).box(x + 0.8 * c, 0.22, z - 0.8 * s, 0.06, 0.45, 0.45, rot);
  B.c('wood').box(x, 0.45, z, 1.8, 0.9, 0.5, rot);
  registerProp(ctx, 'bench', x, z, rot, 1.8, 0.5, 0.9);
}
function picnicTable(ctx, x, z, rot) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot);
  B.v('wood').box(x, 0.75, z, 1.9, 0.05, 0.8, rot, 0.5).box(x + 0.65 * s, 0.45, z + 0.65 * c, 1.9, 0.05, 0.28, rot, 0.5).box(x - 0.65 * s, 0.45, z - 0.65 * c, 1.9, 0.05, 0.28, rot, 0.5);
  B.v('galv').box(x - 0.7 * c, 0.37, z + 0.7 * s, 0.06, 0.74, 1.5, rot).box(x + 0.7 * c, 0.37, z - 0.7 * s, 0.06, 0.74, 1.5, rot);
  B.c('wood').box(x, 0.4, z, 1.9, 0.8, 1.6, rot);
  registerProp(ctx, 'picnicTable', x, z, rot, 1.9, 1.6, 0.8);
}
function trashCan(ctx, x, z) { const { B } = ctx; B.v('blackMetal').cyl(x, 0, z, 0.3, 0.33, 0.95, 10, 1, true); B.c('metal').box(x, 0.5, z, 0.6, 1.0, 0.6); registerProp(ctx, 'trashCan', x, z, 0, 0.6, 0.6, 1.0); }
function utilityBox(ctx, x, z, rot) { const { B } = ctx; B.v('paint', true).setColor(0.16, 0.26, 0.19).box(x, 0.75, z, 1.6, 1.4, 1.3, rot); B.v('concrete').box(x, 0.06, z, 2.0, 0.12, 1.7, rot, 1 / 3); B.c('metal').box(x, 0.75, z, 1.6, 1.5, 1.3, rot); registerProp(ctx, 'utilityBox', x, z, rot, 1.6, 1.3, 1.5); }
function portaPotty(ctx, x, z, rot) { const { B } = ctx; const p = B.v('paint', true); p.setColor(0.1, 0.3, 0.55).box(x, 1.12, z, 1.15, 2.25, 1.15, rot); p.setColor(0.85, 0.85, 0.82).box(x, 2.3, z, 1.25, 0.12, 1.25, rot); B.c('metal').box(x, 1.15, z, 1.15, 2.3, 1.15, rot); registerProp(ctx, 'portaPotty', x, z, rot, 1.15, 1.15, 2.3); }
function pad(ctx, x, z, rot, w, d, h, col) { const { B } = ctx; B.v('paint', true).setColor(...col).box(x, h / 2, z, w, h, d, rot); B.c('rubber').box(x, h / 2, z, w, h, d, rot); registerProp(ctx, 'pad', x, z, rot, w, d, h); }
function sled(ctx, x, z, rot) {
  // football blocking sled: steel frame with upright pads
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot); const p = B.v('paint', true);
  B.v('galv').box(x, 0.12, z, 4.2, 0.12, 1.4, rot);
  for (const u of [-1.6, -0.55, 0.55, 1.6]) { p.setColor(0.62, 0.07, 0.06).box(x + u * c + 0.5 * s, 0.95, z - u * s + 0.5 * c, 0.6, 1.3, 0.35, rot); B.v('galv').box(x + u * c + 0.1 * s, 0.6, z - u * s + 0.1 * c, 0.08, 1.0, 0.08, rot); }
  B.c('metal').box(x + 0.3 * s, 0.8, z + 0.3 * c, 4.2, 1.6, 0.9, rot);
  registerProp(ctx, 'sled', x + 0.3 * s, z + 0.3 * c, rot, 4.2, 0.9, 1.6);
}
function tarpRoller(ctx, x, z, rot, len = 11) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot);
  B.v('paint', true).setColor(0.75, 0.76, 0.78).tube([x - len / 2 * c, 0.55, z + len / 2 * s], [x + len / 2 * c, 0.55, z - len / 2 * s], 0.55, 14);
  B.c('rubber').box(x, 0.55, z, len, 1.1, 1.1, rot);
  registerProp(ctx, 'tarpRoller', x, z, rot, len, 1.1, 1.1);
}
function filmTower(ctx, x, z) {
  const { B } = ctx; const g = B.v('galv');
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) g.cyl(x + dx, 0, z + dz, 0.05, 0.05, 6.6, 6, 1, true);
  for (const y of [2, 4]) { g.tube([x - 1.1, y, z - 1.1], [x + 1.1, y, z - 1.1], 0.03, 4).tube([x + 1.1, y, z - 1.1], [x + 1.1, y, z + 1.1], 0.03, 4).tube([x + 1.1, y, z + 1.1], [x - 1.1, y, z + 1.1], 0.03, 4).tube([x - 1.1, y, z + 1.1], [x - 1.1, y, z - 1.1], 0.03, 4); g.tube([x - 1.1, y - 2, z - 1.1], [x + 1.1, y, z - 1.1], 0.02, 4).tube([x + 1.1, y - 2, z + 1.1], [x - 1.1, y, z + 1.1], 0.02, 4); }
  B.v('aluminum').box(x, 5.5, z, 2.4, 0.08, 2.4); g.box(x, 6.05, z - 1.15, 2.4, 1.0, 0.04).box(x, 6.05, z + 1.15, 2.4, 1.0, 0.04).box(x - 1.15, 6.05, z, 0.04, 1.0, 2.4).box(x + 1.15, 6.05, z, 0.04, 1.0, 2.4);
  B.v('paint', true).setColor(0.62, 0.07, 0.06).box(x, 1.0, z - 1.16, 2.3, 1.9, 0.03).box(x, 1.0, z + 1.16, 2.3, 1.9, 0.03).box(x - 1.16, 1.0, z, 0.03, 1.9, 2.3);
  B.c('metal').box(x, 1.0, z, 2.4, 2.0, 2.4); B.c('metal').box(x, 5.9, z, 2.4, 1.3, 2.4);
  registerProp(ctx, 'filmTower', x, z, 0, 2.4, 2.4, 6.6);
}
function bikeRack(ctx, x, z, rot) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot); const g = B.v('galv');
  for (let u = -1.6; u <= 1.61; u += 0.8) { const px = x + u * c, pz = z - u * s; g.tube([px - 0.25 * s, 0, pz - 0.25 * c], [px - 0.25 * s, 0.85, pz - 0.25 * c], 0.025, 5).tube([px + 0.25 * s, 0, pz + 0.25 * c], [px + 0.25 * s, 0.85, pz + 0.25 * c], 0.025, 5).tube([px - 0.25 * s, 0.85, pz - 0.25 * c], [px + 0.25 * s, 0.85, pz + 0.25 * c], 0.025, 5); }
  B.c('metal').box(x, 0.45, z, 3.6, 0.9, 0.6, rot);
  registerProp(ctx, 'bikeRack', x, z, rot, 3.6, 0.6, 0.9);
}

// ------------------------------------------------------------------------------------------ placement
export function buildProps(ctx) {
  const rnd = mulberry32(2024);
  const tpls = { sedan: buildCarTemplate(CAR_TYPES.sedan), suv: buildCarTemplate(CAR_TYPES.suv), hatch: buildCarTemplate(CAR_TYPES.hatch) };
  const pick = () => { const r = rnd(); return r < 0.42 ? tpls.suv : r < 0.8 ? tpls.sedan : tpls.hatch; };
  const color = () => CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)];
  let nCars = 0;
  // tree trunks near the play area: nothing is parked or set down on or against one (trunks are up to ~0.6 m in radius)
  const pbT = ctx.playBounds; const trunks = (ctx.gen.trees || []).filter((t) => t[0] > pbT.minX - 30 && t[0] < pbT.maxX + 30 && t[1] > pbT.minZ - 30 && t[1] < pbT.maxZ + 30);
  const nearTrunk = (x, z, rot, sx, sz, margin) => {   // any trunk centre within `margin` of the footprint (centre, rotY, size along local x / z)
    const c = Math.cos(rot), s = Math.sin(rot);
    return trunks.some((t) => { const dx = t[0] - x, dz = t[1] - z; return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - sx / 2), Math.max(0, Math.abs(dx * s + dz * c) - sz / 2)) < margin; });
  };
  // A car that would stand on a trunk is left out, but still draws its three random numbers, so every other car keeps
  // its place, type and colour.
  const car = (x, z, heading) => {
    const tpl = pick(), h = heading + (rnd() - 0.5) * 0.05, col = color();
    if (nearTrunk(x, z, h, tpl.t.L, tpl.t.W, 1.3)) return;
    placeCar(ctx, tpl, x, z, h, col); nCars++;
  };
  // painted lines (visual only): 10 cm quads just above the asphalt, merged into one mesh after placement.
  // Stall lines are trimmed / dropped where the ground under them is not asphalt (kerbs, concrete crossings).
  const stripePos = [], stripeCol = [];
  const quadLine = (ax, az, bx, bz, w, col) => {
    const L = Math.hypot(bx - ax, bz - az) || 1, px = -(bz - az) / L * w, pz = (bx - ax) / L * w, y = 0.016;
    const q = [[ax - px, az - pz], [ax + px, az + pz], [bx + px, bz + pz], [bx - px, bz - pz]];
    const up = (q[1][0] - q[0][0]) * (q[3][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[3][0] - q[0][0]) < 0;   // face up regardless of direction
    for (const k of (up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])) { stripePos.push(q[k][0], y, q[k][1]); stripeCol.push(col[0], col[1], col[2]); }
  };
  const WHITE = [0.85, 0.845, 0.815], YELLOW = [0.86, 0.62, 0.1];
  const onAsphalt = (x, z) => ctx.surfaceAt(x, z) === 'asphalt';
  const stripe = (cx, cz, dx, dz, half, w = 0.05) => {
    if (!onAsphalt(cx, cz)) return;
    const h0 = onAsphalt(cx - dx * half * 0.85, cz - dz * half * 0.85) ? half : (onAsphalt(cx - dx * half * 0.45, cz - dz * half * 0.45) ? half * 0.5 : 0);
    const h1 = onAsphalt(cx + dx * half * 0.85, cz + dz * half * 0.85) ? half : (onAsphalt(cx + dx * half * 0.45, cz + dz * half * 0.45) ? half * 0.5 : 0);
    if (h0 + h1 < half * 0.9) return;
    quadLine(cx - dx * h0, cz - dz * h0, cx + dx * h1, cz + dz * h1, w, WHITE);
  };
  // double yellow centre line along the through streets (the photo's own paint is smoothed away up close)
  const centreLines = () => {
    const sat = ctx.campus.sat;
    for (const r of ctx.data.roads) {
      const hw = r.tags.highway; if (hw !== 'secondary' && hw !== 'tertiary') continue;
      for (let i = 0; i < r.line.length - 1; i++) {
        const a = r.line[i], b = r.line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
        for (let d = 0; d < L; d += 4) {
          const e = Math.min(L, d + 4), mx = a[0] + tx * (d + e) / 2, mz = a[1] + tz * (d + e) / 2;
          if (mx < sat.minX + 2 || mx > sat.maxX - 2 || mz < sat.minZ + 2 || mz > sat.maxZ - 2 || !onAsphalt(mx, mz)) continue;
          // skip junction boxes: asphalt well to both sides means a cross street or a wide apron
          if (onAsphalt(mx - tz * 13, mz + tx * 13) && onAsphalt(mx + tz * 13, mz - tx * 13)) continue;
          for (const o of [-0.13, 0.13]) quadLine(a[0] + tx * d - tz * o, a[1] + tz * d + tx * o, a[0] + tx * e - tz * o, a[1] + tz * e + tx * o, 0.05, YELLOW);
        }
      }
    }
  };
  // row of perpendicular stalls from (x0,z0) to (x1,z1); cars face +/- the row normal
  const stalls = (x0, z0, x1, z1, fill, flip = false, pitch = 2.75) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / pitch); const tx = (x1 - x0) / L, tz = (z1 - z0) / L;
    for (let i = 0; i <= n; i++) stripe(x0 + tx * i * pitch, z0 + tz * i * pitch, -tz, tx, 2.65);
    const base = Math.atan2(-tz, tx) + Math.PI / 2 + (flip ? Math.PI : 0);
    for (let i = 0; i < n; i++) { const f = typeof fill === 'function' ? fill(x0 + tx * (i + 0.5) * pitch, z0 + tz * (i + 0.5) * pitch) : fill; if (rnd() < f) car(x0 + tx * (i + 0.5) * pitch + (rnd() - 0.5) * 0.2, z0 + tz * (i + 0.5) * pitch + (rnd() - 0.5) * 0.2, base + (rnd() < 0.15 ? Math.PI : 0)); }
  };
  // parallel parking along a polyline
  const kerb = (pts, fill, pitch = 6.0, rev = false) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const n = Math.floor(L / pitch);
      for (let k = 0; k < n; k++) if (rnd() < fill) car(a[0] + tx * (k + 0.5) * pitch, a[1] + tz * (k + 0.5) * pitch, Math.atan2(-tz, tx) + (rev ? Math.PI : 0));
    }
  };

  // ---- east lot (across Madison St): double rows, busier toward the school side
  const eastFill = (x) => (x < 238 ? 0.78 : x < 258 ? 0.3 : 0.1);
  for (const z of [-11.5, 5.5, 21.5, 38, 54]) { stalls(206, z, 283, z - 1.0, eastFill, false); stalls(206, z + 5.4, 283, z + 4.4, eastFill, true); }
  placeBus(ctx, 285.5, 46, Math.PI / 2 + 0.03); placeBus(ctx, 285.8, 60, Math.PI / 2 + 0.02);
  // ---- south-east lot
  for (const x of [127.5, 145.5, 160.5, 178.2]) stalls(x, 45, x + 0.4, 99, x < 150 ? 0.72 : 0.62, x === 145.5 || x === 178.2);
  for (const x of [140.2, 166.0]) stalls(x, 45, x + 0.4, 99, 0.66, true);
  stalls(152, 104, 153.5, 170, 0.22, false); stalls(178.5, 104, 180, 172, 0.3, true);
  // ---- service drive east of the building: parallel parking + the school buses seen in the imagery
  kerb([[171.2, -132], [171.6, -62]], 0.6); kerb([[171.9, -52], [172.2, -8]], 0.55);
  placeBus(ctx, 176.2, 12, Math.PI / 2 + 0.03); placeBus(ctx, 176.5, 24.5, Math.PI / 2 + 0.03); placeBus(ctx, 172.8, 36.5, Math.PI / 2 + 0.02);
  // ---- north drive (55th St frontage) and visitor spots
  kerb([[20, -166.2], [140, -169.8]], 0.3); stalls(178, -193, 194, -193.5, 0.5); stalls(249, -192, 272, -192.6, 0.4);
  // ---- drop-off loop + drive west of the baseball field
  kerb([[-8.5, 98], [-8, 140], [-3, 166], [6, 186]], 0.72, 5.8); kerb([[-2.5, 100], [-2, 138], [3.5, 164], [12, 183]], 0.5, 5.8, true);
  for (const [x, z, h] of [[4, 66, 0.3], [14, 62.5, 0.1], [24, 66, -0.5], [29.5, 76, -1.3], [28, 88, -1.9], [20, 97, -2.6], [2, 80, 1.5], [3, 90, 1.6], [12, 84, 0.8]]) if (rnd() < 0.85) car(x, z, h);
  // ---- streets: kerb-side parking and a few cars in the lanes
  kerb([[-219.6, -178], [-219.3, -40]], 0.4, 6.5, true); kerb([[-218.6, 30], [-218.2, 180]], 0.3, 6.5, true);
  kerb([[-190, 209.2], [170, 207.6]], 0.22, 6.5); kerb([[197.2, 80], [198.2, 190]], 0.3, 6.5); kerb([[196.2, -150], [196.8, -40]], 0.25, 6.5, true);
  for (const [x, z, h] of [[-170, -204.6, 0], [-96, -204.4, 0], [-20, -203.8, 0], [66, -203.5, 0], [120, -203.2, 0], [-130, -197.6, Math.PI], [10, -197.0, Math.PI], [95, -196.4, Math.PI], [240, -201.5, 0], [-213.5, -110, Math.PI / 2], [-213.2, 95, Math.PI / 2], [-209.8, 20, -Math.PI / 2], [190.6, 60, -Math.PI / 2], [187.4, -90, Math.PI / 2]]) car(x, z, h);
  centreLines();
  if (stripePos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(stripePos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(stripePos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(stripeCol, 3));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // worn paint; fades out with distance (the satellite ground already carries the far look, and 10 cm lines would shimmer)
    const wear = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { float sd = length(vWPos - cameraPosition); vec2 sp = vWPos.xz * 3.1;
    float sw = fract(sin(dot(floor(sp * 6.0), vec2(12.9898, 78.233))) * 43758.5453) * 0.35 + fract(sin(dot(floor(sp), vec2(39.3468, 11.135))) * 24634.6345) * 0.4;
    // broad wear: whole stretches of a lot are scuffed thinner than others
    vec2 wp = vWPos.xz * 0.11; vec2 wi = floor(wp), wf = fract(wp); wf = wf * wf * (3.0 - 2.0 * wf);
    float h00 = fract(sin(dot(wi, vec2(127.1, 311.7))) * 43758.5453), h10 = fract(sin(dot(wi + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453), h01 = fract(sin(dot(wi + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453), h11 = fract(sin(dot(wi + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
    float broad = mix(mix(h00, h10, wf.x), mix(h01, h11, wf.x), wf.y);
    diffuseColor.a *= (0.42 + 0.58 * smoothstep(0.1, 0.55, sw + 0.25)) * mix(0.45, 1.0, smoothstep(0.2, 0.7, broad)) * (1.0 - smoothstep(55.0, 140.0, sd)); }`); };
    wear.key = 'stallPaint';
    ctx.applyBakedShadow(mat, ctx.sky.shadowUniforms, wear);
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'stall-paint'; mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 1;
    ctx.scene.add(mesh);
  }
  // residential streets outside the play area (scenery)
  for (const r of ctx.data.roads) {
    if (r.tags.highway !== 'residential') continue;
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 14) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (let d = 8; d < L - 6; d += 9 + rnd() * 30) {
        const x = a[0] + tx * d - tz * 2.9, z = a[1] + tz * d + tx * 2.9;
        const pb = ctx.playBounds; if (x > pb.minX - 4 && x < pb.maxX + 4 && z > pb.minZ - 4 && z < pb.maxZ + 4) continue;
        if (Math.abs(x) > 390 || Math.abs(z) > 300) continue;
        if (rnd() < 0.5) car(x, z, Math.atan2(-tz, tx));
      }
    }
  }

  // ---- service yard / dumpsters by the south-east wing and loading areas
  dumpster(ctx, 108.5, 58, 0.05); dumpster(ctx, 108.5, 61.2, 0.02, [0.1, 0.16, 0.3]); dumpster(ctx, 108.8, 68, 0.1); dumpster(ctx, 163, -128, 1.55); dumpster(ctx, 163.2, -124.6, 1.6, [0.1, 0.16, 0.3]);
  dumpster(ctx, -134, 10.6, 0.02); dumpster(ctx, 131.5, 122, 1.57); dumpster(ctx, 209, -176.5, 0);
  container(ctx, 118, 108, 0.02, [0.12, 0.25, 0.42]); container(ctx, 118.2, 111.2, 0.0, [0.5, 0.12, 0.1]); container(ctx, 158, 181.5, 0.03, [0.28, 0.3, 0.3]);
  utilityBox(ctx, 104, 40, 0); utilityBox(ctx, -30, -143, 1.57); utilityBox(ctx, -112, 8, 0); utilityBox(ctx, 160, 36.5, 0); utilityBox(ctx, -66, 101.5, 0);
  for (const [x, z, r] of [[112, 33.5, 0], [115.2, 33.5, 0], [152, 100.5, 0], [146, 100.5, 0], [183.6, 36, 1.57], [183.6, 31, 1.57], [200, 72.5, 0], [204, 72.5, 0], [-12, 54, 0.6], [34, 104, 0.9]]) barrier(ctx, x, z, r);

  // ---- Dickinson Field: track & field gear
  pad(ctx, -129.0, -163.1, 0, 5, 6.5, 0.75, [0.08, 0.2, 0.5]);              // pole-vault pit
  pad(ctx, -158.8, -178.6, 0, 5, 3.2, 0.6, [0.62, 0.07, 0.06]);            // high-jump pit
  // hurdle stacks on carts
  for (const [x, z, r] of [[-107.6, -126, 1.57], [-107.6, -80, 1.57], [-171, -31, 0]]) { ctx.B.v('paint', true).setColor(0.85, 0.85, 0.82).box(x, 0.75, z, 2.6, 1.1, 1.2, r); ctx.B.v('galv').box(x, 0.15, z, 2.8, 0.1, 1.3, r); ctx.B.c('metal').box(x, 0.7, z, 2.6, 1.4, 1.2, r); }
  // sideline equipment trunks / water stations
  for (const [x, z] of [[-179.9, -121], [-179.9, -81], [-121.7, -121], [-121.7, -81]]) { ctx.B.v('paint', true).setColor(0.62, 0.07, 0.06).box(x, 0.45, z, 0.8, 0.9, 1.6); ctx.B.c('metal').box(x, 0.45, z, 0.8, 0.9, 1.6); }
  portaPotty(ctx, -200, -22, 0); portaPotty(ctx, -198.6, -22, 0); portaPotty(ctx, -104, -30, 1.57);
  // ticket booth by the main gate
  { const B = ctx.B; B.v('brickRed').box(-171, 1.3, -13.5, 2.6, 2.6, 2.4, 0, 0.5); B.v('paint', true).setColor(0.62, 0.07, 0.06).box(-171, 2.7, -13.5, 3.2, 0.2, 3.0); B.c('brick').box(-171, 1.4, -13.5, 2.6, 2.8, 2.4); }

  // ---- grass practice field (west): sleds, goals, benches, equipment shed and containers along Grant St
  sled(ctx, -175, 34, 0.2); sled(ctx, -168, 50, -0.4); sled(ctx, -140, 30, 0.9);
  container(ctx, -196.5, 60, 1.57, [0.5, 0.12, 0.1]); container(ctx, -196.8, 68, 1.57, [0.25, 0.27, 0.28]);
  { const B = ctx.B; B.v('paint', true).setColor(0.3, 0.1, 0.09).box(-197, 1.4, 100, 4, 2.8, 5); B.v('galv').box(-197, 2.86, 100, 4.5, 0.12, 5.5); B.c('wood').box(-197, 1.4, 100, 4, 2.8, 5); }
  for (const [x, z, r] of [[-157.3, 23.5, 0], [-157.3, 123.5, Math.PI]]) {
    const B = ctx.B; const p = B.v('paint', true); p.setColor(0.9, 0.9, 0.88); const c = Math.cos(r), s = Math.sin(r); const Wp = (u, y, d) => [x + u * c + d * s, y, z - u * s + d * c];
    p.tube(Wp(-3.66, 0, 0), Wp(-3.66, 2.44, 0), 0.06, 6).tube(Wp(3.66, 0, 0), Wp(3.66, 2.44, 0), 0.06, 6).tube(Wp(-3.66, 2.44, 0), Wp(3.66, 2.44, 0), 0.06, 6).tube(Wp(-3.66, 2.44, 0), Wp(-3.66, 0, -1.8), 0.03, 5).tube(Wp(3.66, 2.44, 0), Wp(3.66, 0, -1.8), 0.03, 5).tube(Wp(-3.66, 0, -1.8), Wp(3.66, 0, -1.8), 0.03, 5);
    B.v('net').quad(Wp(-3.66, 0, -1.8), Wp(3.66, 0, -1.8), Wp(3.66, 2.44, 0), Wp(-3.66, 2.44, 0), [0, 0], [14, 0], [14, 6], [0, 6]);
    B.c('metal:mesh').box(...Wp(0, 1.2, -0.9), 7.4, 2.4, 1.8, r);
  }
  for (const z of [45, 75, 105]) { bench(ctx, -122.5, z, Math.PI / 2); }
  bleachers(ctx, { x: -193.5, z: 78, dir: Math.PI / 2, len: 9, rows: 5, run: 0.61, rise: 0.22, frontH: 0 });
  for (const [x, z] of [[-150, 74], [-149.3, 74.4], [-150.2, 74.8], [-147, 78], [-146.4, 78.5], [-160, 100], [-159.4, 100.5]]) { ctx.B.v('paint', true).setColor(0.62, 0.07, 0.06).cyl(x, 0, z, 0.24, 0.24, 1.35, 12, 1, true); ctx.B.c('rubber').box(x, 0.68, z, 0.48, 1.36, 0.48); } pad(ctx, -176, 96, 0, 3.5, 2.2, 1.1, [0.08, 0.2, 0.5]);
  tarpRoller(ctx, -131, 118, 0.1, 8);

  // ---- practice turf
  filmTower(ctx, -93.5, 37); filmTower(ctx, -150, -36.5);
  for (const [x, z, r] of [[-26.5, 82, 0.2], [-92, -8, 1.3]]) { ctx.B.v('paint', true).setColor(0.85, 0.85, 0.82).box(x, 0.6, z, 1.6, 1.2, 1.1, r); ctx.B.c('metal').box(x, 0.6, z, 1.6, 1.2, 1.1, r); }
  sled(ctx, -45, 99.5, 0.05);

  // ---- baseball: field maintenance gear that doubles as cover in the open outfield
  tarpRoller(ctx, 31, 122, -0.78, 12); tarpRoller(ctx, 106, 117, 0.74, 10);   // (the second one used to run into the containers at 118, 108)
  for (const [x, z, r] of [[68.3, 88.5, 0], [52, 112, 0.7], [84.6, 112, -0.7]]) { ctx.B.v('net').quad([x - 1.1 * Math.cos(r), 0, z + 1.1 * Math.sin(r)], [x - 1.1 * Math.cos(r), 2.1, z + 1.1 * Math.sin(r)], [x + 1.1 * Math.cos(r), 2.1, z - 1.1 * Math.sin(r)], [x + 1.1 * Math.cos(r), 0, z - 1.1 * Math.sin(r)], [0, 0], [0, 5], [5, 5], [5, 0]); ctx.B.v('paint', true).setColor(0.06, 0.16, 0.09).box(x, 1.05, z, 2.3, 2.1, 0.08, r); ctx.B.c('rubber').box(x, 1.05, z, 2.3, 2.1, 0.12, r); }
  { const B = ctx.B; const p = B.v('paint', true); p.setColor(0.1, 0.25, 0.12).box(40, 0.9, 150, 2.6, 1.2, 1.5, 0.5); p.setColor(0.9, 0.75, 0.1).box(40.3, 1.7, 150.2, 1.2, 0.5, 1.2, 0.5); B.v('rubber').tube([39, 0.35, 149], [39, 0.35, 150.6], 0.35, 8).tube([41.2, 0.35, 150], [41.2, 0.35, 151.6], 0.35, 8); B.c('metal').box(40, 0.9, 150, 2.6, 1.8, 1.5, 0.5); }
  pad(ctx, 96, 150, 0.3, 4.5, 0.4, 2.2, [0.06, 0.16, 0.09]); pad(ctx, 70, 162, 0, 5, 0.4, 2.2, [0.06, 0.16, 0.09]); pad(ctx, 34, 136, -0.6, 4.5, 0.4, 2.2, [0.06, 0.16, 0.09]);
  for (const [x, z, r] of [[44, 68, -0.6], [94, 67, 0.6]]) picnicTable(ctx, x, z, r);
  portaPotty(ctx, 30, 96.5, 0.8);

  // ---- east ball fields
  tarpRoller(ctx, 232, -150, 0.8, 9); tarpRoller(ctx, 236, -45, -0.8, 9); tarpRoller(ctx, 240, 158, 0.75, 8);
  for (const [x, z, r] of [[212, -110, 1.57], [212, -70, 1.57]]) bench(ctx, x, z, r);
  container(ctx, 276, -110, 1.57, [0.12, 0.25, 0.42]); container(ctx, 262, 132, 0.1, [0.5, 0.12, 0.1]);
  portaPotty(ctx, 262, -100, 0); portaPotty(ctx, 222, 132, 0);
  for (const [x, z, r] of [[228, -125, 0.3], [246, -70, -0.4], [234, -100, 1.2], [252, -118, 0.9]]) pad(ctx, x, z, r, 4.5, 0.4, 2.0, [0.06, 0.16, 0.09]);
  picnicTable(ctx, 232, 120, 0.3); picnicTable(ctx, 244, 118, -0.2); picnicTable(ctx, 270, 100, 0.1);

  // ---- walkways around the building: benches, bike racks, bins, picnic tables
  for (const [x, z, r] of [[-24, -70, Math.PI / 2], [-24, -110, Math.PI / 2], [60, -160, 0], [103, -160.6, 0], [-18, 40, Math.PI / 2], [10, 58, 0], [166, -80, -Math.PI / 2], [166, -30, -Math.PI / 2]]) bench(ctx, x, z, r);
  for (const [x, z, r] of [[-29, -50, 1.57], [-29, -44, 1.57], [-21, 33, 1.57], [150, -160, 0], [108, 36, 0]]) bikeRack(ctx, x, z, r);
  for (const [x, z] of [[-22, -62], [57.6, -158.4], [-20, 12], [164, -66], [-2, 60], [-110, -8], [-96, -62]]) trashCan(ctx, x, z);
  for (const [x, z, r] of [[-104, -12, 0.2], [-99, -40, 1.2], [-106, -52, 0.5], [-16, 80, 0.3], [-60, 108, 0.1]]) picnicTable(ctx, x, z, r);
  // concrete planters along the west walk (cover between the building and the fields)
  for (const z of [-128, -100, -72, -44]) { ctx.B.solidBox('concrete', 'concrete', -33.5, 0.45, z, 1.4, 0.9, 6, 0, 1 / 3); ctx.shrubs.push([-33.5, 0.9, z, 5.2, 0.9, Math.PI / 2]); }
  for (const x of [-100, -70, -40]) { ctx.B.solidBox('concrete', 'concrete', x, 0.45, -30, 6, 0.9, 1.4, 0, 1 / 3); ctx.shrubs.push([x, 0.9, -30, 5.2, 0.9, 0]); }
  edgeDressing(ctx, nearTrunk);
  ctx.stats = { cars: nCars };
}

// The play-area edge where it would otherwise be an invisible wall across open asphalt (MAP_NOTES "invisible wall
// mid-street", map check "boundary"): the far kerbs of 55th St and Grant St get a chain-link fence, the east lot its
// boundary fence, and every street that leaves the map is closed with striped concrete barriers. Everything stands just
// outside the play bounds, so the walkable area, the nav grid and the spawns are untouched.
function edgeDressing(ctx, nearTrunk) {
  const pb = ctx.playBounds; const E = 0.7; const trees = ctx.gen.trees || [];
  // (rule F48) the player clamp runs on the fence / barrier line (E outside the bounds; the east lot's fence at 0.5 m stops a player first)
  ctx.playEdge = [[pb.minX - E, pb.minZ - E], [pb.maxX + E, pb.minZ - E], [pb.maxX + E, pb.maxZ + E], [pb.minX - E, pb.maxZ + E]];
  // chain-link run with a gap wherever a tree trunk stands on the line (the trunk closes the gap)
  const edgeFence = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L; const gaps = [];
    for (const t of trees) { const u = (t[0] - ax) * tx + (t[1] - az) * tz; if (u > 0 && u < L && Math.abs((t[0] - ax) * tz - (t[1] - az) * tx) < 0.6) gaps.push([u - 0.55, u + 0.55]); }
    fence(ctx, [[ax, az], [bx, bz]], { h: 1.8, gaps });
  };
  const roadBlock = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, rot = Math.atan2(-tz, tx); const n = Math.max(1, Math.round(L / 3)), len = L / n - 0.25;
    for (let i = 0; i < n; i++) {
      const x = ax + tx * (i + 0.5) * L / n, z = az + tz * (i + 0.5) * L / n;
      if (nearTrunk(x, z, rot, len, 0.6, 1.3)) continue;
      barrier(ctx, x, z, rot, len);
      const pt = ctx.B.v('paint', true);
      pt.setColor(0.95, 0.45, 0.05).box(x, 0.96, z, len - 0.5, 0.22, 0.07, rot); pt.setColor(0.9, 0.9, 0.88).box(x, 0.66, z, len - 0.5, 0.13, 0.32, rot); pt.setColor(1, 1, 1);
    }
  };
  edgeFence(-201, pb.minZ - E, pb.maxX - 0.5, pb.minZ - E);          // 55th St, north kerb
  edgeFence(pb.minX - E, -135, pb.minX - E, -191);                   // Grant St, west kerb (north end)
  edgeFence(pb.maxX + 0.5, -24, pb.maxX + 0.5, 71.5);                // east lot
  // (3 m barriers; the runs start and end on whole multiples of 3 m from the corner, in step with the map check's samples)
  roadBlock(pb.minX - E, -212, pb.minX - E, -191);                   // 55th St leaving west
  roadBlock(-222, pb.minZ - E, -201, pb.minZ - E);                   // Grant St leaving north
  roadBlock(-216, pb.maxZ + E, -195, pb.maxZ + E);                   // Grant St leaving south
  roadBlock(186, pb.maxZ + E, 201, pb.maxZ + E);                     // Madison St leaving south
  roadBlock(pb.maxX + E, 190, pb.maxX + E, 202);                     // the south street leaving east
}

// Shared prop kit for other campuses (see src/campuses/*/world.js). Hinsdale's own placement above is unchanged.
// Terrain campuses: every kit prop stands on the ground under its footprint (ctx.onGround, lowest ground so nothing floats
// on a slope). On flat campuses (no ctx.terrain) and inside a builder's own ctx.onGround block these are the plain helpers.
const grounded = (fn, r, at = 1) => (ctx, ...a) => (ctx.terrain && !ctx.groundDepth ? ctx.onGround([a[at - 1], a[at], typeof r === 'function' ? r(...a) : r], () => fn(ctx, ...a)) : fn(ctx, ...a));
export const propKit = {
  CAR_TYPES, CAR_COLORS, buildCarTemplate, registerProp,
  // (footprint radius = half the diagonal, so no corner hangs over the downhill side)
  placeCar: grounded(placeCar, (tpl) => Math.hypot(tpl.t.L, tpl.t.W) / 2, 2), placeBus: grounded(placeBus, 5.55), dumpster: grounded(dumpster, 1.2), container: grounded(container, 3.27),
  barrier: grounded(barrier, (x, z, rot, len = 3) => Math.hypot(len, 0.6) / 2), bench: grounded(bench, 0.94), picnicTable: grounded(picnicTable, 1.25), trashCan: grounded(trashCan, 0.43),
  utilityBox: grounded(utilityBox, 1.04), portaPotty: grounded(portaPotty, 0.82), bikeRack: grounded(bikeRack, 1.83),
};
