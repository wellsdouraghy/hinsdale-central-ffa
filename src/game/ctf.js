// Capture the Flag: shared constants/helpers + host-side flag rules (used by Authority).
import * as THREE from 'three';
import { onCampusChange } from '../campuses/index.js';
import { SPAWN_MAX_GRADE } from '../world/terrain.js';

export const CTF = {
  capLimit: 3,
  timeLimit: 720,      // 12 minutes
  overtime: 180,       // sudden death after a tie; still tied after this -> draw
  respawnDelay: 8,      // longer than FFA / TDM (3 s): a flag grab gets a real window before defenders are back
  touch: 2.5,          // pickup / return radius (m)
  capRadius: 3,        // capture radius around own base (m)
  autoReturn: 20,      // dropped flag returns home after this many seconds
};

/**
 * CTF respawn balance (host side, humans and bots alike). Team spawns sit in a zone set BACK from the team's own flag:
 * rMin-rMax m from the flag stand, behind or beside it (never on the enemy-facing side), on gentle open ground, and out
 * of close sight of the flag stand, so defenders have to run back and an attacker who grabs the flag gets a window.
 * Derived per campus from the nav grid (terrain-aware); falls back to the old ring when nothing qualifies.
 */
export const CTF_SPAWN = {
  rMin: 40, rMax: 80,       // distance band from the own flag stand (m)
  front: 0.35,              // max cos(angle) between "flag -> spawn" and "flag -> enemy flag" (0.35 = ~70 deg: behind / beside)
  flagSight: 60,            // no clear line of sight to the flag stand from closer than this (m)
  count: 12,                // spawn spots kept per team (farthest-point sampled, spread out)
  open: 3.75,               // preferred clearance: every nav cell within this of the spot is walkable (m): open ground, not an alley
  enemyNear: 25,            // never spawn within this of a living enemy if any alternative exists (m)
  enemySight: 60,           // ... nor in an enemy's line of sight within this (m)
};

export const TEAMS = ['red', 'blue'];
export const TEAM_COLORS = { red: 0xe0242c, blue: 0x2a6bff };
export const TEAM_CSS = { red: '#ff4d55', blue: '#4d8bff' };
// Player-facing team names (internal ids stay 'red' / 'blue'). Both are plural: "Lions have your flag".
export const TEAM_NAMES = { red: 'Red Devils', blue: 'Lions' };
onCampusChange((c) => Object.assign(TEAM_NAMES, c.teams));
export const otherTeam = (t) => (t === 'red' ? 'blue' : 'red');

const DEFAULT_BASES = { red: [-150, 0, -99], blue: [7, 0, 128] };

/** { red: Vector3, blue: Vector3 } flag homes on the ground. */
export function ctfBases(world) {
  const out = {};
  for (const t of TEAMS) {
    const b = world.ctfBases?.[t];
    const v = b ? new THREE.Vector3(b.x, b.y, b.z) : new THREE.Vector3(...DEFAULT_BASES[t]);
    if (!b && world.groundY) v.y = world.groundY(v.x, v.z);
    out[t] = v;
  }
  return out;
}

const spawnCache = new WeakMap();
const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true;

/** Open-ground points 25-60 m around a base (downward ray must hit near groundY, i.e. not a roof/tree/wall). */
function ringSpawns(world, base) {
  const out = [];
  const b = world.playBounds;
  const down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < 48 && out.length < 10; i++) {
    const a = i * 2.39996; // golden angle
    const r = 25 + (i % 6) * 7;
    const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r;
    if (b && (x < b.minX + 3 || x > b.maxX - 3 || z < b.minZ + 3 || z > b.maxZ - 3)) continue;
    const gy = world.groundY ? world.groundY(x, z) : 0;
    _ray.set(new THREE.Vector3(x, gy + 40, z), down);
    _ray.far = 60;
    const hit = _ray.intersectObjects(world.collisionMeshes, false)[0];
    if (!hit || Math.abs(hit.point.y - gy) > 0.4) continue;
    // Keep clear of walls: short horizontal probes at chest height.
    let blocked = false;
    for (let k = 0; k < 4 && !blocked; k++) {
      const d = new THREE.Vector3(Math.cos(k * Math.PI / 2), 0, Math.sin(k * Math.PI / 2));
      _ray.set(new THREE.Vector3(x, gy + 1.2, z), d);
      _ray.far = 1.2;
      if (_ray.intersectObjects(world.collisionMeshes, false).length) blocked = true;
    }
    if (!blocked) out.push(new THREE.Vector3(x, gy, z));
  }
  return out;
}

