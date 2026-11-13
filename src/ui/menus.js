// Title, loading, settings, pause, deploy/death, end-of-match screens and toasts (DOM only, no game logic).
import { renderLoadout, highlightLoadout } from './loadout.js';
import { ordinal } from './hud.js';

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
  $('btn-host').addEventListener('click', () => handlers.host?.());
  $('btn-practice').addEventListener('click', () => handlers.practice?.());
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

  // ---------- deploy ----------
  el.deployBtn.addEventListener('click', () => {
    if (deployMode === 'deploy') handlers.deploy?.();
    else if (deployMode === 'loadout') handlers.loadoutDone?.();
  });
  renderLoadout(el.cards, settings.primary, (id) => handlers.selectPrimary?.(id));

  // ---------- end ----------
  el.restart.addEventListener('click', () => handlers.restart?.());
  $('btn-end-leave').addEventListener('click', () => handlers.leave?.());

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.settings.classList.contains('hidden')) closeSettings();
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
      for (const k of ['loading', 'deploy', 'pause', 'end', 'settings']) el[k].classList.add('hidden');
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
      el.deployBtn.textContent = mode === 'loadout' ? 'Done' : 'Deploy';
      el.deployTitle.innerHTML = mode === 'death'
        ? `Next life loadout${headshot ? ' &middot; <span style="color:var(--gold)">headshot</span>' : ''}${weapon ? ' &middot; ' + esc(weapon) : ''}`
        : mode === 'loadout' ? 'Loadout applies on your next spawn'
          : roomCode ? `Room <b style="color:var(--gold);font-family:var(--mono);letter-spacing:.2em">${esc(roomCode)}</b> &middot; choose your loadout` : 'Choose your loadout';
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

    showEnd({ standings, winner, winnerIsMe, isHost }) {
      el.end.classList.remove('hidden');
      el.endWinner.textContent = winnerIsMe ? 'Victory' : winner ? `${winner} wins` : 'Match over';
      el.endBody.innerHTML = standings.map((s, i) => `<tr class="${s.me ? 'me' : ''}"><td>${ordinal(i + 1)}</td><td class="name"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</td><td>${s.k}</td><td>${s.d}</td></tr>`).join('');
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
