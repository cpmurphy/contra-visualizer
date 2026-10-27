// Paths for the turning figures: swings, stars, circles and do-si-dos, in which
// dancers go around a center

import { Position, toPixels, fromPixels, center } from '../positions.js';
import { Path, createStationaryPath } from '../paths.js';
import { SVG_WIDTH, SVG_HEIGHT, STAGE_HEIGHT, DANCER_RADIUS_PX, VERTICAL_SPACING_PX, COLUMN_MIDPOINT_PX, TAKE_HANDS_BEATS } from './shared.js';

// Swings and stars: the dancers step in over a beat (less in a short figure), turn
// steadily, and step out over a beat
const STEP_IN_BEATS = 1;

// Swings: the two swinging hold each other, so they turn closer together than in
// any other figure, about once every 2 beats (a buzz-step swing). The circles are
// drawn with a 2px outline, reaching 1px past the radius, so this leaves a small
// gap of 4px between them
const SWING_RADIUS_PX = DANCER_RADIUS_PX + 3;
const SWING_BEATS_PER_TURN = 2;
// Waypoints per revolution of a swing
const SWING_STEPS_PER_TURN = 24;

// Stars: how far from the middle the four turn, hands joined there; closer than in
// a circle, which is as wide as the minor set
const STAR_RADIUS_PX = 40;
// Waypoints per place travelled in a star
const STAR_STEPS_PER_PLACE = 8;

/**
 * Create do-si-do paths - neighbor pairs trace a wide counter-clockwise circle.
 * Unlike swing (tight orbit with approach/depart, clockwise, multi-revolution),
 * the do-si-do is a clean single-revolution loop, as wide as there's room for,
 * counter-clockwise.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function createDoSiDoPaths(dancerSet, startPosById, paths, beats) {
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

            // As wide as fits in this pair's half of the minor set
            const side = centerPx.x < COLUMN_MIDPOINT_PX ? 'left' : 'right';
            const rectangle = computeDoSiDoRectangle(i, dancerSet.dancers.length, side);
            const radius = computeDoSiDoRadius(centerPx, rectangle);

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
 * Create circular arc paths for dancers during circles. Each circle holds hands
 * all the way around, added to paths.holds.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {number} places - Number of places (quarter turns) to travel
 * @param {boolean} isClockwise - Decreasing angle (circle right) rather than increasing
 */
export function createCircularPaths(dancerSet, startPosById, paths, beats, places, isClockwise) {
    // Determine starting index based on active state
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;
    const holds = [];

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

        // Each dancer travels around an ellipse through the four corners of the minor
        // set, so a wide set doesn't bulge into the minor sets above and below
        minorSetDancers.forEach(dancer => {
            const start = startPosById.get(dancer.id);

            if (!dancer.active) {
                // Dancer is inactive - create stationary path
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else {
                paths.set(dancer.id, createEllipticalPath(start, centerPos, places, beats, isClockwise));
            }
        });

        // The four hold hands with those beside them around the circle
        if (minorSetDancers.every(d => d.active)) {
            const angle = dancer => {
                const pos = startPosById.get(dancer.id);
                return Math.atan2(pos.y - centerPos.y, pos.x - centerPos.x);
            };
            holds.push({
                ids: [...minorSetDancers].sort((d1, d2) => angle(d1) - angle(d2)).map(d => d.id),
                shape: 'ring',
                from: TAKE_HANDS_BEATS,
                to: beats - TAKE_HANDS_BEATS
            });
        }
    }
    paths.holds = holds;

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
 * Create star paths: in each minor set the four step in towards the middle, join
 * hands there, and turn steadily, a quarter turn apart, then step out to their
 * new corners. A star right turns clockwise (seen from above), a star left
 * counter-clockwise. Each star is added to paths.holds while they turn.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {number} places - Number of places (quarter turns) to travel
 * @param {boolean} isRight - Star right rather than star left
 */
export function createStarPaths(dancerSet, startPosById, endPosById, paths, beats, places, isRight) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });

    const totalRotation = (isRight ? 1 : -1) * places * Math.PI / 2;
    const rotationSteps = Math.max(1, places * STAR_STEPS_PER_PLACE);
    const times = turnTimes(beats, rotationSteps);
    const holds = [];

    for (const i of dancerSet.minorSetStarts()) {
        const minorSet = dancerSet.dancers.slice(i, i + 4);
        const corners = minorSet.map(dancer => toPixels(startPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT));
        const centerPx = {
            x: corners.reduce((sum, p) => sum + p.x, 0) / 4,
            y: corners.reduce((sum, p) => sum + p.y, 0) / 4
        };

        minorSet.forEach((dancer, j) => {
            // Each takes the diagonal towards their corner, so the four are evenly
            // spaced around the middle even though the minor set isn't square
            const entryAngle = Math.atan2(Math.sign(corners[j].y - centerPx.y), Math.sign(corners[j].x - centerPx.x));
            const waypoints = generateTurnWaypoints(startPosById.get(dancer.id), endPosById.get(dancer.id),
                centerPx, STAR_RADIUS_PX, entryAngle, totalRotation, rotationSteps);
            paths.set(dancer.id, new Path(waypoints, beats, times));
        });

        const leg = stepInBeats(beats);
        holds.push({ ids: minorSet.map(dancer => dancer.id), from: leg, to: beats - leg });
    }

    paths.holds = holds;
}

