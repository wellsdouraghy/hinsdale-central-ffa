// Marin Academy building kit: extra materials (stucco, clay tile, solar, pool water...) and generic builders layered
// on the shared facade kit (src/world/facade.js). The facade kit is brick + limestone; here it is re-skinned through a
// Builder proxy (brick -> stucco, limestone -> painted trim) so the same recessed windows, doors, plinths and parapets
// come out as the cream / white stucco buildings of the real campus.
import * as THREE from 'three';
import { ensureCCW, signedArea, pointInRing, makeCanvas, canvasTexture, mulberry32 } from '../../world/util.js';
import { edgeFrame, quadFacing, wallRect, fbox, facade, roofUnit, STYLES, BRICK_S } from '../../world/facade.js';
import { polyRoofOf } from '../roofs.js';
import { shapeSDF } from '../../world/terrain.js';

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

// House wall module (4.0 m x 2.9 m storey with one window) in a neutral mid grey, so the vertex colour carries the real
// wall colour read from Street View (tint = colour / WALL_BASE); the trim is drawn brighter and stays pale.
export const WALL_BASE = Math.pow(150 / 255, 2.2);
export const WALL_KINDS = ['stucco', 'wood_siding', 'shingle', 'board_batten', 'brick', 'concrete'];
function houseWall(kind, aniso, win = true) {
  const W = 512, H = 372, c = makeCanvas(W, H), g = c.getContext('2d'); const rnd = mulberry32(31 + kind.length);
  g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, W, H);
  if (kind === 'wood_siding') for (let y = 0; y < H; y += 16) { g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(0, y, W, 2); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y + 2, W, 3); }
  else if (kind === 'board_batten') for (let x = 0; x < W; x += 32) { g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, 0, 6, H); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, 0, 2, H); }
  else if (kind === 'shingle') for (let r = 0; r * 12 < H; r++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, r * 12, W, 2); for (let x = (r % 2) * 9; x < W; x += 18 + Math.floor(rnd() * 6)) { g.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.16})`; g.fillRect(x, r * 12, 1.5, 12); if (rnd() < 0.3) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.07)`; g.fillRect(x, r * 12 + 2, 18, 10); } } }
  else if (kind === 'brick') for (let r = 0; r * 9.5 < H; r++) for (let k = -1; k * 28 < W; k++) { const v = (rnd() - 0.5) * 34; g.fillStyle = `rgb(${150 + v | 0},${150 + v | 0},${150 + v | 0})`; g.fillRect(k * 28 + (r % 2) * 14 + 1, r * 9.5 + 1, 26, 7.5); if (!k) { g.fillStyle = 'rgba(215,215,215,0.5)'; g.fillRect(0, r * 9.5, W, 1); } }
  else for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.04)`; g.fillRect(rnd() * W, rnd() * H, 3, 3); }
  if (win) {
    const wx = W * 0.32, wy = H * 0.2, ww = W * 0.36, wh = H * 0.5;
    g.fillStyle = '#fafafa'; g.fillRect(wx - 10, wy - 10, ww + 20, wh + 20);
    const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, '#465a6c'); gr.addColorStop(1, '#1d262d'); g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = 'rgba(200,198,190,0.5)'; g.fillRect(wx, wy, ww, wh * 0.26);
    g.fillStyle = '#fafafa'; g.fillRect(wx + ww / 2 - 3, wy, 6, wh); g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(wx - 10, wy + wh + 10, ww + 20, 4);
  }
  return canvasTexture(c, { aniso });
}
/** Vertex-colour tint that makes a WALL_KINDS texture come out in the sRGB colour [r, g, b] (0..255). */
export const wallTint = (rgb) => { const c = srgb(...rgb); return [c[0] / WALL_BASE, c[1] / WALL_BASE, c[2] / WALL_BASE]; };

export function addMaterials(ctx) {
  const { M, T } = ctx; if (M.stucco) return;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.stucco = std({ map: stuccoTexture(T.aniso), normalMap: ctx.quality === 'low' ? null : T.concreteNormal, vertexColors: true, roughness: 0.93 });
  M.stucco.normalScale.set(0.22, 0.22);
  M.solar = std({ map: solarTexture(T.aniso), roughness: 0.18, metalness: 0.75, envMapIntensity: 1.3 });
  M.polyGreen = std({ map: polyPanelTexture(T.aniso), roughness: 0.3, metalness: 0.1, emissive: 0x6f9a90, emissiveIntensity: 0.12, envMapIntensity: 1.2 });
  M.storefront = std({ map: storefrontTexture(T.aniso), roughness: 0.35, metalness: 0.4, envMapIntensity: 1.2 });
  M.water = std({ color: 0x2f9fd0, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  M.maPaver = std({ map: paverTexture(T.aniso), normalMap: ctx.quality === 'low' ? null : T.concreteNormal, roughness: 0.88 }); M.maPaver.normalScale.set(0.35, 0.35); M.maPaver.color.setRGB(0.8, 0.79, 0.76);
  M.trimRed = std({ color: 0xb3261e, roughness: 0.6, metalness: 0.05 });
  M.awning = std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  for (const k of WALL_KINDS) { M['maW_' + k] = std({ map: houseWall(k, T.aniso), vertexColors: true, roughness: k === 'stucco' ? 0.93 : 0.85 }); M['maP_' + k] = std({ map: houseWall(k, T.aniso, false), vertexColors: true, roughness: 0.9 }); }
  { // evergreen bank / hedge: irregular foliage (soft dark hollows + leaf dabs of many sizes in muted olive greens), tinted per
    // mass through the vertex colour, a little self-light so the shaded side is not black
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d'); const r = mulberry32(77); g.fillStyle = '#5b6a4b'; g.fillRect(0, 0, S, S);
    const wrap = (fn) => { for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S], [S, S], [-S, -S], [S, -S], [-S, S]]) fn(ox, oy); };
    for (let k = 0; k < 46; k++) { const x = r() * S, y = r() * S, rr = 14 + r() * 34; wrap((ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr); gr.addColorStop(0, `rgba(24,34,20,${0.35 + r() * 0.3})`); gr.addColorStop(1, 'rgba(24,34,20,0)'); g.fillStyle = gr; g.fillRect(x + ox - rr, y + oy - rr, 2 * rr, 2 * rr); }); }
    const tones = [[58, 74, 44], [74, 90, 56], [92, 106, 68], [46, 60, 38], [108, 118, 80], [66, 84, 60]];
    for (let k = 0; k < 2600; k++) { const x = r() * S, y = r() * S, a = r() * Math.PI, l = 1.5 + r() * r() * 9, wd = 0.8 + r() * 2.4; const t = tones[Math.floor(r() * tones.length)]; const v = 0.8 + r() * 0.4; g.fillStyle = `rgba(${t[0] * v | 0},${t[1] * v | 0},${t[2] * v | 0},${0.45 + r() * 0.5})`;
      wrap((ox, oy) => { g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.beginPath(); g.ellipse(0, 0, l, wd, 0, 0, 7); g.fill(); g.restore(); }); }
    M.maHedge = std({ map: canvasTexture(c, { aniso: T.aniso }), vertexColors: true, roughness: 1, emissive: 0x141c10, emissiveIntensity: 0.5 }); }
  M.maFrond = std({ color: 0x3f5a2a, roughness: 0.8, side: THREE.DoubleSide });
  // facade styles for this campus (see STYLES in facade.js; tint multiplies the wall bucket's vertex colour)
  Object.assign(STYLES, {
    maMission: { kind: 'class', bay: 4.3, frame: 'frame', top: 'stone', tint: [0.9, 0.79, 0.55], beds: true },       // cream stucco, bronze frames
    maFoster: { kind: 'class', bay: 4.0, frame: 'frame', top: 'stone', tint: [0.95, 0.83, 0.5], beds: true },
    maWhite: { kind: 'class', bay: 4.6, frame: 'frame', top: 'stone', tint: [0.93, 0.92, 0.88], beds: true },
    maModern: { kind: 'modern', bay: 4.9, frame: 'frameAlu', top: 'panel', tint: [0.95, 0.95, 0.94] },
    maLow: { kind: 'lowmod', bay: 4.4, frame: 'frameAlu', top: 'panel', tint: [0.94, 0.94, 0.92], beds: true },
    maVisArts: { kind: 'lowmod', bay: 4.4, frame: 'frameAlu', top: 'panel', tint: [0.5, 0.45, 0.3], beds: true },   // Visual Arts Center: olive-tan stucco (Street View)
    maLowCream: { kind: 'lowmod', bay: 4.4, frame: 'frame', top: 'stone', tint: [0.9, 0.81, 0.6], beds: true },
    maGym: { kind: 'gym', bay: 5.6, frame: 'frame', top: 'stone', tint: [0.94, 0.92, 0.86], clerestory: true },
    maPac: { kind: 'gym', bay: 6.2, frame: 'frameAlu', top: 'panel', tint: [0.8, 0.72, 0.52] },                         // Performing Arts Center: cream stucco (Street View), not white
    maCream: { kind: 'class', bay: 4.6, frame: 'frame', top: 'stone', tint: [0.82, 0.75, 0.56], beds: true },         // Founders Hall
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
  const base0 = ctx.terrain && B.off ? B.off.y : 0;   // the building's datum (its lowest ground: see `sited`)
  const plan = ctx.wallPlans ? ctx.wallPlans.get(ringKey(ring)) : null;
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
    const plain = opts.plainEdges && opts.plainEdges.includes(i);
    // On a slope every wall (long walls: every 8-12 m piece of it) starts at its own ground: the facade kit lays out
    // storeys, doors and the base course from the ground up, so a wall on the uphill side is a storey shorter instead
    // of having its doors and windows buried in the hill.
    const planned = plan ? plan.edges.get(i) : null;   // seated pieces: each on its own level pad (planWalls)
    for (const [p, q, dy0, shared] of (planned ? planned.map((pc) => [pc.p, pc.q, Math.max(0, Math.min(Math.max(pc.level, pc.shared ? -1e9 : (streetSide(ctx, pc.p, pc.q) ? outsideMax(ctx, pc.p, pc.q) : midGround(ctx, pc.p, pc.q)) - 0.12) - base0, h - 2.6)), pc.shared])   /* the floor follows the pad as finally laid (a later campus pad may have raised it) */ : wallPieces(ctx, a, b, base0, h))) {
      const dy = dy0 < 0.05 ? 0 : dy0;
      if (dy > 0.05) { const Fb = edgeFrame(p[0], p[1], q[0], q[1]); const sb = sctx.B.v('brick', true); const tn = (st && st.tint) || [0.9, 0.9, 0.88]; sb.setColor(tn[0] * 0.86, tn[1] * 0.86, tn[2] * 0.86); wallRect(sb, Fb, 0, Fb.L, -0.6, dy + 0.02, 0, [u * BRICK_S, 0, (u + Fb.L) * BRICK_S, dy * BRICK_S]); sb.setColor(1, 1, 1); }   // foundation under a raised piece (shows where the ground dips at a step between two pads)
      const F = edgeFrame(p[0], p[1], q[0], q[1]);
      // A 'class' wall between one and two storeys high would leave a blank band under the eaves, stepping at every
      // piece join: the facade is laid out at its one-row height and the leftover goes to the base as a plain plinth.
      const ex = ctx.terrain && st && st.kind === 'class' && h - dy > 4.8 && h - dy < 7.4 ? h - dy - 4.6 : 0; const hh = h - dy - ex;
      if (ex) ctx.onGround([p[0], p[1]], () => { const sb = sctx.B.v('brick', true); sb.setColor(st.tint[0] * 0.9, st.tint[1] * 0.9, st.tint[2] * 0.9); wallRect(sb, F, 0, F.L, 0, ex + 0.02, 0, [u * BRICK_S, 0, (u + F.L) * BRICK_S, ex * BRICK_S]); fbox(B.v('whitePanel'), F, -0.03, F.L + 0.03, ex - 0.1, ex + 0.02, 0, 0.07, 1, 0, 'fstb'); sb.setColor(1, 1, 1); }, { mode: base0 + dy });
      const run = () => {
        facade(sctx, F, 0, hh, plain ? (opts.plainStyle || 'maPlain') : style, u, rnd);
        if (opts.parapet) {
          const roofY = hh - 0.4;
          quadFacing(B.v(alu ? 'frameAlu' : 'frame'), F.P(-0.1, hh + 0.03, 0.13), F.P(F.L + 0.1, hh + 0.03, 0.13), F.P(F.L, hh + 0.03, -0.32), F.P(0, hh + 0.03, -0.32), [0, 1, 0]);
          quadFacing(B.v('concrete'), F.P(0, roofY, -0.32), F.P(F.L, roofY, -0.32), F.P(F.L, hh + 0.03, -0.32), F.P(0, hh + 0.03, -0.32), [-F.nx, 0, -F.nz]);
          const pc = F.P(F.L / 2, (roofY + hh + 0.03) / 2, -0.16); B.c('concrete').box(pc[0], pc[1], pc[2], F.L, hh + 0.03 - roofY, 0.32, F.rotY);
        }
      };
      // (on a plinth the kit's ground-contact shading, mulch beds and bed shrubs would hang in the air: drop them)
      const marks = ctx.terrain ? ['groundDecal', 'mulch'].map((k) => { const bk = B.v(k); return [bk, bk.pos.length, bk.nor.length, bk.uv.length, bk.col ? bk.col.length : 0]; }) : null; const cut = ex ? marks : null; const nSh = ctx.shrubs.length;
      if (dy + ex > 0) ctx.onGround([p[0], p[1]], run, { mode: base0 + dy + ex }); else run();
      if (!shared) (ctx.walls = ctx.walls || []).push({ id: opts.id || ringIn.id || ctx.siteName || null, a: p, b: q, floor: base0 + dy + ex, top: base0 + h, open: !plain && !(st && st.plain) });   // map check: seating
      // a planting bed only where the ground a metre out is the bed's level: across a bank it shows as a sliver of mulch
      const bedOff = marks && !cut ? (() => { const g1 = edgeGround(ctx, p, q, 1.0), fl = base0 + dy + ex; return g1.max - fl > 0.3 || fl - g1.min > 0.3; })() : false;
      if (bedOff) { for (const [bk, np, nn, nu, nc] of marks) { bk.pos.length = np; bk.nor.length = nn; bk.uv.length = nu; if (bk.col) bk.col.length = nc; } ctx.shrubs.length = nSh; }   // (the contact strip too: one quad per piece cannot follow a step, it would hang over it)
      if (cut) { for (const [bk, np, nn, nu, nc] of cut) { bk.pos.length = np; bk.nor.length = nn; bk.uv.length = nu; if (bk.col) bk.col.length = nc; } ctx.shrubs.length = nSh; }
      else if (marks) {   // contact shading, mulch and bed shrubs lie on the ground as it is (it dips at a step between two pads)
        for (const [bk, np] of marks) for (let k = np; k < bk.pos.length; k += 3) { const gy = ctx.groundY(bk.pos[k], bk.pos[k + 2]) + 0.03; if (bk.pos[k + 1] > gy + 0.1) bk.pos[k + 1] = gy; }
        for (let k = nSh; k < ctx.shrubs.length; k++) { const sh = ctx.shrubs[k]; sh[1] = Math.min(sh[1], ctx.groundY(sh[0], sh[2]) + 0.05); } }
      u += F.L;
    }
  }
  B.v('stucco', true).setColor(1, 1, 1); B.v('brick', true).setColor(1, 1, 1);
  if (ctx.terrain) (ctx.footprints = ctx.footprints || []).push({ id: opts.id || ringIn.id || ctx.siteName || null, ring, roof: base0 + h - (opts.parapet ? 0.4 : 0), floor: plan ? plan.maxLevel : base0 });   // map check: interior
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
  quadFacing(bucket, A, Bp, C, Dd, [0, -1, 0], puv ? [A, Bp, C, Dd].map((p) => [p[0] * uvS, p[2] * uvS]) : undefined);   // soffit
  // Solid attic: the space under the skin is filled with stepped collision blocks (each layer ends where the roof
  // reaches its top), so nobody who mantles over the eave or tunnels a wall can end up standing inside the roof.
  if (col && opts.fill) {
    const rotY = Math.atan2(-tz, tx), step = 0.8;
    for (let y0 = 0; y0 + 0.25 < rise; y0 += step) {
      const y1 = Math.min(y0 + step, rise - 0.05), d = hw * y1 / rise; const a0 = gable ? u0 + ov : u0 + d, a1 = gable ? u1 - ov : u1 - d, b0 = v0 + d, b1 = v1 - d;
      if (a1 - a0 < 0.3 || b1 - b0 < 0.3) break; const c = W((a0 + a1) / 2, (b0 + b1) / 2, eaveY + (y0 + y1) / 2);
      B.c('wood').box(c[0], c[1], c[2], a1 - a0, y1 - y0, b1 - b0, rotY);
    }
  }
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
  const p = F.P(F.L * t, 0, 0.14);
  if (ctx.terrain) groundLadder(ctx, p[0], p[2], F.nx, F.nz, (ctx.B.off ? ctx.B.off.y : 0) + top);   // from the ground at its foot (the wall may start higher than the building's datum)
  else wallLadder(ctx, p[0], p[2], F.nx, F.nz, top);
}
// flat decal on a wall frame (text / logos): returns the mesh (added to the scene)
export function wallDecal(ctx, tex, F, uC, yC, w, h, out = 0.03, opts = {}) {
  const g = new THREE.BufferGeometry();
  const oy = ctx.B.off ? ctx.B.off.y : 0;   // inside ctx.onGround the decal rides on the same base as the wall
  const p = [F.P(uC - w / 2, yC - h / 2, out), F.P(uC - w / 2, yC + h / 2, out), F.P(uC + w / 2, yC + h / 2, out), F.P(uC + w / 2, yC - h / 2, out)].map((q) => [q[0], q[1] + oy, q[2]]);
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0], 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, alphaTest: opts.opaque ? 0 : 0.4, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true; m.name = 'decal'; ctx.scene.add(m); return m;
}
// ------------------------------------------------------------------------------------------ terrain helpers
// (all of them fall back to flat ground at y = 0 when the campus has no terrain)
/** Ground heights along a ring's outline, `out` metres outside the walls: { min, max, mean }. */
export function ringGround(ctx, ring, out = 0.5) {
  if (!ctx.terrain) return { min: 0, max: 0, mean: 0 };
  const r = ensureCCW(ring); let min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (let i = 0; i < r.length; i++) { const g = edgeGround(ctx, r[i], r[(i + 1) % r.length], out); if (!g.n) continue; min = Math.min(min, g.min); max = Math.max(max, g.max); sum += g.mean * g.n; n += g.n; }
  return n ? { min, max, mean: sum / n } : { min: 0, max: 0, mean: 0 };
}
/** Ground along the wall a -> b of a CCW ring (sampled every ~1.5 m, `out` metres outside). */
export function edgeGround(ctx, a, b, out = 0.5) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!ctx.terrain || L < 1e-3) return { min: 0, max: 0, mean: 0, n: ctx.terrain ? 0 : 1 };
  const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; const k = Math.max(2, Math.ceil(L / 1.5)); let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i <= k; i++) { const t = i / k; const y = ctx.groundY(a[0] + (b[0] - a[0]) * t + nx * out, a[1] + (b[1] - a[1]) * t + nz * out); min = Math.min(min, y); max = Math.max(max, y); sum += y; }
  return { min, max, mean: sum / (k + 1), n: k + 1 };
}
// highest ground along a wall, leaving out the last 2.5 m at each end of a long one (a step to the neighbour's pad, or a
// cheek wall, stands there: it must not lift the whole wall's floor)
/** A wall piece that stands at a graded street (its sidewalk or the shoulder behind it): the street does not move, so its floor takes the highest ground along it. */
/** Highest ground just outside a wall (0.3 and 0.7 m out): at a street the ground steps at the wall line (the footprint is cut to the floor, the shoulder is not). */
export function outsideMax(ctx, p, q) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; const nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L; const n = Math.max(2, Math.ceil(L / 1.0)); let m = -Infinity; for (let k = 0; k <= n; k++) for (const o of [0.3, 0.7]) m = Math.max(m, ctx.groundY(p[0] + (q[0] - p[0]) * k / n + nx * o, p[1] + (q[1] - p[1]) * k / n + nz * o)); return m; }
export function streetSide(ctx, p, q) { if (!ctx.streets) return false; const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; const nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L; for (const t of [0.02, 0.15, 0.5, 0.85, 0.98]) { const d = ctx.streets.design(p[0] + (q[0] - p[0]) * t + nx * 1.0, p[1] + (q[1] - p[1]) * t + nz * 1.0); if (d && (d.zone !== 'verge' || d.t === 0)) return true; } return false; }
function midGround(ctx, p, q) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 8) return edgeGround(ctx, p, q).max; const t = 2.5 / L; return edgeGround(ctx, [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]).max; }
// wall a -> b cut into pieces that each start at their own ground: [[p, q, dy], ...], dy = that piece's base above `base0`
function wallPieces(ctx, a, b, base0, h) {
  if (!ctx.terrain) return [[a, b, 0]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const g = edgeGround(ctx, a, b);
  const n = L >= 14 && g.max - g.min > 1.1 ? Math.max(1, Math.min(Math.floor(L / 8), Math.ceil((g.max - g.min) / 1.1))) : 1; const out = [];
  for (let k = 0; k < n; k++) {
    const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
    let dy = edgeGround(ctx, p, q).min - base0 - 0.05; dy = dy < 0.45 ? 0 : Math.min(dy, Math.max(0, h - 2.7));
    out.push([p, q, dy]);
  }
  return out;
}
// ------------------------------------------------------------------------------------------ seating (pads)
// "Seat every building on a pad; terrain never touches a facade above the plinth." A wall that simply starts at the
// lowest ground along it has the hill climbing its windows wherever the ground rises along the wall. So, BEFORE any
// ground is moved, every building's walls are planned on the natural ground (planWalls): each wall piece gets a floor
// level, and a strip of ground along it (PAD_OUT outside, 1 m inside) is flattened to exactly that level (applyPads).
// Levels per piece: the facade kit lays a 'class' wall out either as one row of windows (4.6 m to the eave) or as two
// (>= 7.4 m), so its floor is top - 4.6 or anything at / below top - 7.4, whichever is nearer the natural ground;
// other kinds take the mean ground (at most top - minH). Lower strips are laid last: at a step between two pieces the
// ramp lies under the UPPER piece (its foundation shows), never against the lower piece's windows. Where the hill
// stands well above a pad, a retaining block with a coping holds it at the edge of the strip.
const PAD_OUT = 2.2, PAD_BLEND = 2.6;
export const ringKey = (ring) => ring.length + ':' + ring[0][0].toFixed(1) + ',' + ring[0][1].toFixed(1) + ':' + ring[ring.length >> 1][0].toFixed(1);
export function planWalls(ctx, ringIn, topAbs, style, opts = {}) {
  if (!ctx.terrain) return null;
  const ring = ensureCCW(ringIn); const st = STYLES[style] || {}; const cls = st.kind === 'class'; const minH = opts.minH || 3.4; const others = opts.others || [];
  const plan = { name: opts.name || ringIn.id || null, top: topAbs, ring, edges: new Map(), minLevel: Infinity, maxLevel: -Infinity, strips: [] }; const zones = opts.zones || [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
    const g = edgeGround(ctx, a, b); const n = opts.split !== false && L >= 14 && g.max - g.min > 1.1 ? Math.max(1, Math.min(Math.floor(L / 8), Math.ceil((g.max - g.min) / 1.1))) : 1; const pcs = [];
    for (let k = 0; k < n; k++) {
      const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n]; const ge = edgeGround(ctx, p, q); let level;
      const nx0 = (q[1] - p[1]) / (L / n), nz0 = -(q[0] - p[0]) / (L / n); const zone = zones.some((zf) => zf((p[0] + q[0]) / 2 + nx0 * 1.5, (p[1] + q[1]) / 2 + nz0 * 1.5));   // faces a designed campus pad (terrace, courtyard, pool deck): its floor is that pad, no strip
      if (opts.level !== undefined) level = opts.level;
      else if (zone) level = Math.min(ge.mean, topAbs - minH);
      else if (cls) { const two = Math.min(ge.mean, topAbs - 7.4), one = topAbs - 4.6; level = topAbs - ge.mean >= 7.4 ? two : Math.abs(ge.mean - one) <= Math.abs(ge.mean - two) ? one : two; }
      // (a wall that can start at any height sits at the LOW end of its ground: the uphill end is cut into the bank.
      // Seating it at the mean made a mound of fill at the low end: an asphalt ramp up to the wall, a notch beside it.)
      else level = Math.min(ge.min + 0.12, topAbs - minH);
      const nx = (q[1] - p[1]) / (L / n), nz = -(q[0] - p[0]) / (L / n); const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const shared = others.some((r) => r !== ringIn && r !== ring && pointInRing(m[0] + nx * 1.2, m[1] + nz * 1.2, r));   // a party wall: no ground outside it
      if (shared && !cls && !zone && opts.level === undefined) level = Math.min(ge.mean, topAbs - minH);   /* a party wall has no pad: it keeps the mean of its ground */
      const pc = { p, q, level, shared, natural: ge }; pcs.push(pc);
      if (!shared) { pc.strip = { p, q, nx, nz, level, L: L / n, zone, ring }; plan.strips.push(pc.strip); }
    }
    if (!cls && opts.level === undefined) { for (let pass = 0; pass < 2; pass++) for (let k = 1; k < pcs.length; k++) if (!pcs[k].shared && !pcs[k - 1].shared && Math.abs(pcs[k].level - pcs[k - 1].level) < 0.9) { const lo = Math.min(pcs[k].level, pcs[k - 1].level); pcs[k].level = pcs[k - 1].level = lo; } }   // steps under 0.9 m between neighbouring pieces: one level
    for (const pc of pcs) if (pc.strip) { pc.strip.level = pc.level; plan.minLevel = Math.min(plan.minLevel, pc.level); plan.maxLevel = Math.max(plan.maxLevel, pc.level); }
    plan.edges.set(i, pcs);
  }
  if (!Number.isFinite(plan.minLevel)) { plan.minLevel = ringGround(ctx, ring).min; plan.maxLevel = plan.minLevel; }
  (ctx.seatList = ctx.seatList || []).push({ ring, cap: Math.min(plan.maxLevel, topAbs - 1.0) });
  (ctx.wallPlans = ctx.wallPlans || new Map()).set(ringKey(ring), plan);
  return plan;
}
/** Flattens the strips of every planned wall (highest first), then builds the retaining blocks where a pad is a deep cut. */
export function applyPads(ctx) {
  const T = ctx.terrain; if (!T || !ctx.wallPlans) return; const all = []; for (const pl of ctx.wallPlans.values()) all.push(...pl.strips);
  // the designed ground as it is now: a wall that faces a designed pad gets that ground back along its strip at the end
  // (a neighbouring wall's higher pad wraps round the corner onto it otherwise)
  const snap = Float32Array.from(T.heights); const snapAt = (x, z) => { let fx = (x - T.x0) / T.cell, fz = (z - T.z0) / T.cell; let i = Math.max(0, Math.min(T.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(T.nz - 2, Math.floor(fz))); fx = Math.max(0, Math.min(1, fx - i)); fz = Math.max(0, Math.min(1, fz - j)); const k = j * T.nx + i; return (snap[k] * (1 - fx) + snap[k + 1] * fx) * (1 - fz) + (snap[k + T.nx] * (1 - fx) + snap[k + T.nx + 1] * fx) * fz; };
  const strips = all.filter((s) => !s.zone);
  for (const s of strips) s.nat = T.heightAt((s.p[0] + s.q[0]) / 2 + s.nx * (PAD_OUT + PAD_BLEND + 0.3), (s.p[1] + s.q[1]) / 2 + s.nz * (PAD_OUT + PAD_BLEND + 0.3));   // the hill beyond the pad, before it is cut
  // Corridors: a wall with another building 1.2-5 m in front of it. The gap is one terrace, wall to wall (the piece's own
  // level, short blend), and no LOWER pad may cut into it: the end of a lower wall's strip and its blend used to chew the
  // gap between two buildings into lumps (an asphalt mound under a ladder, a notch at the neighbour's wall base).
  const rings = ctx.allRings || [];
  for (const st of strips) { st.gap = 0; const mx = (st.p[0] + st.q[0]) / 2, mz = (st.p[1] + st.q[1]) / 2; for (let dd = 0.6; dd <= 5.01 && !st.gap; dd += 0.3) { const x = mx + st.nx * dd, z = mz + st.nz * dd; if (!pointInRing(x, z, st.ring) && rings.some((r) => pointInRing(x, z, r))) st.gap = dd; } if (st.gap < 1.2 || pointInRing(mx + st.nx * 0.4, mz + st.nz * 0.4, st.ring)) st.gap = 0; }
  const rectOf = (st) => (st.gap ? { cx: (st.p[0] + st.q[0]) / 2 + st.nx * st.gap / 2, cz: (st.p[1] + st.q[1]) / 2 + st.nz * st.gap / 2, w: st.L + 2.0, d: st.gap + 0.6, angle: Math.atan2(st.q[1] - st.p[1], st.q[0] - st.p[0]) } : null);
  // ...nor into the strip of ANOTHER building's higher wall (the end of a lower wall's strip reached 1.2 m + its blend
  // round the corner and cut a notch at the neighbour's base); steps between two pieces of one wall stay as they are.
  for (const st of strips) { const o = (PAD_OUT - 1.0) / 2; st.core = shapeSDF({ rect: rectOf(st) || { cx: (st.p[0] + st.q[0]) / 2 + st.nx * o, cz: (st.p[1] + st.q[1]) / 2 + st.nz * o, w: st.L, d: PAD_OUT + 1.0, angle: Math.atan2(st.q[1] - st.p[1], st.q[0] - st.p[0]) } }).sd; st.mx = (st.p[0] + st.q[0]) / 2; st.mz = (st.p[1] + st.q[1]) / 2; }
  strips.sort((a, b) => b.level - a.level);
  // (a deep cut is laid one lattice cell wider: the level ground must reach BEHIND the face of the retaining block that
  // will stand at PAD_OUT, or the 2 m lattice ramps up in front of it)
  for (const s of strips) {
    s.cut = !s.gap && s.nat - s.level > 1.7;
    if (s.gap) { ctx.flatten({ rect: rectOf(s) }, { y: s.level, blend: 1.0 }); continue; }
    const out = PAD_OUT + (s.cut ? 2.0 : 0), o = (out - 1.0) / 2; const keep = strips.filter((c) => c !== s && c.level > s.level + 0.5 && (c.gap || c.ring !== s.ring) && Math.hypot(c.mx - s.mx, c.mz - s.mz) < (c.L + s.L) / 2 + 9);
    ctx.flatten({ rect: { cx: (s.p[0] + s.q[0]) / 2 + s.nx * o, cz: (s.p[1] + s.q[1]) / 2 + s.nz * o, w: s.L + 2.4, d: out + 1.0, angle: Math.atan2(s.q[1] - s.p[1], s.q[0] - s.p[0]) } }, { y: keep.length ? (x, z) => { const u = ((x - s.p[0]) * (s.q[0] - s.p[0]) + (z - s.p[1]) * (s.q[1] - s.p[1])) / s.L, v = (x - s.p[0]) * s.nx + (z - s.p[1]) * s.nz; if (u >= 0 && u <= s.L && v >= -1 && v <= 1.6) return s.level; /* right at its own wall the lower pad wins: no buried glass */ return keep.some((c) => c.core(x, z) <= 0) ? T.heightAt(x, z) : s.level; } : s.level, blend: PAD_BLEND });
  }
  for (const s of all) if (s.zone) { const o = (PAD_OUT - 1.0) / 2; ctx.flatten({ rect: { cx: (s.p[0] + s.q[0]) / 2 + s.nx * o, cz: (s.p[1] + s.q[1]) / 2 + s.nz * o, w: s.L + 1.0, d: PAD_OUT + 1.0, angle: Math.atan2(s.q[1] - s.p[1], s.q[0] - s.p[0]) } }, { y: snapAt, blend: 1.6 }); }
  ctx.padCuts = strips.filter((s) => s.cut);
  ctx._padStrips = strips;
}
/** Cheek walls, planned on the ground as finally laid (after the streets are restored): call after applyPads. */
export function planCheeks(ctx) {
  const T = ctx.terrain; const strips = ctx._padStrips; if (!T || !strips) return; const rings = ctx.allRings || [];
  // Cheek walls: where a pad ends against ground a terrace higher (the next piece of the same wall, a neighbour's pad,
  // the mouth of a corridor), a retaining block across the strip covers the lattice's ramp: a step between two terraces
  // instead of asphalt climbing a wall.
  const cheeks = [];
  for (const st of strips) for (const sg of [1, -1]) {
    const E = sg > 0 ? st.q : st.p; const tx = (st.q[0] - st.p[0]) / st.L * sg, tz = (st.q[1] - st.p[1]) / st.L * sg; const wd = st.gap ? st.gap : PAD_OUT; const ox = st.nx * wd / 2, oz = st.nz * wd / 2;
    const gAt = (a) => T.heightAt(E[0] + tx * a + ox, E[1] + tz * a + oz);
    const here = gAt(-Math.min(4.5, st.L * 0.6)); if (Math.abs(here - st.level) > 0.4) continue;
    let hi = -Infinity; for (let a = 0.4; a <= 4.01; a += 0.4) hi = Math.max(hi, gAt(a)); if (hi - here < 0.4) continue;
    // where the ramp really lies (before the end when the neighbour's pad is protected, beyond it otherwise)
    let a0 = null, a1 = null; for (let a = -4; a <= 4.41; a += 0.2) { const g = gAt(a); if (a0 === null && g > here + 0.1) a0 = a; if (a0 !== null && g < hi - 0.15) a1 = a; } if (a0 === null) continue; if (a1 === null || a1 < a0) a1 = a0;
    const f = a0 - 0.9, e = Math.max(a1 + 0.5, f + 1.6); if (e - f > 6.5) continue;
    for (let a = f; a <= e + 0.01; a += 0.4) for (const b of [0.1, wd / 2, wd + 0.1]) hi = Math.max(hi, T.heightAt(E[0] + tx * a + st.nx * b, E[1] + tz * a + st.nz * b));   // nothing under the block stands above its top
    const cx = E[0] + tx * (f + e) / 2 + ox, cz = E[1] + tz * (f + e) / 2 + oz; if (cheeks.some((c) => Math.hypot(c.x - cx, c.z - cz) < 2.2) || rings.some((r) => pointInRing(cx, cz, r))) continue;
    cheeks.push({ x: cx, z: cz, tx: -tx, tz: -tz, nx: st.nx, nz: st.nz, len: e - f, gap: wd + 0.3, top: hi + 0.06, level: here });   // (tx, tz): toward the low side, where the face is
  }
  ctx.padCheeks = cheeks;
}
/**
 * Per-wall pads seat the WALLS, not the building: inside the footprint the hill is still there, and where it stands above
 * the roof deck it comes out through the roof. After all pads: the ground inside every solid footprint is cut down to
 * its floor (ctx.seatList: { ring, cap }, filled by planWalls and the house plans).
 */
export function seatInteriors(ctx) {
  const T = ctx.terrain; if (!T) return;
  for (const s of ctx.seatList || []) ctx.flatten({ outline: s.ring }, { y: (x, z) => Math.min(T.heightAt(x, z), s.cap), blend: 0.8 });
}
/** Guard rail (two black bars on posts, solid to players) along the top edge of a drop: from (x0, z0) to (x1, z1) at height y. */
export function guardRail(ctx, x0, z0, x1, z1, y, h = 1.05) {
  const { B } = ctx; const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.8) return; const rot = Math.atan2(-(z1 - z0), x1 - x0); const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; const m = B.v('blackMetal');
  const n = Math.max(1, Math.round(L / 1.6)); for (let k = 0; k <= n; k++) m.box(x0 + (x1 - x0) * k / n, y + h / 2, z0 + (z1 - z0) * k / n, 0.05, h, 0.05, rot);
  for (const yy of [h, h * 0.55]) m.box(mx, y + yy, mz, L, 0.045, 0.045, rot);
  B.c('metal').box(mx, y + h / 2, mz, L, h, 0.08, rot);
}
/** Retaining blocks (with a coping) along the pads that are cut deep into the hill; call after every flatten. */
export function buildPadWalls(ctx) {
  const { B } = ctx; if (!ctx.terrain) return;
  for (const c of ctx.padCheeks || []) {   // steps at the mouths of corridors between two buildings (applyPads)
    /* final ground (later pads may have moved it): push the face out until the ground in front of it is the low terrace,
       raise the top over whatever stands under the block; no clean step, no block */
    { const W = c.gap - 0.3; let ok = false; const far = [c.x - c.tx * c.len / 2, c.z - c.tz * c.len / 2];
      for (let k = 0; k < 8 && !ok; k++) { let m = -Infinity; for (let u = -W / 2; u <= W / 2 + 0.01; u += W / 8) m = Math.max(m, ctx.groundY(far[0] + c.tx * (c.len + 0.08) + c.nx * u, far[1] + c.tz * (c.len + 0.08) + c.nz * u)); if (m - c.level <= 0.1) ok = true; else c.len += 0.4; }
      if (!ok || c.len > 7.5) continue; c.x = far[0] + c.tx * c.len / 2; c.z = far[1] + c.tz * c.len / 2;
      let t = -Infinity; for (let u = -W / 2; u <= W / 2 + 0.01; u += W / 8) for (let v = 0; v <= c.len + 0.01; v += 0.2) t = Math.max(t, ctx.groundY(far[0] + c.tx * v + c.nx * u, far[1] + c.tz * v + c.nz * u)); c.top = Math.max(c.top, t + 0.06); if (c.top - c.level < 0.25) continue; }
    terraceBlocks(ctx, { x: c.x + c.tx * c.len / 2, z: c.z + c.tz * c.len / 2, tx: c.nx, tz: c.nz, fx: c.tx, fz: c.tz, w: c.gap, regW: c.gap - 0.3, d: c.len, frontY: c.level, top: c.top, allowTall: true });   // (a 2-3 m wide cheek at a building corner stays one wall with coping and rail: stepped, it was a giant stair to nowhere; QA accepted them as they stand)
  }
  for (const s of ctx.padCuts || []) {
    const mx = (s.p[0] + s.q[0]) / 2, mz = (s.p[1] + s.q[1]) / 2; const tx = (s.q[0] - s.p[0]) / s.L, tz = (s.q[1] - s.p[1]) / s.L; const D = 2.0 + PAD_BLEND + 0.3;
    const cx = mx + s.nx * (PAD_OUT + D / 2), cz = mz + s.nz * (PAD_OUT + D / 2); if ((ctx.allRings || []).some((r) => pointInRing(cx, cz, r) || pointInRing(mx + s.nx * (PAD_OUT + 0.3), mz + s.nz * (PAD_OUT + 0.3), r))) continue;
    const pad = ctx.groundY(mx + s.nx * (PAD_OUT - 0.4), mz + s.nz * (PAD_OUT - 0.4)); if (Math.abs(pad - s.level) > 0.4) continue;   // another pad took this ground
    { let lo = Infinity, hi = -Infinity; for (let t = -0.5; t <= 0.5; t += 0.125) { const y = ctx.groundY(mx + tx * s.L * t + s.nx * (PAD_OUT - 0.08), mz + tz * s.L * t + s.nz * (PAD_OUT - 0.08)); lo = Math.min(lo, y); hi = Math.max(hi, y); } if (hi - lo > 0.3 || hi - pad > 0.2) continue; }   // the ground in front is not one level (a later pad cut across): a bank, no block
    let top = -Infinity; for (const t of [-0.5, -0.25, 0, 0.25, 0.5]) for (const o of [0.3, D * 0.5, D + 0.2]) top = Math.max(top, ctx.groundY(mx + tx * s.L * t + s.nx * (PAD_OUT + o), mz + tz * s.L * t + s.nz * (PAD_OUT + o))); if (top - pad < 1.2) continue;
    terraceBlocks(ctx, { x: mx + s.nx * PAD_OUT, z: mz + s.nz * PAD_OUT, tx, tz, fx: -s.nx, fz: -s.nz, w: s.L + 0.05, regW: s.L, d: D, frontY: pad, top: top + 0.1, plant: true });
  }
}
/**
 * A retaining wall as a real one is built: never one face taller than `maxRise` (1.5 m). The block that holds a bank is
 * cut into terraces, each a level higher and `tread` (1 m) further back, a coping on every edge, low planting on the
 * wider treads, and the guard rail on the top edge when the whole drop is more than 1.2 m. A terrace is only as deep as
 * the ground under it allows (the terrain may not rise through a tread: where the bank is too steep the level is
 * skipped and the next riser is taller). o: { x, z (middle of the face line), tx, tz (along the face), fx, fz (out of the
 * face, toward the low side), w, d (depth behind the face), frontY (ground in front), top (default: the highest ground
 * under the block + 0.1), regW (width the map check samples), maxRise, tread, plant, allowTall }. Registers every block
 * in ctx.retaining (map check). Returns [[v0, v1, level], ...].
 */
export function terraceBlocks(ctx, o) {
  const { B } = ctx; const T = ctx.terrain; const { x, z, tx, tz, fx, fz, w, d, frontY } = o; const maxRise = o.maxRise || 1.5; const rw = o.regW || w;
  const gAt = (px, pz) => Math.max(ctx.groundY(px, pz), T && T.meshHeightAt ? T.meshHeightAt(px, pz) : -Infinity);
  const prof = []; for (let v = 0; v <= d + 1e-6; v += 0.2) { let m = -Infinity; for (let u = -rw / 2; u <= rw / 2 + 1e-6; u += Math.max(0.2, Math.min(0.5, rw / 4))) m = Math.max(m, gAt(x + tx * u - fx * v, z + tz * u - fz * v)); prof.push(m); }
  const top = Math.max(o.top ?? -Infinity, Math.max(...prof) + (o.top === undefined ? 0.1 : 0.04)); const H = top - frontY; const n = o.allowTall || o.single || w < 5 ? 1 : Math.max(1, Math.ceil(H / maxRise - 1e-6));   // only a long wall is terraced
  const tread = o.tread || Math.max(0.6, Math.min(1.0, (d - 0.8) / Math.max(1, n - 1)));
  const reach = (lv) => { let v = 0; for (let i = 0; i < prof.length; i++) { if (prof[i] > lv - 0.06) break; v = i * 0.2; } return v; };   // how far back the ground stays under a level
  const blocks = []; let start = 0;
  for (let k = 1; k < n; k++) { const lv = frontY + H * k / n; const e = Math.min(start + tread, reach(lv) - 0.05, d - 0.6); if (e - start < 0.5) continue; blocks.push([start, e, lv]); start = e; }
  blocks.push([start, d, top]);
  const rot = Math.atan2(-tz, tx), y0 = frontY - 0.5; let prev = frontY;
  blocks.forEach(([v0, v1, lv], i) => { const dd = v1 - v0, cx = x - fx * (v0 + dd / 2), cz = z - fz * (v0 + dd / 2);
    B.v('concrete').box(cx, (y0 + lv) / 2, cz, w, lv - y0, dd, rot, 1 / 3); B.c('concrete').box(cx, (y0 + lv) / 2, cz, w, lv - y0, dd, rot);
    B.v('limestone').box(x - fx * (v0 + 0.14), lv + 0.03, z - fz * (v0 + 0.14), w + 0.05, 0.07, 0.4, rot, 1 / 3);
    if (o.plant && i < blocks.length - 1 && dd >= 0.9 && w >= 4) ctx.shrubs.push([x - fx * (v0 + 0.25 + dd / 2), lv + 0.05, z - fz * (v0 + 0.25 + dd / 2), w - 1.0, 0.45, rot]);   // low planting on the tread (behind the coping)
    (ctx.retaining = ctx.retaining || []).push({ x: cx, z: cz, tx, tz, fx, fz, w: rw, d: dd, top: lv, frontY: prev, ...(o.allowTall ? { allowTall: true } : {}) });
    prev = lv; });
  if (H > 1.2) { const ex = x - fx * (start + 0.14), ez = z - fz * (start + 0.14); guardRail(ctx, ex - tx * rw / 2, ez - tz * rw / 2, ex + tx * rw / 2, ez + tz * rw / 2, top + 0.06); }   // a fall of more than 1.2 m gets a rail
  return blocks;
}
/**
 * Gore walls. Where two carriageways run side by side at different heights (a fork on a hill), the designed surface
 * steps between them over one lattice cell: a bank of 40-50 degrees INSIDE the paved width, which the ground shader
 * turns into a streak of grass across the street. Real forks hold that step with a retaining wall between the two
 * roadways. Every cluster of steep points on a carriageway gets one: 1 m slices along its axis, top at the upper road,
 * a coping, a guard rail over a drop of more than 1.2 m. Call after streets.restore() and every pad.
 */
export function goreWalls(ctx) {
  const T = ctx.terrain, S = ctx.streets; if (!T || !S) return []; const { B } = ctx; const pb = ctx.playBounds; const pts = [];
  // a gore: a steep point on a carriageway with roadway both above and below it (a bank at a road's end, or the foot of a wall that stands in the nominal width, has pavement on one side only)
  const paved = (x, z) => S.inRoad(x, z, 0) && T.slopeAt(x, z) < 0.3;
  for (let z = pb.minZ + 2; z <= pb.maxZ - 2; z += 1) for (let x = pb.minX + 2; x <= pb.maxX - 2; x += 1) { if (T.slopeAt(x, z) <= 0.47 || !S.inRoad(x, z, 0)) continue; const [gx, gz] = T.gradAt(x, z); const l = Math.hypot(gx, gz);
    if ([1, -1].every((sg) => [2, 3, 4, 5].some((dd) => paved(x + gx / l * dd * sg, z + gz / l * dd * sg)))) pts.push([x, z, -1]); }
  // clusters (points within 1.5 m of each other)
  const clusters = []; for (const p of pts) { if (p[2] >= 0) continue; const id = clusters.length, cl = [p]; p[2] = id; for (let h = 0; h < cl.length; h++) for (const q of pts) if (q[2] < 0 && Math.abs(q[0] - cl[h][0]) <= 1.5 && Math.abs(q[1] - cl[h][1]) <= 1.5) { q[2] = id; cl.push(q); } clusters.push(cl); }
  const gAt = (x, z) => Math.max(ctx.groundY(x, z), T.meshHeightAt ? T.meshHeightAt(x, z) : -Infinity); const out = []; const conc = B.v('concrete'), col = B.c('concrete');
  for (const cl of clusters) {
    if (cl.length < 6) continue; let mx = 0, mz = 0; for (const p of cl) { mx += p[0]; mz += p[1]; } mx /= cl.length; mz /= cl.length;
    let sxx = 0, szz = 0, sxz = 0; for (const p of cl) { sxx += (p[0] - mx) ** 2; szz += (p[1] - mz) ** 2; sxz += (p[0] - mx) * (p[1] - mz); }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), tx = Math.cos(ang), tz = Math.sin(ang), nx = -tz, nz = tx;   // principal axis
    const uv = cl.map((p) => [(p[0] - mx) * tx + (p[1] - mz) * tz, (p[0] - mx) * nx + (p[1] - mz) * nz]); let u0 = Infinity, u1 = -Infinity; for (const q of uv) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); }
    if (u1 - u0 < 3) continue; const P = (u, v) => [mx + tx * u + nx * v, mz + tz * u + nz * v];
    // cross-lines every metre: the band of steep ground there (with its neighbours, so the outline is one smooth strip), the wall top over it
    const N = Math.ceil(u1 - u0) + 2, nodes = [];
    for (let i = 0; i <= N; i++) { const a = u0 - 1 + i; let v0 = Infinity, v1 = -Infinity; for (const q of uv) if (Math.abs(q[0] - a) <= 2.0) { v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); } if (v0 > v1) { nodes.push(null); continue; } v0 -= 0.7; v1 += 0.7;
      let top = -Infinity, lo0 = -Infinity, lo1 = -Infinity; for (let u = a - 1; u <= a + 1.001; u += 0.25) { for (let v = v0; v <= v1 + 0.001; v += 0.2) { const q = P(u, v); top = Math.max(top, gAt(q[0], q[1])); } }
      for (let u = a - 0.5; u <= a + 0.501; u += 0.125) { const q0 = P(u, v0 - 0.08), q1 = P(u, v1 + 0.08); lo0 = Math.max(lo0, gAt(q0[0], q0[1])); lo1 = Math.max(lo1, gAt(q1[0], q1[1])); }
      nodes.push({ a, v0, v1, top: top + 0.06, lo0, lo1 }); }
    const live = nodes.filter(Boolean); if (live.length < 3) continue;
    // straight faces: each edge is the least-squares line through the band's edge, pushed out until it covers every cross-line;
    // the top stands one constant kerb height over the upper road
    for (const [key, sg] of [['v0', -1], ['v1', 1]]) { let sa = 0, sv = 0, saa = 0, sav = 0; for (const nd of live) { sa += nd.a; sv += nd[key]; saa += nd.a * nd.a; sav += nd.a * nd[key]; } const m = live.length, k = (m * sav - sa * sv) / (m * saa - sa * sa || 1), c0 = (sv - k * sa) / m; let off = 0; for (const nd of live) off = Math.max(off, sg * (nd[key] - (k * nd.a + c0))); for (const nd of live) nd[key] = k * nd.a + c0 + sg * off; }
    for (const nd of live) { let top = -Infinity, lo0 = -Infinity, lo1 = -Infinity; for (let u = nd.a - 1; u <= nd.a + 1.001; u += 0.25) for (let v = nd.v0; v <= nd.v1 + 0.001; v += 0.2) { const q = P(u, v); top = Math.max(top, gAt(q[0], q[1])); }
      for (let u = nd.a - 0.5; u <= nd.a + 0.501; u += 0.125) { const q0 = P(u, nd.v0 - 0.08), q1 = P(u, nd.v1 + 0.08); lo0 = Math.max(lo0, gAt(q0[0], q0[1])); lo1 = Math.max(lo1, gAt(q1[0], q1[1])); } nd.lo0 = lo0; nd.lo1 = lo1;
      /* the top falls with the road: over this cross-line only (half a metre each way), a low kerb over the upper road's edge */
      let t2 = -Infinity; for (let u = nd.a - 0.5; u <= nd.a + 0.501; u += 0.25) for (let v = nd.v0; v <= nd.v1 + 0.001; v += 0.2) { const q = P(u, v); t2 = Math.max(t2, gAt(q[0], q[1])); } nd.top = t2 + 0.12; } const low = live.reduce((q, nd) => q + (nd.lo0 - nd.lo1), 0) <= 0 ? 0 : 1;   // which edge looks down on the lower road
    let n = 0; const y0 = Math.min(...live.map((nd) => Math.min(nd.lo0, nd.lo1))) - 0.6; const up = [0, 1, 0];
    const C = (nd, side, y) => { const q = P(nd.a, side ? nd.v1 : nd.v0); return [q[0], y, q[1]]; }; const quad = (p0, p1, p2, p3, nrm) => { quadFacing(conc, p0, p1, p2, p3, nrm, [p0, p1, p2, p3].map((p) => [(p[0] * tx + p[2] * tz) / 3, (nrm[1] ? p[0] * nx + p[2] * nz : p[1]) / 3])); quadFacing(col, p0, p1, p2, p3, nrm); };
    for (let i = 0; i < nodes.length - 1; i++) { const A = nodes[i], Bn = nodes[i + 1]; if (!A || !Bn) continue; const drop = Math.max(A.top - (low ? A.lo1 : A.lo0), Bn.top - (low ? Bn.lo1 : Bn.lo0)); if (drop < 0.35) continue;
      quad(C(A, 0, A.top), C(Bn, 0, Bn.top), C(Bn, 1, Bn.top), C(A, 1, A.top), up);                                               // top: one even strip at the level of the upper road
      for (const side of [0, 1]) { const sg = side ? 1 : -1; quad(C(A, side, y0), C(Bn, side, y0), C(Bn, side, Bn.top), C(A, side, A.top), [nx * sg, 0, nz * sg]); }
      if (!nodes[i - 1] || Math.max(nodes[i - 1].top - (low ? nodes[i - 1].lo1 : nodes[i - 1].lo0), A.top - (low ? A.lo1 : A.lo0)) < 0.35) quad(C(A, 0, y0), C(A, 1, y0), C(A, 1, A.top), C(A, 0, A.top), [-tx, 0, -tz]);
      if (!nodes[i + 2] || Math.max(nodes[i + 2].top - (low ? nodes[i + 2].lo1 : nodes[i + 2].lo0), Bn.top - (low ? Bn.lo1 : Bn.lo0)) < 0.35) quad(C(Bn, 0, y0), C(Bn, 1, y0), C(Bn, 1, Bn.top), C(Bn, 0, Bn.top), [tx, 0, tz]);
      // coping and rail along the low edge
      const E = (nd, inset, y) => { const q = P(nd.a, low ? nd.v1 - inset : nd.v0 + inset); return [q[0], y, q[1]]; };
      quadFacing(B.v('limestone'), E(A, 0, A.top + 0.035), E(Bn, 0, Bn.top + 0.035), E(Bn, 0.4, Bn.top + 0.035), E(A, 0.4, A.top + 0.035), up, [[0, 0], [1 / 3, 0], [1 / 3, 0.13], [0, 0.13]]);
      if (drop > 1.2) { const m = B.v('blackMetal'), r0 = E(A, 0.14, A.top + 0.035), r1 = E(Bn, 0.14, Bn.top + 0.035); for (const r of [r0, r1]) m.box(r[0], r[1] + 0.525, r[2], 0.05, 1.05, 0.05, Math.atan2(-tz, tx)); for (const h of [1.05, 0.58]) m.tube([r0[0], r0[1] + h, r0[2]], [r1[0], r1[1] + h, r1[2]], 0.024, 5);
        B.c('metal').box((r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2 + 0.525, (r0[2] + r1[2]) / 2, Math.hypot(r1[0] - r0[0], r1[2] - r0[2]), 1.05 + Math.abs(r1[1] - r0[1]), 0.08, Math.atan2(-(r1[2] - r0[2]), r1[0] - r0[0])); }
      // map check: the rectangle common to both cross-lines
      { const v0 = Math.max(A.v0, Bn.v0), v1 = Math.min(A.v1, Bn.v1), c = P(A.a + 0.5, (v0 + v1) / 2); let fy = -Infinity; for (let u = 0; u <= 1.001; u += 0.125) { const q = P(A.a + u, low ? v1 + 0.08 : v0 - 0.08); fy = Math.max(fy, gAt(q[0], q[1])); }
        if (v1 - v0 > 0.6) (ctx.retaining = ctx.retaining || []).push({ x: c[0], z: c[1], tx, tz, fx: nx * (low ? 1 : -1), fz: nz * (low ? 1 : -1), w: 1.0, d: v1 - v0, top: Math.max(A.top, Bn.top), frontY: fy, allowTall: true });   // (no room to step it: a roadway on both sides)
        (ctx.keepClear = ctx.keepClear || []).push([c[0], c[1], 2.6]); }
      n++; }
    if (n) out.push({ at: [+mx.toFixed(1), +mz.toFixed(1)], slices: n });
  }
  ctx.goreWallStats = out; return out;
}
/**
 * Stands a building on the terrain: runs fn(base, ground) with the Builder raised to `base` (default: the lowest ground
 * on the footprint's outline, so every wall reaches the ground and the uphill walls are simply shorter; kitWalls starts
 * each wall at its own ground), with a foundation under it. Heights inside fn are local: top = roofAbs - base.
 */
export function sited(ctx, ring, fn, opts = {}) {
  if (!ctx.terrain) return fn(0, { min: 0, max: 0, mean: 0 });
  const g = ringGround(ctx, ring); const plan = ctx.wallPlans ? ctx.wallPlans.get(ringKey(ensureCCW(ring))) : null; const base = opts.base ?? (plan ? Math.min(plan.minLevel, g.min) : g.min);
  const prevName = ctx.siteName; ctx.siteName = opts.id || ring.id || (plan && plan.name) || null;
  try { return ctx.onGround(ensureCCW(ring), () => fn(base, g), { mode: base, plinth: { material: opts.plinth || 'concrete', surface: 'concrete', cap: false } }); } finally { ctx.siteName = prevName; }   // no cap: it would be a drawn floor inside the building (the roof-skin check sees it from the attic)
}
/** Runs fn(groundY) with the Builder on the ground at (x, z) (highest ground within r: nothing built there is buried). */
export function atGround(ctx, x, z, fn, r = 0.4, mode = 'max') { return ctx.terrain ? ctx.onGround([x, z, r], fn, { mode }) : fn(0); }
/** Ladder on a wall from the ground at its foot up to the absolute height `topAbs`. */
export function groundLadder(ctx, x, z, nx, nz, topAbs) { return atGround(ctx, x + nx * 0.5, z + nz * 0.5, (g) => wallLadder(ctx, x, z, nx, nz, topAbs - g), 0.5); }
/**
 * Chain-link fence that follows the ground (src/world/landmarks.js `fence` is flat): posts every `every` m standing on
 * the terrain, mesh panels between them, a mesh collision box per panel. opts as fence(): h, black, screen, every, gaps.
 */
export function hillFence(ctx, pts, opts = {}) {
  const { B } = ctx; const h = opts.h || 1.8, every = opts.every || 3.0, gaps = opts.gaps || []; const gy = (x, z) => ctx.groundY(x, z) + (opts.lift || 0);
  const mesh = B.v('chainlink'), posts = B.v(opts.black ? 'blackMetal' : 'galv'), col = B.c('metal:mesh'); let dist = 0;
  const inGap = (d) => gaps.some(([a, b]) => d > a && d < b);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    const cuts = [0, L]; for (const [g0, g1] of gaps) for (const g of [g0 - dist, g1 - dist]) if (g > 0 && g < L) cuts.push(g); cuts.sort((x, y) => x - y);
    for (let k = 0; k < cuts.length - 1; k++) {
      const c0 = cuts[k], c1 = cuts[k + 1]; if (c1 - c0 < 0.05 || inGap(dist + (c0 + c1) / 2)) continue; const n = Math.max(1, Math.round((c1 - c0) / every));
      for (let q = 0; q <= n; q++) { const u = c0 + (c1 - c0) * q / n, x = a[0] + tx * u, z = a[1] + tz * u; posts.cyl(x, gy(x, z) - 0.2, z, 0.035, 0.035, h + 0.24, 6, 1, true); }
      for (let q = 0; q < n; q++) {
        const u0 = c0 + (c1 - c0) * q / n, u1 = c0 + (c1 - c0) * (q + 1) / n; const x0 = a[0] + tx * u0, z0 = a[1] + tz * u0, x1 = a[0] + tx * u1, z1 = a[1] + tz * u1; const y0 = gy(x0, z0), y1 = gy(x1, z1);
        mesh.quad([x0, y0 + 0.05, z0], [x0, y0 + h, z0], [x1, y1 + h, z1], [x1, y1 + 0.05, z1], [u0 * 2, 0.1], [u0 * 2, h * 2], [u1 * 2, h * 2], [u1 * 2, 0.1]);
        if (opts.screen) B.v('windscreen').quad([x0 + tz * 0.02, y0 + 0.1, z0 - tx * 0.02], [x0 + tz * 0.02, y0 + opts.screen, z0 - tx * 0.02], [x1 + tz * 0.02, y1 + opts.screen, z1 - tx * 0.02], [x1 + tz * 0.02, y1 + 0.1, z1 - tx * 0.02], [u0 * 4, 0], [u0 * 4, opts.screen * 4], [u1 * 4, opts.screen * 4], [u1 * 4, 0]);
        posts.tube([x0, y0 + h, z0], [x1, y1 + h, z1], 0.025, 5);
        const lo = Math.min(y0, y1) - 0.3, hi = Math.max(y0, y1) + h; col.box((x0 + x1) / 2, (lo + hi) / 2, (z0 + z1) / 2, u1 - u0, hi - lo, 0.08, Math.atan2(-tz, tx));
      }
    }
    dist += L;
  }
}
/**
 * Lays whatever fn() builds (at y = 0, flat) onto the sloping ground around (x, z): every vertex written by fn, visual
 * and collision, is raised by the ground plane fitted through the footprint (radius r). A vertical shear, so walls stay
 * vertical: right for cars, benches and other props up to ~12 % of grade. Returns fn's result.
 */
export function onSlope(ctx, x, z, r, fn) {
  if (!ctx.terrain) return fn();
  const B = ctx.B; const marks = []; for (const m of [B.visual, B.collision]) for (const [, bk] of m) marks.push([bk, bk.pos.length]);
  const seenV = new Set(B.visual.keys()), seenC = new Set(B.collision.keys());
  const prev = B.off.y; B.off.y = 0; ctx.groundDepth = (ctx.groundDepth || 0) + 1; const nP = (ctx.props || []).length; const nS = ctx.shrubs.length;
  let out; try { out = fn(); } finally { B.off.y = prev; ctx.groundDepth--; }
  const g = ctx.groundY, y0 = g(x, z), gx = (g(x + r, z) - g(x - r, z)) / (2 * r), gz = (g(x, z + r) - g(x, z - r)) / (2 * r);
  const lift = (bk, from) => { const P = bk.pos; for (let k = from; k < P.length; k += 3) P[k + 1] += y0 + gx * (P[k] - x) + gz * (P[k + 2] - z); };
  for (const [bk, from] of marks) lift(bk, from);
  for (const [k, bk] of B.visual) if (!seenV.has(k)) lift(bk, 0);
  for (const [k, bk] of B.collision) if (!seenC.has(k)) lift(bk, 0);
  for (let i = nS; i < ctx.shrubs.length; i++) { const sh = ctx.shrubs[i]; sh[1] += y0 + gx * (sh[0] - x) + gz * (sh[2] - z); }
  for (let i = nP; i < (ctx.props || []).length; i++) { const p = ctx.props[i]; p.y = ctx.terrain.minIn(p.x, p.z, Math.hypot(p.sx, p.sz) / 2); }   // map check: base = lowest ground under the prop
  return out;
}
export { edgeFrame, quadFacing, wallRect, fbox, BRICK_S, ensureCCW, signedArea, pointInRing, mulberry32, makeCanvas, canvasTexture };

/**
 * A mass of clipped evergreens (hedge wall / tree belt): leaf-skinned block with a broken top line of crowns, solid for
 * players and bullets (collision reaches the crowns; shelves inside so no mechanic finds standing room in it).
 * (x, z) centre, y base, w along `rot`, d deep, h tall.
 */
export function hedgeMass(ctx, x, z, y, w, d, h, rot, seed = 1, opt = {}) {   // opt.oneRow: a single row of columns of radius <= d / 2 (a narrow strip)
  const { B } = ctx; const hb = B.v('maHedge', true); const r = mulberry32(Math.abs(Math.round(x * 31 + z * 17 + seed)) + 5); const c = Math.cos(rot), s = Math.sin(rot);
  // An overgrown bank, not a clipped wall: a dark core (so nothing shows through) wrapped in two staggered rows of bushy
  // columns of different girth, height and tone. The columns swell 0.3-0.5 m past the core on both faces, so the front is
  // lumpy in depth; their tops are steep cones (nothing that looks like a ledge). Collision is the plain block below.
  hb.setColor(0.42, 0.48, 0.4); hb.box(x, y + h * 0.42 - 0.3, z, w, h * 0.84 + 0.6, d * (opt.oneRow ? 0.7 : 0.5), rot, 1 / 3.1);
  const n = Math.max(2, Math.round(w / 0.95));
  for (let k = 0; k < n; k++) for (const row of (opt.oneRow ? [0] : [-1, 1])) {
    if (row > 0 && r() < 0.12) continue;
    const u = -w / 2 + (k + 0.5 + (row > 0 ? 0.5 : 0)) * w / n + (r() - 0.5) * 0.5, v = row * (d * 0.24 + r() * 0.22); if (Math.abs(u) > w / 2 + 0.2) continue;
    const px = x + u * c + v * s, pz = z - u * s + v * c; const R = opt.oneRow ? d / 2 * (0.88 + r() * 0.12) : Math.min(0.7 + r() * 0.5, Math.max(0.35, d * 0.55)), H = Math.max(0.8, h * (0.72 + r() * 0.3)), cone = Math.min(1.5 + r() * 0.9, H * 0.45); /* short yard hedges get short crowns: a negative section height gives NaN normals, and one NaN pixel blacks out the whole frame through the bloom pass */ const t = 0.78 + r() * 0.4, wm = r() * 0.12;
    hb.setColor(t * (0.92 + wm), t, t * (0.9 - wm));
    hb.cyl(px, y - 0.3, pz, R * 0.8, R, (H - cone) * 0.45 + 0.3, 7, 1 / 3.1, false);                          // skirt
    hb.cyl(px, y + (H - cone) * 0.45, pz, R, R * 0.92, (H - cone) * 0.55, 7, 1 / 3.1, false);                  // body
    hb.cyl(px, y + H - cone, pz, R * 0.92, 0.22, cone, 7, 1 / 3.1, true);                                      // steep crown
  }
  hb.setColor(1, 1, 1);
  // (a tall mass is solid up into its crowns; a hedge under 3 m ends at its clipped top: no invisible wall over a waist-high row)
  const ch = h < 3 ? h + 0.35 : h + 1.6;
  B.c('wood').box(x, y - 0.2 + (ch + 0.4) / 2, z, w, ch + 0.4, opt.oneRow ? d : d + 0.3, rot);
  for (let yy = 0.55; yy < ch - 0.2; yy += 0.75) B.c('wood').box(x, y + yy, z, w - 0.1, 0.06, d - 0.1, rot);
}
