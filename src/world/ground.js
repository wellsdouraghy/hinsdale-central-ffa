// Ground: satellite-derived macro albedo + surface mask blended with tiled PBR detail textures.
import * as THREE from 'three';
import { applyBakedShadow } from './sky.js';

import { onCampusChange } from '../campuses/index.js';

/** World extent of the active campus's satellite / ground images (updated in place when the campus changes). */
/** Extra render layer of the terrain ground mesh: the baked shadow mask camera draws only this layer on terrain campuses. */
export const GROUND_BAKE_LAYER = 7;

export const SAT = { minX: -394.85, maxX: 394.85, minZ: -305.44, maxZ: 305.44 };
onCampusChange((c) => Object.assign(SAT, c.sat));

function avgColor(tex) {
  // mean linear-ish colour of a texture image (for normalising detail maps so they only add variation)
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(tex.image, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0;
  const lin = (v) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); gg += lin(d[i + 1]); b += lin(d[i + 2]); }
  const n = d.length / 4; return new THREE.Vector3(r / n, gg / n, b / n);
}

// Low-pass copy of the ground photo (rgb, ~16 photo pixels per texel) with the asphalt fraction in alpha. Each texel
// is the mean of the block's asphalt pixels with bright outliers (paint, car roofs) rejected, so the low-pass tone has no
// halo around lane markings; blocks without asphalt keep their plain mean.
function softGroundTexture(macroImg, maskImg) {
  const B = 16, W = macroImg.width, H = macroImg.height, w = Math.ceil(W / B), h = Math.ceil(H / B);
  const read = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
  const a = read(macroImg), m = read(maskImg);
  const cell = new Float32Array(w * h * 4);
  for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
    const xe = Math.min(W, bx * B + B), ye = Math.min(H, by * B + B); let n = 0, nA = 0, lumA = 0, r = 0, g = 0, b = 0;
    for (let y = by * B; y < ye; y++) for (let x = bx * B; x < xe; x++) { const i = (y * W + x) * 4; n++; r += a[i]; g += a[i + 1]; b += a[i + 2]; if (m[i] > 128) { nA++; lumA += a[i] + a[i + 1] + a[i + 2]; } }
    const o = (by * w + bx) * 4;
    if (nA >= 8) {
      const lim = (lumA / nA) * 1.18 + 12; let k = 0; r = g = b = 0;
      for (let y = by * B; y < ye; y++) for (let x = bx * B; x < xe; x++) { const i = (y * W + x) * 4; if (m[i] > 128 && a[i] + a[i + 1] + a[i + 2] <= lim) { k++; r += a[i]; g += a[i + 1]; b += a[i + 2]; } }
      cell[o] = r / k; cell[o + 1] = g / k; cell[o + 2] = b / k;
    } else { cell[o] = r / n; cell[o + 1] = g / n; cell[o + 2] = b / n; }
    cell[o + 3] = (nA / n) * 255;
  }
  // 3x3 tent blur between blocks; DataTexture rows start at the bottom: flip so the shader can use the photo's uv
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = ((h - 1 - y) * w + x) * 4; let ws = 0; const acc = [0, 0, 0, 0];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const wt = (dx ? 1 : 2) * (dy ? 1 : 2), i = (yy * w + xx) * 4; ws += wt; for (let k = 0; k < 4; k++) acc[k] += cell[i + k] * wt; }
    for (let k = 0; k < 4; k++) out[o + k] = Math.round(acc[k] / ws);
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// Optional per-campus extras (descriptor `ground: { ... }`, all off by default so other campuses are unchanged):
//   asphaltDeblur: 0..1   up close, replace the smeared satellite paint/car remnants on asphalt with a low-pass tone
//   canopy: { y, inset }  a flat "tree canopy" shelf at crown height around the satellite rectangle, so from the air the
//                         woods carry on to the horizon instead of ending in a cliff over a flat lawn (visual only)
export function createGround({ scene, textures, shadowUniforms, quality, opts = {}, roads = null, terrain = null }) {
  const T = textures;
  const deblur = Math.max(0, Math.min(1, +opts.asphaltDeblur || 0));
  const w = SAT.maxX - SAT.minX, h = SAT.maxZ - SAT.minZ;
  const uniforms = {
    uMacro: { value: T.groundMacro }, uMask: { value: T.groundMask },
    uGrassC: { value: T.grassColor }, uGrassN: { value: T.grassNormal },
    uAsphC: { value: T.asphaltColor }, uAsphN: { value: T.asphaltNormal },
    uConcC: { value: T.concreteColor }, uConcN: { value: T.concreteNormal },
    uSatRect: { value: new THREE.Vector4(SAT.minX, SAT.minZ, 1 / w, 1 / h) },
    uGrassAvg: { value: avgColor(T.grassColor) }, uAsphAvg: { value: avgColor(T.asphaltColor) }, uConcAvg: { value: avgColor(T.concreteColor) },
  };
  if (deblur) uniforms.uSoft = { value: softGroundTexture(T.groundMacro.image, T.groundMask.image) };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const extra = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (terrain) {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTerrN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvTerrN = normal;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTerrN;');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uMacro, uMask, uGrassC, uGrassN, uAsphC, uAsphN, uConcC, uConcN;
uniform vec4 uSatRect; uniform vec3 uGrassAvg, uAsphAvg, uConcAvg;
#ifdef GROUND_ASPHALT_DEBLUR
uniform sampler2D uSoft;
#endif
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y); }
`)
      .replace('#include <map_fragment>', `
  vec2 gUv = (vWPos.xz - uSatRect.xy) * uSatRect.zw;
  vec2 gUvT = vec2(gUv.x, 1.0 - gUv.y);
  float gDist = length(vWPos - cameraPosition);
  // perturb the mask lookup a little so class borders are not blurry-straight
  vec2 wob = (vec2(gNoise(vWPos.xz * 1.7), gNoise(vWPos.xz * 1.7 + 31.0)) - 0.5) * 0.35 * uSatRect.zw * (1.0 - smoothstep(30.0, 90.0, gDist));
  vec4 gMask = texture2D(uMask, gUvT + vec2(wob.x, -wob.y));
  float wA = gMask.r, wC = gMask.g, wS = gMask.b, wD = 1.0 - gMask.a;
  // sharpen class transitions
  float wG = clamp(1.0 - wA - wC - wS - wD, 0.0, 1.0);
  vec4 ww0 = vec4(wG, wA, wC, wS); float wd0 = wD;
  ww0 = pow(ww0, vec4(3.0)); wd0 = pow(wd0, 3.0);
  float wsum = ww0.x + ww0.y + ww0.z + ww0.w + wd0 + 1e-5; ww0 /= wsum; wd0 /= wsum;
  wG = ww0.x; wA = ww0.y; wC = ww0.z; wS = ww0.w; wD = wd0;
  vec3 gMacro = texture2D(uMacro, gUvT).rgb;
