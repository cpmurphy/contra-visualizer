// Path calculator for dance moves
// Computes paths for each dancer during a move

import { Position, toPixels, fromPixels, distance, center } from './positions.js';
import { Path, createOutAndBackPath, createBezierPath, createStraightPath, createStationaryPath, createArcPath } from './paths.js';
import { COUPLES, PARTNER_WHO, isMoveSupported, getPositionsById, withSetState, progresses, executeMove } from './moves.js';
import { SVG_WIDTH, SVG_HEIGHT, DANCER_RADIUS_PX, VERTICAL_SPACING_PX, COLUMN_MIDPOINT_PX, TAKE_HANDS_BEATS } from './figures/shared.js';
import { createDoSiDoPaths, createCircularPaths, createStarPaths, addSwingPairPaths, createSwingPaths } from './figures/turns.js';
import { createHalfHeyPaths, createRightAndLeftThroughPaths, createRobinsChainPaths, createChainPaths } from './figures/crossings.js';

// Size of the little loop a dancer turning alone makes: narrow, since there's not
// much room between their partner and the line
const TURN_ALONE_ACROSS_PX = 5;
const TURN_ALONE_ALONG_PX = 10;
// How far outside the line a dancer casting off goes, and how far in the dancer
// they cast around steps to let them by
const CAST_OFF_OUTSIDE_PX = 35;
const CAST_OFF_PIVOT_INSIDE_PX = 25;

// Allemandes: how far apart the two turning are (twice the radius they turn at)
const ALLEMANDE_RADIUS_PX = 25;
// Contra corners, as fractions of the figure (sixteenths, for a 16-beat figure):
// when each dancer turning gets to the middle, finishes turning their partner, turns
// the first corner, is back in the middle, turns their partner again, turns the
// second corner, and is back in the middle
const CONTRA_CORNERS_TIMES = {
    middle: 1 / 16,
    partner: 3 / 16,
    firstCorner: [4 / 16, 6.5 / 16],
    backFromFirst: 7.5 / 16,
    partnerAgain: 9.5 / 16,
    secondCorner: [10.5 / 16, 13 / 16],
    backFromSecond: 14 / 16
};
// Waypoints per beat of contra corners
const CONTRA_CORNERS_SAMPLES_PER_BEAT = 8;

/**
 * Calculate paths for all dancers during a move. The map may also have a `holds`
 * property listing groups of dancers who join hands in the middle of them, as
 * {ids, from, to} with the beats of the move during which they hold on (see
 * createStarPaths).
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
    } else if (type === 'balance' && PARTNER_WHO.includes(move.who)) {
        // Partners balance towards each other, wherever they are in the minor set
        createPartnerPairPaths(dancerSet, startPosById, paths, beats, (lark, robin) =>
            addBalancePairPaths(lark, robin, startPosById, paths, beats));
    } else if (type === 'swing' && COUPLES.includes(move.who)) {
        // Partners in the couple swing in the middle of the set
        createCouplePairPaths(dancerSet, move.who, startPosById, paths, beats, (d1, d2, i) =>
            addSwingPairPaths(d1, d2, startPosById, endPosById, paths, beats));
    } else if (type === 'balance') {
        // Neighbor pairs approach each other vertically and retreat
        createBalancePaths(dancerSet, startPosById, paths, beats);
    } else if (type.includes('long lines')) {
        // Two lines approach each other and retreat
        createLongLinesPaths(dancerSet, startPosById, paths, beats);
    } else if (type.includes('circle left') || type.includes('circle right')) {
        // Circles - arc paths around minor set centers
        const isClockwise = type.includes('right');
        const places = parseInt(type.match(/circle (?:left|right) (\d+)/)[1]);
        createCircularPaths(dancerSet, startPosById, paths, beats, places, isClockwise);
    } else if (type.includes('star left') || type.includes('star right')) {
        // Stars - the four step in and turn close around the middle of the minor set
        const places = parseInt(type.match(/star (?:left|right) (\d+)/)[1]);
        createStarPaths(dancerSet, startPosById, endPosById, paths, beats, places, type.includes('right'));
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
    } else if (type === 'turn contra corners') {
        createContraCornersPaths(dancerSet, dancerSet.placesOf(move.who), startPosById, endPosById, paths, beats);
    } else if (type === 'up the outside') {
        createReturnUpOutsidePaths(dancerSet, startPosById, endPosById, paths, beats);
    } else if (type === 'down the center' || type === 'up the center' || type === 'down the outside') {
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
 * a little apart, and back, holding hands (added to paths.holds).
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
    paths.holds = [...(paths.holds || []),
        { ids: [d1.id, d2.id], shape: 'line', from: TAKE_HANDS_BEATS, to: beats - TAKE_HANDS_BEATS }];
}

/**
 * Create paths for partners dancing together in each minor set; everyone else
 * stands still
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {(lark: import('./dancers.js').Dancer, robin: import('./dancers.js').Dancer) => void} addPairPaths -
 *   Adds the paths for a lark and robin
 */
