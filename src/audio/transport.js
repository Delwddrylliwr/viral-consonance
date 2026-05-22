export function startTransport(bpm = 100) {
  Tone.getTransport().bpm.value = bpm;
  Tone.getTransport().start();
}

export function onBeat(cb) {
  Tone.getTransport().scheduleRepeat(cb, '4n');
}

export function getBPM() {
  return Tone.getTransport().bpm.value;
}

export function setTempo(bpm) {
  Tone.getTransport().bpm.value = bpm;
}

// Returns the new BPM after applying delta, floored at 60. Caller checks result <= 60 for death.
export function adjustTempo(delta) {
  const next = Math.max(60, getBPM() + delta);
  setTempo(next);
  return next;
}
