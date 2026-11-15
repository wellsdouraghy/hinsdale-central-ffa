// Title, loading, settings, pause, deploy/death, end-of-match screens and toasts (DOM only, no game logic).
import { renderLoadout, highlightLoadout } from './loadout.js';
import { ordinal } from './hud.js';
import { IS_MAC } from '../game/settings.js';
import { CLASSES, CLASS_LOOKS, classOf } from '../game/classes.js';
import { SAT } from './minimap.js';
import { TEAM_NAMES } from '../game/ctf.js';

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
  'Airstrike: press 4, aim the run on the laptop map, wheel or A / D to rotate, click to call it in.',
  'Every melee kill (V) plays a finisher. You can still be shot while it plays.',
  'Recon snipers kill outright with a scoped torso or head shot.',
  'Brawlers lunge on melee: twice the reach, faster recovery.',
  'Grapplers get a longer grapple and half the cooldown.',
  'Helicopter: hold X next to it. Space / C climb and descend, LMB cannon, R rockets.',
  'The helicopter cannon overheats: fire in bursts.',
  'Care packages drop at 3 kills. Hold X on the crate to open it.',
  'A UAV (5 kills) shows every enemy on your minimap for 30 seconds.',
  'Teammates are green arrows on the minimap; enemies show as red dots only when revealed.',
];

