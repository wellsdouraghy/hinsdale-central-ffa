// Game: runs one match (practice or online) on top of an already-loaded World.
// Owns the local player, weapons, remote players, HUD updates and the per-frame loop body.
import * as THREE from 'three';
import { PlayerController, KIT } from './player.js';
import { createCable } from './cable.js';
import { WEAPON_STATS, damageAt, MELEE } from './weapons.js';
import { Arsenal, weaponName } from './arsenal.js';
import { createHitscan } from './hitscan.js';
import { RemotePlayer, PLAYER_COLORS } from './remotePlayer.js';
import { now as clock, MATCH } from './authority.js';
import { colorCss } from '../ui/hud.js';
import { TEAM_COLORS, TEAM_CSS, TEAM_NAMES, TEAMS, otherTeam } from './ctf.js';
import { CtfView } from './ctfView.js';
import { CLASSES, CLASS_IDS, DEFAULT_CLASS, classOf, lookForClass } from './classes.js';
import { Throwables } from './throwables.js';
import { StreakView } from './streakView.js';
import { StrikeView } from './strikeView.js';
import { StrikeLaptop } from './strikeLaptop.js';
import { FinisherView } from './finisherView.js';
import { MAP_ALLY, MAP_ENEMY } from '../ui/minimap.js';
import { every } from '../net/ticker.js';
import { KillCamRecorder, KillCam } from './killcam.js';
import { HeliView } from './heliView.js';
import { setConformWorld } from './groundConform.js';

const LOCAL_FOOTSTEPS = false;   // the player never hears their own footsteps

const DEG = Math.PI / 180;
const BASE_SENS = 0.0021;   // radians per mouse pixel at sensitivity 1
const STATE_INTERVAL = 1 / 20;
const REGEN_DELAY = MATCH.regenDelay, REGEN_RATE = MATCH.regenRate;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

