// Marin Academy building kit: extra materials (stucco, clay tile, solar, pool water...) and generic builders layered
// on the shared facade kit (src/world/facade.js). The facade kit is brick + limestone; here it is re-skinned through a
// Builder proxy (brick -> stucco, limestone -> painted trim) so the same recessed windows, doors, plinths and parapets
// come out as the cream / white stucco buildings of the real campus.
import * as THREE from 'three';
import { ensureCCW, signedArea, pointInRing, makeCanvas, canvasTexture, mulberry32 } from '../../world/util.js';
import { edgeFrame, quadFacing, wallRect, fbox, facade, roofUnit, STYLES, BRICK_S } from '../../world/facade.js';

export const ANG = THREE.MathUtils.degToRad(7.2);       // the campus / downtown street grid is rotated 7.2 deg
export const UX = Math.cos(ANG), UZ = Math.sin(ANG);     // grid "east" axis in world (x, z); grid "south" = (-UZ, UX)
const TILE_AVG = 0.2;                                    // mean linear luminance of the shingle texture (for tints)

// grid-aligned rectangle: centre (cx, cz), w along grid east, d along grid south -> ring of 4 [x, z]
export function rect(cx, cz, w, d, ang = ANG) {
  const ux = Math.cos(ang), uz = Math.sin(ang), hw = w / 2, hd = d / 2;
  const P = (a, b) => [cx + a * ux - b * uz, cz + a * uz + b * ux];
  return [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)];
}
// point in grid coordinates relative to an anchor
export const gp = (ox, oz, a, b) => [ox + a * UX - b * UZ, oz + a * UZ + b * UX];
export const srgb = (r, g, b) => [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)];
export const tileTint = (rgb) => { const c = srgb(...rgb); return [c[0] / TILE_AVG, c[1] / TILE_AVG, c[2] / TILE_AVG]; };
export const CLAY = [3.7, 2.0, 1.42];                   // weathered terracotta barrel tile
export const CLAY_DARK = [3.0, 1.6, 1.15];

// ------------------------------------------------------------------------------------------ materials
function solarTexture(aniso) {
  const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0c1524'; g.fillRect(0, 0, W, H);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) {
    const x = i * 128 + 4, y = j * 64 + 3; const gr = g.createLinearGradient(x, y, x + 120, y + 58); gr.addColorStop(0, '#16284a'); gr.addColorStop(1, '#0d1a33');
    g.fillStyle = gr; g.fillRect(x, y, 120, 58);
    g.strokeStyle = 'rgba(150,170,200,0.22)'; g.lineWidth = 1; for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x + k * 20, y); g.lineTo(x + k * 20, y + 58); g.stroke(); }
    g.beginPath(); g.moveTo(x, y + 29); g.lineTo(x + 120, y + 29); g.stroke();
  }
  g.strokeStyle = '#aab2bb'; g.lineWidth = 2; for (let j = 0; j <= 4; j++) { g.beginPath(); g.moveTo(0, j * 64); g.lineTo(W, j * 64); g.stroke(); } for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, H); g.stroke(); }
  return canvasTexture(c, { aniso });
}
function polyPanelTexture(aniso) {
  // translucent channel-glass / polycarbonate wall of the Athletic Center: pale sea-green with vertical seams
  const W = 128, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#b9d6cf'); gr.addColorStop(1, '#8fb9b1'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 16) { g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x + 2, 0, 3, H); g.fillStyle = 'rgba(40,80,75,0.35)'; g.fillRect(x, 0, 1.5, H); }
  g.fillStyle = 'rgba(60,90,90,0.5)'; g.fillRect(0, H / 2 - 2, W, 4); g.fillRect(0, 0, W, 3);
  return canvasTexture(c, { aniso });
}
function stuccoTexture(aniso) {
  // smooth painted stucco: near-white with fine trowel mottling and faint rain streaks (tinted per building)
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'); const rnd = mulberry32(77);
  g.fillStyle = '#f1f1ef'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) { const v = rnd() < 0.5 ? 255 : 150; g.fillStyle = `rgba(${v},${v},${v},${0.03 + rnd() * 0.05})`; const r = 1 + rnd() * 5; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, r * 1.6, r, rnd() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 36; i++) { const x = rnd() * S, len = 60 + rnd() * 240, y = rnd() * S; const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(120,112,100,0.07)'); gr.addColorStop(1, 'rgba(120,112,100,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + rnd() * 9, len); }
  return canvasTexture(c, { aniso });
}
function storefrontTexture(aniso) {
  // downtown shopfront module, 4 m wide x 3.4 m tall: bulkhead, display glass, transom band, sign fascia
  const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#2a2623'; g.fillRect(0, 0, W, H);
  const gl = g.createLinearGradient(0, 50, 0, 215); gl.addColorStop(0, '#5d7484'); gl.addColorStop(1, '#1e2a33');
  g.fillStyle = gl; g.fillRect(10, 62, 150, 150); g.fillRect(172, 62, 74, 172);
  g.fillStyle = '#8fa3ae'; g.fillRect(10, 30, 236, 24);
  g.fillStyle = '#16130f'; for (const x of [60, 110, 208]) g.fillRect(x, 30, 3, 24);
  g.fillStyle = '#b9b3a6'; g.fillRect(206, 140, 4, 34);
  g.fillStyle = 'rgba(255,240,200,0.10)'; g.fillRect(14, 150, 142, 58);
  return canvasTexture(c, { aniso });
}

