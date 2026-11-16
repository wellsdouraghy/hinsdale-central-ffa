// Terrain: optional real ground heights inside the play area (CAMPUSES.md "Terrain", MAP_NOTES.md "Terrain").
//
// A campus opts in with a descriptor entry `terrain: { ... }`; without it the world is exactly flat at y = 0 and none of
// this code runs (Hinsdale, Hamilton). The source heightfield is resampled once onto a working lattice (`cell`, default
// 2 m) that covers the whole satellite rectangle; world.groundY(x, z) is the bilinear height on that lattice, and the
// visual ground mesh and the ground collision are triangulated on the same nodes (2 m inside the play area, coarser
// outside), so the walk surface, the drawn ground and groundY agree to a few centimetres.
//
// Descriptor (all heights in world metres, +y up; rows run north -> south like the satellite image):
//   terrain: {
//     file: 'campuses/<id>/terrain.png' | '.bin',   // 16-bit grey PNG (or 8-bit) / raw little-endian samples
//     format: 'f32' | 'u16' | 'i16' | 'u8',          // .bin sample type (default f32); PNGs carry their own
//     nx, nz,                                         // .bin / heights: samples per row / rows (PNG: image size)
//     heights: [...],                                 // or inline samples (nx * nz)
//     fn: (x, z) => y,                                // or a procedural height function (test campuses)
//     scale = 1, offset = 0,                          // metres = sample * scale + offset (integer formats)
//     extent: { minX, maxX, minZ, maxZ },             // world rectangle covered by the samples (corner-aligned)
//     outside: 0 | (x, z) => y,                       // height beyond the extent (e.g. the campus backdrop's sampler)
//     blend: 30,                                      // metres over which the extent edge blends into `outside`
//     cell: 2,                                        // working lattice spacing (m)
//     flatten: [{ rect | circle | outline, y?, blend? }],  // pads for fields / courts / buildings (applied at load)
//   }
import * as THREE from 'three';

/** Steepest walkable ground: contact normal y >= 0.7 (~45.6 deg). Same threshold as the mantle ledge test (player.js)
 *  and the bots' ground tests (botMobility.js), so "walkable" means the same thing everywhere. */
export const WALK_NORMAL_Y = 0.7;
/** Bot nav grid: a cell steeper than this gradient (rise / run, ~42 deg) is blocked (a little margin under the controller limit). */
export const NAV_MAX_GRADE = Math.tan(42 * Math.PI / 180);
/** FFA / CTF spawns, CTF bases: at most this gradient (~20 deg). */
export const SPAWN_MAX_GRADE = Math.tan(20 * Math.PI / 180);
/** Helicopter parking on the ground: at most this height difference (m) under the skids (about 7 deg over 2.5 m). */
export const HELI_MAX_SKID_DROP = 0.3;

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------------------------------------------------------------------------------------------- loading
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** Minimal PNG decoder for heightmaps: grey / grey+alpha / RGB / RGBA, 8 or 16 bit, not interlaced. First channel only. */
export async function decodePNG(buf) {
  const b = new Uint8Array(buf); const dv = new DataView(buf);
  if (b[0] !== 0x89 || b[1] !== 0x50) throw new Error('terrain: not a PNG');
  let p = 8, w = 0, h = 0, depth = 8, ctype = 0, inter = 0; const idat = [];
  while (p < b.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (type === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = b[p + 16]; ctype = b[p + 17]; inter = b[p + 20]; }
    else if (type === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (inter) throw new Error('terrain: interlaced PNG not supported');
  const ch = { 0: 1, 4: 2, 2: 3, 6: 4 }[ctype]; if (!ch || (depth !== 8 && depth !== 16)) throw new Error('terrain: unsupported PNG format');
  let n = 0; for (const c of idat) n += c.length; const z = new Uint8Array(n); n = 0; for (const c of idat) { z.set(c, n); n += c.length; }
  const raw = await inflate(z);
  const bpp = ch * depth / 8, stride = w * bpp; const cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) out[y * w + x] = depth === 16 ? (cur[x * bpp] << 8) | cur[x * bpp + 1] : cur[x * bpp];
    prev.set(cur);
  }
  return { w, h, data: out };
}

