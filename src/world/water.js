// Shared water feature: swimming pools, ponds and fountains for any campus (see the "Water" section of CAMPUSES.md).
//
// VISUAL ONLY. Nothing here adds collision or changes gameplay: the walk surface stays where the campus put it (the
// flat ground at y = 0), players simply cross at deck height. The visible surface is one flat mesh a few centimetres
// above the ground plane; everything "below" it is faked in the shader:
//   - gentle animated ripples (procedural normal, no textures),
//   - fresnel reflection of the sky through the scene environment map (no planar reflection pass),
//   - a refracted view of the pool floor (parallax by depth): tiles, lane lines, walls, a darker deep end,
//   - cheap animated caustics on the floor (skipped on low quality), depth-dependent absorption / tint,
//   - the world's baked far shadows.
// Around it: a stone coping lip, a gutter line, and for competition pools lane ropes, backstroke flags and ladders.
//
//   addWater(ctx, {
//     outline: [[x, z], ...]            // any simple polygon, or
//     rect: { cx, cz, w, d, angle },    // rectangle: w along the local x axis rotated by `angle` (rad, atan2(z, x)), d across
//     kind: 'pool' | 'pond' | 'fountain',
//     level: 0.05,                      // y of the visible surface (keep it just above the ground plane)
//     depth: [shallow, deep] | number,  // metres (visual only)
//     deepEnd: 1 | -1,                  // which end of the long axis is deep (rect pools)
//     lanes: { count, along: 'long' | 'short' } | true,   // competition lane lines + ropes (rect pools)
//     coping: { w: 0.5, h: 0.11 } | false, ladders: n, flags: true | false, ropes: true | false,
//     tint: [r, g, b],                  // optional water colour override (linear 0..1)
//   })
// Descriptor form: `water: [ { ...same options... }, ... ]` in the campus descriptor + `addCampusWater(ctx)` in the builder.
import * as THREE from 'three';
import { Bucket, ensureCCW, makeCanvas, canvasTexture } from './util.js';

const KIND = { pool: 0, pond: 1, fountain: 2 };
const DEFAULTS = {
  pool: { depth: [1.2, 3.6], rough: 0.05, ripple: 1.25, absorb: [0.5, 0.1, 0.04], scatter: [0.01, 0.2, 0.34], floor: [0.84, 0.92, 0.95] },
  fountain: { depth: [0.45, 0.45], rough: 0.07, ripple: 1.8, absorb: [0.5, 0.12, 0.08], scatter: [0.03, 0.18, 0.24], floor: [0.62, 0.7, 0.72] },
  pond: { depth: [0.4, 2.2], rough: 0.09, ripple: 0.7, absorb: [1.5, 0.75, 1.7], scatter: [0.07, 0.1, 0.035], floor: [0.2, 0.17, 0.1] },
};

const PARS = /* glsl */`
varying vec3 vPool;
uniform float uWTime, uWRough, uWRipple, uWKind, uWLaneW, uWLaneAxis, uWDeepSign;
uniform vec2 uWDim, uWDepth, uWAxisU, uWAxisV;
uniform vec3 uWAbsorb, uWScatter, uWFloor;
vec3 gWaterN;
float waHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float waNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(waHash(i), waHash(i + vec2(1, 0)), f.x), mix(waHash(i + vec2(0, 1)), waHash(i + vec2(1, 1)), f.x), f.y); }
vec2 waWave(vec2 p, vec2 d, float f, float sp) { return d * (cos(dot(p, d) * f + uWTime * sp) * f); }
vec2 waSlope(vec2 p, float fade) {
  vec2 g = waWave(p, vec2(0.80, 0.60), 1.3, 1.1) * 0.011 + waWave(p, vec2(-0.55, 0.83), 2.3, 1.7) * 0.008
         + waWave(p, vec2(0.30, -0.95), 4.1, 2.4) * 0.0045 * fade + waWave(p, vec2(-0.92, -0.38), 7.3, 3.3) * 0.0024 * fade;
  return g * uWRipple;
}
float waCaustic(vec2 f) {
  vec2 k = f * 1.45; float t = uWTime * 0.7;
  k += vec2(sin(k.y * 1.3 + t), cos(k.x * 1.1 - t * 0.8)) * 0.55;
  k += vec2(sin(k.y * 2.1 - t * 1.3), cos(k.x * 1.9 + t)) * 0.3;
  float c = 0.5 + 0.5 * sin(k.x * 2.3) * sin(k.y * 2.1 + t * 0.6);
  return c * c * c;
}`;

