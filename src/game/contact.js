import { Cell, ComplementProtein } from './entities.js';

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

// Spawn a new cell at a random distance/angle from the player in world space
export function spawnCell(playerX, playerY, minDist = 200, maxDist = 380) {
  const angle = Math.random() * Math.PI * 2;
  const dist  = minDist + Math.random() * (maxDist - minDist);
  return new Cell(
    playerX + Math.cos(angle) * dist,
    playerY + Math.sin(angle) * dist,
  );
}

export function checkContactProtein(player, protein) {
  return Math.hypot(protein.x - player.x, protein.y - player.y)
    < player.radius + protein.radius;
}

export function spawnProtein(playerX, playerY) {
  const angle = Math.random() * Math.PI * 2;
  const dist  = 280 + Math.random() * 120; // 280–400 px from player
  return new ComplementProtein(
    playerX + Math.cos(angle) * dist,
    playerY + Math.sin(angle) * dist,
  );
}
