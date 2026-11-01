// Dance music, synthesized in the browser from a tune in ABC notation: the lead
// instruments play the melody over a piano's "boom-chuck" (a bass note on each
// beat and a chord between beats). Being synthesized, it follows the tempo exactly.

import { BeatScheduler } from './scheduler.js';
import { Band, together } from './instruments.js';
import { parseAbc } from './abc.js';
import { INTRO_BEATS } from './timeline.js';
import tunes from './library/tunes.json' with { type: 'json' };

export { tunes };

/** How loud the bass and chords are, for a note on the beat */
const BASS_LOUDNESS = 1;
const CHUCK_LOUDNESS = 0.42;

/** How long the bass and chords ring, in seconds at most */
const BASS_SECONDS = 0.35;
const CHUCK_SECONDS = 0.14;

/** How much players vary: a fraction of a note's loudness, and seconds late */
const LOUDNESS_VARIATION = 0.12;
const LATE_SECONDS = { melody: 0.008, bass: 0.004, chuck: 0.006 };

/**
 * Who can play the melody: each instrument, and how loud it is. The fiddle is
 * kept quiet beside the accordion, adding its bite without standing out.
 */
export const LEADS = {
    accordion: { name: 'Accordion', instruments: [['playAccordion', 1]] },
    fiddle: { name: 'Fiddle', instruments: [['playFiddle', 1]] },
    both: { name: 'Both', instruments: [['playAccordion', 0.85], ['playFiddle', 0.45]] }
};

/** The lead until another is chosen */
export const DEFAULT_LEAD = 'accordion';

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
 * How strongly a note is played, by where it falls: the first beat of each
 * pair is strongest, then the other beats, then whatever comes between them
 * @param {number} beat
 * @returns {number} Up to 1
 */
export function beatStrength(beat) {
    if (Math.abs(beat - Math.round(beat)) > 1e-6) return 0.78;
    return Math.round(beat) % 2 === 0 ? 1 : 0.9;
}

/**
 * Everything played in one time through a tune: the melody, and the
 * accompaniment under it. The bass alternates root and fifth on the beats; the
 * chord comes halfway between beats in a reel, and on the third eighth note of
 * each beat in a jig.
 * @param {Object} tune - From parseAbc
 * @returns {{beat: number, voice: 'melody'|'bass'|'chuck', midi: number[], beats: number}[]}
 */
export function tuneEvents(tune) {
    const events = tune.notes.map(note => ({ beat: note.beat, voice: 'melody', midi: note.midi, beats: note.beats }));
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
 * The "potatoes" before the dance: the root and fifth of the
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
            { beat, voice: 'melody', midi: doubleStop, beats: offbeat * 0.8 },
            { beat: beat + offbeat, voice: 'melody', midi: doubleStop, beats: (1 - offbeat) * 0.7 },
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
     * @param {() => number} [options.random] - Numbers from 0 up to 1
     */
    constructor({ random = Math.random, ...options } = {}) {
        super(options);
        this.random = random;
        // Each time through the dance in turn: the tune's length and what's played
        this.rounds = [];
        this.potatoes = [];
        this.lead = DEFAULT_LEAD;
        this.band = null;
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
     * Choose who plays the melody
     * @param {string} lead - A key of LEADS
     */
    setLead(lead) {
        this.lead = lead;
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
     * Schedule one note (or chord), played with a little of the unevenness of
     * real players. Notes only ever come late, so they're never in the past.
     * @param {{beat: number, voice: string, midi: number[], beats: number}} event
     * @param {number} time - Audio-clock time in seconds
     * @returns {{end: number, cancel: () => void}}
     */
    play(event, time) {
        this.band ??= new Band(this.context, { random: this.random });
        const seconds = this.secondsOf(event.beats);
        const loudness = beatStrength(event.beat) *
            (1 + (this.random() * 2 - 1) * LOUDNESS_VARIATION);
        const at = time + this.random() * LATE_SECONDS[event.voice];

        switch (event.voice) {
        case 'bass':
            return this.band.playPiano(event.midi, at, Math.min(seconds, BASS_SECONDS), loudness * BASS_LOUDNESS);
        case 'chuck':
            return this.band.playPiano(event.midi, at, Math.min(seconds, CHUCK_SECONDS), loudness * CHUCK_LOUDNESS);
        default:
            return together(LEADS[this.lead].instruments.map(([playInstrument, level]) =>
                this.band[playInstrument](event.midi, at, seconds, loudness * level)));
        }
    }
}
