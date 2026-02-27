// Path calculator for dance moves
// Computes paths for each dancer during a move

import { Position, center, distance, toPixels, fromPixels } from './positions.js';
import { Path, createStraightPath, createStationaryPath, createArcPath } from './paths.js';

// SVG layout constants (must match dancers.js getPositions)
const SVG_WIDTH = 800;
const SVG_HEIGHT = 900;
const STAGE_HEIGHT = 100;
const DANCER_RADIUS_PX = 20;
const VERTICAL_SPACING_PX = 120;
const COLUMN_MIDPOINT_PX = 350;

/**
 * Calculate paths for all dancers during a move
 * @param {Object} move - The move object with type, beats, etc.
 * @param {import('./dancers.js').Set} dancerSet - The current set state
 * @returns {Map<string, import('./paths.js').Path>} Map from dancer ID to Path
 */
export function calculateMovePaths(move, dancerSet) {
    const paths = new Map();

    // Get current positions (before the move)
    const startPositions = dancerSet.getPositions();

    // Create a temporary clone to execute the move and get end positions
    const endDancerSet = cloneSetState(dancerSet);
    executeMoveSilently(endDancerSet, move);
    const endPositions = endDancerSet.getPositions();

    // Map dancer IDs to their start and end positions
    const startPosById = new Map();
    const endPosById = new Map();

    dancerSet.dancers.forEach((dancer, index) => {
        startPosById.set(dancer.id, startPositions[index]);
    });

    endDancerSet.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Generate paths for each dancer
    const type = move.type.toLowerCase();
    const beats = move.beats || 8;

    if (type === 'balance') {
        // Neighbor pairs approach each other vertically and retreat
        createBalancePaths(dancerSet, startPosById, paths, beats);
    } else if (type.includes('long lines')) {
        // Two lines approach each other and retreat
        createLongLinesPaths(dancerSet, startPosById, paths, beats);
    } else if (type.includes('circle left') || type.includes('circle right') ||
               type.includes('star left') || type.includes('star right')) {
        // Circular moves - arc paths around minor set centers
        const isClockwise = type.includes('right');
        createCircularPaths(dancerSet, startPosById, endPosById, paths, beats, isClockwise);
    } else if (type === 'swing') {
        // Swing moves - dancers rotate around common center
        const swingWho = move.who || 'neighbor';
        createSwingPaths(dancerSet, startPosById, endPosById, paths, beats, swingWho);
    } else if (type.includes('chain')) {
        // Chain moves - dancers cross with arced paths
        createChainPaths(dancerSet, startPosById, endPosById, paths, beats);
    } else if (type === 'do-si-do' || type === 'dosido') {
        // Check if it's an integer number of times (returns to start)
        const times = 1.0; // Default from app.js

        if (Number.isInteger(times)) {
            // Returns to original position - stationary
            dancerSet.dancers.forEach(dancer => {
                const pos = startPosById.get(dancer.id);
                paths.set(dancer.id, createStationaryPath(pos, beats));
            });
        } else {
            // Swaps positions - create arc paths to avoid collisions
            dancerSet.dancers.forEach(dancer => {
                const start = startPosById.get(dancer.id);
                const end = endPosById.get(dancer.id);

                if (start.equals(end, 0.01)) {
                    // Dancer doesn't move (inactive)
                    paths.set(dancer.id, createStationaryPath(start, beats));
                } else {
                    // Create arc path to avoid collision
                    // Use midpoint as center, offset to the side
                    const mid = new Position(
                        (start.x + end.x) / 2 + 5, // Offset to avoid collision
                        (start.y + end.y) / 2
                    );
                    paths.set(dancer.id, createArcPath(start, end, mid, beats, 8, false));
                }
            });
        }
    } else {
        // For any other move, create straight paths
        dancerSet.dancers.forEach(dancer => {
            const start = startPosById.get(dancer.id);
            const end = endPosById.get(dancer.id);

            if (start.equals(end, 0.01)) {
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else {
                paths.set(dancer.id, createStraightPath(start, end, beats, 5));
            }
        });
    }

    return paths;
}

/**
 * Create balance paths - neighbor pairs approach each other vertically and retreat.
 * Within each minor set, left-column and right-column pairs move toward each other.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createBalancePaths(dancerSet, startPosById, paths, beats) {
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) break;

        // Within a minor set [i, i+1, i+2, i+3]:
        // Left column pair: dancers[i] and dancers[i+2]
        // Right column pair: dancers[i+1] and dancers[i+3]
        const columnPairs = [
            [dancerSet.dancers[i], dancerSet.dancers[i + 2]],
            [dancerSet.dancers[i + 1], dancerSet.dancers[i + 3]]
        ];

        for (const [d1, d2] of columnPairs) {
            const pos1 = startPosById.get(d1.id);
            const pos2 = startPosById.get(d2.id);

            // Compute how far to approach while maintaining a minimum gap
            const gap = Math.abs(pos1.y - pos2.y);
            const minGap = (3 * DANCER_RADIUS_PX / SVG_HEIGHT) * 100;
            const maxApproach = Math.max(0, (gap - minGap) / gap);

            const midY1 = pos1.y + (pos2.y - pos1.y) * maxApproach / 2;
            const midY2 = pos2.y + (pos1.y - pos2.y) * maxApproach / 2;

            paths.set(d1.id, new Path([
                pos1.clone(),
                new Position(pos1.x, midY1),
                pos1.clone()
            ], beats));

            paths.set(d2.id, new Path([
                pos2.clone(),
                new Position(pos2.x, midY2),
                pos2.clone()
            ], beats));
        }
    }

    // Handle inactive dancers at the beginning
    if (startIndex === 2) {
        for (let i = 0; i < 2; i++) {
            const d = dancerSet.dancers[i];
            paths.set(d.id, createStationaryPath(startPosById.get(d.id), beats));
        }
    }

    // Handle inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let i = dancerSet.dancers.length - remainder; i < dancerSet.dancers.length; i++) {
            const d = dancerSet.dancers[i];
            paths.set(d.id, createStationaryPath(startPosById.get(d.id), beats));
        }
    }
}

/**
 * Create circular arc paths for dancers during circle/star moves
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {boolean} isClockwise
 */
function createCircularPaths(dancerSet, startPosById, endPosById, paths, beats, isClockwise) {
    // Determine starting index based on active state
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    // Process each minor set of 4 dancers
    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) {
            break;
        }

        // Get the 4 dancers in this minor set
        const minorSetDancers = [
            dancerSet.dancers[i],
            dancerSet.dancers[i + 1],
            dancerSet.dancers[i + 2],
            dancerSet.dancers[i + 3]
        ];

        // Get start positions for this minor set
        const minorSetStartPositions = minorSetDancers.map(d => startPosById.get(d.id));

        // Calculate center point of this minor set
        const centerPos = center(minorSetStartPositions);

        // Create arc paths for each dancer in this minor set
        minorSetDancers.forEach(dancer => {
            const start = startPosById.get(dancer.id);
            const end = endPosById.get(dancer.id);

            if (!dancer.active) {
                // Dancer is inactive - create stationary path
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else if (start.equals(end, 0.01)) {
                // Full rotation (e.g., star left 4 places) - dancer returns to start
                // Generate explicit 360° circle animation
                const radius = distance(start, centerPos);
                const startAngle = Math.atan2(start.y - centerPos.y, start.x - centerPos.x);

                const waypoints = [];
                for (let i = 0; i <= 7; i++) {
                    const progress = i / 7;
                    const angleDelta = isClockwise ? -2 * Math.PI : 2 * Math.PI;
                    const angle = startAngle + angleDelta * progress;
                    waypoints.push(new Position(
                        centerPos.x + radius * Math.cos(angle),
                        centerPos.y + radius * Math.sin(angle)
                    ));
                }
                paths.set(dancer.id, new Path(waypoints, beats));
            } else {
                // Partial rotation - create normal arc path
                paths.set(dancer.id, createArcPath(start, end, centerPos, beats, 8, isClockwise));
            }
        });
    }

    // Handle any inactive dancers at the beginning
    if (startIndex === 2) {
        // First couple is inactive
        paths.set(dancerSet.dancers[0].id, createStationaryPath(startPosById.get(dancerSet.dancers[0].id), beats));
        paths.set(dancerSet.dancers[1].id, createStationaryPath(startPosById.get(dancerSet.dancers[1].id), beats));
    }

    // Handle any inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let i = dancerSet.dancers.length - remainder; i < dancerSet.dancers.length; i++) {
            const dancer = dancerSet.dancers[i];
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        }
    }
}

