// Gameplay cover that is also plausible scenery: parked cars, school buses, dumpsters, containers, barriers,
// benches, athletic equipment. Everything is merged into the shared static buckets and added to collision.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { bleachers } from './landmarks.js';

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
  // end caps (fans)
  const cap = (i, flip) => { const base = i * NS; const ci = pos.length / 3; let cx = 0, cy = 0; for (const p of secs[i]) { cy += p[1]; } cy /= NS; pos.push(secs[i][0][0], cy, 0); for (let k = 0; k < NS - 1; k++) { if (flip) idx.push(ci, base + k + 1, base + k); else idx.push(ci, base + k, base + k + 1); } };
  cap(0, false); cap(secs.length - 1, true);
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
    const disc = (r, col, dOut, cy) => {
      p.setColor(col[0], col[1], col[2]); const ctr = Wp(wx, cy, sgn * (t.W / 2 + dOut));
      for (let k = 0; k < 14; k++) {
        const a0 = (k / 14) * Math.PI * 2, a1 = ((k + 1) / 14) * Math.PI * 2;
        const P = (ang) => [ctr[0] + Math.cos(ang) * r * c, ctr[1] + Math.sin(ang) * r, ctr[2] - Math.cos(ang) * r * s];
        if (sgn > 0) p.tri(ctr, P(a0), P(a1)); else p.tri(ctr, P(a1), P(a0));
      }
    };
    disc(t.wr + 0.075, [0.015, 0.015, 0.015], 0.012, t.wr + 0.03);   // arch shadow
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
}

