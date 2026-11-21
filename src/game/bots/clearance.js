// Ground clearance field for bots: distance (m, 0.25 m resolution, capped at 2.55 m) from any point of the play area to
// the nearest solid that a walking body would hit (anything between knee and head height above the local ground:
// walls, fences, poles, trunks, benches, cars, bollards...). Built once on the host from the world collision (no campus
// data), by rasterizing every non-ground collision triangle into an occupancy grid and running an exact Euclidean
// distance transform. The 1.25 m nav grid only sees what its probe rays cross, so thin things (lamp posts, trunks,
// sign posts, bike racks) between ray lines were invisible to path planning; this field sees everything.
//
// Used for: path costs (keep off walls / poles), string-pulling with the body's width (no corner cutting), runtime
// path lookahead, steering away from obstacles, and stuck recovery (which way is open).
import * as THREE from 'three';
import { NAV_MAX_GRADE } from '../../world/terrain.js';

export const RES = 0.25;          // m per field cell
const BAND_LO = 0.4, BAND_HI = 1.9;   // solid between these heights above the local ground blocks a walker (lower = steppable)
const MAX_CM = 255;
const STEEP = NAV_MAX_GRADE;      // rise / run: the nav grid's limit (42 degrees)

export class Clearance {
  constructor(world) {
    const b = world.playBounds;
    this.x0 = b.minX; this.z0 = b.minZ;
    this.nx = Math.ceil((b.maxX - b.minX) / RES); this.nz = Math.ceil((b.maxZ - b.minZ) / RES);
    const N = this.nx * this.nz;
    const occ = new Uint8Array(N);
    const gy = world.groundY || (() => 0);
    const v = new THREE.Vector3();
    const P = new Float32Array(9);
    const t0 = Date.now();
    let tris = 0;
    for (const m of world.collisionMeshes) {
      if (m.userData.isGround) continue;
      const a = m.geometry.attributes.position.array;
      const idx = m.geometry.index ? m.geometry.index.array : null;
      m.updateWorldMatrix(true, false);
      const mw = m.matrixWorld, ident = isIdentity(mw);
      const nt = idx ? idx.length / 3 : a.length / 9;
      for (let t = 0; t < nt; t++) {
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx[t * 3 + k] : t * 3 + k;
          if (ident) { P[k * 3] = a[vi * 3]; P[k * 3 + 1] = a[vi * 3 + 1]; P[k * 3 + 2] = a[vi * 3 + 2]; }
          else { v.set(a[vi * 3], a[vi * 3 + 1], a[vi * 3 + 2]).applyMatrix4(mw); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z; }
        }
        const ymin = Math.min(P[1], P[4], P[7]), ymax = Math.max(P[1], P[4], P[7]);
        const cx = (P[0] + P[3] + P[6]) / 3, cz = (P[2] + P[5] + P[8]) / 3;
        const g = gy(cx, cz);
        if (ymax < g + BAND_LO || ymin > g + BAND_HI) continue;
        tris++;
        this._raster(occ, P, gy);
      }
    }
    // Terrain campuses: ground steeper than the walk grid allows is a wall for a walker too (the controller slides
    // down it), so a bank counts as an obstacle (sampled every 0.5 m).
    const T = world.terrain;
    if (T?.slopeAt) {
      for (let j = 0; j < this.nz; j += 2) for (let i = 0; i < this.nx; i += 2) {
        if (T.slopeAt(this.x0 + (i + 1) * RES, this.z0 + (j + 1) * RES) <= STEEP) continue;
        for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) if (i + a < this.nx && j + b < this.nz) occ[(j + b) * this.nx + i + a] = 1;
      }
    }
    this.d = edt(occ, this.nx, this.nz);
    this.buildMs = Math.round(Date.now() - t0);
    this.tris = tris;
  }

  /** Marks field cells within ~0.6 cell of the triangle's footprint (only where the triangle reaches the walk band). */
  _raster(occ, P, gy) {
    const { x0, z0, nx, nz } = this;
    const minX = Math.min(P[0], P[3], P[6]), maxX = Math.max(P[0], P[3], P[6]);
    const minZ = Math.min(P[2], P[5], P[8]), maxZ = Math.max(P[2], P[5], P[8]);
    const i0 = Math.max(0, Math.floor((minX - x0) / RES - 0.5)), i1 = Math.min(nx - 1, Math.floor((maxX - x0) / RES + 0.5));
    const j0 = Math.max(0, Math.floor((minZ - z0) / RES - 0.5)), j1 = Math.min(nz - 1, Math.floor((maxZ - z0) / RES + 0.5));
    if (i0 > i1 || j0 > j1) return;
    const ax = P[0], az = P[2], bx = P[3], bz = P[5], cx = P[6], cz = P[8];
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const tol = RES * 0.6;
    const big = (i1 - i0) * (j1 - j0) > 16;
    // Steep / tall triangles (walls) are solid at every height in the band; flat-ish ones (bench seats, car roofs,
    // ramps) are tested against the local ground at each cell so a gentle ramp does not count as an obstacle.
    const ymin = Math.min(P[1], P[4], P[7]), ymax = Math.max(P[1], P[4], P[7]);
    const flatish = Math.abs(area) > 1e-6 && (ymax - ymin) < Math.sqrt(Math.abs(area)) * 1.2;
    for (let j = j0; j <= j1; j++) {
      const pz = z0 + (j + 0.5) * RES;
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (occ[k]) continue;
        const px = x0 + (i + 0.5) * RES;
        let inside = false;
        if (Math.abs(area) > 1e-6) {
          const w0 = (bx - px) * (cz - pz) - (bz - pz) * (cx - px);
          const w1 = (cx - px) * (az - pz) - (cz - pz) * (ax - px);
          const w2 = (ax - px) * (bz - pz) - (az - pz) * (bx - px);
          inside = area > 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0;
        }
        if (!inside && segD(px, pz, ax, az, bx, bz) > tol && segD(px, pz, bx, bz, cx, cz) > tol && segD(px, pz, cx, cz, ax, az) > tol) continue;
        if (flatish && big) {
          // height of the triangle plane at this point vs the local ground
          let y;
          if (Math.abs(area) > 1e-6) {
            const w0 = ((bx - px) * (cz - pz) - (bz - pz) * (cx - px)) / area, w1 = ((cx - px) * (az - pz) - (cz - pz) * (ax - px)) / area;
            y = w0 * P[1] + w1 * P[4] + (1 - w0 - w1) * P[7];
          } else y = (ymin + ymax) / 2;
          const g = gy(px, pz);
          if (y < g + BAND_LO || y > g + BAND_HI) continue;
        }
        occ[k] = 1;
      }
    }
  }

  /** Clearance (m) at (x, z); 0 outside the field. */
  at(x, z) {
    const i = Math.floor((x - this.x0) / RES), j = Math.floor((z - this.z0) / RES);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 0;
    return this.d[j * this.nx + i] / 100;
  }

  /** Direction of increasing clearance at (x, z) (unit, xz) into `out`; returns false where flat. */
  gradient(x, z, out) {
    const h = RES * 1.5;
    const gx = this.at(x + h, z) - this.at(x - h, z), gz = this.at(x, z + h) - this.at(x, z - h);
    const L = Math.hypot(gx, gz);
    if (L < 1e-3) return false;
    out.set(gx / L, 0, gz / L);
    return true;
  }

  /** Every point of the segment a-b has at least `minC` clearance (ignoring the first `skipA` metres). */
  segClear(ax, az, bx, bz, minC, skipA = 0) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const n = Math.ceil(L / (RES * 0.8));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      if (f * L < skipA) continue;
      if (this.at(ax + dx * f, az + dz * f) < minC) return false;
    }
    return true;
  }
}

