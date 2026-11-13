// In-game HUD (DOM): crosshair, hitmarkers, health, ammo, killfeed, score, timer, scoreboard, damage indicators,
// CTF team scores / flag status / announcements / waypoint markers.
import { createMarkers } from './markers.js';

const $ = (id) => document.getElementById(id);

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function colorCss(n) { return '#' + n.toString(16).padStart(6, '0'); }

export function createHud() {
  const root = $('hud');
  const el = {
    vignette: $('vignette'), flash: $('dmg-flash'), dirs: $('damage-dirs'), scope: $('scope'),
    crosshair: $('crosshair'), chT: root.querySelector('.ch.t'), chB: root.querySelector('.ch.b'),
    chL: root.querySelector('.ch.l'), chR: root.querySelector('.ch.r'),
    hitmarker: $('hitmarker'), targetName: $('target-name'),
    scoreMe: $('score-me'), scoreRank: $('score-rank'), leadName: $('score-lead-name'), lead: $('score-lead'), limit: $('score-limit'),
    timer: $('timer'), timerSub: $('timer-sub'), net: $('net-info'), killfeed: $('killfeed'),
    center: $('center-msg'), banner: $('kill-banner'), protect: $('protect-msg'),
    hpFill: $('hp-fill'), hpNum: $('hp-num'),
    slots: $('weapon-slots'), ammo: $('ammo'), mag: $('ammo-mag'), res: $('ammo-res'), wname: $('weapon-name'), reloadHint: $('reload-hint'),
    sb: $('scoreboard'), sbBody: $('sb-body'), sbMeta: $('sb-meta'), sbTitle: $('sb-title'), sbHead: $('sb-headrow'),
    ctfRed: $('ctf-red'), ctfBlue: $('ctf-blue'), ctfRedScore: $('ctf-red-score'), ctfBlueScore: $('ctf-blue-score'),
    ctfRedFlag: $('ctf-red-flag'), ctfBlueFlag: $('ctf-blue-flag'), carry: $('carry-msg'),
    announce: $('announce'), scorePanel: $('score-panel'),
    kit: $('kit'), kitG: $('kit-grapple'), kitD: $('kit-dash'), gInd: $('grapple-ind'),
    kc: $('killcam'), kcName: $('kc-name'), kcMeta: $('kc-meta'),
    cap: $('cap-prompt'), capText: $('cp-text'), capFill: $('cp-fill'),
    pips: $('sp-pips'), items: $('sp-items'), armor: $('armor'), armorFill: $('armor-fill'), armorNum: $('armor-num'),
    equip: $('equip'), frags: $('eq-frags'), cook: root.querySelector('.eq-cook'), cookFill: $('eq-cook'),
    micLive: $('mic-live'), micLevel: $('mic-level'), speakers: $('speakers'),
    ebars: $('enemy-bars'), swapHint: $('swap-hint'),
    heli: $('heli-hud'), hhHp: $('hh-hp'), hhHeat: $('hh-heat'), hhRk: $('hh-rk'), hhLeft: $('hh-left'), hhMeta: $('hh-meta'),
  };
  const spkEls = new Map();
  const barEls = new Map();
  const _proj = { v: null };
  const kitGBar = el.kitG.querySelector('i'), kitDBar = el.kitD.querySelector('i');
  const markers = createMarkers($('markers'));
  let announceTimer = 0;
  const dirs = [];
  let flashT = 0, centerT = 0;
  let last = {};
  const set = (key, v, fn) => { if (last[key] !== v) { last[key] = v; fn(v); } };

  return {
    show(v) { root.classList.toggle('hidden', !v); },
    setAlive(v) { set('alive', v, (x) => root.classList.toggle('is-dead', !x)); },

    setHealth(hp) {
      const h = Math.max(0, Math.round(hp));
      set('hp', h, () => {
        el.hpFill.style.width = h + '%';
        el.hpFill.classList.toggle('low', h < 40);
        el.hpNum.textContent = h;
      });
      const v = h >= 75 ? 0 : (75 - h) / 75;
      set('vig', Math.round(v * 50), () => { el.vignette.style.opacity = Math.min(1, v * 1.3).toFixed(2); });
    },

    damageFlash() { flashT = 0.35; },

    /** angle: radians, 0 = attacker straight ahead, positive = to the right. */
    damageDirection(angle) {
      const d = document.createElement('div');
      d.className = 'dmg-dir';
      d.style.transform = `rotate(${angle}rad)`;
      el.dirs.appendChild(d);
      dirs.push({ el: d, t: 1.6 });
    },

    hitmarker(kind) {
      const h = el.hitmarker;
      h.className = '';
      void h.offsetWidth; // restart animation
      h.className = (kind === 'hit' ? '' : kind) + ' show';
    },

    crosshair({ visible, spreadPx, enemy }) {
      set('chv', visible, (v) => { el.crosshair.style.opacity = v ? '1' : '0'; });
      const g = Math.round(Math.max(4, Math.min(80, spreadPx)));
      set('chg', g, () => {
        el.chT.style.top = -(g + 9) + 'px';
        el.chB.style.top = g + 'px';
        el.chL.style.left = -(g + 9) + 'px';
        el.chR.style.left = g + 'px';
      });
      set('che', !!enemy, (e) => el.crosshair.classList.toggle('enemy', e));
    },

    targetName(name, friendlyColor = null) {
      set('tn', (name || '') + '|' + (friendlyColor || ''), () => {
        if (name) el.targetName.textContent = name;
        el.targetName.style.color = friendlyColor || '';
        el.targetName.classList.toggle('show', !!name);
      });
    },

    scope(v) { set('scope', v, (x) => el.scope.classList.toggle('hidden', !x)); },

    weapon({ slots, current, label, ammo, reserve, mag, reloading }) {
      const key = slots.join(',') + current;
      set('slots', key, () => {
        el.slots.innerHTML = slots.map((s, i) => `<span class="slot${i === current ? ' on' : ''}">${i + 1} ${esc(s)}</span>`).join('');
      });
      set('wname', label, (v) => { el.wname.textContent = v; });
      set('mag', ammo, (v) => { el.mag.textContent = v; });
      set('res', reserve, (v) => { el.res.textContent = v; });
      const low = ammo <= Math.ceil(mag * 0.25);
      set('low', low, (v) => el.ammo.classList.toggle('low', v));
      let hint = '';
      if (reloading) hint = 'Reloading';
      else if (ammo === 0 && reserve === 0) hint = 'No ammo';
      else if (low) hint = 'Press R to reload';
      set('hint', hint, (v) => { el.reloadHint.textContent = v; });
    },

    score({ myKills, rank, leaderName, leaderKills, limit, practice }) {
      set('sm', myKills, (v) => { el.scoreMe.textContent = v; });
      set('sr', rank, (v) => { el.scoreRank.textContent = v ? ordinal(v) : ''; });
      set('ln', leaderName, (v) => { el.leadName.textContent = v; });
      set('lk', leaderKills, (v) => { el.lead.textContent = v; });
      set('lim', practice ? '' : '/ ' + limit, (v) => { el.limit.textContent = v; });
      set('prac', practice, (v) => { el.lead.parentElement.style.display = v ? 'none' : ''; });
    },

    timer(seconds, sub) {
      let txt;
      if (seconds === null) txt = 'PRACTICE';
      else {
        const s = Math.max(0, Math.ceil(seconds));
        txt = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      }
      set('timer', txt, (v) => { el.timer.textContent = v; });
      set('tlow', seconds !== null && seconds < 60, (v) => el.timer.classList.toggle('low', v));
      set('tsub', sub, (v) => { el.timerSub.textContent = v; });
    },

    netInfo(text) { set('net', text, (v) => { el.net.textContent = v; }); },

    killfeed({ killer, victim, weapon, headshot, mine, killerIsMe, victimIsMe, killerColor, victimColor }) {
      const d = document.createElement('div');
      d.className = 'kf' + (mine ? ' me' : '');
      const st = (c) => (c ? ` style="color:${c}"` : '');
      const k = killer ? `<span class="${killerIsMe ? 'you' : ''}"${st(killerColor)}>${esc(killer)}</span>` : '';
      const icon = { FRAG: '<svg viewBox="0 0 24 20"><ellipse cx="11" cy="12" rx="6" ry="7"/><rect x="8" y="1" width="6" height="4" rx="1"/><path d="M14 2h6v2h-6z"/></svg> ', MELEE: '<svg viewBox="0 0 24 20"><path d="M2 16 16 2l3 3L5 19z"/><path d="M15 9l5 5-2 2-5-5z"/></svg> ', AIRSTRIKE: '<svg viewBox="0 0 24 20"><path d="M12 1 14 8 23 10 14 12 12 19 10 12 1 10 10 8z"/></svg> ' }[weapon] || '';
      d.innerHTML = `${k}<span class="w">${icon}${esc(weapon)}</span>${headshot ? '<span class="hs">HEADSHOT</span>' : ''}<span class="${victimIsMe ? 'you' : ''}"${st(victimColor)}>${esc(victim)}</span>`;
      el.killfeed.prepend(d);
      while (el.killfeed.children.length > 6) el.killfeed.lastChild.remove();
      setTimeout(() => { d.style.opacity = '0'; }, 6000);
      setTimeout(() => d.remove(), 6600);
    },

    killBanner(name, headshot) {
      const b = el.banner;
      b.innerHTML = `<div class="pts">${headshot ? 'Headshot' : 'Eliminated'}</div><div class="who"><b>${esc(name)}</b></div>`;
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
    },

    center(text, seconds = 2) {
      el.center.textContent = text;
      el.center.classList.toggle('show', !!text);
      centerT = text ? seconds : 0;
    },

    protect(v) { set('prot', v, (x) => el.protect.classList.toggle('hidden', !x)); },

    /** teams: null (FFA) or { score: {red, blue} } -> rows grouped by team with captures/returns. */
    scoreboard(visible, rows, meta, title, teams = null) {
      set('sbv', visible, (v) => el.sb.classList.toggle('hidden', !v));
      if (!visible) return;
      el.sbMeta.textContent = meta;
      el.sbTitle.textContent = title;
      const caps = teams && teams.caps !== false;
      const head = caps
        ? '<th>#</th><th class="name">Player</th><th>Class</th><th>Caps</th><th>Returns</th><th>Kills</th><th>Deaths</th><th>Ping</th>'
        : '<th>#</th><th class="name">Player</th><th>Class</th><th>Kills</th><th>Deaths</th><th>Ping</th>';
      set('sbhead', head, (v) => { el.sbHead.innerHTML = v; });
      const row = (r, i) => `<tr class="${r.me ? 'me' : ''} ${r.alive ? '' : 'dead'}"><td>${i + 1}</td><td class="name"><span class="swatch" style="background:${r.color}"></span>${esc(r.name)}</td><td class="cls">${esc(r.cls || '')}</td>${caps ? `<td>${r.caps}</td><td>${r.ret}</td>` : ''}<td>${r.k}</td><td>${r.d}</td><td>${r.ping}</td></tr>`;
      let html;
      if (teams) {
        html = ['red', 'blue'].map((tm) => {
          const list = rows.filter((r) => r.team === tm);
          return `<tr class="team-head ${tm}"><td colspan="8"><span>${esc(teams.names?.[tm] ?? tm)}</span><b>${teams.score?.[tm] ?? 0}</b></td></tr>` + list.map(row).join('');
        }).join('');
      } else html = rows.map(row).join('');
      set('sbh', html, (v) => { el.sbBody.innerHTML = v; });
    },

    /** CTF top bar: team scores + flag status, "you have the flag" banner. */
    ctf({ score, status, myTeam, carrying }) {
      set('ctfOn', true, () => {
        el.ctfRed.classList.remove('hidden');
        el.ctfBlue.classList.remove('hidden');
        el.scorePanel.classList.add('hidden');
      });
      set('ctfMine', myTeam, (v) => {
        el.ctfRed.classList.toggle('mine', v === 'red');
        el.ctfBlue.classList.toggle('mine', v === 'blue');
      });
      set('sR', score.red, (v) => { el.ctfRedScore.textContent = v; });
      set('sB', score.blue, (v) => { el.ctfBlueScore.textContent = v; });
      // TDM passes status null: no flag rows.
      set('fShow', !!status, (v) => { el.ctfRedFlag.classList.toggle('hidden', !v); el.ctfBlueFlag.classList.toggle('hidden', !v); });
      if (status) {
        set('fR', status.red.text + status.red.kind, () => { el.ctfRedFlag.textContent = status.red.text; el.ctfRedFlag.dataset.kind = status.red.kind; });
        set('fB', status.blue.text + status.blue.kind, () => { el.ctfBlueFlag.textContent = status.blue.text; el.ctfBlueFlag.dataset.kind = status.blue.kind; });
      }
      set('carry', !!carrying, (v) => el.carry.classList.toggle('hidden', !v));
    },

    announce(title, sub, color) {
      el.announce.innerHTML = `<div class="a-title" style="color:${color || '#fff'}">${esc(title)}</div>${sub ? `<div class="a-sub">${esc(sub)}</div>` : ''}`;
      el.announce.classList.remove('show');
      void el.announce.offsetWidth;
      el.announce.classList.add('show');
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => el.announce.classList.remove('show'), 3200);
    },

    markers(list, camera) { markers.update(list, camera); },

    /** Movement kit meters (0..1 = recharge progress) + crosshair grapple-in-range indicator. */
    kit({ grapple, dash, grappling, target, visible }) {
      set('kitv', visible, (v) => el.kit.classList.toggle('hidden', !v));
      const g = Math.round(Math.max(0, grapple) * 50), d = Math.round(Math.max(0, dash) * 50);
      set('kg', g, (v) => { kitGBar.style.width = v * 2 + '%'; el.kitG.classList.toggle('ready', v >= 50); });
      set('kd', d, (v) => { kitDBar.style.width = v * 2 + '%'; el.kitD.classList.toggle('ready', v >= 50); });
      set('kga', grappling, (v) => el.kitG.classList.toggle('active', v));
      const ind = !visible ? 'off' : target && g >= 50 ? 'ready' : target ? 'cool' : 'none';
      set('gind', ind, (v) => { el.gInd.className = v; });
    },
    /** Grenades, armor, killstreak progress/items, crate capture prompt. */
    equipment({ frags, cook, armor, visible, streak, items, uav, speed, prompt }) {
      set('fr', frags, (v) => { el.frags.textContent = v; el.equip.classList.toggle('empty', v <= 0); });
      const c = Math.round(cook * 40);
      set('ck', c, (v) => { el.cook.classList.toggle('on', v > 0); el.cookFill.style.width = (v / 40 * 100) + '%'; });
      const a = Math.round(armor);
      set('arm', a, (v) => { el.armor.classList.toggle('hidden', v <= 0); el.armorFill.style.width = v + '%'; el.armorNum.textContent = v; });
      // Streak pips up to the next reward (3 / 5 / 7).
      const goal = streak < 3 ? 3 : streak < 5 ? 5 : 7;
      const pipKey = streak + '/' + goal;
      set('pips', pipKey, () => {
        el.pips.innerHTML = Array.from({ length: goal }, (_, i) => `<i class="${i < streak ? 'on' : ''} ${i === goal - 1 ? 'goal' : ''}"></i>`).join('');
      });
      const names = { care: 'CARE PKG', uav: 'UAV', airstrike: 'AIRSTRIKE' };
      const itemKey = items.join(',') + (uav ? '|U' : '') + (speed ? '|S' : '');
      set('items', itemKey, () => {
        el.items.innerHTML = items.map((it, i) => `<span>${i === items.length - 1 ? '[4] ' : ''}${names[it] || it}</span>`).join('') +
          (uav ? '<span class="uav">UAV ACTIVE</span>' : '') + (speed ? '<span class="uav">SPEED</span>' : '');
      });
      const pk = prompt ? prompt.text + Math.round(prompt.progress * 50) : '';
      set('cap', pk, () => {
        el.cap.classList.toggle('hidden', !prompt);
        if (prompt) { el.capText.textContent = prompt.text; el.capFill.style.width = Math.round(prompt.progress * 100) + '%'; }
      });
    },

    /** Voice: mic-live meter + speaker icons over talking players' heads. info null hides everything. */
    voice(info, camera) {
      set('mic', !!info, (v) => el.micLive.classList.toggle('hidden', !v));
      const seen = new Set();
      if (info) {
        el.micLevel.style.width = Math.round(info.level * 100) + '%';
        for (const s of info.speakers) {
          const v = (_proj.v ||= s.pos.clone()).copy(s.pos).project(camera);
          if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
          seen.add(s.id);
          let e = spkEls.get(s.id);
          if (!e) {
            e = document.createElement('div');
            e.className = 'spk-icon';
            e.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-5v16l-5-5H3z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
            el.speakers.appendChild(e);
            spkEls.set(s.id, e);
          }
          e.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px)`;
        }
      }
      for (const [id, e] of spkEls) if (!seen.has(id)) { e.remove(); spkEls.delete(id); }
    },

    /** Compact HP (+armor) bars over damaged enemies; clamped to the screen edges. */
    enemyBars(list, camera) {
      const seen = new Set();
      for (const b of list) {
        const v = (_proj.v ||= b.pos.clone()).copy(b.pos).project(camera);
        let x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
        if (v.z > 1) { x = innerWidth - x; y = innerHeight - 40; } // behind: flip to the bottom edge
        x = Math.min(innerWidth - 50, Math.max(50, x));
        y = Math.min(innerHeight - 30, Math.max(40, y));
        seen.add(b.id);
        let e = barEls.get(b.id);
        if (!e) {
          e = document.createElement('div');
          e.className = 'ehp';
          e.innerHTML = '<div class="ehp-armor"><i></i></div><div class="ehp-hp"><i></i></div>';
          el.ebars.appendChild(e);
          barEls.set(b.id, e);
        }
        e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        e.style.opacity = b.alpha.toFixed(2);
        e.children[1].firstChild.style.width = Math.max(0, Math.min(100, b.hp)) + '%';
        e.children[0].style.display = b.armor > 0 ? '' : 'none';
        e.children[0].firstChild.style.width = Math.max(0, Math.min(100, b.armor)) + '%';
      }
      for (const [id, e] of barEls) if (!seen.has(id)) { e.remove(); barEls.delete(id); }
    },

    /** Pilot HUD; null hides it (also hides the infantry HUD pieces via a class). */
    heli(info) {
      set('heliOn', !!info, (v) => { el.heli.classList.toggle('hidden', !v); root.classList.toggle('piloting', v); });
      if (!info) return;
      el.hhHp.style.width = Math.round(Math.max(0, info.hp) * 100) + '%';
      el.hhHeat.style.width = Math.round(info.heat * 100) + '%';
      el.hhHeat.parentElement.classList.toggle('over', info.overheated);
      set('hhRk', info.rockets > 0 ? info.rockets.toFixed(1) + 's' : 'Ready', (v) => { el.hhRk.textContent = v; });
      set('hhLeft', Math.ceil(info.left), (v) => { el.hhLeft.textContent = v + 's'; el.hhLeft.classList.toggle('warn', info.warn); });
      set('hhMeta', `${Math.round(info.speed * 3.6)} km/h · ALT ${Math.round(info.alt)} m`, (v) => { el.hhMeta.textContent = v; });
    },

    swapHint(v) { set('swap', v, (x) => el.swapHint.classList.toggle('hidden', !x)); },

    /** Kill cam overlay: { name, weapon, hp } or null. */
    killcam(info) {
      root.classList.toggle('killcam-on', !!info);
      el.kc.classList.toggle('hidden', !info);
      if (info) {
        el.kcName.textContent = info.name;
        el.kcMeta.textContent = `${info.weapon}${info.hp != null ? ` · ${info.hp} HP left` : ''}`;
      }
    },

    kitDenied() {
      el.kitG.classList.remove('deny');
      void el.kitG.offsetWidth;
      el.kitG.classList.add('deny');
    },

    update(dt) {
      if (flashT > 0) { flashT -= dt; el.flash.style.opacity = Math.max(0, flashT / 0.35).toFixed(2); }
      for (let i = dirs.length - 1; i >= 0; i--) {
        const d = dirs[i];
        d.t -= dt;
        d.el.style.opacity = Math.min(1, d.t).toFixed(2);
        if (d.t <= 0) { d.el.remove(); dirs.splice(i, 1); }
      }
      if (centerT > 0) { centerT -= dt; if (centerT <= 0) el.center.classList.remove('show'); }
    },

    reset() {
      last = {};
      el.killfeed.innerHTML = '';
      el.dirs.innerHTML = '';
      dirs.length = 0;
      el.center.classList.remove('show');
      el.banner.classList.remove('show');
      el.sb.classList.add('hidden');
      el.scope.classList.add('hidden');
      el.ctfRed.classList.add('hidden');
      el.ctfBlue.classList.add('hidden');
      el.scorePanel.classList.remove('hidden');
      el.carry.classList.add('hidden');
      el.announce.classList.remove('show');
      markers.clear();
    },
  };
}