export function addMaterials(ctx) {
  const { M, T } = ctx; if (M.stucco) return;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.stucco = std({ map: stuccoTexture(T.aniso), normalMap: ctx.quality === 'low' ? null : T.concreteNormal, vertexColors: true, roughness: 0.93 });
  M.stucco.normalScale.set(0.22, 0.22);
  M.solar = std({ map: solarTexture(T.aniso), roughness: 0.18, metalness: 0.75, envMapIntensity: 1.3 });
  M.polyGreen = std({ map: polyPanelTexture(T.aniso), roughness: 0.3, metalness: 0.1, emissive: 0x6f9a90, emissiveIntensity: 0.12, envMapIntensity: 1.2 });
  M.storefront = std({ map: storefrontTexture(T.aniso), roughness: 0.35, metalness: 0.4, envMapIntensity: 1.2 });
  M.water = std({ color: 0x2f9fd0, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  M.trimRed = std({ color: 0xb3261e, roughness: 0.6, metalness: 0.05 });
  M.awning = std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  // facade styles for this campus (see STYLES in facade.js; tint multiplies the wall bucket's vertex colour)
  Object.assign(STYLES, {
    maMission: { kind: 'class', bay: 4.3, frame: 'frame', top: 'stone', tint: [0.9, 0.79, 0.55], beds: true },       // cream stucco, bronze frames
    maFoster: { kind: 'class', bay: 4.0, frame: 'frame', top: 'stone', tint: [0.95, 0.83, 0.5], beds: true },
    maWhite: { kind: 'class', bay: 4.6, frame: 'frame', top: 'stone', tint: [0.93, 0.92, 0.88], beds: true },
    maModern: { kind: 'modern', bay: 4.9, frame: 'frameAlu', top: 'panel', tint: [0.95, 0.95, 0.94] },
    maLow: { kind: 'lowmod', bay: 4.4, frame: 'frameAlu', top: 'panel', tint: [0.94, 0.94, 0.92], beds: true },
    maLowCream: { kind: 'lowmod', bay: 4.4, frame: 'frame', top: 'stone', tint: [0.9, 0.81, 0.6], beds: true },
    maGym: { kind: 'gym', bay: 5.6, frame: 'frame', top: 'stone', tint: [0.94, 0.92, 0.86], clerestory: true },
    maGymPlain: { kind: 'gym', bay: 6.2, frame: 'frameAlu', top: 'panel', tint: [0.92, 0.86, 0.68] },
    maService: { kind: 'service', bay: 5.6, frame: 'frame', top: 'stone', tint: [0.92, 0.9, 0.84] },
    maPlain: { kind: 'service', bay: 6.0, frame: 'frame', top: 'stone', tint: [0.92, 0.9, 0.84], plain: true },
  });
}

// Builder proxy: the facade kit asks for 'brick' / 'limestone'; hand it other buckets instead.
export function skin(ctx, map) {
  const B = ctx.B;
  const PB = { v: (k, c) => B.v(map[k] || k, c), c: (s) => B.c(s), visual: B.visual, collision: B.collision, solidBox: (key, ...a) => B.solidBox(map[key] || key, ...a) };
  const o = Object.create(ctx); o.B = PB; return o;
}
export const SKIN_STUCCO = { brick: 'stucco', limestone: 'whitePanel' };
export const SKIN_BRICK = {};

// ------------------------------------------------------------------------------------------ walls
// Facade-kit walls around a ring. opts: skin map, parapet (flat roofs), tintJitter, rnd, noBeds
export function kitWalls(ctx, ringIn, h, style, opts = {}) {
  const ring = ensureCCW(ringIn); const sctx = skin(ctx, opts.skin || SKIN_STUCCO); const rnd = opts.rnd || mulberry32(Math.abs(Math.round(ring[0][0] * 13 + ring[0][1] * 7)) + 3);
  const B = ctx.B; const st = STYLES[style]; const alu = st && st.frame === 'frameAlu';
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
    const F = edgeFrame(a[0], a[1], b[0], b[1]);
    const plain = opts.plainEdges && opts.plainEdges.includes(i);
    facade(sctx, F, 0, h, plain ? (opts.plainStyle || 'maPlain') : style, u, rnd);
    if (opts.parapet) {
      const roofY = h - 0.4;
      quadFacing(B.v(alu ? 'frameAlu' : 'frame'), F.P(-0.1, h + 0.03, 0.13), F.P(L + 0.1, h + 0.03, 0.13), F.P(L, h + 0.03, -0.32), F.P(0, h + 0.03, -0.32), [0, 1, 0]);
      quadFacing(B.v('concrete'), F.P(0, roofY, -0.32), F.P(L, roofY, -0.32), F.P(L, h + 0.03, -0.32), F.P(0, h + 0.03, -0.32), [-F.nx, 0, -F.nz]);
      const pc = F.P(L / 2, (roofY + h + 0.03) / 2, -0.16); B.c('concrete').box(pc[0], pc[1], pc[2], L, h + 0.03 - roofY, 0.32, F.rotY);
    }
    u += L;
  }
  B.v('stucco', true).setColor(1, 1, 1); B.v('brick', true).setColor(1, 1, 1);
  return ring;
}

// Flat-roofed building: kit walls + parapet, satellite-projected roof you can stand on, optional mechanical units.
export function flatBuilding(ctx, ringIn, h, style, opts = {}) {
  const { B, gen } = ctx; const ring = kitWalls(ctx, ringIn, h, style, { ...opts, parapet: true });
  const rr = gen.roofs; const roofY = h - 0.4;
  if (opts.roof === 'white') B.v('whitePanel').poly(ring, null, roofY, (x, z) => [x / 3, z / 3]);
  else B.v('roofSat').poly(ring, null, roofY, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]);
  B.c(opts.surface || 'concrete').prism(ring, 0, roofY, 1, false);
  B.c('concrete').poly(ring, null, roofY);
  (ctx.buildingRings = ctx.buildingRings || []).push(ring);
  if (opts.units) {
    const rnd = mulberry32(opts.units * 31 + Math.round(ring[0][0])); let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of ring) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    for (let k = 0, tries = 0; k < opts.units && tries < 200; tries++) {
      const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
      if (![[0, 0], [3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2]].every(([dx, dz]) => pointInRing(x + dx, z + dz, ring))) continue;
      roofUnit(ctx, x, roofY, z, -ANG + (rnd() < 0.5 ? 0 : Math.PI / 2), rnd); k++;
    }
  }
  return { ring, roofY };
}

