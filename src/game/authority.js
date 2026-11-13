// Host-side match authority: players, health, damage validation, kills, scores, respawns, timer.
// Runs in the host's browser (online) or locally (practice). Transport-agnostic: emits messages via `out`.
import { WEAPON_STATS, maxShotDamage, MELEE } from './weapons.js';

export const MATCH = {
  scoreLimit: 30,
  timeLimit: 600,
  respawnDelay: 3,
  protect: 2,
  regenDelay: 4,
  regenRate: 40,
  maxPlayers: 8,
  stateHz: 20,
};

export const now = () => performance.now() / 1000;

export class Authority {
  /**
   * out(msg, to, except): to = player id or null for everyone; except = player id to skip.
   * opts: { world, practice, practiceSpawn: {pos, yaw} }
   */
  constructor({ world, practice = false, practiceSpawn = null, out }) {
    this.world = world;
    this.practice = practice;
    this.practiceSpawn = practiceSpawn;
    this.out = out;
    this.players = new Map();
    this.colorIndex = 0;
    this.state = 'playing';
    this.endTime = now() + MATCH.timeLimit;
    this.pendingStates = new Map();
    this.stateTimer = 0;
    this.rosterTimer = 0;
    this.pingTimer = 0;
  }

  // ---------- roster ----------
  uniqueName(name) {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) {
      const n = `${name} (${i})`;
      if (!taken.has(n.toLowerCase())) return n;
    }
  }

  isFull() {
    return [...this.players.values()].filter((p) => !p.bot).length >= MATCH.maxPlayers;
  }

  addPlayer(id, name, { bot = false, pos = null, yaw = 0 } = {}) {
    const p = {
      id, name: this.uniqueName(name), color: this.colorIndex++, bot,
      kills: 0, deaths: 0, hp: 100, alive: false, life: 0, lastDmg: -100,
      protectUntil: 0, respawnAt: null, pos: null, ping: bot ? null : 0, ready: false,
      botPos: pos, botYaw: yaw, claims: [], lastSeen: now(),
    };
    this.players.set(id, p);
    this.out({ t: 'join', p: this.publicPlayer(p) }, null, id);
    if (bot) this.spawn(p);
    return p;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    this.pendingStates.delete(id);
    this.out({ t: 'leave', id }, null, id);
  }

  publicPlayer(p) {
    return { id: p.id, name: p.name, color: p.color, k: p.kills, d: p.deaths, hp: Math.round(p.hp), alive: p.alive, life: p.life, ping: p.ping, bot: p.bot, pos: p.pos, yaw: p.botYaw ?? 0 };
  }

  welcomeFor(id) {
    return {
      t: 'welcome', id,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      match: this.matchInfo(),
    };
  }

  matchInfo() {
    return {
      state: this.state, practice: this.practice, scoreLimit: MATCH.scoreLimit,
      timeLeft: this.practice ? null : Math.max(0, this.endTime - now()),
    };
  }

  // ---------- messages from players ----------
  handle(from, msg) {
    const p = this.players.get(from);
    if (!p) return;
    p.lastSeen = now();
    switch (msg.t) {
      case 'ready':
        p.ready = true;
        if (!p.alive && p.respawnAt === null && this.state === 'playing') this.spawn(p);
        break;
      case 'st':
        if (!p.alive || msg.l !== p.life) return;
        p.pos = msg.p;
        this.pendingStates.set(from, { ...msg, id: from });
        break;
      case 'shot':
        if (!p.alive) return;
        p.protectUntil = 0; // firing ends spawn protection
        this.out({ ...msg, id: from }, null, from);
        break;
      case 'hit':
        this.handleHit(p, msg);
        break;
      case 'melee':
        if (p.alive) this.out({ t: 'melee', id: from }, null, from);
        break;
      case 'pong':
        p.ping = Math.round((now() - msg.ts) * 1000);
        break;
      default:
        break;
    }
  }

  handleHit(a, msg) {
    const t = now();
    const v = this.players.get(msg.target);
    if (!v || v === a || !a.alive || !v.alive || this.state !== 'playing') return;
    const w = msg.w;
    if (w !== 'melee' && !WEAPON_STATS[w]) return;
    const dmg = Math.min(Number(msg.dmg) || 0, maxShotDamage(w));
    if (!(dmg > 0)) return;
    // Rate limit: claims per second bounded by weapon fire rate (+ slack for multi-target shots / jitter).
    const rps = w === 'melee' ? 1 / MELEE.cooldown : WEAPON_STATS[w].rpm / 60;
    a.claims = a.claims.filter((c) => t - c < 1);
    if (a.claims.length > rps * 1.5 + 3) return;
    a.claims.push(t);
    // Sanity distance check against last known positions.
    if (a.pos && v.pos) {
      const d = Math.hypot(a.pos[0] - v.pos[0], a.pos[1] - v.pos[1], a.pos[2] - v.pos[2]);
      const maxR = w === 'melee' ? 6 : WEAPON_STATS[w].maxRange + 15;
      if (d > maxR) return;
    }
    this.applyDamage(a, v, dmg, !!msg.hs, w);
  }

  applyDamage(a, v, amount, headshot, weapon) {
    const t = now();
    if (t < v.protectUntil) return;
    v.hp -= amount;
    v.lastDmg = t;
    if (v.hp > 0) {
      this.out({ t: 'dmg', id: v.id, by: a.id, hp: Math.round(v.hp), amt: Math.round(amount), hs: headshot });
      return;
    }
    v.hp = 0;
    v.alive = false;
    v.deaths++;
    v.respawnAt = t + MATCH.respawnDelay;
    a.kills++;
    this.out({ t: 'kill', killer: a.id, victim: v.id, w: weapon, hs: headshot, kk: a.kills, vd: v.deaths });
    if (!this.practice && a.kills >= MATCH.scoreLimit) this.endMatch();
  }

  // ---------- spawning ----------
  spawn(p) {
    let pos, yaw;
    if (p.bot) { pos = p.botPos; yaw = p.botYaw; }
    else if (this.practice && this.practiceSpawn) { pos = this.practiceSpawn.pos; yaw = this.practiceSpawn.yaw; }
    else ({ pos, yaw } = this.pickSpawn(p));
    p.alive = true;
    p.hp = 100;
    p.life++;
    p.respawnAt = null;
    p.pos = [pos.x, pos.y, pos.z];
    p.protectUntil = p.bot ? 0 : now() + MATCH.protect;
    p.lastDmg = -100;
    this.pendingStates.delete(p.id);
    this.out({ t: 'spawn', id: p.id, p: [pos.x, pos.y, pos.z], yaw, life: p.life, prot: p.bot ? 0 : MATCH.protect });
  }

  /** Spawn farthest from living enemies (random among the best few). */
  pickSpawn(p) {
    const pts = this.world.spawnPoints;
    const enemies = [...this.players.values()].filter((o) => o !== p && o.alive && o.pos);
    const scored = pts.map((s) => {
      let min = 1e9;
      for (const e of enemies) min = Math.min(min, Math.hypot(s.x - e.pos[0], s.z - e.pos[2]));
      return { s, score: enemies.length ? min : Math.random() };
    }).sort((x, y) => y.score - x.score);
    const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
    // Face roughly toward the middle of the play area.
    const b = this.world.playBounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const yaw = Math.atan2(-(cx - pick.x), -(cz - pick.z));
    return { pos: pick, yaw };
  }

  // ---------- match flow ----------
  endMatch() {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    const standings = this.standings();
    this.out({ t: 'end', standings, winner: standings[0]?.id ?? null });
  }

  standings() {
    return [...this.players.values()].filter((p) => !p.bot)
      .sort((x, y) => y.kills - x.kills || x.deaths - y.deaths)
      .map((p) => ({ id: p.id, name: p.name, k: p.kills, d: p.deaths }));
  }

  restart() {
    this.state = 'playing';
    this.endTime = now() + MATCH.timeLimit;
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.alive = false; p.respawnAt = null; p.hp = 100;
    }
    this.out({ t: 'restart', match: this.matchInfo() });
    for (const p of this.players.values()) if (p.ready || p.bot) this.spawn(p);
  }

  // ---------- per-frame ----------
  update(dt) {
    const t = now();
    for (const p of this.players.values()) {
      if (p.alive && p.hp < 100 && t - p.lastDmg > MATCH.regenDelay) p.hp = Math.min(100, p.hp + MATCH.regenRate * dt);
      if (!p.alive && p.respawnAt !== null && t >= p.respawnAt && this.state === 'playing') {
        if (p.bot || p.ready) this.spawn(p);
      }
    }
    if (!this.practice && this.state === 'playing' && t >= this.endTime) this.endMatch();

    this.stateTimer += dt;
    if (this.stateTimer >= 1 / MATCH.stateHz) {
      this.stateTimer = 0;
      if (this.pendingStates.size) {
        this.out({ t: 'sts', s: [...this.pendingStates.values()] });
        this.pendingStates.clear();
      }
    }
    this.rosterTimer += dt;
    if (this.rosterTimer >= 1) {
      this.rosterTimer = 0;
      this.out({
        t: 'roster',
        players: [...this.players.values()].map((p) => ({ id: p.id, k: p.kills, d: p.deaths, ping: p.ping, hp: Math.round(p.hp), alive: p.alive })),
        match: this.matchInfo(),
      });
    }
    this.pingTimer += dt;
    if (this.pingTimer >= 2) {
      this.pingTimer = 0;
      this.out({ t: 'ping', ts: t });
    }
  }

  /** Ids of remote players that have not been heard from for `timeout` seconds. */
  stalePlayers(timeout, exceptId) {
    const t = now();
    return [...this.players.values()].filter((p) => !p.bot && p.id !== exceptId && t - p.lastSeen > timeout).map((p) => p.id);
  }
}
