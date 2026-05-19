import { initCanvas, clear, drawPlayer, drawCell, drawGlow, drawInfectionFlash, drawProtein, drawClone,
         drawMacrophage, drawTCell, drawAntibody, drawNeutrophil, drawLetterBond } from './src/render/canvas.js';
import { drawDebug } from './src/render/debug.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM, setTempo } from './src/audio/transport.js';
import { createPlayerVoice, createCellVoice, createCloneVoice, voiceCount,
         resolutionCadence, dissonantStab,
         setMasterVolume, setChorusDepth, proteinAttachSound, proteinDetachSound, deathSequence,
         playMacrophageConsume, playAntibodyAttach, playNeutrophilTick, playNeutrophilExplode }
  from './src/audio/synthesis.js';
import { roughness, DEFAULT_TIMBRE } from './src/audio/consonance.js';
import { PLAYER_CHORD } from './src/audio/scale.js';
import { Player, Cell, Clone, Macrophage, TCell, Antibody, Neutrophil } from './src/game/entities.js';
import { checkContact, bouncePlayer, spawnCell, INFECTION_THRESHOLD,
         checkContactProtein, spawnProtein }
  from './src/game/contact.js';

const canvas = initCanvas();
const ctx    = canvas.getContext('2d');

// Keyboard input
const input = { up: false, down: false, left: false, right: false };
const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', e => { if (KEY_MAP[e.code]) { input[KEY_MAP[e.code]] = true;  e.preventDefault(); } });
window.addEventListener('keyup',   e => { if (KEY_MAP[e.code]) { input[KEY_MAP[e.code]] = false; } });

// Touch input
function handleTouch(e) {
  e.preventDefault();
  if (e.touches.length === 0) {
    input.up = input.down = input.left = input.right = false;
    return;
  }
  const t    = e.touches[0];
  const dx   = t.clientX - canvas.width  / 2;
  const dy   = t.clientY - canvas.height / 2;
  const dead = 20;
  input.right = dx >  dead;
  input.left  = dx < -dead;
  input.down  = dy >  dead;
  input.up    = dy < -dead;
}
canvas.addEventListener('touchstart',  handleTouch, { passive: false });
canvas.addEventListener('touchmove',   handleTouch, { passive: false });
canvas.addEventListener('touchend',    handleTouch, { passive: false });
canvas.addEventListener('touchcancel', handleTouch, { passive: false });

const MAX_CELLS        = 5;   // target active cell count
const PROTEIN_TARGET   = 8;   // target free-floating protein count
const PROTEIN_RANGE    = 800; // remove proteins that wander beyond this radius

// BPM = BASE_BPM + clones.length * BPM_PER_CLONE  (viral load drives tempo)
const BASE_BPM                 = 60;
const BPM_PER_CLONE            = 5;
const MAX_CLONES_PER_INFECTION = 3;
const STARTER_CLONES           = 8; // gives 100 BPM at game start

const MACROPHAGE_BASE = 2;
const MACROPHAGE_MAX  = 7;
// Tritone substitutions for player chord notes C4, E4, G4 (F#4, Bb4, C#5)
const ANTIBODY_FREQS = [369.99, 466.16, 554.37];

let player, cells, committedCell, proteins, clones, playerVoice, cellVoice, cloneVoice;
let macrophages, tcells, antibodies, neutrophils;
let antibodySpawnTimer = 15;
let immuneAlertLevel = 0;
let infectionFlash = 0;
let letterBondFlash = { playerDot: { x: 0, y: 0 }, cellDot: { x: 0, y: 0 }, timer: 0 };
let dead = false;
let deathFade = 0;
let gameTime = 0;   // seconds of live play
let bpmAccum = 0;   // ∫ BPM dt — divide by gameTime for average
let maxViralLoad = 0;

// --- helpers ---

function cellDist(c) { return Math.hypot(c.x - player.x, c.y - player.y); }

// Spawn position at the edge of the visible screen area
function randomEdgePos() {
  const angle = Math.random() * Math.PI * 2;
  const dist  = Math.hypot(canvas.width / 2, canvas.height / 2) + 100;
  return [player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist];
}

