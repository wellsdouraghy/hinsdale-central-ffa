// Bot movement sim: headless, seeded, virtual-clock bot matches on the real world + real controller, measuring where bots
// stall, bump into geometry, walk into each other or oscillate. Fast-forwards (no rendering).
//   dev/botsim.html?campus=hinsdale&runs=ffa,ctf:attack,ctf:defend,ctf:escort,ctf:auto&bots=8&time=180&seed=1234
// Result: window.__botsim ({ campus, runs: [{ run, summary, clusters, ... }] }), window.__botsimDone, and a top-down map.
//
// Definitions (per bot, 60 Hz steps; "intent" = the brain asks the controller to move, not fighting, not perched, not
// riding a grapple / mantling / on a ladder, not capturing a care package):
//   stall        intent for > 2 s without leaving a 1 m circle (event; > 5 s = long, > 12 s = map-check stuck)
//   bump         on the ground with intent, < 30 % of the expected speed for >= 0.3 s (walking into something)
//   contact      two live bots closer than 0.8 m (pair event)
//   oscillation  6 s of intent, > 12 m walked, < 2.5 m net displacement (circling / ping-pong between waypoints)
//   pop          the controller's stuck safety net moved the bot (player._stuckWatch)
//   stuck        sliding window: 2 s of continuous intent with < 1.5 m net displacement (catches jitter / back-and-forth
//                against an obstacle that the anchor-based stall misses) and < 3 m walked in all (turning round for
//                the next goal is not being stuck); one event per episode, > 5 s = long
import * as THREE from 'three';
import { createWorld } from '../src/world/index.js';
import { getCampus, setActiveCampus } from '../src/campuses/index.js';
import { mulberry32 } from '../src/world/util.js';

const qs = new URLSearchParams(location.search);
const num = (k, d) => (qs.has(k) && Number.isFinite(+qs.get(k)) ? +qs.get(k) : d);
const CAMPUS = getCampus(qs.get('campus') || 'hinsdale');
setActiveCampus?.(CAMPUS.id);
const RUNS = (qs.get('runs') || 'ffa,ctf:attack,ctf:defend,ctf:escort').split(',');
const BOTS = num('bots', 8), TIME = num('time', 180), SEED = num('seed', 1234);
const DT = 1 / 60;
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const $ = (id) => document.getElementById(id);
const tick = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
$('campus').textContent = CAMPUS.name + ' (' + CAMPUS.id + ')';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(320, 180);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 3000);
const world = await createWorld({ renderer, scene, camera, campus: CAMPUS, settings: { quality: 'low' }, onProgress: (f, l) => { $('status').textContent = Math.round(f * 100) + '% ' + l; } });
scene.updateMatrixWorld(true);
window.__world = world;
const GY = world.groundY || (() => 0);
const { Authority } = await import('../src/game/authority.js');
const out = { campus: CAMPUS.id, bots: BOTS, time: TIME, seed: SEED, runs: [] };
window.__botsim = out; window.__botsimDone = false;
const marks = [];

// &probe=x,z;x,z: what is at these points (downward hits, knee / chest hits around, nav, clearance), then stop.
if (qs.has('probe')) {
  const rc = new THREE.Raycaster();
  const { navFor } = await import('../src/game/bots/nav.js');
  const nav = navFor(world);
  out.probe = qs.get('probe').split(';').map((s) => {
    const [x, z] = s.split(',').map(Number);
    rc.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0)); rc.far = 80;
    const down = rc.intersectObjects(world.collisionMeshes, false).map((h) => [r2(h.point.y), h.object.userData.surface]);
    const around = [];
    for (let k = 0; k < 8; k++) for (const y of [0.6, 1.3]) {
      const a = k * Math.PI / 4, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      rc.set(new THREE.Vector3(x, GY(x, z) + y, z), d); rc.far = 3;
      const h = rc.intersectObjects(world.collisionMeshes, false)[0];
      if (h) around.push([k * 45, y, r2(h.distance), h.object.userData.surface]);
    }
    return { x, z, gy: r2(GY(x, z)), nav: nav.walkableAt(x, z), clr: nav.clearAt(x, z), down, around };
  });
  window.__botsimDone = true;
  throw new Error('probe done');
}

for (const run of RUNS) {
  const [mode, order = 'auto'] = run.split(':');
  $('status').textContent = run + '…';
  const res = await simulate(mode, order);
  out.runs.push(res);
  render();
  $('summary').textContent = out.runs.map(fmt).join('\n\n');
}
window.__botsimDone = true;
$('status').textContent = 'done';
console.log('[botsim] ' + JSON.stringify(out.runs.map((r) => ({ run: r.run, ...r.summary }))));

