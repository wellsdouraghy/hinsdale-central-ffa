// Bot movement kit: grapple, dash, double jump (mantles come from the shared controller), plus roof handling.
// Same rules as a human (src/game/game.js _grappleKey / _findGrappleTarget): class range and cooldown, flag carriers x2
// cooldown, anchors only on what a view ray actually hits (never the ground, never through walls, >= 2.5 m away),
// a visible aim-then-fire beat, release / fling with Space. The cable shows on every client through the 'ga' field of
// the bot's 20 Hz state, exactly like a human's.
//
// What bots grapple for: vantage (roof edges; snipers / Grapplers mostly), closing on a target across open ground or up
// on a roof, escaping when hurt or outnumbered, long traversal along their path (swinging past poles), and getting
// unstuck (walls, enclosed yards). Bots on roofs perch for a while, then drop off an edge toward the fight (no fall
// damage) or grapple down / across when the edge is blocked.
import * as THREE from 'three';
import { KIT } from '../player.js';
import { classOf } from '../classes.js';
import { perchesFor } from './perches.js';

const DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Difficulty: keen = multiplier on every voluntary grapple chance, gap = min seconds between voluntary grapples,
// dodge / chase = dash chances, double = chance to thruster-jump after a fling, unstuck = chance to grapple out when stuck.
const SKILL = {
  easy:   { keen: 0.25, gap: 45, dodge: 0,    chase: 0.04, double: 0.25, unstuck: 0.4, search: 0 },
  normal: { keen: 0.55, gap: 15, dodge: 0.08, chase: 0.12, double: 0.6,  unstuck: 0.8, search: 1 },
  hard:   { keen: 1.1, gap: 8,   dodge: 0.2,  chase: 0.25, double: 0.9,  unstuck: 1,   search: 2 },
};
// Class appetite: keen multiplier, gap multiplier, and per-motive weights.
const BIAS = {
  grappler: { keen: 2.1, gap: 0.4,  vantage: 0.6, travel: 1, close: 1, perch: [5, 11] },
  recon:    { keen: 1,   gap: 0.85, vantage: 1.2, travel: 0.35, close: 0.15, perch: [14, 28] },
  brawler:  { keen: 0.9, gap: 1,    vantage: 0.05, travel: 0.5, close: 1.4, perch: [3, 6] },
  runner:   { keen: 0.8, gap: 1,    vantage: 0.1, travel: 0.6, close: 1, perch: [3, 7] },
  rifleman: { keen: 0.7, gap: 1,    vantage: 0.3, travel: 0.35, close: 0.7, perch: [5, 10] },
};
const PREF = { ar: 35, smg: 16, shotgun: 8, sniper: 80, pistol: 16 };

