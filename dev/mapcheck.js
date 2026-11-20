// Map check: automated validator for a campus map (see MAP_NOTES.md "Map check (required before QA)").
//   dev/mapcheck.html?campus=hinsdale|marin|terraintest  [&only=escape,ladders,...] [&skip=bots] [&grid=2.5] [&q=low] [&bots=8] [&botTime=60]
// Loads the real world (src/world/index.js) and runs every check against the real collision and the real player
// controller (src/game/player.js). Result: window.__mapcheck (JSON report), a readable summary, and a top-down image.
// Deterministic: fixed sample grids, fixed probe orders, seeded Math.random + virtual clock for the bot run.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { createWorld } from '../src/world/index.js';
import { getCampus } from '../src/campuses/index.js';
import { PlayerController, STAND } from '../src/game/player.js';
import { mulberry32 } from '../src/world/util.js';
import { WALK_NORMAL_Y, SPAWN_MAX_GRADE, HELI_MAX_SKID_DROP } from '../src/world/terrain.js';

const VERSION = 1;
const qs = new URLSearchParams(location.search);
const num = (k, d) => (qs.has(k) && Number.isFinite(+qs.get(k)) ? +qs.get(k) : d);
const CAMPUS = getCampus(qs.get('campus') || 'hinsdale');
const ONLY = qs.get('only') ? new Set(qs.get('only').split(',')) : null;
const SKIP = new Set((qs.get('skip') || '').split(',').filter(Boolean));
const enabled = (id) => (!ONLY || ONLY.has(id)) && !SKIP.has(id);

// ---------------------------------------------------------------------------------------------- thresholds
export const TH = {
  // 1 escapability
  overlookR: 80, overlookRise: 4, overlookCells: 8,   // CTF overlook: radius (m), height above the base (m), cells (3 m) that make an imbalance worth a warning
  escapeGrid: num('grid', 2.5),      // m between downward sample rays over the play area
  escapeMinY: 0.6,                   // surfaces above this are "elevated" (kerbs / low steps are not)
  escapeTime: 7,                     // s per attempt (one direction)
  interiorCeil: 15, roofSkin: 3.2,   // a trapped surface with collision < 15 m above every sample is covered: a sealed interior (press box,
                                     // room) or a roof void (ceiling <= 3.2 m). Covered = unreachable from the sky, so it is listed as info here;
                                     // whether a player can get INTO it is what the roofVoids check (wall jumps, mantles, grapples) tests
  escapeBudget: num('escapeBudget', 110),  // s wall clock; samples not reached are reported as "unchecked"
  dropHeight: 2.0,                   // m above the surface for crease / slope drop tests
  dropSpacing: 3,                    // m: at most one drop test per cell of this size (and height metre)
  // 1b roof voids (dev/trap-sweep.js): tests per sweep
  voidTests: { wall: num('voidWall', 800), sloped: num('voidSloped', 150), grapple: num('voidGrapple', 250) },
  // 2 ladders
  ladderTime: 14,
  // 3 spawns
  spawnWallFail: 0.4, spawnWallWarn: 1.2,   // horizontal clearance from any solid at 0.5 / 1.3 m (m): capsule 0.35 + 5 cm
  spawnPropGap: 0.6,                         // capsule radius + margin from a registered prop footprint (m)
  spawnMin: 24, ctfSpawnMin: 8, ctfSpawnRange: [25, 70],
  ctfBaseDist: [150, 420],                   // warn outside (m)
  // 4 helicopter spots
  heliClear: 8.0, heliClearWarn: 8.5,        // disc radius free of colliders between deck+0.3 and +3.4 m
  heliTreeClear: 10.5,                       // tree trunk distance (canopy is not collision)
  heliMin: 12,
  // 5 visible-but-not-solid
  visMinY: 1.0, visMaxY: 80, visPatchArea: 2.0, visCellsMin: 3, visMinWidth: 0.45, shrubMaxH: 1.1,
  // 5b see-through roofs
  roofKeys: /shingles|roofTile/,             // bucket keys drawn as roof skins
  roofSample: 2.5, roofMargin: 40,           // m between samples on a roof face; roofs up to 40 m outside the play bounds are checked too
  roofEncDist: 30, roofEncFrac: 0.85,        // a point is inside an attic if >= 85 % of 26 probe rays (and both up / down) hit within 30 m
  roofAz: 8, roofElev: [-35, -10, 6, 22, 45, 75],    // viewing directions of the attic test (deg above the horizon, seen from the roof)
  roofViewDist: 60,                          // how far a ray out of an attic is followed
  roofCellMin: 3,                            // flagged rays per 4 m cell that make a failure
  // 6 props
  propOverlap: 0.05,                         // penetration depth (m) that counts as clipping
  trunkWarn: 0.6,                            // prop edge closer than this to a trunk surface (m) = warn
  // 7 signs
  signShrinkWarn: 0.6, signAspectWarn: 0.2, signWindowFrac: 0.15, signMinCap: 0.12,
  // 8 boundary
  boundaryStep: 3, boundaryStreetWarn: 6,
  // 9 bots
  botCount: num('bots', 8), botTime: num('botTime', 60), botStuck: 12, botMoveRadius: 2.0,
  // 10 terrain (campuses with a heightfield only)
  terrainGrid: 2.5,                          // m between terrain samples for the slope-pocket test
  terrainEscapeTime: 6,                      // s per escape attempt from an unconnected / steep sample
  propFloat: 0.12,                           // a prop base this far above the lowest ground under its footprint = floating (fail)
  propBuryWarn: 0.3, propBuryFail: 0.5,      // highest ground under the footprint above the base, as a fraction of the prop height
  heliSkidFloat: 0.15,                       // ground heli spot: skids this far above the highest ground under them
};

// ---------------------------------------------------------------------------------------------- page
const $ = (id) => document.getElementById(id);
const logLines = [];
function log(s) { logLines.push(s); $('log').textContent = logLines.slice(-60).join('\n'); console.log('[mapcheck] ' + s); }
// yield via MessageChannel: setTimeout is throttled to >= 1 s in hidden / background tabs
const tick = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const P3 = (v) => [r1(v.x), r2(v.y), r1(v.z)];
$('campus').textContent = CAMPUS.name + ' (' + CAMPUS.id + ')';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0), UP = V(0, 1, 0);
const DT = 1 / 60;

const report = { version: VERSION, campus: CAMPUS.id, started: new Date().toISOString(), thresholds: TH, checks: {}, pass: null, durationS: null };
window.__mapcheck = report; window.__mapcheckDone = false;
const marks = [];   // debug image: { kind, x, z, ... }

// ---------------------------------------------------------------------------------------------- world
const t0 = performance.now();
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(320, 180);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 3000);
log('loading world…');
const world = await createWorld({ renderer, scene, camera, campus: CAMPUS, settings: { quality: qs.get('q') || 'low' }, onProgress: (f, l) => { $('status').textContent = Math.round(f * 100) + '% ' + l; } });
scene.updateMatrixWorld(true);
window.__world = world; window.__scene = scene; window.THREE = THREE;
const PB = world.playBounds;
const REG = world.registry || { props: [], trunks: [], shrubs: [] };
log(`world loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${world.collisionMeshes.length} collision meshes, ${REG.props.length} props, ${REG.trunks.length} trunks, ${world.ladders.length} ladders`);

