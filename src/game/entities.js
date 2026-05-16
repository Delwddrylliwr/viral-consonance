import { PLAYER_CHORD, CELL_MOTIF } from '../audio/scale.js';

function angleDiff(a, b) {
  let d = ((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return d;
}

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 30;
    this.speed  = 200;           // px/sec
    this.chord  = PLAYER_CHORD;  // [C4, E4, G4]
    this.rotation      = 0;
    this.rotationSpeed = Math.PI / 4; // 1 rev per 8 s
  }

  update(dt, input) {
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down  ? 1 : 0) - (input.up   ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;
    this.rotation += this.rotationSpeed * dt;
  }

  getDots() {
    return this.chord.map((freq, i) => {
      const angle = this.rotation + (i * 2 * Math.PI / 3);
      return {
        x: this.x + Math.cos(angle) * this.radius,
        y: this.y + Math.sin(angle) * this.radius,
        freq,
        angle,
      };
    });
  }

  // Dot whose angle points most closely toward (tx, ty)
  getActiveNote(tx, ty) {
    const toward = Math.atan2(ty - this.y, tx - this.x);
    let best = null, bestDiff = Infinity;
    for (const dot of this.getDots()) {
      const diff = Math.abs(angleDiff(dot.angle, toward));
      if (diff < bestDiff) { bestDiff = diff; best = dot; }
    }
    return best.freq;
  }
}

export class Cell {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 45;
    this.motif  = CELL_MOTIF;   // [C4, E4, G4, C5]
    this.rotation      = 0;
    // 1 full rotation per 4 beats = 2.4 s at 100 BPM
    this.rotationSpeed = (2 * Math.PI) / 2.4;
    this.flashTimer = 0;
    this.active = true;
  }

  update(dt) {
    this.rotation += this.rotationSpeed * dt;
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
  }

  getDots() {
    return this.motif.map((freq, i) => {
      const angle = this.rotation + (i * Math.PI / 2);
      return {
        x: this.x + Math.cos(angle) * this.radius,
        y: this.y + Math.sin(angle) * this.radius,
        freq,
        angle,
      };
    });
  }

  // Dot currently facing the player
  getActiveNote(px, py) {
    const toward = Math.atan2(py - this.y, px - this.x);
    let best = null, bestDiff = Infinity;
    for (const dot of this.getDots()) {
      const diff = Math.abs(angleDiff(dot.angle, toward));
      if (diff < bestDiff) { bestDiff = diff; best = dot; }
    }
    return best.freq;
  }
}
