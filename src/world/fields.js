// Regulation sports surfaces drawn procedurally: 400 m track with lane markings, baseball / softball diamonds,
// soccer field lines. Dimensions come from the rule books (NFHS / World Athletics), positions from the imagery.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, mulberry32 } from './util.js';

const FT = 0.3048;

// Generic painted quad on the ground. centre (cx, cz), size (w along local x, h along local y), rot = angle of the
// local +y axis measured as atan2(z, x) in world (so local y points along (cos rot, sin rot)); local x is to the
// right of +y when seen from above with north up... (x_local = (-sin rot, cos rot) rotated -90deg = (sin rot, -cos rot)).
export function paintedQuad(ctx, canvas, cx, cz, w, h, rot, opts = {}) {
  const tex = canvasTexture(canvas, { repeat: false, aniso: ctx.T.aniso });
  const nrm = ctx.T.asphaltNormal.clone(); nrm.needsUpdate = true; nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.repeat.set(w / (opts.nScale || 0.7), h / (opts.nScale || 0.7));
  const mat = new THREE.MeshStandardMaterial({
    map: tex, normalMap: ctx.quality === 'low' ? null : nrm, roughness: opts.rough || 0.9,
    polygonOffset: true, polygonOffsetFactor: opts.offset || -3, polygonOffsetUnits: opts.offset || -3,
    transparent: !!opts.blend, alphaTest: opts.blend ? 0.02 : (opts.cut ? 0.5 : 0), depthWrite: !opts.blend,
  });
  mat.normalScale.set(opts.nStrength || 0.6, opts.nStrength || 0.6);
  ctx.applyBakedShadow(mat, ctx.sky.shadowUniforms);
  const yx = Math.cos(rot), yz = Math.sin(rot), xx = -yz, xz = yx;          // local axes in world (x,z)
  const P = (lx, ly) => [cx + lx * xx + ly * yx, opts.y || 0.014, cz + lx * xz + ly * yz];
  const a = P(-w / 2, -h / 2), b = P(w / 2, -h / 2), c = P(w / 2, h / 2), d = P(-w / 2, h / 2);
  const g = new THREE.BufferGeometry();
  // winding chosen so the face points up: check with a cross product
  const up = (b[0] - a[0]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[0] - a[0]) < 0;
  const pos = up ? [...a, ...b, ...c, ...a, ...c, ...d] : [...a, ...c, ...b, ...a, ...d, ...c];
  const uv = up ? [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1] : [0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'painted'; mesh.matrixAutoUpdate = false; mesh.renderOrder = opts.order || 1;
  ctx.scene.add(mesh);
  return { mesh, P };
}

function speckle(g, W, H, amt, seed, light = false) {
  const rnd = mulberry32(seed); const n = makeCanvas(256, 256), ng = n.getContext('2d'); const id = ng.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) { const v = rnd() < 0.5 ? 0 : (light ? 255 : 200); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = Math.floor(rnd() * amt); }
  ng.putImageData(id, 0, 0);
  g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
}

// ------------------------------------------------------------------------------------------ 400 m track
// Lane 1 is exactly 400 m on its measurement line (0.30 m outside the kerb): 2*S + 2*pi*(R + 0.30) = 400.
export function trackDims(R, lanes, lw) { const S = (400 - 2 * Math.PI * (R + 0.3)) / 2; return { R, lanes, lw, S, Rout: R + lanes * lw }; }

