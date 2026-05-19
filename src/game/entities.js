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
    this.accel  = 700;  // px/s² — snappy acceleration
    this.drag   = 3.5;  // exponential decay rate; terminal speed ≈ 200 px/s under input
    this.baseChord = [...PLAYER_CHORD];
    this.chord     = [...PLAYER_CHORD];
    this.rotation      = 0;
    this.rotationSpeed = Math.PI / 4;
    this.vx = 0; this.vy = 0;
    this.velHistory = [];
  }

  update(dt, input, now) {
    const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const ay = (input.down  ? 1 : 0) - (input.up   ? 1 : 0);
    const len = Math.hypot(ax, ay);
    if (len > 0) {
      this.vx += (ax / len) * this.accel * dt;
      this.vy += (ay / len) * this.accel * dt;
    }
    // Exponential drag — natural terminal velocity without a hard clamp.
    // Bounce impulses from contact.js overshoot this and decay naturally.
    const dragFactor = Math.exp(-this.drag * dt);
    this.vx *= dragFactor;
    this.vy *= dragFactor;
    this.velHistory.push({ vx: this.vx, vy: this.vy, t: now });
    this.velHistory = this.velHistory.filter(e => now - e.t < 0.45);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotationSpeed * dt;
  }

  detectShake(now) {
    const recent = this.velHistory.filter(e => now - e.t < 0.4);
    if (recent.length < 2) return false;
    const a = recent[0], b = recent[recent.length - 1];
    const ma = Math.hypot(a.vx, a.vy), mb = Math.hypot(b.vx, b.vy);
    if (ma < 50 || mb < 50) return false;
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
    this.matchingNote    = PLAYER_CHORD[this.targetIndex];
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
    const toX = player.x - this.x, toY = player.y - this.y;
    const d   = Math.hypot(toX, toY) || 1;
    if (d < 160) {
      // Within proximity: home toward player at moderate speed
      this.x += (toX / d) * 55 * dt;
      this.y += (toY / d) * 55 * dt;
    } else {
      // Passive drift with gentle periodic steering
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
    const fleeR = 220; // push past proximity-attraction radius (160 px)
    this.x = player.x + (dx / d) * fleeR;
    this.y = player.y + (dy / d) * fleeR;
    const spd = Math.hypot(this.dx, this.dy) || 25;
    this.dx = (dx / d) * spd;
    this.dy = (dy / d) * spd;
  }
}

const CLONE_LIFETIME_S = 20;

export class Clone {
  constructor(x, y, chord) {
    this.x = x; this.y = y;
    this.radius = 18;
    this.chord = chord.slice();
    this.detuning = (Math.random() - 0.5) * 0.005786; // ±5 cents
    this.lifetime = CLONE_LIFETIME_S;
    this.angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 20;
    const dir = Math.random() * Math.PI * 2;
    this.vx = Math.cos(dir) * speed;
    this.vy = Math.sin(dir) * speed;
    this.steerTimer = 3 + Math.random() * 3;
    this.roughness = 0; // pre-computed each frame in main.js
  }

  get alive() { return this.lifetime > 0; }

  // Fades out in the last 5 s of life
  get alpha() { return Math.min(1, this.lifetime / 5); }

  update(dt) {
    this.lifetime -= dt;
    this.angle += 0.4 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.steerTimer -= dt;
    if (this.steerTimer <= 0) {
      const dir = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 20;
      this.vx = Math.cos(dir) * speed;
      this.vy = Math.sin(dir) * speed;
      this.steerTimer = 3 + Math.random() * 3;
    }
  }

  activeNote() {
    const idx = Math.floor(Date.now() / 500) % this.chord.length;
    return this.chord[idx] * (1 + this.detuning);
  }
}

export class Macrophage {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 26;
    this.speed  = 52;
    this.target = null;
    this.retargetTimer = 0;
    this.driftAngle = Math.random() * Math.PI * 2;
    // Blob shape: 9 spoke offsets, randomised once, animated via elapsed time
    this.spokeOffsets = Array.from({ length: 9 }, () => (Math.random() - 0.5) * 8);
    // Ghost triangles of ingested clones stored as {rx, ry} relative to centre
    this.capturedClones = [];
  }

  update(dt, clones, beatPhase) {
    this.retargetTimer -= dt;
    if (this.retargetTimer <= 0) {
      // Prefer most-dissonant clone (rougher chord = more "foreign")
      this.target = clones.length > 0
        ? clones.reduce((b, c) => !b || (c.roughness || 0) > (b.roughness || 0) ? c : b, null)
        : null;
      this.retargetTimer = 1.6 + Math.random() * 0.4;
    }

    if (this.target && clones.includes(this.target)) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      // On beat (beatPhase < 0.2): seek directly. Off-beat: orbit laterally.
      const onBeat     = beatPhase < 0.2;
      const lateralAmt = onBeat ? 0 : Math.sin(Date.now() / 550) * 38;
      const perp       = { x: -dy / d, y: dx / d };
      this.x += (dx / d * this.speed + perp.x * lateralAmt) * dt;
      this.y += (dy / d * this.speed + perp.y * lateralAmt) * dt;
    } else {
      this.target = null;
      this.driftAngle += (Math.random() - 0.5) * 0.4;
      this.x += Math.cos(this.driftAngle) * 18 * dt;
      this.y += Math.sin(this.driftAngle) * 18 * dt;
    }
  }

  ingest(clone) {
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.random() * this.radius * 0.55;
    this.capturedClones.push({ rx: Math.cos(angle) * r, ry: Math.sin(angle) * r });
    this.target = null;
    this.retargetTimer = 0;
  }
}

