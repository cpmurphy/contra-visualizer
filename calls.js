// Calls: the words a caller says for each figure, and when to say them.
//
// A call is written with its syllables and stresses marked, e.g.
// "NEIGH.bors BAL.ance and SWING": a "." splits syllables (and isn't shown),
// a "-" splits them and is shown (as in "do-si-DO"), and a syllable in capitals
// is stressed. Stressed syllables land on strong beats (the odd-numbered beats
// of the music, which are the even-numbered ones counting from 0), and the
// other syllables fit between them on half beats.

import { INTRO_BEATS, danceBeats, moveStartBeat } from './timeline.js';

/** Times through the dance in a practice session */
export const PRACTICE_ROUNDS = 2;

/** How long a syllable takes to say, in beats */
export const SYLLABLE_BEATS = 0.5;

/** A call's last stress comes this many beats before its figure starts... */
export const LEAD_BEATS = 2;

/** ...or this many, for a call that takes longer than LONG_CALL_BEATS to say */
export const LONG_LEAD_BEATS = 4;
export const LONG_CALL_BEATS = 4;

/** Beats between strong beats */
const STRONG_BEAT_SPACING = 2;

/**
 * Split a call into syllables
 * @param {string} text - Call in the notation described above
 * @returns {{text: string, stressed: boolean, word: number}[]} text is as
 *   displayed (lower case, keeping any "-"); word numbers the words from 0
 */
export function parseCall(text) {
    const syllables = [];
    text.trim().split(/\s+/).forEach((word, wordIndex) => {
        // Split after each "-" (keeping it) and at each "."
        for (const piece of word.split(/(?<=-)|\./)) {
            if (!piece) continue;
            const letters = piece.replace(/[^A-Za-z]/g, '');
            syllables.push({
                text: piece.toLowerCase(),
                stressed: letters.length > 0 && letters === letters.toUpperCase(),
                word: wordIndex
            });
        }
    });
    if (syllables.length === 0) {
        throw new Error('A call needs at least one syllable');
    }
    // A call with no stress marked is stressed on its last syllable
    if (!syllables.some(syllable => syllable.stressed)) {
        syllables[syllables.length - 1].stressed = true;
    }
    return syllables;
}

/**
 * When each syllable is said, relative to the call's last stressed syllable.
 * Consecutive stresses are a whole number of strong beats apart, enough to fit the
 * unstressed syllables between them: those finishing the stressed word follow it,
 * and the rest lead into the next stress.
 * @param {{stressed: boolean, word: number}[]} syllables - From parseCall
 * @returns {number[]} Beat of each syllable; the last stressed one is at 0
 */
export function callRhythm(syllables) {
    const stresses = syllables.flatMap((syllable, i) => (syllable.stressed ? [i] : []));
    const beats = new Array(syllables.length);

    // Lay the stresses out from 0, then shift so the last stress is at 0
    let beat = 0;
    stresses.forEach((stress, j) => {
        beats[stress] = beat;
        const next = stresses[j + 1] ?? syllables.length;
        const between = next - stress - 1;
        if (j === stresses.length - 1) {
            // Syllables after the last stress simply follow it
            for (let k = 1; k <= between; k++) {
                beats[stress + k] = beat + k * SYLLABLE_BEATS;
            }
            return;
        }

        const slotsPerGap = STRONG_BEAT_SPACING / SYLLABLE_BEATS;
        const gap = STRONG_BEAT_SPACING * Math.ceil((between + 1) / slotsPerGap);
        let trailing = 0;
        while (trailing < between && syllables[stress + 1 + trailing].word === syllables[stress].word) {
            trailing++;
        }
        for (let k = 1; k <= between; k++) {
            beats[stress + k] = k <= trailing
                ? beat + k * SYLLABLE_BEATS
                : beat + gap - (between - k + 1) * SYLLABLE_BEATS;
        }
        beat += gap;
    });

    // Syllables before the first stress lead into it
    for (let k = 0; k < stresses[0]; k++) {
        beats[k] = -(stresses[0] - k) * SYLLABLE_BEATS;
    }

    const last = beats[stresses[stresses.length - 1]];
    return beats.map(b => b - last);
}

/**
 * How many beats before its figure a call's last stress should come: longer
 * calls need more warning
 * @param {number} sayingBeats - From the call's first syllable to its last
 * @returns {number}
 */
export function leadBeats(sayingBeats) {
    return sayingBeats > LONG_CALL_BEATS ? LONG_LEAD_BEATS : LEAD_BEATS;
}

/**
 * Place a call before its figure
 * @param {string} text - Call in the notation described above
 * @param {number} figureBeat - Beat on which the figure starts
 * @param {number} [latestEnd] - The call must be finished by this beat (when the
 *   next call starts)
 * @returns {{text: string, syllables: {text: string, stressed: boolean, word: number, beat: number}[],
 *   start: number, end: number, figureBeat: number}} end is when the last syllable is finished
 */
