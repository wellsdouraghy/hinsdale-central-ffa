// Marin Academy grounds: Championship Field (turf, lines, the MA mark, goals, bleachers, fences, hedge, scoreboard),
// the circle drive in front of Foster Hall, entry sign and flag, car parks and kerb-side cars, street lamps, cover.
import * as THREE from 'three';
import { hedgeMass, atGround, hillFence, onSlope, ANG, UX, UZ, gp, rect, CLAY, minAreaOBB, hipRoof, boxFromRect, wallDecal, edgeFrame, quadFacing, pointInRing, ensureCCW, makeCanvas, canvasTexture, mulberry32 } from './kit.js';
import { paintedQuad } from '../../world/fields.js';
import { fence, bleachers, lampPost, turfNoise, landmarkKit } from '../../world/landmarks.js';
import { propKit } from '../../world/props.js';

const ROT = -ANG;
const G = (a, b) => gp(0, 0, a, b);                 // street-grid coordinates (a east, b south, metres from the origin)
const STREETS = ['primary', 'secondary', 'secondary_link', 'tertiary', 'residential'];
const ROADW = { primary: 15.0, secondary: 13.0, secondary_link: 8.0, tertiary: 11.5, residential: 8.5 };
export const TURF = [[124.65, 15.7], [33.3, 16.1], [33.1, -48.9], [61.8, -87.8], [85.5, -87.6], [124.5, -49.2]];   // grid coords
/** The turf outline pushed out by d metres (grid coords), and in world coords. */
export const turfOffset = (d) => TURF.map(([a, b]) => { const l = Math.hypot(a - 79, b + 30); return [a + (a - 79) / l * d, b + (b + 30) / l * d]; });
export const turfWorld = (d) => turfOffset(d).map(([a, b]) => G(a, b));
const gY = (ctx, x, z) => (ctx.groundY ? ctx.groundY(x, z) : 0);