export class Game {
  constructor({ world, scene, camera, effects, settings, session, hud, minimap, audio, input, ui }) {
    Object.assign(this, { world, scene, camera, effects, settings, session, hud, minimap, audio, input, ui });
    this.localId = session.localId;
    this.hitscan = createHitscan(world);

    // First-person overlay (viewmodel) scene.
    this.overlayScene = new THREE.Scene();
    this.overlayCamera = new THREE.PerspectiveCamera(70, camera.aspect, 0.01, 20);
    this.overlayScene.add(new THREE.HemisphereLight(0xe8f0ff, 0x4a4036, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.copy(world.sunDirection || new THREE.Vector3(0.4, 0.8, 0.3)).multiplyScalar(10);
    this.overlayScene.add(sun);
    this.overlayScene.add(this.overlayCamera);

    this.player = new PlayerController(world);
    this.player.onFellOut = () => this._rescue();
    this.arsenal = new Arsenal(this.overlayScene, audio);
    this.selectedClass = CLASSES[settings.cls] ? settings.cls : DEFAULT_CLASS;
    this.spawnClass = this.selectedClass;
    this.throwables = new Throwables(this);
    this.streaks = new StreakView(this);
    this.strikeView = new StrikeView(this);
    this.laptop = new StrikeLaptop(this);
    this.fin = new FinisherView(this);
    setConformWorld(world);   // bodies lie on terrain slopes (groundConform.js; no-op on flat campuses)
    this.killcamRec = new KillCamRecorder();
    this.killcam = null;
    this.deathFlow = null;     // { phase: 'pre'|'killcam'|'screen'|'waiting', t, until }
    this.hitStop = 0;
    this.meleeShake = 0;

    this.alive = false;
    this.deployed = false;
    this.hp = 100;
    this.life = 0;
    this.lastDamage = -100;
    this.protectUntil = 0;
    this.deathTime = 0;
    this.meleeUntil = 0;
    this.stateTimer = 0;
    this.stepDist = 0;
    this.wasGrounded = true;
    this.airPeak = 0;
    this.lookDelta = { x: 0, y: 0 };
    this.deathCam = 0;
    this.adsToggled = false;
    this.ctfView = null;
    this.enemyBars = new Map();
    this.teamScore = { red: 0, blue: 0 };
    this.heliView = null;
    this.piloting = false;
    this._frameDx = 0; this._frameDy = 0;   // id -> { hp, armor, until } for enemies we are damaging
    this.spawnInfo = null;
    this.swapOpen = false;
    // Movement kit.
    this.grappleReadyAt = 0;
    this.grappleCd = KIT.grappleCooldown;
    this.dashReadyAt = 0;
    this.fovKick = 0;
    this.grappleTarget = null;
    this.cable = createCable(this.scene, 0.008);

    this.roster = new Map();
    this.remotes = new Map();
    this.blips = new Map();
    this.match = { mode: 'ffa', state: 'playing', practice: false, scoreLimit: MATCH.scoreLimit, respawnDelay: MATCH.respawnDelay, overtime: false, timeLeft: null, timeRef: clock() };

    session.onMessage = (m) => this.handle(m);
    // Movement state goes out at 20 Hz from a worker timer, independent of the frame rate (a slow machine or a
    // background tab must not freeze us for everyone else).
    this._stopStateTicker = every(50, () => this._sendState());
    this._applyWelcome(session.welcome);
    this.hud.reset();
    this.hud.show(true);
    if (this.match.state === 'ended') this.ui.showEnd(this._endData(this._lastEnd));
    else this.ui.showDeploy({ mode: 'deploy', selected: this.selectedClass });
  }

  // ======================= roster / remotes =======================
  _applyMatch(mi) {
    this.match.mode = mi.mode || 'ffa';
    this.match.state = mi.state;
    this.match.practice = mi.practice;
    this.match.scoreLimit = mi.scoreLimit;
    this.match.respawnDelay = mi.respawnDelay ?? MATCH.respawnDelay;
    this.match.overtime = !!mi.overtime;
    this.match.timeLeft = mi.timeLeft;
    this.match.timeRef = clock();
  }

  _applyWelcome(w) {
    this._applyMatch(w.match);
    if (w.match.teamScore) this.teamScore = { ...w.match.teamScore };
    if (w.match.heli) this.heliView = new HeliView(this, w.match.heli);
    if (w.match.ctf) this.ctfView = new CtfView(this, w.match.ctf);
    for (const p of w.players) this._addPlayer(p);
    if (w.match.state === 'ended') this._lastEnd = { standings: [], winner: null };
  }

  get isCtf() { return this.match.mode === 'ctf'; }
  get isTdm() { return this.match.mode === 'tdm'; }
  /** Team modes (CTF, TDM): friendly fire off, teammates on the minimap, team-grouped scoreboard. */
  get isTeams() { return this.match.mode === 'ctf' || this.match.mode === 'tdm'; }
  get myTeam() { return this.roster.get(this.localId)?.team ?? null; }
  isTeammate(id) {
    if (!this.isTeams) return false;
    const t = this.roster.get(id)?.team;
    return !!t && t === this.myTeam;
  }
  _colorFor(p) { return p.team ? TEAM_COLORS[p.team] : PLAYER_COLORS[p.color % PLAYER_COLORS.length]; }

  _addPlayer(p) {
    const entry = {
      id: p.id, name: p.name, color: this._colorFor(p), paletteIndex: p.color, team: p.team || null,
      k: p.k || 0, d: p.d || 0, caps: p.caps || 0, ret: p.ret || 0, ping: p.ping, alive: !!p.alive, bot: !!p.bot, ai: !!p.ai,
      pid: p.pid || null, cls: p.cls,
    };
    this.roster.set(p.id, entry);
    if (p.id === this.localId) return;
    const r = new RemotePlayer({ id: p.id, name: p.name, color: entry.color, scene: this.scene });
    r.bot = !!p.bot && !p.ai;   // static practice dummy
    r.ai = !!p.ai;
    r.protectUntil = 0;
    this.remotes.set(p.id, r);
    if (p.alive && p.pos) r.spawn(_v1.fromArray(p.pos), p.yaw || 0, p.life);
    else r.life = p.life ?? -1;
  }

  _removePlayer(id) {
    const r = this.remotes.get(id);
    if (r) { r.cable?.dispose(); r.dispose(); this.remotes.delete(id); }
    this.roster.delete(id);
    this.blips.delete(id);
  }

  nameOf(id) { return this.roster.get(id)?.name ?? '???'; }

  // ======================= network messages =======================
  handle(m) {
    const t = clock();
    switch (m.t) {
      case 'join':
        if (!this.roster.has(m.p.id)) {
          this._addPlayer(m.p);
          if (!m.p.bot) this.ui.toast(`${m.p.name} joined`);
        }
        break;
      case 'leave': {
        const name = this.nameOf(m.id);
        this.fin.cancelFor(m.id);
        this._removePlayer(m.id);
        this.ui.toast(`${name} left`);
        break;
      }
      case 'sts':
        for (const s of m.s) {
          if (s.id === this.localId) continue;
          this.remotes.get(s.id)?.pushState(s, t);
        }
        break;
      case 'shot': this._remoteShot(m); break;
      case 'melee': {
        const r = this.remotes.get(m.id);
        if (r) { this.audio.melee(r.eye(_v1)); if (m.hit) this.audio.meleeHit?.(r.eye(_v1)); r.character.melee?.(); }
        break;
      }
      case 'nade': this.throwables.onRemoteThrow(m); break;
      case 'boom': this.throwables.onBoom(m); break;
      case 'marker': this.throwables.onMarker(m); break;
      case 'blast': this.throwables.explosionAt(new THREE.Vector3().fromArray(m.p), 8); break;
      case 'items': this.streaks.onItems(m); break;
      case 'uav': this.streaks.onUav(m); break;
      case 'armor': this.streaks.onArmor(m); break;
      case 'strike': this.strikeView.onStrike(m); break;
      case 'finisher': this.fin.onFinisher(m); break;
      case 'crate': this.streaks.onCrate(m); break;
      case 'tscore': this.teamScore = { ...m.score }; break;
      case 'heli': this.heliView?.apply(m.h, m.spawned); break;
      case 'hst': this.heliView?.onPose(m); break;
      case 'rocket': this.heliView?.onRocket(m); break;
      case 'rboom': this.heliView?.onRocketBoom(m); break;
      case 'heliBoom':
        this.heliView?.onBoom(m);
        this.announce(m.cause === 'crash' ? 'Helicopter crashed' : 'Helicopter destroyed', m.by != null ? this.nameOf(m.by) : '', '#ff4d55', 'neutral');
        break;
      case 'heliSpark': this.heliView?.onSpark(m); break;
      case 'heliExit':
        if (m.id === this.localId) {
          this.heliView?.pilot?.dispose();
          if (this.heliView) this.heliView.pilot = null;
          this.player.teleport(new THREE.Vector3().fromArray(m.p), this.player.yaw);
          if (m.push) this.player.velocity.fromArray(m.push);   // bailed out mid-air (no fall damage)
          if (m.bail) this.announce('Bailed out', 'The helicopter is coming down', '#f2b544', 'neutral');
          this.arsenal.viewmodel?.equip();
          this.stateTimer = STATE_INTERVAL;
        }
        break;
      case 'cls': { const e = this.roster.get(m.id); if (e) e.cls = m.cls; break; }
      case 'swapped': {
        const e = this.roster.get(m.id);
        if (e) e.cls = m.cls;
        if (m.id === this.localId && this.alive) {
          this._applyClass(m.cls, clock());
          this.audio.equip();
          this._closeSwap();
          this.ui.toast(`Class: ${classOf(m.cls).name}`);
        }
        break;
      }
      case 'hitc':
        if (m.target !== this.localId) this.enemyBars.set(m.target, { hp: m.hp, armor: m.armor, until: clock() + 2.5 });
        break;
      case 'dmg': {
        const e = this.roster.get(m.id);
        if (m.id === this.localId) this._takeDamage(m);
        else if (e) e.hp = m.hp;
        break;
      }
      case 'kill': this._onKill(m); break;
      case 'spawn': this._onSpawn(m); break;
      case 'flag': this.ctfView?.onFlag(m); break;
      case 'team': this._onTeam(m); break;
      case 'notice': this.ui.toast(m.text); break;
      case 'overtime':
        this._applyMatch(m.match);
        this.announce('Overtime', 'Next capture wins', '#f2b544', 'neutral');
        break;
      case 'roster':
        for (const p of m.players) {
          const e = this.roster.get(p.id);
          if (!e) continue;
          e.k = p.k; e.d = p.d; e.ping = p.ping; e.alive = p.alive;
          if (p.caps != null) { e.caps = p.caps; e.ret = p.ret; }
          if (p.id === this.localId && this.alive && p.alive && Math.abs(p.hp - this.hp) > 15) this.hp = p.hp;
        }
        this.match.timeLeft = m.match.timeLeft;
        this.match.timeRef = t;
        this.match.overtime = !!m.match.overtime;
        if (m.match.ctf && this.ctfView) this.ctfView.apply(m.match.ctf);
        if (m.match.teamScore) this.teamScore = { ...m.match.teamScore };
        break;
      case 'end':
        this.fin.cancelAll();
        this.match.state = 'ended';
        this._lastEnd = m;
        this.arsenal.ads = 0;
        this.input.exitLock();
        this.ui.hideDeploy();
        this.ui.showEnd(this._endData(m));
        break;
      case 'restart':
        this._applyMatch(m.match);
        if (m.match.ctf && this.ctfView) this.ctfView.apply(m.match.ctf);
        for (const e of this.roster.values()) { e.k = 0; e.d = 0; e.caps = 0; e.ret = 0; }
        this.teamScore = { red: 0, blue: 0 };
        this.adsToggled = false;
        this.strikeView.reset();
        this.laptop.close();
        this.fin.cancelAll();
        this._endDeathFlow();
        this.ui.hideEnd();
        this.hud.reset();
        if (!this.deployed) this.ui.showDeploy({ mode: 'deploy', selected: this.selectedClass });
        break;
      default: break;
    }
  }

  _endData(m) {
    let src = m?.standings || [];
    if (!src.length) {
      src = [...this.roster.values()].filter((e) => !e.bot || e.ai).sort((a, b) => b.k - a.k || a.d - b.d)
        .map((e) => ({ id: e.id, name: e.name, k: e.k, d: e.d }));
    }
    const standings = src.map((s) => ({ ...s, me: s.id === this.localId, color: colorCss(this.roster.get(s.id)?.color ?? 0x888888) }));
    if (this.isTeams) {
      const score = m?.score || (this.isCtf ? this.ctfView?.score : this.teamScore) || { red: 0, blue: 0 };
      const wt = m?.winnerTeam ?? null;
      return {
        standings, ctf: true, score, winnerTeam: wt, isHost: this.session.isHost,
        winner: wt ? TEAM_NAMES[wt] : null, winnerIsMe: false, teamNames: TEAM_NAMES,
        headline: wt ? (wt === this.myTeam ? 'Victory' : 'Defeat') : 'Draw',
      };
    }
    const winner = m?.winner != null ? this.nameOf(m.winner) : null;
    return { standings, winner, winnerIsMe: m?.winner === this.localId, isHost: this.session.isHost };
  }

  _onTeam(m) {
    const e = this.roster.get(m.id);
    if (!e) return;
    e.team = m.team;
    e.color = TEAM_COLORS[m.team];
    if (m.despawn) e.alive = false;
    if (m.id === this.localId) {
      this.ui.toast(`You joined the ${TEAM_NAMES[m.team]}`);
      // Everyone else's colors are relative to nothing, but friend/foe changed: refresh deploy UI.
      if (m.despawn && this.alive) {
        this.alive = false;
        this.deathTime = clock() - (this.match.respawnDelay - 1);
        this.arsenal.ads = 0;
        this.arsenal.hideAll();
        this.deathInfo = { mode: 'death', selected: this.selectedClass, killer: 'Team change', weapon: '' };
        this.ui.showDeploy(this.deathInfo);
      }
      this.ui.refreshTeam?.();
      return;
    }
    const r = this.remotes.get(m.id);
    if (r) {
      r.recolor(e.color);
      if (m.despawn) r.hide();
    }
    this.ui.toast(`${e.name} joined ${TEAM_NAMES[m.team]}`);
  }

  /** Big center announcement + stinger. */
  announce(title, sub, color, sound) {
    this.hud.announce(title, sub, color);
    if (sound) this.audio.jingle(sound);
  }

  /** Ask the host to move us to the other team. */
  switchTeam() {
    if (!this.isTeams || !this.myTeam) return;
    this.session.send({ t: 'team', team: otherTeam(this.myTeam) });
  }

  _onSpawn(m) {
    if (this.fin.involves(m.id)) this.fin.cancelFor(m.id);   // respawned before the scene ended (practice dummies)
    const e = this.roster.get(m.id);
    if (e) e.alive = true;
    if (m.id === this.localId) {
      const t = clock();
      this._applyClass(CLASSES[m.cls] ? m.cls : this.selectedClass, t);
      this.streaks.resetForSpawn();
      this.fin.clearLocalBody();
      this.spawnInfo = { pos: new THREE.Vector3().fromArray(m.p), t, dirty: false };
      this._closeSwap();
      this._endDeathFlow();
      this.alive = true;
      this.everSpawned = true;
      this.hp = 100;
      this.life = m.life;
      this.protectUntil = t + m.prot;
      this.lastDamage = -100;
      this.deathCam = 0;
      this.player.teleport(_v1.fromArray(m.p), m.yaw);
      this.deathInfo = null;
      this.adsToggled = false;
      this.audio.equip();
      this.ui.hideDeploy();
      this.stateTimer = STATE_INTERVAL; // send state right away
      return;
    }
    const r = this.remotes.get(m.id);
    if (r) {
      r.spawn(_v1.fromArray(m.p), m.yaw, m.life);
      r.protectUntil = clock() + m.prot;
    }
    if (e && m.cls) e.cls = m.cls;
  }

  get classDef() { return classOf(this.spawnClass); }

  /** Equips a class: weapons (full ammo), frags, ability modifiers. Used on spawn and for in-spawn class swaps. */
  _applyClass(id, t) {
    this.spawnClass = id;
    const cd = classOf(id);
    this.arsenal.primaryId = null; // force fresh guns + viewmodels
    this.arsenal.setLoadout(cd.primary, t);
    for (const g of this.arsenal.guns) g.reloadMult = cd.reloadMult ?? 1;
    this.player.maxAirJumps = cd.airJumps ?? 1;
    this.player.airJumps = Math.min(this.player.airJumps, this.player.maxAirJumps);
    this.player.sprintOutMult = cd.sprintOutMult ?? 1;
    this.throwables.resetForSpawn(cd.frags);
  }

  // ----- in-spawn class swap (B): within 8 m / 10 s of spawning, before firing, throwing or taking damage -----
  canSwap(t) {
    const s = this.spawnInfo;
    return !!(this.alive && s && !s.dirty && t - s.t <= 10 && this.player.position.distanceTo(s.pos) <= 8 && this.match.state === 'playing');
  }

  markDirty() { if (this.spawnInfo) this.spawnInfo.dirty = true; }

  _openSwap() {
    this.swapOpen = true;
    this.ui.showDeploy({ mode: 'swap', selected: this.spawnClass });
  }

  _closeSwap() {
    if (!this.swapOpen) return;
    this.swapOpen = false;
    this.ui.hideSwap?.();
  }

  _onKill(m) {
    const killer = this.roster.get(m.killer), victim = this.roster.get(m.victim);
    if (m.victim === this.localId) this.laptop.close();
    // Killed while playing a finisher as the attacker: the scene stops (its victim stays down).
    if (this.fin.scenes.some((s) => s.attacker === m.victim)) this.fin.cancelFor(m.victim);
    if (killer) killer.k = m.kk;
    if (victim) { victim.d = m.vd; victim.alive = false; }
    const meK = m.killer === this.localId, meV = m.victim === this.localId;
    this.hud.killfeed({
      killer: killer?.name ?? '???', victim: victim?.name ?? '???', weapon: shortName(m.w),
      headshot: m.hs, mine: meK || meV, killerIsMe: meK, victimIsMe: meV,
      killerColor: killer?.team ? TEAM_CSS[killer.team] : null, victimColor: victim?.team ? TEAM_CSS[victim.team] : null,
    });
    if (meK && !meV) {
      this.hud.hitmarker('kill');
      this.audio.kill(m.hs);
      this.hud.killBanner(victim?.name ?? '', m.hs);
      // Multi-kills: kills landing within 1.5 s of each other (a sniper collateral lands them together).
      const now = clock();
      const gap = now - (this.lastKillAt ?? -99);
      this.multiKills = gap < 1.5 ? (this.multiKills || 1) + 1 : 1;
      this.lastKillAt = now;
      const MULTI = { 2: 'Double kill', 3: 'Triple kill', 4: 'Quad kill' };
      if (this.multiKills >= 2) {
        const sub = m.w === 'sniper' && gap < 0.3 ? 'Collateral' : '';
        this.announce(MULTI[this.multiKills] || 'Rampage', sub, '#f2b544', 'neutral');
      }
    }
    this.enemyBars.delete(m.victim);
    if (meV) this._die(m);
    else this.remotes.get(m.victim)?.kill();
  }

  _die(m) {
    this.alive = false;
    this.hp = 0;
    this.deathTime = clock();
    this.arsenal.ads = 0;
    this.adsToggled = false;
    this.arsenal.hideAll();
    this.hud.scope(false);
    const r = this.remotes.get(m.killer);
    if (r) {
      // Face toward the killer for the death cam.
      const dx = r.feet.x - this.player.position.x, dz = r.feet.z - this.player.position.z;
      this.deathYawTarget = Math.atan2(-dx, -dz);
    } else this.deathYawTarget = this.player.yaw;
    this.throwables.cookStart = null;
    this.deathInfo = {
      mode: 'death', selected: this.selectedClass,
      killer: m.killer === this.localId ? 'Yourself' : this.nameOf(m.killer),
      weapon: weaponName(m.w), headshot: m.hs,
    };
    // Kill cam when another (recorded) player killed us; otherwise straight to the death screen.
    const t = clock();
    const canCam = r && m.killer !== this.localId && r.history.length > 4 && this.match.state === 'playing';
    if (this.fin.localScene?.victim === this.localId) {
      // Finished off: watch the scene from its camera instead of the kill cam, then the death screen.
      this.deathFlow = { phase: 'finisher' };
    } else if (canCam) {
      this.deathFlow = { phase: 'pre', until: t + 1, cam: { killerId: m.killer, killTime: t, w: m.w, weapon: weaponName(m.w), killerHp: m.khp ?? null, killerName: this.nameOf(m.killer) } };
    } else {
      this.deathFlow = { phase: 'screen', until: t + this.match.respawnDelay };
      this.ui.showDeploy(this.deathInfo);
    }
  }

  /** Death sequence: 1 s pause -> kill cam (Space skips) -> death/loadout screen -> 'ready' to the host. */
  _updateDeathFlow(dt, t, pressed) {
    const f = this.deathFlow;
    if (!f) return;
    if (f.phase === 'pre' && t >= f.until) {
      f.phase = 'killcam';
      this.killcam = new KillCam(this, f.cam);
      this.hud.killcam({ name: f.cam.killerName, weapon: f.cam.weapon, hp: f.cam.killerHp });
    }
    if (f.phase === 'killcam') {
      const done = this.killcam.update(dt) || pressed.has('Space');
      if (done) {
        this.killcam.dispose();
        this.killcam = null;
        this.hud.killcam(null);
        f.phase = 'screen';
        f.until = Math.max(t + 1.5, this.deathTime + this.match.respawnDelay);
        this.ui.showDeploy(this.deathInfo);
      }
    } else if (f.phase === 'screen') {
      this.ui.setDeathCountdown(Math.max(0, f.until - t));
      if (t >= f.until || (pressed.has('Space') && t > f.until - 1.2)) {
        f.phase = 'waiting';
        this.session.send({ t: 'ready', cls: this.selectedClass });
      }
    }
  }

  /** Our finisher scene (as the victim) has played out: on to the death screen. */
  finisherDone() {
    const f = this.deathFlow;
    if (!f || f.phase !== 'finisher') return;
    f.phase = 'screen';
    f.until = Math.max(clock() + 1.5, this.deathTime + this.match.respawnDelay);
    this.ui.showDeploy(this.deathInfo);
  }

  _endDeathFlow() {
    if (this.killcam) { this.killcam.dispose(); this.killcam = null; this.hud.killcam(null); }
    this.deathFlow = null;
  }

  _takeDamage(m) {
    this.markDirty();
    if (!this.alive) return;
    this.hp = m.hp;
    this.lastDamage = clock();
    this.hud.damageFlash();
    this.input.rumble?.(220, 0.5, 0.8);
    this.audio.hurt();
    const r = this.remotes.get(m.by);
    if (r) {
      const dx = r.feet.x - this.player.position.x, dz = r.feet.z - this.player.position.z;
      const sy = Math.sin(this.player.yaw), cy = Math.cos(this.player.yaw);
      const fwd = -dx * sy - dz * cy;
      const right = dx * cy - dz * sy;
      this.hud.damageDirection(Math.atan2(right, fwd));
    }
    // Small view punch.
    this.arsenal.recoil.pitch += 0.6 * DEG;
    this.arsenal.recoil.yaw += (Math.random() - 0.5) * 1.2 * DEG;
  }

  _remoteShot(m) {
    const r = this.remotes.get(m.id);
    if (!r) return;
    r.character.fire();
    r.protectUntil = 0;
    this.blips.set(m.id, clock());
    const from = r.alive && m.w !== 'heligun' ? r.muzzle(_v1) : _v1.fromArray(m.o);
    m.e.forEach((e, i) => {
      _v2.set(e[0], e[1], e[2]);
      if (i < 3) this.effects.tracer(from, _v2);
      if (e[3] === 1) this.effects.impact(_v2, _v3.set(e[4], e[5], e[6]), e[7] || 'concrete');
      else if (e[3] === 2) this.effects.blood(_v2, _v3.subVectors(_v2, from).normalize());
    });
    if (m.w === 'heligun') this.audio.cannon?.(from.clone()); else this.audio.shot(m.w, from.clone());
    this.killcamRec.recordShot(m.id, from, m.e, m.w);
    this._flinchFrom(m.e, m.o, m.id);
  }

  /** Third-person hit reaction: remote characters standing where a shot's body hits landed flinch along the bullet. */
  _flinchFrom(ends, origin, shooterId) {
    for (const e of ends) {
      if (e[3] !== 2) continue;
      for (const r of this.remotes.values()) {
        if (!r.alive || r.id === shooterId) continue;
        const dx = e[0] - r.feet.x, dz = e[2] - r.feet.z, dy = e[1] - r.feet.y;
        if (dx * dx + dz * dz > 0.7 || dy < -0.3 || dy > 2.2) continue;
        r.character.flinch?.(_v3.set(e[0] - origin[0], 0, e[2] - origin[2]), dy > 1.4 ? 1.2 : 0.8);
        break;
      }
    }
  }

  // ======================= player actions =======================
  /** Deploy button / first spawn. */
  deploy() {
    this.deployed = true;
    this.settings.cls = this.selectedClass;
    this.session.send({ t: 'ready', cls: this.selectedClass });
  }

  selectClass(id) {
    if (!CLASSES[id]) return;
    this.selectedClass = id;
    this.settings.cls = id;
    this.ui.setLoadout(id);
    if (this.alive && this.swapOpen && this.canSwap(clock())) {
      if (id !== this.spawnClass) this.session.send({ t: 'swapClass', cls: id });
      else this._closeSwap();
    } else if (this.deployed) this.session.send({ t: 'class', cls: id });
  }

  _rescue() {
    const pts = this.world.spawnPoints;
    const p = pts[Math.floor(Math.random() * pts.length)];
    this.player.teleport(p, this.player.yaw);
  }

  /**
   * Pause-menu "Unstuck": moves the player to the nearest safe spawn point (open ground) when trapped in geometry.
   * Not usable in a fight (no damage in the last 5 s), in the helicopter, during a finisher or carrying a flag,
   * and on a 15 s cooldown. Returns a message for the toast.
   */
  unstuck() {
    const t = clock();
    if (!this.alive || !this.deployed) return 'You can use Unstuck once you have spawned';
    if (this.piloting || this.fin?.localAttacking) return 'Not available right now';
    if (this.ctfView && ['red', 'blue'].some((tm) => this.ctfView.carrierOf(tm) === this.localId)) return 'Not while carrying a flag';
    if (t - this.lastDamage < 5) return 'Not while under fire (wait 5 s after taking damage)';
    if (t < (this._unstuckAt || 0)) return `Unstuck is cooling down (${Math.ceil(this._unstuckAt - t)} s)`;
    const p = this.player.position;
    const pts = this.isTeams && this.world.ctfSpawns?.[this.myTeam]?.length && this.isCtf ? this.world.ctfSpawns[this.myTeam] : this.world.spawnPoints;
    let best = null, bd = Infinity;
    for (const s of pts) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d > 3 && d < bd) { bd = d; best = s; } }
    if (!best) return 'No safe spot found';
    this.player.grapple = null;
    this.player.velocity.set(0, 0, 0);
    this.player.teleport(best, this.player.yaw);
    this._unstuckAt = t + 15;
    this._sendState?.();
    return 'Moved to the nearest safe spot';
  }

