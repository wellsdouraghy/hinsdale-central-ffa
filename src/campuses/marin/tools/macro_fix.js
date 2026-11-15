// Visual-only clean-up of ground_macro.jpg (the ground photo tint): inside car parks, pixels the mask calls asphalt but
// the photo shows as bright blotches (bare patches, paint, car remnants) or green smears (tree shadows / canopies read
// as lawn) are pulled to the car parks' mean asphalt tone. From the air those lots were covered in pale amoebas.
// Needs a JPEG codec, so it runs in the browser: open dev/marin.html, paste this in the console (after mask_fix.mjs has
// been run), and save the returned blob over public/campuses/marin/ground_macro.jpg.   await macroFix()
async function macroFix() {
  const ld = async (url) => { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); return { c, g, w: im.width, h: im.height, d: g.getImageData(0, 0, im.width, im.height) }; };
  const M = await ld('/campuses/marin/ground_macro.jpg?x=' + Date.now()), K = await ld('/campuses/marin/ground_mask.png?x=' + Date.now()); const campus = await (await fetch('/campuses/marin/campus.json')).json();
  const W = M.w, H = M.h, sx = W / 660, sz = H / 600; const region = new Uint8Array(W * H);   // image covers x -330..330, z -300..300
  const fillPoly = (ring) => { const P = ring.map(([x, z]) => [(x + 330) * sx, (z + 300) * sz]); let y0 = 1e9, y1 = -1e9; for (const p of P) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) { const cy = y + 0.5, xs = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a[1] <= cy) !== (b[1] <= cy)) xs.push(a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[i + 1] - 0.5)); x++) region[y * W + x] = 1; } };
  for (const a of campus.areas) if (a.tags && a.tags.amenity === 'parking') fillPoly(a.outer[0]);
  // lots OSM has no polygon for (world x0, z0, x1, z1): south of 4th St, the top row of the north lot, east of the pool
  for (const [x0, z0, x1, z1] of [[-12, 158, 42, 202], [-4, -162, 28, -150], [75, 50, 95, 100]]) fillPoly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  const md = M.d.data, kd = K.d.data, kx = K.w / W, kz = K.h / H; let sr = 0, sg = 0, sb = 0, sn = 0;
  const asph = (i) => { const x = i % W, y = (i / W) | 0; const o = (Math.min(K.h - 1, Math.floor((y + 0.5) * kz)) * K.w + Math.min(K.w - 1, Math.floor((x + 0.5) * kx))) * 4; return kd[o] > 200 && kd[o + 2] < 60; };
  for (let i = 0; i < W * H; i++) { if (!region[i] || !asph(i)) continue; const r = md[i * 4], g = md[i * 4 + 1], b = md[i * 4 + 2], L = (r + g + b) / 3; if (L > 60 && L < 135 && g < r + 8) { sr += r; sg += g; sb += b; sn++; } }
  const T = [sr / sn, sg / sn, sb / sn]; const k = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { if (!region[i] || !asph(i)) continue; const r = md[i * 4], g = md[i * 4 + 1], b = md[i * 4 + 2], L = (r + g + b) / 3; k[i] = Math.max(Math.max(0, Math.min(1, (L - (T[0] + T[1] + T[2]) / 3 - 14) / 22)), Math.max(0, Math.min(1, (g - Math.max(r, b) - 4) / 10))); }
  const k2 = new Float32Array(W * H), R = 2; for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) { let m = 0; for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) m = Math.max(m, k[(y + b) * W + x + a]); k2[y * W + x] = m; }
  for (let i = 0; i < W * H; i++) { const kk = k2[i] * 0.92; if (kk <= 0 || !region[i]) continue; const n = ((i * 2654435761) >>> 0) % 9 - 4; for (let c = 0; c < 3; c++) md[i * 4 + c] = Math.round(md[i * 4 + c] * (1 - kk) + (T[c] + n) * kk); }
  M.g.putImageData(M.d, 0, 0); return new Promise((r) => M.c.toBlob(r, 'image/jpeg', 0.9));
}