// ------------------------------------------------------------------------------------------ Championship Field
const TURF_GREEN = '#37713a';
// Synthetic-turf close-up detail: the painted field texture is only ~10 px per metre, so up close it turned into soft
// blobs. A small tiling fibre texture (mean 0.5, so it averages out to nothing in the distance through its mipmaps) is
// multiplied in at two scales: blade-level grain plus broader brushed patches. One extra material, no geometry.
function turfDetail(ctx, mat, w, h) {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d'); const rnd = mulberry32(2024); const id = g.createImageData(S, S);
  const f = new Float32Array(S * S);
  for (let k = 0; k < 5200; k++) {   // short fibre strokes, half lighter and half darker, wrapped at the edges
    const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S), len = 2 + Math.floor(rnd() * 5), dx = rnd() < 0.5 ? 0 : (rnd() < 0.5 ? 1 : -1), v = (k % 2 ? 1 : -1) * (0.1 + rnd() * 0.16);
    for (let i = 0; i < len; i++) f[((y + i) % S) * S + ((x + (dx * i >> 1) + S) % S)] += v;
  }
  let mean = 0; for (let i = 0; i < f.length; i++) { f[i] += (rnd() - 0.5) * 0.1; mean += f[i]; } mean /= f.length;
  for (let i = 0; i < f.length; i++) { const v = Math.max(0, Math.min(255, Math.round(128 + (f[i] - mean) * 255))); id.data[i * 4] = v * 0.97; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v * 0.94; id.data[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0);
  const tex = canvasTexture(c, { srgb: false, aniso: ctx.T.aniso });
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uTurfDetail = { value: tex }; shader.uniforms.uTurfRep = { value: new THREE.Vector4(w / 1.7, h / 1.7, w / 9.3, h / 9.3) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uTurfDetail; uniform vec4 uTurfRep;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec3 td = texture2D(uTurfDetail, vMapUv * uTurfRep.xy).rgb; vec3 tb = texture2D(uTurfDetail, vMapUv * uTurfRep.zw + vec2(0.37, 0.11)).rgb; diffuseColor.rgb *= 0.1 + td * 1.2 + tb * 0.6; }');
  };
  mat.customProgramCacheKey = () => prevKey + '|maTurf';
  mat.needsUpdate = true;
}
// Field edge along a polyline (world coords, 2 m outside the turf; the level pad reaches 4.2 m out): 3 m panels of black
// ball-stop fence; where the hill behind is higher than the pitch, a retaining block WALL_D deep (it swallows the pad's
// whole blend zone plus a lattice cell in front of it, so no terrain triangle can show through its face), top stepped
// with the ground behind it, the fence on top. opts: gaps [[d0, d1]] left open, fence: false = wall only,
// hedge(mid) -> true = a 5.5 m evergreen belt behind the fence (solid: blocks sight and bullets).
const WALL_D = 4.7;
const wallTop = (ctx, x, z, nx, nz) => gY(ctx, x + nx * (WALL_D + 0.25), z + nz * (WALL_D + 0.25));
const hedgeBlock = (ctx, x, z, y, w, d, h, rot, k = 0) => hedgeMass(ctx, x, z, y, w, d, h + ((Math.abs(Math.round(x * 3 + z)) % 5) * 0.16), rot, k);   // (kit.js: leaf skin, crowns, solid)
function perimeter(ctx, pts, opts = {}) {
  const { B } = ctx; const step = 3.0; let dist = 0; const run = []; const gaps = opts.gaps || [];   // fence runs: [[x, z, lift], ...]
  const flush = () => { if (run.length > 1) { const lifts = new Map(run.map((p) => [p[0].toFixed(2) + ',' + p[1].toFixed(2), p[2]])); hillFence({ ...ctx, groundY: (x, z) => lifts.get(x.toFixed(2) + ',' + z.toFixed(2)) ?? gY(ctx, x, z) }, run.map((p) => [p[0], p[1]]), { h: 3.0, black: true, every: step }); } run.length = 0; };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / step)); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    // outward = away from the pitch centre
    const c = G(79, -30); let nx = -tz, nz = tx; if (nx * (a[0] - c[0]) + nz * (a[1] - c[1]) < 0) { nx = -nx; nz = -nz; }
    for (let k = 0; k < n; k++) {
      const p = [a[0] + tx * L * k / n, a[1] + tz * L * k / n], q = [a[0] + tx * L * (k + 1) / n, a[1] + tz * L * (k + 1) / n]; const d0 = dist + L * k / n, d1 = dist + L * (k + 1) / n; const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      // ground behind the block (beyond the pad's blend): the wall top for this panel
      let top = -Infinity; for (const t of [0, 0.5, 1]) top = Math.max(top, wallTop(ctx, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, nx, nz));
      // (at a graded street the block ends where the sidewalk begins, 2.3 m out at the least (the pad's ramp lies under it), and
      // its top is the ground under THAT footprint: 4.7 m deep it stood 0.4-0.5 m proud right across the Mission Ave walk)
      let WD = WALL_D; const tall = top > 0.7; if (tall && ctx.streets) for (let o = 0.6; o <= WALL_D; o += 0.1) { const zs = [0, 0.5, 1].map((t) => ctx.streets.design(p[0] + (q[0] - p[0]) * t + nx * o, p[1] + (q[1] - p[1]) * t + nz * o)); if (zs.some((d) => d && d.zone === 'road')) { WD = Math.max(1.2, o - 0.1); break; } if (o >= 2.3 && zs.some((d) => d && d.zone === 'walk')) { WD = o; break; } }
      if (tall) { if (WD < WALL_D) top = -Infinity; for (let t = 0; t <= 1.001; t += 0.25) for (const o of [0.3, 0.85, 1.4, 1.95, 2.5, 3.05, 3.6, 4.15, 4.7, WD].filter((v) => v <= WD)) top = Math.max(top, ctx.groundY(p[0] + (q[0] - p[0]) * t + nx * o, p[1] + (q[1] - p[1]) * t + nz * o)); }   // nothing under the block stands above it (a graded sidewalk at its back)
      const wall = tall && top > (WD < WALL_D ? 0.15 : 0.7); const lift = wall ? top + (WD < WALL_D ? 0.04 : 0.12) : null; const rot = Math.atan2(-tz, tx); const w = L / n + 0.04;
      if (wall) { const m = [mid[0] + nx * WD / 2, mid[1] + nz * WD / 2]; B.v('concrete').box(m[0], (lift - 0.4) / 2, m[1], w, lift + 0.4, WD, rot, 1 / 3); B.c('concrete').box(m[0], (lift - 0.4) / 2, m[1], w, lift + 0.4, WD, rot);
        B.v('limestone').box(mid[0] + nx * 0.05, lift + 0.03, mid[1] + nz * 0.05, w, 0.06, 0.34, rot, 1 / 3);
        (ctx.retaining = ctx.retaining || []).push({ x: m[0], z: m[1], tx, tz, fx: -nx, fz: -nz, w: L / n, d: WD, top: lift, frontY: 0, allowTall: true }); }   // map check: retaining
      // (flush behind the fence line: a strip between fence and hedge would be a slot a player can drop into)
      // (every third panel of the belt a real conifer rises out of it: an instanced tree planted on the wall top)
      if (opts.hedge && opts.hedge(mid, wall ? lift : 0) && (k + i) % 3 === 1) { const o2 = wall ? 1.9 : 1.6; const by = wall ? lift : gY(ctx, mid[0] + nx * o2, mid[1] + nz * o2); ctx.gen.trees.push([+(mid[0] + nx * o2).toFixed(1), +(mid[1] + nz * o2).toFixed(1), 1, 0.62 + (((k * 7 + i * 3) % 5) * 0.07), +(by + 0.2).toFixed(2)]); }
      if (opts.hedge && opts.hedge(mid, wall ? lift : 0)) { const o = wall ? 1.45 : 1.2; hedgeBlock(ctx, mid[0] + nx * o, mid[1] + nz * o, wall ? lift : gY(ctx, mid[0] + nx * o, mid[1] + nz * o), w + 0.3, 2.3, 5.5, rot, 0); }
      const open = opts.fence === false || gaps.some(([g0, g1]) => (d0 + d1) / 2 > g0 && (d0 + d1) / 2 < g1);
      if (open) { flush(); continue; }
      const y0 = wall ? lift : gY(ctx, p[0], p[1]), y1 = wall ? lift : gY(ctx, q[0], q[1]); const o = wall ? 0.25 : 0;
      const P0 = [p[0] + nx * o, p[1] + nz * o, y0], P1 = [q[0] + nx * o, q[1] + nz * o, y1];
      if (run.length && (Math.abs(run[run.length - 1][2] - y0) > 0.02 || Math.hypot(run[run.length - 1][0] - P0[0], run[run.length - 1][1] - P0[1]) > 0.05)) flush();
      if (!run.length) run.push(P0); run.push(P1);
      if (wall) flush();   // every wall panel has its own level top
    }
    dist += L;
  }
  flush();
}
// the outside of a convex corner between two wall runs: a wedge of the same block, so the bank does not show between them
function cornerWedge(ctx, v, prev, next, hedge) {
  const { B } = ctx; const c = G(79, -30); const nrm = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; if (nx * (v[0] - c[0]) + nz * (v[1] - c[1]) < 0) { nx = -nx; nz = -nz; } return [nx, nz]; };
  const n1 = nrm(prev, v), n2 = nrm(v, next); let bx = n1[0] + n2[0], bz = n1[1] + n2[1]; const bl = Math.hypot(bx, bz); if (bl < 1e-3) return; bx /= bl; bz /= bl; const cosH = bx * n1[0] + bz * n1[1]; if (cosH > 0.995) return;
  const R = WALL_D / Math.max(0.35, cosH); const ring = ensureCCW([[v[0], v[1]], [v[0] + n1[0] * WALL_D, v[1] + n1[1] * WALL_D], [v[0] + bx * R, v[1] + bz * R], [v[0] + n2[0] * WALL_D, v[1] + n2[1] * WALL_D]]);
  const top = Math.max(wallTop(ctx, v[0], v[1], n1[0], n1[1]), wallTop(ctx, v[0], v[1], n2[0], n2[1]), gY(ctx, v[0] + bx * (R + 0.25), v[1] + bz * (R + 0.25))); if (top <= 0.7) return;
  B.v('concrete').prism(ring, -0.4, top + 0.12, 1 / 3, true); B.c('concrete').prism(ring, -0.4, top + 0.12, 1, true);
  if (hedge || top > 2.2) hedgeBlock(ctx, v[0] + bx * 1.75, v[1] + bz * 1.75, top + 0.12, 3.4, 3.4, 5.5, Math.atan2(-bz, bx), 0);
}
function field(ctx) {
  const { B, quality } = ctx;   const a0 = 31, a1 = 127, b0 = -90, b1 = 18; const ppm = quality === 'high' ? 18 : quality === 'low' ? 9 : 12; const W = Math.round((b1 - b0) * ppm), H = Math.round((a1 - a0) * ppm);
  const c = makeCanvas(W, H), g = c.getContext('2d'); const X = (b) => (b - b0) * ppm, Y = (a) => (a1 - a) * ppm;
  g.save(); g.beginPath(); TURF.forEach(([a, b], i) => (i ? g.lineTo(X(b), Y(a)) : g.moveTo(X(b), Y(a)))); g.closePath(); g.clip();
  g.fillStyle = TURF_GREEN; g.fillRect(0, 0, W, H);
  // mowing-pattern bands across the pitch (every 5 yd)
  for (let a = 37.5, k = 0; a < 120.5; a += 4.572, k++) if (k % 2) { g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(X(-45.5), Y(a + 4.572), 58 * ppm, 4.572 * ppm); }
  const line = (col, w) => { g.strokeStyle = col; g.lineWidth = Math.max(1.5, w * ppm); };
  const seg = (aa, ba, ab, bb) => { g.beginPath(); g.moveTo(X(ba), Y(aa)); g.lineTo(X(bb), Y(ab)); g.stroke(); };
  const arc = (ac, bc, r, s, e) => { g.beginPath(); g.arc(X(bc), Y(ac), r * ppm, s, e); g.stroke(); };
  const A0 = 37.5, A1 = 120.5, B0 = -45.5, B1 = 12.5, AC = 79, BC = -16.5;
  // lacrosse (orange): boundary inset, restraining lines, wing lines, creases and fans
  line('#e8892b', 0.11);
  for (const s of [-1, 1]) {
    const ag = AC + s * 36.6; seg(AC + s * 18.3, B0 + 2, AC + s * 18.3, B1 - 2);
    arc(ag, BC, 2.74, 0, 7); g.beginPath(); g.arc(X(BC), Y(ag), 11 * ppm, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : 2 * Math.PI); g.stroke();
    g.beginPath(); g.arc(X(BC), Y(ag), 7.3 * ppm, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : 2 * Math.PI); g.stroke();
    seg(ag, BC - 11, ag, BC + 11);
  }
  seg(AC - 9, B0 + 9, AC + 9, B0 + 9); seg(AC - 9, B1 - 9, AC + 9, B1 - 9);
  // soccer (white)
  line('#f1f1ec', 0.12);
  g.strokeRect(X(B0), Y(A1), (B1 - B0) * ppm, (A1 - A0) * ppm); seg(AC, B0, AC, B1); arc(AC, BC, 9.15, 0, 7);
  for (const s of [-1, 1]) {
    const ae = s > 0 ? A1 : A0;
    g.strokeRect(X(BC - 20.16), Y(Math.max(ae, ae - s * 16.5)), 40.32 * ppm, 16.5 * ppm); g.strokeRect(X(BC - 9.16), Y(Math.max(ae, ae - s * 5.5)), 18.32 * ppm, 5.5 * ppm);
    g.beginPath(); g.arc(X(BC), Y(ae - s * 11), 9.15 * ppm, s > 0 ? 0.3 * Math.PI : 1.3 * Math.PI, s > 0 ? 0.7 * Math.PI : 1.7 * Math.PI); g.stroke();
    g.fillStyle = '#f1f1ec'; g.beginPath(); g.arc(X(BC), Y(ae - s * 11), 0.16 * ppm, 0, 7); g.fill();
  }
  // the MA mark on the centre spot
  g.fillStyle = TURF_GREEN; g.beginPath(); g.arc(X(BC), Y(AC), 7.6 * ppm, 0, 7); g.fill();
  line('#f1f1ec', 0.14); arc(AC, BC, 7.6, 0, 7);
  g.save(); g.translate(X(BC), Y(AC)); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(9.4 * ppm)}px Georgia, "Times New Roman", serif`; g.lineJoin = 'round';
  g.strokeStyle = '#f4efe6'; g.lineWidth = 0.7 * ppm; g.strokeText('MA', 0, 0.3 * ppm); g.fillStyle = '#e2533a'; g.fillText('MA', 0, 0.3 * ppm); g.restore();
  // practice area north of the pitch: throwing sector arcs as in the imagery
  line('#f1f1ec', 0.1); g.beginPath(); g.arc(X(-52), Y(73.5), 22 * ppm, 0.55 * Math.PI, 1.45 * Math.PI); g.stroke();
  line('#e8892b', 0.1); g.beginPath(); g.arc(X(-52), Y(73.5), 12 * ppm, 0.55 * Math.PI, 1.45 * Math.PI); g.stroke();
  turfNoise(g, W, H, quality === 'low' ? 30 : 12, 17);
  g.restore();
  const cc = G((a0 + a1) / 2, (b0 + b1) / 2);
  const pq = paintedQuad(ctx, c, cc[0], cc[1], b1 - b0, a1 - a0, ANG, { cut: true, y: 0.018, nScale: 0.5, rough: 0.95 });
  if (quality !== 'low') turfDetail(ctx, pq.mesh.material, b1 - b0, a1 - a0);

  // goals
  const gw = G(A0, BC), ge = G(A1, BC); landmarkKit.soccerGoal(ctx, gw[0], gw[1], Math.atan2(-UX, -UZ)); landmarkKit.soccerGoal(ctx, ge[0], ge[1], Math.atan2(UX, UZ));
  // spectator bleachers on the west touchline below Thacher Hall; team benches + small stands on the north touchline
  // Broad concrete spectator terrace between Thacher Hall and the pitch (the real campus steps down to the field here):
  // four wide steps up from the touchline, a level seating deck, steps down again toward the hall. Walkable from both
  // sides (collision is a ramp over the steps), solid, with benches on the deck.
  {
    const b0 = -30, b1 = 3, bm = (b0 + b1) / 2, len = b1 - b0, rise = 0.28, topY = rise * 4; const conc = B.v('concrete'), col = B.c('concrete');
    for (let k = 0; k < 4; k++) {
      const aE = 31.0 - k * 1.2, aW = 19.6 + k * 0.6; const c = G((aE + aW) / 2, bm);
      conc.box(c[0], (k + 0.5) * rise, c[1], aE - aW, rise, len, ROT, 1 / 3); if (k === 3) col.box(c[0], topY / 2, c[1], aE - aW, topY, len, ROT);   // only the deck is a box: the steps are one smooth ramp (no riser to snag on)
      const nose = G(aE - 0.04, bm); B.v('limestone').box(nose[0], (k + 1) * rise + 0.006, nose[1], 0.1, 0.012, len, ROT, 1 / 3);
    }
    const q = (pts) => { const P3 = pts.map(([a, b, y]) => { const g = G(a, b); return [g[0], y, g[1]]; }); quadFacing(col, P3[0], P3[1], P3[2], P3[3], [0, 1, 0]); };
    q([[31.6, b0, 0], [31.6, b1, 0], [27.35, b1, topY], [27.35, b0, topY]]); q([[19.1, b0, 0], [19.1, b1, 0], [21.45, b1, topY], [21.45, b0, topY]]);
    for (const b of [b0, b1]) for (const [a0, a1] of [[31.6, 27.35], [19.1, 21.45]]) { const A = G(a0, b), Bq = G(a1, b); col.tri([A[0], 0, A[1]], [Bq[0], 0, Bq[1]], [Bq[0], topY, Bq[1]]); col.tri([Bq[0], 0, Bq[1]], [A[0], 0, A[1]], [Bq[0], topY, Bq[1]]); }   // closed ends under the ramps
    for (const b of [-24, -13.5, -3]) { const p = G(24.3, b); B.v('wood').box(p[0], topY + 0.45, p[1], 0.5, 0.07, 4.2, ROT, 0.5); B.v('concrete').box(p[0], topY + 0.21, p[1], 0.36, 0.42, 3.8, ROT, 1 / 3); B.c('wood').box(p[0], topY + 0.24, p[1], 0.5, 0.48, 4.2, ROT); }
    for (const b of [b0, b1]) { const p = G(24.4, b); B.solidBox('limestone', 'concrete', p[0], topY + 0.3, p[1], 5.4, 0.6, 0.5, ROT, 1 / 3); ctx.shrubs.push([p[0], topY + 0.6, p[1], 4.6, 0.5, ROT]); }
  }
  for (const a of [56, 72, 88, 104]) { const p = G(a + 5, -51.4); bleachers(ctx, { x: p[0], z: p[1], dir: ROT + Math.PI, len: 10, rows: 3, run: 0.62, rise: 0.25, frontH: 0 }); }
  for (const a of [60, 98]) { const p = G(a, 14.2); propKit.bench(ctx, p[0], p[1], ROT); const q = G(a + 3, 14.2); propKit.bench(ctx, q[0], q[1], ROT); }
  // perimeter: black ball-stop fence (open on the campus side), with gates on Mission Ave and the east path. The pitch
  // is a level pad cut into the hill: where the ground outside stands more than 0.7 m above the turf (the whole north
  // end, up to ~6 m) a concrete retaining wall holds the bank and the fence runs along its top.
  const P = turfWorld(2.0);
  // The bank above the north-east wall is 9-10 m over the red flag base 40 m away, and in reality densely overgrown
  // (Street View from the lane above): an evergreen belt on the wall top closes that overlook for sight and bullets.
  // The same belt runs along every stretch of wall more than 2.2 m high (the whole north end: the gym plaza looks down
  // on the pitch from there too); the aerial photo shows the tree line on that bank.
  const belt = (m, lift) => (m[0] > 92 && m[1] < -27) || lift > 2.2;
  perimeter(ctx, [P[1], P[0], P[5]], { gaps: [[38, 43], [118, 122]], hedge: belt });        // south (Mission Ave) + east
  perimeter(ctx, [P[5], P[4], P[3], P[2]], { gaps: [[20, 24], [100, 126]], hedge: belt });   // north-east, north, north-west
  // west side north of the spectator terrace (below the Science Center): the wall carries on, no fence (campus side)
  { const t = (-33 - TURF[2][1]) / (TURF[1][1] - TURF[2][1]); const w1 = [P[2][0] + (P[1][0] - P[2][0]) * t, P[2][1] + (P[1][1] - P[2][1]) * t]; perimeter(ctx, [P[2], w1], { fence: false });
    cornerWedge(ctx, P[5], P[0], P[4], true); cornerWedge(ctx, P[4], P[5], P[3], false); cornerWedge(ctx, P[3], P[4], P[2], false); cornerWedge(ctx, P[2], P[3], w1, false); }
  // clipped hedge between the fence and the Mission Ave sidewalk
  // (Street View: a dense evergreen hedge wall 4-5 m high hides the pitch from Mission Ave; it was a knee-high row before)
  // (It stands on the bank between the fence and the sidewalk and covers exactly that bank: from the fence line to where
  // the ground has come down to the designed walk (streets.design), collider and bushy columns included; one row of
  // columns where the strip is narrow. Mission Ave is not parallel to the pitch, so every piece is fitted to its own
  // strip. Laid out on a fixed line it stood on the walk and hung over the asphalt.)
  const vh = (d) => 0.24 * d + 0.22 + Math.min(1.2, Math.max(0.35, 0.55 * d)) + 0.05;   // half depth of a two-row hedgeMass as drawn
  for (let a = 37; a < 122; a += 4.7) { if (a > 68 && a < 78) continue; const hh = 4.2 + ((a * 7) % 5) * 0.12;
    let edge = 21.0; if (ctx.streets) for (let b = 17.6; b <= 21.0; b += 0.1) if ([0, 1.2, 2.35, 3.5, 4.7].every((da) => { const q = G(a + da, b); const d = ctx.streets.design(q[0], q[1]); return ctx.streets.inRoad(q[0], q[1], 0) || (d && d.zone === 'walk' && gY(ctx, q[0], q[1]) <= d.y + 0.2); }) || [0, 2.35, 4.7].some((da) => { const q = G(a + da, b + 0.3); return ctx.streets.inRoad(q[0], q[1], 0); })) { edge = b; break; }
    const b0 = 17.55, room = edge - 0.05 - b0;
    if (room < 0.7) {   // no bank to cover (the street is level with the pitch or above it): one row on the wall's block right behind the fence, so the pitch is not open to the street
      const p = G(a + 2.35, b0 + 0.4); let y = -Infinity; for (const da of [0.3, 2.35, 4.4]) for (const db of [-0.3, 0.5, 1.4, 2.2]) { const q = G(a + da, b0 + 0.4 + db); y = Math.max(y, gY(ctx, q[0], q[1])); }
      hedgeMass(ctx, p[0], p[1], y, 4.74, 0.7, hh, ROT, a, { oneRow: true }); continue; }
    const one = room < 2.0; let d = one ? Math.min(1.3, room) : 1.7; if (!one) while (d > 0.9 && 2 * vh(d) > room) d -= 0.1;
    const half = one ? d / 2 : vh(d), bc = edge - 0.05 - half; const p = G(a + 2.35, bc);
    let y = Infinity; for (const da of [0.3, 2.35, 4.4]) for (const db of [-half * 0.8, 0, half]) { const q = G(a + da, bc + db); y = Math.min(y, gY(ctx, q[0], q[1])); }
    hedgeMass(ctx, p[0], p[1], y - 0.2, 4.74, d, hh + Math.max(0, -y) * 0.6, ROT, a, { oneRow: one }); }
  // scoreboard in the north-east corner, angled back at the pitch
  {
    const p = G(118.5, -57); const rot = ROT - 0.75; const pt = B.v('paint', true);
    pt.setColor(0.05, 0.05, 0.06).box(p[0], 5.6, p[1], 7.4, 3.0, 0.3, rot); pt.setColor(0.62, 0.07, 0.06).box(p[0], 7.45, p[1], 7.4, 0.7, 0.32, rot);
    const c2 = Math.cos(rot), s2 = Math.sin(rot); for (const k of [-2.8, 2.8]) { B.v('galv').cyl(p[0] + k * c2, 0, p[1] - k * s2, 0.11, 0.11, 4.2, 8, 1, false); B.c('metal').box(p[0] + k * c2, 2.1, p[1] - k * s2, 0.3, 4.2, 0.3); }
    B.c('metal').box(p[0], 5.95, p[1], 7.4, 3.7, 0.35, rot); pt.setColor(1, 1, 1);
    const F = edgeFrame(p[0] + 3.7 * c2 - 0.17 * s2, p[1] - 3.7 * s2 - 0.17 * c2, p[0] - 3.7 * c2 - 0.17 * s2, p[1] + 3.7 * s2 - 0.17 * c2);
    const f2 = (F.nx * (80 - p[0]) + F.nz * (-6 - p[1])) > 0 ? F : edgeFrame(p[0] - 3.7 * c2 + 0.17 * s2, p[1] + 3.7 * s2 + 0.17 * c2, p[0] + 3.7 * c2 + 0.17 * s2, p[1] - 3.7 * s2 + 0.17 * c2);
    const tc = makeCanvas(1024, 512), g2 = tc.getContext('2d'); g2.fillStyle = '#0c0c0e'; g2.fillRect(0, 0, 1024, 512); g2.fillStyle = '#b3261e'; g2.fillRect(0, 0, 1024, 96);
    g2.fillStyle = '#f4efe6'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.font = '800 64px Georgia, serif'; g2.fillText('MARIN ACADEMY WILDCATS', 512, 50);
    g2.font = '700 44px Arial'; g2.fillText('HOME', 220, 170); g2.fillText('GUEST', 804, 170); g2.fillText('TIME', 512, 170);
    g2.fillStyle = '#ffb21a'; g2.font = '800 150px "Courier New", monospace'; g2.fillText('2', 220, 320); g2.fillText('1', 804, 320); g2.font = '800 110px "Courier New", monospace'; g2.fillText('38:12', 512, 320);
    wallDecal(ctx, canvasTexture(tc, { repeat: false }), f2, f2.L / 2, 5.95, 7.2, 3.6, 0.02, { opaque: true, rough: 0.5 });
  }
  // sideline cover: equipment bins, ball carts, a lacrosse goal stack, water station
  const pt = B.v('paint', true);
  for (const [a, b, w, h, d, col] of [[34.6, -40, 1.2, 1.1, 2.4, [0.62, 0.07, 0.06]], [34.6, 6, 1.2, 1.1, 2.4, [0.1, 0.1, 0.11]], [122.6, -30, 1.2, 1.1, 2.4, [0.62, 0.07, 0.06]], [122.6, -2, 1.4, 1.3, 2.0, [0.1, 0.1, 0.11]], [66, -58, 2.4, 1.2, 1.2, [0.3, 0.32, 0.34]], [84, -70, 1.8, 1.8, 1.8, [0.9, 0.9, 0.88]], [78, -80, 4.6, 0.5, 2.2, [0.06, 0.16, 0.09]], [58, 13.4, 1.6, 1.0, 0.8, [0.9, 0.5, 0.1]], [100, 13.4, 1.6, 1.0, 0.8, [0.9, 0.5, 0.1]]]) {
    const p = G(a, b); pt.setColor(...col).box(p[0], h / 2, p[1], w, h, d, ROT); B.c('rubber').box(p[0], h / 2, p[1], w, h, d, ROT);
  }
  pt.setColor(1, 1, 1);
  // match-day kit round the north-east corner (the red flag base): scorer's tent with a table, ball bins, kit carts,
  // stacked lacrosse goals, a water station. Believable sideline clutter that also breaks the sight lines to the base.
  {
    const tent = (a, b, col) => { const c = G(a, b); const aw = B.v('awning', true); aw.setColor(...col); aw.box(c[0], 2.45, c[1], 3.2, 0.06, 3.2, ROT); hipRoof(ctx, boxFromRect(c[0], c[1], 3.2, 3.2), 2.48, 0.9, { bucket: 'awning', tint: col, overhang: 0, caps: false, noCollision: true }); aw.setColor(1, 1, 1);
      for (const [da, db] of [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]]) { const q2 = G(a + da, b + db); B.v('galv').cyl(q2[0], 0, q2[1], 0.03, 0.03, 2.45, 6, 1, false); }
      B.v('whitePanel').box(c[0], 0.74, c[1], 2.2, 0.06, 0.8, ROT); B.v('paint', true).setColor(...col).box(c[0], 0.37, c[1], 2.2, 0.72, 0.78, ROT); B.c('wood').box(c[0], 0.4, c[1], 2.2, 0.8, 0.8, ROT); B.c('wood').box(c[0], 2.7, c[1], 3.2, 0.5, 3.2, ROT); };
    tent(108.5, -45.8, [0.62, 0.07, 0.06]); tent(92.5, -45.8, [0.9, 0.9, 0.88]);
    const crate = (a, b, w, h, d, col, r = 0) => { const c = G(a, b); B.v('paint', true).setColor(...col).box(c[0], h / 2, c[1], w, h, d, ROT + r); B.c('rubber').box(c[0], h / 2, c[1], w, h, d, ROT + r); };
    crate(112.5, -36, 2.4, 1.25, 1.3, [0.1, 0.1, 0.11]); crate(112.7, -33.2, 1.3, 1.5, 1.3, [0.62, 0.07, 0.06]); crate(95.5, -32.5, 2.6, 1.2, 1.2, [0.3, 0.32, 0.34], 0.5); crate(104.5, -31.2, 1.8, 1.05, 0.9, [0.9, 0.5, 0.1], -0.3);
    crate(88.5, -40, 1.3, 1.4, 1.3, [0.05, 0.16, 0.42]); crate(100.5, -47, 3.4, 1.3, 1.0, [0.82, 0.82, 0.8]); crate(116, -44, 1.9, 1.9, 1.9, [0.9, 0.9, 0.88], 0.3);
    B.v('paint', true).setColor(1, 1, 1);
    { const c = G(110.5, -40.5); landmarkKit.soccerGoal(ctx, c[0], c[1], ROT + Math.PI / 2 + 0.2); }   // spare goal parked off the pitch
  }
}

// ------------------------------------------------------------------------------------------ flag
function usFlag(ctx, x, z, gy0 = 0) {
  const { B, scene } = ctx; const H = 10.5;
  B.v('aluminum').cyl(x, 0, z, 0.075, 0.045, H, 10, 1, true); B.v('concrete').cyl(x, 0, z, 0.3, 0.3, 0.25, 12, 1 / 3, true);
  B.v('lightEmit').cyl(x, H, z, 0.07, 0.07, 0.12, 8, 1, true); B.c('metal').box(x, 2, z, 0.3, 4, 0.3); ctx.grapplePoles.push({ x, z, y0: 1, y1: H, r: 0.08 });
  const W = 512, Hh = 320, c = makeCanvas(W, Hh), g = c.getContext('2d');
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f2ee' : '#b22234'; g.fillRect(0, (i * Hh) / 13, W, Hh / 13 + 1); }
  g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, W * 0.4, (Hh * 7) / 13); g.fillStyle = '#fff';
  for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) { g.beginPath(); g.arc(W * 0.4 * ((k + (r % 2 ? 1 : 0.5)) / 6), (Hh * 7 / 13) * ((r + 0.7) / 9.4), 4.2, 0, 7); g.fill(); }
  const geo = new THREE.PlaneGeometry(2.4, 1.5, 16, 6); const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 1.2) / 2.4; p.setZ(i, Math.sin(u * 7 + x) * 0.14 * u); p.setY(i, p.getY(i) - 0.22 * u * u); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: canvasTexture(c, { repeat: false }), side: THREE.DoubleSide, roughness: 0.85 }));
  m.position.set(x + 1.25, gy0 + H - 0.95, z); m.castShadow = true; m.name = 'flag-us'; scene.add(m);
}

// ------------------------------------------------------------------------------------------ front of campus
function frontOfCampus(ctx) {
  const { B } = ctx;
  // entry sign on the lawn by the Mission Ave drive: cream stucco wall, clay-tile cap, bronze letters, both faces
  onSlope(ctx, -38.5, 12.6, 3.0, () => {
    const p = [-38.5, 12.6]; const L = 6.4;
    B.v('stucco', true).setColor(0.9, 0.8, 0.57).box(p[0], 0.85, p[1], L, 1.7, 0.6, ROT, 0.45); B.v('stucco', true).setColor(1, 1, 1);
    for (const s of [-1, 1]) { const q = gp(p[0], p[1], s * (L / 2 + 0.4), 0); B.v('stucco', true).setColor(0.9, 0.8, 0.57).box(q[0], 1.1, q[1], 0.85, 2.2, 0.85, ROT, 0.45); B.c('concrete').box(q[0], 1.1, q[1], 0.85, 2.2, 0.85, ROT); hipRoof(ctx, boxFromRect(q[0], q[1], 0.85, 0.85), 2.2, 0.35, { overhang: 0.14, noCollision: true, caps: false }); }
    B.v('stucco', true).setColor(1, 1, 1); B.c('concrete').box(p[0], 0.85, p[1], L, 1.7, 0.6, ROT);
    hipRoof(ctx, boxFromRect(p[0], p[1], L, 0.6), 1.7, 0.3, { overhang: 0.14, noCollision: true, caps: false, gable: true });
    const c = makeCanvas(1024, 256), g = c.getContext('2d'); g.fillStyle = '#efe6cf'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#7a1712'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 104px Georgia, "Times New Roman", serif'; g.fillText('MARIN ACADEMY', 512, 100, 940);
    g.fillStyle = '#2a2622'; g.font = '600 46px Georgia, serif'; g.fillText('1600 MISSION AVENUE  ·  EST. 1971', 512, 196);
    const tex = canvasTexture(c, { repeat: false });
    const a = gp(p[0], p[1], L / 2 - 0.3, 0.31), b = gp(p[0], p[1], -L / 2 + 0.3, 0.31), a2 = gp(p[0], p[1], -L / 2 + 0.3, -0.31), b2 = gp(p[0], p[1], L / 2 - 0.3, -0.31);
    wallDecal(ctx, tex, edgeFrame(a[0], a[1], b[0], b[1]), (L - 0.6) / 2, 0.95, L - 0.8, 1.25, 0.012, { opaque: true });
    wallDecal(ctx, tex, edgeFrame(a2[0], a2[1], b2[0], b2[1]), (L - 0.6) / 2, 0.95, L - 0.8, 1.25, 0.012, { opaque: true });
    B.v('mulch').quad(...[[-4.6, 1.8], [4.6, 1.8], [4.6, -1.8], [-4.6, -1.8]].map(([da, db]) => { const q = gp(p[0], p[1], da, db); return [q[0], 0.03, q[1]]; }), [0, 0], [4, 0], [4, 2], [0, 2]);
    ctx.shrubs.push([...(() => { const q = gp(p[0], p[1], 0, 1.2); return [q[0], 0.05, q[1]]; })(), 8, 0.55, ROT]);
  });
  atGround(ctx, -10.5, 12.5, (g) => usFlag(ctx, -10.5, 12.5, g));
  // red-brick walk from Mission Ave up to Foster Hall's porch (west of the circle), and across the top of the circle
  // (laid on the ground in <= 1.5 m pieces: the walk climbs ~5 m from the street to the porch)
  const br = B.v('brickRed'); const Y = (x, z) => gY(ctx, x, z) + 0.05;
  const walk = (pts, w) => { let v = 0; for (let i = 0; i < pts.length - 1; i++) { const a0 = pts[i], b0 = pts[i + 1]; const L0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]); const n = Math.max(1, Math.ceil(L0 / 1.5)); const nx = (b0[1] - a0[1]) / L0 * w / 2, nz = -(b0[0] - a0[0]) / L0 * w / 2;
    for (let k = 0; k < n; k++) { const a = [a0[0] + (b0[0] - a0[0]) * k / n, a0[1] + (b0[1] - a0[1]) * k / n], b = [a0[0] + (b0[0] - a0[0]) * (k + 1) / n, a0[1] + (b0[1] - a0[1]) * (k + 1) / n]; const L = L0 / n;
      quadFacing(br, [a[0] - nx, Y(a[0] - nx, a[1] - nz), a[1] - nz], [a[0] + nx, Y(a[0] + nx, a[1] + nz), a[1] + nz], [b[0] + nx, Y(b[0] + nx, b[1] + nz), b[1] + nz], [b[0] - nx, Y(b[0] - nx, b[1] - nz), b[1] - nz], [0, 1, 0], [[0, v], [w / 2, v], [w / 2, v + L / 2], [0, v + L / 2]]); v += L / 2; } } };
  walk([[-44, 16.5], [-45.5, -4], [-42, -20], [-33, -28.5], [-18.4, -30.2]], 2.6);
  walk([[-18.4, -30.2], [-2, -28.6], [6, -24]], 2.6);
  // lamp posts round the circle and along the walk, benches facing the lawn
  for (const [x, z] of [[-41, 6], [-41.5, -14], [-30, -27], [-6, -27.5], [1, -12], [2.5, 8], [-27, 15.5], [-4, 16.5], [-52, -30], [-60, -50]]) atGround(ctx, x, z, () => lampPost(ctx, x, z), 0.3, 'min');
  for (const [x, z, r] of [[-47.5, -2, ROT + Math.PI / 2], [-46.5, -12, ROT + Math.PI / 2], [-24, -29.5, ROT], [-10, -28, ROT]]) propKit.bench(ctx, x, z, r);
  for (const [x, z] of [[-46, 3], [-14, -29.5], [3, -22]]) propKit.trashCan(ctx, x, z);
  propKit.bikeRack(ctx, -1.5, -24, ROT + Math.PI / 2); propKit.bikeRack(ctx, 5.5, -72, ROT);
  // stone seat wall round the south half of the circle lawn (cover) + the plaque boulder in the middle
  const cx = -20.3, cz = -4.6, R = 15.2;
  for (let k = 0; k < 9; k++) { const a0 = 0.18 * Math.PI + k * 0.071 * Math.PI, a1 = a0 + 0.06 * Math.PI; if (k === 4) continue; const xa = cx + Math.cos(a0) * R, za = cz + Math.sin(a0) * R, xb = cx + Math.cos(a1) * R, zb = cz + Math.sin(a1) * R; const L = Math.hypot(xb - xa, zb - za); atGround(ctx, (xa + xb) / 2, (za + zb) / 2, () => B.solidBox('limestone', 'concrete', (xa + xb) / 2, 0.18, (za + zb) / 2, L + 0.05, 0.76, 0.5, Math.atan2(-(zb - za), xb - xa), 1 / 3), L / 2); }
  atGround(ctx, cx + 2, cz + 6, () => { B.v('concrete').cyl(cx + 2, -0.2, cz + 6, 0.9, 0.6, 1.1, 7, 1 / 3, true); B.c('concrete').box(cx + 2, 0.35, cz + 6, 1.5, 1.1, 1.5); }, 0.8, 'min');
  // plaza between Science, the gyms and Foster: picnic tables, planters, bins
  for (const [x, z, r] of [[2, -76, 0.2], [8, -79.5, -0.3], [-2, -82, 0.9], [14, -74, 0.1]]) propKit.picnicTable(ctx, x, z, r);
  for (const [x, z, len, rot] of [[3.5, -66.5, 5, ROT + Math.PI / 2], [3, -44, 6, ROT + Math.PI / 2], [-33, -66, 6, ROT + Math.PI / 2]]) atGround(ctx, x, z, () => { B.solidBox('concrete', 'concrete', x, 0.2, z, len, 1.2, 1.3, rot, 1 / 3); ctx.shrubs.push([x, 0.8, z, len - 0.8, 0.75, rot]); }, len / 2);
  propKit.dumpster(ctx, -27, -101.5, ROT); propKit.dumpster(ctx, 52, -132, ROT + Math.PI / 2, [0.1, 0.16, 0.3]); propKit.dumpster(ctx, -72, 46.5, ROT + Math.PI / 2);
  ctx.onGround([17.5, -105, 1.5], () => propKit.utilityBox(ctx, 17.5, -105, ROT)); propKit.utilityBox(ctx, -66, 2, ROT);
}

// ------------------------------------------------------------------------------------------ vehicles
function vehicles(ctx) {
  const { data, playBounds: pb } = ctx; const rnd = mulberry32(415);
  const tpls = [propKit.buildCarTemplate(propKit.CAR_TYPES.suv), propKit.buildCarTemplate(propKit.CAR_TYPES.sedan), propKit.buildCarTemplate(propKit.CAR_TYPES.hatch)];
  const pick = () => { const r = rnd(); return r < 0.42 ? tpls[0] : r < 0.8 ? tpls[1] : tpls[2]; };
  const placed = [], parked = []; let n = 0;   // parked: [x, z, heading] of every car actually placed
  const inPlay = (x, z, m = 3) => x > pb.minX + m && x < pb.maxX - m && z > pb.minZ + m && z < pb.maxZ - m;
  const keep = ctx.keepClear || [];
  // the school buses (placed after the cars) and tree trunks: no car may overlap them. A car rejected for one of these
  // still draws its three random numbers, so every other car keeps its place, type and colour.
  const buses = [[55.5, 38.7, ROT] /* at the school-side kerb of Mission Ave (graded centreline + 4.25 m) */, [...G(-8, -134.5), ROT + Math.PI / 2], [...G(14, -129), ROT + Math.PI / 2]];
  const trunks = (ctx.gen.trees || []).filter((t) => inPlay(t[0], t[1], -4));
  const overlaps = (x, z, h, bx, bz, bh, hl, hw) => {   // oriented rectangles: car (2.3 x 0.95 half extents) vs (hl x hw) at (bx, bz, bh)
    const R = [[x, z, h, 2.3, 0.95], [bx, bz, bh, hl, hw]];
    for (const [, , a] of R) for (const ax of [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]]) {
      const ext = R.map(([cx, cz, hh, l, w]) => [cx * ax[0] + cz * ax[1], Math.abs(l * (Math.cos(hh) * ax[0] - Math.sin(hh) * ax[1])) + Math.abs(w * (Math.sin(hh) * ax[0] + Math.cos(hh) * ax[1]))]);
      if (Math.abs(ext[0][0] - ext[1][0]) > ext[0][1] + ext[1][1]) return false;
    }
    return true;
  };
  const car = (x, z, heading) => {
    if (!inPlay(x, z)) return; if (keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r)) return;
    if (ctx.terrain && ctx.terrain.slopeAt(x, z) > 0.115) { rnd(); rnd(); rnd(); placed.push([x, z]); return; }
    // ...nor across a step in the ground: the car is laid on the plane through its middle (onSlope), and beside a pad edge that plane is not the ground (one sat 0.75 m deep)
    if (ctx.terrain && ctx.terrain.meshHeightAt) { const g = ctx.groundY, y0 = g(x, z), gx = (g(x + 2, z) - g(x - 2, z)) / 4, gz = (g(x, z + 2) - g(x, z - 2)) / 4, c = Math.cos(heading), s = Math.sin(heading);
      if ([[2.2, 0.9], [2.2, -0.9], [-2.2, 0.9], [-2.2, -0.9], [0, 0]].some(([l, w]) => { const px = x + l * c + w * s, pz = z - l * s + w * c; return Math.abs(ctx.terrain.meshHeightAt(px, pz) - (y0 + gx * (px - x) + gz * (pz - z))) > 0.35; })) { rnd(); rnd(); rnd(); placed.push([x, z]); return; } }   // nobody parks on a bank (and a car cannot be laid on more than ~11 %)
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.5)) return;
    for (const r of ctx.buildingRings || []) if (pointInRing(x, z, r)) return;
    // (trunks: up to ~0.45 m radius plus 0.6 m of room; other cars: a lane car must not clip a kerb-parked one)
    if (buses.some(([bx, bz, bh]) => overlaps(x, z, heading, bx - 0.15 * Math.cos(bh), bz + 0.15 * Math.sin(bh), bh, 6.1, 1.6)) || trunks.some((t) => Math.hypot(t[0] - x, t[1] - z) < 4.2 && overlaps(x, z, heading, t[0], t[1], 0, 1.05, 1.05))
      || parked.some(([px, pz, ph]) => Math.hypot(px - x, pz - z) < 5.4 && overlaps(x, z, heading, px, pz, ph, 2.45, 1.0))) { rnd(); rnd(); rnd(); placed.push([x, z]); return; }
    { const tpl = pick(), hd = heading + (rnd() - 0.5) * 0.05, col = propKit.CAR_COLORS[Math.floor(rnd() * propKit.CAR_COLORS.length)]; onSlope(ctx, x, z, 2.0, () => propKit.placeCar(ctx, tpl, x, z, hd, col)); }   // lies on the street's slope
    placed.push([x, z]); parked.push([x, z, heading]); n++;
  };
  // stall paint: 10 cm lines just above the asphalt, one merged mesh, worn and faded out with distance (visual only)
  const stripes = [], stripeCol = [], seen = new Set();
  // a painted line a -> b (half width w) draped on the ground in <= 1.7 m pieces
  const line = (a0, b0, w, col) => { const L0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]); if (L0 < 1e-3) return; const n = Math.max(1, Math.ceil(L0 / 1.7)); const px = -(b0[1] - a0[1]) / L0 * w, pz = (b0[0] - a0[0]) / L0 * w;
    for (let k = 0; k < n; k++) { const a = [a0[0] + (b0[0] - a0[0]) * k / n, a0[1] + (b0[1] - a0[1]) * k / n], b = [a0[0] + (b0[0] - a0[0]) * (k + 1) / n, a0[1] + (b0[1] - a0[1]) * (k + 1) / n];
      const q = [[a[0] - px, a[1] - pz], [a[0] + px, a[1] + pz], [b[0] + px, b[1] + pz], [b[0] - px, b[1] - pz]];
      const up = (q[1][0] - q[0][0]) * (q[3][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[3][0] - q[0][0]) < 0;
      for (const j of (up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])) { stripes.push(q[j][0], gY(ctx, q[j][0], q[j][1]) + 0.03, q[j][1]); stripeCol.push(col[0], col[1], col[2]); } } };
  const stall = (cx, cz, dx, dz) => {
    const key = Math.round(cx * 4) + ',' + Math.round(cz * 4); if (seen.has(key)) return; seen.add(key);
    const h = 2.45; line([cx - dx * h, cz - dz * h], [cx + dx * h, cz + dz * h], 0.05, [0.84, 0.835, 0.8]);
  };
  // Mission Avenue's double yellow centre line (the satellite paint is smoothed away up close)
  for (const r of data.roads) {
    if (!['Mission Avenue', 'Fifth Avenue', 'Fourth Street'].includes(r.tags.name)) continue;
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5 || !inPlay((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -30)) continue; const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (const o of [-0.11, 0.11]) line([a[0] + nx * o, a[1] + nz * o], [b[0] + nx * o, b[1] + nz * o], 0.05, [0.8, 0.6, 0.08]);
    }
  }
  // car parks (OSM amenity=parking): rows of stalls along the long axis, alternating with aisles
  for (const a of data.areas) {
    if (a.tags.amenity !== 'parking') continue; const ring = ensureCCW(a.outer[0]); const o = minAreaOBB(ring); if (!o) continue;
    let { tx, tz, u0, u1, v0, v1 } = o; if (v1 - v0 > u1 - u0) { [tx, tz, u0, u1, v0, v1] = [-tz, tx, v0, v1, -u1, -u0]; }
    const cxm = ((u0 + u1) / 2) * tx - ((v0 + v1) / 2) * tz, czm = ((u0 + u1) / 2) * tz + ((v0 + v1) / 2) * tx; if (!inPlay(cxm, czm, -10)) continue;
    const depth = v1 - v0; const rows = depth < 9 ? [[(v0 + v1) / 2, 1]] : []; const campus = cxm > -120 && cxm < 100 && czm < 110 && czm > -170;
    if (depth >= 9) for (let v = v0 + 2.7, k = 0; v < v1 - 2.2; v += (k % 2 === 0 ? 11.6 : 5.3), k++) rows.push([v, k % 2 === 0 ? 1 : -1]);
    const fill = campus ? 0.7 : 0.48;
    for (const [v, dir] of rows) for (let u = u0 + 1.6; u < u1 - 1.4; u += 2.75) {
      { // painted stall lines either side of every usable stall, parked in or not (no random numbers drawn here)
        const sx = u * tx - v * tz, sz = u * tz + v * tx, ax = -tz * dir, az = tx * dir;
        if (inPlay(sx, sz) && pointInRing(sx + ax * 2.2, sz + az * 2.2, ring) && pointInRing(sx - ax * 2.2, sz - az * 2.2, ring) && ctx.surfaceAt(sx, sz) === 'asphalt' && !(ctx.buildingRings || []).some((r) => pointInRing(sx, sz, r)))
          for (const o of [-1.375, 1.375]) stall(sx + tx * o, sz + tz * o, ax, az);
      }
      if (rnd() > fill) continue; const x = u * tx - v * tz, z = u * tz + v * tx;
      const hx = -tz * dir, hz = tx * dir; if (!pointInRing(x + hx * 2.2, z + hz * 2.2, ring) || !pointInRing(x - hx * 2.2, z - hz * 2.2, ring)) continue;
      car(x, z, Math.atan2(-hz, hx) + (rnd() < 0.2 ? Math.PI : 0));
    }
  }
  // kerb-side parking along the streets (right-hand traffic), clear of junctions and driveways
  const ends = []; for (const r of data.roads) if (STREETS.includes(r.tags.highway)) { ends.push(r.line[0], r.line[r.line.length - 1]); }
  for (const r of data.roads) {
    const hw = r.tags.highway; if (!STREETS.includes(hw)) continue; const w = ROADW[hw]; const busy = hw === 'primary' || hw === 'secondary';
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 8) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (const side of [1, -1]) for (let d = 4 + rnd() * 4; d < L - 4; d += 6.3) {
        const x = a[0] + tx * d - tz * side * (w / 2 - 1.15), z = a[1] + tz * d + tx * side * (w / 2 - 1.15);
        if (!inPlay(x, z) || rnd() > (busy ? 0.45 : 0.36)) continue;
        if (ends.some((e) => Math.hypot(e[0] - a[0] - tx * d, e[1] - a[1] - tz * d) < 13)) continue;
        if (ctx.surfaceAt(x, z) !== 'asphalt') continue;
        car(x, z, Math.atan2(-tz, tx) + (side > 0 ? 0 : Math.PI));
      }
    }
  }
  // a few cars driving / stopped in the lanes, and the school's buses at the Mission Ave kerb and the gym lot
  for (const r of data.roads) {
    const hw = r.tags.highway; if (hw !== 'tertiary' && hw !== 'secondary' && hw !== 'primary') continue;
    for (let i = 0; i < r.line.length - 1; i++) { const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 30) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; if (rnd() < 0.55) { const d = 10 + rnd() * (L - 20), sd = rnd() < 0.5 ? 1 : -1; car(a[0] + tx * d - tz * sd * 1.7, a[1] + tz * d + tx * sd * 1.7, Math.atan2(-tz, tx) + (sd > 0 ? 0 : Math.PI)); } }
  }
  for (const [bx, bz, bh] of buses) onSlope(ctx, bx, bz, 5.0, () => propKit.placeBus(ctx, bx, bz, bh));
  if (stripes.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(stripes, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(stripes.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(stripeCol, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const wear = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { float sd = length(vWPos - cameraPosition); vec2 sp = vWPos.xz * 3.1;
    float sw = fract(sin(dot(floor(sp * 6.0), vec2(12.9898, 78.233))) * 43758.5453) * 0.35 + fract(sin(dot(floor(sp), vec2(39.3468, 11.135))) * 24634.6345) * 0.4;
    diffuseColor.a *= (0.5 + 0.5 * smoothstep(0.1, 0.55, sw + 0.25)) * (1.0 - smoothstep(55.0, 140.0, sd)); }`); };
    wear.key = 'maStallPaint';
    ctx.applyBakedShadow(mat, ctx.sky.shadowUniforms, wear);
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'stall-paint'; mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 1; ctx.scene.add(mesh);
  }
  ctx.stats = { cars: n, paintLines: stripes.length / 18 };
}

