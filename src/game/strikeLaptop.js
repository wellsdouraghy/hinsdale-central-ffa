// Airstrike targeting laptop (client): key 4 with an Airstrike reward flips the laptop open (weapon lowered, no
// shooting, walk speed). A north-up tactical map of the campus is drawn over the laptop screen; the reticle follows the
// mouse (pointer lock stays on), the wheel or A / D rotates the run, LMB confirms, RMB / Esc / 4 cancels (reward kept).
import { createTargetingLaptop } from '../visuals/airstrike.js';
import { SAT, loadSatellite, drawArrow, drawCrate, MAP_ALLY } from '../ui/minimap.js';
import { STRIKE } from './streaks.js';

const BAKE_PPM = 1.8;          // satellite cache resolution (px per meter)
const GRID = 50;               // grid cell (m)
const MARGIN = 12;             // map margin around the play area (m)
const ROTATE_SPEED = 1.9;      // rad/s with A / D
const WHEEL_STEP = Math.PI / 12;
const CORRIDOR_W = 2 * (STRIKE.lateral * 0.3 + 1 + STRIKE.radius * 0.6);
const SHOW_AFTER = 0.22;       // map appears once the lid is mostly open (s)

export class StrikeLaptop {
  constructor(game) {
    this.game = game;
    this.vis = createTargetingLaptop();
    game.overlayScene.add(this.vis.object3D);
    this.el = document.getElementById('strike-ui');
    this.canvas = document.getElementById('strike-map');
    this.ctx = this.canvas.getContext('2d');
    this.open = false;
    this.openedAt = 0;
    this.target = { x: 0, z: 0 };
    this.h = 0;
    this.baked = null;
    this.layout = null;
    const b = game.world.playBounds || { minX: SAT.minX, maxX: SAT.maxX, minZ: SAT.minZ, maxZ: SAT.maxZ };
    this.area = { minX: b.minX - MARGIN, maxX: b.maxX + MARGIN, minZ: b.minZ - MARGIN, maxZ: b.maxZ + MARGIN };
    this.bounds = b;
    loadSatellite().then((img) => { if (img) this._bake(img); });
  }

  /** Crops + tints the satellite image to the play area once. */
  _bake(img) {
    const a = this.area;
    const c = document.createElement('canvas');
    c.width = Math.round((a.maxX - a.minX) * BAKE_PPM);
    c.height = Math.round((a.maxZ - a.minZ) * BAKE_PPM);
    const g = c.getContext('2d');
    const sx = img.width / (SAT.maxX - SAT.minX), sz = img.height / (SAT.maxZ - SAT.minZ);
    g.filter = 'saturate(0.55) brightness(0.78) contrast(1.12)';
    g.drawImage(img, (a.minX - SAT.minX) * sx, (a.minZ - SAT.minZ) * sz, (a.maxX - a.minX) * sx, (a.maxZ - a.minZ) * sz, 0, 0, c.width, c.height);
    g.filter = 'none';
    g.fillStyle = 'rgba(20, 60, 35, 0.18)';
    g.fillRect(0, 0, c.width, c.height);
    this.baked = c;
  }

  get active() { return this.open; }
  /** Laptop on screen (opening, open or closing): the weapon stays lowered. */
  get shown() { return this.vis.object3D.visible; }

  openAt(t) {
    if (this.open) return;
    const g = this.game, p = g.player;
    this.open = true;
    this.openedAt = t;
    this.h = -p.yaw;   // fly the run the way we are facing
    // Start the reticle ~60 m ahead of us.
    this._setTarget(p.position.x - Math.sin(p.yaw) * 60, p.position.z - Math.cos(p.yaw) * 60);
    this.vis.open();
    g.audio.ui?.();
    g.adsToggled = false;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.vis.close();
    this.el.classList.add('hidden');
  }

  _setTarget(x, z) {
    const b = this.bounds;
    this.target.x = Math.max(b.minX, Math.min(b.maxX, x));
    this.target.z = Math.max(b.minZ, Math.min(b.maxZ, z));
  }

