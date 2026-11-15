// Elevated standing spots ("perches": flat roof decks, dugout / bus / press-box tops) discovered from the world
// collision alone (no campus data): a coarse grid of downward rays over the play area, built a slice per frame on the
// host the first time bots need it. Bots grapple up to edge perches for vantage / escape and know when they are off
// the ground nav grid. Works on any campus that follows the world API (collisionMeshes, playBounds, navSample).
import * as THREE from 'three';

const CELL = 3;            // metres between samples
const MIN_H = 2.4;         // above ground: lower tops are steps / kerbs / props
const MAX_H = 22;          // higher tops (towers, stadium lights) are not perches
const cache = new WeakMap();
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);

export function perchesFor(world, hitscan) {
  let m = cache.get(world);
  if (!m) { m = new PerchMap(world, hitscan); cache.set(world, m); }
  return m;
}

class PerchMap {
  constructor(world, hitscan) {
    this.world = world;
    this.hs = hitscan;
    const b = world.playBounds;
    this.x0 = b.minX + 1; this.z0 = b.minZ + 1;
    this.nx = Math.max(1, Math.floor((b.maxX - b.minX - 2) / CELL));
    this.nz = Math.max(1, Math.floor((b.maxZ - b.minZ - 2) / CELL));
    this.h = new Float32Array(this.nx * this.nz).fill(NaN);   // deck height per cell (NaN: no perch surface)
    this.row = 0;
    this.ready = false;
    this.list = [];            // [{ x, y, z, edge, i }]
  }

  /** Scans up to `rays` cells (call every frame until `ready`). */
  step(rays = 700) {
    if (this.ready) return true;
    const o = new THREE.Vector3();
    const g = this.world.groundY || (() => 0);
    let n = 0;
    while (this.row < this.nz && n < rays) {
      const iz = this.row++;
      for (let ix = 0; ix < this.nx; ix++, n++) {
        const x = this.x0 + (ix + 0.5) * CELL, z = this.z0 + (iz + 0.5) * CELL;
        const gy = g(x, z);
        o.set(x, gy + MAX_H + 25, z);
        const hit = this.hs.castWorld(o, DOWN, MAX_H + 30);
        if (!hit || hit.normal.y < 0.9) continue;
        const hy = hit.point.y - gy;
        if (hy < MIN_H || hy > MAX_H) continue;
        // Headroom: nothing solid right above the deck (canopies, overhangs).
        o.set(x, hit.point.y + 0.15, z);
        if (this.hs.castWorld(o, UP, 2.1)) continue;
        this.h[iz * this.nx + ix] = hit.point.y;
      }
    }
    if (this.row >= this.nz) this._finish();
    return this.ready;
  }

  _finish() {
    const { nx, nz, h } = this;
    const at = (ix, iz) => (ix < 0 || iz < 0 || ix >= nx || iz >= nz ? NaN : h[iz * nx + ix]);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const y = h[iz * nx + ix];
      if (Number.isNaN(y)) continue;
      // Needs at least two level neighbours (a deck, not a lamp top or a fence cap); missing / much lower
      // neighbours make it an edge (somewhere to grapple onto and to look out from).
      let same = 0, drop = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = at(ix + dx, iz + dz);
        if (!Number.isNaN(ny) && Math.abs(ny - y) < 0.7) same++;
        else if (Number.isNaN(ny) || ny < y - 2) drop++;
      }
      if (same < 2) continue;
      this.list.push({ x: this.x0 + (ix + 0.5) * CELL, y, z: this.z0 + (iz + 0.5) * CELL, edge: drop > 0, i: iz * nx + ix });
    }
    this.ready = true;
  }

  /** Deck height of the perch cell under (x, z), or NaN. */
  deckAt(x, z) {
    const ix = Math.floor((x - this.x0) / CELL), iz = Math.floor((z - this.z0) / CELL);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return NaN;
    return this.h[iz * this.nx + ix];
  }
}
