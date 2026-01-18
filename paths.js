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
     */
    constructor(waypoints, beats) {
        if (waypoints.length < 2) {
            throw new Error('Path must have at least 2 waypoints (start and end)');
        }
        if (beats <= 0) {
            throw new Error('Path duration must be positive');
        }

        this.waypoints = waypoints;
        this.beats = beats;
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

        // Calculate which segment we're in
        const segmentCount = this.waypoints.length - 1;
        const segmentProgress = progress * segmentCount;
        const segmentIndex = Math.floor(segmentProgress);
        const localProgress = segmentProgress - segmentIndex;

        // Handle the last segment specially to avoid index out of bounds
        if (segmentIndex >= segmentCount) {
            return this.end.clone();
        }

        // Interpolate between waypoints
        const start = this.waypoints[segmentIndex];
        const end = this.waypoints[segmentIndex + 1];
        return lerp(start, end, localProgress);
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
