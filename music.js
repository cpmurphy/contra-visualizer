// Dance music, synthesized in the browser from a tune in ABC notation: a fiddle
// plays the melody over a "boom-chuck" accompaniment (a bass note on each beat
// and a chord between beats). Being synthesized, it follows the tempo exactly.

import { BeatScheduler } from './scheduler.js';
import { parseAbc } from './abc.js';
import { INTRO_BEATS } from './timeline.js';
import tunes from './library/tunes.json' with { type: 'json' };

export { tunes };

/** Loudness of the music as a whole, and of each instrument */
const MUSIC_GAIN = 0.9;
const FIDDLE_GAIN = 0.16;
const BASS_GAIN = 0.35;
const CHUCK_GAIN = 0.07;

/** How long the bass and chords ring, in seconds at most */
const BASS_SECONDS = 0.35;
const CHUCK_SECONDS = 0.12;

/** Seconds to fade out a note that is cut short (on pause, say) */
const FADE_SECONDS = 0.03;

/**
 * Find a built-in tune by title
 * @param {string} title
 * @returns {Object|undefined}
 */
export function findTune(title) {
    return tunes.find(tune => tune.title === title);
}

/**
 * The tunes a built-in tune plays, one for each time through the dance in turn:
 * a medley's tunes (each for its `rounds`, 1 if not given), or just the tune
 * @param {Object} tune - A built-in tune
 * @returns {Object[]} Built-in tunes with their ABC
 */
export function medleyTunes(tune) {
    if (!tune.medley) return [tune];
    return tune.medley.flatMap(title => {
        const played = findTune(title);
        if (!played?.abc) {
            throw new Error(`The medley ${tune.title} needs a tune called ${title}`);
        }
        return new Array(tune.rounds ?? 1).fill(played);
    });
}

/**
 * Frequency of a MIDI note
 * @param {number} midi
 * @returns {number} Hz
 */
