// Desktop app: renderer, menus, world loading, session creation and the main loop (loaded by src/main.js).
import * as THREE from 'three';
import { createWorld, PLAY_BOUNDS } from '../world/index.js';
import { createEffects } from '../visuals/effects.js';
import { loadSettings, saveSettings, sanitizeName } from './settings.js';
import { createAudio } from './audio.js';
import { Input } from './input.js';
import { GamepadInput } from './gamepad.js';
import { CAMPUSES, getCampus, activeCampus, setActiveCampus } from '../campuses/index.js';
import { initBranding } from '../ui/branding.js';
import { createCampusPicker } from '../ui/campusPicker.js';
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
import { createMenuTour } from './menuTour.js';
import { checkForUpdate } from '../net/version.js';
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
audio.setSfxVolume(settings.sfxVolume);
audio.setVoiceVolume(settings.voiceVolume);
const input = new Input(renderer.domElement);
input.forceActive = debug;
// Xbox / standard controller (created after menus below; see gamepad.js for the layout).
let pad = null;
const hud = createHud();
const minimap = createMinimap(document.getElementById('minimap'));
// Campus: ?campus= (testing / links) > last choice. Joiners switch to the host's campus when they connect.
// (?terrainTest=1: the terrain test campus, src/campuses/terraintest.js)
setActiveCampus(getCampus(params.has('terrainTest') ? 'terraintest' : params.get('campus') || settings.campus).id);
initBranding();

const menus = createMenus({
  settings,
  sound: (kind) => (kind === 'hover' ? audio.uiHover() : kind === 'back' ? audio.uiBack() : audio.uiSelect()),
  onSettingsChange: (key) => {
    saveSettings(settings);
    if (key === 'volume') audio.setVolume(settings.volume);
    if (key === 'sfxVolume') audio.setSfxVolume(settings.sfxVolume);
    if (key === 'voiceVolume') audio.setVoiceVolume(settings.voiceVolume);
  },
});

const lobbyUi = createLobbyUi({
  onSettings: (patch) => net?.isHost && net.setSettings(patch),
  onMove: (id, team) => net?.isHost && net.moveTeam(id, team),
  onAutoBalance: () => net?.isHost && net.autoBalance(),
  onBotTeam: (team, d) => net?.isHost && net.botTeam(team, d),
  onMoveBot: (team) => net?.isHost && net.moveBot(team),
  onReady: (r) => net && !net.isHost && net.setReady(r),
  onTeam: (team) => net && !net.isHost && net.setTeam(team),
  onRename: (name) => {
    if (!net) return;
    const clean = sanitizeName(name);
    net.setName?.(clean);
    settings.name = clean; saveSettings(settings);
    const ni = document.getElementById('name-input'); if (ni) ni.value = clean;
  },
  onStart: () => net?.isHost && net.startCountdown(3),
  onLeave: () => leave(),
  onWarn: (t) => menus.toast(t, 4),
  onCopy: () => copyInvite(),
});

const csEl = document.getElementById('campus-select');
let worldCache = null;   // { key, world, scene, effects }
const tour = createMenuTour({ camera });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Menu cinematic over the loaded campus (title + lobby); low quality / reduced motion keep the aerial still. */
function maybeTour() {
  if (game || !worldCache || settings.quality === 'low' || reducedMotion || autostart) return;
  if (worldCache.world.campus !== activeCampus() || !csEl.classList.contains('hidden')) return;
  tour.start(worldCache.world);
}
let game = null;
let starting = false;

// First user gesture unlocks audio.
const unlockAudio = () => audio.ensure();
addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });

// ---------- world ----------
async function getWorld(onProgress) {
  const campus = activeCampus();
  const key = `${campus.id}|${settings.quality}`;
  if (worldCache && worldCache.key === key) { onProgress(1, 'Ready'); return worldCache; }
  if (worldCache) { worldCache.world.dispose(); worldCache = null; }
  const scene = new THREE.Scene();
  const world = await createWorld({
    renderer, scene, camera,
    settings: { quality: settings.quality },
    onProgress, campus,
  });
  world.setSize(innerWidth, innerHeight);
  worldCache = { key, world, scene, effects: createEffects(scene) };
  return worldCache;
}

// ---------- game lifecycle ----------
let net = null;            // online room (hostNet / clientNet) that outlives single matches
let worldLoading = null;

