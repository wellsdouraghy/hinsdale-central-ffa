// Terrain backdrop: the real hills around the campus (Bald Hill and the ridges of Ross)
// beyond the satellite rectangle, from gen.terrain (20 m grid over +-1500 m, metres above the Championship Field, USGS
// 3DEP, baked by tools/terrain.py). VISUAL ONLY: inside the satellite rectangle the engine's terrain (descriptor
// `terrain`, the same DEM at 2 m) is the ground, and its outer 40 m are blended into this grid, so the two meet.
// Hill cells are wooded green with dry-grass patches; the low flat blocks carry on as an urban sheet draped on the grid.
import * as THREE from 'three';
import { mulberry32, makeCanvas, canvasTexture } from '../marin/kit.js';
import { setBackdrop, backdropY, backdropEdge, BACKDROP_EDGE_Y } from './backdropY.js';

export function terrainSampler(gen) { setBackdrop(gen.terrain); return backdropY; }

export function buildTerrain(ctx) {
  const { gen, scene, campus } = ctx; const t = gen.terrain; if (!t) return;
  const sat = campus.sat; const n = t.n; const rnd = mulberry32(1971);
  const noise = new Float32Array(n * n); for (let k = 0; k < noise.length; k++) noise[k] = rnd();
  const sm = (i, j) => { let s = 0, c = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; s += noise[jj * n + ii]; c++; } return s / c; };
  setBackdrop(t);
  // the engine's flat far skirt (a green ring at y = -0.25 from 280 m out) would cut through real ground that lies lower
  // (downtown is 6-12 m below the field): park it under the lowest land; the backdrop meshes below replace it
  { const sk = scene.getObjectByName('ground-skirt'); if (sk) { sk.position.y = BACKDROP_EDGE_Y - 1.5; sk.updateMatrix(); } }
  const X = (i) => t.x0 + i * t.step, Z = (j) => t.z0 + j * t.step;
  const inSat = (i, j) => X(i) > sat.minX + 1 && X(i) < sat.maxX - 1 && Z(j) > sat.minZ + 1 && Z(j) < sat.maxZ - 1;
  // grid heights with the outer fade; nodes inside the satellite rectangle sit 0.8 m low so the engine ground (same
  // heights at 2 m) always covers the straddling cells
  const Hh = (i, j) => backdropY(X(i), Z(j)) - (inSat(i, j) ? 0.8 : 0);
  // hill = wooded slope; everything low and gentle is town (urban sheet)
  const hillN = new Uint8Array(n * n);
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) { const h = backdropY(X(i), Z(j)); const sl = Math.hypot(backdropY(X(i + 1), Z(j)) - backdropY(X(i - 1), Z(j)), backdropY(X(i), Z(j + 1)) - backdropY(X(i), Z(j - 1))) / (2 * t.step); hillN[j * n + i] = (h > 22 || (sl > 0.13 && h > 4)) ? 1 : 0; }
  const isHill = (i, j) => hillN[Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i))] === 1;
  const far = { p: [], c: [] }, urb = { p: [], uv: [] };
  const TILE = 330, ca = Math.cos(0.12566), sa = Math.sin(0.12566);
  const colAt = (i, j) => { const g = Math.max(0, Math.min(0.75, (sm(i, j) - 0.58) * 11)); const v = 0.7 + 0.5 * noise[j * n + i]; return [(0.03 + 0.2 * g) * v, (0.075 + 0.15 * g) * v, (0.022 + 0.05 * g) * v]; };   // oak woodland with dry-grass clearings
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const c = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
    if (c.every(([a, b]) => inSat(a, b))) continue;     // the engine's ground mesh has it
    const hill = c.some(([a, b]) => isHill(a, b));
    for (const k of [0, 1, 2, 0, 2, 3]) { const [a, b] = c[k]; const x = X(a), z = Z(b), y = Hh(a, b); if (hill) { far.p.push(x, y, z); far.c.push(...colAt(a, b)); } else { urb.p.push(x, y, z); urb.uv.push((x * ca + z * sa) / TILE, (-x * sa + z * ca) / TILE); } }
  }
  const mk = (d, mat, name) => {
    if (!d.p.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
    if (d.c) g.setAttribute('color', new THREE.Float32BufferAttribute(d.c, 3));
    if (d.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; scene.add(m);
  };
  // woodland canopy texture (tiled in world metres) so the far hills read as oak / bay forest with grass clearings
  const S = 256, cv = makeCanvas(S, S), g = cv.getContext('2d'); g.fillStyle = '#9aa58c'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 900; k++) { const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 7; const d = rnd(); g.fillStyle = d < 0.6 ? `rgba(${40 + rnd() * 30 | 0},${70 + rnd() * 40 | 0},${30 + rnd() * 20 | 0},0.85)` : `rgba(${150 + rnd() * 50 | 0},${170 + rnd() * 50 | 0},${110 + rnd() * 30 | 0},0.55)`; for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); } g.fillStyle = 'rgba(10,20,8,0.35)'; g.beginPath(); g.arc(x + r * 0.35, y + r * 0.4, r * 0.8, 0, 7); g.fill(); }
  const tex = canvasTexture(cv, { aniso: 4 });
  { const p = far.p, uv = []; for (let k = 0; k < p.length; k += 3) uv.push(p[k] / 90, p[k + 2] / 90); far.uv = uv; }
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1, metalness: 0 }); farMat.color.setRGB(2.4, 2.4, 2.4);
  mk(far, farMat, 'terrain:far');
  // ---- flat land beyond the satellite photo: downtown San Rafael and the neighbourhoods carry on to the horizon as an
  // "urban sheet" (street grid, roofs and street trees painted into one tiling texture, laid on the campus street grid)
  // instead of a bare green plain. 8 triangles; the hills rise through it.
  {
    const S = 512, cv2 = makeCanvas(S, S), g2 = cv2.getContext('2d'); const r2 = mulberry32(94901); const nb = 4, bw = S / nb, st = 18;
    g2.fillStyle = '#6d6e70'; g2.fillRect(0, 0, S, S);
    const roofs = ['#cfccc4', '#b9b6ae', '#a8a59b', '#b3a386', '#8d8a84', '#96604c', '#d8d5cf', '#7c7b78', '#a79a8c'];
    for (let by = 0; by < nb; by++) for (let bx = 0; bx < nb; bx++) {
      const x0 = bx * bw + st / 2, y0 = by * bw + st / 2, w = bw - st; const leafy = r2() < 0.9;
      g2.fillStyle = leafy ? '#5d6b4c' : '#85837c'; g2.fillRect(x0, y0, w, w);
      g2.fillStyle = 'rgba(205,203,196,0.55)'; g2.fillRect(x0, y0, w, 2.5); g2.fillRect(x0, y0 + w - 2.5, w, 2.5); g2.fillRect(x0, y0, 2.5, w); g2.fillRect(x0 + w - 2.5, y0, 2.5, w);   // sidewalks
      for (let k = 0, nR = leafy ? 9 : 6; k < nR; k++) { const rw = (leafy ? 12 : 22) + r2() * (leafy ? 14 : 34), rh = (leafy ? 12 : 18) + r2() * (leafy ? 12 : 26); const rx = x0 + 4 + r2() * Math.max(1, w - rw - 8), ry = y0 + 4 + r2() * Math.max(1, w - rh - 8); g2.fillStyle = 'rgba(20,22,20,0.35)'; g2.fillRect(rx + 2, ry + 2, rw, rh); g2.fillStyle = roofs[Math.floor(r2() * roofs.length)]; g2.fillRect(rx, ry, rw, rh); }
      for (let k = 0, nT = leafy ? 30 : 9; k < nT; k++) { const tx = x0 + r2() * w, ty = y0 + r2() * w, tr = 3 + r2() * 4.5; g2.fillStyle = 'rgba(12,22,10,0.4)'; g2.beginPath(); g2.arc(tx + 1.5, ty + 1.5, tr, 0, 7); g2.fill(); g2.fillStyle = `rgb(${38 + r2() * 22 | 0},${74 + r2() * 30 | 0},${30 + r2() * 14 | 0})`; g2.beginPath(); g2.arc(tx, ty, tr, 0, 7); g2.fill(); }
    }
    const utex = canvasTexture(cv2, { aniso: 8 });
    // flat skirt beyond the grid (the grid fades to this level on its outer edge)
    const R = 6000, y = BACKDROP_EDGE_Y, x0 = t.x0 + 1, x1 = t.x0 + (n - 1) * t.step - 1, z0 = t.z0 + 1, z1 = t.z0 + (n - 1) * t.step - 1;
    const q = (ax, az, bx, bz) => { for (const [x, z] of [[ax, az], [ax, bz], [bx, bz], [ax, az], [bx, bz], [bx, az]]) { urb.p.push(x, y, z); urb.uv.push((x * ca + z * sa) / TILE, (-x * sa + z * ca) / TILE); } };
    q(-R, -R, R, z0); q(-R, z1, R, R); q(-R, z0, x0, z1); q(x1, z0, R, z1);
    const um = new THREE.MeshStandardMaterial({ map: utex, roughness: 1, metalness: 0 }); um.color.setRGB(0.7, 0.7, 0.68);
    mk(urb, um, 'terrain:urban');
  }
  // ---- tree crowns on the hills and among the flat-land blocks, plus a few hillside houses and low-rise roofs
  // (instanced, no collision). Crowns are the size of the real trees; the band next to the photo edge is dense so the
  // modelled trees do not stop on a line, farther out they thin and drop to 5 triangles each.
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  const hAt = (x, z) => { const i = Math.round((x - t.x0) / t.step), j = Math.round((z - t.z0) / t.step); if (i < 1 || j < 1 || i > n - 2 || j > n - 2) return null; return { h: backdropY(x, z), hill: isHill(i, j) && backdropEdge(x, z) > 0.15, i, j }; };
  const outside = (x, z) => Math.max(sat.minX - x, x - sat.maxX, sat.minZ - z, z - sat.maxZ);   // metres beyond the photo edge (< 0 inside)
  const nearC = [], farC = [], houses = [], blocks = [];
  for (let k = 0; k < 30000 && nearC.length < 2700; k++) {   // within 260 m of the photo: full domes
    const x = sat.minX - 260 + rnd() * (sat.maxX - sat.minX + 520), z = sat.minZ - 260 + rnd() * (sat.maxZ - sat.minZ + 520); const d = outside(x, z); if (d < -1) continue;
    const s = hAt(x, z); if (!s) continue; const hill = s.hill;
    if (rnd() > (d < 45 ? 1 : hill ? 0.8 : 0.16)) continue;                       // dense first row, wooded hills, sparse street trees
    if (hill && d > 45 && sm(s.i, s.j) > 0.6 && rnd() < 0.8) continue;            // keep the grass clearings open
    nearC.push([x, s.h, z, 3.0 + rnd() * 2.6, rnd()]);
    if (hill && houses.length < 60 && s.h < 130 && rnd() < 0.05) houses.push([x + 9, s.h, z + 4, rnd()]);
  }
  for (let k = 0; k < 30000 && farC.length < 2840; k++) {   // the rest of the hills
    const x = (rnd() - 0.5) * 2400, z = (rnd() - 0.5) * 2400; if (outside(x, z) < 260) continue;
    const s = hAt(x, z); if (!s || !s.hill) continue; if (sm(s.i, s.j) > 0.6 && rnd() < 0.8) continue;
    farC.push([x, s.h, z, 4.2 + rnd() * 3.4, rnd()]);
    if (houses.length < 160 && s.h < 130 && rnd() < 0.04) houses.push([x + 9, s.h, z + 4, rnd()]);
  }
  for (let k = 0; k < 20000 && blocks.length < 70; k++) {  // low-rise roofs on the flat land south / west / east
    const x = sat.minX - 420 + rnd() * (sat.maxX - sat.minX + 840), z = sat.minZ - 420 + rnd() * (sat.maxZ - sat.minZ + 840); const d = outside(x, z); if (d < 8) continue;
    const s = hAt(x, z); if (!s || s.hill) continue; if (rnd() < d / 520) continue;
    blocks.push([x, z, rnd(), rnd(), s.h]);
  }
  {
    // leaf-clump texture so the crowns are not smooth blobs
    const S = 64, lc = makeCanvas(S, S), lg = lc.getContext('2d'); lg.fillStyle = '#c4c4c4'; lg.fillRect(0, 0, S, S);
    for (let k = 0; k < 260; k++) { const x = rnd() * S, y = rnd() * S, r = 1.2 + rnd() * 2.6, v = rnd() < 0.5 ? 255 : 40; lg.fillStyle = `rgba(${v},${v},${v},${0.12 + rnd() * 0.16})`; for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { lg.beginPath(); lg.arc(x + ox, y + oy, r, 0, 7); lg.fill(); } }
    const leaf = canvasTexture(lc, { aniso: 2 });
    const crownMesh = (list, full, name) => {
      if (!list.length) return; const N = 5, da = Math.PI * 2 / N, jr = mulberry32(full ? 7 : 8); const P = [[0.06, full ? 0.9 : 0.62, -0.04]], C = [[1.05, 1.05, 1.05]];
      for (let k = 0; k < N; k++) { const a = k * da + (jr() - 0.5) * 0.4, r = (full ? 0.78 : 1.0) * (0.84 + jr() * 0.32); P.push([Math.cos(a) * r, full ? 0.44 + jr() * 0.16 : -0.1, Math.sin(a) * r]); C.push(full ? [0.9, 0.9, 0.9] : [0.5, 0.5, 0.5]); }
      if (full) for (let k = 0; k < N; k++) { const a = (k + 0.5) * da + (jr() - 0.5) * 0.4, r = 1.02 * (0.86 + jr() * 0.28); P.push([Math.cos(a) * r, -0.42 + jr() * 0.14, Math.sin(a) * r]); C.push([0.4, 0.4, 0.4]); }
      const idx = []; for (let k = 0; k < N; k++) { const u0 = 1 + k, u1 = 1 + (k + 1) % N; idx.push(0, u1, u0); if (full) { const l0 = 1 + N + k, l1 = 1 + N + (k + 1) % N; idx.push(u0, u1, l0, u1, l1, l0); } }
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(C.flat(), 3));
      dg.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(([x, y, z]) => { const yy = y + 0.45, l = Math.hypot(x, yy, z); return [x / l, yy / l, z / l]; }), 3));
      dg.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(([x, y, z]) => [x * 0.9 + y * 0.35, z * 0.9 - y * 0.35]), 2)); dg.setIndex(idx);
      const im = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true, map: leaf }), list.length);
      list.forEach(([x, y, z, r, v], k) => { dummy.position.set(x, y + (full ? r * 0.95 : r * 0.35), z); dummy.scale.set(r, r * (0.95 + v * 0.5), r * (0.85 + ((v * 7) % 1) * 0.3)); dummy.rotation.set(0, v * 6.283, 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); const d = (v * 13) % 1; col.setRGB(0.07 + v * 0.04 + d * 0.02, 0.17 + v * 0.07 + d * 0.04, 0.04 + v * 0.02); im.setColorAt(k, col); });
      im.name = name; im.castShadow = false; im.receiveShadow = false; im.matrixAutoUpdate = false; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
    };
    crownMesh(nearC, true, 'terrain:crowns'); crownMesh(farC, false, 'terrain:crowns-far');
  }
  if (blocks.length) {
    // roof boxes: four walls + a lighter top (10 triangles), on the street grid
    const pos = [], cl = []; const cs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); cl.push(k, k, k, k, k, k, k, k, k); }; const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
    for (let i = 0; i < 4; i++) { const a = cs[i], b = cs[(i + 1) % 4]; quad([b[0], 0, b[1]], [a[0], 0, a[1]], [a[0], 1, a[1]], [b[0], 1, b[1]], 0.72); }
    quad([-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5], 1.0);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); bg.computeVertexNormals();
    const im = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true }), blocks.length);
    const tones = [[0.62, 0.6, 0.56], [0.5, 0.49, 0.47], [0.56, 0.5, 0.4], [0.7, 0.69, 0.66], [0.4, 0.4, 0.4], [0.5, 0.32, 0.25]];
    blocks.forEach(([x, z, v, w, gy], k) => { const big = w < 0.3; dummy.position.set(x, gy - 1.2, z); dummy.scale.set(big ? 26 + v * 26 : 10 + v * 9, big ? 5 + w * 14 : 4.5 + w * 4, big ? 18 + ((v * 7) % 1) * 20 : 8 + ((v * 5) % 1) * 7); dummy.rotation.set(0, -0.12566 + (((v * 3) % 1) < 0.5 ? 0 : Math.PI / 2), 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); const c = tones[Math.floor(((v * 11) % 1) * tones.length)]; col.setRGB(c[0], c[1], c[2]); im.setColorAt(k, col); });
    im.name = 'terrain:blocks'; im.castShadow = false; im.matrixAutoUpdate = false; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
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
    const im = new THREE.InstancedMesh(hg, new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true, side: THREE.DoubleSide }), houses.length);   // both sides: the eave overhang has no soffit and is seen from below
    houses.forEach(([x, y, z, v], k) => { dummy.position.set(x, y - 0.6, z); dummy.scale.set(9 + v * 6, 7.6 + ((v * 5) % 1) * 2.4, 7 + v * 4); dummy.rotation.set(0, v * 3, 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); const w = 0.5 + v * 0.3; const t = (v * 11) % 1; col.setRGB(w, w * (0.93 + t * 0.05), w * (0.8 + t * 0.14)); im.setColorAt(k, col); });
    im.name = 'terrain:houses'; im.castShadow = false; im.matrixAutoUpdate = false; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
  }
}
