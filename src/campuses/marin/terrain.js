// Terrain backdrop: the real hills around the campus (San Rafael Hill to the north-east, the ridge to the north-west),
// baked by tools/gen.py from 3D-tiles ground samples into gen.terrain (20 m grid, metres above the Mission Ave level,
// already faded to zero at the play bounds). VISUAL ONLY and outside the play area only: gameplay ground stays y = 0.
// Inside the satellite extent the hills reuse the ground material (streets / yards drape over them); beyond it they
// are wooded green with dry-grass patches, like the real skyline.
import * as THREE from 'three';
import { mulberry32 } from './kit.js';

export function terrainSampler(gen) {
  const t = gen.terrain; if (!t) return () => 0;
  return (x, z) => {
    const fx = Math.min(Math.max((x - t.x0) / t.step, 0), t.n - 1.001), fz = Math.min(Math.max((z - t.z0) / t.step, 0), t.n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j; const H = (ii, jj) => t.h[jj * t.n + ii] / 10;
    return H(i, j) * (1 - a) * (1 - b) + H(i + 1, j) * a * (1 - b) + H(i, j + 1) * (1 - a) * b + H(i + 1, j + 1) * a * b;
  };
}

export function buildTerrain(ctx) {
  const { gen, scene, campus } = ctx; const t = gen.terrain; if (!t) return;
  const sat = campus.sat; const n = t.n; const rnd = mulberry32(1971);
  const noise = new Float32Array(n * n); for (let k = 0; k < noise.length; k++) noise[k] = rnd();
  const sm = (i, j) => { let s = 0, c = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; s += noise[jj * n + ii]; c++; } return s / c; };
  const X = (i) => t.x0 + i * t.step, Z = (j) => t.z0 + j * t.step, Hh = (i, j) => { const h = t.h[j * n + i] / 10; return h > 0 ? h : -0.04; };
  const inSat = (i, j) => X(i) > sat.minX + 1 && X(i) < sat.maxX - 1 && Z(j) > sat.minZ + 1 && Z(j) < sat.maxZ - 1;
  const near = { p: [], nrm: [] }, far = { p: [], c: [] };
  const colAt = (i, j) => { const g = Math.max(0, Math.min(0.75, (sm(i, j) - 0.58) * 11)); const v = 0.7 + 0.5 * noise[j * n + i]; return [(0.03 + 0.2 * g) * v, (0.075 + 0.15 * g) * v, (0.022 + 0.05 * g) * v]; };   // oak woodland with dry-grass clearings
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const c = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
    const any = c.some(([a, b]) => t.h[b * n + a] > 0); const inside = c.every(([a, b]) => inSat(a, b));
    if (inside && !any) continue;                       // flat ground inside the satellite extent: the ground plane has it
    const dst = inside ? near : far;
    for (const k of [0, 1, 2, 0, 2, 3]) { const [a, b] = c[k]; dst.p.push(X(a), Hh(a, b), Z(b)); if (!inside) dst.c.push(...colAt(a, b)); }
  }
  const mk = (d, mat, name) => {
    if (!d.p.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
    if (d.c) g.setAttribute('color', new THREE.Float32BufferAttribute(d.c, 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; scene.add(m);
  };
  const ground = scene.getObjectByName('ground');
  mk(near, ground ? ground.material : new THREE.MeshStandardMaterial({ color: 0x4a6030, roughness: 1 }), 'terrain:near');
  mk(far, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), 'terrain:far');
}
