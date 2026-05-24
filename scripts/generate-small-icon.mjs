import { Resvg }         from '@resvg/resvg-js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── stave ─────────────────────────────────────────────────────────────────────
const staveY  = [182, 222, 262, 302, 342];   // 5 lines, 40 px spacing
const staveX1 = 46, staveX2 = 488;

const staveLines = staveY.map(y =>
  `  <line x1="${staveX1}" y1="${y}" x2="${staveX2}" y2="${y}" stroke="#ff7722" stroke-width="9"/>`
).join('\n');

// ── quaver: hollow downward-pointing triangle on middle stave line ─────────────
const qx   = 376;
const qy   = staveY[2];          // middle line y = 262
const side = 66;
const h    = side * Math.sqrt(3) / 2;   // ≈ 57.2
const topY = qy - h / 3;                // centroid at qy → topY ≈ 242.9
const halfW = side / 2;                 // 33

const qTL = `${(qx - halfW).toFixed(1)},${topY.toFixed(1)}`;
const qTR = `${(qx + halfW).toFixed(1)},${topY.toFixed(1)}`;
const qBot = `${qx},${(topY + h).toFixed(1)}`;

// ── stem: from right top corner upward ────────────────────────────────────────
const sx  = qx + halfW;    // 409
const sy1 = 114;           // stem top — above top stave line (y=182)

// ── flag: single bezier curving right from stem top ───────────────────────────
const flag = `M ${sx.toFixed(1)} ${sy1} ` +
             `C ${(sx + 68).toFixed(1)} ${sy1 + 14} ` +
             `${(sx + 76).toFixed(1)} ${sy1 + 74} ` +
             `${(sx + 18).toFixed(1)} ${sy1 + 108}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background -->
  <rect width="512" height="512" rx="88" fill="#0d0d14"/>

  <!-- Stave — neon orange -->
${staveLines}

  <!-- Bass clef — neon blue -->
  <text x="48" y="338" font-family="FreeSerif" font-size="178" fill="#44aaff">𝄢</text>

  <!-- Quaver: hollow downward-triangle head -->
  <polygon points="${qTL} ${qTR} ${qBot}" fill="none" stroke="white" stroke-width="13" stroke-linejoin="round"/>

  <!-- Quaver: stem -->
  <line x1="${sx.toFixed(1)}" y1="${topY.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${sy1}" stroke="white" stroke-width="12" stroke-linecap="round"/>

  <!-- Quaver: flag -->
  <path d="${flag}" fill="none" stroke="white" stroke-width="12" stroke-linecap="round"/>
</svg>`;

// ── output ────────────────────────────────────────────────────────────────────
writeFileSync(join(root, 'small-icon.svg'), svg, 'utf8');
console.log('Wrote small-icon.svg');

const sizes = [
  { size: 512, name: 'small-icon-preview.png' },
  { size: 32,  name: 'favicon-32.png'         },
  { size: 16,  name: 'favicon-16.png'         },
];

for (const { size, name } of sizes) {
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: true },
    fitTo: { mode: 'width', value: size },
  });
  writeFileSync(join(root, name), resvg.render().asPng());
  console.log(`  → ${name} (${size}px)`);
}
