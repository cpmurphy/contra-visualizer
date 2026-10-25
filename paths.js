// Path data structures for dance move animation
// Paths consist of waypoints that dancers follow during moves

import { Position, lerp } from './positions.js';

/**
 * Represents a path that a dancer follows during a move
 */
export class Path {
    /**
     * Create a new Path
     * @param {Position[]} waypoints - Array of positions along the path
     * @param {number} beats - Duration of the path in beats
     * @param {number[]|null} times - Optional progress (0-1) at which each waypoint is
     *   reached. When omitted, time is allotted in proportion to distance travelled,
     *   so the dancer moves at constant speed along the whole path.
     */
    constructor(waypoints, beats, times = null) {
        if (waypoints.length < 2) {
            throw new Error('Path must have at least 2 waypoints (start and end)');
        }
        if (beats <= 0) {
            throw new Error('Path duration must be positive');
        }
        if (times !== null) {
            if (times.length !== waypoints.length) {
                throw new Error('Path times must match waypoint count');
            }
            if (times[0] !== 0 || times[times.length - 1] !== 1) {
                throw new Error('Path times must start at 0 and end at 1');
            }
            for (let i = 1; i < times.length; i++) {
                if (times[i] < times[i - 1]) {
                    throw new Error('Path times must be non-decreasing');
                }
            }
        }

        this.waypoints = waypoints;
        this.beats = beats;
        this.times = times || arcLengthTimes(waypoints);
    }

    /**
     * Get the starting position
     * @returns {Position}
     */
    get start() {
        return this.waypoints[0];
    }

    /**
     * Get the ending position
     * @returns {Position}
     */
    get end() {
        return this.waypoints[this.waypoints.length - 1];
    }

    /**
     * Get position along the path given progress from 0 to 1
     * @param {number} progress - Progress along path (0 = start, 1 = end)
     * @returns {Position} Interpolated position
     */
    getPositionAt(progress) {
        // Clamp progress to [0, 1]
        progress = Math.max(0, Math.min(1, progress));

        // Handle edge cases
        if (progress === 0) return this.start.clone();
        if (progress === 1) return this.end.clone();

        const segmentIndex = this.segmentIndexAt(progress);
        const segmentStart = this.times[segmentIndex];
        const segmentDuration = this.times[segmentIndex + 1] - segmentStart;
        const localProgress = segmentDuration > 0 ? (progress - segmentStart) / segmentDuration : 1;

        // Interpolate between waypoints
        const start = this.waypoints[segmentIndex];
        const end = this.waypoints[segmentIndex + 1];
        return lerp(start, end, localProgress);
    }

    /**
     * Index of the segment containing the given progress (the later one at a waypoint)
     * @param {number} progress - Progress in [0, 1]
     * @returns {number}
     */
    segmentIndexAt(progress) {
        let segmentIndex = 0;
        while (segmentIndex < this.times.length - 2 && this.times[segmentIndex + 1] <= progress) {
            segmentIndex++;
        }
        return segmentIndex;
    }

    /**
     * Get position at a time in beats (clamped to the path's duration)
     * @param {number} beat - Time in beats from the start of the path
     * @returns {Position}
     */
    getPositionAtBeat(beat) {
        return this.getPositionAt(beat / this.beats);
    }

    /**
     * Get velocity at a time in beats, in position units per beat
     * @param {number} beat - Time in beats from the start of the path (clamped)
     * @returns {{x: number, y: number}}
     */
    getVelocityAtBeat(beat) {
        const progress = Math.max(0, Math.min(1, beat / this.beats));
        const segmentIndex = this.segmentIndexAt(progress);

        const durationBeats = (this.times[segmentIndex + 1] - this.times[segmentIndex]) * this.beats;
        if (durationBeats <= 0) {
            return { x: 0, y: 0 };
        }
        const start = this.waypoints[segmentIndex];
        const end = this.waypoints[segmentIndex + 1];
        return {
            x: (end.x - start.x) / durationBeats,
            y: (end.y - start.y) / durationBeats
        };
    }

    /**
     * Get all waypoints
     * @returns {Position[]}
     */
    getWaypoints() {
        return [...this.waypoints];
    }

    /**
     * Get the number of waypoints
     * @returns {number}
     */
    get waypointCount() {
        return this.waypoints.length;
    }
}

/**
 * Compute waypoint times proportional to cumulative distance (constant speed).
 * A path that doesn't move at all gets evenly spaced times.
 * @param {Position[]} waypoints
 * @returns {number[]}
 */