function fmt(r) {
  const s = r.summary;
  const lines = [`== ${r.run}  (${s.botMinutes} bot-min, sim ${r.simS} s in ${r.realS} s real)`,
    `stuck(2s window) ${s.stuck} (${s.stuckPerBotMin}/bot-min) >5s ${s.stuckLong} ${s.stuckSec} s`,
    `stalls>2s ${s.stalls} (${s.stallsPerBotMin}/bot-min)  >5s ${s.long5}  >12s ${s.long12}  stalled ${s.stallSeconds} s total (${s.stallPct} % of intent time)`,
    `bumps ${s.bumps} (${s.bumpsPerBotMin}/bot-min)  contacts ${s.contacts} (${s.contactsPerBotMin}/bot-min)  oscillations ${s.oscillations}  pops ${s.pops}  brainUnstuck ${s.brainUnstuck}  roofStalls ${s.roofStalls}  fellOut ${s.fellOut}`,
    `travelled ${s.travelled} m (${s.speedAvg} m/s while intending)  caps ${JSON.stringify(s.caps || null)}`,
    'top stall spots (5 m cells): ' + r.clusters.slice(0, 12).map((c) => `[${c.x},${c.z}${c.roof ? ' roof' : ''}] n${c.n} ${c.sec}s ${c.state}`).join('  '),
    'top bump spots: ' + r.bumpClusters.slice(0, 10).map((c) => `[${c.x},${c.z}] n${c.n}`).join('  '),
    'bump causes: ' + JSON.stringify(r.bumpWhy),
    'top hop (brain unstuck) spots: ' + r.hopClusters.slice(0, 10).map((c) => `[${c.x},${c.z}] n${c.n}`).join('  ')];
  return lines.join('\n');
}

