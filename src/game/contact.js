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

// Spawn a new cell at a random distance/angle from the player in world space.
// Type alternates randomly: 50 % easy, 50 % hard.
export function spawnCell(playerX, playerY, minDist = 200, maxDist = 380) {
  const angle = Math.random() * Math.PI * 2;
  const dist  = minDist + Math.random() * (maxDist - minDist);
  const type  = Math.random() < 0.5 ? 'easy' : 'hard';
  return new Cell(
    playerX + Math.cos(angle) * dist,
    playerY + Math.sin(angle) * dist,
    type,
  );
}
