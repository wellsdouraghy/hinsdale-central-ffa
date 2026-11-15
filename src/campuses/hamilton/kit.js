// Alexander Hamilton High School building kit: extra materials (stucco, solar, pavers...), the generic builders shared
// with the Marin kit (facade-kit walls, flat / hip / well roofs, ladders, decals) and a multi-storey wall builder
// (storeyWalls) for the three- and four-storey classroom blocks, which the two-storey shared facade kit cannot do.
import * as THREE from 'three';
import { ensureCCW, signedArea, pointInRing, makeCanvas, canvasTexture, mulberry32 } from '../../world/util.js';
import { edgeFrame, quadFacing, wallRect, fbox, facade, roofUnit, STYLES, BRICK_S } from '../../world/facade.js';
import { polyRoofOf } from '../roofs.js';

export const ANG = THREE.MathUtils.degToRad(18.5);      // the Castle Heights street grid is rotated 18.5 deg
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
export const CLAY = [6.4, 2.35, 1.2];                  // Brown Hall's orange-red mission tile
export const CLAY_DARK = [3.0, 1.5, 1.0];

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

function paverTexture(aniso) {
  // courtyard paving, one tile = 2.4 m: 0.6 m buff concrete pavers in a running bond, slightly different tones, dark joints
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'); const rnd = mulberry32(31); const n = 4, w = S / n;
  g.fillStyle = '#6f6a60'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < n; j++) for (let i = -1; i < n; i++) {
    const x = i * w + (j % 2 ? w / 2 : 0), y = j * w; const v = 168 + Math.floor(rnd() * 26), warm = rnd() * 10;
    for (const ox of [0, S]) { g.fillStyle = `rgb(${v + warm},${v + warm * 0.4 - 2},${v - 14})`; g.fillRect(x + ox + 2, y + 2, w - 4, w - 4); }
  }
  for (let k = 0; k < 2600; k++) { const v = rnd() < 0.5 ? 255 : 60; g.fillStyle = `rgba(${v},${v},${v},${0.03 + rnd() * 0.05})`; const r = 1 + rnd() * 4; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, r * 1.5, r, rnd() * 3, 0, 7); g.fill(); }
  return canvasTexture(c, { aniso });
}

