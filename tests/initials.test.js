import { createInitials, applyAction, initialsName, CHARSET, END_SLOT } from '../src/ui/initials.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const run = (entry, ...actions) => { actions.forEach(a => applyAction(entry, a)); return entry; };

describe('initials entry', () => {
  it('starts as AAA on the first slot', () => {
    const e = createInitials();
    assert.equal(initialsName(e), 'AAA');
    assert.equal(e.cursor, 0);
    assert.equal(e.done, false);
  });

  it('up/down cycle letters and wrap around the charset', () => {
    assert.equal(initialsName(run(createInitials(), 'up', 'up')), 'CAA');
    assert.equal(initialsName(run(createInitials(), 'down')), `${CHARSET.at(-1)}AA`);
  });

  it('left/right clamp between the first slot and END', () => {
    assert.equal(run(createInitials(), 'left').cursor, 0);
    assert.equal(run(createInitials(), 'right', 'right', 'right', 'right').cursor, END_SLOT);
  });

  it('up/down on END leave letters unchanged', () => {
    const e = run(createInitials(), 'right', 'right', 'right', 'up', 'down', 'down');
    assert.equal(initialsName(e), 'AAA');
  });

  it('confirm advances through the slots and finishes on END', () => {
    const e = run(createInitials(), 'up', 'confirm', 'up', 'up', 'confirm', 'confirm');
    assert.equal(e.cursor, END_SLOT);
    assert.equal(e.done, false);
    run(e, 'confirm');
    assert.equal(e.done, true);
    assert.equal(initialsName(e), 'BCA');
  });

  it('ignores actions once done', () => {
    const e = run(createInitials(), 'right', 'right', 'right', 'confirm', 'left', 'up');
    assert.equal(e.cursor, END_SLOT);
    assert.equal(initialsName(e), 'AAA');
  });
});
