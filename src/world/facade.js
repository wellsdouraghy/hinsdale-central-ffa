// Facade kit for the school: real depth instead of flat textures. Windows are recessed with brick returns,
// aluminium frames, mullions, limestone sills and soldier-course lintels; walls get a plinth, pilasters, band
// courses, a limestone/metal parapet with thickness, storefront doors with canopies, louvers, downspouts,
// wall lights, ground contact shading and planting beds. Everything lands in the shared merged buckets.

export const BRICK_S = 1 / 2.2;     // brick texture covers 2.2 m (29 courses of 76 mm)
const STONE_S = 1 / 3.0;

// local frame of a wall edge: u along the edge, y up, "out" along the outward normal
export function edgeFrame(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-6;
  const tx = dx / L, tz = dz / L, nx = tz, nz = -tx;
  return { L, tx, tz, nx, nz, rotY: Math.atan2(-tz, tx), ax, az, P: (u, y, out = 0) => [ax + tx * u + nx * out, y, az + tz * u + nz * out] };
}
export function quadFacing(b, p0, p1, p2, p3, n, uv) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) b.quad(p0, p1, p2, p3, uv && uv[0], uv && uv[1], uv && uv[2], uv && uv[3]);
  else b.quad(p0, p3, p2, p1, uv && uv[0], uv && uv[3], uv && uv[2], uv && uv[1]);
}
// rectangle on the wall plane (offset out), facing outward; uvr = [u0, v0, u1, v1]
export function wallRect(b, F, u0, u1, y0, y1, out, uvr) {
  const r = uvr || [u0, y0, u1, y1];
  b.quad(F.P(u0, y0, out), F.P(u0, y1, out), F.P(u1, y1, out), F.P(u1, y0, out), [r[0], r[1]], [r[0], r[3]], [r[2], r[3]], [r[2], r[1]]);
}
// box standing off the wall: spans u0..u1, y0..y1, out o0..o1 (o1 > o0). Draws front, both sides, top, bottom.
// s = uv metres->uv scale, uOff shifts u for continuous brick coursing.
export function fbox(b, F, u0, u1, y0, y1, o0, o1, s = 1, uOff = 0, faces = 'fstb') {
  const n = [F.nx, 0, F.nz], t = [F.tx, 0, F.tz];
  if (faces.includes('f')) wallRect(b, F, u0, u1, y0, y1, o1, [(uOff + u0) * s, y0 * s, (uOff + u1) * s, y1 * s]);
  if (faces.includes('s')) {
    const d = (o1 - o0) * s;
    quadFacing(b, F.P(u0, y0, o0), F.P(u0, y1, o0), F.P(u0, y1, o1), F.P(u0, y0, o1), [-t[0], 0, -t[2]], [[0, y0 * s], [0, y1 * s], [d, y1 * s], [d, y0 * s]]);
    quadFacing(b, F.P(u1, y0, o0), F.P(u1, y1, o0), F.P(u1, y1, o1), F.P(u1, y0, o1), t, [[0, y0 * s], [0, y1 * s], [d, y1 * s], [d, y0 * s]]);
  }
  if (faces.includes('t')) quadFacing(b, F.P(u0, y1, o0), F.P(u1, y1, o0), F.P(u1, y1, o1), F.P(u0, y1, o1), [0, 1, 0], [[u0 * s, 0], [u1 * s, 0], [u1 * s, (o1 - o0) * s], [u0 * s, (o1 - o0) * s]]);
  if (faces.includes('b')) quadFacing(b, F.P(u0, y0, o0), F.P(u1, y0, o0), F.P(u1, y0, o1), F.P(u0, y0, o1), [0, -1, 0], [[u0 * s, 0], [u1 * s, 0], [u1 * s, (o1 - o0) * s], [u0 * s, (o1 - o0) * s]]);
  // keep n referenced for clarity of orientation
  return n;
}
function brickRect(b, F, u0, u1, y0, y1, uOff, out = 0) {
  if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
  wallRect(b, F, u0, u1, y0, y1, out, [(uOff + u0) * BRICK_S, y0 * BRICK_S, (uOff + u1) * BRICK_S, y1 * BRICK_S]);
}