  /** Grapple anchor along the view ray, or null (out of range, nothing there, the ground, or passthrough). */
  _findGrappleTarget() {
    const p = this.player;
    const eye = p.getEye(new THREE.Vector3());
    const dir = this._viewDir(new THREE.Vector3());
    const range = KIT.grappleRange * (this.classDef.grappleRangeMult ?? 1);
    const hit = p.raycast(eye, dir, range);
    let direct = null;
    if (hit) {
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      const gy = this.world.groundY ? this.world.groundY(hit.point.x, hit.point.z) : 0;
      const isGround = n.y > 0.7 && hit.point.y - gy < 0.8;
      // Anchor slightly off the surface so the cable stays clear.
      if (!isGround && hit.distance >= 2.5) direct = { point: hit.point.clone().addScaledVector(n, 0.3), dist: hit.distance };
    }
    // Aim assist for thin poles (light poles, stadium lights, lamp posts): snap when the crosshair is close.
    const pole = this._poleAssist(eye, dir, range, direct ? direct.dist : Infinity);
    if (pole) return pole;
    return direct ? direct.point : null;
  }

  /** Nearest grapple pole within a small angular cone of the view ray (and not behind a direct hit), or null. */
  _poleAssist(eye, dir, range, directDist) {
    const poles = this.world.grapplePoles;
    if (!poles?.length) return null;
    const CONE = THREE.MathUtils.degToRad(4.5);
    let best = null, bestAng = CONE;
    const q = new THREE.Vector3(), to = new THREE.Vector3(), nd = new THREE.Vector3();
    const hl2 = dir.x * dir.x + dir.z * dir.z;
    if (hl2 < 1e-6) return null;
    for (const pl of poles) {
      // Where the view ray passes the pole horizontally, clamped to the pole's height.
      const along = ((pl.x - eye.x) * dir.x + (pl.z - eye.z) * dir.z) / hl2;
      if (along <= 0) continue;
      q.set(pl.x, THREE.MathUtils.clamp(eye.y + dir.y * along, pl.y0, pl.y1), pl.z);
      to.subVectors(q, eye);
      const d = to.length();
      if (d < 2.5 || d > range || d > directDist + 1.5) continue;
      // Angular error measured to the pole's surface, so thick poles are easier to catch.
      const ang = Math.max(0, to.angleTo(dir) - Math.atan(pl.r / d));
      if (ang >= bestAng) continue;
      // Line of sight: nothing solid between us and the pole (hitting the pole itself is fine).
      nd.copy(to).normalize();
      const los = this.player.raycast(eye, nd, d);
      if (los && los.distance < d - Math.max(0.8, pl.r + 0.5)) continue;
      bestAng = ang;
      best = q.clone().addScaledVector(nd, -(pl.r + 0.35));
    }
    return best;
  }