async function simulate(mode, order) {
  const realNow = performance.now.bind(performance), realRandom = Math.random;
  let vt = realNow(); const rng = mulberry32(SEED);
  performance.now = () => vt; Math.random = rng;
  const t0 = realNow();
  const pf = { n: 0, ms: 0, max: 0, slow: 0 }; const fells = [], stalls = [], stucks = [], bumps = [], contacts = [], oscs = [], pops = [], hops = [];
  let fellOut = 0, brainUnstuck = 0, botSec = 0, intentSec = 0, intentDist = 0, travelled = 0;
  let auth;
  try {
    auth = new Authority({ world, mode: mode === 'ctf' ? 'ctf' : 'ffa', practice: true, out: () => {} });
    let human = null, hPath = null, hI = 0;
    if (mode === 'ctf') {
      if (order === 'escort') {
        human = auth.addPlayer(999, 'Human', { team: 'red' });
        human.ready = true; human.everReady = true; auth.spawn(human);
      }
      auth.bots.configure({ count: 0, difficulty: 'normal', red: human ? BOTS / 2 - 1 : BOTS / 2, blue: BOTS / 2 });
      auth.bots.setOrder('red', order, human ? human.id : null);
      auth.bots.setOrder('blue', order === 'escort' ? 'auto' : order, null);
    } else auth.bots.configure({ count: BOTS, difficulty: 'normal' });
    const nav = auth.bots.nav;
    // path search cost (real time)
    const fpOrig = nav.findPath; nav.findPath = function (...a) { const t0 = realNow(); const r = fpOrig.apply(this, a); const d = realNow() - t0; pf.n++; pf.ms += d; if (d > pf.max) pf.max = d; if (d > 4) pf.slow++; return r; };
    if (nav.clr) { window.__clr = nav.clr; out.clearanceMs = nav.clr.buildMs; out.clearanceTris = nav.clr.tris; }
    const trs = [];
    for (const b of auth.bots.brains.values()) {
      if (!b.ctrl) continue;
      const tr = { b, intent: 0, anchor: b.ctrl.position.clone(), intentT: 0, ev: null, last: b.ctrl.position.clone(), hist: [], blockT: 0, blockEv: false, pops: 0, stuckC: 0, life: b.p.life };
      const orig = b.ctrl.update.bind(b.ctrl);
      b.ctrl.update = (dt, input, opts) => { tr.intent = Math.hypot(input.forward || 0, input.strafe || 0); tr.moveMult = opts?.moveMult ?? 1; tr.sprint = !!input.sprint; const sy = Math.sin(b.ctrl.yaw), cy = Math.cos(b.ctrl.yaw); tr.wx = -sy * (input.forward || 0) + cy * (input.strafe || 0); tr.wz = -cy * (input.forward || 0) - sy * (input.strafe || 0); return orig(dt, input, opts); };
      trs.push(tr);
    }
    const pairs = new Map();
    const steps = Math.round(TIME / DT); let lastYield = realNow();
    for (let s = 0; s < steps; s++) {
      vt += DT * 1000;
      const T = s * DT;
      // scripted human for the escort order: walks nav paths between random points at walking speed
      if (human && human.alive) {
        if (!human.pos) human.pos = [0, 0, 0];
        if (!hPath || hI >= hPath.length) { hPath = nav.findPath(new THREE.Vector3(...human.pos), nav.randomPoint()); hI = 0; }
        if (hPath && hI < hPath.length) {
          const w = hPath[hI], dx = w.x - human.pos[0], dz = w.z - human.pos[2], d = Math.hypot(dx, dz);
          if (d < 0.5) hI++; else { const k = Math.min(d, 4.5 * DT) / d; human.pos = [human.pos[0] + dx * k, GY(human.pos[0] + dx * k, human.pos[2] + dz * k), human.pos[2] + dz * k]; }
        }
      }
      for (const tr of trs) tr.intent = 0;
      auth.update(DT);
      if (auth.state !== 'playing') break;
      for (const tr of trs) {
        const b = tr.b, c = b.ctrl, p = c.position;
        const jump = Math.hypot(p.x - tr.last.x, p.z - tr.last.z);
        const respawned = b.p.life !== tr.life; tr.life = b.p.life;
        if (jump > 4 && !respawned && b.p.alive && !c.grapple && !b.p.inHeli && !b.pilot) { fellOut++; fells.push({ from: [r1(tr.last.x), r1(tr.last.y), r1(tr.last.z)], to: [r1(p.x), r1(p.y), r1(p.z)], t: r1(T), ms: b.mob?.state, heli: !!b.p.inHeli, pilot: !!b.pilot, fin: !!auth.finishers?.has(b.p.id) }); }
        const pc = c._stuck?.count || 0;
        if (pc > tr.pops) { pops.push({ x: p.x, z: p.z, t: T }); tr.pops = pc; }
        if ((b.stuckCount || 0) > tr.stuckC) { brainUnstuck++; hops.push({ pre: hops.length < 80 ? tr.hist.slice(-48).filter((h, i) => i % 4 === 0).map((h) => [r1(h[0]), r1(h[1]), r2(h[4]), r2(h[5]), r1(h[6]), r1(h[7]), h[8], r2(h[9])]) : null, x: r1(p.x), y: r2(p.y - GY(p.x, p.z)), z: r1(p.z), t: r1(T), n: b.stuckCount, ms: b.mob?.state, role: b.role, path: b.path ? b.path.length - b.pathI : null, gd: b.goal ? r1(Math.hypot(b.goal.x - p.x, b.goal.z - p.z)) : null, nav: nav.walkableAt(p.x, p.z), clr: nav.clearAt ? r2(nav.clearAt(p.x, p.z)) : null, ...probe(b, tr, nav, auth.bots.hitscan) }); }
        tr.stuckC = b.stuckCount || 0;
        if (jump > 4 || respawned) { tr.anchor.copy(p); tr.intentT = 0; tr.ev = null; tr.s2 = null; tr.hist.length = 0; tr.last.copy(p); continue; }
        travelled += jump;
        tr.last.copy(p);
        if (!b.p.alive || b.p.inHeli || b.pilot) { tr.anchor.copy(p); tr.intentT = 0; tr.ev = null; tr.s2 = null; tr.intent = 0; tr.hist.length = 0; continue; }
        botSec += DT;
        const ms = b.mob?.state || 'idle';
        const busy = b.visible || ms === 'perch' || ms === 'aim' || ms === 'reel' || c.grapple || c.mantle || c.ladder || (b.crate && b.crate.capT != null) || (auth.finishers?.has(b.p.id));
        const intending = tr.intent > 0.3 && !busy;
        if (intending) { intentSec += DT; intentDist += jump; }
        // stall
        if (Math.hypot(p.x - tr.anchor.x, p.z - tr.anchor.z) > 1.0 || Math.abs(p.y - tr.anchor.y) > 1.0) { tr.anchor.copy(p); tr.intentT = 0; tr.ev = null; }
        else if (intending) {
          tr.intentT += DT;
          if (tr.intentT > 2 && !tr.ev) {
            const elev = p.y - GY(p.x, p.z);
            tr.ev = { bot: b.p.name, x: r1(p.x), y: r2(p.y), z: r1(p.z), t: r1(T), state: ms, roof: elev > 1.5, nav: nav.walkableAt(p.x, p.z), goal: b.goal ? [r1(b.goal.x), r1(b.goal.z)] : null, role: b.role, dur: 0, path: b.path ? b.path.length - b.pathI : null };
            stalls.push(tr.ev);
          }
          if (tr.ev) tr.ev.dur = r1(tr.intentT);
        }
        // bump: grounded, intending, slow vs expected
        const expect = (tr.sprint && c.sprinting ? 7.5 : c.crouching ? 2.5 : 5) * (tr.moveMult || 1) * Math.min(1, tr.intent);
        if (intending && c.grounded && c.dashT <= 0 && expect > 1 && jump / DT < 0.3 * expect) {
          tr.blockT += DT;
          if (tr.blockT >= 0.3 && !tr.blockEv) { tr.blockEv = true; bumps.push({ x: p.x, z: p.z, t: T, ...probe(b, tr, nav, auth.bots.hitscan) }); }
        } else { tr.blockT = 0; tr.blockEv = false; }
        // oscillation
        tr.hist.push([p.x, p.z, intending ? 1 : 0, jump, tr.wx || 0, tr.wz || 0, c.velocity.x, c.velocity.z, c.grounded ? 1 : 0, tr.intent, b.goal ? r1(b.goal.x) : null, b.goal ? r1(b.goal.z) : null, b.path ? b.pathI + '/' + b.path.length : '-', b.path && b.pathI < b.path.length ? r1(b.path[b.pathI].x) + ',' + r1(b.path[b.pathI].z) : '', b.unstuckT > 0 ? 'U' : '', b.lastSeenT != null ? r1(T - b.lastSeenT) : '']);
        if (tr.hist.length > 360) tr.hist.shift();
        // sliding-window stuck
        {
          const H = tr.hist, n = H.length;
          let C = n >= 120;
          if (C) { for (let q = n - 120; q < n; q++) if (!H[q][2]) { C = false; break; } }
          if (C) { const h0 = H[n - 120]; C = Math.hypot(p.x - h0[0], p.z - h0[1]) < 1.5; }
          // (and under 3 m walked in all: arriving somewhere and walking back out for the next place is a decision, not
          // being stuck; ping-pong with a bigger swing is the oscillation metric)
          if (C) { let L = 0; for (let q = n - 120; q < n; q++) L += H[q][3]; C = L < 3; }
          if (C && !tr.s2) { tr.s2 = { bot: b.p.name, x: r1(p.x), z: r1(p.z), y: r2(p.y - GY(p.x, p.z)), t: r1(T), dur: 2, state: ms, role: b.role, ...probe(b, tr, nav, auth.bots.hitscan), pre: stucks.length < 120 ? H.slice(-120).filter((h, i) => i % 12 === 0).map((h) => [r1(h[0]), r1(h[1]), r2(h[4]), r2(h[5]), r1(h[6]), r1(h[7]), h[8], r2(h[9]), h[10], h[11], h[12], h[13], h[14], h[15]]) : null, cls: b.p.cls, gun: b.gun?.id, crouch: !!c.crouching, mm: r2(tr.moveMult || 1) }; stucks.push(tr.s2); }
          else if (C) tr.s2.dur = r1(tr.s2.dur + DT);
          else tr.s2 = null;
        }
        if (tr.hist.length === 360 && (tr.oscT === undefined || T - tr.oscT > 6)) {
          let all = true, L = 0;
          for (const h of tr.hist) { if (!h[2]) { all = false; break; } L += h[3]; }
          const h0 = tr.hist[0];
          if (all && L > 12 && Math.hypot(p.x - h0[0], p.z - h0[1]) < 2.5) { oscs.push({ x: p.x, z: p.z, t: T, bot: b.p.name, L: r1(L), role: b.role, ms, vis: !!b.visible, goal: b.goal ? [r1(b.goal.x), r1(b.goal.z)] : null, gd: b.goal ? r1(Math.hypot(b.goal.x - p.x, b.goal.z - p.z)) : null, path: b.path ? b.path.length - b.pathI : null, crate: !!b.crate, cover: !!b.coverGoal, trail: tr.hist.filter((h, i) => i % 30 === 0).map((h) => [r1(h[0]), r1(h[1])]), wps: b.path ? b.path.slice(b.pathI, b.pathI + 4).map((w) => [r1(w.x), r1(w.z)]) : null, y: r2(p.y - GY(p.x, p.z)), unstuck: b.stuckCount, vel: [r1(b.ctrl.velocity.x), r1(b.ctrl.velocity.z)] }); tr.oscT = T; }
        }
      }
      // bot-bot contacts
      for (let i = 0; i < trs.length; i++) for (let j = i + 1; j < trs.length; j++) {
        const a = trs[i].b, bb = trs[j].b;
        const key = i * 64 + j;
        const touching = a.p.alive && bb.p.alive && Math.hypot(a.ctrl.position.x - bb.ctrl.position.x, a.ctrl.position.z - bb.ctrl.position.z) < 0.8 && Math.abs(a.ctrl.position.y - bb.ctrl.position.y) < 1.5;
        if (touching && !pairs.get(key)) contacts.push({ x: a.ctrl.position.x, z: a.ctrl.position.z, t: T });
        pairs.set(key, touching);
      }
      if (realNow() - lastYield > 250) { lastYield = realNow(); $('status').textContent = `${mode}:${order} ${r1(T)} / ${TIME} s`; await tick(); }
    }
  } finally { performance.now = realNow; Math.random = realRandom; if (auth?.bots?._nav?.findPath && Object.hasOwn(auth.bots._nav, 'findPath')) delete auth.bots._nav.findPath; }
  const bm = botSec / 60;
  const per = (n) => r2(n / Math.max(1e-6, bm));
  const clusters = cluster(stalls, (e) => e.dur, true);
  const bumpClusters = cluster(bumps, () => 1);
  const bumpWhy = {}; for (const e of bumps) bumpWhy[e.why] = (bumpWhy[e.why] || 0) + 1;
  const hopClusters = cluster(hops, () => 1);
  for (const e of stalls) marks.push({ kind: e.roof ? 'roof' : 'stall', x: e.x, z: e.z, d: e.dur });
  for (const e of bumps) marks.push({ kind: 'bump', x: e.x, z: e.z });
  for (const e of contacts) marks.push({ kind: 'contact', x: e.x, z: e.z });
  for (const e of oscs) marks.push({ kind: 'osc', x: e.x, z: e.z });
  for (const e of pops) marks.push({ kind: 'pop', x: e.x, z: e.z });
  for (const e of hops) marks.push({ kind: 'hop', x: e.x, z: e.z });
  const stallSeconds = stalls.reduce((a, e) => a + e.dur, 0);
  return {
    run: mode + ':' + order, simS: TIME, realS: r1((performance.now() - t0) / 1000),
    summary: {
      botMinutes: r1(bm), stuck: stucks.length, stuckPerBotMin: per(stucks.length), stuckLong: stucks.filter((e) => e.dur > 5).length, stuckSec: r1(stucks.reduce((a, e) => a + e.dur, 0)),
      stalls: stalls.length, stallsPerBotMin: per(stalls.length), long5: stalls.filter((e) => e.dur > 5).length, long12: stalls.filter((e) => e.dur > 12).length,
      stallSeconds: r1(stallSeconds), stallPct: r1(100 * stallSeconds / Math.max(1, intentSec)),
      bumps: bumps.length, bumpsPerBotMin: per(bumps.length), contacts: contacts.length, contactsPerBotMin: per(contacts.length),
      oscillations: oscs.length, pops: pops.length, brainUnstuck, roofStalls: stalls.filter((e) => e.roof).length, fellOut,
      findPath: { n: pf.n, avgMs: r2(pf.ms / Math.max(1, pf.n)), maxMs: r1(pf.max), over4ms: pf.slow }, travelled: Math.round(travelled), speedAvg: r2(intentDist / Math.max(1, intentSec)), caps: auth?.ctf ? { ...auth.ctf.score } : null,
    },
    fells, clusters, bumpClusters, bumpWhy, hopClusters, stalls, stucks: stucks.slice(0, 300), stuckClusters: cluster(stucks, (e) => e.dur), oscillations: oscs, bumps: bumps.slice(0, 400), hops: hops.slice(0, 400),
  };
}