// ------------------------------------------------------------------------------------------ styles
const CLASSIC = { kind: 'class', bay: 4.6, frame: 'frame', top: 'stone', tint: [1.0, 1.0, 1.0], beds: true };
export const STYLES = {
  main: CLASSIC,
  ss: { kind: 'modern', bay: 5.0, frame: 'frameAlu', top: 'panel', tint: [1.05, 1.0, 0.93], beds: true },
  c12: { kind: 'modern', bay: 5.0, frame: 'frameAlu', top: 'panel', tint: [1.05, 1.0, 0.93], beds: true },
  e11: { kind: 'class', bay: 4.8, frame: 'frame', top: 'stone', tint: [0.97, 0.93, 0.9], beds: true },
  addition: { kind: 'lowmod', bay: 4.2, frame: 'frameAlu', top: 'panel', tint: [1.06, 1.02, 0.96], beds: true },
  annex: { kind: 'lowmod', bay: 4.4, frame: 'frame', top: 'stone', tint: [0.98, 0.93, 0.88], beds: true },
  low7: { kind: 'lowmod', bay: 4.6, frame: 'frame', top: 'stone', tint: [0.98, 0.94, 0.9] },
  low8: { kind: 'lowmod', bay: 4.6, frame: 'frame', top: 'stone', tint: [0.98, 0.94, 0.9] },
  low7b: { kind: 'lowmod', bay: 4.6, frame: 'frameAlu', top: 'panel', tint: [1.04, 1.0, 0.94] },
  lowN: { kind: 'service', bay: 6.0, frame: 'frame', top: 'stone', tint: [0.96, 0.88, 0.82] },
  lowE: { kind: 'service', bay: 6.0, frame: 'frame', top: 'stone', tint: [0.96, 0.88, 0.82] },
  link: { kind: 'service', bay: 6.0, frame: 'frame', top: 'stone', tint: [0.96, 0.9, 0.85], plain: true },
  gymW: { kind: 'gym', bay: 6.4, frame: 'frame', top: 'stone', tint: [1.0, 0.95, 0.88], clerestory: true },
  gymE: { kind: 'gym', bay: 6.6, frame: 'frame', top: 'stone', tint: [0.97, 0.84, 0.75] },
  fieldhouse: { kind: 'gym', bay: 6.2, frame: 'frameAlu', top: 'panel', tint: [0.98, 0.86, 0.77], clerestory: true },
  fieldhouseW: { kind: 'gym', bay: 6.2, frame: 'frame', top: 'stone', tint: [0.98, 0.86, 0.77] },
  southeast: { kind: 'gym', bay: 7.0, frame: 'frame', top: 'stone', tint: [0.93, 0.8, 0.72], tall: true },
  service: { kind: 'service', bay: 5.5, frame: 'frame', top: 'stone', tint: [0.97, 0.88, 0.8] },
};

let roomCounter = 0;
const setTint = (b, t, k = 1) => b.setColor(t[0] * k, t[1] * k, t[2] * k);

// ------------------------------------------------------------------------------------------ openings
function glassPane(B, F, u0, u1, y0, y1, out, kind) {
  roomCounter += 3;
  // uv.x must increase along cross(up, normal) = -edge direction
  wallRect(B.v('glassInt'), F, u0, u1, y0, y1, out, [roomCounter + 1, kind * 2, roomCounter, kind * 2 + 1]);
}

