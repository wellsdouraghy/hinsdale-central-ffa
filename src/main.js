// App entry: renderer, menus, world loading, session creation and the main loop.
import './ui/styles.css';
import * as THREE from 'three';
import { createWorld } from './world/index.js';
import { createEffects } from './visuals/effects.js';
import { loadSettings, saveSettings, resolveGoogleKey, sanitizeName } from './game/settings.js';
import { createAudio } from './game/audio.js';
import { Input } from './game/input.js';
import { Game } from './game/game.js';
import { createHitscan } from './game/hitscan.js';
import { planPractice, planCtfPractice } from './game/practice.js';
import { TEAM_NAMES, TEAM_CSS } from './game/ctf.js';
import { IS_MAC } from './game/settings.js';
import { createPracticeSession, createHostSession, createClientSession } from './net/session.js';
import { normalizeCode } from './net/peer.js';
import { createHud } from './ui/hud.js';
import { createMinimap } from './ui/minimap.js';
import { createMenus } from './ui/menus.js';

const params = new URLSearchParams(location.search);
const autostart = params.get('autostart');
const debug = params.has('debug') || !!autostart;

const settings = loadSettings();
if (params.get('name')) settings.name = params.get('name');

// ---------- renderer / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.className = 'game';
document.getElementById('app').prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 6000);

const audio = createAudio();
audio.setVolume(settings.volume);
const input = new Input(renderer.domElement);
input.forceActive = debug;
const hud = createHud();
const minimap = createMinimap(document.getElementById('minimap'));
const menus = createMenus({
  settings,
  onSettingsChange: (key) => {
    saveSettings(settings);
    if (key === 'volume') audio.setVolume(settings.volume);
  },
});

let worldCache = null;   // { key, world, scene, effects }
let game = null;
let starting = false;

// First user gesture unlocks audio.
const unlockAudio = () => audio.ensure();
addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });

// ---------- world ----------
async function getWorld(onProgress) {
  const gkey = resolveGoogleKey(settings);
  const key = `${settings.quality}|${gkey || ''}`;
  if (worldCache && worldCache.key === key) { onProgress(1, 'Ready'); return worldCache; }
  if (worldCache) { worldCache.world.dispose(); worldCache = null; }
  const scene = new THREE.Scene();
  const world = await createWorld({
    renderer, scene, camera,
    settings: { quality: settings.quality, googleTilesKey: gkey },
    onProgress,
  });
  world.setSize(innerWidth, innerHeight);
  worldCache = { key, world, scene, effects: createEffects(scene) };
  return worldCache;
}

// ---------- game lifecycle ----------
async function start(mode, code = null, gameMode = 'ffa') {
  if (starting || game) return;
  starting = true;
  audio.ensure();
  settings.name = sanitizeName(menus.name || settings.name);
  saveSettings(settings);
  menus.showTitleError('');
  const titles = { practice: ['Practice range', 'Hinsdale Central'], host: ['Hosting match', 'Hinsdale Central'], join: ['Joining match', `Room ${code}`] };
  menus.showLoading(...titles[mode]);
  let session = null;
  try {
    // Joining: connect first so a bad room code fails fast.
    if (mode === 'join') {
      session = await createClientSession({ code, name: settings.name, onStatus: (s) => menus.setProgress(0.05, s) });
    }
    const wc = await getWorld((f, label) => menus.setProgress(0.08 + f * 0.82, label));
    if (mode === 'practice') {
      menus.setProgress(0.95, 'Setting up targets');
      const plan = gameMode === 'ctf' ? planCtfPractice(wc.world) : planPractice(wc.world, createHitscan(wc.world));
      session = createPracticeSession({ world: wc.world, name: settings.name, dummies: plan.dummies, spawn: plan.spawn, mode: gameMode });
    } else if (mode === 'host') {
      session = await createHostSession({ world: wc.world, name: settings.name, mode: gameMode, onStatus: (s) => menus.setProgress(0.93, s) });
    }
    menus.setProgress(1, 'Ready');
    game = new Game({
      world: wc.world, scene: wc.scene, camera, effects: wc.effects, settings, session,
      hud, minimap, audio, input, ui: gameUi(session),
    });
    game.resize(camera.aspect);
    game.ui.refreshTeam();
    session.onDisconnect = (reason) => leave(reason);
    if (session.roomCode) history.replaceState(null, '', `${location.pathname}?join=${session.roomCode}${debugSuffix()}`);
    menus.hideLoading();
    input.enabled = true;
    if (mode === 'host') menus.toast(`Room ${session.roomCode} is live. Share the code or invite link (Esc menu).`, 5);
    if (autostart) game.deploy();
  } catch (err) {
    console.info('[start failed]', err);
    try { session?.close(); } catch { /* ignore */ }
    game = null;
    menus.showTitle();
    menus.showTitleError(err?.message || String(err));
  } finally {
    starting = false;
  }
}

