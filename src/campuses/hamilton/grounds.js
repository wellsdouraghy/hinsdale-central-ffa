// Hamilton High grounds: Al Michaels Field (track, football lines, stands, lights, scoreboard), the ball courts, the
// modernisation site in the quad and its staging yard, the Robertson Blvd frontage (marquee, flag, palms, iron
// fence), car parks with stall paint, street paint, lamps, signals, kerb-side cars, buses and the play-area edge.
import * as THREE from 'three';
import { ANG, UX, UZ, minAreaOBB, wallDecal, edgeFrame, quadFacing, wallRect, fbox, pointInRing, makeCanvas, canvasTexture, mulberry32 } from './kit.js';
import { G, GR, ROT, gbox } from './school.js';
import { paintedQuad } from '../../world/fields.js';
import { fence as sharedFence, bleachers, lampPost, turfNoise, landmarkKit } from '../../world/landmarks.js';
import { propKit } from '../../world/props.js';

const STREETS = ['secondary', 'tertiary', 'residential'];
const ROADW = { secondary: 20.0, tertiary: 11.5, residential: 9.6 };
const TRACK = { ac: -106.5, b0: -61.5, b1: 36.5, rOut: 40.46, rIn: 30.7 };
const S_DIR = Math.atan2(-UX, -UZ);     // Bucket.box rotY whose local +x runs grid south
const HAM_GREEN = '#1c6b3c';
const text = (ctx, lines, o) => ctx.M.textDecal(lines, { align: 'center', weight: 800, spacing: '8px', ...o });
const fence = (ctx, pts, o) => { (ctx.fenceRuns = ctx.fenceRuns || []).push(pts); sharedFence(ctx, pts, o); };
const inPlayOf = (pb) => (x, z, m = 3) => x > pb.minX + m && x < pb.maxX - m && z > pb.minZ + m && z < pb.maxZ - m;

// ------------------------------------------------------------------------------------------ Al Michaels Field
function field(ctx) {
  const { B, quality } = ctx; const { ac, b0, b1, rOut, rIn } = TRACK; const lw = 1.22;
  const bMin = b0 - rOut - 1.1, bMax = b1 + rOut + 1.1, aMin = ac - rOut - 1.1, aMax = ac + rOut + 1.1;
  const ppm = quality === 'high' ? 14 : quality === 'low' ? 7 : 10; const W = Math.round((bMax - bMin) * ppm), H = Math.round((aMax - aMin) * ppm);
  const c = makeCanvas(W, H), g = c.getContext('2d'); const X = (b) => (b - bMin) * ppm, Y = (a) => (aMax - a) * ppm, Yc = Y(ac);
  const oval = (r) => { g.beginPath(); g.arc(X(b0), Yc, r * ppm, Math.PI / 2, Math.PI * 1.5); g.arc(X(b1), Yc, r * ppm, -Math.PI / 2, Math.PI / 2); g.closePath(); };
  oval(rOut + 0.6); g.fillStyle = '#a8503c'; g.fill();
  // infield: natural grass between the two rubber "D" aprons, mown in 5 yd bands, worn down the middle
  const bc = -12.5, YD = 0.9144, gl = 50 * YD, el = 60 * YD, hw = 26.67 * YD;
  g.save(); oval(rIn - 0.12); g.clip();
  // (the aerial photo shows a tired Bermuda-grass field: yellow-green, thin and brown down the middle and in front
  // of both goals, faint mowing bands, patchy everywhere; nothing like the even green of synthetic turf)
  g.fillStyle = '#62783a'; g.fillRect(X(-70), Y(ac + rIn), (45 + 70) * ppm, 2 * rIn * ppm);
  for (let k = -12; k < 12; k++) if (k & 1) { g.fillStyle = 'rgba(255,255,220,0.035)'; g.fillRect(X(bc + k * 5 * YD), Y(ac + rIn), 5 * YD * ppm, 2 * rIn * ppm); }
  const rnd = mulberry32(1931);
  const blot = (b, a, rb, ra, col) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, col); gr.addColorStop(0.6, col.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.55).toFixed(3) + ')')); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); g.save(); g.translate(X(b), Y(a)); g.rotate(rnd() * 3.1); g.scale(rb * ppm, ra * ppm); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); };
  for (let k = 0; k < 150; k++) blot(bc + (rnd() - 0.5) * 112, ac + (rnd() - 0.5) * 58, 2 + rnd() * 6, 1.5 + rnd() * 4, k % 3 ? `rgba(${150 + rnd() * 30 | 0},${146 + rnd() * 20 | 0},${78 + rnd() * 20 | 0},${(0.1 + rnd() * 0.14).toFixed(3)})` : `rgba(58,${92 + rnd() * 20 | 0},40,${(0.1 + rnd() * 0.12).toFixed(3)})`);   // dry and lush patches
  for (let k = 0; k < 70; k++) blot(bc + (rnd() - 0.5) * (k < 46 ? 74 : 20), ac + (rnd() - 0.5) * (k < 46 ? 12 : 16), 2.5 + rnd() * 5, 1.4 + rnd() * 2.6, `rgba(${128 + rnd() * 18 | 0},${104 + rnd() * 14 | 0},${66 + rnd() * 10 | 0},${(0.16 + rnd() * 0.2).toFixed(3)})`);   // worn to dirt between the hashes and at midfield
  for (const s2 of [-1, 1]) for (let k = 0; k < 9; k++) blot(bc + s2 * (el - 4 - rnd() * 14), ac + (rnd() - 0.5) * 12, 2 + rnd() * 3.5, 1.6 + rnd() * 2.6, `rgba(126,102,64,${(0.18 + rnd() * 0.2).toFixed(3)})`);   // goal mouths
  for (let k = 0; k < 1600; k++) { g.fillStyle = k & 1 ? `rgba(196,186,120,${0.05 + rnd() * 0.07})` : `rgba(40,66,30,${0.05 + rnd() * 0.07})`; const r = (0.25 + rnd() * 0.7) * ppm; g.beginPath(); g.ellipse(X(bc + (rnd() - 0.5) * 116), Y(ac + (rnd() - 0.5) * 62), r * 1.7, r, rnd() * 3, 0, 7); g.fill(); }
  // football: end zones, yard lines, hashes, numbers
  for (const [s, word] of [[-1, 'HAMILTON'], [1, 'YANKEES']]) {
    g.fillStyle = 'rgba(31,90,51,0.62)'; g.fillRect(X(Math.min(bc + s * gl, bc + s * el)), Y(ac + hw), 10 * YD * ppm, 2 * hw * ppm);   // end-zone paint sprayed on the grass, worn thin
    g.save(); g.translate(X(bc + s * (gl + el) / 2), Yc); g.rotate(s * Math.PI / 2); g.fillStyle = 'rgba(238,240,230,0.8)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(6.2 * ppm)}px Impact, "Arial Black", sans-serif`; g.fillText(word, 0, 0.3 * ppm, 2 * hw * ppm * 0.9); g.restore();
  }
  g.strokeStyle = 'rgba(238,240,230,0.78)'; g.fillStyle = 'rgba(238,240,230,0.78)'; g.lineWidth = Math.max(1.4, 0.11 * ppm);   // chalk on grass: softer than paint on turf
  g.strokeRect(X(bc - el), Y(ac + hw), 2 * el * ppm, 2 * hw * ppm);
  for (let k = -10; k <= 10; k++) { const b = bc + k * 5 * YD; g.beginPath(); g.moveTo(X(b), Y(ac + hw)); g.lineTo(X(b), Y(ac - hw)); g.stroke(); }
  for (let k = -49; k <= 49; k++) { if (k % 5 === 0) continue; const b = bc + k * YD; for (const a of [ac + hw - 0.4, ac + 8.13, ac - 8.13, ac - hw + 0.4]) g.fillRect(X(b) - 0.06 * ppm, Y(a) - 0.3 * ppm, 0.12 * ppm, 0.6 * ppm); }
  g.font = `700 ${Math.round(1.9 * ppm)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = -4; k <= 4; k++) { const n = String(50 - Math.abs(k) * 10); const b = bc + k * 10 * YD; g.fillText(n, X(b), Y(ac - hw + 8.2)); g.save(); g.translate(X(b), Y(ac + hw - 8.2)); g.rotate(Math.PI); g.fillText(n, 0, 0); g.restore(); }
  g.beginPath(); g.arc(X(bc), Yc, 4.6 * ppm, 0, 7); g.fillStyle = '#eef0e6'; g.fill(); g.fillStyle = HAM_GREEN; g.font = `900 ${Math.round(6.6 * ppm)}px Georgia, "Times New Roman", serif`; g.fillText('H', X(bc), Yc + 0.35 * ppm);
  g.restore();
  // lanes + lettering on the rubber, as painted on the real track
  g.strokeStyle = 'rgba(238,236,228,0.92)'; g.lineWidth = Math.max(1.1, 0.055 * ppm); for (let i = 0; i <= 8; i++) { oval(rIn + i * lw); g.stroke(); }
  g.lineWidth = Math.max(1.3, 0.09 * ppm); g.beginPath(); g.moveTo(X(b1), Y(ac - rIn)); g.lineTo(X(b1), Y(ac - rOut)); g.stroke();
  g.fillStyle = 'rgba(244,242,236,0.92)'; g.font = `800 ${Math.round(2.3 * ppm)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HAMILTON HIGH SCHOOL', X(-12), Y(ac - rIn - 4.3), 44 * ppm);
  g.save(); g.translate(X(b0 - 17.5), Yc); g.rotate(-Math.PI / 2); g.fillStyle = 'rgba(20,34,24,0.9)'; g.font = `900 ${Math.round(5.4 * ppm)}px Impact, "Arial Black", sans-serif`; g.fillText('YANKEES', 0, 0, 40 * ppm); g.restore();
  turfNoise(g, W, H, quality === 'low' ? 26 : 12, 31);
  { const m = G(ac, (bMin + bMax) / 2); paintedQuad(ctx, c, m[0], m[1], bMax - bMin, aMax - aMin, ANG, { cut: true, y: 0.018, nScale: 0.6, rough: 0.97 }); }

  // goal posts (tuning-fork style, yellow) on the end lines, soccer goals parked beside them
  for (const s of [-1, 1]) {
    const p = B.v('paint', true); p.setColor(0.95, 0.72, 0.05); const base = G(ac, bc + s * (el + 1.6)), bar = G(ac, bc + s * el), l = G(ac - 3.555, bc + s * el), r = G(ac + 3.555, bc + s * el);
    p.cyl(base[0], 0, base[1], 0.085, 0.085, 3.05, 10, 1, true).tube([base[0], 3.05, base[1]], [bar[0], 3.05, bar[1]], 0.085, 8).tube([l[0], 3.05, l[1]], [r[0], 3.05, r[1]], 0.07, 8).cyl(l[0], 3.05, l[1], 0.05, 0.05, 6.1, 8, 1, true).cyl(r[0], 3.05, r[1], 0.05, 0.05, 6.1, 8, 1, true);
    p.setColor(0.07, 0.36, 0.17).cyl(base[0], 0, base[1], 0.2, 0.2, 1.8, 10, 1, true); p.setColor(1, 1, 1);
    B.c('metal').box(base[0], 1.5, base[1], 0.5, 3.0, 0.5); ctx.grapplePoles.push({ x: base[0], z: base[1], y0: 1, y1: 3.05, r: 0.1 });
    const sg = G(ac + 15, bc + s * (el - 1.2)); landmarkKit.soccerGoal(ctx, sg[0], sg[1], s > 0 ? S_DIR - Math.PI / 2 : S_DIR + Math.PI / 2);
  }
  // home stand along Canfield Ave (two aluminium banks either side of the centre aisle) with the press box behind it
  const wDir = Math.atan2(-UX, -UZ);
  for (const [bs, len] of [[-64, 44], [-16, 43]]) { const p = G(ac - rOut - 2.2, bs); bleachers(ctx, { x: p[0], z: p[1], dir: wDir, len, rows: 8, run: 0.7, rise: 0.34, frontH: 0 }); }
  { const pt = B.v('paint', true); const p = gbox(B, 'whitePanel', 'metal', ac - rOut - 9.2, -18, 3.3, 2.6, 2.7, 13, 1); B.v('frame').box(p[0], 6.06, p[1], 3.0, 0.12, 13.4, ROT); B.v('glassInt').box(p[0] + UX * 1.31, 4.9, p[1] + UZ * 1.31, 0.03, 1.1, 12.2, ROT);
    for (const b of [-23.5, -12.5]) { const q = G(ac - rOut - 9.2, b); B.v('galv').box(q[0], 1.65, q[1], 0.25, 3.3, 0.25, ROT); B.c('metal').box(q[0], 1.65, q[1], 0.3, 3.3, 0.3, ROT); }
    pt.setColor(1, 1, 1); }
  { const p = G(ac + rOut + 1.3, -52); bleachers(ctx, { x: p[0], z: p[1], dir: wDir + Math.PI, len: 38, rows: 3, run: 0.62, rise: 0.25, frontH: 0 }); }   // visitors' side under the gym wall
  // floodlight masts (service decks on top: grapple perches) and the scoreboard over the north bend
  for (const [a, b, f] of [[ac - rOut - 3.2, -72, ROT + Math.PI / 2], [ac + rOut + 3.4, -76, ROT - Math.PI / 2], [ac - rOut - 3.2, 46, ROT + Math.PI / 2], [ac + rOut + 3.4, 62, ROT - Math.PI / 2]]) { const p = G(a, b); landmarkKit.lightPole(ctx, p[0], p[1], 22, f, 3); }
  {
    const p = G(ac + 30, b0 - rOut - 3.2); const rot = ROT + 0.5; const pt = B.v('paint', true); const c2 = Math.cos(rot), s2 = Math.sin(rot);
    pt.setColor(0.04, 0.05, 0.05).box(p[0], 5.4, p[1], 7.6, 3.0, 0.3, rot); pt.setColor(0.07, 0.36, 0.17).box(p[0], 7.3, p[1], 7.6, 0.8, 0.32, rot); pt.setColor(1, 1, 1);
    for (const k of [-2.9, 2.9]) { B.v('galv').cyl(p[0] + k * c2, 0, p[1] - k * s2, 0.11, 0.11, 4.0, 8, 1, false); B.c('metal').box(p[0] + k * c2, 2.0, p[1] - k * s2, 0.3, 4.0, 0.3); }
    B.c('metal').box(p[0], 5.8, p[1], 7.6, 3.8, 0.35, rot);
    let F = edgeFrame(p[0] + 3.8 * c2 - 0.17 * s2, p[1] - 3.8 * s2 - 0.17 * c2, p[0] - 3.8 * c2 - 0.17 * s2, p[1] + 3.8 * s2 - 0.17 * c2); const fc = G(ac, bc);
    if ((F.nx * (fc[0] - p[0]) + F.nz * (fc[1] - p[1])) < 0) F = edgeFrame(p[0] - 3.8 * c2 + 0.17 * s2, p[1] + 3.8 * s2 + 0.17 * c2, p[0] + 3.8 * c2 + 0.17 * s2, p[1] - 3.8 * s2 + 0.17 * c2);
    wallDecal(ctx, text(ctx, ['AL MICHAELS FIELD'], { w: 1024, h: 110, font: 72, color: '#f2f0e6', bg: '#125c2c' }), F, F.L / 2, 7.3, 7.4, 0.76, 0.03, { opaque: true });
    const tc = makeCanvas(1024, 400), g2 = tc.getContext('2d'); g2.fillStyle = '#0b0d0c'; g2.fillRect(0, 0, 1024, 400); g2.fillStyle = '#e9e7de'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.font = '700 46px Arial'; g2.fillText('YANKEES', 220, 70); g2.fillText('GUEST', 804, 70); g2.fillText('QTR', 512, 250);
    g2.fillStyle = '#ffb21a'; g2.font = '800 150px "Courier New", monospace'; g2.fillText('21', 220, 210); g2.fillText('14', 804, 210); g2.font = '800 96px "Courier New", monospace'; g2.fillText('07:42', 512, 130); g2.fillText('3', 512, 330);
    wallDecal(ctx, canvasTexture(tc, { repeat: false }), F, F.L / 2, 5.4, 7.4, 2.9, 0.03, { opaque: true, rough: 0.5 });
  }
  // sideline kit: benches, bins, hurdle carts, the pole-vault pit on the south bend
  for (const b of [-34, -22, -6, 8]) { const p = G(ac - hw - 5.2, b); propKit.bench(ctx, p[0], p[1], ROT + Math.PI / 2); const q = G(ac + hw + 5.2, b); propKit.bench(ctx, q[0], q[1], ROT - Math.PI / 2); }
  const pt = B.v('paint', true);
  for (const [a, b, w, h, d, col] of [[ac - 6, b1 + 22, 5.2, 0.7, 4.0, [0.08, 0.18, 0.5]], [ac + 12, b1 + 26, 1.4, 1.2, 2.6, [0.07, 0.36, 0.17]], [ac - 19, b0 - 24, 3.2, 1.1, 1.2, [0.3, 0.32, 0.34]], [ac + 22, b0 - 15, 1.3, 1.4, 1.3, [0.07, 0.36, 0.17]], [ac - hw - 6.4, 22, 1.2, 1.1, 2.4, [0.9, 0.5, 0.1]], [ac + hw + 6.4, -44, 1.2, 1.1, 2.4, [0.1, 0.1, 0.11]]]) {
    const p = G(a, b); pt.setColor(...col).box(p[0], h / 2, p[1], w, h, d, ROT); B.c('rubber').box(p[0], h / 2, p[1], w, h, d, ROT); propKit.registerProp(ctx, 'pad', p[0], p[1], ROT, w, d, h);
  }
  pt.setColor(1, 1, 1);
}