function windowUnit(ctx, F, u0, u1, y0, y1, st, tint, uOff, kind, opts = {}) {
  const { B } = ctx; const D = 0.22; const fr = B.v(st.frame);
  const brick = B.v('brick', true); setTint(brick, tint, 0.9);
  // brick returns (jambs + head)
  const t = [F.tx, 0, F.tz];
  quadFacing(brick, F.P(u0, y0, 0), F.P(u0, y1, 0), F.P(u0, y1, -D), F.P(u0, y0, -D), t, [[0, y0 * BRICK_S], [0, y1 * BRICK_S], [D * BRICK_S, y1 * BRICK_S], [D * BRICK_S, y0 * BRICK_S]]);
  quadFacing(brick, F.P(u1, y0, 0), F.P(u1, y1, 0), F.P(u1, y1, -D), F.P(u1, y0, -D), [-t[0], 0, -t[2]], [[0, y0 * BRICK_S], [0, y1 * BRICK_S], [D * BRICK_S, y1 * BRICK_S], [D * BRICK_S, y0 * BRICK_S]]);
  quadFacing(brick, F.P(u0, y1, 0), F.P(u1, y1, 0), F.P(u1, y1, -D), F.P(u0, y1, -D), [0, -1, 0], [[u0 * BRICK_S, 0], [u1 * BRICK_S, 0], [u1 * BRICK_S, D * BRICK_S], [u0 * BRICK_S, D * BRICK_S]]);
  setTint(brick, tint);
  // soldier-course lintel (bricks on end): same texture rotated 90 degrees, a hair proud of the wall
  if (!opts.noLintel) {
    setTint(brick, tint, 0.93);
    const lh = 0.23, lo = 0.03;
    brick.quad(F.P(u0 - 0.12, y1, lo), F.P(u0 - 0.12, y1 + lh, lo), F.P(u1 + 0.12, y1 + lh, lo), F.P(u1 + 0.12, y1, lo),
      [0, (uOff + u0) * BRICK_S], [lh * BRICK_S, (uOff + u0) * BRICK_S], [lh * BRICK_S, (uOff + u1) * BRICK_S], [0, (uOff + u1) * BRICK_S]);
    quadFacing(brick, F.P(u0 - 0.12, y1, 0), F.P(u1 + 0.12, y1, 0), F.P(u1 + 0.12, y1, lo), F.P(u0 - 0.12, y1, lo), [0, -1, 0]);
    quadFacing(brick, F.P(u0 - 0.12, y1 + lh, 0), F.P(u1 + 0.12, y1 + lh, 0), F.P(u1 + 0.12, y1 + lh, lo), F.P(u0 - 0.12, y1 + lh, lo), [0, 1, 0]);
    setTint(brick, tint);
  }
  // limestone sill, projecting and sloped
  const ls = B.v('limestone'); const sh = 0.11;
  quadFacing(ls, F.P(u0 - 0.06, y0 - 0.03, 0.075), F.P(u1 + 0.06, y0 - 0.03, 0.075), F.P(u1 + 0.06, y0 + 0.015, -D), F.P(u0 - 0.06, y0 + 0.015, -D), [0, 1, 0.2], [[u0 * STONE_S, 0], [u1 * STONE_S, 0], [u1 * STONE_S, 0.1], [u0 * STONE_S, 0.1]]);
  fbox(ls, F, u0 - 0.06, u1 + 0.06, y0 - sh, y0 - 0.03, 0, 0.075, STONE_S, 0, 'fsb');
  // glazing
  const go = -D + 0.035; const kindRow = kind;
  wallRect(fr, F, u0, u1, y0, y1, -D);
  glassPane(B, F, u0 + 0.04, u1 - 0.04, y0 + 0.04, y1 - 0.04, go, kindRow);
  // frame: perimeter, mullions, transoms (boxes with real depth)
  const fo0 = -D, fo1 = -D + 0.1, fw = 0.06;
  fbox(fr, F, u0, u0 + fw, y0, y1, fo0, fo1, 1, 0, 'fs'); fbox(fr, F, u1 - fw, u1, y0, y1, fo0, fo1, 1, 0, 'fs');
  fbox(fr, F, u0, u1, y0, y0 + fw, fo0, fo1, 1, 0, 'ft'); fbox(fr, F, u0, u1, y1 - fw, y1, fo0, fo1, 1, 0, 'fb');
  const w = u1 - u0, hh = y1 - y0; const nm = Math.max(1, Math.round(w / (opts.module || 1.15)));
  for (let i = 1; i < nm; i++) { const u = u0 + (w * i) / nm; fbox(fr, F, u - 0.028, u + 0.028, y0 + fw, y1 - fw, fo0, fo1 + 0.015, 1, 0, 'fs'); }
  const trans = opts.transoms || (hh > 1.7 ? [1 / 3, 2 / 3] : []);
  for (const f of trans) { const y = y0 + hh * f; fbox(fr, F, u0 + fw, u1 - fw, y - 0.026, y + 0.026, fo0, fo1, 1, 0, 'ftb'); }
  // dirt streaks washing down from the sill
  if (!opts.noStreak) wallRect(B.v('wallDecal'), F, u0 - 0.1, u1 + 0.1, y0 - sh - 1.25, y0 - sh, 0.006, [0, 0, Math.max(1, Math.round(w / 2.5)), 1]);
}