/**
 * The CTF_SPAWN zone for a team from the nav grid (walkable ground cells): returns up to `count` spread-out spots, or
 * fewer when the campus has little room (constraints relax one at a time: flag sight, then the front cone).
 */
function zoneSpawns(world, team) {
  const g = world.navGrid;
  if (!g || !g.walk || !world.collisionMeshes) return [];
  const bases = ctfBases(world);
  const base = bases[team], enemy = bases[otherTeam(team)];
  const ex = enemy.x - base.x, ez = enemy.z - base.z, el = Math.hypot(ex, ez) || 1;
  const T = world.terrain;
  const standY = (x, z) => (T?.standY ? T.standY(x, z) : world.groundY ? world.groundY(x, z) : 0);
  const b = world.playBounds;
  const S = CTF_SPAWN;
  const walk = (i, j) => i >= 0 && j >= 0 && i < g.nx && j < g.nz && g.walk[j * g.nx + i] === 1;
  // Candidates: walkable cells in the band with walkable neighbours (elbow room), gentle slope, inside the bounds.
  const cands = [];
  for (let j = 1; j < g.nz - 1; j++) for (let i = 1; i < g.nx - 1; i++) {
    if (!walk(i, j)) continue;
    const x = g.x0 + (i + 0.5) * g.cell, z = g.z0 + (j + 0.5) * g.cell;
    const dx = x - base.x, dz = z - base.z, d = Math.hypot(dx, dz);
    if (d < S.rMin || d > S.rMax) continue;
    if (b && (x < b.minX + 4 || x > b.maxX - 4 || z < b.minZ + 4 || z > b.maxZ - 4)) continue;
    let ok = true;
    for (let bb = -1; bb <= 1 && ok; bb++) for (let a = -1; a <= 1; a++) if (!walk(i + a, j + bb)) { ok = false; break; }
    if (!ok) continue;
    if (T?.slopeAt && T.slopeAt(x, z) > SPAWN_MAX_GRADE) continue;
    // `open`: every nav cell within S.open metres is walkable too. A spot with only one cell of elbow room can sit in a
    // dead-end strip (Hinsdale: the 5 m alley between the home stand's back and the fence; bots spawned there walked
    // under the stand, bumped into its 1 m front deck and hopped the rail). Preferred below, not required.
    let open = true; const no = Math.ceil(S.open / g.cell);
    for (let bb = -no; bb <= no && open; bb++) for (let a = -no; a <= no; a++) if (a * a + bb * bb <= no * no && !walk(i + a, j + bb)) { open = false; break; }
    cands.push({ x, z, d, open, cos: (dx * ex + dz * ez) / (d * el) });
  }
  if (!cands.length) return [];
  const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3(), dir = new THREE.Vector3();
  const flagEye = new THREE.Vector3(base.x, base.y + 1.5, base.z);
  const cast = (from, to) => {
    dir.subVectors(to, from); const len = dir.length();
    _ray.set(from, dir.normalize()); _ray.far = len - 0.3;
    return _ray.intersectObjects(world.collisionMeshes, false).length > 0;
  };
  const okGround = (c) => {
    // Open ground (a downward ray lands near the ground, not on a roof / tree) and no wall within 1.2 m.
    const gy = standY(c.x, c.z);
    _ray.set(o.set(c.x, gy + 40, c.z), down); _ray.far = 60;
    const hit = _ray.intersectObjects(world.collisionMeshes, false)[0];
    if (!hit || Math.abs(hit.point.y - gy) > 0.5) return false;
    for (let k = 0; k < 4; k++) {
      _ray.set(o.set(c.x, gy + 1.2, c.z), dir.set(Math.cos(k * Math.PI / 2), 0, Math.sin(k * Math.PI / 2))); _ray.far = 1.2;
      if (_ray.intersectObjects(world.collisionMeshes, false).length) return false;
    }
    // ... and nothing raised beside it: a deck, stage, kerbed planter or prop under chest height that the 1.2 m probes
    // pass over (downward rays on a 1.5 m ring must land on the ground the spot stands on).
    for (let k = 0; k < 8; k++) {
      const ax = c.x + Math.cos(k * Math.PI / 4) * 1.5, az = c.z + Math.sin(k * Math.PI / 4) * 1.5;
      _ray.set(o.set(ax, gy + 40, az), down); _ray.far = 60;
      const h2 = _ray.intersectObjects(world.collisionMeshes, false)[0];
      if (h2 && h2.point.y - Math.max(gy, standY(ax, az)) > 0.5) return false;
    }
    c.y = gy;
    return true;
  };
  const sees = (c) => c.d < S.flagSight && !cast(flagEye, new THREE.Vector3(c.x, c.y + 1.6, c.z));
  // Thin the candidates (every other one) before raycasting: plenty for 12 spread-out spots.
  const pool = cands.filter((c, k) => k % 2 === 0 && okGround(c));
  const tiersOf = (ps) => [
    ps.filter((c) => c.cos <= S.front && !sees(c)),
    ps.filter((c) => c.cos <= S.front),
    ps.filter((c) => c.cos <= 0.7),
  ];
  // Open ground first (enough of it for a full, spread-out set); a cramped campus falls back to any clear spot.
  const pick = tiersOf(pool.filter((c) => c.open)).find((t) => t.length >= S.count * 2) || tiersOf(pool).find((t) => t.length >= 4) || [];
  // Farthest-point sampling, starting from the spot straight behind the flag.
  const out = [];
  if (!pick.length) return out;
  const dist = new Float32Array(pick.length).fill(Infinity);
  let cur = 0;
  pick.forEach((c, k) => { if (c.cos < pick[cur].cos) cur = k; });
  while (out.length < S.count) {
    const c = pick[cur];
    out.push(new THREE.Vector3(c.x, c.y, c.z));
    let bi = -1, bd = 2;   // stop when the next one would be within 2 m of a kept one
    for (let k = 0; k < pick.length; k++) {
      const dd = Math.min(dist[k], Math.hypot(pick[k].x - c.x, pick[k].z - c.z));
      dist[k] = dd;
      if (dd > bd) { bd = dd; bi = k; }
    }
    if (bi < 0) break;
    cur = bi;
  }
  return out;
}

