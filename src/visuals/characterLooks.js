// Character looks: five restyles of the shared soldier rig (same skeleton, same animations).
//
//   import { LOOKS, applyLook } from './characterLooks.js';
//   applyLook(modelOrCharacterRoot, 'infantry', { teamColor: 0xe0242c });
//
// applyLook works on the loaded glTF scene, on a SkeletonUtils clone of it, or on a createCharacter() root (after
// charactersReady). It does two things:
//   1. swaps the body material for a shader that re-classifies the original texture (armour plate / cloth / metal /
//      stripe / undersuit) per body region and repaints it from a per-look palette, with tri-planar camouflage and weave;
//   2. adds ONE extra SkinnedMesh ("lookGear") bound to the same skeleton holding all the new gear (helmet, plate carrier,
//      pouches, scarf ...), every piece rigidly weighted to a bone. Cost: 1 extra draw call, a few thousand triangles.
// Gear is authored in "A space": metres, bind (T) pose, origin on the ground under the hips, +y up, +z forward (the way the
// character faces), +x towards the character's LEFT hand. The character is 1.8 m to the top of the skull bone.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { activeCampus } from '../campuses/index.js';

// Varsity chest letters as block strokes [dx, dy, w, h] around the letter centre (metres).
const LETTER_STROKES = {
  H: [[-0.03, 0, 0.026, 0.1], [0.03, 0, 0.026, 0.1], [0, 0, 0.06, 0.026]],
  L: [[-0.024, 0, 0.026, 0.1], [0.006, -0.037, 0.086, 0.026]],
  M: [[-0.033, 0, 0.022, 0.1], [0.033, 0, 0.022, 0.1], [0, 0.037, 0.088, 0.026], [0, 0.012, 0.02, 0.05]],
  B: [[-0.028, 0, 0.024, 0.1], [0.002, 0.037, 0.06, 0.026], [0.002, 0, 0.056, 0.022], [0.002, -0.037, 0.06, 0.026], [0.03, 0.019, 0.022, 0.036], [0.03, -0.019, 0.022, 0.036]],
};

export const LOOKS = [
  { id: 'infantry', name: 'Modern Infantry', description: 'Multi-terrain camouflage fatigues, plate carrier with magazine pouches, ballistic helmet with NVG mount, team armband and helmet band.' },
  { id: 'specops', name: 'Spec Ops', description: 'All-black kit: balaclava, high-cut helmet with flipped-up night vision, headset, slim chest rig, subdued team patch and helmet strip.' },
  { id: 'varsity', name: 'Varsity Tactical', description: 'Campus look: team-colour varsity jacket with letter patch over light armour, dark tactical trousers, backwards cap.' },
  { id: 'desert', name: 'Desert Operator', description: 'Coyote and arid camouflage, boonie hat, shemagh scarf, sunglasses, chest rig, team armband.' },
  { id: 'heavy', name: 'Heavy Armor', description: 'Full hard-plate armour with a closed visored helmet, extra chest and shoulder plates, team stripes on the shoulders.' },
];

// ---- rig analysis (cached per body geometry) --------------------------------------------------------------------------
const REG = { head: 0, neck: 1, chest: 2, belly: 3, hips: 4, arm: 5, fore: 6, hand: 7, thigh: 8, shin: 9, foot: 10 };
const NREG = 11;
const CLS = ['plate', 'cloth', 'metal', 'stripe', 'dark'];
const bare = (n) => n.replace(/^mixamorig:?/, '');
function regionOfBone(n) {
  if (/^Head/.test(n)) return REG.head;
  if (n === 'Neck') return REG.neck;
  if (n === 'Spine2' || /Shoulder$/.test(n)) return REG.chest;
  if (n === 'Spine' || n === 'Spine1') return REG.belly;
  if (n === 'Hips') return REG.hips;
  if (/ForeArm$/.test(n)) return REG.fore;
  if (/Arm$/.test(n)) return REG.arm;
  if (/Hand/.test(n)) return REG.hand;
  if (/UpLeg$/.test(n)) return REG.thigh;
  if (/Leg$/.test(n)) return REG.shin;
  return REG.foot;
}

const analysisCache = new WeakMap();
function analyze(body) {
  const geo = body.geometry;
  if (analysisCache.has(geo)) return analysisCache.get(geo);
  const sk = body.skeleton, names = sk.bones.map((b) => bare(b.name));
  const idx = (n) => names.indexOf(n);
  let rootBone = sk.bones[0]; while (rootBone.parent?.isBone) rootBone = rootBone.parent;
  const bindW = (n) => {
    if (idx(n) >= 0) return new THREE.Matrix4().copy(sk.boneInverses[idx(n)]).invert();
    let o = null; rootBone.traverse((c) => { if (bare(c.name) === n) o = c; });      // end bones are not skin joints
    o.updateMatrix();
    return bindW(bare(o.parent.name)).multiply(o.matrix);
  };
  const p = (n) => new THREE.Vector3().setFromMatrixPosition(bindW(n));
  const snap = (v) => { const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)], m = Math.max(...a); return new THREE.Vector3(a[0] === m ? Math.sign(v.x) : 0, a[1] === m ? Math.sign(v.y) : 0, a[2] === m ? Math.sign(v.z) : 0); };
  const hips = p('Hips'), top = p('HeadTop_End');
  const up = snap(top.clone().sub(hips));
  const f = p('LeftToeBase').sub(p('LeftFoot')).add(p('RightToeBase')).sub(p('RightFoot'));
  const fwd = snap(f.addScaledVector(up, -f.dot(up)));
  const left = new THREE.Vector3().crossVectors(up, fwd);
  const ground = Math.min(p('LeftToeBase').dot(up), p('RightToeBase').dot(up), 0);
  const k = (top.dot(up) - ground) / 1.8;
  const origin = hips.clone().addScaledVector(up, ground - hips.dot(up));
  const fromA = new THREE.Matrix4().makeBasis(left.clone().multiplyScalar(k), up.clone().multiplyScalar(k), fwd.clone().multiplyScalar(k)).setPosition(origin);   // A -> bind space
  const toA = fromA.clone().invert().multiply(body.bindMatrix);                                                                                             // geometry -> A
  const geoFromA = toA.clone().invert();
  // per-vertex region + A-space position
  const P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const region = new Float32Array(P.count), posA = new Float32Array(P.count * 3), boneOf = new Int16Array(P.count), v = new THREE.Vector3();
  const boneRegion = names.map(regionOfBone);
  for (let i = 0; i < P.count; i++) {
    let best = 0, bw = -1;
    for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > bw) { bw = w; best = SI.getComponent(i, c); } }
    region[i] = boneRegion[best]; boneOf[i] = best;
    v.fromBufferAttribute(P, i).applyMatrix4(toA); posA[i * 3] = v.x; posA[i * 3 + 1] = v.y; posA[i * 3 + 2] = v.z;
  }
  if (!geo.attributes.aRegion) geo.setAttribute('aRegion', new THREE.BufferAttribute(region, 1));
  const bones = {};
  for (const n of [...names, 'HeadTop_End']) bones[n] = p(n).applyMatrix4(fromA.clone().invert());
  const an = { names, idx, toA, geoFromA, region, posA, boneOf, bones, count: P.count, SI, SW };
  // bounding box (A space) of the vertices in the given regions / height range / optional x range
  an.measure = (regs, y0 = -1e9, y1 = 1e9, x0 = -1e9, x1 = 1e9) => {
    const set = new Set(regs.map((r) => REG[r]));
    const b = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9, n: 0 };
    for (let i = 0; i < an.count; i++) {
      if (!set.has(region[i])) continue;
      const x = posA[i * 3], y = posA[i * 3 + 1], z = posA[i * 3 + 2];
      if (y < y0 || y > y1 || x < x0 || x > x1) continue;
      b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); b.n++;
    }
    return b;
  };
  analysisCache.set(geo, an);
  return an;
}

// ---- procedural textures ------------------------------------------------------------------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function fbm(size, baseCells, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, cells = baseCells;
  for (let o = 0; o < octaves && cells <= size; o++) {
    const r = rng(seed + o * 101), grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy), y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx), x1 = (x0 + 1) % cells;
        const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1], c = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp; amp *= 0.5; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
