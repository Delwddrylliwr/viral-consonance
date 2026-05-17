let _voiceCount = 0;
export const voiceCount = () => _voiceCount;

// Shared reverb for warmth — created lazily on first use.
// Falls back to destination directly if OfflineAudioContext fails (e.g. some iOS/iframe envs).
let _reverb = null;
function getReverb() {
  if (!_reverb) {
    try {
      _reverb = new Tone.Reverb({ decay: 1.8, wet: 0.25 }).toDestination();
    } catch (e) {
      console.warn('Reverb unavailable, using dry signal:', e);
      _reverb = Tone.getDestination();
    }
  }
  return _reverb;
}

// Sustained tone for the player's active note
export function createPlayerVoice() {
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.08, decay: 0.1, sustain: 0.7, release: 0.6 },
  }).connect(getReverb());
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
    // Decay extended so the note rings for ~560 ms — long enough to hear
    // dissonance against the player chord without overlapping the next beat.
    envelope: { attack: 0.01, decay: 0.45, sustain: 0.0, release: 0.1 },
  }).toDestination();
  synth.volume.value = -12;

  return {
    trigger(hz) {
      _voiceCount++;
      synth.triggerAttackRelease(hz, '4n'); // quarter-note hold lets decay complete
      setTimeout(() => { _voiceCount = Math.max(0, _voiceCount - 1); }, 700);
    },
  };
}

// V → I cadence in C major: G major triad (with 7th) → C major triad
export function resolutionCadence() {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.55, release: 1.2 },
  }).connect(getReverb());
  poly.volume.value = -8;

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

// Master volume tracks tempo: quiet at floor (60 BPM), full at ceiling (160 BPM)
export function setMasterVolume(bpm) {
  const db = -18 + ((bpm - 60) / 100) * 18; // -18 dB → 0 dB
  Tone.getDestination().volume.rampTo(db, 0.5);
}

// Brief high dissonance ping when a complement protein attaches
export function proteinAttachSound() {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 },
  }).toDestination();
  poly.volume.value = -14;
  poly.triggerAttackRelease(['E5', 'F5'], '16n');
  setTimeout(() => poly.dispose(), 600);
}

// Short ascending run when a protein is shaken off
export function proteinDetachSound() {
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.05 },
  }).toDestination();
  synth.volume.value = -14;
  const now = Tone.now();
  ['C5', 'E5', 'G5'].forEach((n, i) => synth.triggerAttackRelease(n, '32n', now + i * 0.06));
  setTimeout(() => synth.dispose(), 800);
}

// Ramp master volume to silence over 4 s then call onComplete
export function deathSequence(onComplete) {
  Tone.getDestination().volume.rampTo(-60, 4);
  setTimeout(onComplete, 4000);
}

// Ambient arpeggio voice for nearby clones (max 2 simultaneous via PolySynth)
export function createCloneVoice() {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.0, release: 0.08 },
  }).toDestination();
  synth.volume.value = -22;

  return {
    trigger(hz) {
      _voiceCount++;
      synth.triggerAttackRelease(hz, '8n');
      setTimeout(() => { _voiceCount = Math.max(0, _voiceCount - 1); }, 500);
    },
  };
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