// ------------------------------------------------------------------------------------------ ball courts
function courts(ctx) {
  const { B, quality } = ctx; const a0 = -31, a1 = -7, b0 = -72, b1 = 10; const ppm = quality === 'low' ? 7 : 11; const W = Math.round((b1 - b0) * ppm), H = Math.round((a1 - a0) * ppm);
  const c = makeCanvas(W, H), g = c.getContext('2d'); const X = (b) => (b - b0) * ppm, Y = (a) => (a1 - a) * ppm; g.strokeStyle = 'rgba(236,233,224,0.85)'; g.lineWidth = Math.max(1.3, 0.06 * ppm);
  const ac = -19;
  for (const bc of [-56.5, -30.5, -4.5]) {
    g.strokeRect(X(bc - 12.4), Y(ac + 7.62), 24.8 * ppm, 15.24 * ppm); g.beginPath(); g.moveTo(X(bc), Y(ac + 7.62)); g.lineTo(X(bc), Y(ac - 7.62)); g.stroke(); g.beginPath(); g.arc(X(bc), Y(ac), 1.83 * ppm, 0, 7); g.stroke();
    for (const s of [-1, 1]) {
      const be = bc + s * 12.4; g.strokeRect(X(Math.min(be, be - s * 5.8)), Y(ac + 1.83), 5.8 * ppm, 3.66 * ppm); g.beginPath(); g.arc(X(be - s * 5.8), Y(ac), 1.83 * ppm, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); g.stroke();
      g.beginPath(); g.arc(X(be - s * 1.6), Y(ac), 6.02 * ppm, s > 0 ? Math.PI * 0.5 + 0.2 : -Math.PI * 0.5 + 0.2, s > 0 ? Math.PI * 1.5 - 0.2 : Math.PI * 0.5 - 0.2); g.stroke();
      // hoop: pole behind the baseline, backboard, rim
      const p = G(ac, be + s * 1.0), bb = G(ac, be - s * 0.9); B.v('galv').cyl(p[0], 0, p[1], 0.09, 0.07, 3.6, 8, 1, true).tube([p[0], 3.5, p[1]], [bb[0], 3.4, bb[1]], 0.05, 5); B.v('whitePanel').box(bb[0], 3.35, bb[1], 1.8, 1.07, 0.05, ROT);
      B.v('paint', true).setColor(0.85, 0.3, 0.05).box(bb[0] - s * (-UZ) * 0.28, 3.05, bb[1] - s * UX * 0.28, 0.46, 0.03, 0.46, ROT); B.v('paint', true).setColor(1, 1, 1);
      B.c('metal').box(p[0], 1.8, p[1], 0.3, 3.6, 0.3); B.c('metal').box(bb[0], 3.35, bb[1], 1.8, 1.07, 0.1, ROT); ctx.grapplePoles.push({ x: p[0], z: p[1], y0: 1, y1: 3.6, r: 0.09 });
    }
  }
  const m = G((a0 + a1) / 2, (b0 + b1) / 2); paintedQuad(ctx, c, m[0], m[1], b1 - b0, a1 - a0, ANG, { blend: true, y: 0.014, nScale: 1.2, nStrength: 0.2, rough: 0.92 });
}

