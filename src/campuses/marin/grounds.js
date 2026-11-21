// Marin Academy grounds: Championship Field (turf, lines, the MA mark, goals, bleachers, fences, hedge, scoreboard),
// the circle drive in front of Foster Hall, entry sign and flag, car parks and kerb-side cars, street lamps, cover.
import * as THREE from 'three';
import { hedgeMass, hedgeRun, atGround, hillFence, onSlope, ANG, UX, UZ, gp, rect, CLAY, minAreaOBB, hipRoof, boxFromRect, wallDecal, edgeFrame, quadFacing, pointInRing, ensureCCW, makeCanvas, canvasTexture, mulberry32 } from './kit.js';
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
  const { B } = ctx; const step = 3.0; let dist = 0; const run = []; const gaps = opts.gaps || []; const c = G(79, -30);   // fence runs: [[x, z, lift], ...]
  const flush = () => { if (run.length > 1) { const lifts = new Map(run.map((p) => [p[0].toFixed(2) + ',' + p[1].toFixed(2), p[2]])); hillFence({ ...ctx, groundY: (x, z) => lifts.get(x.toFixed(2) + ',' + z.toFixed(2)) ?? gY(ctx, x, z) }, run.map((p) => [p[0], p[1]]), { h: 3.0, black: true, every: step }); } run.length = 0; };
  const rail = []; const flushRail = () => { if (rail.length > 1) { const lifts = new Map(rail.map((p) => [p[0].toFixed(2) + ',' + p[1].toFixed(2), p[2]])); hillFence({ ...ctx, groundY: (x, z) => lifts.get(x.toFixed(2) + ',' + z.toFixed(2)) ?? gY(ctx, x, z) }, rail.map((p) => [p[0], p[1]]), { h: 1.1, black: true, every: step }); } rail.length = 0; };
  // ---- pass 1: the panels (3 m) and the top each one needs
  const panels = [], segStart = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / step)); const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    let nx = -tz, nz = tx; if (nx * (a[0] - c[0]) + nz * (a[1] - c[1]) < 0) { nx = -nx; nz = -nz; }   // outward = away from the pitch centre
    segStart.push(panels.length);
    for (let k = 0; k < n; k++) {
      const p = [a[0] + tx * L * k / n, a[1] + tz * L * k / n], q = [a[0] + tx * L * (k + 1) / n, a[1] + tz * L * (k + 1) / n]; const d0 = dist + L * k / n, d1 = dist + L * (k + 1) / n; const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      // ground behind the block (beyond the pad's blend)
      let top = -Infinity; for (const t of [0, 0.5, 1]) top = Math.max(top, wallTop(ctx, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, nx, nz));
      // (at a graded street the block ends where the sidewalk begins, 2.3 m out at the least (the pad's ramp lies under it), and
      // its top is the ground under THAT footprint: 4.7 m deep it stood 0.4-0.5 m proud right across the Mission Ave walk)
      let WD = WALL_D, street = false, dip = false; const tall = top > 0.7; if (ctx.streets) for (let o = 0.6; o <= 8.0; o += 0.1) {   /* (for every panel, tall or not: the tapering end of a neighbouring wall must not run out across a sidewalk) */ const zs = [0, 0.5, 1].map((t) => ctx.streets.design(p[0] + (q[0] - p[0]) * t + nx * o, p[1] + (q[1] - p[1]) * t + nz * o)); if (zs.some((d) => d && d.zone === 'road')) { WD = Math.max(1.2, o - 0.1); street = true; break; } if (zs.some((d) => d && d.zone === 'walk')) { WD = Math.max(o, 2.3); street = true; const oS = WD;
          // (a walk only 2-3 m from the turf cannot be level on the 2 m lattice next to the pitch: where it dips toward the pitch the
          // block carries on under it, at the walk's own level, as far as the ground is short of the design)
          for (let o2 = o; o2 <= o + 2.6; o2 += 0.2) {   /* (from the back edge of the walk itself, and to the end: starting at the 2.3 m minimum the scan saw no dip on a panel whose dip lay nearer the fence, and that panel got no block) */ const zz = [0, 0.25, 0.5, 0.75, 1].map((t) => { const x = p[0] + (q[0] - p[0]) * t + nx * o2, z = p[1] + (q[1] - p[1]) * t + nz * o2; const d = ctx.streets.design(x, z); return d && d.zone === 'walk' ? Math.min(ctx.groundY(x, z), ctx.terrain ? ctx.terrain.heightAt(x, z) : Infinity) - d.y : null; }); if (zz.every((v) => v === null)) break; if (!zz.some((v) => v !== null && v < -0.07)) continue; WD = Math.max(WD, o2 + 0.2); dip = true; }   /* (five stations and both ground heights, mesh and bilinear: one point of the walk stood 0.16 m low beside the end of a block) */
          break; } }
      if (tall || dip) { if (street) top = -Infinity; for (let t = 0; t <= 1.001; t += 0.25) for (const o of [0.3, 0.85, 1.4, 1.95, 2.5, 3.05, 3.6, 4.15, 4.7, WD].filter((v) => v <= WD)) top = Math.max(top, ctx.groundY(p[0] + (q[0] - p[0]) * t + nx * o, p[1] + (q[1] - p[1]) * t + nz * o)); }   // nothing under the block stands above it
      const wall = (tall || dip) && top > (street ? 0.15 : 0.7);
      const skip = !!(opts.skip && opts.skip(i));   /* (a side that is built elsewhere: the east side along Bryn Mawr Drive, eastSide) */
      panels.push({ seg: i, k, p, q, mid, tx, tz, nx, nz, len: L / n, d0, d1, WD, street, skip, wall: wall && !skip, raw: wall && !street && !skip ? top + 0.12 : -Infinity });
    }
    dist += L;
  }
  // ---- pass 2: ONE continuous top for the whole run (QA: a level top per 3 m panel read as a ziggurat with notches of bank
  // between the steps). The top at each joint is what both panels need; then the upper envelope with a slope of at most
  // 15 %, so the coping runs in straight ramps and a wall ends by tapering down, never in a step.
  const N = panels.length, V = new Float64Array(N + 1).fill(-Infinity), S = 0.15 * step;
  for (let j = 0; j <= N; j++) V[j] = Math.max(j > 0 ? panels[j - 1].raw : -Infinity, j < N ? panels[j].raw : -Infinity);
  for (let j = 1; j <= N; j++) V[j] = Math.max(V[j], V[j - 1] - S); for (let j = N - 1; j >= 0; j--) V[j] = Math.max(V[j], V[j + 1] - S);
  for (let j = 0; j < N; j++) {
    const { p, q, mid, tx, tz, nx, nz, len, d0, d1, WD, street, k, seg } = panels[j]; let wall = panels[j].wall;
    if (panels[j].skip) { flush(); continue; }
    const C = (t, o, y) => [p[0] + (q[0] - p[0]) * t + nx * o, y, p[1] + (q[1] - p[1]) * t + nz * o]; const e = 0.02 / len;
    let h0 = null, h1 = null, o0 = 0;
    if (wall && street) {
      // a block that ends at a sidewalk: its top is the walk's own level at the block's outer edge, at each end of the panel
      const at = (t) => { let m = -Infinity; for (const o of [WD - 0.6, WD - 0.3, WD]) m = Math.max(m, ctx.groundY(p[0] + (q[0] - p[0]) * t + nx * o, p[1] + (q[1] - p[1]) * t + nz * o)); return m + 0.02; }; h0 = at(0); h1 = at(1); const lm = at(0.5) - (h0 + h1) / 2; if (lm > 0.02) { h0 += lm; h1 += lm; }
      // (where the walk is so near the pitch that its ramp starts in front of the fence line, the face stands 0.7 m nearer the turf)
      for (const sh of [0, -0.7, -1.3, -1.9, -2.5, -3.1]) { o0 = sh; if (![0, 0.25, 0.5, 0.75, 1].some((t) => ctx.groundY(p[0] + (q[0] - p[0]) * t + nx * (sh - 0.1), p[1] + (q[1] - p[1]) * t + nz * (sh - 0.1)) > 0.12)) break; }
    } else if (!street && Math.max(V[j], V[j + 1]) > 0.3) { wall = true; h0 = Math.max(0.12, V[j]); h1 = Math.max(0.12, V[j + 1]); }
    else wall = false;
    if (wall) {
      for (const bk of [B.v('concrete'), B.c('concrete')]) { const uv = bk === B.c('concrete') ? undefined : [[0, 0], [1, 0], [1, 0.8], [0, 0.8]];
        quadFacing(bk, C(-e, o0, h0), C(1 + e, o0, h1), C(1 + e, WD, h1), C(-e, WD, h0), [0, 1, 0], uv); quadFacing(bk, C(-e, o0, -0.4), C(1 + e, o0, -0.4), C(1 + e, o0, h1), C(-e, o0, h0), [-nx, 0, -nz], uv); quadFacing(bk, C(-e, WD, -0.4), C(1 + e, WD, -0.4), C(1 + e, WD, h1), C(-e, WD, h0), [nx, 0, nz], uv);
        quadFacing(bk, C(-e, o0, -0.4), C(-e, WD, -0.4), C(-e, WD, h0), C(-e, o0, h0), [-tx, 0, -tz], uv); quadFacing(bk, C(1 + e, o0, -0.4), C(1 + e, WD, -0.4), C(1 + e, WD, h1), C(1 + e, o0, h1), [tx, 0, tz], uv); }
      {
        // a block between the fence and a sidewalk (and the top of every other field-wall block: the satellite shows woodland floor
        // and brush right up to the fence on the north and east sides, never a 4.7 m concrete shelf): Street View shows a strip of dry grass and brush behind the Mission Ave walk, not
        // a concrete shelf. A coping under the fence and a planted top as far as the back edge of the walk (where the walk dips the
        // block carries on under it: that part stays concrete, it IS the walk).
        const cp = B.v('limestone'), vg = B.v('maVerge'); const NS = Math.max(2, Math.round(len / 0.75)); const back = (t) => { if (street) for (let o = Math.max(0.3, o0 + 0.4); o <= WD; o += 0.05) { const d = ctx.streets.design(p[0] + (q[0] - p[0]) * t + nx * o, p[1] + (q[1] - p[1]) * t + nz * o); if (d && (d.zone === 'walk' || d.zone === 'road')) return o - 0.04; } return WD; };
        const hT = (t) => h0 + (h1 - h0) * t;
        quadFacing(cp, C(-e, o0 - 0.03, h0 + 0.05), C(1 + e, o0 - 0.03, h1 + 0.05), C(1 + e, o0 + 0.36, h1 + 0.05), C(-e, o0 + 0.36, h0 + 0.05), [0, 1, 0], [[0, 0], [1, 0], [1, 0.13], [0, 0.13]]);
        quadFacing(cp, C(-e, o0 - 0.03, h0 - 0.03), C(1 + e, o0 - 0.03, h1 - 0.03), C(1 + e, o0 - 0.03, h1 + 0.05), C(-e, o0 - 0.03, h0 + 0.05), [-nx, 0, -nz], [[0, 0], [1, 0], [1, 0.03], [0, 0.03]]);
        quadFacing(cp, C(-e, o0 + 0.36, h0 - 0.0), C(1 + e, o0 + 0.36, h1 - 0.0), C(1 + e, o0 + 0.36, h1 + 0.05), C(-e, o0 + 0.36, h0 + 0.05), [nx, 0, nz], [[0, 0], [1, 0], [1, 0.03], [0, 0.03]]);
        for (let i = 0; i < NS; i++) { const t0 = i / NS, t1 = (i + 1) / NS, b0 = back(t0), b1 = back(t1); if (b0 < o0 + 0.5 && b1 < o0 + 0.5) continue; const a0 = o0 + 0.36;
          quadFacing(vg, C(t0, a0, hT(t0) + 0.02), C(t1, a0, hT(t1) + 0.02), C(t1, Math.max(a0, b1), hT(t1) + 0.02), C(t0, Math.max(a0, b0), hT(t0) + 0.02), [0, 1, 0], [[d0 / 2.2 + t0 * len / 2.2, 0], [d0 / 2.2 + t1 * len / 2.2, 0], [d0 / 2.2 + t1 * len / 2.2, (b1 - a0) / 2.2], [d0 / 2.2 + t0 * len / 2.2, (b0 - a0) / 2.2]]); }
      }
      const m = [mid[0] + nx * (WD + o0) / 2, mid[1] + nz * (WD + o0) / 2]; (ctx.retaining = ctx.retaining || []).push({ x: m[0], z: m[1], tx, tz, fx: -nx, fz: -nz, w: len, d: WD - o0, top: street ? Math.max(h0, h1) : Math.min(h0, h1), frontY: 0, allowTall: true });   // map check: retaining
    }
    // The bank behind the wall is woodland in reality (3D tiles: oaks and conifers right down to the field edge on the north and
    // east sides): real trees on the bank, never on a walk or a roadway. (The clipped "evergreen belt" that stood on the wall top
    // was invented cover: it is gone.)
    if (opts.wood && opts.wood(mid) && !street && (j % 2 === 0)) { const o2 = WD + 1.0 + ((j * 7) % 3) * 1.5, x = mid[0] + nx * o2 + tx * (((j * 5) % 3) - 1) * 0.6, z = mid[1] + nz * o2 + tz * (((j * 5) % 3) - 1) * 0.6;
      const clear = !ctx.streets || [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]].every(([dx, dz]) => { const d = ctx.streets.design(x + dx, z + dz); return !(d && (d.zone === 'road' || d.zone === 'walk')); });
      if (clear && gY(ctx, x, z) > 0.5) ctx.gen.trees.push([+x.toFixed(1), +z.toFixed(1), j % 6 === 0 ? 1 : 0, 0.7 + ((j * 3) % 5) * 0.07]); }
    const open = opts.noFence && opts.noFence(seg) || gaps.some(([g0, g1]) => (d0 + d1) / 2 > g0 && (d0 + d1) / 2 < g1);
    const y0 = wall ? h0 : Math.max(0, gY(ctx, p[0], p[1])), y1 = wall ? h1 : Math.max(0, gY(ctx, q[0], q[1])); const o = wall ? 0.25 : 0;   /* (never below the pitch: where the street is lower the fence stands on the planted margin) */
    const P0 = [p[0] + nx * o, p[1] + nz * o, y0], P1 = [q[0] + nx * o, q[1] + nz * o, y1];
    // An opening in the ball-stop fence is an opening at pitch level. Where the wall under it is more than 1.2 m high it is a
    // drop: a 1.1 m guard rail runs along the top there (rule B11; the north-west side, open toward the campus, stood 2-3 m
    // above the turf with nothing on it for 26 m). It can be jumped; it cannot be walked off.
    if (open) { flush(); if (wall && Math.max(h0, h1) > 1.2) { if (rail.length && (Math.abs(rail[rail.length - 1][2] - y0) > 0.02 || Math.hypot(rail[rail.length - 1][0] - P0[0], rail[rail.length - 1][1] - P0[1]) > 0.05)) flushRail(); if (!rail.length) rail.push(P0); rail.push(P1); } else flushRail(); continue; }
    flushRail();
    if (run.length && (Math.abs(run[run.length - 1][2] - y0) > 0.02 || Math.hypot(run[run.length - 1][0] - P0[0], run[run.length - 1][1] - P0[1]) > 0.05)) flush();
    if (!run.length) run.push(P0); run.push(P1);
  }
  flush(); flushRail();
  return segStart.map((j) => V[j]).concat([V[N]]);   // the top at every vertex of the polyline (corner wedges)
}
// the outside of a convex corner between two wall runs: a wedge of the same block, so the bank does not show between them
function cornerWedge(ctx, v, prev, next, topRun) {
  const { B } = ctx; const c = G(79, -30); const nrm = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; if (nx * (v[0] - c[0]) + nz * (v[1] - c[1]) < 0) { nx = -nx; nz = -nz; } return [nx, nz]; };
  const n1 = nrm(prev, v), n2 = nrm(v, next); let bx = n1[0] + n2[0], bz = n1[1] + n2[1]; const bl = Math.hypot(bx, bz); if (bl < 1e-3) return; bx /= bl; bz /= bl; const cosH = bx * n1[0] + bz * n1[1]; if (cosH > 0.995) return;
  const R = WALL_D / Math.max(0.35, cosH); const ring = ensureCCW([[v[0], v[1]], [v[0] + n1[0] * WALL_D, v[1] + n1[1] * WALL_D], [v[0] + bx * R, v[1] + bz * R], [v[0] + n2[0] * WALL_D, v[1] + n2[1] * WALL_D]]);
  if (!(topRun > 0.3)) return; const top = topRun - 0.12;   // the same top as the two runs that meet here
  B.v('concrete').prism(ring, -0.4, top + 0.12, 1 / 3, true); B.c('concrete').prism(ring, -0.4, top + 0.12, 1, true);
  { const y = top + 0.14, Q = ring.map((p) => [p[0], y, p[1]]); quadFacing(B.v('maVerge'), Q[0], Q[1], Q[2], Q[3], [0, 1, 0], ring.map((p) => [p[0] / 2.2, p[1] / 2.2])); }   // planted like the block tops beside it
}
// ------------------------------------------------------------------------------------------ the Mission Ave gate
// The pitch stands 1.3-1.7 m above the Mission Ave walk at the gate, 2.7 m behind its back edge. A concrete ramp from the fence
// line needed the back metre of the sidewalk (0.3-0.55 m above the walk's design, raw wedge sides). It is a flight of steps
// now, from the turf edge down to the BACK of the walk, between two cheek walls that hold the planted margin; the walk
// keeps its design level over its whole width. (world.js sitework cuts the ground under the flight.)
// (the flight is exactly as wide as the opening in the ball-stop fence: the one 3 m panel of the Mission Ave run that `perimeter`
// leaves out for the gap [38, 43]; the fence's end posts stand in the cheek walls)
const gateSpan = () => { const P = turfWorld(2.0), a = P[1], b = P[0], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 3.0)); let d0 = Infinity, d1 = -Infinity; for (let k = 0; k < n; k++) { const m = L * (k + 0.5) / n; if (m > 38 && m < 43) { d0 = Math.min(d0, L * k / n); d1 = Math.max(d1, L * (k + 1) / n); } }
  const A = (d) => (a[0] + (b[0] - a[0]) * d / L) * UX + (a[1] + (b[1] - a[1]) * d / L) * UZ; return [A(d0) + 0.06, A(d1) - 0.06]; };
