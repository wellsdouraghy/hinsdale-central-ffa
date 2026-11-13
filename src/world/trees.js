// Procedural mature trees (billboard-cloud crowns built from scanned leaf atlases), instanced per spatial
// chunk with baked impostors for distant chunks. Trunks are added to collision; canopies are not.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, mulberry32 } from './util.js';
import { sunDirection } from './sky.js';

const LOD_DIST = { low: 60, medium: 110, high: 165 };
const CHUNK = 90;

// ---------------------------------------------------------------------------------- textures
function leafClusterTexture(atlas, seed, aniso) {
  // compose a dense spray of leaves from the 3x3 atlas into one alpha card
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'); const rnd = mulberry32(seed);
  const img = atlas.image, cw = img.width / 3, ch = img.height / 3;
  const tmp = makeCanvas(128, 128), tg = tmp.getContext('2d');
  // twigs
  g.strokeStyle = '#3a2c1c'; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) { g.lineWidth = 2 + rnd() * 3; const a = rnd() * Math.PI * 2, r = 60 + rnd() * 150; g.beginPath(); g.moveTo(S / 2, S / 2); g.quadraticCurveTo(S / 2 + Math.cos(a + 0.4) * r * 0.5, S / 2 + Math.sin(a + 0.4) * r * 0.5, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.stroke(); }
  const n = 120;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6) * S * 0.44;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.92;
    const sz = 34 + rnd() * 26;
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, 128, 128);
    tg.drawImage(img, Math.floor(rnd() * 3) * cw + cw * 0.06, Math.floor(rnd() * 3) * ch + ch * 0.04, cw * 0.88, ch * 0.92, 0, 0, 128, 128);
    // deepen to summer foliage with per-leaf variation (inner/earlier leaves darker)
    tg.globalCompositeOperation = 'source-atop';
    const depth = 1 - i / n; const dk = 0.22 + depth * 0.3 + rnd() * 0.12;
    tg.fillStyle = `rgba(${12 + rnd() * 16 | 0},${44 + rnd() * 22 | 0},${8 + rnd() * 10 | 0},${dk})`; tg.fillRect(0, 0, 128, 128);
    g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI * 2); g.drawImage(tmp, -sz / 2, -sz / 2, sz, sz); g.restore();
  }
  const t = canvasTexture(c, { repeat: false, aniso: Math.min(4, aniso) });
  return t;
}

function coniferCardTexture(atlas, seed, aniso) {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'); const rnd = mulberry32(seed);
  const img = atlas.image; const rows = [[0.37, 0.02, 0.6, 0.2], [0.3, 0.26, 0.68, 0.24], [0.28, 0.56, 0.72, 0.3]];
  const tmp = makeCanvas(256, 96), tg = tmp.getContext('2d');
  g.strokeStyle = '#2e2218'; g.lineWidth = 6; g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2, S * 0.1); g.stroke();
  for (let i = 0; i < 30; i++) {
    const r = rows[Math.floor(rnd() * 3)];
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, 256, 96);
    tg.drawImage(img, r[0] * img.width, r[1] * img.height, r[2] * img.width, r[3] * img.height, 0, 0, 256, 96);
    tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = `rgba(${8 + rnd() * 10 | 0},${30 + rnd() * 18 | 0},${22 + rnd() * 14 | 0},${0.3 + rnd() * 0.22})`; tg.fillRect(0, 0, 256, 96);
    const t = i / 30; const y = S * (0.98 - t * 0.88); const side = i % 2 ? 1 : -1; const len = S * (0.22 + (1 - t) * 0.3) * (0.8 + rnd() * 0.4);
    g.save(); g.translate(S / 2, y); g.rotate(side > 0 ? -0.5 - rnd() * 0.5 : Math.PI + 0.5 + rnd() * 0.5); g.drawImage(tmp, 0, -len * 0.13, len, len * 0.26); g.restore();
  }
  return canvasTexture(c, { repeat: false, aniso: Math.min(4, aniso) });
}