const texCache = new Map();
function canvasTex(key, size, fill, srgb = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  fill(img.data, size);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
// Blotch camouflage: `layers` = [[r,g,b], noiseCells, threshold, seed] painted in order over the base colour, soft edges.
function camoTex(key, base, layers, grain = 0.1) {
  return canvasTex('camo_' + key, 512, (d, size) => {
    const n = size * size, col = new Float32Array(n * 3), g = fbm(size, 128, 2, 977), g2 = fbm(size, 3, 3, 431);
    for (let i = 0; i < n; i++) { col[i * 3] = base[0]; col[i * 3 + 1] = base[1]; col[i * 3 + 2] = base[2]; }
    for (const [c, cells, thr, seed, soft = 0.012] of layers) {
      const f = fbm(size, cells, 4, seed);
      for (let i = 0; i < n; i++) {
        const t = Math.min(1, Math.max(0, (f[i] - thr) / soft)), a = t * t * (3 - 2 * t);
        col[i * 3] += (c[0] - col[i * 3]) * a; col[i * 3 + 1] += (c[1] - col[i * 3 + 1]) * a; col[i * 3 + 2] += (c[2] - col[i * 3 + 2]) * a;
      }
    }
    for (let i = 0; i < n; i++) {
      const s = 1 - grain + g[i] * grain * 2 + (g2[i] - 0.5) * 0.12;
      d[i * 4] = col[i * 3] * s; d[i * 4 + 1] = col[i * 3 + 1] * s; d[i * 4 + 2] = col[i * 3 + 2] * s; d[i * 4 + 3] = 255;
    }
  });
}
const CAMO = {
  // green-dominant multi-terrain pattern (original; layered noise blotches)
  woodland: () => camoTex('woodland', [128, 118, 88], [[[92, 100, 66], 5, 0.5, 11, 0.05], [[64, 74, 48], 6, 0.56, 23], [[154, 142, 108], 9, 0.6, 37], [[72, 58, 42], 8, 0.61, 53], [[44, 50, 36], 14, 0.64, 71], [[176, 166, 132], 18, 0.67, 89]]),
  desert: () => camoTex('desert', [172, 150, 112], [[[150, 126, 90], 5, 0.5, 13, 0.06], [[190, 172, 136], 7, 0.57, 29], [[122, 98, 68], 9, 0.62, 41], [[206, 192, 160], 16, 0.66, 67]]),
  night: () => camoTex('night', [40, 42, 45], [[[54, 56, 60], 5, 0.52, 17, 0.06], [[26, 27, 30], 8, 0.58, 31, 0.03], [[66, 68, 72], 14, 0.66, 47, 0.03]], 0.14),
  plain: () => camoTex('plain', [128, 128, 128], [[[140, 140, 140], 5, 0.52, 19, 0.2], [[112, 112, 112], 9, 0.6, 43, 0.15]], 0.08),
};
// fabric weave height (R) used for albedo modulation and bump
const weaveTex = () => canvasTex('weave', 128, (d, size) => {
  const n = fbm(size, 32, 2, 5), cells = 32;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * cells * Math.PI, v = (y / size) * cells * Math.PI;
    const over = (Math.floor(x / (size / cells)) + Math.floor(y / (size / cells))) % 2;
    const h = (over ? Math.abs(Math.sin(u)) : Math.abs(Math.sin(v))) * 0.7 + n[y * size + x] * 0.3;
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = h * 255; d[i + 3] = 255;
  }
}, false);

// ---- shader ---------------------------------------------------------------------------------------------------------------
const VERT_DECL = /* glsl */`
uniform mat4 uLkToA;
varying vec3 vLkPos; varying vec3 vLkNrm;
#ifdef LK_GEAR
  attribute vec4 aMat; attribute float aGlow; varying vec4 vLkMat; varying float vLkGlow;
#else
  attribute float aRegion; flat varying float vLkRegion;
#endif
`;
const VERT_MAIN = /* glsl */`
vLkPos = (uLkToA * vec4(position, 1.0)).xyz; vLkNrm = normalize(mat3(uLkToA) * normal);
#ifdef LK_GEAR
  vLkMat = aMat; vLkGlow = aGlow;
#else
  vLkRegion = aRegion;
#endif
`;
const FRAG_DECL = /* glsl */`
uniform sampler2D uLkCamo; uniform sampler2D uLkWeave; uniform float uLkCamoScale; uniform vec3 uLkCamoTint;
varying vec3 vLkPos; varying vec3 vLkNrm;
float lkRough = 0.8, lkMetal = 0.0, lkGlow = 0.0, lkBump = 0.0, lkH = 0.0;
#ifdef LK_GEAR
  varying vec4 vLkMat; varying float vLkGlow;
#else
  uniform sampler2D uLkPalA; uniform sampler2D uLkPalB; uniform float uLkHide; uniform float uLkDebug; uniform float uLkCut;
  flat varying float vLkRegion;
#endif
vec3 lkTri(sampler2D t, float s) {
  vec3 w = pow(abs(normalize(vLkNrm)), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture2D(t, vLkPos.zy * s).rgb * w.x + texture2D(t, vLkPos.xz * s).rgb * w.y + texture2D(t, vLkPos.xy * s).rgb * w.z;
}
vec3 lkFinish(vec3 base, float camo, float weave) {
  vec3 cm = lkTri(uLkCamo, uLkCamoScale) * uLkCamoTint;
  base = mix(base, cm, clamp(camo, 0.0, 1.0));
  float h = lkTri(uLkWeave, 55.0).r;
  lkH = h; lkBump = weave;
  return base * mix(1.0, 0.78 + 0.44 * h, weave);
}
`;
const FRAG_MAP = /* glsl */`
#ifdef LK_GEAR
  diffuseColor.rgb = lkFinish(diffuseColor.rgb, vLkMat.z, vLkMat.w);
  lkRough = vLkMat.x; lkMetal = vLkMat.y; lkGlow = vLkGlow;
#else
  if (vLkRegion < uLkHide || (vLkPos.y > uLkCut + 1.2 * max(abs(vLkPos.x) - 0.17, 0.0) && vLkRegion < 3.5)) discard;
  vec3 lkT = texture2D(map, vMapUv).rgb;
  float lkL = dot(lkT, vec3(0.2126, 0.7152, 0.0722));
  float wS = smoothstep(0.05, 0.14, lkT.r - 2.4 * max(lkT.g, lkT.b));
  float wP = smoothstep(0.05, 0.16, lkT.r - lkT.b) * smoothstep(0.10, 0.24, lkL) * (1.0 - wS);
  float wM = smoothstep(-0.004, 0.012, lkT.b - lkT.r) * smoothstep(0.035, 0.09, lkL) * (1.0 - wS) * (1.0 - wP);
  float wC = smoothstep(0.002, 0.012, lkT.g - max(lkT.r, lkT.b * 1.12)) * smoothstep(0.012, 0.03, lkL) * (1.0 - wS) * (1.0 - wP) * (1.0 - wM);
  float wD = max(0.0, 1.0 - wS - wP - wM - wC);
  float lkV = (floor(vLkRegion + 0.5) + 0.5) / ${NREG}.0;
  vec4 a0 = texture2D(uLkPalA, vec2(0.1, lkV)), a1 = texture2D(uLkPalA, vec2(0.3, lkV)), a2 = texture2D(uLkPalA, vec2(0.5, lkV)), a3 = texture2D(uLkPalA, vec2(0.7, lkV)), a4 = texture2D(uLkPalA, vec2(0.9, lkV));
  vec4 b0 = texture2D(uLkPalB, vec2(0.1, lkV)), b1 = texture2D(uLkPalB, vec2(0.3, lkV)), b2 = texture2D(uLkPalB, vec2(0.5, lkV)), b3 = texture2D(uLkPalB, vec2(0.7, lkV)), b4 = texture2D(uLkPalB, vec2(0.9, lkV));
  // per-class detail from the original texture (wear, seams, panel shading), normalised by the class's typical brightness
  vec3 dt = vec3(clamp(lkL / 0.46, 0.35, 1.35), clamp(lkL / 0.075, 0.5, 1.5), clamp(lkL / 0.2, 0.5, 1.5));
  vec3 c0 = a0.rgb * mix(1.0, dt.x, b0.z), c1 = a1.rgb * mix(1.0, dt.y, b1.z), c2 = a2.rgb * mix(1.0, dt.z, b2.z), c3 = a3.rgb, c4 = a4.rgb * mix(1.0, clamp(lkL / 0.03, 0.4, 1.6), b4.z);
  vec3 lkC = c0 * wP + c1 * wC + c2 * wM + c3 * wS + c4 * wD;
  vec4 pa = a0 * wP + a1 * wC + a2 * wM + a3 * wS + a4 * wD;
  vec4 pb = b0 * wP + b1 * wC + b2 * wM + b3 * wS + b4 * wD;
  float lkDet = mix(1.0, dt.x, b0.z) * wP + mix(1.0, dt.y, b1.z) * wC + mix(1.0, dt.z, b2.z) * wM + wS + wD;
  vec3 lkCam = lkTri(uLkCamo, uLkCamoScale) * uLkCamoTint * lkDet;
  lkC = mix(lkC, lkCam, clamp(pa.a, 0.0, 1.0));
  float lkWh = lkTri(uLkWeave, 55.0).r; lkH = lkWh; lkBump = pb.w;
  lkC *= mix(1.0, 0.78 + 0.44 * lkWh, pb.w);
  lkRough = pb.x; lkMetal = min(pb.y, 1.0); lkGlow = max(pb.y - 1.0, 0.0);
  if (uLkDebug > 0.5) lkC = vec3(wP + wS, wC + wS * 0.2, wM + wD * 0.25);
  diffuseColor.rgb = lkC;
#endif
`;
const FRAG_BUMP = /* glsl */`
{
  vec3 lkDx = dFdx(vViewPosition), lkDy = dFdy(vViewPosition);
  float lkHx = dFdx(lkH), lkHy = dFdy(lkH);
  vec3 r1 = cross(lkDy, normal), r2 = cross(normal, lkDx);
  float det = dot(lkDx, r1);
  vec3 grad = sign(det) * (lkHx * r1 + lkHy * r2);
  normal = normalize(abs(det) * normal - 0.0012 * lkBump * grad);
}
`;
// Fresnel rim (viewer-relative ally highlight, see character.setRelation): uLkRim = rgb colour, a = strength (0 = off).
export const RIM_GLSL = 'totalEmissiveRadiance += uLkRim.rgb * uLkRim.a * pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.8);';
function patch(mat, uniforms, gear) {
  mat.defines = { ...(mat.defines || {}) };
  if (gear) mat.defines.LK_GEAR = 1;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uLkRim;\n' + FRAG_DECL)
      .replace('#include <map_fragment>', gear ? '#include <map_fragment>\n' + FRAG_MAP : FRAG_MAP)
      .replace('#include <color_fragment>', gear ? FRAG_MAP_GEAR_ORDER : '#include <color_fragment>')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = lkRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = lkMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_BUMP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * lkGlow;\n' + RIM_GLSL);
  };
  mat.customProgramCacheKey = () => (gear ? 'lookGear3' : 'lookBody3');
  return mat;
}
// gear: vertex colour first (color_fragment), then camo/weave on top of it
const FRAG_MAP_GEAR_ORDER = '#include <color_fragment>\n' + FRAG_MAP;

