// Bot navigation: ground-level walkable grid (world.navGrid, or a fallback built by raycasting) + A* with path smoothing.
// A fine clearance field (clearance.js: distance to the nearest solid at body height) makes paths keep off walls, poles
// and trunks, and string-pulls with the body's width, so smoothed paths never cut corners into geometry. Cells where a
// bot got stuck are penalised for a while (shared by every bot), so A* routes round traps nobody could see.
import * as THREE from 'three';
import { Clearance } from './clearance.js';

const cache = new WeakMap();
export const BODY = 0.5;   // clearance a walking bot wants along a straight line (capsule radius 0.35 + margin)
const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0);

export function navFor(world) {
  let n = cache.get(world);
  if (!n) { n = new Nav(world); cache.set(world, n); }
  return n;
}

class Nav {
  constructor(world) {
    this.world = world;
    const g = world.navGrid;
    if (g && g.walk && g.nx && g.nz) {
      Object.assign(this, { x0: g.x0, z0: g.z0, cell: g.cell, nx: g.nx, nz: g.nz, walk: g.walk, cost: g.cost || null });
    } else this._build();
    this.clr = new Clearance(world);
    if (import.meta.env?.DEV) console.info(`[bots] clearance field ${this.clr.nx}x${this.clr.nz} from ${this.clr.tris} triangles in ${this.clr.buildMs} ms`);
    // Per-cell clearance at the cell centre and a cost multiplier: hugging a wall costs extra, a cell whose centre a
    // body barely fits on (a post just next to it) costs a lot (still walkable: it may be the only way through a gate).
    const N0 = this.walk.length;
    this.cc = new Float32Array(N0);
    this.pen = new Float32Array(N0).fill(1);
    this.walkList = [];
    for (let i = 0; i < N0; i++) {
      if (!this.walk[i]) continue;
      const ix = i % this.nx, iz = (i / this.nx) | 0;
      const c = this.clr.at(this.x0 + (ix + 0.5) * this.cell, this.z0 + (iz + 0.5) * this.cell);
      this.cc[i] = c;
      this.pen[i] = c < 0.38 ? 8 : c < 0.8 ? 1 + (0.8 - c) * 5 : 1;
      if (c >= 0.5) this.walkList.push(i);      // random points: somewhere a bot can actually stand
    }
    if (!this.walkList.length) for (let i = 0; i < N0; i++) if (this.walk[i]) this.walkList.push(i);
    this.bad = new Map();                         // cell -> { until, w }: temporary penalties where bots got stuck
    // Reusable A* buffers (the grid can be ~140k cells): a stamp marks which entries belong to the current search.
    const N = this.walk.length;
    this.gScore = new Float32Array(N);
    this.came = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.closedStamp = new Uint32Array(N);
    this.search = 0;
  }

  walkableAt(x, z) { const i = this.idx(x, z); return i >= 0 && this.walk[i] === 1; }

  /** Clearance (m) to the nearest solid at body height at (x, z). */
  clearAt(x, z) { return this.clr.at(x, z); }

