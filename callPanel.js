// The call panel: the beat counter, the call line with its syllables lighting up
// as they're said, what's coming next, and the feedback list.

/**
 * @typedef {Object} CallPanelElements
 * @property {HTMLElement} beatCounter
 * @property {HTMLElement} callLine
 * @property {HTMLElement} callNext
 * @property {HTMLElement} callFeedback
 */

export class CallPanel {
    /**
     * @param {CallPanelElements} elements
     */
    constructor({ beatCounter, callLine, callNext, callFeedback }) {
        this.beatCounter = beatCounter;
        this.callLine = callLine;
        this.callNext = callNext;
        this.callFeedback = callFeedback;
        // The call on the call line, and how many beats late it's being said
        this.shownCall = null;
        this.shownOffset = 0;
    }

    /**
     * Get ready for a practice session
     */
    reset() {
        this.shownCall = null;
        this.shownOffset = 0;
        this.callNext.textContent = '';
        this.callFeedback.replaceChildren();
    }

    showIdle() {
        this.beatCounter.textContent = '';
        this.callLine.replaceChildren();
        this.callLine.className = 'idle';
        this.callLine.textContent = 'Practice Calls shows the calls in time; Test Me lets you make them.';
        this.callNext.textContent = '';
        this.callFeedback.replaceChildren();
    }

    /**
     * @param {string} label - Name of the beat the music has got to
     */
    showBeat(label) {
        this.beatCounter.textContent = label;
    }

    /**
     * @param {string} text - What's coming after the call line
     */
    showNext(text) {
        this.callNext.textContent = text;
    }

    /**
     * Show a call on the call line, lighting up the syllables said so far
     * @param {Object|null} call - From callSchedule
     * @param {number} offset - Beats later than scheduled that the call is said
     * @param {number} beat - Beats from the start of the dance
     */
    showCall(call, offset, beat) {
        if (call !== this.shownCall || offset !== this.shownOffset) {
            this.shownCall = call;
            this.shownOffset = offset;
            this.callLine.className = '';
            this.callLine.replaceChildren();
            call?.syllables.forEach((syllable, i) => {
                if (i > 0 && syllable.word !== call.syllables[i - 1].word) {
                    this.callLine.append(' ');
                }
                const span = document.createElement('span');
                span.className = syllable.stressed ? 'syllable stressed' : 'syllable';
                // The call's first letter is a capital, as in displayCall
                span.textContent = i === 0
                    ? syllable.text.charAt(0).toUpperCase() + syllable.text.slice(1)
                    : syllable.text;
                this.callLine.append(span);
            });
        }
        if (!call) return;

        this.callLine.classList.toggle('upcoming', beat < call.start + offset);
        const spans = this.callLine.querySelectorAll('.syllable');
        call.syllables.forEach((syllable, i) => {
            const said = beat >= syllable.beat + offset;
            const saying = said && !(beat >= (call.syllables[i + 1]?.beat ?? call.end) + offset);
            spans[i].classList.toggle('said', said);
            spans[i].classList.toggle('saying', saying);
        });
    }

    /**
     * Add a line to the feedback list, newest first
     * @param {string} text
     * @param {string} grade - For styling: 'on-time', 'nearly', 'off' or 'summary'
     */
    addFeedback(text, grade) {
        const item = document.createElement('div');
        item.className = `feedback ${grade}`;
        item.textContent = text;
        this.callFeedback.prepend(item);
    }

    /**
     * A session of watching the calls has played through
     * @param {string} text
     */
    showFinished(text) {
        this.callNext.textContent = '';
        this.callFeedback.textContent = text;
    }

    /**
     * A test has played through
     * @param {string} text - How the trainee did
     */
    showSummary(text) {
        this.callLine.className = 'summary';
        this.callLine.textContent = text;
        this.callNext.textContent = 'Each call is listed on the right.';
        this.addFeedback(text, 'summary');
    }
}