export function addMaterials(ctx) {
  const { M, T } = ctx; if (M.stucco) return;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.stucco = std({ map: stuccoTexture(T.aniso), normalMap: ctx.quality === 'low' ? null : T.concreteNormal, vertexColors: true, roughness: 0.93 });
  M.stucco.normalScale.set(0.22, 0.22); M.stucco.color.setRGB(0.88, 0.85, 0.79);   // warm it and keep sunlit stucco off pure white
  M.solar = std({ map: solarTexture(T.aniso), roughness: 0.18, metalness: 0.75, envMapIntensity: 1.3 });
  M.storefront = std({ map: storefrontTexture(T.aniso), roughness: 0.35, metalness: 0.4, envMapIntensity: 1.2 });
  M.hamPaver = std({ map: paverTexture(T.aniso), normalMap: ctx.quality === 'low' ? null : T.concreteNormal, roughness: 0.88 }); M.hamPaver.normalScale.set(0.35, 0.35); M.hamPaver.color.setRGB(0.8, 0.79, 0.76);
  M.roofSat.color.setScalar(0.74);   // LA cool roofs are near-white in the imagery: keep them off the top of the tone curve
  M.trimGreen = std({ color: 0x1f6b3f, roughness: 0.6, metalness: 0.05 });
  M.awning = std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  // facade styles for this campus (see STYLES in facade.js; tint multiplies the wall bucket's vertex colour)
  Object.assign(STYLES, {
    hamBrick: { kind: 'class', bay: 4.4, frame: 'frame', top: 'stone', tint: BRICK_TINT, beds: true },                // salmon brick, cast-stone trim
    hamLow: { kind: 'lowmod', bay: 4.4, frame: 'frame', top: 'stone', tint: BRICK_TINT, beds: true },
    hamCream: { kind: 'class', bay: 4.4, frame: 'frame', top: 'stone', tint: [0.74, 0.67, 0.5], beds: true },         // cream stucco classroom blocks
    hamLowCream: { kind: 'lowmod', bay: 4.4, frame: 'frame', top: 'stone', tint: [0.74, 0.68, 0.52] },
    hamBungalow: { kind: 'lowmod', bay: 4.0, frame: 'frameAlu', top: 'panel', tint: [0.7, 0.68, 0.6] },
    hamGym: { kind: 'gym', bay: 5.8, frame: 'frame', top: 'stone', tint: [0.76, 0.7, 0.55], clerestory: true },
    hamGymPlain: { kind: 'gym', bay: 6.2, frame: 'frame', top: 'stone', tint: [0.76, 0.7, 0.55] },
    hamService: { kind: 'service', bay: 5.6, frame: 'frame', top: 'stone', tint: [0.72, 0.68, 0.58] },
    hamPlain: { kind: 'service', bay: 6.0, frame: 'frame', top: 'stone', tint: [0.72, 0.68, 0.58], plain: true },
    hamApt: { kind: 'class', bay: 4.2, frame: 'frameAlu', top: 'panel', tint: [0.74, 0.71, 0.64], beds: true },
    hamAptWarm: { kind: 'class', bay: 4.6, frame: 'frame', top: 'stone', tint: [0.74, 0.62, 0.46], beds: true },
    hamAptGrey: { kind: 'modern', bay: 4.8, frame: 'frameAlu', top: 'panel', tint: [0.62, 0.62, 0.61] },
    hamAptLow: { kind: 'lowmod', bay: 4.4, frame: 'frameAlu', top: 'panel', tint: [0.72, 0.7, 0.64], beds: true },
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
export const BRICK_TINT = [1.16, 0.9, 0.74];             // multiplies the shared brick texture toward Hamilton's salmon / orange brick

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
    facade(sctx, F, 0, h, plain ? (opts.plainStyle || 'hamPlain') : style, u, rnd);
    if (opts.parapet) {
      const roofY = h - 0.4;
      quadFacing(B.v('limestone'), F.P(-0.1, h + 0.03, 0.13), F.P(L + 0.1, h + 0.03, 0.13), F.P(L, h + 0.03, -0.32), F.P(0, h + 0.03, -0.32), [0, 1, 0]);
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
  // opts.planeUV: texture coordinates from the face plane itself (along the eave in world metres, up the slope), so
  // faces of two intersecting roofs that lie in one plane carry the same shingles and do not shimmer (polyRoof)
  const puv = opts.planeUV ? (hx, hz) => (p) => [(p[2] * hx - p[0] * hz) * uvS, (p[1] - eaveY) * sl / rise * uvS] : null;
  const q = (p0, p1, p2, p3, uv, f) => { quadFacing(bucket, p0, p1, p2, p3, up, f ? [f(p0), f(p1), f(p2), f(p3)] : uv); if (col) quadFacing(col, p0, p1, p2, p3, up); };
  q(A, Bp, R1, R0, [[u0 * uvS, 0], [u1 * uvS, 0], [rB * uvS, sl * uvS], [rA * uvS, sl * uvS]], puv && puv(tz, -tx));
  q(C, Dd, R0, R1, [[u1 * uvS, 0], [u0 * uvS, 0], [rA * uvS, sl * uvS], [rB * uvS, sl * uvS]], puv && puv(-tz, tx));
  const tri = (bk, p0, p1, p2, w, f) => {
    const ux = p1[0] - p0[0], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vz = p2[2] - p0[2]; const cy = uz * vx - ux * vz;
    const t0 = f ? f(p0) : [0, 0], t1 = f ? f(p1) : [w * uvS, 0], t2 = f ? f(p2) : [w * uvS / 2, sl * uvS];
    if (cy >= 0) bk.tri(p0, p1, p2, t0, t1, t2); else bk.tri(p0, p2, p1, t0, t2, t1);
  };
  if (!gable) { tri(bucket, Dd, A, R0, 2 * hw, puv && puv(-tx, -tz)); tri(bucket, Bp, C, R1, 2 * hw, puv && puv(tx, tz)); if (col) { tri(col, Dd, A, R0, 2 * hw); tri(col, Bp, C, R1, 2 * hw); } }
  else {
    // gable end walls in the wall bucket
    const wb = B.v(opts.gableBucket || 'stucco', true); const gt = opts.gableTint || [1, 1, 1]; wb.setColor(gt[0], gt[1], gt[2]);
    // the wall fills the whole roof profile in the wall plane: at the wall line the slope is already rise * ov / hw
    // above the eave, so the shape is a pentagon (a plain triangle from the eave corners leaves a slit under the rakes
    // through which the attic, and the sky behind it, shows). Drawn with both windings; the same shape is solid.
    const dy = rise * Math.min(1, ov / hw);
    for (const ug of [u0 + ov, u1 - ov]) {
      const a0 = W(ug, v0 + ov, eaveY), a1 = W(ug, v1 - ov, eaveY), b0 = W(ug, v0 + ov, eaveY + dy), b1 = W(ug, v1 - ov, eaveY + dy), top = W(ug, vc, eaveY + rise);
      for (const [p0, p1, p2] of [[a0, a1, b1], [a0, b1, b0], [b0, b1, top]]) { wb.tri(p0, p1, p2); wb.tri(p1, p0, p2); if (col) col.tri(p0, p1, p2); }
    }
    wb.setColor(1, 1, 1);
  }
  // Solid attic: the space under the skin is filled with stepped collision blocks (each layer ends where the roof
  // reaches its top), so nobody who mantles over the eave or tunnels a wall can end up standing inside the roof.
  if (col && opts.fill !== false) {
    const rotY = Math.atan2(-tz, tx), step = 0.8;
    for (let y0 = 0; y0 + 0.25 < rise; y0 += step) {
      const y1 = Math.min(y0 + step, rise - 0.05), d = hw * y1 / rise; const a0 = gable ? u0 + ov : u0 + d, a1 = gable ? u1 - ov : u1 - d, b0 = v0 + d, b1 = v1 - d;
      if (a1 - a0 < 0.3 || b1 - b0 < 0.3) break; const c = W((a0 + a1) / 2, (b0 + b1) / 2, eaveY + (y0 + y1) / 2);
      B.c('wood').box(c[0], c[1], c[2], a1 - a0, y1 - y0, b1 - b0, rotY);
    }
  }
  quadFacing(bucket, A, Bp, C, Dd, [0, -1, 0], puv ? [A, Bp, C, Dd].map((p) => [p[0] * uvS, p[2] * uvS]) : undefined);   // soffit
  // ridge / hip caps so the tile roof does not end in a razor line
  if (opts.caps !== false) {
    const cb = B.v(opts.bucket || 'shingles', true); cb.setColor(t[0] * 0.8, t[1] * 0.8, t[2] * 0.8);
    cb.tube(R0, R1, 0.14, 5, 1);
    if (!gable) for (const [p, r] of [[A, R0], [Dd, R0], [Bp, R1], [C, R1]]) cb.tube(p, r, 0.12, 5, 1);
  }
  if (bucket.setColor) bucket.setColor(1, 1, 1);
  return { ridgeY: eaveY + rise };
}

// Roof over an arbitrary footprint (L / T / U plans): a union of closed hip roofs over the footprint's maximal
// rectangles, see ../roofs.js. opts: tint, overhang, noCollision, fill (solid attic).
export function polyRoof(ctx, ring, eaveY, rise, opts = {}) { return polyRoofOf(hipRoof, minAreaOBB, ctx, ring, eaveY, rise, { ...opts, tint: opts.tint || CLAY }); }

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
export function wallLadder(ctx, x, z, nx, nz, top, exit) {
  const { B } = ctx; const g = B.v('galv'); const tx = -nz * 0.24, tz = nx * 0.24; const ox = x + nx * 0.16, oz = z + nz * 0.16;
  g.tube([ox - tx, 0.2, oz - tz], [ox - tx, top + 1.1, oz - tz], 0.028, 5).tube([ox + tx, 0.2, oz + tz], [ox + tx, top + 1.1, oz + tz], 0.028, 5);
  for (let y = 0.5; y < top + 0.2; y += 0.3) g.tube([ox - tx, y, oz - tz], [ox + tx, y, oz + tz], 0.015, 4);
  for (const y of [1.5, top * 0.5, top - 0.3]) { g.tube([ox - tx, y, oz - tz], [x - tx, y, z - tz], 0.02, 4); g.tube([ox + tx, y, oz + tz], [x + tx, y, z + tz], 0.02, 4); }
  g.tube([ox - tx, top + 1.1, oz - tz], [x - nx * 0.5 - tx, top + 1.1, z - nz * 0.5 - tz], 0.028, 5).tube([ox + tx, top + 1.1, oz + tz], [x - nx * 0.5 + tx, top + 1.1, z - nz * 0.5 + tz], 0.028, 5);
  ctx.ladders.push({ x: ox, z: oz, nx, nz, y0: 0.4, y1: exit ?? top, exitY: (exit ?? top) + 0.06 });
}
// ladder at parameter t (0..1) of edge i of a ring
export function ringLadder(ctx, ringIn, i, t, top, exit) {
  const ring = ensureCCW(ringIn); const a = ring[i % ring.length], b = ring[(i + 1) % ring.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]);
  const p = F.P(F.L * t, 0, 0.14); wallLadder(ctx, p[0], p[2], F.nx, F.nz, top, exit);
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

// ------------------------------------------------------------------------------------------ multi-storey walls
// Walls around a ring with `storeys` rows of framed windows, a base course, storey bands, sills and a cornice.
// opts: key ('brick' | 'stucco'), tint, storeys, bay, winW, winH, sill, trim, frame, parapet (flat roof: coping +
// solid parapet, roof deck at h - 0.4), plainEdges [i...], doors (false = none), piers (true = pilasters between bays).
// Visual only apart from the parapet and door canopies: the caller adds the building's collision prism.
export function storeyWalls(ctx, ringIn, h, o = {}) {
  const { B } = ctx; const ring = ensureCCW(ringIn); const key = o.key || 'brick'; const tint = o.tint || (key === 'brick' ? BRICK_TINT : [0.74, 0.67, 0.5]);
  const top = h - (o.parapet ? 0.8 : 0.5); const n = o.storeys || Math.max(1, Math.round(top / 3.9)); const fh = top / n; const S = key === 'brick' ? BRICK_S : 0.45;
  const trim = B.v(o.trim || 'limestone'), fr = B.v(o.frame || 'frame'), gl = B.v('glassInt'); const bayW = o.bay || 3.8, wh = Math.min(o.winH || 2.0, fh - 1.45), sill = o.sill || 1.0;
  const wb = B.v(key, true); let u = 0, gi = Math.abs(Math.round(ring[0][0] * 3 + ring[0][1] * 5)) % 50;
  const win = (F, c, w2, y0, y1) => {
    fbox(fr, F, c - w2 - 0.06, c + w2 + 0.06, y0 - 0.06, y1 + 0.06, 0, 0.05, 1, 0, 'fstb');
    wallRect(gl, F, c - w2, c + w2, y0, y1, 0.056, [gi + 1, 2, gi, 3]); gi++;
    if (w2 > 0.7) fbox(fr, F, c - 0.03, c + 0.03, y0, y1, 0.056, 0.078, 1, 0, 'fs');
    const ty = y0 + (y1 - y0) * 0.64; fbox(fr, F, c - w2, c + w2, ty - 0.025, ty + 0.025, 0.056, 0.078, 1, 0, 'ftb');
    fbox(trim, F, c - w2 - 0.14, c + w2 + 0.14, y0 - 0.2, y0 - 0.06, 0, 0.1, 1 / 3, 0, 'fstb');
  };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
    const F = edgeFrame(a[0], a[1], b[0], b[1]);
    wb.setColor(tint[0], tint[1], tint[2]); wallRect(wb, F, 0, L, 0, h, 0, [u * S, 0, (u + L) * S, h * S]);
    fbox(B.v('concrete'), F, -0.03, L + 0.03, 0, 0.55, 0, 0.06, 1 / 3, u, 'fst');
    if (o.bands !== false) for (let s = 1; s < n; s++) fbox(trim, F, 0, L, s * fh - 0.16, s * fh + 0.02, 0, 0.05, 1 / 3, u, 'ftb');
    fbox(trim, F, -0.1, L + 0.1, top, h - 0.12, 0, 0.1, 1 / 3, u, 'fsb'); fbox(trim, F, -0.16, L + 0.16, h - 0.12, h + 0.02, 0, 0.2, 1 / 3, u, 'fstb');   // frieze + projecting cornice
    B.v('groundDecal').quad(F.P(0, 0.025, 0.02), F.P(L, 0.025, 0.02), F.P(L, 0.025, 1.5), F.P(0, 0.025, 1.5), [0, 0], [1, 0], [1, 1], [0, 1]);
    if (o.parapet) {
      const roofY = h - 0.4;
      quadFacing(B.v('limestone'), F.P(-0.1, h + 0.03, 0.13), F.P(L + 0.1, h + 0.03, 0.13), F.P(L, h + 0.03, -0.32), F.P(0, h + 0.03, -0.32), [0, 1, 0]);
      quadFacing(B.v('concrete'), F.P(0, roofY, -0.32), F.P(L, roofY, -0.32), F.P(L, h + 0.03, -0.32), F.P(0, h + 0.03, -0.32), [-F.nx, 0, -F.nz]);
      const pc = F.P(L / 2, (roofY + h + 0.03) / 2, -0.16); B.c('concrete').box(pc[0], pc[1], pc[2], L, h + 0.03 - roofY, 0.32, F.rotY);
    }
    const plain = (o.plainEdges && o.plainEdges.includes(i)) || L < 3.4;
    if (!plain) {
      const m = L > 9 ? 1.6 : 0.7; const nb = Math.max(1, Math.floor((L - 2 * m) / bayW)); const bay = (L - 2 * m) / nb; const w2 = Math.min(o.winW || 2.1, bay - 0.9) / 2;
      const door = o.doors !== false && L > 20 ? Math.floor(nb / 2) : -1;
      for (let k = 0; k < nb; k++) {
        const c = m + (k + 0.5) * bay;
        if (o.piers && k > 0) { wb.setColor(tint[0] * 0.94, tint[1] * 0.94, tint[2] * 0.94); fbox(wb, F, m + k * bay - 0.3, m + k * bay + 0.3, 0.55, top, 0, 0.09, S, u, 'fs'); wb.setColor(tint[0], tint[1], tint[2]); }
        for (let s = 0; s < n; s++) {
          const y0 = s * fh + sill, y1 = y0 + wh;
          if (s === 0 && k === door) {
            fbox(fr, F, c - 1.25, c + 1.25, 0, 2.75, 0, 0.07, 1, 0, 'fst'); wallRect(gl, F, c - 1.1, c + 1.1, 0.3, 2.1, 0.076, [gi + 1, 0.1, gi, 0.9]); gi++;
            fbox(fr, F, c - 0.04, c + 0.04, 0, 2.2, 0.076, 0.1, 1, 0, 'fs'); fbox(fr, F, c - 1.1, c + 1.1, 2.1, 2.2, 0.076, 0.1, 1, 0, 'ftb'); fbox(fr, F, c - 1.1, c + 1.1, 0, 0.3, 0.076, 0.09, 1, 0, 'ft');
            fbox(trim, F, c - 1.9, c + 1.9, 2.95, 3.2, 0, 1.5, 1 / 3, 0, 'fstb'); fbox(B.v('lightEmit'), F, c - 0.3, c + 0.3, 2.92, 2.95, 0.5, 0.9, 1, 0, 'fsb');
            const cc = F.P(c, 3.075, 0.75); B.c('concrete').box(cc[0], cc[1], cc[2], 3.8, 0.25, 1.5, F.rotY);
          } else win(F, c, w2, y0, y1);
        }
      }
    }
    u += L;
  }
  wb.setColor(1, 1, 1);
  return { ring, top, fh, n, roofY: h - 0.4 };
}

// Flat-roofed multi-storey block: storeyWalls + parapet + satellite-projected roof you can stand on (+ plant units).
export function storeyBlock(ctx, ringIn, h, o = {}) {
  const { B, gen } = ctx; const w = storeyWalls(ctx, ringIn, h, { ...o, parapet: true }); const ring = w.ring, roofY = w.roofY; const rr = gen.roofs;
  if (o.roof === 'grey') B.v('concrete').poly(ring, null, roofY, (x, z) => [x / 3, z / 3]);
  else B.v('roofSat').poly(ring, null, roofY, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]);
  B.c(o.surface || (o.key === 'stucco' ? 'concrete' : 'brick')).prism(ring, 0, roofY, 1, false); B.c('concrete').poly(ring, null, roofY);
  (ctx.buildingRings = ctx.buildingRings || []).push(ring);
  if (o.register !== false) (ctx.flatRoofs = ctx.flatRoofs || []).push({ ring, roofY, area: Math.abs(signedArea(ring)), school: true, noHeli: !!o.noHeli });
  if (o.units) {
    const rnd = mulberry32(o.units * 31 + Math.round(ring[0][0])); const ob = minAreaOBB(ring); const rot = Math.atan2(-ob.tz, ob.tx); let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of ring) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    const cu = (ob.u0 + ob.u1) / 2, cv = (ob.v0 + ob.v1) / 2, cxm = cu * ob.tx - cv * ob.tz, czm = cu * ob.tz + cv * ob.tx; const placed = [];
    for (let k = 0, tries = 0; k < o.units && tries < 300; tries++) {
      const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
      if (![[0, 0], [3.4, 0], [-3.4, 0], [0, 3.4], [0, -3.4]].every(([dx, dz]) => pointInRing(x + dx, z + dz, ring))) continue;
      if (o.keepCentre && Math.hypot(x - cxm, z - czm) < 13) continue;           // leave the middle of the deck free (helicopter spot)
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 6)) continue;
      roofUnit(ctx, x, roofY, z, rot + (rnd() < 0.5 ? 0 : Math.PI / 2), rnd); placed.push([x, z]); k++;
    }
  }
  return { ring, roofY, top: h + 0.03 };
}

