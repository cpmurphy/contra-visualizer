// Path calculator for dance moves
// Computes paths for each dancer during a move

import { Position, center, distance, toPixels, fromPixels } from './positions.js';
import { Path, createStraightPath, createStationaryPath, createArcPath, createOutAndBackPath, createBezierPath } from './paths.js';

// SVG layout constants (must match dancers.js getPositions)
const SVG_WIDTH = 800;
const SVG_HEIGHT = 1000;
const STAGE_HEIGHT = 100;
const DANCER_RADIUS_PX = 20;
const VERTICAL_SPACING_PX = 120;
const COLUMN_MIDPOINT_PX = 350;

// How far down the hall a couple goes down the center
const DOWN_THE_CENTER_PX = 120;
// Size of the little loop a dancer turning alone makes: narrow, since there's not
// much room between their partner and the line
const TURN_ALONE_ACROSS_PX = 5;
const TURN_ALONE_ALONG_PX = 10;
// How far outside the line a dancer casting off goes, and how far in the dancer
// they cast around steps to let them by
const CAST_OFF_OUTSIDE_PX = 35;
const CAST_OFF_PIVOT_INSIDE_PX = 25;

// Routes through half a hey for the left robin and left lark of a minor set with
// the robins on the diagonal from bottom left to top right, as [time, x, y]: time
// is the fraction of the hey, and x and y are in units of half the minor set's
// width and height from its center (y down). The right robin and lark follow the
// same routes turned half way around. Everyone travels half way around a figure
// eight, and the four passes come about a quarter of the hey apart:
// - the robins pass right shoulders in the middle;
// - each robin, going down the inside of the far line, passes the lark coming up
//   the outside of it by the left;
// - the larks pass right shoulders in the middle, the robins looping around the
//   far ends;
// - each robin, coming back up the outside of the far line, passes the lark going
//   down the inside of it by the left.
// Each lark ends in the other lark's place, and each robin in the other robin's.
const HEY_ROUTES = {
    robin: [
        [0, -1, 1],
        [0.08, -0.75, 0.45],
        [0.16, -0.18, -0.32],
        [0.27, 0.4, -0.85],
        [0.375, 0.7, -0.33],
        [0.5, 0.7, 0.6],
        [0.6, 0.95, 1.45],
        [0.7, 1.3, 0.75],
        [0.875, 1.3, -0.17],
        [1, 1, -1]
    ],
    lark: [
        [0, -1, -1],
        [0.15, -1.2, -0.4],
        [0.375, -1.3, 0.33],
        [0.47, -0.95, 1.25],
        [0.55, -0.6, 0.65],
        [0.625, -0.18, -0.32],
        [0.72, 0.4, -0.85],
        [0.875, 0.7, 0.17],
        [1, 1, 1]
    ]
};
// Waypoints between each point of a route through a hey
const HEY_SAMPLES_PER_STEP = 8;

// In a right and left through, how far dancers bear to their left to pass the one
// coming across the other way by the right shoulder, and how close together the
// two who courtesy turn come as they turn
const PASS_THROUGH_BULGE_PX = 26;
const COURTESY_TURN_RADIUS_PX = 25;
// Waypoints for each half of a right and left through
const RIGHT_AND_LEFT_SAMPLES = 16;

// Figures for one couple ('ones' or 'twos') to dance, in either formation
const COUPLE_FIGURES = ['down the center', 'up the center', 'turn alone', 'cast off', 'balance', 'swing'];
const COUPLES = ['ones', 'twos'];

// "who" values that mean each dancer's neighbor (moves that don't say mean neighbors)
const NEIGHBOR_WHO = [undefined, null, 'neighbor', 'neighbors', 'new neighbor'];

/**
 * Whether a move is one we know how to execute and animate in the set's formation.
 * Figures we don't know yet (heys, casts, the ones-only figures of the old dances,
 * and so on) leave the dancers where they are rather than animating them wrongly.
 * @param {Object} move - The move object with type, who, etc.
 * @param {import('./dancers.js').Set} dancerSet - The set the move would be danced in
 * @returns {boolean}
 */
export function isMoveSupported(move, dancerSet) {
    const type = move.type.toLowerCase();
    const who = move.who;

    // Rotations and long lines don't depend on who is where
    if (/(circle|star) (left|right) \d+/.test(type)) return true;
    if (type.includes('long lines')) return true;
    if (COUPLE_FIGURES.includes(type) && COUPLES.includes(who)) return true;
    if (type === 'right and left through') return ['neighbor', 'partner'].includes(who);

    // Everything else is worked out for improper minor sets only
    if (!dancerSet.isImproper()) return false;

    if (type === 'balance') return NEIGHBOR_WHO.includes(who);
    if (type === 'swing') return who === 'neighbor' || who === 'partner';
    if (type.includes('chain')) return ['robins', 'robin', 'larks', 'lark'].includes(who);
    if (type === 'do-si-do' || type === 'dosido') return NEIGHBOR_WHO.includes(who);
    if (type === 'half hey') return [undefined, null, 'all'].includes(who);
    return false;
}