export const GATE = { a0: gateSpan()[0], a1: gateSpan()[1], cheek: 0.3, bTurf: 16.1 };
export function gateFlight(ctx) {
  if (ctx._gate !== undefined) return ctx._gate; ctx._gate = null; const S = ctx.streets; if (!S) return null;
  let bBot = Infinity, sum = 0, n = 0; for (let a = GATE.a0; a <= GATE.a1 + 0.01; a += 0.4) for (let b = 16.6; b <= 21.5; b += 0.05) { const q = G(a, b), d = S.design(q[0], q[1]); if (d && d.zone === 'road') break; if (d && d.zone === 'walk') { bBot = Math.min(bBot, b); const q2 = G(a, b + 0.2), d2 = S.design(q2[0], q2[1]); sum += (d2 && d2.zone === 'walk' ? d2 : d).y; n++; break; } }
  if (!n) return null; const topY = 0.02, botY = sum / n + 0.02; if (topY - botY < 0.5) return null;
  const N = Math.max(3, Math.round((topY - botY) / 0.165)), tread = Math.min(0.32, (bBot - GATE.bTurf) / N); if (tread < 0.24) return null; const bTop = bBot - N * tread;
  return (ctx._gate = { ...GATE, bBot, bTop, n: N, tread, riser: (topY - botY) / N, topY, botY, line: (b) => topY - (topY - botY) * Math.max(0, Math.min(1, (b - bTop) / (N * tread))) });
}
function gateSteps(ctx) {
  const f = gateFlight(ctx); if (!f) return; const { B } = ctx; ctx.gen.trees = (ctx.gen.trees || []).filter((t) => { const ta = t[0] * UX + t[1] * UZ, tb = -t[0] * UZ + t[1] * UX; return !(ta > f.a0 - 1.2 && ta < f.a1 + 1.2 && tb > 15.2 && tb < f.bBot + 0.6); });   /* (no trunk on the flight) */
  const conc = B.v('concrete'), col = B.c('concrete'), cap = B.v('limestone'); const am = (f.a0 + f.a1) / 2, w = f.a1 - f.a0, y0 = f.botY - 0.6;
  const P3 = (a, b, y) => { const q = G(a, b); return [q[0], y, q[1]]; };
  // the head of the flight: level with the turf from the turf edge (and, collision only, under the edge of the turf, where the last lattice cell dips)
  for (const bk of [conc, col]) quadFacing(bk, P3(f.a0, 15.9, f.topY), P3(f.a1, 15.9, f.topY), P3(f.a1, f.bTop, f.topY), P3(f.a0, f.bTop, f.topY), [0, 1, 0], bk === col ? undefined : [[0, 0], [w / 3, 0], [w / 3, 0.1], [0, 0.1]]);
  quadFacing(col, P3(f.a0 - f.cheek, 13.6, 0.015), P3(f.a1 + f.cheek, 13.6, 0.015), P3(f.a1 + f.cheek, 15.9, 0.015), P3(f.a0 - f.cheek, 15.9, 0.015), [0, 1, 0]);
  // treads (drawn as boxes with a nosing; collision is the plane through the nosings, as on every flight here)
  for (let k = 0; k < f.n - 1; k++) { const y = f.topY - (k + 1) * f.riser, c = G(am, f.bTop + (k + 0.5) * f.tread); conc.box(c[0], (y0 + y) / 2, c[1], w, y - y0, f.tread, ROT, 1 / 3);
    const nz = G(am, f.bTop + k * f.tread + 0.04); cap.box(nz[0], y + 0.006, nz[1], w, 0.012, 0.08, ROT, 1 / 3); }
  { const c = G(am, f.bTop - 0.02); conc.box(c[0], (y0 + f.topY) / 2 - 0.005, c[1], w, f.topY - y0 - 0.01, 0.04, ROT, 1 / 3); }   // the top riser
  quadFacing(col, P3(f.a0, f.bTop, f.topY), P3(f.a1, f.bTop, f.topY), P3(f.a1, f.bBot, f.botY), P3(f.a0, f.bBot, f.botY), [0, 1, 0]);
  // the foot: a strip at the walk's own level at each side (the walk falls 3 % along the gate)
  { const yW = (a) => { const q = G(a, f.bBot + 0.3), d = ctx.streets.design(q[0], q[1]); return (d ? d.y : f.botY - 0.02) + 0.02; };
    for (const bk of [conc, col]) quadFacing(bk, P3(f.a0, f.bBot - f.tread, f.botY), P3(f.a1, f.bBot - f.tread, f.botY), P3(f.a1, f.bBot + 0.3, yW(f.a1)), P3(f.a0, f.bBot + 0.3, yW(f.a0)), [0, 1, 0], bk === col ? undefined : [[0, 0], [w / 3, 0], [w / 3, 0.2], [0, 0.2]]); }
  // cheek walls: they hold the planted margin (pitch level) either side, coping 0.3 m above it, from the turf edge to the back of the walk
  for (const a of [f.a0 - f.cheek / 2, f.a1 + f.cheek / 2]) { const b0 = 15.9, b1 = f.bBot, c = G(a, (b0 + b1) / 2); conc.box(c[0], (y0 + 0.3) / 2, c[1], f.cheek, 0.3 - y0, b1 - b0, ROT, 1 / 3); col.box(c[0], (y0 + 0.35) / 2, c[1], f.cheek, 0.35 - y0, b1 - b0, ROT);
    cap.box(c[0], 0.325, c[1], f.cheek + 0.08, 0.05, b1 - b0 + 0.06, ROT, 1 / 3); }
  // a handrail down the middle
  { const g = B.v('galv'); const t0 = P3(am, f.bTop - 0.3, f.topY + 0.92), t1 = P3(am, f.bTop, f.topY + 0.92), b1 = P3(am, f.bBot - f.tread, f.botY + f.riser + 0.92), b2 = P3(am, f.bBot - f.tread + 0.3, f.botY + f.riser + 0.92); g.tube(t0, t1, 0.022, 6).tube(t1, b1, 0.022, 6).tube(b1, b2, 0.022, 6);
    for (const t of [0, 0.5, 1]) { const b = f.bTop + (f.bBot - f.tread - f.bTop) * t, y = f.topY - (f.topY - f.botY - f.riser) * t; g.tube(P3(am, b, y + 0.92), P3(am, b, y - 0.05), 0.016, 5); B.c('metal').box(...P3(am, b, y + 0.46), 0.06, 0.92, 0.06, ROT); } }
}
// ------------------------------------------------------------------------------------------ the east side (Bryn Mawr Drive)
// Street View (2025) of the pitch side of Bryn Mawr Drive: NO sidewalk. A red kerb, a strip of dry grass, then a planted bank
// (shrubs, a row of trees) down to the black ball-stop fence at the edge of the pitch, a low black chain-link fence behind
// the kerb where the bank is high, and at Mission Ave a level bed behind the corner of the sidewalk. The strip is 7 m wide
// and rises 2.7-5.4 m. On the 2 m lattice that cannot be terrain (a 0.7 m gap between the fence corner and the Mission Ave
// walk was a pit, and the "field wall" grew into a 6 m concrete slab from the fence to the kerb): it is ONE built surface
// (toe wall with the fence, bank at 32 deg or less, verge, kerb), the ground is cut below it (world.js sitework), and the
// corner of the Mission Ave walk is a built apron at the walk's design level.
const EB = { K: 0.1, V: 1.25, WF: 0.35, BED: 0.12, FLAT: 2.2, BLEND: 8, GRADE: 0.62 };
/** Frame and designed surface of the east side: u along the fence line from the Mission Ave corner (north), o outward from it. */
export function eastSideGeom(ctx) {
  if (ctx._east !== undefined) return ctx._east; const S = ctx.streets; ctx._east = null; if (!S) return null;
  const P = turfWorld(2.0), A = P[0], Q = P[5]; const L = Math.hypot(Q[0] - A[0], Q[1] - A[1]), tx = (Q[0] - A[0]) / L, tz = (Q[1] - A[1]) / L; let nx = -tz, nz = tx; { const c = G(79, -30); if (nx * (A[0] - c[0]) + nz * (A[1] - c[1]) < 0) { nx = -nx; nz = -nz; } }
  const at = (u, o) => [A[0] + tx * u + nx * o, A[1] + tz * u + nz * o], uo = (x, z) => [(x - A[0]) * tx + (z - A[1]) * tz, (x - A[0]) * nx + (z - A[1]) * nz];
  const { K, V, WF, BED, FLAT, BLEND, GRADE } = EB; const DU = 0.5, NU = Math.round(L / DU) + 1;
  // per station: W = distance from the fence line to the edge of the carriageway, R = the level of that edge
  const W = new Float64Array(NU), R = new Float64Array(NU);
  for (let k = 0; k < NU; k++) { const u = Math.min(L, k * DU); for (let o = 2; o <= 12; o += 0.05) { const p = at(u, o), d = S.design(p[0], p[1]); if (d && d.zone === 'road') { W[k] = o; R[k] = d.y; break; } if (d && d.zone === 'walk') break; } if (!(W[k] > 3.5)) return null; }
  const lin = (arr, u) => { const f = Math.max(0, Math.min(NU - 1, u / DU)), i = Math.min(NU - 2, Math.floor(f)); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };
  // the south end of every line o = const: the back of the Mission Ave walk (or its roadway), and the walk's level there
  const DO = 0.25, NO = Math.ceil(12 / DO) + 1, uS = new Float64Array(NO).fill(-6), yS = new Float64Array(NO).fill(NaN);
  for (let j = 0; j < NO; j++) for (let u = 1.5; u >= -6; u -= 0.05) { const p = at(u, j * DO), d = S.design(p[0], p[1]); if (d && (d.zone === 'walk' || d.zone === 'road')) { uS[j] = u; yS[j] = d.y; break; } }
  for (let j = 0; j < NO; j++) if (Number.isNaN(yS[j])) return null;
  // (the back of the walk is a curve at the corner: interpolated between the 0.25 m samples the bed's edge cut 0.1-0.2 m into the
  // walk and stood 0.14 m over its design (QA). The bed starts behind the furthest of three neighbouring samples, plus 8 cm)
  { const u0 = Float64Array.from(uS); for (let j = 0; j < NO; j++) uS[j] = Math.max(u0[Math.max(0, j - 1)], u0[j], u0[Math.min(NO - 1, j + 1)]) + 0.08; }
  const linO = (arr, o) => { const f = Math.max(0, Math.min(NO - 1, o / DO)), i = Math.min(NO - 2, Math.floor(f)); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };
  // the toe wall: as low as a bank of at most GRADE allows (0.5 m at the least), one top with a slope of at most 15 %
  const hb = new Float64Array(NU); for (let k = 0; k < NU; k++) hb[k] = Math.max(0.5, R[k] + K - GRADE * (W[k] - V - WF));
  for (let k = 1; k < NU; k++) hb[k] = Math.max(hb[k], hb[k - 1] - 0.15 * DU); for (let k = NU - 2; k >= 0; k--) hb[k] = Math.max(hb[k], hb[k + 1] - 0.15 * DU);
  const E = { A, L, tx, tz, nx, nz, at, uo, ...EB,
    Wat: (u) => lin(W, u), Rat: (u) => lin(R, u), uSat: (o) => linO(uS, Math.min(o, lin(W, 0) - 0.3)), ySat: (o) => linO(yS, Math.min(o, lin(W, 0) - 0.3)),
    /** top of the toe wall (topN: the top of the field wall that carries on north of the corner; the toe wall rises to meet it) */
    hAt: (u, topN = -Infinity) => Math.min(lin(R, u) + K, Math.max(lin(hb, u), topN - 0.22 * (L - u))),
    /** the built surface */
    surf(u, o, topN) { const w = lin(W, u), r = lin(R, u) + K, h = E.hAt(u, topN); const bank = o <= WF ? h : o >= w - V ? r : h + (r - h) * (o - WF) / (w - V - WF);
      const d = u - E.uSat(o); if (d >= FLAT + BLEND) return bank; const t = d <= FLAT ? 0 : (d - FLAT) / BLEND; return (E.ySat(o) + BED) * (1 - t) + bank * t; },
    /** the level a lattice node under the surface takes (null: not under it). Nothing rises within 2.3 m of the fence line (no
     * node next to one in front of the wall face may stand above the pitch), the rest follows the lowest bank, 0.35 m below it. */
    ground(x, z) { const [u, o] = uo(x, z); if (o < -0.2 || u > L + 0.4 || u < -6) return null; const w = lin(W, u); if (o > w + 0.3 || u < E.uSat(Math.max(0, o)) - 0.05) return null;
      if (o < 2.3) return 0; const r = lin(R, u); return Math.max(0, Math.min(r - 0.08, (r + K) * (o - WF) / (w - V - WF) - 0.35, E.ySat(o) - 0.05 + Math.max(0, u - E.uSat(o)) * 0.5)); } };
  return (ctx._east = E);
}
/** The west edge of Bryn Mawr Drive's carriageway between the pitch and the hill (the street piece with the east-side walk):
 * stations [{ z, x (edge), cx, cz (centre line) }] sorted by z, and edgeX(z) (null outside). */
