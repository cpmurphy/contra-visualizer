// Unit tests for where beats fall in the music

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_BEATS, beatLabel, danceBeats, locateBeat, moveStartBeat } from '../timeline.js';
import { findDance } from '../library.js';

const dance = {
    parts: [
        { name: 'A1', beats: 16, moves: [{ beats: 4 }, { beats: 12 }] },
        { name: 'A2', beats: 16, moves: [{ beats: 6 }, { beats: 10 }] }
    ]
};

test('danceBeats adds up the parts', () => {
    assert.strictEqual(danceBeats(dance), 32);
    assert.strictEqual(danceBeats(findDance('simplicity-swing')), 64);
});

test('moveStartBeat counts the beats before a move', () => {
    assert.strictEqual(moveStartBeat(dance, 0, 0), 0);
    assert.strictEqual(moveStartBeat(dance, 0, 1), 4);
    assert.strictEqual(moveStartBeat(dance, 1, 0), 16);
    assert.strictEqual(moveStartBeat(dance, 1, 1), 22);
});

test('locateBeat finds the part and wraps around the dance', () => {
    assert.deepStrictEqual(locateBeat(dance, 0), { partIndex: 0, beatInPart: 0 });
    assert.deepStrictEqual(locateBeat(dance, 15), { partIndex: 0, beatInPart: 15 });
    assert.deepStrictEqual(locateBeat(dance, 16), { partIndex: 1, beatInPart: 0 });
    assert.deepStrictEqual(locateBeat(dance, 33), { partIndex: 0, beatInPart: 1 });
});

test('beatLabel should name a beat by its part, counting from 1', () => {
    assert.equal(beatLabel(dance, 0), 'A1 · 1');
    assert.equal(beatLabel(dance, 18.5), 'A2 · 3');
});

test('beatLabel should count the potatoes before the dance', () => {
    assert.equal(beatLabel(dance, -INTRO_BEATS), 'Potatoes · 1');
    assert.equal(beatLabel(dance, -0.5), 'Potatoes · 4');
});