// ---- palettes ----------------------------------------------------------------------------------------------------------------
// P(colour, { camo, rough, metal, keep (how much of the original texture's shading/wear survives), weave, glow })
const P = (color, o = {}) => ({ color, camo: 0, rough: 0.85, metal: 0, keep: 0.6, weave: 0, glow: 0, ...o });
function buildPalette(spec, team) {
  const a = new Float32Array(CLS.length * NREG * 4), b = new Float32Array(CLS.length * NREG * 4), c = new THREE.Color();
  for (const [rn, r] of Object.entries(REG)) for (let k = 0; k < CLS.length; k++) {
    const e = spec[rn]?.[CLS[k]] || spec.all[CLS[k]];
    if (e.color === 'team') c.copy(team); else if (e.color === 'teamDark') c.copy(team).multiplyScalar(0.35); else c.set(e.color);
    const i = (r * CLS.length + k) * 4;
    a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; a[i + 3] = e.camo;
    b[i] = e.rough; b[i + 1] = e.glow > 0 ? 1 + e.glow : e.metal; b[i + 2] = e.keep; b[i + 3] = e.weave;
  }
  const mk = (d) => { const t = new THREE.DataTexture(d, CLS.length, NREG, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  return [mk(a), mk(b)];
}

// ---- gear builder -------------------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
class Gear {
  constructor(an, team) { this.an = an; this.team = team; this.pos = []; this.nrm = []; this.col = []; this.mat = []; this.glow = []; this.si = []; this.sw = []; this.index = []; }
  // geo: BufferGeometry in local space. o: { bone, at:[x,y,z], rot:[x,y,z], scale: n | [x,y,z], color, rough, metal, camo, weave, glow, mirror, bone2, blend:[y0,y1] }
  add(geo, o) {
    const { bone, at = [0, 0, 0], rot = [0, 0, 0], scale = 1, rough = 0.85, metal = 0, camo = 0, weave = 0, glow = 0, mirror = false } = o;
    if (o.color === 'team') _c.copy(this.team); else if (o.color === 'teamDark') _c.copy(this.team).multiplyScalar(0.35); else _c.set(o.color ?? 0x808080);
    const cr = _c.r, cg = _c.g, cb = _c.b;
    _m.compose(_v.fromArray(at), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], o.order || 'XYZ')), Array.isArray(scale) ? _s.fromArray(scale) : _s.setScalar(scale));
    if (o.matrix) _m.premultiply(o.matrix);
    for (const side of mirror ? [1, -1] : [1]) {
      const m = _m.clone();
      if (side < 0) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      _n.getNormalMatrix(m);
      const swap = (n) => (side < 0 ? n.replace(/^(Left|Right)/, (s) => (s === 'Left' ? 'Right' : 'Left')) : n);
      const bi = this.an.idx(swap(bone)), bi2 = o.bone2 ? this.an.idx(swap(o.bone2)) : bi;
      if (bi < 0) throw new Error('lookGear: no bone ' + bone);
      const P = geo.attributes.position, N = geo.attributes.normal, base = this.pos.length / 3;
      for (let i = 0; i < P.count; i++) {
        _v.fromBufferAttribute(P, i).applyMatrix4(m); this.pos.push(_v.x, _v.y, _v.z);
        let w2 = 0;
        if (o.bone2) { const t = Math.min(1, Math.max(0, (_v.y - o.blend[0]) / (o.blend[1] - o.blend[0]))); w2 = t; }
        _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize(); this.nrm.push(_v.x, _v.y, _v.z);
        this.col.push(cr, cg, cb); this.mat.push(rough, metal, camo, weave); this.glow.push(glow);
        if (o.wrap) {                                             // soft gear: copy the skin weights of the nearest body vertex
          const an = this.an, px = this.pos.at(-3), py = this.pos.at(-2), pz = this.pos.at(-1); let best = 0, bd = 1e9;
          for (let k = 0; k < an.count; k++) { const dx = an.posA[k * 3] - px, dy = an.posA[k * 3 + 1] - py, dz = an.posA[k * 3 + 2] - pz, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = k; } }
          for (let c = 0; c < 4; c++) { this.si.push(an.SI.getComponent(best, c)); this.sw.push(an.SW.getComponent(best, c)); }
        } else { this.si.push(bi, bi2, 0, 0); this.sw.push(1 - w2, w2, 0, 0); }
      }
      const I = geo.index;
      const n = I ? I.count : P.count;
      for (let i = 0; i < n; i += 3) {
        const a = I ? I.getX(i) : i, b = I ? I.getX(i + 1) : i + 1, c = I ? I.getX(i + 2) : i + 2;
        if (side < 0) this.index.push(base + a, base + c, base + b); else this.index.push(base + a, base + b, base + c);
      }
    }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry(), an = this.an;
    const pos = new Float32Array(this.pos), nrm = new Float32Array(this.nrm);
    _n.getNormalMatrix(an.geoFromA);
    for (let i = 0; i < pos.length; i += 3) {
      _v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(an.geoFromA); pos[i] = _v.x; pos[i + 1] = _v.y; pos[i + 2] = _v.z;
      _v.set(nrm[i], nrm[i + 1], nrm[i + 2]).applyMatrix3(_n).normalize(); nrm[i] = _v.x; nrm[i + 1] = _v.y; nrm[i + 2] = _v.z;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(this.mat), 4));
    g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(this.glow), 1));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(this.si), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(this.sw), 4));
    g.setIndex(this.index);
    return g;
  }
}