// ------------------------------------------------------------------------------------------ pitched roofs
export function minAreaOBB(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of pts) { const u = p[0] * tx + p[1] * tz, v = -p[0] * tz + p[1] * tx; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, tx, tz, u0, u1, v0, v1 };
  }
  return best;
}
// Hip (or gable) roof over an oriented box { tx, tz, u0, u1, v0, v1 } (as returned by minAreaOBB) or a rect ring.
// Visual goes to the vertex-coloured shingle bucket with `tint`; collision gets the same planes (walkable).
export function hipRoof(ctx, boxOrRing, eaveY, rise, opts = {}) {
  const { B } = ctx; let o = Array.isArray(boxOrRing) ? minAreaOBB(boxOrRing) : boxOrRing; if (!o) return;
  let { tx, tz, u0, u1, v0, v1 } = o;
  if (v1 - v0 > u1 - u0) { const ntx = -tz, ntz = tx; const nu0 = v0, nu1 = v1, nv0 = -u1, nv1 = -u0; tx = ntx; tz = ntz; u0 = nu0; u1 = nu1; v0 = nv0; v1 = nv1; }
  const ov = opts.overhang === undefined ? 0.6 : opts.overhang; u0 -= ov; u1 += ov; v0 -= ov; v1 += ov;
  const hw = (v1 - v0) / 2, vc = (v0 + v1) / 2; const uvS = 1 / 3;
  const W = (u, v, y) => [u * tx - v * tz, y, u * tz + v * tx];
  const gable = !!opts.gable;
  const rA = gable ? u0 : Math.min(u0 + hw, (u0 + u1) / 2), rB = gable ? u1 : Math.max(u1 - hw, (u0 + u1) / 2);
  const A = W(u0, v0, eaveY), Bp = W(u1, v0, eaveY), C = W(u1, v1, eaveY), Dd = W(u0, v1, eaveY);
  const R0 = W(rA, vc, eaveY + rise), R1 = W(rB, vc, eaveY + rise); const sl = Math.hypot(hw, rise);
  const bucket = B.v(opts.bucket || 'shingles', true); const t = opts.tint || CLAY; if (bucket.setColor) bucket.setColor(t[0], t[1], t[2]);
  const col = opts.noCollision ? null : B.c('concrete'); const up = [0, 1, 0];
  const q = (p0, p1, p2, p3, uv) => { quadFacing(bucket, p0, p1, p2, p3, up, uv); if (col) quadFacing(col, p0, p1, p2, p3, up); };
  q(A, Bp, R1, R0, [[u0 * uvS, 0], [u1 * uvS, 0], [rB * uvS, sl * uvS], [rA * uvS, sl * uvS]]);
  q(C, Dd, R0, R1, [[u1 * uvS, 0], [u0 * uvS, 0], [rA * uvS, sl * uvS], [rB * uvS, sl * uvS]]);
  const tri = (bk, p0, p1, p2, w) => {
    const ux = p1[0] - p0[0], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vz = p2[2] - p0[2]; const cy = uz * vx - ux * vz;
    if (cy >= 0) bk.tri(p0, p1, p2, [0, 0], [w * uvS, 0], [w * uvS / 2, sl * uvS]); else bk.tri(p0, p2, p1, [0, 0], [w * uvS / 2, sl * uvS], [w * uvS, 0]);
  };
  if (!gable) { tri(bucket, Dd, A, R0, 2 * hw); tri(bucket, Bp, C, R1, 2 * hw); if (col) { tri(col, Dd, A, R0, 2 * hw); tri(col, Bp, C, R1, 2 * hw); } }
  else {
    // gable end walls in the wall bucket
    const wb = B.v(opts.gableBucket || 'stucco', true); const gt = opts.gableTint || [1, 1, 1]; wb.setColor(gt[0], gt[1], gt[2]);
    const g0 = W(u0 + ov, v0 + ov, eaveY), g1 = W(u0 + ov, v1 - ov, eaveY), g2 = W(u0 + ov, vc, eaveY + rise * (1 - ov / hw));
    const h0 = W(u1 - ov, v0 + ov, eaveY), h1 = W(u1 - ov, v1 - ov, eaveY), h2 = W(u1 - ov, vc, eaveY + rise * (1 - ov / hw));
    wb.tri(g0, g1, g2); wb.tri(g1, g0, g2); wb.tri(h0, h1, h2); wb.tri(h1, h0, h2); wb.setColor(1, 1, 1);
    if (col) { col.tri(g0, g1, g2); col.tri(h0, h1, h2); }
  }
  quadFacing(bucket, A, Bp, C, Dd, [0, -1, 0]);                                   // soffit
  // ridge / hip caps so the tile roof does not end in a razor line
  if (opts.caps !== false) {
    const cb = B.v(opts.bucket || 'shingles', true); cb.setColor(t[0] * 0.8, t[1] * 0.8, t[2] * 0.8);
    cb.tube(R0, R1, 0.14, 5, 1);
    if (!gable) for (const [p, r] of [[A, R0], [Dd, R0], [Bp, R1], [C, R1]]) cb.tube(p, r, 0.12, 5, 1);
  }
  if (bucket.setColor) bucket.setColor(1, 1, 1);
  return { ridgeY: eaveY + rise };
}

