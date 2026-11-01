// The band: an accordion, a fiddle and a piano, synthesized with the Web Audio
// API and playing together in a room. A Band plays single notes and chords on
// them; music.js says what to play and when.

/** Loudness of the band as a whole, and of each instrument */
const BAND_GAIN = 0.6;
const ACCORDION_GAIN = 0.3;
const FIDDLE_GAIN = 0.22;
const PIANO_GAIN = 0.2;

/** How much of the band is heard from the room, and how long the room rings */
const ROOM_GAIN = 0.3;
const ROOM_SECONDS = 1.3;
const ROOM_DELAY_SECONDS = 0.015;

/** Where each instrument stands, from -1 (left) to 1 (right) */
const STAGE = { accordion: -0.2, fiddle: 0.25, piano: 0.1 };

/** Seconds to fade out a note that is cut short (on pause, say) */
const FADE_SECONDS = 0.03;

/** The strengths of an accordion reed's harmonics, the first being the note itself */
const REED_HARMONICS = [1, 0.8, 0.62, 0.5, 0.42, 0.32, 0.25, 0.2, 0.15, 0.11, 0.08, 0.06];

/** A piano string's: rich low down, with the rest fading away by the sixteenth */
const STRING_HARMONICS = [1, 0.62, 0.42, 0.3, 0.22, 0.17, 0.12, 0.09, 0.07, 0.05, 0.04, 0.03, 0.02, 0.015, 0.01, 0.008];

/**
 * An accordion's reeds for each note: two in the middle octave tuned a little
 * apart, which gives it its shimmer, and a quieter one an octave down for warmth
 */
const REEDS = [
    { octave: 0, cents: -5, level: 1 },
    { octave: 0, cents: 6, level: 0.8 },
    { octave: -1, cents: 0, level: 0.35 }
];

/**
 * Frequency of a MIDI note
 * @param {number} midi
 * @returns {number} Hz
 */
