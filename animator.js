// Animation timing system for dance moves
// Handles beat-based timing at a fixed tempo

/**
 * Animator class for managing animation timing
 */
export class Animator {
    /**
     * Create a new Animator
     * @param {number} tempo - Beats per minute (default 120 BPM - standard contra tempo)
     */
    constructor(tempo = 120) {
        if (tempo <= 0) {
            throw new Error('Tempo must be positive');
        }
        this.tempo = tempo;
    }

    /**
     * Convert beats to milliseconds at the current tempo
     * @param {number} beats - Number of beats
     * @returns {number} Duration in milliseconds
     */
    beatsToMs(beats) {
        if (beats < 0) {
            throw new Error('Beats must be non-negative');
        }
        // 60 seconds per minute, 1000 ms per second
        const msPerBeat = (60 * 1000) / this.tempo;
        return beats * msPerBeat;
    }

    /**
     * Convert milliseconds to beats at the current tempo
     * @param {number} ms - Duration in milliseconds
     * @returns {number} Number of beats
     */
    msToBeats(ms) {
        if (ms < 0) {
            throw new Error('Milliseconds must be non-negative');
        }
        const msPerBeat = (60 * 1000) / this.tempo;
        return ms / msPerBeat;
    }

    /**
     * Calculate animation progress (0-1) given elapsed time and total duration
     * @param {number} elapsedMs - Time elapsed since animation start (milliseconds)
     * @param {number} durationMs - Total duration of animation (milliseconds)
     * @returns {number} Progress from 0 (start) to 1 (end)
     */
    calculateProgress(elapsedMs, durationMs) {
        if (elapsedMs < 0) {
            throw new Error('Elapsed time must be non-negative');
        }
        if (durationMs <= 0) {
            throw new Error('Duration must be positive');
        }

        const progress = elapsedMs / durationMs;
        // Clamp to [0, 1]
        return Math.max(0, Math.min(1, progress));
    }

    /**
     * Calculate animation progress given elapsed time and duration in beats
     * @param {number} elapsedMs - Time elapsed since animation start (milliseconds)
     * @param {number} durationBeats - Total duration in beats
     * @returns {number} Progress from 0 (start) to 1 (end)
     */
    calculateProgressBeats(elapsedMs, durationBeats) {
        const durationMs = this.beatsToMs(durationBeats);
        return this.calculateProgress(elapsedMs, durationMs);
    }

    /**
     * Get the position along a path given elapsed time
     * @param {import('./paths.js').Path} path - The path to follow
     * @param {number} elapsedMs - Time elapsed since animation start (milliseconds)
     * @returns {import('./positions.js').Position} Current position along the path
     */
    getPositionAtTime(path, elapsedMs) {
        const durationMs = this.beatsToMs(path.beats);
        const progress = this.calculateProgress(elapsedMs, durationMs);
        return path.getPositionAt(progress);
    }

    /**
     * Check if animation is complete
     * @param {number} elapsedMs - Time elapsed since animation start (milliseconds)
     * @param {number} durationBeats - Total duration in beats
     * @returns {boolean} True if animation is complete
     */
    isComplete(elapsedMs, durationBeats) {
        const durationMs = this.beatsToMs(durationBeats);
        return elapsedMs >= durationMs;
    }

    /**
     * Get tempo
     * @returns {number} Current tempo in BPM
     */
    getTempo() {
        return this.tempo;
    }

    /**
     * Set tempo
     * @param {number} tempo - New tempo in BPM
     */
    setTempo(tempo) {
        if (tempo <= 0) {
            throw new Error('Tempo must be positive');
        }
        this.tempo = tempo;
    }
}

/**
 * AnimationState class for tracking animation of multiple dancers
 */
export class AnimationState {
    /**
     * Create a new AnimationState
     * @param {Map<string, import('./paths.js').Path>} paths - Map from dancer ID to path
     * @param {Animator} animator - Animator instance for timing
     */
    constructor(paths, animator) {
        if (!paths || paths.size === 0) {
            throw new Error('Must provide at least one path');
        }
        if (!animator) {
            throw new Error('Must provide an animator');
        }

        this.paths = paths;
        this.animator = animator;
        this.startTime = null;
        this.pausedTime = null;
        this.totalPausedDuration = 0;
    }

    /**
     * Start the animation
     * @param {number} timestamp - Current timestamp in milliseconds (from performance.now() or Date.now())
     */
    start(timestamp) {
        this.startTime = timestamp;
        this.pausedTime = null;
        this.totalPausedDuration = 0;
    }

    /**
     * Pause the animation
     * @param {number} timestamp - Current timestamp in milliseconds
     */
    pause(timestamp) {
        if (this.startTime === null) {
            throw new Error('Cannot pause - animation not started');
        }
        if (this.pausedTime !== null) {
            throw new Error('Animation already paused');
        }
        this.pausedTime = timestamp;
    }

    /**
     * Resume the animation
     * @param {number} timestamp - Current timestamp in milliseconds
     */
    resume(timestamp) {
        if (this.pausedTime === null) {
            throw new Error('Cannot resume - animation not paused');
        }
        this.totalPausedDuration += timestamp - this.pausedTime;
        this.pausedTime = null;
    }

    /**
     * Get elapsed time since animation start (excluding paused time)
     * @param {number} timestamp - Current timestamp in milliseconds
     * @returns {number} Elapsed time in milliseconds
     */
    getElapsedTime(timestamp) {
        if (this.startTime === null) {
            return 0;
        }

        if (this.pausedTime !== null) {
            // Currently paused - return elapsed up to pause point
            return this.pausedTime - this.startTime - this.totalPausedDuration;
        }

        return timestamp - this.startTime - this.totalPausedDuration;
    }

    /**
     * Get current positions of all dancers
     * @param {number} timestamp - Current timestamp in milliseconds
     * @returns {Map<string, import('./positions.js').Position>} Map from dancer ID to current position
     */
    getCurrentPositions(timestamp) {
        const elapsedMs = this.getElapsedTime(timestamp);
        const positions = new Map();

        this.paths.forEach((path, dancerId) => {
            const position = this.animator.getPositionAtTime(path, elapsedMs);
            positions.set(dancerId, position);
        });

        return positions;
    }

    /**
     * Check if animation is complete
     * @param {number} timestamp - Current timestamp in milliseconds
     * @returns {boolean} True if all paths have completed
     */
    isComplete(timestamp) {
        const elapsedMs = this.getElapsedTime(timestamp);

        // Animation is complete when all paths are complete
        // Find the longest path
        let maxBeats = 0;
        this.paths.forEach(path => {
            maxBeats = Math.max(maxBeats, path.beats);
        });

        return this.animator.isComplete(elapsedMs, maxBeats);
    }

    /**
     * Reset the animation
     */
    reset() {
        this.startTime = null;
        this.pausedTime = null;
        this.totalPausedDuration = 0;
    }
}