/**
 * Create long lines paths - two vertical lines approach each other and retreat.
 * Dancers move horizontally toward the center line, then return to their starting position.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createLongLinesPaths(dancerSet, startPosById, paths, beats) {
    // Find the center x between the two columns
    const allPositions = dancerSet.dancers.map(d => startPosById.get(d.id));
    const centerX = center(allPositions).x;

    // Compute how far each side can approach while maintaining a minimum gap
    // Find the minimum distance from any dancer to center
    const activePositions = dancerSet.dancers
        .filter(d => d.active)
        .map(d => startPosById.get(d.id));
    const minDistToCenter = Math.min(...activePositions.map(p => Math.abs(p.x - centerX)));
    // Leave a gap of at least 2 dancer radii in normalized coords on each side
    const minGap = (2 * DANCER_RADIUS_PX / SVG_WIDTH) * 100;
    const maxApproach = Math.max(0, (minDistToCenter - minGap) / minDistToCenter);

    dancerSet.dancers.forEach(dancer => {
        const start = startPosById.get(dancer.id);

        if (!dancer.active) {
            paths.set(dancer.id, createStationaryPath(start, beats));
            return;
        }

        const approachX = start.x + (centerX - start.x) * maxApproach;
        const approachPos = new Position(approachX, start.y);

        // 3 waypoints: start → approach → return to start
        const waypoints = [
            start.clone(),
            approachPos,
            start.clone()
        ];
        paths.set(dancer.id, new Path(waypoints, beats));
    });
}

/**
 * Compute the bounding rectangle (in pixels) for one swing pair.
 * @param {number} minorSetStart - Dancer array index where the minor set begins
 * @param {number} totalDancers - Total number of dancers in the set
 * @param {string} side - 'left'/'right' for same-column, 'top'/'bottom' for cross-column
 * @param {boolean} isCrossColumn - Whether dancers start in different columns
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
function computeSwingRectangle(minorSetStart, totalDancers, side, isCrossColumn) {
    const numRows = Math.ceil(totalDancers / 2);
    const totalDancerHeight = (numRows - 1) * VERTICAL_SPACING_PX + 2 * DANCER_RADIUS_PX;
    const danceFloorHeight = SVG_HEIGHT - STAGE_HEIGHT;
    const startY = STAGE_HEIGHT + (danceFloorHeight - totalDancerHeight) / 2 + DANCER_RADIUS_PX;

    const topRow = minorSetStart / 2;
    const bottomRow = topRow + 1;
    const topRowY = startY + topRow * VERTICAL_SPACING_PX;
    const bottomRowY = startY + bottomRow * VERTICAL_SPACING_PX;

    // Vertical boundaries: midpoints between adjacent minor sets (or stage/floor edges)
    let top, bottom;
    if (topRow === 0) {
        top = STAGE_HEIGHT;
    } else {
        top = startY + (topRow - 0.5) * VERTICAL_SPACING_PX;
    }
    if (bottomRow >= numRows - 1) {
        bottom = SVG_HEIGHT;
    } else {
        bottom = startY + (bottomRow + 0.5) * VERTICAL_SPACING_PX;
    }

    let left, right;
    if (!isCrossColumn) {
        // Same-column pairs: split at column midpoint
        if (side === 'left') {
            left = 0;
            right = COLUMN_MIDPOINT_PX;
        } else {
            left = COLUMN_MIDPOINT_PX;
            right = SVG_WIDTH;
        }
    } else {
        // Cross-column pairs: full width, split vertically within minor set
        left = 0;
        right = SVG_WIDTH;
        const midY = (topRowY + bottomRowY) / 2;
        if (side === 'top') {
            bottom = midY;
        } else {
            top = midY;
        }
    }

    return { left, right, top, bottom };
}

/**
 * Compute swing radius that fits within the bounding rectangle.
 * @param {{x: number, y: number}} centerPx - Swing center in pixels
 * @param {{left: number, right: number, top: number, bottom: number}} rectangle
 * @returns {number} Radius in pixels
 */