function segD(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

function isIdentity(m) {
  const e = m.elements, id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let i = 0; i < 16; i++) if (Math.abs(e[i] - id[i]) > 1e-9) return false;
  return true;
}

/** Exact Euclidean distance transform (Felzenszwalb & Huttenlocher) of the occupied cells, in cm (capped). */
function edt(occ, nx, nz) {
  const INF = 1e12;
  const f = new Float64Array(Math.max(nx, nz)), d = new Float64Array(Math.max(nx, nz));
  const v = new Int32Array(Math.max(nx, nz)), zb = new Float64Array(Math.max(nx, nz) + 1);
  const g = new Float64Array(nx * nz);
  const cap2 = (MAX_CM / 100 / RES + 2) ** 2;
  const pass = (n) => {
    let k = 0; v[0] = 0; zb[0] = -INF; zb[1] = INF;
    for (let q = 1; q < n; q++) {
      let p = v[k];
      let s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      while (s <= zb[k]) { k--; p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); }
      k++; v[k] = q; zb[k] = s; zb[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (zb[k + 1] < q) k++; const dq = q - v[k]; d[q] = dq * dq + f[v[k]]; }
  };
  // columns (z), then rows (x)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) f[j] = occ[j * nx + i] ? 0 : cap2;
    pass(nz);
    for (let j = 0; j < nz; j++) g[j * nx + i] = d[j];
  }
  const out = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) f[i] = g[j * nx + i];
    pass(nx);
    for (let i = 0; i < nx; i++) {
      // distance between cell centres minus half a cell (the obstacle fills its cell), in cm
      const m = Math.max(0, Math.sqrt(d[i]) - 0.5) * RES * 100;
      out[j * nx + i] = m > MAX_CM ? MAX_CM : Math.round(m);
    }
  }
  return out;
}