/** Loads (or reuses) the world; every caller's onProgress hears the shared load (menu preload, loading screen, lobby). */
const progressFns = new Set();
let lastProgress = null;
let worldLoadingFor = null;   // campus the running load builds
function worldReady(onProgress) {
  if (onProgress) progressFns.add(onProgress);
  const campus = activeCampus();
  if (!worldLoading || worldLoadingFor !== campus) {
    // Nothing loading, or a load for another campus (the player switched): ours starts once that one is done.
    const prev = worldLoading || Promise.resolve();
    lastProgress = null;
    worldLoadingFor = campus;
    const p = prev.catch(() => {}).then(() => getWorld((f, label) => { lastProgress = [f, label]; for (const fn of progressFns) fn(f, label); }));
    worldLoading = p;
    p.finally(() => { if (worldLoading === p) { worldLoading = null; worldLoadingFor = null; progressFns.clear(); } }).catch(() => {});
  } else if (onProgress && lastProgress) onProgress(...lastProgress);
  return worldLoading;
}

/**
 * Builds the active campus behind a loading screen, then shows the title. Building the world keeps the page busy for
 * a few seconds, so the menu must not be on screen (and look frozen) while it happens.
 */
function loadCampusThenTitle() {
  const campus = activeCampus();
  if (worldCache?.world.campus === campus) { menus.showTitle(); menus.setWorldStatus(1); maybeTour(); return; }
  menus.showLoading('Loading campus', campus.name, { campus, bounds: campus.playBounds });
  worldReady((f, label) => { menus.setProgress(f, label); menus.setWorldStatus(f, label); })
    .then(() => {
      if (activeCampus() !== campus || game || net || starting) return;   // player moved on meanwhile
      menus.setWorldStatus(1);
      menus.hideLoading();
      menus.showTitle();
      maybeTour();
    })
    .catch((err) => {
      console.warn('[campus load]', err);
      menus.hideLoading();
      menus.showTitle();
      menus.setWorldStatus(0, 'will load when you play');
    });
}

async function start(mode, code = null, gameMode = 'ffa', bots = null) {
  if (starting || game || net) return;
  starting = true;
  audio.ensure();
  tour.stop();
  settings.name = sanitizeName(menus.name || settings.name);
  saveSettings(settings);
  menus.showTitleError('');
  const cname = activeCampus().name;
  const titles = { practice: ['Practice range', cname], host: ['Opening lobby', cname], join: ['Joining room', `Room ${code}`] };
  menus.showLoading(...titles[mode], { mode: gameMode, practice: mode === 'practice', bounds: PLAY_BOUNDS });
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
    // Online rooms require proximity voice. Connect first: a denied or slow microphone prompt must never drop the
    // connection (the "microphone required" panel shows over the lobby / match until it works or the player leaves).
    if (mode === 'host') {
      net = await createHostNet({
        name: settings.name, onStatus: (s) => menus.setProgress(0.3, s),
        settings: { mode: gameMode, bots: bots?.count ?? 0, difficulty: bots?.difficulty ?? 'normal', campus: activeCampus().id },
      });
    } else {
      net = await createClientNet({ code, name: settings.name, onStatus: (s) => menus.setProgress(0.3, s) });
      // The room's campus is the host's: switch to it (the world reloads if a different campus was preloaded).
      if (net.campus && setActiveCampus(getCampus(net.campus).id)) tour.stop();
    }
    wireNet(net);
    ensureVoice(net);
    history.replaceState(null, '', `${location.pathname}?join=${net.roomCode}${debugSuffix()}`);
    menus.hideLoading();
    if (net.initialSession) {
      // Joined while a match is running: straight in.
      menus.showLoading('Joining match', `Room ${net.roomCode}`, { mode: net.lobby?.settings?.mode || 'ffa', bounds: PLAY_BOUNDS });
      const wc = await worldReady((f, label) => menus.setProgress(0.1 + f * 0.85, label));
      menus.hideLoading();
      enterMatch(net.initialSession, wc);
    } else {
      showLobby();
      maybeTour();
      // Preload the campus while people gather.
      worldReady((f, label) => lobbyUi.status(f >= 1 ? 'Campus loaded' : `Loading campus ${Math.round(f * 100)}% · ${label || ''}`))
        .then(() => { lobbyUi.status('Campus loaded · ready to play'); maybeTour(); })
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
    maybeTour();
  } finally {
    starting = false;
  }
}

