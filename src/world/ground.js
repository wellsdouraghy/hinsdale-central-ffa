// Ground: satellite-derived macro albedo + surface mask blended with tiled PBR detail textures.
import * as THREE from 'three';
import { applyBakedShadow } from './sky.js';

import { onCampusChange } from '../campuses/index.js';

/** World extent of the active campus's satellite / ground images (updated in place when the campus changes). */
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

// Low-pass copy of the ground photo (rgb, ~3.5 m per texel) with the low-pass asphalt weight in alpha.
function softGroundTexture(macroImg, maskImg) {
  const w = Math.max(8, Math.round(macroImg.width / 16)), h = Math.max(8, Math.round(macroImg.height / 16));
  const small = (img) => {
    // halve repeatedly (box filter) so bright specks average out instead of aliasing
    let cur = img, cw = img.width, ch = img.height;
    while (cw > w * 2) { cw = Math.max(w, cw >> 1); ch = Math.max(h, ch >> 1); const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, cw, ch); cur = c; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  };
  const a = small(macroImg), m = small(maskImg), out = new Uint8Array(w * h * 4);
  // DataTexture rows start at the bottom: flip so the shader can use the same uv as the photo
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4; out[o] = a[i]; out[o + 1] = a[i + 1]; out[o + 2] = a[i + 2]; out[o + 3] = m[i]; }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// Optional per-campus extras (descriptor `ground: { ... }`, all off by default so other campuses are unchanged):
//   asphaltDeblur: 0..1   up close, replace the smeared satellite paint/car remnants on asphalt with a low-pass tone
//   canopy: { y, inset }  a flat "tree canopy" shelf at crown height around the satellite rectangle, so from the air the
//                         woods carry on to the horizon instead of ending in a cliff over a flat lawn (visual only)
export function createGround({ scene, textures, shadowUniforms, quality, opts = {} }) {
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
  float nearW = 1.0 - smoothstep(18.0, 75.0, gDist);
#ifdef GROUND_ASPHALT_DEBLUR
  { // where the surroundings are asphalt (low-pass mask in uSoft.a), small bright features are paint / car remnants in
    // the photo: up close show clean asphalt with the photo's low-pass tone (uSoft.rgb) instead of metre-wide smears
    vec4 gSoft = texture2D(uSoft, gUvT);
    float aSoft = smoothstep(0.7, 0.9, gSoft.a);
    float k = clamp(max(wA, aSoft) * (1.0 - smoothstep(14.0, 60.0, gDist)) * GROUND_ASPHALT_DEBLUR, 0.0, 1.0);
    gMacro = mix(gMacro, gSoft.rgb, k);
    float ka = aSoft * k; wA = mix(wA, 1.0, ka); wG *= 1.0 - ka; wC *= 1.0 - ka; wS *= 1.0 - ka; wD *= 1.0 - ka; }
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
  vec3 gNormalW = normalize(vec3(gN.x, gN.z, gN.y));
  float gRough = 0.93 * wG + 0.86 * wA + 0.8 * wC + 0.88 * wS + 0.95 * wD;
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gNormalW, 0.0)).xyz);');
  };
  extra.key = 'ground' + (deblur ? ':deblur' + deblur.toFixed(2) : '');
  if (deblur) mat.defines = { ...(mat.defines || {}), GROUND_ASPHALT_DEBLUR: deblur.toFixed(3) };
  applyBakedShadow(mat, shadowUniforms, extra);

  const geo = new THREE.PlaneGeometry(w, h, 1, 1).rotateX(-Math.PI / 2);
  geo.translate((SAT.minX + SAT.maxX) / 2, 0, (SAT.minZ + SAT.maxZ) / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.name = 'ground'; mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  // far skirt so the horizon is never empty (fog blends it into the sky)
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x3c5226, roughness: 1 });
  const skirt = new THREE.Mesh(new THREE.RingGeometry(280, 6000, 48, 1).rotateX(-Math.PI / 2), skirtMat);
  skirt.position.y = -0.25; skirt.name = 'ground-skirt'; skirt.matrixAutoUpdate = false; skirt.updateMatrix();
  scene.add(skirt);
  const visuals = [mesh, skirt];
  if (opts.canopy) { const shelf = createCanopyShelf(opts.canopy, quality); scene.add(shelf); visuals.push(shelf); }
  return { mesh, skirt, material: mat, visuals };
}

// Canopy shelf: one upward-facing sheet at crown height with a hole over the satellite rectangle, shaded as a field of
// round tree crowns (cellular pattern: lit domes, dark gaps, per-tree tint). Never visible from below (back-face culled),
// no collision, no shadows; one draw call and 16 triangles.
function createCanopyShelf(c, quality) {
  const y = c.y ?? 9, inset = c.inset ?? 6, R = 6000;
  const x0 = SAT.minX + inset, x1 = SAT.maxX - inset, z0 = SAT.minZ + inset, z1 = SAT.maxZ - inset;
  const pos = []; const quad = (ax, az, bx, bz) => pos.push(ax, y, az, ax, y, bz, bx, y, bz, ax, y, az, bx, y, bz, bx, y, az);
  quad(-R, -R, R, z0); quad(-R, z1, R, R); quad(-R, z0, x0, z1); quad(x1, z0, R, z1);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const lit = new THREE.Color(...(c.lit || [0.05, 0.105, 0.024])), dark = new THREE.Color(...(c.dark || [0.008, 0.022, 0.008]));
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCanLit = { value: lit }; shader.uniforms.uCanDark = { value: dark };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCanW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCanW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vCanW; uniform vec3 uCanLit, uCanDark; vec3 gCanN;
vec2 cHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float cNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = cHash2(i).x, b = cHash2(i + vec2(1, 0)).x, c = cHash2(i + vec2(0, 1)).x, d = cHash2(i + vec2(1, 1)).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
// nearest crown: xy = offset to its centre (in cells), z = distance, w = per-tree random
vec4 crowns(vec2 p) { vec2 i = floor(p), f = fract(p); vec4 best = vec4(0.0, 0.0, 9.0, 0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 h = cHash2(i + g);
    vec2 d = g + 0.15 + 0.7 * h - f; float r = length(d) / (0.75 + 0.5 * h.x); if (r < best.z) best = vec4(d, r, h.y); }
  return best; }`)
      .replace('#include <map_fragment>', `
  { float dist = length(vCanW - cameraPosition); float det = 1.0 - smoothstep(350.0, 1100.0, dist);
    vec4 cr = crowns(vCanW.xz / 9.0 + (vec2(cNoise(vCanW.xz * 0.11), cNoise(vCanW.xz * 0.11 + 9.0)) - 0.5) * 1.6); float dome = 1.0 - smoothstep(0.2, 0.85, cr.z);
    float leaf = cNoise(vCanW.xz * 0.55) * 0.6 + cNoise(vCanW.xz * 1.9 + 17.0) * 0.4;
    float shade = mix(0.5, dome * (0.7 + 0.45 * leaf), det);
    vec3 col = mix(uCanDark, uCanLit, shade) * mix(vec3(1.0), 0.78 + 0.5 * vec3(cr.w, 0.7 * cr.w + 0.15, 0.4 * cr.w), det);
    diffuseColor.rgb = col;
    gCanN = normalize(vec3(-cr.x * 0.9 * det * dome, 1.0, -cr.y * 0.9 * det * dome)); }`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gCanN, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'canopyShelf';
  const m = new THREE.Mesh(geo, mat); m.name = 'ground-canopy'; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.frustumCulled = false;
  return m;
}