#ifdef GROUND_TERRAIN
  { // nobody paves a bank: ground steeper than ~25 deg (cut / fill slopes beside lots and streets) reads as grass, whatever
    // the surface class under it says (terrain campuses only)
    float gSteep = 1.0 - smoothstep(0.82, 0.905, normalize(vTerrN).y); float gTake = (wA + wC) * gSteep;
    wA *= 1.0 - gSteep; wC *= 1.0 - gSteep; wG += gTake; gMacro = mix(gMacro, vec3(0.07, 0.11, 0.035), gTake); }
#endif
  float nearW = 1.0 - smoothstep(18.0, 75.0, gDist);
#ifdef GROUND_ASPHALT_DEBLUR
  { // where the surroundings are asphalt (low-pass mask in uSoft.a), small bright features are paint / car remnants in
    // the photo: up close show clean asphalt with the photo's low-pass tone (uSoft.rgb) instead of metre-wide smears
    vec4 gSoft = texture2D(uSoft, gUvT);
    float k = clamp(smoothstep(0.55, 0.9, wA) * smoothstep(0.45, 0.75, gSoft.a) * (1.0 - smoothstep(14.0, 60.0, gDist)) * GROUND_ASPHALT_DEBLUR, 0.0, 1.0);
    gMacro = mix(gMacro, gSoft.rgb, k); }
