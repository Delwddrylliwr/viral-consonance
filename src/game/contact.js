import { Cell, ComplementProtein } from './entities.js';

export const INFECTION_THRESHOLD = 0.3;

export function checkContact(player, cell) {
  const dist = Math.hypot(cell.x - player.x, cell.y - player.y);
  return dist < player.radius + cell.radius;
}

// Push player outside the cell and apply roughness-proportional knockback velocity.
// r = 0 at threshold, up to 1 at maximum roughness → knockback 60–400 px/s.
export function bouncePlayer(player, cell, r = 0.5) {
  const dx   = player.x - cell.x;
  const dy   = player.y - cell.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx   = dx / dist, ny = dy / dist;
  const overlap = player.radius + cell.radius - dist;
  if (overlap > 0) {
    player.x += nx * (overlap + 2);
    player.y += ny * (overlap + 2);
  }
  const t     = Math.max(0, (r - INFECTION_THRESHOLD) / (1 - INFECTION_THRESHOLD));
  const speed = 60 + t * 340;
  player.knockbackX = nx * speed;
  player.knockbackY = ny * speed;
}

// Spawn a new cell. Pass type 0–2 explicitly, or -1 for random.
export function spawnCell(playerX, playerY, minDist = 200, maxDist = 380, type = -1) {
  const angle    = Math.random() * Math.PI * 2;
  const dist     = minDist + Math.random() * (maxDist - minDist);
  const cellType = type < 0 ? Math.floor(Math.random() * 3) : type;
  return new Cell(
    playerX + Math.cos(angle) * dist,
    playerY + Math.sin(angle) * dist,
    cellType,
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
