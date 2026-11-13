// Texture loading + the shared material table.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, mulberry32 } from './util.js';

const BASE = './assets/world/';

export async function loadTextures(renderer, quality, onProgress) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const aniso = quality === 'low' ? Math.min(2, maxAniso) : Math.min(quality === 'high' ? 16 : 8, maxAniso);
  const loader = new THREE.TextureLoader();
  const list = {
    groundMacro: ['ground_macro.jpg', true, false], groundMask: ['ground_mask.png', false, false], roofs: ['roofs.jpg', true, false],
    grassColor: ['tex/grass_color.jpg', true, true], grassNormal: ['tex/grass_normal.jpg', false, true],
    asphaltColor: ['tex/asphalt_color.jpg', true, true], asphaltNormal: ['tex/asphalt_normal.jpg', false, true],
    concreteColor: ['tex/concrete_color.jpg', true, true], concreteNormal: ['tex/concrete_normal.jpg', false, true],
    brickColor: ['tex/brick_diff.jpg', true, true], brickNormal: ['tex/brick_nor_gl.jpg', false, true], brickRough: ['tex/brick_rough.jpg', false, true],
    barkColor: ['tex/bark_color.jpg', true, true], barkNormal: ['tex/bark_normal.jpg', false, true],
    shinglesColor: ['tex/shingles_color.jpg', true, true], shinglesNormal: ['tex/shingles_normal.jpg', false, true],
    leafBroad: ['tex/leaf_broad.png', true, false], leafConifer: ['tex/leaf_conifer.png', true, false],
  };
  const keys = Object.keys(list); let done = 0; const out = {};
  await Promise.all(keys.map(async (k) => {
    const [file, srgb, repeat] = list[k];
    const t = await loader.loadAsync(BASE + file);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    // weak GPUs: halve the big ground textures
    if (quality === 'low' && (k === 'groundMacro' || k === 'groundMask' || k === 'roofs')) {
      const c = makeCanvas(Math.floor(t.image.width / 2), Math.floor(t.image.height / 2));
      c.getContext('2d').drawImage(t.image, 0, 0, c.width, c.height); t.image = c;
    }
    out[k] = t; done++; onProgress(done / keys.length);
  }));
  out.aniso = aniso;
  return out;
}

// ------------------------------------------------------------------ procedural textures
function windowTextures(aniso) {
  // one module = one mullion bay (1.15 m wide) x full window height; three rows, top row frosted
  const W = 128, H = 256;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const o = makeCanvas(W, H), go = o.getContext('2d');   // G = roughness, B = metalness
  g.fillStyle = '#7f95a3'; g.fillRect(0, 0, W, H);
  go.fillStyle = 'rgb(0,18,255)'; go.fillRect(0, 0, W, H);
  // frosted upper row
  g.fillStyle = '#aebdb9'; g.fillRect(0, 0, W, H * 0.34);
  go.fillStyle = 'rgb(0,120,60)'; go.fillRect(0, 0, W, H * 0.34);
  // slight gradient on clear glass
  const gr = g.createLinearGradient(0, H * 0.34, 0, H); gr.addColorStop(0, 'rgba(120,140,155,0.3)'); gr.addColorStop(1, 'rgba(40,50,58,0.45)');
  g.fillStyle = gr; g.fillRect(0, H * 0.34, W, H * 0.66);
  // frames (dark bronze)
  const frame = (x, y, w, h) => { g.fillStyle = '#1b1917'; g.fillRect(x, y, w, h); go.fillStyle = 'rgb(0,130,90)'; go.fillRect(x, y, w, h); };
  frame(0, 0, 7, H); frame(W - 7, 0, 7, H); frame(0, 0, W, 9); frame(0, H - 9, W, 9);
  frame(0, H * 0.34 - 4, W, 8); frame(0, H * 0.67 - 4, W, 8);
  const map = canvasTexture(c, { aniso }); const orm = canvasTexture(o, { srgb: false, aniso });
  return { map, orm };
}

