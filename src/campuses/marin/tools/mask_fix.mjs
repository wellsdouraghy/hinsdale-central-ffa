// Visual-only fixes to ground_mask.png: car parks wall-to-wall asphalt, despeckled concrete / grass blobs, paved courtyard
// Visual-only hand fixes to ground_mask.png (the ground shader's surface weights and the 'high' grass-blade mask).
// Run from the repo root:  node src/campuses/marin/tools/mask_fix.mjs
// gen.py applies the same fix when it regenerates the mask; this script patches the existing file without needing the
// Python imaging stack. surface_classes.png (the 1 m grid gameplay reads) is NOT touched.
//   R = asphalt, G = concrete, B = synthetic turf, A = 255 - dirt;  4 px per metre, x -330..330 -> columns, z -300..300 -> rows.
import fs from 'node:fs'; import zlib from 'node:zlib';
const FILE = 'public/campuses/marin/ground_mask.png'; const X0 = -330, Z0 = -300, PPM = 4; const ANG = 7.2 * Math.PI / 180;
// grid-aligned rectangles painted as concrete: [cx, cz, w (grid east), d (grid south)]
const CONCRETE = [[7.7, 60.5, 10.4, 36]];   // the Library / Leadership Center courtyard (paved; lawn showed through it)

const buf = fs.readFileSync(FILE); let p = 8, ihdr = null; const idat = [];
while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') ihdr = data; else if (type === 'IDAT') idat.push(data); p += 12 + len; }
const W = ihdr.readUInt32BE(0), H = ihdr.readUInt32BE(4); if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) throw new Error('expected 8-bit RGBA, non-interlaced');
const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = 4, stride = W * bpp; const px = Buffer.alloc(H * stride);
for (let y = 0; y < H; y++) {
  const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), dst = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? dst[i - bpp] : 0, b = up ? up[i] : 0, c = up && i >= bpp ? up[i - bpp] : 0; let v = src[i];
    if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    dst[i] = v & 255;
  }
}
const ux = Math.cos(ANG), uz = Math.sin(ANG); const stats = {};
const paint = (cover, x0, y0, x1, y1, rgba, label) => {   // blend rgba in by a 5x5-smoothed coverage (soft edge like gen.py's)
  let nPx = 0; x0 = Math.max(2, x0); y0 = Math.max(2, y0); x1 = Math.min(W - 3, x1); y1 = Math.min(H - 3, y1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let k = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) k += cover[(y + b) * W + x + a]; k /= 25; if (k <= 0) continue;
    const o = (y * W + x) * 4; for (let i = 0; i < 4; i++) px[o + i] = Math.round(px[o + i] * (1 - k) + rgba[i] * k); nPx++;
  }
  stats[label] = (stats[label] || 0) + nPx;
};
const cover = new Uint8Array(W * H);
const rasterRing = (ring) => {   // world-metre polygon -> cover; returns the pixel bbox
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const P = ring.map(([x, z]) => [(x - X0) * PPM, (z - Z0) * PPM]);
  for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
  for (let y = y0; y <= y1; y++) { const cy = y + 0.5; const xs = [];
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a[1] <= cy) !== (b[1] <= cy)) xs.push(a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(x0, Math.ceil(xs[i] - 0.5)); x <= Math.min(x1, Math.floor(xs[i + 1] - 0.5)); x++) cover[y * W + x] = 1; }
  return [x0 - 3, y0 - 3, x1 + 3, y1 + 3];
};
// 1. car parks: OSM amenity=parking polygons (plus hand rectangles) are asphalt wall to wall. The classifier had left
//    tree-shadow "grass" smears and concrete blobs across them.
const campus = JSON.parse(fs.readFileSync('public/campuses/marin/campus.json', 'utf8'));
const ASPHALT_RECTS = [[75, 50, 95, 100]];   // world x0, z0, x1, z1: the lot east of the pool
{ let bb = [1e9, 1e9, -1e9, -1e9]; const grow = (b) => { bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; };
  for (const a of campus.areas) if (a.tags && a.tags.amenity === 'parking' && a.outer && a.outer[0]) grow(rasterRing(a.outer[0]));
  for (const [x0, z0, x1, z1] of ASPHALT_RECTS) grow(rasterRing([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]));
  // never over the synthetic turf
  for (let i = 0; i < W * H; i++) if (cover[i] && px[i * 4 + 2] > 100) cover[i] = 0;
  paint(cover, ...bb, [255, 0, 0, 255], 'parking -> asphalt'); cover.fill(0); }