// ------------------------------------------------------------------------------------------ small props
function dumpster(ctx, x, z, rot, col = [0.1, 0.25, 0.16]) {
  const { B } = ctx; const p = B.v('paint', true);
  p.setColor(...col).box(x, 0.72, z, 2.0, 1.25, 1.3, rot); p.setColor(0.04, 0.04, 0.04).box(x, 1.4, z, 2.06, 0.1, 1.36, rot);
  p.setColor(col[0] * 0.6, col[1] * 0.6, col[2] * 0.6).box(x, 0.72, z, 2.08, 0.1, 1.38, rot);
  B.c('metal').box(x, 0.72, z, 2.0, 1.45, 1.3, rot);
}
function container(ctx, x, z, rot, col) {
  const { B } = ctx; const g = B.v('paint', true); const c = Math.cos(rot), s = Math.sin(rot);
  g.setColor(...col).box(x, 1.3, z, 6.06, 2.59, 2.44, rot);
  g.setColor(col[0] * 0.7, col[1] * 0.7, col[2] * 0.7);
  for (let u = -2.8; u <= 2.81; u += 0.35) for (const sd of [-1, 1]) g.box(x + u * c + sd * 1.235 * s, 1.3, z - u * s + sd * 1.235 * c, 0.12, 2.4, 0.03, rot);
  B.v('galv').box(x + 3.04 * c, 1.3, z - 3.04 * s, 0.04, 2.3, 0.05, rot).box(x + 3.04 * c + 0.5 * s, 1.3, z - 3.04 * s + 0.5 * c, 0.04, 2.3, 0.05, rot).box(x + 3.04 * c - 0.5 * s, 1.3, z - 3.04 * s - 0.5 * c, 0.04, 2.3, 0.05, rot);
  B.c('metal').box(x, 1.3, z, 6.06, 2.6, 2.44, rot);
}
function barrier(ctx, x, z, rot, len = 3.0) {
  const { B } = ctx;
  B.v('concrete').box(x, 0.2, z, len, 0.4, 0.6, rot, 1 / 3).box(x, 0.62, z, len, 0.45, 0.3, rot, 1 / 3);
  B.c('concrete').box(x, 0.42, z, len, 0.85, 0.5, rot);
}
function bench(ctx, x, z, rot) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot);
  B.v('wood').box(x, 0.45, z, 1.8, 0.06, 0.45, rot, 0.5).box(x - 0.2 * s, 0.75, z - 0.2 * c, 1.8, 0.35, 0.05, rot, 0.5);
  B.v('blackMetal').box(x - 0.8 * c, 0.22, z + 0.8 * s, 0.06, 0.45, 0.45, rot).box(x + 0.8 * c, 0.22, z - 0.8 * s, 0.06, 0.45, 0.45, rot);
  B.c('wood').box(x, 0.45, z, 1.8, 0.9, 0.5, rot);
}
function picnicTable(ctx, x, z, rot) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot);
  B.v('wood').box(x, 0.75, z, 1.9, 0.05, 0.8, rot, 0.5).box(x + 0.65 * s, 0.45, z + 0.65 * c, 1.9, 0.05, 0.28, rot, 0.5).box(x - 0.65 * s, 0.45, z - 0.65 * c, 1.9, 0.05, 0.28, rot, 0.5);
  B.v('galv').box(x - 0.7 * c, 0.37, z + 0.7 * s, 0.06, 0.74, 1.5, rot).box(x + 0.7 * c, 0.37, z - 0.7 * s, 0.06, 0.74, 1.5, rot);
  B.c('wood').box(x, 0.4, z, 1.9, 0.8, 1.6, rot);
}
function trashCan(ctx, x, z) { const { B } = ctx; B.v('blackMetal').cyl(x, 0, z, 0.3, 0.33, 0.95, 10, 1, true); B.c('metal').box(x, 0.5, z, 0.6, 1.0, 0.6); }
function utilityBox(ctx, x, z, rot) { const { B } = ctx; B.v('paint', true).setColor(0.16, 0.26, 0.19).box(x, 0.75, z, 1.6, 1.4, 1.3, rot); B.v('concrete').box(x, 0.06, z, 2.0, 0.12, 1.7, rot, 1 / 3); B.c('metal').box(x, 0.75, z, 1.6, 1.5, 1.3, rot); }
function portaPotty(ctx, x, z, rot) { const { B } = ctx; const p = B.v('paint', true); p.setColor(0.1, 0.3, 0.55).box(x, 1.12, z, 1.15, 2.25, 1.15, rot); p.setColor(0.85, 0.85, 0.82).box(x, 2.3, z, 1.25, 0.12, 1.25, rot); B.c('metal').box(x, 1.15, z, 1.15, 2.3, 1.15, rot); }
function pad(ctx, x, z, rot, w, d, h, col) { const { B } = ctx; B.v('paint', true).setColor(...col).box(x, h / 2, z, w, h, d, rot); B.c('rubber').box(x, h / 2, z, w, h, d, rot); }
function sled(ctx, x, z, rot) {
  // football blocking sled: steel frame with upright pads
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot); const p = B.v('paint', true);
  B.v('galv').box(x, 0.12, z, 4.2, 0.12, 1.4, rot);
  for (const u of [-1.6, -0.55, 0.55, 1.6]) { p.setColor(0.62, 0.07, 0.06).box(x + u * c + 0.5 * s, 0.95, z - u * s + 0.5 * c, 0.6, 1.3, 0.35, rot); B.v('galv').box(x + u * c + 0.1 * s, 0.6, z - u * s + 0.1 * c, 0.08, 1.0, 0.08, rot); }
  B.c('metal').box(x + 0.3 * s, 0.8, z + 0.3 * c, 4.2, 1.6, 0.9, rot);
}
function tarpRoller(ctx, x, z, rot, len = 11) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot);
  B.v('paint', true).setColor(0.75, 0.76, 0.78).tube([x - len / 2 * c, 0.55, z + len / 2 * s], [x + len / 2 * c, 0.55, z - len / 2 * s], 0.55, 14);
  B.c('rubber').box(x, 0.55, z, len, 1.1, 1.1, rot);
}
function filmTower(ctx, x, z) {
  const { B } = ctx; const g = B.v('galv');
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) g.cyl(x + dx, 0, z + dz, 0.05, 0.05, 6.6, 6, 1, true);
  for (const y of [2, 4]) { g.tube([x - 1.1, y, z - 1.1], [x + 1.1, y, z - 1.1], 0.03, 4).tube([x + 1.1, y, z - 1.1], [x + 1.1, y, z + 1.1], 0.03, 4).tube([x + 1.1, y, z + 1.1], [x - 1.1, y, z + 1.1], 0.03, 4).tube([x - 1.1, y, z + 1.1], [x - 1.1, y, z - 1.1], 0.03, 4); g.tube([x - 1.1, y - 2, z - 1.1], [x + 1.1, y, z - 1.1], 0.02, 4).tube([x + 1.1, y - 2, z + 1.1], [x - 1.1, y, z + 1.1], 0.02, 4); }
  B.v('aluminum').box(x, 5.5, z, 2.4, 0.08, 2.4); g.box(x, 6.05, z - 1.15, 2.4, 1.0, 0.04).box(x, 6.05, z + 1.15, 2.4, 1.0, 0.04).box(x - 1.15, 6.05, z, 0.04, 1.0, 2.4).box(x + 1.15, 6.05, z, 0.04, 1.0, 2.4);
  B.v('paint', true).setColor(0.62, 0.07, 0.06).box(x, 1.0, z - 1.16, 2.3, 1.9, 0.03).box(x, 1.0, z + 1.16, 2.3, 1.9, 0.03).box(x - 1.16, 1.0, z, 0.03, 1.9, 2.3);
  B.c('metal').box(x, 1.0, z, 2.4, 2.0, 2.4); B.c('metal').box(x, 5.9, z, 2.4, 1.3, 2.4);
}
function bikeRack(ctx, x, z, rot) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot); const g = B.v('galv');
  for (let u = -1.6; u <= 1.61; u += 0.8) { const px = x + u * c, pz = z - u * s; g.tube([px - 0.25 * s, 0, pz - 0.25 * c], [px - 0.25 * s, 0.85, pz - 0.25 * c], 0.025, 5).tube([px + 0.25 * s, 0, pz + 0.25 * c], [px + 0.25 * s, 0.85, pz + 0.25 * c], 0.025, 5).tube([px - 0.25 * s, 0.85, pz - 0.25 * c], [px + 0.25 * s, 0.85, pz + 0.25 * c], 0.025, 5); }
  B.c('metal').box(x, 0.45, z, 3.6, 0.9, 0.6, rot);
}