export function buildTrack(ctx, { cx, cz, R = 36.5, lanes = 8, lw = 1.22, big = 1, hole = null }) {
  const D = trackDims(R, lanes, lw); const { S, Rout } = D; const apron = 0.5;
  const wM = 2 * (Rout + apron), hM = S + 2 * (Rout + apron);
  const W = 1024 * big, H = Math.round(W * hM / wM), ppm = W / wM;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  // local metres: origin = track centre, +x east, +y south (canvas y down)
  g.translate(W / 2, H / 2); g.scale(ppm, ppm);
  const oval = (r) => { g.beginPath(); g.moveTo(-r, -S / 2); g.arc(0, -S / 2, r, Math.PI, 0, false); g.lineTo(r, S / 2); g.arc(0, S / 2, r, 0, Math.PI, false); g.closePath(); };
  const px = 1 / ppm;
  // rubber: red-orange polyurethane
  oval(Rout + apron); g.fillStyle = '#b5442f'; g.fill();
  // inside the kerb: turf margin beside the football field, red "D" at the north end (jumps apron), lawn in the south D
  oval(R); g.save(); g.clip();
  g.clearRect(-R - 1, -hM, 2 * R + 2, 2 * hM);
  g.fillStyle = '#1e6040'; g.fillRect(-R - 1, -S / 2 - 6, 2 * R + 2, S + 12);
  g.fillStyle = '#b5442f'; g.fillRect(-R - 1, -hM, 2 * R + 2, hM - S / 2 - 6);
  // the football field has its own higher-resolution overlay: leave a hole so the two never z-fight
  if (hole) g.clearRect(-hole[0] / 2 + 0.4, -hole[1] / 2 + 0.4, hole[0] - 0.8, hole[1] - 0.8);
  g.restore();
  // wear: lanes 1-2 are paler and dirtier, faint darker band where water sits on the inside
  oval(R + lw); g.strokeStyle = 'rgba(232,190,160,0.16)'; g.lineWidth = 2 * lw; g.stroke();
  oval(R + lw * 0.5); g.strokeStyle = 'rgba(90,50,40,0.10)'; g.lineWidth = lw * 0.5; g.stroke();
  // lane lines (5 cm, drawn a little wider so they survive mip-mapping), kerb line on the inside
  g.strokeStyle = '#f2f1ec';
  for (let k = 0; k <= lanes; k++) { oval(R + k * lw); g.lineWidth = Math.max(k === 0 ? 0.09 : 0.06, 1.6 * px); g.stroke(); }
  const lineAcross = (ang, cyy, n0, n1, wdt = 0.06, col = '#f2f1ec') => { g.strokeStyle = col; g.lineWidth = Math.max(wdt, 1.6 * px); g.beginPath(); g.moveTo(Math.cos(ang) * (R + n0 * lw), cyy + Math.sin(ang) * (R + n0 * lw)); g.lineTo(Math.cos(ang) * (R + n1 * lw), cyy + Math.sin(ang) * (R + n1 * lw)); g.stroke(); };
  // finish line: south end of the west (home) straight; races run anticlockwise (south on the home straight)
  const yF = S / 2;
  g.fillStyle = '#f2f1ec'; g.fillRect(-Rout, yF - 0.04, Rout - R, Math.max(0.08, 2 * px));
  // lane numbers before the finish (read by a runner approaching it) + 1 m box ticks
  g.font = `700 0.8px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let n = 1; n <= lanes; n++) { const x = -(R + (n - 0.5) * lw); g.save(); g.translate(x, yF - 1.6); g.rotate(Math.PI); g.fillText(String(n), 0, 0); g.restore(); g.fillRect(x - lw / 2, yF - 1.0, lw, Math.max(0.03, px)); }
  // 100 m start (north end of the home straight) and 110 m hurdle start mark in the chute direction
  g.fillRect(-Rout, yF - 100 - 0.03, Rout - R, Math.max(0.06, 1.6 * px));
  // hurdle positions: 110H (blue) 13.72 + 9.14k, 100H (yellow) 13.00 + 8.50k, 300/400H marks omitted
  for (let k = 0; k < 10; k++) {
    for (const [d, col] of [[yF - 110 + 13.72 + 9.14 * k, '#2f6fd0'], [yF - 100 + 13.0 + 8.5 * k, '#e8c832']]) {
      if (d < -S / 2 + 0.3) continue; g.fillStyle = col;
      for (let n = 0; n <= lanes; n++) g.fillRect(-(R + n * lw) - 0.12, d - 0.025, 0.24, Math.max(0.05, 1.3 * px));
    }
  }
  // staggered 400 m starts on the south bend (one full lap: stagger = 2*pi*((n-1)*lw - 0.10) for n >= 2), with relay zones
  for (let n = 1; n <= lanes; n++) {
    const rho = R + (n - 1) * lw + (n === 1 ? 0.3 : 0.2); const stag = n === 1 ? 0 : 2 * Math.PI * ((n - 1) * lw - 0.1);
    const th = stag / rho; if (n > 1) lineAcross(Math.PI - th, S / 2, n - 1, n);
    for (const dd of [-10, 10]) lineAcross(Math.PI - (stag + dd) / rho, S / 2, n - 1, n - 0.45, 0.05, '#e8c832');
    // 200 m starts on the north bend (half stagger), drawn in white too
    const th2 = (stag / 2) / rho; lineAcross(-th2, -S / 2, n - 1, n);
    for (const dd of [-10, 10]) lineAcross(-((stag / 2) + dd) / rho, -S / 2, n - 1, n - 0.45, 0.05, '#2f6fd0');
  }
  // waterfall (curved) start for the distance races, just past the finish line
  g.strokeStyle = '#f2f1ec'; g.lineWidth = Math.max(0.06, 1.6 * px); g.beginPath();
  for (let i = 0; i <= 24; i++) { const r = R + (lanes * lw * i) / 24; const th = ((r - R) * (r - R)) / (2 * (R + 0.3) * r); const a = Math.PI - th; const X = Math.cos(a) * r, Y = S / 2 + Math.sin(a) * r; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
  g.stroke();
  // break line (green) at the end of the first bend
  g.strokeStyle = '#3aa655'; g.beginPath(); g.moveTo(R, S / 2); g.lineTo(Rout, S / 2 - 0.6); g.stroke();
  // ---- field events
  const runway = (x0, x1, y, pitX) => {
    g.fillStyle = '#b5442f'; g.fillRect(Math.min(x0, x1), y - 0.61, Math.abs(x1 - x0), 1.22);
    g.fillStyle = '#f2f1ec'; g.fillRect(Math.min(x0, x1), y - 0.64, Math.abs(x1 - x0), 0.05); g.fillRect(Math.min(x0, x1), y + 0.59, Math.abs(x1 - x0), 0.05);
    g.fillRect(pitX + (x1 > x0 ? -3 : 2.8), y - 0.61, 0.2, 1.22); g.fillRect(pitX + (x1 > x0 ? -11 : 10.8), y - 0.61, 0.2, 1.22);   // long + triple boards
    g.fillStyle = '#d9c9a0'; g.fillRect(x1 > x0 ? pitX : pitX - 9, y - 1.4, 9, 2.8);
    g.strokeStyle = '#8b8f92'; g.lineWidth = 0.12; g.strokeRect(x1 > x0 ? pitX : pitX - 9, y - 1.4, 9, 2.8);
  };
  // south D (lawn): two horizontal-jump runways with sand pits, shot put circle + sector
  runway(-24, 8, S / 2 + 8.5, 8); runway(24, -8, S / 2 + 13.5, -8);
  {
    const sx = 6, sy = S / 2 + 22; g.fillStyle = '#c9c7c0'; g.beginPath(); g.arc(sx, sy, 1.0675, 0, 7); g.fill();
    g.strokeStyle = '#f2f1ec'; g.lineWidth = 0.05; g.beginPath(); g.arc(sx, sy, 1.09, 0, 7); g.stroke();
    const half = (34.92 * Math.PI) / 360; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - Math.cos(s * half) * 17, sy + Math.sin(s * half) * 17 * 1 - 0); g.stroke(); }
    for (const rr of [9, 12, 15]) { g.beginPath(); g.arc(sx, sy, rr, Math.PI - half, Math.PI + half); g.stroke(); }
    g.fillStyle = '#f2f1ec'; g.fillRect(sx - 0.61 - 0.06, sy - 1.2, 0.1, 0.25);
  }
  // north D (rubber): pole vault runway + box, high jump apron fan
  g.fillStyle = '#f2f1ec'; g.fillRect(-22, -S / 2 - 12.64, 40, 0.05); g.fillRect(-22, -S / 2 - 11.41, 40, 0.05);
  g.fillStyle = '#8b8f92'; g.fillRect(18, -S / 2 - 12.4, 1.1, 0.8);
  g.strokeStyle = '#f2f1ec'; g.lineWidth = 0.05; g.beginPath(); g.arc(-8, -S / 2 - 26, 15, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
  g.fillRect(-10, -S / 2 - 26.03, 4, 0.06);
  g.setTransform(1, 0, 0, 1, 0, 0);
  speckle(g, W, H, 46, 21);
  const q = paintedQuad(ctx, c, cx, cz, wM, hM, -Math.PI / 2, { cut: true, nScale: 0.45, nStrength: 0.75, rough: 0.86, y: 0.011, offset: -2 });
  // aluminium kerb on the inside of lane 1 along the straights and bends (low, visual only)
  const kerb = ctx.B.v('aluminum');
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * Math.PI, a1 = ((i + 1) / 40) * Math.PI;
    for (const sgn of [-1, 1]) kerb.tube([cx + Math.cos(a0) * R, 0.04, cz + sgn * (S / 2 + Math.sin(a0) * R)], [cx + Math.cos(a1) * R, 0.04, cz + sgn * (S / 2 + Math.sin(a1) * R)], 0.028, 4);
  }
  for (const sgn of [-1, 1]) kerb.tube([cx + sgn * R, 0.04, cz - S / 2], [cx + sgn * R, 0.04, cz + S / 2], 0.028, 4);
  return { ...D, quad: q, wM, hM };
}

// ------------------------------------------------------------------------------------------ diamonds
// home = [x, z]; ang = direction from home plate to centre field (atan2(z, x)); kind 'baseball' | 'softball'
export function buildDiamond(ctx, { home, ang, kind = 'baseball', big = 1, size }) {
  const { B } = ctx; const bb = kind === 'baseball';
  const base = (bb ? 90 : 60) * FT, pitch = bb ? 60.5 * FT : 43 * FT, skinR = (bb ? 95 : 60) * FT;
  const half = size || (bb ? 46 : 31);                  // painted area: square around the infield
  const cy = base / Math.SQRT2 + (bb ? 6 : 4);          // centre of the painted quad along the home->CF axis
  const W = (bb ? 1024 : 512) * big, ppm = W / (2 * half);
  const c = makeCanvas(W, W), g = c.getContext('2d');
  // local metres: origin at home plate, +y toward centre field (canvas up), +x toward first base side
  g.translate(W / 2, W / 2 + cy * ppm); g.scale(ppm, -ppm);
  const px = 1 / ppm; const r2 = Math.SQRT1_2;
  // mowing stripes (subtle alpha bands that fade out toward the edge of the painted area)
  {
    const sc = makeCanvas(W, W), sg = sc.getContext('2d'); sg.translate(W / 2, W / 2 + cy * ppm); sg.scale(ppm, -ppm);
    for (let i = -20; i < 20; i++) { sg.fillStyle = i & 1 ? 'rgba(255,255,220,0.07)' : 'rgba(0,30,0,0.10)'; sg.fillRect(-half * 2, i * 3.2, half * 4, 3.2); }
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'destination-in';
    const gr = sg.createRadialGradient(W / 2, W / 2, W * 0.25, W / 2, W / 2, W * 0.5); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, W, W);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(sc, 0, 0); g.restore();
  }
  const clay = '#b98a5e';
  // skinned infield: arc of radius skinR about the pitcher's plate, trimmed just outside the foul lines
  g.save();
  g.beginPath(); g.moveTo(0, -1.5); g.lineTo(-80 * r2 - 2.2, 80 * r2 - 2.2 + 0.7); g.lineTo(0, 200); g.lineTo(80 * r2 + 2.2, 80 * r2 - 2.2 + 0.7); g.closePath(); g.clip();
  g.fillStyle = clay; g.beginPath(); g.arc(0, pitch, skinR, 0, 7); g.fill();
  g.restore();
  // home plate circle (13 ft radius) and, for baseball, the grass infield with the mound circle
  g.fillStyle = clay; g.beginPath(); g.arc(0, 0, 13 * FT, 0, 7); g.fill();
  if (bb) {
    const d = base / Math.SQRT2, inset = 1.25;
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, inset * 3.2); g.lineTo(d - inset * 3.2, d); g.lineTo(0, 2 * d - inset * 3.2); g.lineTo(-(d - inset * 3.2), d); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = clay; g.beginPath(); g.arc(0, pitch - 0.46, 9 * FT, 0, 7); g.fill();
    g.beginPath(); g.arc(0, 0, 13 * FT, 0, 7); g.fill();
    // base paths (3 ft either side of the lines) from home to first / third
    g.strokeStyle = clay; g.lineWidth = 1.83; g.beginPath(); g.moveTo(0, 0); g.lineTo(d, d); g.moveTo(0, 0); g.lineTo(-d, d); g.stroke();
  }
  // clay variation / drag marks
  g.save(); g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(${i & 1 ? '255,235,200' : '90,55,30'},0.06)`; g.lineWidth = 1.2; const rr = skinR - 1.5 - i * 2.6; if (rr < 1) break; g.beginPath(); g.arc(0, pitch, rr, 0.75 * Math.PI, 0.25 * Math.PI, true); g.stroke(); }
  g.restore();
  // chalk: foul lines, batter's + catcher's boxes, coach boxes, on-deck circles, running lane, pitcher's circle
  const chalk = '#f4f2ec'; g.strokeStyle = chalk; g.fillStyle = chalk; g.lineWidth = Math.max(0.076, 1.5 * px);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(half * 2, half * 2); g.moveTo(0, 0); g.lineTo(-half * 2, half * 2); g.stroke();
  const bxW = bb ? 4 * FT : 3 * FT, bxL = bb ? 6 * FT : 7 * FT, off = 0.216 + 0.152;
  for (const s of [-1, 1]) g.strokeRect(s > 0 ? off : -off - bxW, -bxL / 2, bxW, bxL);
  g.strokeRect(-0.65, -2.44 - bxL / 2 + 0.6, 1.3, 2.0);
  for (const s of [-1, 1]) {
    const cxm = s * (base * r2 + 4.57 * r2 + 1.6), cym = base * r2 - 4.57 * r2 - 1.6;
    g.save(); g.translate(cxm, cym); g.rotate(s * Math.PI / 4); g.strokeRect(-1.52, -3.05, 3.05, 6.1); g.restore();
    g.beginPath(); g.arc(s * 11.3, -3.5, 0.76, 0, 7); g.stroke();
  }
  // 3 ft running lane along the last half to first base
  g.beginPath(); g.moveTo(base * r2 * 0.5 + 0.914 * r2, base * r2 * 0.5 - 0.914 * r2); g.lineTo(base * r2 + 0.914 * r2, base * r2 - 0.914 * r2); g.stroke();
  if (!bb) { g.beginPath(); g.arc(0, pitch, 8 * FT, 0, 7); g.stroke(); }
  // home plate, pitcher's plate, bases
  g.beginPath(); g.moveTo(-0.216, 0.216); g.lineTo(0.216, 0.216); g.lineTo(0.216, 0); g.lineTo(0, -0.216); g.lineTo(-0.216, 0); g.closePath(); g.fill();
  g.fillRect(-0.305, pitch - 0.076, 0.61, 0.152);
  g.setTransform(1, 0, 0, 1, 0, 0);
  speckle(g, W, W, 38, 33);
  const q = paintedQuad(ctx, c, home[0] + Math.cos(ang) * cy, home[1] + Math.sin(ang) * cy, 2 * half, 2 * half, ang, { blend: true, nScale: 1.4, nStrength: 0.5, rough: 0.95, y: 0.013 });
  // world helper: local (lx toward first base, ly toward centre field)
  const yx = Math.cos(ang), yz = Math.sin(ang), xx = -yz, xz = yx;
  const Wd = (lx, ly) => [home[0] + lx * xx + ly * yx, home[1] + lx * xz + ly * yz];
  // which side is first base in the painted texture? paintedQuad's local x axis is the same (xx, xz).
  const rot = Math.atan2(-yz, yx) + Math.PI / 4;
  const d = base * r2; const p = B.v('paint', true); p.setColor(0.93, 0.93, 0.9);
  for (const [lx, ly] of [[d, d], [0, 2 * d], [-d, d]]) { const w = Wd(lx, ly); p.box(w[0], 0.045, w[1], 0.38, 0.09, 0.38, rot); }
  // raised mound (10 in) for baseball; flat circle for softball
  if (bb) {
    const m = Wd(0, pitch - 0.46); const cl = B.v('clay');
    cl.cyl(m[0], 0.0, m[1], 9 * FT, 0.9, 0.254, 28, 1 / 2.5, true);
    B.c('dirt').cyl(m[0], 0.0, m[1], 9 * FT, 0.9, 0.254, 14, 1, true);
    const rb = Wd(0, pitch); p.box(rb[0], 0.27, rb[1], 0.61, 0.04, 0.152, Math.atan2(-xz, xx));
  }
  return { Wd, base, pitch, skinR, quad: q };
}

