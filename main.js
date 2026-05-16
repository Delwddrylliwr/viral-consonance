import { initCanvas, clear, drawPlayer, drawCell, drawGlow } from './src/render/canvas.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM } from './src/audio/transport.js';
import { Player, Cell } from './src/game/entities.js';

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

let player, cell;

function init() {
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  player = new Player(cx, cy);
  cell   = new Cell(cx + 220, cy - 60);
}

// Click-to-start overlay (required for Web Audio context)
document.getElementById('start').addEventListener('click', async () => {
  await Tone.start();
  startTransport(100);
  onBeat(() => { state.tempo = getBPM(); });
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

  const activePlayerNote = player.getActiveNote(cell.x, cell.y);
  const activeCellNote   = cell.getActiveNote(player.x, player.y);

  clear(ctx);
  drawGlow(ctx, player, cell, state.roughness);
  drawCell(ctx, cell);
  drawPlayer(ctx, player, activePlayerNote);

  state.playerNote = activePlayerNote;
  state.cellNote   = activeCellNote;

  requestAnimationFrame(loop);
}