function computeSwingRadius(centerPx, rectangle) {
    const distToLeft = centerPx.x - rectangle.left;
    const distToRight = rectangle.right - centerPx.x;
    const distToTop = centerPx.y - rectangle.top;
    const distToBottom = rectangle.bottom - centerPx.y;

    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    let radius = minDist - DANCER_RADIUS_PX - 1;

    // Ensure minimum radius so dancers don't overlap each other
    if (radius < DANCER_RADIUS_PX + 1) {
        radius = DANCER_RADIUS_PX + 1;
    }

    return radius;
}

/**
 * Generate swing waypoints in pixel space, converted to normalized coords.
 * @param {Position} startPos - Dancer's start position (normalized)
 * @param {Position} endPos - Dancer's end position (normalized)
 * @param {{x: number, y: number}} centerPx - Swing center in pixels
 * @param {number} radius - Swing radius in pixels
 * @param {number} beats - Duration in beats
 * @param {number} entryAngle - Angle at which dancer enters the circle
 * @returns {Position[]} Array of waypoint positions (normalized)
 */
function generateSwingWaypoints(startPos, endPos, centerPx, radius, beats, entryAngle) {
    // Total rotation: clockwise in SVG coords (positive angle, y-down)
    const totalRotation = (beats / 4 - 0.5) * 2 * Math.PI;

    // Number of rotation steps (8 waypoints per revolution)
    const rotationSteps = Math.round(Math.abs(totalRotation) * 4 / Math.PI);

    const waypoints = [];

    // Waypoint 0: start position
    waypoints.push(startPos.clone());

    // Waypoint 1: entry point on circle
    const entryX = centerPx.x + radius * Math.cos(entryAngle);
    const entryY = centerPx.y + radius * Math.sin(entryAngle);
    waypoints.push(fromPixels(entryX, entryY, SVG_WIDTH, SVG_HEIGHT));

    // Waypoints 2..rotationSteps+1: rotation steps around circle
    for (let j = 1; j <= rotationSteps; j++) {
        const angle = entryAngle + totalRotation * j / rotationSteps;
        const x = centerPx.x + radius * Math.cos(angle);
        const y = centerPx.y + radius * Math.sin(angle);
        waypoints.push(fromPixels(x, y, SVG_WIDTH, SVG_HEIGHT));
    }

    // Final waypoint: end position
    waypoints.push(endPos.clone());

    return waypoints;
}

