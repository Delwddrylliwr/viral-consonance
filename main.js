import { initCanvas, clear, drawPlayer, drawCell, drawGlow, drawInfectionFlash } from './src/render/canvas.js';
import { drawDebug } from './src/render/debug.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM } from './src/audio/transport.js';
import { createPlayerVoice, createCellVoice, voiceCount } from './src/audio/synthesis.js';
import { roughness, DEFAULT_TIMBRE } from './src/audio/consonance.js';
import { Player, Cell } from './src/game/entities.js';
import { checkContact, bouncePlayer, spawnCell, INFECTION_THRESHOLD }
  from './src/game/contact.js';
import { resolutionCadence, dissonantStab } from './src/audio/synthesis.js';

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

let player, cell, playerVoice, cellVoice;
let infectionFlash = 0; // alpha countdown for screen flash

function init() {
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  player = new Player(cx, cy);
  cell   = new Cell(cx + 220, cy - 60);

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
  });
}

// Click-to-start overlay (required for Web Audio context)
document.getElementById('start').addEventListener('click', async () => {
  await Tone.start();
  startTransport(100);
  init();
  document.getElementById('start').remove();
  requestAnimationFrame(loop);
}, { once: true });

let last = 0;
function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.05);
  last = ts;

  player.update(dt, input, canvas.width, canvas.height);
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
        cell = spawnCell(canvas.width, canvas.height, player.x, player.y);
      }, 650);
    } else {
      // Bounce
      bouncePlayer(player, cell);
      dissonantStab();
    }
  }

  const activePlayerNote = player.getActiveNote(cell.x, cell.y);

  infectionFlash = Math.max(0, infectionFlash - dt * 2.5);

  clear(ctx);
  drawGlow(ctx, player, cell, state.roughness);
  drawCell(ctx, cell);
  drawPlayer(ctx, player, activePlayerNote);
  drawInfectionFlash(ctx, infectionFlash);

  if (DEBUG) drawDebug(ctx, state);

  requestAnimationFrame(loop);
}
