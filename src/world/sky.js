// Sky / lighting: HDRI environment + background, sun light with a camera-following shadow frustum, and a
// one-off top-down "baked" shadow mask of the whole map used by ground materials beyond the dynamic range.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Sun direction derived from the shadows in the satellite image (sun in the SSE), elevation from the HDRI.
const SUN_AZ = Math.atan2(0.95, 0.32);          // angle of the sun's horizontal direction, atan2(z, x)
const SUN_EL = THREE.MathUtils.degToRad(48);
const HDR_SUN_AZ = (0.5949 - 0.5) * Math.PI * 2; // where the sun sits in the HDRI (atan2(z, x))

export const sunDirection = new THREE.Vector3(Math.cos(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), Math.sin(SUN_AZ) * Math.cos(SUN_EL)).normalize();
export const HAZE_COLOR = new THREE.Color(0.62, 0.72, 0.86);

export const SHADOW_PRESETS = {
  low: { dynamic: false, mapSize: 0, range: 0, bakeMap: 2048, bakeRT: 2048 },
  medium: { dynamic: true, mapSize: 2048, range: 48, bakeMap: 4096, bakeRT: 2048 },
  high: { dynamic: true, mapSize: 4096, range: 62, bakeMap: 4096, bakeRT: 4096 },
};