/**
 * Create swing paths for dancers.
 * Two dancers rotate around their shared center point within a bounding rectangle.
 * - Neighbor swing: L1 with R2, L2 with R1
 * - Partner swing: L1 with R1, L2 with R2
 *
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {string} swingWho - 'neighbor' or 'partner'
 */
function createSwingPaths(dancerSet, startPosById, endPosById, paths, beats, swingWho) {
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) break;

        const minorSetDancers = [
            dancerSet.dancers[i],
            dancerSet.dancers[i + 1],
            dancerSet.dancers[i + 2],
            dancerSet.dancers[i + 3]
        ];

        const leftDancers = [minorSetDancers[0], minorSetDancers[2]];
        const rightDancers = [minorSetDancers[1], minorSetDancers[3]];

        const leftLark = leftDancers.find(d => d.role === 'lark');
        const leftRobin = leftDancers.find(d => d.role === 'robin');
        const rightLark = rightDancers.find(d => d.role === 'lark');
        const rightRobin = rightDancers.find(d => d.role === 'robin');

        let swingPairs;
        if (swingWho === 'partner') {
            swingPairs = [
                { dancers: [leftLark, leftLark?.partner] },
                { dancers: [rightLark, rightLark?.partner] }
            ].filter(pair => pair.dancers[0] && pair.dancers[1]);
        } else {
            swingPairs = [
                { dancers: [leftLark, leftRobin] },
                { dancers: [rightLark, rightRobin] }
            ].filter(pair => pair.dancers[0] && pair.dancers[1]);
        }

        swingPairs.forEach(pair => {
            const [dancer1, dancer2] = pair.dancers;

            if (!dancer1.active || !dancer2.active) {
                if (!dancer1.active) {
                    paths.set(dancer1.id, createStationaryPath(startPosById.get(dancer1.id), beats));
                }
                if (!dancer2.active) {
                    paths.set(dancer2.id, createStationaryPath(startPosById.get(dancer2.id), beats));
                }
                return;
            }

            const start1 = startPosById.get(dancer1.id);
            const start2 = startPosById.get(dancer2.id);
            const end1 = endPosById.get(dancer1.id);
            const end2 = endPosById.get(dancer2.id);

            // Compute center in pixel space
            const s1px = toPixels(start1, SVG_WIDTH, SVG_HEIGHT);
            const s2px = toPixels(start2, SVG_WIDTH, SVG_HEIGHT);
            const centerPx = { x: (s1px.x + s2px.x) / 2, y: (s1px.y + s2px.y) / 2 };

            // Determine if cross-column
            const isCrossColumn = Math.abs(start1.x - start2.x) > 5.0;

            // Determine side for rectangle splitting
            let side;
            if (!isCrossColumn) {
                side = centerPx.x < COLUMN_MIDPOINT_PX ? 'left' : 'right';
            } else {
                const numRows = Math.ceil(dancerSet.dancers.length / 2);
                const totalDancerHeight = (numRows - 1) * VERTICAL_SPACING_PX + 2 * DANCER_RADIUS_PX;
                const danceFloorHeight = SVG_HEIGHT - STAGE_HEIGHT;
                const startYpx = STAGE_HEIGHT + (danceFloorHeight - totalDancerHeight) / 2 + DANCER_RADIUS_PX;
                const topRowY = startYpx + (i / 2) * VERTICAL_SPACING_PX;
                const bottomRowY = startYpx + (i / 2 + 1) * VERTICAL_SPACING_PX;
                const minorSetMidY = (topRowY + bottomRowY) / 2;
                side = centerPx.y < minorSetMidY ? 'top' : 'bottom';
            }

            const rectangle = computeSwingRectangle(i, dancerSet.dancers.length, side, isCrossColumn);
            const radius = computeSwingRadius(centerPx, rectangle);

            // Entry angle from dancer 1's start direction relative to center
            const entryAngle1 = Math.atan2(s1px.y - centerPx.y, s1px.x - centerPx.x);
            const entryAngle2 = entryAngle1 + Math.PI;

            const waypoints1 = generateSwingWaypoints(start1, end1, centerPx, radius, beats, entryAngle1);
            const waypoints2 = generateSwingWaypoints(start2, end2, centerPx, radius, beats, entryAngle2);

            paths.set(dancer1.id, new Path(waypoints1, beats));
            paths.set(dancer2.id, new Path(waypoints2, beats));
        });
    }

    // Handle inactive dancers at the beginning
    if (startIndex === 2) {
        paths.set(dancerSet.dancers[0].id, createStationaryPath(startPosById.get(dancerSet.dancers[0].id), beats));
        paths.set(dancerSet.dancers[1].id, createStationaryPath(startPosById.get(dancerSet.dancers[1].id), beats));
    }

    // Handle inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let j = dancerSet.dancers.length - remainder; j < dancerSet.dancers.length; j++) {
            const dancer = dancerSet.dancers[j];
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        }
    }
}

