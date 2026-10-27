// Animation timing system for dance moves
// Handles beat-based timing at a fixed tempo

import { Position } from './positions.js';

/**
 * Longest stretch (in beats, on each side of a move boundary) over which one move
 * is blended into the next
 */
export const MAX_BLEND_BEATS = 1;

/**
 * How long (in beats) dancers take to join hands, or let go, at either end of a
 * hold (see calculateMovePaths)
 */
export const HOLD_FADE_BEATS = 0.5;

/**
 * Half-width in beats of the blend window around the boundary between two moves.
 * Capped at a quarter of either move so short moves keep their shape.
 * @param {number} beatsBefore - Duration of the earlier move
 * @param {number} beatsAfter - Duration of the later move
 * @returns {number}
 */
export function blendHalfWidth(beatsBefore, beatsAfter) {
    return Math.min(MAX_BLEND_BEATS, beatsBefore / 4, beatsAfter / 4);
}

/**
 * Cubic Hermite curve between two positions with given velocities
 * @param {import('./positions.js').Position} p0 - Start position
 * @param {{x: number, y: number}} v0 - Velocity at start (units per beat)
 * @param {import('./positions.js').Position} p1 - End position
 * @param {{x: number, y: number}} v1 - Velocity at end (units per beat)
 * @param {number} durationBeats - Time to get from p0 to p1
 * @param {number} u - Progress through the curve, clamped to [0, 1]
 * @returns {import('./positions.js').Position}
 */
function hermite(p0, v0, p1, v1, durationBeats, u) {
    u = Math.max(0, Math.min(1, u));
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = (u3 - 2 * u2 + u) * durationBeats;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = (u3 - u2) * durationBeats;
    return new Position(
        h00 * p0.x + h10 * v0.x + h01 * p1.x + h11 * v1.x,
        h00 * p0.y + h10 * v0.y + h01 * p1.y + h11 * v1.y
    );
}

/**
 * Position within the blend window around the boundary between two moves.
 * The window runs from halfWidth beats before the end of the earlier path to
 * halfWidth beats into the later one; a Hermite curve joins the two, matching
 * position and velocity at both edges so motion never jumps or jerks.
 * @param {import('./paths.js').Path} before - Path of the earlier move
 * @param {import('./paths.js').Path} after - Path of the later move
 * @param {number} beatFromBoundary - Time relative to the boundary (negative = before)
 * @returns {import('./positions.js').Position}
 */