function doorUnit(ctx, F, uc, st, tint, uOff, opts = {}) {
  const { B } = ctx; const D = 0.38; const fr = B.v(st.frame); const wd = opts.wide ? 3.7 : 2.2, hd = 2.2, ht = 2.95;
  const u0 = uc - wd / 2, u1 = uc + wd / 2;
  // returns in frame-coloured metal
  const t = [F.tx, 0, F.tz];
  quadFacing(fr, F.P(u0, 0, 0), F.P(u0, ht, 0), F.P(u0, ht, -D), F.P(u0, 0, -D), t);
  quadFacing(fr, F.P(u1, 0, 0), F.P(u1, ht, 0), F.P(u1, ht, -D), F.P(u1, 0, -D), [-t[0], 0, -t[2]]);
  quadFacing(fr, F.P(u0, ht, 0), F.P(u1, ht, 0), F.P(u1, ht, -D), F.P(u0, ht, -D), [0, -1, 0]);
  const go = -D + 0.03, fo0 = -D, fo1 = -D + 0.11, fw = 0.07;
  wallRect(fr, F, u0, u1, 0, ht, -D);                                             // opaque backing behind the whole opening
  fbox(fr, F, u0, u0 + fw, 0, ht, fo0, fo1, 1, 0, 'fs'); fbox(fr, F, u1 - fw, u1, 0, ht, fo0, fo1, 1, 0, 'fs');
  fbox(fr, F, u0, u1, ht - fw, ht, fo0, fo1, 1, 0, 'fb'); fbox(fr, F, u0, u1, hd, hd + fw, fo0, fo1, 1, 0, 'ftb');
  glassPane(B, F, u0 + fw, u1 - fw, hd + fw, ht - fw, go, 0);                     // transom
  const leaves = opts.wide ? 3 : 2; const lw = (wd - 2 * fw) / leaves;
  const pb = B.v('frameAlu');
  for (let i = 0; i < leaves; i++) {
    const a = u0 + fw + i * lw, b = a + lw;
    glassPane(B, F, a + 0.1, b - 0.1, 0.28, hd - 0.1, go + 0.02, 0);
    fbox(fr, F, a + 0.01, a + 0.1, 0.02, hd, fo0 + 0.02, fo1 - 0.03, 1, 0, 'fs'); fbox(fr, F, b - 0.1, b - 0.01, 0.02, hd, fo0 + 0.02, fo1 - 0.03, 1, 0, 'fs');
    fbox(fr, F, a + 0.1, b - 0.1, 0.02, 0.28, fo0 + 0.02, fo1 - 0.03, 1, 0, 'ft'); fbox(fr, F, a + 0.1, b - 0.1, hd - 0.1, hd, fo0 + 0.02, fo1 - 0.03, 1, 0, 'fb');
    // push bar + pull
    fbox(pb, F, a + 0.14, b - 0.14, 0.98, 1.05, fo1 - 0.03, fo1 + 0.03, 1, 0, 'fstb');
    fbox(pb, F, a + 0.16, a + 0.2, 0.98, 1.05, fo1 - 0.05, fo1 + 0.03, 1, 0, 's'); fbox(pb, F, b - 0.2, b - 0.16, 0.98, 1.05, fo1 - 0.05, fo1 + 0.03, 1, 0, 's');
  }
  // threshold slab + canopy with fascia + recessed light
  fbox(B.v('concrete'), F, u0 - 0.6, u1 + 0.6, 0, 0.09, -D, 1.7, STONE_S, 0, 'fst');
  if (st.top !== 'none' && !opts.noCanopy) {
    const cb = B.v(st.top === 'panel' ? 'whitePanel' : 'frame'); const cw = 0.75;
    fbox(cb, F, u0 - cw, u1 + cw, 3.08, 3.36, 0, 1.75, 1, 0, 'fstb');
    fbox(B.v('lightEmit'), F, uc - 0.35, uc + 0.35, 3.05, 3.08, 0.6, 1.1, 1, 0, 'fsb');
    const c = F.P(uc, 3.22, 0.9); B.c('metal').box(c[0], 3.22, c[2], wd + 2 * cw, 0.28, 1.75, F.rotY);
  }
  // address / room plate
  fbox(B.v('frameAlu'), F, u1 + 0.22, u1 + 0.52, 1.5, 1.72, 0, 0.012, 1, 0, 'f');
}