async function loadSource(d) {
  if (typeof d.fn === 'function') return { fn: d.fn };
  let data, nx = d.nx, nz = d.nz;
  if (d.heights) data = Float32Array.from(d.heights);
  else if (d.file) {
    const buf = await fetch('./' + d.file).then((r) => { if (!r.ok) throw new Error('terrain: ' + d.file + ' ' + r.status); return r.arrayBuffer(); });
    if (/\.png$/i.test(d.file)) { const img = await decodePNG(buf); data = img.data; nx = img.w; nz = img.h; }
    else {
      const f = d.format || 'f32';
      const A = { f32: Float32Array, u16: Uint16Array, i16: Int16Array, u8: Uint8Array }[f]; if (!A) throw new Error('terrain: format ' + f);
      data = Float32Array.from(new A(buf, 0, Math.floor(buf.byteLength / A.BYTES_PER_ELEMENT)));
    }
  } else throw new Error('terrain: needs file, heights or fn');
  if (!nx || !nz || nx * nz > data.length) throw new Error('terrain: bad sample count');
  const s = d.scale ?? 1, o = d.offset ?? 0;
  if (s !== 1 || o !== 0) for (let i = 0; i < data.length; i++) data[i] = data[i] * s + o;
  return { data, nx, nz };
}

// ---------------------------------------------------------------------------------------------- shapes
/** Signed distance (m, < 0 inside) from (x, z) to a flatten / footprint shape. */
export function shapeSDF(shape) {
  if (shape.circle) { const c = shape.circle; return { sd: (x, z) => Math.hypot(x - c.x, z - c.z) - c.r, box: [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r] }; }
  if (shape.rect) {
    const r = shape.rect, c = Math.cos(r.angle || 0), s = Math.sin(r.angle || 0), hw = r.w / 2, hd = r.d / 2, R = Math.hypot(hw, hd);
    return {
      sd: (x, z) => { const dx = x - r.cx, dz = z - r.cz; const u = Math.abs(dx * c + dz * s) - hw, v = Math.abs(-dx * s + dz * c) - hd; return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0); },
      box: [r.cx - R, r.cz - R, r.cx + R, r.cz + R],
    };
  }
  const ring = shape.outline || shape.ring || shape;
  if (!Array.isArray(ring) || ring.length < 3) throw new Error('terrain: shape needs circle, rect or outline');
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return {
    sd: (x, z) => {
      let inside = false, best = Infinity;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i], [xj, zj] = ring[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
        const ex = xi - xj, ez = zi - zj, L = ex * ex + ez * ez; let t = L ? ((x - xj) * ex + (z - zj) * ez) / L : 0; t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(x - (xj + ex * t), z - (zj + ez * t)));
      }
      return inside ? -best : best;
    },
    box: [x0, z0, x1, z1],
  };
}

// ---------------------------------------------------------------------------------------------- terrain
/**
 * Builds the terrain for a campus, or returns null when the descriptor has no `terrain` (flat world).
 * sat / playBounds: the campus rectangles (the lattice covers sat; the fine part covers playBounds + 12 m).
 */
