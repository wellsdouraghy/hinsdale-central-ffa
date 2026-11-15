// Terrain backdrop: the real hills around the campus (San Rafael Hill to the north-east, the ridge to the north-west),
// baked by tools/gen.py from 3D-tiles ground samples into gen.terrain (20 m grid, metres above the Mission Ave level,
// already faded to zero at the play bounds). VISUAL ONLY and outside the play area only: gameplay ground stays y = 0.
// Inside the satellite extent the hills reuse the ground material (streets / yards drape over them); beyond it they
// are wooded green with dry-grass patches, like the real skyline.
import * as THREE from 'three';
import { mulberry32, makeCanvas, canvasTexture } from './kit.js';

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
  const X = (i) => t.x0 + i * t.step, Z = (j) => t.z0 + j * t.step, edge = (i, j) => { const d = Math.min(i, j, n - 1 - i, n - 1 - j) * t.step; const k = Math.min(1, d / 520); return k * k * (3 - 2 * k); }, Hh = (i, j) => { const h = t.h[j * n + i] / 10 * edge(i, j); return h > 0 ? h : -0.04; };
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
    if (d.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; scene.add(m);
  };
  const ground = scene.getObjectByName('ground');
  mk(near, ground ? ground.material : new THREE.MeshStandardMaterial({ color: 0x4a6030, roughness: 1 }), 'terrain:near');
  // woodland canopy texture (tiled in world metres) so the far hills read as oak / bay forest with grass clearings
  const S = 256, cv = makeCanvas(S, S), g = cv.getContext('2d'); g.fillStyle = '#9aa58c'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 900; k++) { const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 7; const d = rnd(); g.fillStyle = d < 0.6 ? `rgba(${40 + rnd() * 30 | 0},${70 + rnd() * 40 | 0},${30 + rnd() * 20 | 0},0.85)` : `rgba(${150 + rnd() * 50 | 0},${170 + rnd() * 50 | 0},${110 + rnd() * 30 | 0},0.55)`; for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); } g.fillStyle = 'rgba(10,20,8,0.35)'; g.beginPath(); g.arc(x + r * 0.35, y + r * 0.4, r * 0.8, 0, 7); g.fill(); }
  const tex = canvasTexture(cv, { aniso: 4 });
  { const p = far.p, uv = []; for (let k = 0; k < p.length; k += 3) uv.push(p[k] / 90, p[k + 2] / 90); far.uv = uv; }
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1, metalness: 0 }); farMat.color.setRGB(2.4, 2.4, 2.4);
  mk(far, farMat, 'terrain:far');
  // scattered tree crowns and a few hillside houses on the nearer slopes (two instanced meshes, no collision)
  const H = terrainSampler(gen); const pb = ctx.playBounds; const dummy = new THREE.Object3D(); const col = new THREE.Color();
  const crowns = [], houses = [];
  for (let k = 0; k < 9000 && crowns.length < 2600; k++) {
    const x = (rnd() - 0.5) * 2300, z = (rnd() - 0.5) * 2300; if (x > sat.minX - 10 && x < sat.maxX + 10 && z > sat.minZ - 10 && z < sat.maxZ + 10) continue;
    const i = Math.round((x - t.x0) / t.step), j = Math.round((z - t.z0) / t.step); if (i < 1 || j < 1 || i > n - 2 || j > n - 2) continue;
    const h = H(x, z) * edge(i, j); if (h < 2) continue; if (sm(i, j) > 0.6 && rnd() < 0.8) continue;      // keep the grass clearings open
    crowns.push([x, h, z, 5 + rnd() * 5, rnd()]);
    if (houses.length < 160 && h < 110 && rnd() < 0.09) houses.push([x + 9, h, z + 4, rnd()]);
  }
  if (crowns.length) {
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), crowns.length);
    crowns.forEach(([x, y, z, r, v], k) => { dummy.position.set(x, y + r * 0.55, z); dummy.scale.set(r, r * (0.8 + v * 0.5), r); dummy.rotation.set(0, v * 6, 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); col.setRGB(0.035 + v * 0.03, 0.085 + v * 0.05, 0.03 + v * 0.015); im.setColorAt(k, col); });
    im.name = 'terrain:crowns'; im.castShadow = false; im.receiveShadow = false; im.matrixAutoUpdate = false; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
  }
  if (houses.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), houses.length);
    houses.forEach(([x, y, z, v], k) => { dummy.position.set(x, y + 2.5, z); dummy.scale.set(9 + v * 6, 5.5, 7 + v * 4); dummy.rotation.set(0, v * 3, 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); const w = 0.45 + v * 0.3; col.setRGB(w, w * 0.95, w * 0.85); im.setColorAt(k, col); });
    im.name = 'terrain:houses'; im.castShadow = false; im.matrixAutoUpdate = false; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
  }
}