// Roof over an arbitrary footprint: every eave edge rises to a ridge line along the footprint's long axis (a hip roof
// for a rectangle, sensible folded slopes for L / T shaped houses) so nothing overhangs empty ground.
export function polyRoof(ctx, ringIn, eaveY, rise, opts = {}) {
  const { B } = ctx; const ring = ensureCCW(ringIn); const o = minAreaOBB(ring); if (!o) return;
  let { tx, tz, u0, u1, v0, v1 } = o;
  if (v1 - v0 > u1 - u0) { const ntx = -tz, ntz = tx; const nu0 = v0, nu1 = v1, nv0 = -u1, nv1 = -u0; tx = ntx; tz = ntz; u0 = nu0; u1 = nu1; v0 = nv0; v1 = nv1; }
  // area centroid
  let A = 0, cx = 0, cz = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; const w = p[0] * q[1] - q[0] * p[1]; A += w; cx += (p[0] + q[0]) * w; cz += (p[1] + q[1]) * w; }
  cx /= 3 * A; cz /= 3 * A; const cu = cx * tx + cz * tz, cv = -cx * tz + cz * tx; const hw = (v1 - v0) / 2;
  const rA = Math.min(u0 + hw, cu), rB = Math.max(u1 - hw, cu); const ov = opts.overhang === undefined ? 0.5 : opts.overhang; const uvS = 1 / 3;
  const n = ring.length; const pts = [];
  for (let i = 0; i < n; i++) {   // push each vertex outward along the bisector of its two edge normals
    const a = ring[(i + n - 1) % n], b = ring[i], c = ring[(i + 1) % n];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    let nx = (b[1] - a[1]) / l1 + (c[1] - b[1]) / l2, nz = -(b[0] - a[0]) / l1 - (c[0] - b[0]) / l2; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const x = b[0] + nx * ov * 1.2, z = b[1] + nz * ov * 1.2; const u = Math.max(rA, Math.min(rB, x * tx + z * tz));
    pts.push({ e: [x, eaveY, z], r: [u * tx - cv * tz, eaveY + rise, u * tz + cv * tx] });
  }
  const bucket = B.v('shingles', true); const t = opts.tint || CLAY; bucket.setColor(t[0], t[1], t[2]); const col = opts.noCollision ? null : B.c('concrete'); const up = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]; const L = Math.hypot(b.e[0] - a.e[0], b.e[2] - a.e[2]); if (L < 0.02) continue;
    const sl = Math.hypot(rise, Math.hypot(a.r[0] - a.e[0], a.r[2] - a.e[2]));
    quadFacing(bucket, a.e, b.e, b.r, a.r, up, [[0, 0], [L * uvS, 0], [L * uvS, sl * uvS], [0, sl * uvS]]);
    if (col) quadFacing(col, a.e, b.e, b.r, a.r, up);
  }
  bucket.poly(pts.map((p) => [p.e[0], p.e[2]]), null, eaveY - 0.01, (x, z) => [x * uvS, z * uvS], true);
  bucket.setColor(1, 1, 1);
}

