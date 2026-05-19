import { hzToName } from '../audio/scale.js';

const BG = '#0d0d14';

function noteLabel(hz) {
  return hzToName(hz).replace(/\d+$/, ''); // "C4" → "C", "Db4" → "Db"
}

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
  const dots = player.getDots();

  // Body — triangle through the 3 chord-dot vertices
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#4af';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(dots[0].x, dots[0].y);
  ctx.lineTo(dots[1].x, dots[1].y);
  ctx.lineTo(dots[2].x, dots[2].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Note letters at each vertex
  for (const dot of dots) {
    const isActive = dot.freq === activeFreq;
    ctx.save();
    ctx.globalAlpha  = isActive ? 1 : 0.7;
    ctx.font         = `bold ${isActive ? 14 : 12}px sans-serif`;
    ctx.fillStyle    = isActive ? '#fff' : '#4af';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(noteLabel(dot.freq), dot.x, dot.y);
    ctx.restore();
  }
}

export function drawCell(ctx, cell, activeFreq = null) {
  const alpha = cell.flashTimer > 0
    ? 0.5 + 0.5 * (cell.flashTimer / 0.5)
    : 0.6;
  const color = cell.flashTimer > 0 ? '#fff' : cell.color;

  drawCircle(ctx, cell.x, cell.y, cell.radius, color, alpha);

  for (const dot of cell.getDots()) {
    const isActive = activeFreq !== null && dot.freq === activeFreq;
    ctx.save();
    ctx.globalAlpha  = isActive ? 1 : alpha * 0.9;
    ctx.font         = `bold ${isActive ? 14 : 12}px sans-serif`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(noteLabel(dot.freq), dot.x, dot.y);
    ctx.restore();
  }
}

// Returns the point where a ray from (cx,cy) in direction (nx,ny) exits a convex polygon.
function rayPolygonEdge(cx, cy, nx, ny, vertices) {
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const dx = a.x - cx,  dy = a.y - cy;
    const denom = nx * ey - ny * ex;
    if (Math.abs(denom) < 1e-10) continue;
    const t = (dx * ey - dy * ex) / denom;
    const u = -(dy * nx - dx * ny) / denom;
    if (t >= 0 && u >= 0 && u <= 1) return { x: cx + nx * t, y: cy + ny * t };
  }
  return { x: cx + nx * 30, y: cy + ny * 30 }; // fallback (should never trigger)
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
  const p1  = rayPolygonEdge(player.x, player.y, nx, ny, player.getDots());
  const x1  = p1.x, y1 = p1.y;
  const x2  = cell.x - nx * cell.radius;
  const y2  = cell.y - ny * cell.radius;

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

export function drawProtein(ctx, protein, player) {
  const color = protein.attached ? '#f55' : '#f93';
  drawCircle(ctx, protein.x, protein.y, protein.radius, color, 0.85);

  // Outward direction from player through protein
  const pdx  = protein.x - player.x;
  const pdy  = protein.y - player.y;
  const dist = Math.hypot(pdx, pdy) || 1;
  const nx   = pdx / dist;
  const ny   = pdy / dist;

  // Letter positions: protein.radius + 9 px inward/outward from protein center
  const offset = protein.radius + 9;
  const innerX = protein.x - nx * offset;
  const innerY = protein.y - ny * offset;
  const outerX = protein.x + nx * offset;
  const outerY = protein.y + ny * offset;

  // Connecting line between the two label positions
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(innerX, innerY);
  ctx.lineTo(outerX, outerY);
  ctx.stroke();
  ctx.restore();

  // Inner: matchingNote (player's original note being replaced) — dim white, toward player
  ctx.save();
  ctx.globalAlpha  = 0.7;
  ctx.font         = 'bold 11px sans-serif';
  ctx.fillStyle    = '#ddd';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(noteLabel(protein.matchingNote), innerX, innerY);
  ctx.restore();

  // Outer: replacementNote (the dissonant substitute) — protein color, facing outward
  ctx.save();
  ctx.globalAlpha  = 0.95;
  ctx.font         = 'bold 12px sans-serif';
  ctx.fillStyle    = color;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(noteLabel(protein.replacementNote), outerX, outerY);
  ctx.restore();
}