// outfield fence + warning track + foul poles: fence radius varies from the foul poles (rSide) to centre (rCentre)
export function outfield(ctx, { home, ang, rLeft, rRight, rCentre, fenceFn, h = 2.4, track = 4.5 }) {
  const { B } = ctx; const yx = Math.cos(ang), yz = Math.sin(ang), xx = -yz, xz = yx;
  const pts = []; const inner = []; const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = -Math.PI / 4 + (i / N) * (Math.PI / 2); const f = Math.abs(t) / (Math.PI / 4); const rs = t < 0 ? rLeft : rRight;
    const r = rCentre - (rCentre - rs) * Math.pow(f, 1.7);
    const lx = Math.sin(t) * r, ly = Math.cos(t) * r; pts.push([home[0] + lx * xx + ly * yx, home[1] + lx * xz + ly * yz]);
    const r2 = r - track; inner.push([home[0] + Math.sin(t) * r2 * xx + Math.cos(t) * r2 * yx, home[1] + Math.sin(t) * r2 * xz + Math.cos(t) * r2 * yz]);
  }
  fenceFn(ctx, pts, { h, screen: h - 0.2, every: 3 });
  const cl = B.v('clay'), cap = B.v('paint', true); cap.setColor(0.95, 0.72, 0.05);
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1], c = inner[i + 1], d = inner[i];
    const up = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]) < 0;
    const A = [a[0], 0.014, a[1]], Bq = [b[0], 0.014, b[1]], C = [c[0], 0.014, c[1]], Dq = [d[0], 0.014, d[1]];
    if (up) cl.quad(A, Bq, C, Dq, [0, 0], [1, 0], [1, 1.5], [0, 1.5]); else cl.quad(A, Dq, C, Bq, [0, 0], [0, 1.5], [1, 1.5], [1, 0]);
    cap.tube([a[0], h + 0.05, a[1]], [b[0], h + 0.05, b[1]], 0.06, 5);          // yellow safety cap on the fence
  }
  for (const pnt of [pts[0], pts[N]]) { cap.cyl(pnt[0], 0, pnt[1], 0.09, 0.09, 9.2, 8, 1, true); B.c('metal').box(pnt[0], 4.6, pnt[1], 0.3, 9.2, 0.3); }
  return { pts };
}

