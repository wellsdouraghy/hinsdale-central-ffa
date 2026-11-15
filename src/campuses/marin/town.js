// The blocks around Marin Academy: hillside houses north of campus, downtown San Rafael shops and offices to the
// south. Inside the play area every OSM building is solid (footprint from OSM, height / roof kind / roof colour from
// gen.json, i.e. 3D-tiles samples + imagery); outside it only cheap context shells without collision.
import { ANG, CLAY, makeCanvas, canvasTexture, wallLadder, polyRoof, kitWalls, flatBuilding, hipRoof, minAreaOBB, tileTint, srgb, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, signedArea, pointInRing, mulberry32, SKIN_STUCCO, SKIN_BRICK } from './kit.js';
import * as THREE from 'three';
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
    const pr = F.P(uc, 2.7, 0.7); B.c('wood').box(pr[0], 2.7, pr[2], 2.6, 0.16, 1.4, F.rotY);       // porch roof is solid too
  }
  const tint = tileTint(info.col);
  { const o = minAreaOBB(ring); const fillR = Math.abs(signedArea(ring)) / Math.max(1, o.area); const rise = Math.min(info.rise || 1.8, 3.2); if (fillR > 0.9) hipRoof(ctx, ring, eave, rise, { tint, overhang: 0.55, gable: rnd() < 0.35, gableBucket: 'stucco', gableTint: [0.86, 0.84, 0.78] }); else polyRoof(ctx, ring, eave, rise, { tint, overhang: 0.5 }); }
  B.c('wood').prism(ring, 0, eave, 1, true);
}