// ------------------------------------------------------------------------------------------ streets
function streets(ctx) {
  const { B, data, playBounds: pb } = ctx; const rnd = mulberry32(94901);
  const inPlay = (x, z, m = 2) => x > pb.minX + m && x < pb.maxX - m && z > pb.minZ + m && z < pb.maxZ - m;
  const clearOfBuildings = (x, z) => !(ctx.buildingRings || []).some((r) => pointInRing(x, z, r) || pointInRing(x + 0.6, z, r) || pointInRing(x - 0.6, z, r) || pointInRing(x, z + 0.6, r) || pointInRing(x, z - 0.6, r));
  const lamps = [];
  for (const r of data.roads) {
    const hw = r.tags.highway; if (!STREETS.includes(hw)) continue; const w = ROADW[hw]; let side = 1; let carry = 8 + rnd() * 10;
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      let d = carry;
      for (; d < L; d += 27) {
        const lo = r.tags.name === 'Mission Avenue' ? 0.35 : 0.75;   /* (Mission Ave's walk along the pitch is narrow: its lamps stand at the kerb edge) */
        const x = a[0] + tx * d - tz * side * (w / 2 + lo), z = a[1] + tz * d + tx * side * (w / 2 + lo); side = -side;
        if (ctx.streets && ctx.streets.inRoad(x, z, lo < 0.5 ? 0.15 : 0.4)) continue;   /* (a fork or a crossing street: never a lamp on a carriageway) */
        if (!inPlay(x, z) || !clearOfBuildings(x, z) || lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 14)) continue;
        if (z < -60 && hw === 'residential' && rnd() < 0.5) continue;      // the hillside lanes are sparsely lit
        atGround(ctx, x, z, () => lampPost(ctx, x, z), 0.3, 'min'); lamps.push([x, z]);
      }
      carry = d - L;
    }
  }
  // signal masts at the OSM traffic signals (Mission / 5th / 4th crossings)
  for (const p of data.points) {
    if (p.tags.highway !== 'traffic_signals') continue; const [x, z] = p.p; if (!inPlay(x, z, 6)) continue;
    const px = x + 6.2, pz = z + 6.6; if (!clearOfBuildings(px, pz)) continue;
    atGround(ctx, px, pz, () => {
    B.v('galv').cyl(px, 0, pz, 0.14, 0.1, 6.2, 8, 1, true).tube([px, 5.9, pz], [px - 6.5, 6.1, pz - 0.8], 0.07, 6); B.c('metal').box(px, 3.1, pz, 0.35, 6.2, 0.35); ctx.grapplePoles.push({ x: px, z: pz, y0: 1, y1: 6.2, r: 0.14 });
    const pt = B.v('paint', true); pt.setColor(0.85, 0.7, 0.05); for (const k of [2.6, 5.4]) { pt.box(px - k, 5.55, pz - k * 0.123, 0.36, 1.0, 0.3, 0.12); B.v('lightEmit').box(px - k, 5.85, pz - k * 0.123 + 0.16, 0.2, 0.2, 0.02, 0.12); } pt.setColor(1, 1, 1);
    B.c('metal').box(px - 3.2, 6.0, pz - 0.4, 6.6, 0.3, 0.3, 0.12);
    }, 0.3, 'min');
  }
  // downtown kerb furniture on the 4th / 5th St sidewalks: bins, benches, newspaper boxes, planters (light cover)
  for (const r of data.roads) {
    const nm = r.tags.name; if (nm !== 'Fourth Street' && nm !== 'Fifth Avenue' && nm !== 'Mission Avenue') continue; const w = ROADW[r.tags.highway] || 10;
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 20) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (let d = 12 + rnd() * 10; d < L - 8; d += 19 + rnd() * 16) {
        const sd = rnd() < 0.5 ? 1 : -1; const x = a[0] + tx * d - tz * sd * (w / 2 + 1.7), z = a[1] + tz * d + tx * sd * (w / 2 + 1.7);
        if (!inPlay(x, z, 4) || !clearOfBuildings(x, z) || ctx.surfaceAt(x, z) === 'asphalt' || ctx.surfaceAt(x, z) === 'rubber') continue;
        const k = rnd(); const rot = Math.atan2(-tz, tx);
        if (Math.hypot(x - 39.9, z - 40.6) < 4.5) continue;   /* the mouth of the alley with the pool stairs stays clear (the random number is drawn first: every other piece keeps its place and kind) */
        if (k < 0.3) propKit.trashCan(ctx, x, z); else if (k < 0.55) propKit.bench(ctx, x, z, rot + (sd > 0 ? Math.PI : 0));
        else if (k < 0.8) atGround(ctx, x, z, () => { B.solidBox('concrete', 'concrete', x, 0.28, z, 2.4, 0.96, 1.0, rot, 1 / 3); ctx.shrubs.push([x, 0.76, z, 1.9, 0.6, rot]); }, 1.2);
        else atGround(ctx, x + tx * 0.3, z + tz * 0.3, () => { const pt = B.v('paint', true); pt.setColor(0.1, 0.2, 0.5).box(x, 0.5, z, 0.5, 1.4, 0.5, rot); pt.setColor(0.6, 0.1, 0.08).box(x + tx * 0.6, 0.5, z + tz * 0.6, 0.5, 1.4, 0.5, rot); pt.setColor(1, 1, 1); B.c('metal').box(x + tx * 0.3, 0.5, z + tz * 0.3, 1.1, 1.4, 0.5, rot); }, 0.6);
      }
    }
  }
}