// Hip perimeter around a flat roof well (the modern clay-tile buildings: tiled slopes outside, a grey membrane deck
// with plant inside). box as from boxFromRect; run = horizontal depth of the tiled slope. Returns the deck frame.
export function wellRoof(ctx, box, eaveY, rise, run, opts = {}) {
  const { B } = ctx; let { tx, tz, u0, u1, v0, v1 } = box; const ov = opts.overhang === undefined ? 0.7 : opts.overhang; const t = opts.tint || CLAY;
  const W = (u, v, y) => [u * tx - v * tz, y, u * tz + v * tx]; const top = eaveY + rise, deck = top - 0.45, k = run + ov;
  const O = [[u0 - ov, v0 - ov], [u1 + ov, v0 - ov], [u1 + ov, v1 + ov], [u0 - ov, v1 + ov]], I = [[u0 - ov + k, v0 - ov + k], [u1 + ov - k, v0 - ov + k], [u1 + ov - k, v1 + ov - k], [u0 - ov + k, v1 + ov - k]];
  const sh = B.v('shingles', true); sh.setColor(t[0], t[1], t[2]); const col = B.c('concrete'); const up = [0, 1, 0]; const sl = Math.hypot(k, rise) / 3;
  for (let i = 0; i < 4; i++) {
    const a = O[i], b = O[(i + 1) % 4], ib = I[(i + 1) % 4], ia = I[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) / 3;
    const A = W(a[0], a[1], eaveY), Bq = W(b[0], b[1], eaveY), C = W(ib[0], ib[1], top), Dd = W(ia[0], ia[1], top);
    quadFacing(sh, A, Bq, C, Dd, up, [[0, 0], [L, 0], [L, sl], [0, sl]]); quadFacing(col, A, Bq, C, Dd, up);
    // inner curb down to the deck
    const cn = [(ia[0] + ib[0]) / 2 < (u0 + u1) / 2 - 0.01 ? 1 : (ia[0] + ib[0]) / 2 > (u0 + u1) / 2 + 0.01 ? -1 : 0, (ia[1] + ib[1]) / 2 < (v0 + v1) / 2 - 0.01 ? 1 : (ia[1] + ib[1]) / 2 > (v0 + v1) / 2 + 0.01 ? -1 : 0];
    const nW = [cn[0] * tx - cn[1] * tz, 0, cn[0] * tz + cn[1] * tx];
    quadFacing(B.v('whitePanel'), W(ia[0], ia[1], deck), W(ib[0], ib[1], deck), C, Dd, nW); quadFacing(col, W(ia[0], ia[1], deck), W(ib[0], ib[1], deck), C, Dd, nW);
  }
  sh.tube(W(I[0][0], I[0][1], top), W(I[1][0], I[1][1], top), 0.12, 5).tube(W(I[1][0], I[1][1], top), W(I[2][0], I[2][1], top), 0.12, 5).tube(W(I[2][0], I[2][1], top), W(I[3][0], I[3][1], top), 0.12, 5).tube(W(I[3][0], I[3][1], top), W(I[0][0], I[0][1], top), 0.12, 5);
  for (let i = 0; i < 4; i++) sh.tube(W(O[i][0], O[i][1], eaveY), W(I[i][0], I[i][1], top), 0.11, 5);
  quadFacing(sh, W(O[0][0], O[0][1], eaveY), W(O[1][0], O[1][1], eaveY), W(O[2][0], O[2][1], eaveY), W(O[3][0], O[3][1], eaveY), [0, -1, 0]);
  sh.setColor(1, 1, 1);
  const d = [W(I[0][0], I[0][1], deck), W(I[1][0], I[1][1], deck), W(I[2][0], I[2][1], deck), W(I[3][0], I[3][1], deck)];
  quadFacing(B.v('concrete'), d[0], d[1], d[2], d[3], up, [[0, 0], [(I[1][0] - I[0][0]) / 3, 0], [(I[1][0] - I[0][0]) / 3, (I[2][1] - I[1][1]) / 3], [0, (I[2][1] - I[1][1]) / 3]]); quadFacing(col, d[0], d[1], d[2], d[3], up);
  return { W, deck, top, u0: I[0][0], u1: I[1][0], v0: I[0][1], v1: I[2][1], rotY: Math.atan2(-tz, tx) };
}
export const boxFromRect = (cx, cz, w, d, ang = ANG) => {
  const tx = Math.cos(ang), tz = Math.sin(ang); const uc = cx * tx + cz * tz, vcn = -cx * tz + cz * tx;
  return { tx, tz, u0: uc - w / 2, u1: uc + w / 2, v0: vcn - d / 2, v1: vcn + d / 2 };
};