function wireNet(n) {
  n.onLobby = (st) => lobbyUi.update(st);
  n.onCountdown = (s) => lobbyUi.countdown(s);
  let matchStarting = false;
  n.onMatchStart = async () => {
    if (matchStarting) return;
    matchStarting = true;
    const say = (text) => { lobbyUi.status(text); lobbyUi.countdownStatus(text); };
    try {
      say('Loading campus');
      const wc = await worldReady((f, label) => say(f >= 1 ? 'Starting match' : `Loading campus ${Math.round(f * 100)}%${label ? ' · ' + label : ''}`));
      if (net !== n) return;
      say(n.isHost ? 'Starting match' : 'Joining match');
      const session = n.isHost ? n.startMatch(wc.world) : await n.joinMatch();
      if (net !== n) return;
      enterMatch(session, wc);
    } catch (err) {
      // Never leave everyone staring at "GO": report it, back to the lobby, Start works again.
      console.error('[match start]', err);
      lobbyUi.cancelCountdown();
      const msg = 'Match failed to start: ' + (err?.message || err);
      lobbyUi.status(msg + ' · press Start to try again');
      menus.toast(msg, 6);
      if (n.isHost) {
        if (n.phase === 'match') n.backToLobby?.(); else n.cancelCountdown?.(String(err?.message || err));
      }
    } finally {
      matchStarting = false;
    }
  };
  n.onCountdownCancel = (reason) => { lobbyUi.cancelCountdown(); lobbyUi.status('The host\'s match failed to start' + (reason ? ': ' + reason : '') + '. Waiting for the host.'); };
  n.onToLobby = () => backToLobby();
  n.onDisconnect = (reason) => leave(reason);
  n.onNotice = (t) => menus.toast(t);
}

function showLobby() {
  lobbyUi.show(net.lobby, { isHost: net.isHost, localId: net.localId });
}

/** Creates the Game for a match session (practice, host or client). */
function enterMatch(session, wc) {
  tour.stop();
  document.body.classList.add('in-match');
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
  document.body.classList.remove('in-match');
  if (net) showLobby();
  maybeTour();
}

function debugSuffix() {
  const keep = ['fakemic', 'mute'].filter((k) => params.has(k)).map((k) => `&${k}=${encodeURIComponent(params.get(k))}`);
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
  document.body.classList.remove('in-match');
  menus.showTitle();
  if (reason) menus.showTitleError(reason);
  maybeTour();
  history.replaceState(null, '', location.pathname + (debugSuffix() ? '?' + debugSuffix().slice(1) : ''));
}

// ---------- proximity voice (always on in online lobbies) ----------
let voice = null;
const micGate = document.getElementById('mic-gate');

/** Gets the microphone for room `n` (without blocking the connection) and starts voice; Leave on the panel leaves. */
async function ensureVoice(n) {
  const mic = await acquireMic();
  if (net !== n) { stopStream(mic); return; }
  if (!mic) { leave('You left the room: a microphone is required for online play.'); return; }
  voice = startVoice(n, mic);
  if (voice && game) voice.va.setGame(game);
}

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
// Click outside the pause panel, or press Esc while paused, to resume.
document.getElementById('pause').addEventListener('click', (e) => { if (e.target.id === 'pause') document.getElementById('btn-resume').click(); });
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !menus.pauseOpen || menus.settingsOpen || !game) return;
  if (performance.now() - (input.unlockedAt || 0) < 500) return;   // the Esc that released the mouse opened this menu
  e.preventDefault();
  document.getElementById('btn-resume').click();
});
menus.on('leave', () => leave());
menus.on('unstuck', () => {
  if (!game) return;
  const msg = game.unstuck();
  menus.toast(msg, 3);
  if (/^Moved/.test(msg)) { menus.hidePause(); input.enabled = true; enterPlay(); }
});
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

// ---------- campus select ("Welcome to Campus Combat · Find your school") ----------
const picker = createCampusPicker({
  root: csEl, campuses: CAMPUSES, lastId: () => settings.campus,
  onChoose: (id) => chooseCampus(id),
  sound: (k) => (k === 'hover' ? audio.uiHover() : audio.uiSelect()),
});
function showCampusSelect() {
  if (game || net || starting) return;
  tour.stop();
  csEl.classList.remove('hidden');
  document.getElementById('title').classList.add('hidden');
  picker.show();
}
function chooseCampus(id) {
  setActiveCampus(getCampus(id).id);
  settings.campus = activeCampus().id;
  saveSettings(settings);
  csEl.classList.add('hidden');
  loadCampusThenTitle();   // queues behind any load still running for the previous campus
}
document.getElementById('btn-campus').addEventListener('click', showCampusSelect);
menus.on('toLobby', () => net?.isHost && net.backToLobby());

input.onLockChange = (locked) => {
  if (!game) return;
  if (locked) { menus.hidePause(); input.enabled = true; return; }
  if (input.padActive) return;   // playing on a controller: losing the mouse lock is not a pause
  if (!debug && !menus.endOpen && game.deployed && menus.deployMode === null) {
    menus.showPause(game.session.roomCode);
    input.enabled = false;
  }
};
renderer.domElement.addEventListener('click', () => {
  if (game && game.deployed && !menus.pauseOpen && !menus.endOpen && menus.deployMode !== 'loadout') enterPlay();
});