function doorTextures(aniso) {
  // double door 2.0 m x 2.4 m with transom
  const W = 256, H = 256;
  const c = makeCanvas(W, H), g = c.getContext('2d'); const o = makeCanvas(W, H), go = o.getContext('2d');
  g.fillStyle = '#1b1917'; g.fillRect(0, 0, W, H); go.fillStyle = 'rgb(0,130,90)'; go.fillRect(0, 0, W, H);
  const glass = (x, y, w, h) => { g.fillStyle = '#6f828e'; g.fillRect(x, y, w, h); go.fillStyle = 'rgb(0,18,255)'; go.fillRect(x, y, w, h); };
  glass(10, 8, W - 20, 34);                    // transom
  glass(22, 62, W / 2 - 34, 150); glass(W / 2 + 12, 62, W / 2 - 34, 150);
  g.fillStyle = '#b9b9b4'; g.fillRect(W / 2 - 16, 150, 6, 34); g.fillRect(W / 2 + 10, 150, 6, 34); // pulls
  g.fillStyle = '#0d0c0b'; g.fillRect(W / 2 - 1, 50, 2, H - 50);
  return { map: canvasTexture(c, { aniso, repeat: false }), orm: canvasTexture(o, { srgb: false, aniso, repeat: false }) };
}

function chainlinkTexture(aniso) {
  // 1 tile = 0.5 m of fence; diamond mesh ~6 cm
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(176,182,186,1)'; g.lineWidth = 3.2; g.lineCap = 'round';
  const n = 8, step = S / n;
  for (let i = -n; i <= 2 * n; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + S, S); g.stroke();
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step - S, S); g.stroke();
  }
  const t = canvasTexture(c, { aniso });
  return t;
}

function windscreenTexture(aniso) {
  // dark green privacy/wind screen mesh on tennis & outfield fences (semi-opaque weave)
  const S = 64, c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#1d3a2a'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) { g.fillStyle = (x + y) % 4 === 0 ? '#234533' : '#193324'; g.fillRect(x, y, 1, 1); }
  return canvasTexture(c, { aniso });
}

function towerTexture(aniso) {
  // welded steel plates: horizontal courses with staggered vertical seams, faint rust streaks
  const W = 1024, H = 1024, c = makeCanvas(W, H), g = c.getContext('2d'); const rnd = mulberry32(5);
  g.fillStyle = '#e9edf0'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {  // vertical weathering streaks
    const x = rnd() * W, y = rnd() * H, len = 60 + rnd() * 320;
    const gr = g.createLinearGradient(0, y, 0, y + len); const a = 0.03 + rnd() * 0.05;
    const tone = rnd() < 0.3 ? '150,120,90' : '120,130,135';
    gr.addColorStop(0, `rgba(${tone},${a})`); gr.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 10, len);
  }
  const courses = 8;
  for (let r = 0; r < courses; r++) {
    const y = (r / courses) * H;
    g.fillStyle = 'rgba(90,100,108,0.5)'; g.fillRect(0, y, W, 2); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, y + 2, W, 1);
    for (let k = 0; k < 8; k++) { const x = ((k + (r % 2) * 0.5) / 8) * W; g.fillStyle = 'rgba(90,100,108,0.4)'; g.fillRect(x, y, 2, H / courses); }
  }
  return canvasTexture(c, { aniso });
}

