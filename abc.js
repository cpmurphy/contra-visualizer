// Reads tunes written in ABC notation (https://abcnotation.com), the plain-text
// notation folk musicians share tunes in. Only what's needed to play a dance
// tune is understood: the X, T, M, L and K header fields; notes, rests,
// accidentals, octaves, lengths, ties, broken rhythms, triplets and chords
// ([DA]); chord symbols ("D", "Em", "A7"); bar lines, repeats and first and
// second endings. Decorations, slurs and grace notes are skipped.

/** Semitones above C of each note letter */
const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Order in which sharps, and flats, are added to a key signature */
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Sharps (positive) or flats (negative) in each major key */
const MAJOR_KEY_FIFTHS = {
    'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
    'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7
};

/** How many fifths each mode's key signature is from its tonic's major key */
const MODE_FIFTHS = { ion: 0, maj: 0, mix: -1, dor: -2, aeo: -3, min: -3, m: -3, phr: -4, loc: -5, lyd: 1 };

/** Single-character decorations, skipped */
const DECORATIONS = new Set(['~', '.', 'H', 'L', 'M', 'O', 'P', 'S', 'T', 'u', 'v']);

/** Notes played in the time of how many, for each kind of tuplet "(p" */
const TUPLET_TIME = { 2: 3, 3: 2, 4: 3 };

/** MIDI note number of middle C, written "C" in ABC */
const MIDDLE_C = 60;

/**
 * Key signature of an ABC key, e.g. "D", "Ador", "Em", "Bb mix"
 * @param {string} key
 * @returns {{tonic: number, accidentals: Object<string, number>}} tonic is a
 *   pitch class (0 = C); accidentals maps note letters to semitones (+1 sharp, -1 flat)
 */