// ------------------------------------------------------------------------------------------ construction
// spoil heap / stockpile: a lumpy cone with a rounded top, earth (or gravel / sand) texture, solid
function mound(ctx, a, b, r, h, seed, kind = 'dirt') {
  const { B } = ctx; const p = G(a, b); const rnd = mulberry32(seed); const N = 16, R = 5; const vb = B.v('hamDirt', true);
  const tone = kind === 'dirt' ? [0.6, 0.45, 0.31] : kind === 'sand' ? [0.86, 0.74, 0.52] : [0.38, 0.38, 0.37];
  const top = [p[0] + (rnd() - 0.5) * r * 0.25, h, p[1] + (rnd() - 0.5) * r * 0.25]; const rings = [];
  for (let j = 0; j < R; j++) { const t = j / R, ring = []; const rr0 = r * (1 - t * 0.78), y = h * (1 - (1 - t) * (1 - t)) * 0.96; for (let k = 0; k < N; k++) { const an = k / N * Math.PI * 2 + j * 0.2, jit = kind === 'dirt' ? 0.16 : 0.05, rr = rr0 * (1 - jit + rnd() * 2 * jit); ring.push([p[0] + (top[0] - p[0]) * t + Math.cos(an) * rr, j ? y * (1 - jit * 0.6 + rnd() * jit * 1.2) : 0, p[1] + (top[2] - p[1]) * t + Math.sin(an) * rr]); } rings.push(ring); }
  const uv = (q) => [q[0] / 2.2, q[2] / 2.2 + q[1] / 2.2];
  const tri = (A, Bq, C) => { const sh = 0.9 + rnd() * 0.16; vb.setColor(tone[0] * sh, tone[1] * sh, tone[2] * sh); const ux = Bq[0] - A[0], uy = Bq[1] - A[1], uz = Bq[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]; const up = uz * vx - ux * vz >= 0; for (const bk of [vb, B.c('dirt')]) { if (up) bk.tri(A, Bq, C, uv(A), uv(Bq), uv(C)); else bk.tri(Bq, A, C, uv(Bq), uv(A), uv(C)); } };
  for (let j = 0; j < R - 1; j++) for (let k = 0; k < N; k++) { const A = rings[j][k], Bq = rings[j][(k + 1) % N], C = rings[j + 1][(k + 1) % N], D = rings[j + 1][k]; tri(A, Bq, C); tri(A, C, D); }
  for (let k = 0; k < N; k++) tri(rings[R - 1][k], rings[R - 1][(k + 1) % N], top);
  vb.setColor(1, 1, 1);
}
// box-shaped stack helpers in street-grid coordinates: everything is solid as one box (the footprint is registered)
function siteStack(ctx, kind, a, b, w, h, d, r) {
  const { B } = ctx; const p = G(a, b), rot = ROT + r; const c = Math.cos(rot), sn = Math.sin(rot); const L = (lx, y, lz) => [p[0] + lx * c + lz * sn, y, p[1] - lx * sn + lz * c]; const pt = B.v('paint', true);
  const pallet = (lx, lz, pw, pd) => { const q = L(lx, 0.07, lz); B.v('wood').box(q[0], 0.07, q[2], pw, 0.14, pd, rot, 0.6); };
  if (kind === 'pipes') { // concrete drain pipes on timber bearers, chocked
    const rr = Math.min(h / 2 - 0.06, d / 4 - 0.02), n = Math.max(1, Math.floor(d / (2 * rr))); for (const lx of [-w * 0.3, w * 0.3]) { const q = L(lx, 0.05, 0); B.v('wood').box(q[0], 0.05, q[2], 0.14, 0.1, d, rot, 0.6); }
    for (let k = 0; k < n; k++) { const lz = (k - (n - 1) / 2) * 2 * rr; B.v('concrete').tube(L(-w / 2, 0.1 + rr, lz), L(w / 2, 0.1 + rr, lz), rr, 12, 1 / 3); pt.setColor(0.07, 0.07, 0.07); pt.tube(L(-w / 2 - 0.01, 0.1 + rr, lz), L(-w / 2 + 0.02, 0.1 + rr, lz), rr * 0.82, 10); pt.tube(L(w / 2 - 0.02, 0.1 + rr, lz), L(w / 2 + 0.01, 0.1 + rr, lz), rr * 0.82, 10); }
  } else if (kind === 'lumber') { // banded packs of studs on bearers
    const layers = Math.max(1, Math.floor((h - 0.1) / 0.3)); for (let j = 0; j < layers; j++) { const y = 0.1 + j * 0.3 + 0.13; const q = L((j % 2) * 0.08, y, 0); B.v('wood').box(q[0], y, q[2], w - 0.1, 0.26, d - 0.12 - (j % 2) * 0.1, rot, 0.5); }
    pt.setColor(0.1, 0.1, 0.1); for (const lx of [-w * 0.3, 0, w * 0.3]) { const q = L(lx, h / 2, 0); pt.box(q[0], h / 2 + 0.05, q[2], 0.03, h - 0.08, d - 0.08, rot); } for (const lx of [-w * 0.35, w * 0.35]) { const q = L(lx, 0.05, 0); B.v('wood').box(q[0], 0.05, q[2], 0.12, 0.1, d, rot, 0.6); }
  } else if (kind === 'blocks') { // pallets of concrete masonry units, shrink-wrapped tops
    const n = Math.max(1, Math.round(w / 1.2)), pw = w / n - 0.12; const bk = B.v('hamBlock', true); bk.setColor(0.72, 0.72, 0.7); for (let k = 0; k < n; k++) { const lx = (k - (n - 1) / 2) * (w / n); pallet(lx, 0, pw, d - 0.05); const q = L(lx, 0, 0); bk.box(q[0], 0.14 + (h - 0.14) / 2, q[2], pw - 0.06, h - 0.14, d - 0.14, rot, 0.45); } bk.setColor(1, 1, 1);
  } else if (kind === 'forms') { // plywood formwork panels leaning in a rack + scaffold tubes
    const n = 6; for (let k = 0; k < n; k++) { const lz = -d / 2 + 0.12 + k * (d * 0.6) / n; const q = L(0, h / 2, lz); B.v('wood').box(q[0], h / 2 + 0.02, q[2], w - 0.2, h - 0.06, 0.05, rot, 0.4); }
    for (let k = 0; k < 5; k++) B.v('galv').tube(L(-w / 2 + 0.1, 0.1 + (k % 3) * 0.1, d / 2 - 0.12 - Math.floor(k / 3) * 0.1), L(w / 2 - 0.1, 0.1 + (k % 3) * 0.1, d / 2 - 0.12 - Math.floor(k / 3) * 0.1), 0.045, 6);
  } else if (kind === 'generator') { // towable generator / light plant: yellow canopy, louvres, drawbar, wheels
    pt.setColor(0.86, 0.6, 0.06); const q = L(0, 0, 0); pt.box(q[0], 0.4 + (h - 0.4) / 2, q[2], w - 0.5, h - 0.4, d - 0.25, rot); pt.setColor(0.1, 0.1, 0.1); for (const sz of [-1, 1]) { const f = L(0, 0.95, sz * (d / 2 - 0.12)); pt.box(f[0], 0.95, f[2], (w - 0.5) * 0.6, 0.5, 0.02, rot); for (const lx of [-0.45, 0.45]) pt.tube(L(lx, 0.33, sz * (d / 2 - 0.2)), L(lx, 0.33, sz * (d / 2 - 0.02)), 0.33, 10); }
    pt.setColor(0.2, 0.2, 0.2); pt.tube(L(w / 2 - 0.3, 0.42, 0), L(w / 2, 0.36, 0), 0.04, 5); pt.box(q[0], 0.36, q[2], w - 0.5, 0.1, d - 0.5, rot);
  } else { // bagged cement on a pallet
    pallet(0, 0, w - 0.05, d - 0.05); pt.setColor(0.7, 0.66, 0.56); for (let j = 0; j < 5; j++) { const y = 0.14 + (j + 0.5) * (h - 0.14) / 5; const q = L((j % 2) * 0.04 - 0.02, y, 0); pt.box(q[0], y, q[2], w - 0.14, (h - 0.14) / 5 - 0.02, d - 0.14, rot); }
  }
  pt.setColor(1, 1, 1); B.c(kind === 'lumber' || kind === 'forms' ? 'wood' : 'metal').box(p[0], h / 2, p[1], w, h, d, rot); propKit.registerProp(ctx, 'crate', p[0], p[1], rot, w, d, h);
}
// tracked excavator parked with the bucket on the ground (solid; footprint registered)
function excavator(ctx, a, b, r) {
  const { B } = ctx; const p = G(a, b), rot = ROT + r; const c = Math.cos(rot), sn = Math.sin(rot); const L = (lx, y, lz) => [p[0] + lx * c + lz * sn, y, p[1] - lx * sn + lz * c]; const pt = B.v('paint', true); const bx = (lx, y, lz, w, h, d) => { const q = L(lx, y, lz); pt.box(q[0], y, q[2], w, h, d, rot); };
  pt.setColor(0.07, 0.07, 0.07); for (const sz of [-1.05, 1.05]) { bx(0, 0.38, sz, 3.7, 0.76, 0.5); for (const lx of [-1.85, 1.85]) pt.tube(L(lx, 0.38, sz - 0.25), L(lx, 0.38, sz + 0.25), 0.38, 10); }
  pt.setColor(0.16, 0.16, 0.17); bx(0, 0.72, 0, 2.0, 0.3, 1.7); pt.setColor(0.9, 0.62, 0.04); bx(-0.35, 1.5, 0, 3.1, 1.25, 2.5); pt.setColor(0.12, 0.12, 0.13); bx(-1.75, 1.35, 0, 0.5, 0.95, 2.3);   // slew ring, house, counterweight
  pt.setColor(0.9, 0.62, 0.04); bx(0.55, 2.55, 0.72, 1.25, 0.9, 1.0); bx(0.55, 3.03, 0.72, 1.35, 0.07, 1.1); { const q = L(1.19, 2.55, 0.72); B.v('glass').box(q[0], 2.55, q[2], 0.03, 0.8, 0.9, rot); } for (const sz of [0.21, 1.23]) { const q = L(0.55, 2.55, sz); B.v('glass').box(q[0], 2.55, q[2], 1.1, 0.75, 0.03, rot); }
  // boom, stick, bucket (two-piece arm folded forward), hydraulic rams
  const j0 = L(0.9, 1.9, -0.35), j1 = L(3.6, 4.4, -0.35), j2 = L(5.6, 1.5, -0.35), j3 = L(5.3, 0.45, -0.35); pt.setColor(0.9, 0.62, 0.04); pt.tube(j0, j1, 0.2, 6); pt.tube(j1, j2, 0.16, 6); pt.setColor(0.75, 0.75, 0.76); pt.tube(L(1.6, 1.5, -0.35), L(2.6, 3.2, -0.35), 0.07, 6); pt.tube(L(3.0, 4.2, -0.35), L(4.4, 3.5, -0.35), 0.06, 6);
  pt.setColor(0.2, 0.2, 0.21); pt.tube(j2, j3, 0.1, 5); { const q = L(5.05, 0.42, -0.35); pt.box(q[0], 0.42, q[2], 0.95, 0.75, 1.0, rot); } pt.setColor(1, 1, 1);
  { const q = L(-0.1, 1.55, 0); B.c('metal').box(q[0], 1.55, q[2], 3.9, 3.1, 2.6, rot); propKit.registerProp(ctx, 'excavator', q[0], q[2], rot, 3.9, 2.6, 3.1); const m = L(4.2, 1.3, -0.35); B.c('metal').box(m[0], 1.5, m[2], 3.2, 3.0, 0.5, rot); const k = L(5.05, 0.42, -0.35); B.c('metal').box(k[0], 0.42, k[2], 0.95, 0.84, 1.0, rot); }
}
// site office: a white portable cabin on blocks with a door, steps, windows, an A/C unit and the contractor's board
function siteOffice(ctx, a, b, r) {
  const { B } = ctx; const p = G(a, b), rot = ROT + r; const w = 7.2, d = 3.0, h = 2.7, y0 = 0.35; const c = Math.cos(rot), sn = Math.sin(rot); const L = (lx, y, lz) => [p[0] + lx * c + lz * sn, y, p[1] - lx * sn + lz * c];
  B.v('whitePanel').box(p[0], y0 + h / 2, p[1], w, h, d, rot); B.v('frame').box(p[0], y0 + h + 0.04, p[1], w + 0.12, 0.08, d + 0.12, rot); for (const lx of [-3, -1, 1, 3]) for (const lz of [-1.2, 1.2]) { const q = L(lx, 0.17, lz); B.v('concrete').box(q[0], 0.17, q[2], 0.4, 0.35, 0.4, rot, 1 / 3); }
  const F = edgeFrame(...L(-w / 2, 0, d / 2).filter((_, k) => k !== 1), ...L(w / 2, 0, d / 2).filter((_, k) => k !== 1)); const Ff = (F.nx * (L(0, 0, d)[0] - p[0]) + F.nz * (L(0, 0, d)[2] - p[1])) > 0 ? F : edgeFrame(...L(w / 2, 0, d / 2).filter((_, k) => k !== 1), ...L(-w / 2, 0, d / 2).filter((_, k) => k !== 1));
  fbox(B.v('frame'), Ff, 1.0, 1.95, y0 + 0.05, y0 + 2.1, 0, 0.04, 1, 0, 'fst'); { const pt = B.v('paint', true); pt.setColor(0.2, 0.3, 0.42); fbox(pt, Ff, 1.06, 1.89, y0 + 0.08, y0 + 2.04, 0.04, 0.06, 1, 0, 'f'); pt.setColor(1, 1, 1); }
  for (const u of [3.0]) { fbox(B.v('frame'), Ff, u - 0.6, u + 0.6, y0 + 1.0, y0 + 1.95, 0, 0.04, 1, 0, 'fstb'); wallRect(B.v('glassInt'), Ff, u - 0.54, u + 0.54, y0 + 1.06, y0 + 1.89, 0.045, [u + 1, 1, u, 2]); }
  fbox(B.v('galv'), Ff, 0.75, 2.2, 0, y0, 0.02, 1.1, 1, 0, 'fst'); fbox(B.v('galv'), Ff, 0.75, 2.2, 0, y0 * 0.5, 1.1, 1.45, 1, 0, 'fst'); fbox(B.v('galv'), Ff, 6.3, 7.0, y0 + 1.5, y0 + 2.1, 0, 0.45, 1, 0, 'fstb');
  wallDecal(ctx, text(ctx, ['LAUSD', 'HAMILTON HS', 'MODERNIZATION'], { w: 1024, h: 512, font: 104, color: '#f1efe6', bg: '#1c4f7a', weight: 700 }), Ff, 5.0, y0 + 1.45, 2.2, 1.1, 0.05, { opaque: true });
  B.c('metal').box(p[0], (y0 + h) / 2, p[1], w, y0 + h, d, rot); { const q = L(-w / 2 + 1.47, y0 / 2, d / 2 + 0.72); B.c('metal').box(q[0], y0 / 2, q[2], 1.45, y0, 1.45, rot); } propKit.registerProp(ctx, 'siteOffice', p[0], p[1], rot, w, d, y0 + h);
}
function cones(ctx, list) { const { B } = ctx; const pt = B.v('paint', true); for (const [a, b] of list) { const p = G(a, b); pt.setColor(0.07, 0.07, 0.07).box(p[0], 0.02, p[1], 0.36, 0.04, 0.36, ROT); pt.setColor(0.95, 0.38, 0.04).cyl(p[0], 0.04, p[1], 0.13, 0.03, 0.66, 8, 1, true); pt.setColor(0.92, 0.92, 0.9).cyl(p[0], 0.36, p[1], 0.079, 0.058, 0.12, 8, 1, false); } pt.setColor(1, 1, 1); }
function construction(ctx) {
  const { B } = ctx;
  // the quad is a building site (LAUSD comprehensive modernisation): screened fence with gates, spoil heaps and gravel /
  // sand stockpiles, an excavator, the site office, pipe and lumber stacks, block pallets, a generator, skips, and
  // the old octagonal lunch pavilion still standing in the middle
  const q = [G(5.5, -24.5), G(66.8, -24.5), G(66.8, 24.5), G(5.5, 24.5), G(5.5, -24.5)];
  fence(ctx, q, { h: 2.4, screen: 2.0, every: 3, gaps: [[26, 32], [84, 90], [142, 148], [196, 201]] });
  mound(ctx, 22, -10, 5.2, 2.1, 3); mound(ctx, 34, 8, 4.2, 1.6, 4, 'gravel'); mound(ctx, 16, 12, 3.4, 1.3, 5); mound(ctx, 44, -15, 3.0, 1.2, 6, 'sand');
  { const p2 = G(60, 14); propKit.container(ctx, p2[0], p2[1], ROT, [0.12, 0.25, 0.42]); const p3 = G(60, 17.6); propKit.container(ctx, p3[0], p3[1], ROT, [0.5, 0.12, 0.1]); }
  siteOffice(ctx, 12, -4, Math.PI / 2);
  { const p = G(28, 19); propKit.portaPotty(ctx, p[0], p[1], ROT); const p2 = G(30, 19); propKit.portaPotty(ctx, p2[0], p2[1], ROT); const d = G(46, 19.5); propKit.dumpster(ctx, d[0], d[1], ROT, [0.1, 0.16, 0.3]); }
  for (const [kind, a, b, w, h, d, r] of [['pipes', 40, -6, 6.0, 0.9, 1.4, 0.3], ['lumber', 50, 4, 6.0, 0.6, 1.2, -0.2], ['generator', 26, 2, 2.4, 1.5, 1.6, 0], ['blocks', 14, 20, 3.6, 1.1, 1.2, 0], ['forms', 36, -19, 4.8, 1.3, 1.1, 0], ['bags', 48, 14, 1.2, 1.0, 1.2, 0.4]]) siteStack(ctx, kind, a, b, w, h, d, r);
  excavator(ctx, 31.5, -12.5, -0.5);
  cones(ctx, [[28, -22], [31, -22], [22, 22.5], [35, 22.5], [9, 10], [9, 14], [63, -10], [63, -6], [41, 1], [44, -2]]);
  // trench with a plywood cover and caution tape on pickets beside the excavator
  { const tb = B.v('paint', true); const P = (a, b, y) => { const p = G(a, b); return [p[0], y, p[1]]; }; const m = G(38, -11.5); B.v('wood').box(m[0], 0.03, m[1], 2.4, 0.05, 1.3, ROT + 0.2, 0.4); B.v('wood').box(m[0] + 0.5, 0.07, m[1] + 0.9, 2.4, 0.05, 1.2, ROT - 0.1, 0.4);
    const pk = [[35.5, -14.5], [41.5, -14.5], [41.5, -9], [35.5, -9]]; for (const [a, b] of pk) { const p = G(a, b); tb.setColor(0.75, 0.75, 0.74).cyl(p[0], 0, p[1], 0.02, 0.02, 1.1, 5, 1, true); } tb.setColor(0.95, 0.8, 0.05); for (let k = 0; k < 3; k++) { const A = P(...pk[k], 0.95), Bq = P(...pk[k + 1], 0.95); quadFacing(tb, A, Bq, [Bq[0], 0.87, Bq[2]], [A[0], 0.87, A[2]], [0, 0, 1]); quadFacing(tb, Bq, A, [A[0], 0.87, A[2]], [Bq[0], 0.87, Bq[2]], [0, 0, 1]); } tb.setColor(1, 1, 1); }
  { // octagonal pavilion: eight posts, low tiled roof (solid: you can stand on it)
    const p = G(55.5, -11.5), R = 4.3, eave = 2.9, rise = 1.5; const sh = B.v('shingles', true); sh.setColor(1.6, 1.5, 1.4);
    for (let k = 0; k < 8; k++) { const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2; const A = [p[0] + Math.cos(a0) * R, eave, p[1] + Math.sin(a0) * R], Bq = [p[0] + Math.cos(a1) * R, eave, p[1] + Math.sin(a1) * R], T = [p[0], eave + rise, p[1]];
      for (const bk of [sh, B.c('wood')]) bk.tri(Bq, A, T, [1, 0], [0, 0], [0.5, 1]); B.v('frame').tri(A, Bq, [p[0], eave, p[1]]);
      const px = p[0] + Math.cos(a0) * (R - 0.5), pz = p[1] + Math.sin(a0) * (R - 0.5); B.v('whitePanel').cyl(px, 0, pz, 0.11, 0.11, eave, 8, 1, false); B.c('wood').box(px, eave / 2, pz, 0.26, eave, 0.26); }
    sh.setColor(1, 1, 1); B.v('concrete').cyl(p[0], 0, p[1], R + 0.3, R + 0.3, 0.06, 16, 1 / 3, true);
  }
  // contractor's staging yard north of the gyms: containers, skips, plant, barriers on the campus side
  for (const [a, b, r, col] of [[-6.5, -118, Math.PI / 2, [0.25, 0.27, 0.28]], [-22, -121, Math.PI / 2, [0.5, 0.12, 0.1]], [-39, -120, Math.PI / 2, [0.78, 0.74, 0.62]], [-30, -86, 0, [0.12, 0.25, 0.42]], [-6, -62, Math.PI / 2, [0.82, 0.8, 0.74]]]) { const p = G(a, b); propKit.container(ctx, p[0], p[1], ROT + r, col); }
  for (const [a, b, r] of [[-46, -104, 0.2], [-14, -100, -0.3]]) { const p = G(a, b); propKit.dumpster(ctx, p[0], p[1], ROT + r); }
  mound(ctx, -24, -103, 4.4, 1.7, 9); mound(ctx, -60, -98, 3.2, 1.2, 10, 'gravel'); mound(ctx, -18, -54, 2.8, 1.1, 11);
  for (const [a, b] of [[-70, -78.5], [-62, -78.5], [-12, -77.5], [-4, -77.5]]) { const p = G(a, b); propKit.barrier(ctx, p[0], p[1], ROT, 3.4); }
  { const p = G(-50, -124); propKit.portaPotty(ctx, p[0], p[1], ROT); }
}

