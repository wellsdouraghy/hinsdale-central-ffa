// Per-campus building textures generated from reference photos (tools/textures/, MAP_NOTES.md "Textures from references").
//
// Data only: public/campuses/<id>/tex/tex.json lists the generated albedo + normal tiles with their real size in metres
// (`sizeM`), course height (`courseM`) and how the game uses them:
//   - an entry with `key` becomes a new material M[key] (buckets: ctx.B.v(key, true); tinted through vertex colours);
//   - `overrides` re-skin an EXISTING material (M.brick, M.stucco, M.limestone, M.hamPaver ...) without touching the
//     builder: { "<materialKey>": { "tex": "<name>", "uvM": 2.2, "tint": [r, g, b], "roughness": 0.9, ... } }.
// `uvM` = metres per UV unit of the geometry that uses the material (the facade kit writes u, v = metres / 2.2), so
// texture.repeat = uvM / sizeM and one brick course is exactly `courseM` tall on every wall. Campuses without a
// `files.textures` entry are untouched (backward compatible); `?tex=0` turns the pack off, `?tex=1` forces a pack that a
// campus has in public/campuses/<id>/tex/ but has not switched on yet (dev preview while it is being wired).
import * as THREE from 'three';
import { withWorld } from './assets.js';

// Surface shader shared by every pack material that asks for it (`weather` on a keyed texture or on an override).
//   uWx   [grime, damp base, efflorescence]
//   uAlt  second sample of the same tile, shifted by a whole number of units / courses (tex.json `altM`), cross-faded in
//         by slow world-space noise: joints stay registered, but no two stretches of wall show the same bricks, so a
//         2-5 m tile does not read as a grid on a 60 m wall. z = 0 turns it off (low quality: one sample).
//   uVar  [macro tone drift, rain streaks, micro grain (fades out with distance: no shimmer), roughness variation]
// All noise is sampled in the SURFACE's own plane: `wp` = (distance along the wall, height) on walls, (x, z) on roofs
// and paving. Never add height to both axes of a world-xz lookup (`xz * f + y * g`): that shears every blob into a
// diagonal slash across the wall (v2: pale efflorescence slashes on Brown Hall, worst on low quality).
// Cost: 5 value-noise lookups + 1 near the camera (v2: 8 + 2), and the second tile sample is only taken where the
// cross-fade needs it (explicit gradients, so mip selection is unchanged): ~1.1 albedo samples per pixel instead of 2.
const PARS = 'uniform vec3 uWx; uniform vec3 uAlt; uniform vec4 uVar; uniform vec2 uMic; float txLum = 1.0; float txDamp = 0.0;';
const WEATHER = `
  float wallness = 1.0 - smoothstep(0.5, 0.9, abs(vWN.y));                               // grade damp / streaks / bloom belong on walls, not on roofs and paving
  bool txAlongX = abs(vWN.x) > abs(vWN.z);                                               // wall faces +-x: it runs along z
  vec2 wp = wallness > 0.5 ? vec2(txAlongX ? vWPos.z + 31.7 : vWPos.x, vWPos.y) : vWPos.xz;
  float g1 = wNoise(wp * vec2(0.37, 0.21));                                              // broad grime, taller than wide
  float g2 = wNoise(wp * vec2(1.7, 0.9) + 5.3);
  float big = wNoise(wp * vec2(0.085, 0.11) + 11.1);                                     // slow drift: no two bays look the same
#ifdef USE_MAP
  vec4 sampledDiffuseColor;
  if (uAlt.z > 0.0) {
    float am = smoothstep(0.42, 0.58, wNoise(wp * vec2(0.23, 0.29) + 3.7) * 0.7 + g2 * 0.3) * uAlt.z;
    vec2 gx = dFdx(vMapUv), gy = dFdy(vMapUv);
    if (am < 0.999) sampledDiffuseColor = textureGrad( map, vMapUv, gx, gy );
    if (am > 0.001) { vec4 s2 = textureGrad( map, vMapUv + uAlt.xy, gx, gy ); sampledDiffuseColor = am < 0.999 ? mix(sampledDiffuseColor, s2, am) : s2; }
  } else sampledDiffuseColor = texture2D( map, vMapUv );
  txLum = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.55, 0.15));
  diffuseColor *= sampledDiffuseColor;
#endif
  { float gr = g1 * 0.6 + g2 * 0.4;
    float base = smoothstep(1.1, 0.0, vWPos.y) * wallness;
    txDamp = uWx.y * base * (0.6 + 0.8 * gr);
    diffuseColor.rgb *= (1.0 - uWx.x * 0.5 + uWx.x * gr) * (1.0 - uVar.x * 0.5 + uVar.x * big) * (1.0 - txDamp);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.035, 1.0, 0.955), (big - 0.5) * 2.0 * uVar.x * 2.0);   // warm / cool drift with the tone drift
    float st = wNoise(vec2(wp.x * 3.1, wp.y * 0.12)) * 0.75 + g2 * 0.25;
    diffuseColor.rgb *= 1.0 - uVar.y * wallness * smoothstep(0.52, 0.85, st);              // rain run-off: long vertical streaks
    // efflorescence: soft pale bloom low on the wall (above the damp base, gone by ~3 m: splash zone and under the
    // ground-floor sills), blobs taller than wide, thin enough that the brick still shows through
    float effBand = smoothstep(0.25, 0.9, vWPos.y) * (1.0 - smoothstep(1.6, 3.0, vWPos.y)) * wallness * uWx.z;
    if (effBand > 0.001) {
      float eff = smoothstep(0.66, 0.92, wNoise(wp * vec2(0.8, 0.42) + 17.3) * 0.8 + g2 * 0.2) * effBand;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.71, 0.66), eff);
    }
    #ifdef USE_MAP
    float pxw = length(fwidth(vWPos));
    float mf = smoothstep(0.006, 0.0012, pxw) * uVar.z;                                    // only where a texel is bigger than a pixel
    if (mf > 0.001) { vec2 q = fract(vMapUv) * uMic; diffuseColor.rgb *= 1.0 + mf * 1.5 * (wNoise(q) - 0.5); }
    #endif
  }`;