// ---------------------------------------------------------------------------------- geometry
class GeoAcc {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  v(x, y, z, nx, ny, nz, u, v, cr = 1, cg = 1, cb = 1) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(cr, cg, cb); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
}
function limb(acc, pts, r0, r1, sides = 6) {
  // tube through pts with radius tapering r0 -> r1
  const rings = []; const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const d = new THREE.Vector3().subVectors(b, a).normalize();
    const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize(); const t2 = new THREE.Vector3().crossVectors(d, t1);
    const r = r0 + (r1 - r0) * (i / (pts.length - 1)); const ring = [];
    for (let k = 0; k <= sides; k++) { const a2 = (k / sides) * Math.PI * 2; const nx = t1.x * Math.cos(a2) + t2.x * Math.sin(a2), ny = t1.y * Math.cos(a2) + t2.y * Math.sin(a2), nz = t1.z * Math.cos(a2) + t2.z * Math.sin(a2); ring.push([pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r, nx, ny, nz, k / sides * Math.max(1, Math.round(r0 * 5))]); }
    rings.push(ring);
  }
  let vv = 0;
  for (let i = 0; i < rings.length - 1; i++) {
    const len = pts[i].distanceTo(pts[i + 1]) * 0.45; const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < sides; k++) {
      const a = A[k], b = A[k + 1], c = B[k + 1], d = B[k];
      acc.v(a[0], a[1], a[2], a[3], a[4], a[5], a[6], vv); acc.v(b[0], b[1], b[2], b[3], b[4], b[5], b[6], vv); acc.v(c[0], c[1], c[2], c[3], c[4], c[5], c[6], vv + len);
      acc.v(a[0], a[1], a[2], a[3], a[4], a[5], a[6], vv); acc.v(c[0], c[1], c[2], c[3], c[4], c[5], c[6], vv + len); acc.v(d[0], d[1], d[2], d[3], d[4], d[5], d[6], vv + len);
    }
    vv += len;
  }
}
function card(acc, cx, cy, cz, ax, ay, az, bx, by, bz, nx, ny, nz, shade) {
  // quad centred at c spanned by half-axes a and b
  const P = (sa, sb) => [cx + ax * sa + bx * sb, cy + ay * sa + by * sb, cz + az * sa + bz * sb];
  const p0 = P(-1, -1), p1 = P(1, -1), p2 = P(1, 1), p3 = P(-1, 1);
  const push = (p, u, v) => acc.v(p[0], p[1], p[2], nx, ny, nz, u, v, shade, shade, shade);
  push(p0, 0, 0); push(p1, 1, 0); push(p2, 1, 1); push(p0, 0, 0); push(p2, 1, 1); push(p3, 0, 1);
}

