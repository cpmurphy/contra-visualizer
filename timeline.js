// Where beats fall in the music: the parts and phrases of a dance, the moves in
// them, and the introduction before the dance starts. Beats count from 0 at the
// start of the dance, so the introduction's beats are negative.

/** Beats in a musical phrase; a phrase starts on beats 1 and 9 of a 16-beat part */
export const PHRASE_BEATS = 8;

/** Beats of music before the dance starts (the lead fiddle's "potatoes"), during
 * which the first call is made */
export const INTRO_BEATS = 4;

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
 * Name of a beat, e.g. "A1 · 3" (beats counted from 1, as the music is)
 * @param {Object} dance
 * @param {number} beat - Beats from the start of the dance
 * @returns {string}
 */
export function beatLabel(dance, beat) {
    const whole = Math.floor(beat + 1e-6);
    if (whole < 0) {
        return `Potatoes · ${whole + INTRO_BEATS + 1}`;
    }
    const { partIndex, beatInPart } = locateBeat(dance, whole);
    return `${dance.parts[partIndex].name} · ${beatInPart + 1}`;
}