// hand-placed storefront door (the wall in front must already have an opening, or the door sits in a vestibule)
export function doorFromKit(ctx, F, uc, st, wide = false) { doorUnit(ctx, F, uc, st, st.tint, 0, { wide }); }

function louver(ctx, F, u0, u1, y0, y1) {
  const { B } = ctx;
  fbox(B.v('frame'), F, u0 - 0.05, u1 + 0.05, y0 - 0.05, y1 + 0.05, 0, 0.035, 1, 0, 'fstb');
  wallRect(B.v('louver'), F, u0, u1, y0, y1, 0.04, [0, 0, 1, (y1 - y0) / 0.42]);
}
function downspout(ctx, F, u, yTop) {
  const fr = ctx.B.v('frame');
  fbox(fr, F, u - 0.055, u + 0.055, 0.35, yTop, 0.02, 0.13, 1, 0, 'fs');
  fbox(fr, F, u - 0.11, u + 0.11, yTop, yTop + 0.3, 0.0, 0.2, 1, 0, 'fstb');
  fbox(fr, F, u - 0.055, u + 0.055, 0.18, 0.35, 0.02, 0.3, 1, 0, 'fstb');
  for (let y = 1.2; y < yTop; y += 2.4) fbox(fr, F, u - 0.075, u + 0.075, y, y + 0.05, 0, 0.14, 1, 0, 'fstb');
}
function wallPack(ctx, F, u, y) {
  const { B } = ctx;
  fbox(B.v('blackMetal'), F, u - 0.17, u + 0.17, y, y + 0.22, 0, 0.14, 1, 0, 'fst');
  fbox(B.v('lightEmit'), F, u - 0.15, u + 0.15, y - 0.012, y, 0.01, 0.13, 1, 0, 'b');
}

