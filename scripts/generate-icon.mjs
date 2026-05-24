import { Resvg }          from '@resvg/resvg-js';
import { writeFileSync }  from 'fs';
import { fileURLToPath }  from 'url';
import { dirname, join }  from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── geometry ──────────────────────────────────────────────────────────────────
const cx = 256, cy = 256;
const baseR  = 85;    // virus radius — smaller now there's no clef inside
const amp    = 10;    // oscillation ±10 px
const freq   = 4;     // 4 oscillations/rev, matching 4 spikes
const dblGap = 14;    // radial gap between doubled semiquaver lines
const N      = 1440;  // 0.25° per sample

// ── stave rings ───────────────────────────────────────────────────────────────
// Symmetric: 10 px tight spacing at edges, 18 px wide gap flanking the middle
// ring.  Middle ring (r=136) is at the note-head radius, so each quaver sits
// on the staff's central line with two bracket lines either side.
const staveRadii = [108, 118, 136, 154, 164];

// ── oscillating boundary ──────────────────────────────────────────────────────
// sin(4t) is zero exactly at the 4 spike angles (t = π/4, 3π/4, 5π/4, 7π/4),
// so spikes emerge from the neutral radius and peaks fall between spikes.
function buildBoundaryPath() {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = (2 * Math.PI * i) / N;
    const r = baseR + amp * Math.sin(freq * t);
    pts.push(`${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`);
  }
  return pts.join(' ') + ' Z';
}

// ── doubled inner arcs (outward half-cycles → semiquaver visual) ──────────────
function buildDoubledPath() {
  let d = '', open = false;
  for (let i = 0; i <= N; i++) {
    const t  = (2 * Math.PI * i) / N;
    const sn = Math.sin(freq * t);
    if (sn > 0.07) {
      const r = baseR + amp * sn - dblGap;
      d += `${open ? 'L' : 'M'}${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)} `;
      open = true;
    } else {
      open = false;
    }
  }
  return d.trim();
}

const boundaryPath = buildBoundaryPath();
const doubledPath  = buildDoubledPath();

const staveRings = staveRadii.map(r =>
  `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff7722" stroke-width="2.5" opacity="0.70"/>`
).join('\n');

// ── 4 spikes — short stems, bold heads, radiating to the four corners ─────────
// Each spike sits on the circle at 45°/135°/225°/315° (the diagonal positions).
// baseR / √2 ≈ 60.1 px offset along each axis.
const d45 = baseR / Math.SQRT2;   // ≈ 60.1

const spikeGroup = `
    <g id="spike">
      <line x1="0" y1="0" x2="0" y2="-50" stroke="#44aaff" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="-15" cy="-50" rx="20" ry="13" transform="rotate(-25,-15,-50)" fill="#44aaff"/>
    </g>`;

const spikePlacements = [
  [cx + d45, cy - d45,  45],   // → top-right corner
  [cx + d45, cy + d45, 135],   // → bottom-right corner
  [cx - d45, cy + d45, 225],   // → bottom-left corner
  [cx - d45, cy - d45, 315],   // → top-left corner
].map(([tx, ty, rot]) =>
  `    <use xlink:href="#spike" href="#spike" transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) rotate(${rot})"/>`
).join('\n');

// ── SVG ───────────────────────────────────────────────────────────────────────
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">
  <defs>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    ${spikeGroup}
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="88" fill="#0d0d14"/>

  <!-- Circular stave — 5 neon-orange rings; middle ring at note-head radius -->
${staveRings}

  <!-- Virus body fill -->
  <path d="${boundaryPath}" fill="#04111c" stroke="none"/>

  <!-- 4 quaver spikes radiating toward the four corners -->
  <g filter="url(#glow)">
${spikePlacements}
  </g>

  <!-- Oscillating boundary — bold cyan with glow -->
  <path d="${boundaryPath}" fill="none" stroke="#44aaff" stroke-width="7" filter="url(#glow)"/>

  <!-- Doubled inner arcs (semiquaver sections) -->
  <path d="${doubledPath}" fill="none" stroke="#44aaff" stroke-width="5" opacity="0.90"/>
</svg>`;

// ── output ────────────────────────────────────────────────────────────────────
writeFileSync(join(root, 'icon.svg'), svg, 'utf8');
console.log('Wrote icon.svg');

const sizes = [
  { size: 512, name: 'icon-512.png'        },
  { size: 192, name: 'icon-192.png'        },
  { size: 180, name: 'apple-touch-icon.png'},
  { size:  32, name: 'favicon-32.png'      },
  { size:  16, name: 'favicon-16.png'      },
];

for (const { size, name } of sizes) {
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: true },
    fitTo: { mode: 'width', value: size },
  });
  writeFileSync(join(root, name), resvg.render().asPng());
  console.log(`  → ${name} (${size}px)`);
}