function debugSuffix() {
  const keep = ['gkey'].filter((k) => params.has(k)).map((k) => `&${k}=${encodeURIComponent(params.get(k))}`);
  if (debug) keep.push('&debug=1');
  return keep.join('');
}

/**
 * Pointer lock for play. With Ctrl as the sprint key on Windows/Linux, also go fullscreen and lock the keyboard
 * (Chrome/Edge) so Ctrl+W / Ctrl+T / Ctrl+N cannot close or replace the tab mid-sprint.
 */
function enterPlay() {
  if (settings.sprintKey === 'ctrl' && !IS_MAC && !debug && document.documentElement.requestFullscreen && navigator.keyboard?.lock) {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(() => navigator.keyboard.lock(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'Tab']).catch(() => {}))
        .catch(() => {})
        .finally(() => input.requestLock());
      return;
    }
    navigator.keyboard.lock(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'Tab']).catch(() => {});
  }
  input.requestLock();
}

function exitPlay() {
  try { navigator.keyboard?.unlock?.(); } catch { /* ignore */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function leave(reason = null) {
  if (!game) return;
  exitPlay();
  game.dispose();
  game = null;
  input.enabled = false;
  input.exitLock();
  menus.showTitle();
  if (reason) menus.showTitleError(reason);
  history.replaceState(null, '', location.pathname + (debugSuffix() ? '?' + debugSuffix().slice(1) : ''));
}

/** UI bridge used by Game (keeps Game free of DOM details). */
function gameUi(session) {
  return {
    showDeploy: (o) => menus.showDeploy({ ...o, roomCode: session.roomCode }),
    hideDeploy: () => { if (menus.deployMode !== 'loadout') menus.hideDeploy(); },
    setLoadout: (id) => menus.setLoadout(id),
    setDeathCountdown: (s) => menus.setDeathCountdown(s),
    showEnd: (d) => { menus.hidePause(); menus.showEnd(d); input.enabled = false; },
    hideEnd: () => {
      menus.hideEnd();
      input.enabled = true;
      if (!input.locked && !debug && menus.deployMode === null) menus.showPause(session.roomCode);
    },
    toast: (t) => menus.toast(t),
    refreshTeam: () => {
      const team = game?.isCtf ? game.myTeam : null;
      menus.setTeam(team ? { team, name: TEAM_NAMES[team], css: TEAM_CSS[team] } : null);
    },
  };
}

// ---------- menu wiring ----------
menus.on('practice', (m) => start('practice', null, m));
menus.on('host', (m) => start('host', null, m));
menus.on('switchTeam', () => game?.switchTeam());
menus.on('join', (code) => start('join', normalizeCode(code)));
menus.on('deploy', () => {
  if (!game) return;
  enterPlay();
  game.deploy();
});
menus.on('selectPrimary', (id) => { game?.selectPrimary(id); if (!game) { settings.primary = id; menus.setLoadout(id); } saveSettings(settings); });
menus.on('resume', () => { menus.hidePause(); input.enabled = true; enterPlay(); });
menus.on('leave', () => leave());
menus.on('loadout', () => {
  menus.hidePause();
  input.enabled = true;
  menus.showDeploy({ mode: 'loadout', selected: game?.selectedPrimary || settings.primary });
});
menus.on('loadoutDone', () => {
  menus.hideDeploy();
  if (game && !game.alive && game.deployed && game.deathInfo) game.ui.showDeploy({ ...game.deathInfo, selected: game.selectedPrimary });
  enterPlay();
});
menus.on('restart', () => game?.restartMatch());
menus.on('settingsClosed', () => saveSettings(settings));
menus.on('copyInvite', async () => {
  const code = game?.session.roomCode;
  if (!code) return;
  const url = `${location.origin}${location.pathname}?join=${code}`;
  try { await navigator.clipboard.writeText(url); menus.toast('Invite link copied'); }
  catch { menus.toast(url, 6); }
});

input.onLockChange = (locked) => {
  if (!game) return;
  if (locked) { menus.hidePause(); input.enabled = true; return; }
  if (!debug && !menus.endOpen && game.deployed && menus.deployMode === null) {
    menus.showPause(game.session.roomCode);
    input.enabled = false;
  }
};
renderer.domElement.addEventListener('click', () => {
  if (game && game.deployed && !menus.pauseOpen && !menus.endOpen && menus.deployMode !== 'loadout') enterPlay();
});

// Invite link: ?join=CODE
const joinParam = normalizeCode(params.get('join'));
if (joinParam.length === 6 && autostart !== 'join') menus.prefillJoin(joinParam);

// ---------- resize ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (worldCache) worldCache.world.setSize(innerWidth, innerHeight);
  else renderer.setSize(innerWidth, innerHeight);
  game?.resize(camera.aspect);
});