// geometry helpers (all unit-ish; scaled by the caller)
const geoCache = new Map();
const cg = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const rbox = (w, h, d, r = 0.01, seg = 1) => cg(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
const box = (w, h, d) => cg(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r1, r2, h, seg = 16, open = false) => cg(`c${r1},${r2},${h},${seg},${open}`, () => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open));
const sph = (ws = 20, hs = 14, p0 = 0, p1 = Math.PI * 2, t0 = 0, t1 = Math.PI, r = 1) => cg(`s${r},${ws},${hs},${p0},${p1},${t0},${t1}`, () => new THREE.SphereGeometry(r, ws, hs, p0, p1, t0, t1));
const torus = (R, r, rs = 8, ts = 24, arc = Math.PI * 2) => cg(`t${R},${r},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const arc = (r1, r2, h, t0, len, seg = 16) => cg(`a${r1},${r2},${h},${t0},${len},${seg}`, () => new THREE.CylinderGeometry(r1, r2, h, seg, 1, true, t0, len));
const lathe = (pts, seg = 24, p0 = 0, p1 = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg, p0, p1);

const LOOK_BUILDERS = {};
export function __registerLook(id, def) { LOOK_BUILDERS[id] = def; }

// ---- public API ----------------------------------------------------------------------------------------------------------------
const gearGeoCache = new Map();
export function applyLook(root, lookId, { teamColor = 0xe0242c, debug = 0, rim = null } = {}) {
  const def = LOOK_BUILDERS[lookId];
  let body = null, visor = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !o.userData.lookGear) { if (/visor/i.test(o.name)) visor = o; else if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) body = o; } });
  if (!body) return null;
  const an = analyze(body), team = new THREE.Color(teamColor);
  // remove a previously applied look and the default accent bands (open cylinders parented to the arm / head bones)
  root.traverse((o) => { if (o.userData.lookGear) o.userData.lookRemove = true; if (o.isMesh && !o.isSkinnedMesh && o.geometry?.type === 'CylinderGeometry' && o.parent?.isBone && o.geometry.parameters.openEnded) o.visible = false; });
  const old = []; root.traverse((o) => { if (o.userData.lookRemove) old.push(o); });
  for (const o of old) { o.removeFromParent(); o.material.dispose(); }
  body.userData.lookOrigMaterial ??= body.material;
  if (visor) visor.userData.lookOrigMaterial ??= visor.material;
  if (!def) { body.material = body.userData.lookOrigMaterial; if (visor) { visor.material = visor.userData.lookOrigMaterial; visor.visible = true; } return null; }
  const src = body.userData.lookOrigMaterial;
  const camo = CAMO[def.camo || 'plain']();
  const common = { uLkToA: { value: an.toA }, uLkCamo: { value: camo }, uLkWeave: { value: weaveTex() }, uLkCamoScale: { value: def.camoScale || 1.7 }, uLkCamoTint: { value: new THREE.Color().setScalar(def.camoGain || 1) }, uLkRim: { value: rim || new THREE.Vector4(0, 0, 0, 0) } };
  const [palA, palB] = buildPalette(def.palette, team);
  const mat = patch(new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, normalScale: new THREE.Vector2(def.normalScale ?? 1, def.normalScale ?? 1), roughness: 1, metalness: 1, envMapIntensity: src.envMapIntensity }),
    { ...common, uLkPalA: { value: palA }, uLkPalB: { value: palB }, uLkHide: { value: def.hide ?? -1 }, uLkCut: { value: def.collarCut ?? 99 }, uLkDebug: { value: debug } }, false);
  mat.name = 'look_' + lookId;
  body.material = mat;
  if (visor) {
    visor.visible = def.visor !== false && (def.hide ?? -1) < 0;
    if (def.visor && visor.visible) visor.material = new THREE.MeshStandardMaterial({ color: def.visor.color ?? 0x0b0d10, roughness: def.visor.rough ?? 0.1, metalness: def.visor.metal ?? 0.9, emissive: def.visor.glow ? team : 0x000000, emissiveIntensity: def.visor.glow || 0 });
  }
  let gear = null;
  if (def.gear) {
    const key = lookId + '|' + teamColor + '|' + body.geometry.uuid;
    if (!gearGeoCache.has(key)) { const G = new Gear(an, team); def.gear(G, an); gearGeoCache.set(key, G.build()); }
    const gmat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, side: THREE.DoubleSide }), common, true);
    gear = new THREE.SkinnedMesh(gearGeoCache.get(key), gmat);
    gear.name = 'lookGear'; gear.userData.lookGear = true;
    gear.castShadow = true; gear.receiveShadow = true; gear.frustumCulled = false;
    body.parent.add(gear);
    gear.position.copy(body.position); gear.quaternion.copy(body.quaternion); gear.scale.copy(body.scale);
    gear.bind(body.skeleton, body.bindMatrix);
  }
  return { body, visor, gear, analysis: an };
}
export function __analyze(root) { let body = null; root.traverse((o) => { if (o.isSkinnedMesh && !/visor/i.test(o.name) && !o.userData.lookGear) body = o; }); return analyze(body); }

// ================================================================================================================================
// LOOK DEFINITIONS (gear coordinates: metres, T pose, +y up, +z front, +x character's left)
// ================================================================================================================================
const PI = Math.PI;
const SKIN = 0xb88a68;
const HEAD = [0, 1.675, -0.03];                                   // skull centre of the replacement head
const FAB = { rough: 0.92, weave: 1 };                            // woven cloth
const NYL = { rough: 0.8, weave: 0.7 };                           // cordura / webbing
const POLY = { rough: 0.5 };                                      // moulded polymer
const palette = (base, regions = {}) => { const out = { all: base }; for (const [k, v] of Object.entries(regions)) for (const r of k.split(',')) out[r] = { ...base, ...v }; return out; };

// replacement head (the original sci-fi helmet is discarded in the shader): skull, ears, nose, neck, shoulder yoke
function head(G, { skin = SKIN, hood = null, mask = null, yoke = 0x333333, yokeO = FAB, maskO = FAB }) {
  const sk = hood ?? skin, so = hood != null ? { ...FAB } : { rough: 0.62 };
  G.add(sph(22, 16), { bone: 'Head', at: HEAD, scale: [0.077, 0.108, 0.094], color: sk, ...so });
  G.add(sph(12, 8), { bone: 'Head', at: [0, 1.655, 0.058], scale: [0.014, 0.024, 0.02], color: mask ?? sk, ...(mask != null ? maskO : so) });
  if (hood == null) G.add(sph(10, 8), { bone: 'Head', at: [0.077, 1.668, -0.035], scale: [0.011, 0.028, 0.017], color: skin, rough: 0.62, mirror: true });
  G.add(sph(18, 12), { bone: 'Head', at: [0, 1.6, -0.022], scale: [0.066, 0.062, 0.08], color: mask ?? sk, ...(mask != null ? maskO : so) });          // jaw
  if (mask != null) G.add(sph(20, 12), { bone: 'Head', at: [0, 1.612, -0.03], scale: [0.081, 0.078, 0.0985], color: mask, ...maskO });                 // gaiter / mask up over the nose
  G.add(cyl(0.052, 0.062, 0.16, 16), { bone: 'Neck', at: [0, 1.55, -0.05], rot: [0.12, 0, 0], color: mask ?? sk, ...(mask != null ? maskO : so) });
  // yoke: closes the hole left by the removed armour collar and gives a natural shoulder slope
  G.add(sph(22, 10, 0, PI * 2, 0, PI * 0.5), { bone: 'Spine2', at: [0, 1.468, -0.062], scale: [0.236, 0.108, 0.152], color: yoke, ...yokeO });
}
// wrap-around ballistic eyewear: one curved shield, brow bar, temples
function sunglasses(G, { y = 1.69, h = 0.034, lens = 0x08090a, frame = 0x0c0c0c, span = 1.02 }) {
  G.add(arc(1, 0.97, 1, -span, span * 2, 18), { bone: 'Head', at: [0, y, -0.027], scale: [0.0795, h, 0.0975], color: lens, rough: 0.05, metal: 0.92 });
  G.add(arc(1, 1, 1, -span - 0.04, span * 2 + 0.08, 18), { bone: 'Head', at: [0, y + h / 2, -0.027], scale: [0.0805, 0.007, 0.0985], color: frame, ...POLY });
  G.add(box(0.005, 0.008, 0.085), { bone: 'Head', at: [0.0765, y + 0.006, -0.012], rot: [0, 0.06, 0], color: frame, ...POLY, mirror: true });
}
function goggles(G, { y = 1.69, lens = 0x0a0b0c, frame = 0x141414, strap = 0x161616 }) {
  G.add(arc(1, 1, 1, -0.95, 1.9, 18), { bone: 'Head', at: [0, y, -0.026], scale: [0.081, 0.05, 0.097], color: lens, rough: 0.06, metal: 0.9 });
  G.add(arc(1, 1, 1, -1.15, 2.3, 18), { bone: 'Head', at: [0, y, -0.03], scale: [0.0805, 0.066, 0.098], color: frame, rough: 0.6 });
  G.add(arc(1, 1, 1, 1.1, PI * 2 - 2.2, 18), { bone: 'Head', at: [0, y + 0.004, -0.03], scale: [0.0795, 0.03, 0.097], color: strap, ...NYL });
}
// combat helmet. cut: 'high' (above the ears) or 'full'
function helmet(G, { color, o = { rough: 0.7 }, cut = 'full', band = false, shroud = true, rails = true, strap = 0x1b1b1b, velcro = null }) {
  const at = [0, 1.708, -0.036], rot = [-0.2, 0, 0], sc = [0.104, 0.1, 0.123];
  G.add(sph(28, 12, 0, PI * 2, 0, PI * 0.52), { bone: 'Head', at, rot, scale: sc, color, ...o });
  if (cut === 'full') G.add(sph(22, 5, PI * 0.78, PI * 1.44, PI * 0.5, PI * 0.2), { bone: 'Head', at, rot, scale: sc, color, ...o });
  else G.add(sph(22, 4, PI * 1.08, PI * 0.84, PI * 0.5, PI * 0.16), { bone: 'Head', at, rot, scale: sc, color, ...o });
  G.add(torus(1, 0.03, 6, 28), { bone: 'Head', at: [at[0], at[1] - 0.004, at[2]], rot: [rot[0] + PI / 2, 0, 0], scale: [sc[0] * 0.995, sc[2] * 0.995, 0.1], color: 0x141414, rough: 0.6 });   // rim trim
  if (band) G.add(sph(28, 2, 0, PI * 2, PI * 0.385, PI * 0.075), { bone: 'Head', at, rot, scale: sc.map((v) => v * 1.016), color: 'team', rough: 0.75, weave: 0.6, glow: 0.3 });
  if (shroud) {
    G.add(rbox(0.046, 0.04, 0.014, 0.004), { bone: 'Head', at: [0, 1.771, 0.064], rot: [-0.62, 0, 0], color: 0x161616, rough: 0.45, metal: 0.4 });
    G.add(box(0.02, 0.016, 0.012), { bone: 'Head', at: [0, 1.766, 0.073], rot: [-0.62, 0, 0], color: 0x0c0c0c, rough: 0.4, metal: 0.6 });
  }
  if (rails) G.add(rbox(0.01, 0.022, 0.1, 0.004), { bone: 'Head', at: [0.1035, 1.706, -0.03], rot: [-0.2, 0, 0.06], color: 0x151515, ...POLY, mirror: true });
  if (velcro != null) {
    G.add(rbox(0.006, 0.04, 0.07, 0.002), { bone: 'Head', at: [0.094, 1.75, -0.04], rot: [-0.2, 0, 0.5], color: velcro, ...NYL, mirror: true });
  }
  // chin strap
  G.add(torus(0.083, 0.005, 5, 18, PI), { bone: 'Head', at: [0, 1.672, -0.012], rot: [0.25, 0, PI], scale: [1, 1.22, 2], color: strap, ...NYL });
}
function nvg(G, { color = 0x161718 }) {
  // dual-tube night vision, flipped up and stowed against the helmet front
  const a = 1.0, c = [1.8, 0.118], L = 0.075;
  G.add(rbox(0.018, 0.045, 0.02, 0.004), { bone: 'Head', at: [0, 1.787, 0.08], rot: [-0.45, 0, 0], color, rough: 0.5, metal: 0.3 });
  G.add(rbox(0.07, 0.022, 0.03, 0.006), { bone: 'Head', at: [0, c[0] - 0.004, c[1] - 0.012], rot: [a, 0, 0], color, rough: 0.5, metal: 0.3 });
  G.add(cyl(0.0165, 0.019, L, 14), { bone: 'Head', at: [0.03, c[0], c[1]], rot: [a, 0, 0], color, rough: 0.45, metal: 0.3, mirror: true });
  G.add(cyl(0.0155, 0.0155, 0.004, 14), { bone: 'Head', at: [0.03, c[0] + (L / 2 + 0.001) * Math.cos(a), c[1] + (L / 2 + 0.001) * Math.sin(a)], rot: [a, 0, 0], color: 0x1d3a2c, rough: 0.05, metal: 1, mirror: true });
}
function headset(G, { color = 0x1a1b1c, mic = true }) {
  G.add(cyl(0.036, 0.04, 0.034, 16), { bone: 'Head', at: [0.092, 1.667, -0.036], rot: [0, 0, -PI / 2], scale: [1.18, 1, 0.85], order: 'ZYX', color, ...POLY, mirror: true });
  G.add(torus(0.094, 0.006, 5, 16, PI), { bone: 'Head', at: [0, 1.675, -0.05], rot: [-0.5, 0, 0], scale: [1, 1.0, 1.6], color, ...POLY });   // rear band
  if (mic) {
    G.add(cyl(0.003, 0.003, 0.1, 6), { bone: 'Head', at: [0.074, 1.628, 0.022], rot: [1.1, 0, 0.42], order: 'YXZ', color: 0x0c0c0c, ...POLY });
    G.add(sph(8, 6), { bone: 'Head', at: [0.05, 1.607, 0.066], scale: [0.011, 0.009, 0.009], color: 0x0a0a0a, rough: 0.95 });
  }
}
// plate carrier / chest rig
function carrier(G, { color, o = NYL, pouch = color, po = o, mags = 3, mag = 0x18191a, plates = true, molle = true, admin = true, back = 'plate', camo = 0 }) {
  const c = { color, ...o, camo };
  if (plates) {
    G.add(rbox(0.3, 0.33, 0.07, 0.03, 3), { bone: 'Spine2', at: [0, 1.385, 0.118], rot: [-0.05, 0, 0], ...c });
    G.add(rbox(0.3, 0.36, 0.07, 0.03, 3), { bone: 'Spine2', at: [0, 1.39, -0.212], rot: [0.03, 0, 0], ...c });
  } else {
    G.add(rbox(0.33, 0.17, 0.05, 0.02, 2), { bone: 'Spine1', at: [0, 1.285, 0.128], rot: [-0.03, 0, 0], ...c });
    G.add(rbox(0.26, 0.2, 0.03, 0.012, 2), { bone: 'Spine2', at: [0, 1.4, -0.224], ...c });
  }
  // shoulder straps
  G.add(torus(0.172, 0.011, 6, 18, PI), { bone: 'Spine2', at: [0.11, 1.412, -0.047], rot: [0, PI / 2, 0], scale: [1, 1, plates ? 2.8 : 2.0], ...c, mirror: true });
  // cummerbund
  G.add(cyl(1, 1, 1, 26), { bone: 'Spine1', at: [0, plates ? 1.245 : 1.27, -0.04], scale: [0.218, plates ? 0.13 : 0.07, 0.176], ...c });
  if (molle && plates) for (let i = 0; i < 3; i++) G.add(box(0.26, 0.012, 0.004), { bone: 'Spine2', at: [0, 1.5 - i * 0.032, 0.151 + i * 0.0016], rot: [-0.05, 0, 0], color, ...o, camo, rough: 0.7 });
  // magazine pouches with magazines
  const py = plates ? 1.268 : 1.28, pz = plates ? 0.172 : 0.168;
  for (let i = 0; i < mags; i++) {
    const x = (i - (mags - 1) / 2) * 0.082;
    G.add(rbox(0.074, 0.125, 0.04, 0.008), { bone: 'Spine1', at: [x, py, pz], color: pouch, ...po, camo });
    G.add(rbox(0.058, 0.05, 0.022, 0.004), { bone: 'Spine1', at: [x, py + 0.075, pz - 0.002], rot: [0.05, 0, 0], color: mag, ...POLY });
    G.add(box(0.012, 0.07, 0.003), { bone: 'Spine1', at: [x, py + 0.05, pz + 0.021], color: 0x111111, rough: 0.7 });                 // bungee retainer
  }
  if (admin && plates) {
    G.add(rbox(0.17, 0.085, 0.028, 0.008), { bone: 'Spine2', at: [0, 1.452, 0.162], rot: [-0.05, 0, 0], color: pouch, ...po, camo });
    G.add(box(0.075, 0.045, 0.004), { bone: 'Spine2', at: [0.04, 1.455, 0.178], rot: [-0.05, 0, 0], color: 'team', rough: 0.8, weave: 0.8, glow: 0.3 });
  }
  // radio + antenna (left back), utility pouch (right)
  G.add(rbox(0.065, 0.15, 0.045, 0.01), { bone: 'Spine2', at: [0.175, 1.34, -0.13], rot: [0, -0.5, 0], color: pouch, ...po, camo });
  G.add(rbox(0.05, 0.05, 0.03, 0.006), { bone: 'Spine2', at: [0.175, 1.43, -0.13], rot: [0, -0.5, 0], color: 0x161616, ...POLY });
  G.add(cyl(0.0035, 0.005, 0.26, 6), { bone: 'Spine2', at: [0.19, 1.58, -0.145], rot: [-0.08, 0, -0.05], color: 0x0e0e0e, ...POLY });
  G.add(rbox(0.06, 0.11, 0.1, 0.014), { bone: 'Spine1', at: [-0.222, 1.25, -0.03], color: pouch, ...po, camo });
  G.add(rbox(0.05, 0.1, 0.09, 0.014), { bone: 'Spine1', at: [0.222, 1.25, 0.0], color: pouch, ...po, camo });
  if (back === 'pack') {
    G.add(rbox(0.25, 0.34, 0.11, 0.035, 3), { bone: 'Spine2', at: [0, 1.38, -0.29], color: pouch, ...po, camo });
    G.add(rbox(0.19, 0.13, 0.05, 0.02), { bone: 'Spine2', at: [0, 1.31, -0.355], color: pouch, ...po, camo });
    G.add(box(0.2, 0.012, 0.004), { bone: 'Spine2', at: [0, 1.46, -0.346], color: 0x151515, rough: 0.7 });
  } else if (back === 'hydration') {
    G.add(rbox(0.2, 0.27, 0.045, 0.02), { bone: 'Spine2', at: [0, 1.39, -0.262], color: pouch, ...po, camo });
  }
}
function belt(G, { color, o = NYL, holster = 0x1a1a1a, camo = 0 }) {
  G.add(cyl(1, 1, 1, 26), { bone: 'Hips', at: [0, 1.085, -0.012], scale: [0.236, 0.05, 0.184], color, ...o, camo });
  G.add(rbox(0.05, 0.035, 0.012, 0.004), { bone: 'Hips', at: [0, 1.085, 0.172], color: 0x101010, rough: 0.4, metal: 0.7 });                     // buckle
  // drop-leg holster with pistol (right thigh), dump pouch (left hip), med pouch (rear)
  G.add(rbox(0.035, 0.17, 0.085, 0.01), { bone: 'RightUpLeg', at: [-0.225, 0.9, 0.0], rot: [0, 0, -0.04], color: holster, ...POLY });
  G.add(rbox(0.03, 0.075, 0.045, 0.008), { bone: 'RightUpLeg', at: [-0.227, 1.01, -0.03], rot: [0.3, 0, 0], color: 0x0d0d0d, rough: 0.55 });   // pistol grip
  G.add(cyl(1, 1, 1, 18), { bone: 'RightUpLeg', at: [-0.105, 0.87, -0.005], scale: [0.115, 0.03, 0.105], color, ...o, camo });                    // thigh strap
  G.add(rbox(0.06, 0.13, 0.13, 0.02), { bone: 'Hips', at: [0.245, 1.02, -0.05], color, ...o, camo });
  G.add(rbox(0.13, 0.09, 0.05, 0.015), { bone: 'Hips', at: [0, 1.07, -0.205], color, ...o, camo });
}
// band round the upper arm (T pose: arm runs along x). Fitted to the mesh.
function armBand(G, an, { x = 0.385, w = 0.05, color = 'team', glow = 0.3, side = 'Left', o = { rough: 0.75, weave: 0.8 }, grow = 1 }) {
  const sgn = side === 'Left' ? 1 : -1;
  G.add(cyl(1, 1, 1, 20, true), { bone: side + 'Arm', at: [x * sgn, 1.468, -0.07], rot: [0, 0, PI / 2], scale: [0.072 * grow, w, 0.079 * grow], color, ...o, glow, wrap: true });
}
// flat patch on the outside of the upper arm (outside = +y in the T pose)
function armPatch(G, an, { x = 0.27, size = [0.06, 0.06], color = 'team', glow = 0.3, side = 'Left', o = { rough: 0.8, weave: 0.8 }, border = 0x111111 }) {
  const b = an.measure(['arm'], -9, 9, x - 0.03, x + 0.03), sgn = side === 'Left' ? 1 : -1, cz = (b.minZ + b.maxZ) / 2;
  G.add(rbox(size[0] + 0.01, 0.006, size[1] + 0.01, 0.002), { bone: side + 'Arm', at: [x * sgn, b.maxY + 0.001, cz], color: border, ...NYL });
  G.add(rbox(size[0], 0.006, size[1], 0.002), { bone: side + 'Arm', at: [x * sgn, b.maxY + 0.003, cz], color, ...o, glow });
}
function kneePads(G, { color, o = POLY }) {
  G.add(sph(14, 8), { bone: 'LeftLeg', at: [0.097, 0.545, 0.075], scale: [0.062, 0.078, 0.045], color, ...o, mirror: true });
  G.add(cyl(1, 1, 1, 14), { bone: 'LeftLeg', at: [0.097, 0.5, -0.012], scale: [0.075, 0.025, 0.085], color: 0x141414, ...NYL, mirror: true });
}

// 1 ---- Modern Infantry -------------------------------------------------------------------------------------------------------
{
  const fab = P(0x6b6a4e, { camo: 1, keep: 0.3, weave: 1, rough: 0.95 });
  const base = { plate: fab, cloth: fab, metal: P(0x3a3b32, { rough: 0.6, keep: 0.4 }), stripe: fab, dark: P(0x4a4a38, { camo: 0.8, keep: 0, weave: 1, rough: 0.95 }) };
  const glove = P(0x2a2b27, { rough: 0.8, keep: 0.5, weave: 0.6 }), boot = P(0x6a5a44, { rough: 0.85, keep: 0.6 });
  __registerLook('infantry', {
    camo: 'woodland', camoScale: 2.3, hide: 1, collarCut: 1.5, normalScale: 0.55,
    palette: palette(base, { hand: { plate: P(0x5d5a44, { rough: 0.8, keep: 0.5 }), cloth: glove, dark: glove, metal: glove }, foot: { plate: boot, cloth: boot, dark: P(0x2a241c, { keep: 0, rough: 0.9 }), metal: boot, stripe: boot } }),
    gear(G, an) {
      head(G, { mask: 0x5a5c44, yoke: 0x5c5b43, yokeO: { ...FAB, camo: 1 }, maskO: { ...FAB, camo: 0.85 } });
      sunglasses(G, { lens: 0x1a1508, frame: 0x101010 });
      helmet(G, { color: 0x67664b, o: { ...FAB, camo: 1 }, cut: 'full', band: true, velcro: 0x4c4d38 });
      carrier(G, { color: 0x545741, pouch: 0x5b5a42, mags: 3, back: 'hydration' });
      belt(G, { color: 0x4c4f3b });
      kneePads(G, { color: 0x3f4233 });
      armBand(G, an, { side: 'Left' }); armBand(G, an, { side: 'Right' });
    },
  });
}
// 2 ---- Spec Ops --------------------------------------------------------------------------------------------------------------
{
  const fab = P(0x303236, { camo: 0.85, keep: 0.35, weave: 1, rough: 0.88 });
  const base = { plate: fab, cloth: fab, metal: P(0x1a1b1d, { rough: 0.45, metal: 0.5, keep: 0.4 }), stripe: fab, dark: P(0x1d1e21, { keep: 0, weave: 1, rough: 0.9 }) };
  const hard = P(0x1b1c1e, { rough: 0.55, keep: 0.5 });
  __registerLook('specops', {
    camo: 'night', camoScale: 1.6, hide: 1, collarCut: 1.5, normalScale: 0.55,
    palette: palette(base, { 'hand,foot': { plate: hard, cloth: hard, dark: P(0x0c0c0d, { keep: 0, rough: 0.85 }), stripe: hard } }),
    gear(G, an) {
      head(G, { hood: 0x1b1c1e, mask: 0x1b1c1e, yoke: 0x26282b });
      goggles(G, { y: 1.688 });
      helmet(G, { color: 0x26282a, o: { rough: 0.55 }, cut: 'high', velcro: 0x34363a });
      G.add(box(0.012, 0.004, 0.085), { bone: 'Head', at: [0, 1.8095, -0.052], rot: [-0.2, 0, 0], color: 'team', rough: 0.7, glow: 0.35 });      // helmet strip
      G.add(box(0.003, 0.03, 0.05), { bone: 'Head', at: [0.0975, 1.752, -0.04], rot: [-0.2, 0, 0.5], color: 'team', rough: 0.7, glow: 0.35, mirror: true });
      nvg(G, {});
      headset(G, {});
      carrier(G, { color: 0x292b2e, pouch: 0x202124, mags: 3, mag: 0x101011, back: 'plate', admin: true });
      belt(G, { color: 0x222326 });
      kneePads(G, { color: 0x101112 });
      armPatch(G, an, { side: 'Left', size: [0.07, 0.055] }); armPatch(G, an, { side: 'Right', size: [0.07, 0.055] });
    },
  });
}
// 3 ---- Varsity Tactical ------------------------------------------------------------------------------------------------------
{
  const pants = P(0x25282d, { keep: 0.35, weave: 1, rough: 0.9 }), dark = P(0x17181a, { keep: 0, weave: 0.8, rough: 0.9 });
  const wool = P('team', { keep: 0.45, weave: 1, rough: 0.95 }), leather = P(0x141414, { keep: 0.5, rough: 0.42 });
  const base = { plate: pants, cloth: pants, metal: P(0x2a2c30, { rough: 0.5, metal: 0.5 }), stripe: P(0xe8e4d8, { rough: 0.8 }), dark };
  const boot = P(0x1b1b1c, { rough: 0.6, keep: 0.6 });
  __registerLook('varsity', {
    camo: 'plain', hide: 1, collarCut: 1.5, normalScale: 0.6,
    palette: palette(base, {
      'chest,belly': { plate: wool, cloth: wool, stripe: P(0xe8e4d8, { rough: 0.8 }), dark: P('teamDark', { keep: 0, weave: 1, rough: 0.95 }) },
      'arm,fore': { plate: leather, cloth: leather, dark: P(0x0d0d0d, { keep: 0, rough: 0.5 }), stripe: leather },
      hand: { plate: P(0x1c1c1d, { rough: 0.7 }), cloth: dark, stripe: dark }, hips: { stripe: dark }, foot: { plate: boot, cloth: boot, stripe: boot, dark: P(0xd8d4c8, { keep: 0, rough: 0.8 }) },
    }),
    gear(G, an) {
      const cream = 0xe6e0d0, knit = { rough: 0.95, weave: 1 };
      head(G, { mask: 0x18191b, yoke: 'team' });
      sunglasses(G, { lens: 0x0a0a0c });
      // backwards cap: crown, button, bill at the back, strap arch on the forehead
      G.add(sph(24, 10, 0, PI * 2, 0, PI * 0.5), { bone: 'Head', at: [0, 1.722, -0.032], rot: [-0.1, 0, 0], scale: [0.086, 0.074, 0.103], color: 'team', ...FAB, glow: 0.12 });
      G.add(cyl(1, 1, 1, 24, true), { bone: 'Head', at: [0, 1.716, -0.032], rot: [-0.1, 0, 0], scale: [0.0865, 0.022, 0.1035], color: 'team', ...FAB, glow: 0.12 });
      G.add(sph(8, 6), { bone: 'Head', at: [0, 1.797, -0.04], scale: [0.009, 0.005, 0.009], color: 0x141414, ...FAB });
      G.add(cyl(1, 1, 1, 20), { bone: 'Head', at: [0, 1.709, -0.165], rot: [0.3, 0, 0], scale: [0.078, 0.005, 0.07], color: 0x141414, ...FAB });
      G.add(box(0.05, 0.016, 0.004), { bone: 'Head', at: [0, 1.722, 0.07], rot: [-0.1, 0, 0], color: 0x141414, ...POLY });
      // knit collar, hem and cuffs with stripes
      const ring = (bone, at, sc, rot = [0, 0, 0], wrap = false) => {
        G.add(cyl(1, 1, 1, 24), { bone, at, rot, scale: sc, color: 0x151515, ...knit, wrap });
        for (const d of [-0.22, 0.22]) G.add(cyl(1, 1, 1, 24, true), { bone, at: [at[0] + (rot[2] ? d * sc[1] : 0), at[1] + (rot[2] ? 0 : d * sc[1]), at[2]], rot, scale: [sc[0] * 1.012, sc[1] * 0.16, sc[2] * 1.012], color: cream, ...knit, wrap });
      };
      ring('Spine2', [0, 1.535, -0.056], [0.085, 0.05, 0.085], [0.15, 0, 0]);
      { const b = an.measure(['belly', 'hips'], 1.12, 1.19, -0.3, 0.3); ring('Spine', [0, 1.155, (b.minZ + b.maxZ) / 2], [(b.maxX - b.minX) / 2 + 0.006, 0.06, (b.maxZ - b.minZ) / 2 + 0.006]); }
      for (const sd of [1, -1]) {
        const b = an.measure(['fore'], -9, 9, 0.58, 0.64);
        ring(sd > 0 ? 'LeftForeArm' : 'RightForeArm', [0.615 * sd, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2], [(b.maxY - b.minY) / 2 * 1.08 + 0.004, 0.06, (b.maxZ - b.minZ) / 2 * 1.08 + 0.004], [0, 0, PI / 2], true);
      }
      // chenille letter on the left chest: the campus's team letters (Hinsdale: H Red Devils / L Lions)
      const isBlue = G.team.b > G.team.r, lx = 0.095, ly = 1.455, lz = 0.134;
      const stroke = (dx, dy, w, h) => {
        G.add(rbox(w + 0.014, h + 0.014, 0.008, 0.003), { bone: 'Spine2', at: [lx + dx, ly + dy, lz], rot: [-0.12, 0.25, 0], color: 0x111111, ...knit });
        G.add(rbox(w, h, 0.012, 0.004), { bone: 'Spine2', at: [lx + dx, ly + dy, lz + 0.0015], rot: [-0.12, 0.25, 0], color: cream, ...knit });
      };
      const letter = (activeCampus().letters || { red: 'H', blue: 'L' })[isBlue ? 'blue' : 'red'];
      for (const st of LETTER_STROKES[letter] || LETTER_STROKES.H) stroke(...st);
      // snap placket
      for (let i = 0; i < 4; i++) G.add(sph(8, 6), { bone: i < 2 ? 'Spine2' : 'Spine1', at: [0, 1.5 - i * 0.055, 0.128 + i * 0.004], scale: [0.008, 0.008, 0.004], color: 0xcfcfcf, rough: 0.3, metal: 0.9 });
      // light chest rig, slung low
      // light chest rig, slung low: three pouches on a narrow panel with a thin harness
      G.add(rbox(0.27, 0.115, 0.03, 0.012), { bone: 'Spine1', at: [0, 1.262, 0.134], color: 0x1b1c1e, ...NYL });
      for (let i = 0; i < 3; i++) {
        G.add(rbox(0.074, 0.115, 0.036, 0.008), { bone: 'Spine1', at: [(i - 1) * 0.084, 1.266, 0.162], color: 0x222326, ...NYL });
        G.add(rbox(0.058, 0.045, 0.02, 0.004), { bone: 'Spine1', at: [(i - 1) * 0.084, 1.338, 0.16], color: 0x0f0f10, ...POLY });
      }
      G.add(torus(0.172, 0.008, 5, 18, PI), { bone: 'Spine2', at: [0.105, 1.4, -0.047], rot: [0, PI / 2, 0], scale: [1, 1.08, 2.0], color: 0x1b1c1e, ...NYL, mirror: true });
      G.add(cyl(1, 1, 1, 24, true), { bone: 'Spine1', at: [0, 1.262, -0.04], scale: [0.213, 0.035, 0.176], color: 0x1b1c1e, ...NYL });
      // sleeve stripes + big letter on the back
      for (const sd of ['Left', 'Right']) { armBand(G, an, { side: sd, x: 0.365, w: 0.016, color: cream, glow: 0, grow: 1.01, o: knit }); armBand(G, an, { side: sd, x: 0.392, w: 0.016, color: cream, glow: 0, grow: 1.0, o: knit }); }
      const bstroke = (dx, dy, w, h) => {
        G.add(rbox(w + 0.02, h + 0.02, 0.008, 0.003), { bone: 'Spine2', at: [dx, 1.4 + dy, -0.236], color: 0x111111, ...knit });
        G.add(rbox(w, h, 0.012, 0.004), { bone: 'Spine2', at: [dx, 1.4 + dy, -0.238], color: cream, ...knit });
      };
      if (isBlue) { bstroke(0.05, 0, 0.045, 0.2); bstroke(-0.01, -0.078, 0.165, 0.045); } else { bstroke(-0.06, 0, 0.045, 0.2); bstroke(0.06, 0, 0.045, 0.2); bstroke(0, 0, 0.12, 0.045); }
      belt(G, { color: 0x151617 });
      kneePads(G, { color: 0x101112 });
    },
  });
}
// 4 ---- Desert Operator -------------------------------------------------------------------------------------------------------
{
  const fab = P(0xa08a66, { camo: 1, keep: 0.3, weave: 1, rough: 0.95 });
  const base = { plate: fab, cloth: fab, metal: P(0x6a5a44, { rough: 0.6, keep: 0.4 }), stripe: fab, dark: P(0x7e6c50, { camo: 0.8, keep: 0, weave: 1, rough: 0.95 }) };
  const glove = P(0x8a7656, { rough: 0.8, keep: 0.5, weave: 0.5 }), boot = P(0x9a8262, { rough: 0.9, keep: 0.6 });
  __registerLook('desert', {
    camo: 'desert', camoScale: 1.8, hide: 1, collarCut: 1.5, normalScale: 0.55,
    palette: palette(base, { hand: { plate: glove, cloth: glove, dark: P(0x5a4c38, { keep: 0, rough: 0.85 }), metal: glove }, foot: { plate: boot, cloth: boot, dark: P(0x54452f, { keep: 0, rough: 0.9 }), metal: boot, stripe: boot } }),
    gear(G, an) {
      const sh = 0x9c8f6c, shO = { ...FAB, camo: 0.25 };
      head(G, { mask: sh, yoke: sh, yokeO: shO, maskO: shO });
      sunglasses(G, { lens: 0x120c06, frame: 0x1a1a1a });
      // shemagh: stacked folds round the neck, tail on the chest
      G.add(torus(0.088, 0.045, 8, 22), { bone: 'Spine2', bone2: 'Head', blend: [1.42, 1.9], at: [0, 1.545, -0.04], rot: [PI / 2 + 0.12, 0, 0], scale: [1.12, 1.1, 0.95], color: sh, ...shO });
      G.add(torus(0.105, 0.04, 8, 22), { bone: 'Spine2', at: [0, 1.505, -0.045], rot: [PI / 2 - 0.1, 0, 0.3], scale: [1.2, 1.12, 0.85], color: 0x8f8260, ...shO });
      G.add(cyl(0.125, 0.012, 0.19, 14), { bone: 'Spine2', at: [0.005, 1.435, 0.098], rot: [0.2, 0, 0.06], scale: [1, 1, 0.3], color: sh, ...shO });
      // boonie hat
      const hatO = { ...FAB, camo: 1 }, hc = 0x9a8662;
      G.add(cyl(0.084, 0.09, 0.075, 22), { bone: 'Head', at: [0, 1.764, -0.032], rot: [-0.08, 0, 0], scale: [1, 1, 1.15], color: hc, ...hatO });
      G.add(lathe([[0.086, 0.004], [0.12, -0.002], [0.15, -0.014], [0.166, -0.03]], 26), { bone: 'Head', at: [0, 1.73, -0.032], rot: [-0.08, 0, 0], scale: [1, 1, 1.13], color: hc, ...hatO });
      G.add(cyl(0.0915, 0.0915, 0.02, 22, true), { bone: 'Head', at: [0, 1.75, -0.032], rot: [-0.08, 0, 0], scale: [1, 1, 1.15], color: 0x6f5f44, ...NYL });
      G.add(box(0.05, 0.016, 0.004), { bone: 'Head', at: [0, 1.754, 0.073], rot: [-0.08, 0, 0], color: 'team', rough: 0.8, weave: 0.8, glow: 0.3 });
      carrier(G, { color: 0x86704c, pouch: 0x8c7650, mags: 4, mag: 0x2a2620, plates: false, back: 'pack' });
      belt(G, { color: 0x7c6846, holster: 0x4a3d2a });
      kneePads(G, { color: 0x6e5c40 });
      armBand(G, an, { side: 'Left' }); armBand(G, an, { side: 'Right' });
    },
  });
}
// 5 ---- Heavy Armor -----------------------------------------------------------------------------------------------------------
{
  const plate = P(0x565b4e, { keep: 1, rough: 0.55, metal: 0.25 });
  const base = { plate, cloth: P(0x2b2e28, { keep: 0.6, weave: 1, rough: 0.95 }), metal: P(0x33373a, { rough: 0.4, metal: 0.8, keep: 0.6 }), stripe: P('team', { glow: 0.3, rough: 0.6 }), dark: P(0x141516, { keep: 0, rough: 0.8, weave: 0.5 }) };
  __registerLook('heavy', {
    camo: 'plain', hide: 1, normalScale: 1,
    palette: palette(base, {}),
    gear(G, an) {
      const pc = 0x565b4e, pO = { rough: 0.5, metal: 0.25 }, dk = 0x1a1c1d;
      // closed helmet: shell, slit visor with brow and frame, mandible, respirator cans, ear pods, neck seal, crest stripe
      const at = [0, 1.672, -0.03];
      G.add(sph(28, 18, 0, PI * 2, 0, PI * 0.86), { bone: 'Head', at, scale: [0.116, 0.13, 0.136], color: pc, ...pO });
      G.add(sph(18, 4, PI * 0.5 - 1.0, 2.0, PI * 0.425, PI * 0.115), { bone: 'Head', at, scale: [0.1185, 0.132, 0.1385], color: 0x0a0c0d, rough: 0.05, metal: 1 });
      G.add(sph(18, 3, PI * 0.5 - 1.12, 2.24, PI * 0.36, PI * 0.07), { bone: 'Head', at, scale: [0.1215, 0.135, 0.1425], color: 0x454a40, ...pO });          // brow
      G.add(sph(18, 6, PI * 0.5 - 1.12, 2.24, PI * 0.535, PI * 0.27), { bone: 'Head', at, scale: [0.1215, 0.135, 0.1445], color: 0x454a40, ...pO });         // mandible
      G.add(rbox(0.05, 0.05, 0.03, 0.01), { bone: 'Head', at: [0, 1.6, 0.108], rot: [0.25, 0, 0], color: dk, rough: 0.5, metal: 0.5 });
      G.add(cyl(0.027, 0.031, 0.04, 12), { bone: 'Head', at: [0.066, 1.59, 0.08], rot: [PI / 2 - 0.25, 0, -0.75], order: 'ZYX', color: dk, rough: 0.5, metal: 0.5, mirror: true });
      G.add(cyl(0.04, 0.046, 0.03, 14), { bone: 'Head', at: [0.112, 1.668, -0.04], rot: [0, 0, -PI / 2], color: 0x454a40, ...pO, mirror: true });
      G.add(torus(1, 0.012, 4, 22, PI * 0.7), { bone: 'Head', at, rot: [0, PI / 2, 0], scale: [0.1372, 0.1312, 2.1], color: 'team', rough: 0.6, glow: 0.3 });
      G.add(cyl(0.095, 0.118, 0.07, 22), { bone: 'Neck', at: [0, 1.545, -0.045], color: dk, ...NYL });
      // pauldrons with team stripes
      G.add(sph(18, 9, 0, PI * 2, 0, PI * 0.55), { bone: 'LeftArm', at: [0.25, 1.5, -0.068], rot: [0, 0, -0.35], scale: [0.125, 0.085, 0.125], color: pc, ...pO, mirror: true });
      G.add(sph(18, 2, 0, PI * 2, PI * 0.3, PI * 0.1), { bone: 'LeftArm', at: [0.25, 1.5, -0.068], rot: [0, 0, -0.35], scale: [0.1275, 0.087, 0.1275], color: 'team', rough: 0.6, glow: 0.3, mirror: true });
      // breastplate, abdomen plate, back unit
      G.add(rbox(0.33, 0.24, 0.08, 0.035, 3), { bone: 'Spine2', at: [0, 1.42, 0.115], rot: [-0.08, 0, 0], color: pc, ...pO });
      G.add(rbox(0.07, 0.04, 0.012, 0.004), { bone: 'Spine2', at: [0.085, 1.475, 0.158], rot: [-0.08, 0, 0], color: 'team', rough: 0.6, glow: 0.3 });
      G.add(rbox(0.24, 0.13, 0.06, 0.025, 2), { bone: 'Spine1', at: [0, 1.25, 0.125], color: 0x4a4f44, ...pO });
      G.add(rbox(0.3, 0.38, 0.11, 0.04, 3), { bone: 'Spine2', at: [0, 1.39, -0.25], color: 0x4a4f44, ...pO });
      G.add(cyl(0.035, 0.035, 0.26, 12), { bone: 'Spine2', at: [0.08, 1.4, -0.315], color: dk, rough: 0.4, metal: 0.7, mirror: true });
      // thigh, shin and forearm plates
      G.add(rbox(0.115, 0.24, 0.035, 0.016, 2), { bone: 'LeftUpLeg', at: [0.108, 0.8, 0.118], rot: [0.06, 0.12, 0], color: pc, ...pO, mirror: true });
    },
  });
}
__registerLook('debug', { palette: { all: { plate: P(0xd9b38c), cloth: P(0x5a6a3a), metal: P(0x7a8a96), stripe: P(0xb01010), dark: P(0x101010, { keep: 0 }) } } });
