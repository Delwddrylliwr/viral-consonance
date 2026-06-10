import { Cell, ComplementProtein, Bacterium } from './entities.js';

export const INFECTION_THRESHOLD = 0.3;

export function checkContact(player, cell) {
  const dist = Math.hypot(cell.x - player.x, cell.y - player.y);
  return dist < player.radius + cell.radius;
}

// Push player outside the cell and add a roughness-proportional velocity impulse.
// r = 0 at threshold, up to 1 at maximum roughness → impulse 80–640 px/s.
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
  const t       = Math.max(0, (r - INFECTION_THRESHOLD) / (1 - INFECTION_THRESHOLD));
  const impulse = 80 + t * 560; // 80–640 px/s added to existing velocity
  player.vx += nx * impulse;
  player.vy += ny * impulse;
  // Clear velocity history so the impulse doesn't immediately trigger protein shake-off
  // player.velHistory = [];
}

// Weighted cell type: type 0 (easy, consonant at normal tonality) most common;
// type 2 (hard, consonant when chord is complement-shifted) rarest.
function randomCellType() {
  const r = Math.random();
  if (r < 0.55) return 0;
  if (r < 0.85) return 1;
  return 2;
}

// Spawn a new cell. Pass type 0–2 explicitly, or -1 for weighted random.
export function spawnCell(playerX, playerY, minDist = 200, maxDist = 380, type = -1) {
  const angle    = Math.random() * Math.PI * 2;
  const dist     = minDist + Math.random() * (maxDist - minDist);
  const cellType = type < 0 ? randomCellType() : type;
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

export function spawnBacterium(playerX, playerY) {
  const angle = Math.random() * Math.PI * 2;
  const dist  = 320 + Math.random() * 180; // 320–500 px from player
  return new Bacterium(
    playerX + Math.cos(angle) * dist,
    playerY + Math.sin(angle) * dist,
  );
}