// Waypoints per place travelled in a circle
const CIRCLE_SAMPLES_PER_PLACE = 6;

/**
 * Create a path around an axis-aligned ellipse centered on the minor set, through the
 * dancer's start position and shaped like the minor set's rectangle (each axis is
 * sqrt(2) times the dancer's offset from the center along it), so the corners of the
 * minor set are a quarter turn apart.
 * @param {Position} start
 * @param {Position} centerPos
 * @param {number} places - Number of quarter turns to travel
 * @param {number} beats
 * @param {boolean} isClockwise - Decreasing angle rather than increasing
 * @returns {Path}
 */
function createEllipticalPath(start, centerPos, places, beats, isClockwise) {
    const dx = start.x - centerPos.x;
    const dy = start.y - centerPos.y;
    const a = Math.abs(dx) * Math.SQRT2;
    const b = Math.abs(dy) * Math.SQRT2;
    if (a === 0 || b === 0) {
        return createStationaryPath(start, beats);
    }

    const startAngle = Math.atan2(dy / b, dx / a);
    const sweep = (isClockwise ? -1 : 1) * places * Math.PI / 2;
    const count = Math.max(1, places) * CIRCLE_SAMPLES_PER_PLACE;
    const waypoints = [];
    for (let i = 0; i <= count; i++) {
        const angle = startAngle + sweep * i / count;
        waypoints.push(new Position(centerPos.x + a * Math.cos(angle), centerPos.y + b * Math.sin(angle)));
    }
    return new Path(waypoints, beats);
}

/**
 * Compute the bounding rectangle (in pixels) for one do-si-do pair: their half of
 * the minor set, split at the column midpoint.
 * @param {number} minorSetStart - Dancer array index where the minor set begins
 * @param {number} totalDancers - Total number of dancers in the set
 * @param {string} side - 'left' or 'right'
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
function computeDoSiDoRectangle(minorSetStart, totalDancers, side) {
    const numRows = Math.ceil(totalDancers / 2);
    const totalDancerHeight = (numRows - 1) * VERTICAL_SPACING_PX + 2 * DANCER_RADIUS_PX;
    const danceFloorHeight = SVG_HEIGHT - STAGE_HEIGHT;
    const startY = STAGE_HEIGHT + (danceFloorHeight - totalDancerHeight) / 2 + DANCER_RADIUS_PX;

    const topRow = minorSetStart / 2;
    const bottomRow = topRow + 1;

    // Vertical boundaries: midpoints between adjacent minor sets (or stage/floor edges)
    const top = topRow === 0 ? STAGE_HEIGHT : startY + (topRow - 0.5) * VERTICAL_SPACING_PX;
    const bottom = bottomRow >= numRows - 1 ? SVG_HEIGHT : startY + (bottomRow + 0.5) * VERTICAL_SPACING_PX;

    const left = side === 'left' ? 0 : COLUMN_MIDPOINT_PX;
    const right = side === 'left' ? COLUMN_MIDPOINT_PX : SVG_WIDTH;

    return { left, right, top, bottom };
}

/**
 * Compute a do-si-do radius that fits within the bounding rectangle.
 * @param {{x: number, y: number}} centerPx - Swing center in pixels
 * @param {{left: number, right: number, top: number, bottom: number}} rectangle
 * @returns {number} Radius in pixels
 */
