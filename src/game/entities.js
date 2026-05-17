import { PLAYER_CHORD, CELL_MOTIF } from '../audio/scale.js';

// Semitone replacements for each player chord note (C4, E4, G4) chosen to
// maximise roughness against C major: C#4, Eb4, G#4.
const PROTEIN_REPLACEMENTS = [277.18, 311.13, 415.30];

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
    this.baseChord = [...PLAYER_CHORD]; // immutable reference; proteins mutate chord
    this.chord     = [...PLAYER_CHORD];
    this.rotation      = 0;
    this.rotationSpeed = Math.PI / 4; // 1 rev per 8 s
    this.vx = 0; this.vy = 0;
    this.velHistory = []; // [{vx, vy, t}] rolling 300 ms buffer for shake detection
  }

  update(dt, input, now) {
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down  ? 1 : 0) - (input.up   ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    this.vx = dx * this.speed;
    this.vy = dy * this.speed;
    this.velHistory.push({ vx: this.vx, vy: this.vy, t: now });
    this.velHistory = this.velHistory.filter(e => now - e.t < 0.3);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotationSpeed * dt;
  }

  // True when velocity direction reversed within the last 200 ms (shake gesture).
  detectShake(now) {
    const recent = this.velHistory.filter(e => now - e.t < 0.2);
    if (recent.length < 2) return false;
    const a = recent[0], b = recent[recent.length - 1];
    const ma = Math.hypot(a.vx, a.vy), mb = Math.hypot(b.vx, b.vy);
    if (ma === 0 || mb === 0) return false;
    return (a.vx * b.vx + a.vy * b.vy) < -0.3 * ma * mb;
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

export class ComplementProtein {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 12;
    this.speed  = 65; // px/s drift toward player
    this.attached    = false;
    this.attachAngle = 0;
    this.attachDist  = 0;
    // Randomly targets one of the three player chord notes.
    this.targetIndex     = Math.floor(Math.random() * 3);
    this.replacementNote = PROTEIN_REPLACEMENTS[this.targetIndex];
  }

  update(dt, player) {
    if (this.attached) {
      this.x = player.x + Math.cos(this.attachAngle) * this.attachDist;
      this.y = player.y + Math.sin(this.attachAngle) * this.attachDist;
      return;
    }
    const dx = player.x - this.x, dy = player.y - this.y;
    const d  = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * this.speed * dt;
    this.y += (dy / d) * this.speed * dt;
  }

  attach(player) {
    this.attached = true;
    const dx = this.x - player.x, dy = this.y - player.y;
    this.attachAngle = Math.atan2(dy, dx);
    this.attachDist  = Math.hypot(dx, dy);
    player.chord[this.targetIndex] = this.replacementNote;
  }

  detach(player) {
    this.attached = false;
    player.chord[this.targetIndex] = player.baseChord[this.targetIndex];
  }
}