function bmWestStations(streets) {
  if (!streets || !streets.stations) return null; const out = [];
  for (const s of streets.stations) { if (s.name !== 'Bryn Mawr Drive' || !String(s.id).includes(':s')) continue; for (const p of s.pts) { if (!p.eL || !p.eR) continue; const e = p.eL[0] < p.eR[0] ? p.eL : p.eR; const dx = e[0] - p.x, dz = e[1] - p.z, l = Math.hypot(dx, dz) || 1; out.push({ z: p.z + dz / l * s.hw, x: p.x + dx / l * s.hw, cx: p.x, cz: p.z }); } }   /* (eL / eR sample the crown half way out: the kerb line is hw from the centre) */
  out.sort((a, b) => a.z - b.z); return out.length > 2 ? out : null;
}
export function bmWestEdge(streets) {
  const st = bmWestStations(streets); if (!st) return null;
  return (z) => { if (z < st[0].z || z > st[st.length - 1].z) return null; let i = 0; while (i < st.length - 2 && st[i + 1].z < z) i++; const a = st[i], b = st[i + 1], t = (z - a.z) / ((b.z - a.z) || 1); return a.x + (b.x - a.x) * t; };
}
/** The concrete lip at the edge of the asphalt on the west side of Bryn Mawr Drive, from the north end of the east side's red kerb
 * up to the top of the street piece (Street View est_n2 / est_n3): flush with the shoulder, 0.35 m wide, visual only. */
