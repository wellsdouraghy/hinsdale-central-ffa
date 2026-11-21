// The blocks around Hamilton High: Castle Heights bungalows north and west, stucco apartment blocks south and east,
// the shops on Robertson Blvd. Inside the play area every OSM building is solid: footprint from the county data in
// OSM, height measured against the ground around its own footprint (gen.json, 3D tiles), and what it looks like from
// the street (storeys, wall material and colour, roof type and colour, shopfronts, signs, fences, garden trees) from
// Street View, building by building: facades.json, made by tools/streetview.py + tools/facades.py. Outside the play
// area only cheap context shells without collision.
import { ANG, CLAY, makeCanvas, canvasTexture, wallLadder, polyRoof, flatBuilding, storeyBlock, storeyWalls, hipRoof, minAreaOBB, tileTint, srgb, edgeFrame, quadFacing, wallRect, fbox, ensureCCW, signedArea, pointInRing, mulberry32, SKIN_BRICK, BRICK_S } from './kit.js';
import * as THREE from 'three';
import { eaveOverhang } from '../roofs.js';
import { SCHOOL_IDS } from './school.js';
import FACADES from './facades.json';

const FAC = FACADES.buildings;
const HOUSE_S = [1 / 4.0, 1 / 2.9];
// OSM footprints that overlap a neighbour (sheds drawn twice in the county data)
const SKIP = new Set([391094128, 424965579]);
const ROAD_HALF = { secondary: 10.0, tertiary: 5.75, residential: 4.8 };
const TILE_TINT = [5.4, 2.2, 1.2];   // LA mission tile on the Spanish bungalows (a little duller than Brown Hall's)

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

// wall bucket + texture scale + vertex tint for a facade record (colours in facades.json are sRGB as seen in Street View)
// Street View shows lit paint, not albedo: lift it (gamma 1.75 instead of 2.2) and take a little saturation out, or dark
// blues and greys come out near-black and oversaturated under the tone curve
const lit = (rgb) => { const c = rgb.map((v) => Math.pow(v / 255, 1.75)); const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return c.map((v) => v * 0.88 + l * 0.12); };
const roofTint = (rgb) => rgb.map((v) => Math.pow(v / 255, 1.55) / 0.2);   // multiplies the shingle texture (mean 0.2): LA roofs are sun-bleached
function wallOf(ctx, f) {
  const { B } = ctx; const c = lit(f.col);
  if (f.wall === 'siding') return { wb: B.v('hamSiding', true), key: 'hamSiding', S: 0.45, tint: c };
  if (f.wall === 'block') return { wb: B.v('hamBlock', true), key: 'hamBlock', S: 0.45, tint: c };
  if (f.wall === 'brick') return { wb: B.v('brick', true), key: 'brick', S: BRICK_S, tint: [c[0] / 0.3, c[1] / 0.3 * 1.25, c[2] / 0.3 * 1.5].map((v) => Math.min(1.25, Math.max(0.6, v))) };
  return { wb: B.v('stucco', true), key: 'stucco', S: 0.45, tint: c };
}
// true when another building stands against this wall (party walls of the shop rows, garages on the lot line)
function abuts(ctx, ring, F, out = 0.9) { for (const t of [0.2, 0.5, 0.8]) { const p = F.P(F.L * t, 0, out); if ((ctx.playRings || []).some((r) => r.id !== ring.id && pointInRing(p[0], p[2], r))) return true; } return false; }
function frontEdge(ring, f, minL = 3.2) { let best = null; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const F = edgeFrame(a[0], a[1], b[0], b[1]); if (F.L < minL) continue; const d = F.nx * f.front[0] + F.nz * f.front[1]; const sc = d * Math.min(F.L, 12); if (d > 0.5 && (!best || sc > best.sc)) best = { F, sc, i }; } return best; }
function garageDoor(ctx, F, c, w, col, y1 = 2.15) {
  const { B } = ctx; const p = B.v('paint', true); p.setColor(col[0], col[1], col[2]); fbox(p, F, c - w / 2, c + w / 2, 0.02, y1, 0, 0.045, 1, 0, 'fst'); p.setColor(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55);
  for (let y = 0.55; y < y1 - 0.2; y += 0.53) fbox(p, F, c - w / 2 + 0.04, c + w / 2 - 0.04, y, y + 0.025, 0.045, 0.052, 1, 0, 'f'); p.setColor(1, 1, 1);
  fbox(B.v('whitePanel'), F, c - w / 2 - 0.1, c + w / 2 + 0.1, y1, y1 + 0.12, 0, 0.06, 1, 0, 'fstb');
}

// balcony: concrete slab with an open railing (top rail, balusters), solid as one low box
function balcony(ctx, F, cx, y, railKey) {
  const { B } = ctx; const r = B.v(railKey); fbox(B.v('concrete'), F, cx - 1.5, cx + 1.5, y - 0.14, y, 0, 1.15, 1 / 3, 0, 'fstb');
  fbox(r, F, cx - 1.5, cx + 1.5, y + 0.96, y + 1.02, 1.08, 1.14, 1, 0, 'fstb'); for (const sd of [-1, 1]) fbox(r, F, cx + sd * 1.47 - 0.03, cx + sd * 1.47 + 0.03, y + 0.96, y + 1.02, 0, 1.08, 1, 0, 'fstb');
  for (let u = cx - 1.47; u <= cx + 1.48; u += 0.21) fbox(r, F, u - 0.012, u + 0.012, y, y + 0.96, 1.1, 1.124, 1, 0, 'fs'); for (const sd of [-1, 1]) for (let o = 0.2; o < 1.05; o += 0.21) fbox(r, F, cx + sd * 1.47 - 0.012, cx + sd * 1.47 + 0.012, y, y + 0.96, o, o + 0.024, 1, 0, 'fs');
  const cc = F.P(cx, y + 0.43, 0.58); B.c('metal:mesh').box(cc[0], y + 0.5, cc[2], 3.0, 1.0, 1.15, F.rotY); B.c('concrete').box(cc[0], y - 0.07, cc[2], 3.0, 0.14, 1.15, F.rotY);
}

