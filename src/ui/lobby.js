// Pre-match lobby screen (DOM only): room code, live settings (host-editable), players per team with mic / ping /
// ready, bot slots, team moves (click or drag), countdown overlay. Emits intents through handlers.
import { TEAM_NAMES } from '../game/ctf.js';

const $ = (id) => document.getElementById(id);
const MODE_DESC = {
  ffa: () => 'Every player for themselves. One attack helicopter is hidden somewhere on campus.',
  tdm: () => `${TEAM_NAMES.red} vs ${TEAM_NAMES.blue}. Kills score for your team. One attack helicopter is hidden somewhere on campus.`,
  ctf: () => `${TEAM_NAMES.red} vs ${TEAM_NAMES.blue}. Steal the enemy flag and bring it to your base.`,
};
const LIMIT_UNIT = { ffa: 'kills', tdm: 'team kills', ctf: 'captures' };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function createLobbyUi(h) {
  const el = {
    root: $('lobby'), code: $('lb-code'), status: $('lb-status'), settings: document.querySelector('.lobby-settings'),
    nameIn: $('lb-name'), nameSave: $('lb-name-save'),
    hostOnly: $('lb-hostonly'), mode: [...document.querySelectorAll('#lb-mode button')], bots: $('lb-bots'), botsO: $('lb-bots-o'),
    diff: [...document.querySelectorAll('#lb-diff button')], limit: $('lb-limit'), unit: $('lb-limit-unit'), desc: $('lb-desc'),
    count: $('lb-count'), lists: $('lb-lists'), balance: $('lb-balance'), tip: $('lb-tip'),
    ready: $('lb-ready'), start: $('lb-start'), leave: $('lb-leave'), copy: $('lb-copy'), mic: $('lb-mic'),
    cd: $('lb-countdown'), cdNum: $('lb-cd-num'), cdStatus: $('lb-cd-status'),
  };
  let ctx = { isHost: false, localId: 0 };
  let state = null;
  let myReady = false;
  let cdTimer = 0;
  let armedUntil = 0;

  // Host-editable settings.
  el.mode.forEach((b) => b.addEventListener('click', () => ctx.isHost && h.onSettings?.({ mode: b.dataset.v })));
  el.diff.forEach((b) => b.addEventListener('click', () => ctx.isHost && h.onSettings?.({ difficulty: b.dataset.v })));
  el.bots.addEventListener('input', () => { el.botsO.textContent = el.bots.value; });
  el.bots.addEventListener('change', () => ctx.isHost && h.onSettings?.({ bots: Number(el.bots.value) }));
  el.limit.addEventListener('change', () => ctx.isHost && h.onSettings?.({ scoreLimit: Number(el.limit.value) }));
  el.balance.addEventListener('click', () => h.onAutoBalance?.());
  el.ready.addEventListener('click', () => { myReady = !myReady; h.onReady?.(myReady); renderButtons(); });
  el.start.addEventListener('click', () => {
    if (!state) return;
    const notReady = state.members.filter((m) => !m.ready && !m.host);
    // Not everyone ready: first click warns, a second click within 4 s starts anyway.
    if (notReady.length && performance.now() > armedUntil) {
      armedUntil = performance.now() + 4000;
      h.onWarn?.(`${notReady.map((m) => m.name).join(', ')} ${notReady.length > 1 ? 'are' : 'is'} not ready. Click Start again to start anyway.`);
      el.start.textContent = 'Start anyway';
      setTimeout(() => { el.start.textContent = 'Start match'; }, 4000);
      return;
    }
    armedUntil = 0;
    el.start.textContent = 'Start match';
    h.onStart?.();
  });
  el.leave.addEventListener('click', () => h.onLeave?.());
  el.copy.addEventListener('click', () => h.onCopy?.());
  // Rename: a fixed field (the player list re-renders every couple of seconds, so no inline editing there).
  const saveName = () => { const v = el.nameIn.value.trim(); if (v) h.onRename?.(v); el.nameIn.blur(); };
  el.nameSave.addEventListener('click', saveName);
  el.nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } });
  el.nameIn.addEventListener('change', saveName);
  el.lists.addEventListener('click', (e) => { if (e.target.closest('.lp-row.me .lp-name')) { el.nameIn.focus(); el.nameIn.select(); } });

  // Drag & drop between team columns (host), click-to-move fallback via the arrow buttons.
  el.lists.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.lp-row[data-id]');
    if (row) e.dataTransfer.setData('text/plain', row.dataset.id);
  });
  el.lists.addEventListener('dragover', (e) => { const col = e.target.closest('.lp-col[data-team]'); if (col && ctx.isHost) { e.preventDefault(); col.classList.add('drop'); } });
  el.lists.addEventListener('dragleave', (e) => e.target.closest('.lp-col')?.classList.remove('drop'));
  el.lists.addEventListener('drop', (e) => {
    const col = e.target.closest('.lp-col[data-team]');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('drop');
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (id) h.onMove?.(id, col.dataset.team);
  });
  el.lists.addEventListener('click', (e) => {
    const bt = e.target.closest('[data-botteam]');
    if (bt && ctx.isHost) { h.onBotTeam?.(bt.dataset.botteam, Number(bt.dataset.d)); return; }
    const bm = e.target.closest('[data-botmove]');
    if (bm && ctx.isHost) { h.onMoveBot?.(bm.dataset.botmove); return; }
    const btn = e.target.closest('[data-move]');
    if (!btn) return;
    const id = Number(btn.dataset.move);
    const team = btn.dataset.to;
    if (ctx.isHost) h.onMove?.(id, team);
    else if (id === ctx.localId) h.onTeam?.(team);
  });

  function row(m) {
    const me = m.id === ctx.localId;
    const canMove = state.settings.mode !== 'ffa' && (ctx.isHost || me) && state.phase === 'lobby';
    const other = m.team === 'red' ? 'blue' : 'red';
    return `<div class="lp-row ${me ? 'me' : ''} ${ctx.isHost && canMove ? 'movable' : ''}" data-id="${m.id}" ${ctx.isHost && canMove ? 'draggable="true"' : ''}>
      <span class="lp-name" ${me ? 'title="Click to rename yourself"' : ''}><b>${esc(m.name)}</b>${me ? '<i class="lp-edit">&#9998;</i>' : ''}${m.host ? '<span class="lp-tag">HOST</span>' : ''}${me ? '<span class="lp-tag">YOU</span>' : ''}</span>
      <span class="lp-mic" title="Microphone connected">MIC &#10003;</span>
      <span class="lp-ping">${m.host ? 'host' : (m.ping ?? '-') + ' ms'}</span>
      <span><span class="lp-ready ${m.ready ? 'yes' : 'no'}">${m.host ? 'HOST' : m.ready ? 'READY' : 'NOT READY'}</span>${canMove ? `<button class="lp-move" data-move="${m.id}" data-to="${other}" title="Move to ${TEAM_NAMES[other]}">&#8644;</button>` : ''}</span>
    </div>`;
  }
  const botRow = (diff, team = null) => {
    const other = team === 'red' ? 'blue' : 'red';
    const mv = team && ctx.isHost && state.phase === 'lobby' ? `<button class="lp-move" data-botmove="${team}" title="Move a bot to ${TEAM_NAMES[other]}">&#8644;</button>` : '';
    return `<div class="lp-row bot"><span class="lp-name">Bot (${diff[0].toUpperCase() + diff.slice(1)})</span><span></span><span class="lp-ping">bot</span><span>${mv}</span></div>`;
  };

  function render() {
    if (!state) return;
    const s = state.settings;
    el.code.textContent = state.code;
    el.mode.forEach((b) => b.classList.toggle('on', b.dataset.v === s.mode));
    el.diff.forEach((b) => b.classList.toggle('on', b.dataset.v === s.difficulty));
    const totalBots = s.mode === 'ffa' ? s.bots : (s.botsRed || 0) + (s.botsBlue || 0);
    if (document.activeElement !== el.bots) { el.bots.value = totalBots; el.botsO.textContent = totalBots; }
    const meM = state.members?.find?.((m) => m.id === ctx.localId);
    if (meM && document.activeElement !== el.nameIn) el.nameIn.value = meM.name;
    if (document.activeElement !== el.limit) el.limit.value = s.scoreLimit;
    el.unit.textContent = LIMIT_UNIT[s.mode];
    el.desc.textContent = MODE_DESC[s.mode]();
    el.settings.classList.toggle('readonly', !ctx.isHost);
    el.hostOnly.textContent = ctx.isHost ? '' : 'Set by the host';
    el.balance.classList.toggle('hidden', !(ctx.isHost && s.mode !== 'ffa'));
    const humans = state.members.length;
    el.count.textContent = `Players ${humans + state.botSlots} / ${state.cap || 12}`;
    // Total bots in every mode (team modes split it evenly; the per-team +/- buttons set any other split).
    $('lb-bots-team').classList.toggle('hidden', s.mode === 'ffa' || !ctx.isHost);
    if (s.mode === 'ffa') {
      el.lists.className = 'lp-lists';
      el.lists.innerHTML = `<div class="lp-col">${state.members.map(row).join('')}${Array.from({ length: state.botSlots }, () => botRow(s.difficulty)).join('')}</div>`;
    } else {
      el.lists.className = 'lp-lists teams';
      // Bots per team as the host set them (trimmed to the 12-player cap).
      const bots = state.botTeams || { red: 0, blue: 0 };
      const full = humans + state.botSlots >= (state.cap || 12);
      const ctl = (t) => (ctx.isHost && state.phase === 'lobby'
        ? `<span class="lp-botctl"><span>Bots ${bots[t]}</span><button data-botteam="${t}" data-d="-1" ${bots[t] ? '' : 'disabled'} title="Remove a bot">&minus;</button><button data-botteam="${t}" data-d="1" ${full ? 'disabled' : ''} title="Add a bot">+</button></span>` : '');
      el.lists.innerHTML = ['red', 'blue'].map((t) => {
        const n = state.members.filter((m) => m.team === t).length + bots[t];
        return `<div><div class="lp-team-title ${t}"><span>${TEAM_NAMES[t]} <small>${n}</small></span>${ctl(t)}</div><div class="lp-col" data-team="${t}">${state.members.filter((m) => m.team === t).map(row).join('')}${Array.from({ length: bots[t] }, () => botRow(s.difficulty, t)).join('')}</div></div>`;
      }).join('');
    }
    el.tip.textContent = ctx.isHost
      ? (s.mode !== 'ffa' ? 'Drag players (or use the arrows) to move them between teams.' : 'Share the room code; friends can join any time.')
      : (s.mode !== 'ffa' ? 'Use the arrow next to your name to switch teams (if it keeps them balanced).' : 'Waiting for the host to start the match.');
    renderButtons();
  }

  function renderButtons() {
    el.start.classList.toggle('hidden', !ctx.isHost);
    el.ready.classList.toggle('hidden', ctx.isHost);
    el.ready.classList.toggle('on', myReady);
    el.ready.textContent = myReady ? 'Ready ✓' : 'Ready';
    const busy = state && state.phase !== 'lobby';
    el.start.disabled = !!busy;
    el.ready.disabled = !!busy;
  }

  return {
    show(st, c) {
      ctx = c;
      state = st;
      myReady = !!st?.members.find((m) => m.id === c.localId)?.ready;
      el.root.classList.remove('hidden');
      el.cd.classList.add('hidden');
      render();
    },
    update(st) {
      state = st;
      // The host owns ready flags (they reset after a match), so mirror them.
      const me = st?.members.find((m) => m.id === ctx.localId);
      if (me && !ctx.isHost) myReady = !!me.ready;
      if (!el.root.classList.contains('hidden')) render();
    },
    hide() { el.root.classList.add('hidden'); el.cd.classList.add('hidden'); clearInterval(cdTimer); },
    get visible() { return !el.root.classList.contains('hidden'); },
    countdown(secs) {
      let s = secs;
      el.cd.classList.remove('hidden');
      el.cdStatus.textContent = '';
      el.cdNum.textContent = s;
      clearInterval(cdTimer);
      cdTimer = setInterval(() => { s--; if (s <= 0) { clearInterval(cdTimer); el.cdNum.textContent = 'GO'; } else el.cdNum.textContent = s; }, 1000);
    },
    status(text) { el.status.textContent = text; },
    /** Line under the countdown number (what the match start is waiting on after GO). */
    countdownStatus(text) { el.cdStatus.textContent = text || ''; },
    /** The start was cancelled or failed: close the countdown overlay. */
    cancelCountdown() { clearInterval(cdTimer); el.cd.classList.add('hidden'); el.cdStatus.textContent = ''; },
    micLevel(v) { el.mic.style.width = Math.round(Math.min(1, v) * 100) + '%'; },
  };
}