export function placeCall(text, figureBeat, latestEnd = Infinity) {
    const syllables = parseCall(text);
    const rhythm = callRhythm(syllables);
    const first = rhythm[0];
    const lastSyllable = rhythm[rhythm.length - 1];

    // The last stress goes on the latest strong beat that gives enough warning,
    // moving earlier if needed to finish before the next call
    const ideal = figureBeat - leadBeats(lastSyllable - first);
    let stress = Math.floor(ideal / STRONG_BEAT_SPACING) * STRONG_BEAT_SPACING;
    while (stress + lastSyllable + SYLLABLE_BEATS > latestEnd + 1e-9) {
        stress -= STRONG_BEAT_SPACING;
    }

    return {
        text,
        syllables: syllables.map((syllable, i) => ({ ...syllable, beat: stress + rhythm[i] })),
        start: stress + first,
        end: stress + lastSyllable + SYLLABLE_BEATS,
        figureBeat
    };
}

/**
 * The same call said some beats later
 * @param {Object} call - As from placeCall
 * @param {number} beats
 * @returns {Object}
 */
function delayCall(call, beats) {
    return {
        ...call,
        syllables: call.syllables.map(syllable => ({ ...syllable, beat: syllable.beat + beats })),
        start: call.start + beats,
        end: call.end + beats
    };
}

/**
 * All the calls for a practice session: the full calls the first time through,
 * and the short ones (where a move has one) after that. Where calls come thick
 * and fast, a call moves earlier to finish before the next one starts. If that
 * would take it back before the music starts or into the call before, the short
 * call is used instead if it fits (as for the first call, over the potatoes);
 * failing that, the call moves later.
 * @param {Object} dance
 * @param {number} [rounds] - Times through the dance
 * @returns {Object[]} Calls in order (as from placeCall), each also giving its
 *   round, partIndex and moveIndex; beat 0 is the start of the first time through,
 *   and the intro before it has negative beats
 */
export function callSchedule(dance, rounds = PRACTICE_ROUNDS) {
    const wanted = [];
    for (let round = 0; round < rounds; round++) {
        dance.parts.forEach((part, partIndex) => {
            part.moves.forEach((move, moveIndex) => {
                const text = round > 0 && move.shortCall ? move.shortCall : move.call;
                if (!text) return;
                const figureBeat = round * danceBeats(dance) + moveStartBeat(dance, partIndex, moveIndex);
                wanted.push({ text, shortText: move.shortCall, figureBeat, round, partIndex, moveIndex });
            });
        });
    }

    // Place from the last call back, each finishing before the next starts...
    const calls = new Array(wanted.length);
    for (let i = wanted.length - 1; i >= 0; i--) {
        const { text, shortText, figureBeat, ...where } = wanted[i];
        calls[i] = { ...placeCall(text, figureBeat, calls[i + 1]?.start), ...where };
    }

    // ...then forward, so none starts before the music or overlaps the one before
    let earliest = -INTRO_BEATS;
    for (let i = 0; i < calls.length; i++) {
        const { text, shortText, figureBeat, ...where } = wanted[i];
        if (calls[i].start < earliest - 1e-9 && shortText && shortText !== text) {
            const short = placeCall(shortText, figureBeat, calls[i + 1]?.start);
            if (short.start >= earliest - 1e-9) {
                calls[i] = { ...short, ...where };
            }
        }
        while (calls[i].start < earliest - 1e-9) {
            calls[i] = delayCall(calls[i], STRONG_BEAT_SPACING);
        }
        earliest = calls[i].end;
    }
    return calls;
}

/**
 * The call as it is displayed, e.g. "Neighbors balance and swing"
 * @param {{text: string}[]} syllables
 * @returns {string}
 */
export function displayCall(syllables) {
    let text = '';
    syllables.forEach((syllable, i) => {
        if (i > 0 && syllable.word !== syllables[i - 1].word) text += ' ';
        text += syllable.text;
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** How a click in test mode is judged against the call's best start */
export const ON_TIME_BEATS = 0.5;
export const NEARLY_BEATS = 1.5;

/**
 * Judge a trainee's start of a call
 * @param {number} clickBeat - Beat on which the trainee started the call
 * @param {{start: number, end: number, figureBeat: number}} call - As placed by placeCall
 * @returns {{offset: number, grade: 'on time'|'a little early'|'a little late'|'early'|'late',
 *   endsBefore: number}} offset is beats late (negative = early); endsBefore is how
 *   many beats before the figure the call would finish, started then
 */
export function judgeCall(clickBeat, call) {
    const offset = clickBeat - call.start;
    let grade;
    if (Math.abs(offset) <= ON_TIME_BEATS) {
        grade = 'on time';
    } else if (Math.abs(offset) <= NEARLY_BEATS) {
        grade = offset < 0 ? 'a little early' : 'a little late';
    } else {
        grade = offset < 0 ? 'early' : 'late';
    }
    return { offset, grade, endsBefore: call.figureBeat - (call.end + offset) };
}