const ROUGH = `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= texture2D( roughnessMap, vRoughnessMapUv ).g;
#endif
  roughnessFactor = clamp(roughnessFactor + uVar.w * (txLum - uMicMean()) - 0.9 * txDamp, 0.25, 1.0);`;

function flag() { try { return new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('tex'); } catch (e) { return null; } }

/** Step 1 (before the shared textures load): the pack's manifest, or null. `replaces` lists shared tiles it makes redundant. */
export async function fetchCampusPack(campus) {
  const f = flag(); if (f === '0') return null;
  const file = (campus.files && campus.files.textures) || (f === '1' ? `campuses/${campus.id}/tex/tex.json` : null);
  if (!file) return null;
  try { const man = await fetch('./' + file).then((r) => r.json()); return { file, man, replaces: man.replaces || [] }; } catch (e) { console.warn('[textures] no pack', file); return null; }
}

/** Step 2: loads the pack's images. Call before the builder runs; `applyCampusTextures` after it. */
export async function loadCampusTextures(pre, T, quality) {
  if (!pre) return null; const { file, man } = pre;
  const base = file.slice(0, file.lastIndexOf('/') + 1); const loader = new THREE.TextureLoader(); const withNormals = quality !== 'low';
  const pack = { campus: man.campus, tex: {}, overrides: man.overrides || {}, bytes: 0 };
  await Promise.all(man.textures.map(async (e) => {
    const load = async (name, srgb) => { const t = await loader.loadAsync('./' + base + name); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = T.aniso; return t; };
    const [map, normal] = await Promise.all([load(e.map, true), withNormals && e.normal ? load(e.normal, false) : null]);
    pack.tex[e.name] = { ...e, map, normalMap: normal };
  }));
  return pack;
}

function fit(tex, e, uvM, offsetM) {
  // each material owns its copy of the sampler state (repeat differs with the geometry's UV scale); the image is shared
  const t = tex.clone(); t.repeat.set(uvM / e.sizeM[0], uvM / e.sizeM[1]);
  if (offsetM) t.offset.set(offsetM[0] / e.sizeM[0], offsetM[1] / e.sizeM[1]);
  t.needsUpdate = true; return t;
}