// House / small apartment block / garage as Street View shows it: stucco, clapboard or brick walls in the real colour,
// windows per storey, a front door (or garage door) on the street side, chimney, hip / gable / mission-tile / flat roof.
function house(ctx, ring, info, f, b) {
  const { B } = ctx; const rnd = mulberry32((b.id % 99991) + 5); const garage = f.kind === 'garage'; const has = (k) => f.feat.includes(k); const modern = has('modern');
  const pitched = f.roof !== 'flat'; const eave = Math.max(2.5, f.h); const { wb, key, S, tint } = wallOf(ctx, f); const st = Math.max(1, f.st); const fh = pitched ? eave / st : (eave - 0.3) / st;
  const frameKey = modern || f.colName === 'white' && rnd() < 0.3 ? 'frame' : 'whitePanel'; const front = frontEdge(ring, f); let gi = Math.abs(Math.round(ring[0][0] * 3 + ring[0][1] * 5)) % 50;
  const acc = f.accent ? srgb(...f.accent) : null; const doorCol = acc || (modern ? [0.09, 0.09, 0.1] : [[0.3, 0.17, 0.09], [0.55, 0.52, 0.46], [0.16, 0.2, 0.3], [0.36, 0.1, 0.08]][Math.floor(rnd() * 4)]);
  let u = 0, side = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) continue;
    const F = edgeFrame(a[0], a[1], c[0], c[1]); const isFront = front && front.i === i; const party = abuts(ctx, ring, F);
    wb.setColor(tint[0], tint[1], tint[2]); wallRect(wb, F, 0, L, 0, eave, 0, [u * S, 0, (u + L) * S, eave * S]);
    fbox(B.v('concrete'), F, -0.03, L + 0.03, 0, 0.3, 0, 0.04, 1 / 3, u, 'fst');
    fbox(B.v(modern ? 'frame' : 'whitePanel'), F, -0.06, L + 0.06, eave - 0.2, eave + (pitched ? 0 : 0.06), 0, 0.06, 1, 0, 'fsb');
    B.v('groundDecal').quad(F.P(0, 0.025, 0.02), F.P(L, 0.025, 0.02), F.P(L, 0.025, 1.2), F.P(0, 0.025, 1.2), [0, 0], [1, 0], [1, 1], [0, 1]);
    const taken = [];
    if (isFront && !party) {
      if (garage || has('garage')) { const w = Math.min(garage ? 4.9 : 4.8, L - 1.0); const gc = garage ? L / 2 : Math.min(L - w / 2 - 0.5, L * 0.74); if (w > 2.2) { garageDoor(ctx, F, gc, w, modern ? [0.42, 0.26, 0.14] : [0.8, 0.79, 0.75]); taken.push([gc - w / 2 - 0.3, gc + w / 2 + 0.3]); } }
      if (!garage && L > 5) {   // front door with a stoop and a small porch roof (solid)
        const uc = has('garage') ? L * 0.26 : L * (0.38 + rnd() * 0.24); const wide = has('porch') ? 2.2 : 1.3; const pd = has('porch') ? 1.9 : 1.4;
        fbox(B.v(frameKey), F, uc - 0.62, uc + 0.62, 0.28, 2.42, 0, 0.05, 1, 0, 'fst'); { const p = B.v('paint', true); p.setColor(doorCol[0], doorCol[1], doorCol[2]); fbox(p, F, uc - 0.5, uc + 0.5, 0.3, 2.32, 0.05, 0.08, 1, 0, 'fst'); p.setColor(1, 1, 1); }
        fbox(B.v('concrete'), F, uc - wide, uc + wide, 0, 0.28, 0, pd - 0.1, 1 / 3, 0, 'fst'); const c0 = F.P(uc, 0.14, (pd - 0.1) / 2); B.c('concrete').box(c0[0], 0.14, c0[2], wide * 2, 0.28, pd - 0.1, F.rotY);
        if (has('awning')) { const awb = B.v('awning', true).setColor(0.5, 0.46, 0.38); quadFacing(awb, F.P(uc - 0.9, 2.95, 0.03), F.P(uc + 0.9, 2.95, 0.03), F.P(uc + 0.9, 2.45, 0.9), F.P(uc - 0.9, 2.45, 0.9), [F.nx, 1, F.nz]); awb.setColor(1, 1, 1); const cc = F.P(uc, 2.7, 0.45); B.c('wood').box(cc[0], cc[1], cc[2], 1.8, 0.5, 0.9, F.rotY); }
        else { fbox(B.v(frameKey), F, uc - wide - 0.2, uc + wide + 0.2, 2.6, 2.76, 0, pd, 1, 0, 'fstb'); const pr = F.P(uc, 2.68, pd / 2); B.c('wood').box(pr[0], 2.68, pr[2], wide * 2 + 0.4, 0.16, pd, F.rotY);
          if (has('porch')) for (const s of [-1, 1]) { const pp = F.P(uc + s * wide, 0, pd - 0.15); B.v(frameKey).box(pp[0], 1.44, pp[2], 0.12, 2.32, 0.12, F.rotY); B.c('wood').box(pp[0], 1.44, pp[2], 0.16, 2.32, 0.16, F.rotY); } }
        taken.push([uc - wide - 0.3, uc + wide + 0.3]);
      }
    } else if (!party && front && Math.abs(F.nx * f.front[0] + F.nz * f.front[1]) < 0.4 && (!side || L > side.L)) side = { F, L, u };
    // windows: one per ~3.7 m of wall on every storey (not on party walls, not on garages except a small side light)
    if (!party && L > 3.2 && !(garage && (isFront || L < 5))) {
      const n = Math.max(1, Math.round(L / (garage ? 6 : 3.7))); const w2 = (garage ? 0.45 : Math.min(1.5, L / n - 1.1) / 2);
      for (let k = 0; k < n; k++) { const cx = (k + 0.5) * L / n; if (taken.some(([t0, t1]) => cx + w2 + 0.3 > t0 && cx - w2 - 0.3 < t1)) { if (st < 2) continue; }
        for (let s = 0; s < st; s++) { if (s === 0 && taken.some(([t0, t1]) => cx + w2 + 0.3 > t0 && cx - w2 - 0.3 < t1)) continue; const y0 = s * fh + (garage ? 1.3 : 0.98), y1 = y0 + (garage ? 0.7 : Math.min(1.3, fh - 1.5));
          fbox(B.v(frameKey), F, cx - w2 - 0.07, cx + w2 + 0.07, y0 - 0.07, y1 + 0.07, 0, 0.045, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, cx - w2, cx + w2, y0, y1, 0.05, [gi + 1, 2, gi, 3]); gi++;
          if (w2 > 0.5) fbox(B.v(frameKey), F, cx - 0.025, cx + 0.025, y0, y1, 0.05, 0.068, 1, 0, 'fs'); fbox(B.v(frameKey), F, cx - w2 - 0.12, cx + w2 + 0.12, y0 - 0.17, y0 - 0.07, 0, 0.09, 1, 0, 'fstb');
          if (acc && !modern && isFront) { const p = B.v('paint', true); p.setColor(acc[0], acc[1], acc[2]); for (const sd of [-1, 1]) fbox(p, F, cx + sd * (w2 + 0.26) - 0.17, cx + sd * (w2 + 0.26) + 0.17, y0 - 0.04, y1 + 0.04, 0, 0.035, 1, 0, 'fstb'); p.setColor(1, 1, 1); } }
        if (has('balcony') && isFront && st > 1 && k % 2 === 0) for (let s = 1; s < st; s++) { const y = s * fh; balcony(ctx, F, cx, y, frameKey); }
      }
    }
    if (f.base && isFront) { const bc = srgb(...f.base); const p = f.base[0] === 168 && f.base[1] === 92 ? B.v('brick', true) : B.v('paint', true); p.setColor(bc[0], bc[1], bc[2]); if (p === B.v('brick', true)) p.setColor(1.05, 0.88, 0.76); fbox(p, F, 0, L, 0.3, 0.9, 0, 0.035, BRICK_S, u, 'ft'); p.setColor(1, 1, 1); }
    u += L;
  }
  wb.setColor(1, 1, 1);
  // chimney on a side wall (brick, or stucco in the wall colour on the Spanish houses), solid
  if (has('chimney') && side && pitched) { const F = side.F; const uc = side.L * 0.36; const top = eave + 2.1; const tile = f.roof === 'tile'; const cb = B.v(tile ? key : 'brick', true); if (tile) cb.setColor(tint[0], tint[1], tint[2]); else cb.setColor(1.05, 0.86, 0.74);
    fbox(cb, F, uc - 0.5, uc + 0.5, 0, top, 0, 0.5, tile ? S : BRICK_S, 0, 'fst'); cb.setColor(1, 1, 1); const cc = F.P(uc, top / 2, 0.25); B.c('brick').box(cc[0], cc[1], cc[2], 1.0, top, 0.5, F.rotY); }
  if (pitched) {
    const rtint = f.roof === 'tile' ? TILE_TINT : roofTint(f.roofCol); const o = minAreaOBB(ring); const fillR = Math.abs(signedArea(ring)) / Math.max(1, o.area);
    const rise = garage ? 1.0 : f.roof === 'tile' ? 1.35 : info.roof !== 'flat' ? Math.min(Math.max(info.rise || 1.6, 1.2), st > 1 ? 2.2 : 2.6) : 1.25;   // what the 3D tiles call "flat" here is a low-pitched LA roof
    const ov = (want) => eaveOverhang(ring, ctx.playRings || [], want);   // narrower eaves next to a neighbour: no wedge between two roofs
    if (fillR > 0.9) hipRoof(ctx, ring, eave, rise, { tint: rtint, overhang: ov(garage ? 0.3 : 0.5), gable: f.roof === 'gable' || (f.roof === 'tile' && (b.id & 1) === 0), gableBucket: key, gableTint: tint });
    else polyRoof(ctx, ring, eave, Math.min(rise, 2.4), { tint: rtint, overhang: ov(0.35) });   // L / T plans: closed hip roofs over the plan's rectangles, attics solid (kit polyRoof)
    B.c('wood').prism(ring, 0, eave, 1, true);
  } else {
    // flat-roofed house / garage: thin fascia, bitumen roof you can stand on; a clay coping where Street View shows one
    const rr = ctx.gen.roofs; B.v('roofSat').poly(ring, null, eave, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]);
    B.c('wood').prism(ring, 0, eave, 1, false); B.c('concrete').poly(ring, null, eave); (ctx.townFlats = ctx.townFlats || []).push({ ring, roofY: eave, area: info.area, par: 0.06 });
  }
}

