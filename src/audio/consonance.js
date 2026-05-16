/**
 * Sethares roughness model.
 *
 * roughness(chordA, chordB, timbre) -> number in [0, 1]
 *
 * chordA / chordB: arrays of frequencies in Hz (one per note)
 * timbre: array of relative amplitudes for each harmonic partial
 *         (index 0 = fundamental, index 1 = 2nd harmonic, …)
 *         defaults to [1, 0.5, 0.33, 0.25, 0.2, 0.17]
 */

export const DEFAULT_TIMBRE = [1, 0.5, 0.33, 0.25, 0.2, 0.17];

/**
 * Expand a single frequency into its harmonic partials.
 * Returns [{freq, amp}, …]
 */
function expandPartials(freq, timbre) {
  return timbre.map((amp, i) => ({ freq: freq * (i + 1), amp }));
}

/**
 * Raw (un-normalised) Sethares roughness between two sets of partials.
 */
function rawRoughness(partialsA, partialsB) {
  let total = 0;
  for (const { freq: f1, amp: a1 } of partialsA) {
    for (const { freq: f2, amp: a2 } of partialsB) {
      const s = 0.24 / (0.0207 * Math.min(f1, f2) + 18.96);
      const x = s * Math.abs(f1 - f2);
      total += a1 * a2 * (Math.exp(-3.5 * x) - Math.exp(-5.75 * x));
    }
  }
  return total;
}

// Normalisation reference: minor second A4–Bb4 (440 Hz, 466.16 Hz)
const REF_A = [440];
const REF_B = [466.16];
const _refPartialsA = REF_A.flatMap(f => expandPartials(f, DEFAULT_TIMBRE));
const _refPartialsB = REF_B.flatMap(f => expandPartials(f, DEFAULT_TIMBRE));
const REFERENCE_ROUGHNESS = rawRoughness(_refPartialsA, _refPartialsB);

/**
 * Compute normalised roughness in [0, 1] between two chords.
 *
 * @param {number[]} chordA - array of Hz
 * @param {number[]} chordB - array of Hz
 * @param {number[]} [timbre] - partial amplitudes
 * @returns {number} roughness in [0, 1]
 */
export function roughness(chordA, chordB, timbre = DEFAULT_TIMBRE) {
  const partialsA = chordA.flatMap(f => expandPartials(f, timbre));
  const partialsB = chordB.flatMap(f => expandPartials(f, timbre));
  const raw = rawRoughness(partialsA, partialsB);
  return Math.min(raw / REFERENCE_ROUGHNESS, 1);
}
