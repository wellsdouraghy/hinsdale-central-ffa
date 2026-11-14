// Host-side match authority: players, teams, health, damage validation, kills, scores, flags, respawns, timer.
// Runs in the host's browser (online) or locally (practice). Transport-agnostic: emits messages via `out`.
import { WEAPON_STATS, maxShotDamage, MELEE } from './weapons.js';
import { CTF, CtfRules, ctfSpawnList, ctfBases, otherTeam, TEAMS } from './ctf.js';
import { CLASSES, DEFAULT_CLASS, classOf, meleeDamageFor } from './classes.js';
import { Projectile, NADE, blastDamage } from './grenades.js';
import { StreakRules } from './streaks.js';
import { BotManager } from './bots/botManager.js';
import { HeliRules } from './heli.js';
import * as THREE from 'three';

const MAX_SPEED = 48; // m/s sanity cap for client movement (grapple + dash + fling stay well below)

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

export const MODES = {
  ffa: { label: 'Free-for-all' },
  tdm: { label: 'Team Deathmatch' },
  ctf: { label: 'Capture the Flag' },
};

export const TDM = { scoreLimit: 50, timeLimit: 600, respawnDelay: 3 };

/** Static practice dummy (not an AI bot). */
export const isDummy = (p) => p.bot && !p.ai;

export const now = () => performance.now() / 1000;

/** Mode-dependent rules (read at call time so tests can tweak MATCH / CTF). */
export function rulesFor(mode) {
  if (mode === 'ctf') return { scoreLimit: CTF.capLimit, timeLimit: CTF.timeLimit, respawnDelay: CTF.respawnDelay };
  if (mode === 'tdm') return { scoreLimit: TDM.scoreLimit, timeLimit: TDM.timeLimit, respawnDelay: TDM.respawnDelay };
  return { scoreLimit: MATCH.scoreLimit, timeLimit: MATCH.timeLimit, respawnDelay: MATCH.respawnDelay };
}

export class Authority {
  /**
   * out(msg, to, except): to = player id or null for everyone; except = player id to skip.
   * opts: { world, mode: 'ffa'|'ctf', practice, practiceSpawn: {pos, yaw} }
   */
  constructor({ world, mode = 'ffa', practice = false, practiceSpawn = null, out }) {
    this.world = world;
    this.mode = mode;
    this.practice = practice;
    this.practiceSpawn = practiceSpawn;
    this.out = out;
    this.players = new Map();
    this.colorIndex = 0;
    this.state = 'playing';
    this.overtime = false;
    this.endTime = now() + rulesFor(mode).timeLimit;
    this.ctf = mode === 'ctf' ? new CtfRules(this, world) : null;
    this.teamMode = mode === 'ctf' || mode === 'tdm';
    this.teamScore = { red: 0, blue: 0 };   // TDM kills per team
    this.bots = new BotManager(this);
    this.heli = mode === 'ffa' ? new HeliRules(this) : null;
    this.streaks = new StreakRules(this);
    this.projectiles = new Map(); // key `${owner}:${cid}` -> { owner, cid, pr: Projectile, item }
    this.pendingStates = new Map();
    this.stateTimer = 0;
    this.rosterTimer = 0;
    this.pingTimer = 0;
  }

  time() { return now(); }
  get rules() { return rulesFor(this.mode); }

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

  /** Humans + AI bots stay <= maxPlayers: drop a bot when a human takes the slot. */
  trimBots() {
    const all = [...this.players.values()].filter((p) => !isDummy(p));
    if (all.length <= MATCH.maxPlayers) return;
    const bot = all.filter((p) => p.ai).pop();
    if (bot) this.bots.remove(bot.id);
  }

