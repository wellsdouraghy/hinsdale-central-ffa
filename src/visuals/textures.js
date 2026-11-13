// Procedural canvas textures shared by the visuals modules (all generated once, cached).
import * as THREE from 'three';

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// Small deterministic PRNG so textures are identical on every client.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  return c;
}

function tex(c, { srgb = false, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

// Tileable value noise, several octaves. Returns Float32Array size*size in 0..1.
function fbm(size, baseCells, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const r = rng(seed + o * 101);
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells, y0 = Math.floor(gy), fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy), y1 = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells, x0 = Math.floor(gx), fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx), x1 = (x0 + 1) % cells;
        const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1];
        const c2 = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
        out[y * size + x] += amp * (a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy);
      }
    }
    total += amp; amp *= 0.5; cells *= 2;
    if (cells > size) break;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function heightToNormal(h, size, strength) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x + size - 1) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y + size - 1) % size) * size + x], dn = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1;
    const inv = 1 / Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    d[i] = (nx * inv * 0.5 + 0.5) * 255; d[i + 1] = (ny * inv * 0.5 + 0.5) * 255; d[i + 2] = (nz * inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

function grayTex(values, size, map = (v) => v, srgb = false) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(1, map(values[i]))) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb });
}

// Fine pebbled grain for molded polymer.
export const polymerNormal = () => cached('polyN', () => heightToNormal(fbm(256, 64, 3, 11), 256, 2.2));
// Very fine blasted/parkerized metal texture.
export const metalNormal = () => cached('metalN', () => heightToNormal(fbm(256, 128, 2, 23), 256, 0.9));

// Roughness variation with scratches and handling wear (white = rough).
export const wearRoughness = () => cached('wearR', () => {
  const size = 512, c = canvas(size), ctx = c.getContext('2d');
  const n = fbm(size, 6, 5, 5), img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (0.72 + (n[i] - 0.5) * 0.5) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const r = rng(77);
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, l = 4 + r() * r() * 70;
    ctx.strokeStyle = `rgba(${r() < 0.75 ? '70,70,70' : '235,235,235'},${0.12 + r() * 0.3})`;
    ctx.lineWidth = 0.5 + r() * 1.1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  return tex(c);
});

