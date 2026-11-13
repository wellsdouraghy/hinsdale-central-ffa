// Campus landmarks: Dickinson Field (turf, bleachers, press box, lights, scoreboard), practice turf, tennis
// courts, water tower, baseball/softball diamonds, fences.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, mulberry32 } from './util.js';
import { edgeFrame } from './facade.js';
import { buildTrack, buildDiamond, outfield, soccerLines } from './fields.js';

const YD = 0.9144;
const RED = [0.62, 0.07, 0.06], WHITE = [0.9, 0.9, 0.88], YELLOW = [0.95, 0.72, 0.05], DKGREEN = [0.06, 0.16, 0.09], GREY = [0.45, 0.46, 0.47], BLACK = [0.03, 0.03, 0.035];

// ------------------------------------------------------------------------------------------ fences
// chain-link run along a polyline. opts: h, screen (windscreen height or 0), post spacing, gaps [[d0,d1],...]
// measured along the path (metres), solid (bullets stop) default false.
export function fence(ctx, pts, opts = {}) {
  const { B } = ctx; const h = opts.h || 1.8; const gaps = opts.gaps || []; const every = opts.every || 3.0;
  const mesh = B.v('chainlink'), posts = B.v(opts.black ? 'blackMetal' : 'galv'), col = B.c('metal:mesh');
  let dist = 0;
  const inGap = (d) => gaps.some(([a, b]) => d > a && d < b);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue;
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    // split the segment at gap boundaries
    const cuts = [0, L];
    for (const [g0, g1] of gaps) for (const g of [g0 - dist, g1 - dist]) if (g > 0 && g < L) cuts.push(g);
    cuts.sort((x, y) => x - y);
    for (let k = 0; k < cuts.length - 1; k++) {
      const u0 = cuts[k], u1 = cuts[k + 1]; if (u1 - u0 < 0.05 || inGap(dist + (u0 + u1) / 2)) continue;
      const x0 = a[0] + tx * u0, z0 = a[1] + tz * u0, x1 = a[0] + tx * u1, z1 = a[1] + tz * u1;
      mesh.quad([x0, 0.05, z0], [x0, h, z0], [x1, h, z1], [x1, 0.05, z1], [u0 * 2, 0.1], [u0 * 2, h * 2], [u1 * 2, h * 2], [u1 * 2, 0.1]);
      if (opts.screen) B.v('windscreen').quad([x0 + tz * 0.02, 0.1, z0 - tx * 0.02], [x0 + tz * 0.02, opts.screen, z0 - tx * 0.02], [x1 + tz * 0.02, opts.screen, z1 - tx * 0.02], [x1 + tz * 0.02, 0.1, z1 - tx * 0.02],
        [u0 * 4, 0], [u0 * 4, opts.screen * 4], [u1 * 4, opts.screen * 4], [u1 * 4, 0]);
      posts.tube([x0, h, z0], [x1, h, z1], 0.025, 5);
      const n = Math.max(1, Math.round((u1 - u0) / every));
      for (let p = 0; p <= n; p++) { const u = u0 + (u1 - u0) * (p / n); posts.cyl(a[0] + tx * u, 0, a[1] + tz * u, 0.035, 0.035, h + 0.04, 6, 1, true); }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      col.box(cx, h / 2, cz, u1 - u0, h, 0.08, Math.atan2(-tz, tx));
    }
    dist += L;
  }
}

// ------------------------------------------------------------------------------------------ bleachers
// Aluminium bleacher block. (x, z) = front-left corner when looking at it from the field, dir = angle of the
// "length" axis (atan2(-tz, tx) convention like Bucket.box rotY); depth axis goes away from the field.
export function bleachers(ctx, o) {
  const { B } = ctx;
  const len = o.len, rows = o.rows, run = o.run || 0.72, rise = o.rise || 0.36, frontH = o.frontH === undefined ? 1.0 : o.frontH;
  const c = Math.cos(o.dir), s = Math.sin(o.dir);
  // local (u along length, d depth going back, y) -> world
  const W = (u, y, d) => [o.x + u * c + d * s, y, o.z - u * s + d * c];
  const al = B.v('aluminum'), gv = B.v('galv'), paint = B.v('paint', true);
  const depth = rows * run + (frontH > 0 ? 1.4 : 0); const walk = frontH > 0 ? 1.4 : 0;
  const topY = frontH + rows * rise;
  const boxL = (bucket, u0, u1, y0, y1, d0, d1) => {
    const m = W((u0 + u1) / 2, (y0 + y1) / 2, (d0 + d1) / 2);
    bucket.box(m[0], m[1], m[2], u1 - u0, y1 - y0, d1 - d0, o.dir, 1);
  };
  const aisles = []; const nA = Math.max(1, Math.round(len / 14));
  for (let i = 0; i <= nA; i++) aisles.push((len * i) / nA);
  // front walkway deck
  if (frontH > 0) boxL(al, 0, len, frontH - 0.06, frontH, 0, walk);
  for (let r = 0; r < rows; r++) {
    const d0 = walk + r * run, y = frontH + (r + 1) * rise;
    // riser + foot plank
    boxL(gv, 0, len, y - rise, y - 0.02, d0, d0 + 0.03);
    boxL(al, 0, len, y - 0.05, y, d0 + 0.03, d0 + run);
    // seat boards between aisles (aisle width 1.3)
    for (let k = 0; k < aisles.length - 1; k++) {
      const u0 = aisles[k] + (k === 0 ? 0.15 : 0.65), u1 = aisles[k + 1] - (k === aisles.length - 2 ? 0.15 : 0.65);
      const red = o.redCenter && k >= Math.floor((aisles.length - 1) / 2 - 0.6) && k <= Math.ceil((aisles.length - 1) / 2 - 0.4);
      if (red) { paint.setColor(...RED); boxL(paint, u0, u1, y + 0.36, y + 0.41, d0 + run - 0.34, d0 + run - 0.06); }
      else boxL(al, u0, u1, y + 0.36, y + 0.41, d0 + run - 0.34, d0 + run - 0.06);
    }
  }
  // closed sides, back and front
  const side = (u, flip) => {
    const p0 = W(u, 0, 0), p1 = W(u, frontH, 0), p2 = W(u, frontH, walk), p3 = W(u, topY, depth), p4 = W(u, 0, depth);
    const q = (a, b, cc, d) => (flip ? gv.quad(a, d, cc, b) : gv.quad(a, b, cc, d));
    q(p0, p1, p2, W(u, 0, walk)); q(W(u, 0, walk), p2, p3, p4);
  };
  side(0, true); side(len, false);
  boxL(gv, 0, len, 0, topY + 1.05, depth, depth + 0.06);
  if (frontH > 0) boxL(gv, 0, len, 0, frontH, -0.04, 0.02);
  // guard rails (front + sides)
  const rail = B.v('galv');
  if (frontH > 0) { rail.tube(W(0, frontH + 1.05, 0), W(len, frontH + 1.05, 0), 0.025, 5); B.v('chainlink').quad(W(0, frontH, 0), W(0, frontH + 1.05, 0), W(len, frontH + 1.05, 0), W(len, frontH, 0), [0, 0], [0, 2.1], [len * 2, 2.1], [len * 2, 0]); }
  // ---- collision: ramp over the seating + walls
  const col = ctx.B.c('metal');
  col.quad(W(0, frontH, walk), W(len, frontH, walk), W(len, topY, depth), W(0, topY, depth));
  col.quad(W(0, topY, depth), W(len, topY, depth), W(len, frontH, walk), W(0, frontH, walk));
  if (frontH > 0) {
    const m = W(len / 2, frontH / 2, walk / 2); col.box(m[0], m[1], m[2], len, frontH, walk, o.dir);
    const g = W(len / 2, frontH + 0.5, 0); ctx.B.c('metal:mesh').box(g[0], g[1], g[2], len, 1.05, 0.06, o.dir);
    // access ramps at both ends of the walkway
    for (const [ua, ub] of [[-3.2, 0], [len + 3.2, len]]) {
      al.quad(W(ua, 0, 0), W(ua, 0, walk), W(ub, frontH, walk), W(ub, frontH, 0));
      al.quad(W(ua, 0, 0), W(ub, frontH, 0), W(ub, frontH, walk), W(ua, 0, walk));
      col.quad(W(ua, 0, 0), W(ua, 0, walk), W(ub, frontH, walk), W(ub, frontH, 0));
      col.quad(W(ua, 0, 0), W(ub, frontH, 0), W(ub, frontH, walk), W(ua, 0, walk));
    }
  }
  const bk = W(len / 2, (topY + 1.05) / 2, depth + 0.03); col.box(bk[0], bk[1], bk[2], len, topY + 1.05, 0.12, o.dir);
  for (const u of [0, len]) {
    // triangular side walls as two thin boxes (approximation) + exact tris
    col.quad(W(u, 0, walk), W(u, frontH, walk), W(u, topY, depth), W(u, 0, depth));
    col.quad(W(u, 0, walk), W(u, 0, depth), W(u, topY, depth), W(u, frontH, walk));
  }
  return { W, topY, depth };
}