/**
 * Calculate paths for all dancers during a move
 * @param {Object} move - The move object with type, beats, etc.
 * @param {import('./dancers.js').Set} dancerSet - The current set state
 * @returns {Map<string, import('./paths.js').Path>} Map from dancer ID to Path
 */
export function calculateMovePaths(move, dancerSet) {
    if (progresses(move, dancerSet)) {
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

    if (!isMoveSupported(move, dancerSet)) {
        // Not animated yet: everyone holds their place
        dancerSet.dancers.forEach(dancer => {
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        });
    } else if (type === 'balance' && COUPLES.includes(move.who)) {
        // Partners in the couple balance towards each other
        createCouplePairPaths(dancerSet, move.who, startPosById, paths, beats, (d1, d2) =>
            addBalancePairPaths(d1, d2, startPosById, paths, beats));
    } else if (type === 'swing' && COUPLES.includes(move.who)) {
        // Partners in the couple swing in the middle of the set
        createCouplePairPaths(dancerSet, move.who, startPosById, paths, beats, (d1, d2, i) =>
            addSwingPairPaths(dancerSet, i, d1, d2, startPosById, endPosById, paths, beats));
    } else if (type === 'balance') {
        // Neighbor pairs approach each other vertically and retreat
        createBalancePaths(dancerSet, startPosById, paths, beats);
    } else if (type.includes('long lines')) {
        // Two lines approach each other and retreat
        createLongLinesPaths(dancerSet, startPosById, paths, beats);
    } else if (type.includes('circle left') || type.includes('circle right') ||
               type.includes('star left') || type.includes('star right')) {
        // Circular moves - arc paths around minor set centers
        const isClockwise = type.includes('right');
        const places = parseInt(type.match(/(?:circle|star) (?:left|right) (\d+)/)[1]);
        createCircularPaths(dancerSet, startPosById, paths, beats, places, isClockwise);
    } else if (type === 'swing') {
        // Swing moves - dancers rotate around common center
        const swingWho = move.who || 'neighbor';
        createSwingPaths(dancerSet, startPosById, endPosById, paths, beats, swingWho);
    } else if (type.includes('chain')) {
        if (move.who === 'robins' || move.who === 'robin') {
            // Robins pull by in the middle, then courtesy turn with the lark on the far side
            createRobinsChainPaths(dancerSet, startPosById, endPosById, paths, beats);
        } else {
            // Other chains - dancers cross with arced paths
            createChainPaths(dancerSet, startPosById, endPosById, paths, beats);
        }
    } else if (type === 'do-si-do' || type === 'dosido') {
        // Neighbor pairs trace a wide counter-clockwise circle around their shared center
        createDoSiDoPaths(dancerSet, startPosById, paths, beats);
    } else if (type === 'half hey') {
        createHalfHeyPaths(dancerSet, startPosById, endPosById, paths, beats);
    } else if (type === 'right and left through') {
        createRightAndLeftThroughPaths(dancerSet, startPosById, endPosById, paths, beats);
    } else if (type === 'down the center' || type === 'up the center') {
        createCenterTravelPaths(dancerSet, startPosById, endPosById, paths, beats);
    } else if (type === 'turn alone') {
        createTurnAlonePaths(dancerSet, dancerSet.placesOf(move.who), startPosById, paths, beats);
    } else if (type === 'cast off') {
        createCastOffPaths(dancerSet, dancerSet.placesOf(move.who), startPosById, endPosById, paths, beats);
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
            addBalancePairPaths(d1, d2, startPosById, paths, beats);
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
 * Create balance paths for a pair of dancers: they step towards each other, stopping
 * a little apart, and back.
 * @param {import('./dancers.js').Dancer} d1
 * @param {import('./dancers.js').Dancer} d2
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function addBalancePairPaths(d1, d2, startPosById, paths, beats) {
    const pos1 = startPosById.get(d1.id);
    const pos2 = startPosById.get(d2.id);

    // Compute how far to approach while maintaining a minimum gap (in pixels)
    const p1 = toPixels(pos1, SVG_WIDTH, SVG_HEIGHT);
    const p2 = toPixels(pos2, SVG_WIDTH, SVG_HEIGHT);
    const gap = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const minGap = 3 * DANCER_RADIUS_PX;
    const maxApproach = gap > 0 ? Math.max(0, (gap - minGap) / gap) : 0;

    const turn1 = new Position(pos1.x + (pos2.x - pos1.x) * maxApproach / 2, pos1.y + (pos2.y - pos1.y) * maxApproach / 2);
    const turn2 = new Position(pos2.x + (pos1.x - pos2.x) * maxApproach / 2, pos2.y + (pos1.y - pos2.y) * maxApproach / 2);

    paths.set(d1.id, createOutAndBackPath(pos1, turn1, beats));
    paths.set(d2.id, createOutAndBackPath(pos2, turn2, beats));
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
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {number} places - Number of places (quarter turns) to travel
 * @param {boolean} isClockwise - Decreasing angle (circle right) rather than increasing
 */
function createCircularPaths(dancerSet, startPosById, paths, beats, places, isClockwise) {
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

// Waypoints per place travelled in a circle or star
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
 * Create half hey paths, for a minor set with the robins on one diagonal: on the
 * left side the lark above the robin, and on the right the robin above the lark (see
 * HEY_ROUTES). Each dancer follows a smooth curve through their route.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createHalfHeyPaths(dancerSet, startPosById, endPosById, paths, beats) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });

    for (const i of dancerSet.minorSetStarts()) {
        const [leftLark, leftRobin, rightRobin, rightLark] = dancerSet.heyLine(i).map(index => dancerSet.dancers[index]);
        const px = dancer => toPixels(startPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);
        if (px(leftLark).y > px(leftRobin).y) {
            throw new Error('Half hey with the robins starting above the larks on the left is not animated yet');
        }

        // The routes are in units of half the minor set's width and height, from its center
        const corners = [leftLark, leftRobin, rightRobin, rightLark].map(px);
        const centerPx = {
            x: corners.reduce((sum, p) => sum + p.x, 0) / 4,
            y: corners.reduce((sum, p) => sum + p.y, 0) / 4
        };
        const halfWidth = (px(rightRobin).x - px(leftRobin).x) / 2;
        const halfHeight = (px(leftRobin).y - px(leftLark).y) / 2;

        // The dancers on the right follow the same routes turned half way around
        const routes = [
            [leftRobin, HEY_ROUTES.robin, 1],
            [rightRobin, HEY_ROUTES.robin, -1],
            [leftLark, HEY_ROUTES.lark, 1],
            [rightLark, HEY_ROUTES.lark, -1]
        ];
        for (const [dancer, route, turn] of routes) {
            const points = route.map(([, u, v]) => ({
                x: centerPx.x + turn * u * halfWidth,
                y: centerPx.y + turn * v * halfHeight
            }));
            // Start and end exactly in place
            points[0] = px(dancer);
            points[points.length - 1] = toPixels(endPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);

            const padded = [points[0], ...points, points[points.length - 1]];
            const waypoints = [startPosById.get(dancer.id).clone()];
            const times = [0];
            for (let k = 0; k < route.length - 1; k++) {
                for (let j = 1; j <= HEY_SAMPLES_PER_STEP; j++) {
                    const u = j / HEY_SAMPLES_PER_STEP;
                    const point = catmullRom(padded[k], padded[k + 1], padded[k + 2], padded[k + 3], u);
                    waypoints.push(fromPixels(point.x, point.y, SVG_WIDTH, SVG_HEIGHT));
                    times.push(route[k][0] + (route[k + 1][0] - route[k][0]) * u);
                }
            }
            paths.set(dancer.id, new Path(waypoints, beats, times));
        }
    }
}

/**
 * Create right and left through paths. For the first half everyone passes straight
 * across the set, bearing left to pass the dancer coming the other way by the right
 * shoulder. For the second half the two who arrived on each side courtesy turn:
 * they come close together, turn half way around counter-clockwise (as seen from
 * above, with the music at the top) about the middle of their side of the minor set,
 * and spread back out into the places there.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createRightAndLeftThroughPaths(dancerSet, startPosById, endPosById, paths, beats) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });
    // Ease in and out of each half
    const ease = u => (1 - Math.cos(Math.PI * u)) / 2;

    for (const i of dancerSet.minorSetStarts()) {
        const minorSet = dancerSet.dancers.slice(i, i + 4);
        for (const dancer of minorSet) {
            const start = toPixels(startPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);
            const end = toPixels(endPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);
            // Across the set at their own row, then turning about the middle of the far side
            const arrival = { x: end.x, y: start.y };
            const pivot = { x: end.x, y: (start.y + end.y) / 2 };
            const heading = Math.sign(arrival.x - start.x);
            // Bearing left: heading right across the screen, that's up
            const bulge = { x: (start.x + arrival.x) / 2, y: start.y - heading * PASS_THROUGH_BULGE_PX };

            const waypoints = [];
            const times = [];
            for (let k = 0; k <= RIGHT_AND_LEFT_SAMPLES; k++) {
                const u = ease(k / RIGHT_AND_LEFT_SAMPLES);
                // Quadratic curve through the bulge halfway across
                const control = { x: 2 * bulge.x - (start.x + arrival.x) / 2, y: 2 * bulge.y - (start.y + arrival.y) / 2 };
                waypoints.push({
                    x: (1 - u) ** 2 * start.x + 2 * (1 - u) * u * control.x + u ** 2 * arrival.x,
                    y: (1 - u) ** 2 * start.y + 2 * (1 - u) * u * control.y + u ** 2 * arrival.y
                });
                times.push(k / RIGHT_AND_LEFT_SAMPLES / 2);
            }

            // Counter-clockwise from above is anticlockwise on screen: decreasing
            // angle in y-down coordinates
            const startAngle = Math.atan2(arrival.y - pivot.y, arrival.x - pivot.x);
            const outerRadius = Math.hypot(arrival.x - pivot.x, arrival.y - pivot.y);
            for (let k = 1; k <= RIGHT_AND_LEFT_SAMPLES; k++) {
                const u = ease(k / RIGHT_AND_LEFT_SAMPLES);
                const angle = startAngle - Math.PI * u;
                const radius = outerRadius - (outerRadius - COURTESY_TURN_RADIUS_PX) * Math.sin(Math.PI * u);
                waypoints.push({ x: pivot.x + radius * Math.cos(angle), y: pivot.y + radius * Math.sin(angle) });
                times.push(0.5 + k / RIGHT_AND_LEFT_SAMPLES / 2);
            }

            const normalized = waypoints.map(point => fromPixels(point.x, point.y, SVG_WIDTH, SVG_HEIGHT));
            normalized[normalized.length - 1] = endPosById.get(dancer.id).clone();
            paths.set(dancer.id, new Path(normalized, beats, times));
        }
    }
}

/**
 * Point on a centripetal Catmull-Rom segment from p1 to p2
 * @param {{x: number, y: number}} p0
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {{x: number, y: number}} p3
 * @param {number} u - Progress from p1 (0) to p2 (1)
 * @returns {{x: number, y: number}}
 */
function catmullRom(p0, p1, p2, p3, u) {
    // Knot spacing grows with the square root of distance (centripetal), which
    // keeps the curve from overshooting at sharp corners
    const gap = (a, b) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-6);
    const t0 = 0;
    const t1 = t0 + gap(p0, p1);
    const t2 = t1 + gap(p1, p2);
    const t3 = t2 + gap(p2, p3);
    const t = t1 + (t2 - t1) * u;
    const mix = (a, b, ta, tb) => ta === tb ? a : {
        x: (tb - t) / (tb - ta) * a.x + (t - ta) / (tb - ta) * b.x,
        y: (tb - t) / (tb - ta) * a.y + (t - ta) / (tb - ta) * b.y
    };
    const a1 = mix(p0, p1, t0, t1);
    const a2 = mix(p1, p2, t1, t2);
    const a3 = mix(p2, p3, t2, t3);
    const b1 = mix(a1, a2, t0, t2);
    const b2 = mix(a2, a3, t1, t3);
    return mix(b1, b2, t1, t2);
}

/**
 * Create paths for the partners in a couple ('ones' or 'twos') dancing together in
 * each minor set; everyone else stands still
 * @param {import('./dancers.js').Set} dancerSet
 * @param {string} who - 'ones' or 'twos'
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {(lark: import('./dancers.js').Dancer, robin: import('./dancers.js').Dancer, i: number) => void} addPairPaths -
 *   Adds the paths for a lark and robin, given the first place of their minor set
 */
function createCouplePairPaths(dancerSet, who, startPosById, paths, beats, addPairPaths) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });
    const places = dancerSet.placesOf(who);
    for (const i of dancerSet.minorSetStarts()) {
        const lark = dancerSet.dancers.slice(i, i + 4).find((dancer, j) =>
            dancer.role === 'lark' && places.includes(i + j));
        if (lark && places.includes(dancerSet.dancers.indexOf(lark.partner))) {
            addPairPaths(lark, lark.partner, i);
        }
    }
}