export function midiFrequency(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * The notes of a chord, as MIDI numbers in the octave around middle C
 * @param {{root: number, minor: boolean, seventh: boolean}} chord
 * @returns {number[]}
 */
export function chordNotes({ root, minor, seventh }) {
    const base = 55 + ((root - 7 + 12) % 12); // Root from G3 up to F#4
    const notes = [base, base + (minor ? 3 : 4), base + 7];
    if (seventh) notes.push(base + 10);
    return notes;
}

/**
 * Everything played in one time through a tune: the melody, and the
 * accompaniment under it. The bass alternates root and fifth on the beats; the
 * chord comes halfway between beats in a reel, and on the third eighth note of
 * each beat in a jig.
 * @param {Object} tune - From parseAbc
 * @returns {{beat: number, voice: 'fiddle'|'bass'|'chuck', midi: number[], beats: number}[]}
 */
export function tuneEvents(tune) {
    const events = tune.notes.map(note => ({ beat: note.beat, voice: 'fiddle', midi: note.midi, beats: note.beats }));
    const offbeat = tune.compound ? 2 / 3 : 1 / 2;
    const tonicChord = { root: tune.tonic, minor: false, seventh: false };

    for (let beat = 0; beat < tune.beats; beat++) {
        const chord = tune.chords.findLast(c => c.beat <= beat + 1e-9) ?? tonicChord;
        events.push(...accompaniment(chord, beat, offbeat));
    }
    return events.sort((a, b) => a.beat - b.beat);
}

/**
 * Boom-chuck for one beat
 * @param {{root: number, minor: boolean, seventh: boolean}} chord
 * @param {number} beat - Whole beat
 * @param {number} offbeat - Fraction of the beat at which the chord comes
 * @returns {Object[]}
 */
function accompaniment(chord, beat, offbeat) {
    const [root, , fifth] = chordNotes(chord);
    // Bass an octave or two down: the root on odd-numbered beats, the fifth on even
    const bass = (beat % 2 === 0 ? root : fifth) - 24;
    return [
        { beat, voice: 'bass', midi: [bass], beats: offbeat },
        { beat: beat + offbeat, voice: 'chuck', midi: chordNotes(chord), beats: 1 - offbeat }
    ];
}

/**
 * The lead fiddle's "potatoes" before the dance: the root and fifth of the
 * tune's first chord (the tonic, if it has none), chopped on and between the
 * beats, over that chord
 * @param {Object} tune - From parseAbc
 * @returns {Object[]} Events for beats -INTRO_BEATS up to 0
 */
export function potatoEvents(tune) {
    const offbeat = tune.compound ? 2 / 3 : 1 / 2;
    const firstChord = tune.chords[0] ?? { root: tune.tonic, minor: false, seventh: false };
    const [root, , fifth] = chordNotes(firstChord);
    const doubleStop = [root + 12, fifth + 12];
    const events = [];
    for (let beat = -INTRO_BEATS; beat < 0; beat++) {
        events.push(
            { beat, voice: 'fiddle', midi: doubleStop, beats: offbeat * 0.8 },
            { beat: beat + offbeat, voice: 'fiddle', midi: doubleStop, beats: (1 - offbeat) * 0.7 },
            ...accompaniment(firstChord, beat, offbeat)
        );
    }
    return events;
}

/**
 * Plays a tune (or a medley's tunes in turn) in time with the dance, over and
 * over; before the dance starts (negative beats) it plays the first tune's potatoes
 */
export class MusicPlayer extends BeatScheduler {
    /**
     * @param {Object} [options] - See BeatScheduler
     */
    constructor(options = {}) {
        super(options);
        // Each time through the dance in turn: the tune's length and what's played
        this.rounds = [];
        this.potatoes = [];
        this.output = null;
    }

    /**
     * Choose the tune or medley to play, or none
     * @param {Object|null} tune - A built-in tune, or null for silence
     */
    setTune(tune) {
        const parsed = tune ? medleyTunes(tune).map(played => parseAbc(played.abc)) : [];
        this.rounds = parsed.map(played => ({ beats: played.beats, events: tuneEvents(played) }));
        this.potatoes = parsed.length > 0 ? potatoEvents(parsed[0]) : [];
        this.resync();
    }

    /**
     * The notes from one beat (inclusive) to another (exclusive), playing the
     * tunes in turn as the dance repeats, and starting over after the last
     * @param {number} fromBeat
     * @param {number} toBeat
     * @returns {Object[]}
     */
    eventsBetween(fromBeat, toBeat) {
        if (this.rounds.length === 0) return [];
        const found = this.potatoes.filter(e => e.beat >= fromBeat && e.beat < toBeat);
        let offset = 0;
        for (let round = 0; offset < toBeat; round++) {
            const { beats, events } = this.rounds[round % this.rounds.length];
            if (offset + beats > fromBeat) {
                for (const event of events) {
                    const beat = event.beat + offset;
                    if (beat >= fromBeat && beat < toBeat) {
                        found.push({ ...event, beat });
                    }
                }
            }
            offset += beats;
        }
        return found;
    }

    /**
     * Schedule one note (or chord)
     * @param {{voice: string, midi: number[], beats: number}} event
     * @param {number} time - Audio-clock time in seconds
     */
    play(event, time) {
        if (!this.output) {
            this.output = this.context.createGain();
            this.output.gain.value = MUSIC_GAIN;
            this.output.connect(this.context.destination);
        }
        const seconds = this.secondsOf(event.beats);
        const voice = { fiddle: playFiddle, bass: playBass, chuck: playChuck }[event.voice];
        return voice(this.context, this.output, event.midi, time, seconds);
    }
}

/**
 * Something sounding: its oscillators and the gain shaping it
 * @returns {{end: number, cancel: () => void}}
 */
function sounding(context, oscillators, envelope, end) {
    return {
        end,
        cancel() {
            const now = context.currentTime;
            envelope.gain.cancelScheduledValues(now);
            envelope.gain.setTargetAtTime(0, now, FADE_SECONDS / 3);
            for (const oscillator of oscillators) {
                oscillator.stop(now + FADE_SECONDS);
            }
        }
    };
}

/**
 * A fiddle note: a pair of slightly detuned sawtooth waves, softened by a
 * low-pass filter, with a little vibrato and a bowed attack
 */
function playFiddle(context, output, midis, time, seconds) {
    const end = time + seconds;
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2800;
    filter.Q.value = 1.5;
    filter.connect(envelope);
    envelope.connect(output);

    const peak = FIDDLE_GAIN / midis.length ** 0.5;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(peak, time + 0.02);
    envelope.gain.setTargetAtTime(peak * 0.75, time + 0.02, 0.08);
    envelope.gain.setTargetAtTime(0, Math.max(time + 0.03, end - 0.03), 0.015);

    const vibrato = context.createOscillator();
    const vibratoDepth = context.createGain();
    vibrato.frequency.value = 5.5;
    vibratoDepth.gain.value = 9; // Cents
    vibrato.connect(vibratoDepth);

    const oscillators = [vibrato];
    for (const midi of midis) {
        for (const detune of [-4, 4]) {
            const oscillator = context.createOscillator();
            oscillator.type = 'sawtooth';
            oscillator.frequency.value = midiFrequency(midi);
            oscillator.detune.value = detune;
            vibratoDepth.connect(oscillator.detune);
            oscillator.connect(filter);
            oscillators.push(oscillator);
        }
    }
    for (const oscillator of oscillators) {
        oscillator.start(time);
        oscillator.stop(end + 0.1);
    }
    return sounding(context, oscillators, envelope, end + 0.1);
}

/**
 * A plucked bass note
 */
function playBass(context, output, [midi], time, seconds) {
    const end = time + Math.min(seconds, BASS_SECONDS);
    const envelope = context.createGain();
    envelope.connect(output);
    envelope.gain.setValueAtTime(BASS_GAIN, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, end);

    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = midiFrequency(midi);
    oscillator.connect(envelope);
    oscillator.start(time);
    oscillator.stop(end);
    return sounding(context, [oscillator], envelope, end);
}

/**
 * A short, damped chord between the beats
 */
function playChuck(context, output, midis, time, seconds) {
    const end = time + Math.min(seconds, CHUCK_SECONDS);
    const envelope = context.createGain();
    envelope.connect(output);
    envelope.gain.setValueAtTime(CHUCK_GAIN, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, end);

    const oscillators = midis.map(midi => {
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = midiFrequency(midi);
        oscillator.connect(envelope);
        oscillator.start(time);
        oscillator.stop(end);
        return oscillator;
    });
    return sounding(context, oscillators, envelope, end);
}
