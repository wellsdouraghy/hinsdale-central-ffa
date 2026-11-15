// The blocks around Marin Academy: hillside houses north of campus, downtown San Rafael shops and offices to the
// south. Inside the play area every OSM building is solid (footprint from OSM, height / roof kind / roof colour from
// gen.json, i.e. 3D-tiles samples + imagery); outside it only cheap context shells without collision.
import { ANG, wallLadder, polyRoof, kitWalls, flatBuilding, hipRoof, minAreaOBB, tileTint, srgb, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, signedArea, pointInRing, mulberry32, SKIN_STUCCO, SKIN_BRICK } from './kit.js';
import { STYLES } from '../../world/facade.js';
import { SCHOOL_IDS } from './school.js';

const HOUSE_S = [1 / 4.0, 1 / 2.9];
const SHOP_AWNINGS = [[0.55, 0.08, 0.07], [0.08, 0.2, 0.14], [0.07, 0.12, 0.3], [0.75, 0.62, 0.3], [0.1, 0.1, 0.11], [0.5, 0.3, 0.12]];
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

// house: textured siding / stucco walls (window module), foundation band, tinted hip roof, a front door and stoop
function house(ctx, ring, info, rnd) {
  const { B } = ctx; const kind = Math.floor(rnd() * 8); const key = 'house' + kind; const eave = Math.max(2.9, Math.round(info.h / 2.9) * 2.9 || 2.9);
  const w = B.v(key); let u = 0, longest = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
    const F = edgeFrame(a[0], a[1], b[0], b[1]);
    // snap the texture so whole window modules fit the wall
    const n = Math.max(1, Math.round(L / 4)); const windows = L > 3.2;
    wallRect(w, F, 0, L, 0.35, eave, 0, windows ? [0, 0.35 * HOUSE_S[1], n, eave * HOUSE_S[1]] : [0.02, 0.04, 0.2, 0.9]);
    fbox(B.v('concrete'), F, -0.03, L + 0.03, 0, 0.38, 0, 0.05, 1 / 3, u, 'fst');
    fbox(B.v('whitePanel'), F, -0.06, L + 0.06, eave - 0.22, eave, 0, 0.06, 1, 0, 'fsb');
    B.v('groundDecal').quad(F.P(0, 0.025, 0.02), F.P(L, 0.025, 0.02), F.P(L, 0.025, 1.2), F.P(0, 0.025, 1.2), [0, 0], [1, 0], [1, 1], [0, 1]);
    if (!longest || L > longest.L) longest = F;
    u += L;
  }
  if (longest && longest.L > 6) {   // door with a small stoop and porch roof on the longest wall
    const F = longest, uc = F.L * (0.3 + rnd() * 0.4);
    fbox(B.v('whitePanel'), F, uc - 0.62, uc + 0.62, 0.3, 2.5, 0, 0.05, 1, 0, 'fst'); fbox(B.v('frame'), F, uc - 0.5, uc + 0.5, 0.35, 2.4, 0.05, 0.08, 1, 0, 'fst');
    fbox(B.v('concrete'), F, uc - 1.1, uc + 1.1, 0, 0.3, 0, 1.3, 1 / 3, 0, 'fst');
    fbox(B.v('whitePanel'), F, uc - 1.3, uc + 1.3, 2.62, 2.78, 0, 1.4, 1, 0, 'fstb');
    const c = F.P(uc, 0.15, 0.65); B.c('concrete').box(c[0], 0.15, c[2], 2.2, 0.3, 1.3, F.rotY);
  }
  const tint = tileTint(info.col);
  { const o = minAreaOBB(ring); const fillR = Math.abs(signedArea(ring)) / Math.max(1, o.area); const rise = Math.min(info.rise || 1.8, 3.2); if (fillR > 0.9) hipRoof(ctx, ring, eave, rise, { tint, overhang: 0.55, gable: rnd() < 0.35, gableBucket: 'stucco', gableTint: [0.86, 0.84, 0.78] }); else polyRoof(ctx, ring, eave, rise, { tint, overhang: 0.5 }); }
  B.c('wood').prism(ring, 0, eave, 1, true);
}

