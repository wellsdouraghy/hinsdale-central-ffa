// The blocks around Marin Academy: hillside houses north of campus, downtown San Rafael shops and offices to the
// south. Inside the play area every OSM building is solid and stands on the real terrain: footprint from OSM; roof
// height from gen.json (3D-tiles roof samples against the lidar ground round that footprint, tools/terrain.py); storeys
// on the street side, wall material and colour, roof type, storefront, awning, sign text, fences and hedges from
// facades.js (read from Google Street View, tools/streetview.py + facades.py). Nothing is a random skin any more:
// a building Street View cannot see takes the look of its nearest classified neighbour of the same kind.
// Outside the play area only cheap context shells without collision.
import { sited, atGround, onSlope, edgeGround, ringGround, groundLadder, wallTint, WALL_KINDS, ANG, CLAY, makeCanvas, canvasTexture, wallLadder, polyRoof, kitWalls, flatBuilding, hipRoof, minAreaOBB, tileTint, srgb, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, signedArea, pointInRing, mulberry32, SKIN_STUCCO, SKIN_BRICK } from './kit.js';
import * as THREE from 'three';
import { STYLES } from '../../world/facade.js';
import { eaveOverhang } from '../roofs.js';
import { SCHOOL_IDS } from './school.js';
import { FACADES } from './facades.js';

const HOUSE_S = [1 / 4.0, 1 / 2.9];
const STREETS = ['primary', 'secondary', 'secondary_link', 'tertiary', 'residential'];
const lin = (rgb, k = 1) => { const c = srgb(...rgb); return [c[0] * k, c[1] * k, c[2] * k]; };
// OSM buildings that are really sheds / carports under trees or duplicates of hand-built structures
const SKIP = new Set([900888954]);

function simplify(ring, tol = 0.6) {
  // drop tiny jogs so walls do not shatter into slivers (keeps corners sharper than `tol`)
  let r = ensureCCW(ring).slice(); let changed = true;
  while (changed && r.length > 4) {
    changed = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1e-6; const dist = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / L;
      if (dist < tol && r.length > 4) { r.splice(i, 1); changed = true; break; }
    }
  }
  return r;
}

// street side of a footprint: the wall that faces the nearest street (door, garage, storefront, fence go there)
function frontEdge(ctx, ring) {
  let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length;
  let best = null;
  for (const [a, b] of ctx.streetSegs) { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cz - a[1]) * dz) / (dx * dx + dz * dz || 1))); const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(cx - qx, cz - qz); if (!best || d < best.d) best = { d, qx, qz }; }
  if (!best) return null; const ux = (best.qx - cx) / (best.d || 1), uz = (best.qz - cz) / (best.d || 1);
  let pick = null;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.L < 3) continue; const sc = (F.nx * ux + F.nz * uz) * Math.sqrt(F.L); if (!pick || sc > pick.sc) pick = { sc, F, i, a, b }; }
  return pick && pick.sc > 0 ? { ...pick, street: [best.qx, best.qz], dist: best.d } : null;
}
const facesStreet = (ctx, F) => { const m = F.P(F.L / 2, 0, 0); return ctx.streetSegs.some(([a, b, w]) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[2] - a[1]) * dz) / (dx * dx + dz * dz || 1))); const qx = a[0] + dx * t - m[0], qz = a[1] + dz * t - m[2]; const d = Math.hypot(qx, qz); return d < w / 2 + 9 && (qx * F.nx + qz * F.nz) / (d || 1) > 0.6; }); };

// a simple fan palm (Street View: Canary Island date palms and fan palms stand in many front yards here)
function palm(ctx, x, z, big, rnd) {
  atGround(ctx, x, z, () => {
    const { B } = ctx; const H = (big ? 9 : 5.5) + rnd() * 2, r = big ? 0.34 : 0.2;
    B.v('wood').cyl(x, -0.3, z, r * 1.25, r, H + 0.3, 8, 0.6, false); B.c('wood').cyl(x, -0.3, z, r, r, H + 0.3, 6, 1, true);
    const fr = B.v('maFrond'); const n = big ? 14 : 10, Lf = big ? 3.4 : 2.3;
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + rnd() * 0.3, dr = 0.25 + (k % 3) * 0.3; const ca = Math.cos(a), sa = Math.sin(a), w = 0.5;
      const p0 = [x, H, z], p1 = [x + ca * Lf * 0.55, H + 0.9 - dr, z + sa * Lf * 0.55], p2 = [x + ca * Lf, H - 0.4 - dr * 2.2, z + sa * Lf];
      fr.quad([p0[0] - sa * 0.12, p0[1], p0[2] + ca * 0.12], [p0[0] + sa * 0.12, p0[1], p0[2] - ca * 0.12], [p1[0] + sa * w, p1[1], p1[2] - ca * w], [p1[0] - sa * w, p1[1], p1[2] + ca * w], [0, 0], [1, 0], [1, 0.5], [0, 0.5]);
      fr.quad([p1[0] - sa * w, p1[1], p1[2] + ca * w], [p1[0] + sa * w, p1[1], p1[2] - ca * w], [p2[0] + sa * 0.1, p2[1], p2[2] - ca * 0.1], [p2[0] - sa * 0.1, p2[1], p2[2] + ca * 0.1], [0, 0.5], [1, 0.5], [1, 1], [0, 1]); }
    B.c('wood').cyl(x, H - 0.75, z, Lf * 0.98, Lf * 0.98, 1.35, 8, 1, true);   // the crown carries a player (grapple perch): anything you can stand on is solid
  }, 0.4, 'min');
}

