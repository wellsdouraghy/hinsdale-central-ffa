// Capture the Flag: shared constants/helpers + host-side flag rules (used by Authority).
import * as THREE from 'three';

export const CTF = {
  capLimit: 3,
  timeLimit: 720,      // 12 minutes
  overtime: 180,       // sudden death after a tie; still tied after this -> draw
  respawnDelay: 5,
  touch: 2.5,          // pickup / return radius (m)
  capRadius: 3,        // capture radius around own base (m)
  autoReturn: 20,      // dropped flag returns home after this many seconds
};

export const TEAMS = ['red', 'blue'];
export const TEAM_COLORS = { red: 0xe0242c, blue: 0x2a6bff };
export const TEAM_CSS = { red: '#ff4d55', blue: '#4d8bff' };
// Player-facing team names (internal ids stay 'red' / 'blue'). Both are plural: "Lions have your flag".
export const TEAM_NAMES = { red: 'Red Devils', blue: 'Lions' };
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

/** Spawn candidates for a team: world.ctfSpawns, else open ground around the base, else the nearest spawnPoints. */
export function ctfSpawnList(world, team) {
  const list = world.ctfSpawns?.[team];
  if (list && list.length) return list;
  let cache = spawnCache.get(world);
  if (!cache) { cache = {}; spawnCache.set(world, cache); }
  if (!cache[team]) {
    const ring = ringSpawns(world, ctfBases(world)[team]);
    cache[team] = ring.length >= 4 ? ring : nearestSpawns(world, team);
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
      if (!p.alive || p.bot || !p.pos || !p.team) continue;
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
