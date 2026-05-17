import { initCanvas, clear, drawPlayer, drawCell, drawGlow, drawInfectionFlash, drawProtein } from './src/render/canvas.js';
import { drawDebug } from './src/render/debug.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM, adjustTempo } from './src/audio/transport.js';
import { createPlayerVoice, createCellVoice, voiceCount,
         resolutionCadence, dissonantStab,
         setMasterVolume, proteinAttachSound, proteinDetachSound, deathSequence }
  from './src/audio/synthesis.js';
import { roughness, DEFAULT_TIMBRE } from './src/audio/consonance.js';
import { Player, Cell, ComplementProtein } from './src/game/entities.js';
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

let player, cells, committedCell, protein, playerVoice, cellVoice;
let infectionFlash  = 0;
let proteinSpawnTimer = 20; // seconds until first protein appears
let dead = false;
let deathFade = 0; // 0→1 over 4 s for the death overlay

// --- A+B helpers ---

function cellDist(c) { return Math.hypot(c.x - player.x, c.y - player.y); }

function nearestActiveCell() {
  return cells.reduce((best, c) => {
    if (!c.active) return best;
    return (!best || cellDist(c) < cellDist(best)) ? c : best;
  }, null);
}

// Option A: only runs inside onBeat, so switches land on the beat grid.
// Option B: challenger must be ≥ 20% closer to displace committed cell.
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
  cells  = [new Cell(cx + 220, cy - 60)];
  committedCell = cells[0];
  protein = null;
  proteinSpawnTimer = 20;
  dead = false;
  deathFade = 0;
  state.dead = false;

  playerVoice = createPlayerVoice();
  cellVoice   = createCellVoice();

  onBeat(() => {
    updateCommittedCell(); // beat-quantised attention switch with hysteresis

    state.tempo = getBPM();
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
    state.proteinCount      = protein ? 1 : 0;
  });
}

function triggerDeath() {
  dead = true;
  state.dead = true;
  deathSequence(() => { deathFade = 1; });
}

// Click/tap-to-start
document.getElementById('start').addEventListener('pointerdown', async () => {
  const startEl = document.getElementById('start');
  try {
    await Tone.start();
    startTransport(100);
    init();
    startEl.remove();
    requestAnimationFrame(loop);
  } catch (err) {
    startEl.querySelector('span').textContent = 'error: ' + err.message;
    console.error('Start failed:', err);
  }
}, { once: true });

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
    deathFade = Math.min(1, deathFade + dt / 4); // sync with 4 s audio fade
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

  player.update(dt, input, now);
  for (const c of cells) c.update(dt);

  // Protein lifecycle
  if (protein) {
    protein.update(dt, player);
    if (protein.attached && player.detectShake(now)) {
      protein.detach(player);
      proteinDetachSound();
      protein = null;
      proteinSpawnTimer = 25; // next protein after shake-off
    } else if (!protein.attached && checkContactProtein(player, protein)) {
      protein.attach(player);
      proteinAttachSound();
    }
  } else {
    proteinSpawnTimer -= dt;
    if (proteinSpawnTimer <= 0) protein = spawnProtein(player.x, player.y);
  }

  // Cell contact
  for (const c of cells) {
    if (!c.active || !checkContact(player, c)) continue;
    const pNote = player.getActiveNote(c.x, c.y);
    const cNote = c.getActiveNote(player.x, player.y);
    const r     = roughness([pNote], [cNote], DEFAULT_TIMBRE);
    if (r < INFECTION_THRESHOLD) {
      c.active = false; c.flashTimer = 0.5;
      infectionFlash = 1;
      resolutionCadence();
      const newBpm = adjustTempo(+5);
      setMasterVolume(newBpm);
      setTimeout(() => {
        cells = cells.filter(x => x.active || x.flashTimer > 0);
        const fresh = spawnCell(player.x, player.y);
        cells.push(fresh);
        if (!committedCell || !committedCell.active) committedCell = fresh;
      }, 650);
    } else {
      bouncePlayer(player, c);
      dissonantStab();
      const newBpm = adjustTempo(-3);
      setMasterVolume(newBpm);
      if (newBpm <= 60 && !dead) triggerDeath();
    }
  }

  const activePlayerNote = committedCell
    ? player.getActiveNote(committedCell.x, committedCell.y)
    : player.getActiveNote(0, 0);

  infectionFlash = Math.max(0, infectionFlash - dt * 2.5);

  clear(ctx);

  ctx.save();
  ctx.translate(canvas.width / 2 - player.x, canvas.height / 2 - player.y);

  for (const c of cells) {
    drawGlow(ctx, player, c, committedCell === c ? state.roughness : 1);
    drawCell(ctx, c);
  }
  drawPlayer(ctx, player, activePlayerNote);
  if (protein) drawProtein(ctx, protein);

  ctx.restore();

  drawInfectionFlash(ctx, infectionFlash);
  if (DEBUG) drawDebug(ctx, state);

  requestAnimationFrame(loop);
}