// ------------------------------------------------------------------------------------------ placement
export function buildProps(ctx) {
  const rnd = mulberry32(2024);
  const tpls = { sedan: buildCarTemplate(CAR_TYPES.sedan), suv: buildCarTemplate(CAR_TYPES.suv), hatch: buildCarTemplate(CAR_TYPES.hatch) };
  const pick = () => { const r = rnd(); return r < 0.42 ? tpls.suv : r < 0.8 ? tpls.sedan : tpls.hatch; };
  const color = () => CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)];
  let nCars = 0;
  const car = (x, z, heading) => { placeCar(ctx, pick(), x, z, heading + (rnd() - 0.5) * 0.05, color()); nCars++; };
  // row of perpendicular stalls from (x0,z0) to (x1,z1); cars face +/- the row normal
  const stalls = (x0, z0, x1, z1, fill, flip = false, pitch = 2.75) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / pitch); const tx = (x1 - x0) / L, tz = (z1 - z0) / L;
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
  pad(ctx, -150.5, -171, 0, 6.5, 5, 0.75, [0.08, 0.2, 0.5]);              // pole-vault pit
  pad(ctx, -166, -166.5, 0.3, 5, 3.2, 0.6, [0.62, 0.07, 0.06]);            // high-jump pit
  pad(ctx, -136, -33, 0, 5, 3.2, 0.6, [0.08, 0.2, 0.5]);
  for (const [x, z] of [[-186.5, -150], [-186.5, -52], [-118.5, -150], [-118.5, -52]]) trashCan(ctx, x, z);
  // hurdle stacks on carts
  for (const [x, z, r] of [[-117.5, -126, 1.57], [-117.5, -80, 1.57], [-171, -30, 0]]) { ctx.B.v('paint', true).setColor(0.85, 0.85, 0.82).box(x, 0.75, z, 2.6, 1.1, 1.2, r); ctx.B.v('galv').box(x, 0.15, z, 2.8, 0.1, 1.3, r); ctx.B.c('metal').box(x, 0.7, z, 2.6, 1.4, 1.2, r); }
  // sideline equipment trunks / water stations
  for (const [x, z] of [[-184.4, -121], [-184.4, -81], [-121.6, -121], [-121.6, -81]]) { ctx.B.v('paint', true).setColor(0.62, 0.07, 0.06).box(x, 0.45, z, 0.8, 0.9, 1.6); ctx.B.c('metal').box(x, 0.45, z, 0.8, 0.9, 1.6); }
  portaPotty(ctx, -200, -22, 0); portaPotty(ctx, -198.6, -22, 0); portaPotty(ctx, -104, -30, 1.57);
  // ticket booth by the main gate
  { const B = ctx.B; B.v('brickRed').box(-171, 1.3, -13.5, 2.6, 2.6, 2.4, 0, 0.5); B.v('paint', true).setColor(0.62, 0.07, 0.06).box(-171, 2.7, -13.5, 3.2, 0.2, 3.0); B.c('brick').box(-171, 1.4, -13.5, 2.6, 2.8, 2.4); }

  // ---- grass practice field (west): sleds, goals, benches, equipment shed and containers along Grant St
  sled(ctx, -175, 34, 0.2); sled(ctx, -168, 50, -0.4); sled(ctx, -140, 30, 0.9);
  container(ctx, -196.5, 60, 1.57, [0.5, 0.12, 0.1]); container(ctx, -196.8, 68, 1.57, [0.25, 0.27, 0.28]);
  { const B = ctx.B; B.v('paint', true).setColor(0.3, 0.1, 0.09).box(-197, 1.4, 100, 4, 2.8, 5); B.v('galv').box(-197, 2.86, 100, 4.5, 0.12, 5.5); B.c('wood').box(-197, 1.4, 100, 4, 2.8, 5); }
  for (const [x, z, r] of [[-158, 22, 0], [-158, 126, Math.PI]]) {
    const B = ctx.B; const p = B.v('paint', true); p.setColor(0.9, 0.9, 0.88); const c = Math.cos(r), s = Math.sin(r); const Wp = (u, y, d) => [x + u * c + d * s, y, z - u * s + d * c];
    p.tube(Wp(-3.66, 0, 0), Wp(-3.66, 2.44, 0), 0.06, 6).tube(Wp(3.66, 0, 0), Wp(3.66, 2.44, 0), 0.06, 6).tube(Wp(-3.66, 2.44, 0), Wp(3.66, 2.44, 0), 0.06, 6).tube(Wp(-3.66, 2.44, 0), Wp(-3.66, 0, -1.8), 0.03, 5).tube(Wp(3.66, 2.44, 0), Wp(3.66, 0, -1.8), 0.03, 5).tube(Wp(-3.66, 0, -1.8), Wp(3.66, 0, -1.8), 0.03, 5);
    B.v('net').quad(Wp(-3.66, 0, -1.8), Wp(3.66, 0, -1.8), Wp(3.66, 2.44, 0), Wp(-3.66, 2.44, 0), [0, 0], [14, 0], [14, 6], [0, 6]);
    B.c('metal:mesh').box(...Wp(0, 1.2, -0.9), 7.4, 2.4, 1.8, r);
  }
  for (const z of [45, 75, 105]) { bench(ctx, -122.5, z, Math.PI / 2); }
  bleachers(ctx, { x: -193.5, z: 78, dir: Math.PI / 2, len: 9, rows: 5, run: 0.65, rise: 0.3, frontH: 0 });
  for (const [x, z] of [[-150, 74], [-149.3, 74.4], [-150.2, 74.8], [-147, 78], [-146.4, 78.5], [-160, 100], [-159.4, 100.5]]) { ctx.B.v('paint', true).setColor(0.62, 0.07, 0.06).cyl(x, 0, z, 0.24, 0.24, 1.35, 12, 1, true); ctx.B.c('rubber').box(x, 0.68, z, 0.48, 1.36, 0.48); } pad(ctx, -176, 96, 0, 3.5, 2.2, 1.1, [0.08, 0.2, 0.5]);
  tarpRoller(ctx, -131, 118, 0.1, 8);

  // ---- practice turf
  filmTower(ctx, -93.5, 37); filmTower(ctx, -150, -36.5);
  for (const [x, z, r] of [[-26.5, 82, 0.2], [-92, -8, 1.3]]) { ctx.B.v('paint', true).setColor(0.85, 0.85, 0.82).box(x, 0.6, z, 1.6, 1.2, 1.1, r); ctx.B.c('metal').box(x, 0.6, z, 1.6, 1.2, 1.1, r); }
  sled(ctx, -45, 99.5, 0.05);

  // ---- baseball: field maintenance gear that doubles as cover in the open outfield
  tarpRoller(ctx, 31, 122, -0.78, 12); tarpRoller(ctx, 112, 112, 0.74, 10);
  for (const [x, z, r] of [[66, 96.5, 0], [52, 110, 0.7], [84, 110, -0.7]]) { ctx.B.v('net').quad([x - 1.1 * Math.cos(r), 0, z + 1.1 * Math.sin(r)], [x - 1.1 * Math.cos(r), 2.1, z + 1.1 * Math.sin(r)], [x + 1.1 * Math.cos(r), 2.1, z - 1.1 * Math.sin(r)], [x + 1.1 * Math.cos(r), 0, z - 1.1 * Math.sin(r)], [0, 0], [0, 5], [5, 5], [5, 0]); ctx.B.v('paint', true).setColor(0.06, 0.16, 0.09).box(x, 1.05, z, 2.3, 2.1, 0.08, r); ctx.B.c('rubber').box(x, 1.05, z, 2.3, 2.1, 0.12, r); }
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
  for (const [x, z, r] of [[-24, -70, Math.PI / 2], [-24, -110, Math.PI / 2], [60, -160, 0], [100, -160.6, 0], [-18, 40, Math.PI / 2], [10, 58, 0], [166, -80, -Math.PI / 2], [166, -30, -Math.PI / 2]]) bench(ctx, x, z, r);
  for (const [x, z, r] of [[-29, -50, 1.57], [-29, -44, 1.57], [-21, 33, 1.57], [150, -160, 0], [108, 36, 0]]) bikeRack(ctx, x, z, r);
  for (const [x, z] of [[-22, -62], [56, -159], [-20, 12], [164, -66], [-2, 60], [-110, -8], [-96, -62]]) trashCan(ctx, x, z);
  for (const [x, z, r] of [[-104, -12, 0.2], [-99, -40, 1.2], [-106, -52, 0.5], [-16, 80, 0.3], [-60, 108, 0.1]]) picnicTable(ctx, x, z, r);
  // concrete planters along the west walk (cover between the building and the fields)
  for (const z of [-128, -100, -72, -44]) { ctx.B.solidBox('concrete', 'concrete', -33.5, 0.45, z, 1.4, 0.9, 6, 0, 1 / 3); ctx.shrubs.push([-33.5, 0.9, z, 5.2, 0.9, Math.PI / 2]); }
  for (const x of [-100, -70, -40]) { ctx.B.solidBox('concrete', 'concrete', x, 0.45, -30, 6, 0.9, 1.4, 0, 1 / 3); ctx.shrubs.push([x, 0.9, -30, 5.2, 0.9, 0]); }
  ctx.stats = { cars: nCars };
}