// One merged BVH over every non-ground collider (fences included): fast rays and shape queries.
function buildSolid() {
  const meshes = world.collisionMeshes.filter((m) => !m.userData.isGround);
  let n = 0; for (const m of meshes) n += m.geometry.attributes.position.count;
  const pos = new Float32Array(n * 3); const triSurf = new Uint8Array(n / 3); const names = [];
  let o = 0;
  for (const m of meshes) {
    const a = m.geometry.attributes.position.array; pos.set(a, o * 3);
    const si = names.push(m.userData.surface + (m.userData.bulletPassthrough ? ':mesh' : '')) - 1;
    triSurf.fill(si, o / 3, (o + a.length / 3) / 3); o += a.length / 3;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bvh = new MeshBVH(g);
  const ray = new THREE.Ray();
  const surfOf = (h) => names[triSurf[Math.floor(h.face.a / 3)]];
  return {
    bvh, surfOf,
    first(o, d, far) { ray.origin.copy(o); ray.direction.copy(d); return bvh.raycastFirst(ray, THREE.DoubleSide, 0, far); },
    all(o, d, far) { ray.origin.copy(o); ray.direction.copy(d); return bvh.raycast(ray, THREE.DoubleSide, 0, far).sort((a, b) => a.distance - b.distance); },
    /** min distance from segment a-b to any triangle (within maxR), ignoring triangle points below yMin. */
    segDist(a, b, maxR, yMin = -Infinity) {
      const seg = new THREE.Line3(a, b); const box = new THREE.Box3().setFromPoints([a, b]).expandByScalar(maxR);
      let best = maxR, at = null; const p1 = V(), p2 = V();
      bvh.shapecast({
        intersectsBounds: (bb) => bb.intersectsBox(box),
        intersectsTriangle: (tri) => { const d = tri.closestPointToSegment(seg, p1, p2); if (d < best && p1.y > yMin) { best = d; at = p1.clone(); } return false; },
      });
      return { d: best, at };
    },
  };
}
const S = buildSolid();
const navOK = (x, z) => (world.navSample ? world.navSample(x, z) : true);
// ground height (0 on flat campuses; every "ground level" test below is relative to it)
const GY = world.terrain ? (x, z) => world.terrain.heightAt(x, z) : () => 0;
const nearWalk = (x, z) => { if (navOK(x, z)) return true; for (const r of [1.5, 3]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (navOK(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true; } return false; };
const inPB = (x, z, m = 0) => x >= PB.minX + m && x <= PB.maxX - m && z >= PB.minZ + m && z <= PB.maxZ - m;

// The map must work without the controller's stuck safety net (player._stuckWatch pops a wedged capsule free): off here.
const noUnstuck = (c) => { c._stuckWatch = () => {}; return c; };
function status(fails, warns) { return fails ? 'fail' : warns ? 'warn' : 'pass'; }
function finishCheck(id, res) { report.checks[id] = res; renderSummary(); }

// ============================================================================================== 1 escapability
// Elevated surfaces are sampled with downward rays on a grid. Flat samples are grouped into regions (grid neighbours at
// the same height with no wall between them: the player can walk between them), and each region must be escapable
// from a few of its edge samples. Sloped samples and crease / slope drop tests are run one by one. A start point is
// escapable if the real controller reaches walkable ground (or a surface already proven escapable) with walk + jump +
// double jump + mantle; failures get a second-level search from where the first attempts ended before being reported.
async function checkEscape() {
  const tStart = performance.now(); const g = TH.escapeGrid; const gx0 = PB.minX + g / 2, gz0 = PB.minZ + g / 2;
  const ctrl = noUnstuck(new PlayerController(world)); const push = V();
  const samples = []; let columns = 0; const cols = new Map();
  for (let ix = 0, x = gx0; x < PB.maxX; ix++, x += g) for (let iz = 0, z = gz0; z < PB.maxZ; iz++, z += g) {
    columns++;
    const gy = GY(x, z);
    const hits = S.all(V(x, gy + 150, z), DOWN, 150 - 0.3);
    let above = Infinity;
    for (const h of hits) {
      const y = h.point.y, ny = Math.abs(h.face.normal.y);
      const room = above - y; above = y;
      if (y - gy < TH.escapeMinY || ny < 0.45 || room < STAND.height + 0.05) continue;
      const s = { x, y, z, ny, ix, iz, ceil: room, kind: ny < 0.97 ? 'slope' : 'roof' };
      s.n = h.face.normal.clone(); if (s.n.y < 0) s.n.negate();
      samples.push(s);
      { const k = ix * 4096 + iz; let l = cols.get(k); if (!l) cols.set(k, l = []); l.push(s); }
    }
  }
  // regions (union-find): flat samples join flat neighbours within 0.5 m height; sloped samples join neighbours on the same
  // roof plane (normals within ~18 deg); never through a wall (rays at 0.5 / 1.3 m above the surface between them)
  const flat = samples.filter((s) => s.kind === 'roof');
  samples.forEach((s, i) => { s.id = i; });
  const par = samples.map((_, i) => i); const find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const _d = V();
  for (const s of samples) {
    s.nb = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const t of cols.get((s.ix + dx) * 4096 + s.iz + dz) || []) {
        if (t.kind !== s.kind) continue;
        if (s.kind === 'roof' ? Math.abs(t.y - s.y) > 0.5 : (s.n.dot(t.n) < 0.95 || Math.abs(t.y - s.y) > 2 * g)) continue;
        let blocked = false;
        for (const up of [0.5, 1.3]) { _d.set(t.x - s.x, t.y - s.y, t.z - s.z); const L = _d.length(); if (S.first(V(s.x, s.y + up, s.z), _d.normalize(), L)) { blocked = true; break; } }
        if (blocked) continue;
        s.nb++; par[find(s.id)] = find(t.id);
      }
    }
  }
  const regMap = new Map(); for (const s of samples) { const r = find(s.id); let l = regMap.get(r); if (!l) regMap.set(r, l = []); l.push(s); }
  const regions = [...regMap.values()].map((list) => ({ list, y: Math.min(...list.map((s) => s.y)), slope: list[0].kind === 'slope' })).sort((a, b) => a.y - b.y || a.list[0].x - b.list[0].x || a.list[0].z - b.list[0].z);
  // crease / slope drop tests: next to walls and parapets, and onto every sloped sample
  const dropKeys = new Set(); const drops = [];
  const addDrop = (x, y, z, kind, ceil) => { const k = Math.round(x / TH.dropSpacing) + ',' + Math.round(z / TH.dropSpacing) + ',' + Math.round(y); if (dropKeys.has(k)) return; dropKeys.add(k); drops.push({ x, y: y + TH.dropHeight, z, base: y, kind, ceil, drop: true }); };
  for (const s of samples) {
    if (s.kind === 'slope') addDrop(s.x, s.y, s.z, 'slope-drop', s.ceil);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const h = S.first(V(s.x, s.y + 0.8, s.z), V(dx, 0, dz), 1.25);
      if (h) addDrop(h.point.x - dx * 0.45, s.y, h.point.z - dz * 0.45, 'crease-drop', s.ceil);
    }
  }
  const singles = drops.slice().sort((a, b) => (a.base ?? a.y) - (b.base ?? b.y) || a.x - b.x || a.z - b.z);
  log(`escape: ${columns} columns, ${samples.length} elevated samples (${samples.length - flat.length} sloped) in ${regions.length} regions (${regions.filter((r) => r.slope).length} sloped), ${drops.length} drop tests`);

  const memo = new Set();
  // second pass only (see "ladder pass" below): ground cells of sealed pockets from which a working ladder leads out
  let ladderCells = null; const laddersUsed = new Set(); const lcKey = (x, z) => Math.floor(x) * 8192 + Math.floor(z);
  const key = (x, y, z) => (Math.floor(x) + 4096) * 67108864 + (Math.floor(z) + 4096) * 4096 + Math.round(y * 2) + 2048;
  let steps = 0;
  const lowerDirs = (x, y, z) => {   // 8 directions, the one with the nearest lower surface first
    const sc = [];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, dx = Math.cos(a), dz = Math.sin(a); let best = 99;
      for (let d = 2; d <= 24; d += 2) { const h = S.first(V(x + dx * d, y + 1.5, z + dz * d), DOWN, 60); if ((h ? h.point.y : GY(x + dx * d, z + dz * d)) < y - 1) { best = d; break; } }
      sc.push([best, a]);
    }
    return sc.sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  };
  function attempt(start, ang, mode, drop) {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    ctrl.teleport(start, Math.atan2(-dx, -dz));     // forward = (-sin yaw, -cos yaw) = (dx, dz)
    if (drop) ctrl.grounded = false;
    const traj = []; let blockedT = 0, jumped = false, doubled = false; let minY = start.y, maxD = 0;
    // "blocked" is measured from the real displacement: grinding against a wall or a low parapet on the ground keeps the
    // controller's velocity (it is only cancelled in the air), so horizontalSpeed() alone never reports it
    let lastX = start.x, lastZ = start.z, moved = Infinity;
    for (let t = 0; t < TH.escapeTime; t += DT) {
      let jump = false;
      if (ctrl.grounded) {
        jumped = false; doubled = false;
        if (Math.min(ctrl.horizontalSpeed(), moved) < 1.2) blockedT += DT; else blockedT = 0;
        if (blockedT > 0.15 || (mode === 2 && t > 0.1)) { jump = true; jumped = true; blockedT = 0; }
      } else if (jumped && !doubled && ctrl.velocity.y < 0.8 && ctrl.airJumps > 0) { jump = true; doubled = true; }
      ctrl.update(DT, { forward: 1, strafe: mode === 2 ? Math.sin(t * 5) * 0.7 : 0, jump, crouchToggle: false, sprint: true });
      ctrl.events.length = 0; steps++;
      const p = ctrl.position;
      moved = Math.hypot(p.x - lastX, p.z - lastZ) / DT; lastX = p.x; lastZ = p.z;
      if (p.y < minY) minY = p.y; const dd = Math.hypot(p.x - start.x, p.z - start.z); if (dd > maxD) maxD = dd;
      const pg = GY(p.x, p.z);
      if (p.y < pg - 5) return { ok: false, fell: true, traj, minY, maxD, last: p.clone() };
      if (ctrl.grounded) {
        if ((steps & 3) === 0 || !traj.length) traj.push(p.clone());
        if ((p.y - pg < 0.35 && nearWalk(p.x, p.z)) || memo.has(key(p.x, p.y, p.z))) return { ok: true, traj };
        if (ladderCells && p.y - pg < 0.35) { const li = ladderCells.get(lcKey(p.x, p.z)); if (li !== undefined) { laddersUsed.add(li); return { ok: true, traj }; } }
      }
    }
    return { ok: false, traj, minY, maxD, last: ctrl.position.clone(), onGround: ctrl.position.y - GY(ctrl.position.x, ctrl.position.z) < 0.35 && ctrl.grounded };
  }
  const prove = (traj, start) => { for (const p of traj) memo.add(key(p.x, p.y, p.z)); if (start) memo.add(key(start.x, start.y, start.z)); };
  // one start point: up to 16 attempts, then a second level from the farthest places those attempts reached
  function tryEscape(x, y, z, drop, deep = true, flatStart = false) {
    const start = V(x, drop ? y : y + 0.02, z);
    ctrl._resolve(start, STAND.height, push);
    // not a place a player can stand: deep in geometry, or (on flat ground) pushed sideways = inside a pipe / column / wall
    if (push.length() > 0.3 || (flatStart && Math.hypot(push.x, push.z) > 0.05)) return { status: 'nofit' };
    start.add(push);
    const ends = []; let worst = null;
    for (const mode of [1, 2]) {
      const dirs = lowerDirs(x, drop ? y - TH.dropHeight : y, z);
      for (const a of mode === 1 ? dirs : dirs.map((d) => d + Math.PI / 8)) {
        const r = attempt(start, a, mode, drop);
        if (r.ok) { prove(r.traj, drop ? null : start); return { status: 'ok' }; }
        if (r.fell) return { status: 'fell', last: r.last };
        if (!worst || r.maxD > worst.maxD) worst = r;
        if (r.traj.length) ends.push(r.traj[r.traj.length - 1]);
      }
      if (!deep) break;
    }
    if (deep) {
      const picks = [];
      for (const e of ends.sort((p, q) => q.distanceTo(start) - p.distanceTo(start))) { if (e.distanceTo(start) > 1.5 && picks.every((p) => p.distanceTo(e) > 2)) picks.push(e); if (picks.length >= 6) break; }
      for (const e of picks) {
        const r = tryEscape(e.x, e.y, e.z, false, false);
        if (r.status === 'ok') { memo.add(key(start.x, start.y, start.z)); return { status: 'ok' }; }
      }
    }
    return { status: 'trapped', maxD: worst.maxD, minY: worst.minY, last: worst.last, onGround: worst.onGround };
  }
  const trapped = [], fell = [], interiors = []; let nofit = 0, tested = 0, unchecked = 0, lastYield = performance.now();
  const yieldMaybe = async (what) => { if (performance.now() - lastYield > 250) { lastYield = performance.now(); $('status').textContent = what; await tick(); } };
  const overBudget = () => (performance.now() - tStart) / 1000 > TH.escapeBudget;
  // flat regions, low to high (a roof that drops onto a lower proven roof succeeds at once)
  for (const [ri, R] of regions.entries()) {
    if (overBudget()) { unchecked += R.list.length; continue; }
    const cx = R.list.reduce((a, s) => a + s.x, 0) / R.list.length, cz = R.list.reduce((a, s) => a + s.z, 0) / R.list.length;
    const edge = R.list.filter((s) => s.nb < 4).sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
    const reps = []; const pool = edge.length ? edge : R.list; const nRep = Math.min(pool.length, 3);
    for (let k = 0; k < nRep; k++) reps.push(pool[Math.floor(k * pool.length / nRep)]);
    let ok = false, res = null;
    for (const s of reps) { tested++; res = tryEscape(s.x, s.y, s.z, false, s === reps[reps.length - 1], !R.slope); if (res.status === 'ok') { ok = true; break; } if (res.status === 'fell') { fell.push({ s, r: res }); break; } }
    if (ok && R.slope) { for (const s of R.list) memo.add(key(s.x, s.y, s.z)); }
    else if (ok) { for (const s of R.list) for (let a = -g / 2; a <= g / 2 + 1e-6; a += 0.5) for (let b = -g / 2; b <= g / 2 + 1e-6; b += 0.5) memo.add(key(s.x + a, s.y, s.z + b)); }
    else if (res && res.status === 'trapped') (R.list.every((q) => q.ceil < TH.interiorCeil) ? interiors : trapped).push({ s: reps[reps.length - 1], r: res, region: R, kind: R.slope ? 'slope' : 'region' });
    else if (res && res.status === 'nofit') nofit++;
    await yieldMaybe(`escape regions ${ri + 1}/${regions.length} trapped ${trapped.length}`);
  }
  for (const [i, s] of singles.entries()) {
    if (overBudget()) { unchecked++; continue; }
    if (memo.has(key(s.x, s.base ?? s.y, s.z)) && !s.drop) continue;
    tested++;
    const r = tryEscape(s.x, s.y, s.z, !!s.drop, true, !s.drop && s.ny >= 0.97);
    if (r.status === 'nofit') nofit++; else if (r.status === 'trapped') (s.ceil < TH.interiorCeil ? interiors : trapped).push({ s, r, kind: s.kind }); else if (r.status === 'fell') fell.push({ s, r });
    await yieldMaybe(`escape singles ${i + 1}/${singles.length} trapped ${trapped.length}`);
  }
  // ---- ladder pass. A sealed pocket (closed courtyard) with a ladder is not a trap. A ladder counts when its scripted climb
  // passed (ladders check) and the deck it exits onto was proven escapable above WITHOUT any ladder credit (so a roof cannot
  // be "proven" by dropping into a courtyard whose only way out is back up to that same roof). The pocket's ground is flood
  // filled from the ladder foot on a 1 m grid (standing room, no wall between neighbours); trapped starts are then re-run
  // and pass if they reach one of those cells.
  let viaLadder = 0; const ladderInfo = [];
  if (trapped.length && world.ladders.length) {
    const lres = report.checks.ladders?.ladders || []; const cells = new Map();
    const free = (cx, cz) => !S.first(V(cx + 0.5, GY(cx + 0.5, cz + 0.5) + 1.9, cz + 0.5), DOWN, 1.6);
    const open = (ax, az, bx, bz) => { const ga = GY(ax + 0.5, az + 0.5), gb = GY(bx + 0.5, bz + 0.5); for (const y of [0.45, 1.3]) if (S.first(V(ax + 0.5, ga + y, az + 0.5), V(bx - ax, gb - ga, bz - az).normalize(), Math.hypot(1, gb - ga))) return false; return true; };
    for (const [i, L] of world.ladders.entries()) {
      const lr = lres[i]; if (!lr || !lr.ok || L.y0 > 1.2) continue;
      const top = tryEscape(lr.end[0], lr.end[1], lr.end[2], false, true, false);
      if (top.status !== 'ok') { ladderInfo.push({ i, at: lr.at, deckProven: false }); continue; }
      const fx = Math.floor(L.x + L.nx * 0.9), fz = Math.floor(L.z + L.nz * 0.9); let n = 0;
      if (!free(fx, fz)) { ladderInfo.push({ i, at: lr.at, deckProven: true, groundCells: 0 }); continue; }
      const q = [[fx, fz]]; if (!cells.has(fx * 8192 + fz)) { cells.set(fx * 8192 + fz, i); n++; }
      for (let h = 0; h < q.length && q.length < 40000; h++) {
        const [cx, cz] = q[h];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ax = cx + dx, az = cz + dz, k = ax * 8192 + az;
          if (cells.has(k) || !inPB(ax + 0.5, az + 0.5) || navOK(ax + 0.5, az + 0.5) || !free(ax, az) || !open(cx, cz, ax, az)) continue;
          cells.set(k, i); n++; q.push([ax, az]);
        }
      }
      ladderInfo.push({ i, at: lr.at, deckProven: true, groundCells: n });
    }
    if (cells.size) {
      ladderCells = cells;
      for (let k = 0; k < trapped.length; k++) {
        const t = trapped[k]; tested++;
        const r = t.s.drop ? tryEscape(t.s.x, t.s.y, t.s.z, true, true, false) : tryEscape(t.s.x, t.s.y, t.s.z, false, true, t.kind === 'region');
        if (r.status === 'ok') { trapped.splice(k--, 1); viaLadder++; if (t.region && !t.region.slope) for (const s of t.region.list) memo.add(key(s.x, s.y, s.z)); }
        await yieldMaybe(`escape ladder pass ${k + 1}/${trapped.length}`);
      }
      ladderCells = null;
    }
  }
  // cluster trapped starts (3 m, 1.5 m height)
  const clusters = [];
  for (const t of trapped) {
    const y = t.s.base ?? t.s.y;
    let c = clusters.find((c) => Math.hypot(c.x - t.s.x, c.z - t.s.z) < 3 + c.r && Math.abs(c.y - y) < 1.5);
    if (!c) { c = { x: t.s.x, y, z: t.s.z, r: 0, n: 0, kinds: new Set(), pts: [], area: 0 }; clusters.push(c); }
    c.n++; c.kinds.add(t.kind); c.pts.push(t); c.r = Math.max(c.r, Math.hypot(c.x - t.s.x, c.z - t.s.z));
    if (t.region) c.area += t.region.list.length * g * g;
  }
  const failures = clusters.map((c) => {
    const t = c.pts[0];
    return {
      at: [r1(c.x), r2(c.y), r1(c.z)], starts: c.n, kinds: [...c.kinds], regionAreaM2: c.area ? Math.round(c.area) : undefined,
      surfaceNy: r2(t.s.ny ?? 1), bestTravel: r1(t.r.maxD), lowestY: r2(t.r.minY), endedAt: P3(t.r.last),
      note: (t.s.ceil ?? 99) <= TH.roofSkin ? 'under a roof skin (roof void / attic): ceiling ' + r1(t.s.ceil) + ' m above' : t.r.onGround ? 'reaches ground level but a sealed pocket (not connected to the walk area)' : (t.r.maxD < 2 ? 'cannot move (wedged / embedded)' : 'confined: cannot get off this surface'),
    };
  });
  for (const f of failures) marks.push({ kind: f.kinds.includes('region') || f.kinds.includes('slope') ? 'trap' : 'trapDrop', x: f.at[0], z: f.at[2] });
  for (const f of fell) marks.push({ kind: 'fell', x: f.s.x, z: f.s.z });
  const res = {
    status: status(failures.length + fell.length, unchecked),
    what: 'Real player controller placed on every elevated surface (flat regions, slopes) and dropped from ' + TH.dropHeight + ' m into creases / onto slopes must reach walkable ground or an already-proven surface with walk + jump + double jump + mantle (16 directions x ' + TH.escapeTime + ' s, then a second-level search). Falling below y = -5 = a hole in the collision. A sealed ground pocket (closed courtyard) passes when a working ladder leads from it to a deck that is itself proven escapable.',
    counts: { columns, samples: samples.length, regions: regions.length, slopeRegions: regions.filter((r) => r.slope).length, sloped: samples.length - flat.length, dropTests: drops.length, startsTested: tested, noFit: nofit, trappedStarts: trapped.length, trappedClusters: failures.length, escapedViaLadder: viaLadder, sealedInteriors: interiors.length, fellThrough: fell.length, unchecked, simSteps: steps },
    failures, sealedInteriors: interiors.slice(0, 20).map((t) => ({ at: [r1(t.s.x), r2(t.s.base ?? t.s.y), r1(t.s.z)], kind: t.kind, type: t.s.ceil <= TH.roofSkin ? 'roof void' : 'interior', areaM2: t.region ? Math.round(t.region.list.length * g * g) : undefined, ceiling: r1(t.s.ceil) })), fellThrough: fell.slice(0, 20).map((f) => ({ start: [r1(f.s.x), r2(f.s.y), r1(f.s.z)], last: P3(f.r.last) })),
    ladders: ladderInfo.map((l) => ({ ...l, used: laddersUsed.has(l.i) })),
    seconds: r1((performance.now() - tStart) / 1000),
  };
  log(`escape: ${res.status} trapped clusters ${failures.length} (starts ${trapped.length}), fell ${fell.length}, unchecked ${unchecked}, ${steps} steps, ${res.seconds} s`);
  finishCheck('escape', res);
}

// ============================================================================================== 1b roof voids
// Ways INTO a roof void (the hidden space under a pitched roof skin): reuses the roof-trap harness dev/trap-sweep.js
// (0.5 m top-surface scan; wall jumps / double jumps / mantles from the ground and from roofs at every building wall;
// walking, jumping, sprinting and dropping around on pitched roofs at 60 / 30 / 20 fps; grappling onto pitched roofs
// and eaves). A run that ends with roof geometry > 0.9 m above the player's head height, from where tryLeave() cannot
// get back out (walk + jump + double jump), is a failure. The harness drives a stand-in window.__game with the real
// controller (stuck safety net off).
async function checkRoofVoids() {
  const tStart = performance.now();
  const player = noUnstuck(new PlayerController(world)); player.teleport(V(0, 0, 0));
  window.__game = { world, player };
  const TS = await import('./trap-sweep.js');
  for (let r = TS.scan(400); !r.done; r = TS.scan(400)) { $('status').textContent = `roof voids: scan ${r.row}/${r.of}`; await tick(); }
  const n = TH.voidTests; const out = {}; const bad = [];
  const step = async (label, fn) => { $('status').textContent = 'roof voids: ' + label; await tick(); const t = performance.now(); const r = fn(); out[label] = { ...r, seconds: r1((performance.now() - t) / 1000) }; return r; };
  const a = await step('wallJumpGround', () => TS.wallJump(n.wall, 11, -1, 0.6));
  const b = await step('wallJumpRoof', () => TS.wallJump(n.wall, 5, 2.0, 12));
  for (const x of a.bad) bad.push({ test: 'wall jump from the ground', ...x });
  for (const x of b.bad) bad.push({ test: 'wall jump from a roof', ...x });
  out.wallJumpGround = { tested: a.tested, climbed: a.climbed, inside: a.bad.length }; out.wallJumpRoof = { tested: b.tested, climbed: b.climbed, inside: b.bad.length };
  const pts = TS.slopedPoints(n.sloped, 5);
  for (const [label, dt, mode] of [['walk60', 1 / 60, 'walk'], ['jump60', 1 / 60, 'jump'], ['sprint30', 1 / 30, 'sprint'], ['drop20', 1 / 20, 'drop']]) {
    const r = await step(label, () => ({ bad: TS.roofWalk(pts, dt, 4, mode) }));
    // the harness's 'stuck' = no motion for 1.5 s with random headings (a corner can do that): confirm with tryLeave
    r.bad = r.bad.filter((x) => x.kind !== 'stuck' || !TS.tryLeave(x.at[0], x.at[1] - 0.08, x.at[2], 8).ok);
    for (const x of r.bad) bad.push({ test: 'pitched roof ' + label, ...x });
    out[label] = { points: pts.length, bad: r.bad.length };
  }
  const g = await step('grapple', () => TS.grappleTest(n.grapple, 31));
  for (const x of g.ex) bad.push({ test: 'grapple onto a pitched roof', ...x });
  out.grapple = { tested: g.tested, arrived: g.arrived, inside: g.inside };
  const sub = (window.__sweep?.sub || []).length;
  delete window.__game;
  for (const x of bad) marks.push({ kind: 'trap', x: x.at[0], z: x.at[2] });
  const fails = out.wallJumpGround.inside + out.wallJumpRoof.inside + out.grapple.inside + ['walk60', 'jump60', 'sprint30', 'drop20'].reduce((s2, k) => s2 + out[k].bad, 0);
  const res = {
    status: status(fails, 0),
    what: 'Ways into roof voids (dev/trap-sweep.js with the real controller): wall jumps + double jumps + mantles from the ground and from roofs at building walls, walking / jumping / sprinting / dropping on pitched roofs (60, 30, 20 fps), grapples onto pitched roofs. Fail = the run ends under a roof skin (roof > 0.9 m above) or stuck on a roof, and walk + jump + double jump cannot get out.',
    counts: { pitchedPoints: pts.length, voidCellsUnderRoofs: sub, ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.inside ?? v.bad ?? 0])) },
    tests: out, failures: bad.slice(0, 40), seconds: r1((performance.now() - tStart) / 1000),
  };
  log(`roof voids: ${res.status} ${fails} runs ended inside a roof / stuck (${res.seconds} s)`);
  finishCheck('roofVoids', res);
}