export function midiFrequency(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * The sound of a room's echoes: noise that dies away, losing its high
 * frequencies as it goes, after a moment's silence for the first echo to arrive
 * @param {number} seconds - How long it rings
 * @param {number} sampleRate
 * @param {number} delaySeconds - Silence before it
 * @param {() => number} [random] - Numbers from 0 up to 1
 * @returns {Float32Array}
 */
export function roomEchoes(seconds, sampleRate, delaySeconds, random = Math.random) {
    const samples = new Float32Array(Math.ceil(seconds * sampleRate));
    const start = Math.floor(delaySeconds * sampleRate);
    let smoothed = 0;
    for (let i = start; i < samples.length; i++) {
        const age = (i - start) / (samples.length - start);
        // Smooth the noise more and more with age, taking out the highs
        const smoothing = 0.15 + 0.75 * age;
        smoothed = smoothing * smoothed + (1 - smoothing) * (random() * 2 - 1);
        samples[i] = smoothed * 10 ** (-3 * age); // Down 60 dB by the end
    }
    return samples;
}

/**
 * Something sounding: what makes the sound, and the gains shaping it
 * @param {AudioContext} context
 * @param {AudioScheduledSourceNode[]} sources
 * @param {GainNode[]} envelopes
 * @param {number} end - When it has finished, in seconds on the audio clock
 * @returns {{end: number, cancel: () => void}}
 */
function sounding(context, sources, envelopes, end) {
    return {
        end,
        cancel() {
            const now = context.currentTime;
            for (const envelope of envelopes) {
                envelope.gain.cancelScheduledValues(now);
                envelope.gain.setTargetAtTime(0, now, FADE_SECONDS / 3);
            }
            for (const source of sources) {
                source.stop(now + FADE_SECONDS);
            }
        }
    };
}

/**
 * Several things sounding as one
 * @param {{end: number, cancel: () => void}[]} sounds
 * @returns {{end: number, cancel: () => void}}
 */
export function together(sounds) {
    return {
        end: Math.max(...sounds.map(sound => sound.end)),
        cancel() {
            for (const sound of sounds) sound.cancel();
        }
    };
}

/**
 * A wave with the given harmonics
 * @param {AudioContext} context
 * @param {number[]} harmonics - Their strengths, the fundamental first
 * @returns {PeriodicWave}
 */
function waveOf(context, harmonics) {
    const strengths = Float32Array.from([0, ...harmonics]);
    return context.createPeriodicWave(new Float32Array(strengths.length), strengths);
}

/**
 * The band, playing into an audio context
 */
export class Band {
    /**
     * @param {AudioContext} context
     * @param {Object} [options]
     * @param {() => number} [options.random] - Numbers from 0 up to 1
     */
    constructor(context, { random = Math.random } = {}) {
        this.context = context;
        this.random = random;
        this.reedWave = waveOf(context, REED_HARMONICS);
        this.stringWave = waveOf(context, STRING_HARMONICS);
        this.noise = this.makeNoise();

        const band = this.makeRoom();
        // Each instrument has its own tone: the filters stand for the resonances
        // of its body, cutting or boosting the same way whichever note is played
        this.accordion = this.makeBody(band, STAGE.accordion, ACCORDION_GAIN, [
            { type: 'highpass', frequency: 150 },
            { type: 'peaking', frequency: 1200, Q: 0.8, gain: 3 },
            { type: 'lowpass', frequency: 4500, Q: 0.5 }
        ]);
        this.fiddle = this.makeBody(band, STAGE.fiddle, FIDDLE_GAIN, [
            { type: 'highpass', frequency: 190 },
            { type: 'peaking', frequency: 290, Q: 2, gain: 5 },
            { type: 'peaking', frequency: 700, Q: 2, gain: 4 },
            { type: 'peaking', frequency: 1500, Q: 1.5, gain: -4 },
            { type: 'peaking', frequency: 2900, Q: 1, gain: 5 },
            { type: 'lowpass', frequency: 6000, Q: 0.5 }
        ]);
        this.piano = this.makeBody(band, STAGE.piano, PIANO_GAIN, [
            { type: 'peaking', frequency: 180, Q: 0.7, gain: 2 },
            { type: 'highshelf', frequency: 2500, gain: -4 }
        ]);
    }

    /**
     * Connect up the room, with a limiter on the end: it stays out of the way
     * but for the odd peak, which would otherwise clip
     * @returns {GainNode} Where the instruments play into
     */
    makeRoom() {
        const { context } = this;
        const band = context.createGain();
        band.gain.value = BAND_GAIN;

        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.1;
        limiter.connect(context.destination);
        band.connect(limiter);

        const room = context.createConvolver();
        const length = Math.ceil(ROOM_SECONDS * context.sampleRate);
        const echoes = context.createBuffer(2, length, context.sampleRate);
        for (const channel of [0, 1]) {
            // Different echoes in each ear, for a feeling of space
            echoes.copyToChannel(
                roomEchoes(ROOM_SECONDS, context.sampleRate, ROOM_DELAY_SECONDS, this.random), channel);
        }
        room.buffer = echoes;
        const roomGain = context.createGain();
        roomGain.gain.value = ROOM_GAIN;
        band.connect(room);
        room.connect(roomGain);
        roomGain.connect(limiter);
        return band;
    }

    /**
     * A second of noise, for the hammer and the bow
     * @returns {AudioBuffer}
     */
    makeNoise() {
        const { context } = this;
        const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        buffer.copyToChannel(Float32Array.from({ length: context.sampleRate }, () => this.random() * 2 - 1), 0);
        return buffer;
    }

    /**
     * An instrument's body: its filters, and its place on the stage
     * @param {AudioNode} band - Where it plays into
     * @param {number} pan
     * @param {number} gain
     * @param {{type: BiquadFilterType, frequency: number, Q?: number, gain?: number}[]} filters
     * @returns {GainNode} Where its notes play into
     */
    makeBody(band, pan, gain, filters) {
        const { context } = this;
        const body = context.createGain();
        body.gain.value = gain;
        let last = body;
        for (const { type, frequency, Q, gain: boost } of filters) {
            const filter = context.createBiquadFilter();
            filter.type = type;
            filter.frequency.value = frequency;
            if (Q !== undefined) filter.Q.value = Q;
            if (boost !== undefined) filter.gain.value = boost;
            last.connect(filter);
            last = filter;
        }
        const panner = context.createStereoPanner();
        panner.pan.value = pan;
        last.connect(panner);
        panner.connect(band);
        return body;
    }

    /**
     * An oscillator already set going, so that notes differ in how their waves
     * line up. It starts up to 20 ms early: the envelope keeps it quiet until the note.
     * @param {number} frequency - Hz
     * @param {number} cents - Detuning
     * @param {AudioNode} into
     * @param {number} time - When the note starts
     * @param {number} end - When it stops
     * @returns {OscillatorNode}
     */
    tone(frequency, cents, into, time, end) {
        const oscillator = this.context.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.detune.value = cents;
        oscillator.connect(into);
        oscillator.start(Math.max(0, time - this.random() * 0.02));
        oscillator.stop(end);
        return oscillator;
    }

    /**
     * A short burst of noise, from somewhere in the second of it
     * @param {AudioNode} into
     * @param {number} frequency - Where the noise is centred, in Hz
     * @param {number} level
     * @param {number} time
     * @param {number} seconds - How quickly it dies away
     * @returns {{source: AudioBufferSourceNode, envelope: GainNode}}
     */
    burst(into, frequency, level, time, seconds) {
        const { context } = this;
        const source = context.createBufferSource();
        source.buffer = this.noise;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = 0.8;
        const envelope = context.createGain();
        envelope.gain.value = 0;
        envelope.gain.setValueAtTime(level, time);
        envelope.gain.setTargetAtTime(0, time, seconds / 3);
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(into);
        source.start(time, this.random() * 0.8);
        source.stop(time + seconds * 2);
        return { source, envelope };
    }

    /**
     * Accordion notes: the reeds speak quickly, then hold steady
     * @param {number[]} midis
     * @param {number} time - Audio-clock time in seconds
     * @param {number} seconds - How long they're held
     * @param {number} loudness - 1 for a strong note
     * @returns {{end: number, cancel: () => void}}
     */
    playAccordion(midis, time, seconds, loudness) {
        const { context } = this;
        const release = time + Math.max(0.03, seconds - 0.012);
        const end = release + 0.08;
        const peak = loudness / midis.length ** 0.5;

        const envelope = context.createGain();
        envelope.gain.value = 0;
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(peak, time + 0.015);
        // The push on the bellows that starts a note eases off
        envelope.gain.setTargetAtTime(peak * 0.85, time + 0.015, 0.09);
        envelope.gain.setTargetAtTime(0, release, 0.015);
        envelope.connect(this.accordion);

        const reeds = midis.flatMap(midi => REEDS.map(({ octave, cents, level }) => {
            const reed = context.createGain();
            reed.gain.value = level;
            reed.connect(envelope);
            const oscillator = this.tone(
                midiFrequency(midi + 12 * octave), cents + this.random() * 2 - 1, reed, time, end);
            oscillator.setPeriodicWave(this.reedWave);
            return oscillator;
        }));
        return sounding(context, reeds, [envelope], end);
    }

    /**
     * Fiddle notes: sawtooth waves stand for the string pulled along by the bow,
     * a little noise for its bite, and the tone opens up as the bow gets going.
     * Each note is a shade off true, as a player's fingers are.
     * @param {number[]} midis
     * @param {number} time - Audio-clock time in seconds
     * @param {number} seconds - How long they're held
     * @param {number} loudness - 1 for a strong note
     * @returns {{end: number, cancel: () => void}}
     */
    playFiddle(midis, time, seconds, loudness) {
        const { context } = this;
        const release = time + Math.max(0.04, seconds - 0.02);
        const end = release + 0.1;
        const peak = loudness / midis.length ** 0.5;

        const envelope = context.createGain();
        envelope.gain.value = 0;
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(peak * 0.8, time + 0.03);
        envelope.gain.linearRampToValueAtTime(peak, Math.min(release, time + 0.12));
        envelope.gain.setTargetAtTime(0, release, 0.02);
        envelope.connect(this.fiddle);

        const strings = midis.flatMap(midi => {
            const frequency = midiFrequency(midi);
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.Q.value = 0.5;
            const open = Math.min(6500, frequency * 8);
            filter.frequency.setValueAtTime(open * 0.5, time);
            filter.frequency.exponentialRampToValueAtTime(open, time + 0.05);
            filter.connect(envelope);
            const offTrue = (this.random() * 2 - 1) * 3;
            return [-2, 2].map(cents => {
                const oscillator = this.tone(frequency, offTrue + cents, filter, time, end);
                oscillator.type = 'sawtooth';
                return oscillator;
            });
        });
        const bite = this.burst(this.fiddle, 3000, peak * 0.12, time, 0.03);
        return sounding(context, [...strings, bite.source], [envelope, bite.envelope], end);
    }

    /**
     * Piano notes, played with the keys let go after a time: a hammer's knock,
     * then strings ringing away, duller as they go and quicker the higher they are.
     * The notes of a chord come a few milliseconds apart.
     * @param {number[]} midis
     * @param {number} time - Audio-clock time in seconds
     * @param {number} seconds - How long the keys are held
     * @param {number} loudness - 1 for a strong note
     * @returns {{end: number, cancel: () => void}}
     */
    playPiano(midis, time, seconds, loudness) {
        const level = loudness / midis.length ** 0.5;
        return together(midis.map((midi, index) => {
            const start = time + index * 0.004;
            const strength = level * (0.9 + this.random() * 0.2);
            return this.playPianoNote(midi, start, seconds, strength);
        }));
    }

    /**
     * One piano note
     * @param {number} midi
     * @param {number} time - Audio-clock time in seconds
     * @param {number} seconds - How long the key is held
     * @param {number} strength - How hard it's struck
     * @returns {{end: number, cancel: () => void}}
     */
    playPianoNote(midi, time, seconds, strength) {
        const { context } = this;
        const release = time + seconds;
        const end = release + 0.25;
        const frequency = midiFrequency(midi);

        const envelope = context.createGain();
        envelope.gain.value = 0;
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(strength, time + 0.003);
        envelope.gain.setTargetAtTime(0, time + 0.003, 1.5 * 2 ** (-(midi - 36) / 18));
        envelope.gain.setTargetAtTime(0, release, 0.05); // The damper comes down
        envelope.connect(this.piano);

        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.5;
        const bright = Math.min(7000, frequency * (2 + 8 * strength));
        filter.frequency.setValueAtTime(bright, time);
        filter.frequency.setTargetAtTime(Math.min(bright, frequency * 3), time, 0.2);
        filter.connect(envelope);

        // Each key has strings a shade apart
        const strings = [-0.8, 1].map(cents => {
            const oscillator = this.tone(frequency, cents, filter, time, end);
            oscillator.setPeriodicWave(this.stringWave);
            return oscillator;
        });
        const hammer = this.burst(this.piano, Math.min(2500, frequency * 6), strength * 0.15, time, 0.012);
        return sounding(context, [...strings, hammer.source], [envelope, hammer.envelope], end);
    }
}
