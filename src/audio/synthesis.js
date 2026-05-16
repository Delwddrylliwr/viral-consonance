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

// Approximate virtual fundamental: find the simplest integer ratio n:m for
// hi/lo (n,m ≤ 8), then return lo/m — the implied GCD root below both notes.
function virtualFundamental(f1, f2) {
  const lo = Math.min(f1, f2);
  const hi = Math.max(f1, f2);
  const ratio = hi / lo;
  let bestN = 2, bestM = 1, bestErr = Infinity;
  for (let n = 2; n <= 8; n++) {
    for (let m = 1; m < n; m++) {
      const err = Math.abs(ratio - n / m);
      if (err < bestErr) { bestErr = err; bestN = n; bestM = m; }
    }
  }
  return lo / bestM;
}

// Quiet chime: virtual fundamental + overtone stacks of both contact notes
export function resolutionCadence(pNote, cNote) {
  const root = virtualFundamental(pNote, cNote);

  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.25, sustain: 0.0, release: 0.35 },
  }).toDestination();
  poly.volume.value = -20;

  const now = Tone.now();
  poly.triggerAttackRelease(root, '4n', now);
  poly.triggerAttackRelease(
    [pNote * 2, pNote * 3, cNote * 2, cNote * 3],
    '8n',
    now + 0.05,
  );

  _voiceCount += 5;
  setTimeout(() => {
    _voiceCount = Math.max(0, _voiceCount - 5);
    poly.dispose();
  }, 1500);
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