  _grappleKey(t) {
    const p = this.player;
    if (p.grapple) { p.releaseGrapple(false); this.audio.grappleRelease(); return; }
    if (t < this.grappleReadyAt || p.mantle) { this.audio.grappleDeny(); return; }
    const target = this._findGrappleTarget();
    if (!target) { this.audio.grappleDeny(); this.hud.kitDenied?.(); return; }
    p.startGrapple(target);
    // Flag carriers get double the grapple cooldown.
    const carrying = this.ctfView && this.myTeam && this.ctfView.carrierOf(otherTeam(this.myTeam)) === this.localId;
    this.grappleCd = KIT.grappleCooldown * (carrying ? 2 : 1) * (this.classDef.grappleCooldownMult ?? 1);
    this.grappleReadyAt = t + this.grappleCd;
    this.audio.grappleLaunch(target.distanceTo(p.position));
  }

  _updateCable() {
    const p = this.player;
    if (!this.alive || !p.grapple) { this.cable.hide(); return; }
    // From the left wrist area (camera space) to the anchor.
    const from = _v1.set(-0.2, -0.22, -0.35).applyMatrix4(this.camera.matrixWorld);
    this.cable.set(from, p.grapple.anchor);
  }

  _remoteCable(r) {
    if (!r.cable) r.cable = createCable(this.scene, 0.02);
    if (!r.alive || !r.grappleAnchor) { r.cable.hide(); r._hadAnchor = false; return; }
    if (!r._hadAnchor) { r._hadAnchor = true; this.audio.remoteGrapple(r.grappleAnchor.clone()); }
    const sy = Math.sin(r.yaw), cy = Math.cos(r.yaw);
    const from = r.character.handWorldPosition
      ? r.character.handWorldPosition(_v1)
      : _v1.set(r.feet.x - sy * 0.35 - cy * 0.25, r.feet.y + (r.crouch > 0.5 ? 0.9 : 1.35), r.feet.z - cy * 0.35 + sy * 0.25);
    r.cable.set(from, r.grappleAnchor);
  }

  _viewDir(out) {
    _euler.set(this.player.pitch + this.arsenal.recoil.pitch, this.player.yaw + this.arsenal.recoil.yaw, 0);
    return out.set(0, 0, -1).applyEuler(_euler);
  }

  _targets() {
    const list = [];
    for (const r of this.remotes.values()) if (r.alive && !this.isTeammate(r.id) && !r.inHeliSeat) list.push(r.hitbox());
    return list;
  }

  _fire(t) {
    this.markDirty();
    const ar = this.arsenal, gun = ar.gun, st = gun.stats;
    this.input.rumble?.(st.scope ? 160 : 60, 0.35, st.scope || gun.id === 'shotgun' ? 0.75 : 0.25);
    const eye = this.player.getEye(new THREE.Vector3());
    const aim = this._viewDir(new THREE.Vector3());
    const moving = Math.min(1, this.player.horizontalSpeed() / 5);
    let spread = gun.spread({ ads: ar.ads, moving, airborne: !this.player.grounded, crouching: this.player.crouching });
    if (st.scope && ar.ads < 0.98) spread = Math.max(spread, 2.5 * DEG * (1 - ar.ads * 0.6));
    if (this.player.grapple) spread += 1.5 * DEG;
    const targets = this._targets();
    const vm = ar.viewmodel;
    const muzzle = vm.muzzleWorldPosition(new THREE.Vector3(), this.overlayCamera, this.camera);
    const ends = [];
    const dmgBy = new Map();
    let anyHit = false, anyHead = false, heliDmg = 0;

    for (let i = 0; i < st.pellets; i++) {
      const dir = coneDir(aim, spread, st.pellets > 1 ? i / st.pellets : null);
      const wh = this.hitscan.castWorld(eye, dir, st.maxRange, { bullets: true });
      // Players along the ray, nearest first; piercing rounds (sniper) keep going through up to `pierce` bodies.
      const hits = [];
      for (let pool = targets; hits.length < (st.pierce || 1);) {
        const h = this.hitscan.castTargets(eye, dir, wh ? wh.distance : st.maxRange, pool);
        if (!h) break;
        hits.push(h);
        pool = pool.filter((x) => x.id !== h.id);
      }
      const th = hits[0] || null;
      const hd = this.heliView ? this.heliView.rayHit(eye, dir, Math.min(wh ? wh.distance : st.maxRange, th ? th.distance : Infinity)) : null;
      let end;
      if (hd !== null) {
        end = eye.clone().addScaledVector(dir, hd);
        heliDmg += damageAt(st, hd);
        this.effects.impact(end, dir.clone().negate(), 'metal');
        ends.push([r2(end.x), r2(end.y), r2(end.z), 1, r3(-dir.x), r3(-dir.y), r3(-dir.z), 'metal']);
      } else if (th) {
        for (const h of hits) {
          const r = this.remotes.get(h.id);
          const protectedNow = r && t < r.protectUntil;
          if (!protectedNow) {
            const dmg = damageAt(st, h.distance) * (h.headshot ? st.headMult : 1);
            const acc = dmgBy.get(h.id) || { dmg: 0, hs: false, ik: false };
            acc.dmg += dmg;
            acc.hs = acc.hs || h.headshot;
            // Sniper: head or torso is an instant kill at any range (legs take normal damage).
            if (st.id === 'sniper' && h.zone !== 'legs') acc.ik = true;
            dmgBy.set(h.id, acc);
            anyHit = true;
            anyHead = anyHead || h.headshot;
          }
          this.effects.blood(h.point, dir);
          if (!protectedNow) r?.character.flinch?.(dir, h.headshot ? 1.2 : 0.8);
          ends.push([r2(h.point.x), r2(h.point.y), r2(h.point.z), 2]);
        }
        end = hits[hits.length - 1].point;
        // A piercing round carries on past the last body to the wall behind it.
        if (st.pierce > 1) {
          if (wh) {
            end = wh.point;
            this.effects.impact(end, wh.normal, wh.surface);
            ends.push([r2(end.x), r2(end.y), r2(end.z), 1, r3(wh.normal.x), r3(wh.normal.y), r3(wh.normal.z), wh.surface]);
          } else end = eye.clone().addScaledVector(dir, Math.min(st.maxRange, 400));
        }
      } else if (wh) {
        end = wh.point;
        this.effects.impact(end, wh.normal, wh.surface);
        ends.push([r2(end.x), r2(end.y), r2(end.z), 1, r3(wh.normal.x), r3(wh.normal.y), r3(wh.normal.z), wh.surface]);
      } else {
        end = eye.clone().addScaledVector(dir, Math.min(st.maxRange, 400));
        ends.push([r2(end.x), r2(end.y), r2(end.z), 0]);
      }
      if (i < 3 && !(st.scope && ar.ads > 0.9)) this.effects.tracer(muzzle, end);
    }

    if (heliDmg > 0) {
      this.session.send({ t: 'hit', target: 'heli', dmg: Math.round(heliDmg * 10) / 10, w: gun.id });
      this.hud.hitmarker('hit');
      this.audio.hitmarker('hit');
    }
    for (const [id, a] of dmgBy) {
      this.session.send({ t: 'hit', target: id, dmg: Math.round(a.dmg * 10) / 10, hs: a.hs, w: gun.id, ...(a.ik ? { ik: 1 } : {}) });
    }
    if (anyHit) {
      this.hud.hitmarker(anyHead ? 'head' : 'hit');
      this.audio.hitmarker(anyHead ? 'head' : 'hit');
    }
    this.session.send({ t: 'shot', w: gun.id, o: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], e: ends });
    this.protectUntil = 0;

