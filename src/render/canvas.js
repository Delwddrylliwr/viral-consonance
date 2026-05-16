const BG = '#0d0d14';

export function initCanvas() {
  const canvas = document.getElementById('game');
  const resize = () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);
  return canvas;
}

export function clear(ctx) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function drawCircle(ctx, x, y, r, color, alpha = 1, fill = false) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPlayer(ctx, player, activeFreq) {
  // Body
  drawCircle(ctx, player.x, player.y, player.radius, '#4af', 0.7);

  // Dots
  for (const dot of player.getDots()) {
    const isActive = dot.freq === activeFreq;
    ctx.save();
    ctx.globalAlpha = isActive ? 1 : 0.45;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, isActive ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? '#fff' : '#4af';
    ctx.fill();
    ctx.restore();
  }
}

export function drawCell(ctx, cell) {
  const alpha = cell.flashTimer > 0
    ? 0.5 + 0.5 * (cell.flashTimer / 0.5)
    : 0.6;
  const color = cell.flashTimer > 0 ? '#fff' : '#f84';

  drawCircle(ctx, cell.x, cell.y, cell.radius, color, alpha);

  for (const dot of cell.getDots()) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
}

export function drawGlow(ctx, player, cell, roughness) {
  // Show glow for any rough value below 0.6; green = consonant, amber = dissonant-but-close
  const proximity = Math.max(0, (0.6 - roughness) / 0.6);
  if (proximity <= 0) return;

  const dx = cell.x - player.x;
  const dy = cell.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return;

  // Only draw if the circles are reasonably close
  const gap = dist - player.radius - cell.radius;
  if (gap > 250) return;

  const nx = dx / dist, ny = dy / dist;
  const x1 = player.x + nx * player.radius;
  const y1 = player.y + ny * player.radius;
  const x2 = cell.x   - nx * cell.radius;
  const y2 = cell.y   - ny * cell.radius;

  // Colour shifts green as roughness drops below threshold
  const consonance = Math.max(0, (0.3 - roughness) / 0.3);
  const r = Math.round(100 + (1 - consonance) * 155);
  const g = Math.round(80  + consonance       * 175);
  const b = Math.round(50  + consonance       * 100);

  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0,   `rgba(${r},${g},${b}, ${proximity * 0.6})`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b}, ${proximity})`);
  grad.addColorStop(1,   `rgba(${r},${g},${b}, ${proximity * 0.6})`);

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 1.5 + consonance * 5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// Brief full-screen flash on infection
export function drawInfectionFlash(ctx, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle   = '#aaffcc';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