// house: wall module in the real material and colour, storeys counted from the street side, the roof at its measured
// height; the lower floors of a house on a slope show on the downhill side and disappear into the hill uphill
function house(ctx, ring, info, rnd, fa, id) {
  const { B } = ctx; const g = ringGround(ctx, ring); const fr = frontEdge(ctx, ring);
  const gF = fr ? edgeGround(ctx, fr.a, fr.b).mean : g.max;
  let top = info.top ?? g.max + info.h;
  // the eyes win over a coarse roof sample; a third 'storey' under a pitched roof is the attic in the gable, not a wall storey
  if (fa.lv) { const walls = fa.lv >= 3 && fa.roof !== 'flat' ? 2 : fa.lv; const sv = gF + walls * 2.9 + (fa.lv >= 3 ? 0.8 : 0.3); if (Math.abs(sv - top) > 1.5 || fa.lv >= 3) top = sv; }
  top = Math.max(top, g.max + 2.6);
  const kind = WALL_KINDS.includes(fa.wall) ? fa.wall : 'stucco'; const col = fa.col || [214, 206, 188]; const tint = wallTint(col).map((v) => v * 1.12), dark = wallTint(col.map((v) => v * 0.84));
  const trim = fa.trim ? lin(fa.trim) : [0.85, 0.84, 0.8];
  const roofTint = fa.roofMat === 'clay_tile' ? CLAY : tileTint(fa.roofCol && fa.roofMat !== 'membrane' ? fa.roofCol.map((v) => Math.max(v, 70)) : info.col);
  sited(ctx, ring, (base) => {
    const eave = top - base; const w = B.v('maW_' + kind, true), pl = B.v('maP_' + kind, true); const tb = B.v('paint', true);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
      const F = edgeFrame(a[0], a[1], b[0], b[1]); const ge = edgeGround(ctx, a, b); const lo = Math.max(0, ge.min - base);
      const n = Math.max(1, Math.round(L / 4)); const rows = Math.max(1, Math.min(3, Math.floor((eave - lo + 0.5) / 2.9))); const yb = Math.max(0, eave - rows * 2.9);
      w.setColor(...tint);
      if (L > 3.2) wallRect(w, F, 0, L, yb, eave, 0, [0, (yb - eave) / 2.9, n, 0]); else { pl.setColor(...tint); wallRect(pl, F, 0, L, yb, eave, 0, [0, (yb - eave) / 2.9, L / 4, 0]); }
      if (yb > 0.02) { pl.setColor(...dark); wallRect(pl, F, 0, L, 0, yb, 0, [0, (0 - eave) / 2.9, L / 4, (yb - eave) / 2.9]); }   // foundation / under-floor wall
      tb.setColor(...trim); fbox(tb, F, -0.06, L + 0.06, eave - 0.22, eave, 0, 0.06, 1, 0, 'fsb');
    }
    w.setColor(1, 1, 1); pl.setColor(1, 1, 1);
    if (fr && fr.F.L > 4.5) {
      const F = fr.F; const garage = fa.garage && F.L > 8; const ud = garage ? F.L * 0.72 : F.L * (0.3 + rnd() * 0.4); const dp = F.P(ud, 0, 0.7);
      atGround(ctx, dp[0], dp[2], () => {   // front door, stoop and porch roof at the street-side ground
        tb.setColor(...trim); fbox(tb, F, ud - 0.62, ud + 0.62, 0.2, 2.45, 0, 0.05, 1, 0, 'fst'); fbox(B.v('frame'), F, ud - 0.5, ud + 0.5, 0.25, 2.35, 0.05, 0.08, 1, 0, 'fst');
        fbox(B.v('concrete'), F, ud - 1.1, ud + 1.1, -0.6, 0.22, 0, 1.3, 1 / 3, 0, 'fst'); const c = F.P(ud, 0, 0.65); B.c('concrete').box(c[0], -0.19, c[2], 2.2, 0.82, 1.3, F.rotY);
        if (fa.porch !== undefined ? fa.porch : true) { fbox(tb, F, ud - 1.3, ud + 1.3, 2.6, 2.76, 0, 1.4, 1, 0, 'fstb'); const pr = F.P(ud, 2.68, 0.7); B.c('wood').box(pr[0], 2.68, pr[2], 2.6, 0.16, 1.4, F.rotY); for (const du of [-1.2, 1.2]) { const q = F.P(ud + du, 0, 1.3); tb.box(q[0], 1.2, q[2], 0.12, 2.8, 0.12, F.rotY); } }
      }, 0.9);
      if (garage) { const ug = F.L * 0.28; const gp2 = F.P(ug, 0, 0.3); atGround(ctx, gp2[0], gp2[2], () => { tb.setColor(...trim); fbox(tb, F, ug - 1.45, ug + 1.45, 0, 2.35, 0, 0.05, 1, 0, 'fst'); tb.setColor(trim[0] * 0.8, trim[1] * 0.8, trim[2] * 0.8); for (let k = 0; k < 4; k++) fbox(tb, F, ug - 1.3, ug + 1.3, 0.06 + k * 0.55, 0.55 + k * 0.55, 0.05, 0.07, 1, 0, 'f'); }, 1.4); }
      tb.setColor(1, 1, 1);
    }
    const o = minAreaOBB(ring); const fillR = Math.abs(signedArea(ring)) / Math.max(1, o.area); const rise = Math.min(Math.max(info.rise || 1.8, fa.roof === 'gable' ? 2.0 : 1.2), 3.2); const ov = (want) => eaveOverhang(ring, ctx.playRings || [], want);   // narrower eaves next to a neighbour: no wedge between two roofs
    if (fa.roof === 'flat' || fa.roof === 'shed') { B.v('roofSat').poly(ring, null, eave + 0.02, (x, z) => [(x - ctx.gen.roofs.minX) / (ctx.gen.roofs.maxX - ctx.gen.roofs.minX), 1 - (z - ctx.gen.roofs.minZ) / (ctx.gen.roofs.maxZ - ctx.gen.roofs.minZ)]); }
    else if (fillR > 0.9) hipRoof(ctx, ring, eave, rise, { fill: true, tint: roofTint, overhang: ov(0.55), gable: fa.roof ? fa.roof === 'gable' : rnd() < 0.35, gableBucket: 'stucco', gableTint: lin(col, 1.05) });
    else polyRoof(ctx, ring, eave, rise, { tint: roofTint, overhang: ov(0.5), fill: true });
    B.c('wood').prism(ring, 0, eave, 1, true);
  });
  if (fr) yard(ctx, ring, fr, fa, rnd, lin(col));
}