// ============================================================================================== 2 ladders
async function checkLadders() {
  const out = []; let fails = 0;
  for (const [i, L] of world.ladders.entries()) {
    const ctrl = noUnstuck(new PlayerController(world));
    const sx = L.x + L.nx * 1.3, sz = L.z + L.nz * 1.3;
    const fl = S.first(V(sx, L.y0 + 1.5, sz), DOWN, L.y0 + 1.5 - GY(sx, sz)); const fy = fl ? fl.point.y : GY(sx, sz);
    ctrl.teleport(V(sx, fy + 0.02, sz), Math.atan2(L.nx, L.nz));
    let grabs = 0, exitT = null, t = 0, onLadder = false, topY = -1;
    for (; t < TH.ladderTime; t += DT) {
      const fwd = exitT === null || t < exitT + 1.0 ? 1 : 0;
      ctrl.update(DT, { forward: fwd, strafe: 0, jump: false, crouchToggle: false, sprint: false });
      for (const e of ctrl.events) if (e === 'ladder') grabs++;
      ctrl.events.length = 0;
      if (onLadder && !ctrl.ladder && ctrl.position.y > L.y1 - 0.5 && exitT === null) exitT = t;
      onLadder = !!ctrl.ladder; topY = Math.max(topY, ctrl.position.y);
      if (exitT !== null && t > exitT + 2.5) break;
    }
    const p = ctrl.position;
    const ok = grabs === 1 && exitT !== null && ctrl.grounded && p.y >= L.y1 - 0.6;
    if (!ok) fails++;
    const reason = ok ? null : grabs === 0 ? 'never grabbed (approach blocked?)' : grabs > 1 ? `regrabbed ${grabs}x: falls off the top (parapet / lip above exitY?)` : exitT === null ? 'never reached the top' : 'did not stay on the deck';
    out.push({ i, at: [r1(L.x), r1(L.z)], y1: r2(L.y1), exitY: r2(L.exitY ?? L.y1), grabs, climbS: exitT === null ? null : r1(exitT), end: P3(p), grounded: ctrl.grounded, ok, reason });
    marks.push({ kind: ok ? 'ladderOk' : 'ladderBad', x: L.x, z: L.z });
  }
  const res = { status: status(fails, 0), what: 'Scripted climb of every ladder (real controller, forward held from 1.3 m out, released 1 s after the exit): one grab and ending grounded on the deck = pass.', counts: { ladders: out.length, failing: fails }, failures: out.filter((l) => !l.ok), ladders: out };
  log(`ladders: ${res.status} ${out.length - fails}/${out.length} ok`);
  finishCheck('ladders', res);
}

// ============================================================================================== 3 spawns / nav / CTF
function obbDist(px, pz, p) {   // distance from a point to a registered prop footprint (0 inside)
  const c = Math.cos(p.rot), s = Math.sin(p.rot); const dx = px - p.x, dz = pz - p.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;   // inverse of Bucket.box rotation
  const ex = Math.max(0, Math.abs(lx) - p.sx / 2), ez = Math.max(0, Math.abs(lz) - p.sz / 2);
  return Math.hypot(ex, ez);
}
async function checkSpawns() {
  const ctrl = new PlayerController(world); const push = V();
  const sb = CAMPUS.spawnBounds;
  const issues = []; let warns = 0;
  const testPoint = (p, group, i) => {
    const errs = [], wrn = [];
    if (!inPB(p.x, p.z, 1)) errs.push('outside playBounds');
    if (group === 'ffa' && sb && !(p.x >= sb.minX && p.x <= sb.maxX && p.z >= sb.minZ && p.z <= sb.maxZ)) errs.push('outside spawnBounds');
    if (Math.abs(p.y - (world.groundY ? world.groundY(p.x, p.z) : 0)) > 0.1) errs.push('not at ground level (y=' + r2(p.y) + ')');
    if (world.terrain && world.terrain.slopeAt(p.x, p.z) > SPAWN_MAX_GRADE * 1.05) errs.push('on a slope of ' + r1(Math.atan(world.terrain.slopeAt(p.x, p.z)) * 180 / Math.PI) + ' deg');
    if (S.first(V(p.x, p.y + 2, p.z), UP, 100)) errs.push('no clear sky (roof / canopy above)');
    ctrl._resolve(V(p.x, p.y + 0.02, p.z), STAND.height, push); if (push.length() > 0.02) errs.push('capsule overlaps geometry (' + r2(push.length()) + ' m)');
    let wall = Infinity;
    for (const y of [0.5, 1.3]) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; const h = S.first(V(p.x, p.y + y, p.z), V(Math.cos(a), 0, Math.sin(a)), 3); if (h && h.distance < wall) wall = h.distance; }
    if (wall < TH.spawnWallFail) errs.push('wall ' + r2(wall) + ' m away'); else if (wall < TH.spawnWallWarn) wrn.push('wall ' + r2(wall) + ' m away');
    const prop = REG.props.reduce((b, q) => Math.min(b, obbDist(p.x, p.z, q)), Infinity);
    if (prop < TH.spawnPropGap) errs.push('on / against a prop (' + r2(prop) + ' m)');
    if (!navOK(p.x, p.z)) (nearWalk(p.x, p.z) ? wrn : errs).push(nearWalk(p.x, p.z) ? 'not on a nav walk cell (one is within 3 m)' : 'no nav walk cell within 3 m');
    if (errs.length || wrn.length) issues.push({ group, i, at: P3(p), errors: errs, warnings: wrn });
    if (wrn.length && !errs.length) warns++;
    marks.push({ kind: 'spawn', group, bad: errs.length > 0, x: p.x, z: p.z });
    return errs.length === 0;
  };
  let bad = 0;
  world.spawnPoints.forEach((p, i) => { if (!testPoint(p, 'ffa', i)) bad++; });
  const cs = world.ctfSpawns || { red: [], blue: [] };
  for (const team of ['red', 'blue']) (cs[team] || []).forEach((p, i) => { if (!testPoint(p, team, i)) bad++; });
  const ng = world.navGrid || {};
  const bases = world.ctfBases;
  const general = [];
  if (world.spawnPoints.length < TH.spawnMin) general.push(`only ${world.spawnPoints.length} FFA spawns (< ${TH.spawnMin})`);
  for (const team of ['red', 'blue']) if ((cs[team] || []).length < TH.ctfSpawnMin) general.push(`only ${(cs[team] || []).length} ${team} CTF spawns (< ${TH.ctfSpawnMin})`);
  if (ng.unreachable) general.push(`navGrid.unreachable = ${ng.unreachable}`);
  const baseInfo = {};
  let baseDist = null, navPath = null; const wrnGeneral = [];
  if (bases) {
    for (const team of ['red', 'blue']) {
      const b = bases[team]; const own = cs[team] || [], other = cs[team === 'red' ? 'blue' : 'red'] || [];
      // cover around the base: fraction of 16 directions blocked within 30 m at chest height
      let blocked = 0; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; if (S.first(V(b.x, b.y + 1.3, b.z), V(Math.cos(a), 0, Math.sin(a)), 30)) blocked++; }
      const dists = own.map((p) => Math.hypot(p.x - b.x, p.z - b.z));
      const outOfRange = dists.filter((d) => d < TH.ctfSpawnRange[0] - 1 || d > TH.ctfSpawnRange[1] + 1).length;
      const wrongSide = own.filter((p) => { const ob = bases[team === 'red' ? 'blue' : 'red']; return Math.hypot(p.x - ob.x, p.z - ob.z) < Math.hypot(p.x - b.x, p.z - b.z); }).length;
      baseInfo[team] = { at: P3(b), onWalkCell: navOK(b.x, b.z), cover30m: blocked / 16, teamSpawns: own.length, spawnsOutOfRange: outOfRange, spawnsNearerEnemyBase: wrongSide };
      if (!navOK(b.x, b.z)) general.push(`${team} CTF base is not on a walk cell`);
      if (wrongSide) general.push(`${wrongSide} ${team} spawns are nearer the enemy base`);
      if (outOfRange) wrnGeneral.push(`${outOfRange} ${team} spawns outside ${TH.ctfSpawnRange.join('-')} m of their base`);
      marks.push({ kind: 'base', team, x: b.x, z: b.z });
      void other;
    }
    baseDist = Math.hypot(bases.red.x - bases.blue.x, bases.red.z - bases.blue.z);
    if (baseDist < TH.ctfBaseDist[0] || baseDist > TH.ctfBaseDist[1]) wrnGeneral.push(`bases ${Math.round(baseDist)} m apart (guide ${TH.ctfBaseDist.join('-')} m)`);
    // walking distance between the bases on the nav grid (BFS, 4-neighbour)
    if (ng.walk) {
      const idx = (x, z) => { const i = Math.floor((x - ng.x0) / ng.cell), j = Math.floor((z - ng.z0) / ng.cell); return i < 0 || j < 0 || i >= ng.nx || j >= ng.nz ? -1 : j * ng.nx + i; };
      const a = idx(bases.red.x, bases.red.z), b = idx(bases.blue.x, bases.blue.z);
      if (a >= 0 && b >= 0 && ng.walk[a] && ng.walk[b]) {
        const dist = new Int32Array(ng.walk.length).fill(-1); const q = [a]; dist[a] = 0;
        for (let h = 0; h < q.length && dist[b] < 0; h++) { const k = q[h], i = k % ng.nx; for (const n of [k - 1, k + 1, k - ng.nx, k + ng.nx]) { if (n < 0 || n >= ng.walk.length || (n === k - 1 && i === 0) || (n === k + 1 && i === ng.nx - 1) || !ng.walk[n] || dist[n] >= 0) continue; dist[n] = dist[k] + 1; q.push(n); } }
        navPath = dist[b] >= 0 ? Math.round(dist[b] * ng.cell) : null;
        if (navPath === null) general.push('no nav path between the CTF bases');
      } else general.push('CTF base outside the nav walk area');
    }
  }
  const fails = bad + general.length;
  const res = {
    status: status(fails, warns + wrnGeneral.length),
    what: 'Every FFA / CTF spawn: inside playBounds (FFA: spawnBounds), at ground level, open sky, capsule fits, >= ' + TH.spawnWallFail + ' m from walls (warn < ' + TH.spawnWallWarn + '), not on a prop, on a nav walk cell. Nav unreachable = 0, CTF bases on walk cells, connected, sensible distance.',
    counts: { ffa: world.spawnPoints.length, ctfRed: (cs.red || []).length, ctfBlue: (cs.blue || []).length, failingSpawns: bad, navWalkable: ng.walkableCells ?? null, navUnreachable: ng.unreachable ?? null, baseDistance: baseDist === null ? null : Math.round(baseDist), baseNavPath: navPath },
    errors: general, warnings: wrnGeneral, bases: baseInfo, failures: issues,
  };
  log(`spawns: ${res.status} (${bad} failing spawns, ${general.length} general errors)`);
  finishCheck('spawns', res);
}

// ============================================================================================== 4 helicopter spots
async function checkHeli() {
  const out = []; let fails = 0, warns = 0;
  const spots = world.heliSpawns || [];
  for (const [i, h] of spots.entries()) {
    const { x, y, z } = h.pos; const errs = [], wrn = [];
    const disc = S.segDist(V(x, y + 0.5, z), V(x, y + 3.4, z), TH.heliClearWarn + 0.5, y + 0.3);
    if (disc.d < TH.heliClear) errs.push(`collider ${r2(disc.d)} m from the rotor axis at ${P3(disc.at)}`);
    else if (disc.d < TH.heliClearWarn) wrn.push(`collider ${r2(disc.d)} m from the rotor axis`);
    const tree = REG.trunks.reduce((b, t) => Math.min(b, Math.hypot(t[0] - x, t[1] - z)), Infinity);
    if (tree < TH.heliTreeClear) errs.push(`tree ${r1(tree)} m away (canopy in the rotor)`);
    if (S.first(V(x, y + 0.6, z), UP, 80)) errs.push('no open sky above');
    if (world.terrain && !h.roof) {
      // ground spot on terrain: skids on the ground (not floating, not buried), nearly level, no hillside in the rotor disc
      const T = world.terrain, c = Math.cos(h.yaw || 0), s = Math.sin(h.yaw || 0); let gmax = -Infinity, gmin = Infinity;
      for (const [lx, lz] of [[0, 0], [-1.2, -2], [1.2, -2], [-1.2, 2], [1.2, 2]]) { const g = T.heightAt(x + lx * c + lz * s, z - lx * s + lz * c); gmax = Math.max(gmax, g); gmin = Math.min(gmin, g); }
      if (y - gmax > TH.heliSkidFloat) errs.push(`skids ${r2(y - gmax)} m above the ground`);
      if (gmax - y > 0.1) errs.push(`skids ${r2(gmax - y)} m in the ground`);
      if (gmax - gmin > HELI_MAX_SKID_DROP + 0.05) errs.push(`ground under the skids not level (${r2(gmax - gmin)} m)`);
      const hill = T.maxIn(x, z, TH.heliClear); if (hill > y + 2.0) errs.push(`hillside ${r2(hill - y)} m high inside the rotor disc`);
    }
    if (h.roof || (!world.terrain && y > 0.5)) {
      const c = Math.cos(h.yaw || 0), s = Math.sin(h.yaw || 0);
      for (const [lx, lz] of [[0, 0], [-1.2, -2], [1.2, -2], [-1.2, 2], [1.2, 2]]) {
        const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
        if (!S.first(V(px, y + 1, pz), DOWN, 1.4)) { errs.push(`no deck under skid point (${r1(lx)}, ${r1(lz)})`); break; }
      }
    }
    if (!inPB(x, z, 6)) errs.push('within 6 m of the play-area edge');
    if (errs.length) fails++; else if (wrn.length) warns++;
    out.push({ i, at: P3(h.pos), roof: !!h.roof, clearance: r2(disc.d), treeDist: r1(tree), errors: errs, warnings: wrn });
    marks.push({ kind: 'heli', bad: errs.length > 0, x, z });
  }
  const general = spots.length < TH.heliMin ? [`only ${spots.length} helicopter spots (< ${TH.heliMin})`] : [];
  const res = { status: status(fails, warns + general.length), what: `Each heli spot: nothing solid within ${TH.heliClear} m of the rotor axis between deck+0.3 m and +3.4 m (warn < ${TH.heliClearWarn}), tree trunks >= ${TH.heliTreeClear} m, open sky, roof spots have deck under all skid points.`, counts: { spots: spots.length, roof: spots.filter((h) => h.roof).length, failing: fails, warning: warns }, warnings: general, failures: out.filter((o) => o.errors.length || o.warnings.length), spots: out };
  log(`heli: ${res.status} ${spots.length - fails}/${spots.length} ok`);
  finishCheck('heli', res);
}