function arcLengthTimes(waypoints) {
    const cumulative = [0];
    for (let i = 1; i < waypoints.length; i++) {
        const dx = waypoints[i].x - waypoints[i - 1].x;
        const dy = waypoints[i].y - waypoints[i - 1].y;
        cumulative.push(cumulative[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }

    const total = cumulative[cumulative.length - 1];
    if (total === 0) {
        return waypoints.map((_, i) => i / (waypoints.length - 1));
    }
    const times = cumulative.map(d => d / total);
    times[times.length - 1] = 1;
    return times;
}

/**
 * Create an out-and-back path (balance, long lines): the dancer eases out to the
 * turn point and back, slowing smoothly to a stop at the turn and at both ends.
 * @param {Position} start - Starting (and ending) position
 * @param {Position} turn - Farthest point reached
 * @param {number} beats - Duration in beats
 * @param {number} waypointCount - Number of waypoints (default 17)
 * @returns {Path}
 */
export function createOutAndBackPath(start, turn, beats, waypointCount = 17) {
    const waypoints = [];
    const times = [];
    for (let i = 0; i < waypointCount; i++) {
        const progress = i / (waypointCount - 1);
        // Raised cosine: 0 → 1 → 0 with zero velocity at the ends and the turn
        const extent = (1 - Math.cos(2 * Math.PI * progress)) / 2;
        waypoints.push(lerp(start, turn, extent));
        times.push(progress);
    }
    return new Path(waypoints, beats, times);
}

/**
 * Create a path along a Bezier curve, at constant speed
 * @param {Position[]} controlPoints - Start, control points and end (any number, at least 2)
 * @param {number} beats - Duration in beats
 * @param {number} waypointCount - Number of waypoints (default 17)
 * @returns {Path}
 */
export function createBezierPath(controlPoints, beats, waypointCount = 17) {
    const waypoints = [];
    for (let i = 0; i < waypointCount; i++) {
        const t = i / (waypointCount - 1);
        // de Casteljau: repeatedly interpolate between neighboring points
        let points = controlPoints;
        while (points.length > 1) {
            points = points.slice(1).map((point, j) => lerp(points[j], point, t));
        }
        waypoints.push(points[0]);
    }
    return new Path(waypoints, beats);
}

/**
 * Create a simple straight-line path between two positions
 * @param {Position} start - Starting position
 * @param {Position} end - Ending position
 * @param {number} beats - Duration in beats
 * @param {number} waypointCount - Number of waypoints (default 2 for just start/end)
 * @returns {Path}
 */
export function createStraightPath(start, end, beats, waypointCount = 2) {
    if (waypointCount < 2) {
        throw new Error('Path must have at least 2 waypoints');
    }

    const waypoints = [];
    for (let i = 0; i < waypointCount; i++) {
        const progress = i / (waypointCount - 1);
        waypoints.push(lerp(start, end, progress));
    }

    return new Path(waypoints, beats);
}

/**
 * Create a stationary path (dancer doesn't move)
 * @param {Position} position - The fixed position
 * @param {number} beats - Duration in beats
 * @returns {Path}
 */
export function createStationaryPath(position, beats) {
    return new Path([position.clone(), position.clone()], beats);
}

/**
 * Create an arc path between two positions around a center point
 * @param {Position} start - Starting position
 * @param {Position} end - Ending position
 * @param {Position} center - Center of rotation
 * @param {number} beats - Duration in beats
 * @param {number} waypointCount - Number of waypoints for smoothness (default 8)
 * @param {boolean} clockwise - Direction of rotation (default false for counter-clockwise)
 * @returns {Path}
 */
export function createArcPath(start, end, center, beats, waypointCount = 8, clockwise = false) {
    if (waypointCount < 2) {
        throw new Error('Path must have at least 2 waypoints');
    }

    // Calculate angles for start and end positions
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

    // Calculate the radius (use average if they differ slightly)
    const startRadius = Math.sqrt(
        Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2)
    );
    const endRadius = Math.sqrt(
        Math.pow(end.x - center.x, 2) + Math.pow(end.y - center.y, 2)
    );
    const radius = (startRadius + endRadius) / 2;

    // Calculate angular distance
    let angleDelta = endAngle - startAngle;

    // Adjust for direction
    if (clockwise) {
        if (angleDelta > 0) angleDelta -= 2 * Math.PI;
    } else {
        if (angleDelta < 0) angleDelta += 2 * Math.PI;
    }

    // Generate waypoints along the arc
    const waypoints = [];
    for (let i = 0; i < waypointCount; i++) {
        const progress = i / (waypointCount - 1);
        const angle = startAngle + angleDelta * progress;
        waypoints.push(new Position(
            center.x + radius * Math.cos(angle),
            center.y + radius * Math.sin(angle)
        ));
    }

    return new Path(waypoints, beats);
}
