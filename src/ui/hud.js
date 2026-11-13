// In-game HUD (DOM): crosshair, hitmarkers, health, ammo, killfeed, score, timer, scoreboard, damage indicators.
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
    sb: $('scoreboard'), sbBody: $('sb-body'), sbMeta: $('sb-meta'), sbTitle: $('sb-title'),
  };
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

    targetName(name) {
      set('tn', name || '', (n) => {
        if (n) el.targetName.textContent = n;
        el.targetName.classList.toggle('show', !!n);
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

    killfeed({ killer, victim, weapon, headshot, mine, killerIsMe, victimIsMe }) {
      const d = document.createElement('div');
      d.className = 'kf' + (mine ? ' me' : '');
      const k = killer ? `<span class="${killerIsMe ? 'you' : ''}">${esc(killer)}</span>` : '';
      d.innerHTML = `${k}<span class="w">${esc(weapon)}</span>${headshot ? '<span class="hs">HEADSHOT</span>' : ''}<span class="${victimIsMe ? 'you' : ''}">${esc(victim)}</span>`;
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

    scoreboard(visible, rows, meta, title) {
      set('sbv', visible, (v) => el.sb.classList.toggle('hidden', !v));
      if (!visible) return;
      el.sbMeta.textContent = meta;
      el.sbTitle.textContent = title;
      const html = rows.map((r, i) => `<tr class="${r.me ? 'me' : ''} ${r.alive ? '' : 'dead'}"><td>${i + 1}</td><td class="name"><span class="swatch" style="background:${r.color}"></span>${esc(r.name)}</td><td>${r.k}</td><td>${r.d}</td><td>${r.ping}</td></tr>`).join('');
      set('sbh', html, (v) => { el.sbBody.innerHTML = v; });
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
    },
  };
}