// apartment block with a flat roof: rows of windows per floor, parapet, and on the street side what Street View shows
// (balconies, garage doors or the open carport of a 1960s "dingbat", an accent fascia)
function apartments(ctx, ring, info, f, b) {
  const { B } = ctx; const rnd = mulberry32((b.id % 99991) + 9); const has = (k) => f.feat.includes(k); const { key, tint } = wallOf(ctx, f); const h = Math.max(4.0, f.h); const st = Math.max(1, f.st);
  const o = storeyBlock(ctx, ring, h, { key, tint, storeys: st, bay: 3.5 + rnd() * 0.8, winW: 1.6 + rnd() * 0.6, winH: 1.4, sill: 0.95, frame: has('modern') || rnd() < 0.5 ? 'frameAlu' : 'frame', trim: 'whitePanel', bands: st > 1 && !has('modern'), doors: st > 1, units: info.area > 450 ? 2 : 0, register: false, surface: 'concrete' });
  const acc = f.accent ? srgb(...f.accent) : null; const fh = (h - 0.8) / st; const front = frontEdge(o.ring, f, 6); const p = B.v('paint', true);
  for (let i = 0; i < o.ring.length; i++) {
    const a = o.ring[i], c = o.ring[(i + 1) % o.ring.length]; const F = edgeFrame(a[0], a[1], c[0], c[1]); const L = F.L; if (L < 1) continue;
    if (acc) { p.setColor(acc[0], acc[1], acc[2]); fbox(p, F, -0.1, L + 0.1, h - 0.8, h - 0.14, 0.1, 0.125, 1, 0, 'fsb'); }
    if (!front || front.i !== i || abuts(ctx, ring, F)) continue;
    const n = Math.max(1, Math.floor((L - 1.2) / 3.4));
    if (f.kind === 'dingbat' || has('garage')) for (let k = 0; k < n; k++) { const u0 = 0.6 + k * (L - 1.2) / n + 0.25, u1 = 0.6 + (k + 1) * (L - 1.2) / n - 0.25; if (u1 - u0 < 2) continue;
      if (f.kind === 'dingbat') { fbox(B.v('blackMetal'), F, u0, u1, 0.03, Math.min(2.6, fh - 0.35), 0, 0.1, 1, 0, 'fstb'); const pp = F.P(u0 - 0.25, 0, 0.14); B.v('whitePanel').box(pp[0], fh / 2, pp[2], 0.16, fh, 0.16, F.rotY); }
      else { p.setColor(0.8, 0.79, 0.75); fbox(p, F, u0, u1, 0.03, Math.min(2.2, fh - 0.5), 0, 0.1, 1, 0, 'fstb'); p.setColor(0.42, 0.42, 0.4); for (let y = 0.55; y < 2.0; y += 0.53) fbox(p, F, u0 + 0.04, u1 - 0.04, y, y + 0.025, 0.1, 0.106, 1, 0, 'f'); } }
    if (has('balcony') && st > 1) for (let k = 0; k < n; k += 2) { const cx = 0.6 + (k + 0.5) * (L - 1.2) / n; for (let s = 1; s < st; s++) { const y = s * fh; balcony(ctx, F, cx, y, 'blackMetal'); } }
  }
  p.setColor(1, 1, 1);
  return { ring: o.ring, roofY: o.roofY, area: info.area };
}