// downtown shop / office: storefront band at street level, brick or stucco above, cornice, flat satellite roof
function shop(ctx, ring, info, rnd, b) {
  const { B, gen } = ctx; const h = Math.max(4.2, info.h + 0.5); const roofY = h - 0.45; const rr = gen.roofs;
  const brick = rnd() < 0.42; const tint = brick ? [[1, 0.95, 0.9], [0.86, 0.72, 0.62], [1.1, 1.0, 0.86]][Math.floor(rnd() * 3)] : [[0.9, 0.82, 0.62], [0.9, 0.9, 0.9], [0.78, 0.72, 0.6], [0.88, 0.74, 0.56], [0.66, 0.72, 0.7], [0.8, 0.6, 0.5]][Math.floor(rnd() * 6)];
  const wb = B.v(brick ? 'brick' : 'stucco', true); const two = h > 7.2; const aw = SHOP_AWNINGS[Math.floor(rnd() * SHOP_AWNINGS.length)];
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) continue;
    const F = edgeFrame(a[0], a[1], c[0], c[1]); const S = 1 / 2.2;
    const mid = F.P(L / 2, 0, 3.0); const open = ctx.surfaceAt(mid[0], mid[2]) !== 'grass';
    const front = L > 5.5 && open && Math.abs(F.nz) > 0.8;                  // shopfronts face the east-west streets
    wb.setColor(tint[0], tint[1], tint[2]);
    if (front) {
      const n = Math.max(1, Math.round(L / 4.2));
      wallRect(B.v('storefront'), F, 0.25, L - 0.25, 0, 3.4, 0.02, [n, 0, 0, 1]);
      wallRect(wb, F, 0, L, 3.4, h, 0, [u * S, 3.4 * S, (u + L) * S, h * S]);
      fbox(wb, F, 0, 0.3, 0, 3.4, 0, 0.06, S, u, 'fs'); fbox(wb, F, L - 0.3, L, 0, 3.4, 0, 0.06, S, u, 'fs');
      // sign fascia + fabric awning
      fbox(B.v('paint', true).setColor(0.1 + aw[0] * 0.3, 0.1 + aw[1] * 0.3, 0.1 + aw[2] * 0.3), F, 0.3, L - 0.3, 3.4, 4.0, 0, 0.08, 1, 0, 'fstb');
      if (rnd() < 0.7) { const awb = B.v('awning', true).setColor(aw[0], aw[1], aw[2]); quadFacing(awb, F.P(0.4, 3.3, 0.05), F.P(L - 0.4, 3.3, 0.05), F.P(L - 0.4, 2.65, 1.35), F.P(0.4, 2.65, 1.35), [F.nx, 1, F.nz]); quadFacing(awb, F.P(0.4, 2.65, 1.35), F.P(L - 0.4, 2.65, 1.35), F.P(L - 0.4, 2.4, 1.35), F.P(0.4, 2.4, 1.35), [F.nx, 0, F.nz]); const cc = F.P(L / 2, 2.95, 0.7); B.c('wood').box(cc[0], cc[1], cc[2], L - 0.8, 0.5, 1.35, F.rotY); }
      if (two) { const m = Math.max(1, Math.floor((L - 1) / 3.2)); for (let k = 0; k < m; k++) { const uc = (k + 0.5) * L / m; fbox(B.v('frame'), F, uc - 0.85, uc + 0.85, 4.9, 6.7, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, uc - 0.78, uc + 0.78, 4.97, 6.63, 0.055, [900 + i * 7 + k + 1, 2, 900 + i * 7 + k, 3]); fbox(B.v('limestone'), F, uc - 0.95, uc + 0.95, 4.78, 4.9, 0, 0.1, 1 / 3, 0, 'fstb'); } }
    } else {
      wallRect(wb, F, 0, L, 0, h, 0, [u * S, 0, (u + L) * S, h * S]);
      if (L > 7 && open && rnd() < 0.5) { const uc = L * (0.25 + rnd() * 0.5); fbox(B.v('frame'), F, uc - 0.55, uc + 0.55, 0, 2.15, 0, 0.05, 1, 0, 'fst'); if (rnd() < 0.5) fbox(B.v('galv'), F, uc + 1.6, uc + 4.4, 0.1, 2.9, 0, 0.05, 1, 0, 'fst'); }
    }
    B.v('groundDecal').quad(F.P(0, 0.025, 0.02), F.P(L, 0.025, 0.02), F.P(L, 0.025, 1.4), F.P(0, 0.025, 1.4), [0, 0], [1, 0], [1, 1], [0, 1]);
    // cornice + parapet with thickness
    fbox(B.v(brick ? 'limestone' : 'whitePanel'), F, -0.06, L + 0.06, h - 0.5, h, 0, 0.1, 1 / 3, u, 'fstb');
    quadFacing(B.v('frame'), F.P(-0.1, h + 0.02, 0.12), F.P(L + 0.1, h + 0.02, 0.12), F.P(L, h + 0.02, -0.3), F.P(0, h + 0.02, -0.3), [0, 1, 0]);
    quadFacing(B.v('concrete'), F.P(0, roofY, -0.3), F.P(L, roofY, -0.3), F.P(L, h + 0.02, -0.3), F.P(0, h + 0.02, -0.3), [-F.nx, 0, -F.nz]);
    const pc = F.P(L / 2, (roofY + h) / 2, -0.15); B.c('concrete').box(pc[0], pc[1], pc[2], L, h - roofY, 0.3, F.rotY);
    u += L;
  }
  wb.setColor(1, 1, 1); B.v('paint', true).setColor(1, 1, 1); B.v('awning', true).setColor(1, 1, 1);
  B.v('roofSat').poly(ring, null, roofY, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]);
  B.c('brick').prism(ring, 0, roofY, 1, false); B.c('concrete').poly(ring, null, roofY);
  // a couple of rooftop units on the big ones (cover for roof fights)
  if (info.area > 500) { const o = minAreaOBB(ring); const cu = (o.u0 + o.u1) / 2, cv = (o.v0 + o.v1) / 2; for (const d of [-0.22, 0.2]) { const uu = cu + (o.u1 - o.u0) * d, x = uu * o.tx - cv * o.tz, z = uu * o.tz + cv * o.tx; B.v('galv').box(x, roofY + 0.75, z, 2.6, 1.5, 1.8, -ANG); B.c('metal').box(x, roofY + 0.75, z, 2.6, 1.5, 1.8, -ANG); } }
}

