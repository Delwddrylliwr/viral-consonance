import { initCanvas, clear, drawPlayer, drawCell, drawGlow, drawInfectionFlash, drawProtein } from './src/render/canvas.js';
import { drawDebug } from './src/render/debug.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM, adjustTempo } from './src/audio/transport.js';
import { createPlayerVoice, createCellVoice, voiceCount,
         resolutionCadence, dissonantStab,
         setMasterVolume, proteinAttachSound, proteinDetachSound, deathSequence }
  from './src/audio/synthesis.js';
import { roughness, DEFAULT_TIMBRE } from './src/audio/consonance.js';
import { Player, Cell } from './src/game/entities.js';
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

const MAX_CELLS      = 5;  // target active cell count
const PROTEIN_TARGET = 8;  // target free-floating protein count
const PROTEIN_RANGE  = 800; // remove proteins that wander beyond this radius

let player, cells, committedCell, proteins, playerVoice, cellVoice;
let infectionFlash = 0;
let dead = false;
let deathFade = 0;

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

  dead      = false;
  deathFade = 0;
  state.dead = false;

  playerVoice = createPlayerVoice();
  cellVoice   = createCellVoice();

  onBeat(() => {
    updateCommittedCell();

    state.tempo        = getBPM();
    state.cellCount    = cells.filter(c => c.active).length;
    state.proteinCount = proteins.length;

    if (!committedCell) return;

    const nearest = nearestActiveCell();
    const pNote   = player.getActiveNote(committedCell.x, committedCell.y);
    const cNote   = committedCell.getActiveNote(player.x, player.y);

    cellVoice.trigger(cNote);
    playerVoice.setFreq(pNote);

    state.roughness         = roughness([pNote], [cNote], DEFAULT_TIMBRE);
    state.playerNote        = pNote;
    state.cellNote          = cNote;
    state.committedCellNote = cNote;
    state.nearestCellNote   = nearest ? nearest.getActiveNote(player.x, player.y) : cNote;
    state.voiceCount        = voiceCount();
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
    startTransport(100);
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
      ctx.save();
      ctx.font = '18px monospace';
      ctx.fillStyle = '#444';
      ctx.textAlign = 'center';
      ctx.fillText('run ended — click to restart', canvas.width / 2, canvas.height / 2);
      ctx.restore();
    }
    requestAnimationFrame(loop);
    return;
  }

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
      const newBpm = adjustTempo(+5);
      setMasterVolume(newBpm);
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
      const newBpm = adjustTempo(-3);
      setMasterVolume(newBpm);
      if (newBpm <= 60 && !dead) triggerDeath();
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
  drawPlayer(ctx, player, activePlayerNote);
  for (const p of proteins) drawProtein(ctx, p);

  ctx.restore();

  drawInfectionFlash(ctx, infectionFlash);
  if (DEBUG) drawDebug(ctx, state);

  requestAnimationFrame(loop);
}