pad = new GamepadInput(input, settings, {
  isPlaying: () => !!game && game.deployed && input.enabled && !menus.pauseOpen && !menus.endOpen && !menus.settingsOpen
    && menus.deployMode === null,
  game: () => game,
  pause: () => {
    if (!game || menus.pauseOpen) return;
    input.exitLock();
    menus.showPause(game.session.roomCode);
    input.enabled = false;
  },
});
input.rumble = (ms, weak, strong) => pad.rumble(ms, weak, strong);

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

// ---------- connection diagnostics (Esc menu) ----------
let diagTimer = 0;
let fpsFrames = 0, fpsT = performance.now(), fps = 0;
const diagEl = document.getElementById('conn-diag');
function updateDiag() {
  const t = performance.now();
  fps = Math.round(fpsFrames * 1000 / Math.max(1, t - fpsT)); fpsFrames = 0; fpsT = t;
  const show = !!net && menus.pauseOpen;
  diagEl.classList.toggle('hidden', !show);
  if (!show) return;
  const d = net.diag?.() || {};
  const parts = [`<b>Connection</b> ${d.role || '-'} · broker ${d.broker || '-'} · ${d.role === 'client' ? `host link ${d.link}, last heard ${(d.lastHeard ?? 0).toFixed(1)} s, states ${d.stateChannel}` : d.link} · ${fps} fps`];
  if (d.clients?.length) parts.push(d.clients.map((c) => `${esc(c.name || '#' + c.id)}: ${c.ping ?? '-'} ms, heard ${c.heard.toFixed(1)} s ago (${c.channel})`).join(' · '));
  if (game) {
    const nowT = performance.now() / 1000;
    const rows = [...game.remotes.values()].filter((r) => !r.bot && r.alive).map((r) => `${esc(r.name)} ${r.lastRecv ? (nowT - r.lastRecv).toFixed(1) + ' s' : '-'}`);
    if (rows.length) parts.push('Last update: ' + rows.join(' · '));
  }
  diagEl.innerHTML = parts.join('<br>');
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- main loop ----------
let lastFrame = performance.now();
let attrTimer = 0;
function frame() {
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - lastFrame) / 1000);
  lastFrame = nowMs;
  fpsFrames++;
  attrTimer -= dt;
  if (attrTimer <= 0) {
    attrTimer = 1;
    menus.setAttribution(worldCache?.world.attributionHTML || 'Map data &copy; OpenStreetMap contributors &middot; Imagery &copy; Esri, Maxar, Earthstar Geographics');
  }
  pad?.poll(dt);
  if (voice && !game) updateVoice(dt);
  diagTimer -= dt;
  if (diagTimer <= 0) { diagTimer = 1; updateDiag(dt); }
  if (!game) { tour.update(dt); return; }
  if (!debug && !input.locked && !input.padActive && game.alive && game.deployed && input.enabled && !menus.pauseOpen && !menus.endOpen
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
  lobbyUi, tour,
  input, settings, audio, menus, renderer, camera, get pad() { return pad; },
  start, leave,
  key: (code, down = true) => input.simKey(code, down),
  look: (dx, dy) => input.simLook(dx, dy),
  tap(code, ms = 60) { input.simKey(code, true); setTimeout(() => input.simKey(code, false), ms); },
};

const autoMode = ['ctf', 'tdm'].includes(params.get('mode')) ? params.get('mode') : 'ffa';
const autoBots = { count: Math.min(11, Number(params.get('bots')) || 0), difficulty: params.get('diff') || 'normal' };
// Stale cached page? Offer a reload when the deployed build is newer than this one.
checkForUpdate().then((v) => { if (v) { menus.showTitleError(`A newer version (${v}) is available: reload the page (Cmd+Shift+R / Ctrl+Shift+R) before playing.`); menus.toast('New version available: please reload', 8); } });

// Menu: start loading the campus in the background (unless we go straight into a match).
// Welcome screen first; the campus is built (behind a loading screen) only once one is picked, so the picker never
// freezes. Invite links skip the picker and load the last campus (the host's campus is applied on join).
if (!autostart && !(joinParam.length === 6)) showCampusSelect();
else if (!autostart) loadCampusThenTitle();
document.getElementById('cine').classList.remove('hidden');

if (autostart === 'practice') start('practice', null, autoMode, autoBots);
else if (autostart === 'host') start('host', null, autoMode, autoBots);
else if (autostart === 'join' && joinParam.length === 6) start('join', joinParam);
