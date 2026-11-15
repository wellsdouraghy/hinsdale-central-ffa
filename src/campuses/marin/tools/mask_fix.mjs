// Visual-only hand fixes to ground_mask.png (the ground shader's surface weights and the 'high' grass-blade mask).
// Run from the repo root:  node src/campuses/marin/tools/mask_fix.mjs
// gen.py applies the same fix when it regenerates the mask; this script patches the existing file without needing the
// Python imaging stack. surface_classes.png (the 1 m grid gameplay reads) is NOT touched.
//   R = asphalt, G = concrete, B = synthetic turf, A = 255 - dirt;  4 px per metre, x -330..330 -> columns, z -300..300 -> rows.
import fs from 'node:fs'; import zlib from 'node:zlib';
const FILE = 'public/campuses/marin/ground_mask.png'; const X0 = -330, Z0 = -300, PPM = 4; const ANG = 7.2 * Math.PI / 180;
// grid-aligned rectangles painted as concrete: [cx, cz, w (grid east), d (grid south)]
const CONCRETE = [[8.1, 60.5, 9.6, 36]];   // the Library / Leadership Center courtyard (paved; lawn showed through it)

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
let changed = 0; const ux = Math.cos(ANG), uz = Math.sin(ANG);
for (const [cx, cz, w, d] of CONCRETE) {
  const r = Math.hypot(w, d) / 2 + 1; const x0 = Math.floor((cx - r - X0) * PPM), x1 = Math.ceil((cx + r - X0) * PPM), y0 = Math.floor((cz - r - Z0) * PPM), y1 = Math.ceil((cz + r - Z0) * PPM);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const wx = X0 + (x + 0.5) / PPM - cx, wz = Z0 + (y + 0.5) / PPM - cz; const a = wx * ux + wz * uz, b = -wx * uz + wz * ux;
    const k = Math.max(0, Math.min(1, Math.min(w / 2 - Math.abs(a), d / 2 - Math.abs(b)) / 0.5 + 0.5)); if (k <= 0) continue;   // 0.5 m soft edge
    const o = (y * W + x) * 4; const mix = (i, t) => { px[o + i] = Math.round(px[o + i] * (1 - k) + t * k); };
    mix(0, 0); mix(1, 255); mix(2, 0); mix(3, 255); changed++;
  }
}
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
console.log(`${FILE}: ${W}x${H}, ${changed} px set to concrete, ${buf.length} -> ${fs.statSync(FILE).size} bytes`);