function nearestActiveCell() {
  return cells.reduce((best, c) => {
    if (!c.active) return best;
    return (!best || cellDist(c) < cellDist(best)) ? c : best;
  }, null);
}

function updateCommittedCell() {
  const nearest = nearestActiveCell();
  if (!nearest) return;
  if (!committedCell || !committedCell.active) { committedCell = nearest; return; }
  if (cellDist(nearest) < cellDist(committedCell) * 0.8) committedCell = nearest;
}

// ---

function init() {
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;

  player = new Player(cx, cy);

  // Start with two guaranteed type-0 (easy) cells close by, then fill with variety
  cells = [
    new Cell(cx + 220, cy - 60,  0),
    new Cell(cx - 180, cy + 100, 0),
    spawnCell(cx, cy, 260, 380, 1),
    spawnCell(cx, cy, 260, 380, 2),
    spawnCell(cx, cy, 280, 420),
  ];
  committedCell = cells[0];

  proteins = Array.from({ length: PROTEIN_TARGET }, () => spawnProtein(cx, cy));

  // Starter clones give 100 BPM from the first frame (8 × 5 + 60)
  clones = Array.from({ length: STARTER_CLONES }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 80 + Math.random() * 80;
    return new Clone(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, player.chord);
  });

  macrophages        = [];
  tcells             = [];
  antibodies         = [];
  neutrophils        = [];
  antibodySpawnTimer = 15;
  immuneAlertLevel   = 0;
  dead               = false;
  deathFade          = 0;
  gameTime           = 0;
  bpmAccum           = 0;
  maxViralLoad       = 0;
  state.dead         = false;
  letterBondFlash    = { playerDot: { x: 0, y: 0 }, cellDot: { x: 0, y: 0 }, timer: 0 };

  playerVoice = createPlayerVoice();
  cellVoice   = createCellVoice();
  cloneVoice  = createCloneVoice();

  onBeat(() => {
    updateCommittedCell();

    state.tempo          = getBPM();
    state.cellCount      = cells.filter(c => c.active).length;
    state.proteinCount   = proteins.length;
    state.cloneCount     = clones.length;
    state.macrophageCount = macrophages.length;
    state.tcellCount     = tcells.length;
    state.immuneAlert    = immuneAlertLevel;

    // Neutrophil fuse countdown — fires on each beat while attached to a clone
    for (const n of neutrophils.filter(n => n.attached && !n.dead)) {
      n.fuseBeats++;
      playNeutrophilTick(n.fuseBeats);
      if (n.fuseBeats >= 4) {
        const idx = clones.indexOf(n.target);
        if (idx !== -1) {
          clones.splice(idx, 1);
          setTempo(Math.min(160, BASE_BPM + clones.length * BPM_PER_CLONE));
        }
        n.dead = true;
        playNeutrophilExplode();
      }
    }
    neutrophils = neutrophils.filter(n => !n.dead);

    if (!committedCell) return;

    const nearest = nearestActiveCell();
    const pNote   = player.getActiveNote(committedCell.x, committedCell.y);
    const cNote   = committedCell.getActiveNote(player.x, player.y);

    const distToCell = Math.hypot(committedCell.x - player.x, committedCell.y - player.y);
    const cellVolDb = Math.max(-35, -12 - (distToCell / 600) * 20);
    cellVoice.trigger(cNote, cellVolDb);
    playerVoice.setFreq(pNote);

    state.roughness         = roughness([pNote], [cNote], DEFAULT_TIMBRE);
    state.playerNote        = pNote;
    state.cellNote          = cNote;
    state.committedCellNote = cNote;
    state.nearestCellNote   = nearest ? nearest.getActiveNote(player.x, player.y) : cNote;
    state.voiceCount        = voiceCount();
    setMasterVolume(getBPM());
    setChorusDepth(Math.min(1, clones.length / 20)); // full width at 20 clones (160 BPM ceiling)

    // Trigger the 2 nearest clones as ambient pitched voices
    const nearClones = [...clones]
      .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y)
                    - Math.hypot(b.x - player.x, b.y - player.y))
      .slice(0, 2);
    for (const c of nearClones) cloneVoice.trigger(c.activeNote());
  });
}