  /** Per-frame input while open. Returns nothing; confirm sends the strike to the host. */
  input(t, { dx, dy, wheel, pressed, key }) {
    if (!this.open || t === this.openedAt) return;
    const g = this.game;
    if (pressed.has('Mouse2') || pressed.has('AimToggle') || pressed.has('Escape') || pressed.has('Digit4')) {
      this.close();
      g.audio.ui?.();
      return;
    }
    const L = this.layout;
    const mpp = L ? 1 / L.scale : 0.5;                 // meters per CSS pixel of the map
    const sens = 0.9 * (g.settings.sensitivity ?? 1);
    this._setTarget(this.target.x + dx * mpp * sens, this.target.z + dy * mpp * sens);
    let rot = 0;
    if (key('KeyD')) rot += 1;
    if (key('KeyA')) rot -= 1;
    this.h += rot * ROTATE_SPEED * (this._dt || 1 / 60);
    if (wheel) this.h += Math.sign(wheel) * WHEEL_STEP;
    this.h = ((this.h % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (pressed.has('Mouse0') && t - this.openedAt > SHOW_AFTER) {
      g.session.send({ t: 'strike', x: Math.round(this.target.x * 100) / 100, z: Math.round(this.target.z * 100) / 100, h: Math.round(this.h * 1000) / 1000 });
      g.audio.beep?.();
      this.close();
    }
  }

  update(dt, t) {
    this._dt = dt;
    this.vis.update(dt);
    if (!this.open) return;
    const ready = this.vis.isOpen() || t - this.openedAt > SHOW_AFTER;
    if (!ready) return;
    this.el.classList.remove('hidden');
    this._place();
    this._draw(t);
  }

  /** Aligns the HTML map with the laptop screen (screenRect is in NDC). */
  _place() {
    const r = this.vis.screenRect(this.game.overlayCamera);
    const W = window.innerWidth, H = window.innerHeight;
    const left = ((r.x0 + 1) / 2) * W, right = ((r.x1 + 1) / 2) * W;
    const top = ((1 - r.y1) / 2) * H, bottom = ((1 - r.y0) / 2) * H;
    const w = Math.max(80, right - left), h = Math.max(60, bottom - top);
    const s = this.el.style;
    s.left = left + 'px'; s.top = top + 'px'; s.width = w + 'px'; s.height = h + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    // Fit the map (keep its aspect) inside the screen, leaving room for the header / footer strips.
    const a = this.area;
    const head = 22, foot = 20, pad = 6;
    const aw = w - pad * 2, ah = h - head - foot - pad;
    const scale = Math.min(aw / (a.maxX - a.minX), ah / (a.maxZ - a.minZ));
    const mw = (a.maxX - a.minX) * scale, mh = (a.maxZ - a.minZ) * scale;
    this.layout = { w, h, dpr, scale, ox: (w - mw) / 2, oy: head + (ah - mh) / 2, mw, mh, head, foot };
  }

  _toMap(x, z) {
    const L = this.layout, a = this.area;
    return [L.ox + (x - a.minX) * L.scale, L.oy + (z - a.minZ) * L.scale];
  }

  _gridRef(x, z) {
    const a = this.area;
    const col = Math.floor((x - a.minX) / GRID), row = Math.floor((z - a.minZ) / GRID);
    return String.fromCharCode(65 + Math.max(0, col)) + (Math.max(0, row) + 1);
  }

  _draw(t) {
    const g = this.game, L = this.layout, c = this.ctx, a = this.area;
    const fade = Math.min(1, (t - this.openedAt - SHOW_AFTER + 0.12) / 0.15);
    c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = '#07110b';
    c.fillRect(0, 0, L.w, L.h);
    c.globalAlpha = Math.max(0, fade);
    // Satellite.
    c.save();
    c.beginPath(); c.rect(L.ox, L.oy, L.mw, L.mh); c.clip();
    if (this.baked) c.drawImage(this.baked, L.ox, L.oy, L.mw, L.mh);
    // Grid + labels.
    c.strokeStyle = 'rgba(140, 255, 170, 0.22)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = a.minX + GRID; x < a.maxX; x += GRID) { const [px] = this._toMap(x, 0); c.moveTo(px, L.oy); c.lineTo(px, L.oy + L.mh); }
    for (let z = a.minZ + GRID; z < a.maxZ; z += GRID) { const [, py] = this._toMap(0, z); c.moveTo(L.ox, py); c.lineTo(L.ox + L.mw, py); }
    c.stroke();
    c.fillStyle = 'rgba(170, 255, 190, 0.75)';
    c.font = '600 9px ui-monospace, Menlo, monospace';
    c.textAlign = 'left'; c.textBaseline = 'top';
    for (let i = 0, x = a.minX; x < a.maxX; i++, x += GRID) { const [px] = this._toMap(x, 0); c.fillText(String.fromCharCode(65 + i), px + 3, L.oy + 2); }
    for (let i = 0, z = a.minZ; z < a.maxZ; i++, z += GRID) { const [, py] = this._toMap(0, z); if (i) c.fillText(String(i + 1), L.ox + 3, py + 2); }
    // Play-area boundary.
    const b = this.bounds;
    const [bx0, bz0] = this._toMap(b.minX, b.minZ), [bx1, bz1] = this._toMap(b.maxX, b.maxZ);
    c.setLineDash([5, 4]);
    c.strokeStyle = 'rgba(255, 90, 90, 0.7)';
    c.strokeRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
    c.setLineDash([]);

    // Strike corridor + flight line through the reticle.
    const [tx, tz] = this._toMap(this.target.x, this.target.z);
    const ang = Math.atan2(-Math.cos(this.h), Math.sin(this.h));   // canvas angle of the flight direction
    c.save();
    c.translate(tx, tz);
    c.rotate(ang);
    const len = STRIKE.length * L.scale, wid = CORRIDOR_W * L.scale;
    c.setLineDash([7, 6]);
    c.strokeStyle = 'rgba(255, 200, 120, 0.55)';
    c.beginPath(); c.moveTo(-2000, 0); c.lineTo(2000, 0); c.stroke();
    c.setLineDash([]);
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    c.fillStyle = `rgba(255, 60, 40, ${0.22 + 0.12 * pulse})`;
    c.strokeStyle = 'rgba(255, 90, 60, 0.95)';
    c.lineWidth = 1.5;
    c.fillRect(-len / 2, -wid / 2, len, wid);
    c.strokeRect(-len / 2, -wid / 2, len, wid);
    // Direction chevrons (the jets come from the left of this frame).
    c.fillStyle = 'rgba(255, 220, 160, 0.95)';
    for (const off of [-len / 2 - 26, len / 2 + 14]) {
      c.beginPath(); c.moveTo(off + 10, 0); c.lineTo(off, -6); c.lineTo(off + 3, 0); c.lineTo(off, 6); c.closePath(); c.fill();
    }
    c.restore();

    // Players / flags (the same things our minimap shows).
    const blips = g.laptopBlips(t);
    for (const bl of blips) {
      const [px, py] = this._toMap(bl.x, bl.z);
      c.globalAlpha = Math.max(0, fade) * (bl.alpha ?? 1);
      if (bl.shape === 'crate') drawCrate(c, px, py, 5, bl.color);
      else if (bl.shape === 'arrow') drawArrow(c, px, py, Math.atan2(-Math.cos(bl.yaw || 0), -Math.sin(bl.yaw || 0)), 5, bl.color);
      else if (bl.shape === 'flag') {
        c.fillStyle = bl.color; c.strokeStyle = '#000'; c.lineWidth = 1;
        c.fillRect(px - 1, py - 9, 2, 12);
        c.beginPath(); c.moveTo(px + 1, py - 9); c.lineTo(px + 10, py - 6); c.lineTo(px + 1, py - 3); c.closePath(); c.fill(); c.stroke();
      } else {
        c.fillStyle = bl.color; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 1;
        c.beginPath(); c.arc(px, py, bl.shape === 'heli' ? 5 : Math.min(5, bl.size || 4), 0, Math.PI * 2); c.fill(); c.stroke();
      }
    }
    c.globalAlpha = Math.max(0, fade);
    // Us.
    const p = g.player;
    const [mx, mz] = this._toMap(p.position.x, p.position.z);
    drawArrow(c, mx, mz, Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw)), 6, '#ffd76a');

    // Reticle.
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(tx, tz, 9, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(tx - 18, tz); c.lineTo(tx - 5, tz); c.moveTo(tx + 5, tz); c.lineTo(tx + 18, tz);
    c.moveTo(tx, tz - 18); c.lineTo(tx, tz - 5); c.moveTo(tx, tz + 5); c.lineTo(tx, tz + 18);
    c.stroke();
    c.restore();

    // Header / footer strips.
    c.globalAlpha = Math.max(0, fade);
    c.fillStyle = 'rgba(8, 22, 14, 0.92)';
    c.fillRect(0, 0, L.w, L.head);
    c.fillRect(0, L.h - L.foot, L.w, L.foot);
    c.fillStyle = '#9dffb8';
    c.font = '700 11px ui-monospace, Menlo, monospace';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText('STRIKE TARGETING', 8, L.head / 2);
    c.textAlign = 'right';
    const hdg = String(Math.round((this.h * 180) / Math.PI) % 360).padStart(3, '0');
    c.fillText(`GRID ${this._gridRef(this.target.x, this.target.z)}  HDG ${hdg}°`, L.w - 8, L.head / 2);
    c.font = '600 10px ui-monospace, Menlo, monospace';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(200, 255, 215, 0.85)';
    c.fillText('LMB confirm  ·  Wheel / A D rotate  ·  RMB cancel', L.w / 2, L.h - L.foot / 2);
    c.fillStyle = MAP_ALLY;
    c.globalAlpha = 1;
  }

  dispose() {
    this.close();
    this.game.overlayScene.remove(this.vis.object3D);
    this.vis.dispose?.();
    this.el.classList.add('hidden');
  }
}