// ============================================================================================== 4b terrain
// Campuses with a heightfield (descriptor `terrain`, src/world/terrain.js) only; flat campuses skip it.
// a) Slope pockets: terrain samples every 2.5 m that are steeper than the walk limit, or on hilly ground (> 0.5 m relief
//    within 6 m) but not connected to the nav walk area, are clustered (4 m); from the 3 lowest starts of each cluster the real
//    controller (stuck safety net off) must reach walkable, nav-connected ground with walk + jump + double jump in 16
//    directions x 6 s. One that cannot = an unwalkable slope pocket (fail): a hollow ringed by slopes too steep to climb.
// b) Props on slopes: every registered prop's base (registry y) against the ground under its footprint corners and centre:
//    floating > 12 cm = fail; highest ground more than 50 % of the prop's height above its base = fail (30 % = warn).
async function checkTerrain() {
  const T = world.terrain;
  if (!T) { finishCheck('terrain', { status: 'skip', what: 'Flat campus (no descriptor `terrain`): nothing to check.', counts: { flat: true } }); return; }
  const tStart = performance.now(); const g = TH.terrainGrid;
  const ctrl = noUnstuck(new PlayerController(world)); const nrm = V();
  const starts = []; let samples = 0, steep = 0, unconnected = 0, maxSlope = 0;
  for (let x = PB.minX + g / 2; x < PB.maxX; x += g) for (let z = PB.minZ + g / 2; z < PB.maxZ; z += g) {
    if (!inPB(x, z, 2)) continue;
    samples++; const gy = T.heightAt(x, z); maxSlope = Math.max(maxSlope, T.slopeAt(x, z));
    const isSteep = T.normalAt(x, z, nrm).y < WALK_NORMAL_Y;
    if (!isSteep && (nearWalk(x, z) || T.maxIn(x, z, 6) - T.minIn(x, z, 6) < 0.5)) continue;
    if (S.first(V(x, gy + 60, z), DOWN, 59.7)) continue;   // under / inside a solid: the escape check's business
    if (isSteep) steep++; else unconnected++;
    starts.push({ x, z, gy, steep: isSteep });
  }
  const clusters = [];
  for (const st of starts) { let c = clusters.find((q) => q.pts.some((p) => Math.hypot(p.x - st.x, p.z - st.z) <= 4)); if (!c) clusters.push(c = { pts: [] }); c.pts.push(st); }
  const okAt = (p) => ctrl.grounded && p.y - GY(p.x, p.z) < 0.35 && navOK(p.x, p.z) && T.normalAt(p.x, p.z, nrm).y >= WALK_NORMAL_Y;
  const escape = (st) => {
    const sy = st.steep ? st.gy + 0.4 : T.standY(st.x, st.z) + 0.02;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, dx = Math.cos(a), dz = Math.sin(a);
      ctrl.teleport(V(st.x, sy, st.z), Math.atan2(-dx, -dz)); if (st.steep) ctrl.grounded = false;
      let blockedT = 0, jumped = false, doubled = false, lx = st.x, lz = st.z;
      for (let t = 0; t < TH.terrainEscapeTime; t += DT) {
        let jump = false; const p = ctrl.position; const mv = Math.hypot(p.x - lx, p.z - lz) / DT; lx = p.x; lz = p.z;
        if (ctrl.grounded) { jumped = doubled = false; if (mv < 1.2) blockedT += DT; else blockedT = 0; if (blockedT > 0.15) { jump = jumped = true; blockedT = 0; } }
        else if (jumped && !doubled && ctrl.velocity.y < 0.8 && ctrl.airJumps > 0) { jump = doubled = true; }
        ctrl.update(DT, { forward: 1, strafe: 0, jump, crouchToggle: false, sprint: true }); ctrl.events.length = 0;
        if (okAt(ctrl.position)) return { ok: true };
        if (ctrl.position.y < GY(ctrl.position.x, ctrl.position.z) - 5) return { ok: false, fell: true, last: ctrl.position.clone() };
      }
    }
    return { ok: false, last: ctrl.position.clone() };
  };
  const pockets = []; let tested = 0, lastYield = performance.now();
  for (const c of clusters) {
    // the lowest starts of the cluster (where a player ends up after sliding down) must all get out
    const low = c.pts.slice().sort((a, b) => a.gy - b.gy); const picks = [];
    for (const q of low) { if (picks.every((p) => Math.hypot(p.x - q.x, p.z - q.z) > 2)) picks.push(q); if (picks.length >= 3) break; }
    let ok = true, last = null;
    for (const st of picks) { tested++; const r = escape(st); if (!r.ok) { ok = false; last = r; break; } }
    const cx = c.pts.reduce((a, p) => a + p.x, 0) / c.pts.length, cz = c.pts.reduce((a, p) => a + p.z, 0) / c.pts.length;
    if (!ok) pockets.push({ at: [r1(cx), r2(T.heightAt(cx, cz)), r1(cz)], samples: c.pts.length, steepSamples: c.pts.filter((p) => p.steep).length, endedAt: last ? P3(last.last) : null, fellThrough: !!last?.fell, note: 'unwalkable slope pocket: the controller cannot walk / jump out to walkable, nav-connected ground' });
    marks.push({ kind: 'slope', x: cx, z: cz, bad: !ok });
    if (performance.now() - lastYield > 250) { lastYield = performance.now(); $('status').textContent = `terrain: slope clusters ${clusters.indexOf(c) + 1}/${clusters.length}`; await tick(); }
  }
  // props on slopes
  const propFails = [], propWarns = [];
  for (const p of REG.props) {
    if (!inPB(p.x, p.z, -30)) continue;
    const pts = obbCorners(p).concat([[p.x, p.z]]); let gmin = Infinity, gmax = -Infinity;
    for (const [x, z] of pts) { const gy = T.heightAt(x, z); gmin = Math.min(gmin, gy); gmax = Math.max(gmax, gy); }
    const base = p.y || 0, flt = base - gmin, bury = (gmax - base) / Math.max(0.3, p.h || 1);
    const e = { prop: p.kind, at: [r1(p.x), r2(base), r1(p.z)], floating: r2(flt), buriedFrac: r2(bury), groundRange: r2(gmax - gmin) };
    if (flt > TH.propFloat || bury > TH.propBuryFail) propFails.push(e); else if (bury > TH.propBuryWarn) propWarns.push(e);
    if (flt > TH.propFloat || bury > TH.propBuryWarn) marks.push({ kind: 'propSlope', x: p.x, z: p.z, bad: flt > TH.propFloat || bury > TH.propBuryFail });
  }
  const res = {
    status: status(pockets.length + propFails.length, propWarns.length),
    what: 'Terrain: (a) every steep (normal y < ' + WALK_NORMAL_Y + ') or hilly-but-unconnected terrain sample (2.5 m grid, open sky) is clustered and the real controller must walk / jump from the 3 lowest starts of each cluster to walkable nav-connected ground (one that cannot = an unwalkable slope pocket); (b) props: base vs the ground under the footprint (floating > ' + TH.propFloat + ' m fails; ground above the base > ' + TH.propBuryFail * 100 + ' % of the prop height fails, > ' + TH.propBuryWarn * 100 + ' % warns).',
    counts: { samples, maxSlopeDeg: r1(Math.atan(maxSlope) * 180 / Math.PI), steepSamples: steep, unconnectedHillSamples: unconnected, clusters: clusters.length, startsTested: tested, pockets: pockets.length, navSteepCells: world.navGrid?.steepCells ?? null, terrainMinY: r2(T.minY), terrainMaxY: r2(T.maxY), propsFloatingOrBuried: propFails.length, propsHalfBuried: propWarns.length },
    failures: pockets.concat(propFails).slice(0, 60), warnings: propWarns.slice(0, 20).map((w) => JSON.stringify(w)), seconds: r1((performance.now() - tStart) / 1000),
  };
  log(`terrain: ${res.status} ${pockets.length} slope pockets, ${propFails.length} props floating / buried (${res.seconds} s)`);
  finishCheck('terrain', res);
}

