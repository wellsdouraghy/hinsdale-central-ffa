// Xbox / standard-mapping controller support. Polled once per frame (before the game update).
//
// In play it feeds the existing Input: buttons become virtual key codes (so every system that reads keys works
// unchanged), the left stick becomes analog movement (input.padMove) plus WASD for the helicopter / laptop, and the
// right stick becomes look deltas in mouse-pixel units. In menus it drives focus: D-pad / left stick move between
// visible buttons, A clicks, B goes back, Start resumes.
//
// Layout (in play):  LS move · RS look · L3 sprint (again while sprinting: dash) · R3 melee
//   RT fire · LT aim · A jump · B crouch/slide · X tap reload / hold interact (in heli: bail out) · Y switch weapon
//   LB grapple · RB frag (hold to cook) · D-pad up killstreak · right dash · down class swap · left aim toggle
//   View scoreboard · Menu pause.  Helicopter: A up, B down, L3 boost, RT cannon, LT rockets, X bail.
//   Airstrike laptop: RS move target, LS left/right rotate, A / RT call it in, B cancel.

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD_MOVE = 0.16, DEAD_LOOK = 0.12, TRIGGER = 0.3;
const YAW_RATE = 3.3, PITCH_RATE = 2.2;   // rad/s at full deflection, controller sensitivity 1
const BASE_SENS = 0.0021;                 // must match game.js (radians per mouse pixel at sensitivity 1)
const TAP_RELOAD = 0.28;                  // X released sooner than this = reload

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
// "Back" buttons in priority order (B in menus).
const BACK_IDS = ['btn-settings-close', 'btn-credits-close', 'btn-setup-back', 'btn-resume'];

export class GamepadInput {
  /**
   * @param {import('./input.js').Input} input
   * @param {object} settings  persisted settings (padSens, padInvert, sprintKey, sensitivity)
   * @param {object} hooks     { isPlaying(): bool, game(): Game|null, pause(): void }
   */
  constructor(input, settings, hooks) {
    this.input = input;
    this.settings = settings;
    this.hooks = hooks;
    this.prev = new Array(17).fill(false);
    this.xDownAt = -1;
    this.sprintLatch = false;
    this.sprintRelease = 0;
    this.fullTurn = 0;
    this.navDir = null;
    this.navNext = 0;
    this.connected = false;
    this.index = -1;
    addEventListener('gamepadconnected', (e) => { this.connected = true; this.index = e.gamepad.index; });
    addEventListener('gamepaddisconnected', () => { this._pick(); });
    // Mouse-click-only "user activation" APIs (pointer lock) never fire from a controller, so the game runs
    // unlocked while the controller is in use: hide the cursor over the 3D view.
    this._style = document.createElement('style');
    this._style.textContent = 'body.pad-play canvas { cursor: none; } .pad-focus { outline: 3px solid #ffd34d !important; outline-offset: 2px; }';
    document.head.appendChild(this._style);
  }