  /**
   * Straight segment stays on walkable cells with room for a body (clearance >= minC everywhere, except within
   * `skipA` m of a: a bot already squeezed against something may still walk away from it).
   */
  clearLine(a, b, minC = BODY, skipA = 0) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const n = Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.5));
    for (let k = 1; k < n; k++) if (!this.walkableAt(a.x + dx * k / n, a.z + dz * k / n)) return false;
    return this.clr.segClear(a.x, a.z, b.x, b.z, minC, skipA);
  }

  /** A bot got stuck around (x, z): make A* avoid the cells there for `secs` (stacks up to a heavy penalty). */
  markBad(x, z, secs, t) {
    const i0 = this.idx(x, z);
    if (i0 < 0) return;
    const ix0 = i0 % this.nx, iz0 = (i0 / this.nx) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ix = ix0 + dx, iz = iz0 + dz;
      if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
      const i = iz * this.nx + ix, o = this.bad.get(i);
      const w = (dx || dz ? 3 : 6) + (o && o.until > t ? o.w : 0);
      this.bad.set(i, { until: t + secs, w: Math.min(40, w) });
    }
  }

  _badCost(i, t) {
    const o = this.bad.get(i);
    if (!o) return 1;
    if (o.until < t) { this.bad.delete(i); return 1; }
    return 1 + o.w;
  }

  /** Fallback: a cell is walkable if a ray from above lands on ground level (not a roof, tree or prop). */
  _build() {
    const w = this.world, b = w.playBounds;
    const cell = 3.5;
    this.cell = cell;
    this.x0 = b.minX + 2; this.z0 = b.minZ + 2;
    this.nx = Math.floor((b.maxX - b.minX - 4) / cell);
    this.nz = Math.floor((b.maxZ - b.minZ - 4) / cell);
    this.walk = new Uint8Array(this.nx * this.nz);
    this.cost = null;
    const o = new THREE.Vector3();
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.x0 + (ix + 0.5) * cell, z = this.z0 + (iz + 0.5) * cell;
        const gy = w.groundY ? w.groundY(x, z) : 0;
        o.set(x, gy + 40, z);
        _ray.set(o, DOWN);
        _ray.far = 60;
        const hit = _ray.intersectObjects(w.collisionMeshes, false)[0];
        if (hit && Math.abs(hit.point.y - gy) < 0.45) this.walk[iz * this.nx + ix] = 1;
      }
    }
  }

  idx(x, z) {
    const ix = Math.floor((x - this.x0) / this.cell), iz = Math.floor((z - this.z0) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }

  center(i, out = new THREE.Vector3()) {
    const ix = i % this.nx, iz = (i / this.nx) | 0;
    const x = this.x0 + (ix + 0.5) * this.cell, z = this.z0 + (iz + 0.5) * this.cell;
    return out.set(x, this.world.groundY ? this.world.groundY(x, z) : 0, z);
  }

  /** Nearest walkable cell index to (x, z) (spiral search out to `maxR` cells), or -1. */
  nearest(x, z, maxR = 12) {
    let i = this.idx(x, z);
    if (i >= 0 && this.walk[i]) return i;
    const ix0 = Math.floor((x - this.x0) / this.cell), iz0 = Math.floor((z - this.z0) / this.cell);
    for (let r = 1; r < maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const ix = ix0 + dx, iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
        i = iz * this.nx + ix;
        if (this.walk[i]) return i;
      }
    }
    return -1;
  }

  /** Nearest walkable cell to (x, z) where a body fits (clearance at its centre), else the nearest walkable one. */
  nearestRoomy(x, z, maxR = 12) {
    const i = this.nearest(x, z, maxR);
    if (i < 0 || this.cc[i] >= BODY) return i;
    const ix0 = i % this.nx, iz0 = (i / this.nx) | 0;
    let best = i, bd = Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const ix = ix0 + dx, iz = iz0 + dz;
      if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
      const k = iz * this.nx + ix;
      if (!this.walk[k] || this.cc[k] < BODY) continue;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  /**
   * Nearest walkable cell that (x, z) can walk to in a straight line (nothing solid in between at body height), so a
   * bot squeezed into a slot behind a fence starts its path out of the slot's open end, not through the fence to
   * the cell on the other side. Falls back to the plain nearest cell.
   */
  nearestReachable(x, z, maxR = 12) {
    const i0 = this.idx(x, z);
    if (i0 >= 0 && this.walk[i0] && this.clr.segClear(x, z, this.x0 + ((i0 % this.nx) + 0.5) * this.cell, this.z0 + (((i0 / this.nx) | 0) + 0.5) * this.cell, 0.02)) return i0;
    const ix0 = Math.floor((x - this.x0) / this.cell), iz0 = Math.floor((z - this.z0) / this.cell);
    for (let r = 1; r < maxR; r++) {
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const ix = ix0 + dx, iz = iz0 + dz;
        if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
        const i = iz * this.nx + ix;
        if (!this.walk[i]) continue;
        const cx = this.x0 + (ix + 0.5) * this.cell, cz = this.z0 + (iz + 0.5) * this.cell;
        const d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < bd && this.clr.segClear(x, z, cx, cz, 0.02)) { bd = d; best = i; }
      }
      if (best >= 0) return best;
    }
    return this.nearest(x, z, maxR);
  }

  randomPoint(out = new THREE.Vector3()) {
    const i = this.walkList[Math.floor(Math.random() * this.walkList.length)];
    return this.center(i, out);
  }

  /** A* (8-connected, no corner cutting). Returns world-space waypoints (smoothed) or null. */
  findPath(from, to, maxExpand = 80000, t = 0) {
    // From a roof / an enclosed spot the nearest ground cell can be far: search wider for the start.
    const gy = this.world.groundY ? this.world.groundY(from.x, from.z) : 0;
    const s = from.y - gy < 1 ? this.nearestReachable(from.x, from.z, 8) : this.nearest(from.x, from.z, 40), g = this.nearestRoomy(to.x, to.z);
    if (s < 0 || g < 0) return null;
    if (s === g) return [to.clone()];
    const nx = this.nx;
    const st = ++this.search;
    const gScore = this.gScore, came = this.came, stamp = this.stamp, closedS = this.closedStamp;
    const G = (i) => (stamp[i] === st ? gScore[i] : Infinity);
    const heap = new MinHeap();
    const gx = g % nx, gz = (g / nx) | 0;
    // Weighted (x1.4) octile heuristic: slightly suboptimal paths, far fewer expansions on the big grid.
    const h = (i) => { const dx = Math.abs((i % nx) - gx), dz = Math.abs(((i / nx) | 0) - gz); return 1.4 * ((dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz)); };
    gScore[s] = 0; stamp[s] = st; came[s] = -1;
    heap.push(s, h(s));
    let expanded = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === g) break;
      if (closedS[cur] === st) continue;
      closedS[cur] = st;
      if (++expanded > maxExpand) return null;
      const cx = cur % nx, cz = (cur / nx) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= nx || z >= this.nz) continue;
        const ni = z * nx + x;
        if (!this.walk[ni] || closedS[ni] === st) continue;
        if (dx && dz && (!this.walk[cz * nx + x] || !this.walk[z * nx + cx])) continue;
        let step = (dx && dz ? Math.SQRT2 : 1) * (this.cost ? this.cost[ni] : 1) * this.pen[ni]; // multipliers (>= 1)
        if (this.bad.size) step *= this._badCost(ni, t);
        const ng = gScore[cur] + step;
        if (ng < G(ni)) { gScore[ni] = ng; stamp[ni] = st; came[ni] = cur; heap.push(ni, ng + h(ni)); }
      }
    }
    if (stamp[g] !== st) return null;
    const cells = [];
    for (let c = g; c !== -1 && c !== s; c = came[c]) cells.push(c);
    cells.reverse();
    // String-pull: keep the farthest cell still reachable in a straight walkable line.
    const raw = cells.map((c) => this.center(c));
    const goal = this.walkableAt(to.x, to.z) && this.clr.at(to.x, to.z) >= BODY * 0.8 ? to.clone() : raw[raw.length - 1];
    raw[raw.length - 1] = goal;
    const pts = [];
    let anchor = from.clone();
    let k = 0;
    while (k < raw.length) {
      let far = k;
      for (let j = Math.min(raw.length - 1, k + 40); j > k; j--) if (this.clearLine(anchor, raw[j], BODY, pts.length ? 0 : 0.6)) { far = j; break; }
      pts.push(raw[far]);
      anchor = raw[far];
      k = far + 1;
    }
    return pts;
  }
}

class MinHeap {
  constructor() { this.i = []; this.p = []; }
  get size() { return this.i.length; }
  push(item, pri) {
    const a = this.i, b = this.p;
    a.push(item); b.push(pri);
    let k = a.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (b[up] <= b[k]) break;
      [a[up], a[k]] = [a[k], a[up]]; [b[up], b[k]] = [b[k], b[up]];
      k = up;
    }
  }
  pop() {
    const a = this.i, b = this.p;
    const top = a[0];
    const li = a.pop(), lp = b.pop();
    if (a.length) {
      a[0] = li; b[0] = lp;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]]; [b[m], b[k]] = [b[k], b[m]];
        k = m;
      }
    }
    return top;
  }
}