#endif
  float midW = 1.0 - smoothstep(120.0, 420.0, gDist);
  // detail samples: fine (near) + coarse rotated (far, breaks tiling)
  vec2 pF = vWPos.xz; vec2 pC = rot2(vWPos.xz, 0.6);
  vec3 cG = mix(texture2D(uGrassC, pC / 11.0).rgb, texture2D(uGrassC, pF / 2.2).rgb, nearW) / uGrassAvg;
  vec3 cA = mix(texture2D(uAsphC, pC / 13.0).rgb, texture2D(uAsphC, pF / 3.0).rgb, nearW) / uAsphAvg;
  vec3 cC = mix(texture2D(uConcC, pC / 14.0).rgb, texture2D(uConcC, pF / 3.5).rgb, nearW) / uConcAvg;
  cG = mix(vec3(1.0), clamp(cG, 0.55, 1.7), 0.9 * midW);
  float aL = clamp(dot(cA, vec3(0.333)), 0.82, 1.16); cA = mix(vec3(1.0), vec3(aL), 0.6 * midW);
  float cL = clamp(dot(cC, vec3(0.333)), 0.8, 1.2); cC = mix(vec3(1.0), vec3(cL), 0.8 * midW);
  // sidewalk expansion joints every 1.5 m (subtle), fade with distance
  vec2 jt = abs(fract(vWPos.xz / 1.524) - 0.5);
  float joint = (1.0 - smoothstep(0.004, 0.012, min(jt.x, jt.y))) * nearW;
  cC *= 1.0 - 0.35 * joint;
  vec3 cS = vec3(mix(1.0, 0.82 + 0.36 * aL * 0.5 + 0.18 * gNoise(vWPos.xz * 40.0), nearW));
  vec3 cD = vec3(mix(1.0, 0.75 + 0.5 * cL * 0.5 + 0.2 * gNoise(vWPos.xz * 9.0), midW));
  // large-scale mottling so big lawns/lots are not uniform
  float mott = 0.88 + 0.24 * gNoise(vWPos.xz * 0.045) * gNoise(vWPos.xz * 0.21 + 7.0) * 2.0;
  vec3 gDetail = cG * wG * mott + cA * wA + cC * wC + cS * wS + cD * wD;
  diffuseColor.rgb = gMacro * gDetail;
  // normals (tangent frame of a y-up plane: T=+x, B=+z)
  vec3 nG = mix(texture2D(uGrassN, pC / 11.0).xyz, texture2D(uGrassN, pF / 2.2).xyz, nearW) * 2.0 - 1.0;
  vec3 nA = mix(texture2D(uAsphN, pC / 13.0).xyz, texture2D(uAsphN, pF / 3.0).xyz, nearW) * 2.0 - 1.0;
  vec3 nC = mix(texture2D(uConcN, pC / 14.0).xyz, texture2D(uConcN, pF / 3.5).xyz, nearW) * 2.0 - 1.0;
  vec3 nS = texture2D(uAsphN, pF / 0.9).xyz * 2.0 - 1.0;
  vec3 gN = nG * vec3(1.3, 1.3, 1.0) * wG + nA * vec3(0.8, 0.8, 1.0) * wA + nC * vec3(0.5, 0.5, 1.0) * wC + nS * vec3(0.5, 0.5, 1.0) * wS + nC * vec3(0.9, 0.9, 1.0) * wD;
  gN.xy *= mix(0.25, 1.0, midW);
  gN.xy += vec2(joint * sign(fract(vWPos.x / 1.524) - 0.5), joint * sign(fract(vWPos.z / 1.524) - 0.5)) * 0.4 * wC;
#ifdef GROUND_TERRAIN
  // detail normal in the tangent frame of the terrain surface (T ~ +x, B ~ +z, N = the mesh normal)
  vec3 tN = normalize(vTerrN); vec3 tT = normalize(vec3(tN.y, -tN.x, 0.0)); vec3 tB = cross(tT, tN);
  vec3 gNormalW = normalize(tT * gN.x + tB * gN.y + tN * gN.z);
#else
  vec3 gNormalW = normalize(vec3(gN.x, gN.z, gN.y));
