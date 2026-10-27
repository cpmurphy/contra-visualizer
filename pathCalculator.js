// Path calculator for dance moves
// Computes paths for each dancer during a move, using the paths for each family of
// figures in figures/

import { Position, center } from './positions.js';
import { createStraightPath, createStationaryPath, createArcPath } from './paths.js';
import { COUPLES, PARTNER_WHO, isMoveSupported, getPositionsById, withSetState, progresses, executeMove } from './moves.js';
import { createDoSiDoPaths, createCircularPaths, createStarPaths, addSwingPairPaths, createSwingPaths } from './figures/turns.js';
import { createHalfHeyPaths, createRightAndLeftThroughPaths, createRobinsChainPaths, createChainPaths } from './figures/crossings.js';
import { createContraCornersPaths, createReturnUpOutsidePaths, createCenterTravelPaths, createTurnAlonePaths, createCastOffPaths } from './figures/couples.js';
import { createBalancePaths, addBalancePairPaths, createLongLinesPaths } from './figures/forwardAndBack.js';

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