/**
 * Create paths for a couple going down or coming up the center: they move across
 * into the middle of the set first (if they aren't there already), then along it.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createCenterTravelPaths(dancerSet, startPosById, endPosById, paths, beats) {
    dancerSet.dancers.forEach(dancer => {
        const start = startPosById.get(dancer.id);
        const end = endPosById.get(dancer.id);
        if (start.equals(end, 0.01)) {
            paths.set(dancer.id, createStationaryPath(start, beats));
        } else {
            paths.set(dancer.id, createBezierPath([
                start,
                new Position(end.x, start.y),
                new Position(end.x, (start.y + end.y) / 2),
                end
            ], beats));
        }
    });
}

/**
 * Create paths for dancers turning alone: each makes a little loop on the spot,
 * around towards the middle of the set, and back to where they were.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {number[]} turning - Places of the dancers turning alone
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createTurnAlonePaths(dancerSet, turning, startPosById, paths, beats) {
    const rx = TURN_ALONE_ACROSS_PX / SVG_WIDTH * 100;
    const ry = TURN_ALONE_ALONG_PX / SVG_HEIGHT * 100;
    const middleX = COLUMN_MIDPOINT_PX / SVG_WIDTH * 100;

    dancerSet.dancers.forEach((dancer, index) => {
        const start = startPosById.get(dancer.id);
        if (!turning.includes(index)) {
            paths.set(dancer.id, createStationaryPath(start, beats));
            return;
        }
        // The loop is down the hall from the dancer (there's no room either side), and
        // they turn in towards their partner first
        const inward = start.x < middleX ? 1 : -1;
        const loopCenter = new Position(start.x, start.y + ry);
        const waypoints = [];
        const count = 16;
        for (let i = 0; i <= count; i++) {
            const angle = -Math.PI / 2 + inward * 2 * Math.PI * i / count;
            waypoints.push(new Position(loopCenter.x + rx * Math.cos(angle), loopCenter.y + ry * Math.sin(angle)));
        }
        waypoints[count] = start.clone();
        paths.set(dancer.id, new Path(waypoints, beats));
    });
}

/**
 * Create cast off paths: each dancer casting off turns out and goes around the
 * outside of the line, ending in the line below the dancer on their side, who steps
 * up on the inside if they need to move up.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {number[]} casting - Places of the dancers casting off
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createCastOffPaths(dancerSet, casting, startPosById, endPosById, paths, beats) {
    const castingIds = casting.map(index => dancerSet.dancers[index].id);
    const middleX = COLUMN_MIDPOINT_PX / SVG_WIDTH * 100;

    dancerSet.dancers.forEach(dancer => {
        const start = startPosById.get(dancer.id);
        const end = endPosById.get(dancer.id);
        if (start.equals(end, 0.01)) {
            paths.set(dancer.id, createStationaryPath(start, beats));
            return;
        }
        // Halfway, casters are outside the line and the dancers they go around inside it
        const outward = end.x < middleX ? -1 : 1;
        const sidewaysPx = castingIds.includes(dancer.id) ? CAST_OFF_OUTSIDE_PX : -CAST_OFF_PIVOT_INSIDE_PX;
        const halfway = new Position(end.x + outward * sidewaysPx / SVG_WIDTH * 100, (start.y + end.y) / 2);
        // Quadratic control point that puts the curve through the halfway point
        const control = new Position(
            2 * halfway.x - (start.x + end.x) / 2,
            2 * halfway.y - (start.y + end.y) / 2
        );
        paths.set(dancer.id, createBezierPath([start, control, end], beats));
    });
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
 * Create swing paths for one pair of dancers in a minor set: they rotate clockwise
 * around their shared center, within the part of the minor set that is theirs.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {number} i - Index of the first place of the minor set
 * @param {import('./dancers.js').Dancer} dancer1
 * @param {import('./dancers.js').Dancer} dancer2
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function addSwingPairPaths(dancerSet, i, dancer1, dancer2, startPosById, endPosById, paths, beats) {
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

            addSwingPairPaths(dancerSet, i, dancer1, dancer2, startPosById, endPosById, paths, beats);
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

// Robins chain geometry (pixels). The robins pull by right hands, swinging briefly
// clockwise around each other at the center of the minor set; each then courtesy
// turns counter-clockwise around a pivot beside the lark she meets, the lark close
// to the pivot and the robin around him.
const CHAIN_PULL_BY_RADIUS_PX = 28;
const COURTESY_PIVOT_START_FRACTION = 0.1;
const COURTESY_PIVOT_START_INWARD_PX = 0;
const COURTESY_PIVOT_END_FRACTION = 0.35;
const COURTESY_LARK_RADIUS_PX = 18;
const COURTESY_ROBIN_RADIUS_PX = 38;
// Phases of the chain, as fractions of its duration: for 8 beats, cross in 3,
// courtesy turn in 4, release into place in 1
const CHAIN_ARRIVAL_END = 3 / 8;
const CHAIN_TURN_END = 7 / 8;
// Waypoints per beat when sampling the chain paths
const CHAIN_SAMPLES_PER_BEAT = 12;

/**
 * Create robins chain paths: the robins pull by right hands in the middle of the
 * minor set, each meets the lark on the far side, and the couple courtesy turns
 * counter-clockwise as a unit (lark backing, robin walking forward around him),
 * coming to rest facing in with the robin on the lark's right. They then release
 * into their places.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createRobinsChainPaths(dancerSet, startPosById, endPosById, paths, beats) {
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    for (let i = startIndex; i + 4 <= dancerSet.dancers.length; i += 4) {
        const minorSetDancers = dancerSet.dancers.slice(i, i + 4);
        const setCenterPx = toPixels(center(minorSetDancers.map(d => startPosById.get(d.id))),
            SVG_WIDTH, SVG_HEIGHT);

        const robins = minorSetDancers.filter(d =>
            d.active && d.role === 'robin' && !startPosById.get(d.id).equals(endPosById.get(d.id), 0.01));

        for (const robin of robins) {
            const robinEnd = endPosById.get(robin.id);
            // The robin turns with the lark already standing on the side she ends on
            const lark = minorSetDancers.find(d =>
                d.role === 'lark' && Math.abs(startPosById.get(d.id).x - robinEnd.x) < 0.01);
            if (!lark) {
                throw new Error(`No lark for ${robin.id} to courtesy turn with`);
            }

            const [robinWaypoints, larkWaypoints, times] = courtesyTurnChainWaypoints(
                toPixels(startPosById.get(robin.id), SVG_WIDTH, SVG_HEIGHT),
                toPixels(robinEnd, SVG_WIDTH, SVG_HEIGHT),
                toPixels(startPosById.get(lark.id), SVG_WIDTH, SVG_HEIGHT),
                setCenterPx,
                beats
            );
            paths.set(robin.id, new Path(robinWaypoints, beats, times));
            paths.set(lark.id, new Path(larkWaypoints, beats, times));
        }
    }

    // Everyone else (other active dancers, inactive couples) stays put
    dancerSet.dancers.forEach(dancer => {
        if (!paths.has(dancer.id)) {
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        }
    });
}

/**
 * Sample the paths of one robin and her courtesy-turn lark through a chain.
 * The robin's arrival is built from tangent lines and arcs: straight onto the
 * pull-by circle (clockwise), around it, then along the inner tangent onto the
 * courtesy-turn circle (counter-clockwise), so her path never has a corner.
 * All inputs are in pixels; returns normalized waypoints and their shared times.
 * @param {{x: number, y: number}} robinStart
 * @param {{x: number, y: number}} robinEnd
 * @param {{x: number, y: number}} larkPlace - Lark's place (start and end)
 * @param {{x: number, y: number}} setCenter - Center of the minor set
 * @param {number} beats
 * @returns {[Position[], Position[], number[]]}
 */
