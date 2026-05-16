let _voiceCount = 0;
export const voiceCount = () => _voiceCount;

// Sustained tone for the player's active note
export function createPlayerVoice() {
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.08, decay: 0.1, sustain: 0.7, release: 0.6 },
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

// V → I cadence in C major: G major triad (with 7th) → C major triad
export function resolutionCadence() {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.55, release: 1.2 },
  }).toDestination();
  poly.volume.value = -10;

  const now = Tone.now();
  // G dominant 7th → C major (strong resolution feel)
  poly.triggerAttackRelease(['G3', 'B3', 'D4', 'F4'], '4n', now);
  poly.triggerAttackRelease(['C3', 'E4', 'G4', 'C5'], '2n', now + 0.6);
  _voiceCount += 4;
  setTimeout(() => {
    _voiceCount = Math.max(0, _voiceCount - 4);
    poly.dispose();
  }, 3500);
}

// Descending glide played when a cell expires naturally — quiet, deflating
export function naturalDeathTone() {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.05, decay: 0.0, sustain: 1.0, release: 0.5 },
  }).toDestination();
  synth.volume.value = -22;
  _voiceCount++;
  const now = Tone.now();
  synth.triggerAttack('C4', now);
  synth.frequency.rampTo('G3', 0.5, now);
  synth.triggerRelease(now + 0.5);
  setTimeout(() => {
    _voiceCount = Math.max(0, _voiceCount - 1);
    synth.dispose();
  }, 2000);
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