// ------------------------------------------------------------------------------------------ flag + palms
function usFlag(ctx, x, z) {
  const { B, scene } = ctx; const H = 11;
  B.v('aluminum').cyl(x, 0, z, 0.08, 0.045, H, 10, 1, true); B.v('concrete').cyl(x, 0, z, 0.32, 0.32, 0.25, 12, 1 / 3, true);
  B.v('lightEmit').cyl(x, H, z, 0.07, 0.07, 0.12, 8, 1, true); B.c('metal').box(x, 2, z, 0.3, 4, 0.3); ctx.grapplePoles.push({ x, z, y0: 1, y1: H, r: 0.08 });
  const W = 512, Hh = 320, c = makeCanvas(W, Hh), g = c.getContext('2d');
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#e9e7e2' : '#a8202f'; g.fillRect(0, (i * Hh) / 13, W, Hh / 13 + 1); }
  g.fillStyle = '#34335f'; g.fillRect(0, 0, W * 0.4, (Hh * 7) / 13); g.fillStyle = '#eee';
  for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) { g.beginPath(); g.arc(W * 0.4 * ((k + (r % 2 ? 1 : 0.5)) / 6), (Hh * 7 / 13) * ((r + 0.7) / 9.4), 4.2, 0, 7); g.fill(); }
  const geo = new THREE.PlaneGeometry(2.6, 1.6, 16, 6); const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 1.3) / 2.6; p.setZ(i, Math.sin(u * 7 + x) * 0.14 * u); p.setY(i, p.getY(i) - 0.24 * u * u); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: canvasTexture(c, { repeat: false }), side: THREE.DoubleSide, roughness: 0.85 }));
  m.position.set(x + 1.35, H - 1.0, z); m.castShadow = true; m.name = 'flag-us'; scene.add(m);
}
// Mexican fan palms: tall bare trunks with a small drooping crown (static geometry, trunk solid + grapple target)
function palms(ctx, list) {
  const { B, M, T } = ctx;
  if (!M.palmFrond) {
    const W = 128, H = 256, c = makeCanvas(W, H), g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    for (let k = -9; k <= 9; k++) { const a = k / 9 * 1.15; g.strokeStyle = k & 1 ? '#3f6b2c' : '#4f7c33'; g.lineWidth = 7; g.beginPath(); g.moveTo(W / 2, H - 4); g.lineTo(W / 2 + Math.sin(a) * (H - 30) * 0.62, H - 4 - Math.cos(a) * (H - 30)); g.stroke(); }
    g.strokeStyle = '#6b6a3a'; g.lineWidth = 5; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, H * 0.55); g.stroke();
    M.palmFrond = new THREE.MeshStandardMaterial({ map: canvasTexture(c, { repeat: false, aniso: T.aniso }), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 });
    const bc = makeCanvas(64, 64), bg = bc.getContext('2d'); bg.fillStyle = '#6f6557'; bg.fillRect(0, 0, 64, 64); for (let y = 0; y < 64; y += 8) { bg.fillStyle = 'rgba(40,34,28,0.5)'; bg.fillRect(0, y, 64, 2); bg.fillStyle = 'rgba(190,180,160,0.2)'; bg.fillRect(0, y + 3, 64, 2); }
    M.palmTrunk = new THREE.MeshStandardMaterial({ map: canvasTexture(bc, { aniso: T.aniso }), roughness: 0.95 });
  }
  const fr = B.v('palmFrond'), tr = B.v('palmTrunk'); const rnd = mulberry32(90034);
  for (const [x, z, hIn] of list) {
    const h = hIn || 13 + rnd() * 6; const lean = [(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9];
    tr.cyl(x, 0, z, 0.3, 0.2, h * 0.5, 7, 0.5, false); tr.tube([x, h * 0.5, z], [x + lean[0], h, z + lean[1]], 0.19, 7, 0.5);
    B.c('wood').box(x, h / 2, z, 0.5, h, 0.5); ctx.grapplePoles.push({ x, z, y0: 1, y1: h, r: 0.25 }); (ctx.trunks || (ctx.trunks = [])).push([x, z, 0.3]);
    const cx = x + lean[0], cz = z + lean[1]; const n = 11;
    for (let k = 0; k < n; k++) {
      const an = k / n * Math.PI * 2 + rnd(), up = k % 3 === 0 ? 0.9 : k % 3 === 1 ? 0.25 : -0.5, len = 2.3 + rnd() * 0.7, wd = 1.5;
      const dx = Math.cos(an), dz = Math.sin(an), px = -dz * wd / 2, pz = dx * wd / 2; const ch = Math.cos(up) * len, cv = Math.sin(up) * len;
      for (let q = 0; q < 4; q++) { const f0 = q / 4 * 2 - 1, f1 = (q + 1) / 4 * 2 - 1; fr.quad([cx + px * f0, h - 0.1, cz + pz * f0], [cx + px * f1, h - 0.1, cz + pz * f1], [cx + dx * ch + px * f1, h + cv, cz + dz * ch + pz * f1], [cx + dx * ch + px * f0, h + cv, cz + dz * ch + pz * f0], [q / 4, 0], [(q + 1) / 4, 0], [(q + 1) / 4, 1], [q / 4, 1]); }
    }
    tr.cyl(cx, h - 1.3, cz, 0.42, 0.26, 1.2, 7, 0.5, false);   // skirt of dead fronds under the crown
  }
}

