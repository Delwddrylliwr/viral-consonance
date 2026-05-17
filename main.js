import { initCanvas, clear, drawPlayer, drawCell, drawGlow, drawInfectionFlash, drawProtein, drawClone } from './src/render/canvas.js';
import { drawDebug } from './src/render/debug.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM, setTempo } from './src/audio/transport.js';
import { createPlayerVoice, createCellVoice, createCloneVoice, voiceCount,
         resolutionCadence, dissonantStab,
         setMasterVolume, proteinAttachSound, proteinDetachSound, deathSequence }
  from './src/audio/synthesis.js';
import { roughness, DEFAULT_TIMBRE } from './src/audio/consonance.js';
import { Player, Cell, Clone } from './src/game/entities.js';
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
const MAX_CLONES_PER_BOUNCE    = 3;
const STARTER_CLONES           = 8; // gives 100 BPM at game start

let player, cells, committedCell, proteins, clones, playerVoice, cellVoice, cloneVoice;
let infectionFlash = 0;
let dead = false;
let deathFade = 0;
let gameTime = 0;   // seconds of live play
let bpmAccum = 0;   // ∫ BPM dt — divide by gameTime for average

// --- A+B helpers ---

function cellDist(c) { return Math.hypot(c.x - player.x, c.y - player.y); }

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

  dead      = false;
  deathFade = 0;
  gameTime  = 0;
  bpmAccum  = 0;
  state.dead = false;

  playerVoice = createPlayerVoice();
  cellVoice   = createCellVoice();
  cloneVoice  = createCloneVoice();

  onBeat(() => {
    updateCommittedCell();

    state.tempo        = getBPM();
    state.cellCount    = cells.filter(c => c.active).length;
    state.proteinCount = proteins.length;
    state.cloneCount   = clones.length;

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
      const avgBpm = gameTime > 0 ? Math.round(bpmAccum / gameTime) : 0;
      ctx.save();
      ctx.font = '26px monospace';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText(`avg BPM  ${avgBpm}`, canvas.width / 2, canvas.height / 2 - 18);
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

  // Clone lifecycle — expired clones reduce viral load (and thus BPM)
  clones = clones.filter(c => c.alive);
  for (const c of clones) c.update(dt);
  setTempo(Math.min(160, BASE_BPM + clones.length * BPM_PER_CLONE));

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

  // Protein shake-off (only play sound when something actually detaches)
  if (player.detectShake(now)) {
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
      // Kill clones: each of 3 slots dies with probability ∝ dissonance (mirror of spawn)
      const killProb = Math.min(1, (r - INFECTION_THRESHOLD) / (1 - INFECTION_THRESHOLD));
      clones.sort((a, b) => a.lifetime - b.lifetime); // kill oldest first
      for (let i = 0; i < MAX_CLONES_PER_BOUNCE; i++) {
        if (Math.random() < killProb && clones.length > 0) clones.shift();
      }
      setTempo(Math.min(160, BASE_BPM + clones.length * BPM_PER_CLONE));
      setMasterVolume(getBPM());
    }
  }

  // Death when viral load (clone count) hits zero
  if (getBPM() <= BASE_BPM && !dead) triggerDeath();

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

  // Render
  clear(ctx);

  ctx.save();
  ctx.translate(canvas.width / 2 - player.x, canvas.height / 2 - player.y);

  for (const c of cells) {
    if (!c.active && c.flashTimer <= 0) continue;
    if (c.active) {
      const r = roughness(
        [player.getActiveNote(c.x, c.y)],
        [c.getActiveNote(player.x, player.y)],
        DEFAULT_TIMBRE,
      );
      drawGlow(ctx, player, c, r);
    }
    drawCell(ctx, c);
  }
  for (const c of clones) drawClone(ctx, c);
  drawPlayer(ctx, player, activePlayerNote);
  for (const p of proteins) drawProtein(ctx, p);

  ctx.restore();

  drawInfectionFlash(ctx, infectionFlash);
  if (DEBUG) drawDebug(ctx, state);

  requestAnimationFrame(loop);
}
