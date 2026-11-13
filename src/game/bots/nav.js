// Bot navigation: ground-level walkable grid (world.navGrid, or a fallback built by raycasting) + A* with path smoothing.
import * as THREE from 'three';

const cache = new WeakMap();
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
    this.walkList = [];
    for (let i = 0; i < this.walk.length; i++) if (this.walk[i]) this.walkList.push(i);
    // Reusable A* buffers (the grid can be ~140k cells): a stamp marks which entries belong to the current search.
    const N = this.walk.length;
    this.gScore = new Float32Array(N);
    this.came = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.closedStamp = new Uint32Array(N);
    this.search = 0;
  }

  walkableAt(x, z) { const i = this.idx(x, z); return i >= 0 && this.walk[i] === 1; }

  /** Straight segment stays on walkable cells (sampled every half cell). */
  clearLine(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const n = Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.5));
    for (let k = 1; k < n; k++) if (!this.walkableAt(a.x + dx * k / n, a.z + dz * k / n)) return false;
    return true;
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

  /** Nearest walkable cell index to (x, z) (spiral search), or -1. */
  nearest(x, z) {
    let i = this.idx(x, z);
    if (i >= 0 && this.walk[i]) return i;
    const ix0 = Math.floor((x - this.x0) / this.cell), iz0 = Math.floor((z - this.z0) / this.cell);
    for (let r = 1; r < 12; r++) {
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

  randomPoint(out = new THREE.Vector3()) {
    const i = this.walkList[Math.floor(Math.random() * this.walkList.length)];
    return this.center(i, out);
  }

  /** A* (8-connected, no corner cutting). Returns world-space waypoints (smoothed) or null. */
  findPath(from, to, maxExpand = 80000) {
    const s = this.nearest(from.x, from.z), g = this.nearest(to.x, to.z);
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
        const step = (dx && dz ? Math.SQRT2 : 1) * (this.cost ? this.cost[ni] : 1); // cost is a multiplier (>= 1)
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
    const goal = this.walkableAt(to.x, to.z) ? to.clone() : raw[raw.length - 1];
    raw[raw.length - 1] = goal;
    const pts = [];
    let anchor = from.clone();
    let k = 0;
    while (k < raw.length) {
      let far = k;
      for (let j = Math.min(raw.length - 1, k + 40); j > k; j--) if (this.clearLine(anchor, raw[j])) { far = j; break; }
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