function computeDoSiDoRadius(centerPx, rectangle) {
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
 * How long the step in to a swing or star takes, and the step out (less in a short
 * figure)
 * @param {number} beats - Duration of the figure in beats
 * @returns {number} Beats
 */
function stepInBeats(beats) {
    return Math.min(STEP_IN_BEATS, beats / 8);
}

/**
 * Choose how far a swing rotates: close to one revolution every
 * SWING_BEATS_PER_TURN beats between stepping in and stepping out,
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
    const turningBeats = beats - 2 * stepInBeats(beats);
    const nominal = turningBeats / SWING_BEATS_PER_TURN * fullTurn;

    // Clockwise angle from entry to exit, in [0, 2π)
    const baseRotation = ((exitAngle - entryAngle) % fullTurn + fullTurn) % fullTurn;

    // Add whole turns to land as close to the nominal rotation as possible
    const extraTurns = Math.max(0, Math.round((nominal - baseRotation) / fullTurn));
    return baseRotation + extraTurns * fullTurn;
}

/**
 * Generate waypoints for a swing or star in pixel space, converted to normalized
 * coords: in to the circle, around it, and out to the end position.
 * @param {Position} startPos - Dancer's start position (normalized)
 * @param {Position} endPos - Dancer's end position (normalized)
 * @param {{x: number, y: number}} centerPx - Center of the turn in pixels
 * @param {number} radius - Radius of the turn in pixels
 * @param {number} entryAngle - Angle at which dancer enters the circle
 * @param {number} totalRotation - Clockwise rotation around the circle (radians;
 *   negative for counter-clockwise)
 * @param {number} rotationSteps - Number of steps around the circle
 * @returns {Position[]} Array of waypoint positions (normalized)
 */
function generateTurnWaypoints(startPos, endPos, centerPx, radius, entryAngle, totalRotation, rotationSteps) {
    const waypoints = [startPos.clone()];
    for (let j = 0; j <= rotationSteps; j++) {
        const angle = entryAngle + totalRotation * j / rotationSteps;
        const x = centerPx.x + radius * Math.cos(angle);
        const y = centerPx.y + radius * Math.sin(angle);
        waypoints.push(fromPixels(x, y, SVG_WIDTH, SVG_HEIGHT));
    }
    waypoints.push(endPos.clone());
    return waypoints;
}

/**
 * Times for the waypoints of a swing or star: the step in and the step out (see
 * stepInBeats), and the turn between at a steady pace. Everyone turning shares
 * these times, so they keep their places around the circle.
 * @param {number} beats - Duration in beats
 * @param {number} rotationSteps - Number of steps around the circle
 * @returns {number[]}
 */
function turnTimes(beats, rotationSteps) {
    const leg = stepInBeats(beats) / beats;
    const times = [0];
    for (let j = 0; j <= rotationSteps; j++) {
        times.push(leg + (1 - 2 * leg) * j / rotationSteps);
    }
    times.push(1);
    return times;
}

/**
 * Create swing paths for one pair of dancers in a minor set: they come together
 * and rotate clockwise, close, around the point midway between them, holding on
 * while they turn (added to paths.holds).
 * @param {import('./dancers.js').Dancer} dancer1
 * @param {import('./dancers.js').Dancer} dancer2
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function addSwingPairPaths(dancer1, dancer2, startPosById, endPosById, paths, beats) {
    const start1 = startPosById.get(dancer1.id);
    const start2 = startPosById.get(dancer2.id);
    const end1 = endPosById.get(dancer1.id);
    const end2 = endPosById.get(dancer2.id);

    // Compute center in pixel space
    const s1px = toPixels(start1, SVG_WIDTH, SVG_HEIGHT);
    const s2px = toPixels(start2, SVG_WIDTH, SVG_HEIGHT);
    const centerPx = { x: (s1px.x + s2px.x) / 2, y: (s1px.y + s2px.y) / 2 };

    // Entry angle from dancer 1's start direction relative to center
    const entryAngle1 = Math.atan2(s1px.y - centerPx.y, s1px.x - centerPx.x);
    const entryAngle2 = entryAngle1 + Math.PI;

    // Both dancers rotate by the same amount so they stay opposite each other
    const e1px = toPixels(end1, SVG_WIDTH, SVG_HEIGHT);
    const exitAngle1 = Math.atan2(e1px.y - centerPx.y, e1px.x - centerPx.x);
    const totalRotation = computeSwingRotation(beats, entryAngle1, exitAngle1);
    const rotationSteps = Math.max(1, Math.round(totalRotation / (2 * Math.PI) * SWING_STEPS_PER_TURN));

    const times = turnTimes(beats, rotationSteps);
    const waypoints1 = generateTurnWaypoints(start1, end1, centerPx, SWING_RADIUS_PX, entryAngle1, totalRotation, rotationSteps);
    const waypoints2 = generateTurnWaypoints(start2, end2, centerPx, SWING_RADIUS_PX, entryAngle2, totalRotation, rotationSteps);

    paths.set(dancer1.id, new Path(waypoints1, beats, times));
    paths.set(dancer2.id, new Path(waypoints2, beats, times));
    const leg = stepInBeats(beats);
    paths.holds = [...(paths.holds || []),
        { ids: [dancer1.id, dancer2.id], shape: 'swing', from: leg, to: beats - leg }];
}

/**
 * Create swing paths for dancers.
 * Two dancers come together and rotate around the point midway between them.
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
export function createSwingPaths(dancerSet, startPosById, endPosById, paths, beats, swingWho) {
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

            addSwingPairPaths(dancer1, dancer2, startPosById, endPosById, paths, beats);
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
