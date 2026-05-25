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

// Chorus sits between the player synth and the reverb.
// depth starts at 0 (dry) and is driven upward by clone count.
let _chorus = null;
function getChorus() {
  if (!_chorus) {
    _chorus = new Tone.Chorus({ frequency: 0.4, delayTime: 3.5, depth: 0, spread: 180 })
      .connect(getReverb());
    _chorus.start();
  }
  return _chorus;
}

export function setChorusDepth(depth) {
  if (_chorus) _chorus.depth = depth;
}

// Sustained tone for the player's active note
export function createPlayerVoice() {
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.08, decay: 0.1, sustain: 0.7, release: 0.6 },
  }).connect(getChorus());
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
    trigger(hz, volumeDb = -12) {
      synth.volume.value = volumeDb;
      _voiceCount++;
      synth.triggerAttackRelease(hz, '4n'); // quarter-note hold lets decay complete
      setTimeout(() => { _voiceCount = Math.max(0, _voiceCount - 1); }, 700);
    },
  };
}

// Contact sting: the two notes that coincided, then the player chord as resolution
export function resolutionCadence(contactNotes, playerChord) {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.15, release: 0.5 },
  }).connect(getReverb());
  poly.volume.value = -20;

  const now = Tone.now();
  poly.triggerAttackRelease(contactNotes, '8n', now);
  poly.triggerAttackRelease(playerChord,  '8n', now + 0.25);
  _voiceCount += 2;
  setTimeout(() => {
    _voiceCount = Math.max(0, _voiceCount - 2);
    poly.dispose();
  }, 2000);
}

// Master volume tracks tempo: -18 dB at 60 BPM, reaches 0 dB at 160 BPM and stays there.
export function setMasterVolume(bpm) {
  const db = Math.min(0, -18 + ((bpm - 60) / 100) * 18);
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
export function dissonantStab(noteA, noteB) {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0.0, release: 0.05 },
  }).toDestination();
  poly.volume.value = -8;

  poly.triggerAttackRelease([noteA, noteB], '16n');
  _voiceCount += 2;
  setTimeout(() => {
    _voiceCount = Math.max(0, _voiceCount - 2);
    poly.dispose();
  }, 500);
}

// Alarming low growl when a macrophage latches onto the player
export function playMacrophageAttach() {
  const synth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.02, decay: 0.6, sustain: 0.4, release: 1.0 },
  }).toDestination();
  synth.volume.value = -8;
  synth.triggerAttackRelease('Bb1', '4n');
  setTimeout(() => synth.dispose(), 2500);
}

// Low thud when a macrophage consumes a clone
export function playMacrophageConsume() {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.06, octaves: 5,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
  }).toDestination();
  synth.volume.value = -26;
  synth.triggerAttackRelease('G0', '4n');
  setTimeout(() => synth.dispose(), 600);
}

// Ascending shimmer when player chord mutates — distinct from resolution cadence
export function playMutationSound() {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.03, decay: 0.5, sustain: 0.3, release: 1.0 },
  }).connect(getReverb());
  poly.volume.value = -9;
  const now = Tone.now();
  poly.triggerAttackRelease(['C5', 'G5'], '8n', now);
  poly.triggerAttackRelease(['E5', 'B5'], '8n', now + 0.12);
  poly.triggerAttackRelease(['C6'],       '8n', now + 0.24);
  _voiceCount += 2;
  setTimeout(() => { _voiceCount = Math.max(0, _voiceCount - 2); poly.dispose(); }, 2500);
}

// Tritone stab when an antibody latches onto the player
export function playAntibodyAttach() {
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 },
  }).toDestination();
  poly.volume.value = -14;
  poly.triggerAttackRelease(['C4', 'F#4'], '16n');
  setTimeout(() => poly.dispose(), 600);
}

// Escalating tick as neutrophil fuse counts down (beatNum 1–4)
export function playNeutrophilTick(beatNum) {
  const synth = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
  }).toDestination();
  synth.volume.value = -24 + beatNum * 3;
  synth.triggerAttackRelease('G2', '32n');
  setTimeout(() => synth.dispose(), 300);
}

// Burst of noise when neutrophil explodes
export function playNeutrophilExplode() {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.08 },
  }).toDestination();
  noise.volume.value = -12;
  noise.triggerAttackRelease('8n');
  setTimeout(() => noise.dispose(), 500);
}

// Arpeggiate the player's peak chord decelerating from peakBpm to rest, then a held bloom.
// Restores master volume from death-sequence silence.
export function scoreRevealSound(chord, peakBpm) {
  Tone.getDestination().volume.rampTo(-10, 1.0);

  const arpSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.03, decay: 0.3, sustain: 0.0, release: 1.5 },
  }).connect(getReverb());
  arpSynth.volume.value = -12;

  const bloomSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.25, decay: 1.5, sustain: 0.1, release: 3.0 },
  }).connect(getReverb());
  bloomSynth.volume.value = -16;

  // Start at peak-BPM note interval, decelerate to 0.8 s/note via geometric interpolation.
  // If peakBpm is at or below base tempo, all intervals stay equal (no deceleration needed).
  const startInterval = 60 / Math.max(peakBpm, 60);
  const endInterval   = Math.max(startInterval, 0.8);
  const noteSeq = [...chord, ...chord, ...chord]; // 3 passes of the 3-note chord

  const times = [0];
  for (let i = 0; i < noteSeq.length - 1; i++) {
    const progress = i / (noteSeq.length - 2); // 0 → 1 across 8 gaps
    const interval = startInterval * Math.pow(endInterval / startInterval, progress);
    times.push(times[times.length - 1] + interval);
  }

  const now = Tone.now() + 0.2;
  noteSeq.forEach((hz, i) => {
    arpSynth.triggerAttackRelease(hz, 0.08, now + times[i]);
  });

  // All chord notes together after the arpeggio settles
  const bloomTime = now + times[times.length - 1] + endInterval;
  bloomSynth.triggerAttackRelease(chord, 2.5, bloomTime);

  const cleanupMs = (bloomTime - now + 8) * 1000;
  setTimeout(() => { arpSynth.dispose(); bloomSynth.dispose(); }, cleanupMs);
}