// ============================================================================================== 4c houses / retaining blocks / CTF overlooks (hilly campuses)
// Builders register what they placed in ctx.houses / ctx.retaining (world.registry); campuses that register nothing skip.
async function checkHouses() {
  const H = REG.houses || []; if (!H.length) { finishCheck('houses', { status: 'skip', note: 'no houses registered (ctx.houses)' }); return; }
  const fails = [], warns = []; let worst = 0;
  for (const h of H) {
    let cx = 0, cz = 0; for (const p of h.ring) { cx += p[0]; cz += p[1]; } cx /= h.ring.length; cz /= h.ring.length;
    let lo = Infinity, at = null;   // lowest ground 0.7 m outside the walls
    for (let i = 0; i < h.ring.length; i++) { const a = h.ring[i], b = h.ring[(i + 1) % h.ring.length]; const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
      for (let k = 0; k <= n; k++) { let x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; const d = Math.hypot(x - cx, z - cz) || 1; x += (x - cx) / d * 0.7; z += (z - cz) / d * 0.7; const g = GY(x, z); if (g < lo) { lo = g; at = [r1(x), r2(g), r1(z)]; } } }
    const storeys = Math.max(1, h.storeys || 1) + (h.garage ? 1 : 0); const tall = h.top - lo, limit = storeys * 3 + 1.5; worst = Math.max(worst, tall - limit);
    const e = { id: h.id, at, storeys: h.storeys, garage: !!h.garage, tallestWall: r1(tall), limit: r1(limit), windowRows: h.rows };
    if (tall > limit + 2.5) fails.push({ ...e, note: 'wall far taller than its storeys: a house on a slope needs a pad (fill / cut), not just a datum' });
    else if (tall > limit || (h.rows || 0) > storeys) warns.push({ ...e, note: tall > limit ? 'tallest wall exceeds storeys x 3 m + 1.5 m' : 'more windowed rows than recorded storeys' });
    if (tall > limit) marks.push({ kind: 'vis', x0: cx - 2, z0: cz - 2, x1: cx + 2, z1: cz + 2 });
    // a house pad must not be FILL (rule B11): ground 1.5-4 m outside the walls more than 1 m above the source DEM
    const SRC = world.terrain && world.terrain.sourceAt;
    if (SRC) { let n = 0, up = 0, mx = 0; for (let i = 0; i < h.ring.length; i++) { const a = h.ring[i], b = h.ring[(i + 1) % h.ring.length]; for (const t of [0.25, 0.75]) for (const o of [1.5, 4]) { let x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; const d = Math.hypot(x - cx, z - cz) || 1; x += (x - cx) / d * o; z += (z - cz) / d * o; const df = GY(x, z) - SRC(x, z); n++; if (df > 1) up++; mx = Math.max(mx, df); } }
      if (up >= 3 && mx > 1.5) warns.push({ id: h.id, at: [r1(cx), r1(cz)], fillM: r1(mx), samplesOnFill: up + '/' + n, note: 'house stands on fill above the source terrain: keep the natural ground and show walk-out storeys' }); }
  }
  // fill mounds anywhere in play: ground more than 2 m ABOVE the source DEM off the asphalt (cuts are designed; a tall fill is a mound)
  if (world.terrain && world.terrain.sourceAt) { const SRC = world.terrain.sourceAt; const cells = [];
    // (graded streets and building pads are designed earthworks: skip 6 m round asphalt and 9 m round registered footprints)
    const nearPaved = (x, z) => !!world.surfaceAt && [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]].some(([dx, dz]) => world.surfaceAt(x + dx, z + dz) === 'asphalt');
    const rings = [...(REG.houses || []), ...(REG.footprints || [])].map((f) => f.ring).filter(Boolean); const nearRing = (x, z) => rings.some((r) => r.some((p) => Math.hypot(p[0] - x, p[1] - z) < 9) || r.some((p, i) => { const q = r[(i + 1) % r.length]; const dx = q[0] - p[0], dz = q[1] - p[1]; const tt = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - p[0] - dx * tt, z - p[1] - dz * tt) < 9; })); for (let z = PB.minZ + 2; z <= PB.maxZ - 2; z += 4) for (let x = PB.minX + 2; x <= PB.maxX - 2; x += 4) { const df = GY(x, z) - SRC(x, z); if (df > 2 && !nearPaved(x, z) && !nearRing(x, z)) cells.push([x, z, df]); }
    const seen = new Set(); for (const c of cells) { const k = Math.round(c[0] / 16) + ':' + Math.round(c[1] / 16); if (seen.has(k)) continue; seen.add(k); const grp = cells.filter((q) => Math.round(q[0] / 16) + ':' + Math.round(q[1] / 16) === k); if (grp.length < 2) continue; const mx = Math.max(...grp.map((q) => q[2])); warns.push({ at: [r1(c[0]), r1(c[1])], cells: grp.length, fillM: r1(mx), note: 'terrain more than 2 m above the source DEM (fill mound) outside the streets' }); marks.push({ kind: 'vis', x0: c[0] - 4, z0: c[1] - 4, x1: c[0] + 4, z1: c[1] + 4 }); }
  }
  const res = { status: status(fails.length, warns.length), what: 'Houses registered by the builder (ctx.houses: ring, eave height, storeys seen from the street, garage level, windowed rows): the tallest wall (eave over the lowest ground at the walls) may not exceed storeys x 3 m + 1.5 m (fail beyond + 2.5 m), and no wall may show more windowed rows than storeys.',
    counts: { houses: H.length, failing: fails.length, warning: warns.length, worstExcessM: r1(worst) }, failures: fails.slice(0, 60), warnings: warns.slice(0, 20).map((w) => JSON.stringify(w)) };
  log(`houses: ${res.status} ${fails.length} too tall, ${warns.length} warnings (${H.length} houses)`); finishCheck('houses', res);
}
// Streets (world/streets.js, registry.streets): graded streets are designed surfaces. Every 1 m of every centreline in
// the play area: profile bumpiness (2nd difference over 4 m), cross-slope, sidewalk continuity and kerb, and nothing
// (a building pad, a yard) may have moved the carriageway or the sidewalks off their design.
async function checkRoads() {
  const SR = REG.streets; if (!SR || !SR.length || !world.terrain) { finishCheck('roads', { status: 'skip', note: 'no graded streets registered (world/streets.js gradeStreets)' }); return; }
  const pb = world.playBounds, inP = (p) => p && p[0] >= pb.minX && p[0] <= pb.maxX && p[1] >= pb.minZ && p[1] <= pb.maxZ;
  const fails = [], warns = []; const cnt = { bump: 0, crest: 0, cross: 0, walkStep: 0, kerb: 0, moved: 0, surface: 0, trunk: 0, post: 0 }; let stations = 0, worstBump = 0, worstCross = 0, worstMoved = 0, worstStep = 0;
  const bad = (kind, name, p, v, warn) => { const e = { kind, street: name, at: [r1(p[0]), r2(GY(p[0], p[1])), r1(p[1])], value: r2(v) }; if (warn) { warns.push(e); return; } cnt[kind]++; fails.push(e); marks.push({ kind: 'vis', x0: p[0] - 1.5, z0: p[1] - 1.5, x1: p[0] + 1.5, z1: p[1] + 1.5 }); };
  for (const st of SR) { const P = st.pts; const g = (p) => (p ? GY(p[0], p[1]) : NaN);
    for (let k = 0; k < P.length; k++) { const s = P[k]; if (!inP(s.c)) continue; stations++; const gc = g(s.c);
      if (k >= 4 && k + 4 < P.length && P[k - 4].c && P[k + 4].c && s.jd >= st.hw + 4) { const c4 = g(P[k - 4].c) - 2 * gc + g(P[k + 4].c);
        // a bump is LOCAL: the 2nd difference over 4 m less what the street's own vertical curve explains (the 2nd
        // difference over 12 m, scaled: a long crest or sag is not a bump); the vertical curve itself may not be sharper than 0.2 m
        const m = Math.min(12, k, P.length - 1 - k); const c12 = m >= 7 && P[k - m].c && P[k + m].c ? (g(P[k - m].c) - 2 * gc + g(P[k + m].c)) * 16 / (m * m) : 0; const d2 = Math.abs(c4 - c12);
        worstBump = Math.max(worstBump, d2); if (d2 > 0.08) bad('bump', st.name, s.c, d2); else if (d2 > 0.06) bad('bump', st.name, s.c, d2, true); if (Math.abs(c4) > 0.2) bad('crest', st.name, s.c, c4); }
      for (const p of [s.c, s.eL, s.eR, s.wL, s.wR]) if (p) { const d = Math.abs(g(p) - p[2]); worstMoved = Math.max(worstMoved, d); if (d > (p[3] === 'road' ? 0.12 : 0.2)) bad('moved', st.name, p, d); }
      // the ground texture follows the design: asphalt on the carriageway, concrete on the sidewalks (ctx.paintSurface)
      if (world.surfaceAt) for (const p of [s.c, s.eL, s.eR, s.wL, s.wR]) if (p && inP(p)) { const want = p[3] === 'road' ? 'asphalt' : 'concrete'; if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => world.surfaceAt(p[0] + dx, p[1] + dz) === want)) bad('surface', st.name, p, 0); }   /* (the class map is a 1 m grid) */
      if (s.jd < st.hw + 12) continue;   // inside an intersection the arms blend into one surface: no cross-section there
      for (const e of [s.eL, s.eR]) if (e) { const cs = Math.abs(gc - g(e)) / (st.hw * 0.5); worstCross = Math.max(worstCross, cs); if (cs > 0.04) bad('cross', st.name, e, cs * 100); }
      for (const [w, e, side] of [[s.wL, s.eL, 'wL'], [s.wR, s.eR, 'wR']]) { if (!w) continue; const gw = g(w);
        if (e) { const kb = gw - g(e); if (kb < -0.1 || kb > 0.5) bad('kerb', st.name, w, kb); }
        const pw = k ? P[k - 1][side] : null; if (pw && Math.hypot(pw[0] - w[0], pw[1] - w[1]) < 1.6) { const stp = Math.abs(gw - g(pw)); worstStep = Math.max(worstStep, stp); if (stp > 0.2) bad('walkStep', st.name, w, stp); } }
    } }
  // nothing stands on a carriageway: tree trunks within 0.6 m of one, posts / props on one (vehicles and roadblocks belong there)
  if (REG.inRoad) { for (const t of REG.trunks || []) if (inP(t) && REG.inRoad(t[0], t[1], 0.6)) bad('trunk', null, t, 0);
    for (const p of REG.props || []) if (!/car|bus|truck|van|block|barrier|cone|heli/i.test(p.kind || '') && inP([p.x, p.z]) && REG.inRoad(p.x, p.z, 0)) bad('post', p.kind, [p.x, p.z], 0); }
  const res = { status: status(fails.length, warns.length), what: 'Graded streets (registry.streets, every 1 m of each centreline in the play area): the centreline profile may not bump (2nd difference over 4 m, less the vertical curve of the street over 12 m, > 0.08 m; the vertical curve itself > 0.2 m over 4 m; not inside an intersection, where the arms blend), the carriageway cross-slope may not exceed 4 %, a sidewalk may not step more than 0.2 m per metre nor leave the kerb range (-0.1..0.5 m over the road edge), no pad may have moved the carriageway (> 0.12 m) or a sidewalk (> 0.2 m) off its design, the surface class must be asphalt on the carriageway and concrete on the sidewalks, and no tree trunk (within 0.6 m) or post / prop may stand on a carriageway.',
    counts: { streets: SR.length, stations, failing: fails.length, ...cnt, worstBumpM: r2(worstBump), worstCrossPct: r1(worstCross * 100), worstWalkStepM: r2(worstStep), worstMovedM: r2(worstMoved) }, failures: fails.slice(0, 60), warnings: warns.slice(0, 20).map((w) => JSON.stringify(w)) };
  log(`roads: ${res.status} ${fails.length} failing samples on ${stations} stations`); finishCheck('roads', res);
}
// Mound on paving (rulebook 30; Marin: a 0.6 m asphalt hump at the foot of the pool stairs, left by two wall pads). Terrain
// campuses only. Every metre of the play area: a point whose surface class is asphalt or concrete and that stands more than
// 0.15 m above the ground 3 m away along ALL four axes is a mound (a road crown is 6 cm over 3 m; a crest or a ramp is higher
// than its neighbours on two sides at most). Ground hidden under a solid (a stair mass, a retaining block, a roof) is skipped.
async function checkMounds() {
  if (!world.terrain || !world.surfaceAt) { finishCheck('mounds', { status: 'skip', note: 'flat campus (no terrain)' }); return; }
  const fails = [], warns = []; let n = 0, worst = 0; const hits = [];
  for (let z = PB.minZ + 4; z <= PB.maxZ - 4; z += 1) for (let x = PB.minX + 4; x <= PB.maxX - 4; x += 1) {
    const sf = world.surfaceAt(x, z); if (sf !== 'asphalt' && sf !== 'concrete') continue; n++;
    const g = GY(x, z); const e = Math.min(g - GY(x + 3, z), g - GY(x - 3, z), g - GY(x, z + 3), g - GY(x, z - 3)); if (e <= 0.15) continue;
    if (S.first(V(x, g + 4, z), DOWN, 3.95)) continue;
    hits.push([x, z, g, e]); worst = Math.max(worst, e);
  }
  // cluster (3 m) and report the peak of each
  const used = new Uint8Array(hits.length);
  for (let i = 0; i < hits.length; i++) { if (used[i]) continue; const cl = [i]; used[i] = 1; for (let h = 0; h < cl.length; h++) for (let j = 0; j < hits.length; j++) if (!used[j] && Math.hypot(hits[j][0] - hits[cl[h]][0], hits[j][1] - hits[cl[h]][1]) <= 3) { used[j] = 1; cl.push(j); }
    let pk = cl[0]; for (const k of cl) if (hits[k][3] > hits[pk][3]) pk = k; const [x, z, g, e] = hits[pk];
    // (one grid point within 5 cm of the limit is a warning: at 1 m spacing that is the noise of the 2 m lattice at a pad edge)
    const rec = { at: [r1(x), r2(g), r1(z)], aboveNeighboursM: r2(e), points: cl.length, surface: world.surfaceAt(x, z), note: 'mound on paving: flatten it (a pad or a wall strip left a hump)' };
    if (cl.length === 1 && e <= 0.2) { warns.push(rec); continue; }
    fails.push(rec); marks.push({ kind: 'vis', x0: x - 1.5, z0: z - 1.5, x1: x + 1.5, z1: z + 1.5 }); }
  const res = { status: status(fails.length, warns.length), what: 'Mound on paving: a point on asphalt / concrete (1 m grid over the play area) more than 0.15 m above the ground 3 m away along all four axes fails (a single grid point of at most 0.2 m warns); ground under a solid is skipped. Terrain campuses only.',
    counts: { pavedSamples: n, mounds: fails.length, warning: warns.length, worstM: r2(worst) }, failures: fails.slice(0, 60), warnings: warns.slice(0, 20).map((w) => JSON.stringify(w)) };
  log(`mounds: ${res.status} ${fails.length} mounds on paving`); finishCheck('mounds', res);
}
async function checkRetaining() {
  const Rb = REG.retaining || []; if (!Rb.length || !world.terrain) { finishCheck('retaining', { status: 'skip', note: 'no retaining blocks registered (ctx.retaining)' }); return; }
  const fails = [], warns = []; let maxPoke = 0;
  for (const b of Rb) {   // { x, z, tx, tz (along the face), fx, fz (out of the front face), w, d, top, frontY }
    let poke = 0, n = 0, at = null;
    for (let u = -b.w / 2 + 0.15; u <= b.w / 2 - 0.15 + 1e-6; u += 0.5) {
      const x = b.x + b.tx * u + b.fx * (b.d / 2 + 0.08), z = b.z + b.tz * u + b.fz * (b.d / 2 + 0.08); const e = GY(x, z) - b.frontY; if (e > 0.12) { n++; if (e > poke) { poke = e; at = [r1(x), r2(GY(x, z)), r1(z)]; } }
      for (let v = -b.d / 2 + 0.2; v <= b.d / 2 - 0.2; v += 0.6) { const xi = b.x + b.tx * u + b.fx * v, zi = b.z + b.tz * u + b.fz * v; const t = GY(xi, zi) - b.top; if (t > 0.04) { n++; if (t > poke) { poke = t; at = [r1(xi), r2(GY(xi, zi)), r1(zi)]; } } }
    }
    maxPoke = Math.max(maxPoke, poke);
    if (poke > 0.25) { fails.push({ at, poke: r2(poke), samples: n, note: 'terrain pokes through a retaining block (front face or top): make the block deeper than the pad blend + one lattice cell' }); marks.push({ kind: 'vis', x0: b.x - 1.5, z0: b.z - 1.5, x1: b.x + 1.5, z1: b.z + 1.5 }); }
    else if (n) warns.push({ at, poke: r2(poke), samples: n });
  }
  // a wall taller than 1.5 m around a designed pad reads as a pit (a pool deck in a box): only blocks registered with allowTall (a sports field cut into a hill) may be
  let tall = 0; for (const b of Rb) if (!b.allowTall && b.top - b.frontY > 1.5) { tall++; warns.push({ at: [r1(b.x), r2(b.top), r1(b.z)], heightM: r2(b.top - b.frontY), note: 'retaining wall taller than 1.5 m (not allowTall): grade the ground in or step it' }); }
  const res = { status: status(fails.length, warns.length), what: 'Retaining blocks registered by the builder (ctx.retaining): the terrain may not rise above the pad level right in front of the block face (> 0.12 m) nor above its top inside the footprint; > 0.25 m fails.',
    counts: { blocks: Rb.length, failing: fails.length, warning: warns.length, maxPokeM: r2(maxPoke), tallerThan1_5m: tall }, failures: fails.slice(0, 60), warnings: warns.slice(0, 20).map((w) => JSON.stringify(w)) };
  log(`retaining: ${res.status} ${fails.length} blocks with terrain through them`); finishCheck('retaining', res);
}
// Building seating: the ground just outside every registered wall (ctx.walls: { id, a, b (CCW ring edge), floor, top, open })
// against that wall's floor. Terrain may not touch a facade above its floor line where the wall has windows / doors.
async function checkSeating() {
  const W = REG.walls || []; if (!W.length || !world.terrain) { finishCheck('seating', { status: 'skip', note: 'no walls registered (ctx.walls) or flat campus' }); return; }
  const by = new Map(); let nS = 0;
  // (the ground under a retaining block is not what stands against the wall there: the block is)
  const Rb = REG.retaining || []; const underBlock = (x, z) => Rb.some((b) => { const dx = x - b.x, dz = z - b.z; return Math.abs(dx * b.tx + dz * b.tz) <= b.w / 2 + 0.3 && Math.abs(dx * b.fx + dz * b.fz) <= b.d / 2 + 0.3; });
  for (const w of W) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < 1.2) continue; const nx = (w.b[1] - w.a[1]) / L, nz = -(w.b[0] - w.a[0]) / L; const n = Math.max(2, Math.round(L));
    let over = 0, worst = 0, at = null, poke = 0, low = 0;
    for (let k = 0; k <= n; k++) { const t = (0.35 + (L - 0.7) * k / n) / L; const x = w.a[0] + (w.b[0] - w.a[0]) * t + nx * 0.4, z = w.a[1] + (w.b[1] - w.a[1]) * t + nz * 0.4; if (!inPB(x, z, -30) || underBlock(x, z)) continue; const g = GY(x, z); nS++;
      const e = g - w.floor; if (e > 0.3) { over++; if (e > worst) { worst = e; at = [r1(x), r2(g), r1(z)]; } } else if (e > 0.15) low++; if (g > w.top - 0.3) poke++; }
    if (!over && !poke && !low) continue;
    const key = w.id ?? (Math.round(w.a[0] / 20) + ',' + Math.round(w.a[1] / 20)); let b = by.get(key); if (!b) { b = { id: w.id ?? null, walls: 0, bermedOpen: 0, bermedBlank: 0, poking: 0, lowOnly: 0, worst: 0, at: null }; by.set(key, b); }
    b.walls++; if (poke) b.poking++; if (over) { if (w.open) b.bermedOpen++; else b.bermedBlank++; if (worst > b.worst) { b.worst = r2(worst); b.at = at; } } else if (low) b.lowOnly++;
    if (over && w.open) marks.push({ kind: 'vis', x0: at[0] - 1.5, z0: at[2] - 1.5, x1: at[0] + 1.5, z1: at[2] + 1.5 });
  }
  const all = [...by.values()]; const fails = all.filter((b) => b.bermedOpen || b.poking).sort((p, q) => q.worst - p.worst); const warns = all.filter((b) => !b.bermedOpen && !b.poking && (b.bermedBlank || b.lowOnly));
  const res = { status: status(fails.length, warns.length), what: 'Building seating: the ground 0.4 m outside every registered wall (ctx.walls), sampled every ~1 m, against the floor line of that wall. Fail: ground more than 0.3 m above the floor of a wall with windows / doors (the hill buries the facade), or ground up to the wall top (the hill runs through the wall). Warn: ground 0.15-0.3 m above the floor, or a blank wall bermed into the hill.',
    counts: { walls: W.length, samples: nS, buildingsFailing: fails.length, buildingsWarning: warns.length, worstM: fails.length ? fails[0].worst : 0 }, failures: fails.slice(0, 80), warnings: warns.slice(0, 20).map((w) => JSON.stringify(w)) };
  log(`seating: ${res.status} ${fails.length} buildings with ground on the facade`); finishCheck('seating', res);
}
// Footprint interiors: per-wall pads seat the walls, the hill inside the footprint is still there. Registry ctx.footprints
// ({ id, ring, roof, floor }): ground inside may not reach the roof deck (fail: it comes out through the roof) and should
// stay within 0.3 m of the floor (warn).
async function checkInterior() {
  const Fp = REG.footprints || []; if (!Fp.length || !world.terrain) { finishCheck('interior', { status: 'skip', note: 'no footprints registered (ctx.footprints) or flat campus' }); return; }
  const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
  const fails = [], warns = []; let nS = 0;
  for (const f of Fp) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of f.ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    let through = 0, high = 0, worst = -Infinity, at = null;
    for (let z = z0 + 0.5; z < z1; z += 1) for (let x = x0 + 0.5; x < x1; x += 1) {
      if (![[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]].every(([dx, dz]) => inRing(x + dx, z + dz, f.ring))) continue; const g = GY(x, z); nS++;
      if (g > f.roof - 0.05) { through++; if (g - f.roof > worst) { worst = g - f.roof; at = [r1(x), r2(g), r1(z)]; } } else if (g > f.floor + 0.3) high++;
    }
    if (through >= 2) { fails.push({ id: f.id, at, samples: through, aboveRoofM: r2(worst), roof: r2(f.roof), note: 'the hill comes out through the roof: flatten the ground inside the footprint to the floor' }); marks.push({ kind: 'vis', x0: at[0] - 2, z0: at[2] - 2, x1: at[0] + 2, z1: at[2] + 2 }); }
    else if (high >= 3) warns.push({ id: f.id, samplesAboveFloor: high });
  }
  const res = { status: status(fails.length, warns.length), what: 'Ground inside every registered footprint (ctx.footprints, 1 m grid, 0.6 m clear of the walls): at or above the roof deck fails, more than 0.3 m above the floor warns.',
    counts: { footprints: Fp.length, samples: nS, failing: fails.length, warning: warns.length }, failures: fails.slice(0, 60), warnings: warns.slice(0, 20).map((w) => JSON.stringify(w)) };
  log(`interior: ${res.status} ${fails.length} footprints with ground through the roof`); finishCheck('interior', res);
}
// Geometry sweeps over the DRAWN meshes (no registry): they catch what a builder forgot to register.
//  glassBuried: glazing triangles (glass / storefront materials) whose lower edge is below the ground 0.35 m in front.
//  wallGap: wall triangles (stucco / brick / house wall materials) whose foot hangs above the ground with nothing drawn
//  under it (a floating wall: the ground fell away and no plinth was built).
// Fail on terrain campuses; on flat campuses (ground = 0 everywhere, cantilevers and canopies in wall materials) warn only.
async function checkFacadeSweep() {
  const VS = buildVisual(); const { pos, triMesh, info } = VS; const hilly = !!world.terrain;
  const a = V(), b = V(), c = V(), e1 = V(), e2 = V(), n = V(), p = V(), d = V();
  const glassCells = new Map(), gapCells = new Map(); let nGlass = 0, nWall = 0;
  const Rb = REG.retaining || []; const underBlock = (x, z) => Rb.some((b) => { const dx = x - b.x, dz = z - b.z; return Math.abs(dx * b.tx + dz * b.tz) <= b.w / 2 + 0.6 && Math.abs(dx * b.fx + dz * b.fz) <= b.d / 2 + 0.6; });
  const hit = (cells, pt, extra) => { const k = Math.floor(pt.x / 4) + ',' + Math.floor(pt.z / 4); let cl = cells.get(k); if (!cl) { cl = { n: 0, at: P3(pt), worst: 0, key: extra.key }; cells.set(k, cl); } cl.n++; if (extra.m > cl.worst) { cl.worst = r2(extra.m); cl.at = P3(pt); } };
  let lastYield = performance.now();
  for (let t = 0; t < VS.nTris; t++) {
    const key = info[triMesh[t]].key; const glass = /^(glassInt|storefront)$/.test(key), wall = /^(stucco|brick|maW_|maP_)/.test(key); if (!glass && !wall) continue;
    a.fromArray(pos, t * 9); b.fromArray(pos, t * 9 + 3); c.fromArray(pos, t * 9 + 6); if (!inPB(a.x, a.z, 1)) continue;
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2); const area2 = n.length(); if (area2 < 0.2) continue; n.divideScalar(area2); if (Math.abs(n.y) > 0.3) continue; n.y = 0; n.normalize();
    const lo = a.y <= b.y && a.y <= c.y ? a : b.y <= c.y ? b : c; const ymax = Math.max(a.y, b.y, c.y);
    if (glass) {
      if (underBlock(a.x, a.z) || underBlock(c.x, c.z)) continue;   // (a retaining block stands against the wall there)
      nGlass++; { let side = 1; for (const sg of [1, -1]) { p.copy(a).add(b).add(c).multiplyScalar(1 / 3).addScaledVector(n, sg * 0.5); d.copy(n).multiplyScalar(-sg); const h = S.first(p, d, 1.2); if (h && h.face && h.face.normal.dot(d) < -0.3) { side = sg; break; } } n.multiplyScalar(side); }
      p.copy(a).add(b).add(c).multiplyScalar(1 / 3).addScaledVector(n, 0.35); const g = GY(p.x, p.z); const m = g - lo.y;
      if (m > 0.25) { p.y = g; hit(glassCells, p, { m, key }); }
    } else {
      if (ymax - lo.y < 1.0) continue; nWall++;
      // which side is outdoors: the side from which the collision wall behind this triangle is met on its front face
      let side = 0; for (const sg of [1, -1]) { p.copy(a).add(b).add(c).multiplyScalar(1 / 3).addScaledVector(n, sg * 0.3); d.copy(n).multiplyScalar(-sg); const h = S.first(p, d, 0.8); if (h && h.face && h.face.normal.dot(d) < -0.3) { side = sg; break; } }
      if (!side) continue; n.multiplyScalar(side);
      p.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(lo).multiplyScalar(0.3).add(lo); p.y = lo.y; p.addScaledVector(n, 0.3);   // (a little in from the corner: a ray along a wall end misses the wall below)
      const g = GY(p.x, p.z); const gap = lo.y - g; if (gap < 0.3 || gap > 3) continue;
      p.y = g + 0.12; d.copy(n).negate(); if (VS.first(p, d, 0.9)) continue;     // something drawn at the base (plinth, steps, another wall)
      p.y = g + gap * 0.6; if (VS.first(p, d, 0.9)) continue;
      hit(gapCells, p, { m: gap, key });
    }
    if (performance.now() - lastYield > 250) { lastYield = performance.now(); $('status').textContent = `facade sweep ${Math.round(t / VS.nTris * 100)}%`; await tick(); }
  }
  const pack = (cells, min) => [...cells.values()].filter((cl) => cl.n >= min).sort((x, y) => y.worst - x.worst);
  const gb = pack(glassCells, 2), wg = pack(gapCells, 2);
  for (const cl of gb.concat(wg)) marks.push({ kind: 'vis', x0: cl.at[0] - 2, z0: cl.at[2] - 2, x1: cl.at[0] + 2, z1: cl.at[2] + 2 });
  const mk = (id, list, what, counts) => { const res = { status: hilly ? status(list.length, 0) : status(0, list.length), what, counts, failures: hilly ? list.slice(0, 60) : [], warnings: hilly ? [] : list.slice(0, 20).map((w) => JSON.stringify(w)) }; log(`${id}: ${res.status} ${list.length} cells`); finishCheck(id, res); };
  mk('glassBuried', gb, 'Glazing triangles (glass / storefront materials) of the drawn meshes whose lower edge lies more than 0.25 m below the ground 0.35 m in front of them; 4 m cells with >= 2 such triangles. Fails on terrain campuses, warns on flat ones.', { glazingTriangles: nGlass, cells: gb.length, worstM: gb.length ? gb[0].worst : 0 });
  mk('wallGap', wg, 'Wall triangles (stucco / brick / house wall materials, >= 1 m tall) whose foot is 0.3-3 m above the ground 0.3 m in front with nothing drawn below it; 4 m cells with >= 2 such triangles. Fails on terrain campuses, warns on flat ones.', { wallTriangles: nWall, cells: wg.length, worstM: wg.length ? wg[0].worst : 0 });
}
async function checkOverlook() {
  if (!world.terrain || !world.ctfBases) { finishCheck('overlook', { status: 'skip', note: 'flat campus' }); return; }
  const out = {}; const dir = V(), o = V();
  for (const team of ['red', 'blue']) {
    const base = world.ctfBases[team]; const tgt = V(base.x, GY(base.x, base.z) + 1.2, base.z); let cells = 0, best = null; const pts = [];
    for (let z = base.z - TH.overlookR; z <= base.z + TH.overlookR; z += 3) for (let x = base.x - TH.overlookR; x <= base.x + TH.overlookR; x += 3) {
      const d2 = Math.hypot(x - base.x, z - base.z); if (d2 > TH.overlookR || d2 < 8 || !inPB(x, z, 1)) continue; const g = GY(x, z); if (g - (tgt.y - 1.2) < TH.overlookRise) continue;
      if (world.terrain.slopeAt(x, z) > 1) continue;                                             // not standable
      if (S.first(o.set(x, g + 30, z), DOWN, 29.6)) continue;                                    // under / inside something (a roof is its own question)
      o.set(x, g + 1.6, z); dir.subVectors(tgt, o); const L = dir.length(); dir.divideScalar(L);
      if (S.all(o, dir, L - 0.3).some((h) => !/:mesh$/.test(S.surfOf(h)))) continue;             // solid cover in the way (chain-link is not cover)
      let hill = false; for (let t = 1.5; t < L - 1 && !hill; t += 1.5) { const px = o.x + dir.x * t, pz = o.z + dir.z * t; if (GY(px, pz) > o.y + dir.y * t + 0.05) hill = true; } if (hill) continue;
      cells++; pts.push([x, z]); if (!best || g > best[1]) best = [r1(x), r2(g), r1(z), r1(d2)];
    }
    out[team] = { cells, areaM2: cells * 9, highest: best }; for (const [x, z] of pts.slice(0, 200)) marks.push({ kind: 'vis', x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1 });
  }
  const a = out.red.cells, b = out.blue.cells, hi = Math.max(a, b), lo = Math.min(a, b); const warn = hi >= TH.overlookCells && lo < hi / 3;
  const res = { status: status(0, warn ? 1 : 0), what: `CTF base overlooks: open, standable ground within ${TH.overlookR} m of a base, at least ${TH.overlookRise} m above it, with a clear line of sight to the base (terrain and solid colliders block; chain-link does not). Warn when one base has >= ${TH.overlookCells} such 3 m cells and the other less than a third of that.`,
    counts: { redCells: a, blueCells: b, redAreaM2: a * 9, blueAreaM2: b * 9 }, bases: out, failures: [], warnings: warn ? [`${a > b ? 'red' : 'blue'} base is overlooked from ${hi * 9} m2 of high ground (the other: ${lo * 9} m2); highest point ${JSON.stringify((a > b ? out.red : out.blue).highest)}`] : [] };
  log(`overlook: ${res.status} red ${a} / blue ${b} cells`); finishCheck('overlook', res);
}