function makeDeciduous(seed, o) {
  const rnd = mulberry32(seed); const H = o.H, R = o.R;
  const wood = new GeoAcc(), leaves = new GeoAcc();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const h1 = H * (0.24 + rnd() * 0.08); const lean = (rnd() - 0.5) * 0.5, lean2 = (rnd() - 0.5) * 0.5;
  const tr = o.trunk || 0.42;
  limb(wood, [V(0, -0.3, 0), V(lean * 0.2, h1 * 0.5, lean2 * 0.2), V(lean * 0.5, h1, lean2 * 0.5), V(lean * 0.7, H * 0.5, lean2 * 0.7), V(lean, H * 0.62, lean2)], tr, tr * 0.12, 8);
  // root flare
  limb(wood, [V(0, -0.2, 0), V(0, 0.5, 0)], tr * 1.45, tr * 1.0, 8);
  const cc = V(lean * 0.6, H * 0.63, lean2 * 0.6); const ry = H * 0.37;
  const nl = 5 + Math.floor(rnd() * 3); const tips = [];
  for (let i = 0; i < nl; i++) {
    const az = (i / nl) * Math.PI * 2 + rnd() * 0.7, el = 0.45 + rnd() * 0.55; const len = R * (0.75 + rnd() * 0.35);
    const start = V(lean * 0.5, h1 * (0.85 + rnd() * 0.5), lean2 * 0.5);
    const dir = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const mid = start.clone().addScaledVector(dir, len * 0.5).add(V(0, len * 0.08, 0)); const end = start.clone().addScaledVector(dir, len).add(V(0, len * 0.3, 0));
    limb(wood, [start, mid, end], tr * 0.42, tr * 0.1, 5);
    for (let k = 0; k < 2; k++) {
      const a2 = az + (k ? 0.8 : -0.8) + (rnd() - 0.5) * 0.4; const l2 = len * (0.45 + rnd() * 0.25);
      const s2 = mid.clone().lerp(end, 0.2 + rnd() * 0.5); const e2 = s2.clone().add(V(Math.cos(a2) * l2, l2 * (0.3 + rnd() * 0.5), Math.sin(a2) * l2));
      limb(wood, [s2, s2.clone().lerp(e2, 0.5).add(V(0, l2 * 0.06, 0)), e2], tr * 0.2, tr * 0.05, 4);
      tips.push(e2);
    }
    tips.push(end);
  }
  // crown: cards biased to the surface of an ellipsoid, facing roughly outward/up
  const n = o.cards || 230;
  for (let i = 0; i < n; i++) {
    let px, py, pz, rr;
    if (i < tips.length * 2) { const t = tips[i % tips.length]; px = t.x + (rnd() - 0.5) * 1.6; py = t.y + (rnd() - 0.5) * 1.4; pz = t.z + (rnd() - 0.5) * 1.6; rr = 0.8; }
    else {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2; rr = Math.pow(rnd(), 0.42); const s = Math.sqrt(1 - u * u);
      // lumpy crown: modulate radius by a few lobes
      const lob = 1 + 0.16 * Math.sin(th * 3 + seed) * s + 0.1 * Math.sin(u * 5 + seed * 1.7);
      px = cc.x + s * Math.cos(th) * R * rr * lob; py = cc.y + u * ry * rr * (u < 0 ? 0.8 : 1) * lob; pz = cc.z + s * Math.sin(th) * R * rr * lob;
    }
    const out = V(px - cc.x, (py - cc.y) * (R / ry), pz - cc.z); const ol = out.length() || 1; out.divideScalar(ol);
    const size = (1.25 + rnd() * 0.9) * (o.cardSize || 1);
    // random orientation, half of them tilted toward horizontal layers like real foliage planes
    const nrm = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); if (i % 2) nrm.lerp(V(0, 1, 0), 0.6).normalize(); else nrm.lerp(out, 0.5).normalize();
    const a = new THREE.Vector3().crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize(); const b = new THREE.Vector3().crossVectors(nrm, a);
    const ang = rnd() * Math.PI; const ca = Math.cos(ang), sa = Math.sin(ang);
    const ax = (a.x * ca + b.x * sa) * size, ay = (a.y * ca + b.y * sa) * size, az = (a.z * ca + b.z * sa) * size;
    const bx = (-a.x * sa + b.x * ca) * size, by = (-a.y * sa + b.y * ca) * size, bz = (-a.z * sa + b.z * ca) * size;
    // soft "spherical" shading normal + baked inner/under-side darkening
    const sn = out.clone().lerp(V(0, 1, 0), 0.35).normalize();
    const shade = (0.5 + 0.5 * Math.min(1, ol * rr / R + 0.15)) * (0.78 + 0.22 * Math.max(0, out.y + 0.6));
    card(leaves, px, py, pz, ax, ay, az, bx, by, bz, sn.x, sn.y, sn.z, Math.min(1, shade));
  }
  return { wood: wood.build(), leaves: leaves.build(), height: H + 1.5, radius: R + 1.6, trunkR: tr };
}

function makeConifer(seed, o) {
  const rnd = mulberry32(seed); const H = o.H, R = o.R;
  const wood = new GeoAcc(), leaves = new GeoAcc(); const V = (x, y, z) => new THREE.Vector3(x, y, z);
  limb(wood, [V(0, -0.3, 0), V(0, H * 0.5, 0), V(0, H * 0.97, 0)], 0.3, 0.03, 7);
  const layers = 15;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1); const y = 1.0 + t * (H - 1.6); const rad = R * Math.pow(1 - t, 0.8) + 0.5; const n = 7 + (l % 2);
    for (let k = 0; k < n; k++) {
      const az = (k / n) * Math.PI * 2 + l * 0.9 + rnd() * 0.3; const len = rad * (0.85 + rnd() * 0.3); const droop = 0.22 + rnd() * 0.2 - t * 0.25;
      const dx = Math.cos(az), dz = Math.sin(az);
      // card from the trunk outward; v runs along the branch (texture stem at v=0)
      const half = len / 2; const cx = dx * half, cz = dz * half, cy = y - droop * half;
      const ax = -dz * len * 0.42, az2 = dx * len * 0.42;                         // width axis
      const bx = dx * half, by = -droop * half, bz = dz * half;                    // length axis
      const sn = V(dx * 0.7, 0.75, dz * 0.7).normalize(); const shade = 0.62 + 0.38 * (0.3 + 0.7 * t);
      card(leaves, cx, cy, cz, ax, 0.12 * len * (rnd() - 0.5), az2, bx, by, bz, sn.x, sn.y, sn.z, shade);
    }
  }
  // tip
  card(leaves, 0, H - 0.9, 0, 0.9, 0, 0, 0, 1.3, 0, 0.5, 0.8, 0, 1); card(leaves, 0, H - 0.9, 0, 0, 0, 0.9, 0, 1.3, 0, 0, 0.8, 0.5, 1);
  return { wood: wood.build(), leaves: leaves.build(), height: H + 0.6, radius: R + 0.8, trunkR: 0.3 };
}