function bmWestLip(ctx, E) {
  const st = bmWestStations(ctx.streets); if (!st || !E) return; const conc = B_(ctx); const zN = E.at(E.L, E.Wat(E.L))[1];
  const pts = st.filter((p) => p.z < zN - 0.2 && p.z > -104).sort((a, b) => b.z - a.z); if (pts.length < 2) return;
  const edge = (p) => { const dx = p.x - p.cx, dz = p.z - p.cz, l = Math.hypot(dx, dz) || 1; const ox = p.x + dx / l * 0.35, oz = p.z + dz / l * 0.35; return [[p.x, gY(ctx, p.x, p.z) + 0.025, p.z], [ox, gY(ctx, ox, oz) + 0.025, oz]]; };
  let s = 0; for (let i = 0; i < pts.length - 1; i++) { const [a0, a1] = edge(pts[i]), [b0, b1] = edge(pts[i + 1]); const ds = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    if (ds > 3) { s += ds; continue; } quadFacing(conc, a0, b0, b1, a1, [0, 1, 0], [[s / 2, 0], [(s + ds) / 2, 0], [(s + ds) / 2, 0.17], [s / 2, 0.17]]); s += ds; }
}
const B_ = (ctx) => ctx.B.v('concrete');
/** Builds the east side: toe wall + ball-stop fence, planted bank, verge, red kerb, kerb fence, trees, and the apron at the corner. */
function eastSide(ctx, topN) {
  const E = eastSideGeom(ctx); if (!E) return false; const { B } = ctx; const { L, tx, tz, nx, nz, K, V, WF } = E; const tN = topN > 0.3 ? topN : -Infinity;
  const conc = B.v('concrete'), cap = B.v('limestone'), col = B.c('concrete'), dirt = B.c('dirt'), ivy = B.v('maHedge', true), mulch = B.v('maVerge');
  const NR = Math.ceil((L + 2) / 1.5), NC = 6;
  const colO = (c, u) => { const w = E.Wat(Math.max(0, u)); return [0, WF, WF + (w - V - WF) / 3, WF + (w - V - WF) * 2 / 3, w - V, w][c]; };
  // every column runs from its own south end (the back of the Mission Ave walk) to u = L, in NR rows
  const grid = []; for (let c = 0; c < NC; c++) { const row = []; for (let i = 0; i <= NR; i++) { let u = 0, o = 0; for (let it = 0; it < 3; it++) { o = colO(c, u); const us = E.uSat(o); u = us + (L - us) * i / NR; } const p = E.at(u, o); row.push({ u, o, x: p[0], z: p[1], y: E.surf(u, Math.max(o, WF), tN) }); } grid.push(row); }
  const P3 = (g, dy = 0) => [g.x, g.y + dy, g.z];
  for (let i = 0; i < NR; i++) {
    const a0 = grid[0][i], a1 = grid[0][i + 1], b0 = grid[1][i], b1 = grid[1][i + 1]; const uvL = Math.hypot(a1.x - a0.x, a1.z - a0.z) / 3;
    // toe wall: face toward the pitch, coping, the lip behind it
    for (const bk of [conc, col]) quadFacing(bk, [a0.x, -0.4, a0.z], [a1.x, -0.4, a1.z], P3(a1, 0.06), P3(a0, 0.06), [-nx, 0, -nz], bk === col ? undefined : [[0, 0], [uvL, 0], [uvL, (a1.y + 0.46) / 3], [0, (a0.y + 0.46) / 3]]);
    quadFacing(cap, P3(a0, 0.07), P3(a1, 0.07), P3(b1, 0.07), P3(b0, 0.07), [0, 1, 0], [[0, 0], [uvL, 0], [uvL, 0.13], [0, 0.13]]); quadFacing(col, P3(a0, 0.07), P3(a1, 0.07), P3(b1, 0.07), P3(b0, 0.07), [0, 1, 0]);
    quadFacing(cap, [a0.x - nx * 0.03, a0.y - 0.02, a0.z - nz * 0.03], [a1.x - nx * 0.03, a1.y - 0.02, a1.z - nz * 0.03], [a1.x - nx * 0.03, a1.y + 0.07, a1.z - nz * 0.03], [a0.x - nx * 0.03, a0.y + 0.07, a0.z - nz * 0.03], [-nx, 0, -nz], [[0, 0], [uvL, 0], [uvL, 0.03], [0, 0.03]]);
    quadFacing(cap, P3(b0, -0.02), P3(b1, -0.02), P3(b1, 0.07), P3(b0, 0.07), [nx, 0, nz], [[0, 0], [uvL, 0], [uvL, 0.03], [0, 0.03]]);
    // bank (ivy and brush), verge (dry grass)
    for (let c = 1; c < NC - 1; c++) { const p0 = grid[c][i], p1 = grid[c][i + 1], q0 = grid[c + 1][i], q1 = grid[c + 1][i + 1]; const verge = c === NC - 2;
      const tn = 0.92 + ((i * 7 + c * 3) % 5) * 0.04; if (!verge) ivy.setColor(0.44 * tn, 0.52 * tn, 0.4 * tn);
      quadFacing(verge ? mulch : ivy, P3(p0), P3(p1), P3(q1), P3(q0), [0, 1, 0], [[p0.o / 2.2, p0.u / 2.2], [p1.o / 2.2, p1.u / 2.2], [q1.o / 2.2, q1.u / 2.2], [q0.o / 2.2, q0.u / 2.2]]);
      quadFacing(dirt, P3(p0), P3(p1), P3(q1), P3(q0), [0, 1, 0]); }
    // kerb: the face down to the roadway and the red paint on top
    { const k0 = grid[NC - 1][i], k1 = grid[NC - 1][i + 1]; for (const bk of [conc, col]) quadFacing(bk, [k0.x, k0.y - 0.5, k0.z], [k1.x, k1.y - 0.5, k1.z], P3(k1), P3(k0), [nx, 0, nz], bk === col ? undefined : [[0, 0], [uvL, 0], [uvL, 0.17], [0, 0.17]]);
      const red = B.v('paint', true); red.setColor(0.36, 0.045, 0.035); quadFacing(red, [k0.x - nx * 0.16, k0.y + 0.006, k0.z - nz * 0.16], [k1.x - nx * 0.16, k1.y + 0.006, k1.z - nz * 0.16], P3(k1, 0.006), P3(k0, 0.006), [0, 1, 0]);
      quadFacing(red, [k0.x + nx * 0.004, k0.y - 0.13, k0.z + nz * 0.004], [k1.x + nx * 0.004, k1.y - 0.13, k1.z + nz * 0.004], [k1.x + nx * 0.004, k1.y + 0.006, k1.z + nz * 0.004], [k0.x + nx * 0.004, k0.y + 0.006, k0.z + nz * 0.004], [nx, 0, nz]); red.setColor(1, 1, 1); }
  }
  ivy.setColor(1, 1, 1);
  // the two ends: a kerb edging along the back of the Mission Ave walk, a closing face at the north end (the field wall's corner block stands there)
  for (let c = 0; c < NC - 1; c++) { const p = grid[c][0], q = grid[c + 1][0]; for (const bk of [conc, col]) quadFacing(bk, [p.x, p.y - 0.6, p.z], [q.x, q.y - 0.6, q.z], P3(q, c === 0 ? 0.07 : 0), P3(p, c === 0 ? 0.07 : 0), [-tx, 0, -tz], bk === col ? undefined : [[0, 0], [0.4, 0], [0.4, 0.2], [0, 0.2]]);
    const pn = grid[c][NR], qn = grid[c + 1][NR]; for (const bk of [conc, col]) quadFacing(bk, [pn.x, -0.4, pn.z], [qn.x, -0.4, qn.z], P3(qn), P3(pn), [tx, 0, tz], bk === col ? undefined : [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]); }
  // the south end of the toe wall stood 0.31-0.35 m over the dirt margin between the Mission Ave fence and the walk, square to
  // a player hugging the back of the walk (QA: held at 122.5, 33.4): a concrete chamfer from the margin up to the coping, from
  // the back of the walk to just short of the Mission Ave fence (u = 0)
  { const g0 = grid[0][0], uN = -0.12, oW = -0.8; let uB = null; for (let u = uN; u >= -6; u -= 0.05) { const p = E.at(u, oW), d = ctx.streets.design(p[0], p[1]); if (d && (d.zone === 'walk' || d.zone === 'road')) { uB = u + 0.05; break; } }
    if (uB !== null && g0.u < uN - 0.2) { const top = (u) => E.surf(u, WF, tN) + 0.07; const yM = E.ySat(0) - 0.15; const lo = (u) => { const p = E.at(u, oW); return [p[0], yM, p[1]]; };   /* (the margin stands 0.1-0.14 m under the walk: the outer edge tucks under it; the terrain mesh below is lower) */ const hi = (u) => { const p = E.at(u, -0.03); return [p[0], top(u), p[1]]; };
      const N = 3; for (let k = 0; k < N; k++) { const ui0 = g0.u + (uN - g0.u) * k / N, ui1 = g0.u + (uN - g0.u) * (k + 1) / N, uo0 = uB + (uN - uB) * k / N, uo1 = uB + (uN - uB) * (k + 1) / N;
        for (const bk of [conc, col]) quadFacing(bk, hi(ui0), hi(ui1), lo(uo1), lo(uo0), [0, 1, 0], bk === col ? undefined : [[0, 0], [0.3, 0], [0.3, 0.3], [0, 0.3]]); }
      for (const [ui, uo, s] of [[g0.u, uB, -1], [uN, uN, 1]]) { const h = hi(ui), l = lo(uo), b = [h[0], l[1] - 0.05, h[2]]; for (const bk of [conc, col]) { quadFacing(bk, [l[0], l[1] - 0.05, l[2]], b, h, l, [tx * s, 0, tz * s]); } } } }
  // the ball-stop fence on the toe wall, from the end of the Mission Ave run to the corner block
  { const u0 = -0.25, n = Math.max(1, Math.round((L - u0) / 3)); const pts = [], lifts = new Map(); for (let k = 0; k <= n; k++) { const u = u0 + (L - u0) * k / n, p = E.at(u, 0.17); pts.push(p); lifts.set(p[0].toFixed(2) + ',' + p[1].toFixed(2), E.surf(u, WF, tN) + 0.07); }
    hillFence({ ...ctx, groundY: (x, z) => lifts.get(x.toFixed(2) + ',' + z.toFixed(2)) ?? gY(ctx, x, z) }, pts, { h: 3.0, black: true, every: 4 }); }
  // the low fence behind the kerb where the bank is high (Street View: from about the middle of the pitch north)
  { const u0 = 30, n = Math.max(1, Math.round((L - u0) / 2.5)); const pts = [], lifts = new Map(); for (let k = 0; k <= n; k++) { const u = u0 + (L - u0) * k / n, o = E.Wat(u) - V + 0.04, p = E.at(u, o); pts.push(p); lifts.set(p[0].toFixed(2) + ',' + p[1].toFixed(2), E.surf(u, o, tN)); }
    hillFence({ ...ctx, groundY: (x, z) => lifts.get(x.toFixed(2) + ',' + z.toFixed(2)) ?? gY(ctx, x, z) }, pts, { h: 1.1, black: true, every: 4 }); }
  // planting: the row of trees on the bank (canopy scan trees that stand on the wall, the verge or the bed's edge go), shrubs in drifts
  { const inStrip = (t) => { const [u, o] = E.uo(t[0], t[1]); return u > E.uSat(Math.max(0, Math.min(o, 6))) - 0.4 && u < L + 0.5 && o > -0.6 && o < E.Wat(u) + 0.3; };
    ctx.gen.trees = (ctx.gen.trees || []).filter((t) => !inStrip(t) && !(Math.hypot(t[0] - E.A[0], t[1] - E.A[1]) < 3.2 && E.uo(t[0], t[1])[1] < 0));   /* (nor a trunk through the fence at the end of the Mission Ave run) */
    for (let k = 0, u = 3.2; u < L - 2; k++, u += 6.6 + ((k * 5) % 3) * 1.1) { const o = 2.9 + ((k * 7) % 4) * 0.55, p = E.at(u, o); ctx.gen.trees.push([+p[0].toFixed(1), +p[1].toFixed(1), 0, 0.62 + ((k * 3) % 5) * 0.06]); }
    for (let k = 0, u = 1.2; u < L - 1.5; k++, u += 2.3 + ((k * 3) % 4) * 0.5) { const w = E.Wat(u), f = [0.24, 0.62, 0.42, 0.8][k % 4], o = WF + (w - V - WF) * f, len = 1.5 + ((k * 5) % 3) * 0.5, p = E.at(u, o); const y = Math.min(E.surf(u - len / 2, o, tN), E.surf(u + len / 2, o, tN), E.surf(u, o - 0.4, tN));
      ctx.shrubs.push([p[0], y - 0.12, p[1], len, 0.75 + ((k * 7) % 4) * 0.09, Math.atan2(-tz, tx)]); } }
  // ---- the corner of the Mission Ave walk: a concrete apron at the walk's design level, kerb to back edge, from 22.75 m west of the
  // fence corner to Bryn Mawr Drive (from where the field wall's blocks begin to carry on under the back of the walk: started 3 m
  // from the corner, its end crossed those block tops in a diagonal seam, and the walk was a patchwork of three surfaces). The pitch is 2 m below the walk and 0.7 m from it here: the lattice cannot hold the walk's
  // back edge, and what showed was a 0.5-1 m pit with a concrete wedge beside it.
  { const P = turfWorld(2.0), a = P[1], b = P[0]; const Ls = Math.hypot(b[0] - a[0], b[1] - a[1]), sx = (b[0] - a[0]) / Ls, sz = (b[1] - a[1]) / Ls; let mx = -sz, mz = sx; if (mx * (b[0] - G(79, -30)[0]) + mz * (b[1] - G(79, -30)[1]) < 0) { mx = -mx; mz = -mz; }
    const S0 = -22.75; const rows = []; for (let s = S0; s <= 9.01; s += 0.25) { let ob = null, of = null; for (let o = -0.6; o <= 7; o += 0.05) { const x = b[0] + sx * s + mx * o, z = b[1] + sz * s + mz * o; const d = ctx.streets.design(x, z); if (d && d.zone === 'walk') { if (ob === null) ob = o; of = o; } else if (ob !== null || (d && d.zone === 'road')) break; }
      if (ob === null || of - ob < 1.0) { if (rows.length) break; continue; } const pt = (o, oh = o) => { const x = b[0] + sx * s + mx * o, z = b[1] + sz * s + mz * o; const d = ctx.streets.design(b[0] + sx * s + mx * oh, b[1] + sz * s + mz * oh); const f = Math.max(0, Math.min(1, (s - S0) / 1.5)); return [x, (gY(ctx, x, z) + 0.012) * (1 - f) + (d.y + 0.03) * f, z]; };   /* (the west end meets the walk AS LAID over two metres, point by point: the terrain walk stands 0-8 cm under its design there, and an end at design level, or one dipped a blind 10 cm, showed as a step or a diagonal seam: a wedge lying on the sidewalk) */ rows.push({ s, pts: [pt(ob - 0.08, ob), pt((ob + of) / 2), pt(of)] }); }
    for (let i = 0; i < rows.length - 1; i++) { const r0 = rows[i], r1 = rows[i + 1]; for (let c = 0; c < 2; c++) for (const bk of [conc, col]) quadFacing(bk, r0.pts[c], r1.pts[c], r1.pts[c + 1], r0.pts[c + 1], [0, 1, 0], bk === col ? undefined : [[r0.s / 3, c * 0.4], [r1.s / 3, c * 0.4], [r1.s / 3, c * 0.4 + 0.4], [r0.s / 3, c * 0.4 + 0.4]]);
      const k0 = r0.pts[2], k1 = r1.pts[2]; for (const bk of [conc, col]) quadFacing(bk, [k0[0], k0[1] - 0.4, k0[2]], [k1[0], k1[1] - 0.4, k1[2]], k1, k0, [mx, 0, mz], bk === col ? undefined : [[0, 0], [0.17, 0], [0.17, 0.13], [0, 0.13]]); }
    if (rows.length) { const r = rows[rows.length - 1]; for (let c = 0; c < 2; c++) for (const bk of [conc, col]) quadFacing(bk, [r.pts[c][0], r.pts[c][1] - 0.4, r.pts[c][2]], [r.pts[c + 1][0], r.pts[c + 1][1] - 0.4, r.pts[c + 1][2]], r.pts[c + 1], r.pts[c], [sx, 0, sz], bk === col ? undefined : [[0, 0], [0.4, 0], [0.4, 0.13], [0, 0.13]]); } }
  return true;
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
  // one run round the pitch: south (Mission Ave), east, north-east, north, north-west, then the wall alone on the west
  // side north of the spectator terrace (campus side, no fence)
  { const t = (-33 - TURF[2][1]) / (TURF[1][1] - TURF[2][1]); const w1 = [P[2][0] + (P[1][0] - P[2][0]) * t, P[2][1] + (P[1][1] - P[2][1]) * t]; const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]); const D1 = len(P[1], P[0]) + len(P[0], P[5]);
    // (the east side along Bryn Mawr Drive is one built piece, eastSide: toe wall, planted bank, verge. The "east path gate" that
    // used to open in that fence led nowhere: there is no path on the bank, and it was a 3.4 m drop from the slab above.)
    const east = eastSideGeom(ctx);
    const tops = perimeter(ctx, [P[1], P[0], P[5], P[4], P[3], P[2], w1], { gaps: east ? [[38, 43], [D1 + 100, D1 + 126]] /* (the opening at D1 + 20 on the north-east side stood on a 5.2 m wall: closed) */ : [[38, 43], [118, 122], [D1 + 20, D1 + 24], [D1 + 100, D1 + 126]], noFence: (seg) => seg === 5, wood: (m) => m[1] < -20 || m[0] > 118, skip: east ? (seg) => seg === 1 : null });
    if (east) { eastSide(ctx, tops[2]); bmWestLip(ctx, east); }
    cornerWedge(ctx, P[5], P[0], P[4], tops[2]); cornerWedge(ctx, P[4], P[5], P[3], tops[3]); cornerWedge(ctx, P[3], P[4], P[2], tops[4]); cornerWedge(ctx, P[2], P[3], w1, tops[5]); }
  // The hedge along Mission Ave (Street View: "solid broadleaf evergreen hedge about 4-5 m tall right at the back of the
  // sidewalk"): one continuous clipped wall between the fence line and the BACK of the designed walk, never on it. Mission
  // Ave is not parallel to the pitch, so every station is fitted to its own strip (depth 0.6-1.3 m); where the walk comes
  // right up to the fence the hedge stands on the pitch side of the line. Its top runs with the street (slope <= 10 %).
  { const b0 = 17.55; const runs = [[]];
    // (the hedge stops at the cheek walls of the gate steps: a station on each, none between them)
    const gf = gateFlight(ctx), gA0 = gf ? gf.a0 - gf.cheek - 0.02 : 68, gA1 = gf ? gf.a1 + gf.cheek + 0.02 : 78; const As = []; for (let a = 37; a <= 122.01; a += 2.35) if (!(a > gA0 - 0.7 && a < gA1 + 0.7)) As.push(a); if (gf) As.push(gA0, (gA0 + gA1) / 2, gA1); As.sort((p, q) => p - q);
    for (const a of As) { const inGap = a > gA0 + 0.01 && a < gA1 - 0.01;
      let edge = 21.0; if (ctx.streets) for (let b = 16.6; b <= 21.0; b += 0.1) if ([-1.2, 0, 1.2].some((da) => { const q = G(a + da, b); const d = ctx.streets.design(q[0], q[1]); return ctx.streets.inRoad(q[0], q[1], 0.1) || (d && (d.zone === 'walk' || d.zone === 'road')); })) { edge = b; break; }
      const back = edge - 0.12, d = Math.max(0.6, Math.min(1.3, back - b0)), bc = back - d / 2; const c = G(a, bc); let lo = Infinity, hi = -Infinity;
      for (const da of [-1.1, 0, 1.1]) for (const db of [-d / 2, 0, d / 2]) { const q = G(a + da, bc + db); const g = gY(ctx, q[0], q[1]); lo = Math.min(lo, g); hi = Math.max(hi, g); }
      if (inGap) { if (runs[runs.length - 1].length) runs.push([]); continue; }
      runs[runs.length - 1].push({ x: c[0], z: c[1], nx: -UZ, nz: UX, d, y0: lo, y1: Math.max(hi, 0) + 4.4, a, bc }); }
    gateSteps(ctx);
    for (const st of runs) { const S = 0.1 * 2.35; for (let j = 1; j < st.length; j++) st[j].y1 = Math.max(st[j].y1, st[j - 1].y1 - S); for (let j = st.length - 2; j >= 0; j--) st[j].y1 = Math.max(st[j].y1, st[j + 1].y1 - S); hedgeRun(ctx, st, 0.88);
      // the planted margin: where the street is lower than the pitch the step lies between the turf edge and the hedge (the walk
      // and the lattice row behind it are at street level). Pitch-level ground, ivy-covered as in Street View, from the turf edge
      // to the hedge; the fence stands on it, the hedge hides its street face.
      const ivy = B.v('maHedge', true), col = B.c('concrete'); ivy.setColor(0.46, 0.53, 0.42);
      for (let j = 0; j < st.length - 1; j++) { const s0 = st[j], s1 = st[j + 1]; if (Math.min(s0.y0, s1.y0) > -0.2) continue; const f0 = G(s0.a, 16.02), f1 = G(s1.a, 16.02), y = 0.02;
        { const g0 = G(s0.a, 13.6), g1 = G(s1.a, 13.6); quadFacing(col, [g0[0], y - 0.005, g0[1]], [g1[0], y - 0.005, g1[1]], [f1[0], y - 0.005, f1[1]], [f0[0], y - 0.005, f0[1]], [0, 1, 0]); }   /* (collision only, under the edge of the turf: the last lattice cell dips there) */
        const P0 = [f0[0], y, f0[1]], P1 = [f1[0], y, f1[1]], P2 = [s1.x, y, s1.z], P3 = [s0.x, y, s0.z];
        quadFacing(ivy, P0, P1, P2, P3, [0, 1, 0], [[s0.a / 2, 0], [s1.a / 2, 0], [s1.a / 2, 1], [s0.a / 2, 1]]); quadFacing(col, P0, P1, P2, P3, [0, 1, 0]);
        quadFacing(col, [s0.x, Math.min(s0.y0, s1.y0) - 0.3, s0.z], [s1.x, Math.min(s0.y0, s1.y0) - 0.3, s1.z], P2, P3, [-UZ, 0, UX]); }
      ivy.setColor(1, 1, 1); } }
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
  propKit.bikeRack(ctx, -1.5, -24, ROT + Math.PI / 2); propKit.bikeRack(ctx, 4, -82, ROT);
  // stone seat wall round the south half of the circle lawn (cover) + the plaque boulder in the middle
  const cx = -20.3, cz = -4.6, R = 15.2;
  for (let k = 0; k < 9; k++) { const a0 = 0.18 * Math.PI + k * 0.071 * Math.PI, a1 = a0 + 0.06 * Math.PI; if (k === 4) continue; const xa = cx + Math.cos(a0) * R, za = cz + Math.sin(a0) * R, xb = cx + Math.cos(a1) * R, zb = cz + Math.sin(a1) * R; const L = Math.hypot(xb - xa, zb - za); atGround(ctx, (xa + xb) / 2, (za + zb) / 2, () => B.solidBox('limestone', 'concrete', (xa + xb) / 2, 0.18, (za + zb) / 2, L + 0.05, 0.76, 0.5, Math.atan2(-(zb - za), xb - xa), 1 / 3), L / 2); }
  atGround(ctx, cx + 2, cz + 6, () => { B.v('concrete').cyl(cx + 2, -0.2, cz + 6, 0.9, 0.6, 1.1, 7, 1 / 3, true); B.c('concrete').box(cx + 2, 0.35, cz + 6, 1.5, 1.1, 1.5); }, 0.8, 'min');
  // plaza between Science, the gyms and Foster: picnic tables, planters, bins
  for (const [x, z, r] of [[2, -76, 0.2], [8, -79.5, -0.3], [-2, -82, 0.9], [11.5, -80.5, 0.1]]) propKit.picnicTable(ctx, x, z, r);
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
  const buses = [[55.5, 37.9, ROT] /* at the school-side kerb of Mission Ave (graded centreline + 4.25 m) */, [...G(-8, -134.5), ROT + Math.PI / 2], [...G(14, -129), ROT + Math.PI / 2]];
  const trunks = (ctx.gen.trees || []).filter((t) => inPlay(t[0], t[1], -4));
  const overlaps = (x, z, h, bx, bz, bh, hl, hw) => {   // oriented rectangles: car (2.3 x 0.95 half extents) vs (hl x hw) at (bx, bz, bh)
    const R = [[x, z, h, 2.3, 0.95], [bx, bz, bh, hl, hw]];
    for (const [, , a] of R) for (const ax of [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]]) {
      const ext = R.map(([cx, cz, hh, l, w]) => [cx * ax[0] + cz * ax[1], Math.abs(l * (Math.cos(hh) * ax[0] - Math.sin(hh) * ax[1])) + Math.abs(w * (Math.sin(hh) * ax[0] + Math.cos(hh) * ax[1]))]);
      if (Math.abs(ext[0][0] - ext[1][0]) > ext[0][1] + ext[1][1]) return false;
    }
    return true;
  };
  // the walking lines of the graded streets (sidewalk centre lines, carried on through the junctions)
  const walkPts = []; if (ctx.streets && ctx.streets.stations) for (const st of ctx.streets.stations) for (const p of st.pts) for (const q of [p.wL, p.wR]) if (q) walkPts.push(q[0], q[1]);
  const walkLine = (x, z) => { for (let i = 0; i < walkPts.length; i += 2) if (Math.abs(walkPts[i] - x) < 1.9 && Math.abs(walkPts[i + 1] - z) < 1.9 && Math.hypot(walkPts[i] - x, walkPts[i + 1] - z) < 1.9) return true; return false; };
  const car = (x, z, heading) => {
    if (!inPlay(x, z)) return; if (keep.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r)) return;
    if (ctx.terrain && [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]].some(([dx, dz]) => ctx.terrain.slopeAt(x + dx, z + dz) > 0.10)) {   /* (anywhere under the car, not only at its centre) */ rnd(); rnd(); rnd(); placed.push([x, z]); return; }
    // ...nor across a step in the ground: the car is laid on the plane through its middle (onSlope), and beside a pad edge that plane is not the ground (one sat 0.75 m deep)
    if (ctx.terrain && ctx.terrain.meshHeightAt) { const g = ctx.groundY, y0 = g(x, z), gx = (g(x + 2, z) - g(x - 2, z)) / 4, gz = (g(x, z + 2) - g(x, z - 2)) / 4, c = Math.cos(heading), s = Math.sin(heading);
      if ([[2.2, 0.9], [2.2, -0.9], [-2.2, 0.9], [-2.2, -0.9], [0, 0], [2.45, 0], [-2.45, 0]].some(([l, w]) => { const px = x + l * c + w * s, pz = z - l * s + w * c; return Math.abs(ctx.terrain.meshHeightAt(px, pz) - (y0 + gx * (px - x) + gz * (pz - z))) > 0.26; }))   /* (the bumpers too, and 0.26 m: a car on a crest of Bryn Mawr Drive had its uphill end 0.46 m in the road) */ { rnd(); rnd(); rnd(); placed.push([x, z]); return; } }   // nobody parks on a bank (and a car cannot be laid on more than ~11 %)
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.5)) return;
    for (const r of ctx.buildingRings || []) if (pointInRing(x, z, r)) return;
    // (no bumper over a sidewalk: a car parked in a lot beside a street stood half across the walk)
    if (ctx.streets) { const c = Math.cos(heading), s = Math.sin(heading); if ([[2.5, 1.0], [2.5, -1.0], [-2.5, 1.0], [-2.5, -1.0], [2.5, 0], [-2.5, 0]].some(([l, w]) => { const q = ctx.streets.design(x + l * c + w * s, z - l * s + w * c); return q && q.zone === 'walk'; }) || walkLine(x, z)) { rnd(); rnd(); rnd(); placed.push([x, z]); return; } }   /* (nor across the line a walk takes through a junction mouth) */
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