// ============================================================================================== 5 visible but not solid
async function checkVisualSolid() {
  const vis = scene.getObjectByName('world-visuals');
  const cells = new Map(); let tris = 0, sampled = 0;
  const a = V(), b = V(), c = V(), n = V(), p = V(), e1 = V(), e2 = V();
  const SKIPNAMES = /^(decal|stall-paint|shrubs|static:net|static:chainlink|static:windscreen|static:lightEmit|ground)$|^trees:/;   // (trees:* = hand-built tree crowns, e.g. Hamilton's jacarandas: foliage like the instanced trees)   // (ground: the terrain mesh is its own collision)   // see-through / not walkable-looking
  const meshes = [];
  vis.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible && !SKIPNAMES.test(o.name) && o.geometry?.attributes?.position) meshes.push(o); });
  let lastYield = performance.now();
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.every((mt) => !mt || mt.visible === false || (mt.transparent && mt.opacity < 0.2))) continue;
    const dbl = mats.some((mt) => mt && mt.side === THREE.DoubleSide);
    const key = m.name.startsWith('static:') ? m.name.slice(7) : (m.name || 'mesh');
    const pos = m.geometry.attributes.position, idx = m.geometry.index; const mw = m.matrixWorld;
    const nT = (idx ? idx.count : pos.count) / 3;
    for (let t = 0; t < nT; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mw); b.fromBufferAttribute(pos, i1).applyMatrix4(mw); c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
      const ymax = Math.max(a.y, b.y, c.y); if (ymax - (world.terrain ? Math.min(GY(a.x, a.z), GY(b.x, b.z), GY(c.x, c.z)) : 0) < TH.visMinY || Math.min(a.y, b.y, c.y) > TH.visMaxY) continue;
      e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2); const area2 = n.length(); if (area2 < 0.04) continue; n.divideScalar(area2);
      const ny = dbl ? Math.abs(n.y) : n.y; if (ny < 0.7) continue;
      const L = Math.max(e1.length(), e2.length(), b.distanceTo(c)); if (area2 / L < TH.visMinWidth) continue;   // triangle altitude: sills, copings, rails are too narrow to stand on
      const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3; if (!inPB(cx, cz, -2)) continue;
      tris++;
      const k = Math.max(1, Math.ceil(L / 1.2)); const area = area2 / 2;
      for (let i = 0; i < k; i++) for (let j = 0; j < k - i; j++) {
        for (const up of [0, 1]) {
          if (up && j === k - i - 1) continue;
          const u = up ? (i + 2 / 3) / k : (i + 1 / 3) / k, v = up ? (j + 2 / 3) / k : (j + 1 / 3) / k;
          p.copy(a).addScaledVector(e1, u).addScaledVector(e2, v);
          if (p.y - GY(p.x, p.z) < TH.visMinY || !inPB(p.x, p.z)) continue;
          sampled++;
          const h = S.first(V(p.x, p.y + 0.3, p.z), DOWN, 0.9);
          if (h) continue;
          let lip = false; for (let k = 0; k < 8 && !lip; k++) { const an = k * Math.PI / 4; if (S.first(V(p.x, p.y - 0.3, p.z), V(Math.cos(an), 0, Math.sin(an)), TH.visMinWidth)) lip = true; }
          if (lip) continue;   // overhanging lip / coping edge right next to a solid wall: not a separate standable surface
          const hu = S.first(V(p.x, p.y + 0.05, p.z), UP, 30);
          if (hu && hu.face.normal.y > 0.2) continue;   // inside a closed solid (hit its top from below)
          const ck = Math.floor(p.x) + ',' + Math.floor(p.z) + ',' + Math.round(p.y * 2);
          let cell = cells.get(ck); if (!cell) { cell = { x: Math.floor(p.x), z: Math.floor(p.z), yq: Math.round(p.y * 2), area: 0, ys: 0, n: 0, keys: new Set(), p: [r1(p.x), r2(p.y), r1(p.z)] }; cells.set(ck, cell); }
          cell.area += area / (k * k); cell.ys += p.y; cell.n++; cell.keys.add(key);
        }
      }
      if (performance.now() - lastYield > 250) { lastYield = performance.now(); $('status').textContent = `visual/solid ${key}`; await tick(); }
    }
  }
  // patches: 8-connected cells with |dy| <= 0.5 m
  const seen = new Set(); const patches = [];
  for (const [ck, cell] of cells) {
    if (seen.has(ck)) continue; seen.add(ck);
    const q = [cell]; const pt = { area: 0, n: 0, ys: 0, minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, keys: new Set(), cells: 0, ex: [] };
    for (let h = 0; h < q.length; h++) {
      const cc = q[h]; pt.area += cc.area; pt.n += cc.n; pt.ys += cc.ys; pt.cells++; for (const k of cc.keys) pt.keys.add(k); if (pt.ex.length < 3) pt.ex.push(cc.p);
      pt.minX = Math.min(pt.minX, cc.x); pt.maxX = Math.max(pt.maxX, cc.x + 1); pt.minZ = Math.min(pt.minZ, cc.z); pt.maxZ = Math.max(pt.maxZ, cc.z + 1);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
        const k2 = (cc.x + dx) + ',' + (cc.z + dz) + ',' + (cc.yq + dy); if (seen.has(k2)) continue; const c2 = cells.get(k2); if (!c2) continue; seen.add(k2); q.push(c2);
      }
    }
    patches.push(pt);
  }
  const big = patches.filter((pt) => pt.area >= TH.visPatchArea && pt.cells >= TH.visCellsMin).sort((p, q) => q.area - p.area);
  const failures = big.map((pt) => ({ center: [r1((pt.minX + pt.maxX) / 2), r2(pt.ys / pt.n), r1((pt.minZ + pt.maxZ) / 2)], area: r1(pt.area), bbox: [pt.minX, pt.minZ, pt.maxX, pt.maxZ], materials: [...pt.keys], examples: pt.ex }));
  for (const f of failures) marks.push({ kind: 'vis', x0: f.bbox[0], z0: f.bbox[1], x1: f.bbox[2], z1: f.bbox[3] });
  // hedges / shrubs taller than eye-blocking height with nothing solid under them
  const shrubs = [];
  for (const sh of REG.shrubs || []) {
    const [x, y, z, len, h, rot] = sh; const top = y + h, sg = GY(x, z); if (top - sg <= TH.shrubMaxH) continue;
    const hit = S.first(V(x, top + 0.3, z), DOWN, top + 0.3 - 0.3 - sg);
    if (!hit) { shrubs.push({ at: [r1(x), r2(top), r1(z)], len: r1(len), height: r2(top), rot: r2(rot) }); marks.push({ kind: 'vis', x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1 }); }
  }
  const res = {
    status: status(failures.length + shrubs.length, 0),
    what: `Upward-facing visual faces above ${TH.visMinY} m inside the play area with no collision within 0.6 m below (and not buried in a solid); patches >= ${TH.visPatchArea} m2 fail. Shrubs/hedges taller than ${TH.shrubMaxH} m without collision fail.`,
    counts: { upTriangles: tris, samples: sampled, patches: patches.length, failingPatches: failures.length, failingAreaM2: r1(failures.reduce((s, f) => s + f.area, 0)), tallShrubs: shrubs.length, smallPatchesIgnored: patches.length - big.length },
    failures: failures.slice(0, 60), tallShrubs: shrubs.slice(0, 40),
  };
  log(`visual-not-solid: ${res.status} ${failures.length} patches (${res.counts.failingAreaM2} m2), ${shrubs.length} tall shrubs`);
  finishCheck('visualSolid', res);
}

