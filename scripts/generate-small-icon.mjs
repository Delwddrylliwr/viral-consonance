import { Resvg }         from '@resvg/resvg-js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── stave — fills the vertical canvas ────────────────────────────────────────
// Top line y=40, bottom y=472, spacing=108 px (4 gaps × 108 = 432 px span)
const staveY  = [40, 148, 256, 364, 472];
const staveX1 = 36, staveX2 = 476;

const staveLines = staveY.map(y =>
  `  <line x1="${staveX1}" y1="${y}" x2="${staveX2}" y2="${y}" stroke="#ff7722" stroke-width="9"/>`
).join('\n');

// ── minim: hollow left-pointing triangle on 2nd-lowest stave line (y=364) ────
// Equilateral triangle pointing left.
// Centroid at (triCx, triCy); tip at left, base edge vertical on the right.
const triSide = 84;
const triH    = triSide * Math.sqrt(3) / 2;   // ≈ 72.75
const triCx   = 260, triCy = staveY[3];        // second-lowest line

const tipX    = triCx - (2 * triH) / 3;        // left tip x ≈ 211.5
const baseX   = triCx + triH / 3;              // right base x ≈ 284.25
const halfS   = triSide / 2;                   // 42

const ptTip   = `${tipX.toFixed(1)},${triCy}`;
const ptTR    = `${baseX.toFixed(1)},${(triCy - halfS).toFixed(1)}`;
const ptBR    = `${baseX.toFixed(1)},${(triCy + halfS).toFixed(1)}`;

// ── stem: from top-right corner straight up to top stave line ─────────────────
const stemX  = baseX;
const stemY0 = triCy - halfS;   // top-right corner y ≈ 322
const stemY1 = staveY[0];       // top stave line y = 40

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background -->
  <rect width="512" height="512" rx="88" fill="#0d0d14"/>

  <!-- Stave — neon orange -->
${staveLines}

  <!-- Minim: hollow left-pointing triangle head on 2nd-lowest stave line -->
  <polygon points="${ptTip} ${ptTR} ${ptBR}" fill="none" stroke="white" stroke-width="13" stroke-linejoin="round"/>

  <!-- Minim: stem from top-right corner to top stave line -->
  <line x1="${stemX.toFixed(1)}" y1="${stemY0.toFixed(1)}" x2="${stemX.toFixed(1)}" y2="${stemY1}" stroke="white" stroke-width="12" stroke-linecap="round"/>
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