// downtown shop / office: storefront band at street level, brick or stucco above, cornice, flat satellite roof
function shop(ctx, ring, info, rnd, b) {
  const { B, gen } = ctx; const h = Math.max(4.2, info.h + 0.5); const roofY = h - 0.45; const rr = gen.roofs;
  const brick = rnd() < 0.42; const tint = brick ? [[1, 0.95, 0.9], [0.86, 0.72, 0.62], [1.1, 1.0, 0.86]][Math.floor(rnd() * 3)] : [[0.9, 0.82, 0.62], [0.8, 0.79, 0.75], [0.78, 0.72, 0.6], [0.88, 0.74, 0.56], [0.66, 0.72, 0.7], [0.8, 0.6, 0.5]][Math.floor(rnd() * 6)];
  const wb = B.v(brick ? 'brick' : 'stucco', true); const two = h > 7.2; const aw = SHOP_AWNINGS[Math.floor(rnd() * SHOP_AWNINGS.length)];
  let u = 0; const rd = mulberry32((b.id % 100003) + 17);   // separate stream for the wall dressing: the main one keeps its sequence
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
      { const sw = Math.min(L - 1.0, 6.5), uv = ctx.signCell(b); wallRect(B.v('shopSigns'), F, L / 2 - sw / 2, L / 2 + sw / 2, 3.44, 3.96, 0.09, [uv[2], uv[1], uv[0], uv[3]]); }
      if (rnd() < 0.7) { const awb = B.v('awning', true).setColor(aw[0], aw[1], aw[2]); quadFacing(awb, F.P(0.4, 3.3, 0.05), F.P(L - 0.4, 3.3, 0.05), F.P(L - 0.4, 2.65, 1.35), F.P(0.4, 2.65, 1.35), [F.nx, 1, F.nz]); quadFacing(awb, F.P(0.4, 2.65, 1.35), F.P(L - 0.4, 2.65, 1.35), F.P(L - 0.4, 2.4, 1.35), F.P(0.4, 2.4, 1.35), [F.nx, 0, F.nz]); const cc = F.P(L / 2, 2.95, 0.7); B.c('wood').box(cc[0], cc[1], cc[2], L - 0.8, 0.5, 1.35, F.rotY); }
      if (!two && h - 4.5 > 1.3) {   // tall blank parapet wall over a one-storey shopfront: piers between the bays + a string course
        wb.setColor(tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9);
        for (let k = 0; k <= n; k++) { const uc = Math.min(L - 0.2, Math.max(0.2, k * L / n)); fbox(wb, F, uc - 0.2, uc + 0.2, 4.0, h - 0.5, 0, 0.07, S, u, 'fs'); }
        wb.setColor(tint[0], tint[1], tint[2]);
        fbox(B.v(brick ? 'limestone' : 'whitePanel'), F, 0, L, h - 1.22, h - 1.1, 0, 0.05, 1 / 3, u, 'ftb');
      }
      if (two) { const m = Math.max(1, Math.floor((L - 1) / 3.2)); for (let k = 0; k < m; k++) { const uc = (k + 0.5) * L / m; fbox(B.v('frame'), F, uc - 0.85, uc + 0.85, 4.9, 6.7, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, uc - 0.78, uc + 0.78, 4.97, 6.63, 0.055, [900 + i * 7 + k + 1, 2, 900 + i * 7 + k, 3]); fbox(B.v('limestone'), F, uc - 0.95, uc + 0.95, 4.78, 4.9, 0, 0.1, 1 / 3, 0, 'fstb'); } }
    } else {
      wallRect(wb, F, 0, L, 0, h, 0, [u * S, 0, (u + L) * S, h * S]);
      const taken = [];   // u-intervals already used on this wall (doors, shutters)
      if (L > 7 && open && rnd() < 0.5) { const uc = L * (0.25 + rnd() * 0.5); fbox(B.v('frame'), F, uc - 0.55, uc + 0.55, 0, 2.15, 0, 0.05, 1, 0, 'fst'); taken.push([uc - 0.8, uc + 0.8]);
        // painted steel service door in the frame, with a pull and a bulkhead light over it
        fbox(B.v('paint', true).setColor(0.2 + aw[0] * 0.25, 0.22 + aw[1] * 0.25, 0.23 + aw[2] * 0.25), F, uc - 0.46, uc + 0.46, 0.03, 2.06, 0.05, 0.075, 1, 0, 'f'); fbox(B.v('aluminum'), F, uc + 0.3, uc + 0.36, 0.95, 1.2, 0.075, 0.11, 1, 0, 'fs'); fbox(B.v('lightEmit'), F, uc - 0.16, uc + 0.16, 2.3, 2.4, 0, 0.12, 1, 0, 'fsb');
        if (rnd() < 0.5) { fbox(B.v('galv'), F, uc + 1.6, uc + 4.4, 0.1, 2.9, 0, 0.05, 1, 0, 'fst'); taken.push([uc + 1.4, uc + 4.6]); } }
      // side / rear walls that face open ground were bare boxes: painted dado, windows, downpipe, the odd meter cabinet
      const m1 = F.P(L / 2, 0, 1.4);
      if (L > 4.5 && open && !(ctx.buildingRings || []).some((r) => r !== ring && pointInRing(m1[0], m1[2], r))) {
        wb.setColor(tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.6); fbox(wb, F, 0, L, 0, 1.05, 0, 0.03, S, u, 'ft'); wb.setColor(tint[0], tint[1], tint[2]);
        const free = (x0, x1) => x0 > 0.5 && x1 < L - 0.7 && !taken.some(([t0, t1]) => x1 > t0 && x0 < t1);
        if (two) { const m = Math.max(1, Math.floor((L - 1.2) / 3.8)); for (let k = 0; k < m; k++) { const uc = (k + 0.5) * L / m; fbox(B.v('frame'), F, uc - 0.7, uc + 0.7, 4.9, 6.5, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, uc - 0.63, uc + 0.63, 4.97, 6.43, 0.055, [940 + i * 7 + k + 1, 2, 940 + i * 7 + k, 3]); fbox(B.v(brick ? 'limestone' : 'whitePanel'), F, uc - 0.8, uc + 0.8, 4.78, 4.9, 0, 0.09, 1 / 3, 0, 'fstb'); } }
        const g = Math.floor(L / 5.5); for (let k = 0; k < g; k++) { const uc = (k + 0.5) * L / g + (rd() - 0.5) * 0.8; if (!free(uc - 0.8, uc + 0.8) || rd() < 0.25) continue; fbox(B.v('frame'), F, uc - 0.7, uc + 0.7, 1.95, 2.95, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, uc - 0.63, uc + 0.63, 2.02, 2.88, 0.055, [960 + i * 5 + k + 1, 0.2, 960 + i * 5 + k, 0.8]); }
        fbox(B.v('galv'), F, L - 0.5, L - 0.39, 0.12, h - 0.5, 0, 0.11, 1, 0, 'fs');
        if (rd() < 0.55) { const uc = 1.2 + rd() * 1.2; if (free(uc - 0.5, uc + 0.5)) fbox(B.v('galv'), F, uc - 0.4, uc + 0.4, 0.95, 1.9, 0, 0.26, 1, 0, 'fstb'); }
      }
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

// One texture atlas for every shop sign (4 x 10 cells): real names from OSM where mapped, plausible ones elsewhere.
const SIGN_COLS = 4, SIGN_ROWS = 10;
const GENERIC = ['CAFE', 'BOOKS', 'PIZZERIA', 'CLEANERS', 'BARBER', 'BAKERY', 'ANTIQUES', 'CYCLERY', 'TAQUERIA', 'HARDWARE', 'FLORIST', 'OPTOMETRY', 'YOGA', 'GALLERY', 'THRIFT', 'FRAMES', 'MARKET', 'NOODLES', 'RECORDS', 'JEWELERS'];
function signAtlas(ctx, names) {
  const W = 2048, H = 1024, cw = W / SIGN_COLS, ch = H / SIGN_ROWS; const c = makeCanvas(W, H), g = c.getContext('2d'); const rnd = mulberry32(44);
  const pal = [['#1f2a36', '#f2ead8'], ['#7a1b16', '#f6efe0'], ['#efe8d6', '#2a2520'], ['#1e3a2b', '#e9e2c8'], ['#2b2b2e', '#e8b84a'], ['#e8dcc0', '#7a1b16'], ['#23324f', '#ffffff'], ['#f4f1ea', '#1f3d5c']];
  const fonts = ['Georgia, serif', '"Trebuchet MS", Arial, sans-serif', 'Futura, "Century Gothic", sans-serif', '"Times New Roman", serif'];
  names.slice(0, SIGN_COLS * SIGN_ROWS).forEach((nm, i) => {
    const x = (i % SIGN_COLS) * cw, y = Math.floor(i / SIGN_COLS) * ch; const [bg, fg] = pal[Math.floor(rnd() * pal.length)];
    g.fillStyle = bg; g.fillRect(x, y, cw, ch); g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(x + 8, y + 8, cw - 16, ch - 16); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(ch * 0.5)}px ${fonts[Math.floor(rnd() * fonts.length)]}`;
    g.fillText(nm.toUpperCase().slice(0, 22), x + cw / 2, y + ch / 2 + 2, cw - 40);
  });
  ctx.M.shopSigns = new THREE.MeshStandardMaterial({ map: canvasTexture(c, { repeat: false, aniso: ctx.T.aniso }), roughness: 0.7 });
  return (i) => { const cx = i % SIGN_COLS, cy = Math.floor(i / SIGN_COLS); return [cx / SIGN_COLS, 1 - (cy + 1) / SIGN_ROWS, (cx + 1) / SIGN_COLS, 1 - cy / SIGN_ROWS]; };
}
// OSM footprints the generic classifier gets wrong: the church east of the pool is cream stucco under a clay-tile hip roof
const OVERRIDE = { 900888958: { h: 8.2, rise: 4.2, style: 'maMission' }, 900888959: { h: 7.6, rise: 2.4, style: 'maLowCream' } };

export function buildTown(ctx) {
  const { B, data, gen } = ctx; const rnd = mulberry32(1600);
  const KIT = ['maLowCream', 'maService', 'maWhite', 'maMission', 'service', 'annex'];
  let nHouse = 0, nShop = 0, nKit = 0, nCtx = 0; const flats = [];
  const named = data.buildings.filter((b) => b.tags.name && gen.buildings[String(b.id)]?.play && !SCHOOL_IDS.has(b.id)).map((b) => b.tags.name);
  const signNames = [...named.slice(0, 22), ...GENERIC].slice(0, SIGN_COLS * SIGN_ROWS); const signUV = signAtlas(ctx, signNames); const nNamed = Math.min(22, named.length); ctx.signCell = (b) => { const k = signNames.indexOf(b.tags.name || ''); return signUV(k >= 0 ? k : nNamed + Math.floor(rnd() * (signNames.length - nNamed))); };
  for (const b of data.buildings) {
    if (SCHOOL_IDS.has(b.id) || SKIP.has(b.id)) continue;
    const info = gen.buildings[String(b.id)]; if (!info) continue;
    const raw = b.outer[0]; if (raw.length < 3 || Math.abs(signedArea(raw)) < 14) continue;
    if (!info.play) {
      // context shell: plain walls + roof, no collision
      const ring = simplify(raw, 1.0); const y0 = (info.y || 0) - 0.6; const h = (info.yTop || 0) + (info.roof === 'flat' ? info.h : Math.max(2.9, info.h));   // stands on the terrain backdrop
      const p = B.v('paint', true); const wc = srgb(...(info.roof === 'flat' ? [196, 188, 172] : [[214, 208, 194], [186, 178, 160], [160, 168, 170], [205, 196, 170]][b.id % 4])); p.setColor(wc[0], wc[1], wc[2]);
      if (info.roof === 'flat') for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; p.wall(a[0], a[1], c[0], c[1], y0, h); }
      else {   // houses on the slopes: the same windowed siding textures as the solid houses (no extra triangles)
        const hw = B.v('house' + (b.id % 8)); const K = Math.ceil((h - y0) / 2.9);
        for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) continue; const F = edgeFrame(a[0], a[1], c[0], c[1]); const yw = Math.max(y0, h - 5.8);   // windows on the top two storeys only; a downhill wall below that is plain foundation
          wallRect(hw, F, 0, L, yw, h, 0, L > 3.2 ? [0, 2 + (yw - h) * HOUSE_S[1], Math.max(1, Math.round(L / 4)), 2] : [0.02, 0.04, 0.2, 0.9]);
          if (yw > y0 + 0.05) { p.setColor(0.36, 0.35, 0.32); p.wall(a[0], a[1], c[0], c[1], y0, yw); p.setColor(wc[0], wc[1], wc[2]); } }
      }
      p.setColor(1, 1, 1);
      if (info.roof === 'flat') { const rr = gen.roofs; B.v('roofSat').poly(ring, null, h, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]); }
      else polyRoof(ctx, ring, h, Math.min(info.rise || 1.8, 3), { tint: tileTint(info.col), overhang: 0.4, noCollision: true });
      nCtx++; continue;
    }
    const ring = simplify(raw, 0.5); const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    (ctx.buildingRings = ctx.buildingRings || []).push(ring);
    const ov = OVERRIDE[b.id];
    if (ov) { kitWalls(ctx, ring, ov.h, ov.style); polyRoof(ctx, ring, ov.h, ov.rise, { tint: CLAY, overhang: 0.7 }); B.c('concrete').prism(ring, 0, ov.h, 1, true); nKit++; continue; }
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