export function buildTown(ctx) {
  const { B, data, gen } = ctx; const rnd = mulberry32(1600);
  const KIT = ['maLowCream', 'maService', 'maWhite', 'maMission', 'service', 'annex'];
  let nHouse = 0, nShop = 0, nKit = 0, nCtx = 0; const flats = [];
  for (const b of data.buildings) {
    if (SCHOOL_IDS.has(b.id) || SKIP.has(b.id)) continue;
    const info = gen.buildings[String(b.id)]; if (!info) continue;
    const raw = b.outer[0]; if (raw.length < 3 || Math.abs(signedArea(raw)) < 14) continue;
    if (!info.play) {
      // context shell: plain walls + roof, no collision
      const ring = simplify(raw, 1.0); const h = info.roof === 'flat' ? info.h : Math.max(2.9, info.h);
      const p = B.v('paint', true); const wc = srgb(...(info.roof === 'flat' ? [196, 188, 172] : [[214, 208, 194], [186, 178, 160], [160, 168, 170], [205, 196, 170]][b.id % 4])); p.setColor(wc[0], wc[1], wc[2]);
      for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; p.wall(a[0], a[1], c[0], c[1], 0, h); }
      p.setColor(1, 1, 1);
      if (info.roof === 'flat') { const rr = gen.roofs; B.v('roofSat').poly(ring, null, h, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]); }
      else polyRoof(ctx, ring, h, Math.min(info.rise || 1.8, 3), { tint: tileTint(info.col), overhang: 0.4, noCollision: true });
      nCtx++; continue;
    }
    const ring = simplify(raw, 0.5); const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    (ctx.buildingRings = ctx.buildingRings || []).push(ring);
    if (info.roof !== 'flat') { house(ctx, ring, info, rnd); nHouse++; continue; }
    const t = b.tags; const commercial = t.shop || t.amenity === 'restaurant' || t.amenity === 'cafe' || t.amenity === 'bank' || t.building === 'commercial' || t.building === 'retail' || cz > 120;
    if (commercial) { shop(ctx, ring, info, rnd, b); nShop++; flats.push({ ring, roofY: Math.max(4.2, info.h + 0.5) - 0.45, area: info.area }); continue; }
    // civic / institutional / apartment blocks: full facade kit, brick or stucco
    const style = KIT[Math.floor(rnd() * KIT.length)]; const brick = style === 'service' || style === 'annex';
    const h = Math.max(4.4, info.h + 0.4);
    flatBuilding(ctx, ring, h, h > 7.4 && !brick ? (rnd() < 0.5 ? 'maMission' : 'maWhite') : style, { skin: brick ? SKIN_BRICK : SKIN_STUCCO, rnd, units: info.area > 450 ? 2 : 0, surface: 'brick' });
    nKit++; flats.push({ ring, roofY: h - 0.4, area: info.area });
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
    if (best) { wallLadder(ctx, best.q[0], best.q[2], best.F.nx, best.F.nz, f.roofY); nLad++; }
  }
  ctx.flatRoofs = flats;
  ctx.townStats = { nHouse, nShop, nKit, nCtx, nLad };
}
