// In-game finisher capture (dev). In a practice match (?autostart=practice&debug=1&mute=1) run in the console:
//   const { ft, wallSpot } = await import('/dev/finTest.js');
//   await ft('slam', [0.4, 1.0, 1.5, 2.3], 'g_slam.jpg')                    // we melee dummy 0 with the scene forced
//   await ft(id, times, name, { act: (dummy) => ... })                         // custom trigger (victim / bystander views)
// Frames of the real game view at those scene times are stitched into one strip and POSTed to the local shot receiver
// (port 5199).
export async function ft(id, times, name, o = {}) {
  const G = window.__game, g = G.game, R = G.renderer, gl = R.getContext();
  const list = [...g.remotes.values()].filter((r) => r.alive), r = list[o.n || 0];
  if (!r) return 'no dummy';
  const p = G.player, ang = o.ang ?? 0, d = o.d ?? 1.6, V3 = p.position.constructor;
  if (!o.stay) { p.teleport(new V3(r.feet.x + Math.sin(ang) * d, r.feet.y + 0.05, r.feet.z + Math.cos(ang) * d), ang); p.pitch = 0; }
  await new Promise((res) => setTimeout(res, 400));
  window.__finisher = id;
  const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight, W = o.w || 480, H = Math.round(W * ch / cw);
  const out = document.createElement('canvas'); out.width = W * times.length; out.height = H; const c = out.getContext('2d');
  const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch; const tc = tmp.getContext('2d'), buf = new Uint8Array(cw * ch * 4);
  let s = null, done, sid = null; const fin = new Promise((res) => { done = res; }), orig = R.render.bind(R), errs = [];
  R.render = (sc, cam) => {
    orig(sc, cam);
    try {
      if (R.getRenderTarget() !== null) return;
      s = s || g.fin.scenes.find((x) => x.attacker === g.localId || x.victim === g.localId) || (o.any && g.fin.scenes[0]);
      if (!s) return;
      sid = s.f.id;
      const lt = performance.now() / 1000 - s.t0; let j = -1;
      for (let k = 0; k < times.length; k++) if (lt >= times[k]) j = k;
      if (j >= 0 && lt - times[j] < 0.06) {
        gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        tc.putImageData(new ImageData(new Uint8ClampedArray(buf.buffer.slice(0)), cw, ch), 0, 0);
        c.save(); c.translate(j * W, H); c.scale(1, -1); c.drawImage(tmp, 0, 0, W, H); c.restore();
        c.fillStyle = '#000a'; c.fillRect(j * W, 0, 150, 18); c.fillStyle = '#fff'; c.font = '12px system-ui'; c.fillText(`${sid} ${times[j].toFixed(2)} (${lt.toFixed(2)})`, j * W + 4, 13);
      }
      if (lt > times[times.length - 1] + 0.1) done();
    } catch (e) { errs.push(e.message); done(); }
  };
  if (!o.act) g._melee(performance.now() / 1000); else await o.act(r);
  await Promise.race([fin, new Promise((res) => setTimeout(res, 6000))]); R.render = orig;
  const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.85));
  await fetch('http://127.0.0.1:5199/save?name=' + name, { method: 'POST', body: blob });
  return { errs, sid, scenes: g.fin.scenes.length, alive: g.alive, flow: g.deathFlow?.phase, pos: p.position.toArray().map((x) => +x.toFixed(2)) };
}
// Nearest broad wall around the player: { point, normal } or null.
export function wallSpot() {
  const G = window.__game, g = G.game, p = G.player, V3 = p.position.constructor;
  let best = null; const o = new V3(p.position.x, p.position.y + 1.2, p.position.z);
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2, d = new V3(Math.sin(a), 0, Math.cos(a)), h = g.hitscan.castWorld(o, d, 120);
    if (!h || Math.abs(h.normal.y) > 0.2) continue;
    const side = new V3(d.z, 0, -d.x), h2 = g.hitscan.castWorld(o.clone().addScaledVector(side, 1.5), d, 120), h3 = g.hitscan.castWorld(o.clone().addScaledVector(side, -1.5).setY(o.y + 1.5), d, 120);
    if (h2 && h3 && Math.abs(h2.distance - h.distance) < 0.6 && Math.abs(h3.distance - h.distance) < 0.6 && (!best || h.distance < best.distance)) best = h;
  }
  return best && { point: best.point, normal: best.normal.clone().setY(0).normalize() };
}
// We stand `gap` m in front of the nearest wall (back to it) and dummy 0 finishes us from the open side.
export async function wallVictim(name, times = [0.3, 0.8, 1.3, 1.8, 2.4, 2.75], gap = 1.0, id) {
  const G = window.__game, g = G.game, au = g.session.authority, p = G.player, V3 = p.position.constructor, w = wallSpot();
  if (!w || !g.alive) return 'no wall / dead';
  const n = w.normal, me = w.point.clone().addScaledVector(n, gap); me.y = p.position.y;
  return ft(id, times, name, { stay: 1, act: async (r) => {
    p.teleport(new V3(me.x, me.y + 0.05, me.z), Math.atan2(-n.x, -n.z)); await new Promise((res) => setTimeout(res, 300));
    const d = au.players.get(r.id); d.pos = [me.x + n.x * 1.6, p.position.y, me.z + n.z * 1.6];
    au.applyDamage(d, au.players.get(g.localId), 999, false, 'melee');
  } });
}