// Pitched-roof building: kit walls up to the eave + one or more hip roofs (rects) in clay tile.
export function hipBuilding(ctx, ringIn, eaveH, style, opts = {}) {
  const { B } = ctx; const ring = kitWalls(ctx, ringIn, eaveH, style, opts);
  B.c(opts.surface || 'concrete').prism(ring, 0, eaveH, 1, true);
  (ctx.buildingRings = ctx.buildingRings || []).push(ring);
  for (const r of opts.roofs || [ring]) hipRoof(ctx, r.box || r, r.eave || eaveH, r.rise || opts.rise || 2.6, { tint: opts.tint || CLAY, overhang: opts.overhang, gable: r.gable });
  return ring;
}

// ------------------------------------------------------------------------------------------ small pieces
// climbable wall ladder: (x, z) on the wall, (nx, nz) outward normal, up to the roof deck at `top`
export function wallLadder(ctx, x, z, nx, nz, top) {
  const { B } = ctx; const g = B.v('galv'); const tx = -nz * 0.24, tz = nx * 0.24; const ox = x + nx * 0.16, oz = z + nz * 0.16;
  g.tube([ox - tx, 0.2, oz - tz], [ox - tx, top + 1.1, oz - tz], 0.028, 5).tube([ox + tx, 0.2, oz + tz], [ox + tx, top + 1.1, oz + tz], 0.028, 5);
  for (let y = 0.5; y < top + 0.2; y += 0.3) g.tube([ox - tx, y, oz - tz], [ox + tx, y, oz + tz], 0.015, 4);
  for (const y of [1.5, top * 0.5, top - 0.3]) { g.tube([ox - tx, y, oz - tz], [x - tx, y, z - tz], 0.02, 4); g.tube([ox + tx, y, oz + tz], [x + tx, y, z + tz], 0.02, 4); }
  g.tube([ox - tx, top + 1.1, oz - tz], [x - nx * 0.5 - tx, top + 1.1, z - nz * 0.5 - tz], 0.028, 5).tube([ox + tx, top + 1.1, oz + tz], [x - nx * 0.5 + tx, top + 1.1, z - nz * 0.5 + tz], 0.028, 5);
  ctx.ladders.push({ x: ox, z: oz, nx, nz, y0: 0.4, y1: top, exitY: top + 0.05 });
}
// ladder at parameter t (0..1) of edge i of a ring
export function ringLadder(ctx, ringIn, i, t, top) {
  const ring = ensureCCW(ringIn); const a = ring[i % ring.length], b = ring[(i + 1) % ring.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]);
  const p = F.P(F.L * t, 0, 0.14); wallLadder(ctx, p[0], p[2], F.nx, F.nz, top);
}
// flat decal on a wall frame (text / logos): returns the mesh (added to the scene)
export function wallDecal(ctx, tex, F, uC, yC, w, h, out = 0.03, opts = {}) {
  const g = new THREE.BufferGeometry();
  const p = [F.P(uC - w / 2, yC - h / 2, out), F.P(uC - w / 2, yC + h / 2, out), F.P(uC + w / 2, yC + h / 2, out), F.P(uC + w / 2, yC - h / 2, out)];
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0], 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, alphaTest: opts.opaque ? 0 : 0.4, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true; m.name = 'decal'; ctx.scene.add(m); return m;
}
export { edgeFrame, quadFacing, wallRect, fbox, BRICK_S, ensureCCW, signedArea, pointInRing, mulberry32, makeCanvas, canvasTexture };