  teamCount(team, exceptId = null) {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team && p.id !== exceptId && !isDummy(p)) n++;
    return n;
  }

  smallerTeam() {
    const r = this.teamCount('red'), b = this.teamCount('blue');
    if (r !== b) return r < b ? 'red' : 'blue';
    return Math.random() < 0.5 ? 'red' : 'blue';
  }

  addPlayer(id, name, { bot = false, ai = false, pos = null, yaw = 0, team = null, pid = null, cls = null } = {}) {
    const p = {
      id, name: this.uniqueName(name), color: this.colorIndex++, bot, ai,
      team: this.teamMode ? (team || this.smallerTeam()) : null,
      kills: 0, deaths: 0, caps: 0, returns: 0, hp: 100, armor: 0, alive: false, life: 0, lastDmg: -100,
      cls: CLASSES[cls] ? cls : DEFAULT_CLASS, streak: 0, items: [], frags: 0, lastSt: null, pid,
      protectUntil: 0, respawnAt: null, pos: null, ping: bot ? null : 0, ready: false,
      botPos: pos, botYaw: yaw, claims: [], lastSeen: now(),
    };
    this.players.set(id, p);
    this.out({ t: 'join', p: this.publicPlayer(p) }, null, id);
    if (bot) { p.ready = true; p.everReady = true; this.spawn(p); }
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.ctf?.dropFrom(p);
    this.heli?.onPlayerGone(p);
    this.players.delete(id);
    this.pendingStates.delete(id);
    this.out({ t: 'leave', id }, null, id);
  }

  publicPlayer(p) {
    return {
      id: p.id, name: p.name, color: p.color, team: p.team, k: p.kills, d: p.deaths, caps: p.caps, ret: p.returns,
      hp: Math.round(p.hp), alive: p.alive, life: p.life, ping: p.ping, bot: p.bot, ai: p.ai, pos: p.pos, yaw: p.botYaw ?? 0,
      cls: p.cls, armor: p.armor, pid: p.pid,
    };
  }

  welcomeFor(id) {
    return {
      t: 'welcome', id,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      match: this.matchInfo(),
    };
  }

  matchInfo() {
    const r = this.rules;
    return {
      mode: this.mode, state: this.state, practice: this.practice, scoreLimit: r.scoreLimit, respawnDelay: r.respawnDelay,
      overtime: this.overtime,
      timeLeft: this.practice ? null : Math.max(0, this.endTime - now()),
      ctf: this.ctf ? this.ctf.snapshot() : null,
      teamScore: this.mode === 'tdm' ? { ...this.teamScore } : null,
      crates: this.streaks.snapshot(),
      heli: this.heli ? this.heli.snapshot() : null,
    };
  }

  // ---------- messages from players ----------
  handle(from, msg) {
    const p = this.players.get(from);
    if (!p) return;
    p.lastSeen = now();
    switch (msg.t) {
      case 'ready':
        // Sent on deploy and again after every death (after the kill cam / loadout screen).
        p.ready = true;
        p.everReady = true;
        if (CLASSES[msg.cls]) p.cls = msg.cls;
        if (!p.alive && (p.respawnAt === null || now() >= p.respawnAt) && this.state === 'playing') this.spawn(p);
        break;
      case 'class':
        if (CLASSES[msg.cls]) { p.cls = msg.cls; this.out({ t: 'cls', id: p.id, cls: p.cls }); }
        break;
      case 'swapClass': {
        // In-spawn swap: alive, <= 10 s since spawn, <= 8 m from the spawn point, no shots / throws / damage yet.
        const sp = p.spawnInfo;
        if (!CLASSES[msg.cls] || !p.alive || !sp || sp.dirty || now() - sp.t > 10.5 || !p.pos) return;
        if (Math.hypot(p.pos[0] - sp.p[0], p.pos[2] - sp.p[2]) > 9) return;
        p.cls = msg.cls;
        p.frags = classOf(p.cls).frags;
        this.out({ t: 'swapped', id: p.id, cls: p.cls });
        break;
      }
      case 'st': {
        if (!p.alive || msg.l !== p.life || !Array.isArray(msg.p)) return;
        // Speed sanity: reject states that move implausibly fast (keeps flag pickups / hit checks honest).
        const ls = p.lastSt;
        if (ls && ls.l === msg.l && msg.ts > ls.ts) {
          const dt = Math.max(0.03, msg.ts - ls.ts);
          // (A long run of rejections means a legit local teleport, e.g. the out-of-world rescue: resync.)
          if (Math.hypot(msg.p[0] - ls.p[0], msg.p[2] - ls.p[2]) / dt > MAX_SPEED && (p.stRejects = (p.stRejects || 0) + 1) < 20) return;
        }
        p.stRejects = 0;
        p.lastSt = { l: msg.l, ts: msg.ts, p: msg.p };
        p.pos = msg.p;
        p.crouch = !!msg.c;
        this.pendingStates.set(from, { ...msg, id: from });
        break;
      }
      case 'nade': this.handleThrow(p, msg); break;
      case 'item':
        if (p.alive && msg.item === 'uav') this.streaks.useInstant(p, 'uav');
        break;
      case 'capBegin': this.streaks.capBegin(p, msg.cid); break;
      case 'capture': this.streaks.capture(p, msg.cid); break;
      case 'shot':
        if (!p.alive) return;
        if (p.spawnInfo) p.spawnInfo.dirty = true;
        p.protectUntil = 0; // firing ends spawn protection
        this.out({ ...msg, id: from }, null, from);
        this.bots.onShot(p, p.pos);
        break;
      case 'hit':
        this.handleHit(p, msg);
        break;
      case 'melee':
        if (p.spawnInfo) p.spawnInfo.dirty = true;
        if (p.alive) this.out({ t: 'melee', id: from, hit: !!msg.hit }, null, from);
        break;
      case 'team':
        this.switchTeam(p, msg.team);
        break;
      case 'heliEnter': case 'heliExit': case 'hst': case 'rocket': case 'heliCrash': case 'heliRotor':
        this.heli?.handle(p, msg);
        break;
      case 'pong':
        p.ping = Math.round((now() - msg.ts) * 1000);
        break;
      default:
        break;
    }
  }

  /** Team switch is allowed when the teams stay within one player of each other. */
  switchTeam(p, team) {
    if (!this.teamMode || !TEAMS.includes(team) || p.team === team || p.bot) return;
    const after = this.teamCount(team) + 1;
    const otherAfter = this.teamCount(p.team, p.id);
    if (after - otherAfter > 1) {
      this.out({ t: 'notice', text: `Teams would be unbalanced: ${team} has more players.` }, p.id);
      return;
    }
    this.ctf?.dropFrom(p);
    p.team = team;
    const wasAlive = p.alive;
    p.alive = false;
    p.respawnAt = p.ready ? now() + 1 : null;
    this.out({ t: 'team', id: p.id, team, despawn: wasAlive });
  }

  handleHit(a, msg) {
    const t = now();
    if (msg.target === 'heli') { this.heli?.bulletHit(a, msg); return; }
    if (msg.w === 'heligun') { this.heli?.cannonHit(a, msg); return; }
    const v = this.players.get(msg.target);
    if (!v || v === a || !a.alive || !v.alive || this.state !== 'playing') return;
    if (this.teamMode && a.team && a.team === v.team) return; // friendly fire off
    if (v.inHeli) return; // pilots can only be killed by destroying the helicopter
    const w = msg.w;
    if (w !== 'melee' && !WEAPON_STATS[w]) return;
    const dmg = Math.min(Number(msg.dmg) || 0, w === 'melee' ? meleeDamageFor(a.cls) : maxShotDamage(w));
    if (!(dmg > 0)) return;
    // Rate limit: claims per second bounded by weapon fire rate (+ slack for multi-target shots / jitter).
    const rps = w === 'melee' ? 2 / MELEE.cooldown : WEAPON_STATS[w].rpm / 60;
    a.claims = a.claims.filter((c) => t - c < 1);
    if (a.claims.length > rps * 1.5 + 3) return;
    a.claims.push(t);
    // Sanity distance check against last known positions.
    if (a.pos && v.pos) {
      const d = Math.hypot(a.pos[0] - v.pos[0], a.pos[1] - v.pos[1], a.pos[2] - v.pos[2]);
      const maxR = w === 'melee' ? 6 : WEAPON_STATS[w].maxRange + 15;
      if (d > maxR) return;
    }
    // Sniper head/torso hits kill outright (armor included); the client marks them `ik`.
    // Melee is always a one-hit kill (armor included).
    const lethal = (w === 'sniper' && msg.ik) || w === 'melee' ? v.hp + v.armor + 1 : dmg;
    this.applyDamage(a, v, lethal, !!msg.hs, w);
    // Tell the shooter what is left (HP bar over damaged enemies).
    if (v.alive) this.out({ t: 'hitc', target: v.id, hp: Math.round(v.hp), armor: Math.round(v.armor) }, a.id);
  }

  applyDamage(a, v, amount, headshot, weapon) {
    const t = now();
    if (t < v.protectUntil || !v.alive) return;
    if (v.inHeli && weapon !== 'heli') return;
    if (v.spawnInfo) v.spawnInfo.dirty = true;
    this.bots.onDamaged(v, a);
    if (v.armor > 0) {
      const take = Math.min(v.armor, amount);
      v.armor -= take;
      amount -= take;
      this.out({ t: 'armor', id: v.id, armor: Math.round(v.armor) });
    }
    v.hp -= amount;
    v.lastDmg = t;
    if (v.hp > 0) {
      this.out({ t: 'dmg', id: v.id, by: a.id, hp: Math.round(v.hp), amt: Math.round(amount), hs: headshot, w: weapon });
      return;
    }
    v.hp = 0;
    v.alive = false;
    v.ready = v.bot; // the client re-sends 'ready' after its kill cam / death screen
    v.deaths++;
    v.respawnAt = t + this.rules.respawnDelay;
    if (a !== v) a.kills++;
    if (this.mode === 'tdm' && a !== v && a.team && v.team && a.team !== v.team && this.state === 'playing') {
      this.teamScore[a.team]++;
      this.out({ t: 'tscore', score: { ...this.teamScore } });
      if (!this.practice && this.teamScore[a.team] >= this.rules.scoreLimit) this.endAfterKill = true;
    }
    this.out({ t: 'kill', killer: a.id, victim: v.id, w: weapon, hs: headshot, kk: a.kills, vd: v.deaths, khp: Math.round(a.hp) });
    this.ctf?.dropFrom(v);
    this.streaks.onKill(a !== v ? a : null, v);
    this.streaks.onDeath(v);
    if (this.mode === 'ffa' && !this.practice && a.kills >= this.rules.scoreLimit) this.endMatch();
    if (this.endAfterKill) { this.endAfterKill = false; this.endMatch(); }
  }

  // ---------- spawning ----------
  spawn(p) {
    let pos, yaw;
    if (isDummy(p)) { pos = p.botPos; yaw = p.botYaw; }
    else if (this.practice && this.practiceSpawn && !this.teamMode && !p.ai) { pos = this.practiceSpawn.pos; yaw = this.practiceSpawn.yaw; }
    else ({ pos, yaw } = this.pickSpawn(p));
    p.alive = true;
    p.hp = 100;
    p.armor = 0;
    p.frags = classOf(p.cls).frags;
    p.lastSt = null;
    p.spawnInfo = { t: now(), p: [pos.x, pos.y, pos.z], dirty: false };
    p.life++;
    p.respawnAt = null;
    p.pos = [pos.x, pos.y, pos.z];
    const prot = isDummy(p) ? 0 : MATCH.protect;
    p.protectUntil = now() + prot;
    p.lastDmg = -100;
    p.inHeli = false;
    this.pendingStates.delete(p.id);
    this.out({ t: 'spawn', id: p.id, p: [pos.x, pos.y, pos.z], yaw, life: p.life, prot, cls: p.cls });
    if (p.ai) this.bots.onSpawn(p, pos, yaw);
  }

  /** Spawn farthest from living enemies (random among the best few). CTF: only the team's own spawn area. */
  pickSpawn(p) {
    const pts = this.ctf && p.team ? ctfSpawnList(this.world, p.team) : this.world.spawnPoints;
    const enemies = [...this.players.values()].filter((o) => o !== p && o.alive && o.pos && (!this.teamMode || o.team !== p.team));
    const scored = pts.map((s) => {
      let min = 1e9;
      for (const e of enemies) min = Math.min(min, Math.hypot(s.x - e.pos[0], s.z - e.pos[2]));
      return { s, score: enemies.length ? min : Math.random() };
    }).sort((x, y) => y.score - x.score);
    const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
    let cx, cz;
    if (this.ctf && p.team) {
      // Face the enemy base.
      const eb = ctfBases(this.world)[otherTeam(p.team)];
      cx = eb.x; cz = eb.z;
    } else {
      const b = this.world.playBounds;
      cx = (b.minX + b.maxX) / 2; cz = (b.minZ + b.maxZ) / 2;
    }
    const yaw = Math.atan2(-(cx - pick.x), -(cz - pick.z));
    return { pos: pick, yaw };
  }

  // ---------- match flow ----------
  endMatch() {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    const standings = this.standings();
    let winnerTeam = null;
    const s = this.ctf ? this.ctf.score : this.mode === 'tdm' ? this.teamScore : null;
    if (s) winnerTeam = s.red === s.blue ? null : s.red > s.blue ? 'red' : 'blue';
    this.out({ t: 'end', standings, winner: this.teamMode ? null : standings[0]?.id ?? null, winnerTeam, score: s ? { ...s } : null });
  }

  standings() {
    return [...this.players.values()].filter((p) => !isDummy(p))
      .sort((x, y) => (y.caps - x.caps) * (this.ctf ? 1 : 0) || y.kills - x.kills || x.deaths - y.deaths)
      .map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, caps: p.caps, ret: p.returns, bot: !!p.ai }));
  }

  restart() {
    this.state = 'playing';
    this.overtime = false;
    this.endTime = now() + this.rules.timeLimit;
    this.ctf?.reset();
    this.teamScore = { red: 0, blue: 0 };
    this.heli?.reset();
    this.streaks.reset();
    this.projectiles.clear();
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.caps = 0; p.returns = 0; p.alive = false; p.respawnAt = null; p.hp = 100;
      p.streak = 0; p.items = []; p.armor = 0;
    }
    this.out({ t: 'restart', match: this.matchInfo() });
    for (const p of this.players.values()) if (p.everReady || p.bot) { p.ready = true; this.spawn(p); }
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
    this.bots.update(dt);
    this.heli?.update(dt);
    this.updateProjectiles(dt);
    this.streaks.update();
    if (this.ctf) {
      const capTeam = this.ctf.update();
      if (capTeam && this.state === 'playing') {
        const s = this.ctf.score;
        if (!this.practice && (s[capTeam] >= this.rules.scoreLimit || this.overtime)) this.endMatch();
      }
    }
    if (!this.practice && this.state === 'playing' && t >= this.endTime) {
      const s = this.ctf?.score;
      if (s && s.red === s.blue && !this.overtime) {
        this.overtime = true;
        this.endTime = t + CTF.overtime;
        this.out({ t: 'overtime', match: this.matchInfo() });
      } else this.endMatch();
    }

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
        players: [...this.players.values()].map((p) => ({ id: p.id, k: p.kills, d: p.deaths, caps: p.caps, ret: p.returns, team: p.team, ping: p.ai ? 0 : p.ping, hp: Math.round(p.hp), alive: p.alive, cls: p.cls, streak: p.streak })),
        match: this.matchInfo(),
      });
    }
    this.pingTimer += dt;
    if (this.pingTimer >= 2) {
      this.pingTimer = 0;
      this.out({ t: 'ping', ts: t });
    }
  }

  // ---------- grenades / markers ----------
  handleThrow(p, msg) {
    if (!p.alive || !Array.isArray(msg.o) || !Array.isArray(msg.v)) return;
    if (p.spawnInfo) p.spawnInfo.dirty = true;
    const kind = msg.kind === 'marker' ? 'marker' : 'frag';
    if (kind === 'frag') {
      if (p.frags <= 0) return;
      p.frags--;
    } else if (!this.streaks.consumeForMarker(p, msg.item)) return;
    const speed = Math.hypot(msg.v[0], msg.v[1], msg.v[2]);
    if (speed > 40) return;
    if (p.pos && Math.hypot(msg.o[0] - p.pos[0], msg.o[2] - p.pos[2]) > 6) return;
    const fuse = Math.max(0, Math.min(NADE.fuse, Number(msg.fuse) || 0));
    const pr = new Projectile({ kind, pos: msg.o, vel: msg.v, fuse });
    this.projectiles.set(`${p.id}:${msg.cid}`, { owner: p.id, cid: msg.cid, pr, item: msg.item || null });
    p.protectUntil = 0;
    this.out({ t: 'nade', id: p.id, cid: msg.cid, o: msg.o, v: msg.v, fuse, kind, item: msg.item || null }, null, p.id);
  }

  updateProjectiles(dt) {
    for (const [key, e] of this.projectiles) {
      const r = e.pr.advance(dt, this.world);
      if (r === 'boom') {
        this.projectiles.delete(key);
        this.out({ t: 'boom', id: e.owner, cid: e.cid, p: e.pr.pos.toArray().map((v) => Math.round(v * 100) / 100) });
        this.explode(e.owner, e.pr.pos, NADE.radius, NADE.maxDamage, 'frag', true);
      } else if (r === 'rest' && e.pr.kind === 'marker') {
        this.projectiles.delete(key);
        this.out({ t: 'marker', id: e.owner, cid: e.cid, p: e.pr.pos.toArray().map((v) => Math.round(v * 100) / 100), item: e.item });
        this.streaks.markerLanded(e.owner, e.item, e.pr.pos.clone());
      }
    }
  }

  /** Area damage attributed to `ownerId` (self damage yes; teammates spared in CTF). */
  explode(ownerId, center, radius, max, weapon, silent = false) {
    if (!silent) this.out({ t: 'blast', id: ownerId, p: center.toArray().map((v) => Math.round(v * 100) / 100), w: weapon });
    if (this.state !== 'playing') return;
    const a = this.players.get(ownerId) || { id: ownerId, kills: 0, hp: 0, team: null, bot: true };
    this.heli?.blast(a, center, radius, max, weapon);
    const chest = new THREE.Vector3();
    for (const v of [...this.players.values()]) {
      if (!v.alive || !v.pos) continue;
      if (this.teamMode && v !== a && v.team && v.team === a.team) continue;
      chest.set(v.pos[0], v.pos[1] + 1.0, v.pos[2]);
      const dmg = blastDamage(this.world, center, chest, radius, max);
      if (dmg > 1) {
        this.applyDamage(a, v, dmg, false, weapon);
        if (v.alive && v !== a && this.players.has(ownerId)) this.out({ t: 'hitc', target: v.id, hp: Math.round(v.hp), armor: Math.round(v.armor) }, ownerId);
      }
    }
  }

  /** Ids of remote players that have not been heard from for `timeout` seconds. */
  stalePlayers(timeout, exceptId) {
    const t = now();
    return [...this.players.values()].filter((p) => !p.bot && p.id !== exceptId && t - p.lastSeen > timeout).map((p) => p.id);
  }
}