// A wooden utility pole with a cobra-head street light on an arm (the street lighting of Mission Ave and the lanes round the
// campus: Street View). (dx, dz): unit vector toward the street. Solid, 9 m: a grapple target.
function utilityLamp(ctx, x, y, z, dx, dz) {
  const { B } = ctx; const H = 9.3; const wd = B.v('paint', true); wd.setColor(0.105, 0.078, 0.06); const ry = Math.atan2(dx, dz);
  wd.cyl(x, y, z, 0.15, 0.1, H, 9, 1, true); wd.box(x, y + H - 0.7, z, 2.3, 0.11, 0.11, ry); wd.box(x, y + H - 1.5, z, 1.5, 0.1, 0.1, ry); wd.setColor(1, 1, 1);
  const g = B.v('galv'); g.tube([x, y + 7.2, z], [x + dx * 1.2, y + 7.9, z + dz * 1.2], 0.035, 6).tube([x + dx * 1.2, y + 7.9, z + dz * 1.2], [x + dx * 2.3, y + 7.95, z + dz * 2.3], 0.035, 6);
  g.box(x + dx * 2.55, y + 7.93, z + dz * 2.55, 0.26, 0.11, 0.62, ry); B.v('lightEmit').box(x + dx * 2.6, y + 7.865, z + dz * 2.6, 0.2, 0.03, 0.42, ry);
  B.c('wood').box(x, y + H / 2, z, 0.3, H, 0.3); ctx.grapplePoles.push({ x, z, y0: y + 1, y1: y + H, r: 0.15 });
}
// ------------------------------------------------------------------------------------------ streets
function streets(ctx) {
  const { B, data, playBounds: pb } = ctx; const rnd = mulberry32(94901);
  const inPlay = (x, z, m = 2) => x > pb.minX + m && x < pb.maxX - m && z > pb.minZ + m && z < pb.maxZ - m;
  const clearOfBuildings = (x, z) => !(ctx.buildingRings || []).some((r) => pointInRing(x, z, r) || pointInRing(x + 0.6, z, r) || pointInRing(x - 0.6, z, r) || pointInRing(x, z + 0.6, r) || pointInRing(x, z - 0.6, r));
  const lamps = []; const east = eastSideGeom(ctx);
  // Mission Ave along the pitch (Street View 2025): the street lights are cobra heads on the wooden utility poles on the pitch
  // side, about 30 m apart, the last one at the Bryn Mawr Drive corner. Each stands at the BACK edge of the walk (its foot in
  // the face of the hedge, never in the walking line), 9 m tall, the head out over the street: seen from everywhere, easy to grapple.
  if (ctx.streets) for (const a0 of [41, 66.5, 97, 131.5]) { let p = null; for (let b = 16.8; b <= 22; b += 0.05) { const q = G(a0, b), d = ctx.streets.design(q[0], q[1]); if (d && d.zone === 'road') break; if (d && d.zone === 'walk') { p = G(a0, b - 0.2); break; } } if (!p || !inPlay(p[0], p[1])) continue;
    if (east) { const [, o] = east.uo(p[0], p[1]); if (o > 0) { const q = east.at(east.uSat(o) + 0.45, o); p = [q[0], q[1], east.ySat(o) + east.BED]; } }   /* (the corner pole stands in the bed behind the corner of the walk) */
    const base = p[2] ?? Math.min(gY(ctx, p[0], p[1]), gY(ctx, p[0] + UZ * 0.6, p[1] - UX * 0.6)); utilityLamp(ctx, p[0], base - 0.3, p[1], -UZ, UX); lamps.push([p[0], p[1]]); }
  for (const r of data.roads) {
    const hw = r.tags.highway; if (!STREETS.includes(hw)) continue; const w = ROADW[hw]; let side = 1; let carry = 8 + rnd() * 10;
    for (let i = 0; i < r.line.length - 1; i++) {
      const a = r.line[i], b = r.line[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      let d = carry;
      for (; d < L; d += 27) {
        const lo = r.tags.name === 'Mission Avenue' ? 0.35 : 0.4;   /* (lamps stand at the kerb edge: 0.75 m in, one stood in the walking line of the E St walk) */
        let x = a[0] + tx * d - tz * side * (w / 2 + lo), z = a[1] + tz * d + tx * side * (w / 2 + lo); const sx = -tz * side, sz = tx * side; side = -side;
        if (ctx.streets && ctx.streets.inRoad(x, z, lo < 0.5 ? 0.15 : 0.4)) continue;
        // (nothing solid on a sidewalk, lamp posts included: where the street has a walk the lamp stands behind it; none in the hedge along the pitch)
        if (ctx.streets) { const q = ctx.streets.design(x, z); if (q && q.zone === 'walk') { const v = ctx.streets.toVerge(x, z, 3.2); if (!v) continue;
          if (pointInRing(v[0], v[1], turfWorld(9))) continue;   /* (along the pitch the lights are the utility poles' cobra heads, placed above: an acorn post behind the walk stood INSIDE the 4.4 m hedge, invisible) */
          else { const q2 = ctx.streets.design(v[0], v[1]); if (q2 && (q2.zone === 'walk' || q2.zone === 'road')) continue; x = v[0]; z = v[1]; } } }   /* (a fork or a crossing street: never a lamp on a carriageway) */
        if (east) { const [u, o] = east.uo(x, z); if (u > -4 && u < east.L + 4 && o > -1 && o < east.Wat(u) + 0.4) continue; }   /* (none on the pitch side of Bryn Mawr Drive: Street View shows the poles on the house side) */
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
    let px = x + 6.2, pz = z + 6.6; if (ctx.streets) { const q = ctx.streets.design(px, pz); if (q && (q.zone === 'walk' || q.zone === 'road')) { const v = ctx.streets.toVerge(px, pz, 3.4); if (!v) continue; px = v[0]; pz = v[1]; const q2 = ctx.streets.design(px, pz); if (q2 && (q2.zone === 'walk' || q2.zone === 'road')) continue; } }   /* (the mast stands behind the walk) */ if (!clearOfBuildings(px, pz)) continue;
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
        const sd = rnd() < 0.5 ? 1 : -1; const fo = ctx.streets ? w / 2 + 3.3 : w / 2 + 1.7; const x = a[0] + tx * d - tz * sd * fo, z = a[1] + tz * d + tx * sd * fo;   /* (behind the sidewalk: nothing solid stands on a walk) */
        if (!inPlay(x, z, 4) || !clearOfBuildings(x, z) || ctx.surfaceAt(x, z) === 'asphalt' || ctx.surfaceAt(x, z) === 'rubber') continue;
        if (ctx.streets && [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].some(([dx, dz]) => { const q = ctx.streets.design(x + dx, z + dz); return q && (q.zone === 'walk' || q.zone === 'road'); })) { rnd(); continue; }
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