// free-standing flat canopy on steel posts (solar carports, lunch shelters): solid deck you can stand on, posts solid
export function canopy(ctx, cx, cz, w, d, y, rot, o = {}) {
  const { B } = ctx; const c = Math.cos(rot), s = Math.sin(rot); const P = (a, b) => [cx + a * c + b * s, cz - a * s + b * c];
  const t = o.thick || 0.22; B.v(o.key || 'solar').box(cx, y + t - 0.03, cz, w, 0.06, d, rot, o.uv || 0.5); B.v(o.under || 'galv').box(cx, y + (t - 0.06) / 2, cz, w, t - 0.06, d, rot);
  B.c('metal').box(cx, y + t / 2, cz, w, t, d, rot);
  const nx = Math.max(2, Math.round(w / (o.span || 8)) + 1); const rows = o.rows || (d > 9 ? [-d / 2 + 1.2, d / 2 - 1.2] : [0]);
  for (let i = 0; i < nx; i++) for (const b of rows) { const p = P(-w / 2 + 0.6 + i * (w - 1.2) / (nx - 1), b); B.v(o.post || 'galv').box(p[0], y / 2, p[1], 0.22, y, 0.22, rot); B.c('metal').box(p[0], y / 2, p[1], 0.3, y, 0.3, rot); (ctx.posts = ctx.posts || []).push([p[0], p[1]]); }
  return { P, top: y + t };
}
export { edgeFrame, quadFacing, wallRect, fbox, facade, roofUnit, STYLES, BRICK_S, ensureCCW, signedArea, pointInRing, mulberry32, makeCanvas, canvasTexture };