function lightPole(ctx, x, z, h, face, banks = 3) {
  const { B } = ctx;
  B.v('galv').cyl(x, 0, z, 0.36, 0.2, h, 10, 1, true);
  B.c('metal').box(x, 3, z, 0.7, 6, 0.7);
  B.solidBox('concrete', 'concrete', x, 0.3, z, 1.1, 0.6, 1.1, 0, 1 / 3);
  const c = Math.cos(face), s = Math.sin(face);
  for (let r = 0; r < banks; r++) {
    const y = h - 0.6 - r * 1.05;
    B.v('galv').box(x, y, z, 5.4, 0.12, 0.12, face);
    for (let k = -2; k <= 2; k++) {
      const lx = x + k * 1.05 * c - 0.35 * s, lz = z - k * 1.05 * s - 0.35 * c;
      B.v('blackMetal').box(lx, y, lz, 0.6, 0.6, 0.35, face);
      B.v('lightEmit').box(lx - 0.19 * s, y, lz - 0.19 * c, 0.5, 0.5, 0.03, face);
    }
  }
}

function lotLight(ctx, x, z, h = 8.5) {
  const { B } = ctx;
  B.solidBox('concrete', 'concrete', x, 0.45, z, 0.6, 0.9, 0.6, 0, 1 / 3);
  B.v('blackMetal').cyl(x, 0.9, z, 0.09, 0.07, h - 0.9, 8, 1, true);
  B.v('blackMetal').box(x, h, z, 1.8, 0.1, 0.12); B.v('blackMetal').box(x - 0.9, h - 0.08, z, 0.6, 0.14, 0.34); B.v('blackMetal').box(x + 0.9, h - 0.08, z, 0.6, 0.14, 0.34);
}

export function lampPost(ctx, x, z) {
  // black historic-style post with an acorn globe, as along the 55th St frontage
  const { B } = ctx;
  B.v('blackMetal').cyl(x, 0, z, 0.16, 0.11, 0.7, 10, 1, false).cyl(x, 0.7, z, 0.07, 0.055, 3.0, 8, 1, false).cyl(x, 3.7, z, 0.13, 0.1, 0.12, 8, 1, true);
  B.v('lightEmit').cyl(x, 3.82, z, 0.13, 0.2, 0.28, 10, 1, false).cyl(x, 4.1, z, 0.2, 0.05, 0.34, 10, 1, true);
  B.c('metal').box(x, 2, z, 0.3, 4, 0.3);
}

function goalPost(ctx, x, z, dirZ) {
  // dirZ = +1 if the field lies toward +z from this post
  const { B } = ctx; const p = B.v('paint', true); p.setColor(...YELLOW);
  const bz = z - dirZ * 1.6;
  p.cyl(x, 0, bz, 0.085, 0.085, 3.05, 10, 1, true);
  p.tube([x, 3.05, bz], [x, 3.05, z], 0.085, 8);
  p.tube([x - 3.555, 3.05, z], [x + 3.555, 3.05, z], 0.07, 8);
  p.cyl(x - 3.555, 3.05, z, 0.05, 0.05, 6.1, 8, 1, true); p.cyl(x + 3.555, 3.05, z, 0.05, 0.05, 6.1, 8, 1, true);
  B.c('metal').box(x, 1.5, bz, 0.5, 3.0, 0.5);
  // padding
  p.setColor(...RED); p.cyl(x, 0, bz, 0.2, 0.2, 1.8, 10, 1, true);
}

function soccerGoal(ctx, x, z, rotY) {
  const { B } = ctx; const p = B.v('paint', true); p.setColor(...WHITE);
  const c = Math.cos(rotY), s = Math.sin(rotY); const W = (u, y, d) => [x + u * c + d * s, y, z - u * s + d * c];
  p.tube(W(-3.66, 0, 0), W(-3.66, 2.44, 0), 0.06, 6); p.tube(W(3.66, 0, 0), W(3.66, 2.44, 0), 0.06, 6); p.tube(W(-3.66, 2.44, 0), W(3.66, 2.44, 0), 0.06, 6);
  p.tube(W(-3.66, 2.44, 0), W(-3.66, 0, 1.8), 0.03, 5); p.tube(W(3.66, 2.44, 0), W(3.66, 0, 1.8), 0.03, 5); p.tube(W(-3.66, 0, 1.8), W(3.66, 0, 1.8), 0.03, 5);
  const net = B.v('net');
  net.quad(W(-3.66, 0, 1.8), W(-3.66, 2.44, 0), W(3.66, 2.44, 0), W(3.66, 0, 1.8), [0, 0], [0, 6], [14, 6], [14, 0]);
  B.c('metal:mesh').box(...W(0, 1.2, 0.9), 7.4, 2.4, 1.8, rotY);
}