// 2. despeckle: concrete islands (up to 400 m2) and grass smears (up to 60 m2, mostly tree shadows the classifier read
//    as lawn) that sit in asphalt become asphalt; tiny concrete specks in grass become grass
{ const lab = new Uint8Array(W * H), stack = new Int32Array(W * H); const toA = new Uint8Array(W * H), toG = new Uint8Array(W * H);
  const pass = (isIn, limit, label, grassLimit) => { let nA = 0, nG = 0; lab.fill(0);
    for (let s0 = 0; s0 < W * H; s0++) { if (lab[s0] || !isIn(s0)) continue; let sp = 0, n = 0, asph = 0, other = 0; stack[sp++] = s0; lab[s0] = 1; const comp = [];
      while (sp) { const i = stack[--sp]; n++; if (comp.length <= limit) comp.push(i); const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx;
          if (isIn(j)) { if (!lab[j]) { lab[j] = 1; stack[sp++] = j; } } else if (px[j * 4] > 120) asph++; else other++; } }
      if (n > limit) continue; const fa = asph / Math.max(1, asph + other);
      if (fa >= 0.6) { for (const i of comp) toA[i] = 1; nA++; } else if (grassLimit && n < grassLimit && fa < 0.2) { for (const i of comp) toG[i] = 1; nG++; } }
    stats[label + ' -> asphalt'] = nA; if (grassLimit) stats[label + ' -> grass'] = nG; };
  pass((i) => px[i * 4 + 1] > 140, 6400, 'concrete islands', 96);
  pass((i) => px[i * 4] < 100 && px[i * 4 + 1] < 100 && px[i * 4 + 2] < 100, 960, 'grass smears', 0);
  // grow two pixels so the soft rim of each island goes too
  const dil = (c) => { const o = new Uint8Array(c); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (c[i]) { o[i - 1] = o[i + 1] = o[i - W] = o[i + W] = 1; } } return o; };
  const a2 = dil(dil(toA)), g2 = dil(dil(toG));
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x, o = i * 4; if (px[o + 2] > 100) continue; if (a2[i]) { px[o] = 255; px[o + 1] = 0; } else if (g2[i]) { px[o + 1] = 0; } } }
// 3. paved courtyards (after the despeckle so they are never touched by it)
let changed = 0;
for (const [cx, cz, w, d] of CONCRETE) {
  const r = Math.hypot(w, d) / 2 + 1; const x0 = Math.floor((cx - r - X0) * PPM), x1 = Math.ceil((cx + r - X0) * PPM), y0 = Math.floor((cz - r - Z0) * PPM), y1 = Math.ceil((cz + r - Z0) * PPM);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const wx = X0 + (x + 0.5) / PPM - cx, wz = Z0 + (y + 0.5) / PPM - cz; const a = wx * ux + wz * uz, b = -wx * uz + wz * ux;
    const k = Math.max(0, Math.min(1, Math.min(w / 2 - Math.abs(a), d / 2 - Math.abs(b)) / 0.5 + 0.5)); if (k <= 0) continue;   // 0.5 m soft edge
    const o = (y * W + x) * 4; const mix = (i, t) => { px[o + i] = Math.round(px[o + i] * (1 - k) + t * k); };
    mix(0, 0); mix(1, 255); mix(2, 0); mix(3, 255); changed++;
  }
}
stats['courtyard -> concrete'] = changed; console.log(stats);
// re-encode (per-row choice of None / Sub / Up by the usual minimum-sum heuristic)
const out = Buffer.alloc(H * (stride + 1)); const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
for (let y = 0; y < H; y++) {
  const cur = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null; const sum = [0, 0, 0];
  for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = up ? up[i] : 0; const v = [cur[i], (cur[i] - a) & 255, (cur[i] - b) & 255]; for (let f = 0; f < 3; f++) { cand[f][i] = v[f]; sum[f] += v[f] < 128 ? v[f] : 256 - v[f]; } }
  const f = sum[1] <= sum[0] && sum[1] <= sum[2] ? 1 : sum[2] <= sum[0] ? 2 : 0; out[y * (stride + 1)] = f; cand[f].copy(out, y * (stride + 1) + 1);
}
const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(zlib.crc32 ? zlib.crc32(b.subarray(4, 8 + data.length)) : crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
function crc(d) { let c, r = 0xffffffff; for (let n = 0; n < d.length; n++) { c = (r ^ d[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; r = (r >>> 8) ^ c; } return (r ^ 0xffffffff) >>> 0; }
fs.writeFileSync(FILE, Buffer.concat([buf.subarray(0, 8), chunk('IHDR', Buffer.from(ihdr)), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log(`${FILE}: ${W}x${H}, ${buf.length} -> ${fs.statSync(FILE).size} bytes`);
