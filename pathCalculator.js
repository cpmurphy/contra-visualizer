// Path calculator for dance moves
// Computes paths for each dancer during a move

import { Position, center, distance, toPixels, fromPixels } from './positions.js';
import { Path, createStraightPath, createStationaryPath, createArcPath, createOutAndBackPath } from './paths.js';

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
    if (move.progression) {
        // Progression happens at the start of the move: compute the figure from the
        // progressed set, then have the couples crossing over at the ends of the set
        // travel there during the move instead of jumping.
        const preProgressPosById = getPositionsById(dancerSet);
        const figure = { ...move, progression: false };
        return withSetState(dancerSet, set => set.progress(), set => {
            const paths = calculateMovePaths(figure, set);
            addCrossOverPaths(paths, preProgressPosById, getPositionsById(set));
            return paths;
        });
    }

    const paths = new Map();

    // Map dancer IDs to their start and end positions
    const startPosById = getPositionsById(dancerSet);
    const endPosById = withSetState(dancerSet, set => executeMove(set, move), getPositionsById);

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
        // Neighbor pairs trace a wide counter-clockwise circle around their shared center
        createDoSiDoPaths(dancerSet, startPosById, paths, beats);
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

            paths.set(d1.id, createOutAndBackPath(pos1, new Position(pos1.x, midY1), beats));
            paths.set(d2.id, createOutAndBackPath(pos2, new Position(pos2.x, midY2), beats));
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
 * Create do-si-do paths - neighbor pairs trace a wide counter-clockwise circle.
 * Unlike swing (tight orbit with approach/depart, clockwise, multi-revolution),
 * the do-si-do is a clean single-revolution loop at a wider radius, counter-clockwise.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createDoSiDoPaths(dancerSet, startPosById, paths, beats) {
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) break;

        const minorSetDancers = [
            dancerSet.dancers[i],
            dancerSet.dancers[i + 1],
            dancerSet.dancers[i + 2],
            dancerSet.dancers[i + 3]
        ];

        // Neighbor pairs: same column, lark with robin
        const leftDancers = [minorSetDancers[0], minorSetDancers[2]];
        const rightDancers = [minorSetDancers[1], minorSetDancers[3]];

        const neighborPairs = [
            [leftDancers.find(d => d.role === 'lark'), leftDancers.find(d => d.role === 'robin')],
            [rightDancers.find(d => d.role === 'lark'), rightDancers.find(d => d.role === 'robin')]
        ];

        for (const [dancer1, dancer2] of neighborPairs) {
            if (!dancer1 || !dancer2) continue;

            if (!dancer1.active || !dancer2.active) {
                if (!dancer1.active) {
                    paths.set(dancer1.id, createStationaryPath(startPosById.get(dancer1.id), beats));
                }
                if (!dancer2.active) {
                    paths.set(dancer2.id, createStationaryPath(startPosById.get(dancer2.id), beats));
                }
                continue;
            }

            const start1 = startPosById.get(dancer1.id);
            const start2 = startPosById.get(dancer2.id);

            // Work in pixel space for proper circular geometry
            const s1px = toPixels(start1, SVG_WIDTH, SVG_HEIGHT);
            const s2px = toPixels(start2, SVG_WIDTH, SVG_HEIGHT);
            const centerPx = { x: (s1px.x + s2px.x) / 2, y: (s1px.y + s2px.y) / 2 };

            // Use bounding rectangle to constrain radius (same as swing)
            const side = centerPx.x < COLUMN_MIDPOINT_PX ? 'left' : 'right';
            const rectangle = computeSwingRectangle(i, dancerSet.dancers.length, side, false);
            const radius = computeSwingRadius(centerPx, rectangle);

            // Each dancer traces a full 360° counter-clockwise circle from their start
            // back to their start (CCW = negative angle in SVG y-down coords)
            const entryAngle1 = Math.atan2(s1px.y - centerPx.y, s1px.x - centerPx.x);
            const entryAngle2 = entryAngle1 + Math.PI;

            const steps = 8;
            const fullCircle = -2 * Math.PI; // counter-clockwise

            // Step in from the start position onto the circle, and back out at the end
            const waypoints1 = [start1.clone()];
            const waypoints2 = [start2.clone()];
            for (let j = 0; j <= steps; j++) {
                const progress = j / steps;
                const angle1 = entryAngle1 + fullCircle * progress;
                const angle2 = entryAngle2 + fullCircle * progress;
                waypoints1.push(fromPixels(
                    centerPx.x + radius * Math.cos(angle1),
                    centerPx.y + radius * Math.sin(angle1),
                    SVG_WIDTH, SVG_HEIGHT
                ));
                waypoints2.push(fromPixels(
                    centerPx.x + radius * Math.cos(angle2),
                    centerPx.y + radius * Math.sin(angle2),
                    SVG_WIDTH, SVG_HEIGHT
                ));
            }

            waypoints1.push(start1.clone());
            waypoints2.push(start2.clone());

            paths.set(dancer1.id, new Path(waypoints1, beats));
            paths.set(dancer2.id, new Path(waypoints2, beats));
        }
    }

    // Handle inactive dancers at the beginning
    if (startIndex === 2) {
        for (let j = 0; j < 2; j++) {
            const d = dancerSet.dancers[j];
            paths.set(d.id, createStationaryPath(startPosById.get(d.id), beats));
        }
    }

    // Handle inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let j = dancerSet.dancers.length - remainder; j < dancerSet.dancers.length; j++) {
            const d = dancerSet.dancers[j];
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
    // Come right up to the other line, stopping just short of touching
    const minGap = ((DANCER_RADIUS_PX + 5) / SVG_WIDTH) * 100;
    const maxApproach = Math.max(0, (minDistToCenter - minGap) / minDistToCenter);

    dancerSet.dancers.forEach(dancer => {
        const start = startPosById.get(dancer.id);

        if (!dancer.active) {
            paths.set(dancer.id, createStationaryPath(start, beats));
            return;
        }

        const approachX = start.x + (centerX - start.x) * maxApproach;
        const approachPos = new Position(approachX, start.y);

        paths.set(dancer.id, createOutAndBackPath(start, approachPos, beats));
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
 * Choose how far a swing rotates: close to the nominal (beats/4 - 0.5) revolutions,
 * but adjusted so the dancer leaves the circle on the side facing their end
 * position. Otherwise the straight exit leg can cut through the circle's center,
 * straight through their swing partner.
 * @param {number} beats - Duration in beats
 * @param {number} entryAngle - Angle at which the dancer enters the circle
 * @param {number} exitAngle - Angle from the center toward the dancer's end position
 * @returns {number} Clockwise rotation in radians (positive, y-down)
 */
function computeSwingRotation(beats, entryAngle, exitAngle) {
    const fullTurn = 2 * Math.PI;
    const nominal = (beats / 4 - 0.5) * fullTurn;

    // Clockwise angle from entry to exit, in [0, 2π)
    const baseRotation = ((exitAngle - entryAngle) % fullTurn + fullTurn) % fullTurn;

    // Add whole turns to land as close to the nominal rotation as possible
    const extraTurns = Math.max(0, Math.round((nominal - baseRotation) / fullTurn));
    return baseRotation + extraTurns * fullTurn;
}

/**
 * Generate swing waypoints in pixel space, converted to normalized coords.
 * @param {Position} startPos - Dancer's start position (normalized)
 * @param {Position} endPos - Dancer's end position (normalized)
 * @param {{x: number, y: number}} centerPx - Swing center in pixels
 * @param {number} radius - Swing radius in pixels
 * @param {number} entryAngle - Angle at which dancer enters the circle
 * @param {number} totalRotation - Clockwise rotation around the circle (radians)
 * @returns {Position[]} Array of waypoint positions (normalized)
 */
function generateSwingWaypoints(startPos, endPos, centerPx, radius, entryAngle, totalRotation) {
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

            // Both dancers rotate by the same amount so they stay opposite each other
            const e1px = toPixels(end1, SVG_WIDTH, SVG_HEIGHT);
            const exitAngle1 = Math.atan2(e1px.y - centerPx.y, e1px.x - centerPx.x);
            const totalRotation = computeSwingRotation(beats, entryAngle1, exitAngle1);

            const waypoints1 = generateSwingWaypoints(start1, end1, centerPx, radius, entryAngle1, totalRotation);
            const waypoints2 = generateSwingWaypoints(start2, end2, centerPx, radius, entryAngle2, totalRotation);

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
 * Create a cache key for path caching based on move and dancer arrangement
 * @param {Object} move - The move object
 * @param {import('./dancers.js').Set} dancerSet - The current dancer set
 * @returns {string} Cache key
 */
export function pathCacheKey(move, dancerSet) {
    // Include move properties
    const moveKey = [
        move.type,
        move.who || 'none',
        move.beats || 8,
        move.progression ? 'prog' : 'noprog'
    ].join('|');

    // Include which dancer is in each place, and whether they're active. Positions
    // alone aren't enough: places are fixed, so every arrangement of dancers has the
    // same positions, and paths are keyed by dancer ID.
    const dancerKey = dancerSet.dancers
        .map(d => `${d.id}${d.active ? '' : '*'}`)
        .join(',');

    return `${moveKey}::${dancerKey}`;
}

/**
 * Map each dancer ID to its current position
 * @param {import('./dancers.js').Set} dancerSet
 * @returns {Map<string, Position>}
 */
function getPositionsById(dancerSet) {
    const positions = dancerSet.getPositions();
    const posById = new Map();
    dancerSet.dancers.forEach((dancer, index) => {
        posById.set(dancer.id, positions[index]);
    });
    return posById;
}

/**
 * Temporarily change the set, read something from it, then restore it exactly
 * (dancer order, active states and couple numbers) using the set's undo history.
 * @template T
 * @param {import('./dancers.js').Set} dancerSet
 * @param {(set: import('./dancers.js').Set) => void} change - Mutation to apply
 * @param {(set: import('./dancers.js').Set) => T} read - Called with the changed set
 * @returns {T}
 */
export function withSetState(dancerSet, change, read) {
    const depth = dancerSet.snapshots.length;
    // Explicit snapshot so the set is restored even if the change takes none
    dancerSet.snapshot();
    try {
        change(dancerSet);
        return read(dancerSet);
    } finally {
        while (dancerSet.snapshots.length > depth) {
            dancerSet.undo();
        }
    }
}

/**
 * Give dancers whose position was changed by the progression (the couples crossing
 * over at the ends of the set) a path from their old position to their new one.
 * Partners circle around their shared midpoint, so they stay opposite each other,
 * bulging away from the rest of the set.
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {Map<string, Position>} preProgressPosById
 * @param {Map<string, Position>} postProgressPosById
 */
function addCrossOverPaths(paths, preProgressPosById, postProgressPosById) {
    const setCenterY = center([...preProgressPosById.values()]).y;

    paths.forEach((path, dancerId) => {
        const from = preProgressPosById.get(dancerId);
        if (from.equals(postProgressPosById.get(dancerId), 0.01)) return;

        if (!path.start.equals(path.end, 0.01)) {
            throw new Error(`Dancer ${dancerId} both progresses and moves; cannot animate cross-over`);
        }
        const to = path.end;
        const midpoint = new Position((from.x + to.x) / 2, (from.y + to.y) / 2);
        // Clockwise arcs pass over the top (y-down), counter-clockwise under the bottom
        const overTheTop = midpoint.y < setCenterY;
        paths.set(dancerId, createArcPath(from, to, midpoint, path.beats, 9, overTheTop));
    });
}

/**
 * Execute a move on the set (each move records its own undo snapshot)
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Object} move
 */
export function executeMove(dancerSet, move) {
    const type = move.type.toLowerCase();

    // Handle progression at the START of the move
    if (move.progression) {
        dancerSet.progress();
    }

    // Parse and execute the move
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
}
