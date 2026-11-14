// Desktop app: renderer, menus, world loading, session creation and the main loop (loaded by src/main.js).
import * as THREE from 'three';
import { createWorld } from '../world/index.js';
import { createEffects } from '../visuals/effects.js';
import { loadSettings, saveSettings, resolveGoogleKey, sanitizeName } from './settings.js';
import { createAudio } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { createHitscan } from './hitscan.js';
import { planPractice, planCtfPractice } from './practice.js';
import { TEAM_NAMES, TEAM_CSS } from './ctf.js';
import { IS_MAC } from './settings.js';
import { createPracticeSession } from '../net/session.js';
import { createHostNet } from '../net/hostNet.js';
import { createClientNet } from '../net/clientNet.js';
import { createLobbyUi } from '../ui/lobby.js';
import { normalizeCode } from '../net/peer.js';
import { createHud } from '../ui/hud.js';
import { createMinimap } from '../ui/minimap.js';
import { createMenus } from '../ui/menus.js';
import { playIntro } from '../ui/intro.js';
import { getMicStream, stopStream, VoiceMesh } from '../net/voice.js';
import { VoiceAudio } from './voiceAudio.js';

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

const audio = createAudio({ mute: params.has('mute') });
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

const lobbyUi = createLobbyUi({
  onSettings: (patch) => net?.isHost && net.setSettings(patch),
  onMove: (id, team) => net?.isHost && net.moveTeam(id, team),
  onAutoBalance: () => net?.isHost && net.autoBalance(),
  onReady: (r) => net && !net.isHost && net.setReady(r),
  onTeam: (team) => net && !net.isHost && net.setTeam(team),
  onStart: () => net?.isHost && net.startCountdown(3),
  onLeave: () => leave(),
  onWarn: (t) => menus.toast(t, 4),
  onCopy: () => copyInvite(),
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
let net = null;            // online room (hostNet / clientNet) that outlives single matches
let worldLoading = null;

/** Loads (or reuses) the world; progress goes to the loading screen or the lobby status line. */
function worldReady(onProgress) {
  if (!worldLoading) worldLoading = getWorld(onProgress).finally(() => { worldLoading = null; });
  return worldLoading;
}

async function start(mode, code = null, gameMode = 'ffa', bots = null) {
  if (starting || game || net) return;
  starting = true;
  audio.ensure();
  settings.name = sanitizeName(menus.name || settings.name);
  saveSettings(settings);
  menus.showTitleError('');
  const titles = { practice: ['Practice range', 'Hinsdale Central'], host: ['Opening lobby', 'Hinsdale Central'], join: ['Joining room', `Room ${code}`] };
  menus.showLoading(...titles[mode]);
  if (mode !== 'practice' && !autostart) playIntro(); // plays over the loading screen
  let mic = null;
  try {
    if (mode === 'practice') {
      const wc = await worldReady((f, label) => menus.setProgress(0.05 + f * 0.85, label));
      menus.setProgress(0.95, 'Setting up targets');
      const plan = gameMode === 'ctf' ? planCtfPractice(wc.world) : planPractice(wc.world, createHitscan(wc.world));
      const session = createPracticeSession({ world: wc.world, name: settings.name, dummies: plan.dummies, spawn: plan.spawn, mode: gameMode, bots });
      menus.hideLoading();
      enterMatch(session, wc);
      return;
    }
    // Online rooms require proximity voice: get the mic before connecting.
    menus.setProgress(0.02, 'Microphone');
    mic = await acquireMic();
    if (!mic) { menus.showTitle(); return; }
    if (mode === 'host') {
      net = await createHostNet({
        name: settings.name, onStatus: (s) => menus.setProgress(0.3, s),
        settings: { mode: gameMode, bots: bots?.count ?? 0, difficulty: bots?.difficulty ?? 'normal' },
      });
    } else {
      net = await createClientNet({ code, name: settings.name, onStatus: (s) => menus.setProgress(0.3, s) });
    }
    wireNet(net);
    voice = startVoice(net, mic);
    mic = null;
    history.replaceState(null, '', `${location.pathname}?join=${net.roomCode}${debugSuffix()}`);
    menus.hideLoading();
    if (net.initialSession) {
      // Joined while a match is running: straight in.
      menus.showLoading('Joining match', `Room ${net.roomCode}`);
      const wc = await worldReady((f, label) => menus.setProgress(0.1 + f * 0.85, label));
      menus.hideLoading();
      enterMatch(net.initialSession, wc);
    } else {
      showLobby();
      // Preload the campus while people gather.
      worldReady((f, label) => lobbyUi.status(f >= 1 ? 'Campus loaded' : `Loading campus ${Math.round(f * 100)}% · ${label || ''}`))
        .then(() => lobbyUi.status('Campus loaded · ready to play'))
        .catch((err) => lobbyUi.status('World failed to load: ' + (err?.message || err)));
    }
  } catch (err) {
    console.info('[start failed]', err);
    stopStream(mic);
    stopVoice();
    try { net?.close(); } catch { /* ignore */ }
    net = null;
    game = null;
    menus.showTitle();
    menus.showTitleError(err?.message || String(err));
  } finally {
    starting = false;
  }
}

function wireNet(n) {
  n.onLobby = (st) => lobbyUi.update(st);
  n.onCountdown = (s) => lobbyUi.countdown(s);
  n.onMatchStart = async () => {
    lobbyUi.status('Loading campus for the match');
    const wc = await worldReady((f, label) => lobbyUi.status(`Loading campus ${Math.round(f * 100)}% · ${label || ''}`));
    if (net !== n) return;
    const session = n.isHost ? n.startMatch(wc.world) : await n.joinMatch();
    if (net !== n) return;
    enterMatch(session, wc);
  };
  n.onToLobby = () => backToLobby();
  n.onDisconnect = (reason) => leave(reason);
  n.onNotice = (t) => menus.toast(t);
}

function showLobby() {
  lobbyUi.show(net.lobby, { isHost: net.isHost, localId: net.localId });
}

/** Creates the Game for a match session (practice, host or client). */
function enterMatch(session, wc) {
  lobbyUi.hide();
  menus.lobbyAvailable = !!net; // "Back to lobby" on the end screen (host of an online room)
  menus.hideTitle();
  game = new Game({
    world: wc.world, scene: wc.scene, camera, effects: wc.effects, settings, session,
    hud, minimap, audio, input, ui: gameUi(session),
  });
  game.resize(camera.aspect);
  game.ui.refreshTeam();
  voice?.va.setGame(game);
  input.enabled = true;
  if (autostart || params.has('autodeploy')) game.deploy();
}

/** Match over: everyone (host + clients) returns to the lobby of the same room. */
function backToLobby() {
  if (game) {
    exitPlay();
    game.dispose();
    game = null;
  }
  voice?.va.setGame(null);
  input.enabled = false;
  input.exitLock();
  menus.hideEnd();
  menus.hideDeploy();
  menus.hidePause();
  hud.voice(null);
  if (net) showLobby();
}

function debugSuffix() {
  const keep = ['gkey', 'fakemic', 'mute'].filter((k) => params.has(k)).map((k) => `&${k}=${encodeURIComponent(params.get(k))}`);
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
  if (!game && !net) return;
  exitPlay();
  stopVoice();
  game?.dispose();
  game = null;
  try { net?.close(); } catch { /* ignore */ }
  net = null;
  lobbyUi.hide();
  input.enabled = false;
  input.exitLock();
  menus.showTitle();
  if (reason) menus.showTitleError(reason);
  history.replaceState(null, '', location.pathname + (debugSuffix() ? '?' + debugSuffix().slice(1) : ''));
}

// ---------- proximity voice (always on in online lobbies) ----------
let voice = null;
const micGate = document.getElementById('mic-gate');

/** Mic stream, or null if the player chose Leave on the "microphone required" screen. */
async function acquireMic() {
  const fake = params.has('fakemic');
  for (;;) {
    try {
      const s = await getMicStream(audio.context, fake);
      micGate.classList.add('hidden');
      return s;
    } catch (err) {
      document.getElementById('mic-err').textContent = err?.name === 'NotAllowedError'
        ? 'Microphone access was blocked.' : err?.name === 'NotFoundError' ? 'No microphone was found.' : (err?.message || 'The microphone could not be opened.');
      micGate.classList.remove('hidden');
      const retry = await new Promise((resolve) => {
        document.getElementById('btn-mic-retry').onclick = () => resolve(true);
        document.getElementById('btn-mic-leave').onclick = () => resolve(false);
      });
      if (!retry) { micGate.classList.add('hidden'); return null; }
    }
  }
}

function startVoice(n, stream) {
  if (!n.peer || !audio.context) { stopStream(stream); return null; }
  const va = new VoiceAudio(null, audio, stream); // lobby voice until a match starts
  const mesh = new VoiceMesh({
    peer: n.peer, localId: n.localId, stream,
    onStream: (gid, s) => va.add(gid, s),
    onClose: (gid) => va.remove(gid),
  });
  return { va, mesh, stream, syncT: 0 };
}

function updateVoice(dt) {
  if (!voice) { hud.voice(null); return; }
  voice.syncT -= dt;
  if (voice.syncT <= 0) {
    voice.syncT = 1;
    // Calls follow the room's human members (lobby and match ids are the same).
    voice.mesh.sync((net?.lobby?.members || []).map((m) => ({ id: m.id, pid: m.pid })));
  }
  voice.va.update(dt);
  lobbyUi.micLevel(voice.va.level);
  // Only our own mic meter: other players' talking is never shown (it would reveal their position).
  if (game) hud.voice({ level: voice.va.level, speakers: [] }, camera);
}

function stopVoice() {
  if (!voice) return;
  voice.mesh.dispose();
  voice.va.dispose();
  stopStream(voice.stream);
  voice = null;
  hud.voice(null);
}

/** UI bridge used by Game (keeps Game free of DOM details). */
function gameUi(session) {
  return {
    showDeploy: (o) => menus.showDeploy({ ...o, roomCode: session.roomCode }),
    hideDeploy: () => { if (menus.deployMode !== 'loadout') menus.hideDeploy(); },
    hideSwap: () => { if (menus.deployMode === 'swap') menus.hideDeploy(); },
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
      const team = game?.isTeams ? game.myTeam : null;
      menus.setTeam(team ? { team, name: TEAM_NAMES[team], css: TEAM_CSS[team] } : null);
    },
  };
}

// ---------- menu wiring ----------
menus.on('practice', (m, bots) => start('practice', null, m, bots));
menus.on('host', (m, bots) => start('host', null, m, bots));
menus.on('switchTeam', () => game?.switchTeam());
menus.on('join', (code) => start('join', normalizeCode(code)));
menus.on('deploy', () => {
  if (!game) return;
  enterPlay();
  game.deploy();
});
menus.on('selectClass', (id) => { game?.selectClass(id); if (!game) { settings.cls = id; menus.setLoadout(id); } saveSettings(settings); });
menus.on('resume', () => { menus.hidePause(); input.enabled = true; enterPlay(); });
menus.on('leave', () => leave());
menus.on('loadout', () => {
  menus.hidePause();
  input.enabled = true;
  menus.showDeploy({ mode: 'loadout', selected: game?.selectedClass || settings.cls });
});
menus.on('loadoutDone', () => {
  menus.hideDeploy();
  if (game && !game.alive && game.deployed && game.deathInfo) game.ui.showDeploy({ ...game.deathInfo, selected: game.selectedClass });
  enterPlay();
});
menus.on('restart', () => game?.restartMatch());
menus.on('swapClose', () => game?._closeSwap());
menus.on('settingsClosed', () => saveSettings(settings));
async function copyInvite() {
  const code = net?.roomCode || game?.session.roomCode;
  if (!code) return;
  const url = `${location.origin}${location.pathname}?join=${code}`;
  try { await navigator.clipboard.writeText(url); menus.toast('Invite link copied'); }
  catch { menus.toast(url, 6); }
}
menus.on('copyInvite', copyInvite);
menus.on('toLobby', () => net?.isHost && net.backToLobby());

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

addEventListener('beforeunload', () => { try { game?.dispose(); net?.close(); } catch { /* ignore */ } });

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
  if (voice && !game) updateVoice(dt);
  if (!game) return;
  if (!debug && !input.locked && game.alive && game.deployed && input.enabled && !menus.pauseOpen && !menus.endOpen
    && menus.deployMode === null && nowMs - input.lastLockRequest > 800) {
    menus.showPause(game.session.roomCode);
    input.enabled = false;
  }
  try {
    game.update(dt);
    updateVoice(dt);
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
  get voice() { return voice; },
  get net() { return net; },
  lobbyUi,
  input, settings, audio, menus, renderer, camera,
  start, leave,
  key: (code, down = true) => input.simKey(code, down),
  look: (dx, dy) => input.simLook(dx, dy),
  tap(code, ms = 60) { input.simKey(code, true); setTimeout(() => input.simKey(code, false), ms); },
};

const autoMode = ['ctf', 'tdm'].includes(params.get('mode')) ? params.get('mode') : 'ffa';
const autoBots = { count: Math.min(7, Number(params.get('bots')) || 0), difficulty: params.get('diff') || 'normal' };
if (autostart === 'practice') start('practice', null, autoMode, autoBots);
else if (autostart === 'host') start('host', null, autoMode, autoBots);
else if (autostart === 'join' && joinParam.length === 6) start('join', joinParam);
