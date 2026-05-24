import { Resvg }          from '@resvg/resvg-js';
import { writeFileSync }  from 'fs';
import { fileURLToPath }  from 'url';
import { dirname, join }  from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── geometry ────────────────────────────────────────────────────────────────
const cx = 256, cy = 256;
const baseR   = 130;   // virus circle radius
const amp     = 10;    // oscillation amplitude (±10 px)
const freq    = 8;     // full oscillations per revolution
const dblGap  = 13;    // gap (px) for the doubled inner line
const N       = 1440;  // 0.25° per sample → smooth

// ── stave rings (background, outside the virus body) ────────────────────────
// 5 concentric circles as a circular stave.  Spacing is symmetric: 12 px at
// the edges, 18 px adjacent to the middle ring.  The middle ring (r=206) sits
// exactly at the note-head radius, so the 8 spike quavers lie on the stave.
const ringRadii = [176, 188, 206, 224, 236];

// ── oscillating boundary path ───────────────────────────────────────────────
// r(t) = baseR + amp·sin(freq·t)
// Zero-crossings of sin(8t) land exactly at the 8 spike positions (multiples
// of π/4), so spikes sit on the neutral radius.  Peaks and troughs fall
// between spikes.
function buildBoundaryPath() {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = (2 * Math.PI * i) / N;
    const r = baseR + amp * Math.sin(freq * t);
    pts.push(
      `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`
    );
  }
  return pts.join(' ') + ' Z';
}

// ── doubled inner line (outward-bulge arcs only → semiquaver suggestion) ────
// Drawn wherever sin(freq·t) > 0 (the outward half-cycles between spikes).
// Gap of dblGap px keeps both lines visually distinct.
function buildDoubledPath() {
  let d = '', open = false;
  for (let i = 0; i <= N; i++) {
    const t   = (2 * Math.PI * i) / N;
    const sn  = Math.sin(freq * t);
    if (sn > 0.07) {           // small threshold avoids artefacts at crossings
      const r = baseR + amp * sn - dblGap;
      const x = (cx + r * Math.cos(t)).toFixed(2);
      const y = (cy + r * Math.sin(t)).toFixed(2);
      d += `${open ? 'L' : 'M'}${x},${y} `;
      open = true;
    } else {
      open = false;
    }
  }
  return d.trim();
}

const boundaryPath = buildBoundaryPath();
const doubledPath  = buildDoubledPath();

const staveRings = ringRadii.map(r =>
  `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff7722" stroke-width="2" opacity="0.65"/>`
).join('\n');

// ── spike: stem pointing up, note-head fully to the left of the stem ────────
const spikeGroup = `
    <g id="spike">
      <line x1="0" y1="0" x2="0" y2="-76" stroke="#44aaff" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="-13" cy="-76" rx="16" ry="10" transform="rotate(-25,-13,-76)" fill="#44aaff"/>
    </g>`;

// 8 spikes at 45° intervals; translate = point on circle edge, rotate = outward direction
const spikePlacements = [
  [256, 126,   0],
  [347.9, 164.1, 45],
  [386,   256,   90],
  [347.9, 347.9, 135],
  [256,   386,   180],
  [164.1, 347.9, 225],
  [126,   256,   270],
  [164.1, 164.1, 315],
].map(([tx, ty, rot]) =>
  `    <use xlink:href="#spike" href="#spike" transform="translate(${tx},${ty}) rotate(${rot})"/>`
).join('\n');

// ── bass clef ────────────────────────────────────────────────────────────────
const clefFontSize = 127;
const clefY        = 295;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">
  <defs>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    ${spikeGroup}
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="88" fill="#0d0d14"/>

  <!-- Virus body fill (uses oscillating boundary as shape) -->
  <path d="${boundaryPath}" fill="#04111c" stroke="none"/>

  <!-- Circular stave — 5 neon-orange rings in background; spikes drawn on top -->
${staveRings}

  <!-- 8 note-head spikes -->
  <g filter="url(#glow)">
${spikePlacements}
  </g>

  <!-- Oscillating boundary — outer stroke with glow -->
  <path d="${boundaryPath}" fill="none" stroke="#44aaff" stroke-width="5" filter="url(#glow)"/>

  <!-- Doubled inner arcs (outward-bulge sections → semiquaver visual) -->
  <path d="${doubledPath}" fill="none" stroke="#44aaff" stroke-width="3.5" opacity="0.88"/>

  <!-- Bass clef -->
  <text x="${cx}" y="${clefY}"
        text-anchor="middle"
        font-size="${clefFontSize}"
        fill="#44aaff"
        font-family="FreeSerif, serif"
        filter="url(#glow)">𝄢</text>
</svg>`;

// ── write SVG ────────────────────────────────────────────────────────────────
writeFileSync(join(root, 'icon.svg'), svg, 'utf8');
console.log('Wrote icon.svg');

// ── generate PNGs ────────────────────────────────────────────────────────────
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