const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Vector3(), _n = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class BotMobility {
  constructor(brain) {
    this.brain = brain;
    this.c = brain.ctrl;
    this.stats = { grapples: 0, why: {}, dashes: 0, doubleJumps: 0, flings: 0, perches: 0, roofArrive: 0, roofFail: 0, breaks: 0 };
    this.reset(0);
  }

  get world() { return this.brain.auth.world; }
  get nav() { return this.brain.mgr.nav; }
  get skill() { return SKILL[this.brain.mgr.difficulty] || SKILL.normal; }
  get bias() { return BIAS[this.brain.p.cls] || BIAS.rifleman; }
  get perches() { return this.brain.mgr.perches; }

  reset(t) {
    this.state = 'idle';            // idle | aim | reel | air | settle | perch | descend
    this.plan = null;
    this.readyAt = t + rand(0.5, 2);
    this.nextVol = t + this.skill.gap * this.bias.gap * rand(0.35, 0.8);   // not straight out of spawn
    this.dashAt = t + rand(1, 3);
    this.searchAt = 0;
    this.hurtT = -99;
    this.stateT = t;
    this.perchUntil = 0;
    this.descend = null;
    this.failed = new Map();        // perch index -> time it failed
    this.lastStuck = 0;
  }

  groundY(x, z) { return this.world.groundY ? this.world.groundY(x, z) : 0; }

  /** Standing on something well above the ground (roof deck, dugout, bus...). */
  elevated() {
    const p = this.c.position;
    return this.c.grounded && p.y - this.groundY(p.x, p.z) > 2.0;
  }

  range() { return KIT.grappleRange * (classOf(this.brain.p.cls).grappleRangeMult ?? 1); }

  cooldown() {
    const carrying = this.brain.auth.ctf && this.brain.auth.ctf.carrying(this.brain.p);
    return KIT.grappleCooldown * (carrying ? 2 : 1) * (classOf(this.brain.p.cls).grappleCooldownMult ?? 1);
  }

  canGrapple(t) {
    const c = this.c, b = this.brain;
    return t >= this.readyAt && !c.grapple && !c.mantle && !c.ladder && !b.p.inHeli && !b.pilot
      && (this.state === 'idle' || this.state === 'descend' || this.state === 'perch');
  }

  onHurt(t) { this.hurtT = t; }

  _set(state, t) { this.state = state; this.stateT = t; }

  // ---------------- anchors (human rules) ----------------
  /** Ray toward `aim`: the anchor is whatever it hits first (not the ground, >= 2.5 m, inside range). */
  _ray(eye, aim, range) {
    _d.subVectors(aim, eye).normalize();
    const hit = this.c.raycast(eye, _d, range);
    if (!hit || hit.distance < 2.5) return null;
    const n = hit.face ? _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld) : _n.set(0, 1, 0);
    if (n.dot(_d) > 0) n.negate();
    const isGround = n.y > 0.7 && hit.point.y - this.groundY(hit.point.x, hit.point.z) < 0.8;
    if (isGround) return null;
    const b = this.world.playBounds;
    if (b && (hit.point.x < b.minX + 2 || hit.point.x > b.maxX - 2 || hit.point.z < b.minZ + 2 || hit.point.z > b.maxZ - 2)) return null;
    return { point: hit.point.clone().addScaledVector(n, 0.3), dist: hit.distance, ny: n.y };
  }

  /** A point on a grapple pole (aim-assist rules: line of sight to the pole, anchor just in front of it). */
  _pole(eye, pl, wantY, range) {
    const q = _q.set(pl.x, THREE.MathUtils.clamp(wantY, pl.y0 + 0.3, pl.y1 - 0.2), pl.z);
    const to = _e.subVectors(q, eye);
    const d = to.length();
    if (d < 2.5 || d > range) return null;
    to.normalize();
    const los = this.c.raycast(eye, to, d);
    if (los && los.distance < d - Math.max(0.8, pl.r + 0.5)) return null;
    return { point: q.clone().addScaledVector(to, -(pl.r + 0.35)), dist: d, pole: true };
  }

  /** Best roof-edge perch reachable with one grapple: `score(perch, dHoriz)` (lower is better, null = skip). */
  _roofAnchor(eye, score, t, limit) {
    const P = this.perches;
    if (!P?.ready) return null;
    const range = this.range(), me = this.c.position;
    const cand = [];
    for (const pr of P.list) {
      if (!pr.edge) continue;
      const dh = Math.hypot(pr.x - me.x, pr.z - me.z);
      if (dh < 5 || dh > range * 0.92) continue;
      if (pr.y - me.y < 2.2 || Math.hypot(dh, pr.y - eye.y) > range * 0.95) continue;
      const f = this.failed.get(pr.i);
      if (f !== undefined && t - f < 45) continue;
      const s = score(pr, dh);
      if (s === null || s === undefined) continue;
      cand.push([s, pr]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const tries = Math.min(cand.length, limit);
    for (let k = 0; k < tries; k++) {
      const pr = cand[k][1];
      // Standing room on the deck (rooftop units, penthouses).
      _q.set(pr.x, pr.y + 0.06, pr.z);
      if (this.c._resolve(_q, 1.8, _e).lengthSq() > 1e-4) { this.failed.set(pr.i, t); continue; }
      for (const up of [1.0, 0.4, 1.7]) {
        const r = this._ray(eye, _q.set(pr.x, pr.y + up, pr.z), range);
        if (!r) continue;
        if (r.point.y < pr.y - 1.3 || Math.hypot(r.point.x - pr.x, r.point.z - pr.z) > 4.5) continue;
        return { ...r, perch: pr };
      }
    }
    return null;
  }

  /**
   * Anchor that carries us toward `D`: poles (preferred, they swing nicely) and view rays fanned around the bearing.
   * opts: { minProgress, els (deg), yaws (deg), maxUp }
   */
  _travelAnchor(eye, D, opts) {
    const range = this.range();
    const me = this.c.position;
    const dist0 = hd(me, D);
    let best = null, bestS = -Infinity;
    const consider = (r, bonus) => {
      if (!r) return;
      const prog = dist0 - hd(r.point, D);
      if (prog < opts.minProgress) return;
      const up = r.point.y - eye.y;
      if (opts.maxUp !== undefined && up > opts.maxUp) return;
      // Don't fly into a wall right next to the destination unless that is the point.
      const s = prog + bonus - Math.max(0, up - 10) * 0.8 - (r.ny > 0.7 ? 2 : 0);
      if (s > bestS) { bestS = s; best = r; }
    };
    const poles = this.world.grapplePoles || [];
    const pc = [];
    for (const pl of poles) {
      const dh = Math.hypot(pl.x - me.x, pl.z - me.z);
      if (dh < 6 || dh > range * 0.95) continue;
      const prog = dist0 - Math.hypot(pl.x - D.x, pl.z - D.z);
      if (prog < opts.minProgress) continue;
      pc.push([prog, pl, dh]);
    }
    pc.sort((a, b) => b[0] - a[0]);
    for (const [, pl, dh] of pc.slice(0, 5)) consider(this._pole(eye, pl, eye.y + THREE.MathUtils.clamp(dh * 0.3, 2, 9), range), 5);
    const bearing = Math.atan2(D.x - me.x, D.z - me.z);
    for (const yo of opts.yaws) for (const el of opts.els) {
      const a = bearing + yo * DEG, e = el * DEG;
      _q.set(eye.x + Math.sin(a) * Math.cos(e) * range, eye.y + Math.sin(e) * range, eye.z + Math.cos(a) * Math.cos(e) * range);
      consider(this._ray(eye, _q, range), 0);
    }
    return best;
  }

  // ---------------- decisions (think rate, ~6 Hz) ----------------
  think(t) {
    const b = this.brain, c = this.c, p = b.p;
    if (!p.alive || b.pilot) return;
    if (this.perches && !this.perches.ready) return;   // still scanning roofs (first second of the match)
    const sk = this.skill, bi = this.bias;
    const eye = c.getEye(new THREE.Vector3());
    const tgt = b.target && !b.target.heli ? b.target : null;
    const tpos = tgt ? new THREE.Vector3().fromArray(tgt.pos) : null;
    const dist = tpos ? hd(tpos, c.position) : Infinity;
    const carrying = b.auth.ctf && b.auth.ctf.carrying(p);

    // Already on a roof (grappled, mantled or climbed up): perch for a moment, then come down.
    if (this.state === 'idle' && this.elevated()) {
      if (Math.random() < 0.6 && !carrying) this._startPerch(t, rand(2, 5));
      else this._startDescend(t);
    }
    if (this.state === 'perch') this._thinkPerch(t);

    this._thinkDash(t, tpos, dist);
    if (!this.canGrapple(t) || t < this.searchAt) return;
    if (b.heliGoal) return;

    // Stuck against something (a wall, a fenced yard, a roof unit): grapple out toward where we were going.
    if (b.stuckCount >= 2 && t - this.lastStuck > 2) {
      this.lastStuck = t;
      if (Math.random() < sk.unstuck) {
        const D = (b.path && b.path[Math.min(b.pathI, b.path.length - 1)]) || b.goal || this.descend?.target;
        if (D) {
          const r = this._travelAnchor(eye, D, { minProgress: 2, els: [12, 30, 50, 68], yaws: [-50, -25, 0, 25, 50] });
          if (r) return this._aim(t, r, 'unstuck', { releaseH: 2.5, land: D.clone(), fling: true });
        }
      }
    }

    // Descending but the edge is blocked: grapple across / down toward where we are heading.
    if (this.state === 'descend' && this.descend && this.descend.fails >= 2) {
      const D = this.descend.target;
      const r = this._travelAnchor(eye, D, { minProgress: 6, els: [-35, -20, -8, 4, 15], yaws: [-40, -20, 0, 20, 40], maxUp: 4 });
      this.descend.fails = 0;
      if (r) return this._aim(t, r, 'descend', { releaseH: Math.max(3, r.dist * 0.5), land: D.clone(), fling: true });
    }

    const keen = sk.keen * bi.keen;
    const vol = t >= this.nextVol;
    const roll = (w) => vol && Math.random() < w * keen;
    const onGround = c.grounded && !this.elevated();
    const hp = p.hp ?? 100;

    // Escape: hurt and under fire, or outnumbered: get up and out of sight, or just away.
    const outnumbered = (b.seen || 0) >= 2;
    if ((b.visible && ((hp < 45 && t - this.hurtT < 1.5) || outnumbered)) && roll(outnumbered ? 0.12 : 0.22)) {
      const threat = tpos || c.position;
      const away = new THREE.Vector3().subVectors(c.position, threat).setY(0).normalize();
      const roof = this._roofAnchor(eye, (pr, dh) => {
        const dx = pr.x - c.position.x, dz = pr.z - c.position.z;
        if ((dx * away.x + dz * away.z) / dh < -0.2) return null;              // not toward the threat
        return dh * 0.6 - Math.hypot(pr.x - threat.x, pr.z - threat.z) * 0.4;
      }, t, 2 + sk.search * 2);
      if (roof && !carrying) return this._aim(t, roof, 'escape', { perch: roof.perch, hold: rand(2.5, 5) });
      const D = c.position.clone().addScaledVector(away, 45);
      const r = this._travelAnchor(eye, D, { minProgress: 10, els: [6, 16, 28], yaws: [-50, -25, 0, 25, 50] });
      if (r) return this._aim(t, r, 'escape', { releaseH: Math.max(3, r.dist * 0.35), land: D, fling: true });
      this.searchAt = t + 1;
    }

    // Chase: target is up on a roof and we are on the ground: follow them up.
    if (tgt && tpos && onGround && (b.visible || t - b.lastSeenT < 3) && tpos.y - this.groundY(tpos.x, tpos.z) > 2.5
      && roll(0.15 * Math.max(0.4, bi.close))) {
      const roof = this._roofAnchor(eye, (pr, dh) => {
        const dt = Math.hypot(pr.x - tpos.x, pr.z - tpos.z);
        return dt > 14 || Math.abs(pr.y - tpos.y) > 2 ? null : dt + dh * 0.15;
      }, t, 2 + sk.search * 2);
      if (roof) return this._aim(t, roof, 'chaseRoof', { perch: roof.perch, hold: rand(4, 8) });
      this.searchAt = t + 1;
    }

    // Close the distance across open ground (short-range guns especially).
    const gid = b.gun?.id || 'ar';
    const pref = PREF[gid] || 20;
    if (tgt && tpos && b.visible && onGround && gid !== 'sniper' && dist > Math.max(pref + 14, 26) && dist < this.range() * 1.3
      && Math.abs(tpos.y - c.position.y) < 3 && roll(0.14 * bi.close * (b.outOfRange ? 1.6 : 1))) {
      const r = this._travelAnchor(eye, tpos, { minProgress: 12, els: [4, 12, 22], yaws: [-30, -14, 0, 14, 30] });
      if (r) return this._aim(t, r, 'close', { releaseH: Math.max(3.5, r.dist * 0.3), land: tpos.clone(), stopNear: tpos.clone(), stopD: pref + 5, fling: true });
      this.searchAt = t + 1.2;
    }

    // Vantage: grab a roof edge overlooking where the fight is (snipers and Grapplers mostly).
    if (!b.visible && onGround && !carrying && roll(0.1 * bi.vantage)) {
      const focus = this._focus(t);
      const fd = new THREE.Vector3().subVectors(focus, c.position).setY(0);
      const fl = fd.length() || 1;
      fd.divideScalar(fl);
      const sight = b.d.sight * (gid === 'sniper' ? 1 : 0.6);
      const roof = this._roofAnchor(eye, (pr, dh) => {
        const dx = pr.x - c.position.x, dz = pr.z - c.position.z;
        if (fl > 20 && (dx * fd.x + dz * fd.z) / dh < 0.2) return null;          // roughly on the way
        const df = Math.hypot(pr.x - focus.x, pr.z - focus.z);
        if (df > sight) return null;
        return Math.abs(dh - 28) * 0.5 + df * 0.25 - (pr.y - c.position.y) * 0.3;
      }, t, 2 + sk.search * 2);
      if (roof) return this._aim(t, roof, 'vantage', { perch: roof.perch, hold: rand(...bi.perch) });
      this.searchAt = t + 1.5;
    }

    // Traversal: a long way to go along the path: swing / zip along it.
    if (!b.visible && onGround && b.path && roll(0.09 * bi.travel)) {
      const D = this._lookahead(Math.min(this.range() * 0.9, 55));
      if (D && hd(D, c.position) > 30) {
        const r = this._travelAnchor(eye, D, { minProgress: 16, els: [8, 18, 30], yaws: [-22, -10, 0, 10, 22], maxUp: 14 });
        if (r) return this._aim(t, r, 'travel', { releaseH: r.pole ? 2.2 : Math.max(4, r.dist * 0.3), land: D, fling: true });
      }
      this.searchAt = t + 1.5;
    }
  }

  /** Where the action is (freshest memory, else the current goal, else the middle of the map). */
  _focus(t) {
    const b = this.brain;
    let m = null;
    for (const mm of b.memory.values()) if (!m || mm.t > m.t) m = mm;
    if (m && t - m.t < 8) return m.pos.clone();
    if (b.goal) return b.goal.clone();
    const pb = this.world.playBounds;
    return new THREE.Vector3((pb.minX + pb.maxX) / 2, 0, (pb.minZ + pb.maxZ) / 2);
  }

  /** Point `ahead` metres further along the current path (or its end). */
  _lookahead(ahead) {
    const b = this.brain;
    if (!b.path || b.pathI >= b.path.length) return null;
    let prev = this.c.position, acc = 0;
    for (let i = b.pathI; i < b.path.length; i++) {
      const w = b.path[i];
      const seg = hd(prev, w);
      if (acc + seg >= ahead) return prev.clone().lerp(w, (ahead - acc) / seg).setY(w.y);
      acc += seg; prev = w;
    }
    return acc > 20 ? b.path[b.path.length - 1].clone() : null;
  }

  _thinkDash(t, tpos, dist) {
    const b = this.brain, c = this.c, sk = this.skill;
    if (t < this.dashAt || !c.grounded || c.grapple || c.mantle || c.ladder || this.state === 'perch') return;
    let dx = 0, dz = 0;
    if (tpos && b.visible) {
      const to = _e.subVectors(tpos, c.position).setY(0).normalize();
      if (t - this.hurtT < 0.5 && Math.random() < sk.dodge) { dx = -to.z * b.strafe; dz = to.x * b.strafe; }       // dodge sideways
      else if (b.outOfRange && dist < 60 && Math.random() < sk.chase * 0.4) { dx = to.x; dz = to.z; }              // close in
      else if ((b.p.hp ?? 100) < 35 && t - this.hurtT < 1 && Math.random() < sk.dodge) { dx = -to.x; dz = -to.z; } // back off
    } else if (!b.visible && c.sprinting && this.state === 'idle' && Math.random() < sk.chase * 0.012) {
      const h = c.horizontalSpeed();
      if (h > 4) { dx = c.velocity.x / h; dz = c.velocity.z / h; }                                               // burst along the path
    }
    if (!dx && !dz) return;
    c.dash(dx, dz);
    this.dashAt = t + KIT.dashCooldown + rand(0.2, 1.5);
    this.stats.dashes++;
  }

  // ---------------- grapple lifecycle ----------------
  _aim(t, r, why, plan) {
    this.plan = { anchor: r.point.clone(), pole: !!r.pole, why, t0: t, ...plan };
    this._set('aim', t);
  }

  _fire(t) {
    const c = this.c, pl = this.plan;
    const eye = c.getEye(_e);
    _d.subVectors(pl.anchor, eye);
    const dist = _d.length();
    // Re-check what the bot is actually looking at now (it kept moving while turning).
    if (dist > this.range() + 1 || dist < 2.5 || c.raycast(eye, _d.normalize(), dist - 0.6)) return this._abort(t, 0.8);
    c.startGrapple(pl.anchor);
    pl.startH = hd(c.position, pl.anchor);
    pl.fireT = t;
    this.readyAt = t + this.cooldown();
    const sk = this.skill, bi = this.bias;
    if (pl.why !== 'unstuck' && pl.why !== 'descend') this.nextVol = t + sk.gap * bi.gap * rand(0.7, 1.3);
    else this.nextVol = Math.max(this.nextVol, t + 3);
    this.stats.grapples++;
    this.stats.why[pl.why] = (this.stats.why[pl.why] || 0) + 1;
    this._set('reel', t);
  }

  _abort(t, retry = 1) {
    if (this.plan?.perch) this.failed.set(this.plan.perch.i, t);
    this.plan = null;
    this.searchAt = t + retry;
    this._set(this.elevated() ? 'descend' : 'idle', t);
    if (this.state === 'descend') this._startDescend(t);
  }

  _startPerch(t, hold) {
    this._set('perch', t);
    this.perchUntil = t + hold;
    this.perchMax = t + hold * 2 + 4;
    this.stats.perches++;
  }

  _thinkPerch(t) {
    const b = this.brain;
    if (!this.elevated() && this.c.grounded) { this._set('idle', t); return; }
    const hurt = t - this.hurtT < 1 && (b.p.hp ?? 100) < 50;
    const fighting = b.visible && t < this.perchMax;
    if (hurt || (t > this.perchUntil && !fighting) || t > this.perchMax) this._startDescend(t, hurt && b.target?.pos ? new THREE.Vector3().fromArray(b.target.pos) : null);
  }

  /** Walk off the nearest edge toward where we want to go (or away from `threat`). */
  _startDescend(t, threat = null) {
    const c = this.c, me = c.position;
    let pref;
    if (threat) pref = me.clone().multiplyScalar(2).sub(threat);
    else pref = this.brain.goal ? this.brain.goal.clone() : this._focus(t);
    this.descend = { target: null, checkT: t + 1, lastD: Infinity, fails: 0, bad: new Set(), pref };
    this._pickDescend();
    this._set('descend', t);
  }

  _pickDescend() {
    const d = this.descend, me = this.c.position, nav = this.nav;
    const base = Math.atan2(d.pref.x - me.x, d.pref.z - me.z);
    let best = null, bestC = Infinity, bestK = 0;
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
      if (d.bad.has(k)) continue;
      const a = base + k * 45 * DEG, sx = Math.sin(a), sz = Math.cos(a);
      for (let r = 2; r <= 70; r += 1.5) {
        const x = me.x + sx * r, z = me.z + sz * r;
        if (!nav.walkableAt(x, z)) continue;
        const cost = r + Math.abs(k) * 7;
        if (cost < bestC) { bestC = cost; bestK = k; best = new THREE.Vector3(x + sx * 1.5, this.groundY(x, z), z + sz * 1.5); }
        break;
      }
    }
    if (!best) {
      const i = nav.nearest(me.x, me.z, 60);
      best = i >= 0 ? nav.center(i) : nav.randomPoint();
      d.bad.clear();
    }
    d.target = best; d.k = bestK; d.lastD = Infinity;
  }

  // ---------------- every frame ----------------
  /**
   * Adjusts the bot's wanted world-space move `dir` for the current mobility state. Returns
   * { look: {yaw, pitch} | null, lookForce, jump, sprint }.
   */
  steer(dt, t, dir) {
    const c = this.c, b = this.brain;
    const out = this._out || (this._out = { look: null, lookForce: false, jump: false, sprint: undefined });
    out.look = null; out.lookForce = false; out.jump = false; out.sprint = undefined;
    if (!b.p.alive) return out;
    switch (this.state) {
      case 'aim': {
        const pl = this.plan;
        const eye = c.getEye(_e);
        _d.subVectors(pl.anchor, eye);
        const yaw = Math.atan2(-_d.x, -_d.z), pitch = Math.atan2(_d.y, Math.hypot(_d.x, _d.z));
        out.look = this._look(yaw, pitch); out.lookForce = true;
        let dy = yaw - c.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        const err = Math.max(Math.abs(dy), Math.abs(pitch - c.pitch));
        const age = t - this.stateT;
        if (c.mantle || c.ladder || !b.p.alive) this._abort(t);
        else if (err < 5 * DEG || (age > 0.8 && err < 14 * DEG)) this._fire(t);
        else if (age > 1.3) this._abort(t);
        break;
      }
      case 'reel': {
        const pl = this.plan;
        if (!c.grapple) { this._afterReel(t); break; }
        if (!(b.visible && b.target)) {
          const eye = c.getEye(_e);
          _d.subVectors(pl.anchor, eye);
          out.look = this._look(Math.atan2(-_d.x, -_d.z), Math.atan2(_d.y, Math.hypot(_d.x, _d.z)) * 0.6);
        }
        const h = hd(c.position, pl.anchor);
        // Roof edge: still below the deck when we reach it: vault (fling) over the edge instead of hanging under it.
        if (pl.perch && h < 2.8 && c.position.y < pl.perch.y + 0.2 && t - pl.fireT > 0.3) {
          out.jump = true;
          pl.land = new THREE.Vector3(pl.perch.x, pl.perch.y, pl.perch.z);
          pl.vault = true; pl.double = c.position.y < pl.perch.y - 0.6;
          this.stats.flings++;
          this._set('air', t);
          break;
        }
        let release = pl.releaseH > 0 && h < pl.releaseH && t - pl.fireT > 0.25;
        if (pl.stopNear && hd(c.position, pl.stopNear) < pl.stopD) release = true;
        if (release) {
          out.jump = !!pl.fling;                 // Space mid-reel = fling (the controller releases with a boost)
          if (!pl.fling) c.releaseGrapple(false);
          this.stats.flings += pl.fling ? 1 : 0;
          pl.double = Math.random() < this.skill.double;
          this._set('air', t);
        }
        break;
      }
      case 'air': {
        const pl = this.plan;
        if (c.grapple) break;                    // the fling lands next frame
        if (pl?.land) {
          _d.set(pl.land.x - c.position.x, 0, pl.land.z - c.position.z);
          const l = _d.length();
          if (l > 1) dir.copy(_d.divideScalar(l));
          // Thruster jump near the top of the arc when the landing spot is still a way off.
          const short = pl.vault ? c.position.y < pl.land.y + 0.3 : l > 8;
          if (pl.double && !pl.didDouble && c.velocity.y < 0.8 && short && c.airJumps > 0 && !c.grounded) {
            out.jump = true; pl.didDouble = true; this.stats.doubleJumps++;
          }
        }
        // Landed (or mantling / on a ladder): settle decides between perch, walking off a roof, or carrying on.
        if ((c.grounded && t - this.stateT > 0.15) || t - this.stateT > 3.5 || c.mantle || c.ladder) this._set('settle', t);
        break;
      }
      case 'settle': {
        if (c.mantle) break;
        if (c.grounded || t - this.stateT > 1.6) {
          const pl = this.plan;
          if (this.elevated()) {
            if (pl?.perch) this.stats.roofArrive++;
            if (pl?.perch && pl.hold) this._startPerch(t, pl.hold);
            else this._startDescend(t);
          } else {
            if (pl?.perch) { this.stats.roofFail++; this.failed.set(pl.perch.i, t); }
            this._land(t);
          }
          this.plan = null;
        }
        break;
      }
      case 'perch': {
        // Hold the edge: strafe a little when fighting (never off the edge), otherwise watch the action.
        dir.set(0, 0, 0);
        if (b.visible && b.target && !b.target.heli) {
          _d.set(b.target.pos[0] - c.position.x, 0, b.target.pos[2] - c.position.z).normalize();
          dir.set(-_d.z * b.strafe * 0.5, 0, _d.x * b.strafe * 0.5);
          this._edgeGuard(dir);
        } else if (!(b.target && t - b.lastSeenT < 1.5)) {
          const f = this._focus(t);
          _d.set(f.x - c.position.x, 0, f.z - c.position.z);
          if (_d.lengthSq() > 1) out.look = this._look(Math.atan2(-_d.x, -_d.z), -4 * DEG);
        }
        out.sprint = false;
        break;
      }
      case 'descend': {
        const d = this.descend;
        if (!d) { this._set('idle', t); break; }
        if (!this.elevated() && c.grounded && t - this.stateT > 0.3) { this._land(t); break; }
        // Fighting from up here is fine; otherwise head for the edge.
        if (b.visible && !b.outOfRange) break;
        _d.set(d.target.x - c.position.x, 0, d.target.z - c.position.z);
        const l = _d.length();
        if (l > 0.5) dir.copy(_d.divideScalar(l));
        out.sprint = true;
        if (t > d.checkT) {
          d.checkT = t + 1;
          if (c.grounded && l > d.lastD - 0.6) {      // no progress: blocked by a roof unit / wall
            d.fails++;
            d.bad.add(d.k);
            if (d.fails % 2 === 1) out.jump = true;
            if (d.fails >= 3) this._pickDescend();
          }
          d.lastD = l;
        }
        break;
      }
      default: break;
    }
    return out;
  }

  _look(yaw, pitch) { const o = this._lk || (this._lk = { yaw: 0, pitch: 0 }); o.yaw = yaw; o.pitch = pitch; return o; }

  /** Cancels movement that would step off a drop (perched bots stay on their roof). */
  _edgeGuard(dir) {
    if (dir.lengthSq() < 0.01) return;
    const p = this.c.position;
    _q.set(dir.x, 0, dir.z).normalize();
    _e.set(p.x + _q.x * 1.1, p.y + 0.8, p.z + _q.z * 1.1);
    const hit = this.brain.mgr.hitscan.castWorld(_e, DOWN, 2.2);
    if (!hit) dir.set(0, 0, 0);
  }

  _afterReel(t) {
    // Cable arrived (auto-mantle may be running) or broke.
    this._set('settle', t);
  }

  _land(t) {
    this.plan = null;
    this.descend = null;
    this._set('idle', t);
    const b = this.brain;
    b.path = null; b.repathT = 0;              // fresh path from where we came down
  }

  /** Controller events from this frame (before the brain clears them). */
  afterMove(t, events) {
    for (const ev of events) {
      if (ev === 'grappleBreak') this.stats.breaks++;
    }
  }

  /** The bot left the ground by other means (spawn, death): forget everything. */
  onSpawn(t) { this.reset(t); }
}