// Italian cypresses: the dark columns of every older Los Angeles garden (and of Brown Hall's front). Static geometry,
// trunk-like collision up the middle (same footprint as the generic conifers they replace).
function cypresses(ctx, list) {
  const { B, playBounds: pb } = ctx; const lv = B.v('hamCypress', true); const rnd = mulberry32(4411);
  for (const [x, z, hIn] of list) {
    const h = hIn || 8 + rnd() * 5, r = 0.55 + rnd() * 0.2 + h * 0.014, g = 0.8 + rnd() * 0.3, lean = (rnd() - 0.5) * 0.25;
    B.v('wood').cyl(x, 0, z, 0.14, 0.12, 0.6, 6, 1, false); lv.setColor(0.82 * g, 1.0 * g, 0.78 * g);
    lv.cyl(x, 0.4, z, r * 0.62, r, h * 0.2, 9, 0.5, false).cyl(x, 0.4 + h * 0.2, z, r, r * 0.88, h * 0.36, 9, 0.5, false); lv.tube([x, 0.4 + h * 0.56, z], [x + lean, h, z + lean * 0.6], r * 0.88, 9, 0.5); lv.cyl(x + lean, h - 0.02, z + lean * 0.6, r * 0.5, 0.05, 1.2, 9, 0.5, true);
    if (x > pb.minX - 25 && x < pb.maxX + 25 && z > pb.minZ - 25 && z < pb.maxZ + 25) { B.c('wood').cyl(x, 0, z, 0.36, 0.3, Math.min(h, 9), 7, 1, true); (ctx.trunks || (ctx.trunks = [])).push([x, z, 0.36]); }
  }
  lv.setColor(1, 1, 1);
}
// jacarandas (Cattaraugus Ave is lined with them): forked grey trunk, wide open crown, lavender bloom over the leaves
function jacarandas(ctx, list) {
  const { B, M, T } = ctx;
  if (!M.hamJacaranda) { const S = 128, c = makeCanvas(S, S), g = c.getContext('2d'); const rnd = mulberry32(8); g.clearRect(0, 0, S, S);
    for (let k = 0; k < 1500; k++) { const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(${132 + rnd() * 40 | 0},${110 + rnd() * 30 | 0},${190 + rnd() * 40 | 0},0.95)` : v < 0.85 ? `rgba(${70 + rnd() * 30 | 0},${104 + rnd() * 30 | 0},${52 + rnd() * 20 | 0},0.95)` : 'rgba(40,60,34,0.95)'; const r = 2 + rnd() * 4; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, r * 1.5, r, rnd() * 3, 0, 7); g.fill(); }
    M.hamJacaranda = new THREE.MeshStandardMaterial({ map: canvasTexture(c, { aniso: T.aniso }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }); }
  // crowns go into one mesh of their own, named like the tree system's ("trees:"): foliage, not a surface to stand on
  const bark = B.v('wood'); const rnd = mulberry32(606); const pos = [], uvs = []; const lv = { tri: (a, b, c, ta, tb, tc) => { pos.push(...a, ...b, ...c); uvs.push(...ta, ...tb, ...tc); } };
  for (const [x, z] of list) {
    const h = 6.5 + rnd() * 2.5, f = 2.2 + rnd() * 0.6; bark.cyl(x, 0, z, 0.26, 0.2, f, 7, 0.5, false); const tips = [];
    for (let k = 0; k < 4; k++) { const an = k / 4 * Math.PI * 2 + rnd() * 0.8, d = 1.6 + rnd() * 1.4, t = [x + Math.cos(an) * d, h - 1.6 + rnd() * 0.8, z + Math.sin(an) * d]; bark.tube([x, f - 0.1, z], t, 0.1, 5, 0.5); tips.push(t); }
    for (const t of [...tips, [x, h - 0.6, z]]) for (let k = 0; k < 3; k++) { const cx = t[0] + (rnd() - 0.5) * 1.6, cy = t[1] + 0.3 + rnd() * 0.7, cz = t[2] + (rnd() - 0.5) * 1.6, R = 1.7 + rnd() * 0.9, N = 7; const top = [cx, cy + R * 0.42, cz];
      for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2; const A = [cx + Math.cos(a0) * R, cy - 0.15 + Math.sin(a0 * 3) * 0.2, cz + Math.sin(a0) * R], Bq = [cx + Math.cos(a1) * R, cy - 0.15 + Math.sin(a1 * 3) * 0.2, cz + Math.sin(a1) * R]; lv.tri(A, Bq, top, [Math.cos(a0) * 0.5 + 0.5, Math.sin(a0) * 0.5 + 0.5], [Math.cos(a1) * 0.5 + 0.5, Math.sin(a1) * 0.5 + 0.5], [0.5, 0.5]); } }
    B.c('wood').cyl(x, 0, z, 0.3, 0.24, 4.5, 7, 1, true); (ctx.trunks || (ctx.trunks = [])).push([x, z, 0.3]);
  }
  if (pos.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.hamJacaranda); m.name = 'trees:jacaranda'; m.castShadow = true; m.receiveShadow = false; m.matrixAutoUpdate = false; ctx.scene.add(m); }
}

// ------------------------------------------------------------------------------------------ Robertson Blvd frontage
function frontage(ctx) {
  const { B } = ctx;
  // Robertson Blvd is not parallel to the street grid: everything along it is placed from the road line itself
  // (off = metres west of the centre line: kerb 10, sidewalk 10-13.4, school fence 13.6)
  const rob = roadLine(ctx.data, 'South Robertson Boulevard'); const R = (b, off) => { const q = alongAt(rob, b); return [q.x + q.nx * off, q.z + q.nz * off]; };
  // marquee on a brick base at the main walk: the school name over a message board, both faces
  {
    const p = R(-23, 17.6), L = 6.2; const rot = ROT + Math.PI / 2;
    B.solidBox('brick', 'brick', p[0], 0.55, p[1], L + 0.5, 1.1, 0.9, rot, 1 / 2.2); B.v('limestone').box(p[0], 1.14, p[1], L + 0.7, 0.1, 1.05, rot, 1 / 3);
    B.v('paint', true).setColor(0.06, 0.07, 0.07).box(p[0], 2.5, p[1], L, 2.6, 0.5, rot); B.c('metal').box(p[0], 2.5, p[1], L, 2.6, 0.5, rot); B.v('paint', true).setColor(0.07, 0.36, 0.17).box(p[0], 3.86, p[1], L + 0.2, 0.14, 0.62, rot); B.v('paint', true).setColor(1, 1, 1);
    const head = text(ctx, ['HAMILTON HIGH SCHOOL'], { w: 1536, h: 180, font: 118, color: '#f3f1e8', bg: '#16613a', family: 'Georgia, "Times New Roman", serif' });
    const board = text(ctx, ['HOME OF THE YANKEES', 'ACADEMY OF MUSIC & PERFORMING ARTS', 'HUMANITIES MAGNET'], { w: 1536, h: 400, font: 84, color: '#ffc23a', bg: '#101311', weight: 700, family: '"Courier New", monospace' });
    const c = Math.cos(rot), s = Math.sin(rot); const e = (sd) => { const ax = p[0] + sd * (L / 2) * c + sd * 0.251 * s, az = p[1] - sd * (L / 2) * s + sd * 0.251 * c, bx = p[0] - sd * (L / 2) * c + sd * 0.251 * s, bz = p[1] + sd * (L / 2) * s + sd * 0.251 * c; let F = edgeFrame(ax, az, bx, bz); if ((F.nx * (ax - p[0] - (ax - bx) / 2) + F.nz * (az - p[1] - (az - bz) / 2)) < 0) F = edgeFrame(bx, bz, ax, az); return F; };
    for (const sd of [-1, 1]) { const F = e(sd); wallDecal(ctx, head, F, F.L / 2, 3.42, L - 0.2, 0.68, 0.012, { opaque: true }); wallDecal(ctx, board, F, F.L / 2, 2.2, L - 0.3, 1.6, 0.012, { opaque: true, rough: 0.45 }); }
  }
  { const p = G(166, -45); usFlag(ctx, p[0], p[1]); }
  // main walk from the Robertson sidewalk to the Brown Hall stairs, raised planters either side, benches, lamps
  { const pv = B.v('hamPaver'); const r = GR(151, -40.5, 181.5, -29.5); pv.quad([r[3][0], 0.03, r[3][1]], [r[2][0], 0.03, r[2][1]], [r[1][0], 0.03, r[1][1]], [r[0][0], 0.03, r[0][1]], [0, 0], [11.2, 0], [11.2, 4.6], [0, 4.6]); }
  for (const [a0, b0, a1, b1] of [[153, -47.5, 166, -42], [153, -28, 166, -24.5]]) { const p = G((a0 + a1) / 2, (b0 + b1) / 2); B.solidBox('limestone', 'concrete', p[0], 0.38, p[1], a1 - a0, 0.76, b1 - b0, ROT, 1 / 3); ctx.shrubs.push([p[0], 0.76, p[1], a1 - a0 - 0.8, 0.55, ROT]); }
  for (const [a, b, r] of [[170, -41.6, 0], [160, -28.6, Math.PI], [170, -28.6, Math.PI]]) { const p = G(a, b); propKit.bench(ctx, p[0], p[1], ROT + r); }
  for (const [a, b] of [[174, -42.5], [174, -27.5], [152.5, -42.5], [152.5, -27.5], [160, -92], [140, -94], [150, 20]]) { const p = G(a, b); lampPost(ctx, p[0], p[1]); }
  for (const [a, b] of [[171.5, -44], [150.5, 13.5], [128, -128]]) { const p = G(a, b); propKit.trashCan(ctx, p[0], p[1]); }
  { const p = G(155, 14.5); propKit.bikeRack(ctx, p[0], p[1], ROT); const q = G(62, -96.5); propKit.bikeRack(ctx, q[0], q[1], ROT); }
  // low brick wall with a black iron fence along the Robertson sidewalk, open at the main walk, the drive and the lawns
  for (const [b0, b1] of [[-127, -113], [-107, -41.5], [-28.5, -7], [0, 10], [17, 49], [54, 66]]) { const pts = []; const n = Math.max(1, Math.round((b1 - b0) / 8)); for (let i = 0; i <= n; i++) pts.push(R(b0 + (b1 - b0) * i / n, 13.6)); fence(ctx, pts, { h: 1.9, black: true, every: 2.6 }); }
  // lawn seat walls (cover on the blue-base lawn) and the corner planting
  for (const [a, b, len, r] of [[160, -70, 7, 0], [169, -60, 6, Math.PI / 2], [158, -52.5, 5, 0], [167, -80, 5, 0.5], [165, -100, 6, 0.2], [146, -116, 6, 0]]) { const p = G(a, b); B.solidBox('limestone', 'concrete', p[0], 0.4, p[1], len, 0.8, 0.5, ROT + r, 1 / 3); }
  // lunch quad between the library, the north block and the classroom block: tables, planters, bins
  for (const [a, b, r] of [[54, -78, 0.2], [60, -70, -0.3], [53, -60, 0.9], [61, -48, 0.1], [54, -34, 0.4], [58, -99, 0], [52, -104, 0.5]]) { const p = G(a, b); propKit.picnicTable(ctx, p[0], p[1], ROT + r); }
  for (const [a, b, len] of [[49.6, -52, 7], [68.4, -62, 7], [68.4, -40, 6]]) { const p = G(a, b); B.solidBox('concrete', 'concrete', p[0], 0.38, p[1], 1.2, 0.76, len, ROT, 1 / 3); ctx.shrubs.push([p[0], 0.76, p[1], len - 0.8, 0.6, ROT + Math.PI / 2]); }
  for (const [a, b] of [[50.5, -88], [66, -28], [2, 30], [-62, 72]]) { const p = G(a, b); propKit.trashCan(ctx, p[0], p[1]); }
  // stadium plaza (red base): planters, a ticket booth, benches, utility boxes
  for (const [a, b, len, r] of [[-120, 97, 7, 0], [-100, 84, 6, Math.PI / 2], [-131, 91, 5, Math.PI / 2], [-92, 104, 6, 0]]) { const p = G(a, b); B.solidBox('concrete', 'concrete', p[0], 0.4, p[1], len, 0.8, 1.2, ROT + r, 1 / 3); ctx.shrubs.push([p[0], 0.8, p[1], len - 0.8, 0.6, ROT + r]); }
  { const p = G(-146, 92); B.solidBox('whitePanel', 'concrete', p[0], 1.3, p[1], 2.6, 2.6, 2.6, ROT); B.v('paint', true).setColor(0.07, 0.36, 0.17).box(p[0], 2.72, p[1], 3.0, 0.24, 3.0, ROT); B.v('paint', true).setColor(1, 1, 1); B.c('metal').box(p[0], 2.72, p[1], 3.0, 0.24, 3.0, ROT); propKit.registerProp(ctx, 'booth', p[0], p[1], ROT, 3.0, 3.0, 2.85); }
  for (const [a, b, r] of [[-108, 78, 0], [-118, 78, 0], [-76, 76, Math.PI / 2]]) { const p = G(a, b); propKit.bench(ctx, p[0], p[1], ROT + r); }
  // more cover on the open north and west sides of the red base (the blue base has the fig lawn's walls and trees):
  // the stadium's brick name wall, the athletics store container beside it and the spirit-wear kiosk to the west
  { const p = G(-121, 84), L = 5.6, rot = ROT; B.solidBox('brick', 'brick', p[0], 0.95, p[1], L, 1.9, 0.6, rot, 1 / 2.2); B.v('limestone').box(p[0], 1.96, p[1], L + 0.2, 0.12, 0.76, rot, 1 / 3); propKit.registerProp(ctx, 'nameWall', p[0], p[1], rot, L, 0.6, 2.0);
    const tex = text(ctx, ['AL MICHAELS FIELD', 'HOME OF THE YANKEES'], { w: 1280, h: 320, font: 104, color: '#f3f1e8', bg: '#16613a', family: 'Georgia, "Times New Roman", serif' }); const c = Math.cos(rot), sn = Math.sin(rot);
    for (const sd of [-1, 1]) { const ax = p[0] + sd * (L / 2 - 0.3) * c + sd * 0.301 * sn, az = p[1] - sd * (L / 2 - 0.3) * sn + sd * 0.301 * c, bx = p[0] - sd * (L / 2 - 0.3) * c + sd * 0.301 * sn, bz = p[1] + sd * (L / 2 - 0.3) * sn + sd * 0.301 * c; let F = edgeFrame(ax, az, bx, bz); if ((F.nx * sd * sn + F.nz * sd * c) < 0) F = edgeFrame(bx, bz, ax, az); wallDecal(ctx, tex, F, F.L / 2, 1.05, 4.6, 1.15, 0.012, { opaque: true }); } }
  { const p = G(-109, 84.2); propKit.container(ctx, p[0], p[1], ROT, [0.03, 0.13, 0.07]); }
  { const p = G(-123.5, 90); B.solidBox('whitePanel', 'concrete', p[0], 1.25, p[1], 2.8, 2.5, 2.4, ROT); B.v('paint', true).setColor(0.07, 0.36, 0.17).box(p[0], 2.62, p[1], 3.3, 0.24, 2.9, ROT); B.v('paint', true).setColor(0.05, 0.06, 0.06).box(p[0] + UX * 1.41, 1.5, p[1] + UZ * 1.41, 0.03, 1.0, 1.8, ROT); B.v('paint', true).setColor(1, 1, 1); B.c('metal').box(p[0], 2.62, p[1], 3.3, 0.24, 2.9, ROT); propKit.registerProp(ctx, 'booth', p[0], p[1], ROT, 3.3, 2.9, 2.75); }
  { const p = G(-66, 96); propKit.utilityBox(ctx, p[0], p[1], ROT); const q = G(70, 46.5); propKit.utilityBox(ctx, q[0], q[1], ROT); const d = G(118, 46.5); propKit.dumpster(ctx, d[0], d[1], ROT); const d2 = G(4, -84); propKit.dumpster(ctx, d2[0], d2[1], ROT + Math.PI / 2, [0.1, 0.16, 0.3]); }
  // campus fence on the other three sides (chain-link with a windscreen), gates where the real ones are
  fence(ctx, [G(-158.8, -131), G(-158.8, 128)], { h: 2.4, screen: 2.0, every: 3, gaps: [[30, 35], [188, 196], [226, 232]] });               // Canfield Ave
  fence(ctx, [G(-158.8, -133.6), G(7, -133.6)], { h: 2.4, every: 3, gaps: [[44, 50], [118, 126]] });                                         // Cattaraugus Ave (west half)
  fence(ctx, [G(-80, 163.7), G(46.8, 163.7), G(46.8, 87)], { h: 2.2, every: 3, gaps: [[14, 22], [96, 104], [150, 158], [178, 186]] });          // Kincardine Ave + Livonia Ave
  fence(ctx, [G(66, 68.2), G(177, 68.2)], { h: 2.2, black: true, every: 3, gaps: [[30, 38], [82, 90]] });                                    // Kincardine Ave (east)
  palms(ctx, [...[-120, -98, -74, -50, -18, 6, 30, 58, 96, 128].map((b) => R(b, 11.0)), ...[-110, -62, -6, 44, 112].map((b) => R(b, -11.0)), ...[[147, -131], [112, -131.5], [-30, -131.6], [-72, -131.6], [-161.5, 70], [-161.5, 110], [168, 2], [40, 84.6], [-8, 84.6], [58.6, 100], [58.6, 140]].map(([a, b]) => G(a, b)), ...((ctx.yardTrees || {}).palm || []).map(([x, z]) => [x, z, 9 + ((x * 7 + z * 3) % 5 + 5) % 5])]);
}

// ------------------------------------------------------------------------------------------ vehicles + paint
function vehicles(ctx) {
  const { data, playBounds: pb } = ctx; const rnd = mulberry32(2955); const inPlay = inPlayOf(pb);
  const tpls = [propKit.buildCarTemplate(propKit.CAR_TYPES.suv), propKit.buildCarTemplate(propKit.CAR_TYPES.sedan), propKit.buildCarTemplate(propKit.CAR_TYPES.hatch)];
  const pick = () => { const r = rnd(); return r < 0.4 ? tpls[0] : r < 0.8 ? tpls[1] : tpls[2]; };
  const placed = []; let n = 0; const keep = ctx.keepClear || [];
  const trunks = [...(ctx.gen.trees || []), ...(ctx.trunks || [])].filter((t) => inPlay(t[0], t[1], -4));
  const posts = ctx.posts || [];
  // the school buses at the Robertson kerb (placed after the cars): reserve their footprints first
  const rob = roadLine(data, 'South Robertson Boulevard'); const busAt = (bGrid) => { const q = alongAt(rob, bGrid); return [q.x + q.nx * 8.4, q.z + q.nz * 8.4, Math.atan2(-q.tz, q.tx)]; };
  const buses = [busAt(-66), busAt(-52), busAt(40)];
  const overlaps = (x, z, h, bx, bz, bh, hl, hw) => {
    const R = [[x, z, h, 2.3, 0.95], [bx, bz, bh, hl, hw]];
    for (const [, , a] of R) for (const ax of [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]]) {
      const ext = R.map(([cx, cz, hh, l, w]) => [cx * ax[0] + cz * ax[1], Math.abs(l * (Math.cos(hh) * ax[0] - Math.sin(hh) * ax[1])) + Math.abs(w * (Math.sin(hh) * ax[0] + Math.cos(hh) * ax[1]))]);
      if (Math.abs(ext[0][0] - ext[1][0]) > ext[0][1] + ext[1][1]) return false;
    }
    return true;
  };
  const car = (x, z, heading) => {
    if (!inPlay(x, z)) return; if (keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r)) return;
    if (placed.some(([px, pz, ph]) => Math.hypot(px - x, pz - z) < 5.6 && overlaps(x, z, heading, px, pz, ph, 2.42, 1.08))) return;
    for (const r of ctx.buildingRings || []) if (pointInRing(x, z, r) || pointInRing(x + Math.cos(heading) * 2.3, z - Math.sin(heading) * 2.3, r) || pointInRing(x - Math.cos(heading) * 2.3, z + Math.sin(heading) * 2.3, r)) return;
    if ((ctx.fenceRuns || []).some((run) => run.some((p, i) => { if (!i) return false; const q = run[i - 1]; const dx = p[0] - q[0], dz = p[1] - q[1]; const t = Math.max(0, Math.min(1, ((x - q[0]) * dx + (z - q[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - q[0] - dx * t, z - q[1] - dz * t) < 1.7; }))) return;
    const blocked = buses.some(([bx, bz, bh]) => overlaps(x, z, heading, bx, bz, bh, 6.4, 1.8)) || trunks.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.6 && overlaps(x, z, heading, t[0], t[1], 0, 1.15, 1.15)) || posts.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.4 && overlaps(x, z, heading, t[0], t[1], 0, 0.3, 0.3)) || (ctx.props || []).some((p) => p.kind !== 'car' && Math.hypot(p.x - x, p.z - z) < 8 && overlaps(x, z, heading, p.x, p.z, p.rot, p.sx / 2 + 0.15, p.sz / 2 + 0.15));
    if (blocked) { rnd(); rnd(); rnd(); return; }
    propKit.placeCar(ctx, pick(), x, z, heading + (rnd() - 0.5) * 0.05, propKit.CAR_COLORS[Math.floor(rnd() * propKit.CAR_COLORS.length)]); placed.push([x, z, heading]); n++;
  };
  // paint: 10 cm lines just above the asphalt in one merged mesh, worn and faded out with distance (visual only)
  const stripes = [], stripeCol = [];
  const quad = (q, col, y = 0.017) => { const up = (q[1][0] - q[0][0]) * (q[3][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[3][0] - q[0][0]) < 0; for (const k of (up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])) { stripes.push(q[k][0], y, q[k][1]); stripeCol.push(...col); } };
  const seg = (ax, az, bx, bz, w, col) => { const L = Math.hypot(bx - ax, bz - az) || 1; const px = -(bz - az) / L * w / 2, pz = (bx - ax) / L * w / 2; quad([[ax - px, az - pz], [ax + px, az + pz], [bx + px, bz + pz], [bx - px, bz - pz]], col); };
  const WHITE = [0.84, 0.835, 0.8], YELLOW = [0.8, 0.6, 0.08];
  // stall rows in street-grid coordinates: [a0, b0, a1, b1, noseA, noseB, fill]; cars nose toward (noseA, noseB)
  const ROWS = [
    [-45.0, 93.5, -45.0, 137, -1, 0, 0.75], [-32.8, 93.5, -32.8, 137, 1, 0, 0.75], [-21.3, 93.5, -21.3, 137, -1, 0, 0.75], [-11.7, 93.5, -11.7, 137, 1, 0, 0.7], [-4.9, 93.5, -4.9, 137, -1, 0, 0.7], [4.3, 93.5, 4.3, 137, 1, 0, 0.7],
    [-43, 146.3, 10, 146.3, 0, -1, 0.7], [-43, 153.0, 10, 153.0, 0, 1, 0.7], [-71.6, 101, -71.6, 147, -1, 0, 0.6], [-66.1, 101, -66.1, 147, 1, 0, 0.6], [-77, 158.6, -52, 158.6, 0, 1, 0.5], [14.6, 90, 14.6, 112, -1, 0, 0.4], [20, 158.6, 44, 158.6, 0, 1, 0.5],
    [72, 64.3, 174, 64.3, 0, 1, 0.6], [122, 46.8, 174, 46.8, 0, -1, 0.55], [153.9, -27, 153.9, 9.5, -1, 0, 0.6], [173.6, -27, 173.6, 9.5, 1, 0, 0.45], [126, -131.6, 160, -131.6, 0, -1, 0.6],
  ];
  for (const [a0, b0, a1, b1, na, nb, fill] of ROWS) {
    const L = Math.hypot(a1 - a0, b1 - b0), ta = (a1 - a0) / L, tb = (b1 - b0) / L; const nw = G(na, nb), hx = nw[0], hz = nw[1];   // nose direction in world (unit: G is a rotation)
    for (let d = 0; d <= L + 0.01; d += 2.75) {
      const p = G(a0 + ta * d, b0 + tb * d); const tw = G(ta, tb);
      if (!inPlay(p[0], p[1]) || (ctx.buildingRings || []).some((r) => pointInRing(p[0], p[1], r))) continue;
      for (const o of [-1.375, 1.375]) { const sx = p[0] + tw[0] * o, sz = p[1] + tw[1] * o; seg(sx - hx * 2.5, sz - hz * 2.5, sx + hx * 2.5, sz + hz * 2.5, 0.1, WHITE); }
      if (rnd() > fill) continue;
      car(p[0], p[1], Math.atan2(-hz, hx) + (rnd() < 0.18 ? Math.PI : 0));
    }
  }
  // street paint: Robertson's double yellow + lane dashes, Cattaraugus's dashed yellow centre line
  const paintRoad = (name, fn) => { for (const r of data.roads) { if (r.tags.name !== name || !STREETS.includes(r.tags.highway)) continue; for (let i = 0; i < r.line.length - 1; i++) { const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5 || !inPlay((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -40)) continue; fn(a, b, L, -(b[1] - a[1]) / L, (b[0] - a[0]) / L); } } };
  paintRoad('South Robertson Boulevard', (a, b, L, nx, nz) => {
    for (const o of [-0.13, 0.13]) seg(a[0] + nx * o, a[1] + nz * o, b[0] + nx * o, b[1] + nz * o, 0.1, YELLOW);
    for (const o of [-3.5, 3.5]) for (let d = 1; d < L - 3; d += 9) seg(a[0] + nx * o + (b[0] - a[0]) / L * d, a[1] + nz * o + (b[1] - a[1]) / L * d, a[0] + nx * o + (b[0] - a[0]) / L * (d + 3), a[1] + nz * o + (b[1] - a[1]) / L * (d + 3), 0.1, WHITE);
    for (const o of [-7.3, 7.3]) seg(a[0] + nx * o, a[1] + nz * o, b[0] + nx * o, b[1] + nz * o, 0.1, WHITE);        // parking-lane line
  });
  paintRoad('Cattaraugus Avenue', (a, b, L) => { for (let d = 0.5; d < L - 3; d += 9) seg(a[0] + (b[0] - a[0]) / L * d, a[1] + (b[1] - a[1]) / L * d, a[0] + (b[0] - a[0]) / L * (d + 3), a[1] + (b[1] - a[1]) / L * (d + 3), 0.1, YELLOW); });
  // kerb-side parking along the streets (right-hand traffic), clear of junctions and driveways
  const ends = []; for (const r of data.roads) if (STREETS.includes(r.tags.highway)) { ends.push(r.line[0], r.line[r.line.length - 1]); }
  for (const r of data.roads) {
    const hw = r.tags.highway; if (!STREETS.includes(hw)) continue; const w = ROADW[hw]; const busy = hw === 'secondary';
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 8) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (const side of [1, -1]) for (let d = 4 + rnd() * 4; d < L - 4; d += 6.3) {
        const x = a[0] + tx * d - tz * side * (w / 2 - 1.25), z = a[1] + tz * d + tx * side * (w / 2 - 1.25);
        if (!inPlay(x, z) || rnd() > (busy ? 0.4 : 0.42)) continue;
        if (ends.some((e) => Math.hypot(e[0] - a[0] - tx * d, e[1] - a[1] - tz * d) < 14)) continue;
        if (ctx.surfaceAt(x, z) !== 'asphalt') continue;
        car(x, z, Math.atan2(-tz, tx) + (side > 0 ? 0 : Math.PI));
      }
    }
  }
  // traffic on Robertson and Cattaraugus
  for (const r of data.roads) {
    const hw = r.tags.highway; if (hw !== 'tertiary' && hw !== 'secondary') continue;
    for (let i = 0; i < r.line.length - 1; i++) { const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 26) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const k = hw === 'secondary' ? 2 : 1; for (let j = 0; j < k; j++) if (rnd() < 0.6) { const d = 8 + rnd() * (L - 16), sd = rnd() < 0.5 ? 1 : -1, off = hw === 'secondary' ? (rnd() < 0.5 ? 1.8 : 5.4) : 2.2; car(a[0] + tx * d - tz * sd * off, a[1] + tz * d + tx * sd * off, Math.atan2(-tz, tx) + (sd > 0 ? 0 : Math.PI)); } }
  }
  // contractor's trucks in the staging yard
  for (const [a, b, r] of [[-60, -106, 0.3], [-54, -94, 1.2], [-38, -108, -0.2]]) { const p = G(a, b); car(p[0], p[1], ROT + r); }
  for (const [bx, bz, bh] of buses) propKit.placeBus(ctx, bx, bz, bh);
  if (stripes.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(stripes, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(stripes.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(stripeCol, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const wear = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { float sd = length(vWPos - cameraPosition); vec2 sp = vWPos.xz * 3.1;
    float sw = fract(sin(dot(floor(sp * 6.0), vec2(12.9898, 78.233))) * 43758.5453) * 0.35 + fract(sin(dot(floor(sp), vec2(39.3468, 11.135))) * 24634.6345) * 0.4;
    diffuseColor.a *= (0.5 + 0.5 * smoothstep(0.1, 0.55, sw + 0.25)) * (1.0 - smoothstep(60.0, 150.0, sd)); }`); };
    wear.key = 'hamStallPaint';
    ctx.applyBakedShadow(mat, ctx.sky.shadowUniforms, wear);
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'stall-paint'; mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 1; ctx.scene.add(mesh);
  }
  ctx.stats = { cars: n, paintLines: stripes.length / 18 };
}
function roadLine(data, name) { const pts = []; for (const r of data.roads) if (r.tags.name === name && r.tags.highway === 'secondary') for (let i = 0; i < r.line.length - 1; i++) pts.push([r.line[i], r.line[i + 1]]); return pts; }
// point on a street where it crosses grid line b = bGrid: position, tangent (pointing grid south) and normal (pointing grid west)
function alongAt(segs, bGrid) {
  const gb = (p) => -p[0] * UZ + p[1] * UX;
  for (const [p, q] of segs) { const b0 = gb(p), b1 = gb(q); if ((b0 - bGrid) * (b1 - bGrid) > 0 || b0 === b1) continue; const t = (bGrid - b0) / (b1 - b0); let tx = q[0] - p[0], tz = q[1] - p[1]; const L = Math.hypot(tx, tz); tx /= L; tz /= L; if (b1 < b0) { tx = -tx; tz = -tz; }
    return { x: p[0] + (q[0] - p[0]) * t, z: p[1] + (q[1] - p[1]) * t, tx, tz, nx: -tz, nz: tx }; }
  const p = G(196, bGrid); return { x: p[0], z: p[1], tx: -UZ, tz: UX, nx: -UX, nz: -UZ };
}