function blendAcrossBoundary(before, after, beatFromBoundary) {
    const halfWidth = blendHalfWidth(before.beats, after.beats);
    const windowStart = before.beats - halfWidth;
    return hermite(
        before.getPositionAtBeat(windowStart),
        before.getVelocityAtBeat(windowStart),
        after.getPositionAtBeat(halfWidth),
        after.getVelocityAtBeat(halfWidth),
        2 * halfWidth,
        (beatFromBoundary + halfWidth) / (2 * halfWidth)
    );
}

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
     * @param {Object} [neighbors] - Paths of the adjacent moves, used to blend smoothly
     *   across move boundaries instead of changing direction abruptly
     * @param {Map<string, import('./paths.js').Path>|null} [neighbors.previous] - Move just finished
     * @param {Map<string, import('./paths.js').Path>|null} [neighbors.next] - Move coming up
     */
    constructor(paths, animator, { previous = null, next = null } = {}) {
        if (!paths || paths.size === 0) {
            throw new Error('Must provide at least one path');
        }
        if (!animator) {
            throw new Error('Must provide an animator');
        }

        this.paths = paths;
        this.animator = animator;
        this.previousPaths = previous;
        this.nextPaths = next;
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
     * Check whether the animation is paused
     * @returns {boolean}
     */
    isPaused() {
        return this.pausedTime !== null;
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

        const endTime = this.pausedTime !== null ? this.pausedTime : timestamp;
        // requestAnimationFrame timestamps mark the start of the frame, so the
        // first frame's timestamp can precede the start time; clamp to zero
        return Math.max(0, endTime - this.startTime - this.totalPausedDuration);
    }

    /**
     * Change the tempo without losing the place: the beat reached at the given time
     * stays the same, and the rest of the move plays at the new tempo
     * @param {number} tempo - New tempo in BPM
     * @param {number} timestamp - Current timestamp in milliseconds
     */
    changeTempo(tempo, timestamp) {
        const beat = this.animator.msToBeats(this.getElapsedTime(timestamp));
        this.animator.setTempo(tempo);
        if (this.startTime === null) return;
        const endTime = this.pausedTime !== null ? this.pausedTime : timestamp;
        this.startTime = endTime - this.totalPausedDuration - this.animator.beatsToMs(beat);
    }

    /**
     * Get current positions of all dancers
     * @param {number} timestamp - Current timestamp in milliseconds
     * @returns {Map<string, import('./positions.js').Position>} Map from dancer ID to current position
     */
    getCurrentPositions(timestamp) {
        const beat = this.animator.msToBeats(this.getElapsedTime(timestamp));
        const positions = new Map();

        this.paths.forEach((path, dancerId) => {
            positions.set(dancerId, this.getBlendedPosition(dancerId, path, beat));
        });

        return positions;
    }

    /**
     * Groups of dancers holding hands now, each with how firmly (0 to 1), fading
     * in as they join hands and out as they let go. A group with shape 'line'
     * holds hands with those beside them, in order, and with shape 'ring' the
     * last with the first too; otherwise all join hands in the middle, as in a
     * star.
     * @param {number} timestamp - Current timestamp in milliseconds
     * @returns {{ids: string[], shape?: string, strength: number}[]}
     */
    getCurrentHolds(timestamp) {
        const beat = this.animator.msToBeats(this.getElapsedTime(timestamp));
        return (this.paths.holds || [])
            .map(hold => ({
                ids: hold.ids,
                ...(hold.shape && { shape: hold.shape }),
                strength: Math.max(0, Math.min(1,
                    (beat - hold.from) / HOLD_FADE_BEATS + 1,
                    (hold.to - beat) / HOLD_FADE_BEATS + 1))
            }))
            .filter(hold => hold.strength > 0);
    }

    /**
     * Position of one dancer, blending into the adjacent move near each boundary
     * @param {string} dancerId
     * @param {import('./paths.js').Path} path - This dancer's path for the current move
     * @param {number} beat - Beats elapsed in the current move
     * @returns {import('./positions.js').Position}
     */
    getBlendedPosition(dancerId, path, beat) {
        const previousPath = this.previousPaths?.get(dancerId);
        if (previousPath && beat < blendHalfWidth(previousPath.beats, path.beats)) {
            return blendAcrossBoundary(previousPath, path, beat);
        }

        const nextPath = this.nextPaths?.get(dancerId);
        if (nextPath && beat > path.beats - blendHalfWidth(path.beats, nextPath.beats)) {
            return blendAcrossBoundary(path, nextPath, beat - path.beats);
        }

        return path.getPositionAtBeat(beat);
    }

    /**
     * Timestamp at which the animation completes (assuming it isn't paused again).
     * Starting the next move at exactly this time keeps playback continuous.
     * @returns {number}
     */
    getCompletionTime() {
        if (this.startTime === null) {
            throw new Error('Animation not started');
        }
        return this.startTime + this.totalPausedDuration + this.animator.beatsToMs(this.getDurationBeats());
    }

    /**
     * Duration of the longest path in beats
     * @returns {number}
     */
    getDurationBeats() {
        let maxBeats = 0;
        this.paths.forEach(path => {
            maxBeats = Math.max(maxBeats, path.beats);
        });
        return maxBeats;
    }

    /**
     * Check if animation is complete
     * @param {number} timestamp - Current timestamp in milliseconds
     * @returns {boolean} True if all paths have completed
     */
    isComplete(timestamp) {
        const elapsedMs = this.getElapsedTime(timestamp);

        // Animation is complete when the longest path is complete
        return this.animator.isComplete(elapsedMs, this.getDurationBeats());
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