function houseWallTexture(kind, aniso) {
  // one module = 4.0 m wide x 2.9 m tall storey with one window
  const W = 512, H = 372, c = makeCanvas(W, H), g = c.getContext('2d'); const rnd = mulberry32(kind.seed);
  g.fillStyle = kind.base; g.fillRect(0, 0, W, H);
  if (kind.type === 'siding') {
    for (let y = 0; y < H; y += 14) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, W, 2); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, y + 2, W, 2); }
  } else if (kind.type === 'brick') {
    const bh = 9.5, bw = 28;
    for (let r = 0; r * bh < H; r++) for (let k = -1; k * bw < W; k++) {
      const x = k * bw + (r % 2) * bw / 2, y = r * bh; const v = (rnd() - 0.5) * 34;
      g.fillStyle = `rgb(${kind.rgb[0] + v | 0},${kind.rgb[1] + v * 0.7 | 0},${kind.rgb[2] + v * 0.6 | 0})`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  } else {
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.035)`; g.fillRect(rnd() * W, rnd() * H, 3, 3); }
  }
  // window with trim, shutters optional
  const wx = W * 0.32, wy = H * 0.22, ww = W * 0.36, wh = H * 0.5;
  if (kind.shutters) { g.fillStyle = kind.shutters; g.fillRect(wx - 40, wy, 34, wh); g.fillRect(wx + ww + 6, wy, 34, wh); }
  g.fillStyle = kind.trim || '#f3f1ea'; g.fillRect(wx - 9, wy - 9, ww + 18, wh + 18);
  const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, '#5b7186'); gr.addColorStop(1, '#27323b');
  g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = 'rgba(230,226,214,0.55)'; g.fillRect(wx, wy, ww, wh * 0.28); // blind
  g.fillStyle = kind.trim || '#f3f1ea'; g.fillRect(wx + ww / 2 - 3, wy, 6, wh); g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(wx - 9, wy + wh + 9, ww + 18, 4);
  return canvasTexture(c, { aniso });
}

function textDecal(lines, opt = {}) {
  const W = opt.w || 1024, H = opt.h || 512, c = makeCanvas(W, H), g = c.getContext('2d');
  if (opt.bg) { g.fillStyle = opt.bg; g.fillRect(0, 0, W, H); }
  g.fillStyle = opt.color || '#f4f2ec'; g.textAlign = opt.align || 'left'; g.textBaseline = 'middle';
  const fs = opt.font || Math.floor(H / (lines.length + 0.6));
  g.font = `${opt.weight || 600} ${fs}px ${opt.family || 'Futura, "Century Gothic", "Trebuchet MS", Arial, sans-serif'}`;
  if (g.letterSpacing !== undefined) g.letterSpacing = opt.spacing || '6px';
  lines.forEach((l, i) => g.fillText(l, opt.align === 'center' ? W / 2 : (opt.pad || 10), (i + 0.5) * (H / lines.length) + (opt.dy || 0)));
  const t = canvasTexture(c, { repeat: false, aniso: 8 });
  return t;
}


// Injects world position / normal varyings (vWPos, vWN) and custom fragment code into a standard material.
function withWorld(material, { pars = '', map = '', rough = '', emissive = '', key }) {
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    let f = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN;
float wHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float wHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash2(i), wHash2(i + vec2(1, 0)), f.x), mix(wHash2(i + vec2(0, 1)), wHash2(i + vec2(1, 1)), f.x), f.y); }
${pars}`);
    if (map) f = f.replace('#include <map_fragment>', map);
    if (rough) f = f.replace('#include <roughnessmap_fragment>', rough);
    if (emissive) f = f.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + emissive);
    sh.fragmentShader = f;
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// Glass with fake interiors (interior mapping): each window is a "room" with walls, a lit ceiling grid, blinds;
// reflections come from the environment with real fresnel (dielectric), so panes read as glass, not dark panels.
// uv.x: room coordinate (one unit = one room, increasing along cross(up, normal)); uv.y: kind * 2 + v (0..1)
//   kind 0 = clear, 1 = clear with a frosted top third, 2 = fully translucent (clerestory panels)
function interiorGlass() {
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;   // only there so the uv varying exists
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: white, roughness: 0.05, metalness: 0.0, envMapIntensity: 3.2 });
  return withWorld(m, {
    key: 'interiorGlass',
    pars: 'vec3 gInterior; float gFrost;',
    map: `
  {
    float kind = floor(vMapUv.y * 0.5 + 0.01); float gv = vMapUv.y - kind * 2.0;
    vec3 Vw = normalize(vWPos - cameraPosition);
    vec3 Nw = normalize(vWN); vec3 Tw = normalize(vec3(Nw.z, 0.0, -Nw.x));
    vec2 dpx = vec2(dFdx(vWPos.x), dFdx(vWPos.z)), dpy = vec2(dFdy(vWPos.x), dFdy(vWPos.z));
    float du = dFdx(vMapUv.x) * dFdx(vMapUv.x) + dFdy(vMapUv.x) * dFdy(vMapUv.x);
    float dv = dFdx(vMapUv.y) * dFdx(vMapUv.y) + dFdy(vMapUv.y) * dFdy(vMapUv.y);
    float wU = clamp(sqrt((dot(dpx, dpx) + dot(dpy, dpy)) / max(du, 1e-12)), 1.0, 14.0);
    float hV = clamp(sqrt((dFdx(vWPos.y) * dFdx(vWPos.y) + dFdy(vWPos.y) * dFdy(vWPos.y)) / max(dv, 1e-12)), 0.6, 8.0);
    float roomD = 6.0;
    vec3 rd = vec3(dot(Vw, Tw) / wU, Vw.y / hV, max(-dot(Vw, Nw), 1e-3) / roomD);
    vec3 ro = vec3(fract(vMapUv.x), gv, 0.0);
    float yb = -1.0 / hV, yt = 1.0 + 0.55 / hV;
    float tx = abs(rd.x) > 1e-5 ? ((rd.x > 0.0 ? 1.0 : 0.0) - ro.x) / rd.x : 1e6;
    float ty = abs(rd.y) > 1e-5 ? ((rd.y > 0.0 ? yt : yb) - ro.y) / rd.y : 1e6;
    float tz = 1.0 / rd.z;
    float tt = min(tx, min(ty, tz)); vec3 rp = ro + rd * tt;
    float id = floor(vMapUv.x) * 1.37 + floor(vWPos.y / 3.4) * 17.0 + Nw.x * 31.0 + Nw.z * 57.0;
    float h1 = wHash(id), h2 = wHash(id + 3.1), h3 = wHash(id + 7.7);
    vec3 wallCol = h1 < 0.4 ? vec3(0.80, 0.76, 0.66) : (h1 < 0.75 ? vec3(0.66, 0.73, 0.78) : vec3(0.78, 0.78, 0.76));
    float lit = h2 > 0.3 ? 1.0 : 0.28;
    vec3 c;
    if (tt == tz) {
      c = wallCol * (rp.y < 0.05 ? 0.8 : 1.0);
      float px = fract(rp.x * 1.0 + h3);
      if (abs(px - 0.18) < 0.07 && rp.y < 0.62) c = vec3(0.30, 0.2, 0.13);                       // door
      if (abs(px - 0.62) < 0.2 && rp.y > 0.12 && rp.y < 0.66) c = mix(vec3(0.9), vec3(0.1, 0.22, 0.16), step(0.5, h3)); // board
    } else if (tt == ty) {
      if (rd.y > 0.0) {
        vec2 g2 = fract(vec2(rp.x * wU / 2.4, rp.z * roomD / 2.4));
        float panel = step(0.3, g2.x) * step(g2.x, 0.7) * step(0.12, g2.y) * step(g2.y, 0.88);
        c = mix(vec3(0.5), vec3(5.0, 4.8, 4.3) * lit, panel);
      } else c = vec3(0.34, 0.3, 0.26);
    } else c = wallCol * 0.82;
    c *= mix(1.0, 0.4, clamp(rp.z, 0.0, 1.0)) * (0.25 + 0.75 * lit) * 0.2;
    if (h3 < 0.6) {
      float drop = 0.18 + 0.55 * wHash(id + 11.3);
      if (gv > 1.0 - drop) { float sl = fract(gv * hV * 16.0); c = vec3(0.74, 0.72, 0.66) * (0.5 + 0.5 * smoothstep(0.0, 0.35, sl)) * 0.3; }
    }
    c *= vec3(0.8, 0.93, 0.9);
    gFrost = (kind > 1.5 || (kind > 0.5 && gv > 0.667)) ? 1.0 : 0.0;
    gInterior = c * (1.0 - gFrost);
    diffuseColor.rgb = mix(vec3(0.012), vec3(0.74, 0.8, 0.78), gFrost);
  }`,
    rough: 'float roughnessFactor = mix(0.05, 0.62, gFrost);',
    emissive: 'totalEmissiveRadiance += gInterior;',
  });
}

