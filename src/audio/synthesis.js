let _voiceCount = 0;
export const voiceCount = () => _voiceCount;

// Stub implementations replaced in commit 4
export function createPlayerVoice() {
  return { setFreq: () => {}, start: () => {}, stop: () => {} };
}

export function createCellVoice() {
  return { trigger: () => {} };
}

export function resolutionCadence() {}
export function dissonantStab()     {}
