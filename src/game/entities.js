import { PLAYER_CHORD } from '../audio/scale.js';

// Dissonant substitutes for player chord notes [C4, E4, G4]:
// half-step neighbours to maximise roughness when attached.
const PROTEIN_REPLACEMENTS = [277.18, 311.13, 415.30]; // C#4, Eb4, G#4

// Three cell types. Motifs chosen against the player chord [C4=261.63, E4=329.63, G4=392.00]:
//   type 0 – C major  : shares notes → lots of unisons/3rds → easy
//   type 1 – G major  : 5th/4th relationships → medium (approach angle matters)
//   type 2 – Db major : all minor-2nd relationships → hard (very specific alignment needed)
const CELL_DEFS = [
  { motif: [261.63, 329.63, 392.00, 523.25], color: '#f84', rotPeriod: 2.4 },
  { motif: [196.00, 293.66, 392.00, 587.33], color: '#5cf', rotPeriod: 2.4 },
  { motif: [277.18, 349.23, 415.30, 554.37], color: '#c47', rotPeriod: 2.4 },
];
const CELL_DRIFT = 18; // px/s gentle background drift

function angleDiff(a, b) {
  return ((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
}

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 30;
    this.speed  = 200;
    this.baseChord = [...PLAYER_CHORD];
    this.chord     = [...PLAYER_CHORD];
    this.rotation      = 0;
    this.rotationSpeed = Math.PI / 4;
    this.vx = 0; this.vy = 0;
    this.velHistory = [];
    this.knockbackX = 0;
    this.knockbackY = 0;
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

    // Knockback decays with ~120 ms half-life
    const decay = Math.pow(0.5, dt / 0.12);
    this.knockbackX *= decay;
    this.knockbackY *= decay;
    if (Math.hypot(this.knockbackX, this.knockbackY) < 1) {
      this.knockbackX = this.knockbackY = 0;
    }

    this.x += (this.vx + this.knockbackX) * dt;
    this.y += (this.vy + this.knockbackY) * dt;
    this.rotation += this.rotationSpeed * dt;
  }

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
  constructor(x, y, type = 0) {
    this.x = x;
    this.y = y;
    this.type   = type;
    this.radius = 45;
    const def = CELL_DEFS[type] ?? CELL_DEFS[0];
    this.motif  = def.motif;
    this.color  = def.color;
    this.rotation      = Math.random() * Math.PI * 2;
    this.rotationSpeed = (2 * Math.PI) / def.rotPeriod;
    this.flashTimer = 0;
    this.active = true;
    const dAngle = Math.random() * Math.PI * 2;
    this.dx = Math.cos(dAngle) * CELL_DRIFT;
    this.dy = Math.sin(dAngle) * CELL_DRIFT;
  }

  update(dt) {
    this.rotation += this.rotationSpeed * dt;
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (this.active) {
      this.x += this.dx * dt;
      this.y += this.dy * dt;
    }
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
    this.attached    = false;
    this.attachAngle = 0;
    this.attachDist  = 0;
    this.targetIndex     = Math.floor(Math.random() * 3);
    this.replacementNote = PROTEIN_REPLACEMENTS[this.targetIndex];
    // Ambient drift — no active homing toward player
    const angle = Math.random() * Math.PI * 2;
    const speed = 18 + Math.random() * 16; // 18–34 px/s
    this.dx = Math.cos(angle) * speed;
    this.dy = Math.sin(angle) * speed;
    this.steerTimer = 2 + Math.random() * 3;
  }

  update(dt, player) {
    if (this.attached) {
      this.x = player.x + Math.cos(this.attachAngle) * this.attachDist;
      this.y = player.y + Math.sin(this.attachAngle) * this.attachDist;
      return;
    }
    // Gentle random steering every few seconds
    this.steerTimer -= dt;
    if (this.steerTimer <= 0) {
      this.steerTimer = 2 + Math.random() * 3;
      const turn = (Math.random() - 0.5) * 1.2;
      const c = Math.cos(turn), s = Math.sin(turn);
      const nx = this.dx * c - this.dy * s;
      const ny = this.dx * s + this.dy * c;
      this.dx = nx; this.dy = ny;
    }
    this.x += this.dx * dt;
    this.y += this.dy * dt;
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
    // Flee immediately to prevent instant re-attachment
    const dx = this.x - player.x, dy = this.y - player.y;
    const d  = Math.hypot(dx, dy) || 1;
    const fleeR = player.radius + this.radius + 50;
    this.x = player.x + (dx / d) * fleeR;
    this.y = player.y + (dy / d) * fleeR;
    const spd = Math.hypot(this.dx, this.dy) || 25;
    this.dx = (dx / d) * spd;
    this.dy = (dy / d) * spd;
  }
}
