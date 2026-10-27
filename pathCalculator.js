// Path calculator for dance moves
// Computes paths for each dancer during a move

import { Position, toPixels, center } from './positions.js';
import { createOutAndBackPath, createStraightPath, createStationaryPath, createArcPath } from './paths.js';
import { COUPLES, PARTNER_WHO, isMoveSupported, getPositionsById, withSetState, progresses, executeMove } from './moves.js';
import { SVG_WIDTH, SVG_HEIGHT, DANCER_RADIUS_PX, TAKE_HANDS_BEATS } from './figures/shared.js';
import { createDoSiDoPaths, createCircularPaths, createStarPaths, addSwingPairPaths, createSwingPaths } from './figures/turns.js';
import { createHalfHeyPaths, createRightAndLeftThroughPaths, createRobinsChainPaths, createChainPaths } from './figures/crossings.js';
import { createContraCornersPaths, createReturnUpOutsidePaths, createCenterTravelPaths, createTurnAlonePaths, createCastOffPaths } from './figures/couples.js';

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
