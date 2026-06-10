import { PLAYER_CHORD } from '../audio/scale.js';
import { state } from '../game/state.js';

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

export function angleDiff(a, b) {
  return ((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
}

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 30;
    this.accel  = 400;  // px/s² — terminal speed ≈ 200 px/s under input (accel/drag)
    this.drag   = 2.0;  // exponential decay rate; ~0.5s to reach terminal (was 0.29s)
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
    this.rotation += this.rotationSpeed * (state.rpmMultiplier ?? 1) * dt;
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
    this.rivalProgress  = 0;    // 0→1 as rival virus infects this cell
    this.infectingRival = null; // reference to the RivalVirus currently infecting this cell
  }

  update(dt) {
    this.rotation += this.rotationSpeed * (state.rpmMultiplier ?? 1) * dt;
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

export class Clone {
  constructor(x, y, chord) {
    this.x = x; this.y = y;
    this.radius = 18;
    this.chord = chord.slice();
    this.detuning = (Math.random() - 0.5) * 0.005786; // ±5 cents
    this.angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 20;
    const dir = Math.random() * Math.PI * 2;
    this.vx = Math.cos(dir) * speed;
    this.vy = Math.sin(dir) * speed;
    this.steerTimer = 3 + Math.random() * 3;
    this.roughness = 0; // pre-computed each frame in main.js
  }

  get alive() { return true; }
  get alpha()  { return 1; }

  update(dt) {
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

// Slow-drifting commensal bacterium. Player can infect it (lenient threshold) for 1 clone.
// Occasionally emits a metabolic pulse and distracts macrophages.
export class Bacterium {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 36;
    this.motif  = [146.83, 220.00, 261.63, 392.00]; // D3, A3, C4, G4
    this.color  = '#2a9';
    this.rotation      = Math.random() * Math.PI * 2;
    this.rotationSpeed = (2 * Math.PI) / 5.0;
    this.active     = true;
    this.flashTimer = 0;
    const angle = Math.random() * Math.PI * 2;
    const speed = 8 + Math.random() * 4;
    this.dx = Math.cos(angle) * speed;
    this.dy = Math.sin(angle) * speed;
    this.steerTimer = 10 + Math.random() * 10;
    this.pulseTimer = 25 + Math.random() * 15;
    this.metabolicPulse = null; // { r, maxR } while active
  }

  update(dt) {
    this.rotation += this.rotationSpeed * dt;
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (!this.active) return;
    this.x += this.dx * dt;
    this.y += this.dy * dt;
    this.steerTimer -= dt;
    if (this.steerTimer <= 0) {
      this.steerTimer = 10 + Math.random() * 10;
      const turn = (Math.random() - 0.5) * 0.8;
      const c = Math.cos(turn), s = Math.sin(turn);
      const nx = this.dx * c - this.dy * s;
      const ny = this.dx * s + this.dy * c;
      this.dx = nx; this.dy = ny;
    }
    this.pulseTimer -= dt;
    if (this.pulseTimer <= 0) {
      this.pulseTimer = 25 + Math.random() * 15;
      this.metabolicPulse = { r: 0, maxR: 80 };
    }
    if (this.metabolicPulse) {
      this.metabolicPulse.r += 60 * dt;
      if (this.metabolicPulse.r >= this.metabolicPulse.maxR) this.metabolicPulse = null;
    }
  }

  getDots() {
    const rx = this.radius * 1.3;
    const ry = this.radius * 0.7;
    return this.motif.map((freq, i) => {
      const angle = this.rotation + (i * Math.PI / 2);
      return { x: this.x + Math.cos(angle) * rx, y: this.y + Math.sin(angle) * ry, freq, angle };
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

// Competing virus strain. Infects cells independently; rival clones distract macrophages.
// Player can contest infections during a 5 s window to cancel them.
export class RivalVirus {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 22;
    this.motif  = [174.61, 196.00, 207.65, 261.63, 311.13, 349.23]; // F3, G3, Ab3, C4, Eb4, F4
    this.color  = '#e63';
    this.rotation      = Math.random() * Math.PI * 2;
    this.rotationSpeed = (2 * Math.PI) / 3.5;
    this.baseSpeed = 18 + Math.random() * 8;
    const dir = Math.random() * Math.PI * 2;
    this.vx = Math.cos(dir) * this.baseSpeed;
    this.vy = Math.sin(dir) * this.baseSpeed;
    this.steerTimer  = 5 + Math.random() * 7;
    this.infectTimer = 10 + Math.random() * 8;
    this.infectingCell      = null;
    this.infectionCompleted = false; // set true for one frame when an infection finishes
    this._lastInfectedX = 0;
    this._lastInfectedY = 0;
    this.alive = true;
  }

  update(dt, cells, alertLevel = 0, rivalActivity = 0) {
    this.rotation += this.rotationSpeed * dt;
    this.infectionCompleted = false;

    // Opportunistic speed scaling: rival moves faster when immune is occupied with player
    const speed = this.baseSpeed * (1 + alertLevel * 0.4);
    const dirMag = Math.hypot(this.vx, this.vy) || 1;
    this.x += (this.vx / dirMag) * speed * dt;
    this.y += (this.vy / dirMag) * speed * dt;

    this.steerTimer -= dt;
    if (this.steerTimer <= 0) {
      this.steerTimer = 5 + Math.random() * 7;
      const dir = Math.random() * Math.PI * 2;
      this.vx = Math.cos(dir) * this.baseSpeed;
      this.vy = Math.sin(dir) * this.baseSpeed;
    }

    // Weak pull toward nearest uninfected cell to ensure rival reaches action area
    if (!this.infectingCell && cells.length > 0) {
      const nearest = cells.reduce((best, c) => {
        if (!c.active || c.infectingRival) return best;
        const d = Math.hypot(c.x - this.x, c.y - this.y);
        return !best || d < best.d ? { c, d } : best;
      }, null);
      if (nearest && nearest.d > 180) {
        const pullX = nearest.c.x - this.x, pullY = nearest.c.y - this.y;
        const pMag  = Math.hypot(pullX, pullY) || 1;
        // Blend 20% toward nearest cell into current direction
        this.vx = this.vx * 0.8 + (pullX / pMag) * this.baseSpeed * 0.2;
        this.vy = this.vy * 0.8 + (pullY / pMag) * this.baseSpeed * 0.2;
        const nm = Math.hypot(this.vx, this.vy) || 1;
        this.vx = (this.vx / nm) * this.baseSpeed;
        this.vy = (this.vy / nm) * this.baseSpeed;
      }
    }

    // Advance current cell infection
    if (this.infectingCell) {
      if (!this.infectingCell.active || this.infectingCell.infectingRival !== this) {
        // Player contested or cell deactivated — infection cancelled
        this.infectingCell = null;
        this.infectTimer   = 6 + Math.random() * 6;
      } else {
        this.infectingCell.rivalProgress += dt / 5;
        if (this.infectingCell.rivalProgress >= 1) {
          this._lastInfectedX = this.infectingCell.x;
          this._lastInfectedY = this.infectingCell.y;
          this.infectingCell.rivalProgress  = 0;
          this.infectingCell.infectingRival = null;
          this.infectingCell.active         = false; // consume the cell
          this.infectingCell                = null;
          this.infectionCompleted           = true;
          // Infection rate accelerates as rival clones accumulate
          const activityFactor = Math.min(1, rivalActivity / 5);
          this.infectTimer     = Math.max(3, 8 - activityFactor * 5);
        }
      }
      return;
    }

    // Look for a new cell to infect
    this.infectTimer -= dt;
    if (this.infectTimer <= 0) {
      const range = this.radius + 45 + 40;
      const candidate = cells.find(c =>
        c.active && !c.infectingRival &&
        Math.hypot(c.x - this.x, c.y - this.y) < range,
      );
      if (candidate) {
        this.infectingCell       = candidate;
        candidate.infectingRival = this;
        candidate.rivalProgress  = 0;
      }
      // Rearm — faster when immune is occupied
      const base = Math.max(8, 18 - alertLevel * 10);
      this.infectTimer = candidate ? 999 : base * (0.8 + Math.random() * 0.4);
    }
  }

  getDots() {
    return this.motif.map((freq, i) => {
      const angle = this.rotation + i * (Math.PI / 3);
      return { x: this.x + Math.cos(angle) * this.radius, y: this.y + Math.sin(angle) * this.radius, freq, angle };
    });
  }
}

// Small drifting entity produced by a completed rival infection.
// Distracts macrophages; disappears after 35 s or when eaten.
export class RivalClone {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 10;
    this.age    = 0;
    const dir = Math.random() * Math.PI * 2;
    const spd = 10 + Math.random() * 5;
    this.vx = Math.cos(dir) * spd;
    this.vy = Math.sin(dir) * spd;
    this.steerTimer = 6 + Math.random() * 6;
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.steerTimer -= dt;
    if (this.steerTimer <= 0) {
      this.steerTimer = 6 + Math.random() * 6;
      const dir = Math.random() * Math.PI * 2;
      const spd = 10 + Math.random() * 5;
      this.vx = Math.cos(dir) * spd;
      this.vy = Math.sin(dir) * spd;
    }
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
    this.distractedTarget = null; // non-clone entity currently being tracked
    // Blob shape: 9 spoke offsets, randomised once, animated via elapsed time
    this.spokeOffsets = Array.from({ length: 9 }, () => (Math.random() - 0.5) * 8);
    // Ghost triangles of ingested clones stored as {rx, ry} relative to centre
    this.capturedClones = [];
    this.targetingPlayer = false;
    this.eatingPlayer    = false;
    this.eatTimer        = 0;
    this.consumeCount    = 0;
    this.maxConsumes     = 4; // dies after eating this many clones
    this.dead            = false;
    this.burstTimer      = 0;
    this.rallyPoint      = null; // {x,y} — rush here before resuming normal behaviour
  }

  update(dt, clones, beatPhase, player, playerDissonance, tcellAdaptation, distractibles = []) {
    this.burstTimer = Math.max(0, this.burstTimer - dt);
    const adaptedSpeed = this.speed * (1 + (tcellAdaptation || 0)); // up to 2× at full adaptation
    const spd = this.burstTimer > 0 ? adaptedSpeed * 1.8 : adaptedSpeed;
    if (this.eatingPlayer && player) {
      this.x = player.x;
      this.y = player.y;
      return;
    }

    // Summoned rally: beeline to the T-cell position before picking up normal targets
    if (this.rallyPoint) {
      const dx = this.rallyPoint.x - this.x, dy = this.rallyPoint.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      if (d < 40) {
        this.rallyPoint = null;
      } else {
        this.x += (dx / d) * this.speed * 1.6 * dt;
        this.y += (dy / d) * this.speed * 1.6 * dt;
        return;
      }
    }

    this.retargetTimer -= dt;
    if (this.retargetTimer <= 0 || !this.target ) {
      const dissonance = playerDissonance || 0;
      const adaptation = tcellAdaptation || 0;
      // Probability of targeting player scales directly with player dissonance (complement + antibodies)
      if (player && Math.random() < dissonance + 0.5 * adaptation) {
        this.targetingPlayer  = true;
        this.target           = null;
        this.distractedTarget = null;
      } else {
        this.targetingPlayer = false;
        this.target = clones.length > 0
          ? clones[Math.floor(Math.random() * clones.length)]
          : null;
        this.distractedTarget = null;
        // If no clone to hunt, consider wandering toward a distractible (bacterium / rival clone)
        if (!this.target && distractibles.length > 0) {
          const nearby = distractibles.filter(d => Math.hypot(d.x - this.x, d.y - this.y) < 280);
          if (nearby.length > 0 && Math.random() < 0.25) {
            const pick = nearby[Math.floor(Math.random() * nearby.length)];
            this.target           = pick;
            this.distractedTarget = pick;
          }
        }
      }
      // Retarget interval: increases as T-cells adapt (3s → 0.5s); player dissonance slows it down further
      const baseInterval   = adaptation * 3.0;
      const dissonanceBoost = 0.5 + dissonance * 0.5;
      this.retargetTimer = Math.max(0.3, baseInterval * dissonanceBoost + (Math.random() - 0.5) * 0.4);
    }

    if (this.targetingPlayer && player) {
      const dx = player.x - this.x, dy = player.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      const onBeat     = beatPhase < 0.2;
      const lateralAmt = this.burstTimer > 0 ? 0 : (onBeat ? 0 : Math.sin(Date.now() / 550) * 38);
      const perp       = { x: -dy / d, y: dx / d };
      this.x += (dx / d * spd + perp.x * lateralAmt) * dt;
      this.y += (dy / d * spd + perp.y * lateralAmt) * dt;
    } else if (this.target && clones.includes(this.target)) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      const onBeat     = beatPhase < 0.2;
      const lateralAmt = this.burstTimer > 0 ? 0 : (onBeat ? 0 : Math.sin(Date.now() / 550) * 38);
      const perp       = { x: -dy / d, y: dx / d };
      this.x += (dx / d * spd + perp.x * lateralAmt) * dt;
      this.y += (dy / d * spd + perp.y * lateralAmt) * dt;
    } else if (this.distractedTarget === this.target && this.target) {
      // Slow drift toward bacterium or rival clone
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      if (d < 40) { this.distractedTarget = null; this.target = null; this.retargetTimer = 0; }
      else {
        this.x += (dx / d) * spd * 0.6 * dt;
        this.y += (dy / d) * spd * 0.6 * dt;
      }
    } else {
      this.target           = null;
      this.distractedTarget = null;
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
    this.consumeCount++;
    if (this.consumeCount >= this.maxConsumes) this.dead = true;
  }
}

export class TCell {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 22;
    this.speed  = 82;
    this.angle  = 0; // slow rotation for square rendering
    this.scanTimer = 0;
    this.dissonanceTarget = null;
    this.escalationCooldown = 0;
    this.isEvading = false;
    this.burstCooldown = 0;
    // Lateral strafe state — flips sign periodically so the T-cell zigzags while fleeing
    this.strafeSign  = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 1.2 + Math.random() * 1.4;
    // Motif: complement-shifted player notes — consonant only when player has all 3 proteins
    this.motif = [277.18, 311.13, 415.30, 554.37]; // C#4, Eb4, G#4, C#5
  }

  getDots() {
    // 4 notes at the square corners: radius * √2 from centre at ±45° from each axis
    const cornerDist = this.radius * Math.SQRT2;
    return this.motif.map((freq, i) => {
      const angle = this.angle + (i * Math.PI / 2) + Math.PI / 4;
      return {
        x: this.x + Math.cos(angle) * cornerDist,
        y: this.y + Math.sin(angle) * cornerDist,
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

  update(dt, clones, player) {
    this.angle += dt * 0.4 * (state.rpmMultiplier ?? 1);
    this.escalationCooldown = Math.max(0, this.escalationCooldown - dt);
    this.burstCooldown = Math.max(0, this.burstCooldown - dt);
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      const candidates = clones.filter(c => (c.roughness || 0) > 0.35);
      this.dissonanceTarget = candidates.length > 0
        ? candidates.reduce((b, c) =>
            !b || (c.roughness || 0) > (b.roughness || 0) ? c : b, null)
        : null;
      this.scanTimer = 1.2;
    }

    const EVADE_RADIUS = 210;
    if (player) {
      const edx = this.x - player.x;
      const edy = this.y - player.y;
      const eDist = Math.hypot(edx, edy) || 1;
      if (eDist < EVADE_RADIUS) {
        this.isEvading = true;
        // Strafe sign flips periodically — forces player to cut off angle rather than charge straight
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeSign  = -this.strafeSign;
          this.strafeTimer = 1.2 + Math.random() * 1.4;
        }

        // Speed burst when player gets very close — last-ditch escape
        const closeFactor = eDist < 80 ? 1.35 : 1.0;
        const evadeSpeed  = this.speed * 1.25 * closeFactor; // ~113–153 px/s vs player ~200 max

        const nx = edx / eDist, ny = edy / eDist;
        // Perpendicular direction; strafe weight fades toward zero as player approaches catch range
        const strafeWeight = 0.55 * Math.min(1, eDist / EVADE_RADIUS);
        const px = -ny * this.strafeSign, py = nx * this.strafeSign;

        this.x += (nx + px * strafeWeight) * evadeSpeed * dt;
        this.y += (ny + py * strafeWeight) * evadeSpeed * dt;
        return;
      }
    }
    this.isEvading = false;

    if (this.dissonanceTarget && clones.includes(this.dissonanceTarget)) {
      const dx = this.dissonanceTarget.x - this.x;
      const dy = this.dissonanceTarget.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      const orbitRadius = 90;
      if (d > orbitRadius * 1.8) {
        // Approach phase
        this.x += dx / d * this.speed * dt;
        this.y += dy / d * this.speed * dt;
      } else {
        // Orbit phase: circle the dissonant clone
        const perp            = { x: -dy / d, y: dx / d };
        const radialCorrection = (d - orbitRadius) / orbitRadius;
        this.x += (perp.x * this.speed + dx / d * this.speed * 0.4 * radialCorrection) * dt;
        this.y += (perp.y * this.speed + dy / d * this.speed * 0.4 * radialCorrection) * dt;
      }
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
    this.maxSpeed    = 240;  // px/s — faster pursuit
    this.accel       = 420;  // px/s² toward player
    this.maxTurnRate = Math.PI * 2.0; // rad/s — tighter tracking
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
    this.targetingPlayer    = false;
    this.playerFuseBeats    = 0;
    this.attachedToPlayer   = false;
    this.playerLatchCooldown = 0; // s — prevents immediate re-attach after shake-off
  }

  update(dt, clones) {
    if (this.dead) return;
    this.jitterTimer -= dt;
    if (this.jitterTimer <= 0) {
      this.jitterAngle += (Math.random() - 0.5) * 2.8;
      this.jitterTimer = 0.08 + Math.random() * 0.12;
    }
    if (this.attachedToPlayer && this.playerTarget) {
      this.x = this.playerTarget.x;
      this.y = this.playerTarget.y;
      return;
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
    if (this.targetingPlayer && this.playerTarget) {
      const dx = this.playerTarget.x - this.x, dy = this.playerTarget.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      this.x += (dx / d * this.speed + Math.cos(this.jitterAngle) * 45) * dt;
      this.y += (dy / d * this.speed + Math.sin(this.jitterAngle) * 45) * dt;
    } else if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d  = Math.hypot(dx, dy) || 1;
      this.x += (dx / d * this.speed + Math.cos(this.jitterAngle) * 45) * dt;
      this.y += (dy / d * this.speed + Math.sin(this.jitterAngle) * 45) * dt;
    }
  }
}

export class NeutrophilBlast {
  constructor(x, y, maxRadius, speed) {
    this.x = x;
    this.y = y;
    this.radius    = 0;
    this.maxRadius = maxRadius;
    this.speed     = speed;
    this.dead      = false;
    this.hitPlayer = false;
  }

  update(dt) {
    this.radius = Math.min(this.maxRadius, this.radius + this.speed * dt);
    if (this.radius >= this.maxRadius) this.dead = true;
  }
}

export class BCell {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius      = 32;
    this.rotation    = Math.random() * Math.PI * 2;
    this.rotationSpeed = (2 * Math.PI) / 5.6;
    this.active      = true;
    this.flashTimer  = 0;
    this.launchTimer = 8 + Math.random() * 6; // time until first antibody launch
    this.speed       = 60;   // slow enough to be catchable
    this.fleeSpeed   = 150;   // faster when player is close
    this.color       = '#a3f';
    // 8-note motif at octagon corners (based on antibody freq harmonics)
    this.motif = [369.99, 392.00, 415.30, 440.00, 466.16, 493.88, 523.25, 554.37];
  }

  getDots() {
    return this.motif.map((freq, i) => {
      const angle = this.rotation + i * (Math.PI / 4);
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

  update(dt, player, screenHalfW, screenHalfH) {
    this.rotation += this.rotationSpeed * (state.rpmMultiplier ?? 1) * dt;
    this.launchTimer = Math.max(0, this.launchTimer - dt);
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);

    const toPlayerX = player.x - this.x;
    const toPlayerY = player.y - this.y;
    const playerDist = Math.hypot(toPlayerX, toPlayerY) || 1;

    // Flee away from player; also drift toward the screen perimeter
    const spd = playerDist < 300 ? this.fleeSpeed : this.speed;

    // Flee component: directly away from player
    const fleeX = -(toPlayerX / playerDist);
    const fleeY = -(toPlayerY / playerDist);

    // Edge-pull: nudge toward the nearest off-screen direction relative to player
    // (the direction from player that puts this B cell furthest off-screen)
    const relX = this.x - player.x;
    const relY = this.y - player.y;
    const edgeDirX = relX / (Math.abs(relX) || 1);
    const edgeDirY = relY / (Math.abs(relY) || 1);
    // Blend: mostly flee, partly hug edge
    const moveX = fleeX * 0.7 + edgeDirX * 0.3;
    const moveY = fleeY * 0.7 + edgeDirY * 0.3;
    const mLen  = Math.hypot(moveX, moveY) || 1;

    this.x += (moveX / mLen) * spd * dt;
    this.y += (moveY / mLen) * spd * dt;

    // Clamp to screen edge so antibodies don't spawn beyond the 1500px cull distance
    const maxDist = Math.hypot(screenHalfW, screenHalfH) + 80;
    const curDist = Math.hypot(this.x - player.x, this.y - player.y) || 1;
    if (curDist > maxDist) {
      this.x = player.x + (this.x - player.x) * maxDist / curDist;
      this.y = player.y + (this.y - player.y) * maxDist / curDist;
    }
  }
}
