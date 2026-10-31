// A practice session: an intro (the potatoes) and then the dance PRACTICE_ROUNDS times
// from the top, with the calls: shown as they're said ('karaoke'), or made by the
// trainee, who presses Call when they would start each one ('test'). This keeps
// track of the calls and tells the call panel what to show; app.js plays the dance.

import { PRACTICE_ROUNDS, callSchedule, displayCall, judgeCall } from './calls.js';

/** Beats a finished call stays lit before the next one replaces it */
const CALL_HOLD_BEATS = 1;

/**
 * Format a number of beats, e.g. "1.5 beats"
 * @param {number} beats
 * @returns {string}
 */
function formatBeats(beats) {
    const rounded = Math.round(Math.abs(beats) * 4) / 4;
    return `${rounded} beat${rounded === 1 ? '' : 's'}`;
}

export class PracticeSession {
    /**
     * @param {Object} dance
     * @param {'karaoke'|'test'} mode
     * @param {import('./callPanel.js').CallPanel} panel
     */
    constructor(dance, mode, panel) {
        this.mode = mode;
        this.panel = panel;
        this.calls = callSchedule(dance);
        this.intro = true;
        this.round = 0;
        this.attempts = []; // Test mode: for each call, how the trainee did
        this.nextCall = 0; // Test mode: the next call the trainee is to make
        panel.reset();
    }

    /**
     * Bring the call panel up to date with the music
     * @param {number} beat - Beats from the start of the dance
     */
    update(beat) {
        if (this.mode === 'karaoke') {
            // The call being said, or the next one coming
            const index = this.calls.findIndex(call => call.end + CALL_HOLD_BEATS > beat);
            const call = index < 0 ? null : this.calls[index];
            this.panel.showCall(call, 0, beat);
            const next = index < 0 ? null : this.calls[index + 1];
            this.panel.showNext(next ? `Then: ${displayCall(next.syllables)}` : '');
            return;
        }

        // Test mode: a call whose figure has started without being made is missed
        while (this.nextCall < this.calls.length && beat >= this.calls[this.nextCall].figureBeat) {
            const call = this.calls[this.nextCall];
            this.attempts[this.nextCall] = { missed: true };
            this.panel.addFeedback(`Missed: ${displayCall(call.syllables)}`, 'off');
            this.nextCall++;
        }

        // The call the trainee made, while they are saying it; otherwise a reminder
        // of what comes next, like the card a caller keeps in hand
        const lastIndex = this.attempts.findLastIndex(attempt => attempt && !attempt.missed);
        const last = this.attempts[lastIndex];
        const lastCall = this.calls[lastIndex];
        if (last && beat < lastCall.end + last.offset + CALL_HOLD_BEATS) {
            this.panel.showCall(lastCall, last.offset, beat);
        } else {
            this.panel.showCall(null, 0, beat);
        }
        const upcoming = this.calls[this.nextCall];
        this.panel.showNext(upcoming ? `Next: ${displayCall(upcoming.syllables)}` : '');
    }

    /**
     * Test mode: the trainee starts the next call now
     * @param {number} beat - Beats from the start of the dance
     */
    makeCall(beat) {
        if (this.nextCall >= this.calls.length) return;

        const index = this.nextCall++;
        const call = this.calls[index];
        const judged = judgeCall(beat, call);
        this.attempts[index] = { clickBeat: beat, ...judged };

        let text = `${displayCall(call.syllables)}: ${judged.grade}`;
        if (judged.grade !== 'on time') {
            text += ` (${formatBeats(judged.offset)})`;
        }
        if (judged.endsBefore < 0) {
            text += `, running ${formatBeats(judged.endsBefore)} into the figure`;
        }
        const style = judged.grade === 'on time' ? 'on-time' : judged.grade.startsWith('a little') ? 'nearly' : 'off';
        this.panel.addFeedback(text, style);
    }

    /**
     * The session has played through: say how it went
     */
    finish() {
        if (this.mode === 'test') {
            // Calls still to come when the music stopped count as missed
            for (let i = this.nextCall; i < this.calls.length; i++) {
                this.attempts[i] = { missed: true };
            }
            this.panel.showSummary(`${this.summary()}.`);
        } else {
            this.panel.showFinished(`That's ${PRACTICE_ROUNDS} times through.`);
        }
    }

    /**
     * Test mode: how the trainee did over the whole session
     * @returns {string}
     */
    summary() {
        const counts = { onTime: 0, nearly: 0, missed: 0 };
        for (const attempt of this.attempts) {
            if (attempt.missed) counts.missed++;
            else if (attempt.grade === 'on time') counts.onTime++;
            else if (attempt.grade.startsWith('a little')) counts.nearly++;
        }
        const total = this.calls.length;
        let text = `On time for ${counts.onTime} of ${total} calls`;
        if (counts.nearly) text += `, close on ${counts.nearly}`;
        if (counts.missed) text += `, missed ${counts.missed}`;
        return text;
    }
}
