// Position utilities for normalized coordinate system (0-100)
// This allows for good precision while being easy to reason about in tests

/**
 * Represents a position in normalized coordinates (0-100 range)
 */
export class Position {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Create a copy of this position
     */
    clone() {
        return new Position(this.x, this.y);
    }

    /**
     * Check if this position equals another position (with optional tolerance)
     */
    equals(other, tolerance = 0.01) {
        return Math.abs(this.x - other.x) < tolerance &&
               Math.abs(this.y - other.y) < tolerance;
    }
}

/**
 * Convert normalized position (0-100) to pixel coordinates
 * @param {Position} pos - Normalized position
 * @param {number} svgWidth - SVG width in pixels
 * @param {number} svgHeight - SVG height in pixels
 * @returns {{x: number, y: number}} Pixel coordinates
 */
export function toPixels(pos, svgWidth, svgHeight) {
    return {
        x: (pos.x / 100) * svgWidth,
        y: (pos.y / 100) * svgHeight
    };
}

/**
 * Convert pixel coordinates to normalized position (0-100)
 * @param {number} x - X pixel coordinate
 * @param {number} y - Y pixel coordinate
 * @param {number} svgWidth - SVG width in pixels
 * @param {number} svgHeight - SVG height in pixels
 * @returns {Position} Normalized position
 */
export function fromPixels(x, y, svgWidth, svgHeight) {
    return new Position(
        (x / svgWidth) * 100,
        (y / svgHeight) * 100
    );
}

/**
 * Check if a position is within bounds
 * @param {Position} pos - Position to check
 * @param {number} minX - Minimum X (default 0)
 * @param {number} minY - Minimum Y (default 0)
 * @param {number} maxX - Maximum X (default 100)
 * @param {number} maxY - Maximum Y (default 100)
 * @returns {boolean} True if within bounds
 */
export function isInBounds(pos, minX = 0, minY = 0, maxX = 100, maxY = 100) {
    return pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
}

/**
 * Calculate Euclidean distance between two positions
 * @param {Position} pos1 - First position
 * @param {Position} pos2 - Second position
 * @returns {number} Distance in normalized units
 */
export function distance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Linearly interpolate between two positions
 * @param {Position} start - Start position
 * @param {Position} end - End position
 * @param {number} t - Progress from 0 to 1
 * @returns {Position} Interpolated position
 */
export function lerp(start, end, t) {
    return new Position(
        start.x + (end.x - start.x) * t,
        start.y + (end.y - start.y) * t
    );
}

/**
 * Calculate the center point of multiple positions
 * @param {Position[]} positions - Array of positions
 * @returns {Position} Center position
 */
export function center(positions) {
    if (positions.length === 0) {
        return new Position(50, 50);
    }

    const sum = positions.reduce((acc, pos) => ({
        x: acc.x + pos.x,
        y: acc.y + pos.y
    }), { x: 0, y: 0 });

    return new Position(
        sum.x / positions.length,
        sum.y / positions.length
    );
}