export function drawClone(ctx, clone) {
  ctx.save();
  ctx.globalAlpha = clone.alpha * 0.35;
  ctx.strokeStyle = '#8af';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = clone.angle + i * (Math.PI * 2 / 3);
    const x = clone.x + Math.cos(a) * clone.radius;
    const y = clone.y + Math.sin(a) * clone.radius;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
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

// Brief bright line connecting two active note letters on consonant infection
export function drawLetterBond(ctx, bond) {
  if (bond.timer <= 0) return;
  const alpha = bond.timer / 0.3;
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = '#afffcc';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.moveTo(bond.playerDot.x, bond.playerDot.y);
  ctx.lineTo(bond.cellDot.x,   bond.cellDot.y);
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = '#fff';
  ctx.beginPath();
  ctx.arc(bond.playerDot.x, bond.playerDot.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bond.cellDot.x, bond.cellDot.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Amorphous blob body with ghost triangles of ingested clones inside
export function drawMacrophage(ctx, m, time) {
  ctx.save();
  ctx.translate(m.x, m.y);

  const N = m.spokeOffsets.length;
  const pts = m.spokeOffsets.map((off, i) => {
    const a = (i / N) * Math.PI * 2;
    const r = m.radius + off + Math.sin(time * 0.6 + i * 0.8) * 5;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const curr = pts[i], next = pts[(i + 1) % N];
    const mx = (curr.x + next.x) / 2, my = (curr.y + next.y) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(curr.x, curr.y, mx, my);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(107, 142, 35, 0.55)';
  ctx.fill();
  ctx.strokeStyle = '#9acd32';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ghost triangles of ingested clones
  for (const c of m.capturedClones) {
    ctx.save();
    ctx.translate(c.rx, c.ry);
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      else ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6);
    }
    ctx.closePath();
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// Slowly rotating square — 4-note motif at corners, visible when matchable (player fully loaded with proteins)
export function drawTCell(ctx, tc, matchable = false) {
  ctx.save();
  ctx.translate(tc.x, tc.y);
  ctx.rotate(tc.angle);
  const s = tc.radius;
  ctx.beginPath();
  ctx.rect(-s, -s, s * 2, s * 2);
  ctx.strokeStyle = matchable ? 'rgba(180, 80, 255, 0.9)' : 'rgba(32, 178, 170, 0.8)';
  ctx.lineWidth = matchable ? 3 : 2.5;
  ctx.stroke();
  ctx.fillStyle = matchable ? 'rgba(180, 80, 255, 0.18)' : 'rgba(32, 178, 170, 0.12)';
  ctx.fill();
  ctx.restore();

  // Motif notes at the 4 corners (always faint; bold when matchable)
  const dots = tc.getDots();
  for (const dot of dots) {
    ctx.save();
    ctx.globalAlpha  = matchable ? 0.9 : 0.25;
    ctx.font         = `bold ${matchable ? 13 : 11}px sans-serif`;
    ctx.fillStyle    = matchable ? '#e0aaff' : '#20b2aa';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(noteLabel(dot.freq), dot.x, dot.y);
    ctx.restore();
  }
}

// Octagon B-cell that launches antibodies; flees off-screen
export function drawBCell(ctx, bc, activeFreq = null) {
  const alpha = bc.flashTimer > 0 ? 0.5 + 0.5 * (bc.flashTimer / 0.5) : 0.6;
  const color = bc.flashTimer > 0 ? '#fff' : bc.color;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = bc.rotation + i * (Math.PI / 4);
    const x = bc.x + Math.cos(a) * bc.radius;
    const y = bc.y + Math.sin(a) * bc.radius;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.08;
  ctx.fill();
  ctx.restore();

  for (const dot of bc.getDots()) {
    const isActive = activeFreq !== null && dot.freq === activeFreq;
    ctx.save();
    ctx.globalAlpha  = isActive ? 1 : alpha * 0.85;
    ctx.font         = `bold ${isActive ? 13 : 11}px sans-serif`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(noteLabel(dot.freq), dot.x, dot.y);
    ctx.restore();
  }
}

// Diamond-shaped seeking missile — tip points in direction of travel
export function drawAntibody(ctx, ab) {
  ctx.save();
  ctx.translate(ab.x, ab.y);
  const spd = Math.hypot(ab.vx, ab.vy);
  if (spd > 0.1) ctx.rotate(Math.atan2(ab.vy, ab.vx) + Math.PI / 2);
  const r = ab.radius;
  const len = r * 2.5; // elongated long axis
  ctx.beginPath();
  ctx.moveTo(0, -len);
  ctx.lineTo(r, 0);
  ctx.lineTo(0,  len);
  ctx.lineTo(-r, 0);
  ctx.closePath();
  ctx.fillStyle   = 'rgba(220, 80, 80, 0.7)';
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();

  // Front tip (toward player): matching note — dim white
  ctx.save();
  ctx.globalAlpha  = 0.7;
  ctx.font         = 'bold 11px sans-serif';
  ctx.fillStyle    = '#ddd';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(noteLabel(ab.matchingNote), 0, -(len + 9));
  ctx.restore();

  // Back tip (tail): replacement note — red
  ctx.save();
  ctx.globalAlpha  = 0.95;
  ctx.font         = 'bold 12px sans-serif';
  ctx.fillStyle    = '#ff4444';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(noteLabel(ab.replacementNote), 0, len + 9);
  ctx.restore();

  ctx.restore();
}

// Jittering star; glowing countdown arc when attached to a clone
export function drawNeutrophil(ctx, n) {
  ctx.save();
  ctx.translate(n.x, n.y);

  // Fuse countdown arc (unrotated, drawn before star rotation)
  if (n.attached && n.fuseBeats > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, n.radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (n.fuseBeats / 4), false);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.rotate(n.jitterAngle);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a  = (i / 16) * Math.PI * 2 - Math.PI / 8;
    const rr = i % 2 === 0 ? n.radius : n.radius * 0.45;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle   = 'rgba(255, 220, 50, 0.65)';
  ctx.strokeStyle = '#ffdd22';
  ctx.lineWidth   = 1.5;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}
