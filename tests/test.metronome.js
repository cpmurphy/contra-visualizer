// Unit tests for the metronome and the beat arithmetic it relies on

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Metronome, beatAccent, danceBeats, locateBeat, moveStartBeat } from '../metronome.js';
import { findDance } from '../library.js';

const dance = {
    parts: [
        { name: 'A1', beats: 16, moves: [{ beats: 4 }, { beats: 12 }] },
        { name: 'A2', beats: 16, moves: [{ beats: 6 }, { beats: 10 }] }
    ]
};

/**
 * Stand-in for an AudioContext: the clock only moves when the test says so,
 * and each oscillator records when it was told to start and stop
 */
class FakeAudioContext {
    constructor() {
        this.currentTime = 10;
        this.state = 'running';
        this.oscillators = [];
        this.destination = {};
    }

    createOscillator() {
        const oscillator = {
            frequency: {},
            connect() {},
            start(time) { this.startTime = time; },
            stop(time) { this.stopTime = time ?? 'now'; }
        };
        this.oscillators.push(oscillator);
        return oscillator;
    }

    createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
}

/**
 * A metronome on a fake audio clock, stopped when the test ends (even if it fails)
 * so its scheduling timer doesn't keep the test run alive
 */
function makeMetronome(t, accentOf) {
    const context = new FakeAudioContext();
    const metronome = new Metronome({ createContext: () => context, accentOf });
    metronome.unlock();
    t.after(() => metronome.stop());
    return { metronome, context };
}

/**
 * Move the fake audio clock on, scheduling as the real timer would
 */
function advance(metronome, context, toTime) {
    while (context.currentTime < toTime) {
        context.currentTime = Math.min(toTime, context.currentTime + 0.025);
        metronome.schedule();
    }
}

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

test('beatAccent stresses phrase starts, then odd beats', () => {
    // Beats count from 0 here, so beat 0 is "beat 1" of the music
    assert.deepStrictEqual(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(beatAccent),
        ['phrase', 'weak', 'strong', 'weak', 'strong', 'weak', 'strong', 'weak', 'phrase', 'weak']
    );
});

test('Metronome does nothing until unlocked', () => {
    const metronome = new Metronome({ createContext: () => { throw new Error('too soon'); } });
    metronome.start(0, 1000, 120, 1000);
    assert.strictEqual(metronome.isRunning(), false);
});

test('Metronome schedules each beat ahead on the audio clock', t => {
    const { metronome, context } = makeMetronome(t);
    // Beat 0 is now; at 120 BPM a beat is half a second
    metronome.start(0, 5000, 120, 5000);
    assert.deepStrictEqual(context.oscillators.map(o => o.startTime), [10]);

    context.currentTime = 10.4;
    metronome.schedule();
    assert.deepStrictEqual(context.oscillators.map(o => o.startTime), [10, 10.5]);
    metronome.stop();
});

test('Metronome starting mid-beat waits for the next whole beat', t => {
    const { metronome, context } = makeMetronome(t);
    metronome.start(2.5, 5000, 120, 5000);
    assert.strictEqual(context.oscillators.length, 0);

    context.currentTime = 10.2;
    metronome.schedule();
    assert.deepStrictEqual(context.oscillators.map(o => o.startTime), [10.25]);
    metronome.stop();
});

test('Metronome lines up a frame timestamp from the past with the audio clock', t => {
    const { metronome, context } = makeMetronome(t);
    // The frame was 20ms ago, at beat 0.96; beat 1 is 20ms from the frame, i.e. now
    metronome.start(0.96, 4980, 120, 5000);
    assert.strictEqual(context.oscillators.length, 1);
    assert.ok(Math.abs(context.oscillators[0].startTime - 10) < 1e-9);
    metronome.stop();
});

test('Metronome plays a slightly late first beat at once, and skips one long gone', t => {
    const { metronome, context } = makeMetronome(t);
    // Beat 0 was 30ms ago: still played, straight away
    metronome.start(0, 4970, 120, 5000);
    assert.deepStrictEqual(context.oscillators.map(o => o.startTime), [10]);
    metronome.stop();

    // Beat 0 was 200ms ago: skipped
    context.oscillators = [];
    metronome.start(0, 4800, 120, 5000);
    assert.strictEqual(context.oscillators.length, 0);
    metronome.stop();
});

test('Metronome accents each beat of the dance', t => {
    const beats = [];
    const accents = [];
    const { metronome, context } = makeMetronome(t, beat => {
        beats.push(beat);
        accents.push(beatAccent(locateBeat(dance, beat).beatInPart));
        return accents.at(-1);
    });
    metronome.start(14, 5000, 120, 5000);
    advance(metronome, context, 11.4); // Beats 15 to 17 are due by now
    // Beat 16 is the first beat of A2
    assert.deepStrictEqual(beats, [14, 15, 16, 17]);
    assert.deepStrictEqual(accents, ['strong', 'weak', 'phrase', 'weak']);
    metronome.stop();
});

test('Metronome stop silences clicks not yet heard', t => {
    const { metronome, context } = makeMetronome(t);
    metronome.start(0, 5000, 120, 5000);
    const [click] = context.oscillators;
    assert.ok(Math.abs(click.stopTime - 10.05) < 1e-9);

    metronome.stop();
    assert.strictEqual(click.stopTime, 'now');
    assert.strictEqual(metronome.isRunning(), false);
});

test('Metronome muted keeps time but schedules nothing, and picks up on the next beat', t => {
    const { metronome, context } = makeMetronome(t);
    metronome.setEnabled(false);
    metronome.start(0, 5000, 120, 5000);
    assert.strictEqual(context.oscillators.length, 0);
    assert.strictEqual(metronome.isRunning(), true);

    context.currentTime = 10.7; // Between beats 1 and 2
    metronome.setEnabled(true);
    advance(metronome, context, 10.9);
    assert.deepStrictEqual(context.oscillators.map(o => o.startTime), [11]);
    metronome.stop();
});