// ------------------------------------------------------------------------------------------ painted surfaces
function drawFootballField(g, ppm, cx, cy, o) {
  // origin = field centre; +y = south. All sizes in metres * ppm.
  const m = (v) => v * ppm; const FW = 53.333 * YD, HL = 50 * YD, EZ = 10 * YD;
  g.save(); g.translate(cx, cy);
  // mowing-style stripes every 5 yards
  for (let i = -10; i < 10; i++) { g.fillStyle = (i & 1) ? '#24724c' : '#206a46'; g.fillRect(m(-FW / 2), m(i * 5 * YD), m(FW), m(5 * YD) + 1); }
  // end zones
  for (const sgn of [-1, 1]) {
    g.fillStyle = o.endColor; g.fillRect(m(-FW / 2), sgn > 0 ? m(HL) : m(-HL - EZ), m(FW), m(EZ));
    if (o.endText) {
      g.save(); g.translate(0, sgn * m(HL + EZ / 2)); if (sgn > 0) g.rotate(Math.PI);
      g.fillStyle = '#f4f4f0'; g.font = `900 ${m(5.6)}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (g.letterSpacing !== undefined) g.letterSpacing = `${m(1.2)}px`;
      g.fillText(sgn < 0 ? o.endText[0] : o.endText[1], m(0.6), m(0.25));
      g.restore();
    }
  }
  g.fillStyle = '#f4f4f0';
  const lw = Math.max(2, m(0.11));
  // yard lines
  for (let i = -10; i <= 10; i++) g.fillRect(m(-FW / 2), m(i * 5 * YD) - lw / 2, m(FW), lw);
  // boundary
  const bw = m(0.6);
  g.fillRect(m(-FW / 2) - bw, m(-HL - EZ) - bw, m(FW) + 2 * bw, bw); g.fillRect(m(-FW / 2) - bw, m(HL + EZ), m(FW) + 2 * bw, bw);
  g.fillRect(m(-FW / 2) - bw, m(-HL - EZ), bw, m(2 * (HL + EZ))); g.fillRect(m(FW / 2), m(-HL - EZ), bw, m(2 * (HL + EZ)));
  // hash marks (high school: 53'4" from each sideline) + sideline ticks, every yard
  const hx = FW / 2 - 16.256;
  for (let y = -49; y <= 49; y++) {
    if (y % 5 === 0) continue;
    for (const x of [-hx, hx]) g.fillRect(m(x) - m(0.3), m(y * YD) - lw / 2, m(0.6), lw);
    g.fillRect(m(-FW / 2), m(y * YD) - lw / 2, m(0.6), lw); g.fillRect(m(FW / 2) - m(0.6), m(y * YD) - lw / 2, m(0.6), lw);
  }
  // numbers: 6 ft tall x 4 ft wide, tops 9 yards from the sideline, with direction arrows toward the nearer goal
  g.font = `700 ${m(1.83)}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (g.letterSpacing !== undefined) g.letterSpacing = '0px';
  for (let i = -4; i <= 4; i++) {
    const n = String(50 - Math.abs(i) * 10);
    for (const side of [-1, 1]) {
      g.save(); g.translate(side * m(FW / 2 - 9 * YD + 0.915), m(i * 10 * YD)); g.rotate(side < 0 ? Math.PI / 2 : -Math.PI / 2);
      g.fillText(n[0], -m(0.95), m(0.06)); g.fillText(n[1], m(0.95), m(0.06));
      if (i !== 0) { const dir = (side < 0 ? 1 : -1) * Math.sign(i); const ax = dir * m(2.05); g.beginPath(); g.moveTo(ax, -m(0.2)); g.lineTo(ax + dir * m(0.75), m(0.0) - m(0.2) + m(0.23)); g.lineTo(ax, m(0.26)); g.closePath(); g.fill(); }
      g.restore();
    }
  }
  // team boxes (between the 25s), coaching line and the 2 yd restraining line
  g.strokeStyle = '#f4f4f0'; g.lineWidth = lw;
  for (const side of [-1, 1]) {
    const x0b = side * m(FW / 2 + 1.83), x1b = side * m(FW / 2 + 1.83 + 4.2);
    g.strokeRect(Math.min(x0b, x1b), m(-25 * YD), Math.abs(x1b - x0b), m(50 * YD));
    g.setLineDash([m(0.9), m(0.9)]); g.beginPath(); g.moveTo(side * m(FW / 2 + 1.83), m(-HL)); g.lineTo(side * m(FW / 2 + 1.83), m(HL)); g.stroke(); g.setLineDash([]);
  }
  // inbounds 3-yard try lines and kick-off marks
  for (const sgn of [-1, 1]) { g.fillRect(-m(0.45), sgn * m(47 * YD) - lw / 2, m(0.9), lw); g.fillRect(-m(0.3), sgn * m(10 * YD) - lw, m(0.6), lw * 2); }
  if (o.soccer) {
    g.strokeStyle = o.soccer; g.lineWidth = Math.max(2, m(0.1));
    g.strokeRect(m(-FW / 2 + 0.25), m(-HL - 4.0), m(FW - 0.5), m(2 * HL + 8.0)); g.beginPath(); g.arc(0, 0, m(9.15), 0, Math.PI * 2); g.stroke();
    for (const sgn of [-1, 1]) { const yy = sgn * m(HL + 4.0); g.strokeRect(-m(20.16), sgn > 0 ? yy - m(16.5) : yy, m(40.32), m(16.5)); g.strokeRect(-m(9.16), sgn > 0 ? yy - m(5.5) : yy, m(18.32), m(5.5)); }
  }
  // midfield logo
  if (o.logo) {
    g.fillStyle = '#a8231c'; g.beginPath(); g.arc(0, 0, m(4.6), 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(0, 0, m(4.0), 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a8231c'; g.font = `900 ${m(4.6)}px Georgia, "Times New Roman", serif`; if (g.letterSpacing !== undefined) g.letterSpacing = '0px';
    g.save(); g.rotate(-Math.PI / 2); g.fillText('HC', 0, m(0.2)); g.restore();
  }
  g.restore();
}

export function turfNoise(g, W, H, amt, seed) {
  // fine fibre noise so the paint does not look vector-flat up close
  const rnd = mulberry32(seed); const n = makeCanvas(256, 256), ng = n.getContext('2d'); const id = ng.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) { const v = rnd() < 0.5 ? 0 : 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = Math.floor(rnd() * amt); }
  ng.putImageData(id, 0, 0);
  g.save(); g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
}

function addOverlay(ctx, canvas, x0, z0, x1, z1, opts = {}) {
  const tex = canvasTexture(canvas, { repeat: false, aniso: ctx.T.aniso });
  const nrm = ctx.T.asphaltNormal.clone(); nrm.needsUpdate = true; nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.repeat.set((x1 - x0) / (opts.nScale || 0.8), (z1 - z0) / (opts.nScale || 0.8));
  const mat = new THREE.MeshStandardMaterial({ map: tex, normalMap: ctx.quality === 'low' ? null : nrm, roughness: opts.rough || 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.normalScale.set(0.55, 0.55);
  ctx.applyBakedShadow(mat, ctx.sky.shadowUniforms);
  const g = new THREE.BufferGeometry(); const y = opts.y || 0.012;
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.name = 'overlay'; mesh.matrixAutoUpdate = false;
  ctx.scene.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------------------------------ main
export function buildLandmarks(ctx) {
  const { B, quality } = ctx;
  const big = quality === 'high' ? 2 : 1;       // canvas resolution multiplier

  // ================= Dickinson Field: 400 m track around the turf field
  {
    // The real oval is ~80 m wide between the stands (a 36.5 m / 1.22 m-lane IAAF oval is 92.5 m and does not fit),
    // so this is a 400 m (lane 1) track with eight 42 in (1.07 m, NFHS minimum) lanes and 31.5 m bends.
    const TCX = -150.8, TCZ = -100.5;
    const trk = buildTrack(ctx, { cx: TCX, cz: TCZ, R: 31.5, lanes: 8, lw: 1.0668, big, hole: [59.6, 117.4] });
    ctx.track = { cx: TCX, cz: TCZ, ...trk };
    const fcx = TCX, fcz = TCZ; const fw = 59.6, fl = 117.4;
    const x0 = fcx - fw / 2, x1 = fcx + fw / 2, z0 = fcz - fl / 2, z1 = fcz + fl / 2;
    const W = 1024 * big, H = Math.round(W * (z1 - z0) / (x1 - x0)), ppm = W / (x1 - x0);
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#1e6040'; g.fillRect(0, 0, W, H);
    const px = (x) => (x - x0) * ppm, pz = (z) => (z - z0) * ppm; const hw = 53.333 * YD / 2;
    // red surround at both ends, white team areas along the middle third (as in the imagery)
    g.fillStyle = '#cf4330'; g.fillRect(px(fcx - hw - 4), pz(fcz - 58), (2 * hw + 8) * ppm, 35.5 * ppm); g.fillRect(px(fcx - hw - 4), pz(fcz + 22.5), (2 * hw + 8) * ppm, 35.5 * ppm);
    g.fillStyle = '#1e6040'; g.fillRect(px(fcx - hw - 1.2), pz(fcz - 22.5), (2 * hw + 2.4) * ppm, 45 * ppm);
    g.fillStyle = '#d9dad6'; g.fillRect(px(fcx - hw - 4), pz(fcz - 22.5), 2.8 * ppm, 45 * ppm); g.fillRect(px(fcx + hw + 1.2), pz(fcz - 22.5), 2.8 * ppm, 45 * ppm);
    drawFootballField(g, ppm, px(fcx), pz(fcz), { endColor: '#d8452f', endText: ['HINSDALE', 'CENTRAL'], logo: true, soccer: '#e8c832' });
    turfNoise(g, W, H, 34, 11);
    addOverlay(ctx, c, x0, z0, x1, z1, { y: 0.016, nScale: 0.5 });
    goalPost(ctx, fcx, fcz - 60 * YD, 1); goalPost(ctx, fcx, fcz + 60 * YD, -1);

    // home stand (west), press box on top: aluminium planks on 24 in row spacing
    const hx = TCX - trk.Rout - 1.3;
    const hs = bleachers(ctx, { x: hx, z: fcz - 39.8, dir: -Math.PI / 2, len: 79.6, rows: 15, run: 0.61, rise: 0.22, frontH: 1.0, redCenter: true });
    {
      const pbx = hx - 1.4 - 15 * 0.61 + 1.9, pz0 = fcz - 15, pz1 = fcz + 15, y0 = hs.topY + 0.3, hh = 3.0;
      B.v('whitePanel').box(pbx, y0 + hh / 2, (pz0 + pz1) / 2, 3.4, hh, pz1 - pz0);
      B.c('metal').box(pbx, y0 + hh / 2, (pz0 + pz1) / 2, 3.4, hh, pz1 - pz0);
      B.v('carGlass').box(pbx + 1.72, y0 + 1.9, (pz0 + pz1) / 2, 0.04, 1.3, pz1 - pz0 - 1.2);
      for (let z = pz0 + 0.6; z <= pz1 - 0.5; z += 2.4) B.v('frame').box(pbx + 1.745, y0 + 1.9, z, 0.05, 1.36, 0.07);
      B.v('paint', true).setColor(...RED).box(pbx + 1.73, y0 + 0.55, (pz0 + pz1) / 2, 0.05, 0.9, pz1 - pz0);
      B.v('galv').box(pbx, y0 + hh + 0.06, (pz0 + pz1) / 2, 3.8, 0.12, pz1 - pz0 + 0.4);
      // camera deck rail on the roof + door at the south end
      const rl = B.v('galv'); const ry = y0 + hh + 0.12;
      for (const [xa, za, xb, zb] of [[pbx - 1.8, pz0, pbx + 1.8, pz0], [pbx + 1.8, pz0, pbx + 1.8, pz1], [pbx + 1.8, pz1, pbx - 1.8, pz1], [pbx - 1.8, pz1, pbx - 1.8, pz0]]) rl.tube([xa, ry + 1.0, za], [xb, ry + 1.0, zb], 0.025, 5).tube([xa, ry, za], [xa, ry + 1.0, za], 0.02, 4);
      B.v('frame').box(pbx, y0 + 1.05, pz1 + 0.02, 0.95, 2.1, 0.05);
      for (const z of [pz0 + 1, (pz0 + pz1) / 2, pz1 - 1]) B.v('galv').cyl(pbx - 1.2, 0, z, 0.12, 0.12, y0, 8, 1, false);
      const tex = ctx.M.textDecal(['HINSDALE CENTRAL RED DEVILS'], { w: 2048, h: 128, font: 96, color: '#ffffff', align: 'center', weight: 800 });
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(pz1 - pz0 - 2, 0.8), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, roughness: 0.6 }));
      sm.position.set(pbx + 1.77, y0 + 0.55, (pz0 + pz1) / 2); sm.rotation.y = Math.PI / 2; ctx.scene.add(sm);
    }
    // visitors (east)
    bleachers(ctx, { x: -101.2, z: fcz + 32, dir: Math.PI / 2, len: 64, rows: 9, run: 0.61, rise: 0.22, frontH: 0.85 });
    // lights
    lightPole(ctx, hx - 13.6, fcz - 30, 27, Math.PI / 2 + Math.PI); lightPole(ctx, hx - 13.6, fcz + 36, 27, Math.PI / 2 + Math.PI);
    lightPole(ctx, -97.6, fcz - 37, 27, Math.PI / 2); lightPole(ctx, -97.6, fcz + 35, 27, Math.PI / 2);
    // scoreboard (south end, facing the field)
    {
      const sx = TCX - 1.5, sz = -24.0;
      for (const dx of [-3.4, 3.4]) { B.v('galv').cyl(sx + dx, 0, sz, 0.16, 0.16, 7.6, 8, 1, true); B.c('metal').box(sx + dx, 3.8, sz, 0.4, 7.6, 0.4); }
      B.v('paint', true).setColor(...BLACK).box(sx, 5.6, sz, 9.6, 4.0, 0.35);
      B.c('metal').box(sx, 5.6, sz, 9.6, 4.0, 0.35);
      const c2 = makeCanvas(1024, 426), g2 = c2.getContext('2d');
      g2.fillStyle = '#141414'; g2.fillRect(0, 0, 1024, 426); g2.fillStyle = '#9e1b16'; g2.fillRect(0, 0, 1024, 96);
      g2.fillStyle = '#fff'; g2.font = '800 70px Arial, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('HINSDALE CENTRAL', 512, 52);
      g2.font = '700 40px Arial'; g2.fillText('HOME', 180, 130); g2.fillText('GUEST', 844, 130); g2.fillText('QTR', 512, 250); g2.fillText('DOWN', 180, 330); g2.fillText('TO GO', 512, 330); g2.fillText('BALL ON', 844, 330);
      g2.fillStyle = '#000'; for (const [x, y, w, h] of [[90, 160, 180, 110], [754, 160, 180, 110], [400, 110, 224, 100], [472, 270, 80, 50]]) g2.fillRect(x, y, w, h);
      g2.fillStyle = '#ffb000'; g2.font = '700 96px "Courier New", monospace'; g2.fillText('21', 180, 218); g2.fillText('14', 844, 218); g2.fillStyle = '#ff3b30'; g2.fillText('12:00', 512, 164); g2.font = '700 44px "Courier New", monospace'; g2.fillText('4', 512, 296);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 3.95), new THREE.MeshStandardMaterial({ map: canvasTexture(c2, { repeat: false }), roughness: 0.5, emissive: 0xffffff, emissiveMap: canvasTexture(c2, { repeat: false }), emissiveIntensity: 0.12 }));
      sm.position.set(sx, 5.6, sz - 0.185); sm.rotation.y = Math.PI; ctx.scene.add(sm);
    }
    // team benches between the sideline and lane 1
    for (const x of [fcx - 28.9, fcx + 28.9]) for (const z of [-14, -5, 5, 14]) { B.v('aluminum').box(x, 0.45, fcz + z, 0.32, 0.05, 6.5); B.v('galv').box(x, 0.22, fcz + z - 2.6, 0.3, 0.44, 0.06).box(x, 0.22, fcz + z + 2.6, 0.3, 0.44, 0.06); B.c('metal').box(x, 0.25, fcz + z, 0.4, 0.5, 6.5); }
    // storage sheds at the south end (seen in the imagery) – useful cover
    for (const [x, z] of [[-186.5, -15.5], [-113.5, -15.5]]) { B.v('paint', true).setColor(0.22, 0.2, 0.18).box(x, 1.25, z, 6.2, 2.5, 3.0); B.v('galv').box(x, 2.56, z, 6.5, 0.12, 3.3); B.c('metal').box(x, 1.3, z, 6.2, 2.6, 3.0); }
    // perimeter fence with gates
    fence(ctx, [[-91.2, -191.7], [-208, -191.7], [-208, -9.2], [-166, -9.2]], { h: 1.8, black: false, gaps: [[52, 60], [150, 156], [250, 256], [300, 304], [326, 334]] });
    fence(ctx, [[-134.5, -9.2], [-100, -9.2]], { h: 1.8, gaps: [[14, 20]] });
  }

  // ================= practice turf (south of the stadium)
  {
    const x0 = -88.3, x1 = -30.3, z0 = -21.4, z1 = 95.8, fcx = -59.2, fcz = 37.0;
    const W = 1024 * big, H = Math.round(W * (z1 - z0) / (x1 - x0)), ppm = W / (x1 - x0);
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#b3352b'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d9dad6'; g.fillRect(0, (9 - z0) * ppm, W, (58) * ppm);
    g.fillStyle = '#1e6040'; g.fillRect(2.4 * ppm, 2.4 * ppm, W - 4.8 * ppm, H - 4.8 * ppm);
    drawFootballField(g, ppm, (fcx - x0) * ppm, (fcz - z0) * ppm, { endColor: '#206a46', endText: null, logo: false });
    // soccer markings in yellow
    g.strokeStyle = '#e8c832'; g.lineWidth = Math.max(2, 0.1 * ppm); const sx = (fcx - x0) * ppm, sy = (fcz - z0) * ppm;
    g.strokeRect(sx - 24.6 * ppm, sy - 53 * ppm, 49.2 * ppm, 106 * ppm); g.beginPath(); g.arc(sx, sy, 9.15 * ppm, 0, Math.PI * 2); g.stroke();
    for (const s of [-1, 1]) { g.strokeRect(sx - 20.15 * ppm, s > 0 ? sy + 36.5 * ppm : sy - 53 * ppm, 40.3 * ppm, 16.5 * ppm); g.strokeRect(sx - 9.15 * ppm, s > 0 ? sy + 47.5 * ppm : sy - 53 * ppm, 18.3 * ppm, 5.5 * ppm); }
    turfNoise(g, W, H, 34, 12);
    addOverlay(ctx, c, x0, z0, x1, z1);
    goalPost(ctx, fcx, fcz - 60 * YD, 1); goalPost(ctx, fcx, fcz + 60 * YD, -1);
    soccerGoal(ctx, fcx - 12, -19.6, Math.PI); soccerGoal(ctx, fcx + 13, 94.2, 0);
    // small bleachers + sheds west of the turf (visible in the imagery)
    bleachers(ctx, { x: -108.4, z: 50, dir: -Math.PI / 2, len: 9, rows: 5, run: 0.61, rise: 0.22, frontH: 0 });
    bleachers(ctx, { x: -108.4, z: 62, dir: -Math.PI / 2, len: 9, rows: 5, run: 0.61, rise: 0.22, frontH: 0 });
    bleachers(ctx, { x: -108.4, z: 74, dir: -Math.PI / 2, len: 9, rows: 5, run: 0.61, rise: 0.22, frontH: 0 });
    B.v('paint', true).setColor(0.3, 0.1, 0.09).box(-99.5, 1.3, 30.5, 4.5, 2.6, 3.2); B.v('galv').box(-99.5, 2.66, 30.5, 4.9, 0.12, 3.6); B.c('wood').box(-99.5, 1.3, 30.5, 4.5, 2.6, 3.2);
    for (const z of [10, 30, 50, 70]) { B.v('aluminum').box(-27.6, 0.45, z, 0.32, 0.05, 5); B.c('metal').box(-27.6, 0.25, z, 0.4, 0.5, 5); }
    fence(ctx, [[-89.5, -22.6], [-89.5, 97], [-29, 97]], { h: 1.2, gaps: [[20, 26], [70, 76], [126, 134], [160, 168]] });
  }

  // ================= tennis courts (3 x 3)
  {
    const x0 = -91.2, x1 = -40.6, z0 = -176.6, z1 = -65.0;
    const W = 1024 * big, H = Math.round(W * (z1 - z0) / (x1 - x0)), ppm = W / (x1 - x0);
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#2f6247'; g.fillRect(0, 0, W, H);
    const xs = [-82.6, -66.6, -50.6], zs = [-158.4, -120.8, -83.6];
    g.strokeStyle = '#f2f2ee'; g.lineWidth = Math.max(2, 0.055 * ppm);
    for (const cz of zs) for (const cx of xs) {
      const X = (cx - x0) * ppm, Z = (cz - z0) * ppm; const hw = 5.485 * ppm, hl = 11.885 * ppm, sw = 4.115 * ppm, sl = 6.4 * ppm;
      g.fillStyle = '#a5503f'; g.fillRect(X - hw, Z - hl, 2 * hw, 2 * hl);
      g.strokeRect(X - hw, Z - hl, 2 * hw, 2 * hl); g.strokeRect(X - sw, Z - hl, 2 * sw, 2 * hl); g.strokeRect(X - sw, Z - sl, 2 * sw, 2 * sl);
      g.beginPath(); g.moveTo(X, Z - sl); g.lineTo(X, Z + sl); g.stroke();
      for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(X, Z + sg * hl); g.lineTo(X, Z + sg * (hl - 0.1 * ppm)); g.stroke(); }
      // nets
      // net: 3 ft 6 in (1.07 m) at the posts sagging to 3 ft (0.914 m) at the centre strap
      for (const sg of [-1, 1]) B.v('net').quad([cx, 0.05, cz], [cx, 0.914, cz], [cx + sg * 6.4, 1.07, cz], [cx + sg * 6.4, 0.05, cz], [20, 0], [20, 2.8], [sg > 0 ? 40 : 0, 3.2], [sg > 0 ? 40 : 0, 0]);
      const wp = B.v('paint', true); wp.setColor(...WHITE);
      for (const sg of [-1, 1]) wp.tube([cx, 0.914, cz], [cx + sg * 6.4, 1.07, cz], 0.028, 5);
      wp.box(cx, 0.46, cz, 0.05, 0.92, 0.012);
      wp.setColor(...DKGREEN).cyl(cx - 6.4, 0, cz, 0.05, 0.05, 1.09, 8, 1, true).cyl(cx + 6.4, 0, cz, 0.05, 0.05, 1.09, 8, 1, true);
      B.c('metal:mesh').box(cx, 0.5, cz, 12.8, 1.0, 0.08);
    }
    turfNoise(g, W, H, 22, 13);
    addOverlay(ctx, c, x0, z0, x1, z1, { nScale: 1.6, rough: 0.82 });
    // 3 m fence with wind screens, gates at the corners / between banks
    fence(ctx, [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]], { h: 3.66, screen: 2.0, gaps: [[20, 23], [86, 89], [124, 127], [165, 168], [205, 208], [262, 265], [299, 302]] });
    fence(ctx, [[x0, -139.6], [x1, -139.6]], { h: 3.05, gaps: [[0.5, 3], [24, 27], [47, 50]] });
    fence(ctx, [[x0, -102.2], [x1, -102.2]], { h: 3.05, gaps: [[0.5, 3], [24, 27], [47, 50]] });
    for (const z of [z0 + 1, -139.6, -102.2, z1 - 1]) for (const x of [x0 + 0.6, x1 - 0.6]) lotLight(ctx, x, z, 10);
    for (const cz of zs) for (const x of [-74.6, -58.6]) { B.v('aluminum').box(x, 0.45, cz, 0.3, 0.05, 2.4); B.c('metal').box(x, 0.25, cz, 0.35, 0.5, 2.4); }
  }

  // ================= water tower (standpipe) + compound
  {
    const x = -36.8, z = 125.0, r = 7.4, h = 30; const s = 2 / (2 * Math.PI * r);
    const t = B.v('tower');
    t.cyl(x, 0.5, z, r, r, h - 0.5, 56, s, false);
    const rings = 8;
    for (let i = 0; i < rings; i++) {
      const a0 = (i / rings) * Math.PI / 2, a1 = ((i + 1) / rings) * Math.PI / 2;
      t.cyl(x, h + 4.3 * Math.sin(a0), z, r * Math.cos(a0), Math.max(0.0, r * Math.cos(a1)), 4.3 * (Math.sin(a1) - Math.sin(a0)), 56, s, i === rings - 1);
    }
    t.cyl(x, h + 4.25, z, 0.5, 0.5, 0.9, 10, s, true);
    B.v('galv').cyl(x + 1.5, h + 4.3, z + 0.5, 0.03, 0.03, 4.5, 5, 1, true).cyl(x - 1.2, h + 4.2, z - 0.8, 0.03, 0.03, 3.2, 5, 1, true);
    B.v('concrete').cyl(x, 0, z, r + 0.5, r + 0.5, 0.5, 40, 1 / 3, true);
    // handrail ring at the shoulder + ladder with cage on the north-east side
    const hr = B.v('galv');
    const la = -0.9, lx = x + Math.cos(la) * (r + 0.25), lz = z + Math.sin(la) * (r + 0.25); const tx = -Math.sin(la) * 0.25, tz = Math.cos(la) * 0.25;
    hr.tube([lx - tx, 2.5, lz - tz], [lx - tx, h + 1, lz - tz], 0.025, 4); hr.tube([lx + tx, 2.5, lz + tz], [lx + tx, h + 1, lz + tz], 0.025, 4);
    for (let y = 2.8; y < h + 1; y += 0.6) hr.tube([lx - tx, y, lz - tz], [lx + tx, y, lz + tz], 0.014, 3);
    B.c('metal').cyl(x, 0, z, r + 0.05, r + 0.05, h, 24, 1, false);
    for (let i = 0; i < 6; i++) { const a0 = (i / 6) * Math.PI / 2, a1 = ((i + 1) / 6) * Math.PI / 2; B.c('metal').cyl(x, h + 4.3 * Math.sin(a0), z, r * Math.cos(a0), Math.max(0.0, r * Math.cos(a1)), 4.3 * (Math.sin(a1) - Math.sin(a0)), 24, 1, i === 5); }
    // catwalk around the shoulder (grating + toe board + rail): reachable with the grapple, good overwatch
    for (let i = 0; i < 28; i++) {
      const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2, am = (a0 + a1) / 2; const rm = r + 0.62, seg = 2 * Math.PI * rm / 28 + 0.04;
      const cx = x + Math.cos(am) * rm, cz = z + Math.sin(am) * rm;
      B.v('galv').box(cx, h - 0.04, cz, 1.2, 0.07, seg, -am); B.c('metal').box(cx, h - 0.04, cz, 1.2, 0.08, seg, -am);
      const ro = r + 1.2; hr.tube([x + Math.cos(a0) * ro, h + 1.05, z + Math.sin(a0) * ro], [x + Math.cos(a1) * ro, h + 1.05, z + Math.sin(a1) * ro], 0.028, 4).tube([x + Math.cos(a0) * ro, h + 0.55, z + Math.sin(a0) * ro], [x + Math.cos(a1) * ro, h + 0.55, z + Math.sin(a1) * ro], 0.02, 4).tube([x + Math.cos(a0) * ro, h, z + Math.sin(a0) * ro], [x + Math.cos(a0) * ro, h + 1.05, z + Math.sin(a0) * ro], 0.022, 4);
      B.c('metal:mesh').box(x + Math.cos(am) * ro, h + 0.55, z + Math.sin(am) * ro, 0.06, 1.1, seg, -am);
      if (i % 4 === 0) hr.tube([x + Math.cos(a0) * r, h - 0.9, z + Math.sin(a0) * r], [x + Math.cos(a0) * ro, h - 0.06, z + Math.sin(a0) * ro], 0.03, 4);
    }
    fence(ctx, [[-64, 108], [-21, 108], [-21, 143], [-64, 143], [-64, 108]], { h: 2.1, gaps: [[58, 63], [128, 133]] });
  }

  // ================= varsity baseball (90 ft bases, 60 ft 6 in mound, 95 ft infield arc)
  {
    const p = B.v('paint', true); const HOME = [68.3, 76.0], ANG = Math.PI / 2;      // centre field is due south
    const dia = buildDiamond(ctx, { home: HOME, ang: ANG, kind: 'baseball', big });
    outfield(ctx, { home: HOME, ang: ANG, rLeft: 97.5, rRight: 93.0, rCentre: 110.5, fenceFn: fence });   // ~320 / 305 / 362 ft
    // backstop: brick knee wall + tall netting
    const bs = [[53.8, 79.5], [60.8, 68.0], [75.8, 68.0], [82.8, 79.5]];
    for (let i = 0; i < bs.length - 1; i++) {
      const a = bs[i], b = bs[i + 1]; const F = edgeFrame(a[0], a[1], b[0], b[1]); const m = F.P(F.L / 2, 0.55, 0);
      B.v('brickRed').box(m[0], 0.55, m[2], F.L, 1.1, 0.3, F.rotY, 0.5); B.c('brick').box(m[0], 0.55, m[2], F.L, 1.1, 0.3, F.rotY);
      B.v('paint', true).setColor(...DKGREEN).box(m[0], 1.14, m[2], F.L, 0.09, 0.36, F.rotY);
      B.v('net').quad([a[0], 1.1, a[1]], [a[0], 7, a[1]], [b[0], 7, b[1]], [b[0], 1.1, b[1]], [0, 0], [0, 12], [F.L * 2, 12], [F.L * 2, 0]);
      B.c('metal:mesh').box(m[0], 4.05, m[2], F.L, 5.9, 0.06, F.rotY);
    }
    for (const a of bs) { B.v('blackMetal').cyl(a[0], 0, a[1], 0.09, 0.07, 7.1, 8, 1, true); B.c('metal').box(a[0], 3.5, a[1], 0.3, 7, 0.3); }
    for (let i = 0; i < bs.length - 1; i++) B.v('blackMetal').tube([bs[i][0], 7.05, bs[i][1]], [bs[i + 1][0], 7.05, bs[i + 1][1]], 0.04, 5);
    // dugouts (red roofs), parallel to the base lines
    for (const [cx, cz, rot] of [[44.0, 86.5, -Math.PI * 0.25], [92.6, 86.5, Math.PI * 0.25]]) {
      const c = Math.cos(rot), s = Math.sin(rot); const Wp = (u, d) => [cx + u * c + d * s, cz - u * s + d * c];
      const back = Wp(0, -1.5), l = Wp(-6.4, 0), r = Wp(6.4, 0), roof = Wp(0, 0);
      B.v('brickRed').box(back[0], 1.2, back[1], 13, 2.4, 0.25, rot, 0.5); B.c('brick').box(back[0], 1.2, back[1], 13, 2.4, 0.25, rot);
      B.v('brickRed').box(l[0], 1.2, l[1], 0.25, 2.4, 3.0, rot, 0.5).box(r[0], 1.2, r[1], 0.25, 2.4, 3.0, rot, 0.5);
      B.c('brick').box(l[0], 1.2, l[1], 0.25, 2.4, 3.0, rot).box(r[0], 1.2, r[1], 0.25, 2.4, 3.0, rot);
      p.setColor(...RED).box(roof[0], 2.5, roof[1], 13.6, 0.16, 3.8, rot); B.c('metal').box(roof[0], 2.5, roof[1], 13.6, 0.16, 3.8, rot);
      B.v('concrete').box(roof[0], 0.03, roof[1], 12.6, 0.06, 3.0, rot, 1 / 3);
      const bn = Wp(0, -0.9); B.v('aluminum').box(bn[0], 0.45, bn[1], 11.5, 0.05, 0.3, rot); B.c('metal').box(bn[0], 0.25, bn[1], 11.5, 0.5, 0.35, rot);
      const fr = Wp(0, 1.55), f0 = Wp(-6.4, 1.55), f1 = Wp(6.4, 1.55);
      B.v('chainlink').quad([f0[0], 0, f0[1]], [f0[0], 1.1, f0[1]], [f1[0], 1.1, f1[1]], [f1[0], 0, f1[1]], [0, 0], [0, 2.2], [25, 2.2], [25, 0]);
      B.v('paint', true).setColor(0.95, 0.72, 0.05).tube([f0[0], 1.13, f0[1]], [f1[0], 1.13, f1[1]], 0.05, 5);
      B.c('metal:mesh').box(fr[0], 0.55, fr[1], 12.8, 1.1, 0.06, rot);
    }
    // spectator bleachers behind the backstop + press box
    bleachers(ctx, { x: 58.9, z: 66.8, dir: -Math.PI * 0.75, len: 10, rows: 5, run: 0.61, rise: 0.22, frontH: 0 });
    bleachers(ctx, { x: 86.3, z: 75.4, dir: Math.PI * 0.75, len: 10, rows: 5, run: 0.61, rise: 0.22, frontH: 0 });
    B.v('whitePanel').box(69.5, 2.6, 62.4, 5.2, 3.0, 3.2); B.v('galv').cyl(67.5, 0, 62.4, 0.1, 0.1, 1.2, 6).cyl(71.5, 0, 62.4, 0.1, 0.1, 1.2, 6); B.v('carGlass').box(69.5, 3.0, 64.02, 4.6, 1.1, 0.04);
    B.c('metal').box(69.5, 2.05, 62.4, 5.2, 4.1, 3.2);
    // foul-territory fences from the dugouts out to the foul poles, bullpen mounds beside them
    for (const sgn of [-1, 1]) {
      const a = dia.Wd(sgn * 38 * Math.SQRT1_2 + sgn * 6.5, 38 * Math.SQRT1_2 - 6.5), b = dia.Wd(sgn * 96 * Math.SQRT1_2 + sgn * 1.2, 96 * Math.SQRT1_2 - 1.2);
      fence(ctx, [a, b], { h: 1.3, gaps: [[20, 24]] });
      const bp = dia.Wd(sgn * 58 * Math.SQRT1_2 + sgn * 3.6, 58 * Math.SQRT1_2 - 3.6);
      B.v('clay').cyl(bp[0], 0, bp[1], 2.6, 0.8, 0.22, 20, 1 / 2.5, true); B.c('dirt').cyl(bp[0], 0, bp[1], 2.6, 0.8, 0.22, 10, 1, true);
      p.setColor(...WHITE).box(bp[0], 0.235, bp[1], 0.61, 0.03, 0.152, sgn * Math.PI / 4);
    }
    // batting cage (netted tunnel) south-west of the infield
    {
      const cx = 17, cz = 106, rot = Math.PI * 0.25; const c = Math.cos(rot), s = Math.sin(rot); const Wp = (u, y, d) => [cx + u * c + d * s, y, cz - u * s + d * c];
      for (const d of [-2.2, 2.2]) { B.v('net').quad(Wp(-11, 0, d), Wp(-11, 3.6, d), Wp(11, 3.6, d), Wp(11, 0, d), [0, 0], [0, 7], [44, 7], [44, 0]); const m = Wp(0, 1.8, d); B.c('metal:mesh').box(m[0], 1.8, m[2], 22, 3.6, 0.06, rot); }
      B.v('net').quad(Wp(-11, 3.6, -2.2), Wp(-11, 3.6, 2.2), Wp(11, 3.6, 2.2), Wp(11, 3.6, -2.2), [0, 0], [0, 9], [44, 9], [44, 0]);
      for (const u of [-11, -3.7, 3.7, 11]) for (const d of [-2.2, 2.2]) B.v('blackMetal').tube(Wp(u, 0, d), Wp(u, 3.6, d), 0.04, 5);
    }
    // scoreboard beyond the left-centre fence
    for (const dx of [-2.2, 2.2]) B.v('galv').cyl(104 + dx, 0, 184.5, 0.12, 0.12, 5, 8, 1, true);
    p.setColor(...RED).box(104, 5.6, 184.5, 6.4, 2.6, 0.3); B.c('metal').box(104, 3.5, 184.5, 6.4, 7, 0.4);
    const stx = ctx.M.textDecal(['HINSDALE CENTRAL'], { w: 1024, h: 128, font: 84, color: '#ffffff', align: 'center', weight: 800 });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.75), new THREE.MeshStandardMaterial({ map: stx, alphaTest: 0.4, roughness: 0.6 })); sm.position.set(104, 6.4, 184.33); sm.rotation.y = Math.PI; ctx.scene.add(sm);
  }

  // ================= softball diamonds east of Madison St (60 ft bases, 43 ft pitching distance, skinned infields)
  {
    const fields = [[267.5, -155.5, Math.PI * 0.75], [268.5, -37.0, Math.PI * 1.25], [217.5, 176.5, Math.PI * 1.75]];
    for (const [hx, hz, ang] of fields) {
      buildDiamond(ctx, { home: [hx, hz], ang, kind: 'softball', big });
      const dx = Math.cos(ang), dz = Math.sin(ang); const px = -dz, pz = dx;
      const bk = (u, d) => [hx - dx * d + px * u, hz - dz * d + pz * u];
      fence(ctx, [bk(-9, -2), bk(-4.5, 7.6), bk(4.5, 7.6), bk(9, -2)], { h: 4.5, every: 2.5 });
      for (const sgn of [-1, 1]) {
        fence(ctx, [bk(sgn * 11, -6), bk(sgn * 11, -16)], { h: 1.6 });
        const bc = bk(sgn * 12.5, -11); const brot = Math.atan2(-dz, dx);
        B.v('aluminum').box(bc[0], 0.45, bc[1], 7, 0.05, 0.3, brot); B.c('metal').box(bc[0], 0.25, bc[1], 7, 0.5, 0.4, brot);
        const bl = bk(sgn > 0 ? 6 : -12, 9.6);
        bleachers(ctx, { x: bl[0], z: bl[1], dir: Math.atan2(-dx, -dz), len: 6, rows: 4, run: 0.61, rise: 0.22, frontH: 0 });
      }
    }
    // red equipment building + shed by the north-east diamond (imagery)
    B.v('paint', true).setColor(0.45, 0.1, 0.08).box(256.5, 1.5, -171, 7, 3, 4.5); B.v('galv').box(256.5, 3.08, -171, 7.5, 0.16, 5); B.c('wood').box(256.5, 1.5, -171, 7, 3, 4.5);
    B.v('paint', true).setColor(0.3, 0.1, 0.08).box(277, 1.2, -152, 2.6, 2.4, 5); B.c('wood').box(277, 1.2, -152, 2.6, 2.4, 5);
    // boundary fence along the east edge of the school property
    fence(ctx, [[283.5, -200], [283.5, -22]], { h: 1.8 });
    fence(ctx, [[288.5, 72], [291, 190]], { h: 1.8 });
    fence(ctx, [[205, -26], [284, -29]], { h: 1.2, gaps: [[20, 26], [50, 56]] });
  }

  // ================= grass practice field (west): regulation soccer markings
  soccerLines(ctx, -157.3, 73.5, 100, 64, Math.PI / 2, big);

  // ================= parking / walkway lighting
  for (const x of [215, 245, 275]) for (const z of [-5, 25, 55]) lotLight(ctx, x, z);
  for (const [x, z] of [[122, 60], [150, 60], [165, 110], [165, 150], [137, 118], [120, 88]]) lotLight(ctx, x, z);
  for (let x = -8; x <= 150; x += 22) lampPost(ctx, x, -161.5);
  for (const [x, z] of [[-23, -20], [-23, 5], [-23, 28], [-28, -60], [-28, -95], [-28, -130], [3, 62], [20, 58], [165, -100], [165, -60], [165, -20], [165, 20]]) lampPost(ctx, x, z);
}
