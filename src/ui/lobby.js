// Pre-match lobby screen (DOM only): room code, live settings (host-editable), players per team with mic / ping /
// ready, bot slots, team moves (click or drag), countdown overlay. Emits intents through handlers.
const $ = (id) => document.getElementById(id);
const TEAM_NAMES = { red: 'Red Devils', blue: 'Lions' };
const MODE_DESC = {
  ffa: 'Every player for themselves. One attack helicopter is hidden somewhere on campus.',
  tdm: 'Red Devils vs Lions. Kills score for your team.',
  ctf: 'Red Devils vs Lions. Steal the enemy flag and bring it to your base.',
};
const LIMIT_UNIT = { ffa: 'kills', tdm: 'team kills', ctf: 'captures' };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function createLobbyUi(h) {
  const el = {
    root: $('lobby'), code: $('lb-code'), status: $('lb-status'), settings: document.querySelector('.lobby-settings'),
    hostOnly: $('lb-hostonly'), mode: [...document.querySelectorAll('#lb-mode button')], bots: $('lb-bots'), botsO: $('lb-bots-o'),
    diff: [...document.querySelectorAll('#lb-diff button')], limit: $('lb-limit'), unit: $('lb-limit-unit'), desc: $('lb-desc'),
    count: $('lb-count'), lists: $('lb-lists'), balance: $('lb-balance'), tip: $('lb-tip'),
    ready: $('lb-ready'), start: $('lb-start'), leave: $('lb-leave'), copy: $('lb-copy'), mic: $('lb-mic'),
    cd: $('lb-countdown'), cdNum: $('lb-cd-num'),
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
      <span class="lp-name"><b>${esc(m.name)}</b>${m.host ? '<span class="lp-tag">HOST</span>' : ''}${me ? '<span class="lp-tag">YOU</span>' : ''}</span>
      <span class="lp-mic" title="Microphone connected">MIC &#10003;</span>
      <span class="lp-ping">${m.host ? 'host' : (m.ping ?? '-') + ' ms'}</span>
      <span><span class="lp-ready ${m.ready ? 'yes' : 'no'}">${m.host ? 'HOST' : m.ready ? 'READY' : 'NOT READY'}</span>${canMove ? `<button class="lp-move" data-move="${m.id}" data-to="${other}" title="Move to ${TEAM_NAMES[other]}">&#8644;</button>` : ''}</span>
    </div>`;
  }
  const botRow = (diff) => `<div class="lp-row bot"><span class="lp-name">Bot (${diff[0].toUpperCase() + diff.slice(1)})</span><span></span><span class="lp-ping">bot</span><span></span></div>`;

  function render() {
    if (!state) return;
    const s = state.settings;
    el.code.textContent = state.code;
    el.mode.forEach((b) => b.classList.toggle('on', b.dataset.v === s.mode));
    el.diff.forEach((b) => b.classList.toggle('on', b.dataset.v === s.difficulty));
    if (document.activeElement !== el.bots) { el.bots.value = s.bots; el.botsO.textContent = s.bots; }
    if (document.activeElement !== el.limit) el.limit.value = s.scoreLimit;
    el.unit.textContent = LIMIT_UNIT[s.mode];
    el.desc.textContent = MODE_DESC[s.mode];
    el.settings.classList.toggle('readonly', !ctx.isHost);
    el.hostOnly.textContent = ctx.isHost ? '' : 'Set by the host';
    el.balance.classList.toggle('hidden', !(ctx.isHost && s.mode !== 'ffa'));
    const humans = state.members.length;
    el.count.textContent = `Players ${humans + state.botSlots} / 8`;
    if (s.mode === 'ffa') {
      el.lists.className = 'lp-lists';
      el.lists.innerHTML = `<div class="lp-col">${state.members.map(row).join('')}${Array.from({ length: state.botSlots }, () => botRow(s.difficulty)).join('')}</div>`;
    } else {
      el.lists.className = 'lp-lists teams';
      // Predict where bots will land (they fill the smaller team).
      const n = { red: state.members.filter((m) => m.team === 'red').length, blue: state.members.filter((m) => m.team === 'blue').length };
      const bots = { red: 0, blue: 0 };
      for (let i = 0; i < state.botSlots; i++) { const t = n.red + bots.red <= n.blue + bots.blue ? 'red' : 'blue'; bots[t]++; }
      el.lists.innerHTML = ['red', 'blue'].map((t) => `<div><div class="lp-team-title ${t}">${TEAM_NAMES[t]}</div><div class="lp-col" data-team="${t}">${state.members.filter((m) => m.team === t).map(row).join('')}${Array.from({ length: bots[t] }, () => botRow(s.difficulty)).join('')}</div></div>`).join('');
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
      el.cdNum.textContent = s;
      clearInterval(cdTimer);
      cdTimer = setInterval(() => { s--; if (s <= 0) { clearInterval(cdTimer); el.cdNum.textContent = 'GO'; } else el.cdNum.textContent = s; }, 1000);
    },
    status(text) { el.status.textContent = text; },
    micLevel(v) { el.mic.style.width = Math.round(Math.min(1, v) * 100) + '%'; },
  };
}
