// Equal-temperament frequencies, A4 = 440 Hz
const C4 = 261.63, D4 = 293.66, E4 = 329.63,
      F4 = 349.23, G4 = 392.00, A4 = 440.00,
      B4 = 493.88, C5 = 523.25;

// C major scale degrees 0–6 in octaves 4 and 5
const SCALE = [
  [C4, D4, E4, F4, G4, A4, B4],
  [C5, C5 * 293.66 / 261.63, C5 * 329.63 / 261.63,
   C5 * 349.23 / 261.63, C5 * 392.00 / 261.63,
   C5 * 440.00 / 261.63, C5 * 493.88 / 261.63],
];

export function scaleDegreeToHz(degree, octave = 4) {
  return SCALE[octave - 4][degree % 7];
}

// Named notes used in gameplay
export const PLAYER_CHORD = [C4, E4, G4];        // C–E–G
export const CELL_MOTIF   = [C4, E4, G4, C5];    // C–E–G–C'

// Note name for debug display
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const OCTAVE_REF = 261.63; // C4
export function hzToName(hz) {
  if (!hz) return '?';
  const semitones = Math.round(12 * Math.log2(hz / OCTAVE_REF));
  const note = ((semitones % 12) + 12) % 12;
  const oct  = 4 + Math.floor(semitones / 12);
  return NOTE_NAMES[note] + oct;
}