function gradientTexture(stops, w = 4, h = 64) {
  const c = makeCanvas(w, h), g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const t = canvasTexture(c, { repeat: false, aniso: 4 }); t.wrapS = THREE.RepeatWrapping; return t;
}
function streakTexture() {
  const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext('2d'); const rnd = mulberry32(31);
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, len = (0.25 + rnd() * 0.75) * H, w = 2 + rnd() * 9;
    const gr = g.createLinearGradient(0, 0, 0, len); const a = 0.1 + rnd() * 0.22;
    gr.addColorStop(0, `rgba(30,24,18,${a})`); gr.addColorStop(1, 'rgba(30,24,18,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, len);
  }
  const t = canvasTexture(c, { repeat: false, aniso: 4 }); t.wrapS = THREE.RepeatWrapping; return t;
}
function louverTexture(aniso) {
  const S = 64, c = makeCanvas(S, S), g = c.getContext('2d');
  for (let y = 0; y < S; y += 8) { const gr = g.createLinearGradient(0, y, 0, y + 8); gr.addColorStop(0, '#8d9296'); gr.addColorStop(0.55, '#5d6266'); gr.addColorStop(0.6, '#111'); gr.addColorStop(1, '#1b1b1b'); g.fillStyle = gr; g.fillRect(0, y, S, 8); }
  return canvasTexture(c, { aniso });
}
function frostPanelTexture(aniso) {
  const S = 128, c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#e4e8e4'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(120,128,126,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, S); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(S, i * 32); g.stroke(); }
  return canvasTexture(c, { aniso });
}