// The play-area edge: construction-style fence with a green windscreen along the bounds, concrete barriers where a
// street crosses it, nothing where a building already forms the edge. Reads as a closed-off district, not a void.
function boundary(ctx) {
  const { data, playBounds: pb } = ctx; const m = 1.2;
  const corners = [[pb.minX - m, pb.minZ - m], [pb.maxX + m, pb.minZ - m], [pb.maxX + m, pb.maxZ + m], [pb.minX - m, pb.maxZ + m]];
  const segs = []; for (const r of data.roads) { const hw = r.tags.highway; if (!STREETS.includes(hw)) continue; for (let i = 0; i < r.line.length - 1; i++) segs.push([r.line[i], r.line[i + 1], ROADW[hw] / 2 + 1.0]); }
  const onStreet = (x, z) => segs.some(([a, b, w]) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < w; });
  const inBld = (x, z) => (ctx.buildingRings || []).some((r) => pointInRing(x, z, r));
  const trunks = (ctx.gen.trees || []).filter((t) => t[0] > pb.minX - 8 && t[0] < pb.maxX + 8 && t[1] > pb.minZ - 8 && t[1] < pb.maxZ + 8);
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.ceil(L / 6); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; const rot = Math.atan2(-tz, tx);
    // (the green windscreen only where the edge runs along pavement: through lawns and the wooded hillside it is plain
    // chain-link, or the screen draws a dark line through the trees from the air)
    let run = null, runScreen = true; const flush = () => { if (run && run.length > 1) hillFence(ctx, run, runScreen ? { h: 2.4, screen: 2.0, every: 3 } : { h: 2.4, every: 3 }); run = null; };
    const cxm = (pb.minX + pb.maxX) / 2, czm = (pb.minZ + pb.maxZ) / 2;
    // behind every roadblock a chain-link panel 0.5 m further out: a closed road, also where the street falls away and
    // the low barrier alone would sit under eye level
    const ox = e % 2 ? Math.sign(a[0] - cxm) : 0, oz = e % 2 ? 0 : Math.sign(a[1] - czm); const panel = (p0, p1) => hillFence(ctx, [[p0[0] + ox * 0.5, p0[1] + oz * 0.5], [p1[0] + ox * 0.5, p1[1] + oz * 0.5]], { h: 2.4, every: 3 });
    for (let i = 0; i < n; i++) {
      const p0 = [a[0] + tx * (i * L / n), a[1] + tz * (i * L / n)], p1 = [a[0] + tx * ((i + 1) * L / n), a[1] + tz * ((i + 1) * L / n)], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (inBld(mid[0], mid[1])) { flush(); continue; }
      if (onStreet(mid[0], mid[1]) && ctx.terrain && ctx.terrain.maxIn(mid[0], mid[1], 2.8) - ctx.terrain.minIn(mid[0], mid[1], 2.8) > 0.38) {
        // a steep lane: a striped concrete roadblock laid on the slope (built here, sheared with the road; propKit's level
        // barrier would be half buried)
        flush(); const bl = L / n - 0.1; panel(p0, p1);
        onSlope(ctx, mid[0], mid[1], bl / 2, () => { ctx.B.solidBox('concrete', 'concrete', mid[0], 0.3, mid[1], bl, 1.0, 0.6, rot, 1 / 3); const pt = ctx.B.v('paint', true); for (const sd of [-0.31, 0.31]) { pt.setColor(0.95, 0.45, 0.05).box(mid[0] + tz * sd, 0.55, mid[1] - tx * sd, bl - 0.3, 0.22, 0.02, rot); pt.setColor(0.9, 0.9, 0.88).box(mid[0] + tz * sd, 0.27, mid[1] - tx * sd, bl - 0.3, 0.16, 0.02, rot); } pt.setColor(1, 1, 1); });
        continue;
      }
      if (onStreet(mid[0], mid[1])) {
        flush(); panel(p0, p1);
        // a street tree beside the roadblock: shift the barrier a step out (or in) so it stands clear of the trunk
        const bl = L / n - 0.3; const clearOfTrunks = (x, z) => !trunks.some((t) => { const dx = t[0] - x, dz = t[1] - z; return Math.hypot(Math.max(0, Math.abs(dx * tx + dz * tz) - bl / 2), Math.max(0, Math.abs(dx * tz - dz * tx) - 0.3)) < 1.1; });
        for (const o of [0, 0.3, -0.3, 0.6, -0.6]) if (clearOfTrunks(mid[0] + tz * o, mid[1] - tx * o)) { mid[0] += tz * o; mid[1] -= tx * o; break; }
        onSlope(ctx, mid[0], mid[1], bl / 2, () => { propKit.barrier(ctx, mid[0], mid[1], rot, bl); const pt = ctx.B.v('paint', true); pt.setColor(0.95, 0.45, 0.05).box(mid[0], 1.0, mid[1], L / n - 0.6, 0.22, 0.06, rot); pt.setColor(0.9, 0.9, 0.88).box(mid[0], 0.72, mid[1], L / n - 0.6, 0.16, 0.06, rot); pt.setColor(1, 1, 1); }); continue;
      }
      { const ix = mid[0] + Math.sign(cxm - mid[0]) * (e % 2 ? 4 : 0), iz = mid[1] + Math.sign(czm - mid[1]) * (e % 2 ? 0 : 4); const sc = ctx.surfaceAt(ix, iz) !== 'grass'; if (run && sc !== runScreen) { const last = run[run.length - 1]; flush(); run = [last]; } if (!run) run = [p0]; runScreen = sc; run.push(p1); }
    }
    flush();
  }
  // the service alley between the 4th St shopfronts in the south-west corner runs out to the edge: gated
  hillFence(ctx, [[-177.3, 202.6], [-175.1, 202.6]], { h: 2.4, screen: 2.0, every: 3 });
}

export function buildGrounds(ctx) {
  field(ctx);
  frontOfCampus(ctx);
  streets(ctx);
  vehicles(ctx);
  boundary(ctx);
  ctx.B.v('paint', true).setColor(1, 1, 1); ctx.B.v('stucco', true).setColor(1, 1, 1);
}