// multi-storey car park (Robertson Blvd at Kincardine Ave): white concrete decks with dark open bands between them
function carPark(ctx, ring, info, f) {
  const { B } = ctx; const h = Math.max(8, f.h); const { key, tint } = wallOf(ctx, { ...f, wall: 'stucco' }); const n = Math.max(2, Math.round(h / 3.3)); const all = ring.map((_, i) => i);
  const o = storeyBlock(ctx, ring, h, { key, tint, storeys: n, plainEdges: all, bands: false, doors: false, units: 2, register: false, surface: 'concrete' }); const fh = (h - 0.8) / n;
  for (let i = 0; i < o.ring.length; i++) { const a = o.ring[i], c = o.ring[(i + 1) % o.ring.length]; const F = edgeFrame(a[0], a[1], c[0], c[1]); if (F.L < 3 || abuts(ctx, ring, F)) continue; for (let s = 0; s < n; s++) fbox(B.v('blackMetal'), F, 0.5, F.L - 0.5, s * fh + 1.25, (s + 1) * fh - 0.35, 0, 0.03, 1, 0, 'f'); }
  return { ring: o.ring, roofY: o.roofY, area: info.area };
}

// Robertson Blvd shop: shopfront band at street level (or service bays / a blank wall, as Street View shows), sign
// fascia with the real name where one could be read, stucco or brick above, cornice, flat satellite roof
function shop(ctx, ring, info, f, b) {
  const { B, gen } = ctx; const h = Math.max(4.2, f.h); const roofY = h - 0.45; const rr = gen.roofs; const has = (k) => f.feat.includes(k);
  const brick = f.wall === 'brick'; const { wb, S, tint } = wallOf(ctx, f); const two = f.st >= 2 && h > 6.4; const aw = f.awning ? srgb(...f.awning) : null; const acc = f.accent ? srgb(...f.accent) : null; const base = f.base ? srgb(...f.base) : null;
  let u = 0; const rd = mulberry32((b.id % 100003) + 17); const paint = B.v('paint', true); const dark = [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) continue;
    const F = edgeFrame(a[0], a[1], c[0], c[1]); const party = abuts(ctx, ring, F);
    const mid = F.P(L / 2, 0, 3.0); const open = !party && ctx.surfaceAt(mid[0], mid[2]) !== 'grass'; const far = F.P(L / 2, 0, 11);
    const front = !has('blank') && L > 5 && open && ((F.nx * f.front[0] + F.nz * f.front[1]) > 0.7 || (f.roadClass === 'secondary' && Math.abs(F.nx) > 0.6 && ctx.surfaceAt(far[0], far[2]) === 'asphalt'));
    wb.setColor(tint[0], tint[1], tint[2]);
    if (front) {
      const n = Math.max(1, Math.round(L / 4.2));
      if (has('bays')) { wallRect(wb, F, 0, L, 0, 3.4, 0, [u * S, 0, (u + L) * S, 3.4 * S]); for (let k = 0; k < n; k++) fbox(B.v('blackMetal'), F, k * L / n + 0.35, (k + 1) * L / n - 0.35, 0.02, 3.1, 0, 0.03, 1, 0, 'f'); }
      else wallRect(B.v('storefront'), F, 0.25, L - 0.25, 0, 3.4, 0.02, [n, 0, 0, 1]);
      wallRect(wb, F, 0, L, 3.4, h, 0, [u * S, 3.4 * S, (u + L) * S, h * S]);
      fbox(wb, F, 0, 0.3, 0, 3.4, 0, 0.06, S, u, 'fs'); fbox(wb, F, L - 0.3, L, 0, 3.4, 0, 0.06, S, u, 'fs');
      if (base && !has('bays')) { paint.setColor(base[0], base[1], base[2]); fbox(paint, F, 0.3, L - 0.3, 0, 0.62, 0.02, 0.06, 1, 0, 'ft'); }
      // sign fascia: the name Street View shows, or a plain painted band
      paint.setColor(...(f.sign ? [0.1 + dark[0] * 0.2, 0.1 + dark[1] * 0.2, 0.1 + dark[2] * 0.2] : [tint[0] * 0.82, tint[1] * 0.82, tint[2] * 0.82])); fbox(paint, F, 0.3, L - 0.3, 3.4, 4.0, 0, 0.08, 1, 0, 'fstb');
      if (f.sign) { const sw = Math.min(L - 1.0, 7.5), uv = ctx.signCell(f.sign); wallRect(B.v('shopSigns'), F, L / 2 - sw / 2, L / 2 + sw / 2, 3.44, 3.96, 0.09, [uv[2], uv[1], uv[0], uv[3]]); }
      if (acc) { paint.setColor(acc[0], acc[1], acc[2]); fbox(paint, F, 0, L, 4.0, 4.16, 0, 0.09, 1, 0, 'fstb'); }
      if (aw || has('pent')) {   // fabric awning, or the tiled pent roof over the shopfront (double-sided canopy bucket: never a see-through roof skin)
        const awb = B.v('awning', true); const col = aw || srgb(...f.roofCol); awb.setColor(col[0], col[1], col[2]); const d = has('pent') ? 1.1 : 1.35, y0 = has('pent') ? 4.0 : 3.3, y1 = has('pent') ? 3.25 : 2.65;
        quadFacing(awb, F.P(0.2, y0, 0.05), F.P(L - 0.2, y0, 0.05), F.P(L - 0.2, y1, d), F.P(0.2, y1, d), [F.nx, 1, F.nz]); quadFacing(awb, F.P(0.2, y1, d), F.P(L - 0.2, y1, d), F.P(L - 0.2, y1 - 0.22, d), F.P(0.2, y1 - 0.22, d), [F.nx, 0, F.nz]); awb.setColor(1, 1, 1);
        const cc = F.P(L / 2, (y0 + y1) / 2 - 0.1, d / 2); B.c('wood').box(cc[0], cc[1], cc[2], L - 0.4, y0 - y1 + 0.2, d, F.rotY); }
      if (two) { const m = Math.max(1, Math.floor((L - 1) / 3.2)); for (let k = 0; k < m; k++) { const uc = (k + 0.5) * L / m; fbox(B.v('frame'), F, uc - 0.85, uc + 0.85, 4.9, 6.3, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, uc - 0.78, uc + 0.78, 4.97, 6.23, 0.055, [900 + i * 7 + k + 1, 2, 900 + i * 7 + k, 3]); fbox(B.v('whitePanel'), F, uc - 0.95, uc + 0.95, 4.78, 4.9, 0, 0.1, 1 / 3, 0, 'fstb'); } }
    } else {
      wallRect(wb, F, 0, L, 0, h, 0, [u * S, 0, (u + L) * S, h * S]);
      if (acc && has('blank')) { paint.setColor(acc[0], acc[1], acc[2]); fbox(paint, F, 0, L, h * 0.62, h * 0.62 + 0.22, 0, 0.02, 1, 0, 'f'); }
      // side / rear walls that face open ground: painted dado, the odd service door, high windows, a downpipe. Never on a party wall.
      if (!party && open && L > 4.5 && !has('blank')) {
        const taken = [];
        if (L > 7 && rd() < 0.5) { const uc = L * (0.25 + rd() * 0.5); fbox(B.v('frame'), F, uc - 0.55, uc + 0.55, 0, 2.15, 0, 0.05, 1, 0, 'fst'); taken.push([uc - 0.8, uc + 0.8]); paint.setColor(0.3, 0.31, 0.32); fbox(paint, F, uc - 0.46, uc + 0.46, 0.03, 2.06, 0.05, 0.075, 1, 0, 'f'); fbox(B.v('lightEmit'), F, uc - 0.16, uc + 0.16, 2.3, 2.4, 0, 0.12, 1, 0, 'fsb'); }
        wb.setColor(tint[0] * 0.62, tint[1] * 0.62, tint[2] * 0.62); fbox(wb, F, 0, L, 0, 1.05, 0, 0.03, S, u, 'ft'); wb.setColor(tint[0], tint[1], tint[2]);
        const free = (x0, x1) => x0 > 0.5 && x1 < L - 0.7 && !taken.some(([t0, t1]) => x1 > t0 && x0 < t1);
        const g = Math.floor(L / 5.5); for (let k = 0; k < g; k++) { const uc = (k + 0.5) * L / g + (rd() - 0.5) * 0.8; if (!free(uc - 0.8, uc + 0.8) || rd() < 0.25) continue; fbox(B.v('frame'), F, uc - 0.7, uc + 0.7, 1.95, 2.95, 0, 0.05, 1, 0, 'fstb'); wallRect(B.v('glassInt'), F, uc - 0.63, uc + 0.63, 2.02, 2.88, 0.055, [960 + i * 5 + k + 1, 0.2, 960 + i * 5 + k, 0.8]); }
        fbox(B.v('galv'), F, L - 0.5, L - 0.39, 0.12, h - 0.5, 0, 0.11, 1, 0, 'fs');
      }
    }
    if (!party) B.v('groundDecal').quad(F.P(0, 0.025, 0.02), F.P(L, 0.025, 0.02), F.P(L, 0.025, 1.4), F.P(0, 0.025, 1.4), [0, 0], [1, 0], [1, 1], [0, 1]);
    // cornice + parapet with thickness
    fbox(B.v(brick ? 'limestone' : 'whitePanel'), F, -0.06, L + 0.06, h - 0.3, h, 0, 0.08, 1 / 3, u, 'fstb');
    quadFacing(B.v('frame'), F.P(-0.1, h + 0.02, 0.1), F.P(L + 0.1, h + 0.02, 0.1), F.P(L, h + 0.02, -0.3), F.P(0, h + 0.02, -0.3), [0, 1, 0]);
    quadFacing(B.v('concrete'), F.P(0, roofY, -0.3), F.P(L, roofY, -0.3), F.P(L, h + 0.02, -0.3), F.P(0, h + 0.02, -0.3), [-F.nx, 0, -F.nz]);
    const pc = F.P(L / 2, (roofY + h) / 2, -0.15); B.c('concrete').box(pc[0], pc[1], pc[2], L, h - roofY, 0.3, F.rotY);
    u += L;
  }
  wb.setColor(1, 1, 1); paint.setColor(1, 1, 1); B.v('awning', true).setColor(1, 1, 1);
  B.v('roofSat').poly(ring, null, roofY, (x, z) => [(x - rr.minX) / (rr.maxX - rr.minX), 1 - (z - rr.minZ) / (rr.maxZ - rr.minZ)]);
  B.c('brick').prism(ring, 0, roofY, 1, false); B.c('concrete').poly(ring, null, roofY);
  if (info.area > 500) { const o = minAreaOBB(ring); const cu = (o.u0 + o.u1) / 2, cv = (o.v0 + o.v1) / 2; for (const d of [-0.22, 0.2]) { const uu = cu + (o.u1 - o.u0) * d, x = uu * o.tx - cv * o.tz, z = uu * o.tz + cv * o.tx; B.v('galv').box(x, roofY + 0.75, z, 2.6, 1.5, 1.8, -ANG); B.c('metal').box(x, roofY + 0.75, z, 2.6, 1.5, 1.8, -ANG); } }
  return { ring, roofY, area: info.area };
}