// ============================================================================================== 5b see-through roofs
// A roof is a thin skin: a face drawn single-sided and seen from behind is simply not drawn, and the sky shows through.
// Two ray tests against the VISUAL meshes (what the renderer draws, back-face culling included):
//  a) exposedBack: every roof-skin triangle (materials TH.roofKeys) is sampled; a side the renderer culls must look
//     into the closed roof (attic), never into open air (reversed winding, the underside of a rake / eave overhang,
//     a vertical step between two roof levels, a canopy without a ceiling).
//  b) open: from points 0.35 m under the skin that are enclosed (inside the attic), rays go out in the TH.roofElev x
//     TH.roofAz directions (from below the eaves up to helicopter height). Each must meet a face that is drawn from
//     outside (front face, double-sided, or a both-windings pair) before it is out from under the roof; fronts of
//     things standing in the attic are stepped over. A ray that gets out unseen is a hole: missing gable / hip end,
//     slit between the gable wall and the rakes, gap between roof planes or between roof and wall top, no soffit.
function buildVisual() {
  const vis = scene.getObjectByName('world-visuals') || scene; const SKIPV = /^(decal|stall-paint|shrubs|ground|ground-skirt|static:(groundDecal|wallDecal|net|chainlink|windscreen|lightEmit))$|^terrain:|^trees:/;
  const meshes = []; let n = 0;
  vis.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || SKIPV.test(o.name) || !o.geometry?.attributes?.position) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((mt) => !mt || mt.visible === false || mt.transparent || mt.alphaTest > 0)) return;   // see-through by design: neither a roof skin nor an occluder
    meshes.push(o); n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count);
  });
  const pos = new Float32Array(n * 3); const triMesh = new Uint16Array(n / 3); const info = []; let o = 0; const v = V();
  for (const m of meshes) {
    const p = m.geometry.attributes.position, idx = m.geometry.index, cnt = idx ? idx.count : p.count; const key = m.name.startsWith('static:') ? m.name.slice(7) : (m.name || 'mesh');
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const mi = info.push({ key, dbl: mats.some((mt) => mt.side === THREE.DoubleSide), roof: TH.roofKeys.test(key) }) - 1;
    for (let i = 0; i < cnt; i++) { v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z; o++; }
    triMesh.fill(mi, (o - cnt) / 3, o / 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bvh = new MeshBVH(g, { indirect: true }); const ray = new THREE.Ray();   // indirect: faceIndex stays the triangle's place in `pos`
  return {
    pos, triMesh, info, nTris: n / 3,
    of: (h) => info[triMesh[h.faceIndex]],
    first(o, d, far) { ray.origin.copy(o); ray.direction.copy(d); return bvh.raycastFirst(ray, THREE.DoubleSide, 0, far); },
    all(o, d, far) { ray.origin.copy(o); ray.direction.copy(d); return bvh.raycast(ray, THREE.DoubleSide, 0, far).sort((a, b) => a.distance - b.distance); },
  };
}
async function checkRoofSkin() {
  const VS = buildVisual(); const { pos, triMesh, info } = VS;
  // probe directions: enclosure (16 level + 8 dipping + up + down) and the viewing directions of test b
  const ENC = []; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; ENC.push(V(Math.cos(a), 0, Math.sin(a))); } for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4; ENC.push(V(Math.cos(a) * 0.94, -0.342, Math.sin(a) * 0.94)); } ENC.push(UP.clone(), DOWN.clone());
  const VIEW = []; for (const el of TH.roofElev) for (let k = 0; k < TH.roofAz; k++) { const a = (k + (el > 40 ? 0.5 : 0)) * Math.PI * 2 / TH.roofAz, e = el * Math.PI / 180; VIEW.push(V(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a))); }
  const maxMiss = Math.floor(ENC.length * (1 - TH.roofEncFrac));
  // inside an attic: nearly every probe ray hits within range, and what they hit (straight up and down included) is roof
  // skin or the back of a face. (Under an eave or a canopy the probes hit the ground and the fronts of walls instead.)
  const enclosed = (q) => {
    let miss = 0, shell = 0;
    for (let i = ENC.length - 1; i >= 0; i--) {
      const h = VS.first(q, ENC[i], TH.roofEncDist); const cap = i >= ENC.length - 2;
      if (!h) { if (cap || ++miss > maxMiss) return false; continue; }
      if (VS.of(h).roof || h.face.normal.dot(ENC[i]) > 0) shell++; else if (cap) return false;
    }
    return shell >= (ENC.length - miss) * 0.75;
  };
  // loosely under a roof: something above, something below, and around in most directions
  const covered = (q) => { let miss = 0; for (let i = ENC.length - 1; i >= 0; i--) if (!VS.first(q, ENC[i], TH.roofEncDist) && (i >= ENC.length - 2 || ++miss > maxMiss)) return false; return true; };
  const tp = V();
  const drawnFrom = (h, d) => VS.of(h).dbl || h.face.normal.dot(d) > 0;   // d: from the face towards the viewer
  const a = V(), b = V(), c = V(), n = V(), p = V(), q = V(), e1 = V(), e2 = V(), dir = V();
  const cells = new Map(); const cnt = { roofTriangles: 0, samples: 0, atticSamples: 0, rays: 0, exposedBack: 0, open: 0 };
  const flag = (kind, at, from, key) => {
    cnt[kind]++; const ck = Math.floor(at.x / 4) + ',' + Math.floor(at.z / 4);
    let cl = cells.get(ck); if (!cl) { cl = { n: 0, kinds: {}, keys: new Set(), at: P3(at), ex: [], minY: 1e9, maxY: -1e9 }; cells.set(ck, cl); }
    cl.n++; cl.kinds[kind] = (cl.kinds[kind] || 0) + 1; cl.keys.add(key); cl.minY = Math.min(cl.minY, at.y); cl.maxY = Math.max(cl.maxY, at.y);
    if (cl.ex.length < 3 && !cl.ex.some((x) => x.kind === kind)) {   // a camera that shows it: dev/world.html?cam=x,y,z,yaw,pitch
      const v = from.clone().sub(at).normalize(); let dist = 9; if (v.y < -0.05) dist = Math.max(1.5, Math.min(9, (at.y - GY(at.x, at.z) - 1.2) / -v.y)); const eye = at.clone().addScaledVector(v, dist);
      cl.ex.push({ kind, at: P3(at), cam: [r1(eye.x), r1(eye.y), r1(eye.z), Math.round(Math.atan2(v.x, v.z) * 180 / Math.PI), Math.round(-Math.asin(v.y) * 180 / Math.PI)].join(',') });
    }
  };
  let lastYield = performance.now();
  for (let t = 0; t < VS.nTris; t++) {
    const mi = info[triMesh[t]]; if (!mi.roof) continue;
    a.fromArray(pos, t * 9); b.fromArray(pos, t * 9 + 3); c.fromArray(pos, t * 9 + 6);
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2); const area2 = n.length(); if (area2 < 0.3) continue; n.divideScalar(area2);
    const L = Math.max(e1.length(), e2.length(), b.distanceTo(c)); if (area2 / L < 0.25) continue;   // ridge / hip cap tubes, thin trims
    if (Math.max(a.y, b.y, c.y) - GY(a.x, a.z) < 1.2 || !inPB(a.x, a.z, -TH.roofMargin)) continue;
    if (n.y < -0.9) { q.copy(a).add(b).add(c).multiplyScalar(1 / 3).addScaledVector(n, -0.35); if (enclosed(q)) continue; }   // soffit closing an attic: its top is never seen
    cnt.roofTriangles++;
    const k = Math.max(1, Math.ceil(Math.sqrt(area2 / 2) / TH.roofSample));   // k * k samples over the triangle
    for (let i = 0; i < k; i++) for (let j = 0; j < k - i; j++) for (const up of [0, 1]) {
      if (up && j === k - i - 1) continue;
      const u = up ? (i + 2 / 3) / k : (i + 1 / 3) / k, w = up ? (j + 2 / 3) / k : (j + 1 / 3) / k;
      p.copy(a).addScaledVector(e1, u).addScaledVector(e2, w); cnt.samples++;
      // a) the culled side must not be exposed
      if (!mi.dbl) {
        q.copy(p).addScaledVector(n, -0.35); dir.copy(n).negate();
        const cover = VS.first(V().copy(p).addScaledVector(n, -0.01), dir, 0.3);   // a ceiling / lining right behind the skin
        if (!(cover && drawnFrom(cover, dir)) && !enclosed(q)) flag('exposedBack', p, q, mi.key);
      }
      // b) from inside the attic outwards
      for (const s of [-1, 1]) {
        q.copy(p).addScaledVector(n, s * 0.35); if (!enclosed(q)) continue; cnt.atticSamples++;
        for (const d of VIEW) {
          cnt.rays++;
          const h0 = VS.first(q, d, TH.roofViewDist);
          if (!h0) { if (d.y >= 0) flag('open', q, V().copy(q).addScaledVector(d, 12), mi.key); continue; }   // (downwards with nothing in the way: the ground)
          if (drawnFrom(h0, d)) continue;
          // The first face shows its front to the attic: something standing in it (a lantern / chimney box, a dormer, the
          // neighbour's cornice). Walk on to the first face that is drawn towards the outside. A front met where the ray
          // is no longer under a roof means the ray got out of the attic unseen.
          const hs = VS.all(q, d, TH.roofViewDist); let sealed = false, out = null;
          for (let m = 0; m < hs.length && !sealed && !out;) {
            let e = m, nOut = 0, nIn = 0;   // faces at one distance are one surface (gable ends are drawn with both windings)
            for (; e < hs.length && hs[e].distance - hs[m].distance < 0.003; e++) { if (drawnFrom(hs[e], d)) nOut++; else nIn++; }
            if (nOut) sealed = true; else if (!covered(tp.copy(q).addScaledVector(d, hs[m].distance - 0.05))) out = hs[m];
            m = e;
          }
          if (out) flag('open', out.point, V().copy(out.point).addScaledVector(d, 12), mi.key);
          else if (!sealed && d.y >= 0) flag('open', q, V().copy(q).addScaledVector(d, 12), mi.key);
        }
        break;   // one attic point per sample
      }
      if (performance.now() - lastYield > 250) { lastYield = performance.now(); $('status').textContent = `roof skin ${Math.round(t / VS.nTris * 100)}%`; await tick(); }
    }
  }
  const all = [...cells.values()].sort((x, y) => y.n - x.n); const bad = all.filter((cl) => cl.n >= TH.roofCellMin);
  const failures = bad.map((cl) => ({ at: cl.at, y: [r1(cl.minY), r1(cl.maxY)], rays: cl.n, kinds: cl.kinds, materials: [...cl.keys], inPlay: inPB(cl.at[0], cl.at[2]), views: cl.ex }));
  for (const f of failures) marks.push({ kind: 'vis', x0: f.at[0] - 2, z0: f.at[2] - 2, x1: f.at[0] + 2, z1: f.at[2] + 2 });
  const res = {
    status: status(failures.length, 0),
    what: `Roof skins (materials ${TH.roofKeys}) against the drawn geometry: (exposedBack) a culled side of a roof face looks into open air; (open) a ray from inside an attic gets out without meeting a face that is drawn from outside (a gap, a missing gable / hip end / soffit, a single-sided face wound inwards). 4 m cells with >= ${TH.roofCellMin} such rays fail; each has camera strings (dev/world.html?cam=) that show it.`,
    counts: { ...cnt, cells: all.length, failingCells: failures.length, failingInPlay: failures.filter((f) => f.inPlay).length, strayRaysIgnored: all.reduce((s, cl) => s + (cl.n < TH.roofCellMin ? cl.n : 0), 0) },
    failures: failures.slice(0, 80),
    strays: all.filter((cl) => cl.n < TH.roofCellMin).slice(0, 12).map((cl) => ({ at: cl.at, rays: cl.n, kinds: cl.kinds, materials: [...cl.keys], views: cl.ex })),   // below the threshold: listed, not failed
  };
  log(`roof skin: ${res.status} ${failures.length} cells (${cnt.exposedBack} exposed backs, ${cnt.open} open rays; ${cnt.atticSamples} attic samples)`);
  finishCheck('roofSkin', res);
}

// ============================================================================================== 6 prop overlaps
function obbCorners(p) { const c = Math.cos(p.rot), s = Math.sin(p.rot); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => { const lx = u * p.sx / 2, lz = w * p.sz / 2; return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]; }); }
function obbOverlap(A, B) {   // SAT penetration depth (> 0 overlapping)
  const ca = obbCorners(A), cb = obbCorners(B); let depth = Infinity;
  for (const P of [A, B]) {
    const c = Math.cos(P.rot), s = Math.sin(P.rot);
    for (const [ax, az] of [[c, -s], [s, c]]) {
      const pa = ca.map((q) => q[0] * ax + q[1] * az), pb = cb.map((q) => q[0] * ax + q[1] * az);
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (o <= 0) return 0; depth = Math.min(depth, o);
    }
  }
  return depth;
}
async function checkProps() {
  const props = REG.props.filter((p) => inPB(p.x, p.z, -30));
  const overlaps = [], trunks = [], near = [];
  for (let i = 0; i < props.length; i++) {
    const A = props[i]; const ra = Math.hypot(A.sx, A.sz) / 2;
    for (let j = i + 1; j < props.length; j++) {
      const B = props[j]; if (Math.hypot(A.x - B.x, A.z - B.z) > ra + Math.hypot(B.sx, B.sz) / 2) continue;
      const d = obbOverlap(A, B);
      if (d > TH.propOverlap) overlaps.push({ a: A.kind, b: B.kind, at: [r1((A.x + B.x) / 2), r1((A.z + B.z) / 2)], depth: r2(d) });
    }
    for (const [tx, tz, tr] of REG.trunks) {
      if (Math.hypot(A.x - tx, A.z - tz) > ra + tr + TH.trunkWarn) continue;
      const d = obbDist(tx, tz, A) - tr;
      if (d < 0) trunks.push({ prop: A.kind, at: [r1(A.x), r1(A.z)], trunk: [r1(tx), r1(tz)], penetration: r2(-d) });
      else if (d < TH.trunkWarn) near.push({ prop: A.kind, at: [r1(A.x), r1(A.z)], trunk: [r1(tx), r1(tz)], gap: r2(d) });
    }
  }
  for (const o of overlaps) marks.push({ kind: 'prop', x: o.at[0], z: o.at[1] });
  for (const o of trunks) marks.push({ kind: 'prop', x: o.at[0], z: o.at[1] });
  const byKind = {}; for (const p of props) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  const res = {
    status: status(overlaps.length + trunks.length, near.length), what: `Registered prop footprints (src/world/props.js registerProp) must not intersect each other (> ${TH.propOverlap} m) or a tree trunk; within ${TH.trunkWarn} m of a trunk = warn.`,
    counts: { props: props.length, byKind, overlaps: overlaps.length, trunkHits: trunks.length, nearTrunk: near.length }, failures: overlaps.concat(trunks).slice(0, 80), nearTrunk: near.slice(0, 40),
  };
  if (!REG.props.length) { res.status = 'warn'; res.note = 'no props registered (builder places props without src/world/props.js helpers)'; }
  log(`props: ${res.status} ${overlaps.length} overlaps, ${trunks.length} on trunks, ${near.length} near trunks`);
  finishCheck('props', res);
}

// ============================================================================================== 7 signs
async function checkSigns() {
  const vis = scene.getObjectByName('world-visuals');
  const decals = []; vis.traverse((o) => { if (o.isMesh && o.material?.map?.userData?.textFit) decals.push(o); });
  // window-ish visual meshes get a temporary BVH
  const WIN = /^(glass|glassInt|curtainGlass|storefront|frame|frameAlu|louver|frost|carGlass)$/;
  const wins = []; vis.traverse((o) => { if (o.isMesh && o.name.startsWith('static:') && WIN.test(o.name.slice(7))) wins.push(o); });
  const winBVH = wins.map((m) => ({ key: m.name.slice(7), bvh: new MeshBVH(m.geometry) }));
  const ray = new THREE.Ray();
  const out = []; let fails = 0, warns = 0;
  for (const m of decals) {
    const fit = m.material.map.userData.textFit; const pos = m.geometry.attributes.position; m.updateWorldMatrix(true, false);
    const P = (i) => V().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    // world-space texture axes from the first triangle's uvs: dP/du (text width) and dP/dv (text height)
    const uv = m.geometry.attributes.uv; const q0 = P(0), q1 = P(1), q2 = P(2);
    const du1 = uv.getX(1) - uv.getX(0), dv1 = uv.getY(1) - uv.getY(0), du2 = uv.getX(2) - uv.getX(0), dv2 = uv.getY(2) - uv.getY(0);
    const det = du1 * dv2 - du2 * dv1 || 1e-9; const e1 = V().subVectors(q1, q0), e2 = V().subVectors(q2, q0);
    const wv = e1.clone().multiplyScalar(dv2 / det).addScaledVector(e2, -dv1 / det);   // dP/du over the full 0..1 range
    const hv = e2.clone().multiplyScalar(du1 / det).addScaledVector(e1, -du2 / det);   // dP/dv
    const w = wv.length(), h = hv.length();
    const p0 = q0.clone().addScaledVector(wv, -uv.getX(0)).addScaledVector(hv, -uv.getY(0));   // world point of uv (0, 0)
    const nrm = V().crossVectors(wv, hv).normalize();   // the side the text reads from
    const flat = Math.abs(nrm.y) > 0.7;                  // ground lettering (fields, courts): no wall / window tests
    const errs = [], wrn = [];
    if (fit.overflowX) errs.push(`text wider than its canvas (${fit.widest} > ${fit.room} px)`);
    if (fit.overflowY) errs.push(`font ${fit.finalFont}px taller than its line band (${Math.round(fit.h / fit.lines.length)} px)`);
    if (fit.shrink < TH.signShrinkWarn) wrn.push(`text shrunk to ${Math.round(fit.shrink * 100)}% to fit`);
    const aspC = fit.w / fit.h, aspQ = w / Math.max(h, 1e-6); const dist = aspQ / aspC;
    if (Math.abs(dist - 1) > TH.signAspectWarn) wrn.push(`stretched ${r2(dist)}x (canvas ${r2(aspC)} vs decal ${r2(aspQ)})`);
    const capH = (fit.finalFont * 0.72 / fit.h) * h; if (capH < TH.signMinCap) wrn.push(`letters ${Math.round(capH * 100)} cm tall`);
    // sample grid on the decal: what is behind it?
    let onWin = 0, unbacked = 0, nS = 0; const winKeys = new Set();
    if (!flat) for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
      const u = (i + 0.5) / 9, v = (j + 0.5) / 3; const q = V().copy(p0).addScaledVector(wv, u).addScaledVector(hv, v); nS++;
      const o = q.clone().addScaledVector(nrm, 0.3); const dir = nrm.clone().negate();
      const back = S.first(o, dir, 1.0); const backD = back ? back.distance : Infinity; if (!back || backD > 0.3 + 0.6) unbacked++;
      ray.origin.copy(o); ray.direction.copy(dir);
      for (const W of winBVH) { const hh = W.bvh.raycastFirst(ray, THREE.DoubleSide, 0, Math.min(1.0, (backD === Infinity ? 0.6 : backD) + 0.35)); if (hh && hh.distance > 0.27) { onWin++; winKeys.add(W.key); break; } }
    }
    if (nS && onWin / nS > TH.signWindowFrac) errs.push(`over windows (${Math.round(onWin / nS * 100)}% of the sign: ${[...winKeys].join(', ')})`);
    if (nS && unbacked / nS > 0.3) wrn.push(`not backed by a wall (${Math.round(unbacked / nS * 100)}%)`);
    if (errs.length) fails++; else if (wrn.length) warns++;
    const c = V().copy(p0).addScaledVector(wv, 0.5).addScaledVector(hv, 0.5);
    out.push({ text: fit.lines.join(' / '), at: P3(c), size: [r2(w), r2(h)], flat, errors: errs, warnings: wrn });
    if (errs.length || wrn.length) marks.push({ kind: 'sign', bad: errs.length > 0, x: c.x, z: c.z });
  }
  const res = { status: status(fails, warns), what: 'Every textDecal sign: text fits its canvas (no overflow), not shrunk below ' + TH.signShrinkWarn * 100 + '% (warn), not stretched > ' + TH.signAspectWarn * 100 + '% (warn), letters >= ' + TH.signMinCap * 100 + ' cm (warn), not over windows (> ' + TH.signWindowFrac * 100 + '% of samples hit glass / frames behind it), backed by a wall.', counts: { signs: decals.length, failing: fails, warning: warns }, failures: out.filter((o) => o.errors.length || o.warnings.length), signs: out };
  log(`signs: ${res.status} ${decals.length} signs, ${fails} failing, ${warns} warnings`);
  finishCheck('signs', res);
}

