import { initCanvas, clear, drawCircle } from './src/render/canvas.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM } from './src/audio/transport.js';

const canvas = initCanvas();
const ctx    = canvas.getContext('2d');

// Click-to-start overlay (required for Web Audio context)
document.getElementById('start').addEventListener('click', async () => {
  await Tone.start();
  startTransport(100);
  onBeat(() => { state.tempo = getBPM(); });
  document.getElementById('start').remove();
  requestAnimationFrame(loop);
}, { once: true });

let last = 0;
function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.05);
  last = ts;

  clear(ctx);

  // Placeholder circles — replaced in later commits
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;
  drawCircle(ctx, cx, cy, 30, '#4af', 0.9);          // player
  drawCircle(ctx, cx + 200, cy, 45, '#f84', 0.9);    // cell

  requestAnimationFrame(loop);
}