const BODY = /* glsl */`
{
  vec3 wV = normalize(vWPos - cameraPosition);
  float wDist = length(vWPos - cameraPosition);
  float wFade = 1.0 - smoothstep(25.0, 110.0, wDist);
  vec2 wS = waSlope(vWPos.xz, wFade);
  gWaterN = normalize(vec3(-wS.x, 1.0, -wS.y));
  vec3 wR = refract(wV, gWaterN, 0.752);
  if (wR.y > -0.05) wR = normalize(vec3(wV.x, min(wV.y, -0.25), wV.z));
  vec3 wCol; float wPath;
  if (uWKind < 0.5 || uWKind > 1.5) {
    // tiled basin in local metres: vPool.x along the long axis (0..L), vPool.y across (0..W)
    float dl = clamp(vPool.x / max(uWDim.x, 0.01), 0.0, 1.0); if (uWDeepSign < 0.0) dl = 1.0 - dl;
    float depth = mix(uWDepth.x, uWDepth.y, smoothstep(0.3, 0.72, dl));
    float tHit = depth / max(-wR.y, 0.22);
    vec2 off = vec2(dot(wR.xz, uWAxisU), dot(wR.xz, uWAxisV)) * tHit;
    vec2 f = vPool.xy + off;
    vec2 fc = clamp(f, vec2(0.0), uWDim);
    float wall = step(0.001, length(f - fc));                  // the refracted ray left the basin: it hit a wall
    wPath = mix(tHit, tHit * 0.55, wall) * 1.7;
    vec3 tile = uWFloor;
    #ifdef WATER_FINE
    vec2 tg = abs(fract(fc / 0.6) - 0.5); float grout = 1.0 - smoothstep(0.46, 0.5, max(tg.x, tg.y));
    tile *= mix(1.0, 0.985 + 0.03 * waHash(floor(fc / 0.6)), wFade) * mix(1.0, grout * 0.06 + 0.94, wFade);
    #endif
    if (uWLaneW > 0.0) {
      // lane line down the middle of every lane, with a T at each end (dark tile), plus the wall targets
      float along = mix(fc.x, fc.y, uWLaneAxis), across = mix(fc.y, fc.x, uWLaneAxis), len = mix(uWDim.x, uWDim.y, uWLaneAxis);
      float lc = abs(fract(across / uWLaneW) - 0.5) * uWLaneW;
      float lineM = (1.0 - smoothstep(0.11, 0.15, lc)) * step(2.0, along) * step(along, len - 2.0);
      float tee = (1.0 - smoothstep(0.46, 0.5, lc)) * (step(2.0, along) * step(along, 2.28) + step(len - 2.28, along) * step(along, len - 2.0));
      tile = mix(tile, vec3(0.02, 0.05, 0.2), max(lineM, tee));
    }
    tile = mix(tile, uWFloor * vec3(0.8, 0.86, 0.9), wall);
    #ifdef WATER_CAUSTICS
    tile *= 0.86 + 0.5 * waCaustic(fc) * (1.0 - wall * 0.5) / (1.0 + depth * 0.22) * wFade + 0.14 * (1.0 - wFade);
    #endif
    wCol = tile;
  } else {
    // pond: mud and weed, soft shore
    float depth = mix(uWDepth.x, uWDepth.y, smoothstep(0.0, 1.0, vPool.z));
    float tHit = depth / max(-wR.y, 0.22);
    vec2 f = vWPos.xz + wR.xz * tHit;
    wPath = tHit * 1.7;
    wCol = uWFloor * (0.7 + 0.6 * waNoise(f * 0.9)) + vec3(0.02, 0.06, 0.01) * waNoise(f * 2.7 + 9.0);
  }
  vec3 wT = exp(-uWAbsorb * wPath);
  diffuseColor.rgb = wCol * wT + uWScatter * (1.0 - wT.g) * 1.5;
  #ifdef WATER_SOFT
  diffuseColor.a *= smoothstep(0.0, 0.55, vPool.z);
  #endif
}`;