addEventListener('beforeunload', () => { try { game?.dispose(); } catch { /* ignore */ } });

// ---------- main loop ----------
let lastFrame = performance.now();
let attrTimer = 0;
function frame() {
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - lastFrame) / 1000);
  lastFrame = nowMs;
  attrTimer -= dt;
  if (attrTimer <= 0) {
    attrTimer = 1;
    menus.setAttribution(worldCache?.world.attributionHTML || 'Map data &copy; OpenStreetMap contributors &middot; Imagery &copy; Esri, Maxar, Earthstar Geographics');
  }
  if (!game) return;
  if (!debug && !input.locked && game.alive && game.deployed && input.enabled && !menus.pauseOpen && !menus.endOpen
    && menus.deployMode === null && nowMs - input.lastLockRequest > 800) {
    menus.showPause(game.session.roomCode);
    input.enabled = false;
  }
  try {
    game.update(dt);
    game.render(dt);
  } catch (err) {
    // Keep the loop alive; report each distinct error once.
    const msg = String(err?.stack || err);
    if (!frame.reported?.has(msg)) { (frame.reported ||= new Set()).add(msg); console.error(err); }
  }
}
renderer.setAnimationLoop(frame);
// Debug/automation: keep simulating when rAF is paused (e.g. a hidden automation browser pane).
if (debug) setInterval(() => { if (performance.now() - lastFrame > 45) frame(); }, 20);

// ---------- debug / automation hook ----------
window.__game = {
  get game() { return game; },
  get player() { return game?.player; },
  get world() { return worldCache?.world; },
  input, settings, audio, menus, renderer, camera,
  start, leave,
  key: (code, down = true) => input.simKey(code, down),
  look: (dx, dy) => input.simLook(dx, dy),
  tap(code, ms = 60) { input.simKey(code, true); setTimeout(() => input.simKey(code, false), ms); },
};

const autoMode = params.get('mode') === 'ctf' ? 'ctf' : 'ffa';
if (autostart === 'practice') start('practice', null, autoMode);
else if (autostart === 'host') start('host', null, autoMode);
else if (autostart === 'join' && joinParam.length === 6) start('join', joinParam);
