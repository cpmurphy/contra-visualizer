// Metronome: a click on every beat of the music, played with the Web Audio API.
// Clicks are scheduled slightly ahead on the audio clock, so they keep steady
// time however unevenly the animation frames arrive.

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

/** How far ahead (in seconds) clicks are scheduled on the audio clock */
const LOOKAHEAD_SECONDS = 0.15;

/** A beat this late (in seconds) is still played, at once; a later one is skipped */
const LATE_SECONDS = 0.05;

/** How often (in milliseconds) the scheduler looks for clicks to schedule */
const SCHEDULE_INTERVAL_MS = 25;

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
export class Metronome {
    /**
     * @param {Object} [options]
     * @param {() => AudioContext} [options.createContext] - Makes the audio context
     *   (replaceable for testing); it is created on first use
     * @param {(beat: number) => string} [options.accentOf] - Accent of a whole beat of
     *   the dance (see beatAccent); every beat is 'strong' if not given
     */
    constructor({ createContext = () => new AudioContext(), accentOf = () => 'strong' } = {}) {
        this.createContext = createContext;
        this.accentOf = accentOf;
        this.context = null;
        this.enabled = true;
        this.timer = null;
        this.anchor = null; // {beat, audioTime, secondsPerBeat} while running
        this.nextBeat = null; // Next whole beat to schedule
        this.scheduled = []; // Clicks scheduled but maybe not yet heard
    }

    /**
     * Create (or wake) the audio context. Browsers only allow audio to start in
     * response to a user action, so call this from a click handler.
     */
    unlock() {
        if (!this.context) {
            this.context = this.createContext();
        }
        if (this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    /**
     * Turn the clicks on or off; while off, nothing is scheduled
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.cancelScheduled();
        } else if (this.anchor) {
            // Pick up from the next beat after now
            this.nextBeat = Math.ceil(this.beatAtAudioTime(this.context.currentTime));
        }
    }

    /**
     * Start clicking, in time with a dance position
     * @param {number} beat - Position in the dance (beats from its start, may be
     *   fractional) at the moment given by timestampMs
     * @param {number} timestampMs - A performance.now() time
     * @param {number} tempo - Beats per minute
     * @param {number} [nowMs] - performance.now() at the time of the call
     */
    start(beat, timestampMs, tempo, nowMs = performance.now()) {
        this.stop();
        if (!this.context) return;

        // Line the audio clock up with the animation clock
        const audioTime = this.context.currentTime + (timestampMs - nowMs) / 1000;
        this.anchor = { beat, audioTime, secondsPerBeat: 60 / tempo };
        this.nextBeat = Math.ceil(beat);
        this.schedule();
        this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
    }

    /**
     * Stop clicking, silencing any clicks scheduled but not yet heard
     */
    stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.anchor = null;
        this.nextBeat = null;
        this.cancelScheduled();
    }

    /**
     * Whether the metronome is keeping time (even if muted)
     * @returns {boolean}
     */
    isRunning() {
        return this.anchor !== null;
    }

    /**
     * Audio-clock time of a beat of the dance
     * @param {number} beat
     * @returns {number} Seconds
     */
    audioTimeOfBeat(beat) {
        return this.anchor.audioTime + (beat - this.anchor.beat) * this.anchor.secondsPerBeat;
    }

    /**
     * Beat of the dance playing at an audio-clock time
     * @param {number} audioTime - Seconds
     * @returns {number}
     */
    beatAtAudioTime(audioTime) {
        return this.anchor.beat + (audioTime - this.anchor.audioTime) / this.anchor.secondsPerBeat;
    }

    /**
     * Schedule the clicks that fall within the lookahead window
     */
    schedule() {
        if (!this.anchor) return;
        const now = this.context.currentTime;
        this.scheduled = this.scheduled.filter(click => click.time > now);
        if (!this.enabled) return;

        while (this.audioTimeOfBeat(this.nextBeat) < now + LOOKAHEAD_SECONDS) {
            const time = this.audioTimeOfBeat(this.nextBeat);
            // The first beat may be a moment late, when starting; a beat long gone
            // is skipped rather than played out of time
            if (time >= now - LATE_SECONDS) {
                this.scheduled.push(this.click(Math.max(time, now), this.accentOf(this.nextBeat)));
            }
            this.nextBeat++;
        }
    }

    /**
     * Schedule one click
     * @param {number} time - Audio-clock time in seconds
     * @param {string} accent - Key of CLICK_SOUNDS
     * @returns {{time: number, oscillator: OscillatorNode}}
     */
    click(time, accent) {
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
        return { time, accent, oscillator };
    }

    /**
     * Silence clicks scheduled for the future
     */
    cancelScheduled() {
        for (const click of this.scheduled) {
            try {
                click.oscillator.stop();
            } catch {
                // Already stopped
            }
        }
        this.scheduled = [];
    }
}
