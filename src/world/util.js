// Geometry accumulation helpers: everything static is merged into a handful of meshes (one per material /
// one per collision surface type).
import * as THREE from 'three';

export class Bucket {
  constructor(withColor = false) {
    this.pos = []; this.nor = []; this.uv = [];
    this.col = withColor ? [] : null;
    this.c = [1, 1, 1];
  }
  setColor(r, g, b) { this.c[0] = r; this.c[1] = g; this.c[2] = b; return this; }
  get triCount() { return this.pos.length / 9; }
  _v(x, y, z, nx, ny, nz, u, v) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v);
    if (this.col) this.col.push(this.c[0], this.c[1], this.c[2]);
  }
  // a,b,c,d counter-clockwise seen from the front; uvs as [u,v] pairs
  quad(a, b, c, d, ua, ub, uc, ud, n) {
    if (!n) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; n = [nx / l, ny / l, nz / l];
    }
    ua = ua || [0, 0]; ub = ub || [1, 0]; uc = uc || [1, 1]; ud = ud || [0, 1];
    this._v(a[0], a[1], a[2], n[0], n[1], n[2], ua[0], ua[1]);
    this._v(b[0], b[1], b[2], n[0], n[1], n[2], ub[0], ub[1]);
    this._v(c[0], c[1], c[2], n[0], n[1], n[2], uc[0], uc[1]);
    this._v(a[0], a[1], a[2], n[0], n[1], n[2], ua[0], ua[1]);
    this._v(c[0], c[1], c[2], n[0], n[1], n[2], uc[0], uc[1]);
    this._v(d[0], d[1], d[2], n[0], n[1], n[2], ud[0], ud[1]);
    return this;
  }
  tri(a, b, c, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    ua = ua || [0, 0]; ub = ub || [1, 0]; uc = uc || [0, 1];
    this._v(a[0], a[1], a[2], nx, ny, nz, ua[0], ua[1]);
    this._v(b[0], b[1], b[2], nx, ny, nz, ub[0], ub[1]);
    this._v(c[0], c[1], c[2], nx, ny, nz, uc[0], uc[1]);
    return this;
  }
  // vertical wall quad from (x0,z0) to (x1,z1), y0..y1, facing the left-hand normal of the direction
  // (walk from p0 to p1: the visible face is on your RIGHT, i.e. normal = (dz, 0, -dx)).
  wall(x0, z0, x1, z1, y0, y1, s = 1, uOff = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    return this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z1], [x1, y0, z1],
      [uOff * s, y0 * s], [uOff * s, y1 * s], [(uOff + len) * s, y1 * s], [(uOff + len) * s, y0 * s]);
  }
  // axis box centred at (cx, cy, cz) with size (sx, sy, sz) rotated by rotY; uv in metres * s
  box(cx, cy, cz, sx, sy, sz, rotY = 0, s = 1, opt = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = Math.cos(rotY), sn = Math.sin(rotY);
    const P = (x, y, z) => [cx + x * c + z * sn, cy + y, cz - x * sn + z * c];
    const p = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)];
    const q = (a, b, cc, d, w, h) => this.quad(p[a], p[b], p[cc], p[d], [0, 0], [w * s, 0], [w * s, h * s], [0, h * s]);
    q(3, 2, 6, 7, sx, sy); // +z
    q(1, 0, 4, 5, sx, sy); // -z
    q(2, 1, 5, 6, sz, sy); // +x
    q(0, 3, 7, 4, sz, sy); // -x
    if (!opt.noTop) q(7, 6, 5, 4, sx, sz);
    if (!opt.noBottom) q(0, 1, 2, 3, sx, sz);
    return this;
  }
  // general oriented box from a THREE.Matrix4 (unit cube -0.5..0.5 transformed)
  boxM(m, s = 1) {
    const e = m.elements;
    const P = (x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
    const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
    const h = 0.5;
    const p = [P(-h, -h, -h), P(h, -h, -h), P(h, -h, h), P(-h, -h, h), P(-h, h, -h), P(h, h, -h), P(h, h, h), P(-h, h, h)];
    const q = (a, b, cc, d, w, hh) => this.quad(p[a], p[b], p[cc], p[d], [0, 0], [w * s, 0], [w * s, hh * s], [0, hh * s]);
    q(3, 2, 6, 7, sx, sy); q(1, 0, 4, 5, sx, sy); q(2, 1, 5, 6, sz, sy); q(0, 3, 7, 4, sz, sy); q(7, 6, 5, 4, sx, sz); q(0, 1, 2, 3, sx, sz);
    return this;
  }
  // vertical (y-axis) frustum; smooth side normals
  cyl(cx, y0, cz, r0, r1, h, seg = 12, s = 1, capTop = true, capBottom = false) {
    const y1 = y0 + h;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const slope = (r0 - r1) / (h || 1);
      const n0 = norm3(c0, slope, s0), n1 = norm3(c1, slope, s1);
      const A = [cx + c0 * r0, y0, cz + s0 * r0], B = [cx + c1 * r0, y0, cz + s1 * r0];
      const C = [cx + c1 * r1, y1, cz + s1 * r1], Dd = [cx + c0 * r1, y1, cz + s0 * r1];
      const u0 = a0 * r0 * s, u1 = a1 * r0 * s;
      // outward facing: order A, D, C, B
      this._v(A[0], A[1], A[2], n0[0], n0[1], n0[2], u0, y0 * s);
      this._v(Dd[0], Dd[1], Dd[2], n0[0], n0[1], n0[2], u0, y1 * s);
      this._v(C[0], C[1], C[2], n1[0], n1[1], n1[2], u1, y1 * s);
      this._v(A[0], A[1], A[2], n0[0], n0[1], n0[2], u0, y0 * s);
      this._v(C[0], C[1], C[2], n1[0], n1[1], n1[2], u1, y1 * s);
      this._v(B[0], B[1], B[2], n1[0], n1[1], n1[2], u1, y0 * s);
      if (capTop && r1 > 0) this.tri([cx, y1, cz], C, Dd, [0.5, 0.5], [0.5 + c1 * 0.5, 0.5 + s1 * 0.5], [0.5 + c0 * 0.5, 0.5 + s0 * 0.5]);
      if (capBottom && r0 > 0) this.tri([cx, y0, cz], A, B);
    }
    return this;
  }
  // tube between two arbitrary points (for pipes/rails), radius r
  tube(a, b, r, seg = 6, s = 1) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = d.length(); if (len < 1e-6) return this;
    d.normalize();
    const up = Math.abs(d.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(d, up).normalize(); const t2 = new THREE.Vector3().crossVectors(d, t1);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const n0 = [t1.x * Math.cos(a0) + t2.x * Math.sin(a0), t1.y * Math.cos(a0) + t2.y * Math.sin(a0), t1.z * Math.cos(a0) + t2.z * Math.sin(a0)];
      const n1 = [t1.x * Math.cos(a1) + t2.x * Math.sin(a1), t1.y * Math.cos(a1) + t2.y * Math.sin(a1), t1.z * Math.cos(a1) + t2.z * Math.sin(a1)];
      const A = [a[0] + n0[0] * r, a[1] + n0[1] * r, a[2] + n0[2] * r], B = [a[0] + n1[0] * r, a[1] + n1[1] * r, a[2] + n1[2] * r];
      const C = [b[0] + n1[0] * r, b[1] + n1[1] * r, b[2] + n1[2] * r], Dd = [b[0] + n0[0] * r, b[1] + n0[1] * r, b[2] + n0[2] * r];
      this._v(A[0], A[1], A[2], n0[0], n0[1], n0[2], 0, 0); this._v(B[0], B[1], B[2], n1[0], n1[1], n1[2], 0.2, 0); this._v(C[0], C[1], C[2], n1[0], n1[1], n1[2], 0.2, len * s);
      this._v(A[0], A[1], A[2], n0[0], n0[1], n0[2], 0, 0); this._v(C[0], C[1], C[2], n1[0], n1[1], n1[2], 0.2, len * s); this._v(Dd[0], Dd[1], Dd[2], n0[0], n0[1], n0[2], 0, len * s);
    }
    return this;
  }
  // flat polygon (array of [x,z], optional holes) at height y, facing up; uvFn(x,z)->[u,v]
  poly(pts, holes, y, uvFn, down = false) {
    const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
    const hs = (holes || []).map(h => h.map(p => new THREE.Vector2(p[0], p[1])));
    // triangulateShape wants CW/CCW consistency
    if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
    for (const h of hs) if (!THREE.ShapeUtils.isClockWise(h)) h.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    const all = contour.concat(...hs);
    const f = uvFn || ((x, z) => [x, z]);
    const ny = down ? -1 : 1;
    for (const t of tris) {
      // ccw in (x, z) is clockwise seen from above (+y) because +z is toward the viewer -> flip for "up"
      const order = down ? [0, 1, 2] : [0, 2, 1];
      for (const k of order) { const p = all[t[k]]; const uv = f(p.x, p.y); this._v(p.x, y, p.y, 0, ny, 0, uv[0], uv[1]); }
    }
    return this;
  }
  // closed prism from a polygon ring ([x,z] list), y0..y1, outward walls + top cap
  prism(pts, y0, y1, s = 1, cap = true) {
    const ring = ensureCCW(pts);
    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      this.wall(a[0], a[1], b[0], b[1], y0, y1, s, u); u += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (cap) this.poly(ring, null, y1, (x, z) => [x * s, z * s]);
    return this;
  }
  addGeometry(geo, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) this._v(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    g.dispose();
    return this;
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    if (this.col) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function norm3(x, y, z) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

// In (x, z) with +z "down the page", a ring that is counter-clockwise in the mathematical (x, z) sense has
// its outward side on the RIGHT when walking it, which is what Bucket.wall() expects.
export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
export function ensureCCW(pts) {
  let r = pts;
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
  return signedArea(r) < 0 ? r.slice().reverse() : r;
}
export function ensureCW(pts) { return ensureCCW(pts).slice().reverse(); }

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// deterministic RNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Collects visual buckets by material key and collision buckets by surface name.
export class Builder {
  constructor() { this.visual = new Map(); this.collision = new Map(); }
  v(key, withColor = false) { let b = this.visual.get(key); if (!b) { b = new Bucket(withColor); this.visual.set(key, b); } return b; }
  c(surface) { let b = this.collision.get(surface); if (!b) { b = new Bucket(false); this.collision.set(surface, b); } return b; }
  // box that is both drawn and solid
  solidBox(key, surface, cx, cy, cz, sx, sy, sz, rotY = 0, s = 1) {
    this.v(key).box(cx, cy, cz, sx, sy, sz, rotY, s);
    this.c(surface).box(cx, cy, cz, sx, sy, sz, rotY, 1);
  }
}

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function canvasTexture(canvas, { srgb = true, repeat = true, aniso = 8, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso; t.generateMipmaps = mips;
  if (!mips) t.minFilter = THREE.LinearFilter;
  return t;
}
