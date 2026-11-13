// Keyboard / mouse input with pointer lock. Supports scripted input for automated testing.
export class Input {
  constructor(element) {
    this.element = element;
    this.down = new Set();      // KeyboardEvent.code and 'Mouse0'/'Mouse2'
    this.pressed = new Set();   // edges since last frame
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.forceActive = false;   // debug: accept input without pointer lock
    this.enabled = false;       // false while menus are open
    this.onLockChange = null;
    this.lastLockRequest = 0;
    this._bind();
  }

  get active() { return this.enabled && (this.locked || this.forceActive); }

  _bind() {
    this._onKeyDown = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    };
    this._onKeyUp = (e) => { this.down.delete(e.code); };
    this._onMouseDown = (e) => {
      if (!this.active) return;
      const code = 'Mouse' + e.button;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    };
    this._onMouseUp = (e) => { this.down.delete('Mouse' + e.button); };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      // Ignore absurd spikes some browsers emit right after locking.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    };
    this._onWheel = (e) => { if (this.active) this.wheel += Math.sign(e.deltaY); };
    this._onLock = () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    };
    this._onBlur = () => this.down.clear();
    this._onContext = (e) => { if (this.enabled) e.preventDefault(); };
    addEventListener('keydown', this._onKeyDown);
    addEventListener('keyup', this._onKeyUp);
    addEventListener('mousedown', this._onMouseDown);
    addEventListener('mouseup', this._onMouseUp);
    addEventListener('mousemove', this._onMouseMove);
    addEventListener('wheel', this._onWheel, { passive: true });
    addEventListener('blur', this._onBlur);
    addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLock);
  }

  requestLock() {
    this.lastLockRequest = performance.now();
    if (this.locked) return;
    try {
      const p = this.element.requestPointerLock?.();
      if (p && p.catch) p.catch(() => { /* user gesture too soon after exit; ignore */ });
    } catch { /* unsupported */ }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  /** Returns and clears accumulated per-frame deltas. */
  consume() {
    const r = { dx: this.dx, dy: this.dy, wheel: this.wheel };
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.pressed.clear();
    return r;
  }

  // ----- scripted input (testing) -----
  simKey(code, isDown) {
    if (isDown) { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); }
    else this.down.delete(code);
  }
  simLook(dx, dy) { this.dx += dx; this.dy += dy; }

  dispose() {
    removeEventListener('keydown', this._onKeyDown);
    removeEventListener('keyup', this._onKeyUp);
    removeEventListener('mousedown', this._onMouseDown);
    removeEventListener('mouseup', this._onMouseUp);
    removeEventListener('mousemove', this._onMouseMove);
    removeEventListener('wheel', this._onWheel);
    removeEventListener('blur', this._onBlur);
    removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onLock);
  }
}