// ---------------------------------------------------------------------------------- main
export function createTrees(ctx) {
  const { T, gen, quality, scene, B } = ctx; const pb = ctx.playBounds;
  const aniso = T.aniso;
  const leafTexA = leafClusterTexture(T.leafBroad, 3, aniso), leafTexB = leafClusterTexture(T.leafBroad, 9, aniso), conTex = coniferCardTexture(T.leafConifer, 5, aniso);
  const mkLeaf = (map, tint) => {
    const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, metalness: 0, vertexColors: true, envMapIntensity: 0.55, color: tint });
    // cheap translucency: leaves glow a little when the sun is behind them; gentle wind sway
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSunDirV = uSunDirV; sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.21;
#else
  float ph = 0.0;
#endif
  float sway = max(position.y - 2.5, 0.0) * 0.012;
  transformed.x += sin(uTime * 1.1 + ph + position.y * 0.35) * sway + sin(uTime * 2.7 + position.x * 1.3 + ph) * 0.02;
  transformed.z += cos(uTime * 0.9 + ph * 1.3 + position.y * 0.3) * sway;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunDirV;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float back = pow(max(dot(normalize(vViewPosition), -uSunDirV), 0.0), 3.0);
    reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.95, 0.55) * back * 0.55; }`);
    };
    return m;
  };
  const uSunDirV = { value: new THREE.Vector3() }, uTime = { value: 0 };
  const barkMat = new THREE.MeshStandardMaterial({ map: T.barkColor, normalMap: quality === 'low' ? null : T.barkNormal, roughness: 0.95, color: 0x6e5d50, vertexColors: true });
  const leafMats = [mkLeaf(leafTexA, 0xffffff), mkLeaf(leafTexB, 0xf2ffd8), mkLeaf(conTex, 0xffffff)];
  const cards = quality === 'low' ? 110 : quality === 'medium' ? 190 : 400;
  const cs = quality === 'low' ? 1.35 : quality === 'medium' ? 1.1 : 0.86;
  const variants = [
    { ...makeDeciduous(11, { H: 15.5, R: 6.2, cards, cardSize: cs }), leafMat: leafMats[0] },
    { ...makeDeciduous(23, { H: 13.0, R: 5.4, cards, cardSize: cs }), leafMat: leafMats[1] },
    { ...makeDeciduous(37, { H: 18.0, R: 7.0, cards: Math.round(cards * 1.15), cardSize: cs * 1.1, trunk: 0.52 }), leafMat: leafMats[0] },
    { ...makeConifer(51, { H: 14.5, R: 3.4 }), leafMat: leafMats[2] },
    { ...makeDeciduous(71, { H: 7.5, R: 3.0, cards: Math.round(cards * 0.5), cardSize: cs * 0.75, trunk: 0.2 }), leafMat: leafMats[1] },   // young/ornamental
  ];

  // ---- impostor atlas (one column per variant), lit like the scene
  const NV = variants.length; const IW = 256, IH = 384;
  const atlas = new THREE.WebGLRenderTarget(IW * NV, IH, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  atlas.texture.colorSpace = THREE.SRGBColorSpace;
  function bakeImpostors(renderer) {
    const s2 = new THREE.Scene(); s2.environment = scene.parent && scene.parent.parent ? scene.parent.parent.environment : null;
    let top = scene; while (top.parent) top = top.parent;
    s2.environment = top.environment; s2.environmentRotation.copy(top.environmentRotation); s2.environmentIntensity = top.environmentIntensity;
    const sun = new THREE.DirectionalLight(ctx.sky.sun.color, ctx.sky.sun.intensity); sun.position.copy(sunDirection); s2.add(sun);
    const prevRT = renderer.getRenderTarget(); const prevCC = renderer.getClearColor(new THREE.Color()), prevCA = renderer.getClearAlpha(); const prevTM = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(atlas); renderer.setClearColor(0x2a3d1c, 0); renderer.clear();
    atlas.scissorTest = true;
    variants.forEach((v, i) => {
      const g = new THREE.Group(); g.add(new THREE.Mesh(v.wood, barkMat), new THREE.Mesh(v.leaves, v.leafMat)); s2.add(g);
      const hw = v.radius, hh = v.height / 2;
      const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 200);
      // view from the south-west so the baked lighting shows a mix of lit and shaded crown
      cam.position.set(-40, v.height / 2, 60).setY(v.height / 2); cam.lookAt(0, v.height / 2, 0); cam.updateMatrixWorld();
      atlas.viewport.set(i * IW, 0, IW, IH); atlas.scissor.set(i * IW, 0, IW, IH);
      renderer.setRenderTarget(atlas);
      renderer.render(s2, cam);
      s2.remove(g);
    });
    atlas.scissorTest = false; atlas.viewport.set(0, 0, IW * NV, IH); atlas.scissor.set(0, 0, IW * NV, IH);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCC, prevCA); renderer.toneMapping = prevTM;
  }
  const impMat = new THREE.MeshBasicMaterial({ map: atlas.texture, alphaTest: 0.35, side: THREE.DoubleSide, fog: true });
  const impGeos = variants.map((v, i) => {
    const acc = new GeoAcc(); const hw = v.radius, h = v.height; const u0 = i / NV, u1 = (i + 1) / NV;
    for (const [dx, dz] of [[1, 0], [0, 1], [0.707, 0.707], [0.707, -0.707]].slice(0, 2)) {
      const q = [[-hw * dx, 0, -hw * dz, u0, 0], [hw * dx, 0, hw * dz, u1, 0], [hw * dx, h, hw * dz, u1, 1], [-hw * dx, h, -hw * dz, u0, 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) acc.v(q[k][0], q[k][1], q[k][2], 0, 1, 0, q[k][3], q[k][4]);
    }
    const g = acc.build(); g.deleteAttribute('color'); return g;
  });

  // ---- distribute instances into chunks
  const chunks = new Map(); const rnd = mulberry32(99);
  const group = new THREE.Group(); group.name = 'trees'; scene.add(group);
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  for (const t of gen.trees) {
    const [x, z, kind, s] = t;
    let vi;
    if (kind === 1) vi = 3; else { const r = rnd(); vi = s < 0.82 && r < 0.5 ? 4 : r < 0.42 ? 0 : r < 0.78 ? 1 : 2; }
    const key = Math.floor(x / CHUNK) + ':' + Math.floor(z / CHUNK);
    let ch = chunks.get(key); if (!ch) { ch = { lists: variants.map(() => []), cx: 0, cz: 0, n: 0 }; chunks.set(key, ch); }
    const sc = (vi === 4 ? 1.0 : s) * (0.9 + rnd() * 0.25);
    ch.lists[vi].push({ x, z, s: sc, r: rnd() * Math.PI * 2, tint: rnd() });
    ch.cx += x; ch.cz += z; ch.n++;
    // trunk collision near the play area
    if (x > pb.minX - 25 && x < pb.maxX + 25 && z > pb.minZ - 25 && z < pb.maxZ + 25) {
      const tr = variants[vi].trunkR * sc * 1.05;
      B.c('wood').cyl(x, 0, z, tr, tr * 0.8, vi === 3 ? 9 : 4.5, 7, 1, true);
    }
  }
  const chunkList = [];
  for (const ch of chunks.values()) {
    ch.cx /= ch.n; ch.cz /= ch.n; ch.full = []; ch.imp = [];
    let rad = 0;
    ch.lists.forEach((list, vi) => {
      if (!list.length) return; const v = variants[vi];
      const wood = new THREE.InstancedMesh(v.wood, barkMat, list.length), leaves = new THREE.InstancedMesh(v.leaves, v.leafMat, list.length), imp = new THREE.InstancedMesh(impGeos[vi], impMat, list.length);
      list.forEach((it, i) => {
        dummy.position.set(it.x, 0, it.z); dummy.rotation.set(0, it.r, 0); dummy.scale.set(it.s, it.s * (0.94 + it.tint * 0.12), it.s); dummy.updateMatrix();
        wood.setMatrixAt(i, dummy.matrix); leaves.setMatrixAt(i, dummy.matrix);
        dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); imp.setMatrixAt(i, dummy.matrix);
        col.setHSL(0.27 + (it.tint - 0.5) * 0.05, 0.2, 0.86 + it.tint * 0.14); leaves.setColorAt(i, col); imp.setColorAt(i, col);
        col.setRGB(1, 1, 1); wood.setColorAt(i, col);
        rad = Math.max(rad, Math.hypot(it.x - ch.cx, it.z - ch.cz) + v.radius * it.s);
      });
      for (const m of [wood, leaves, imp]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); m.computeBoundingBox(); m.matrixAutoUpdate = false; m.frustumCulled = true; }
      wood.castShadow = leaves.castShadow = true; wood.receiveShadow = true; leaves.receiveShadow = quality !== 'low';
      imp.castShadow = false; imp.receiveShadow = false; imp.visible = false;
      group.add(wood, leaves, imp); ch.full.push(wood, leaves); ch.imp.push(imp);
    });
    ch.rad = rad; chunkList.push(ch);
  }

  // ---- shrubs / hedges (ctx.shrubs: [x, y, z, length, height, rotY])
  if (ctx.shrubs.length) {
    const acc = new GeoAcc(); const r2 = mulberry32(5);
    for (const [x, y, z, len, h, rot] of ctx.shrubs) {
      const c = Math.cos(rot), s = Math.sin(rot); const n = Math.round(len * 26);
      for (let i = 0; i < n; i++) {
        // rounded clipped-hedge profile: denser shell, upright random cards
        const u = (r2() - 0.5) * len, tt = r2() * Math.PI, rr = 0.55 + 0.45 * Math.sqrt(r2());
        const d = Math.cos(tt) * 0.62 * rr, yy = y + Math.sin(tt) * h * rr; const px = x + u * c + d * s, pz = z - u * s + d * c;
        const nrm = new THREE.Vector3(r2() - 0.5, (r2() - 0.5) * 0.9, r2() - 0.5).normalize(); const a = new THREE.Vector3().crossVectors(nrm, new THREE.Vector3(0.1, 1, 0.01)).normalize(), b = new THREE.Vector3().crossVectors(nrm, a);
        const sz = 0.26 + r2() * 0.2;
        const on = new THREE.Vector3(d * s, (yy - y) * 1.2 + 0.25, d * c).normalize();
        card(acc, px, yy, pz, a.x * sz, a.y * sz, a.z * sz, b.x * sz, b.y * sz, b.z * sz, on.x, Math.max(0.35, on.y), on.z, 0.5 + 0.5 * ((yy - y) / h));
      }
    }
    const m = new THREE.Mesh(acc.build(), leafMats[1]); m.castShadow = true; m.receiveShadow = true; m.name = 'shrubs'; m.matrixAutoUpdate = false; group.add(m);
  }

  let baked = false, forceFull = false, timer = 0;
  const lod = LOD_DIST[quality] || 150;
  function applyLOD(camera) {
    for (const ch of chunkList) {
      const d = Math.hypot(camera.position.x - ch.cx, camera.position.z - ch.cz) - ch.rad;
      // hysteresis to avoid flicker at the boundary
      const full = forceFull || (ch.isFull ? d < lod * 1.08 : d < lod);
      if (full !== ch.isFull) { ch.isFull = full; for (const m of ch.full) m.visible = full; for (const m of ch.imp) m.visible = !full; }
    }
  }
  for (const ch of chunkList) ch.isFull = true;
  const _sd = new THREE.Vector3();
  return {
    group,
    setForceFull(v, camera) { forceFull = v; applyLOD(camera); },
    prepare(renderer, camera) { if (!baked) { bakeImpostors(renderer); baked = true; } if (camera) applyLOD(camera); },
    update(camera, dt) {
      uTime.value += dt || 0; _sd.copy(sunDirection).transformDirection(camera.matrixWorldInverse); uSunDirV.value.copy(_sd);
      timer -= dt || 0; if (timer <= 0) { timer = 0.25; applyLOD(camera); }
    },
  };
}
