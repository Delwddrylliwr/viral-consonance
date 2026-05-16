let _voiceCount = 0;
export const voiceCount = () => _voiceCount;

// Sustained tone for the player's active note
export function createPlayerVoice() {
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.08, decay: 0.1, sustain: 0.7, release: 0.4 },
  }).toDestination();
  synth.volume.value = -18;

  let started = false;

  return {
    start(hz) {
      if (started) return;
      synth.triggerAttack(hz);
      _voiceCount++;
      started = true;
    },
    setFreq(hz) {
      if (!started) { this.start(hz); return; }
      synth.frequency.rampTo(hz, 0.05);
    },
    stop() {
      if (!started) return;
      synth.triggerRelease();
      _voiceCount--;
      started = false;
    },
  };
}

// Short pluck for the cell's beat-triggered notes
export function createCellVoice() {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.0, release: 0.1 },
  }).toDestination();
  synth.volume.value = -12;

  return {
    trigger(hz) {
      _voiceCount++;
      synth.triggerAttackRelease(hz, '8n');
      setTimeout(() => { _voiceCount = Math.max(0, _voiceCount - 1); }, 400);
    },
  };
}

// V → I cadence in C major: G major triad → C major triad, one beat each
export function resolutionCadence() {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.8 },
  }).toDestination();
  poly.volume.value = -10;

  const now = Tone.now();
  poly.triggerAttackRelease(['G4', 'B4', 'D5'], '4n', now);
  poly.triggerAttackRelease(['C4', 'E4', 'G4'], '4n', now + 0.6);
  _voiceCount += 3;
  setTimeout(() => {
    _voiceCount = Math.max(0, _voiceCount - 3);
    poly.dispose();
  }, 2500);
}

// Short dissonant minor-second stab
export function dissonantStab() {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0.0, release: 0.05 },
  }).toDestination();
  poly.volume.value = -8;

  poly.triggerAttackRelease(['C4', 'Db4'], '16n');
  _voiceCount += 2;
  setTimeout(() => {
    _voiceCount = Math.max(0, _voiceCount - 2);
    poly.dispose();
  }, 500);
}
