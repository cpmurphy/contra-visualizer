// Plays sounds in time with the dance. Sounds are scheduled slightly ahead on
// the audio clock, so they keep steady time however unevenly the animation
// frames arrive. Subclasses say what to play (eventsBetween) and how (play).

/** How far ahead (in seconds) sounds are scheduled on the audio clock */
const LOOKAHEAD_SECONDS = 0.15;

/** A sound this late (in seconds) is still played, at once; a later one is skipped */
const LATE_SECONDS = 0.05;

/** How often (in milliseconds) the scheduler looks for sounds to schedule */
const SCHEDULE_INTERVAL_MS = 25;

/**
 * Keeps an audio-clock schedule in step with a position in the dance
 */
export class BeatScheduler {
    /**
     * @param {Object} [options]
     * @param {() => AudioContext} [options.createContext] - Makes (or shares) the
     *   audio context, replaceable for testing; it is called on first use
     */
    constructor({ createContext = () => new AudioContext() } = {}) {
        this.createContext = createContext;
        this.context = null;
        this.enabled = true;
        this.timer = null;
        this.anchor = null; // {beat, audioTime, secondsPerBeat} while running
        this.scheduledUpTo = null; // Beat up to which sounds have been scheduled
        this.scheduled = []; // Sounds scheduled and not yet finished
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
     * Turn the sound on or off; while off, nothing is scheduled
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        this.resync();
    }

    /**
     * Drop what has been scheduled and carry on from now, after a change to
     * what is to be played
     */
    resync() {
        this.cancelScheduled();
        if (this.anchor) {
            this.scheduledUpTo = this.beatAtAudioTime(this.context.currentTime);
        }
    }

    /**
     * Start playing, in time with a dance position
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
        // Starting just after a beat (the first animation frame comes a moment after
        // the move starts), still play it, if only just late
        this.scheduledUpTo = beat - LATE_SECONDS / this.anchor.secondsPerBeat;
        this.schedule();
        this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
    }

    /**
     * Stop, silencing anything scheduled or still sounding
     */
    stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.anchor = null;
        this.scheduledUpTo = null;
        this.cancelScheduled();
    }

    /**
     * Whether it is keeping time (even if muted)
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
     * Length in seconds of some beats at the current tempo
     * @param {number} beats
     * @returns {number}
     */
    secondsOf(beats) {
        return beats * this.anchor.secondsPerBeat;
    }

    /**
     * Schedule the sounds that fall within the lookahead window
     */
    schedule() {
        if (!this.anchor) return;
        const now = this.context.currentTime;
        this.scheduled = this.scheduled.filter(sound => sound.end > now);
        if (!this.enabled) return;

        const to = this.beatAtAudioTime(now + LOOKAHEAD_SECONDS);
        for (const event of this.eventsBetween(this.scheduledUpTo, to)) {
            const time = this.audioTimeOfBeat(event.beat);
            // The first sound may be a moment late, when starting; one long gone
            // is skipped rather than played out of time
            if (time >= now - LATE_SECONDS) {
                this.scheduled.push(this.play(event, Math.max(time, now)));
            }
        }
        this.scheduledUpTo = to;
    }

    /**
     * What to play from one beat (inclusive) to another (exclusive)
     * @param {number} fromBeat
     * @param {number} toBeat
     * @returns {{beat: number}[]}
     */
    eventsBetween(fromBeat, toBeat) { // eslint-disable-line no-unused-vars
        return [];
    }

    /**
     * Schedule one sound
     * @param {{beat: number}} event - From eventsBetween
     * @param {number} time - Audio-clock time in seconds
     * @returns {{end: number, cancel: () => void}} end is when it has finished
     *   sounding; cancel silences it
     */
    play(event, time) { // eslint-disable-line no-unused-vars
        throw new Error('Subclasses say how to play');
    }

    /**
     * Silence everything scheduled or still sounding
     */
    cancelScheduled() {
        for (const sound of this.scheduled) {
            try {
                sound.cancel();
            } catch {
                // Already stopped
            }
        }
        this.scheduled = [];
    }
}