// ------------------------------------------------------------------------------------------ streets
function streets(ctx) {
  const { B, data, playBounds: pb } = ctx; const rnd = mulberry32(90034); const inPlay = inPlayOf(pb);
  const clearOfBuildings = (x, z) => !(ctx.buildingRings || []).some((r) => pointInRing(x, z, r) || pointInRing(x + 0.7, z, r) || pointInRing(x - 0.7, z, r) || pointInRing(x, z + 0.7, r) || pointInRing(x, z - 0.7, r));
  const clearOfProps = (x, z, m = 1.2) => !(ctx.props || []).some((p) => Math.hypot(p.x - x, p.z - z) < Math.max(p.sx, p.sz) / 2 + m) && !(ctx.gen.trees || []).some((t) => Math.hypot(t[0] - x, t[1] - z) < 1.6) && !(ctx.trunks || []).some((t) => Math.hypot(t[0] - x, t[1] - z) < 1.4);
  const lamps = []; const pads = ctx.keepClear || []; const offPads = (x, z) => !pads.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < 11);
  for (const r of data.roads) {
    const hw = r.tags.highway; if (!STREETS.includes(hw)) continue; const w = ROADW[hw]; let side = 1; let carry = 8 + rnd() * 10; const tall = hw === 'secondary';
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      let d = carry;
      for (; d < L; d += tall ? 32 : 29) {
        const x = a[0] + tx * d - tz * side * (w / 2 + 0.9), z = a[1] + tz * d + tx * side * (w / 2 + 0.9); side = -side;
        if (!inPlay(x, z) || !offPads(x, z) || !clearOfBuildings(x, z) || !clearOfProps(x, z) || lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 15)) continue;
        if (tall) landmarkKit.lotLight(ctx, x, z, 9.5); else lampPost(ctx, x, z); lamps.push([x, z]);
      }
      carry = d - L;
    }
  }
  // car-park light columns
  for (const [a, b] of [[-76.2, 96], [-76.2, 151], [-27, 141], [14.5, 141], [14.5, 118], [90, 56], [126, 56], [164, 10.6], [-6.4, -40], [-6.4, 16]]) { const p = G(a, b); if (clearOfProps(p[0], p[1], 0.6)) landmarkKit.lotLight(ctx, p[0], p[1], 8.5); }
  // signal masts at the OSM traffic signals (Robertson at Cattaraugus and at Kincardine)
  for (const p of data.points) {
    if (p.tags.highway !== 'traffic_signals') continue; const [x, z] = p.p; if (!inPlay(x, z, 8)) continue;
    const px = x + 9.6, pz = z + 8.2; if (!offPads(px, pz) || !clearOfBuildings(px, pz) || !clearOfProps(px, pz) || lamps.some(([lx, lz]) => Math.hypot(lx - px, lz - pz) < 4)) continue; lamps.push([px, pz]);
    B.v('galv').cyl(px, 0, pz, 0.15, 0.11, 6.4, 8, 1, true).tube([px, 6.1, pz], [px - 8.5, 6.3, pz - 2.8], 0.07, 6); B.c('metal').box(px, 3.2, pz, 0.35, 6.4, 0.35); ctx.grapplePoles.push({ x: px, z: pz, y0: 1, y1: 6.4, r: 0.15 });
    const pt = B.v('paint', true); pt.setColor(0.85, 0.7, 0.05); for (const k of [0.4, 0.75]) { pt.box(px - 8.5 * k, 5.7, pz - 2.8 * k, 0.36, 1.0, 0.3, 0.32); B.v('lightEmit').box(px - 8.5 * k, 6.0, pz - 2.8 * k + 0.16, 0.2, 0.2, 0.02, 0.32); } pt.setColor(1, 1, 1);
  }
  // Robertson sidewalk furniture: bus shelter in front of the school, bins, news racks
  const rob = roadLine(data, 'South Robertson Boulevard');
  { const q = alongAt(rob, -84); const x = q.x + q.nx * 11.9, z = q.z + q.nz * 11.9; const rot = Math.atan2(-q.tz, q.tx);
    B.v('frameAlu').box(x, 2.45, z, 4.2, 0.1, 1.7, rot); B.c('metal').box(x, 2.45, z, 4.2, 0.14, 1.7, rot); B.v('glass').box(x + q.nx * 0.8, 1.25, z + q.nz * 0.8, 4.0, 2.3, 0.04, rot); B.c('glass').box(x + q.nx * 0.8, 1.25, z + q.nz * 0.8, 4.0, 2.3, 0.08, rot);
    for (const k of [-1.95, 1.95]) for (const o of [-0.75, 0.75]) { const px = x + q.tx * k + q.nx * o, pz = z + q.tz * k + q.nz * o; B.v('frameAlu').box(px, 1.2, pz, 0.08, 2.4, 0.08, rot); }
    B.v('wood').box(x + q.nx * 0.35, 0.45, z + q.nz * 0.35, 3.0, 0.06, 0.45, rot, 0.5); B.c('wood').box(x + q.nx * 0.35, 0.25, z + q.nz * 0.35, 3.0, 0.5, 0.45, rot); propKit.registerProp(ctx, 'shelter', x, z, rot, 4.2, 1.7, 2.5); }
  for (const bG of [-104, -30, 22, 96, 150]) { const q = alongAt(rob, bG); for (const sd of [1, -1]) { const x = q.x + sd * q.nx * 12.6, z = q.z + sd * q.nz * 12.6; if (inPlay(x, z, 4) && offPads(x, z) && clearOfBuildings(x, z) && clearOfProps(x, z)) { if (rnd() < 0.5) propKit.trashCan(ctx, x, z); else { const pt = B.v('paint', true); pt.setColor(0.1, 0.2, 0.5).box(x, 0.6, z, 0.5, 1.2, 0.5, ROT); pt.setColor(1, 1, 1); B.c('metal').box(x, 0.6, z, 0.5, 1.2, 0.5, ROT); propKit.registerProp(ctx, 'newsRack', x, z, ROT, 0.5, 0.5, 1.2); } } } }
}

