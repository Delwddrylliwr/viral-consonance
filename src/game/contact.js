import { Cell } from './entities.js';

export const INFECTION_THRESHOLD = 0.3;

export function checkContact(player, cell) {
  const dist = Math.hypot(cell.x - player.x, cell.y - player.y);
  return dist < player.radius + cell.radius;
}

// Push player cleanly outside the cell's boundary
export function bouncePlayer(player, cell) {
  const dx    = player.x - cell.x;
  const dy    = player.y - cell.y;
  const dist  = Math.hypot(dx, dy) || 1;
  const push  = player.radius + cell.radius - dist + 4;
  player.x += (dx / dist) * push;
  player.y += (dy / dist) * push;
}

// Weighted random cell type. First cell is always 'easy' (see main.js).
// Weights: easy 25 %, medium 35 %, hard 30 %, resistant 10 %.
function randomType() {
  const r = Math.random();
  if (r < 0.25) return 'easy';
  if (r < 0.60) return 'medium';
  if (r < 0.90) return 'hard';
  return 'resistant';
}

export function spawnCell(playerX, playerY, minDist = 200, maxDist = 380) {
  const angle = Math.random() * Math.PI * 2;
  const dist  = minDist + Math.random() * (maxDist - minDist);
  return new Cell(
    playerX + Math.cos(angle) * dist,
    playerY + Math.sin(angle) * dist,
    randomType(),
  );
}