export async function createTerrain(campus, { sat = campus.sat, playBounds = campus.playBounds } = {}) {
  const d = campus.terrain; if (!d) return null;
  const src = await loadSource(d);
  const ext = d.extent || (src.fn ? null : sat);
  const outsideFn = typeof d.outside === 'function' ? d.outside : (() => (+d.outside || 0));
  const blend = d.blend ?? 30;
  // raw source height at (x, z): bilinear on the samples, clamped to the extent edge, blended into `outside` beyond it
  const sample = src.fn ? src.fn : (x, z) => {
    const fx = Math.min(Math.max((x - ext.minX) / (ext.maxX - ext.minX) * (src.nx - 1), 0), src.nx - 1.000001);
    const fz = Math.min(Math.max((z - ext.minZ) / (ext.maxZ - ext.minZ) * (src.nz - 1), 0), src.nz - 1.000001);
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j, D = src.data, n = src.nx;
    return (D[j * n + i] * (1 - a) + D[j * n + i + 1] * a) * (1 - b) + (D[(j + 1) * n + i] * (1 - a) + D[(j + 1) * n + i + 1] * a) * b;
  };
  const srcAt = (x, z) => {
    const h = sample(x, z); if (!ext) return h;
    const out = Math.max(ext.minX - x, x - ext.maxX, ext.minZ - z, z - ext.maxZ);
    return out > 0 ? h + (outsideFn(x, z) - h) * smooth(out / Math.max(1e-3, blend)) : h;
  };

  // ---- working lattice over the satellite rectangle (node (i, j) at x0 + i * cell, z0 + j * cell)
  const cell = d.cell || 2;
  const x0 = Math.floor(sat.minX / cell) * cell, z0 = Math.floor(sat.minZ / cell) * cell;
  const nx = Math.ceil((sat.maxX - x0) / cell) + 1, nz = Math.ceil((sat.maxZ - z0) / cell) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = srcAt(x0 + i * cell, z0 + j * cell);
  const x1 = x0 + (nx - 1) * cell, z1 = z0 + (nz - 1) * cell;
  if (ext && (ext.minX > playBounds.minX || ext.maxX < playBounds.maxX || ext.minZ > playBounds.minZ || ext.maxZ < playBounds.maxZ)) console.warn('[terrain] extent does not cover the play area: the edge is clamped');

  const heightAt = (x, z) => {
    if (x < x0 || z < z0 || x > x1 || z > z1) return srcAt(x, z);
    let fx = (x - x0) / cell, fz = (z - z0) / cell; let i = Math.floor(fx), j = Math.floor(fz);
    if (i >= nx - 1) i = nx - 2; if (j >= nz - 1) j = nz - 2; fx -= i; fz -= j;
    const k = j * nx + i;
    return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fz) + (H[k + nx] * (1 - fx) + H[k + nx + 1] * fx) * fz;
  };
  const E = 0.75;   // gradient footprint (m): about a capsule's width
  const gradAt = (x, z) => [(heightAt(x + E, z) - heightAt(x - E, z)) / (2 * E), (heightAt(x, z + E) - heightAt(x, z - E)) / (2 * E)];
  const normalAt = (x, z, out = new THREE.Vector3()) => { const [gx, gz] = gradAt(x, z); return out.set(-gx, 1, -gz).normalize(); };
  const slopeAt = (x, z) => { const [gx, gz] = gradAt(x, z); return Math.hypot(gx, gz); };   // rise / run
  // heights over a disc (centre, 12 points at r and 6 at r / 2): footprints of props, skids, trunks
  const ring = (x, z, r, fn) => { let v = fn(heightAt(x, z)); for (const [rr, n] of [[r, 12], [r / 2, 6]]) if (rr > 0) for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n + (n === 6 ? Math.PI / 6 : 0); v = fn(heightAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr), v); } return v; };
  const minIn = (x, z, r) => ring(x, z, r, (h, v = Infinity) => Math.min(h, v));
  const maxIn = (x, z, r) => ring(x, z, r, (h, v = -Infinity) => Math.max(h, v));
  /** Capsule rest height on the slope at (x, z): the 0.35 m foot sphere touches a tilted plane a little above groundY. */
  const standY = (x, z) => { const n = normalAt(x, z, _n); return heightAt(x, z) + 0.35 * (1 / Math.max(0.5, n.y) - 1) + 0.005; };
  const _n = new THREE.Vector3();

  /** Heights under a footprint (shape: [x, z] | { x, z, r } | ring [[x, z], ...] | { rect | circle | outline }). */
  function footprint(where) {
    let shape;
    if (Array.isArray(where) && typeof where[0] === 'number') shape = { circle: { x: where[0], z: where[1], r: where[2] || 0.5 } };
    else if (!Array.isArray(where) && where.x !== undefined) shape = { circle: { x: where.x, z: where.z, r: where.r || 0.5 } };
    else shape = Array.isArray(where) ? { outline: where } : where;
    const S = shapeSDF(shape); let min = Infinity, max = -Infinity, sum = 0, n = 0;
    const add = (h) => { min = Math.min(min, h); max = Math.max(max, h); sum += h; n++; };
    const [bx0, bz0, bx1, bz1] = S.box; const step = Math.max(0.5, Math.min(cell, Math.max(bx1 - bx0, bz1 - bz0) / 6));
    for (let z = bz0; z <= bz1 + 1e-6; z += step) for (let x = bx0; x <= bx1 + 1e-6; x += step) if (S.sd(x, z) <= 0.01) add(heightAt(x, z));
    for (const [x, z] of [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1], [(bx0 + bx1) / 2, (bz0 + bz1) / 2]]) if (S.sd(x, z) <= 0.01) add(heightAt(x, z));
    if (!n) add(heightAt((bx0 + bx1) / 2, (bz0 + bz1) / 2));
    return { min, max, mean: sum / n };
  }

  let version = 0;
  /**
   * Flattens the terrain under a shape ({ rect: { cx, cz, w, d, angle } } | { circle: { x, z, r } } | { outline: [[x, z], ...] })
   * to `y` (number, (x, z) => y for a sloped pad / ramp, or the mean height under the shape), blending back into the
   * surrounding ground over `blend` metres. Returns the pad height (at the centre for a function). Call it from the
   * builder BEFORE placing anything on that ground (groundY reads the flattened heights).
   */
  function flatten(shape, opts = {}) {
    const S = shapeSDF(shape); const b = opts.blend ?? shape.blend ?? 4;
    const yOpt = opts.y ?? shape.y; const fp = yOpt === undefined ? footprint(shape) : null;
    const yAt = typeof yOpt === 'function' ? yOpt : () => (yOpt === undefined ? fp.mean : yOpt);
    const i0 = Math.max(0, Math.floor((S.box[0] - b - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((S.box[2] + b - x0) / cell));
    const j0 = Math.max(0, Math.floor((S.box[1] - b - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((S.box[3] + b - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + i * cell, z = z0 + j * cell; const sd = S.sd(x, z); if (sd >= b) continue;
      const t = sd <= 0 ? 0 : smooth(sd / Math.max(1e-3, b)); const k = j * nx + i;
      H[k] = yAt(x, z) + (H[k] - yAt(x, z)) * t;
    }
    version++; if (tex) { tex.needsUpdate = true; }
    return yAt((S.box[0] + S.box[2]) / 2, (S.box[1] + S.box[3]) / 2);
  }
  for (const f of d.flatten || []) flatten(f, f);

  // ---- lattice used by the visual ground mesh and the ground collision: every node inside the play area + 12 m,
  // every 4th node (8 m at the default 2 m cell) outside it, out to the satellite edge. Rectilinear, so no T-junctions.
  function lines(lo, hi, a, b, n) {
    const out = []; const fa = Math.max(0, Math.floor((a - lo) / cell)), fb = Math.min(n - 1, Math.ceil((b - lo) / cell));
    for (let i = 0; i < fa; i += 4) out.push(i);
    for (let i = fa; i <= fb; i++) out.push(i);
    for (let i = fb + 4; i < n - 1; i += 4) out.push(i);
    if (out[out.length - 1] !== n - 1) out.push(n - 1);
    return out;
  }
  const M = 12;
  const lat = { xi: lines(x0, x1, playBounds.minX - M, playBounds.maxX + M, nx), zj: lines(z0, z1, playBounds.minZ - M, playBounds.maxZ + M, nz) };
  lat.xs = lat.xi.map((i) => x0 + i * cell); lat.zs = lat.zj.map((j) => z0 + j * cell);
  /** Fine collision region (node indices): inside it every lattice cell is `cell` wide. */
  lat.fine = { i0: Math.max(0, Math.floor((playBounds.minX - M - x0) / cell)), i1: Math.min(nx - 1, Math.ceil((playBounds.maxX + M - x0) / cell)), j0: Math.max(0, Math.floor((playBounds.minZ - M - z0) / cell)), j1: Math.min(nz - 1, Math.ceil((playBounds.maxZ + M - z0) / cell)) };

  /**
   * Height of the ground AS DRAWN AND COLLIDED: the mesh splits every lattice cell along its (a, b)-(a+1, b+1) diagonal,
   * so on a twisted cell the two triangles differ from the bilinear heightAt by up to a quarter of the twist (0.5 m and
   * more on a steep bank). Things the GAME stands on the ground (flags, dummies, markers, bodies) use this one
   * (world.groundY); builders, street grading and the map check keep the smooth bilinear heightAt (ctx.groundY).
   */
  const cellOf = (arr, v) => { let lo = 0, hi = arr.length - 1; if (v <= arr[0]) return 0; if (v >= arr[hi]) return hi - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; } return lo; };
  const meshHeightAt = (x, z) => {
    const xs = lat.xs, zs = lat.zs; if (x < xs[0] || z < zs[0] || x > xs[xs.length - 1] || z > zs[zs.length - 1]) return heightAt(x, z);
    const a = cellOf(xs, x), b = cellOf(zs, z); const u = (x - xs[a]) / (xs[a + 1] - xs[a]), v = (z - zs[b]) / (zs[b + 1] - zs[b]);
    const h00 = H[lat.zj[b] * nx + lat.xi[a]], h10 = H[lat.zj[b] * nx + lat.xi[a + 1]], h01 = H[lat.zj[b + 1] * nx + lat.xi[a]], h11 = H[lat.zj[b + 1] * nx + lat.xi[a + 1]];
    return v >= u ? h00 + (h11 - h01) * u + (h01 - h00) * v : h00 + (h10 - h00) * u + (h11 - h10) * v;
  };
  /** Visual ground mesh geometry on the lattice (indexed; normals from the heights). */
  function groundGeometry() {
    const NX = lat.xs.length, NZ = lat.zs.length;
    const pos = new Float32Array(NX * NZ * 3), idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
    let o = 0;
    for (let b = 0; b < NZ - 1; b++) for (let a = 0; a < NX - 1; a++) {
      const k = b * NX + a;
      // (a, b) -> (a, b+1) -> (a+1, b+1) / (a, b) -> (a+1, b+1) -> (a+1, b): front face up (+z is south)
      idx[o++] = k; idx[o++] = k + NX; idx[o++] = k + NX + 1; idx[o++] = k; idx[o++] = k + NX + 1; idx[o++] = k + 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(NX * NZ * 3), 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    refreshGeometry(g);
    return g;
  }
  function refreshGeometry(g) {
    const NX = lat.xs.length, NZ = lat.zs.length; const pos = g.attributes.position.array, nor = g.attributes.normal.array;
    for (let b = 0; b < NZ; b++) for (let a = 0; a < NX; a++) {
      const k = (b * NX + a) * 3; const i = lat.xi[a], j = lat.zj[b];
      pos[k] = lat.xs[a]; pos[k + 1] = H[j * nx + i]; pos[k + 2] = lat.zs[b];
      // normal from the neighbouring lattice nodes (central differences on the working grid)
      const il = Math.max(0, i - 1), ir = Math.min(nx - 1, i + 1), jd = Math.max(0, j - 1), ju = Math.min(nz - 1, j + 1);
      const gx = (H[j * nx + ir] - H[j * nx + il]) / ((ir - il) * cell), gz = (H[ju * nx + i] - H[jd * nx + i]) / ((ju - jd) * cell);
      const L = Math.hypot(gx, 1, gz); nor[k] = -gx / L; nor[k + 1] = 1 / L; nor[k + 2] = -gz / L;
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.terrainVersion = version;
  }

  /** Height texture for shaders (R32F, texel (i, j) = lattice node; sample with texelFetch + manual bilinear). */
  let tex = null;
  function texture() {
    if (!tex) { tex = new THREE.DataTexture(H, nx, nz, THREE.RedFormat, THREE.FloatType); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true; }
    return tex;
  }

  let min = Infinity, max = -Infinity; for (let k = 0; k < H.length; k++) { if (H[k] < min) min = H[k]; if (H[k] > max) max = H[k]; }
  return {
    active: true, cell, x0, z0, nx, nz, heights: H, lattice: lat,
    get version() { return version; },
    get minY() { let m = Infinity; for (let k = 0; k < H.length; k++) if (H[k] < m) m = H[k]; return m; },
    get maxY() { let m = -Infinity; for (let k = 0; k < H.length; k++) if (H[k] > m) m = H[k]; return m; },
    range0: { min, max },
    heightAt, meshHeightAt, normalAt, slopeAt, gradAt, minIn, maxIn, standY, footprint, flatten,
    groundGeometry, refreshGeometry, texture,
  };
}

// ---------------------------------------------------------------------------------------------- builder helpers
/**
 * Adds the terrain helpers to the campus builder ctx (always present; on a flat campus they are no-ops that leave the
 * output byte-identical):
 *   ctx.terrain                    terrain object or null
 *   ctx.groundY(x, z)              ground height (0 on flat campuses)
 *   ctx.flatten(shape, opts)       terrain.flatten (returns the pad height; 0 on flat campuses)
 *   ctx.onGround(where, fn, opts)  runs fn(baseY) with every Builder vertex raised by baseY (ground height under `where`:
 *                                  [x, z] | [x, z, r] | { x, z, r } | ring | { rect | circle | outline }; opts.mode
 *                                  'min' (default: sink into the slope) | 'max' | 'mean' | a number; opts.plinth: build a
 *                                  foundation from below the lowest ground up to baseY (mode defaults to 'max' then)).
 *                                  Ladders, grapple poles, shrubs and props registered inside fn are raised too.
 *   ctx.plinth(ring, topY, opts)   foundation prism (visual + collision) from below the lowest ground to topY
 *   ctx.drape(bucket, fromVertex)  adds groundY to every vertex of `bucket` from vertex index `fromVertex` on (ground
 *                                  decals / painted lines built at y = 0.01..0.02: subdivide them to <= the lattice cell)
 */
export function installBuilderHelpers(ctx, terrain) {
  ctx.terrain = terrain;
  ctx.groundY = terrain ? terrain.heightAt : () => 0;
  ctx.flatten = terrain ? terrain.flatten : () => 0;
  ctx.drape = (bucket, from = 0) => {
    if (!terrain) return bucket;
    const P = bucket.pos; for (let k = from * 3; k < P.length; k += 3) P[k + 1] += terrain.heightAt(P[k], P[k + 2]);
    return bucket;
  };
  ctx.plinth = (ring, topY, opts = {}) => {
    if (!terrain) return null;
    const fp = terrain.footprint(ring); const bottom = fp.min - (opts.depth ?? 0.6);
    if (topY - bottom < 0.05) return null;
    const off = ctx.B.off ? ctx.B.off.y : 0; if (ctx.B.off) ctx.B.off.y = 0;
    ctx.B.v(opts.material || 'concrete').prism(ring, bottom, topY, opts.uvScale ?? 1 / 3, opts.cap !== false);
    ctx.B.c(opts.surface || 'concrete').prism(ring, bottom, topY, 1, true);
    if (ctx.B.off) ctx.B.off.y = off;
    return { bottom, top: topY, ground: fp };
  };
  ctx.onGround = (where, fn, opts = {}) => {
    if (!terrain || !ctx.B.off) return fn(0);
    const fp = terrain.footprint(where);
    const mode = opts.mode ?? (opts.plinth ? 'max' : 'min');
    const base = (typeof mode === 'number' ? mode : fp[mode]) + (opts.lift || 0);
    if (opts.plinth) {
      const ring = Array.isArray(where) && Array.isArray(where[0]) ? where : null;
      if (ring) ctx.plinth(ring, base, typeof opts.plinth === 'object' ? opts.plinth : {});
    }
    // base is absolute: a nested onGround replaces the outer offset, and registered entries are shifted by the difference
    // here (the outer block adds its own base on exit)
    const prev = ctx.B.off.y, delta = base - prev; ctx.B.off.y = base; ctx.groundDepth = (ctx.groundDepth || 0) + 1;
    const nL = ctx.ladders.length, nP = ctx.grapplePoles.length, nS = ctx.shrubs.length;
    try { return fn(base); } finally {
      ctx.B.off.y = prev; ctx.groundDepth--;
      for (let i = nL; i < ctx.ladders.length; i++) { const L = ctx.ladders[i]; L.y0 += delta; L.y1 += delta; if (L.exitY !== undefined) L.exitY += delta; }
      for (let i = nP; i < ctx.grapplePoles.length; i++) { const p = ctx.grapplePoles[i]; p.y0 += delta; p.y1 += delta; }
      for (let i = nS; i < ctx.shrubs.length; i++) ctx.shrubs[i][1] += delta;
    }
  };
  return ctx;
}
