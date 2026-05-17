import { hzToName } from '../audio/scale.js';

export function drawDebug(ctx, state) {
  const lines = [
    `TEMPO:     ${state.tempo.toFixed(1)} BPM`,
    `VOICES:    ${state.voiceCount}/8`,
    `ROUGHNESS: ${state.roughness.toFixed(3)}`,
    `PLAYER:    ${hzToName(state.playerNote)}`,
    `COMMITTED: ${hzToName(state.committedCellNote)}`,
    `NEAREST:   ${hzToName(state.nearestCellNote)}`,
    `CELLS:     ${state.cellCount}`,
    `PROTEINS:  ${state.proteinCount}`,
    `CLONES:    ${state.cloneCount}`,
  ];

  ctx.save();
  ctx.font = '12px monospace';
  ctx.fillStyle = '#555';
  lines.forEach((line, i) => {
    ctx.fillText(line, 12, 20 + i * 16);
  });
  ctx.restore();
}