#endif
  float gRough = 0.93 * wG + 0.86 * wA + 0.8 * wC + 0.88 * wS + 0.95 * wD;
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gNormalW, 0.0)).xyz);');
  };
  extra.key = 'ground' + (deblur ? ':deblur' + deblur.toFixed(2) : '') + (terrain ? ':terrain' : '');
  if (deblur) mat.defines = { ...(mat.defines || {}), GROUND_ASPHALT_DEBLUR: deblur.toFixed(3) };
  if (terrain) mat.defines = { ...(mat.defines || {}), GROUND_TERRAIN: '' };
  applyBakedShadow(mat, shadowUniforms, extra);

  let geo;
  if (terrain) geo = terrain.groundGeometry();   // displaced lattice (src/world/terrain.js); the shader only reads xz, so the photo lines up
  else { geo = new THREE.PlaneGeometry(w, h, 1, 1).rotateX(-Math.PI / 2); geo.translate((SAT.minX + SAT.maxX) / 2, 0, (SAT.minZ + SAT.maxZ) / 2); }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.name = 'ground'; mesh.matrixAutoUpdate = false;
  if (terrain) mesh.layers.enable(GROUND_BAKE_LAYER);   // the baked shadow mask is rendered from this mesh alone (sky.js)
  scene.add(mesh);

  // far skirt so the horizon is never empty (fog blends it into the sky)
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x3c5226, roughness: 1 });
  const skirt = new THREE.Mesh(new THREE.RingGeometry(280, 6000, 48, 1).rotateX(-Math.PI / 2), skirtMat);
  skirt.position.y = -0.25; skirt.name = 'ground-skirt'; skirt.matrixAutoUpdate = false; skirt.updateMatrix();
  scene.add(skirt);
  const visuals = [mesh, skirt];
  if (opts.canopy) { const shelf = createCanopyShelf(opts.canopy, quality, roads); scene.add(shelf); visuals.push(shelf); }
  return { mesh, skirt, material: mat, visuals };
}