// Witty but short loading stages, by overall progress.
const STAGES = [
  [0, 'Unlocking the doors'], [0.12, 'Laying turf'], [0.26, 'Raising the flagpole'], [0.4, 'Painting the end zones'],
  [0.54, 'Planting the oaks'], [0.68, 'Parking the buses'], [0.8, 'Stocking the lockers'], [0.92, 'Waking up the bots'],
];
const MODE_INFO = {
  ffa: { name: 'Free-for-all', sub: 'Every player for themselves', rules: ['First to the kill limit or 10:00', 'One attack helicopter is hidden on campus', 'Shots reveal you on the enemy minimap'] },
  tdm: { name: 'Team Deathmatch', get sub() { return `${TEAM_NAMES.red} vs ${TEAM_NAMES.blue}`; }, rules: ['Team kills score; first to the limit wins', 'One attack helicopter is hidden on campus', 'No friendly fire'] },
  ctf: { name: 'Capture the Flag', get sub() { return `${TEAM_NAMES.red} vs ${TEAM_NAMES.blue}`; }, rules: ['Steal their flag, bring it to your base', 'Your flag must be home to score', 'Touch your dropped flag to return it'] },
  practice: { name: 'Practice', sub: 'Solo range', rules: ['Target dummies, optional bots', 'No time limit', 'Try the grapple, dash and the helicopter'] },
};
const LOOK_SWATCH = { infantry: ['#4d5a3a', '#6b7350', '#2a2f22'], specops: ['#20242a', '#3b424b', '#111317'], heavy: ['#3e4247', '#6d7178', '#c23a3a'], desert: ['#b59a6a', '#8c7550', '#e1d2a8'], varsity: ['#c8262d', '#f1f1f1', '#1b1b1b'] };
const LOOK_NAME = { infantry: 'Infantry kit', specops: 'Spec ops kit', heavy: 'Heavy armor', desert: 'Desert kit', varsity: 'Varsity kit' };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function createMenus({ settings, onSettingsChange, sound = () => {} }) {
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
  let tipTimer = 0;
  let deployMode = 'deploy';
  let settingsReturn = null;

  // Background imagery for title / loading.
  // (set per campus by ui/branding.js)

  // ---------- front end: main menu (vertical, keyboard + mouse), player card, credits ----------
  const playGroup = $('fe-play-group');
  const setPlayOpen = (open) => { playGroup.classList.toggle('open', open); if (!open) el.joinBox.classList.remove('open'); };
  $('fe-play').addEventListener('click', () => { setPlayOpen(!playGroup.classList.contains('open')); sound('select'); });
  const menuItems = () => [...document.querySelectorAll('#fe-menu .fe-item, #fe-menu .fe-group.open .fe-subitem')];
  document.querySelectorAll('#fe-menu button').forEach((b) => {
    b.addEventListener('pointerenter', () => { sound('hover'); });
    b.addEventListener('focus', () => b.classList.add('kb'));
    b.addEventListener('blur', () => b.classList.remove('kb'));
  });
  ['btn-host', 'btn-practice', 'btn-join', 'btn-classes', 'btn-settings', 'btn-credits'].forEach((id) => $(id).addEventListener('click', () => sound('select')));
  addEventListener('keydown', (e) => {
    if (el.title.classList.contains('hidden') || !overlaysClosed()) return;
    if (document.activeElement === el.name || document.activeElement === el.code) { if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = menuItems();
      let i = items.indexOf(document.activeElement);
      i = i < 0 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[i].focus();
      sound('hover');
    } else if (e.key === 'ArrowRight' && document.activeElement?.id === 'fe-play') { setPlayOpen(true); menuItems()[1]?.focus(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && playGroup.classList.contains('open')) { setPlayOpen(false); $('fe-play').focus(); }
  });
  function overlaysClosed() { return ['settings', 'setup', 'credits', 'deploy'].every((k) => $(k).classList.contains('hidden')); }
  $('btn-credits').addEventListener('click', () => $('credits').classList.remove('hidden'));
  $('btn-credits-close').addEventListener('click', () => { $('credits').classList.add('hidden'); sound('back'); });
  $('btn-classes').addEventListener('click', () => {
    deployMode = 'browse';
    el.deploy.classList.remove('hidden');
    highlightLoadout(el.cards, settings.cls);
    el.deathInfo.classList.add('hidden');
    el.teamRow.classList.add('hidden');
    el.deployBtn.classList.remove('hidden');
    el.deployBtn.textContent = 'Done';
    el.deployTitle.textContent = 'Classes · your pick is used when you deploy';
  });
  function renderPlayerCard() {
    const c = classOf(settings.cls);
    const look = CLASS_LOOKS[c.id] || 'specops';
    $('pc-badge').textContent = c.tag;
    $('pc-class').textContent = c.name;
    $('pc-look').textContent = LOOK_NAME[look] || look;
    $('pc-swatches').innerHTML = (LOOK_SWATCH[look] || []).map((col) => `<i style="background:${col}"></i>`).join('') + `<span>${esc(c.ability || '')}</span>`;
  }
  renderPlayerCard();

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
  const botsIn = $('s-bots'), botsOut = $('o-bots');
  botsIn.value = settings.botCount; botsOut.textContent = settings.botCount;
  botsIn.addEventListener('input', () => { settings.botCount = Number(botsIn.value); botsOut.textContent = botsIn.value; onSettingsChange('botCount'); });
  const diffBtns = [...document.querySelectorAll('#s-botdiff button')];
  const syncDiff = () => diffBtns.forEach((b) => b.classList.toggle('on', b.dataset.v === settings.botDiff));
  diffBtns.forEach((b) => b.addEventListener('click', () => { settings.botDiff = b.dataset.v; syncDiff(); onSettingsChange('botDiff'); }));
  syncDiff();
  $('btn-setup-go').addEventListener('click', () => {
    el.setup.classList.add('hidden');
    handlers[setupKind]?.(settings.mode, { count: settings.botCount, difficulty: settings.botDiff });
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
    ['s-padsens', 'o-padsens', 'padSens', (v) => v.toFixed(2) + '×'],
    ['s-vol', 'o-vol', 'volume', (v) => Math.round(v * 100) + '%'],
    ['s-sfx', 'o-sfx', 'sfxVolume', (v) => Math.round(v * 100) + '%'],
    ['s-voice', 'o-voice', 'voiceVolume', (v) => Math.round(v * 100) + '%'],
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
  const invBtns = [...document.querySelectorAll('#s-padinvert button')];
  const syncInv = () => invBtns.forEach((b) => b.classList.toggle('on', (b.dataset.v === 'inverted') === !!settings.padInvert));
  invBtns.forEach((b) => b.addEventListener('click', () => { settings.padInvert = b.dataset.v === 'inverted'; syncInv(); onSettingsChange('padInvert'); }));
  syncInv();
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
      ['<kbd>V</kbd>', 'Melee (one-hit kill)'],
      ['<kbd>G</kbd>', 'Frag (hold to cook)'],
      ['<kbd>4</kbd>', 'Use killstreak'],
      ['<kbd>X</kbd>', 'Hold: care package / enter heli'],
      ['<kbd>Tab</kbd>', 'Scoreboard'],
      ['<kbd>Esc</kbd>', 'Menu'],
    ];
    const pad = [
      ['<kbd>LS</kbd> / <kbd>RS</kbd>', 'Move / look'],
      ['<kbd>L3</kbd>', 'Sprint · again: dash'],
      ['<kbd>RT</kbd> / <kbd>LT</kbd>', 'Fire / aim'],
      ['<kbd>A</kbd> / <kbd>B</kbd>', 'Jump / crouch, slide'],
      ['<kbd>X</kbd>', 'Reload · hold: interact'],
      ['<kbd>Y</kbd>', 'Switch weapon'],
      ['<kbd>LB</kbd> / <kbd>RB</kbd>', 'Grapple / frag'],
      ['<kbd>R3</kbd>', 'Melee'],
      ['<kbd>D-pad</kbd>', '↑ streak · → dash · ↓ class'],
      ['<kbd>View</kbd> / <kbd>Menu</kbd>', 'Scores / pause'],
    ];
    const html = rows.map(([k, l]) => `<div>${k}<span>${l}</span></div>`).join('')
      + '<div class="pad-head"><b>Xbox controller</b><span></span></div>'
      + pad.map(([k, l]) => `<div>${k}<span>${l}</span></div>`).join('');
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
    else if (deployMode === 'browse') { el.deploy.classList.add('hidden'); renderPlayerCard(); sound('back'); }
  });
  renderLoadout(el.cards, settings.cls, (id) => { handlers.selectClass?.(id); renderPlayerCard(); sound('select'); });

  // ---------- end ----------
  el.restart.addEventListener('click', () => handlers.restart?.());
  $('btn-tolobby').addEventListener('click', () => handlers.toLobby?.());
  $('btn-end-leave').addEventListener('click', () => handlers.leave?.());

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('credits').classList.contains('hidden')) $('credits').classList.add('hidden');
    else if (e.key === 'Escape' && deployMode === 'browse' && !el.deploy.classList.contains('hidden')) el.deploy.classList.add('hidden');
    else if (e.key === 'Escape' && !el.settings.classList.contains('hidden')) closeSettings();
    else if (e.key === 'Escape' && !el.setup.classList.contains('hidden')) el.setup.classList.add('hidden');
  });

  return {
    on(name, fn) { handlers[name] = fn; },
    showTitleError,
    get name() { return el.name.value; },
    prefillJoin(code) {
      el.code.value = code;
      $('fe-play-group').classList.add('open');
      el.joinBox.classList.add('open');
      (el.name.value ? el.code : el.name).focus();
    },

    showTitle() {
      el.title.classList.remove('hidden');
      for (const k of ['loading', 'deploy', 'pause', 'end', 'settings', 'setup']) el[k].classList.add('hidden');
      el.loading.classList.remove('fading');
      clearInterval(tipTimer);
      renderPlayerCard();
    },
    /** Background world preload status in the menu footer. */
    setWorldStatus(f, label) {
      const box = $('fe-world');
      box.classList.toggle('ready', f >= 1);
      $('fe-world-txt').textContent = f >= 1 ? 'Campus ready' : `Loading campus ${Math.round(f * 100)}%${label ? ' · ' + label : ''}`;
    },
    hideTitle() { el.title.classList.add('hidden'); },

    /** opts: { mode: 'ffa'|'tdm'|'ctf', practice, bounds: {minX,maxX,minZ,maxZ} } */
    showLoading(kicker, title, opts = {}) {
      el.title.classList.add('hidden');
      el.loading.classList.remove('hidden', 'fading');
      el.loadingKicker.textContent = kicker;
      el.loadingTitle.textContent = title;
      const info = MODE_INFO[opts.mode] || MODE_INFO.ffa;
      $('ld-mode').textContent = (opts.practice ? 'Practice · ' : '') + info.name;
      $('ld-mode-sub').textContent = opts.practice ? MODE_INFO.practice.sub : info.sub;
      $('ld-rules').innerHTML = (opts.practice ? MODE_INFO.practice.rules : info.rules).map((r) => `<li>${esc(r)}</li>`).join('');
      if (opts.campus) {
        // Campus load (before the title screen): campus facts instead of mode rules.
        const c = opts.campus;
        $('ld-mode').textContent = c.city;
        $('ld-mode-sub').textContent = `${c.teams.red} vs ${c.teams.blue}`;
        $('ld-rules').innerHTML = [c.blurb, 'Free-for-all · Team Deathmatch · Capture the Flag', 'Host a lobby, invite friends with the room code'].filter(Boolean).map((r) => `<li>${esc(r)}</li>`).join('');
      }
      // Highlight the play area on the aerial (image space: x right, z down, same bounds as the minimap image).
      const b = opts.bounds || { minX: -222, maxX: 292, minZ: -212, maxZ: 214 };
      const W = SAT.maxX - SAT.minX, H = SAT.maxZ - SAT.minZ;
      const a = $('ld-area').style;
      a.left = ((b.minX - SAT.minX) / W * 100) + '%'; a.top = ((b.minZ - SAT.minZ) / H * 100) + '%';
      a.width = ((b.maxX - b.minX) / W * 100) + '%'; a.height = ((b.maxZ - b.minZ) / H * 100) + '%';
      $('ld-area-lbl').textContent = opts.practice ? 'Practice range' : info.name;
      // Rotating tips.
      let ti = Math.floor(Math.random() * TIPS.length);
      const showTip = () => {
        el.loadingTip.classList.remove('in');
        void el.loadingTip.offsetWidth;
        el.loadingTip.textContent = TIPS[ti++ % TIPS.length];
        el.loadingTip.classList.add('in');
      };
      showTip();
      clearInterval(tipTimer);
      tipTimer = setInterval(showTip, 4500);
      this.setProgress(0, 'Starting');
    },
    setProgress(f, label) {
      f = Math.max(0, Math.min(1, f));
      const pct = Math.round(f * 100);
      el.loadingBar.style.width = pct + '%';
      el.loadingPct.textContent = pct + '%';
      let stage = STAGES[0][1];
      for (const [at, txt] of STAGES) if (f >= at) stage = txt;
      if (f >= 1) stage = 'Ready';
      if (el.loadingLabel.textContent !== stage) el.loadingLabel.textContent = stage;
      if (label) $('loading-sub').textContent = label;
    },
    /** Fades the loading screen out over the first frames of the match. */
    hideLoading() {
      clearInterval(tipTimer);
      if (el.loading.classList.contains('hidden')) return;
      el.loading.classList.add('fading');
      setTimeout(() => { if (el.loading.classList.contains('fading')) { el.loading.classList.add('hidden'); el.loading.classList.remove('fading'); } }, 650);
    },

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
      $('btn-tolobby').classList.toggle('hidden', !(isHost && this.lobbyAvailable));
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