// ============================================================================================== 8 boundary
async function checkBoundary() {
  const edges = [
    { name: 'north', a: [PB.minX, PB.minZ], b: [PB.maxX, PB.minZ], n: [0, 1] },
    { name: 'south', a: [PB.minX, PB.maxZ], b: [PB.maxX, PB.maxZ], n: [0, -1] },
    { name: 'west', a: [PB.minX, PB.minZ], b: [PB.minX, PB.maxZ], n: [1, 0] },
    { name: 'east', a: [PB.maxX, PB.minZ], b: [PB.maxX, PB.maxZ], n: [-1, 0] },
  ];
  const segs = []; let reachable = 0, open = 0;
  for (const E of edges) {
    const L = Math.hypot(E.b[0] - E.a[0], E.b[1] - E.a[1]); const tx = (E.b[0] - E.a[0]) / L, tz = (E.b[1] - E.a[1]) / L;
    let cur = null;
    const flush = () => { if (cur) { segs.push(cur); cur = null; } };
    for (let d = TH.boundaryStep / 2; d < L; d += TH.boundaryStep) {
      const x = E.a[0] + tx * d, z = E.a[1] + tz * d;
      const ix = x + E.n[0] * 2.5, iz = z + E.n[1] * 2.5;
      if (!nearWalk(ix, iz)) { flush(); continue; }
      reachable++;
      let barrier = false;
      // the ray runs from the walkable ground nearest the edge on this line (at least 3 m in) to 2 m outside: with a fixed
      // 3 m start, a building whose wall stands 3-5 m inside the edge was behind the ray origin and read as "open"
      let d0 = 3; for (let dd = 0.75; dd <= 5.75; dd += 0.25) if (navOK(x + E.n[0] * dd, z + E.n[1] * dd)) { d0 = Math.max(3, dd); break; }
      const bg = GY(x + E.n[0] * d0, z + E.n[1] * d0);
      // (terrain: the rays run parallel to the ground from the start to 2 m outside, or a fence up a steep lane is missed)
      const og = GY(x - E.n[0] * 2, z - E.n[1] * 2), bdir = V(-E.n[0] * (d0 + 2), og - bg, -E.n[1] * (d0 + 2)), blen = bdir.length(); bdir.divideScalar(blen);
      for (const y of [0.5, 1.0, 1.6]) if (S.first(V(x + E.n[0] * d0, bg + y, z + E.n[1] * d0), bdir, blen)) { barrier = true; break; }
      if (!barrier) barrier = REG.trunks.some((t) => Math.hypot(t[0] - x, t[1] - z) < 4);
      if (barrier) { flush(); continue; }
      open++;
      const surf = world.surfaceAt ? world.surfaceAt(x + E.n[0], z + E.n[1]) : 'grass';
      if (!cur || cur.edge !== E.name) cur = { edge: E.name, from: [r1(x), r1(z)], to: [r1(x), r1(z)], len: 0, surf: {} };
      cur.to = [r1(x), r1(z)]; cur.len += TH.boundaryStep; cur.surf[surf] = (cur.surf[surf] || 0) + 1;
    }
    flush();
  }
  for (const s of segs) { const tot = Object.values(s.surf).reduce((a, b) => a + b, 0); s.street = (s.surf.asphalt || 0) / tot >= 0.5; s.main = Object.entries(s.surf).sort((a, b) => b[1] - a[1])[0][0]; }
  const street = segs.filter((s) => s.street && s.len >= TH.boundaryStreetWarn);
  for (const s of segs) marks.push({ kind: 'edge', street: s.street, x0: s.from[0], z0: s.from[1], x1: s.to[0], z1: s.to[1] });
  const res = {
    status: street.length ? 'warn' : 'pass', what: `Play-area edge sampled every ${TH.boundaryStep} m where the player can walk up to it: no collider (fence, wall, barrier) between the nearest walkable ground (3 m inside or more) and 2 m outside at 0.5-1.6 m and no tree trunk within 4 m = open edge (invisible wall). Open edges on asphalt >= ${TH.boundaryStreetWarn} m = "stopped mid-street" warning. Flag only, never fails.`,
    counts: { reachablePoints: reachable, openPoints: open, openSegments: segs.length, streetSegments: street.length, streetMetres: street.reduce((a, s) => a + s.len, 0) },
    failures: street.map((s) => ({ edge: s.edge, from: s.from, to: s.to, len: s.len, surface: s.main })), otherOpen: segs.filter((s) => !street.includes(s)).map((s) => ({ edge: s.edge, from: s.from, to: s.to, len: s.len, surface: s.main })).slice(0, 40),
  };
  log(`boundary: ${res.status} ${street.length} open street segments (${res.counts.streetMetres} m), ${segs.length} open segments total`);
  finishCheck('boundary', res);
}

// ============================================================================================== 9 bots
async function checkBots() {
  const realNow = performance.now.bind(performance), realRandom = Math.random;
  let vt = realNow(); const rng = mulberry32(1234);
  performance.now = () => vt; Math.random = rng;
  const events = [], stats = [];
  try {
    const { Authority } = await import('../src/game/authority.js');
    const auth = new Authority({ world, mode: 'ffa', out: () => {} });
    auth.bots.configure({ count: TH.botCount, difficulty: 'normal' });
    const trackers = [];
    for (const b of auth.bots.brains.values()) {
      if (!b.ctrl) continue;
      const tr = { b, intent: 0, anchor: b.ctrl.position.clone(), intentT: 0, reported: null, dist: 0, last: b.ctrl.position.clone(), maxStill: 0, deaths: 0 };
      const orig = b.ctrl.update.bind(b.ctrl);
      b.ctrl.update = (dt, input, opts) => { tr.intent = Math.hypot(input.forward || 0, input.strafe || 0); return orig(dt, input, opts); };
      trackers.push(tr);
    }
    const steps = Math.round(TH.botTime / DT); let lastYield = realNow();
    for (let s = 0; s < steps; s++) {
      vt += DT * 1000;
      auth.update(DT);
      for (const tr of trackers) {
        const b = tr.b, p = b.ctrl.position;
        const jump = p.distanceTo(tr.last); if (jump > 5) { tr.anchor.copy(p); tr.intentT = 0; tr.reported = null; } else tr.dist += jump; tr.last.copy(p);
        if (!b.p.alive || b.p.inHeli || b.pilot) { tr.anchor.copy(p); tr.intentT = 0; tr.reported = null; tr.intent = 0; continue; }
        if (Math.hypot(p.x - tr.anchor.x, p.z - tr.anchor.z) > TH.botMoveRadius || Math.abs(p.y - tr.anchor.y) > 1.5) { tr.anchor.copy(p); tr.intentT = 0; tr.reported = null; continue; }
        const busy = b.visible || b.mob?.state === 'perch';
        if (tr.intent > 0.3 && !busy) tr.intentT += DT;
        tr.maxStill = Math.max(tr.maxStill, tr.intentT);
        if (tr.intentT > TH.botStuck && !tr.reported) { tr.reported = { bot: b.p.name, at: P3(p), t: r1(s * DT), mobState: b.mob?.state || null, goal: b.goal ? P3(b.goal) : null, onRoof: p.y - GY(p.x, p.z) > 0.6 }; events.push(tr.reported); marks.push({ kind: 'bot', x: p.x, z: p.z }); }
        if (tr.reported) tr.reported.stuckFor = r1(tr.intentT);
      }
      if (realNow() - lastYield > 250) { lastYield = realNow(); $('status').textContent = `bots ${r1(s * DT)} / ${TH.botTime} s`; await tick(); }
    }
    for (const tr of trackers) stats.push({ bot: tr.b.p.name, cls: tr.b.p.cls, kills: tr.b.p.kills, deaths: tr.b.p.deaths, travelled: Math.round(tr.dist), longestStillWithIntent: r1(tr.maxStill), unstuckPops: tr.b.ctrl._stuck?.count || 0 });
  } finally { performance.now = realNow; Math.random = realRandom; }
  const pops = stats.reduce((a, b2) => a + b2.unstuckPops, 0);
  const res = { status: status(0, events.length + pops), what: `${TH.botCount} normal bots, FFA, ${TH.botTime} s (seeded, virtual clock): any bot within ${TH.botMoveRadius} m of the same spot for > ${TH.botStuck} s while trying to move (not fighting, not perched) is logged. The controller's stuck safety net firing (unstuckPops) is also a warning: a bot got wedged somewhere. Warn only.`, counts: { bots: stats.length, stuckEvents: events.length, unstuckPops: pops }, failures: events, bots: stats };
  log(`bots: ${res.status} ${events.length} stuck events`);
  finishCheck('bots', res);
}

// ---------------------------------------------------------------------------------------------- summary + image
function renderSummary() {
  const order = ['escape', 'roofVoids', 'ladders', 'spawns', 'heli', 'terrain', 'houses', 'retaining', 'mounds', 'roads', 'overlook', 'seating', 'interior', 'glassBuried', 'wallGap', 'visualSolid', 'roofSkin', 'props', 'signs', 'boundary', 'bots'];
  const lines = [];
  for (const id of order) {
    const c = report.checks[id]; if (!c) continue;
    lines.push(`<span class="${c.status}">${c.status.toUpperCase().padEnd(5)}</span> ${id.padEnd(12)} ${Object.entries(c.counts || {}).filter(([, v]) => typeof v !== 'object' || v === null).map(([k, v]) => k + '=' + v).join('  ')}`);
    const fl = (c.errors || []).concat(c.warnings || []).map((e) => '      - ' + e);
    for (const f of (c.failures || []).slice(0, 8)) fl.push('      · ' + JSON.stringify(f));
    if ((c.failures || []).length > 8) fl.push(`      … ${c.failures.length - 8} more in the JSON`);
    lines.push(...fl.map((l) => l.replace(/</g, '&lt;')));
  }
  $('summary').innerHTML = lines.join('\n');
}
async function drawMap() {
  const s = 2; const W = Math.round((PB.maxX - PB.minX) * s), H = Math.round((PB.maxZ - PB.minZ) * s);
  const cv = $('map'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const X = (x) => (x - PB.minX) * s, Z = (z) => (z - PB.minZ) * s;
  try {
    const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = './' + CAMPUS.files.satellite; });   // (decode() can stall in a hidden tab)
    const sat = CAMPUS.sat; const sx = img.width / (sat.maxX - sat.minX), sz = img.height / (sat.maxZ - sat.minZ);
    g.globalAlpha = 0.55; g.drawImage(img, (PB.minX - sat.minX) * sx, (PB.minZ - sat.minZ) * sz, (PB.maxX - PB.minX) * sx, (PB.maxZ - PB.minZ) * sz, 0, 0, W, H); g.globalAlpha = 1;
  } catch (e) { g.fillStyle = '#222'; g.fillRect(0, 0, W, H); }
  const X8 = (x, z, col, r = 5, lw = 2) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(X(x) - r, Z(z) - r); g.lineTo(X(x) + r, Z(z) + r); g.moveTo(X(x) + r, Z(z) - r); g.lineTo(X(x) - r, Z(z) + r); g.stroke(); };
  for (const m of marks) {
    if (m.kind === 'vis') { g.fillStyle = 'rgba(255,0,255,0.55)'; g.fillRect(X(m.x0), Z(m.z0), (m.x1 - m.x0) * s, (m.z1 - m.z0) * s); }
    else if (m.kind === 'edge') { g.strokeStyle = m.street ? '#ff8800' : 'rgba(255,200,120,0.6)'; g.lineWidth = m.street ? 5 : 2; g.beginPath(); g.moveTo(X(m.x0), Z(m.z0)); g.lineTo(X(m.x1), Z(m.z1)); g.stroke(); }
  }
  for (const m of marks) {
    if (m.kind === 'trap') X8(m.x, m.z, '#ff2020', 7, 3);
    else if (m.kind === 'trapDrop') X8(m.x, m.z, '#ff9020', 6, 3);
    else if (m.kind === 'fell') X8(m.x, m.z, '#ffffff', 6, 2);
    else if (m.kind === 'ladderOk' || m.kind === 'ladderBad') { g.fillStyle = m.kind === 'ladderOk' ? '#3f3' : '#f33'; g.fillRect(X(m.x) - 4, Z(m.z) - 4, 8, 8); }
    else if (m.kind === 'spawn') { g.fillStyle = m.group === 'ffa' ? '#3ff' : m.group; g.beginPath(); g.arc(X(m.x), Z(m.z), 3, 0, 7); g.fill(); if (m.bad) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(X(m.x), Z(m.z), 7, 0, 7); g.stroke(); } }
    else if (m.kind === 'base') { g.strokeStyle = m.team; g.lineWidth = 3; g.strokeRect(X(m.x) - 8, Z(m.z) - 8, 16, 16); }
    else if (m.kind === 'heli') { g.strokeStyle = m.bad ? '#f33' : '#3f3'; g.lineWidth = 2; g.beginPath(); g.arc(X(m.x), Z(m.z), 8 * s, 0, 7); g.stroke(); }
    else if (m.kind === 'prop') X8(m.x, m.z, '#ffff00', 5, 2);
    else if (m.kind === 'sign') { g.fillStyle = m.bad ? '#ffcc00' : 'rgba(255,204,0,0.5)'; g.fillRect(X(m.x) - 5, Z(m.z) - 3, 10, 6); }
    else if (m.kind === 'slope') X8(m.x, m.z, m.bad ? '#ff2020' : '#ff9020', 6, 3);
    else if (m.kind === 'propSlope') X8(m.x, m.z, m.bad ? '#ff00ff' : '#ff88ff', 5, 2);
    else if (m.kind === 'bot') { g.strokeStyle = '#b060ff'; g.lineWidth = 3; g.beginPath(); g.arc(X(m.x), Z(m.z), 6, 0, 7); g.stroke(); }
  }
  window.__mapcheckImage = () => cv.toDataURL('image/png');
}

// ---------------------------------------------------------------------------------------------- run
const CHECKS = [['spawns', checkSpawns], ['ladders', checkLadders], ['heli', checkHeli], ['terrain', checkTerrain], ['houses', checkHouses], ['retaining', checkRetaining], ['mounds', checkMounds], ['roads', checkRoads], ['overlook', checkOverlook], ['seating', checkSeating], ['interior', checkInterior], ['facadeSweep', checkFacadeSweep], ['props', checkProps], ['signs', checkSigns], ['boundary', checkBoundary], ['visualSolid', checkVisualSolid], ['roofSkin', checkRoofSkin], ['escape', checkEscape], ['roofVoids', checkRoofVoids], ['bots', checkBots]];
for (const [id, fn] of CHECKS) {
  if (!enabled(id)) { report.checks[id] = { status: 'skip' }; continue; }
  $('status').textContent = id + '…'; await tick();
  const ts = performance.now();
  try { await fn(); } catch (e) { console.error(e); report.checks[id] = { status: 'fail', error: String(e && e.stack || e) }; log(`${id}: ERROR ${e}`); renderSummary(); }
  if (report.checks[id]) report.checks[id].seconds ??= r1((performance.now() - ts) / 1000);
}
const sts = Object.values(report.checks).map((c) => c.status);
report.pass = !sts.includes('fail');
report.verdict = sts.includes('fail') ? 'fail' : sts.includes('warn') ? 'warn' : 'pass';
report.durationS = r1((performance.now() - t0) / 1000);
report.summary = Object.fromEntries(Object.entries(report.checks).map(([k, c]) => [k, c.status]));
$('verdict').textContent = report.verdict.toUpperCase() + ' (' + report.durationS + ' s)'; $('verdict').className = report.verdict;
$('status').textContent = '';
renderSummary();
await drawMap();
const blob = new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' });
$('links').innerHTML = `<a download="mapcheck-${CAMPUS.id}.json" href="${URL.createObjectURL(blob)}">report.json</a> · <a download="mapcheck-${CAMPUS.id}.png" href="${$('map').toDataURL('image/png')}">map.png</a>`;
console.log('[mapcheck] ' + CAMPUS.id + ' ' + report.verdict + ' ' + JSON.stringify(report.summary));
window.__mapcheckDone = true;
