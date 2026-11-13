// Ground: satellite-derived macro albedo + surface mask blended with tiled PBR detail textures.
import * as THREE from 'three';
import { applyBakedShadow } from './sky.js';

export const SAT = { minX: -394.85, maxX: 394.85, minZ: -305.44, maxZ: 305.44 };

function avgColor(tex) {
  // mean linear-ish colour of a texture image (for normalising detail maps so they only add variation)
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(tex.image, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0;
  const lin = (v) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); gg += lin(d[i + 1]); b += lin(d[i + 2]); }
  const n = d.length / 4; return new THREE.Vector3(r / n, gg / n, b / n);
}

export function createGround({ scene, textures, shadowUniforms, quality }) {
  const T = textures;
  const w = SAT.maxX - SAT.minX, h = SAT.maxZ - SAT.minZ;
  const uniforms = {
    uMacro: { value: T.groundMacro }, uMask: { value: T.groundMask },
    uGrassC: { value: T.grassColor }, uGrassN: { value: T.grassNormal },
    uAsphC: { value: T.asphaltColor }, uAsphN: { value: T.asphaltNormal },
    uConcC: { value: T.concreteColor }, uConcN: { value: T.concreteNormal },
    uSatRect: { value: new THREE.Vector4(SAT.minX, SAT.minZ, 1 / w, 1 / h) },
    uGrassAvg: { value: avgColor(T.grassColor) }, uAsphAvg: { value: avgColor(T.asphaltColor) }, uConcAvg: { value: avgColor(T.concreteColor) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const extra = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uMacro, uMask, uGrassC, uGrassN, uAsphC, uAsphN, uConcC, uConcN;
uniform vec4 uSatRect; uniform vec3 uGrassAvg, uAsphAvg, uConcAvg;
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
  float midW = 1.0 - smoothstep(120.0, 420.0, gDist);
  // detail samples: fine (near) + coarse rotated (far, breaks tiling)
  vec2 pF = vWPos.xz; vec2 pC = rot2(vWPos.xz, 0.6);
  vec3 cG = mix(texture2D(uGrassC, pC / 11.0).rgb, texture2D(uGrassC, pF / 2.2).rgb, nearW) / uGrassAvg;
  vec3 cA = mix(texture2D(uAsphC, pC / 13.0).rgb, texture2D(uAsphC, pF / 3.0).rgb, nearW) / uAsphAvg;
  vec3 cC = mix(texture2D(uConcC, pC / 14.0).rgb, texture2D(uConcC, pF / 3.5).rgb, nearW) / uConcAvg;
  cG = mix(vec3(1.0), cG, 0.9 * midW);
  float aL = dot(cA, vec3(0.333)); cA = mix(vec3(1.0), vec3(aL), 0.75 * midW);
  float cL = dot(cC, vec3(0.333)); cC = mix(vec3(1.0), vec3(cL), 0.8 * midW);
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
  extra.key = 'ground';
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
  return { mesh, skirt, material: mat, visuals: [mesh, skirt] };
}
