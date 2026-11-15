// Near-camera 3D grass ('high' only): a fixed pool of blade tufts that wraps around the camera, masked by the
// ground surface mask (only on grass) and tinted by the ground macro texture so it melts into the lawn.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { SAT } from './ground.js';

export function createGrass(ctx) {
  const { T, scene } = ctx;
  const D = 30, TUFTS = 90000, BLADES = 4;
  const rnd = mulberry32(77);
  const nV = TUFTS * BLADES * 3;
  const pos = new Float32Array(nV * 3), root = new Float32Array(nV * 2), misc = new Float32Array(nV * 2);
  let v = 0;
  for (let i = 0; i < TUFTS; i++) {
    const rx = rnd() * D, rz = rnd() * D, r0 = rnd();
    for (let b = 0; b < BLADES; b++) {
      const a = rnd() * Math.PI * 2, w = 0.007 + rnd() * 0.008, h = 0.05 + rnd() * 0.07, lean = 0.015 + rnd() * 0.05;
      const ox = (rnd() - 0.5) * 0.12, oz = (rnd() - 0.5) * 0.12; const cx = Math.cos(a), sz = Math.sin(a);
      // a single tapered triangle per blade: two base corners + tip (cheap, reads as a blade)
      const P = [[ox - cx * w, 0, oz - sz * w], [ox + cx * w, 0, oz + sz * w], [ox - sz * lean, h, oz + cx * lean]];
      for (let k = 0; k < 3; k++) { pos[v * 3] = P[k][0]; pos[v * 3 + 1] = P[k][1]; pos[v * 3 + 2] = P[k][2]; root[v * 2] = rx; root[v * 2 + 1] = rz; misc[v * 2] = k === 2 ? 1 : 0; misc[v * 2 + 1] = r0; v++; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRoot', new THREE.BufferAttribute(root, 2));
  geo.setAttribute('aMisc', new THREE.BufferAttribute(misc, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  // synthetic surfaces painted over the lawn (turf fields, the track oval): rounded rectangles where nothing grows
  const NG = 8, ngRect = [], ngRad = [];
  for (let i = 0; i < NG; i++) { const n = (ctx.noGrass || [])[i]; ngRect.push(n ? new THREE.Vector4(n.cx, n.cz, n.hx, n.hz) : new THREE.Vector4(0, 0, -1, -1)); ngRad.push(n ? n.r || 0 : 0); }
  const uniforms = {
    uNoGrass: { value: ngRect }, uNoGrassR: { value: ngRad },
    uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uD: { value: D },
    uMask: { value: T.groundMask }, uMacro: { value: T.groundMacro },
    uSatRect: { value: new THREE.Vector4(SAT.minX, SAT.minZ, 1 / (SAT.maxX - SAT.minX), 1 / (SAT.maxZ - SAT.minZ)) },
  };
  const terrain = ctx.terrain || null;   // terrain campuses: tufts stand on the height lattice (texelFetch + bilinear)
  if (terrain) Object.assign(uniforms, { uTerr: { value: terrain.texture() }, uTerrO: { value: new THREE.Vector2(terrain.x0, terrain.z0) }, uTerrInv: { value: 1 / terrain.cell }, uTerrN: { value: new THREE.Vector2(terrain.nx, terrain.nz) } });
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  if (terrain) { mat.defines = { GRASS_TERRAIN: '' }; mat.customProgramCacheKey = () => 'grass-terrain'; }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aRoot; attribute vec2 aMisc;
uniform vec3 uCam; uniform float uTime; uniform float uD; uniform sampler2D uMask; uniform sampler2D uMacro; uniform vec4 uSatRect;
uniform vec4 uNoGrass[${NG}]; uniform float uNoGrassR[${NG}];
varying vec3 vGrassCol;
#ifdef GRASS_TERRAIN
uniform highp sampler2D uTerr; uniform vec2 uTerrO; uniform float uTerrInv; uniform vec2 uTerrN;
float terrainH(vec2 p) { vec2 g = clamp((p - uTerrO) * uTerrInv, vec2(0.0), uTerrN - 1.001); ivec2 i = ivec2(floor(g)); vec2 f = g - vec2(i);
  float a = texelFetch(uTerr, i, 0).r, b = texelFetch(uTerr, i + ivec2(1, 0), 0).r, c = texelFetch(uTerr, i + ivec2(0, 1), 0).r, d = texelFetch(uTerr, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
#endif`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
  vec2 rw = mod(aRoot - uCam.xz + uD * 0.5, uD) - uD * 0.5 + uCam.xz;
  vec2 guv = (rw - uSatRect.xy) * uSatRect.zw; guv.y = 1.0 - guv.y;
  vec4 gm = texture2D(uMask, guv);
  float wG = clamp(1.0 - gm.r - gm.g - gm.b - (1.0 - gm.a), 0.0, 1.0);
  float dist = length(rw - uCam.xz);
  float grow = smoothstep(0.72, 0.95, wG) * (1.0 - smoothstep(uD * 0.12, uD * 0.47, dist));
  for (int i = 0; i < ${NG}; i++) { vec4 ng = uNoGrass[i]; if (ng.z < 0.0) continue; float rr = min(uNoGrassR[i], min(ng.z, ng.w));
    vec2 q = abs(rw - ng.xy) - (ng.zw - rr); float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr; grow *= smoothstep(0.0, 0.5, sd); }
  // patchy height variation
  float patchy = 0.75 + 0.5 * fract(sin(dot(floor(rw * 0.7), vec2(12.9898, 78.233))) * 43758.5453);
  vec3 transformed = vec3(position.x, position.y * grow * patchy, position.z);
  float tip = aMisc.x;
  transformed.xz += tip * grow * 0.02 * vec2(sin(uTime * 1.7 + rw.x * 0.9 + aMisc.y * 6.0), cos(uTime * 1.3 + rw.y * 0.8));
  transformed.x += rw.x; transformed.z += rw.y;
#ifdef GRASS_TERRAIN
  transformed.y += terrainH(rw);
#endif
  vec3 mc = texture2D(uMacro, guv).rgb;
  vGrassCol = mc * mix(0.8, 1.12, tip) * (0.9 + 0.2 * aMisc.y);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb = vGrassCol;')
      .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); vec3 nonPerturbedNormal = normal;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'grass-blades'; mesh.matrixAutoUpdate = false; mesh.visible = false;
  scene.add(mesh);
  return {
    mesh,
    update(camera, dt, groundY) { uniforms.uCam.value.copy(camera.position); uniforms.uTime.value += dt || 0; mesh.visible = camera.position.y - (terrain && groundY ? groundY(camera.position.x, camera.position.z) : 0) < 12; },
  };
}