function courtesyTurnChainWaypoints(robinStart, robinEnd, larkPlace, setCenter, beats) {
    const add = (a, b, k = 1) => ({ x: a.x + k * b.x, y: a.y + k * b.y });
    const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
    const dot = (a, b) => a.x * b.x + a.y * b.y;
    const length = a => Math.hypot(a.x, a.y);
    const unit = a => { const l = length(a); return { x: a.x / l, y: a.y / l }; };
    const angleOf = a => Math.atan2(a.y, a.x);
    const onCircle = (angle, radius) => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    const fullTurn = 2 * Math.PI;
    const positiveAngle = a => ((a % fullTurn) + fullTurn) % fullTurn;
    // Direction of travel at an angle on a circle (y-down: clockwise = increasing angle)
    const clockwiseHeading = angle => ({ x: -Math.sin(angle), y: Math.cos(angle) });
    const counterClockwiseHeading = angle => ({ x: Math.sin(angle), y: -Math.cos(angle) });
    const smoothstep = x => x * x * (3 - 2 * x);

    // Courtesy turn pivot: just beside the lark, toward the robin's place and the
    // center, drifting a little further toward her place as they turn
    const larkToRobinEnd = sub(robinEnd, larkPlace);
    const endDirection = unit(larkToRobinEnd);
    const larkToCenter = sub(setCenter, larkPlace);
    const inward = unit(add(larkToCenter, endDirection, -dot(larkToCenter, endDirection)));
    const robinRadius = COURTESY_ROBIN_RADIUS_PX;
    const larkRadius = COURTESY_LARK_RADIUS_PX;
    const pullByRadius = CHAIN_PULL_BY_RADIUS_PX;
    let pivot = add(add(larkPlace, endDirection, COURTESY_PIVOT_START_FRACTION * length(larkToRobinEnd)),
        inward, COURTESY_PIVOT_START_INWARD_PX);
    // The pull-by and courtesy circles mustn't overlap, or there's no tangent between them
    const minPivotDistance = pullByRadius + robinRadius + 4;
    const pivotFromCenter = sub(pivot, setCenter);
    if (length(pivotFromCenter) < minPivotDistance) {
        pivot = add(setCenter, unit(pivotFromCenter), minPivotDistance);
    }
    const pivotEnd = add(larkPlace, endDirection, COURTESY_PIVOT_END_FRACTION * length(larkToRobinEnd));

    // 1. Straight from her start onto the pull-by circle, joining it clockwise
    const startFromCenter = sub(robinStart, setCenter);
    const tangentOffset = Math.acos(Math.min(1, pullByRadius / length(startFromCenter)));
    const pullByEntryAngle = [angleOf(startFromCenter) + tangentOffset, angleOf(startFromCenter) - tangentOffset]
        .find(angle => dot(clockwiseHeading(angle), sub(add(setCenter, onCircle(angle, pullByRadius)), robinStart)) > 0);
    const pullByEntry = add(setCenter, onCircle(pullByEntryAngle, pullByRadius));

    // 2. Leave the pull-by circle along the inner tangent that joins the courtesy
    // circle counter-clockwise: the pivot must lie on the left of the line, robinRadius away
    const tangentError = angle => {
        const from = add(setCenter, onCircle(angle, pullByRadius));
        const heading = clockwiseHeading(angle);
        return dot(sub(pivot, from), { x: heading.y, y: -heading.x }) - robinRadius;
    };
    const ahead = angle => dot(sub(pivot, add(setCenter, onCircle(angle, pullByRadius))), clockwiseHeading(angle)) > 0;
    let pullBySweep = null;
    const steps = 720;
    for (let k = 0; k < steps && pullBySweep === null; k++) {
        const a = pullByEntryAngle + fullTurn * k / steps;
        const b = pullByEntryAngle + fullTurn * (k + 1) / steps;
        if (tangentError(a) * tangentError(b) <= 0 && ahead(a)) {
            let lo = a, hi = b;
            for (let n = 0; n < 40; n++) {
                const m = (lo + hi) / 2;
                if (tangentError(lo) * tangentError(m) <= 0) hi = m; else lo = m;
            }
            pullBySweep = (lo + hi) / 2 - pullByEntryAngle;
        }
    }
    if (pullBySweep === null) {
        throw new Error('No path from the pull-by into the courtesy turn');
    }
    const pullByExitAngle = pullByEntryAngle + pullBySweep;
    const pullByExit = add(setCenter, onCircle(pullByExitAngle, pullByRadius));
    const exitHeading = clockwiseHeading(pullByExitAngle);
    const turnEntry = add(pullByExit, exitHeading, dot(sub(pivot, pullByExit), exitHeading));

    // 3. Courtesy turn: counter-clockwise from where she joins to facing in, with the
    // robin on the lark's right
    const turnStartAngle = angleOf(sub(turnEntry, pivot));
    const turnSweep = positiveAngle(turnStartAngle - angleOf(endDirection));

    // Arrival as a sequence of pieces, each a function of distance along it
    const pieces = [
        { length: length(sub(pullByEntry, robinStart)),
          at: d => add(robinStart, unit(sub(pullByEntry, robinStart)), d) },
        { length: pullBySweep * pullByRadius,
          at: d => add(setCenter, onCircle(pullByEntryAngle + d / pullByRadius, pullByRadius)) },
        { length: length(sub(turnEntry, pullByExit)),
          at: d => add(pullByExit, exitHeading, d) }
    ];
    const arrivalLength = pieces.reduce((sum, piece) => sum + piece.length, 0);
    const arrivalAt = fraction => {
        let d = fraction * arrivalLength;
        for (const piece of pieces) {
            if (d <= piece.length) return piece.at(d);
            d -= piece.length;
        }
        return turnEntry;
    };

    // The turn starts at her arrival pace and eases to a stop (the lark's cue that
    // the turn is over): Hermite profile with initial slope matched to that pace
    const arrivalBeats = CHAIN_ARRIVAL_END * beats;
    const turnBeats = (CHAIN_TURN_END - CHAIN_ARRIVAL_END) * beats;
    const arrivalSpeed = arrivalLength / arrivalBeats;
    const initialSlope = Math.min(3, arrivalSpeed * turnBeats / (turnSweep * robinRadius));
    const turnProgress = x => (x * x * x - 2 * x * x + x) * initialSlope + (3 * x * x - 2 * x * x * x);

    const larkTurnStart = add(pivot, onCircle(turnStartAngle, larkRadius), -1);
    const robinTurnEnd = add(pivotEnd, endDirection, robinRadius);
    const larkTurnEnd = add(pivotEnd, endDirection, -larkRadius);

    const robinWaypoints = [];
    const larkWaypoints = [];
    const times = [];
    const sampleCount = Math.max(16, Math.round(CHAIN_SAMPLES_PER_BEAT * beats));
    for (let k = 0; k <= sampleCount; k++) {
        const progress = k / sampleCount;
        let robin, lark;
        if (progress <= CHAIN_ARRIVAL_END) {
            // Robin crosses at a steady pace; lark steps up beside the pivot to meet her
            const x = progress / CHAIN_ARRIVAL_END;
            robin = arrivalAt(x);
            lark = add(larkPlace, sub(larkTurnStart, larkPlace), smoothstep(x));
        } else if (progress <= CHAIN_TURN_END) {
            // Rotate together about the pivot, the lark opposite the robin
            const x = (progress - CHAIN_ARRIVAL_END) / (CHAIN_TURN_END - CHAIN_ARRIVAL_END);
            const angle = turnStartAngle - turnSweep * turnProgress(x);
            const turnPivot = add(pivot, sub(pivotEnd, pivot), smoothstep(x));
            robin = add(turnPivot, onCircle(angle, robinRadius));
            lark = add(turnPivot, onCircle(angle, larkRadius), -1);
        } else {
            // Release: both ease out into their places
            const x = smoothstep((progress - CHAIN_TURN_END) / (1 - CHAIN_TURN_END));
            robin = add(robinTurnEnd, sub(robinEnd, robinTurnEnd), x);
            lark = add(larkTurnEnd, sub(larkPlace, larkTurnEnd), x);
        }
        robinWaypoints.push(fromPixels(robin.x, robin.y, SVG_WIDTH, SVG_HEIGHT));
        larkWaypoints.push(fromPixels(lark.x, lark.y, SVG_WIDTH, SVG_HEIGHT));
        times.push(progress);
    }

    // Land exactly on the places
    robinWaypoints[0] = fromPixels(robinStart.x, robinStart.y, SVG_WIDTH, SVG_HEIGHT);
    robinWaypoints[robinWaypoints.length - 1] = fromPixels(robinEnd.x, robinEnd.y, SVG_WIDTH, SVG_HEIGHT);
    larkWaypoints[0] = fromPixels(larkPlace.x, larkPlace.y, SVG_WIDTH, SVG_HEIGHT);
    larkWaypoints[larkWaypoints.length - 1] = fromPixels(larkPlace.x, larkPlace.y, SVG_WIDTH, SVG_HEIGHT);
    times[times.length - 1] = 1;

    return [robinWaypoints, larkWaypoints, times];
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
        dancerSet.formation,
        move.type,
        move.who || 'none',
        move.facing || '',
        move.beats || 8,
        move.progression ? 'prog' : 'noprog'
    ].join('|');

    // Include which dancer is in each place, and whether they're active. Positions
    // alone aren't enough: places are fixed, so every arrangement of dancers has the
    // same positions, and paths are keyed by dancer ID.
    const dancerKey = dancerSet.dancers
        .map(d => {
            const offset = dancerSet.offsets.get(d.id);
            const offsetKey = offset ? `@${offset.x.toFixed(3)},${offset.y.toFixed(3)}` : '';
            return `${d.id}${d.active ? '' : '*'}${offsetKey}`;
        })
        .join(',');

    return `${moveKey}::${dancerKey}${dancerSet.started ? '' : '::unstarted'}`;
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
 * Whether the progression marked on a move happens. A progression on the first move
 * of the dance doesn't happen the first time through: the dancers line up facing
 * their first neighbors.
 * @param {Object} move
 * @param {import('./dancers.js').Set} dancerSet - The set the move starts from
 * @returns {boolean}
 */
