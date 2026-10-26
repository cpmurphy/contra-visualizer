// Metronome: a click on every beat of the music, played with the Web Audio API.

import { BeatScheduler } from './scheduler.js';

/** Beats in a musical phrase; a phrase starts on beats 1 and 9 of a 16-beat part */
export const PHRASE_BEATS = 8;

/** How the metronome sounds each kind of beat */
export const CLICK_SOUNDS = {
    phrase: { frequency: 1600, gain: 0.9 }, // first beat of a phrase
    strong: { frequency: 1100, gain: 0.55 }, // beats 1, 3, 5, 7 of a phrase
    weak: { frequency: 800, gain: 0.3 } // beats 2, 4, 6, 8
};

/** Length of a click, in seconds */
const CLICK_SECONDS = 0.05;

/**
 * Total number of beats in one time through the dance
 * @param {Object} dance
 * @returns {number}
 */
export function danceBeats(dance) {
    return dance.parts.reduce((total, part) => total + part.beats, 0);
}

/**
 * Beat (counting from 0 at the start of the dance) on which a move begins
 * @param {Object} dance
 * @param {number} partIndex
 * @param {number} moveIndex
 * @returns {number}
 */
export function moveStartBeat(dance, partIndex, moveIndex) {
    let beat = 0;
    for (let p = 0; p < partIndex; p++) {
        beat += dance.parts[p].beats;
    }
    const moves = dance.parts[partIndex].moves;
    for (let m = 0; m < moveIndex; m++) {
        beat += moves[m].beats;
    }
    return beat;
}

/**
 * Which beat of its part a beat of the dance falls on. Beats past the end of the
 * dance wrap around, since the dance repeats.
 * @param {Object} dance
 * @param {number} beat - Whole beat, counting from 0 at the start of the dance
 * @returns {{partIndex: number, beatInPart: number}} beatInPart counts from 0
 */
export function locateBeat(dance, beat) {
    let remaining = ((beat % danceBeats(dance)) + danceBeats(dance)) % danceBeats(dance);
    for (let partIndex = 0; partIndex < dance.parts.length; partIndex++) {
        const partBeats = dance.parts[partIndex].beats;
        if (remaining < partBeats) {
            return { partIndex, beatInPart: remaining };
        }
        remaining -= partBeats;
    }
    throw new Error(`Beat ${beat} is outside the dance`);
}

/**
 * How strongly a beat is accented: the first beat of each phrase most, then the
 * other odd-numbered beats (counting from 1), then the even-numbered ones
 * @param {number} beatInPart - Beat within its part, counting from 0
 * @returns {'phrase'|'strong'|'weak'}
 */
export function beatAccent(beatInPart) {
    if (beatInPart % PHRASE_BEATS === 0) return 'phrase';
    return beatInPart % 2 === 0 ? 'strong' : 'weak';
}

/**
 * Plays a click on each beat while the dance is playing
 */
export class Metronome extends BeatScheduler {
    /**
     * @param {Object} [options]
     * @param {() => AudioContext} [options.createContext] - See BeatScheduler
     * @param {(beat: number) => string} [options.accentOf] - Accent of a whole beat of
     *   the dance (see beatAccent); every beat is 'strong' if not given
     */
    constructor({ createContext, accentOf = () => 'strong' } = {}) {
        super({ createContext });
        this.accentOf = accentOf;
    }

    /**
     * Each whole beat, with its accent
     * @param {number} fromBeat - Inclusive
     * @param {number} toBeat - Exclusive
     * @returns {{beat: number, accent: string}[]}
     */
    eventsBetween(fromBeat, toBeat) {
        const events = [];
        for (let beat = Math.ceil(fromBeat); beat < toBeat; beat++) {
            events.push({ beat, accent: this.accentOf(beat) });
        }
        return events;
    }

    /**
     * Schedule one click
     * @param {{accent: string}} event
     * @param {number} time - Audio-clock time in seconds
     */
    play({ accent }, time) {
        const sound = CLICK_SOUNDS[accent] ?? CLICK_SOUNDS.strong;
        const oscillator = this.context.createOscillator();
        const envelope = this.context.createGain();
        oscillator.frequency.value = sound.frequency;
        envelope.gain.setValueAtTime(sound.gain, time);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + CLICK_SECONDS);
        oscillator.connect(envelope);
        envelope.connect(this.context.destination);
        oscillator.start(time);
        oscillator.stop(time + CLICK_SECONDS);
        return { time, end: time + CLICK_SECONDS, accent, cancel: () => oscillator.stop() };
    }
}