export function keySignature(key) {
    const match = key.trim().match(/^([A-G])([#b]?)\s*([A-Za-z]*)/);
    if (!match) {
        throw new Error(`Can't read the key "${key}"`);
    }
    const [, letter, accidental, modeText] = match;
    const mode = modeText.toLowerCase().slice(0, 3) || 'maj';
    const modeFifths = MODE_FIFTHS[mode] ?? MODE_FIFTHS[modeText.toLowerCase()];
    if (modeFifths === undefined) {
        throw new Error(`Can't read the mode "${modeText}"`);
    }
    // The tonic's major key, then shift by the mode
    const tonicName = letter + accidental;
    const majorFifths = MAJOR_KEY_FIFTHS[tonicName];
    if (majorFifths === undefined) {
        throw new Error(`Can't read the key "${key}"`);
    }
    const fifths = majorFifths + modeFifths;

    const accidentals = {};
    if (fifths > 0) {
        SHARP_ORDER.slice(0, fifths).forEach(l => { accidentals[l] = 1; });
    } else {
        FLAT_ORDER.slice(0, -fifths).forEach(l => { accidentals[l] = -1; });
    }
    const tonic = (LETTER_SEMITONES[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12;
    return { tonic, accidentals };
}

/**
 * How long a dance beat is, as a fraction of a whole note: reels written in 4/4
 * or cut time have a beat per half note, 2/4 a beat per quarter note, and jigs
 * in 6/8 a beat per dotted quarter
 * @param {string} meter - e.g. "4/4", "C|", "6/8"
 * @returns {number}
 */
export function beatLength(meter) {
    const m = meter.trim();
    if (m === 'C' || m === 'C|') return 1 / 2;
    const match = m.match(/^(\d+)\/(\d+)$/);
    if (!match) {
        throw new Error(`Can't read the meter "${meter}"`);
    }
    const [top, bottom] = [Number(match[1]), Number(match[2])];
    if (bottom === 8 && top % 3 === 0) return 3 / 8; // Compound: 6/8, 9/8, 12/8
    if (top === 4 && bottom === 4) return 1 / 2;
    if (top === 2 && bottom === 2) return 1 / 2;
    return 1 / bottom;
}

/**
 * Read a chord symbol like "D", "Em", "A7" or "G/B"
 * @param {string} name
 * @returns {{name: string, root: number, minor: boolean, seventh: boolean}|null}
 *   root is a pitch class; null if it isn't a chord (e.g. an annotation)
 */
export function parseChord(name) {
    const match = name.match(/^([A-G])([#b]?)(m(?!aj))?(7)?/);
    if (!match) return null;
    const [, letter, accidental, minor, seventh] = match;
    const root = (LETTER_SEMITONES[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12;
    return { name, root, minor: Boolean(minor), seventh: Boolean(seventh) };
}

/**
 * Split the tune body into notes, rests, chord symbols, bar lines and the like
 * @param {string} body
 * @returns {Object[]}
 */
function tokenize(body) {
    const tokens = [];
    let i = 0;
    const peek = (offset = 0) => body[i + offset];

    // A length after a note or rest, e.g. "2", "/", "3/2", "//"
    const readLength = () => {
        const match = body.slice(i).match(/^(\d*)(\/*)(\d*)/);
        i += match[0].length;
        const numerator = match[1] ? Number(match[1]) : 1;
        if (!match[2]) return numerator;
        const denominator = match[3] ? Number(match[3]) : 2 ** match[2].length;
        return numerator / denominator;
    };

    // A pitch with any accidental, e.g. "^f", "=c", "A,"
    const readPitch = () => {
        const match = body.slice(i).match(/^(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)/);
        if (!match) return null;
        i += match[0].length;
        const [, accidental, letter, octaves] = match;
        let octave = letter === letter.toLowerCase() ? 1 : 0;
        for (const mark of octaves) octave += mark === "'" ? 1 : -1;
        const alter = { '^^': 2, '^': 1, '__': -2, '_': -1, '=': 0 }[accidental];
        return { letter: letter.toUpperCase(), octave, alter };
    };

    while (i < body.length) {
        const c = peek();

        if (c === '%') {
            // Comment to the end of the line
            while (i < body.length && peek() !== '\n') i++;
        } else if (/\s/.test(c) || c === '`' || c === '\\' || c === '$' || c === ')') {
            i++;
        } else if (c === '!' || c === '+') {
            // "!trill!" or "+trill+" is a decoration; a lone "!" is a line break
            const end = body.indexOf(c, i + 1);
            const inside = end > i ? body.slice(i + 1, end) : '';
            i = end > i && /^[^\s|]+$/.test(inside) ? end + 1 : i + 1;
        } else if (DECORATIONS.has(c)) {
            i++;
        } else if (c === '{') {
            // Grace notes
            i = body.indexOf('}', i) + 1 || body.length;
        } else if (c === '"') {
            const end = body.indexOf('"', i + 1);
            const chord = parseChord(body.slice(i + 1, end));
            if (chord) tokens.push({ type: 'chord', chord });
            i = end + 1;
        } else if (c === '(') {
            if (/\d/.test(peek(1))) {
                const p = Number(peek(1));
                i += 2;
                tokens.push({ type: 'tuplet', count: p, time: TUPLET_TIME[p] ?? 2 });
            } else {
                i++; // Slur
            }
        } else if (c === '-') {
            tokens.push({ type: 'tie' });
            i++;
        } else if (c === '>' || c === '<') {
            tokens.push({ type: 'broken', direction: c });
            i++;
        } else if (c === '|' || c === ':' || (c === '[' && /[|\d]/.test(peek(1)))) {
            // Bar line, repeat sign, or ending
            const match = body.slice(i).match(/^[|:\[\]]+/);
            const text = match[0];
            i += text.length;
            const ending = /\d/.test(peek()) && /[|\[]$/.test(text) ? Number(peek()) : null;
            if (ending !== null) {
                while (/[\d,\-]/.test(peek())) i++;
            }
            tokens.push({
                type: 'bar',
                endRepeat: text.startsWith(':'),
                startRepeat: text.endsWith(':'),
                sectionEnd: text.includes('||') || text.includes('|]'),
                ending
            });
        } else if (c === '[') {
            // A chord of notes, e.g. "[DA]2"; inline fields like "[K:G]" aren't supported
            if (/[A-Za-z]:/.test(body.slice(i + 1, i + 3))) {
                throw new Error(`Inline fields aren't supported: ${body.slice(i, body.indexOf(']', i) + 1)}`);
            }
            i++;
            const pitches = [];
            let length = null;
            while (i < body.length && peek() !== ']') {
                const pitch = readPitch();
                if (!pitch) throw new Error(`Can't read the chord at "${body.slice(i, i + 10)}"`);
                const noteLength = readLength();
                length ??= noteLength;
                pitches.push(pitch);
            }
            i++;
            tokens.push({ type: 'note', pitches, length: (length ?? 1) * readLength() });
        } else if (c === 'z' || c === 'x') {
            i++;
            tokens.push({ type: 'rest', length: readLength() });
        } else {
            const pitch = readPitch();
            if (!pitch) {
                throw new Error(`Can't read the tune at "${body.slice(i, i + 10)}"`);
            }
            tokens.push({ type: 'note', pitches: [pitch], length: readLength() });
        }
    }
    return tokens;
}

/**
 * Play the repeats and endings, giving the tokens in the order they're heard
 * @param {Object[]} tokens
 * @returns {Object[]}
 */
function expandRepeats(tokens) {
    const heard = [];
    let repeatStart = 0;
    let pass = 1;
    let ending = null; // The ending (1 or 2) being read, if any
    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        if (token.type === 'bar' && token.ending === null && ending !== null && ending !== pass) {
            // Inside an ending that isn't played this time, repeat signs included
            i++;
            continue;
        }
        if (token.type === 'bar') {
            heard.push(token);
            if (token.ending !== null) {
                ending = token.ending;
            } else if (ending === 2 && (token.sectionEnd || token.startRepeat || token.endRepeat)) {
                ending = null;
            }
            if (token.endRepeat) {
                if (pass === 1) {
                    pass = 2;
                    ending = null;
                    i = repeatStart;
                    continue;
                }
                pass = 1;
                ending = null;
            }
            if (token.startRepeat) {
                repeatStart = i + 1;
                pass = 1;
            } else if (token.sectionEnd && ending === null) {
                repeatStart = i + 1;
            }
        } else if (ending === null || ending === pass) {
            heard.push(token);
        }
        i++;
    }
    return heard;
}

/**
 * Read a tune
 * @param {string} abc - The tune in ABC notation
 * @returns {{title: string, meter: string, compound: boolean, tonic: number, beats: number,
 *   notes: {beat: number, beats: number, midi: number[]}[],
 *   chords: {beat: number, root: number, minor: boolean, seventh: boolean, name: string}[]}}
 *   Times are in dance beats from the start of the tune; beats is the tune's length
 */
export function parseAbc(abc) {
    const fields = {};
    const bodyLines = [];
    let inBody = false;
    for (const line of abc.split('\n')) {
        const field = line.match(/^([A-Za-z]):\s*(.*)$/);
        if (!inBody && field) {
            fields[field[1]] ??= field[2].trim();
            if (field[1] === 'K') inBody = true;
        } else if (inBody && !/^\s*%/.test(line)) {
            bodyLines.push(line);
        }
    }
    if (!fields.K) {
        throw new Error('A tune needs a key (a K: line, ending the header)');
    }

    const meter = fields.M ?? '4/4';
    const unit = fields.L ? parseFraction(fields.L) : 1 / 8;
    const beatsPerUnit = unit / beatLength(meter);
    const key = keySignature(fields.K);

    const notes = [];
    const chords = [];
    let position = 0; // In beats
    let barAccidentals = {};
    let tuplet = null; // {left, scale}
    let tied = false;
    let broken = null; // Scale for the next note, after "<" or ">"

    for (const token of expandRepeats(tokenize(bodyLines.join('\n')))) {
        if (token.type === 'bar') {
            barAccidentals = {};
        } else if (token.type === 'chord') {
            chords.push({ beat: roundBeat(position), ...token.chord });
        } else if (token.type === 'tuplet') {
            tuplet = { left: token.count, scale: token.time / token.count };
        } else if (token.type === 'tie') {
            tied = true;
        } else if (token.type === 'broken') {
            // The note before gets longer (">") or shorter ("<"), the next the opposite
            const before = notes.at(-1);
            const longer = token.direction === '>';
            if (before) {
                const change = before.beats * (longer ? 0.5 : -0.5);
                before.beats += change;
                position += change;
            }
            broken = longer ? 0.5 : 1.5;
        } else {
            let beats = token.length * beatsPerUnit;
            if (tuplet) {
                beats *= tuplet.scale;
                if (--tuplet.left === 0) tuplet = null;
            }
            if (broken !== null) {
                beats *= broken;
                broken = null;
            }

            if (token.type === 'note') {
                const midi = token.pitches.map(({ letter, octave, alter }) => {
                    const pitchKey = `${letter}${octave}`;
                    if (alter !== undefined) barAccidentals[pitchKey] = alter;
                    const accidental = barAccidentals[pitchKey] ?? key.accidentals[letter] ?? 0;
                    return MIDDLE_C + 12 * octave + LETTER_SEMITONES[letter] + accidental;
                });
                const previous = notes.at(-1);
                if (tied && previous && previous.midi.join() === midi.join()) {
                    previous.beats += beats;
                } else {
                    notes.push({ beat: roundBeat(position), beats, midi });
                }
            }
            tied = false;
            position += beats;
        }
    }

    return {
        title: fields.T ?? 'Untitled',
        meter,
        compound: beatLength(meter) === 3 / 8,
        tonic: key.tonic,
        beats: roundBeat(position),
        notes,
        chords
    };
}

/**
 * Round away the error that builds up adding thirds of a beat (in jigs)
 * @param {number} beat
 * @returns {number}
 */
function roundBeat(beat) {
    return Math.round(beat * 1e6) / 1e6;
}

/**
 * Value of a fraction like "1/8"
 * @param {string} text
 * @returns {number}
 */
function parseFraction(text) {
    const match = text.match(/^(\d+)\/(\d+)$/);
    if (!match) {
        throw new Error(`Can't read the note length "${text}"`);
    }
    return Number(match[1]) / Number(match[2]);
}