// The play-area edge: construction-style fence with a green windscreen along the bounds, concrete barriers where a
// street crosses it, nothing where a building already forms the edge.
function boundary(ctx) {
  const { data, playBounds: pb } = ctx; const m = 1.2;
  const corners = [[pb.minX - m, pb.minZ - m], [pb.maxX + m, pb.minZ - m], [pb.maxX + m, pb.maxZ + m], [pb.minX - m, pb.maxZ + m]];
  const segs = []; for (const r of data.roads) { const hw = r.tags.highway; if (!STREETS.includes(hw)) continue; for (let i = 0; i < r.line.length - 1; i++) segs.push([r.line[i], r.line[i + 1], ROADW[hw] / 2 + 1.0]); }
  const onStreet = (x, z) => segs.some(([a, b, w]) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < w; });
  const inBld = (x, z) => (ctx.buildingRings || []).some((r) => pointInRing(x, z, r));
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.ceil(L / 6); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const rot = Math.atan2(-tz, tx);
    let run = null; const flush = () => { if (run && run.length > 1) fence(ctx, run, { h: 2.4, screen: 2.0, every: 3 }); run = null; };
    for (let i = 0; i < n; i++) {
      const p0 = [a[0] + tx * (i * L / n), a[1] + tz * (i * L / n)], p1 = [a[0] + tx * ((i + 1) * L / n), a[1] + tz * ((i + 1) * L / n)], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      // (the fence also runs through buildings that straddle the edge: hidden inside them, and no gap at their corners)
      if (onStreet(mid[0], mid[1])) { flush(); propKit.barrier(ctx, mid[0], mid[1], rot, L / n - (i === 0 || i === n - 1 ? 1.9 : 0.3)); const pt = ctx.B.v('paint', true); pt.setColor(0.95, 0.45, 0.05).box(mid[0], 1.0, mid[1], L / n - 0.6, 0.22, 0.06, rot); pt.setColor(0.9, 0.9, 0.88).box(mid[0], 0.72, mid[1], L / n - 0.6, 0.16, 0.06, rot); pt.setColor(1, 1, 1); continue; }
      if (!run) run = [p0]; run.push(p1);
    }
    flush();
  }
}

