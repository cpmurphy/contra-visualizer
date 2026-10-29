// Unit tests for writing calls down and timing them

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    callRhythm, callSchedule, displayCall, judgeCall, leadBeats, parseCall, placeCall
} from '../calls.js';
import { dances } from '../library.js';
import { INTRO_BEATS, danceBeats } from '../timeline.js';

test('parseCall splits syllables and finds the stresses', () => {
    assert.deepStrictEqual(parseCall('NEIGH.bors BAL.ance and SWING'), [
        { text: 'neigh', stressed: true, word: 0 },
        { text: 'bors', stressed: false, word: 0 },
        { text: 'bal', stressed: true, word: 1 },
        { text: 'ance', stressed: false, word: 1 },
        { text: 'and', stressed: false, word: 2 },
        { text: 'swing', stressed: true, word: 3 }
    ]);
});

test('parseCall keeps hyphens and punctuation for display', () => {
    const syllables = parseCall('new NEIGH.bor, do-si-DO');
    assert.deepStrictEqual(syllables.map(s => s.text), ['new', 'neigh', 'bor,', 'do-', 'si-', 'do']);
    assert.deepStrictEqual(syllables.map(s => s.stressed), [false, true, false, false, false, true]);
});

test('parseCall stresses the last syllable when none is marked', () => {
    assert.deepStrictEqual(parseCall('cast off').map(s => s.stressed), [false, true]);
});

test('parseCall rejects an empty call', () => {
    assert.throws(() => parseCall('  '), /at least one syllable/);
});

test('callRhythm puts stresses on strong beats with the rest on half beats', () => {
    // "ance" finishes its word after BAL; "and" leads into SWING
    assert.deepStrictEqual(callRhythm(parseCall('NEIGH.bors BAL.ance and SWING')), [-4, -3.5, -2, -1.5, -0.5, 0]);
});

test('callRhythm leads into the first stress and follows the last', () => {
    assert.deepStrictEqual(callRhythm(parseCall('turn CON.tra COR.ners')), [-2.5, -2, -1.5, 0, 0.5]);
});

test('callRhythm leaves more room between stresses when it needs to', () => {
    // Four unstressed syllables don't fit in two beats, so the stresses are four apart
    const rhythm = callRhythm(parseCall('CIR.cle back to the RIGHT'));
    assert.deepStrictEqual(rhythm, [-4, -3.5, -1.5, -1, -0.5, 0]);
});

test('leadBeats gives longer calls more warning', () => {
    assert.strictEqual(leadBeats(2.5), 2);
    assert.strictEqual(leadBeats(4), 2);
    assert.strictEqual(leadBeats(6), 4);
});

test('placeCall puts the last stress two beats before the figure', () => {
    const call = placeCall('PART.ners SWING', 22);
    assert.deepStrictEqual(call.syllables.map(s => s.beat), [18, 18.5, 20]);
    assert.strictEqual(call.start, 18);
    assert.strictEqual(call.end, 20.5);
});

test('placeCall gives a long call more warning', () => {
    const call = placeCall('ONES BAL.ance and SWING in the CEN.ter', 48);
    assert.strictEqual(call.syllables.filter(s => s.stressed).at(-1).beat, 44);
});

test('placeCall moves a call earlier to finish before the next', () => {
    const call = placeCall('cast OFF', 44, 41);
    assert.strictEqual(call.end, 40.5);
});

test('displayCall writes the call out as a sentence', () => {
    assert.strictEqual(displayCall(parseCall('NEIGH.bors BAL.ance and SWING')), 'Neighbors balance and swing');
    assert.strictEqual(displayCall(parseCall('new NEIGH.bor, do-si-DO')), 'New neighbor, do-si-do');
});

test('callSchedule calls in full the first time through, then short', () => {
    const dance = dances.find(d => d.title === 'Simplicity Swing');
    const calls = callSchedule(dance);
    const first = calls.filter(c => c.round === 0);
    const second = calls.filter(c => c.round === 1);
    assert.strictEqual(first[1].text, 'CIR.cle LEFT three QUAR.ters');
    assert.strictEqual(second[1].text, 'CIR.cle LEFT');
    // The second time round there's room for the neighbor call in full, but the
    // short call is used because the dancers know it by then
    assert.strictEqual(second[0].text, 'BAL.ance and SWING');
    // A move with no short call is called in full both times
    assert.strictEqual(second[2].text, 'PART.ners SWING');
    assert.strictEqual(second[0].figureBeat, danceBeats(dance));
});

test('callSchedule uses the short call when the full one has no room', () => {
    const dance = dances.find(d => d.title === 'Simplicity Swing');
    const [first] = callSchedule(dance);
    // "Neighbors balance and swing" needs six beats; the potatoes are four
    assert.strictEqual(first.text, 'BAL.ance and SWING');
    assert.strictEqual(first.start, -4);
    assert.strictEqual(first.syllables.at(-1).beat, -2);
});

test('callSchedule makes the first call over the potatoes', () => {
    for (const dance of dances) {
        const [first] = callSchedule(dance);
        assert.ok(first.start >= -INTRO_BEATS, dance.title);
        assert.ok(first.end <= 0, dance.title);
    }
});

for (const dance of dances) {
    test(`callSchedule times every call of ${dance.title}`, () => {
        const calls = callSchedule(dance);
        assert.ok(calls.length > 0);
        calls.forEach((call, i) => {
            const label = `${dance.title}: ${call.text} (round ${call.round})`;
            // Finished at least a beat before the figure
            assert.ok(call.end <= call.figureBeat - 1, `${label} ends at ${call.end}`);
            // Not overlapping the call before
            if (i > 0) assert.ok(call.start >= calls[i - 1].end, `${label} overlaps`);
            // Stresses on strong beats
            for (const syllable of call.syllables.filter(s => s.stressed)) {
                assert.strictEqual(((syllable.beat % 2) + 2) % 2, 0, `${label}: "${syllable.text}"`);
            }
        });
    });
}

test('judgeCall grades how early or late a call starts', () => {
    const call = placeCall('PART.ners SWING', 22); // Best started on beat 18
    assert.strictEqual(judgeCall(18.3, call).grade, 'on time');
    assert.strictEqual(judgeCall(17, call).grade, 'a little early');
    assert.strictEqual(judgeCall(19.5, call).grade, 'a little late');
    assert.strictEqual(judgeCall(14, call).grade, 'early');
    assert.strictEqual(judgeCall(21, call).grade, 'late');
});

test('judgeCall says how long before the figure the call would end', () => {
    const call = placeCall('PART.ners SWING', 22); // Ends on 20.5 when on time
    const judged = judgeCall(19, call);
    assert.strictEqual(judged.offset, 1);
    assert.strictEqual(judged.endsBefore, 0.5);
});
