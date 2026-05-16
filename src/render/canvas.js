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
  const consonance = Math.max(0, (0.3 - roughness) / 0.3);
  if (consonance <= 0) return;

  // Direction from player to cell
  const dx = cell.x - player.x;
  const dy = cell.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return;
  const nx = dx / dist, ny = dy / dist;

  // Line from player edge to cell edge
  const x1 = player.x + nx * player.radius;
  const y1 = player.y + ny * player.radius;
  const x2 = cell.x   - nx * cell.radius;
  const y2 = cell.y   - ny * cell.radius;

  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0,   `rgba(100, 220, 255, ${consonance * 0.8})`);
  grad.addColorStop(0.5, `rgba(180, 255, 200, ${consonance})`);
  grad.addColorStop(1,   `rgba(255, 200, 100, ${consonance * 0.8})`);

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2 + consonance * 4;
  ctx.globalAlpha = consonance * 0.7;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