// ------------------------------------------------------------------------------------------ one wall
// y0 > 0 means the lower part is hidden behind a lower neighbouring wing (interior step wall).
export function facade(ctx, F, y0, h, styleName, uOff, rnd, opts = {}) {
  const { B } = ctx; const L = F.L;
  const st = STYLES[styleName] || CLASSIC; const tint = st.tint;
  const brick = B.v('brick', true); setTint(brick, tint);
  const bandH = st.top === 'panel' ? 1.15 : 0.95; const bandY = h - bandH - 0.3;
  // ---- parapet: band + coping with real thickness and drip edges
  if (st.top === 'panel') {
    const wp = B.v('whitePanel');
    fbox(wp, F, -0.04, L + 0.04, bandY, h - 0.3, 0, 0.07, 1, 0, 'fsb');
    fbox(B.v('panelGray'), F, -0.04, L + 0.04, bandY + bandH * 0.5 - 0.012, bandY + bandH * 0.5 + 0.012, 0.07, 0.09, 1, 0, 'ftb');
    for (let u = 1.2; u < L; u += 2.4) fbox(B.v('panelGray'), F, u - 0.008, u + 0.008, bandY, h - 0.3, 0.07, 0.09, 1, 0, 'fs');
    fbox(B.v('frameAlu'), F, -0.1, L + 0.1, h - 0.3, h + 0.03, 0, 0.14, 1, 0, 'fsb');
  } else {
    const ls = B.v('limestone');
    fbox(ls, F, -0.03, L + 0.03, bandY, h - 0.3, 0, 0.05, STONE_S, uOff, 'fsb');
    fbox(ls, F, -0.05, L + 0.05, bandY - 0.09, bandY, 0, 0.085, STONE_S, uOff, 'fstb');   // moulded lower edge
    fbox(B.v('frame'), F, -0.1, L + 0.1, h - 0.3, h + 0.03, 0, 0.13, 1, 0, 'fsb');
  }
  const wallTop = bandY - (st.top === 'panel' ? 0 : 0.09);
  if (y0 > 0.01) { brickRect(brick, F, 0, L, y0, wallTop, uOff); return; }

  // ---- plinth (precast base course with a chamfered top)
  const pl = B.v('concrete'); const pY = 0.52;
  // horizontal courses are interrupted at doors
  const doorSpans = [];
  const runs = (a0 = 0, b0 = L) => { const out = []; let u = a0; for (const [a, b] of doorSpans.slice().sort((x, y2) => x[0] - y2[0])) { if (a > u) out.push([u, Math.min(a, b0)]); u = Math.max(u, b); } if (u < b0) out.push([u, b0]); return out; };
  // ground contact shading
  B.v('groundDecal').quad(F.P(0, 0.025, 0.02), F.P(L, 0.025, 0.02), F.P(L, 0.025, 1.5), F.P(0, 0.025, 1.5), [0, 0], [1, 0], [1, 1], [0, 1]);

  const openings = [];      // rows: [yA, yB, [[u0,u1,type,oy0,oy1], ...]]
  const piers = [];         // [uCentre, width, out]
  const extras = [];        // deferred detail callbacks
  const m = L > 6 ? 1.3 : 0.6;
  // corner piers: hide the razor edge where two walls meet
  if (L > 3.2 && !st.plain) { piers.push([0.3, 0.6, 0.1]); piers.push([L - 0.3, 0.6, 0.1]); }
  const usable = L - 2 * m; const nb = Math.max(0, Math.floor(usable / st.bay)); const bay = nb ? usable / nb : 0;
  const doorBay = nb >= 1 && ((st.kind === 'gym' || st.kind === 'service') ? L > 15 : L > 26) && !st.plain ? Math.floor(nb * (0.3 + 0.4 * rnd())) : -1;

  if (st.plain || L < 4.4 || nb < 1) {
    // too short for a bay: plain brick (maybe a slit window)
    if (!st.plain && L > 2.6 && h > 7 && st.kind !== 'gym') openings.push([1.4, 3.1, [[L / 2 - 0.45, L / 2 + 0.45, 'win']]]);
  } else if (st.kind === 'class') {
    const r1 = [], r2 = []; const two = wallTop >= 7.4;
    const yA0 = 1.0, yA1 = 3.2, yB0 = h * 0.5 + 0.35, yB1 = Math.min(h * 0.5 + 2.85, wallTop - 0.5);
    for (let i = 0; i < nb; i++) {
      const c = m + (i + 0.5) * bay;
      if (i === doorBay) { r1.push([c - 1.1, c + 1.1, 'door']); extras.push(() => wallPack(ctx, F, c + 2.0, 2.9)); }
      else r1.push([c - (bay - 1.75) / 2, c + (bay - 1.75) / 2, 'win', 1]);
      if (two) r2.push([c - (bay - 0.75) / 2, c + (bay - 0.75) / 2, 'win', 1]);
      if (i > 0) piers.push([m + i * bay, 0.62, 0.11]);
      if (st.beds && i !== doorBay) extras.push(() => bed(ctx, F, c, bay - 1.2));
    }
    openings.push([yA0, yA1, r1]); if (two) openings.push([yB0, yB1, r2]);
    // continuous limestone sill courses + downspouts on some piers
    extras.push(() => { const ls = B.v('limestone'); for (const [a, b] of runs()) fbox(ls, F, a, b, yA0 - 0.34, yA0 - 0.11, 0, 0.03, STONE_S, uOff, 'fstb'); if (two) fbox(ls, F, 0, L, yB0 - 0.34, yB0 - 0.11, 0, 0.03, STONE_S, uOff, 'ftb'); });
    for (let i = 3; i < nb; i += 4) { const u = m + i * bay + 0.48; extras.push(() => downspout(ctx, F, u, bandY - 0.4)); }
  } else if (st.kind === 'modern') {
    // tall glazed bays: two storeys of glass with an insulated metal spandrel between
    const r1 = [], r2 = []; const yA0 = 0.85, yA1 = h * 0.5 - 0.55, yB0 = h * 0.5 + 0.35, yB1 = wallTop - 0.55;
    for (let i = 0; i < nb; i++) {
      const c = m + (i + 0.5) * bay; const a = c - (bay - 1.3) / 2, b = c + (bay - 1.3) / 2;
      if (i === doorBay) r1.push([c - 1.1, c + 1.1, 'door']); else r1.push([a, b, 'win', 0]);
      r2.push([a, b, 'win', 1]);
      if (i !== doorBay) extras.push(() => { const sp = B.v('panelGray'); fbox(sp, F, a, b, yA1 + 0.23, yB0 - 0.11, 0, 0.03, 1, 0, 'fstb'); fbox(B.v('frameAlu'), F, a - 0.03, b + 0.03, yA1 + 0.2, yA1 + 0.23, 0, 0.05, 1, 0, 'fstb'); });
      if (st.beds && i !== doorBay) extras.push(() => bed(ctx, F, c, bay - 1.6));
    }
    openings.push([yA0, yA1, r1]); openings.push([yB0, yB1, r2]);
    for (let i = 2; i < nb; i += 3) { const u = m + i * bay; extras.push(() => downspout(ctx, F, u, bandY - 0.3)); }
  } else if (st.kind === 'lowmod') {
    const r1 = []; const yA0 = 0.95, yA1 = Math.min(3.4, wallTop - 0.7);
    for (let i = 0; i < nb; i++) {
      const c = m + (i + 0.5) * bay;
      if (i === doorBay) r1.push([c - 1.1, c + 1.1, 'door']); else r1.push([c - (bay - 1.5) / 2, c + (bay - 1.5) / 2, 'win', st.frame === 'frameAlu' ? 0 : 1]);
      if (i > 0 && st.top === 'stone') piers.push([m + i * bay, 0.55, 0.1]);
      if (st.beds && i !== doorBay) extras.push(() => bed(ctx, F, c, bay - 1.4));
    }
    openings.push([yA0, yA1, r1]);
  } else {
    // gym / field house / auditorium / service: big brick boxes articulated with tall pilasters and bands
    const r1 = [], rc = [];
    for (let i = 1; i < nb; i++) piers.push([m + i * bay, st.tall ? 1.1 : 0.9, 0.14]);
    for (let i = 0; i < nb; i++) {
      const c = m + (i + 0.5) * bay;
      if (i === doorBay) { r1.push([c - 1.1, c + 1.1, 'door']); extras.push(() => wallPack(ctx, F, c - 1.9, 3.0)); }
      else if (rnd() < 0.3 && h > 6) extras.push(() => louver(ctx, F, c - 1.1, c + 1.1, 2.7, 3.9));
      else if (st.kind === 'service' && rnd() < 0.5 && h > 4.4) r1.push([c - 1.2, c + 1.2, 'win', 1, 1.5, 2.9]);
      if (st.clerestory && h > 9) rc.push([c - (bay - 1.5) / 2, c + (bay - 1.5) / 2, 'win', 2]);
      if (st.tall && i !== doorBay) extras.push(() => { setTint(brick, tint, 0.9); fbox(brick, F, c - (bay - 1.7) / 2, c + (bay - 1.7) / 2, 3.6, wallTop - 1.2, -0.0, 0.045, BRICK_S, uOff, 'fstb'); setTint(brick, tint); });
      if (i % 2 === 1) extras.push(() => wallPack(ctx, F, m + i * bay, 4.2));
    }
    if (r1.length) openings.push([0.0, 2.95, r1]);
    if (rc.length) openings.push([wallTop - 3.1, wallTop - 0.9, rc]);
    // precast band course at door-head height and under the clerestory
    if (h > 9) extras.push(() => {
      const ls = B.v('limestone');
      for (const [a, b] of runs()) fbox(ls, F, a, b, 3.5, 3.7, 0, 0.035, STONE_S, uOff, 'fstb');
      fbox(ls, F, 0, L, wallTop - 3.45, wallTop - 3.25, 0, 0.035, STONE_S, uOff, 'ftb');
    });
    for (let i = 1; i < nb; i += 3) { const u = m + i * bay + 0.6; extras.push(() => downspout(ctx, F, u, bandY - 0.3)); }
  }

  // ---- brick field with the openings cut out, row by row
  openings.sort((a, b) => a[0] - b[0]);
  for (const [, , list] of openings) for (const o of list) if (o[2] === 'door') doorSpans.push([o[0], o[1]]);
  for (const [a, b] of runs(-0.05, L + 0.05)) {
    fbox(pl, F, a, b, 0, pY - 0.06, 0, 0.06, STONE_S, uOff, 'fs');
    quadFacing(pl, F.P(a, pY - 0.06, 0.06), F.P(b, pY - 0.06, 0.06), F.P(b, pY, 0), F.P(a, pY, 0), [F.nx, 1, F.nz]);
  }
  let y = pY;
  for (const [ry0, ry1, list] of openings) {
    const span = (o) => (o[2] === 'door' ? [0, 2.95] : [o[4] !== undefined ? o[4] : ry0, o[5] !== undefined ? o[5] : ry1]);
    const lo = Math.max(pY, Math.min(ry0, ...list.map((o) => Math.max(pY, span(o)[0])))), hi = Math.max(ry1, ...list.map((o) => span(o)[1]));
    if (lo > y) brickRect(brick, F, 0, L, y, lo, uOff);
    let u = 0;
    list.sort((a, b) => a[0] - b[0]);
    for (const o of list) {
      const [oy0, oy1] = span(o); const cy0 = Math.max(oy0, lo);
      brickRect(brick, F, u, o[0], lo, hi, uOff);
      if (cy0 > lo) brickRect(brick, F, o[0], o[1], lo, cy0, uOff);
      if (oy1 < hi) brickRect(brick, F, o[0], o[1], oy1, hi, uOff);
      if (o[2] === 'door') {
        // the plinth is interrupted at doors: cover it with the frame-colour threshold returns
        doorUnit(ctx, F, (o[0] + o[1]) / 2, st, tint, uOff);
      } else windowUnit(ctx, F, o[0], o[1], oy0, oy1, st, tint, uOff, o[3] || 0, { module: st.kind === 'modern' ? 1.25 : 1.15, transoms: o[3] === 2 ? [] : undefined, noStreak: o[3] === 2 });
      setTint(brick, tint);
      u = o[1];
    }
    brickRect(brick, F, u, L, lo, hi, uOff);
    y = hi;
  }
  brickRect(brick, F, 0, L, y, wallTop, uOff);
  // ---- pilasters / corner piers (skip where they would cross an opening)
  for (const [uc, w, out] of piers) {
    const a = Math.max(0, uc - w / 2), b = Math.min(L, uc + w / 2);
    let clash = false; for (const [, , list] of openings) for (const o of list) if (a < o[1] + 0.05 && b > o[0] - 0.05) clash = true;
    if (clash) continue;
    fbox(brick, F, a, b, pY - 0.02, wallTop, 0, out, BRICK_S, uOff, 'fs');
    fbox(pl, F, a - 0.04, b + 0.04, 0, pY + 0.04, 0, out + 0.07, STONE_S, uOff, 'fst');
    fbox(B.v('limestone'), F, a - 0.03, b + 0.03, wallTop - 0.16, wallTop, 0, out + 0.04, STONE_S, uOff, 'fstb');
  }
  for (const fn of extras) fn();
  setTint(brick, [1, 1, 1]);
}