// Weathering + anti-repetition + micro grain + roughness variation (see WEATHER). Uniforms are per material; the program is shared.
function surface(m, e, o, w, quality) {
  const lite = quality === 'low';
  const alt = o.alt ?? e.alt ?? 1, macro = o.macro ?? e.macro ?? 0.3, streaks = o.streaks ?? e.streaks ?? 0.1, micro = o.micro ?? e.micro ?? 0.1, rv = o.roughVar ?? e.roughVar ?? 0.5;
  const mean = e.meanLinear ? 0.3 * e.meanLinear[0] + 0.55 * e.meanLinear[1] + 0.15 * e.meanLinear[2] : 0.3;
  const U = {
    uWx: { value: new THREE.Vector3(w[0], w[1], w[2]) },
    uAlt: { value: new THREE.Vector3(e.altM ? e.altM[0] / e.sizeM[0] : 0, e.altM ? e.altM[1] / e.sizeM[1] : 0, e.altM && !lite ? alt : 0) },
    uVar: { value: new THREE.Vector4(macro, streaks, lite ? 0 : micro, rv / Math.max(mean, 0.02)) },
    uMic: { value: new THREE.Vector2(Math.round(e.sizeM[0] / 0.004), Math.round(e.sizeM[1] / 0.004)) },   // 4 mm grain, whole cells per tile
    uMean: { value: mean },
  };
  withWorld(m, { key: 'txSurface', pars: PARS + ' uniform float uMean; float uMicMean() { return uMean; }', map: WEATHER, rough: ROUGH });
  const prev = m.onBeforeCompile; m.onBeforeCompile = (sh) => { prev(sh); Object.assign(sh.uniforms, U); };
  m.userData.txSurface = U;
}

function skinMaterial(m, e, o, quality) {
  const uvM = o.uvM || e.uvM || 2.2; const off = o.offsetM || e.offsetM;
  m.map = fit(e.map, e, uvM, off);
  m.normalMap = e.normalMap && quality !== 'low' ? fit(e.normalMap, e, uvM, off) : null;
  const ns = o.normalScale ?? e.normalScale ?? 1; m.normalScale.set(ns, ns);
  m.roughnessMap = null; m.roughness = o.roughness ?? e.roughness ?? 0.9; m.metalnessMap = null; m.metalness = o.metalness ?? e.metalness ?? 0;
  const tint = o.tint || e.tint; if (tint) m.color.setRGB(tint[0], tint[1], tint[2]); else if (o.resetColor !== false && !m.vertexColors) m.color.setRGB(1, 1, 1);
  if (o.envMapIntensity ?? e.envMapIntensity) m.envMapIntensity = o.envMapIntensity ?? e.envMapIntensity;
  m.needsUpdate = true; return m;
}

/** Creates the keyed materials and applies the overrides. Run after the campus builder (its kit may add materials). */
export function applyCampusTextures(ctx, pack) {
  if (!pack) return;
  const { M, quality } = ctx; ctx.TX = pack;
  for (const e of Object.values(pack.tex)) {
    if (!e.key) continue;
    const w = e.weather === undefined ? [0.2, 0.3, 0.08] : e.weather;    // [grime, damp base, efflorescence]; false = none
    const m = new THREE.MeshStandardMaterial({ vertexColors: e.vertexColors !== false, side: e.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
    if (e.doubleSide) m.shadowSide = THREE.BackSide;
    if (e.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -e.polygonOffset; m.polygonOffsetUnits = -e.polygonOffset; }
    if (w) surface(m, e, {}, w, quality);
    M[e.key] = skinMaterial(m, e, {}, quality);
  }
  for (const [key, o] of Object.entries(pack.overrides)) {
    const m = M[key], e = pack.tex[o.tex];
    if (!m || !m.isMaterial || !e) { if (!o.optional) console.warn('[textures] override skipped', key); continue; }
    skinMaterial(m, e, o, quality);
    if (o.weather) surface(m, e, o, o.weather, quality);    // replaces the material's own fragment hook (the sheet only asks for it where that is right: M.brick, plain standard materials)
  }
}

/** Builder helper: snap a height to the nearest course of a generated masonry texture (courses start at y = 0). */
export function courseSnap(ctx, name, y) { const e = ctx.TX && ctx.TX.tex[name]; return e && e.courseM ? Math.round(y / e.courseM) * e.courseM : y; }