// front yard from Street View: fence / hedge along the street side (a gap at the door), palms where they stand
function yard(ctx, ring, fr, fa, rnd, wallCol) {
  const { B } = ctx; const F = fr.F; const set = Math.min(4.2, fr.dist - 5.5); if (set < 1.6 || F.L < 6) return;
  const free = (x, z) => { const s = ctx.surfaceAt(x, z); const pb = ctx.playBounds; return s !== 'asphalt' && x > pb.minX + 2 && x < pb.maxX - 2 && z > pb.minZ + 2 && z < pb.maxZ - 2 && !(ctx.playRings || []).some((r) => pointInRing(x, z, r)) && !(ctx.keepClear || []).some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r); };
  if (fa.fence || fa.hedge) {
    const hH = fa.hedge ? Math.min(fa.hedge, 2.4) : 0; const gap = F.L * 0.5;
    let seg = 0;
    for (let u = 0.5; u + 2.4 <= F.L - 0.4; u += 2.5) {
      if (Math.abs(u + 1.25 - gap) < 1.9) continue; if (hH > 1.1 && seg++ % 4 === 3) continue; /* a tall (solid) hedge keeps a way through every 10 m: no sealed yards */ const m = F.P(u + 1.25, 0, set); if (!free(m[0], m[2]) || !free(...((q) => [q[0], q[2]])(F.P(u, 0, set))) || !free(...((q) => [q[0], q[2]])(F.P(u + 2.5, 0, set)))) continue;
      onSlope(ctx, m[0], m[2], 1.2, () => {
        if (hH > 0.3) { if (hH <= 1.1) ctx.shrubs.push([m[0], 0, m[2], 2.5, hH, F.rotY]); else { const hb = B.v('paint', true); hb.setColor(0.035, 0.085, 0.03).box(m[0], hH / 2 - 0.1, m[2], 2.5, hH + 0.2, 0.9, F.rotY); hb.setColor(0.05, 0.11, 0.04).box(m[0], hH + 0.02, m[2], 2.3, 0.1, 0.7, F.rotY); hb.setColor(1, 1, 1); B.c('wood').box(m[0], hH / 2 - 0.1, m[2], 2.5, hH + 0.2, 0.9, F.rotY); } }
        else if (fa.fence === 'picket') { const pk = B.v('whitePanel'); pk.box(m[0], 0.42, m[2], 2.5, 0.06, 0.04, F.rotY).box(m[0], 0.8, m[2], 2.5, 0.06, 0.04, F.rotY); for (let k = 0; k < 9; k++) { const q = F.P(u + 0.14 + k * 0.28, 0, set); pk.box(q[0], 0.4, q[2], 0.09, 1.0, 0.025, F.rotY); } B.c('wood').box(m[0], 0.4, m[2], 2.5, 1.0, 0.1, F.rotY); }
        else if (fa.fence === 'iron' || fa.fence === 'chainlink') { const ir = B.v('blackMetal'); ir.box(m[0], 0.25, m[2], 2.5, 0.04, 0.03, F.rotY).box(m[0], 1.0, m[2], 2.5, 0.04, 0.03, F.rotY); for (let k = 0; k < 13; k++) { const q = F.P(u + 0.1 + k * 0.195, 0, set); ir.box(q[0], 0.5, q[2], 0.025, 1.2, 0.025, F.rotY); } B.c('metal:mesh').box(m[0], 0.45, m[2], 2.5, 1.1, 0.08, F.rotY); }
        else if (fa.fence === 'wall') { const sb = B.v('stucco', true); sb.setColor(wallCol[0] * 1.05, wallCol[1] * 1.05, wallCol[2] * 1.05).box(m[0], 0.3, m[2], 2.52, 1.2, 0.24, F.rotY, 0.45); sb.setColor(1, 1, 1); B.c('concrete').box(m[0], 0.3, m[2], 2.52, 1.2, 0.24, F.rotY); }
        else { const wd = B.v('wood'); wd.box(m[0], 0.5, m[2], 2.5, 1.5, 0.05, F.rotY, 0.5); B.c('wood').box(m[0], 0.5, m[2], 2.5, 1.5, 0.08, F.rotY); }
      });
    }
  }
  const palms = (fa.trees || []).filter((t) => t.startsWith('palm')).slice(0, 2);
  palms.forEach((t, k) => { const q = F.P(k ? F.L * 0.86 : F.L * 0.12, 0, Math.max(1.8, set - 1.4)); if (free(q[0], q[2]) && !(ctx.gen.trees || []).some((tr) => Math.hypot(tr[0] - q[0], tr[1] - q[2]) < 3.5)) { palm(ctx, q[0], q[2], t.endsWith('!'), rnd); (ctx.keepPalms = ctx.keepPalms || []).push([q[0], q[2]]); } });
  // conifers / redwoods seen in the yard: the nearest generated tree becomes one
  const con = (fa.trees || []).filter((t) => /^(redwood|conifer|cypress)/.test(t)); let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length;
  if (con.length) { const near = (ctx.gen.trees || []).map((t) => [Math.hypot(t[0] - cx, t[1] - cz), t]).filter((e) => e[0] < 22 && e[1][2] === 0).sort((p, q) => p[0] - q[0]); con.slice(0, 2).forEach((t, k) => { if (near[k]) { near[k][1][2] = 1; if (t.endsWith('!')) near[k][1][3] = Math.max(near[k][1][3], 1.25); } }); }
}

