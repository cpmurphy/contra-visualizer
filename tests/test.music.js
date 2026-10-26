// Unit tests for reading ABC and turning tunes into music

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatLength, keySignature, parseAbc, parseChord } from '../abc.js';
import { MusicPlayer, chordNotes, midiFrequency, potatoEvents, tuneEvents, tunes } from '../music.js';
import { INTRO_BEATS } from '../calls.js';

const tune = body => parseAbc(`X:1\nT:Test\nM:4/4\nL:1/8\nK:D\n${body}`);
const pitches = parsed => parsed.notes.map(note => note.midi.join('+'));

// ===== ABC =====

test('keySignature knows major keys and modes', () => {
    assert.deepStrictEqual(keySignature('D'), { tonic: 2, accidentals: { F: 1, C: 1 } });
    assert.deepStrictEqual(keySignature('Ador'), { tonic: 9, accidentals: { F: 1 } });
    assert.deepStrictEqual(keySignature('Em'), { tonic: 4, accidentals: { F: 1 } });
    assert.deepStrictEqual(keySignature('F'), { tonic: 5, accidentals: { B: -1 } });
    assert.deepStrictEqual(keySignature('Gmix'), { tonic: 7, accidentals: {} });
    assert.throws(() => keySignature('H'), /Can't read the key/);
});

test('beatLength gives a dance beat per half note in reels and dotted quarter in jigs', () => {
    assert.strictEqual(beatLength('4/4'), 1 / 2);
    assert.strictEqual(beatLength('C|'), 1 / 2);
    assert.strictEqual(beatLength('2/4'), 1 / 4);
    assert.strictEqual(beatLength('6/8'), 3 / 8);
});

test('parseChord reads chord symbols and ignores annotations', () => {
    assert.deepStrictEqual(parseChord('Em'), { name: 'Em', root: 4, minor: true, seventh: false });
    assert.deepStrictEqual(parseChord('A7'), { name: 'A7', root: 9, minor: false, seventh: true });
    assert.strictEqual(parseChord('Gmaj7').minor, false);
    assert.strictEqual(parseChord('slowly'), null);
});

test('parseAbc applies the key signature, octaves and accidentals', () => {
    // In D, F and c are sharp; "=c" is natural for the rest of the bar
    const parsed = tune('DFAd fa=cc|c');
    assert.deepStrictEqual(pitches(parsed), ['62', '66', '69', '74', '78', '81', '72', '72', '73']);
    assert.deepStrictEqual(pitches(tune("A, a'")), ['57', '93']);
});

test('parseAbc times notes in dance beats', () => {
    // A reel in 4/4: an eighth note is a quarter of a beat
    const reel = tune('AB c2 d4|');
    assert.deepStrictEqual(reel.notes.map(n => [n.beat, n.beats]), [[0, 0.25], [0.25, 0.25], [0.5, 0.5], [1, 1]]);
    assert.strictEqual(reel.beats, 2);

    // A jig in 6/8: an eighth note is a third of a beat
    const jig = parseAbc('X:1\nM:6/8\nL:1/8\nK:G\nGAB d3|');
    assert.deepStrictEqual(jig.notes.map(n => n.beats.toFixed(3)), ['0.333', '0.333', '0.333', '1.000']);
    assert.strictEqual(jig.compound, true);
});

test('parseAbc understands broken rhythms, triplets, ties, rests and note chords', () => {
    assert.deepStrictEqual(tune('A>B').notes.map(n => n.beats), [0.375, 0.125]);
    assert.deepStrictEqual(tune('(3ABc d').notes.map(n => +n.beats.toFixed(4)), [0.1667, 0.1667, 0.1667, 0.25]);
    assert.deepStrictEqual(tune('A2-A2 B').notes.map(n => n.beats), [1, 0.25]);
    assert.deepStrictEqual(tune('z2 A').notes.map(n => n.beat), [0.5]);
    assert.deepStrictEqual(pitches(tune('[DA]2')), ['62+69']);
});

test('parseAbc plays repeats and endings', () => {
    assert.deepStrictEqual(pitches(tune('|:D E:|F')), ['62', '64', '62', '64', '66']);
    assert.deepStrictEqual(pitches(tune('|:D|1 E:|2 F||G')), ['62', '64', '62', '66', '67']);
    assert.deepStrictEqual(pitches(tune('|:D [1E:| [2F|]')), ['62', '64', '62', '66']);
});

test('parseAbc skips decorations, slurs, grace notes and line-break marks', () => {
    assert.deepStrictEqual(pitches(tune('~D (EF) {g}A !trill!B|! c')), ['62', '64', '66', '69', '71', '73']);
});

test('parseAbc collects chord symbols where they fall', () => {
    const parsed = tune('"D"AFDF "A"AFDF|');
    assert.deepStrictEqual(parsed.chords.map(c => [c.beat, c.name]), [[0, 'D'], [1, 'A']]);
});

test('parseAbc needs a key', () => {
    assert.throws(() => parseAbc('X:1\nT:No key\nABC'), /needs a key/);
});

// ===== MUSIC =====

for (const builtIn of tunes) {
    test(`${builtIn.title} reads as 64 beats, AABB, with chords`, () => {
        const parsed = parseAbc(builtIn.abc);
        assert.strictEqual(parsed.beats, 64);
        assert.ok(parsed.chords.length > 0);
        // The second A part repeats the first
        const firstA = parsed.notes.filter(n => n.beat < 16).map(n => n.midi.join());
        const secondA = parsed.notes.filter(n => n.beat >= 16 && n.beat < 32).map(n => n.midi.join());
        assert.deepStrictEqual(secondA, firstA);
    });
}

test('midiFrequency tunes A to 440', () => {
    assert.strictEqual(midiFrequency(69), 440);
    assert.ok(Math.abs(midiFrequency(62) - 293.66) < 0.01);
});

test('chordNotes builds triads and sevenths', () => {
    assert.deepStrictEqual(chordNotes({ root: 2, minor: false, seventh: false }), [62, 66, 69]);
    assert.deepStrictEqual(chordNotes({ root: 9, minor: false, seventh: true }), [57, 61, 64, 67]);
    assert.deepStrictEqual(chordNotes({ root: 4, minor: true, seventh: false }), [64, 67, 71]);
});

test('tuneEvents puts bass on the beat and a chord between beats', () => {
    const reel = tuneEvents(tune('"D"AFDF "A"AFDF|'));
    const accompaniment = reel.filter(e => e.voice !== 'fiddle').map(e => [e.beat, e.voice, e.midi.join('+')]);
    assert.deepStrictEqual(accompaniment, [
        [0, 'bass', '38'], [0.5, 'chuck', '62+66+69'],
        [1, 'bass', '40'], [1.5, 'chuck', '57+61+64']
    ]);

    // In a jig, the chord comes on the third eighth note of the beat
    const jig = tuneEvents(parseAbc('X:1\nM:6/8\nL:1/8\nK:D\n"D"AFA AFA|'));
    assert.deepStrictEqual(jig.filter(e => e.voice === 'chuck').map(e => +e.beat.toFixed(3)), [0.667, 1.667]);
});

test('potatoEvents chops the tonic through the potatoes', () => {
    const events = potatoEvents(tune('"D"AFDF AFDF|'));
    const fiddle = events.filter(e => e.voice === 'fiddle');
    assert.strictEqual(fiddle.length, INTRO_BEATS * 2);
    assert.strictEqual(fiddle[0].beat, -INTRO_BEATS);
    assert.deepStrictEqual(fiddle[0].midi, [74, 81]);
    assert.ok(events.every(e => e.beat >= -INTRO_BEATS && e.beat < 0));
});

test('MusicPlayer repeats the tune and plays the potatoes before it', () => {
    const player = new MusicPlayer();
    player.setTune(tunes[0]);
    const potatoes = player.eventsBetween(-INTRO_BEATS, 0);
    assert.ok(potatoes.length > 0 && potatoes.every(e => e.beat < 0));

    // The second time through is the first again, 64 beats on
    const first = player.eventsBetween(0, 2).map(e => `${e.voice}${e.midi}@${e.beat}`);
    const again = player.eventsBetween(64, 66).map(e => `${e.voice}${e.midi}@${e.beat - 64}`);
    assert.deepStrictEqual(again, first);

    player.setTune(null);
    assert.deepStrictEqual(player.eventsBetween(0, 64), []);
});
