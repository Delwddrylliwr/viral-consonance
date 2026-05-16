import { initCanvas, clear, drawPlayer, drawCell, drawGlow, drawInfectionFlash } from './src/render/canvas.js';
import { drawDebug } from './src/render/debug.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM } from './src/audio/transport.js';
import { createPlayerVoice, createCellVoice, voiceCount } from './src/audio/synthesis.js';
import { roughness, DEFAULT_TIMBRE } from './src/audio/consonance.js';
import { Player, Cell } from './src/game/entities.js';
import { checkContact, bouncePlayer, spawnCell, INFECTION_THRESHOLD }
  from './src/game/contact.js';
import { resolutionCadence, dissonantStab, naturalDeathTone } from './src/audio/synthesis.js';

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

// Touch input: direction is computed from the touch position relative to canvas centre
function handleTouch(e) {
  e.preventDefault();
  if (e.touches.length === 0) {
    input.up = input.down = input.left = input.right = false;
    return;
  }
  const t    = e.touches[0];
  const dx   = t.clientX - canvas.width  / 2;
  const dy   = t.clientY - canvas.height / 2;
  const dead = 20; // px deadzone — no movement when touching near centre
  input.right = dx >  dead;
  input.left  = dx < -dead;
  input.down  = dy >  dead;
  input.up    = dy < -dead;
}
canvas.addEventListener('touchstart',  handleTouch, { passive: false });
canvas.addEventListener('touchmove',   handleTouch, { passive: false });
canvas.addEventListener('touchend',    handleTouch, { passive: false });
canvas.addEventListener('touchcancel', handleTouch, { passive: false });

let player, cell, playerVoice, cellVoice;
let infectionFlash = 0; // alpha countdown for screen flash

function init() {
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  player = new Player(cx, cy);
  cell   = new Cell(cx + 220, cy - 60, 'easy');

  playerVoice = createPlayerVoice();
  cellVoice   = createCellVoice();

  onBeat(() => {
    state.tempo = getBPM();

    const pNote = player.getActiveNote(cell.x, cell.y);
    const cNote = cell.getActiveNote(player.x, player.y);

    cellVoice.trigger(cNote);
    playerVoice.setFreq(pNote);

    state.roughness  = roughness([pNote], [cNote], DEFAULT_TIMBRE);
    state.playerNote = pNote;
    state.cellNote   = cNote;
    state.voiceCount = voiceCount();

    // Natural lifetime: decrement and expire
    if (cell.active) {
      cell.beatsLeft--;
      if (cell.beatsLeft <= 0) {
        cell.active     = false;
        cell.dyingTimer = 0.8;
        naturalDeathTone();
        setTimeout(() => {
          cell = spawnCell(player.x, player.y);
        }, 900);
      }
    }

    state.beatsLeft = cell.beatsLeft;
  });
}

// Click/tap-to-start overlay (required for Web Audio context).
// 'click' is used because mobile browsers reliably synthesise it from touch;
// pointerdown can fire before the gesture is confirmed as intentional.
async function startGame() {
  const startEl = document.getElementById('start');
  const label   = startEl.querySelector('span');
  try {
    label.textContent = 'starting…';
    await Tone.start();
    startTransport(100);
    init();
    startEl.remove();
    requestAnimationFrame(loop);
  } catch (err) {
    // Show the error visibly on screen so it can be read on a touch device
    label.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
    console.error(err);
  }
}
document.getElementById('start').addEventListener('click', startGame, { once: true });

let last = 0;
function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.05);
  last = ts;

  player.update(dt, input);
  cell.update(dt);

  // Contact resolution (guard against re-triggering while cell is flashing)
  if (cell.active && checkContact(player, cell)) {
    const r = roughness(
      [player.getActiveNote(cell.x, cell.y)],
      [cell.getActiveNote(player.x, player.y)],
      DEFAULT_TIMBRE,
    );
    if (r < INFECTION_THRESHOLD) {
      // Infection
      cell.active     = false;
      cell.flashTimer = 0.5;
      infectionFlash  = 1;
      resolutionCadence();
      setTimeout(() => {
        cell = spawnCell(player.x, player.y);
      }, 650);
    } else {
      // Bounce — knockback scales with roughness
      bouncePlayer(player, cell, r);
      dissonantStab();
    }
  }

  const activePlayerNote = player.getActiveNote(cell.x, cell.y);

  infectionFlash = Math.max(0, infectionFlash - dt * 2.5);

  clear(ctx);

  // Camera: keep player centred, move world around them
  ctx.save();
  ctx.translate(
    canvas.width  / 2 - player.x,
    canvas.height / 2 - player.y,
  );
  drawGlow(ctx, player, cell, state.roughness);
  drawCell(ctx, cell);
  drawPlayer(ctx, player, activePlayerNote);
  ctx.restore();

  // Screen-space overlays (not affected by camera)
  drawInfectionFlash(ctx, infectionFlash);
  if (DEBUG) drawDebug(ctx, state);

  requestAnimationFrame(loop);
}
