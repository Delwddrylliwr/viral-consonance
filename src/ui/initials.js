// Arcade-style initials entry. Pure state driven by abstract actions
// ('up' | 'down' | 'left' | 'right' | 'confirm') so keys, pointer or a
// gamepad can all feed it.

export const CHARSET    = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-';
export const SLOT_COUNT = 3;
export const END_SLOT   = SLOT_COUNT; // cursor position of the "END" button

export function createInitials() {
  return { chars: Array(SLOT_COUNT).fill(0), cursor: 0, done: false };
}

export function applyAction(entry, action) {
  if (entry.done) return entry;
  const n      = CHARSET.length;
  const onSlot = entry.cursor < SLOT_COUNT;
  switch (action) {
    case 'up':    if (onSlot) entry.chars[entry.cursor] = (entry.chars[entry.cursor] + 1) % n;     break;
    case 'down':  if (onSlot) entry.chars[entry.cursor] = (entry.chars[entry.cursor] + n - 1) % n; break;
    case 'left':  entry.cursor = Math.max(0, entry.cursor - 1);        break;
    case 'right': entry.cursor = Math.min(END_SLOT, entry.cursor + 1); break;
    case 'confirm':
      if (onSlot) entry.cursor++;  // confirming the last letter lands on END
      else        entry.done = true;
      break;
  }
  return entry;
}

export function initialsName(entry) {
  return entry.chars.map(i => CHARSET[i]).join('');
}