// ------------------------------------------------------------------------------------------ soccer lines on grass
export function soccerLines(ctx, cx, cz, len, wid, rot, big = 1) {
  const W = 512 * big, H = Math.round(W * (len + 4) / (wid + 4)), ppm = W / (wid + 4);
  const c = makeCanvas(W, H), g = c.getContext('2d'); g.translate(W / 2, H / 2); g.scale(ppm, ppm);
  g.strokeStyle = 'rgba(244,242,236,0.92)'; g.lineWidth = Math.max(0.12, 1.6 / ppm);
  g.strokeRect(-wid / 2, -len / 2, wid, len); g.beginPath(); g.moveTo(-wid / 2, 0); g.lineTo(wid / 2, 0); g.stroke();
  g.beginPath(); g.arc(0, 0, 9.15, 0, 7); g.stroke();
  for (const s of [-1, 1]) {
    g.strokeRect(-20.16, s > 0 ? len / 2 - 16.5 : -len / 2, 40.32, 16.5); g.strokeRect(-9.16, s > 0 ? len / 2 - 5.5 : -len / 2, 18.32, 5.5);
    g.beginPath(); g.arc(0, s * (len / 2 - 11), 9.15, s > 0 ? 1.2 * Math.PI : 0.2 * Math.PI, s > 0 ? 1.8 * Math.PI : 0.8 * Math.PI); g.stroke();
    g.fillStyle = 'rgba(244,242,236,0.92)'; g.beginPath(); g.arc(0, s * (len / 2 - 11), 0.15, 0, 7); g.fill();
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * wid / 2, s * len / 2, 1, 0, 7); g.stroke(); }
  }
  return paintedQuad(ctx, c, cx, cz, wid + 4, len + 4, rot, { blend: true, nScale: 2, nStrength: 0.2, rough: 0.95, y: 0.012 });
}