function triggerDeath() {
  dead = true;
  state.dead = true;
  deathSequence(() => { deathFade = 1; });
}

// Click/tap-to-start
document.getElementById('start').addEventListener('click', async () => {
  const startEl = document.getElementById('start');
  const span = startEl.querySelector('span');
  try {
    span.textContent = 'starting audio…';
    await Promise.race([
      Tone.start(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('audio timeout — tap again')), 4000)),
    ]);
    span.textContent = 'loading…';
    startTransport(BASE_BPM);
    init();
    startEl.remove();
    requestAnimationFrame(loop);
  } catch (err) {
    span.textContent = err.message;
    console.error('Start failed:', err);
  }
});

// Restart after death
window.addEventListener('pointerdown', () => {
  if (dead && deathFade >= 1) location.reload();
});

let last = 0;
function loop(ts) {
  const now = ts / 1000;
  const dt  = Math.min((ts - last) / 1000, 0.05);
  last = ts;

  if (dead) {
    deathFade = Math.min(1, deathFade + dt / 4);
    clear(ctx);
    ctx.save();
    ctx.globalAlpha = deathFade * 0.92;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (deathFade >= 0.95) {
      const avgBpm = Math.round(gameTime > 0 ? bpmAccum / gameTime : BASE_BPM);
      ctx.save();
      ctx.font = '26px monospace';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText(`max viral load  ${maxViralLoad}  (avg ${avgBpm} BPM)`, canvas.width / 2, canvas.height / 2 - 18);
      ctx.font = '15px monospace';
      ctx.fillStyle = '#444';
      ctx.fillText('click to restart', canvas.width / 2, canvas.height / 2 + 18);
      ctx.restore();
    }
    requestAnimationFrame(loop);
    return;
  }

  // Accumulate BPM for final score
  gameTime += dt;
  bpmAccum += getBPM() * dt;
  if (clones.length > maxViralLoad) maxViralLoad = clones.length;

  // Clone lifecycle — expired clones reduce viral load (and thus BPM)
  clones = clones.filter(c => c.alive);
  for (const c of clones) c.update(dt);
  setTempo(Math.min(160, BASE_BPM + clones.length * BPM_PER_CLONE));

  // Beat phase 0–1 for macrophage erratic movement (0 = just hit beat)
  const beatDuration = 60 / getBPM();
  const beatPhase = (now % beatDuration) / beatDuration;

  // Clone roughness relative to tonic chord — used for immune cell targeting
  for (const c of clones) c.roughness = roughness(c.chord, PLAYER_CHORD, DEFAULT_TIMBRE);

  // Update entities
  player.update(dt, input, now);
  for (const c of cells) c.update(dt);
  for (const p of proteins) p.update(dt, player);

  // Protein attachment
  for (const p of proteins) {
    if (!p.attached && checkContactProtein(player, p)) {
      p.attach(player);
      proteinAttachSound();
    }
  }

  // Shake detection — computed once, used for both proteins and antibodies
  const playerShook = player.detectShake(now);

  // Protein shake-off (only play sound when something actually detaches)
  if (playerShook) {
    let shookAny = false;
    for (const p of proteins) {
      if (p.attached) { p.detach(player); shookAny = true; }
    }
    if (shookAny) proteinDetachSound();
  }

  // Pool maintenance: replace proteins that have wandered too far
  proteins = proteins.filter(p => p.attached || Math.hypot(p.x - player.x, p.y - player.y) <= PROTEIN_RANGE);
  const freeCount = proteins.filter(p => !p.attached).length;
  for (let i = freeCount; i < PROTEIN_TARGET; i++) {
    proteins.push(spawnProtein(player.x, player.y));
  }

  // Cell contact
  for (const c of cells) {
    if (!c.active || !checkContact(player, c)) continue;
    const pNote = player.getActiveNote(c.x, c.y);
    const cNote = c.getActiveNote(player.x, player.y);
    const r     = roughness([pNote], [cNote], DEFAULT_TIMBRE);
    if (r < INFECTION_THRESHOLD) {
      c.active = false;
      c.flashTimer = 0.5;
      infectionFlash = 1;
      const pDots = player.getDots();
      const cDots = c.getDots();
      const pActiveDot = pDots.find(d => d.freq === pNote) ?? pDots[0];
      const cActiveDot = cDots.find(d => d.freq === cNote) ?? cDots[0];
      letterBondFlash = {
        playerDot: { x: pActiveDot.x, y: pActiveDot.y },
        cellDot:   { x: cActiveDot.x, y: cActiveDot.y },
        timer: 0.3,
      };
      resolutionCadence();
      // Spawn clones: each of 3 slots succeeds with probability ∝ consonance
      const spawnProb = Math.max(0, 1 - r / INFECTION_THRESHOLD);
      for (let i = 0; i < MAX_CLONES_PER_INFECTION; i++) {
        if (Math.random() < spawnProb) {
          clones.push(new Clone(
            c.x + (Math.random() - 0.5) * 60,
            c.y + (Math.random() - 0.5) * 60,
            player.chord,
          ));
        }
      }
      setTempo(Math.min(160, BASE_BPM + clones.length * BPM_PER_CLONE));
      setMasterVolume(getBPM());
      setTimeout(() => {
        cells = cells.filter(x => x.active || x.flashTimer > 0);
        while (cells.filter(x => x.active).length < MAX_CELLS) {
          cells.push(spawnCell(player.x, player.y));
        }
        if (!committedCell || !committedCell.active) committedCell = nearestActiveCell();
      }, 650);
    } else {
      bouncePlayer(player, c, r);
      dissonantStab();
      immuneAlertLevel = Math.min(1.0, immuneAlertLevel + 0.3);
      setTempo(Math.min(160, BASE_BPM + clones.length * BPM_PER_CLONE));
      setMasterVolume(getBPM());
    }
  }

  // Death when viral load (clone count) hits zero
  if (getBPM() <= BASE_BPM && !dead) triggerDeath();

  // Immune system — immune alert decays over time
  immuneAlertLevel = Math.max(0, immuneAlertLevel - 0.08 * dt);

  // T-cell: always 1 present; escalates immune alert near dissonant clones
  if (tcells.length < 1) tcells.push(new TCell(...randomEdgePos()));
  tcells = tcells.filter(tc => Math.hypot(tc.x - player.x, tc.y - player.y) < 1500);
  for (const tc of tcells) {
    tc.update(dt, clones);
    for (const c of clones) {
      if ((c.roughness || 0) > 0.35
          && Math.hypot(tc.x - c.x, tc.y - c.y) < tc.radius + c.radius + 15
          && tc.escalationCooldown <= 0) {
        immuneAlertLevel = Math.min(1.0, immuneAlertLevel + 0.4);
        tc.escalationCooldown = 8;
        break;
      }
    }
  }

  // Macrophage management: count driven by attached proteins + immune alert (after T-cell escalation)
  const targetMacroCount = Math.min(MACROPHAGE_MAX,
    MACROPHAGE_BASE + proteins.filter(p => p.attached).length + Math.round(immuneAlertLevel * 3));
  while (macrophages.length < targetMacroCount) macrophages.push(new Macrophage(...randomEdgePos()));
  if (macrophages.length > MACROPHAGE_MAX) macrophages.length = MACROPHAGE_MAX;

  for (const m of macrophages) {
    m.update(dt, clones, beatPhase);
    for (let i = clones.length - 1; i >= 0; i--) {
      if (Math.hypot(m.x - clones[i].x, m.y - clones[i].y) < m.radius + clones[i].radius) {
        m.ingest(clones[i]);
        clones.splice(i, 1);
        setTempo(Math.min(160, BASE_BPM + clones.length * BPM_PER_CLONE));
        playMacrophageConsume();
        break;
      }
    }
  }

  // Neutrophil: 1 present while clones exist; attaches and explodes after 4 beats
  neutrophils = neutrophils.filter(n => !n.dead);
  if (neutrophils.length < 1 && clones.length > 0) neutrophils.push(new Neutrophil(...randomEdgePos()));
  for (const n of neutrophils) {
    n.update(dt, clones);
    if (!n.attached && n.target && clones.includes(n.target)
        && Math.hypot(n.x - n.target.x, n.y - n.target.y) < n.radius + n.target.radius) {
      n.attached = true;
    }
  }

  // Antibodies: spawn on timer, max 2 in flight, home toward player as seeking missiles
  antibodySpawnTimer -= dt;
  if (antibodySpawnTimer <= 0 && antibodies.filter(ab => !ab.attached).length < 2) {
    const noteIdx = Math.floor(Math.random() * 3);
    antibodies.push(new Antibody(...randomEdgePos(), noteIdx, ANTIBODY_FREQS[noteIdx]));
    antibodySpawnTimer = 12 + Math.random() * 6;
  }
  for (let i = antibodies.length - 1; i >= 0; i--) {
    const ab = antibodies[i];
    ab.update(dt, player);
    if (!ab.attached && Math.hypot(ab.x - player.x, ab.y - player.y) < ab.radius + player.radius) {
      ab.attached = true;
      ab.attachAngle = Math.atan2(ab.y - player.y, ab.x - player.x);
      player.chord[ab.targetNoteIdx] = ANTIBODY_FREQS[ab.targetNoteIdx];
      playAntibodyAttach();
    }
    if (ab.attached && playerShook) {
      player.chord[ab.targetNoteIdx] = player.baseChord[ab.targetNoteIdx];
      antibodies.splice(i, 1);
      proteinDetachSound();
    } else if (!ab.attached && Math.hypot(ab.x - player.x, ab.y - player.y) > 1500) {
      antibodies.splice(i, 1); // strayed too far
    }
  }

  // Cell leash: replace active cells that have drifted beyond 600 px from player
  cells = cells.map(c => {
    if (!c.active || Math.hypot(c.x - player.x, c.y - player.y) <= 600) return c;
    return spawnCell(player.x, player.y); // fresh random-type cell near player
  });
  if (!committedCell || !committedCell.active) committedCell = nearestActiveCell();

  const activePlayerNote = committedCell
    ? player.getActiveNote(committedCell.x, committedCell.y)
    : player.getActiveNote(0, 0);

  infectionFlash = Math.max(0, infectionFlash - dt * 2.5);
  letterBondFlash.timer = Math.max(0, letterBondFlash.timer - dt);

  // Render
  clear(ctx);

  ctx.save();
  ctx.translate(canvas.width / 2 - player.x, canvas.height / 2 - player.y);

  for (const c of cells) {
    if (!c.active && c.flashTimer <= 0) continue;
    const cActiveFreq = c.active ? c.getActiveNote(player.x, player.y) : null;
    if (c.active) {
      const r = roughness(
        [player.getActiveNote(c.x, c.y)],
        [cActiveFreq],
        DEFAULT_TIMBRE,
      );
      drawGlow(ctx, player, c, r);
    }
    drawCell(ctx, c, cActiveFreq);
  }
  for (const c of clones) drawClone(ctx, c);
  for (const m of macrophages) drawMacrophage(ctx, m, now);
  for (const tc of tcells) drawTCell(ctx, tc);
  for (const ab of antibodies) drawAntibody(ctx, ab);
  for (const n of neutrophils) if (!n.dead) drawNeutrophil(ctx, n);
  drawPlayer(ctx, player, activePlayerNote);
  for (const p of proteins) drawProtein(ctx, p, player);
  drawLetterBond(ctx, letterBondFlash);

  ctx.restore();

  drawInfectionFlash(ctx, infectionFlash);
  if (DEBUG) drawDebug(ctx, state);

  requestAnimationFrame(loop);
}