/** Spawn candidates for a team: the CTF_SPAWN zone, else world.ctfSpawns, else open ground around the base, else
 *  the nearest spawnPoints. Cached per world. */
export function ctfSpawnList(world, team, legacy = false) {
  let cache = spawnCache.get(world);
  if (!cache) { cache = {}; spawnCache.set(world, cache); }
  if (legacy) {
    // TDM opening spawns: the old team areas round the base (world.ctfSpawns / ring), unchanged.
    if (world.ctfSpawns?.[team]?.length) return world.ctfSpawns[team];
    const key = 'legacy-' + team;
    if (!cache[key]) { const ring = ringSpawns(world, ctfBases(world)[team]); cache[key] = ring.length >= 4 ? ring : nearestSpawns(world, team); }
    return cache[key];
  }
  if (!cache[team]) {
    const zone = zoneSpawns(world, team);
    if (zone.length >= 4) cache[team] = zone;
    else if (world.ctfSpawns?.[team]?.length) cache[team] = world.ctfSpawns[team];
    else {
      const ring = ringSpawns(world, ctfBases(world)[team]);
      cache[team] = ring.length >= 4 ? ring : nearestSpawns(world, team);
    }
  }
  return cache[team];
}

function nearestSpawns(world, team) {
  const base = ctfBases(world)[team];
  const enemy = ctfBases(world)[otherTeam(team)];
  const pts = world.spawnPoints
    .filter((p) => Math.hypot(p.x - base.x, p.z - base.z) >= 15)
    .filter((p) => Math.hypot(p.x - base.x, p.z - base.z) < Math.hypot(p.x - enemy.x, p.z - enemy.z))
    .sort((a, b) => Math.hypot(a.x - base.x, a.z - base.z) - Math.hypot(b.x - base.x, b.z - base.z));
  if (pts.length >= 3) return pts.slice(0, 8);
  // Fallback: ring of points around the base.
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2;
    const p = base.clone().add(new THREE.Vector3(Math.cos(a) * 25, 0, Math.sin(a) * 25));
    if (world.groundY) p.y = world.groundY(p.x, p.z);
    return p;
  });
}

