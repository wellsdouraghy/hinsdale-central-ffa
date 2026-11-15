// Backdrop beyond the satellite photo (visual only, no collision): the Westside carries on to the horizon as a tiling
// "urban sheet" on the street grid (blocks, roofs, yards, street trees), low-rise roof boxes and tree crowns close to
// the photo edge so the modelled city does not stop on a line, the Century City towers to the north-west and the
// Santa Monica Mountains / Baldwin Hills as hazy ridges. Everything is a handful of draw calls.
import * as THREE from 'three';
import { ANG, mulberry32, makeCanvas, canvasTexture } from './kit.js';

export function buildBackdrop(ctx) {
  const { scene, campus } = ctx; const sat = campus.sat; const rnd = mulberry32(90034); const dummy = new THREE.Object3D(); const col = new THREE.Color();
  const add = (m, name) => { m.name = name; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m; };
  const outside = (x, z) => Math.max(sat.minX - x, x - sat.maxX, sat.minZ - z, z - sat.maxZ);   // metres beyond the photo edge (< 0 inside)
  // ---- urban sheet: one 512 px tile = 4 x 4 residential blocks (330 m), streets, alleys, roofs, yards, trees
  {
    const S = 512, cv = makeCanvas(S, S), g = cv.getContext('2d'); const nb = 4, bw = S / nb, st = 15;
    g.fillStyle = '#5f6062'; g.fillRect(0, 0, S, S);
    const roofs = ['#c9c5bb', '#b4b0a6', '#9d9a92', '#b09f84', '#8a8780', '#96644e', '#d2cec6', '#77767a', '#a3968a', '#b9765c', '#6d7078'];
    for (let by = 0; by < nb; by++) for (let bx = 0; bx < nb; bx++) {
      const x0 = bx * bw + st / 2, y0 = by * bw + st / 2, w = bw - st; const apt = rnd() < 0.3;
      g.fillStyle = apt ? '#7f7d77' : '#66705a'; g.fillRect(x0, y0, w, w);
      g.fillStyle = 'rgba(196,193,184,0.6)'; g.fillRect(x0, y0, w, 2.5); g.fillRect(x0, y0 + w - 2.5, w, 2.5); g.fillRect(x0, y0, 2.5, w); g.fillRect(x0 + w - 2.5, y0, 2.5, w);   // sidewalks
      g.fillStyle = 'rgba(70,70,72,0.7)'; g.fillRect(x0 + 3, y0 + w / 2 - 1.5, w - 6, 3);                                                                                         // alley
      const cols = apt ? 4 : 7; for (let r = 0; r < 2; r++) for (let k = 0; k < cols; k++) {
        const lw = (w - 8) / cols, rw = lw * (apt ? 0.82 : 0.6 + rnd() * 0.15), rh = (w / 2 - 8) * (apt ? 0.82 : 0.45 + rnd() * 0.25); const rx = x0 + 4 + k * lw + (lw - rw) / 2, ry = y0 + (r ? w / 2 + 5 : 5) + (r ? 0 : (w / 2 - 10 - rh)) * (apt ? 0.5 : rnd());
        g.fillStyle = 'rgba(20,22,20,0.35)'; g.fillRect(rx + 2, ry + 2, rw, rh); g.fillStyle = roofs[Math.floor(rnd() * roofs.length)]; g.fillRect(rx, ry, rw, rh);
      }
      for (let k = 0, nT = apt ? 10 : 24; k < nT; k++) { const tx = x0 + rnd() * w, ty = y0 + rnd() * w, tr = 2.6 + rnd() * 4; g.fillStyle = 'rgba(12,22,10,0.4)'; g.beginPath(); g.arc(tx + 1.5, ty + 1.5, tr, 0, 7); g.fill(); g.fillStyle = `rgb(${40 + rnd() * 24 | 0},${72 + rnd() * 30 | 0},${32 + rnd() * 14 | 0})`; g.beginPath(); g.arc(tx, ty, tr, 0, 7); g.fill(); }
    }
    const tex = canvasTexture(cv, { aniso: 8 }); const TILE = 330, ca = Math.cos(ANG), sa = Math.sin(ANG);
    const R = 6000, y = -0.1, x0 = sat.minX + 2, x1 = sat.maxX - 2, z0 = sat.minZ + 2, z1 = sat.maxZ - 2; const p = [], uv = [];
    const q = (ax, az, bx, bz) => { for (const [x, z] of [[ax, az], [ax, bz], [bx, bz], [ax, az], [bx, bz], [bx, az]]) { p.push(x, y, z); uv.push((x * ca + z * sa) / TILE, (-x * sa + z * ca) / TILE); } };
    q(-R, -R, R, z0); q(-R, z1, R, R); q(-R, z0, x0, z1); q(x1, z0, R, z1);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }); mat.color.setRGB(0.66, 0.66, 0.63);
    const m = add(new THREE.Mesh(geo, mat), 'backdrop:urban'); m.receiveShadow = true;
  }
  // ---- tree crowns (dense in the first 50 m past the photo, thinning out to ~700 m) and low-rise roof boxes
  const nearC = [], blocks = [];
  for (let k = 0; k < 60000 && nearC.length < 4200; k++) {
    const x = sat.minX - 700 + rnd() * (sat.maxX - sat.minX + 1400), z = sat.minZ - 700 + rnd() * (sat.maxZ - sat.minZ + 1400); const d = outside(x, z); if (d < -1) continue;
    if (rnd() > (d < 50 ? 1 : d < 260 ? 0.32 : 0.12)) continue; nearC.push([x, 0, z, 2.9 + rnd() * 2.4, rnd()]);
  }
  for (let k = 0; k < 30000 && blocks.length < 900; k++) {
    const x = sat.minX - 560 + rnd() * (sat.maxX - sat.minX + 1120), z = sat.minZ - 560 + rnd() * (sat.maxZ - sat.minZ + 1120); const d = outside(x, z); if (d < 8) continue; if (rnd() < d / 640) continue;
    blocks.push([x, z, rnd(), rnd()]);
  }
  {
    const S = 64, lc = makeCanvas(S, S), lg = lc.getContext('2d'); lg.fillStyle = '#c4c4c4'; lg.fillRect(0, 0, S, S);
    for (let k = 0; k < 260; k++) { const x = rnd() * S, y = rnd() * S, r = 1.2 + rnd() * 2.6, v = rnd() < 0.5 ? 255 : 40; lg.fillStyle = `rgba(${v},${v},${v},${0.12 + rnd() * 0.16})`; for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { lg.beginPath(); lg.arc(x + ox, y + oy, r, 0, 7); lg.fill(); } }
    const leaf = canvasTexture(lc, { aniso: 2 }); const N = 5, da = Math.PI * 2 / N, jr = mulberry32(7); const P = [[0.06, 0.9, -0.04]], C = [[1.05, 1.05, 1.05]];
    for (let k = 0; k < N; k++) { const a = k * da + (jr() - 0.5) * 0.4, r = 0.78 * (0.84 + jr() * 0.32); P.push([Math.cos(a) * r, 0.44 + jr() * 0.16, Math.sin(a) * r]); C.push([0.9, 0.9, 0.9]); }
    for (let k = 0; k < N; k++) { const a = (k + 0.5) * da + (jr() - 0.5) * 0.4, r = 1.02 * (0.86 + jr() * 0.28); P.push([Math.cos(a) * r, -0.42 + jr() * 0.14, Math.sin(a) * r]); C.push([0.4, 0.4, 0.4]); }
    const idx = []; for (let k = 0; k < N; k++) { const u0 = 1 + k, u1 = 1 + (k + 1) % N, l0 = 1 + N + k, l1 = 1 + N + (k + 1) % N; idx.push(0, u1, u0, u0, u1, l0, u1, l1, l0); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(C.flat(), 3));
    dg.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(([x, y, z]) => { const yy = y + 0.45, l = Math.hypot(x, yy, z); return [x / l, yy / l, z / l]; }), 3));
    dg.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(([x, y, z]) => [x * 0.9 + y * 0.35, z * 0.9 - y * 0.35]), 2)); dg.setIndex(idx);
    const im = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true, map: leaf }), nearC.length);
    nearC.forEach(([x, y, z, r, v], k) => { dummy.position.set(x, y + r * 1.25, z); dummy.scale.set(r, r * (0.95 + v * 0.5), r * (0.85 + ((v * 7) % 1) * 0.3)); dummy.rotation.set(0, v * 6.283, 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); const d = (v * 13) % 1; col.setRGB(0.07 + v * 0.04 + d * 0.02, 0.16 + v * 0.07 + d * 0.04, 0.045 + v * 0.02); im.setColorAt(k, col); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); add(im, 'backdrop:crowns');
  }
  const boxGeo = () => {
    const pos = [], cl = []; const cs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); cl.push(k, k, k, k, k, k, k, k, k); }; const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
    for (let i = 0; i < 4; i++) { const a = cs[i], b = cs[(i + 1) % 4]; quad([b[0], 0, b[1]], [a[0], 0, a[1]], [a[0], 1, a[1]], [b[0], 1, b[1]], 0.72); }
    quad([-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5], 1.0);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); bg.computeVertexNormals(); return bg;
  };
  {
    const im = new THREE.InstancedMesh(boxGeo(), new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true }), blocks.length);
    const tones = [[0.6, 0.58, 0.54], [0.5, 0.49, 0.47], [0.56, 0.5, 0.4], [0.66, 0.65, 0.62], [0.4, 0.4, 0.41], [0.5, 0.33, 0.26], [0.58, 0.52, 0.44]];
    blocks.forEach(([x, z, v, w], k) => { const big = w < 0.3; dummy.position.set(x, -0.1, z); dummy.scale.set(big ? 24 + v * 26 : 10 + v * 9, big ? 6 + w * 16 : 4.2 + w * 3.4, big ? 14 + ((v * 7) % 1) * 16 : 8 + ((v * 5) % 1) * 7); dummy.rotation.set(0, -ANG + (((v * 3) % 1) < 0.5 ? 0 : Math.PI / 2), 0); dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix); const c = tones[Math.floor(((v * 11) % 1) * tones.length)]; col.setRGB(c[0], c[1], c[2]); im.setColorAt(k, col); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); add(im, 'backdrop:blocks');
  }
  // ---- Century City (2.3 km west, 2.7 km north of the school): the tower cluster that stands over the north-west
  // skyline in every photo taken from the field. Unlit and outside the scene fog (the exponential fog is opaque at
  // 3.5 km: the towers used to dissolve into it), with its own light aerial haze mixed into the colours; dark glass and
  // pale stone towers of different heights and shapes (the twin triangular Century Plaza Towers, slabs, stepped tops),
  // drawn nearly twice life size and a little nearer (3 km): at true size the tallest tower stands 2.8 degrees over the
  // horizon and never clears the trees round the field, while every photo of the school has the cluster over the stands.
  {
    const pos = [], cl = []; const hz = [0.6, 0.66, 0.74], mixH = 0.14; const K = 1.9, KW = 1.45, CX = -2000, CZ = -2280; const r3 = mulberry32(2029);
    const quadc = (a, b, c, d, col) => { for (const p of [a, b, c, a, c, d]) pos.push(...p); for (let k = 0; k < 6; k++) cl.push(col[0] * (1 - mixH) + hz[0] * mixH, col[1] * (1 - mixH) + hz[1] * mixH, col[2] * (1 - mixH) + hz[2] * mixH); };
    // prism with n sides: lit side faces the campus (south-east), window bands as alternating strips
    const prism = (cx, cz, w, d, y0, y1, rot, base, n = 4) => {
      const pts = []; for (let k = 0; k < n; k++) { const a = rot + (k + 0.5) / n * Math.PI * 2; const sx = n === 4 ? Math.SQRT2 : 1.15; pts.push([cx + Math.cos(a) * w / 2 * sx, cz + Math.sin(a) * d / 2 * sx]); }
      for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; const nx = (b[1] - a[1]), nz = -(b[0] - a[0]); const l = Math.hypot(nx, nz) || 1; const lit = 0.72 + 0.4 * Math.max(0, (nx * 0.55 + nz * 0.83) / l) + 0.12 * Math.max(0, (nx * -0.8 + nz * 0.3) / l);
        const bands = Math.max(2, Math.round((y1 - y0) / 22)); for (let j = 0; j < bands; j++) { const ya = y0 + (y1 - y0) * j / bands, yb = y0 + (y1 - y0) * (j + 1) / bands, sh = lit * (j % 2 ? 0.9 : 1.04); const gh = Math.max(0, 1 - (ya + yb) / 2 / 70) * 0.4;   // the feet of the towers stand in the ground haze
          quadc([a[0], ya, a[1]], [b[0], ya, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]], [base[0] * sh * (1 - gh) + hz[0] * gh, base[1] * sh * (1 - gh) + hz[1] * gh, base[2] * sh * (1 - gh) + hz[2] * gh]); } }
      for (let k = 1; k < n - 1; k++) { const c = [base[0] * 1.1, base[1] * 1.1, base[2] * 1.1]; for (const p of [pts[0], pts[k], pts[k + 1]]) pos.push(p[0], y1, p[1]); for (let q = 0; q < 3; q++) cl.push(c[0] * (1 - mixH) + hz[0] * mixH, c[1] * (1 - mixH) + hz[1] * mixH, c[2] * (1 - mixH) + hz[2] * mixH); }
    };
    const GLASS = [0.12, 0.16, 0.22], BRONZE = [0.2, 0.17, 0.14], STONE = [0.5, 0.48, 0.44], STEEL = [0.26, 0.3, 0.35], BLACK = [0.07, 0.08, 0.1], PALE = [0.58, 0.6, 0.62];
    // [dx, dz, w, d, height, tint, sides, stepped]
    const T = [[0, 0, 46, 46, 174, STEEL, 3, 0], [72, -26, 46, 46, 174, STEEL, 3, 0], [-92, 58, 44, 34, 150, BRONZE, 4, 1], [150, 44, 42, 42, 150, GLASS, 4, 1], [-176, -38, 38, 38, 163, GLASS, 4, 0], [36, 132, 56, 30, 120, STONE, 4, 0],
      [236, -66, 36, 36, 146, BLACK, 4, 1], [-256, 84, 42, 40, 100, PALE, 4, 0], [118, -150, 30, 30, 146, GLASS, 4, 0], [-58, -164, 38, 36, 112, STONE, 4, 1], [312, 62, 44, 30, 88, BRONZE, 4, 0], [-332, -56, 36, 36, 96, STEEL, 4, 0],
      [202, 172, 48, 28, 80, PALE, 4, 0], [-142, 192, 42, 30, 74, STONE, 4, 0], [22, -262, 30, 30, 92, GLASS, 4, 1], [392, -118, 30, 30, 118, BLACK, 4, 0], [-30, 70, 34, 34, 132, GLASS, 4, 0], [270, 150, 30, 46, 64, STONE, 4, 0], [-210, 150, 60, 26, 58, PALE, 4, 0], [96, 80, 28, 28, 104, BRONZE, 4, 0]];
    T.forEach(([dx0, dz0, w0, d0, h, tint, n, step], k) => { const dx = dx0 * KW, dz = dz0 * KW, w = w0 * KW, d = d0 * KW; const cx = CX + dx, cz = CZ + dz, rot = 0.32 + (k % 3) * 0.21, v = 0.9 + r3() * 0.25, base = [tint[0] * v, tint[1] * v, tint[2] * v]; const H = h * K;
      if (step) { prism(cx, cz, w, d, 0, H * 0.84, rot, base, n); prism(cx, cz, w * 0.7, d * 0.7, H * 0.84, H * 0.95, rot, base, n); prism(cx, cz, w * 0.3, d * 0.3, H * 0.95, H, rot, [base[0] * 0.8, base[1] * 0.8, base[2] * 0.8], n); }
      else { prism(cx, cz, w, d, 0, H, rot, base, n); if (k % 4 === 0) prism(cx + w * 0.15, cz, w * 0.25, d * 0.25, H, H + 9, rot, [base[0] * 0.7, base[1] * 0.7, base[2] * 0.7], 4); } });
    // the low-rise blocks at their feet (Westfield, hotels, Fox lot stages)
    for (let k = 0; k < 26; k++) prism(CX + (r3() - 0.5) * 1300, CZ + (r3() - 0.5) * 800, 50 + r3() * 70, 40 + r3() * 50, 0, (18 + r3() * 34) * K, 0.32 + r3(), [[0.44, 0.43, 0.4], [0.3, 0.32, 0.34], [0.5, 0.5, 0.5]][k % 3], 4);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); geo.computeBoundingSphere();
    // drawn after the sky's horizon-haze band (which is a transparent shell in front of it), so the towers stay dark
    const sk = add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, transparent: true })), 'backdrop:skyline'); sk.renderOrder = 6;
  }
  // ---- ridges on the horizon: the Santa Monica Mountains across the north, the Baldwin Hills to the south-east
  {
    const pos = [], cl = []; const ridge = (a0, a1, dist, hMax, seed, tone) => {
      const r2 = mulberry32(seed); const n = 46; const hs = []; for (let i = 0; i <= n; i++) { const t = i / n; hs.push(hMax * Math.sin(t * Math.PI) ** 0.6 * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 9 + seed)) * (0.7 + r2() * 0.3))); }
      for (let i = 0; i < n; i++) { const b0 = a0 + (a1 - a0) * i / n, b1 = a0 + (a1 - a0) * (i + 1) / n; const A = [Math.sin(b0) * dist, -1, -Math.cos(b0) * dist], Bq = [Math.sin(b1) * dist, -1, -Math.cos(b1) * dist];
        const C = [Math.sin(b1) * (dist + 500), hs[i + 1], -Math.cos(b1) * (dist + 500)], D = [Math.sin(b0) * (dist + 500), hs[i], -Math.cos(b0) * (dist + 500)];
        pos.push(...A, ...Bq, ...C, ...A, ...C, ...D); const lo = [tone[0] * 0.8, tone[1] * 0.85, tone[2] * 0.8]; cl.push(...lo, ...lo, ...tone, ...lo, ...tone, ...tone); }
    };
    ridge(-1.35, 0.95, 4600, 330, 3, [0.3, 0.33, 0.3]);        // bearing from north (0) clockwise: north-west round to north-east
    ridge(2.0, 2.75, 3300, 120, 8, [0.33, 0.34, 0.27]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); geo.computeVertexNormals();
    add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })), 'backdrop:ridges');
  }
}