/**
 * Create chain paths for dancers - crossing paths with collision avoidance
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createChainPaths(dancerSet, startPosById, endPosById, paths, beats) {
    // Determine starting index based on active state
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    // Process each minor set of 4 dancers
    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) {
            break;
        }

        // Get the 4 dancers in this minor set
        const minorSetDancers = [
            dancerSet.dancers[i],
            dancerSet.dancers[i + 1],
            dancerSet.dancers[i + 2],
            dancerSet.dancers[i + 3]
        ];

        // Create paths for each dancer
        minorSetDancers.forEach(dancer => {
            const start = startPosById.get(dancer.id);
            const end = endPosById.get(dancer.id);

            if (!dancer.active) {
                // Dancer is inactive - create stationary path
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else if (start.equals(end, 0.01)) {
                // Active dancer doesn't move during this chain (other role is chaining)
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else {
                // Dancers cross - create arc path to avoid collision
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2;

                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const perpX = -dy;
                const perpY = dx;
                const len = Math.sqrt(perpX * perpX + perpY * perpY);

                const offsetScale = 12.0; // Higher arcs to prevent collisions during chains
                const offsetX = len > 0 ? (perpX / len) * offsetScale : 0;
                const offsetY = len > 0 ? (perpY / len) * offsetScale : 0;

                const centerPos = new Position(midX + offsetX, midY + offsetY);
                paths.set(dancer.id, createArcPath(start, end, centerPos, beats, 10, false));
            }
        });
    }

    // Handle any inactive dancers at the beginning
    if (startIndex === 2) {
        // First couple is inactive
        paths.set(dancerSet.dancers[0].id, createStationaryPath(startPosById.get(dancerSet.dancers[0].id), beats));
        paths.set(dancerSet.dancers[1].id, createStationaryPath(startPosById.get(dancerSet.dancers[1].id), beats));
    }

    // Handle any inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let i = dancerSet.dancers.length - remainder; i < dancerSet.dancers.length; i++) {
            const dancer = dancerSet.dancers[i];
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        }
    }
}

/**
 * Clone the dancer set state for simulation
 * @param {import('./dancers.js').Set} dancerSet
 * @returns {import('./dancers.js').Set}
 */