function waterMaterial(ctx, cfg) {
  const q = ctx.quality || 'high';
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: cfg.rough, metalness: 0, envMapIntensity: 1.5, transparent: !!cfg.soft, depthWrite: !cfg.soft, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const uni = {
    uWTime: cfg.time, uWRough: { value: cfg.rough }, uWRipple: { value: cfg.ripple }, uWKind: { value: KIND[cfg.kind] }, uWLaneW: { value: cfg.laneW || 0 }, uWLaneAxis: { value: cfg.laneAxis || 0 }, uWDeepSign: { value: cfg.deepSign || 1 },
    uWDim: { value: new THREE.Vector2(cfg.L || 1, cfg.W || 1) }, uWDepth: { value: new THREE.Vector2(cfg.depth[0], cfg.depth[1]) },
    uWAxisU: { value: new THREE.Vector2(cfg.axisU[0], cfg.axisU[1]) }, uWAxisV: { value: new THREE.Vector2(cfg.axisV[0], cfg.axisV[1]) },
    uWAbsorb: { value: new THREE.Vector3(...cfg.absorb) }, uWScatter: { value: new THREE.Vector3(...cfg.scatter) }, uWFloor: { value: new THREE.Vector3(...cfg.floor) },
  };
  const defs = (q !== 'low' ? '#define WATER_CAUSTICS\n' : '') + (q === 'high' ? '#define WATER_FINE\n' : '') + (cfg.soft ? '#define WATER_SOFT\n' : '');
  const extra = (shader) => {
    Object.assign(shader.uniforms, uni);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aPool; varying vec3 vPool;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPool = aPool;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + defs + PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + BODY)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = uWRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gWaterN, 0.0)).xyz);');
  };
  extra.key = 'water:' + q + ':' + (cfg.soft ? 's' : 'h');
  if (ctx.applyBakedShadow && ctx.sky?.shadowUniforms) ctx.applyBakedShadow(mat, ctx.sky.shadowUniforms, extra);
  else { mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;'); extra(sh); }; mat.customProgramCacheKey = () => extra.key; }
  return mat;
}

function ropeTexture() {
  // float line: alternating full-colour and white floats (tinted per rope through vertex colours)
  const c = makeCanvas(8, 64), g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#8a8a8a'; g.fillRect(0, i * 8, 8, 8); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, i * 8, 8, 1); }
  return canvasTexture(c, { aniso: 4 });
}

let sharedTime = null;