export async function createSky({ renderer, scene, quality }) {
  const preset = SHADOW_PRESETS[quality] || SHADOW_PRESETS.high;
  // ---- environment
  let envTex = null;
  try {
    const hdr = await new HDRLoader().loadAsync('./assets/world/sky_2k.hdr');
    // clamp the sun disc: the directional light supplies the sun, the HDRI only the sky (avoids fireflies
    // and double-counted direct light in the PMREM)
    const d = hdr.image.data; const maxV = 24.0;
    const toHalf = THREE.DataUtils.toHalfFloat, fromHalf = THREE.DataUtils.fromHalfFloat;
    const maxH = toHalf(maxV);
    const isHalf = hdr.type === THREE.HalfFloatType;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        if (isHalf) { if (d[i + k] > maxH && d[i + k] < 0x7c00) { if (fromHalf(d[i + k]) > maxV) d[i + k] = maxH; } else if (d[i + k] >= 0x7c00) d[i + k] = maxH; }
        else if (d[i + k] > maxV) d[i + k] = maxV;
      }
    }
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    hdr.needsUpdate = true;
    envTex = hdr;
    scene.background = hdr;
    scene.environment = hdr;
    const rot = HDR_SUN_AZ - SUN_AZ;
    scene.backgroundRotation.set(0, rot, 0);
    scene.environmentRotation.set(0, rot, 0);
    scene.backgroundIntensity = 0.9;
    scene.environmentIntensity = 0.95;
  } catch (e) {
    console.warn('[world] HDRI failed to load, using flat sky', e);
    scene.background = new THREE.Color(0x8fb8e6);
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b6a55, 1.6));
  }
  scene.fog = new THREE.FogExp2(HAZE_COLOR.getHex(), 0.00085);

  // ---- sun
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.4);
  sun.position.copy(sunDirection).multiplyScalar(400);
  scene.add(sun); scene.add(sun.target);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDirection).normalize();
  const lightUp = new THREE.Vector3().crossVectors(sunDirection, lightRight).normalize();

  // shared uniforms for the baked ground shadow mask (see ground.js applyBakedShadow)
  const shadowUniforms = {
    uBakedShadow: { value: null },
    uBakedRect: { value: new THREE.Vector4(-400, -310, 1 / 800, 1 / 620) },
    uShCenter: { value: new THREE.Vector3() },
    uShRight: { value: lightRight.clone() },
    uShUp: { value: lightUp.clone() },
    uShRange: { value: preset.dynamic ? preset.range : 0.0 },
  };

  function setDynamicShadow() {
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    if (!preset.dynamic) { sun.castShadow = false; return; }
    sun.castShadow = true;
    sun.shadow.mapSize.set(preset.mapSize, preset.mapSize);
    const c = sun.shadow.camera; const R = preset.range;
    c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 10; c.far = 700; c.updateProjectionMatrix();
    sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.045; sun.shadow.radius = 1.6;
    sun.shadow.needsUpdate = true;
  }

  // Render the whole map's shadows once, from above, into a mask texture (R: 1 lit, 0 shadowed).
  function bakeShadowMask(rect) {
    const { minX, maxX, minZ, maxZ } = rect;
    const maxTex = renderer.capabilities.maxTextureSize;
    const mapSize = Math.min(preset.bakeMap, maxTex), rtSize = Math.min(preset.bakeRT, maxTex);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.castShadow = true;
    sun.shadow.mapSize.set(mapSize, mapSize);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const ext = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 30;
    const c = sun.shadow.camera;
    c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 10; c.far = 1400; c.updateProjectionMatrix();
    sun.target.position.set(cx, 0, cz); sun.position.copy(sun.target.position).addScaledVector(sunDirection, 700);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.25; sun.shadow.radius = 2.0;

    const rt = new THREE.WebGLRenderTarget(rtSize, Math.round(rtSize * (maxZ - minZ) / (maxX - minX)), {
      depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    const cam = new THREE.OrthographicCamera((minX - maxX) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2, (minZ - maxZ) / 2, 0.1, 100);
    // looking straight down, +x right, north (-z) at the top
    cam.position.set(cx, 30, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz);
    cam.near = 29.6; cam.far = 30.3; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const override = new THREE.ShadowMaterial({ color: 0x000000, opacity: 1.0 });
    const prev = { bg: scene.background, fog: scene.fog, om: scene.overrideMaterial, rt: renderer.getRenderTarget(), cc: renderer.getClearColor(new THREE.Color()), ca: renderer.getClearAlpha(), tm: renderer.toneMapping };
    scene.background = null; scene.fog = null; scene.overrideMaterial = override;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev.rt); renderer.setClearColor(prev.cc, prev.ca);
    scene.background = prev.bg; scene.fog = prev.fog; scene.overrideMaterial = prev.om; renderer.toneMapping = prev.tm;
    override.dispose();
    rt.texture.anisotropy = 4;
    shadowUniforms.uBakedShadow.value = rt.texture;
    shadowUniforms.uBakedRect.value.set(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ));
    setDynamicShadow();
    return rt;
  }

  const _fwd = new THREE.Vector3(), _c = new THREE.Vector3();
  function update(camera) {
    if (!preset.dynamic) return;
    const R = preset.range;
    camera.getWorldDirection(_fwd); _fwd.y = 0; if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1); _fwd.normalize();
    _c.copy(camera.position).addScaledVector(_fwd, R * 0.55); _c.y = 0;
    // snap to shadow texels in light space to avoid shimmering
    const texel = (2 * R) / preset.mapSize;
    const lx = Math.round(_c.dot(lightRight) / texel) * texel, ly = Math.round(_c.dot(lightUp) / texel) * texel, ld = _c.dot(sunDirection);
    _c.set(0, 0, 0).addScaledVector(lightRight, lx).addScaledVector(lightUp, ly).addScaledVector(sunDirection, ld);
    sun.target.position.copy(_c);
    sun.position.copy(_c).addScaledVector(sunDirection, 350);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    shadowUniforms.uShCenter.value.copy(_c);
  }

  setDynamicShadow();
  return { sun, envTex, sunDirection, shadowUniforms, bakeShadowMask, update, preset, dispose() { if (envTex) envTex.dispose(); } };
}

// Adds the baked far-shadow lookup to any (roughly ground level, lit) MeshStandard/Lambert material.
export function applyBakedShadow(material, shadowUniforms, extra) {
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform sampler2D uBakedShadow; uniform vec4 uBakedRect; uniform vec3 uShCenter; uniform vec3 uShRight; uniform vec3 uShUp; uniform float uShRange;
float bakedShadowFactor() {
  vec2 uv = (vWPos.xz - uBakedRect.xy) * uBakedRect.zw;
  float baked = texture2D(uBakedShadow, vec2(uv.x, 1.0 - uv.y)).r;
  if (uShRange <= 0.0) return baked;
  vec3 rel = vWPos - uShCenter;
  float m = max(abs(dot(rel, uShRight)), abs(dot(rel, uShUp)));
  return mix(1.0, baked, smoothstep(uShRange * 0.78, uShRange * 0.97, m));
}`)
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
{ float bsf = bakedShadowFactor(); reflectedLight.directDiffuse *= bsf; reflectedLight.directSpecular *= bsf; }`);
    if (extra) extra(shader);
  };
  material.customProgramCacheKey = () => 'baked' + prevKey + (extra ? extra.key || 'x' : '');
  return material;
}