function cloneSetState(dancerSet) {
    // Create a shallow clone by manipulating the dancers array
    // We can't easily deep clone the Set, so we'll work with the existing one
    // This is a temporary solution - in production we'd need proper cloning
    const clonedSet = Object.create(Object.getPrototypeOf(dancerSet));
    clonedSet.dancers = [...dancerSet.dancers];
    clonedSet.dancerMap = dancerSet.dancerMap;
    clonedSet.snapshots = [];

    return clonedSet;
}

/**
 * Execute a move without taking snapshots (for simulation)
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Object} move
 */
function executeMoveSilently(dancerSet, move) {
    const type = move.type.toLowerCase();

    // Override snapshot to do nothing during simulation
    const originalSnapshot = dancerSet.snapshot;
    dancerSet.snapshot = () => {};

    try {
        // Handle progression at the START of the move
        if (move.progression) {
            dancerSet.progress();
        }

        // Parse and execute the move (copied from app.js)
        if (type.includes('circle left')) {
            const match = type.match(/circle left (\d+)/);
            if (match) {
                dancerSet.circleLeft(parseInt(match[1]));
            }
        } else if (type.includes('circle right')) {
            const match = type.match(/circle right (\d+)/);
            if (match) {
                dancerSet.circleRight(parseInt(match[1]));
            }
        } else if (type.includes('star left')) {
            const match = type.match(/star left (\d+)/);
            if (match) {
                dancerSet.starLeft(parseInt(match[1]));
            }
        } else if (type.includes('star right')) {
            const match = type.match(/star right (\d+)/);
            if (match) {
                dancerSet.starRight(parseInt(match[1]));
            }
        } else if (type === 'balance') {
            dancerSet.balance();
        } else if (type === 'swing') {
            if (move.who === 'neighbor') {
                dancerSet.swing('neighbor');
            } else if (move.who === 'partner') {
                dancerSet.swing('partner');
            }
        } else if (type.includes('long lines')) {
            dancerSet.longLines();
        } else if (type.includes('chain')) {
            if (move.who === 'robins' || move.who === 'robin') {
                dancerSet.chainRobins();
            } else if (move.who === 'larks' || move.who === 'lark') {
                dancerSet.chainLarks();
            }
        } else if (type === 'do-si-do' || type === 'dosido') {
            dancerSet.doSiDo(1.0);
        }
    } finally {
        // Restore original snapshot function
        dancerSet.snapshot = originalSnapshot;
    }
}