export function addWater(ctx, opts = {}) {
  const kind = KIND[opts.kind] === undefined ? 'pool' : opts.kind; const D = DEFAULTS[kind];
  const level = opts.level === undefined ? 0.05 : opts.level;
  const depth = Array.isArray(opts.depth) ? opts.depth : opts.depth ? [opts.depth, opts.depth] : D.depth;
  // ---- outline + local frame
  let ring, isRect = false, L = 1, W = 1, axisU = [1, 0], axisV = [0, 1], org = [0, 0];
  if (opts.rect) {
    const { cx, cz, w, d, angle = 0 } = opts.rect; const ux = Math.cos(angle), uz = Math.sin(angle);
    const P = (a, b) => [cx + a * ux - b * uz, cz + a * uz + b * ux];
    ring = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)]; isRect = true;
    if (w >= d) { L = w; W = d; axisU = [ux, uz]; axisV = [-uz, ux]; org = ring[0]; } else { L = d; W = w; axisU = [-uz, ux]; axisV = [-ux, -uz]; org = ring[1]; }
  } else {
    ring = (opts.outline || []).map((p) => [p[0], p[1]]); if (ring.length < 3) return null;
    if (ring.length === 4) {
      const e = (i) => [ring[(i + 1) % 4][0] - ring[i][0], ring[(i + 1) % 4][1] - ring[i][1]]; const e0 = e(0), e1 = e(1); const l0 = Math.hypot(...e0), l1 = Math.hypot(...e1);
      if (Math.abs(e0[0] * e1[0] + e0[1] * e1[1]) < 0.05 * l0 * l1) {   // right angles: treat as a rectangle
        isRect = true; const i0 = l0 >= l1 ? 0 : 1; const eu = e(i0), ev = e(i0 + 1); L = Math.hypot(...eu); W = Math.hypot(...ev);
        axisU = [eu[0] / L, eu[1] / L]; axisV = [ev[0] / W, ev[1] / W]; org = ring[i0];
      }
    }
  }
  const basin = kind !== 'pond';
  // free-form basins (round fountains...): no walls / lanes, floor pattern in world metres
  if (basin && !isRect) { org = [-1e4, -1e4]; L = W = 2e4; axisU = [1, 0]; axisV = [0, 1]; }
  if (!sharedTime || sharedTime.ctx !== ctx) { const t = { value: 0 }; sharedTime = { ctx, t }; ctx.updaters.push((dt) => { t.value = (t.value + (dt || 0)) % 3600; }); }
  // ---- surface mesh
  const pos = [], pool = [];
  const push = (x, z, s) => { pos.push(x, level, z); if (basin) pool.push((x - org[0]) * axisU[0] + (z - org[1]) * axisU[1], (x - org[0]) * axisV[0] + (z - org[1]) * axisV[1], s); else pool.push(x, z, s); };
  const ccw = ensureCCW(ring);
  if (isRect || basin) {
    const tris = THREE.ShapeUtils.triangulateShape(ccw.map((p) => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tris) for (const k of [0, 2, 1]) push(ccw[t[k]][0], ccw[t[k]][1], 1);
  } else {
    // pond: shore ring (transparent) -> inner ring -> centre fan, so the edge can fade out softly
    let cx = 0, cz = 0; for (const p of ccw) { cx += p[0]; cz += p[1]; } cx /= ccw.length; cz /= ccw.length;
    const inner = ccw.map((p) => { const d = Math.hypot(p[0] - cx, p[1] - cz) || 1; const k = Math.max(0.35, 1 - Math.min(2.2, d * 0.3) / d); return [cx + (p[0] - cx) * k, cz + (p[1] - cz) * k]; });
    for (let i = 0; i < ccw.length; i++) {
      const a = ccw[i], b = ccw[(i + 1) % ccw.length], ia = inner[i], ib = inner[(i + 1) % ccw.length];
      push(a[0], a[1], 0); push(ia[0], ia[1], 1); push(b[0], b[1], 0); push(b[0], b[1], 0); push(ia[0], ia[1], 1); push(ib[0], ib[1], 1);
      push(ia[0], ia[1], 1); push(cx, cz, 1); push(ib[0], ib[1], 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aPool', new THREE.Float32BufferAttribute(pool, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  // make sure the surface faces up whatever the winding
  { const p = geo.attributes.position; const ax = p.getX(1) - p.getX(0), az = p.getZ(1) - p.getZ(0), bx = p.getX(2) - p.getX(0), bz = p.getZ(2) - p.getZ(0); if (az * bx - ax * bz < 0) { const idx = []; for (let i = 0; i < p.count; i += 3) idx.push(i, i + 2, i + 1); geo.setIndex(idx); } }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const lanes = isRect && opts.lanes ? (opts.lanes === true ? { count: Math.max(2, Math.round(W / 2.5)), along: 'long' } : opts.lanes) : null;
  const laneAxis = lanes && lanes.along === 'short' ? 1 : 0;          // 0: lines run along the long axis, 1: along the short axis
  const laneW = lanes ? (laneAxis ? L : W) / lanes.count : 0;
  const mat = waterMaterial(ctx, {
    kind, time: sharedTime.t, rough: D.rough, ripple: (opts.ripple || 1) * D.ripple, depth: isRect || !basin ? depth : [depth[1], depth[1]], L, W, axisU, axisV, laneW, laneAxis, deepSign: opts.deepEnd === -1 ? -1 : 1,
    absorb: D.absorb, scatter: opts.tint || D.scatter, floor: opts.floor || D.floor, soft: kind === 'pond',
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'water:' + kind; mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 1;
  ctx.scene.add(mesh);

  // ---- surround (all visual, merged into the shared static buckets)
  const B = ctx.B; const cop = opts.coping === false ? null : { w: 0.5, h: 0.11, ...(opts.coping || {}) };
  if (cop && basin) {
    const top = level + cop.h; const key = opts.copingMaterial || 'limestone';
    for (let i = 0; i < ccw.length; i++) {
      const a = ccw[i], b = ccw[(i + 1) % ccw.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue;
      const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len, nx = tz, nz = -tx;      // outward for a CCW ring
      const mx = (a[0] + b[0]) / 2 + nx * cop.w / 2, mz = (a[1] + b[1]) / 2 + nz * cop.w / 2; const rot = Math.atan2(-tz, tx);
      B.v(key).box(mx, top / 2, mz, len + cop.w * 2, top, cop.w, rot, 1 / 3);
      // gutter slot + waterline tile band on the inner face
      B.v('blackMetal').box((a[0] + b[0]) / 2 - nx * 0.03, level + 0.012, (a[1] + b[1]) / 2 - nz * 0.03, len, 0.02, 0.07, rot);
      B.v('paint', true).setColor(0.05, 0.16, 0.42).box((a[0] + b[0]) / 2 + nx * 0.004, level + (top - level) * 0.5, (a[1] + b[1]) / 2 + nz * 0.004, len, top - level - 0.02, 0.012, rot);
    }
    B.v('paint', true).setColor(1, 1, 1);
  }
  const toWorld = (u, v) => [org[0] + axisU[0] * u + axisV[0] * v, org[1] + axisU[1] * u + axisV[1] * v];
  let ropes = null;
  if (lanes && opts.ropes !== false) {
    // lane ropes: one float line between every pair of lanes, alternating team colours
    const bk = new Bucket(true); const y = level + 0.035; const cols = opts.ropeColors || [[0.75, 0.06, 0.05], [0.05, 0.18, 0.7]];
    for (let k = 1; k < lanes.count; k++) {
      const c = cols[k % cols.length]; bk.setColor(c[0], c[1], c[2]);
      const a = laneAxis ? toWorld(k * laneW, 0.12) : toWorld(0.12, k * laneW), b = laneAxis ? toWorld(k * laneW, W - 0.12) : toWorld(L - 0.12, k * laneW);
      bk.tube([a[0], y, a[1]], [b[0], y, b[1]], 0.06, 6, 1 / 1.6);
    }
    ropes = new THREE.Mesh(bk.toGeometry(), new THREE.MeshStandardMaterial({ map: ropeTexture(), vertexColors: true, roughness: 0.55 }));
    ropes.name = 'water:ropes'; ropes.castShadow = false; ropes.receiveShadow = true; ropes.matrixAutoUpdate = false; ctx.scene.add(ropes);
  }
  if (lanes && opts.flags !== false) {
    // backstroke flags 5 m from each end of the lanes: posts on the deck, a line across, pennants
    const len = laneAxis ? W : L, span = laneAxis ? L : W; const pt = B.v('paint', true), g = B.v('galv');
    for (const d of [4.57, len - 4.57]) {
      const P = (s) => (laneAxis ? toWorld(s, d) : toWorld(d, s)); const a = P(-0.9), b = P(span + 0.9); const y = level + 1.85;
      for (const p of [a, b]) g.cyl(p[0], 0, p[1], 0.035, 0.035, y + 0.1, 6, 1, true);
      g.tube([a[0], y, a[1]], [b[0], y, b[1]], 0.012, 4);
      const n = Math.floor(span / 0.45); const cols = opts.flagColors || [[0.72, 0.06, 0.05], [0.92, 0.92, 0.9]];
      for (let i = 0; i < n; i++) { const p0 = P((i + 0.08) * span / n), p1 = P((i + 0.92) * span / n), pm = P((i + 0.5) * span / n); const c = cols[i % cols.length]; pt.setColor(c[0], c[1], c[2]); pt.tri([p0[0], y, p0[1]], [p1[0], y, p1[1]], [pm[0], y - 0.34, pm[1]]); pt.tri([p1[0], y, p1[1]], [p0[0], y, p0[1]], [pm[0], y - 0.34, pm[1]]); }
    }
    pt.setColor(1, 1, 1);
  }
  const nLad = opts.ladders === undefined ? (kind === 'pool' && isRect ? 4 : 0) : opts.ladders;
  if (nLad && isRect) {
    // grab-rail ladders on the long sides: two stainless hoops each, dipping into the water
    const al = B.v('aluminum'); const per = Math.ceil(nLad / 2);
    for (let s = 0; s < 2; s++) for (let i = 0; i < per && s * per + i < nLad; i++) {
      const u = per === 1 ? L * 0.5 : L * (0.12 + 0.76 * i / (per - 1)); const v = s ? W : 0, out = s ? 1 : -1;
      for (const du of [-0.24, 0.24]) {
        const p0 = toWorld(u + du, v - out * 0.22), p1 = toWorld(u + du, v + out * 0.5); const top = level + 0.95;
        al.tube([p0[0], level - 0.02, p0[1]], [p0[0], top, p0[1]], 0.022, 6).tube([p0[0], top, p0[1]], [p1[0], top, p1[1]], 0.022, 6).tube([p1[0], top, p1[1]], [p1[0], 0.02, p1[1]], 0.022, 6);
      }
    }
  }
  return { mesh, ropes, ring: ccw, level, kind, L, W, toWorld };
}

/** Builds every entry of the campus descriptor's `water: [...]` list (call it from the campus builder). */
export function addCampusWater(ctx) {
  return (ctx.campus?.water || []).map((w) => addWater(ctx, w));
}
