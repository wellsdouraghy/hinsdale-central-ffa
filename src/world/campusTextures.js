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

const WEATHER = `#include <map_fragment>
  { float gr = wNoise(vWPos.xz * 0.35 + vWPos.y * 0.9) * 0.6 + wNoise(vec2(vWPos.x + vWPos.z, vWPos.y) * 1.7) * 0.4;
    float big = wNoise(vec2(vWPos.x * 0.07 + vWPos.z * 0.11, vWPos.y * 0.13));          // slow drift: no two bays look the same
    float base = smoothstep(1.1, 0.0, vWPos.y);
    diffuseColor.rgb *= (1.0 - uWx.x * 0.5 + uWx.x * gr) * (1.0 - uWx.x * 0.35 + uWx.x * 0.7 * big) * (1.0 - uWx.y * base * (0.6 + 0.8 * gr));
    float eff = smoothstep(0.72, 0.95, wNoise(vWPos.xz * 0.9 + vWPos.y * 2.3)) * smoothstep(0.2, 1.2, vWPos.y) * uWx.z;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.78, 0.74), eff); }`;

function flag() { try { return new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('tex'); } catch (e) { return null; } }

/** Loads the campus pack (or returns null). Call before the builder runs; `applyCampusTextures` after it. */
export async function loadCampusTextures(campus, T, quality) {
  const f = flag(); if (f === '0') return null;
  const file = (campus.files && campus.files.textures) || (f === '1' ? `campuses/${campus.id}/tex/tex.json` : null);
  if (!file) return null;
  let man; try { man = await fetch('./' + file).then((r) => r.json()); } catch (e) { console.warn('[textures] no pack', file); return null; }
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
    if (w) { const uni = { value: new THREE.Vector3(w[0], w[1], w[2]) }; withWorld(m, { key: 'txWeather', pars: 'uniform vec3 uWx;', map: WEATHER }); const prev = m.onBeforeCompile; m.onBeforeCompile = (sh) => { prev(sh); sh.uniforms.uWx = uni; }; }
    M[e.key] = skinMaterial(m, e, {}, quality);
  }
  for (const [key, o] of Object.entries(pack.overrides)) {
    const m = M[key], e = pack.tex[o.tex];
    if (!m || !m.isMaterial || !e) { if (!o.optional) console.warn('[textures] override skipped', key); continue; }
    skinMaterial(m, e, o, quality);
  }
}

/** Builder helper: snap a height to the nearest course of a generated masonry texture (courses start at y = 0). */
export function courseSnap(ctx, name, y) { const e = ctx.TX && ctx.TX.tex[name]; return e && e.courseM ? Math.round(y / e.courseM) * e.courseM : y; }
