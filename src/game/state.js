export const DEBUG = true;

export const state = {
  tempo: 100,
  voiceCount: 0,
  roughness: 0,
  playerNote: null,
  cellNote: null,
  committedCellNote: null,
  nearestCellNote:   null,
  cellCount: 0,
  proteinCount: 0,
  cloneCount: 0,
  macrophageCount: 0,
  tcellCount: 0,
  immuneAlert: 0,
  bcellFamiliarity: 0,
  dead: false,
  rpmMultiplier: 1,
  lowFX: false,   // true → cheaper render path (set by the quality governor in main.js)
  frameMs: 16.7,  // smoothed real frame interval, ms
};