export function buildGrounds(ctx) {
  // Los Angeles has no spruces: every conifer of the generic tree pass becomes an Italian cypress (same spot, same
  // trunk collision), except the one that stood on Brown Hall's entrance axis; two tall ones flank the entrance instead
  { const gen = ctx.gen; gen._conifers = gen._conifers || (gen.trees || []).filter((t) => t[2] === 1); gen.trees = (gen.trees || []).filter((t) => t[2] !== 1);
    const yt = ctx.yardTrees || {}; const list = gen._conifers.filter((t) => Math.hypot(t[0] - 161.3, t[1] - 3.3) > 2).map((t) => [t[0], t[1], 7 + t[3] * 4.5]);
    cypresses(ctx, [...list, [...G(146.2, -51.6), 11.5], [...G(146.2, -29.2), 11.5], ...(yt.cypress || []).map(([x, z]) => [x, z, 0])]); jacarandas(ctx, yt.jacaranda || []); }
  field(ctx);
  courts(ctx);
  construction(ctx);
  frontage(ctx);
  streets(ctx);
  vehicles(ctx);
  boundary(ctx);
  // trees whose trunk would stand in (or within a metre of) a prop are not planted
  { const props = ctx.props || []; const near = (t) => props.some((p) => { if (p.kind === 'car') return false; const dx = t[0] - p.x, dz = t[1] - p.z; if (Math.abs(dx) + Math.abs(dz) > 16) return false; const c = Math.cos(p.rot), s = Math.sin(p.rot); const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.hypot(Math.max(Math.abs(lx) - p.sx / 2, 0), Math.max(Math.abs(lz) - p.sz / 2, 0)) < 1.3; });
    ctx.gen.trees = (ctx.gen.trees || []).filter((t) => !near(t)); }
  ctx.B.v('paint', true).setColor(1, 1, 1); ctx.B.v('stucco', true).setColor(1, 1, 1);
}