function cluster(evs, w, detail = false) {
  const m = new Map();
  for (const e of evs) {
    const k = Math.round(e.x / 5) * 5 + ',' + Math.round(e.z / 5) * 5;
    const c = m.get(k) || { x: Math.round(e.x / 5) * 5, z: Math.round(e.z / 5) * 5, n: 0, sec: 0, states: {}, roof: false };
    c.n++; c.sec += w(e);
    if (detail) { c.states[e.state] = (c.states[e.state] || 0) + 1; c.roof ||= e.roof; }
    m.set(k, c);
  }
  return [...m.values()].map((c) => ({ ...c, sec: r1(c.sec), state: Object.entries(c.states).sort((a, b) => b[1] - a[1]).map((s) => s[0]).join('/') })).sort((a, b) => b.sec - a.sec || b.n - a.n);
}

function render() {
  const pb = world.playBounds, nav = world.navGrid;
  const W = 900, S = W / (pb.maxX - pb.minX), H = Math.round((pb.maxZ - pb.minZ) * S);
  const cv = $('map'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const X = (x) => (x - pb.minX) * S, Z = (z) => (z - pb.minZ) * S;
  if (nav) {
    g.fillStyle = '#2a2d33';
    for (let j = 0; j < nav.nz; j++) for (let i = 0; i < nav.nx; i++) if (nav.walk[j * nav.nx + i]) g.fillRect(X(nav.x0 + i * nav.cell), Z(nav.z0 + j * nav.cell), nav.cell * S + 0.5, nav.cell * S + 0.5);
  }
  // clearance field (bot code with clearance.js): solid at body height in dark red, < 0.5 m clearance in dim red
  const C = window.__clr;
  if (C) {
    const step = Math.max(1, Math.floor(1 / (S * 0.25)));
    for (let j = 0; j < C.nz; j += step) for (let i = 0; i < C.nx; i += step) {
      const d = C.d[j * C.nx + i];
      if (d >= 50) continue;
      g.fillStyle = d === 0 ? '#7a2020' : '#4a1c1c';
      g.fillRect(X(C.x0 + i * 0.25), Z(C.z0 + j * 0.25), Math.max(1, 0.25 * S * step), Math.max(1, 0.25 * S * step));
    }
  }
  const col = { hop: '#80ff80a0', bump: '#ff9a3070', contact: '#30e0ff80', osc: '#ff40ff', pop: '#ffff40', stall: '#ff3030', roof: '#ff3030' };
  for (const m of marks) {
    g.strokeStyle = col[m.kind]; g.fillStyle = col[m.kind];
    const r = m.kind === 'stall' || m.kind === 'roof' ? 2 + Math.min(10, m.d) : 2;
    g.beginPath(); g.arc(X(m.x), Z(m.z), r, 0, 7);
    if (m.kind === 'stall' || m.kind === 'roof') { g.lineWidth = 2; g.stroke(); if (m.kind === 'roof') { g.strokeStyle = '#fff'; g.beginPath(); g.arc(X(m.x), Z(m.z), r + 2, 0, 7); g.stroke(); } } else g.fill();
  }
}

/** What a bot that stopped moving is pushing against: rays from kerb / knee / chest height along its wished direction. */

function probe(b, tr, nav, hs) {
  const p = b.ctrl.position;
  const L = Math.hypot(tr.wx || 0, tr.wz || 0) || 1;
  _d.set((tr.wx || 0) / L, 0, (tr.wz || 0) / L);
  const hit = (y) => { _o.set(p.x, p.y + y, p.z); return hs.castWorld(_o, _d, 0.9); };
  const kerb = hit(0.2), knee = hit(0.6), chest = hit(1.3);
  const h = chest || knee || kerb;
  const what = chest ? 'wall' : knee ? 'knee' : kerb ? 'kerb' : 'open';
  const elev = p.y - GY(p.x, p.z);
  const wp = b.path && b.pathI < b.path.length ? b.path[b.pathI] : null;
  const ms = b.mob?.state || 'idle';
  return {
    why: (ms !== 'idle' ? ms + ':' : '') + what + (h ? ':' + h.surface : '') + (nav.walkableAt(p.x, p.z) ? '' : ':offnav') + (elev > 1.5 ? ':roof' : ''),
    wpD: wp ? r1(Math.hypot(wp.x - p.x, wp.z - p.z)) : null, wp: wp ? [r1(wp.x), r1(wp.z)] : null, unstuck: b.unstuckT > 0, vis: !!b.visible, elev: r2(elev), wish: [r2(_d.x), r2(_d.z)], role: b.role, goal: b.goal ? [r1(b.goal.x), r1(b.goal.z)] : null,
  };
}