function createPartnerPairPaths(dancerSet, startPosById, paths, beats, addPairPaths) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });
    for (const i of dancerSet.minorSetStarts()) {
        const minorSet = dancerSet.dancers.slice(i, i + 4);
        for (const lark of minorSet.filter(dancer => dancer.role === 'lark')) {
            if (minorSet.includes(lark.partner)) {
                addPairPaths(lark, lark.partner);
            }
        }
    }
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
 * Create contra corners paths. Partners meet in the middle of the set at their row
 * and allemande right 5/8, which leaves each facing their first corner (on their
 * right diagonal); each goes to that corner and allemandes left once around, comes
 * back to the middle and allemandes right 3/4 with their partner to face their second
 * corner (on their left diagonal), allemandes left once around with them, and comes
 * back to the middle, crossed over. Allemandes right turn clockwise as seen from
 * above, with the music at the top, and lefts counter-clockwise. A corner turns once
 * around with the dancer turning them, and is back in place after; a corner off the
 * end of the set is imaginary. The two turning hold hands while they turn, added to
 * paths.holds.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {number[]} turning - Places of the dancers turning contra corners
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createContraCornersPaths(dancerSet, turning, startPosById, endPosById, paths, beats) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });
    const T = CONTRA_CORNERS_TIMES;
    const placesPx = dancerSet.getPlacePositions().map(p => toPixels(p, SVG_WIDTH, SVG_HEIGHT));
    const rowSpacing = placesPx.length > 2 ? placesPx[2].y - placesPx[0].y : VERTICAL_SPACING_PX;
    // Where a place would be, even off the end of the set
    const placeAt = index => index >= 0 && index < placesPx.length ? placesPx[index] : {
        x: placesPx[index % 2 === 0 ? 0 : 1].x,
        y: placesPx[0].y + Math.floor(index / 2) * rowSpacing
    };
    const point = (center, radius, angle) => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
    const samples = (from, to) => Math.max(2, Math.ceil((to - from) * beats * CONTRA_CORNERS_SAMPLES_PER_BEAT));
    // Clockwise (as seen from above) is increasing angle in y-down coordinates
    const CLOCKWISE = 1;
    const COUNTER_CLOCKWISE = -1;

    // Times at which each corner turns, with the center and starting angle of the turn
    const cornerTurns = new Map();
    // Two hold hands from one time to another
    const holds = [];
    const hold = (dancer1, dancer2, t0, t1) =>
        holds.push({ ids: [dancer1.id, dancer2.id], shape: 'line', from: t0 * beats, to: t1 * beats });

    for (const index of turning) {
        const dancer = dancerSet.dancers[index];
        const partnerIndex = dancerSet.dancers.indexOf(dancer.partner);
        if (!turning.includes(partnerIndex)) continue;
        const start = toPixels(startPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);
        const partnerStart = toPixels(startPosById.get(dancer.partner.id), SVG_WIDTH, SVG_HEIGHT);
        const middle = { x: (start.x + partnerStart.x) / 2, y: (start.y + partnerStart.y) / 2 };
        const fromMiddle = Math.atan2(start.y - middle.y, start.x - middle.x);
        const corners = dancerSet.contraCornersOf(index);

        const waypoints = [start];
        const times = [0];
        const add = (t, p) => { waypoints.push(p); times.push(t); };
        // Turn about a center from one time to another
        const turn = (center, radius, fromAngle, sweep, t0, t1) => {
            const count = samples(t0, t1);
            for (let k = 1; k <= count; k++) {
                const u = k / count;
                add(t0 + (t1 - t0) * u, point(center, radius, fromAngle + sweep * u));
            }
            return fromAngle + sweep;
        };
        // Allemande left once around a corner: go to them, turn, come back
        const turnCorner = (cornerIndex, [t0, t1], tBack) => {
            const from = waypoints[waypoints.length - 1];
            const corner = placeAt(cornerIndex);
            const distance = Math.hypot(corner.x - from.x, corner.y - from.y);
            const toward = { x: (corner.x - from.x) / distance, y: (corner.y - from.y) / distance };
            const turnCenter = { x: corner.x - toward.x * ALLEMANDE_RADIUS_PX, y: corner.y - toward.y * ALLEMANDE_RADIUS_PX };
            const angle = Math.atan2(-toward.y, -toward.x);
            add(t0, point(turnCenter, ALLEMANDE_RADIUS_PX, angle));
            turn(turnCenter, ALLEMANDE_RADIUS_PX, angle, COUNTER_CLOCKWISE * 2 * Math.PI, t0, t1);
            add(tBack, from);
            const cornerDancer = dancerSet.dancers[cornerIndex];
            if (cornerDancer) {
                const list = cornerTurns.get(cornerDancer) || [];
                list.push({ t0, t1, center: turnCenter, angle: angle + Math.PI });
                cornerTurns.set(cornerDancer, list);
                hold(dancer, cornerDancer, t0, t1);
            }
        };

        // Into the middle, and allemande right 5/8 with partner
        add(T.middle, point(middle, ALLEMANDE_RADIUS_PX, fromMiddle));
        const facingFirst = turn(middle, ALLEMANDE_RADIUS_PX, fromMiddle, CLOCKWISE * 5 / 8 * 2 * Math.PI,
            T.middle, T.partner);
        turnCorner(corners.first, T.firstCorner, T.backFromFirst);
        // Allemande right 3/4 with partner
        turn(middle, ALLEMANDE_RADIUS_PX, facingFirst, CLOCKWISE * 3 / 4 * 2 * Math.PI, T.backFromFirst, T.partnerAgain);
        turnCorner(corners.second, T.secondCorner, T.backFromSecond);
        if (index < partnerIndex) {
            hold(dancer, dancer.partner, T.middle, T.partner);
            hold(dancer, dancer.partner, T.backFromFirst, T.partnerAgain);
        }
        // Back to the middle, crossed over
        add(1, toPixels(endPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT));

        const normalized = waypoints.map(p => fromPixels(p.x, p.y, SVG_WIDTH, SVG_HEIGHT));
        normalized[normalized.length - 1] = endPosById.get(dancer.id).clone();
        paths.set(dancer.id, new Path(normalized, beats, times));
    }

    // Each corner turns once around with each dancer who turns them
    for (const [corner, turns] of cornerTurns) {
        const start = toPixels(startPosById.get(corner.id), SVG_WIDTH, SVG_HEIGHT);
        const waypoints = [start];
        const times = [0];
        for (const { t0, t1, center, angle } of turns.sort((a, b) => a.t0 - b.t0)) {
            waypoints.push(start);
            times.push(t0);
            const count = samples(t0, t1);
            for (let k = 1; k <= count; k++) {
                waypoints.push(point(center, ALLEMANDE_RADIUS_PX, angle + COUNTER_CLOCKWISE * 2 * Math.PI * k / count));
                times.push(t0 + (t1 - t0) * k / count);
            }
        }
        waypoints.push(start);
        times.push(1);
        const normalized = waypoints.map(p => fromPixels(p.x, p.y, SVG_WIDTH, SVG_HEIGHT));
        normalized[0] = startPosById.get(corner.id).clone();
        normalized[normalized.length - 1] = startPosById.get(corner.id).clone();
        paths.set(corner.id, new Path(normalized, beats, times));
    }

    paths.holds = holds;
}