// Albedo wear: mostly white (multiplies base colour) with lighter rubbed patches and scratches.
export const wearAlbedo = () => cached('wearA', () => {
  const size = 512, c = canvas(size), ctx = c.getContext('2d');
  const n = fbm(size, 5, 5, 91), img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (0.62 + n[i] * 0.3 + Math.max(0, n[i] - 0.62) * 1.6) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.min(255, v); img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const r = rng(404);
  for (let i = 0; i < 140; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, l = 3 + r() * r() * 50;
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + r() * 0.35})`;
    ctx.lineWidth = 0.4 + r() * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  return tex(c, { srgb: true });
});

// Woven fabric (gloves, sleeves, webbing).
export const fabricNormal = () => cached('fabN', () => {
  const size = 256, h = new Float32Array(size * size), n = fbm(size, 32, 2, 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * 48 * Math.PI, v = (y / size) * 48 * Math.PI;
    const over = (Math.floor(x / (size / 48)) + Math.floor(y / (size / 48))) % 2;
    h[y * size + x] = (over ? Math.abs(Math.sin(u)) : Math.abs(Math.sin(v))) * 0.75 + n[y * size + x] * 0.25;
  }
  return heightToNormal(h, size, 2.6);
});

// Sleeve cloth: weave plus larger folds running around the arm.
export const clothNormal = () => cached('clothN', () => {
  const size = 512, h = new Float32Array(size * size), folds = fbm(size, 5, 4, 61), fine = fbm(size, 64, 2, 62);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const u = (x / size) * 96 * Math.PI, v = (y / size) * 96 * Math.PI;
    const over = (Math.floor(x / (size / 96)) + Math.floor(y / (size / 96))) % 2;
    const weave = over ? Math.abs(Math.sin(u)) : Math.abs(Math.sin(v));
    const fold = Math.sin((y / size) * 26 + folds[i] * 9) * 0.5 + 0.5;
    h[i] = fold * fold * 3.2 + folds[i] * 2.0 + weave * 0.22 + fine[i] * 0.15;
  }
  return heightToNormal(h, size, 3.0);
});

// Grip stippling / checkering.
export const stippleNormal = () => cached('stipN', () => {
  const size = 256, h = new Float32Array(size * size), cells = 40;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = ((x / size) * cells) % 1 - 0.5, v = ((y / size) * cells) % 1 - 0.5;
    h[y * size + x] = Math.max(0, 0.5 - (Math.abs(u) + Math.abs(v)));
  }
  return heightToNormal(h, size, 5);
});

// Woodland / multi-terrain style camouflage (original pattern, generated from layered noise).
export const camoMap = () => cached('camo', () => {
  const size = 512, c = canvas(size), ctx = c.getContext('2d');
  const a = fbm(size, 4, 4, 1), b = fbm(size, 6, 4, 2), d = fbm(size, 9, 3, 3), g = fbm(size, 128, 2, 4);
  const cols = [[112, 106, 82], [78, 84, 58], [58, 62, 44], [136, 124, 96], [66, 52, 40]];
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    let k = 0;
    if (a[i] > 0.54) k = 1;
    if (b[i] > 0.58) k = 2;
    if (d[i] > 0.62) k = 3;
    if (a[i] < 0.36 && d[i] < 0.5) k = 4;
    const s = 0.86 + g[i] * 0.28;
    img.data[i * 4] = cols[k][0] * s; img.data[i * 4 + 1] = cols[k][1] * s; img.data[i * 4 + 2] = cols[k][2] * s; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: true });
});

// Oiled walnut.
export const woodMap = () => cached('wood', () => {
  const size = 512, c = canvas(size), ctx = c.getContext('2d');
  const warp = fbm(size, 4, 4, 31), fine = fbm(size, 128, 2, 32);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const ring = Math.sin((y / size) * 44 + warp[i] * 30 + (x / size) * 3) * 0.5 + 0.5;
    const streak = Math.pow(ring, 1.6);
    const v = 0.6 + streak * 0.26 + warp[i] * 0.2 - fine[i] * 0.2;
    img.data[i * 4] = 112 * v; img.data[i * 4 + 1] = 64 * v; img.data[i * 4 + 2] = 36 * v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: true });
});
export const woodRoughness = () => cached('woodR', () => grayTex(fbm(256, 8, 4, 33), 256, (v) => 0.3 + v * 0.35));

// ---- effect sprites -------------------------------------------------------------------------------------------------

function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// Muzzle flash seen from the side: a hot core with a ragged forward tongue. `variant` 0..3.
export const flashSide = (variant) => cached('flashS' + variant, () => {
  const size = 256, c = canvas(size), ctx = c.getContext('2d'), r = rng(900 + variant * 7);
  ctx.globalCompositeOperation = 'lighter';
  // origin at left-middle; tongue goes +x
  for (let i = 0; i < 26; i++) {
    const t = r(), x = 20 + t * 200 * (0.6 + r() * 0.4), y = 128 + (r() - 0.5) * 70 * (1 - t * 0.6) * (0.3 + t);
    const rad = 14 + (1 - t) * 30 * r() + 6;
    radial(ctx, x, y, rad, [[0, `rgba(255,${200 + r() * 40 | 0},${120 + r() * 60 | 0},${0.35 + r() * 0.3})`], [0.5, 'rgba(255,150,50,0.14)'], [1, 'rgba(255,90,10,0)']]);
  }
  for (let i = 0; i < 5; i++) {
    const a = (r() - 0.5) * 0.9, l = 90 + r() * 120;
    ctx.save(); ctx.translate(22, 128); ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, l, 0);
    g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(l * 0.5, -10 - r() * 8, l, 0); ctx.quadraticCurveTo(l * 0.5, 10 + r() * 8, 0, 7); ctx.fill();
    ctx.restore();
  }
  radial(ctx, 34, 128, 40, [[0, 'rgba(255,255,240,1)'], [0.35, 'rgba(255,225,150,0.7)'], [1, 'rgba(255,150,40,0)']]);
  return tex(c, { srgb: true, repeat: false });
});

// Muzzle flash seen head-on: irregular star.
export const flashFront = (variant) => cached('flashF' + variant, () => {
  const size = 256, c = canvas(size), ctx = c.getContext('2d'), r = rng(500 + variant * 13);
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(128, 128);
  const spikes = 5 + (variant % 3);
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 + r() * 0.7, l = 60 + r() * 62, w = 10 + r() * 14;
    ctx.save(); ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, l, 0);
    g.addColorStop(0, 'rgba(255,235,190,0.95)'); g.addColorStop(0.5, 'rgba(255,170,70,0.5)'); g.addColorStop(1, 'rgba(255,110,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -w); ctx.quadraticCurveTo(l * 0.4, -w * 0.5, l, 0); ctx.quadraticCurveTo(l * 0.4, w * 0.5, 0, w); ctx.fill();
    ctx.restore();
  }
  radial(ctx, 0, 0, 62, [[0, 'rgba(255,255,245,1)'], [0.3, 'rgba(255,230,160,0.8)'], [0.7, 'rgba(255,150,50,0.2)'], [1, 'rgba(255,110,20,0)']]);
  return tex(c, { srgb: true, repeat: false });
});

// Soft cloudy puff for dust / smoke / blood mist (white, alpha only).
export const puffTex = () => cached('puff', () => {
  const size = 128, c = canvas(size), ctx = c.getContext('2d'), r = rng(42);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, d = r() * 26;
    radial(ctx, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 16 + r() * 22, [[0, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]);
  }
  // fade to fully transparent at the edge
  ctx.globalCompositeOperation = 'destination-in';
  radial(ctx, 64, 64, 64, [[0, 'rgba(0,0,0,1)'], [0.6, 'rgba(0,0,0,0.9)'], [1, 'rgba(0,0,0,0)']]);
  return tex(c, { srgb: false, repeat: false });
});

// Bullet hole: dark crater, chipped pale rim, soot halo. Colour is tinted per instance.
export const bulletHoleTex = () => cached('hole', () => {
  const size = 128, c = canvas(size), ctx = c.getContext('2d'), r = rng(7);
  radial(ctx, 64, 64, 60, [[0, 'rgba(40,36,32,0.55)'], [0.45, 'rgba(60,55,50,0.28)'], [1, 'rgba(60,55,50,0)']]);
  // chipped rim
  ctx.fillStyle = 'rgba(215,210,200,0.85)';
  ctx.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2, rad = 20 + r() * 12;
    ctx[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * rad, 64 + Math.sin(a) * rad);
  }
  ctx.fill();
  // radial cracks
  ctx.strokeStyle = 'rgba(25,22,20,0.7)'; ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, l = 24 + r() * 26;
    ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 12, 64 + Math.sin(a) * 12);
    ctx.lineTo(64 + Math.cos(a + (r() - 0.5) * 0.3) * l, 64 + Math.sin(a + (r() - 0.5) * 0.3) * l); ctx.stroke();
  }
  // crater
  ctx.fillStyle = 'rgba(12,10,9,1)';
  ctx.beginPath();
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2, rad = 11 + r() * 5;
    ctx[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * rad, 64 + Math.sin(a) * rad);
  }
  ctx.fill();
  radial(ctx, 64, 64, 9, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  return tex(c, { srgb: true, repeat: false });
});

// Blast scorch: irregular soot patch with radial streaks (black, alpha only matters).
export const scorchTex = () => cached('scorch', () => {
  const size = 256, c = canvas(size), ctx = c.getContext('2d'), r = rng(1234);
  radial(ctx, 128, 128, 124, [[0, 'rgba(8,7,6,0.92)'], [0.3, 'rgba(12,10,9,0.8)'], [0.62, 'rgba(20,17,14,0.38)'], [1, 'rgba(20,17,14,0)']]);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, l = 50 + r() * 74, w = 3 + r() * 9;
    ctx.save(); ctx.translate(128, 128); ctx.rotate(a);
    const g = ctx.createLinearGradient(20, 0, l, 0);
    g.addColorStop(0, 'rgba(6,5,5,0.5)'); g.addColorStop(1, 'rgba(6,5,5,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(20, -w); ctx.lineTo(l, 0); ctx.lineTo(20, w); ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2, d = r() * 70; radial(ctx, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 4 + r() * 14, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]); }
  return tex(c, { srgb: true, repeat: false });
});

// Outdoor sky-ish equirect used as a fallback reflection environment for the viewmodel.
export const skyEquirect = () => cached('skyEq', () => {
  const w = 256, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5d8fd0'); g.addColorStop(0.42, '#a9c6e6'); g.addColorStop(0.5, '#dfe6ea');
  g.addColorStop(0.52, '#6f6e63'); g.addColorStop(1, '#3c3d36');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  radial(ctx, 70, 30, 34, [[0, 'rgba(255,250,235,1)'], [0.15, 'rgba(255,245,220,0.9)'], [1, 'rgba(255,240,210,0)']]);
  const t = tex(c, { srgb: true, repeat: false });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
});

// Name tag: rounded dark plate, accent stripe, white text.
export function nameTagTexture(name, colorHex) {
  const c = canvas(512, 128), ctx = c.getContext('2d');
  const col = '#' + new THREE.Color(colorHex).getHexString();
  ctx.font = '600 58px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const text = (name || 'Player').slice(0, 16);
  const tw = Math.min(440, ctx.measureText(text).width);
  const pw = tw + 64, x0 = (512 - pw) / 2;
  ctx.fillStyle = 'rgba(10,12,14,0.62)';
  ctx.beginPath(); ctx.roundRect(x0, 22, pw, 84, 14); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.roundRect(x0, 22, 12, 84, [14, 0, 0, 14]); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
  ctx.fillText(text, 256 + 6, 66, 440);
  const t = tex(c, { srgb: true, repeat: false });
  return t;
}