// downtown shop / office: every wall starts at its own ground; storefront band (or an office front) on the walls that
// face a street, the real wall colour, awning and sign where Street View shows them, cornice, flat satellite roof
function shop(ctx, ring, info, rnd, b, fa) {
  const { B, gen } = ctx; const rr = gen.roofs; const g = ringGround(ctx, ring); const fr = frontEdge(ctx, ring); const gF = fr ? edgeGround(ctx, fr.a, fr.b).mean : g.mean;
  let top = (info.top ?? g.max + info.h) + 0.5;
  if (fa.lv) { const sv = gF + (fa.lv === 1 ? Math.min(Math.max(top - gF, 4.4), 6.2) : 4.3 + (fa.lv - 1) * 3.5); if (Math.abs(sv - top) > 1.2) top = sv; }
  top = Math.max(top, g.max + 4.2); const levels = fa.lv || (top - gF > 7.2 ? 2 : 1);
  const brick = fa.wall ? fa.wall === 'brick' : false; const col = fa.col || [208, 200, 184]; const tint = lin(col, 1.08);
  const st = fa.store || (b.tags.shop || b.tags.amenity === 'restaurant' || b.tags.amenity === 'cafe' ? {} : null); const aw = st && st.awning ? lin(st.awning) : null; const trimC = fa.trim ? lin(fa.trim) : [0.16, 0.16, 0.17];
  const wb = B.v(brick ? 'brick' : 'stucco', true); const two = levels >= 2; const tile = fa.roofMat === 'clay_tile';
  let u = 0; const rd = mulberry32((b.id % 100003) + 17); let roofY = 0;
  sited(ctx, ring, (base) => {
    const h0 = top - base; roofY = h0 - 0.45;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) continue;
      const F = edgeFrame(a[0], a[1], c[0], c[1]); const S = 1 / 2.2; const ge = edgeGround(ctx, a, c); let dy = Math.max(0, Math.min(ge.min - base - 0.05, h0 - 3.6)); if (dy <= 0.3) dy = 0; const h = h0 - dy;
      const mid = F.P(L / 2, 0, 3.0); const open = ctx.surfaceAt(mid[0], mid[2]) !== 'grass';
      const front = L > 5 && facesStreet(ctx, F) && !(ctx.playRings || []).some((r) => r.id !== b.id && pointInRing(mid[0], mid[2], r));
      const edge = () => {
      wb.setColor(tint[0], tint[1], tint[2]);
      if (front && st && (!fr || F.nx * fr.F.nx + F.nz * fr.F.nz > 0.85)) {   // shop windows on the main frontage only: the side-street wall of a corner shop is plain (Street View: Dharma Trading's blank G St wall)
        const n = Math.max(1, Math.round(L / 4.2));
        wallRect(B.v('storefront'), F, 0.25, L - 0.25, 0, 3.4, 0.02, [n, 0, 0, 1]);
        wallRect(wb, F, 0, L, 3.4, h, 0, [u * S, 3.4 * S, (u + L) * S, h * S]);
        fbox(wb, F, 0, 0.3, 0, 3.4, 0, 0.06, S, u, 'fs'); fbox(wb, F, L - 0.3, L, 0, 3.4, 0, 0.06, S, u, 'fs');
        // sign fascia (the real sign text where Street View or OSM has one) + awning in its real colour
        const sg = ctx.signCell(b, fa); const fc = st.signBg ? lin(st.signBg, 0.9) : trimC;
        fbox(B.v('paint', true).setColor(fc[0], fc[1], fc[2]), F, 0.3, L - 0.3, 3.4, 4.0, 0, 0.08, 1, 0, 'fstb');
        if (sg) { const sw = Math.min(L - 1.0, 6.5); wallRect(B.v('shopSigns'), F, L / 2 - sw / 2, L / 2 + sw / 2, 3.44, 3.96, 0.09, [sg[2], sg[1], sg[0], sg[3]]); }
        if (aw) { const awb = B.v('awning', true).setColor(aw[0], aw[1], aw[2]); quadFacing(awb, F.P(0.4, 3.3, 0.05), F.P(L - 0.4, 3.3, 0.05), F.P(L - 0.4, 2.65, 1.35), F.P(0.4, 2.65, 1.35), [F.nx, 1, F.nz]); quadFacing(awb, F.P(0.4, 2.65, 1.35), F.P(L - 0.4, 2.65, 1.35), F.P(L - 0.4, 2.4, 1.35), F.P(0.4, 2.4, 1.35), [F.nx, 0, F.nz]); const cc = F.P(L / 2, 2.95, 0.7); B.c('wood').box(cc[0], cc[1], cc[2], L - 0.8, 0.5, 1.35, F.rotY); }
        if (!two && h - 4.5 > 1.3) {   // tall blank parapet wall over a one-storey shopfront: piers between the bays + a string course
          wb.setColor(tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9);
          for (let k = 0; k <= n; k++) { const uc = Math.min(L - 0.2, Math.max(0.2, k * L / n)); fbox(wb, F, uc - 0.2, uc + 0.2, 4.0, h - 0.5, 0, 0.07, S, u, 'fs'); }
          wb.setColor(tint[0], tint[1], tint[2]);
          fbox(B.v(brick ? 'limestone' : 'whitePanel'), F, 0, L, h - 1.22, h - 1.1, 0, 0.05, 1 / 3, u, 'ftb');
        }
      } else {
        wallRect(wb, F, 0, L, 0, h, 0, [u * S, 0, (u + L) * S, h * S]);
        const taken = [];   // u-intervals already used on this wall (doors, shutters)
        if (L > 7 && open && (front || rnd() < 0.5)) { const uc = L * (0.25 + rnd() * 0.5); fbox(B.v('frame'), F, uc - 0.55, uc + 0.55, 0, 2.15, 0, 0.05, 1, 0, 'fst'); taken.push([uc - 0.8, uc + 0.8]);
          fbox(B.v('paint', true).setColor(trimC[0], trimC[1], trimC[2]), F, uc - 0.46, uc + 0.46, 0.03, 2.06, 0.05, 0.075, 1, 0, 'f'); fbox(B.v('aluminum'), F, uc + 0.3, uc + 0.36, 0.95, 1.2, 0.075, 0.11, 1, 0, 'fs'); fbox(B.v('lightEmit'), F, uc - 0.16, uc + 0.16, 2.3, 2.4, 0, 0.12, 1, 0, 'fsb');
          if (!front && rnd() < 0.5) { fbox(B.v('galv'), F, uc + 1.6, uc + 4.4, 0.1, 2.9, 0, 0.05, 1, 0, 'fst'); taken.push([uc + 1.4, uc + 4.6]); } }
        // walls that face open ground: painted dado, windows, downpipe, the odd meter cabinet
        const m1 = F.P(L / 2, 0, 1.4);
        if (L > 4.5 && open && !(ctx.buildingRings || []).some((r) => r !== ring && pointInRing(m1[0], m1[2], r))) {
          wb.setColor(tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.6); fbox(wb, F, 0, L, 0, 1.05, 0, 0.03, S, u, 'ft'); wb.setColor(tint[0], tint[1], tint[2]);
          const free = (x0, x1) => x0 > 0.5 && x1 < L - 0.7 && !taken.some(([t0, t1]) => x1 > t0 && x0 < t1);
          const g2 = Math.floor(L / (front ? 3.6 : 5.5)); for (let k = 0; k < g2; k++) { const uc = (k + 0.5) * L / g2 + (front ? 0 : (rd() - 0.5) * 0.8); if (!free(uc - 0.8, uc + 0.8) || (!front && rd() < 0.25)) continue; const y0 = front ? 1.0 : 1.95, y1 = front ? 2.7 : 2.95; fbox(B.v('frame'), F, uc - 0.7, uc + 0.7, y0, y1, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, uc - 0.63, uc + 0.63, y0 + 0.07, y1 - 0.07, 0.055, [960 + i * 5 + k + 1, 0.2, 960 + i * 5 + k, 0.8]); }
          if (!front) fbox(B.v('galv'), F, L - 0.5, L - 0.39, 0.12, h - 0.5, 0, 0.11, 1, 0, 'fs');
          if (!front && rd() < 0.55) { const uc = 1.2 + rd() * 1.2; if (free(uc - 0.5, uc + 0.5)) fbox(B.v('galv'), F, uc - 0.4, uc + 0.4, 0.95, 1.9, 0, 0.26, 1, 0, 'fstb'); }
        }
      }
      // upper-floor windows, one row per storey above the street
      if (h > 7.0 && L > 3.5 && (front || open)) for (let lv = 1; lv < Math.max(2, levels) && 4.9 + (lv - 1) * 3.4 + 1.9 < h - 0.6; lv++) { const yw = 4.9 + (lv - 1) * 3.4; const m = Math.max(1, Math.floor((L - 1) / (front ? 3.2 : 3.8))); for (let k = 0; k < m; k++) { const uc = (k + 0.5) * L / m; fbox(B.v('frame'), F, uc - 0.85, uc + 0.85, yw, yw + 1.8, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, uc - 0.78, uc + 0.78, yw + 0.07, yw + 1.73, 0.055, [900 + i * 7 + k + 1, 2, 900 + i * 7 + k, 3]); fbox(B.v(brick ? 'limestone' : 'whitePanel'), F, uc - 0.95, uc + 0.95, yw - 0.12, yw, 0, 0.1, 1 / 3, 0, 'fstb'); } }
      // cornice + parapet with thickness
      fbox(B.v(brick ? 'limestone' : 'whitePanel'), F, -0.06, L + 0.06, h - 0.5, h, 0, 0.1, 1 / 3, u, 'fstb');
      if (tile && front) { const sh = B.v('shingles', true); sh.setColor(...CLAY); quadFacing(sh, F.P(-0.3, h - 1.0, 0.7), F.P(L + 0.3, h - 1.0, 0.7), F.P(L, h + 0.05, 0.1), F.P(0, h + 0.05, 0.1), [F.nx, 1, F.nz], [[0, 0], [L / 3, 0], [L / 3, 0.45], [0, 0.45]]); sh.setColor(1, 1, 1); quadFacing(B.v('whitePanel'), F.P(-0.3, h - 1.0, 0.0), F.P(L + 0.3, h - 1.0, 0.0), F.P(L + 0.3, h - 1.0, 0.7), F.P(-0.3, h - 1.0, 0.7), [0, -1, 0]); const mc = F.P(L / 2, h - 0.5, 0.35); B.c('concrete').box(mc[0], mc[1], mc[2], L + 0.6, 1.05, 0.7, F.rotY); }
      quadFacing(B.v('frame'), F.P(-0.1, h + 0.02, 0.12), F.P(L + 0.1, h + 0.02, 0.12), F.P(L, h + 0.02, -0.3), F.P(0, h + 0.02, -0.3), [0, 1, 0]);
      quadFacing(B.v('concrete'), F.P(0, h - 0.45, -0.3), F.P(L, h - 0.45, -0.3), F.P(L, h + 0.02, -0.3), F.P(0, h + 0.02, -0.3), [-F.nx, 0, -F.nz]);
      const pc = F.P(L / 2, h - 0.225, -0.15); B.c('concrete').box(pc[0], pc[1], pc[2], L, 0.45, 0.3, F.rotY);
      };
      if (dy > 0) ctx.onGround([a[0], a[1]], edge, { mode: base + dy }); else edge();
      u += L;
    }
    wb.setColor(1, 1, 1); B.v('paint', true).setColor(1, 1, 1); B.v('awning', true).setColor(1, 1, 1);
    B.v('roofSat').poly(ring, null, roofY, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]);
    B.c('brick').prism(ring, 0, roofY, 1, false); B.c('concrete').poly(ring, null, roofY);
    // a couple of rooftop units on the big ones (cover for roof fights)
    if (info.area > 500) { const o = minAreaOBB(ring); const cu = (o.u0 + o.u1) / 2, cv = (o.v0 + o.v1) / 2; for (const d of [-0.22, 0.2]) { const uu = cu + (o.u1 - o.u0) * d, x = uu * o.tx - cv * o.tz, z = uu * o.tz + cv * o.tx; B.v('galv').box(x, roofY + 0.75, z, 2.6, 1.5, 1.8, -ANG); B.c('metal').box(x, roofY + 0.75, z, 2.6, 1.5, 1.8, -ANG); } }
  });
  return top - 0.45;   // absolute roof deck height
}

