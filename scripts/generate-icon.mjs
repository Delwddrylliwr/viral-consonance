import { Resvg }          from '@resvg/resvg-js';
import { writeFileSync }  from 'fs';
import { fileURLToPath }  from 'url';
import { dirname, join }  from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── geometry ──────────────────────────────────────────────────────────────────
const cx = 256, cy = 256;
const baseR  = 128;   // 85 × 1.5
const amp    = 15;    // 10 × 1.5 — oscillation ±15 px
const freq   = 3;
const dblGap = 25;    // 14 × ~1.5 — gap between doubled lines
const N      = 1440;

// ── stave rings ───────────────────────────────────────────────────────────────
// Evenly spaced at 48 px intervals.  Rings 1–2 (r=60, r=108) sit inside the
// virus body; rings 3–5 (r=156, r=204, r=252) surround it.  The 4th ring
// (r=204) aligns with the note-head radius so the quavers sit on it.
const staveRadii = [60, 108, 156, 204, 252];

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
  `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff7722" stroke-width="3.5" opacity="0.70"/>`
).join('\n');

// ── downward-pointing triangle ────────────────────────────────────────────────
// Narrow isosceles triangle — short top edge, long V-sides pointing down.
// triTopDx controls how wide the top edge is (smaller = more V-like).
const R_tri    = 90;
const triTopY  = cy - R_tri / 2;                // 211
const triTopDx = 44;                            // narrow top edge (vs full ~78)
const triDx    = R_tri * Math.sqrt(3) / 2;      // 77.9 — used for V-side lines
const triL     = `${(cx - triTopDx).toFixed(1)},${triTopY.toFixed(1)}`;
const triR     = `${(cx + triTopDx).toFixed(1)},${triTopY.toFixed(1)}`;
const triBot   = `${cx},${cy + R_tri}`;

// ── 4 spikes — short stems, bold heads, radiating to the four corners ─────────
const d45 = baseR / Math.SQRT2;   // ≈ 90.5

const spikeGroup = `
    <g id="spike">
      <line x1="0" y1="0" x2="0" y2="-75" stroke="#44aaff" stroke-width="9" stroke-linecap="round"/>
      <ellipse cx="-23" cy="-75" rx="30" ry="20" transform="rotate(-25,-23,-75)" fill="#44aaff"/>
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

  <!-- Virus body fill -->
  <path d="${boundaryPath}" fill="#04111c" stroke="none"/>

  <!-- Circular stave — 5 neon-orange rings drawn after fill so inner rings
       show against the dark virus body; outer rings show on the background -->
${staveRings}

  <!-- Downward-pointing white triangle; V-sides bolder than top edge -->
  <polygon points="${triL} ${triR} ${triBot}" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/>
  <line x1="${(cx - triTopDx).toFixed(1)}" y1="${triTopY.toFixed(1)}" x2="${cx}" y2="${cy + R_tri}" stroke="white" stroke-width="18" stroke-linecap="round"/>
  <line x1="${(cx + triTopDx).toFixed(1)}" y1="${triTopY.toFixed(1)}" x2="${cx}" y2="${cy + R_tri}" stroke="white" stroke-width="18" stroke-linecap="round"/>

  <!-- 4 quaver spikes radiating toward the four corners -->
  <g filter="url(#glow)">
${spikePlacements}
  </g>

  <!-- Oscillating boundary — bold cyan with glow -->
  <path d="${boundaryPath}" fill="none" stroke="#44aaff" stroke-width="10" filter="url(#glow)"/>

  <!-- Doubled inner arcs (semiquaver sections) -->
  <path d="${doubledPath}" fill="none" stroke="#44aaff" stroke-width="7" opacity="0.90"/>
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