// Canopy shelf: one upward-facing sheet at crown height with a hole over the satellite rectangle, shaded as a field of
// round tree crowns (cellular pattern + leaf breakup). A ring of low-poly 3D crowns (one merged mesh, real lighting) stands
// on its inner edge so the join with the instanced trees has relief instead of a flat lip. Streets that leave the
// satellite rectangle get a notch (no shelf, no crowns) with a dark asphalt strip so they carry on into the haze.
// Never visible from below (back-face culled), no collision, no shadows. Two draw calls at ground level; the crown ring
// (four more) is only drawn once the camera is above the tree tops, where it can actually be seen.
function createCanopyShelf(c, quality, roads) {
  const y = c.y ?? 9, inset = c.inset ?? 6, R = 6000, ringW = c.ring ?? 85;
  const x0 = SAT.minX + inset, x1 = SAT.maxX - inset, z0 = SAT.minZ + inset, z1 = SAT.maxZ - inset;
  const group = new THREE.Group(); group.name = 'ground-canopy';
  const lit = new THREE.Color(...(c.lit || [0.04, 0.115, 0.026])), dark = new THREE.Color(...(c.dark || [0.008, 0.026, 0.009]));

  // ---- street notches: [x0, z0, x1, z1] rectangles from the hole edge outward
  const NOTCH = 16, LEN = c.streetLength ?? 520, notches = [], strips = [];
  if (c.streets !== false && roads) {
    const HW = { secondary: 6.5, tertiary: 5, residential: 3.6, primary: 8 };
    const inside = (p) => p[0] > SAT.minX && p[0] < SAT.maxX && p[1] > SAT.minZ && p[1] < SAT.maxZ;
    for (const r of roads) {
      const hw = HW[r.tags && r.tags.highway]; if (!hw) continue;
      for (let i = 0; i < r.line.length - 1 && notches.length < NOTCH; i++) {
        const a = r.line[i], b = r.line[i + 1]; if (inside(a) === inside(b)) continue;
        const [pi, po] = inside(a) ? [a, b] : [b, a]; const dx = po[0] - pi[0], dz = po[1] - pi[1], L = Math.hypot(dx, dz) || 1;
        if (Math.abs(dx / L) > 0.9) {           // leaves through the east / west edge
          const ex = dx > 0 ? SAT.maxX : SAT.minX, t = (ex - pi[0]) / dx, zc = pi[1] + dz * t, sg = Math.sign(dx);
          if (notches.some((n) => n.ax === 'x' && n.sg === sg && Math.abs(n.c - zc) < 30)) continue;
          notches.push({ ax: 'x', sg, c: zc, rect: sg > 0 ? [x1 - 30, zc - hw - 2.5, ex + LEN, zc + hw + 2.5] : [ex - LEN, zc - hw - 2.5, x0 + 30, zc + hw + 2.5] });
          strips.push(sg > 0 ? [ex - 0.5, zc - hw, ex + LEN, zc + hw] : [ex - LEN, zc - hw, ex + 0.5, zc + hw]);
        } else if (Math.abs(dz / L) > 0.9) {    // north / south edge
          const ez = dz > 0 ? SAT.maxZ : SAT.minZ, t = (ez - pi[1]) / dz, xc = pi[0] + dx * t, sg = Math.sign(dz);
          if (notches.some((n) => n.ax === 'z' && n.sg === sg && Math.abs(n.c - xc) < 30)) continue;
          notches.push({ ax: 'z', sg, c: xc, rect: sg > 0 ? [xc - hw - 2.5, z1 - 30, xc + hw + 2.5, ez + LEN] : [xc - hw - 2.5, ez - LEN, xc + hw + 2.5, z0 + 30] });
          strips.push(sg > 0 ? [xc - hw, ez - 0.5, xc + hw, ez + LEN] : [xc - hw, ez - LEN, xc + hw, ez + 0.5]);
        }
      }
    }
  }
  const inNotch = (x, z, pad = 0) => notches.some((n) => x > n.rect[0] - pad && x < n.rect[2] + pad && z > n.rect[1] - pad && z < n.rect[3] + pad);
  const notchU = []; for (let i = 0; i < NOTCH; i++) notchU.push(new THREE.Vector4(...(notches[i] ? notches[i].rect : [1e7, 1e7, 1e7, 1e7])));

  // ---- flat shelf
  {
    const pos = []; const quad = (ax, az, bx, bz) => pos.push(ax, y, az, ax, y, bz, bx, y, bz, ax, y, az, bx, y, bz, bx, y, az);
    quad(-R, -R, R, z0); quad(-R, z1, R, R); quad(-R, z0, x0, z1); quad(x1, z0, R, z1);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCanLit = { value: lit }; shader.uniforms.uCanDark = { value: dark }; shader.uniforms.uNotch = { value: notchU }; shader.uniforms.uRing = { value: new THREE.Vector4((SAT.minX + SAT.maxX) / 2, (SAT.minZ + SAT.maxZ) / 2, (SAT.maxX - SAT.minX) / 2 + (quality === 'low' ? -1e4 : ringW), (SAT.maxZ - SAT.minZ) / 2 + (quality === 'low' ? -1e4 : ringW)) };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCanW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCanW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vCanW; uniform vec3 uCanLit, uCanDark; uniform vec4 uNotch[${NOTCH}]; uniform vec4 uRing; vec3 gCanN;
vec2 cHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float cNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = cHash2(i).x, b = cHash2(i + vec2(1, 0)).x, c = cHash2(i + vec2(0, 1)).x, d = cHash2(i + vec2(1, 1)).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
// nearest crown: xy = offset to its centre (in cells), z = distance, w = per-tree random
vec4 crowns(vec2 p) { vec2 i = floor(p), f = fract(p); vec4 best = vec4(0.0, 0.0, 9.0, 0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 h = cHash2(i + g);
    vec2 d = g + 0.1 + 0.8 * h - f; float r = length(d) / (0.7 + 0.6 * h.x); if (r < best.z) best = vec4(d, r, h.y); }
  return best; }`)
        .replace('#include <map_fragment>', `
  { vec2 np = vCanW.xz + (vec2(cNoise(vCanW.xz * 0.23), cNoise(vCanW.xz * 0.23 + 5.0)) - 0.5) * 3.0;
    vec2 rq = abs(vCanW.xz - uRing.xy) - uRing.zw; float inRing = 1.0 - smoothstep(-14.0, 0.0, max(rq.x, rq.y));
    float pinch = 2.2 * (1.0 - inRing);      // past the crown ring the canopy closes in to the kerbs
    for (int i = 0; i < ${NOTCH}; i++) { vec4 n = uNotch[i]; if (np.x > n.x + pinch && np.x < n.z - pinch && np.y > n.y + pinch && np.y < n.w - pinch) discard; }
    float dist = length(vCanW - cameraPosition); float det = 1.0 - smoothstep(300.0, 1000.0, dist); float fine = 1.0 - smoothstep(120.0, 420.0, dist);
    vec4 cr = crowns(vCanW.xz / 5.6 + (vec2(cNoise(vCanW.xz * 0.17), cNoise(vCanW.xz * 0.17 + 9.0)) - 0.5) * 1.8);
    float dome = 1.0 - smoothstep(0.35, 1.0, cr.z);
    float leaf = cNoise(vCanW.xz * 1.1) * 0.5 + cNoise(vCanW.xz * 2.9 + 17.0) * 0.3 + cNoise(vCanW.xz * 7.3 + 3.0) * 0.2;
    float patchy = cNoise(vCanW.xz * 0.035 + 2.0);
    float shade = mix(0.42, (0.12 + 0.62 * dome) * (0.55 + 0.9 * mix(0.5, leaf, fine)), det) * (0.8 + 0.4 * patchy);
    // under the ring of 3D crowns the shelf is the shadowed understorey between them
    shade *= 1.0 - 0.8 * inRing;
    vec3 tint = 0.8 + 0.45 * vec3(0.6 * cr.w, 0.55 * cr.w + 0.22, 0.3 * cr.w);
    diffuseColor.rgb = mix(uCanDark, uCanLit, clamp(shade, 0.0, 1.0)) * mix(vec3(1.0), tint, det);
    gCanN = normalize(vec3(-cr.x * 0.55 * det * dome + (leaf - 0.5) * 0.5 * fine, 1.0, -cr.y * 0.55 * det * dome + (patchy - 0.5) * 0.3)); }`)
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gCanN, 0.0)).xyz);');
    };
    mat.customProgramCacheKey = () => 'canopyShelf4';
    const m = new THREE.Mesh(geo, mat); m.name = 'ground-canopy-shelf'; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.frustumCulled = false;
    group.add(m);
  }

  // ---- ring of 3D crowns on the inner edge (deterministic jittered grid; skips the street notches)
  if (ringW > 0 && quality !== 'low') {
    let seed = 1234567; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const SIDES = 6, STEP = 6.0;
    // four meshes (one per side of the rectangle) so views that face away from a side do not draw it
    const sides = [0, 1, 2, 3].map(() => ({ pos: [], nor: [], col: [] })); const crownMeshes = [];
    const ox0 = SAT.minX - ringW, ox1 = SAT.maxX + ringW, oz0 = SAT.minZ - ringW, oz1 = SAT.maxZ + ringW;
    const V = (cx, cz, r, yy, k, tw) => { const a = (k / SIDES) * Math.PI * 2 + tw; return [cx + Math.cos(a) * r, yy, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; };
    for (let gz = oz0; gz < oz1; gz += STEP) for (let gx = ox0; gx < ox1; gx += STEP) {
      const j1 = rnd(), j2 = rnd(), j3 = rnd(), j4 = rnd(), j5 = rnd();
      const cx = gx + j1 * STEP, cz = gz + j2 * STEP;
      // distance outside the satellite rectangle (crowns start a little inside it, under the last real trees)
      const dOut = Math.max(SAT.minX - cx, cx - SAT.maxX, SAT.minZ - cz, cz - SAT.maxZ);
      if (dOut < -3 || dOut > ringW) continue;
      if (j5 < 0.06 + 0.55 * Math.max(0, dOut / ringW - 0.6)) continue;        // thin out toward the outer rim so it melts into the shelf
      if (inNotch(cx, cz, 2.5)) continue;
      const fade = Math.min(1, (ringW - dOut) / (ringW * 0.45));               // crowns sink toward the shelf at the outer rim
      const r = 3.3 + j3 * 3.0, top = y + (1.5 + j4 * 6.5) * fade + 0.5, mid = y + (top - y) * 0.45, tw = j1 * 6.28;
      const g = 0.82 + 0.36 * j4, cr = lit.r * g * (0.8 + 0.45 * j3), cg = lit.g * g, cb = lit.b * g * (0.8 + 0.5 * j2);
      const T = [cx, top, cz];
      const ux = (cx - (SAT.minX + SAT.maxX) / 2) / (SAT.maxX - SAT.minX), uz = (cz - (SAT.minZ + SAT.maxZ) / 2) / (SAT.maxZ - SAT.minZ);
      const { pos, nor, col } = sides[Math.abs(ux) > Math.abs(uz) ? (ux > 0 ? 0 : 1) : (uz > 0 ? 2 : 3)];
      for (let k = 0; k < SIDES; k++) {
        const a = V(cx, cz, r * 0.72, mid + (top - mid) * 0.35, k, tw), b = V(cx, cz, r * 0.72, mid + (top - mid) * 0.35, k + 1, tw), c0 = V(cx, cz, r, y - 0.6, k, tw), c1 = V(cx, cz, r, y - 0.6, k + 1, tw);
        // cap triangle (lit) + skirt quad (darker toward the base)
        pos.push(...T, b[0], b[1], b[2], a[0], a[1], a[2]); nor.push(0, 1, 0, b[3] * 0.55, 0.83, b[4] * 0.55, a[3] * 0.55, 0.83, a[4] * 0.55);
        col.push(cr * 1.12, cg * 1.12, cb * 1.12, cr, cg, cb, cr, cg, cb);
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c1[0], c1[1], c1[2], a[0], a[1], a[2], c1[0], c1[1], c1[2], c0[0], c0[1], c0[2]);
        nor.push(a[3] * 0.55, 0.83, a[4] * 0.55, b[3] * 0.55, 0.83, b[4] * 0.55, c1[3] * 0.92, 0.38, c1[4] * 0.92, a[3] * 0.55, 0.83, a[4] * 0.55, c1[3] * 0.92, 0.38, c1[4] * 0.92, c0[3] * 0.92, 0.38, c0[4] * 0.92);
        const d = 0.22; col.push(cr, cg, cb, cr, cg, cb, cr * d, cg * d, cb * d, cr, cg, cb, cr * d, cg * d, cb * d, cr * d, cg * d, cb * d);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCrW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vCrW;
float crHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float crNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(crHash(i), crHash(i + vec3(1, 0, 0)), f.x), mix(crHash(i + vec3(0, 1, 0)), crHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(crHash(i + vec3(0, 0, 1)), crHash(i + vec3(1, 0, 1)), f.x), mix(crHash(i + vec3(0, 1, 1)), crHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  { float fine = 1.0 - smoothstep(140.0, 460.0, length(vCrW - cameraPosition));
    float lf = crNoise(vCrW * 0.9) * 0.5 + crNoise(vCrW * 2.6 + 7.0) * 0.5; lf = smoothstep(0.2, 0.8, lf);
    diffuseColor.rgb *= mix(0.9, 0.35 + 1.25 * lf, fine); }`);
    };
    mat.customProgramCacheKey = () => 'canopyCrowns';
    for (const { pos, nor, col } of sides) {
      if (!pos.length) continue;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, mat); m.name = 'ground-canopy-crowns'; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false;
      group.add(m); crownMeshes.push(m);
    }
    // the ring sits behind 14 m trees at least a block away: skip it entirely for cameras below the canopy (takes effect next frame)
    const shelfMesh = group.children[0]; const minY = c.ringMinCamY ?? y + 9;
    if (crownMeshes.length) shelfMesh.onBeforeRender = (r, sc, cam) => { const v = cam.position.y > minY; if (crownMeshes[0].visible !== v) for (const cm of crownMeshes) cm.visible = v; };
  }

  // ---- asphalt strips carrying the streets on past the satellite edge (lawn-coloured skirt shows as the verge)
  if (strips.length) {
    const pos = []; const yy = -0.06;
    for (const [ax, az, bx, bz] of strips) pos.push(ax, yy, az, ax, yy, bz, bx, yy, bz, ax, yy, az, bx, yy, bz, bx, yy, az);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(...(c.asphalt || [0.036, 0.037, 0.04])), roughness: 0.95, metalness: 0 }));
    m.name = 'ground-canopy-streets'; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.frustumCulled = false;
    group.add(m);
  }
  group.matrixAutoUpdate = false;
  return group;
}