// planting bed with mulch and clipped shrubs in front of a bay (only where the ground is lawn)
function bed(ctx, F, uc, len) {
  const p = F.P(uc, 0, 1.0);
  if (ctx.surfaceAt(p[0], p[2]) !== 'grass') return;
  const { B } = ctx; const a = uc - len / 2, b = uc + len / 2;
  B.v('mulch').quad(F.P(a - 0.3, 0.03, 0.08), F.P(b + 0.3, 0.03, 0.08), F.P(b + 0.3, 0.03, 1.75), F.P(a - 0.3, 0.03, 1.75), [a * 0.5, 0], [b * 0.5, 0], [b * 0.5, 0.8], [a * 0.5, 0.8]);
  ctx.shrubs.push([p[0], 0.05, p[2], len, 0.85, F.rotY]);
}

// rooftop mechanical unit that shows above the parapet
export function roofUnit(ctx, x, y, z, rot, rnd) {
  const { B } = ctx; const g = B.v('galv'); const w = 2.4 + rnd() * 1.6, d = 1.6 + rnd() * 0.8, hh = 1.5 + rnd() * 0.7;
  g.box(x, y + hh / 2 + 0.25, z, w, hh, d, rot);
  B.v('frame').box(x, y + 0.12, z, w + 0.2, 0.24, d + 0.2, rot);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const k of [-0.28, 0.28]) B.v('blackMetal').cyl(x + k * w * c, y + hh + 0.25, z - k * w * s, 0.42, 0.42, 0.14, 12, 1, true);
  B.v('louver').box(x + (d / 2 + 0.012) * s, y + hh / 2 + 0.3, z + (d / 2 + 0.012) * c, w * 0.8, hh * 0.55, 0.02, rot, 2.2);
  if (rnd() < 0.5) g.box(x - (w / 2 + 0.9) * c, y + 0.45, z + (w / 2 + 0.9) * s, 1.8, 0.4, 0.5, rot);
  B.c('metal').box(x, y + (hh + 0.4) / 2, z, w, hh + 0.4, d, rot);
}