// One texture atlas for every shop sign (4 x 10 cells): real names from OSM where mapped, plausible ones elsewhere.
const SIGN_COLS = 4, SIGN_ROWS = 10;
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function signAtlas(ctx, signs) {   // signs: [{ text, bg, fg }]
  const W = 2048, H = 1024, cw = W / SIGN_COLS, ch = H / SIGN_ROWS; const c = makeCanvas(W, H), g = c.getContext('2d'); const rnd = mulberry32(44);
  const fonts = ['Georgia, serif', '"Trebuchet MS", Arial, sans-serif', 'Futura, "Century Gothic", sans-serif', '"Times New Roman", serif'];
  signs.slice(0, SIGN_COLS * SIGN_ROWS).forEach((sg, i) => {
    const x = (i % SIGN_COLS) * cw, y = Math.floor(i / SIGN_COLS) * ch; const bg = sg.bg ? hex(sg.bg) : '#2a2b2e', fg = sg.fg ? hex(sg.fg) : '#f2ead8';
    g.fillStyle = bg; g.fillRect(x, y, cw, ch);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(ch * 0.5)}px ${fonts[Math.floor(rnd() * fonts.length)]}`;
    g.fillText(sg.text.slice(0, 28), x + cw / 2, y + ch / 2 + 2, cw - 40);
  });
  ctx.M.shopSigns = new THREE.MeshStandardMaterial({ map: canvasTexture(c, { repeat: false, aniso: ctx.T.aniso }), roughness: 0.7 });
  return (i) => { const cx = i % SIGN_COLS, cy = Math.floor(i / SIGN_COLS); return [cx / SIGN_COLS, 1 - (cy + 1) / SIGN_ROWS, (cx + 1) / SIGN_COLS, 1 - cy / SIGN_ROWS]; };
}
// Hand notes on single buildings. First Presbyterian (east of the pool): Street View shows a steep wood-shake A-frame
// sanctuary, cream stucco walls; its hall next door is a low cream block under a hip roof.
const OVERRIDE = { 900888958: { top: 7.4, rise: 4.2, style: 'maMission', tint: [1.5, 1.15, 0.85] }, 900888959: { top: 6.4, rise: 2.2, style: 'maLowCream', tint: CLAY } };

export function buildTown(ctx) {
  const { B, data, gen } = ctx; const rnd = mulberry32(1600);
  let nHouse = 0, nShop = 0, nKit = 0, nCtx = 0; const flats = [];
  ctx.streetSegs = []; for (const r of data.roads) if (STREETS.includes(r.tags.highway)) for (let i = 0; i < r.line.length - 1; i++) ctx.streetSegs.push([r.line[i], r.line[i + 1], { primary: 15, secondary: 13, secondary_link: 8, tertiary: 11.5, residential: 8.5 }[r.tags.highway]]);
  const inPlay = (b) => gen.buildings[String(b.id)]?.play && !SCHOOL_IDS.has(b.id) && !SKIP.has(b.id);
  // look of a building Street View could not see: its nearest classified neighbour of the same roof kind (never a random skin)
  const cen = (r) => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
  const known = data.buildings.filter((b) => inPlay(b) && FACADES[b.id] && FACADES[b.id].col).map((b) => ({ c: cen(b.outer[0]), fa: FACADES[b.id], flat: gen.buildings[String(b.id)].roof === 'flat' }));
  const facadeOf = (b, info) => { const own = FACADES[b.id] || {}; if (own.col && own.wall) return own; const c = cen(b.outer[0]); let best = null; for (const k of known) { if (k.flat !== (info.roof === 'flat')) continue; const d = Math.hypot(k.c[0] - c[0], k.c[1] - c[1]); if (!best || d < best.d) best = { d, fa: k.fa }; } const n = best ? best.fa : {}; return { ...own, wall: own.wall || n.wall, col: own.col || n.col, trim: own.trim || n.trim, roofCol: own.roofCol || n.roofCol, roofMat: own.roofMat || n.roofMat }; };
  // shop signs: only real ones (Street View sign text, else the OSM name)
  const signs = [], signIdx = new Map();
  for (const b of data.buildings) { if (!inPlay(b)) continue; const fa = FACADES[b.id] || {}; const text = (fa.store && fa.store.sign) || (fa.store || b.tags.shop || b.tags.amenity ? b.tags.name : null); if (!text || signs.length >= SIGN_COLS * SIGN_ROWS) continue; signIdx.set(b.id, signs.length); signs.push({ text: text.toUpperCase(), bg: fa.store && fa.store.signBg, fg: fa.store && fa.store.signFg }); }
  const signUV = signAtlas(ctx, signs); ctx.signCell = (b) => (signIdx.has(b.id) ? signUV(signIdx.get(b.id)) : null);
  // every solid footprint, known before the first house is roofed (eaveOverhang looks at the neighbours on both sides)
  ctx.playRings = [...(ctx.buildingRings || [])];
  for (const b of data.buildings) { const info = gen.buildings[String(b.id)]; const raw = b.outer[0]; if (!info || !info.play || SCHOOL_IDS.has(b.id) || SKIP.has(b.id) || raw.length < 3 || Math.abs(signedArea(raw)) < 14) continue; const r = simplify(raw, 0.5); r.id = b.id; ctx.playRings.push(r); }
  for (const b of data.buildings) {
    if (SCHOOL_IDS.has(b.id) || SKIP.has(b.id)) continue;
    const info = gen.buildings[String(b.id)]; if (!info) continue;
    const raw = b.outer[0]; if (raw.length < 3 || Math.abs(signedArea(raw)) < 14) continue;
    if (!info.play) {
      // context shell: plain walls + roof, no collision; stands on the terrain (walls from below its lowest ground)
      const ring = simplify(raw, 1.0); const gr = ringGround(ctx, ring); const y0 = gr.min - 0.6; const h = gr.max + (info.roof === 'flat' ? info.h : Math.max(2.9, info.h));
      const p = B.v('paint', true); const wc = srgb(...(info.roof === 'flat' ? [196, 188, 172] : [[214, 208, 194], [186, 178, 160], [160, 168, 170], [205, 196, 170]][b.id % 4])); p.setColor(wc[0], wc[1], wc[2]);
      if (info.roof === 'flat') for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; p.wall(a[0], a[1], c[0], c[1], y0, h); }
      else {
        const hw = B.v('house' + (b.id % 8));
        for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) continue; const F = edgeFrame(a[0], a[1], c[0], c[1]); const yw = Math.max(y0, h - 5.8);   // windows on the top two storeys only; a downhill wall below that is plain foundation
          wallRect(hw, F, 0, L, yw, h, 0, L > 3.2 ? [0, 2 + (yw - h) * HOUSE_S[1], Math.max(1, Math.round(L / 4)), 2] : [0.02, 0.04, 0.2, 0.9]);
          if (yw > y0 + 0.05) { p.setColor(0.36, 0.35, 0.32); p.wall(a[0], a[1], c[0], c[1], y0, yw); p.setColor(wc[0], wc[1], wc[2]); } }
      }
      p.setColor(1, 1, 1);
      if (info.roof === 'flat') { const rr = gen.roofs; B.v('roofSat').poly(ring, null, h, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]); }
      else polyRoof(ctx, ring, h, Math.min(info.rise || 1.8, 3), { tint: tileTint(info.col), overhang: 0.4, noCollision: true });
      nCtx++; continue;
    }
    const ring = simplify(raw, 0.5); ring.id = b.id; const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    (ctx.buildingRings = ctx.buildingRings || []).push(ring);
    const fa = facadeOf(b, info);
    const ov = OVERRIDE[b.id];
    if (ov) { sited(ctx, ring, (base) => { const h = ov.top - base; kitWalls(ctx, ring, h, ov.style); polyRoof(ctx, ring, h, ov.rise, { tint: ov.tint, overhang: 0.7, fill: true }); B.c('concrete').prism(ring, 0, h, 1, true); }); nKit++; continue; }
    const t = b.tags; const pitched = fa.roof ? ['hip', 'gable', 'mansard'].includes(fa.roof) : info.roof !== 'flat';
    const homey = fa.kind === 'house' || (!fa.kind && info.roof !== 'flat');
    if (pitched || homey) { house(ctx, ring, info, rnd, fa, b.id); nHouse++; continue; }
    const commercial = fa.store || ['shop', 'restaurant'].includes(fa.kind) || t.shop || t.amenity === 'restaurant' || t.amenity === 'cafe' || t.amenity === 'bank' || t.building === 'commercial' || t.building === 'retail' || cz > 120;
    if (commercial) { const roofAbs = shop(ctx, ring, info, rnd, b, fa); nShop++; flats.push({ ring, roofY: roofAbs, area: info.area }); continue; }
    // civic / institutional / apartment / office blocks: the facade kit in the building's real colour
    const brick = fa.wall === 'brick'; const base0 = brick ? 'service' : (fa.lv || info.lv) >= 2 ? 'maWhite' : 'maLowCream';
    const style = 'maB' + b.id; STYLES[style] = { ...STYLES[base0], tint: fa.col ? lin(fa.col, 1.08) : STYLES[base0].tint };
    const gr = ringGround(ctx, ring); let top = (info.top ?? gr.max + info.h) + 0.4; { const fr = frontEdge(ctx, ring); const gF = fr ? edgeGround(ctx, fr.a, fr.b).mean : gr.mean; if (fa.lv) { const sv = gF + 1.0 + fa.lv * 3.3; if (Math.abs(sv - top) > 1.5) top = sv; } } top = Math.max(top, gr.max + 3.6);
    sited(ctx, ring, (base) => flatBuilding(ctx, ring, top - base, style, { skin: brick ? SKIN_BRICK : SKIN_STUCCO, rnd, units: info.area > 450 ? 2 : 0, surface: 'brick' }));
    nKit++; flats.push({ ring, roofY: top - 0.4, area: info.area });
  }
  // service ladders up to the bigger flat roofs (one per building, on its longest wall that faces open ground)
  const pb = ctx.playBounds; let nLad = 0;
  for (const f of flats) {
    if (f.area < 380) continue; let best = null;
    for (let i = 0; i < f.ring.length; i++) {
      const a = f.ring[i], c = f.ring[(i + 1) % f.ring.length]; const F = edgeFrame(a[0], a[1], c[0], c[1]); if (F.L < 5) continue;
      for (const t of [0.22, 0.78]) {
        const p = F.P(F.L * t, 0, 1.3), q = F.P(F.L * t, 0, 0.14);
        if (p[0] < pb.minX + 3 || p[0] > pb.maxX - 3 || p[2] < pb.minZ + 3 || p[2] > pb.maxZ - 3) continue;
        if (ctx.buildingRings.some((r) => r !== f.ring && (pointInRing(p[0], p[2], r) || pointInRing(q[0] + F.nx * 2.4, q[2] + F.nz * 2.4, r)))) continue;
        if (!best || F.L > best.L) best = { L: F.L, q, F };
      }
    }
    if (best) { groundLadder(ctx, best.q[0], best.q[2], best.F.nx, best.F.nz, f.roofY); nLad++; }
  }
  ctx.flatRoofs = flats;
  ctx.townStats = { nHouse, nShop, nKit, nCtx, nLad };
}