// Front yards as Street View shows them: the fence / wall / hedge on the property line behind the sidewalk (low and
// solid), and the garden trees that give the street its look (fan palms, Italian cypresses, jacarandas: planted by
// grounds.js from ctx.yardTrees). Only on lawn, clear of buildings, trees, the flag bases and the helicopter pads.
function yards(ctx, list) {
  const { B, playBounds: pb } = ctx; const keep = ctx.keepClear || []; const trees = ctx.gen.trees || []; const out = (ctx.yardTrees = { palm: [], cypress: [], jacaranda: [] }); let nF = 0;
  const ok = (x, z, m = 0.7) => x > pb.minX + 2 && x < pb.maxX - 2 && z > pb.minZ + 2 && z < pb.maxZ - 2 && (ctx.surfaceAt(x, z) === 'grass' || ctx.surfaceAt(x, z) === 'dirt') && !keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r + 1) && !(ctx.playRings || []).some((r) => pointInRing(x, z, r) || pointInRing(x + m, z, r) || pointInRing(x - m, z, r) || pointInRing(x, z + m, r) || pointInRing(x, z - m, r));
  const clearOfTrees = (x, z, d) => !trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < d);
  for (const { ring, f, b } of list) {
    if (!f.fence && !f.trees.length) continue; const half = ROAD_HALF[f.roadClass] || 4.8;
    const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]); const fx = f.front[0], fz = f.front[1], tx = -fz, tz = fx; let lo = 1e9, hi = -1e9;
    for (const p of ring) { const s = (p[0] - c[0]) * tx + (p[1] - c[1]) * tz; lo = Math.min(lo, s); hi = Math.max(hi, s); } lo = Math.max(lo - 1.2, -10); hi = Math.min(hi + 1.2, 10);
    const P = (s, d) => [c[0] + fx * d + tx * s, c[1] + fz * d + tz * s]; const rnd = mulberry32((b.id % 99991) + 3);
    // the property line: the lawn edge behind the sidewalk (3.5 - 6.5 m from the kerb, wherever most of the frontage is grass)
    let depth = 0, bestN = 0; for (const o of [4.6, 3.8, 5.4, 6.2, 3.2]) { const d = f.roadDist - half - o; if (d < 2.5) continue; let n = 0; for (let s = lo; s <= hi; s += 1) { const p = P(s, d); if (ok(p[0], p[1])) n++; } if (n > bestN) { bestN = n; depth = d; } }
    if (bestN < 3) continue;
    if (f.fence) {
      const runs = []; let run = null;
      for (let s = lo; s <= hi + 0.01; s += 0.5) { const p = P(s, depth); if (ok(p[0], p[1]) && clearOfTrees(p[0], p[1], 1.0)) { if (!run) run = [s, s]; run[1] = s; } else { if (run && run[1] - run[0] >= 2.5) runs.push(run); run = null; } }
      if (run && run[1] - run[0] >= 2.5) runs.push(run);
      for (const [s0, s1] of runs) {
        const a = P(s0, depth), e = P(s1, depth), m = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2], L = s1 - s0, rot = Math.atan2(-tz, tx);
        if ((ctx.yardFences = ctx.yardFences || []).some((q) => Math.hypot(q[1] - m[0], q[2] - m[1]) < Math.max(4, (q[3] + L) / 2 - 1))) continue;   // two buildings of one parcel share the frontage
        nF++; ctx.yardFences.push([f.fence, Math.round(m[0]), Math.round(m[1]), Math.round(L)]);
        const post = (key, s, w, h) => { const q = P(s, depth); B.v(key).box(q[0], h / 2, q[1], w, h, w, rot); };
        if (f.fence === 'hedge') { ctx.shrubs.push([m[0], 0.02, m[1], L, 1.05, rot]); B.c('wood').box(m[0], 0.5, m[1], L, 1.0, 0.7, rot); }
        else if (f.fence === 'block') { const wbk = B.v('hamBlock', true); wbk.setColor(0.62, 0.6, 0.55); wbk.box(m[0], 0.5, m[1], L, 1.0, 0.2, rot, 0.45); wbk.setColor(1, 1, 1); B.v('concrete').box(m[0], 1.03, m[1], L + 0.06, 0.06, 0.28, rot, 1 / 3); B.c('concrete').box(m[0], 0.53, m[1], L, 1.06, 0.22, rot); }
        else if (f.fence === 'brick') { const bk = B.v('brick', true); bk.setColor(1.05, 0.86, 0.74); bk.box(m[0], 0.3, m[1], L, 0.6, 0.22, rot, BRICK_S); for (let s = s0; s <= s1 + 0.01; s += Math.max(2.2, L / Math.max(1, Math.round(L / 2.6)))) { const q = P(s, depth); bk.box(q[0], 0.6, q[1], 0.38, 1.2, 0.38, rot, BRICK_S); } bk.setColor(1, 1, 1);
          for (const y of [0.75, 1.1]) B.v('blackMetal').box(m[0], y, m[1], L, 0.03, 0.03, rot); for (let s = s0 + 0.2; s < s1; s += 0.2) post('blackMetal', s, 0.02, 1.12); B.c('brick').box(m[0], 0.6, m[1], L, 1.2, 0.24, rot); }
        else if (f.fence === 'iron') { for (const y of [0.18, 1.12]) B.v('blackMetal').box(m[0], y, m[1], L, 0.035, 0.035, rot); for (let s = s0; s <= s1 + 0.01; s += 0.16) post('blackMetal', s, 0.02, 1.25); for (let s = s0; s <= s1 + 0.01; s += L / Math.max(1, Math.round(L / 2.4))) post('blackMetal', s, 0.06, 1.35); B.c('metal:mesh').box(m[0], 0.65, m[1], L, 1.3, 0.08, rot); }
        else if (f.fence === 'wood') { const wv = B.v('paint', true); wv.setColor(0.36, 0.25, 0.16); for (let y = 0.12; y < 1.5; y += 0.17) wv.box(m[0], y + 0.07, m[1], L, 0.14, 0.03, rot); wv.setColor(0.3, 0.2, 0.13); for (let s = s0; s <= s1 + 0.01; s += L / Math.max(1, Math.round(L / 2.2))) { const q = P(s, depth); wv.box(q[0], 0.8, q[1], 0.1, 1.6, 0.1, rot); } wv.setColor(1, 1, 1); B.c('wood').box(m[0], 0.8, m[1], L, 1.6, 0.1, rot); }
        else { // white picket / vinyl
          const vinyl = f.fence === 'vinyl'; const hgt = vinyl ? 1.5 : 1.0; if (vinyl) B.v('whitePanel').box(m[0], hgt / 2 + 0.04, m[1], L, hgt - 0.08, 0.04, rot); else { for (const y of [0.3, 0.75]) B.v('whitePanel').box(m[0], y, m[1], L, 0.07, 0.03, rot); for (let s = s0 + 0.06; s < s1; s += 0.16) post('whitePanel', s, 0.085, 1.0); }
          for (let s = s0; s <= s1 + 0.01; s += L / Math.max(1, Math.round(L / 2.4))) post('whitePanel', s, 0.11, hgt + 0.08); B.c('wood').box(m[0], hgt / 2, m[1], L, hgt, 0.08, rot);
        }
      }
    }
    // garden trees: between the fence line and the house
    f.trees.forEach((kind, k) => { for (const tryS of [k % 2 ? hi - 1.5 : lo + 1.5, 0, k % 2 ? lo + 1.5 : hi - 1.5, k % 2 ? hi - 4 : lo + 4, k % 2 ? lo + 4 : hi - 4]) { const d = Math.max(2.2, depth - 2.2 - rnd() * 1.5); const p = P(tryS + (rnd() - 0.5), d);
      if (!ok(p[0], p[1], 1.1) || !clearOfTrees(p[0], p[1], kind === 'jacaranda' ? 4.5 : 2.4) || Object.values(out).some((l) => l.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 4))) continue; out[kind].push([p[0], p[1]]); if (kind === 'cypress') { const q = P(tryS + (tryS > 0 ? -1.6 : 1.6), d); if (ok(q[0], q[1], 1.2) && clearOfTrees(q[0], q[1], 2)) out.cypress.push([q[0], q[1]]); } break; } });
  }
  return nF;
}

