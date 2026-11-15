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
    // canopy dome: 18 smooth-shaded triangles, open underneath (never seen from below), darker toward the skirt so the
    // massed crowns read as rounded oak / bay canopy with depth instead of flat-shaded polyhedra
    const P = [[0, 0.86, 0]], C = [[1.08, 1.08, 1.08]]; const N = 6, da = Math.PI * 2 / N;
    for (let k = 0; k < N; k++) { const a = k * da; P.push([Math.cos(a) * 0.82, 0.5, Math.sin(a) * 0.82]); C.push([0.95, 0.95, 0.95]); }
    for (let k = 0; k < N; k++) { const a = (k + 0.5) * da; P.push([Math.cos(a) * 1.06, -0.42, Math.sin(a) * 1.06]); C.push([0.42, 0.42, 0.42]); }
    const idx = []; for (let k = 0; k < N; k++) { const u0 = 1 + k, u1 = 1 + (k + 1) % N, l0 = 1 + N + k, l1 = 1 + N + (k + 1) % N; idx.push(0, u1, u0, u0, u1, l0, u1, l1, l0); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(C.flat(), 3));
    dg.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(([x, y, z]) => { const yy = y + 0.45, l = Math.hypot(x, yy, z); return [x / l, yy / l, z / l]; }), 3)); dg.setIndex(idx);
    const im = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true }), crowns.length);
    crowns.forEach(([x, y, z, r, v], k) => { const rr = r * 1.3; dummy.position.set(x, y + rr * 0.42, z); dummy.scale.set(rr, rr * (0.75 + v * 0.5), rr * (0.9 + ((v * 7) % 1) * 0.3)); dummy.rotation.set(0, v * 6, 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); const d = (v * 13) % 1; col.setRGB(0.026 + v * 0.03 + d * 0.012, 0.1 + v * 0.05 + d * 0.02, 0.016 + v * 0.012); im.setColorAt(k, col); });
    im.name = 'terrain:crowns'; im.castShadow = false; im.receiveShadow = false; im.matrixAutoUpdate = false; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
  }
  if (houses.length) {
    // hillside house: four walls + a hip roof (14 triangles, vertex-coloured so one instanced mesh has pale walls and
    // weathered brown / grey roofs); unit footprint, walls 0..0.62, ridge at 1
    const pos = [], cl = []; const wall = [1, 1, 1], roof = [0.4, 0.3, 0.26]; const e = 0.56, wy = 0.62;
    const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); cl.push(...k, ...k, ...k); }; const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
    const cs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (let i = 0; i < 4; i++) { const a = cs[i], b = cs[(i + 1) % 4]; quad([b[0], 0, b[1]], [a[0], 0, a[1]], [a[0], wy, a[1]], [b[0], wy, b[1]], wall); }
    const E = cs.map(([x, z]) => [x * 2 * e, wy - 0.04, z * 2 * e]), R0 = [-0.22, 1, 0], R1 = [0.22, 1, 0];
    quad(E[1], E[0], R0, R1, roof); quad(E[3], E[2], R1, R0, roof); tri(E[0], E[3], R0, roof); tri(E[2], E[1], R1, roof);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); hg.computeVertexNormals();
    const im = new THREE.InstancedMesh(hg, new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true }), houses.length);
    houses.forEach(([x, y, z, v], k) => { dummy.position.set(x, y - 0.6, z); dummy.scale.set(9 + v * 6, 7.6 + ((v * 5) % 1) * 2.4, 7 + v * 4); dummy.rotation.set(0, v * 3, 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); const w = 0.5 + v * 0.3; const t = (v * 11) % 1; col.setRGB(w, w * (0.93 + t * 0.05), w * (0.8 + t * 0.14)); im.setColorAt(k, col); });
    im.name = 'terrain:houses'; im.castShadow = false; im.matrixAutoUpdate = false; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
  }
}