  _pick() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    let best = null;
    for (const p of pads) if (p.connected && (!best || p.timestamp > best.timestamp)) best = p;
    this.connected = !!best;
    this.index = best ? best.index : -1;
    return best;
  }

  /** Short vibration (only while the controller is the active input). */
  rumble(ms, weak, strong) {
    if (!this.input.padActive) return;
    const p = this.index >= 0 ? navigator.getGamepads?.()[this.index] : null;
    try { p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, weakMagnitude: weak, strongMagnitude: strong }); } catch { /* unsupported */ }
  }

  poll(dt) {
    const inp = this.input;
    const pad = this._pick();
    if (!pad) { this._release(); document.body.classList.remove('pad-play'); return; }
    const btn = (i) => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > TRIGGER); };
    const now = performance.now() / 1000;
    const cur = [];
    for (let i = 0; i < 17; i++) cur[i] = btn(i);
    const edge = (i) => cur[i] && !this.prev[i];
    const up = (i) => !cur[i] && this.prev[i];
    const ax = (i) => pad.axes[i] || 0;
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    const lMag = Math.hypot(lx, ly), rMag = Math.hypot(rx, ry);

    // Any real controller input makes it the active device (mouse / keyboard use switches back, see Input).
    if (cur.some(Boolean) || lMag > 0.35 || rMag > 0.35) inp.padActive = true;

    const playing = this.hooks.isPlaying();
    document.body.classList.toggle('pad-play', playing && inp.padActive);
    if (!playing || !inp.padActive) {
      this._release();
      if (inp.padActive) this._menu(cur, edge, lx, ly, now);
      this.prev = cur;
      return;
    }

    const game = this.hooks.game();
    const piloting = !!game?.piloting;
    const laptop = !!game?.laptop?.active;
    const want = new Set();
    const press = (code) => { if (!inp.padDown.has(code)) inp.pressed.add(code); want.add(code); };

    // ---- left stick: analog move + digital WASD (helicopter / laptop) ----
    if (lMag > DEAD_MOVE) {
      const k = Math.min(1, (lMag - DEAD_MOVE) / (1 - DEAD_MOVE)) / lMag;
      inp.padMove.x = lx * k;
      inp.padMove.y = -ly * k;
    } else { inp.padMove.x = 0; inp.padMove.y = 0; }
    if (ly < -0.45) want.add('KeyW');
    if (ly > 0.45) want.add('KeyS');
    if (lx < -0.45) want.add('KeyA');
    if (lx > 0.45) want.add('KeyD');

    // ---- sprint latch (L3), L3 while sprinting = dash ----
    if (edge(B.L3)) {
      if (!piloting && game?.player?.sprinting) press('KeyE');
      else this.sprintLatch = !this.sprintLatch;
    }
    if (this.sprintLatch) {
      // Released once the stick stops pushing forward for a moment.
      if (inp.padMove.y < 0.25) { this.sprintRelease += dt; if (this.sprintRelease > 0.15) this.sprintLatch = false; }
      else this.sprintRelease = 0;
    }
    if (this.sprintLatch) want.add(piloting || this.settings.sprintKey !== 'ctrl' ? 'ShiftLeft' : 'ControlLeft');

    // ---- buttons ----
    const hold = (i, code) => { if (cur[i]) { if (edge(i)) inp.pressed.add(code); want.add(code); } };
    if (laptop) {
      if (edge(B.A)) inp.pressed.add('Mouse0');
      if (edge(B.B)) inp.pressed.add('Escape');
    } else {
      hold(B.A, 'Space');
      hold(B.B, 'KeyC');
    }
    hold(B.RT, 'Mouse0');
    hold(B.LT, 'Mouse2');
    hold(B.LB, 'KeyF');
    hold(B.RB, 'KeyG');
    hold(B.R3, 'KeyV');
    hold(B.UP, 'Digit4');
    hold(B.RIGHT, 'KeyE');
    hold(B.DOWN, 'KeyB');
    hold(B.LEFT, 'KeyQ');
    hold(B.VIEW, 'Tab');
    // X: hold = interact (care package / enter heli), short tap = reload. In the helicopter X is bail-out only.
    if (edge(B.X)) this.xDownAt = now;
    hold(B.X, 'KeyX');
    if (up(B.X) && !piloting && this.xDownAt >= 0 && now - this.xDownAt < TAP_RELOAD) inp.pressed.add('KeyR');
    if (edge(B.Y)) inp.wheel += 1;
    if (edge(B.MENU)) { this.prev = cur; this._release(); this.hooks.pause(); return; }

    // Class swap / spawn menu open: D-pad left / right also cycle the class cards (handled by menu focus otherwise).

    // ---- virtual key bookkeeping ----
    for (const c of inp.padDown) if (!want.has(c)) inp.padDown.delete(c);
    for (const c of want) inp.padDown.add(c);

    // ---- right stick: look ----
    if (rMag > DEAD_LOOK) {
      const m = Math.min(1, (rMag - DEAD_LOOK) / (1 - DEAD_LOOK));
      const curve = m * m * (0.35 + 0.65 * m) / rMag;      // fine aim near the centre, fast at full tilt
      // Holding the stick at full deflection ramps the turn speed up (quick 180s).
      this.fullTurn = Math.abs(rx) > 0.92 ? Math.min(1, this.fullTurn + dt / 0.45) : 0;
      const boost = 1 + 0.7 * this.fullTurn;
      const sens = (this.settings.padSens ?? 1) * this._assist(game);
      const inv = this.settings.padInvert ? -1 : 1;
      const yaw = rx * curve * YAW_RATE * boost * sens * dt;
      const pitch = ry * curve * PITCH_RATE * sens * dt * inv;
      // Game look = -dx * BASE_SENS * sensitivity; convert radians to mouse pixels.
      const px = 1 / (BASE_SENS * (this.settings.sensitivity || 1));
      inp.dx += yaw * px;
      inp.dy += pitch * px;
    } else this.fullTurn = 0;

    this.prev = cur;
  }

  /** Aim slowdown while the crosshair is over a visible enemy (controller only; mouse players get nothing). */
  _assist(game) {
    if (!game || game.piloting || !game.camera) return 1;
    const cam = game.camera;
    const fx = -cam.matrixWorld.elements[8], fy = -cam.matrixWorld.elements[9], fz = -cam.matrixWorld.elements[10];
    const cp = cam.position;
    for (const r of game.remotes?.values?.() || []) {
      if (r._rel !== 'enemy' || !r.alive || !r._tagVis) continue;
      const f = r.feet;
      if (!f) continue;
      const tx = f.x - cp.x, ty = f.y + 1.2 - cp.y, tz = f.z - cp.z;
      const d = Math.hypot(tx, ty, tz);
      if (d < 1 || d > 160) continue;
      const along = (tx * fx + ty * fy + tz * fz);
      if (along <= 0) continue;
      const off = Math.sqrt(Math.max(0, d * d - along * along));   // metres from the aim line
      if (off < 0.9 + d * 0.012) return 0.5;
    }
    return 1;
  }

  _release() {
    const inp = this.input;
    inp.padDown.clear();
    inp.padMove.x = 0; inp.padMove.y = 0;
    this.sprintLatch = false;
    this.fullTurn = 0;
  }

  // ======================= menus =======================
  _menu(cur, edge, lx, ly, now) {
    // A menu just opened (pause, death screen...) with nothing focused: highlight its main button.
    if (now >= (this.autoFocusAt || 0)) {
      this.autoFocusAt = now + 0.4;
      if (!this._focused()) this._focus(this._first());
    }
    // Directions from D-pad or left stick, with key-repeat.
    let dir = null;
    if (cur[B.UP] || ly < -0.6) dir = 'up';
    else if (cur[B.DOWN] || ly > 0.6) dir = 'down';
    else if (cur[B.LEFT] || lx < -0.6) dir = 'left';
    else if (cur[B.RIGHT] || lx > 0.6) dir = 'right';
    if (dir !== this.navDir) { this.navDir = dir; if (dir) { this._move(dir); this.navNext = now + 0.38; } }
    else if (dir && now >= this.navNext) { this._move(dir); this.navNext = now + 0.11; }

    if (edge(B.A)) {
      const el = this._focused() || this._first();
      if (el) {
        if (el.matches('input[type=text], input:not([type]), textarea')) el.focus();
        else el.click();
        // The clicked control may have been removed (re-rendered list): keep a nearby focus.
        setTimeout(() => { if (!this._focused()) this._focus(this._first()); }, 50);
      }
    }
    if (edge(B.B)) this._back();
    if (edge(B.MENU)) {
      const resume = document.getElementById('btn-resume');
      if (resume && this._visible(resume)) resume.click();
    }
    if (edge(B.Y)) {
      // Death screen: respawn as soon as allowed.
      this.input.pressed.add('Space');
    }
    if (edge(B.LB) || edge(B.RB)) {
      // Shoulder buttons scroll long panels.
      const panel = this._focused()?.closest('.panel, .screen, .overlay');
      panel?.scrollBy?.({ top: edge(B.RB) ? 240 : -240, behavior: 'smooth' });
    }
  }

  _visible(el) {
    if (!el || el.disabled || el.closest('.hidden, #attribution')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) === 0) return false;
    // Not covered by another layer (overlay on top of the title screen, etc.).
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    return !!top && (top === el || el.contains(top) || top.contains(el) && top.tagName === 'LABEL');
  }

  _candidates() {
    return [...document.querySelectorAll(FOCUSABLE)].filter((el) => this._visible(el));
  }

  _focused() {
    const a = document.activeElement;
    return a && a !== document.body && a.matches?.(FOCUSABLE) && this._visible(a) ? a : null;
  }

  _first() {
    const c = this._candidates().filter((el) => !el.matches('input[type=text], input:not([type]), textarea'));
    return c.find((el) => el.classList.contains('primary') || el.classList.contains('on')) || c[0] || null;
  }

  _focus(el) {
    if (!el) return;
    document.querySelectorAll('.pad-focus').forEach((e) => e.classList.remove('pad-focus'));
    el.classList.add('pad-focus');
    el.focus({ preventScroll: false });
    el.scrollIntoView?.({ block: 'nearest' });
  }

  _move(dir) {
    const cur = this._focused();
    if (!cur) { this._focus(this._first()); return; }
    // Sliders / dropdowns: left / right change the value.
    if ((dir === 'left' || dir === 'right') && cur.matches('input[type=range]')) {
      const min = Number(cur.min || 0), max = Number(cur.max || 100);
      const step = Math.max(Number(cur.step) || 1, (max - min) / 40);
      cur.value = String(Math.min(max, Math.max(min, Number(cur.value) + (dir === 'right' ? step : -step))));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if ((dir === 'left' || dir === 'right') && cur.tagName === 'SELECT') {
      cur.selectedIndex = Math.min(cur.options.length - 1, Math.max(0, cur.selectedIndex + (dir === 'right' ? 1 : -1)));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bestScore = Infinity;
    for (const el of this._candidates()) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      // Edge-to-edge distance along the direction; centre offset across it.
      const along = v[0] ? (v[0] > 0 ? r.left - a.right : a.left - r.right) : (v[1] > 0 ? r.top - a.bottom : a.top - r.bottom);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ctr = (cx - ax) * v[0] + (cy - ay) * v[1];
      if (along < -4 && ctr <= 4) continue;
      if (ctr <= 4) continue;
      const across = v[0] ? Math.abs(cy - ay) : Math.abs(cx - ax);
      const score = Math.max(0, along) + across * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) this._focus(best);
  }

  _back() {
    for (const id of BACK_IDS) {
      const el = document.getElementById(id);
      if (el && this._visible(el)) { el.click(); return; }
    }
    // Swap / loadout overlays: their main button closes them ("Close (B)" / "Done").
    const deploy = document.getElementById('deploy');
    if (deploy && !deploy.classList.contains('hidden')) {
      const btn = deploy.querySelector('.btn.primary, #btn-deploy');
      if (btn && this._visible(btn) && /close|done/i.test(btn.textContent)) { btn.click(); return; }
    }
    // Fallback: menus listen for Escape (e.g. closing the title-screen Play group).
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  }
}