function progresses(move, dancerSet) {
    return Boolean(move.progression) && dancerSet.started;
}

/**
 * Execute a move on the set, recording exactly one undo snapshot: the set as it was
 * before the move
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Object} move
 */
export function executeMove(dancerSet, move) {
    const depth = dancerSet.snapshots.length;
    dancerSet.snapshot();
    executeMoveSteps(dancerSet, move);
    dancerSet.started = true;
    // Drop the snapshots the steps took along the way
    dancerSet.snapshots.length = depth + 1;
}

/**
 * Make the changes a move makes to the set
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Object} move
 */
function executeMoveSteps(dancerSet, move) {
    const type = move.type.toLowerCase();

    // Handle progression at the START of the move
    if (progresses(move, dancerSet)) {
        dancerSet.progress();
    }

    // Parse and execute the move
    if (!isMoveSupported(move, dancerSet)) {
        // Not modeled yet: the dancers stay where they are
    } else if (type === 'down the center') {
        dancerSet.downTheCenter(move.who, DOWN_THE_CENTER_PX);
    } else if (type === 'up the center') {
        dancerSet.upTheCenter(move.who, DOWN_THE_CENTER_PX);
    } else if (type === 'turn alone' || (type === 'balance' && COUPLES.includes(move.who))) {
        // Everyone ends where they started
    } else if (type === 'swing' && COUPLES.includes(move.who)) {
        dancerSet.swingInCenter(move.who, move.facing || 'down');
    } else if (type === 'cast off') {
        dancerSet.castOff(move.who);
    } else {
        // The rest of the figures end with everyone in their places
        dancerSet.clearOffsets();
        executePlaceFigure(dancerSet, move, type);
    }
}

/**
 * Execute a figure that ends with everyone standing in places
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Object} move
 * @param {string} type - The move type, in lowercase
 */
function executePlaceFigure(dancerSet, move, type) {
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
    } else if (type === 'half hey') {
        dancerSet.halfHey();
    } else if (type === 'right and left through') {
        dancerSet.rightAndLeftThrough();
    }
}