const hdist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const near = (a, b, r) => hdist(a, b) <= r && Math.abs(a[1] - b[1]) <= 2.5;

/** Host-side flag state machine. `auth` is the Authority (players, out(), now()). */
export class CtfRules {
  constructor(auth, world) {
    this.auth = auth;
    this.world = world;
    const bases = ctfBases(world);
    this.bases = { red: bases.red.toArray(), blue: bases.blue.toArray() };
    this.reset();
  }

  reset() {
    this.score = { red: 0, blue: 0 };
    this.flags = {};
    for (const t of TEAMS) this.flags[t] = { state: 'home', carrier: null, pos: this.bases[t].slice(), dropT: 0 };
  }

  snapshot() {
    const flags = {};
    const t = this.auth.time();
    for (const team of TEAMS) {
      const f = this.flags[team];
      flags[team] = { state: f.state, carrier: f.carrier, pos: f.pos, ret: f.state === 'dropped' ? Math.max(0, CTF.autoReturn - (t - f.dropT)) : null };
    }
    return { flags, score: { ...this.score }, bases: this.bases };
  }

  _emit(team, event, by = null) {
    const p = by !== null ? this.auth.players.get(by) : null;
    this.auth.out({
      t: 'flag', team, event, by,
      pc: p?.caps, pr: p?.returns,
      ...this.snapshot(),
    });
  }

  _home(team) {
    const f = this.flags[team];
    f.state = 'home';
    f.carrier = null;
    f.pos = this.bases[team].slice();
  }

  carrying(p) {
    for (const t of TEAMS) if (this.flags[t].carrier === p.id) return t;
    return null;
  }

  /** Carrier died / left / switched team: drop the flag where they were. */
  dropFrom(p) {
    const team = this.carrying(p);
    if (!team) return;
    const f = this.flags[team];
    const pos = p.pos ? p.pos.slice() : this.bases[team].slice();
    const b = this.world.playBounds;
    if (pos[1] < -5 || (b && (pos[0] < b.minX || pos[0] > b.maxX || pos[2] < b.minZ || pos[2] > b.maxZ))) {
      this._home(team);
      this._emit(team, 'autoreturn');
      return;
    }
    if (this.world.groundY) pos[1] = Math.min(pos[1], this.world.groundY(pos[0], pos[2]) + 0.05);
    f.state = 'dropped';
    f.carrier = null;
    f.pos = pos;
    f.dropT = this.auth.time();
    this._emit(team, 'drop', p.id);
  }

  /** Returns the capturing team when a capture happened this tick. */
  update() {
    const t = this.auth.time();
    let captured = null;
    for (const team of TEAMS) {
      const f = this.flags[team];
      if (f.state === 'dropped' && t - f.dropT >= CTF.autoReturn) {
        this._home(team);
        this._emit(team, 'autoreturn');
      }
      if (f.state === 'carried') {
        const c = this.auth.players.get(f.carrier);
        if (!c || !c.alive) this._home(team); // safety net (normally dropFrom handles this)
        else if (c.pos) f.pos = c.pos.slice();
      }
    }
    if (this.auth.state !== 'playing') return null;
    for (const p of this.auth.players.values()) {
      if (!p.alive || (p.bot && !p.ai) || !p.pos || !p.team) continue;
      const enemyTeam = otherTeam(p.team);
      const ef = this.flags[enemyTeam], of = this.flags[p.team];
      // Take the enemy flag (home or dropped).
      if ((ef.state === 'home' || ef.state === 'dropped') && near(p.pos, ef.pos, CTF.touch)) {
        ef.state = 'carried';
        ef.carrier = p.id;
        ef.pos = p.pos.slice();
        this._emit(enemyTeam, 'take', p.id);
      }
      // Return own dropped flag.
      if (of.state === 'dropped' && near(p.pos, of.pos, CTF.touch)) {
        p.returns++;
        this._home(p.team);
        this._emit(p.team, 'return', p.id);
      }
      // Capture: carrying the enemy flag at own base while own flag is home.
      if (ef.carrier === p.id && of.state === 'home' && near(p.pos, this.bases[p.team], CTF.capRadius)) {
        p.caps++;
        this.score[p.team]++;
        this._home(enemyTeam);
        this._emit(enemyTeam, 'capture', p.id);
        captured = p.team;
      }
    }
    return captured;
  }
}
