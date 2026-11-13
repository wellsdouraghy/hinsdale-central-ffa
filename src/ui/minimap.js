// Rotating minimap drawn from the satellite image (player-centered, heading up).
const SAT = { url: './assets/satellite/campus_z19.jpg', minX: -394.85, maxX: 394.85, minZ: -305.44, maxZ: 305.44 };
const VIEW_METERS = 170;   // canvas width in meters
const BAKE_PPM = 2.2;      // pixels per meter of the downscaled image cache

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const scale = W / VIEW_METERS;
  let baked = null;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = Math.round((SAT.maxX - SAT.minX) * BAKE_PPM);
    c.height = Math.round((SAT.maxZ - SAT.minZ) * BAKE_PPM);
    const g = c.getContext('2d');
    g.filter = 'saturate(0.7) brightness(0.85)';
    g.drawImage(img, 0, 0, c.width, c.height);
    baked = c;
  };
  img.src = SAT.url;

  /**
   * me: {x, z, yaw, alive}; blips: [{x, z, color, alpha, size}]; bounds: playBounds
   */
  function draw(me, blips, bounds) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#15181c';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(me.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-me.x, -me.z);
    if (baked) ctx.drawImage(baked, SAT.minX, SAT.minZ, SAT.maxX - SAT.minX, SAT.maxZ - SAT.minZ);
    if (bounds) {
      ctx.strokeStyle = 'rgba(255,80,80,0.75)';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    }
    ctx.restore();

    // Blips (constant pixel size).
    const c = Math.cos(me.yaw), s = Math.sin(me.yaw);
    for (const b of blips) {
      const dx = b.x - me.x, dz = b.z - me.z;
      let px = (dx * c - dz * s) * scale, py = (dx * s + dz * c) * scale;
      const r = W / 2 - 6;
      const len = Math.hypot(px, py);
      if (len > r && b.edge) {
        // Edge wedge pointing toward an off-map shooter.
        const ux = px / len, uy = py / len;
        const ex = W / 2 + ux * (W / 2 - 3), ey = H / 2 + uy * (H / 2 - 3);
        ctx.globalAlpha = b.alpha ?? 1;
        ctx.fillStyle = b.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ux * 12 - uy * 7, ey - uy * 12 + ux * 7);
        ctx.lineTo(ex - ux * 12 + uy * 7, ey - uy * 12 - ux * 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        continue;
      }
      if (len > r) { px *= r / len; py *= r / len; }
      ctx.globalAlpha = b.alpha ?? 1;
      ctx.fillStyle = b.color;
      if (b.shape === 'flag') {
        const fx = W / 2 + px, fy = H / 2 + py;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.fillRect(fx - 1, fy - 9, 2, 12);
        ctx.beginPath();
        ctx.moveTo(fx + 1, fy - 9); ctx.lineTo(fx + 10, fy - 6); ctx.lineTo(fx + 1, fy - 3); ctx.closePath();
        ctx.fill();
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.arc(W / 2 + px, H / 2 + py, b.size || 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // North marker on the edge.
    const nr = W / 2 - 11;
    ctx.font = '700 11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(W / 2 + s * nr, H / 2 - c * nr, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('N', W / 2 + s * nr, H / 2 - c * nr + 0.5);

    // View cone + player arrow.
    const cx = W / 2, cy = H / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 70, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = me.alive ? '#ffd76a' : '#888';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 6, cy + 6);
    ctx.lineTo(cx, cy + 3);
    ctx.lineTo(cx - 6, cy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  return { draw };
}
