// Title, loading, settings, pause, deploy/death, end-of-match screens and toasts (DOM only, no game logic).
import { renderLoadout, highlightLoadout } from './loadout.js';
import { ordinal } from './hud.js';
import { IS_MAC } from '../game/settings.js';

const $ = (id) => document.getElementById(id);

const TIPS = [
  'Firing reveals your position on everyone\'s minimap for two seconds.',
  'Health regenerates after four seconds without taking damage.',
  'Crouch while sprinting to slide into cover.',
  'Aiming down sights tightens your spread and slows your movement.',
  'Switching to your sidearm is faster than reloading.',
  'Headshots deal bonus damage with every weapon.',
  'The sniper is only accurate when fully scoped in.',
  'Shotgun reloads shell by shell: fire any time to interrupt.',
  'Respawns place you as far from enemies as possible.',
  'Grapple (F) onto roofs, then press Space mid-reel to fling yourself.',
  'Double jump and jump into ledges to climb onto dugouts, bleachers and low roofs.',
  'Dash (E) works in the air too: chain it with a grapple fling.',
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function createMenus({ settings, onSettingsChange }) {
  const el = {
    title: $('title'), loading: $('loading'), deploy: $('deploy'), pause: $('pause'), end: $('end'), settings: $('settings'),
    name: $('name-input'), code: $('code-input'), joinBox: $('join-box'), titleError: $('title-error'),
    loadingBar: $('loading-bar'), loadingLabel: $('loading-label'), loadingPct: $('loading-pct'), loadingTip: $('loading-tip'),
    loadingKicker: $('loading-kicker'), loadingTitle: $('loading-title'),
    cards: $('loadout-cards'), deathInfo: $('death-info'), deathKiller: $('death-killer'), deathCount: $('death-count'),
    deployTitle: $('deploy-title'), deployBtn: $('btn-deploy'),
    roomBox: $('room-box'), roomCode: $('room-code'),
    endWinner: $('end-winner'), endBody: $('end-body'), restart: $('btn-restart'), endWait: $('end-wait'),
    toast: $('toast'), attribution: $('attribution'),
    setup: $('setup'), setupKicker: $('setup-kicker'), setupTitle: $('setup-title'),
    teamRow: $('team-row'), teamName: $('team-name'), pauseTeam: $('btn-pause-team'),
    endHead: $('end-headrow'), sprintWarn: $('sprint-warn'),
  };
  const handlers = {};
  let toastTimer = 0;
  let deployMode = 'deploy';
  let settingsReturn = null;

  // Background imagery for title / loading.
  document.querySelectorAll('.title-bg').forEach((b) => { b.style.backgroundImage = 'url(./assets/satellite/campus_z19.jpg)'; });

  // ---------- title ----------
  el.name.value = settings.name || '';
  el.name.addEventListener('input', () => { settings.name = el.name.value; onSettingsChange(); });
  // Host / Practice go through a mode-selection step.
  let setupKind = 'host';
  const modeCards = [...document.querySelectorAll('.mode-card')];
  const syncModes = () => modeCards.forEach((c) => c.classList.toggle('on', c.dataset.mode === settings.mode));
  modeCards.forEach((c) => c.addEventListener('click', () => { settings.mode = c.dataset.mode; syncModes(); onSettingsChange('mode'); }));
  const openSetup = (kind) => {
    setupKind = kind;
    el.setupKicker.textContent = kind === 'host' ? 'Host game' : 'Practice';
    el.setupTitle.textContent = kind === 'host' ? 'Choose a mode' : 'Choose a practice mode';
    syncModes();
    el.setup.classList.remove('hidden');
  };
  $('btn-host').addEventListener('click', () => openSetup('host'));
  $('btn-practice').addEventListener('click', () => openSetup('practice'));
  $('btn-setup-back').addEventListener('click', () => el.setup.classList.add('hidden'));
  $('btn-setup-go').addEventListener('click', () => {
    el.setup.classList.add('hidden');
    handlers[setupKind]?.(settings.mode);
  });
  $('btn-join').addEventListener('click', () => {
    el.joinBox.classList.toggle('open');
    if (el.joinBox.classList.contains('open')) el.code.focus();
  });
  el.code.addEventListener('input', () => { el.code.value = el.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  const doJoin = () => {
    const code = el.code.value.trim();
    if (code.length !== 6) { showTitleError('Room codes are 6 characters.'); return; }
    handlers.join?.(code);
  };
  $('btn-join-go').addEventListener('click', doJoin);
  el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  $('btn-settings').addEventListener('click', () => openSettings('title'));

  function showTitleError(msg) { el.titleError.textContent = msg || ''; }

  // ---------- settings ----------
  const ranges = [
    ['s-sens', 'o-sens', 'sensitivity', (v) => v.toFixed(2)],
    ['s-fov', 'o-fov', 'fov', (v) => `${v}°`],
    ['s-ads', 'o-ads', 'adsMultiplier', (v) => v.toFixed(2) + '×'],
    ['s-vol', 'o-vol', 'volume', (v) => Math.round(v * 100) + '%'],
  ];
  for (const [inputId, outId, key, fmt] of ranges) {
    const inp = $(inputId), out = $(outId);
    inp.value = settings[key];
    out.textContent = fmt(Number(settings[key]));
    inp.addEventListener('input', () => {
      settings[key] = Number(inp.value);
      out.textContent = fmt(settings[key]);
      onSettingsChange(key);
    });
  }
  const segBtns = [...document.querySelectorAll('#s-quality button')];
  const syncSeg = () => segBtns.forEach((b) => b.classList.toggle('on', b.dataset.v === settings.quality));
  segBtns.forEach((b) => b.addEventListener('click', () => { settings.quality = b.dataset.v; syncSeg(); onSettingsChange('quality'); }));
  syncSeg();
  const mapBtns = [...document.querySelectorAll('#s-mapstyle button')];
  const syncMap = () => mapBtns.forEach((b) => b.classList.toggle('on', b.dataset.v === settings.mapStyle));
  mapBtns.forEach((b) => b.addEventListener('click', () => { settings.mapStyle = b.dataset.v; syncMap(); onSettingsChange('mapStyle'); }));
  syncMap();
  const sprintBtns = [...document.querySelectorAll('#s-sprint button')];
  const syncSprint = () => {
    sprintBtns.forEach((b) => b.classList.toggle('on', b.dataset.v === settings.sprintKey));
    el.sprintWarn.classList.toggle('hidden', !(settings.sprintKey === 'ctrl' && !IS_MAC));
    renderControls();
  };
  sprintBtns.forEach((b) => b.addEventListener('click', () => { settings.sprintKey = b.dataset.v; syncSprint(); onSettingsChange('sprintKey'); }));

  function renderControls() {
    const sprint = settings.sprintKey === 'ctrl' ? 'Ctrl' : 'Shift';
    const rows = [
      ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', 'Move'],
      [`<kbd>${sprint}</kbd>`, 'Sprint (hold)'],
      ['<kbd>Space</kbd>', 'Jump · again in air: boost'],
      ['<kbd>F</kbd>', 'Grapple (Space: fling)'],
      ['<kbd>E</kbd>', 'Boost dash'],
      ['<kbd>C</kbd>', 'Crouch / slide'],
      ['<kbd>Click</kbd>', 'Fire'],
      ['<kbd>Right-click</kbd>', 'Aim (hold)'],
      ['<kbd>Ctrl</kbd>+<kbd>Click</kbd>', 'Aim (toggle)'],
      ['<kbd>Q</kbd>', 'Aim (toggle)'],
      ['<kbd>R</kbd>', 'Reload'],
      ['<kbd>1</kbd><kbd>2</kbd>', 'Switch / wheel'],
      ['<kbd>V</kbd>', 'Melee'],
      ['<kbd>G</kbd>', 'Frag (hold to cook)'],
      ['<kbd>4</kbd>', 'Use killstreak'],
      ['<kbd>X</kbd>', 'Capture care package (hold)'],
      ['<kbd>Tab</kbd>', 'Scoreboard'],
      ['<kbd>Esc</kbd>', 'Menu'],
    ];
    const html = rows.map(([k, l]) => `<div>${k}<span>${l}</span></div>`).join('');
    document.querySelectorAll('.controls-list').forEach((c) => { c.innerHTML = html; });
  }
  syncSprint();

  const gkey = $('s-gkey');
  gkey.value = settings.googleTilesKey || '';
  gkey.addEventListener('input', () => { settings.googleTilesKey = gkey.value.trim(); onSettingsChange('googleTilesKey'); });
  $('btn-settings-close').addEventListener('click', closeSettings);

  function openSettings(from) {
    settingsReturn = from;
    el.settings.classList.remove('hidden');
  }
  function closeSettings() {
    el.settings.classList.add('hidden');
    handlers.settingsClosed?.(settingsReturn);
  }

  // ---------- pause ----------
  $('btn-resume').addEventListener('click', () => handlers.resume?.());
  $('btn-pause-settings').addEventListener('click', () => openSettings('pause'));
  $('btn-leave').addEventListener('click', () => handlers.leave?.());
  $('btn-loadout').addEventListener('click', () => handlers.loadout?.());
  $('btn-copy').addEventListener('click', () => handlers.copyInvite?.());
  el.pauseTeam.addEventListener('click', () => handlers.switchTeam?.());
  $('btn-team').addEventListener('click', () => handlers.switchTeam?.());

  // ---------- deploy ----------
  el.deployBtn.addEventListener('click', () => {
    if (deployMode === 'deploy') handlers.deploy?.();
    else if (deployMode === 'loadout') handlers.loadoutDone?.();
    else if (deployMode === 'swap') handlers.swapClose?.();
  });
  renderLoadout(el.cards, settings.cls, (id) => handlers.selectClass?.(id));

  // ---------- end ----------
  el.restart.addEventListener('click', () => handlers.restart?.());
  $('btn-end-leave').addEventListener('click', () => handlers.leave?.());

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.settings.classList.contains('hidden')) closeSettings();
    else if (e.key === 'Escape' && !el.setup.classList.contains('hidden')) el.setup.classList.add('hidden');
  });

  return {
    on(name, fn) { handlers[name] = fn; },
    showTitleError,
    get name() { return el.name.value; },
    prefillJoin(code) {
      el.code.value = code;
      el.joinBox.classList.add('open');
      (el.name.value ? el.code : el.name).focus();
    },

    showTitle() {
      el.title.classList.remove('hidden');
      for (const k of ['loading', 'deploy', 'pause', 'end', 'settings', 'setup']) el[k].classList.add('hidden');
    },
    hideTitle() { el.title.classList.add('hidden'); },

    showLoading(kicker, title) {
      el.title.classList.add('hidden');
      el.loading.classList.remove('hidden');
      el.loadingKicker.textContent = kicker;
      el.loadingTitle.textContent = title;
      el.loadingTip.textContent = 'Tip: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
      this.setProgress(0, 'Starting');
    },
    setProgress(f, label) {
      const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
      el.loadingBar.style.width = pct + '%';
      el.loadingPct.textContent = pct + '%';
      if (label) el.loadingLabel.textContent = label;
    },
    hideLoading() { el.loading.classList.add('hidden'); },

    /** mode: 'deploy' (first spawn), 'death' (respawn timer), 'loadout' (change from pause menu). */
    showDeploy({ mode, selected, killer, weapon, headshot, roomCode }) {
      deployMode = mode;
      el.deploy.classList.remove('hidden');
      highlightLoadout(el.cards, selected);
      el.deathInfo.classList.toggle('hidden', mode !== 'death');
      if (mode === 'death') {
        el.deathKiller.textContent = killer;
        el.deathKiller.title = weapon || '';
      }
      el.deployBtn.classList.toggle('hidden', mode === 'death');
      el.deployBtn.textContent = mode === 'loadout' ? 'Done' : mode === 'swap' ? 'Close (B)' : 'Deploy';
      el.deployTitle.innerHTML = mode === 'swap' ? 'Change class now &middot; press <kbd>1</kbd>-<kbd>5</kbd> (only near your spawn, before you fire)'
        : mode === 'death'
        ? `Next life class${headshot ? ' &middot; <span style="color:var(--gold)">headshot</span>' : ''}${weapon ? ' &middot; ' + esc(weapon) : ''}`
        : mode === 'loadout' ? 'Class applies on your next spawn'
          : roomCode ? `Room <b style="color:var(--gold);font-family:var(--mono);letter-spacing:.2em">${esc(roomCode)}</b> &middot; choose your class` : 'Choose your class';
    },
    setLoadout(id) { highlightLoadout(el.cards, id); },
    setDeathCountdown(s) {
      el.deathCount.textContent = s === null ? '' : s > 0.05 ? `Respawning in ${Math.ceil(s)}` : 'Respawning…';
    },
    hideDeploy() { el.deploy.classList.add('hidden'); },
    get deployMode() { return el.deploy.classList.contains('hidden') ? null : deployMode; },

    showPause(roomCode) {
      el.pause.classList.remove('hidden');
      el.roomBox.classList.toggle('hidden', !roomCode);
      if (roomCode) el.roomCode.textContent = roomCode;
    },
    hidePause() { el.pause.classList.add('hidden'); },
    get pauseOpen() { return !el.pause.classList.contains('hidden'); },
    get settingsOpen() { return !el.settings.classList.contains('hidden'); },
    get endOpen() { return !el.end.classList.contains('hidden'); },

    /** Team info for CTF ({ team, name, css } or null for FFA): shown on the deploy screen and the Esc menu. */
    setTeam(info) {
      el.teamRow.classList.toggle('hidden', !info);
      el.pauseTeam.classList.toggle('hidden', !info);
      if (info) {
        el.teamName.textContent = info.name;
        el.teamName.className = info.team;
      }
    },

    showEnd({ standings, winner, winnerIsMe, isHost, ctf, score, headline, teamNames }) {
      el.end.classList.remove('hidden');
      if (ctf) {
        el.endWinner.innerHTML = `${esc(headline)} &middot; ${winner ? esc(winner) + ' win' : 'Draw'} <span style="font-family:var(--mono)">${score.red}-${score.blue}</span>`;
        el.endHead.innerHTML = '<th>#</th><th class="name">Player</th><th>Team</th><th>Caps</th><th>Ret</th><th>Kills</th><th>Deaths</th>';
        el.endBody.innerHTML = standings.map((s, i) => `<tr class="${s.me ? 'me' : ''}"><td>${ordinal(i + 1)}</td><td class="name"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</td><td>${esc(teamNames?.[s.team] ?? '')}</td><td>${s.caps ?? 0}</td><td>${s.ret ?? 0}</td><td>${s.k}</td><td>${s.d}</td></tr>`).join('');
      } else {
        el.endWinner.textContent = winnerIsMe ? 'Victory' : winner ? `${winner} wins` : 'Match over';
        el.endHead.innerHTML = '<th>#</th><th class="name">Player</th><th>Kills</th><th>Deaths</th>';
        el.endBody.innerHTML = standings.map((s, i) => `<tr class="${s.me ? 'me' : ''}"><td>${ordinal(i + 1)}</td><td class="name"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</td><td>${s.k}</td><td>${s.d}</td></tr>`).join('');
      }
      el.restart.classList.toggle('hidden', !isHost);
      el.endWait.classList.toggle('hidden', isHost);
    },
    hideEnd() { el.end.classList.add('hidden'); },

    toast(text, seconds = 2.5) {
      el.toast.textContent = text;
      el.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('show'), seconds * 1000);
    },
    setAttribution(html) {
      if (el.attribution.dataset.src !== html) { el.attribution.dataset.src = html; el.attribution.innerHTML = html; }
    },
  };
}