    // Recoil: part permanent, part recovering.
    const kick = gun.consume(t);
    const k = (1 + (st.recoil.adsMult - 1) * ar.ads) * (this.player.crouching ? 0.85 : 1);
    this.player.pitch = Math.min(89 * DEG, this.player.pitch + kick.pitch * k * 0.35);
    ar.recoil.pitch += kick.pitch * k * 0.65;
    this.player.yaw += kick.yaw * k * 0.5;
    ar.recoil.yaw += kick.yaw * k * 0.5;
    vm.fire();
    this.audio.shot(gun.id, null);
  }

  _melee(t) {
    this.markDirty();
    const cd = this.classDef;
    this.meleeUntil = t + MELEE.cooldown * (cd.meleeCooldownMult ?? 1);
    this.audio.melee();
    this.arsenal.viewmodel?.melee?.(0.45);
    this.meleeShake = 1;
    const eye = this.player.getEye(new THREE.Vector3());
    const aim = this._viewDir(new THREE.Vector3());
    const reach = cd.lunge ? MELEE.lungeRange : MELEE.range;
    let best = null;
    for (const r of this.remotes.values()) {
      if (!r.alive || t < r.protectUntil || this.isTeammate(r.id)) continue;
      const chest = _v1.set(r.feet.x, r.feet.y + (r.crouch > 0.5 ? 0.7 : 1.1), r.feet.z);
      const to = _v2.subVectors(chest, eye);
      const d = to.length();
      if (d > reach + 0.4) continue;
      if (to.normalize().dot(aim) < (cd.lunge ? 0.75 : 0.55)) continue;
      const wh = this.hitscan.castWorld(eye, to, d);
      if (wh) continue;
      if (!best || d < best.d) best = { r, d, point: chest.clone(), dir: to.clone() };
    }
    // Brawler lunge: burst toward the target.
    if (best && cd.lunge && best.d > MELEE.range) {
      const dir = best.dir.clone().setY(0).normalize();
      this.player.velocity.x = dir.x * 14;
      this.player.velocity.z = dir.z * 14;
      this.player.dashT = 0.2;
    }
    this.session.send({ t: 'melee', hit: !!best });
    if (best) {
      this.session.send({ t: 'hit', target: best.r.id, dmg: MELEE.damage, hs: false, w: 'melee' });
      this.effects.blood(best.point, best.dir);
      this.hud.hitmarker('hit');
      this.audio.hitmarker('hit');
      this.audio.meleeHit?.(null);
      this.hitStop = 0.08;
      this.meleeShake = 1.6;
    }
  }

  // ======================= frame =======================
  update(dt) {
    const t = clock();
    this.session.tick(dt);
    const inp = this.input;
    const pressed = new Set(inp.pressed);
    const { dx, dy, wheel } = inp.consume();
    const playing = this.match.state === 'playing';
    const active = inp.active && playing;

    if (!this.alive && inp.enabled) {
      for (let i = 0; i < CLASS_IDS.length; i++) if (pressed.has('Digit' + (i + 1))) this.selectClass(CLASS_IDS[i]);
    }

    // Hit-stop: a brief slow-down of our own motion when a melee connects.
    const pdt = this.hitStop > 0 ? dt * 0.15 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    this._frameDx = dx; this._frameDy = dy; this._framePressed = pressed;
    if (this.alive && (this.piloting || this.fin.localAttacking)) {
      this.killcamRec.recordSelf(t, this.player, this.arsenal.ads);   // flying / playing a finisher: no on-foot control
    } else if (this.alive) {
      this._updateAlive(pdt, t, active, pressed, dx, dy, wheel);
      this.killcamRec.recordSelf(t, this.player, this.arsenal.ads);
    } else {
      this._updateDead(dt, t);
      this._updateDeathFlow(dt, t, pressed);
    }
    this.throwables.update(dt, t);
    this.strikeView.update(dt, this.killcam ? this.killcam.rt : t, !this.killcam);
    this.laptop.update(dt, t);
    this.fin.update(dt);
    const holdX = this.alive && active && this.input.isDown('KeyX');
    const heliPrompt = this.heliView ? this.heliView.update(dt, t, holdX && !this.piloting) : null;
    if (this.heliView && !this.killcam) this.killcamRec.recordHeli(t, this.heliView);
    this.streakPrompt = heliPrompt || this.streaks.update(dt, t, holdX && !heliPrompt && !this.piloting);

    if (!this.killcam) {
      if (!this.piloting) this._updateCamera(dt);
      const pilotId = this.heliView?.flying ? this.heliView.s.pilot : null;
      for (const r of this.remotes.values()) {
        const lk = lookForClass(this.roster.get(r.id)?.cls);
        if (r._look !== lk || r._lookChar !== r.character) { r._look = lk; r._lookChar = r.character; r.character.setLook?.(lk); }
        this._relation(r, t);
        r.update(dt, t);
        r.inHeliSeat = r.id === pilotId;
        if (r.inHeliSeat) r.character.object3D.visible = false; // the helicopter model shows its pilot
      }
    }
    this.fin.applyCamera(dt);
    this._updateCable();
    for (const r of this.remotes.values()) {
      this._remoteFootsteps(r, dt);
      this._remoteCable(r);
    }
    this.ctfView?.update(dt);
    this.audio.setListener(this.camera);

    this._updateHud(dt, t, inp);
  }

  /** 20 Hz movement state (worker timer; also forced right after teleports via stateTimer). */
  _sendState() {
    if (!this.alive || this.match.state !== 'playing' && !this.alive) return;
    const t = clock();
    {
      const p = this.player;
      this.session.sendState({
        t: 'st', l: this.life, ts: r3(t),
        p: [r2(p.position.x), r2(p.position.y), r2(p.position.z)],
        v: [r2(p.velocity.x), r2(p.velocity.y), r2(p.velocity.z)],
        yaw: r3(p.yaw), pitch: r3(p.pitch), c: p.crouching ? 1 : 0, s: p.sprinting ? 1 : 0,
        w: this.arsenal.gun?.id || 'ar', g: p.grounded ? 1 : 0,
        ...(p.grapple ? { ga: [r2(p.grapple.anchor.x), r2(p.grapple.anchor.y), r2(p.grapple.anchor.z)] } : {}),
        // Optional (absent = 0): aim-down-sights amount (remote stance + scoped kill cams) and movement mode
        // (1 slide, 2 ladder, 3 mantle, 4 dash) for the third-person animation.
        ...(this.arsenal.ads > 0.05 ? { a: Math.round(this.arsenal.ads * 10) / 10 } : {}),
        ...(moveMode(p) ? { m: moveMode(p) } : {}),
      });
    }

  }

  _updateAlive(dt, t, active, pressed, dx, dy, wheel) {
    const ar = this.arsenal, p = this.player, gun = ar.gun, st = gun.stats;
    const S = this.settings;

    // Look.
    const baseV = this._baseVFov();
    const zoomRatio = this.camera.fov / baseV;
    const sens = BASE_SENS * S.sensitivity * (1 + (zoomRatio * S.adsMultiplier - 1) * ar.ads);
    // Strike laptop open: the mouse drives its reticle instead of the view.
    const lap = this.laptop;
    if (lap.active && !active) lap.close();
    const lapOpen = lap.active;
    const lx = active && !lapOpen ? -dx * sens : 0, ly = active && !lapOpen ? -dy * sens : 0;
    p.yaw += lx;
    p.pitch = THREE.MathUtils.clamp(p.pitch + ly, -89 * DEG, 89 * DEG);
    // Viewmodel convention: x = yaw to the right, y = pitch up (radians this frame).
    this.lookDelta.x = -lx;
    this.lookDelta.y = ly;

    const key = (c) => active && this.input.isDown(c);
    if (lapOpen) lap.input(t, { dx, dy, wheel, pressed, key });
    const busy = lapOpen || lap.shown;   // laptop up: weapon lowered, no shooting / abilities, walk speed
    const fireHeld = !busy && key('Mouse0');
    const adsHeld = !busy && key('Mouse2');
    // Toggle aim: Ctrl+click (macOS secondary click) or Q. Aim wins over the sprint key until toggled off.
    if (active && !busy && (pressed.has('AimToggle') || pressed.has('KeyQ'))) this.adsToggled = !this.adsToggled;
    const aimWanted = adsHeld || this.adsToggled;
    const sprintHeld = this.settings.sprintKey === 'ctrl'
      ? key('ControlLeft') || key('ControlRight')
      : key('ShiftLeft') || key('ShiftRight');
    // Controller left stick (analog) wins over WASD when deflected.
    const pm = active && (this.input.padMove.x || this.input.padMove.y) ? this.input.padMove : null;
    const move = {
      forward: pm ? pm.y : (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0),
      strafe: lapOpen ? 0 : pm ? pm.x : (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0),   // A / D rotate the strike on the laptop
      jump: active && !busy && pressed.has('Space'),
      crouchToggle: active && pressed.has('KeyC'),
      sprint: sprintHeld && !busy,
    };
    if (active && !busy && pressed.has('KeyF')) this._grappleKey(t);
    if (active && !busy && pressed.has('KeyE') && t >= this.dashReadyAt && !p.mantle) {
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      let dx = -sy * move.forward + cy * move.strafe, dz = -cy * move.forward - sy * move.strafe;
      if (Math.hypot(dx, dz) < 0.1) { dx = -sy; dz = -cy; }
      p.dash(dx, dz);
      this.dashReadyAt = t + KIT.dashCooldown;
      this.fovKick = 1;
      this.audio.dash();
    }
    // Grenade: hold G to cook, release to throw. 4: use killstreak item.
    if (active && !busy && pressed.has('KeyG') && !p.sprinting) this.throwables.beginCook(t);
    if (this.throwables.cookStart !== null && !key('KeyG')) this.throwables.release(t);
    if (active && !busy && pressed.has('Digit4')) this.streaks.useItem(t);
    const speedMult = (this.classDef.speedMult ?? 1) * this.streaks.speedMult * (busy ? 0.42 : 1);
    p.update(dt, move, { ads: ar.ads, moveMult: st.moveMult * speedMult, blockSprint: busy || fireHeld || aimWanted || this.throwables.cookStart !== null });
    for (const ev of p.events) {
      if (ev === 'doubleJump') this.audio.thruster();
      else if (ev === 'mantle' || ev === 'ladder') this.audio.mantle();
      else if (ev === 'grappleArrive' || ev === 'grappleBreak') this.audio.grappleRelease();
    }
    p.events.length = 0;

    // In-spawn class swap.
    const swapOk = this.canSwap(t);
    if (active && swapOk && pressed.has('KeyB')) { if (this.swapOpen) this._closeSwap(); else this._openSwap(); }
    if (this.swapOpen && !swapOk) this._closeSwap();
    if (this.swapOpen && active) {
      for (let i = 0; i < CLASS_IDS.length; i++) if (pressed.has('Digit' + (i + 1))) this.selectClass(CLASS_IDS[i]);
    }
    this.swapHint = swapOk && !this.swapOpen;

    // Weapon switching.
    if (active && !this.swapOpen && !busy) {
      if (pressed.has('Digit1')) ar.switchTo(0, t);
      if (pressed.has('Digit2')) ar.switchTo(1, t);
      if (wheel) ar.switchTo(ar.slot === 0 ? 1 : 0, t);
      if (pressed.has('KeyR') && !p.sprinting) ar.startReload(t);
      if (pressed.has('KeyV') && t >= this.meleeUntil && !ar.switching(t)) this._melee(t);
    }
    const g = ar.gun, gs = g.stats;
    const wantAds = aimWanted && !p.sprinting && !ar.switching(t) && !(g.reloading && !gs.perShell);
    ar.update(dt, t, wantAds, fireHeld);

    // Camera must be current before firing (muzzle position, aim direction).
    this._updateCamera(0);
    this.grappleTarget = p.grapple ? null : this._findGrappleTarget();

    const canFire = active && !busy && !this.swapOpen && !ar.switching(t) && !p.gunBlocked() && t >= this.meleeUntil - MELEE.cooldown * 0.4;
    const trigger = gs.mode === 'auto' ? fireHeld : pressed.has('Mouse0');
    if (trigger && canFire) {
      if (g.canInterruptReload()) g.cancelReload();
      if (g.ammo <= 0) {
        if (pressed.has('Mouse0')) { this.audio.dryFire(); ar.startReload(t); }
      } else if (g.ready(t)) this._fire(t);
    }
    // Auto-reload right after the last round leaves (not on the next trigger pull, and not after the full fire cycle):
    // 0.12 s after the final shot, also while sprinting.
    if (g.ammo === 0 && !g.reloading && g.reserve > 0 && !ar.switching(t) && t >= g.nextFire - 60 / gs.rpm + 0.12) ar.startReload(t);

    // Footsteps / landing.
    if (p.grounded) {
      if (!this.wasGrounded && this.airPeak > 0.25) this._footstep(1.3);
      // Your own steps are silent, but a real drop gets a soft, low landing thump (felt more than heard).
      if (!this.wasGrounded && this.airPeak > 0.55 && this.alive && !this.piloting) {
        const wh = this.hitscan.castWorld(_v1.set(p.position.x, p.position.y + 0.3, p.position.z), _v2.set(0, -1, 0), 1.5);
        this.audio.land?.(wh?.surface || 'concrete', null, Math.min(1.4, 0.6 + this.airPeak * 0.4));
      }
      this.stepDist += p.horizontalSpeed() * dt;
      const stride = p.sprinting ? 2.7 : p.crouching ? 1.5 : 2.1;
      if (this.stepDist > stride) { this.stepDist = 0; this._footstep(p.crouching ? 0.35 : p.sprinting ? 1.15 : 0.8); }
      this.airPeak = 0;
    } else this.airPeak += dt;
    this.wasGrounded = p.grounded;

    // Local health regen (display; host is authoritative and corrects via roster).
    if (this.hp < 100 && t - this.lastDamage > REGEN_DELAY) this.hp = Math.min(100, this.hp + REGEN_RATE * dt);

    // Viewmodel.
    const scoped = gs.scope && ar.ads > 0.85;
    const vm = ar.viewmodel;
    if (!vm) return;
    // Laptop up: the gun is put away; it comes back with an equip when the laptop has folded.
    if (lap.shown) this._lapWasShown = true;
    else if (this._lapWasShown) { this._lapWasShown = false; vm.equip?.(); }
    vm.object3D.visible = !scoped && !lap.shown;
    vm.update(dt, {
      moveSpeed: Math.min(1, p.horizontalSpeed() / 7.5), sprinting: p.sprinting, ads: ar.ads,
      grounded: p.grounded, lookDelta: this.lookDelta,
    });
  }

  _updateDead(dt, t) {
    this.deathCam = Math.min(1, this.deathCam + dt * 1.6);
    if (!this.deathFlow) this.ui.setDeathCountdown(null);
    if (this.deathYawTarget !== undefined) {
      let d = this.deathYawTarget - this.player.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.player.yaw += d * Math.min(1, dt * 3);
    }
  }

  _baseVFov() {
    const h = this.settings.fov * DEG;
    return (2 * Math.atan(Math.tan(h / 2) / this.camera.aspect)) / DEG;
  }

  _updateCamera(dt) {
    const p = this.player, ar = this.arsenal, cam = this.camera;
    if (!this.everSpawned) {
      // Pre-deploy overview: slow orbit above the middle of the play area.
      const b = this.world.playBounds;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const a = clock() * 0.03;
      cam.position.set(cx + Math.sin(a) * 170, 70, cz + Math.cos(a) * 170);
      cam.lookAt(cx, 0, cz);
      if (dt > 0) { cam.fov = this._baseVFov(); cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
      return;
    }
    const eyeDrop = this.alive ? 0 : this.deathCam * 1.25;
    cam.position.set(p.position.x, p.position.y + p.eye - eyeDrop, p.position.z);
    const roll = this.alive ? -this.lookDelta.x * 0.0 : this.deathCam * 0.35;
    const sh = this.throwables.shakeOffset(clock());
    const ms = this.meleeShake * this.meleeShake;
    this.meleeShake = Math.max(0, this.meleeShake - dt * 5);
    cam.rotation.set(p.pitch + ar.recoil.pitch + sh.pitch - ms * 0.03, p.yaw + ar.recoil.yaw + sh.yaw + Math.sin(clock() * 70) * ms * 0.01, roll + sh.roll, 'YXZ');
    if (dt > 0) {
      const base = this._baseVFov();
      const gs = ar.gun?.stats;
      let fov = base;
      if (gs && this.alive) {
        if (gs.scope) fov = base + (gs.adsFov - base) * smooth(ar.ads);
        else fov = base * (1 + (gs.adsZoom - 1) * ar.ads);
        if (p.sprinting) fov *= 1.04;
        if (p.grapple) fov *= 1.06;
        fov *= 1 + 0.08 * this.fovKick;
      }
      this.fovKick = Math.max(0, this.fovKick - dt * 3);
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 20);
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  _footstep(gain) {
    // Your own footsteps are silent (only other players' footsteps are heard, positionally).
    if (!LOCAL_FOOTSTEPS) return;
    const p = this.player;
    const wh = this.hitscan.castWorld(_v1.set(p.position.x, p.position.y + 0.3, p.position.z), _v2.set(0, -1, 0), 1.5);
    this.audio.footstep(wh?.surface || 'concrete', null, gain);
  }

  _remoteFootsteps(r, dt) {
    if (!r.alive || r.bot) { r.airT = 0; return; }
    if (!r.grounded) { r.airT = (r.airT || 0) + dt; return; }
    const air = r.airT || 0;
    r.airT = 0;
    const near = () => r.feet.distanceTo(this.camera.position) < 45;
    const surface = () => this.world.surfaceAt?.(r.feet.x, r.feet.z) || 'concrete';
    // Landing thump after a real jump / drop (not a one-frame grounded flicker).
    if (air > 0.3) { r.stepDist = 0; if (near()) this.audio.land?.(surface(), r.feet.clone(), Math.min(1.6, 0.7 + air * 0.6)); return; }
    const sp = Math.hypot(r.velocity.x, r.velocity.z);
    if (sp < 1.5) return;
    r.stepDist += sp * dt;
    const stride = r.sprinting ? 2.7 : 2.1;
    if (r.stepDist > stride) {
      r.stepDist = 0;
      if (near()) this.audio.footstep(surface(), r.feet.clone(), r.crouch > 0.5 ? 0.3 : r.sprinting ? 1.2 : 0.8);
    }
  }

  _updateHud(dt, t, inp) {
    const hud = this.hud, ar = this.arsenal, p = this.player;
    hud.update(dt);
    hud.setAlive(this.alive);
    hud.setHealth(this.alive ? this.hp : 100);
    hud.protect(this.alive && t < this.protectUntil);
    hud.kit({
      grapple: Math.min(1, 1 - (this.grappleReadyAt - t) / this.grappleCd),
      dash: Math.min(1, 1 - (this.dashReadyAt - t) / KIT.dashCooldown),
      grappling: !!p.grapple,
      target: this.alive && !p.grapple && !!this.grappleTarget,
      visible: this.alive && this.match.state === 'playing',
    });
    // HP bars over enemies we are damaging (host-confirmed values only), fading 2.5 s after our last hit.
    const bars = [];
    for (const [id, b] of this.enemyBars) {
      const r = this.remotes.get(id);
      if (!r || !r.alive || t > b.until) { if (t > b.until) this.enemyBars.delete(id); continue; }
      bars.push({ id, pos: r.eye(new THREE.Vector3()).add(_v3.set(0, 0.55, 0)), hp: b.hp, armor: b.armor, alpha: Math.min(1, (b.until - t) / 0.6) });
    }
    hud.enemyBars(this.killcam ? [] : bars, this.camera);
    hud.swapHint(this.alive && !!this.swapHint);
    hud.equipment({
      frags: this.throwables.frags, cook: this.throwables.cookFraction(t),
      armor: this.streaks.armor, visible: this.alive,
      streak: this.streaks.streak, items: this.streaks.items, uav: this.streaks.uavActive, speed: this.streaks.speedMult > 1,
      prompt: this.alive ? this.streakPrompt : null,
    });

    const g = ar.gun;
    if (g) {
      hud.weapon({
        slots: ar.guns.map((x) => x.stats.short), current: ar.slot, label: weaponName(g.id),
        ammo: g.ammo, reserve: g.reserve, mag: g.stats.mag, reloading: g.reloading,
      });
    }
    const scoped = (this.alive && g?.stats.scope && ar.ads > 0.85) || this.killcam?.scoped;   // kill cam: the killer's scope
    hud.scope(!!scoped);

    // Crosshair + target name (teammates are shown in their team color and are not targets).
    let aimName = null, aimFriendly = false;
    if (this.alive) {
      const eye = p.getEye(_v1), dir = this._viewDir(_v2);
      const wh = this.hitscan.castWorld(eye, dir, 120, { bullets: true });
      const all = [];
      for (const r of this.remotes.values()) if (r.alive) all.push(r.hitbox());
      const th = this.hitscan.castTargets(eye, dir, wh ? wh.distance : 120, all);
      if (th) { aimName = this.nameOf(th.id); aimFriendly = this.isTeammate(th.id); }
    }
    const moving = Math.min(1, p.horizontalSpeed() / 5);
    const spread = g ? g.spread({ ads: ar.ads, moving, airborne: !p.grounded, crouching: p.crouching }) : 0;
    const px = (Math.tan(spread) / Math.tan((this.camera.fov * DEG) / 2)) * (innerHeight / 2);
    hud.crosshair({ visible: this.alive && !this.laptop.shown && !this.fin.localAttacking && ar.ads < 0.5 && !p.sprinting && this.match.state === 'playing', spreadPx: px, enemy: !!aimName && !aimFriendly });
    hud.targetName(aimName, aimFriendly ? TEAM_CSS[this.myTeam] : null);

    const me = this.roster.get(this.localId);
    const list = [...this.roster.values()].filter((e) => !e.bot || e.ai || this.match.practice);
    const timeLeft = this.match.timeLeft === null ? null : this.match.timeLeft - (this.match.state === 'playing' ? t - this.match.timeRef : 0);
    const markers = this.isCtf ? this._updateCtfHud(t, timeLeft) : [];
    if (this.isTdm) {
      hud.timer(timeLeft, this.match.practice ? 'TDM practice' : `First to ${this.match.scoreLimit} kills`);
      hud.ctf({ score: this.teamScore, status: null, myTeam: this.myTeam || 'red', carrying: false });
    }
    // Grenade danger indicators.
    if (this.alive) {
      this.throwables.dangers(p.position).forEach((pos, i) => markers.push({ id: 'nade' + i, pos: pos.clone(), label: 'Grenade', color: '#ff4b4b', icon: 'nade', pulse: true }));
    }
    // Players whose updates stopped (> 2 s): a warning over their head (they are frozen for us, not AFK).
    for (const r of this.remotes.values()) {
      if (this._lagging(r.id, t) && !r.inHeliSeat) markers.push({ id: 'lag' + r.id, pos: r.eye(new THREE.Vector3()).add(_v1.set(0, 0.75, 0)), label: 'Connection problem', color: '#ffb020', icon: 'lag', pulse: true });
    }
    hud.markers(this.everSpawned && this.match.state === 'playing' && !this.killcam ? markers : [], this.camera);
    if (!this.isTeams) {
      // FFA score / rank.
      const myK = me?.k ?? 0;
      const rank = 1 + list.filter((e) => e.k > myK).length;
      const leader = list.filter((e) => e.id !== this.localId).sort((a, b) => b.k - a.k)[0];
      hud.score({
        myKills: myK, rank: this.match.practice ? 0 : rank, leaderName: leader ? leader.name : '-',
        leaderKills: leader ? leader.k : 0, limit: this.match.scoreLimit, practice: this.match.practice,
      });
      hud.timer(timeLeft, this.match.practice ? 'Free roam' : `First to ${this.match.scoreLimit}`);
    }

    // Net info.
    if (this.session.mode === 'host') hud.netInfo(`ROOM ${this.session.roomCode} · ${this.roster.size}/${MATCH.maxPlayers}`);
    else if (this.session.mode === 'client') hud.netInfo(`ROOM ${this.session.roomCode} · ${me?.ping ?? '-'} ms`);
    else hud.netInfo('');

    // Scoreboard.
    const showSb = inp.enabled && inp.isDown('Tab');
    if (showSb || this._sbVisible) {
      const rows = list.slice().sort((a, b) => (b.caps - a.caps) * (this.isCtf ? 1 : 0) || b.k - a.k || a.d - b.d).map((e) => ({
        name: e.name, k: e.k, d: e.d, caps: e.caps || 0, ret: e.ret || 0, team: e.team, cls: e.bot && !e.ai ? '' : classOf(e.cls).tag,
        ping: e.bot ? 'BOT' : e.id === 1 && this.session.mode !== 'practice' ? 'HOST' : (e.ping ?? '-'),
        me: e.id === this.localId, alive: e.alive, color: colorCss(e.color), lag: this._lagging(e.id, t)
      }));
      const meta = this.session.roomCode ? `Room ${this.session.roomCode}` : 'Practice';
      const title = this.isCtf ? 'Capture the Flag' : this.isTdm ? 'Team Deathmatch' : this.match.practice ? 'Practice range' : 'Free-for-all';
      hud.scoreboard(showSb, rows, meta, title, this.isTeams ? { score: this.isCtf ? this.ctfView?.score : this.teamScore, names: TEAM_NAMES, caps: this.isCtf } : null);
    }
    this._sbVisible = showSb;

    this.minimap.draw({ x: p.position.x, z: p.position.z, yaw: p.yaw, alive: this.alive }, this.mapBlips(t), this.world.playBounds);
  }

  /** Strike laptop: every living player's live position (enemies red dots, teammates green arrows) + flags / heli. */
  laptopBlips(t) {
    const blips = [];
    for (const r of this.remotes.values()) {
      if (!r.alive || r.inHeliSeat) continue;
      if (this.isTeammate(r.id)) blips.push({ x: r.feet.x, z: r.feet.z, color: MAP_ALLY, alpha: 1, size: 5, shape: 'arrow', yaw: r.yaw });
      else blips.push({ x: r.feet.x, z: r.feet.z, color: MAP_ENEMY, alpha: r.bot && !r.ai ? 0.7 : 1, size: 4.5 });
    }
    for (const b of this.mapBlips(t)) if (b.shape === 'flag' || b.shape === 'heli' || b.shape === 'crate') blips.push(b);
    return blips;
  }

  /**
   * Viewer-relative look: teammates 'ally', practice dummies 'neutral', everyone else 'enemy' (re-applied whenever it
   * changes: team switches, character swaps). Enemy name tags only with line of sight and near the crosshair or < 25 m.
   */
  _relation(r, t) {
    const rel = r.bot && !r.ai ? 'neutral' : this.isTeammate(r.id) ? 'ally' : 'enemy';
    if (r._rel !== rel || r._relChar !== r.character) { r._rel = rel; r._relChar = r.character; r.character.setRelation?.(rel); r._tag = null; }
    let tag = true;
    if (rel === 'enemy') {
      if (t >= (r._tagT || 0)) {
        r._tagT = t + 0.2;
        const cam = this.camera.position, head = r.eye(_v2);
        const to = head.sub(cam);
        const d = to.length();
        let vis = false;
        if (r.alive && d < 300) {
          const near = d < 25;
          const fwd = _v3.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
          const aimed = to.dot(fwd) / Math.max(d, 1e-3) > Math.cos(4 * DEG);
          vis = (near || aimed) && !this.hitscan.castWorld(cam, to.normalize(), d - 0.4, { bullets: true });
        }
        r._tagVis = vis;
      }
      tag = !!r._tagVis;
    }
    if (r._tag !== tag) { r._tag = tag; r.character.setTagVisible?.(tag); }
  }

  /** A remote human whose movement updates stopped arriving more than 2 s ago. */
  _lagging(id, t) {
    const r = this.remotes.get(id);
    return !!(r && !r.bot && !r.ai && r.alive && !r.puppeted && !r.inHeliSeat && this.heliView?.s?.pilot !== id && r.lastRecv && t - r.lastRecv > 2);
  }

  /**
   * Blips for the minimap and the strike laptop, relative to the viewer: teammates = green arrows (facing), always
   * shown in team modes; enemies = red dots only while revealed (gunfire ping, UAV, carrying our flag). Flags: ours
   * green, theirs red.
   */
  mapBlips(t) {
    const blips = [];
    const ourFlagCarrier = this.isCtf ? this.ctfView?.carrierOf(this.myTeam) : null;
    for (const r of this.remotes.values()) {
      if (!r.alive) continue;
      const x = r.feet.x, z = r.feet.z;
      if (this.isTeammate(r.id)) { blips.push({ x, z, color: MAP_ALLY, alpha: 1, size: 5, shape: 'arrow', yaw: r.yaw }); continue; }
      if (r.id === ourFlagCarrier) { blips.push({ x, z, color: MAP_ENEMY, alpha: 0.6 + 0.4 * Math.abs(Math.sin(t * 5)), size: 6 }); continue; }
      if (r.bot && !r.ai) { blips.push({ x, z, color: MAP_ENEMY, alpha: 0.7, size: 3 }); continue; }   // practice dummies
      if (this.streaks.uavActive) { blips.push({ x, z, color: MAP_ENEMY, alpha: 0.9, size: 4.5 }); continue; }
      const last = this.blips.get(r.id);
      const age = last === undefined ? 99 : t - last;
      // Gunfire ping; off the map's radius it becomes an edge arrow pointing at the shooter.
      if (age < 2) blips.push({ x, z, color: MAP_ENEMY, alpha: 1 - age / 2, size: 4.5, edge: true });
    }
    if (this.ctfView) {
      for (const team of TEAMS) {
        const fp = this.ctfView.flagPos(team, _v3);
        blips.push({ x: fp.x, z: fp.z, color: team === this.myTeam ? MAP_ALLY : MAP_ENEMY, alpha: 1, size: 6, shape: 'flag' });
      }
    }
    // Care packages are on everyone's minimap (steal the enemy's): green = ours / a teammate's, red = an enemy's.
    for (const e of this.streaks.crates?.values?.() || []) {
      if (e.state !== 'incoming' && e.state !== 'landed') continue;
      const ours = e.owner === this.localId || this.isTeammate(e.owner);
      const alpha = e.state === 'incoming' ? 0.55 + 0.45 * Math.abs(Math.sin(t * 4)) : 1;
      blips.push({ x: e.p.x, z: e.p.z, color: ours ? MAP_ALLY : MAP_ENEMY, alpha, size: 6, shape: 'crate', edge: true });
    }
    // The helicopter is on everyone's minimap while it flies.
    // Green when we (or a teammate) fly it, red for the enemy.
    if (this.heliView?.flying) {
      const pid = this.heliView.s.pilot;
      const ours = this.heliView.mine || (pid !== null && this.isTeammate(pid));
      blips.push({ x: this.heliView.pos.x, z: this.heliView.pos.z, color: ours ? MAP_ALLY : MAP_ENEMY, alpha: 1, size: 7, shape: 'heli', edge: true });
    }
    return blips;
  }

  _updateCtfHud(t, timeLeft) {
    const hud = this.hud, cv = this.ctfView;
    if (!cv) return [];
    const my = this.myTeam || 'red';
    const sub = this.match.overtime ? 'Overtime · next capture wins' : this.match.practice ? 'CTF practice' : `First to ${this.match.scoreLimit} captures`;
    hud.timer(timeLeft, sub);
    hud.ctf({
      score: cv.score, status: { red: cv.status('red'), blue: cv.status('blue') }, myTeam: my,
      carrying: cv.carrierOf(otherTeam(my)) === this.localId && this.alive,
    });
    // Waypoints: both flags (where they are now) + own base while carrying.
    const markers = [];
    const enemy = otherTeam(my);
    const ef = cv.flags[enemy], of = cv.flags[my];
    if (cv.carrierOf(enemy) !== this.localId) {
      const pos = cv.flagPos(enemy, new THREE.Vector3()).add(_v1.set(0, 2.6, 0));
      const label = (ef.state === 'home' ? 'Attack' : ef.state === 'dropped' ? 'Take' : 'Escort') + ' · ' + TEAM_NAMES[enemy] + ' flag';
      markers.push({ id: 'flag-' + enemy, pos, label, color: TEAM_CSS[enemy], icon: 'flag', pulse: ef.state === 'dropped' });
    }
    {
      const pos = cv.flagPos(my, new THREE.Vector3()).add(_v1.set(0, 2.6, 0));
      const label = (of.state === 'home' ? 'Defend' : of.state === 'dropped' ? 'Return' : 'Kill carrier') + ' · ' + TEAM_NAMES[my] + ' flag';
      markers.push({ id: 'flag-' + my, pos, label, color: TEAM_CSS[my], icon: 'flag', pulse: of.state !== 'home' });
    }
    if (cv.carrierOf(enemy) === this.localId) {
      const pos = cv.bases[my].clone().add(_v1.set(0, 2, 0));
      markers.push({ id: 'base-' + my, pos, label: of.state === 'home' ? 'Capture · ' + TEAM_NAMES[my] + ' base' : 'Base (your flag is missing)', color: TEAM_CSS[my], icon: 'base', pulse: true });
    }
    return markers;
  }

  /** Renders one frame. */
  render(dt) {
    this.world.update(dt, this.camera);
    this.effects.update(dt, this.camera);
    this.world.render(this.alive ? this.overlayScene : null, this.overlayCamera);
  }

  resize(aspect) {
    this.overlayCamera.aspect = aspect;
    this.overlayCamera.updateProjectionMatrix();
  }

  restartMatch() {
    if (this.session.isHost && this.session.authority) this.session.authority.restart();
  }

  dispose() {
    this._stopStateTicker?.();
    this.session.onMessage = null;
    this.session.close();
    for (const r of this.remotes.values()) { r.cable?.dispose(); r.dispose(); }
    this._endDeathFlow();
    this.throwables.dispose();
    this.heliView?.dispose();
    this.streaks.dispose();
    this.strikeView.dispose();
    this.laptop.dispose();
    this.fin.dispose();
    this.remotes.clear();
    this.ctfView?.dispose();
    this.cable.dispose();
    this.hud.markers([], this.camera);
    this.arsenal.disposeViewmodels();
    this.hud.show(false);
  }
}

function smooth(x) { return x * x * (3 - 2 * x); }
/** Movement mode sent in the 'st' state ('m'): 1 slide, 2 ladder, 3 mantle, 4 dash, 0 otherwise. */
function moveMode(p) { return p.ladder ? 2 : p.mantle ? 3 : p.sliding ? 1 : p.dashT > 0 ? 4 : 0; }

function shortName(w) {
  if (w === 'melee') return 'MELEE';
  if (w === 'finisher') return 'FINISHER';
  if (w === 'frag') return 'FRAG';
  if (w === 'airstrike') return 'AIRSTRIKE';
  if (w === 'heli' || w === 'heligun') return 'HELI';
  if (w === 'rotor') return 'ROTOR';
  if (w === 'crash') return 'CRASH';
  if (w === 'rocket') return 'ROCKET';
  return WEAPON_STATS[w]?.short || String(w).toUpperCase();
}

/** Random direction inside a cone of half-angle `spread` around `aim`. ring: pellet index fraction for even shotgun spread. */
function coneDir(aim, spread, ring) {
  if (spread <= 0) return aim.clone();
  const up = Math.abs(aim.y) > 0.99 ? _v3.set(1, 0, 0) : _v3.set(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(aim, up).normalize();
  const v = new THREE.Vector3().crossVectors(u, aim).normalize();
  let a, r;
  if (ring !== null) { a = ring * Math.PI * 2 + Math.random() * 0.6; r = spread * (0.35 + 0.65 * Math.sqrt(Math.random())); }
  else { a = Math.random() * Math.PI * 2; r = spread * Math.sqrt(Math.random()); }
  const tr = Math.tan(r);
  return aim.clone().addScaledVector(u, Math.cos(a) * tr).addScaledVector(v, Math.sin(a) * tr).normalize();
}