export const HOUSE_KINDS = [
  { type: 'siding', base: '#e8e6df', seed: 1, shutters: '#27323d' },
  { type: 'siding', base: '#c9c2ae', seed: 2 },
  { type: 'siding', base: '#8fa0aa', seed: 3, shutters: null },
  { type: 'brick', base: '#9a8f86', rgb: [150, 78, 62], seed: 4, trim: '#efe9dc' },
  { type: 'brick', base: '#a59a8a', rgb: [176, 150, 118], seed: 5 },
  { type: 'stucco', base: '#d9d0bd', seed: 6, shutters: '#4a3b30' },
  { type: 'siding', base: '#6f7d6a', seed: 7, trim: '#e9e6dc' },
  { type: 'siding', base: '#f1ede2', seed: 8, shutters: '#5a1f1c' },
];

export function createMaterials(T, quality) {
  const aniso = T.aniso;
  const M = {};
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // brick: per-wing tint through vertex colours + procedural weathering (dark damp base, large-scale grime, faint efflorescence)
  M.brick = withWorld(std({ map: T.brickColor, normalMap: T.brickNormal, roughnessMap: T.brickRough, roughness: 1.0, vertexColors: true }), {
    key: 'brickWeather',
    map: `#include <map_fragment>
  { float gr = wNoise(vWPos.xz * 0.35 + vWPos.y * 0.9) * 0.6 + wNoise(vec2(vWPos.x + vWPos.z, vWPos.y) * 1.7) * 0.4;
    float base = smoothstep(1.1, 0.0, vWPos.y);
    diffuseColor.rgb *= (0.86 + 0.24 * gr) * (1.0 - 0.3 * base * (0.6 + 0.8 * gr));
    float eff = smoothstep(0.72, 0.95, wNoise(vWPos.xz * 0.9 + vWPos.y * 2.3)) * smoothstep(0.2, 1.2, vWPos.y) * 0.1;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.78, 0.74), eff); }`,
  });
  M.brick.normalScale.set(1.2, 1.2);
  M.brickRed = std({ map: T.brickColor, normalMap: T.brickNormal, roughnessMap: T.brickRough, roughness: 1.0, color: 0xc9705c });
  M.limestone = std({ map: T.concreteColor, normalMap: T.concreteNormal, roughness: 0.82 });
  M.limestone.color.setRGB(1.34, 1.2, 0.95);
  M.limestone.normalScale.set(0.5, 0.5);
  M.concrete = std({ map: T.concreteColor, normalMap: T.concreteNormal, color: 0xc9c7c0, roughness: 0.85 });
  M.bronze = std({ color: 0x1d1a18, roughness: 0.5, metalness: 0.55 });
  const win = windowTextures(aniso);
  M.glass = std({ map: win.map, roughnessMap: win.orm, metalnessMap: win.orm, roughness: 1, metalness: 1, envMapIntensity: 1.5 });
  const door = doorTextures(aniso);
  M.door = std({ map: door.map, roughnessMap: door.orm, metalnessMap: door.orm, roughness: 1, metalness: 1, envMapIntensity: 1.4 });
  M.curtainGlass = std({ color: 0x8395a1, roughness: 0.06, metalness: 1.0, envMapIntensity: 1.5 });
  // roofs: satellite projection for the macro look, tiled ballast/membrane detail + seams up close (players can stand here)
  M.roofSat = std({ map: T.roofs, roughness: 0.92, metalness: 0 });
  M.roofSat.color.setRGB(1.06, 1.0, 0.9);
  {
    const uni = { uRoofD: { value: T.concreteColor }, uRoofN: { value: T.asphaltNormal } };
    withWorld(M.roofSat, {
      key: 'roofDetail',
      pars: 'uniform sampler2D uRoofD; uniform sampler2D uRoofN; vec3 gRoofN;',
      map: `#include <map_fragment>
  { float dist = length(vWPos - cameraPosition); float nearW = 1.0 - smoothstep(25.0, 90.0, dist);
    float lum = dot(diffuseColor.rgb, vec3(0.333));
    float white = smoothstep(0.55, 0.85, lum);                       // bright single-ply membrane vs gravel ballast
    vec3 dt = texture2D(uRoofD, vWPos.xz / 2.6).rgb; float dl = clamp(dot(dt, vec3(0.333)) / 0.62, 0.7, 1.25);
    float grav = wNoise(vWPos.xz * 55.0) * 0.5 + wNoise(vWPos.xz * 23.0) * 0.5;
    float detail = mix(dl * (0.78 + 0.44 * grav), 0.94 + 0.08 * dl, white);
    vec2 sm = abs(fract(vWPos.xz / vec2(3.05, 12.0)) - 0.5);
    float seam = (1.0 - smoothstep(0.004, 0.012, sm.x)) * 0.6 + (1.0 - smoothstep(0.001, 0.004, sm.y)) * 0.5;
    detail *= 1.0 - seam * mix(0.12, 0.3, white);
    float pond = smoothstep(0.55, 0.8, wNoise(vWPos.xz * 0.16)) * 0.14;     // water staining
    diffuseColor.rgb *= mix(1.0, detail * (1.0 - pond), nearW);
    vec3 n1 = texture2D(uRoofN, vWPos.xz / 1.1).xyz * 2.0 - 1.0;
    gRoofN = normalize(vec3(n1.x * mix(0.9, 0.2, white) * nearW, 1.0, n1.y * mix(0.9, 0.2, white) * nearW)); }`,
    });
    const prev = M.roofSat.onBeforeCompile;
    M.roofSat.onBeforeCompile = (sh) => { prev(sh); Object.assign(sh.uniforms, uni); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', 'if (vWN.y > 0.9) normal = normalize((viewMatrix * vec4(gRoofN, 0.0)).xyz);'); };
  }
  M.whitePanel = std({ color: 0xeeebe2, roughness: 0.45, metalness: 0.1 });
  M.aluminum = std({ color: 0xc4c8cc, roughness: 0.42, metalness: 0.85 });
  M.galv = std({ color: 0x9aa0a4, roughness: 0.55, metalness: 0.8, side: THREE.DoubleSide });
  M.blackMetal = std({ color: 0x141518, roughness: 0.45, metalness: 0.6 });
  M.paint = std({ vertexColors: true, roughness: 0.62, metalness: 0.0 });          // generic matte coloured props
  M.gloss = std({ vertexColors: true, roughness: 0.28, metalness: 0.35, envMapIntensity: 1.1 }); // painted metal (vehicles, scoreboards)
  M.rubber = std({ color: 0x101011, roughness: 0.9 });
  M.carGlass = std({ color: 0x4a5760, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.6 });
  M.lightEmit = std({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 0.6, roughness: 0.4 });
  M.wood = std({ map: T.barkColor, color: 0xb08a62, roughness: 0.85 });
  const cl = chainlinkTexture(aniso);
  M.chainlink = std({ map: cl, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.7, color: 0xd0d4d6 });
  M.windscreen = std({ map: windscreenTexture(aniso), side: THREE.DoubleSide, roughness: 0.9, color: 0xffffff });
  M.tower = std({ map: towerTexture(aniso), roughness: 0.42, metalness: 0.15, color: 0xf4f7fa });
  M.shingles = std({ map: T.shinglesColor, normalMap: T.shinglesNormal, roughness: 0.92, vertexColors: true });
  M.houseWalls = HOUSE_KINDS.map((k) => std({ map: houseWallTexture(k, aniso), roughness: 0.85 }));
  M.net = std({ color: 0x111111, transparent: false, alphaTest: 0.3, map: cl, side: THREE.DoubleSide, roughness: 0.9 });
  M.glassInt = interiorGlass();
  M.frame = std({ color: 0x241f1c, roughness: 0.42, metalness: 0.7 });
  M.frameAlu = std({ color: 0xb4b8bc, roughness: 0.38, metalness: 0.85 });
  M.panelGray = std({ color: 0x7d8388, roughness: 0.45, metalness: 0.55 });
  M.louver = std({ map: louverTexture(aniso), roughness: 0.5, metalness: 0.6 });
  M.frost = std({ map: frostPanelTexture(aniso), roughness: 0.55, metalness: 0.0, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0 });
  M.mulch = std({ map: T.barkColor, roughness: 1.0 });
  M.mulch.color.setRGB(0.75, 0.5, 0.36);
  M.groundDecal = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, alphaMap: gradientTexture([[0, '#000'], [0.35, '#555'], [1, '#fff']]), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: true });
  M.wallDecal = new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: true });
  M.textDecal = textDecal;
  if (quality === 'low') { for (const k of Object.keys(M)) { const m = M[k]; if (m && m.isMaterial) { m.normalMap = null; } } }
  return M;
}