export class TCell {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 22;
    this.speed  = 75;
    this.angle  = 0; // slow rotation for square rendering
    this.scanTimer = 0;
    this.dissonanceTarget = null;
    this.escalationCooldown = 0;
  }

  update(dt, clones) {
    this.angle += dt * 0.4;
    this.escalationCooldown = Math.max(0, this.escalationCooldown - dt);
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      const candidates = clones.filter(c => (c.roughness || 0) > 0.35);
      this.dissonanceTarget = candidates.length > 0
        ? candidates.reduce((b, c) =>
            !b || (c.roughness || 0) > (b.roughness || 0) ? c : b, null)
        : null;
      this.scanTimer = 1.2;
    }

    if (this.dissonanceTarget && clones.includes(this.dissonanceTarget)) {
      const dx = this.dissonanceTarget.x - this.x;
      const dy = this.dissonanceTarget.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      // Waltz-like lateral wobble while approaching
      const perp   = { x: -dy / d, y: dx / d };
      const wobble = Math.sin(Date.now() / 380) * 35;
      this.x += (dx / d * this.speed + perp.x * wobble) * dt;
      this.y += (dy / d * this.speed + perp.y * wobble) * dt;
    }
  }
}

export class Antibody {
  constructor(x, y, targetNoteIdx, replacementNote) {
    this.x = x; this.y = y;
    this.radius = 11;
    this.targetNoteIdx   = targetNoteIdx;
    this.replacementNote = replacementNote;
    this.matchingNote    = PLAYER_CHORD[targetNoteIdx];
    this.attached      = false;
    this.attachAngle   = 0;
    this.vx = 0; this.vy = 0;
    this.maxSpeed    = 160;  // px/s — player terminal speed (~200) keeps them ahead
    this.accel       = 280;  // px/s² toward player
    this.maxTurnRate = Math.PI * 1.1; // rad/s — limited turning makes them dodgeable
  }

  update(dt, player) {
    if (this.attached) {
      this.attachAngle += dt * 1.4;
      this.x = player.x + Math.cos(this.attachAngle) * (player.radius + 18);
      this.y = player.y + Math.sin(this.attachAngle) * (player.radius + 18);
      return;
    }
    const dx = player.x - this.x, dy = player.y - this.y;
    const desiredAngle = Math.atan2(dy, dx);
    const currentAngle = (this.vx === 0 && this.vy === 0)
      ? desiredAngle
      : Math.atan2(this.vy, this.vx);
    let delta = desiredAngle - currentAngle;
    while (delta >  Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxDelta = this.maxTurnRate * dt;
    const newAngle = currentAngle + Math.max(-maxDelta, Math.min(maxDelta, delta));
    this.vx += Math.cos(newAngle) * this.accel * dt;
    this.vy += Math.sin(newAngle) * this.accel * dt;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > this.maxSpeed) {
      this.vx = this.vx / spd * this.maxSpeed;
      this.vy = this.vy / spd * this.maxSpeed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

export class Neutrophil {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius      = 13;
    this.speed       = 145;
    this.target      = null;
    this.attached    = false;
    this.fuseBeats   = 0;
    this.dead        = false;
    this.jitterAngle = Math.random() * Math.PI * 2;
    this.jitterTimer = 0;
  }

  update(dt, clones) {
    if (this.dead) return;
    this.jitterTimer -= dt;
    if (this.jitterTimer <= 0) {
      this.jitterAngle += (Math.random() - 0.5) * 2.8;
      this.jitterTimer = 0.08 + Math.random() * 0.12;
    }
    if (this.attached && this.target && clones.includes(this.target)) {
      this.x = this.target.x;
      this.y = this.target.y;
      return;
    }
    this.attached = false; // target was removed
    if (!this.target || !clones.includes(this.target)) {
      this.target = clones.length > 0
        ? clones.reduce((b, c) => {
            const db = b ? Math.hypot(b.x - this.x, b.y - this.y) : Infinity;
            const dc = Math.hypot(c.x - this.x, c.y - this.y);
            return dc < db ? c : b;
          }, null)
        : null;
    }
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      this.x += (dx / d * this.speed + Math.cos(this.jitterAngle) * 45) * dt;
      this.y += (dy / d * this.speed + Math.sin(this.jitterAngle) * 45) * dt;
    }
  }
}
