// First screen: "Welcome to Campus Combat · Find your school". A search box filters every campus as you type (school
// name, nickname, city, state, mascot, rival), with keyboard (arrows / Enter / Esc), mouse and controller support.
// Scales to hundreds of schools: rows are compact and the list only renders matches.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Searchable text fields of a campus, strongest first. */
function fields(c) {
  return [
    [c.name, 6], [(c.aliases || []).join(' '), 5], [c.short, 4], [c.city, 3], [c.stateName, 3],
    [c.teams?.red, 2], [c.rival, 1.5], [c.teams?.blue, 1],
  ].map(([t, w]) => [norm(t), w]).filter(([t]) => t);
}

/** Score a campus for a query (0 = no match). Every query word must match some field. */
export function scoreCampus(c, query) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return 1;
  const fs = fields(c);
  let total = 0;
  for (const w of words) {
    let best = 0;
    for (const [text, weight] of fs) {
      const tokens = text.split(' ');
      if (tokens.includes(w)) best = Math.max(best, weight * 3);
      else if (tokens.some((t) => t.startsWith(w))) best = Math.max(best, weight * 2);
      else if (text.includes(w)) best = Math.max(best, weight);
    }
    if (!best) return 0;
    total += best;
  }
  // Whole-query prefix of the name ranks first ("hins" -> Hinsdale Central).
  if (norm(c.name).startsWith(norm(query))) total += 20;
  return total;
}

/** Wraps the parts of `text` that match query words in <mark>. */
function highlight(text, query) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return esc(text);
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  for (const w of words) {
    let i = lower.indexOf(w);
    while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = lower.indexOf(w, i + 1); }
  }
  let out = '', open = false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] && !open) { out += '<mark>'; open = true; }
    if (!marks[i] && open) { out += '</mark>'; open = false; }
    out += esc(text[i]);
  }
  return out + (open ? '</mark>' : '');
}

/**
 * @param {object} o { root: HTMLElement, campuses: [], lastId: () => string|null, onChoose: (id) => void, sound?: (kind) => void }
 */
export function createCampusPicker({ root, campuses, lastId, onChoose, sound = () => {} }) {
  const input = root.querySelector('#cs-search');
  const list = root.querySelector('#cs-results');
  const count = root.querySelector('#cs-count');
  const recent = root.querySelector('#cs-recent');
  const bg = root.querySelector('.cs-bg-img');
  let rows = [];        // currently shown campuses, in order
  let active = 0;       // highlighted row

  function setActive(i, scroll = true) {
    if (!rows.length) return;
    active = (i + rows.length) % rows.length;
    list.querySelectorAll('.cs-row').forEach((el, k) => {
      el.classList.toggle('active', k === active);
      el.setAttribute('aria-selected', k === active ? 'true' : 'false');
      if (k === active && scroll) el.scrollIntoView({ block: 'nearest' });
    });
    input.setAttribute('aria-activedescendant', `cs-row-${rows[active].id}`);
    const c = rows[active];
    if (bg) bg.style.backgroundImage = `url(./${c.thumb || c.files.satellite})`;
  }

  function render() {
    const q = input.value;
    rows = campuses
      .map((c) => ({ c, s: scoreCampus(c, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
      .map((r) => r.c);
    const last = lastId();
    if (!q.trim()) {
      // Browsing: last played first, then alphabetical.
      rows.sort((a, b) => (b.id === last) - (a.id === last) || a.name.localeCompare(b.name));
    }
    count.textContent = q.trim()
      ? `${rows.length} ${rows.length === 1 ? 'school' : 'schools'} match`
      : `${campuses.length} ${campuses.length === 1 ? 'campus' : 'campuses'} · more on the way`;
    if (!rows.length) {
      list.innerHTML = `<li class="cs-empty">No school matches “${esc(q.trim())}” yet.<span>More campuses are on the way.</span></li>`;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    list.innerHTML = rows.map((c) => `
      <li role="option" id="cs-row-${c.id}">
        <button class="cs-row" data-campus-id="${c.id}" style="--cs-accent:${c.brand?.red || '#e3242b'}" tabindex="-1">
          <span class="cs-thumb" style="background-image:url(./${c.thumb || c.files.satellite})">
            ${c.emblem ? `<svg class="cs-emb" viewBox="0 0 100 112" aria-hidden="true">${c.emblem}</svg>` : ''}
          </span>
          <span class="cs-info">
            <span class="cs-name">${highlight(c.name, q)}${c.id === last ? '<em class="cs-last">Last played</em>' : ''}</span>
            <span class="cs-meta">${highlight(c.city, q)}</span>
            <span class="cs-teams"><b>${highlight(c.teams.red, q)}</b> vs <b>${highlight(c.teams.blue, q)}</b></span>
          </span>
          <span class="cs-go" aria-hidden="true">Play<i>&rsaquo;</i></span>
        </button>
      </li>`).join('');
    list.querySelectorAll('.cs-row').forEach((b, k) => {
      b.addEventListener('click', () => choose(rows[k].id));
      b.addEventListener('pointerenter', () => { if (k !== active) { setActive(k, false); sound('hover'); } });
    });
    setActive(Math.min(active, rows.length - 1), false);
  }

  function choose(id) { sound('select'); onChoose(id); }

  function renderRecent() {
    const last = campuses.find((c) => c.id === lastId());
    recent.innerHTML = last
      ? `<span>Jump back in</span><button class="cs-chip" data-campus-id="${last.id}" style="--cs-accent:${last.brand?.red || '#e3242b'}">${esc(last.name)}<i>&rsaquo;</i></button>`
      : '';
    recent.querySelector('.cs-chip')?.addEventListener('click', () => choose(last.id));
  }

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); sound('hover'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); sound('hover'); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) choose(rows[active].id); }
    else if (e.key === 'Escape') { if (input.value) { e.preventDefault(); input.value = ''; active = 0; render(); } }
  });
  // Start typing anywhere on the screen to search.
  addEventListener('keydown', (e) => {
    if (root.classList.contains('hidden') || e.target === input || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.length === 1 && /\S/.test(e.key)) { input.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { input.focus(); }
  });

  return {
    show() {
      input.value = '';
      active = 0;
      renderRecent();
      render();
      setTimeout(() => input.focus({ preventScroll: true }), 40);
    },
    get results() { return rows.map((c) => c.id); },
  };
}