/**
 * Create paths for dancers coming back up the outside of the set to their places:
 * up the outside, then in to their places.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createReturnUpOutsidePaths(dancerSet, startPosById, endPosById, paths, beats) {
    dancerSet.dancers.forEach(dancer => {
        const start = startPosById.get(dancer.id);
        const end = endPosById.get(dancer.id);
        if (start.equals(end, 0.01)) {
            paths.set(dancer.id, createStationaryPath(start, beats));
        } else {
            paths.set(dancer.id, createBezierPath([
                start,
                new Position(start.x, (start.y + end.y) / 2),
                new Position(start.x, end.y),
                end
            ], beats));
        }
    });
}

/**
 * Create paths for dancers going down or coming up the center, or going down the
 * outside: they move across into the lane they travel along first (if they aren't
 * in it already), then along it.
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
 * up on the inside if they need to move up. The two hold near hands as they go
 * around each other, added to paths.holds.
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

    // Each caster with the dancer on their side in their minor set, if they trade places
    const holds = [];
    for (const i of dancerSet.minorSetStarts()) {
        for (const column of [0, 1]) {
            const [upper, lower] = [i + column, i + 2 + column];
            const castingIndex = [upper, lower].find(index => casting.includes(index));
            if (castingIndex === undefined) continue;
            const caster = dancerSet.dancers[castingIndex];
            const pivot = dancerSet.dancers[castingIndex === upper ? lower : upper];
            if (startPosById.get(caster.id).equals(endPosById.get(caster.id), 0.01)) continue;
            holds.push({ ids: [caster.id, pivot.id], shape: 'line', from: TAKE_HANDS_BEATS, to: beats - TAKE_HANDS_BEATS });
        }
    }
    paths.holds = holds;
}

/**
 * Create long lines paths - two vertical lines approach each other and retreat.
 * Dancers move horizontally toward the center line, then return to their starting position.
 * Each line holds hands all the way along, added to paths.holds.
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

    // Those out at the ends stand still, so only those dancing join the lines
    const active = dancerSet.dancers.filter(d => d.active);
    const lines = [
        active.filter(d => startPosById.get(d.id).x < centerX),
        active.filter(d => startPosById.get(d.id).x >= centerX)
    ];
    paths.holds = lines
        .filter(line => line.length > 1)
        .map(line => ({
            ids: line
                .sort((a, b) => startPosById.get(a.id).y - startPosById.get(b.id).y)
                .map(d => d.id),
            shape: 'line',
            from: TAKE_HANDS_BEATS,
            to: beats - TAKE_HANDS_BEATS
        }));
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
