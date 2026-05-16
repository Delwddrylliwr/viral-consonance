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

// Spawn a new cell at a random position at least minDist px from the player
export function spawnCell(canvasW, canvasH, playerX, playerY, minDist = 200) {
  const margin = 80;
  let x, y;
  do {
    x = margin + Math.random() * (canvasW - margin * 2);
    y = margin + Math.random() * (canvasH - margin * 2);
  } while (Math.hypot(x - playerX, y - playerY) < minDist);
  return new Cell(x, y);
}