// One texture atlas for the shop signs (4 x 10 cells): the names Street View shows on the fascias.
const SIGN_COLS = 4, SIGN_ROWS = 10;
function signAtlas(ctx, names) {
  const W = 2048, H = 1024, cw = W / SIGN_COLS, ch = H / SIGN_ROWS; const c = makeCanvas(W, H), g = c.getContext('2d'); const rnd = mulberry32(44);
  const pal = [['#1f2a36', '#f2ead8'], ['#7a1b16', '#f6efe0'], ['#efe8d6', '#2a2520'], ['#1e3a2b', '#e9e2c8'], ['#2b2b2e', '#e8b84a'], ['#e8dcc0', '#7a1b16'], ['#23324f', '#ffffff'], ['#f4f1ea', '#1f3d5c']];
  const fonts = ['Georgia, serif', '"Trebuchet MS", Arial, sans-serif', 'Futura, "Century Gothic", sans-serif', '"Times New Roman", serif'];
  names.slice(0, SIGN_COLS * SIGN_ROWS).forEach((nm, i) => {
    const x = (i % SIGN_COLS) * cw, y = Math.floor(i / SIGN_COLS) * ch; const [bg, fg] = pal[Math.floor(rnd() * pal.length)];
    g.fillStyle = bg; g.fillRect(x, y, cw, ch); g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(x + 8, y + 8, cw - 16, ch - 16); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(ch * 0.5)}px ${fonts[Math.floor(rnd() * fonts.length)]}`;
    g.fillText(nm.toUpperCase().slice(0, 24), x + cw / 2, y + ch / 2 + 2, cw - 40);
  });
  ctx.M.shopSigns = new THREE.MeshStandardMaterial({ map: canvasTexture(c, { repeat: false, aniso: ctx.T.aniso }), roughness: 0.7 });
  return (i) => { const cx = i % SIGN_COLS, cy = Math.floor(i / SIGN_COLS); return [cx / SIGN_COLS, 1 - (cy + 1) / SIGN_ROWS, (cx + 1) / SIGN_COLS, 1 - cy / SIGN_ROWS]; };
}
// LADWP Distributing Station 20 (1934) on the west edge of campus: a windowless two-storey brick box
const BRICKBOX = { 424941113: 8.4 };

export function buildTown(ctx) {
  const { B, data, gen } = ctx;
  let nHouse = 0, nShop = 0, nKit = 0, nCtx = 0; const flats = []; const built = [];
  const signNames = [...new Set(Object.values(FAC).map((f) => f.sign).filter(Boolean))]; const signUV = signAtlas(ctx, signNames); ctx.signCell = (name) => signUV(Math.max(0, signNames.indexOf(name)));
  // every solid footprint, known before the first house is roofed (eaveOverhang looks at the neighbours on both sides)
  ctx.playRings = [...(ctx.buildingRings || [])];
  for (const b of data.buildings) { const info = gen.buildings[String(b.id)]; const raw = b.outer[0]; if (!info || !info.play || SCHOOL_IDS.has(b.id) || SKIP.has(b.id) || raw.length < 3 || Math.abs(signedArea(raw)) < 14) continue; const r = simplify(raw, 0.5); r.id = b.id; ctx.playRings.push(r); }
  const ringOf = new Map(ctx.playRings.filter((r) => r.id).map((r) => [r.id, r]));
  for (const b of data.buildings) {
    if (SCHOOL_IDS.has(b.id) || SKIP.has(b.id)) continue;
    const info = gen.buildings[String(b.id)]; if (!info) continue;
    const raw = b.outer[0]; if (raw.length < 3 || Math.abs(signedArea(raw)) < 14) continue;
    if (!info.play) {
      // context shell: plain walls + roof, no collision
      const ring = simplify(raw, 1.0); const y0 = -0.1; const h = (info.yTop || 0) + (info.roof === 'flat' ? info.h : Math.max(2.9, info.h));   // stands on the terrain backdrop
      const p = B.v('paint', true); const wc = srgb(...(info.roof === 'flat' ? [196, 188, 172] : [[214, 208, 194], [186, 178, 160], [160, 168, 170], [205, 196, 170]][b.id % 4])); p.setColor(wc[0], wc[1], wc[2]);
      if (info.roof === 'flat') for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; p.wall(a[0], a[1], c[0], c[1], y0, h); }
      else {   // houses on the slopes: the same windowed siding textures as the solid houses (no extra triangles)
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
    const ring = ringOf.get(b.id) || simplify(raw, 0.5); ring.id = b.id;
    (ctx.buildingRings = ctx.buildingRings || []).push(ring);
    if (BRICKBOX[b.id]) { const h = BRICKBOX[b.id]; const f = flatBuilding(ctx, ring, h, 'hamTownBrick', { skin: SKIN_BRICK, surface: 'brick', units: 2 }); flats.push({ ring: f.ring, roofY: f.roofY, area: info.area }); nKit++;
      // Street View: an Art Deco brick box, fluted brick piers, a tall doorway with a cast-stone surround and relief panel up a flight of steps, two tall narrow windows
      const fe = FAC[String(b.id)] && frontEdge(f.ring, FAC[String(b.id)], 8); if (fe) { const F = fe.F, L = F.L, ls = B.v('limestone'), bk = B.v('brick', true); bk.setColor(1.0, 0.82, 0.7);
        for (const u of [0.5, L * 0.25, L * 0.4, L * 0.6, L * 0.75, L - 0.5]) fbox(bk, F, u - 0.35, u + 0.35, 0, h - 0.5, 0, 0.14, BRICK_S, u, 'fs'); bk.setColor(1, 1, 1);
        fbox(ls, F, L / 2 - 1.5, L / 2 + 1.5, 0, 5.4, 0, 0.2, 1 / 3, 0, 'fst'); fbox(B.v('blackMetal'), F, L / 2 - 0.85, L / 2 + 0.85, 0.9, 3.5, 0.2, 0.23, 1, 0, 'f'); fbox(ls, F, L / 2 - 0.7, L / 2 + 0.7, 3.9, 5.0, 0.2, 0.3, 1 / 3, 0, 'fstb'); fbox(ls, F, -0.05, L + 0.05, h - 1.3, h - 1.05, 0, 0.16, 1 / 3, 0, 'fstb');
        for (const sd of [-1, 1]) { const u = L / 2 + sd * L * 0.17; fbox(ls, F, u - 0.55, u + 0.55, 2.0, 5.2, 0, 0.08, 1 / 3, 0, 'fstb'); fbox(B.v('blackMetal'), F, u - 0.4, u + 0.4, 2.2, 4.6, 0.08, 0.1, 1, 0, 'f'); }
        for (let k = 0; k < 3; k++) fbox(B.v('concrete'), F, L / 2 - 2.6 + k * 0.3, L / 2 + 2.6 - k * 0.3, 0, 0.9 - k * 0.3, 0.2 + (2 - k) * 0, 1.2 + (2 - k) * 0.35, 1 / 3, 0, 'fst');
        const c0 = F.P(L / 2, 0.45, 0.6); B.c('concrete').box(c0[0], 0.45, c0[2], 4.6, 0.9, 1.2, F.rotY); quadFacing(B.c('concrete'), F.P(L / 2 - 2.6, 0.9, 1.2), F.P(L / 2 + 2.6, 0.9, 1.2), F.P(L / 2 + 2.6, 0, 2.6), F.P(L / 2 - 2.6, 0, 2.6), [0, 1, 0]); }
      continue; }
    const f = FAC[String(b.id)] || { kind: 'house', st: 1, wall: 'stucco', col: [224, 211, 180], colName: 'cream', roof: info.roof === 'flat' ? 'flat' : 'hip', roofCol: [118, 118, 116], h: info.roof === 'flat' ? info.h : 3.0, front: [1, 0], roadDist: 99, trees: [], feat: [] };
    built.push({ ring, f, b });
    if (f.kind === 'shop' || f.kind === 'gas') { flats.push(shop(ctx, ring, info, f, b)); nShop++; }
    else if (f.kind === 'parking') { flats.push(carPark(ctx, ring, info, f)); nKit++; }
    else if (f.roof === 'flat' && (f.kind === 'apt' || f.kind === 'dingbat') && f.h > 4.4) { flats.push(apartments(ctx, ring, info, f, b)); nKit++; }
    else { house(ctx, ring, info, f, b); nHouse++; }
  }
  flats.push(...(ctx.townFlats || []));
  const nFence = yards(ctx, built);
  // service ladders up to the bigger flat roofs (one per building, on its longest wall that faces open ground)
  const pb = ctx.playBounds; let nLad = 0;
  for (const f of flats) {
    if (f.area < 420) continue; let best = null;
    for (let i = 0; i < f.ring.length; i++) {
      const a = f.ring[i], c = f.ring[(i + 1) % f.ring.length]; const F = edgeFrame(a[0], a[1], c[0], c[1]); if (F.L < 5) continue;
      for (const t of [0.22, 0.78]) {
        const p = F.P(F.L * t, 0, 1.3), q = F.P(F.L * t, 0, 0.14);
        if (p[0] < pb.minX + 3 || p[0] > pb.maxX - 3 || p[2] < pb.minZ + 3 || p[2] > pb.maxZ - 3) continue;
        if (ctx.buildingRings.some((r) => r !== f.ring && (pointInRing(p[0], p[2], r) || pointInRing(q[0] + F.nx * 2.4, q[2] + F.nz * 2.4, r)))) continue;
        if (!best || F.L > best.L) best = { L: F.L, q, F };
      }
    }
    if (best) { wallLadder(ctx, best.q[0], best.q[2], best.F.nx, best.F.nz, f.roofY, f.roofY + (f.par ?? 0.47)); nLad++; }
  }
  ctx.flatRoofs = [...(ctx.flatRoofs || []), ...flats];
  ctx.townStats = { nHouse, nShop, nKit, nCtx, nLad, nFence };
  if (typeof location !== 'undefined' && location.pathname.includes('/dev/')) globalThis.__hamTown = { ...ctx.townStats, palms: ctx.yardTrees.palm.length, cypresses: ctx.yardTrees.cypress.length, jacarandas: ctx.yardTrees.jacaranda.length, fences: ctx.yardFences, trees: ctx.yardTrees };   // dev viewer / QA
}
