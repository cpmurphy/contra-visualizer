// Timing and helpers shared by the figures (their layout is in layout.js)

import { createStationaryPath } from '../paths.js';

// Long lines, circles, balances and casts: how long the dancers take to join hands with those beside
// them as they start, and to let go as they finish
export const TAKE_HANDS_BEATS = 0.5;

/**
 * Have everyone stand in place for the figure, before the paths of those dancing
 * it replace theirs
 * @param {import('../dancers.js').Set} dancerSet
 * @param {Map<string, import('../positions.js').Position>} startPosById
 * @param {Map<string, import('../paths.js').Path>} paths
 * @param {number} beats
 */
export function standStill(dancerSet, startPosById, paths, beats) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });
}

/**
 * Create paths for partners dancing together in each minor set; everyone else
 * stands still
 * @param {import('../dancers.js').Set} dancerSet
 * @param {Map<string, import('../positions.js').Position>} startPosById
 * @param {Map<string, import('../paths.js').Path>} paths
 * @param {number} beats
 * @param {(lark: import('../dancers.js').Dancer, robin: import('../dancers.js').Dancer) => void} addPairPaths -
 *   Adds the paths for a lark and robin
 */
export function createPartnerPairPaths(dancerSet, startPosById, paths, beats, addPairPaths) {
    standStill(dancerSet, startPosById, paths, beats);
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
 * @param {import('../dancers.js').Set} dancerSet
 * @param {string} who - 'ones' or 'twos'
 * @param {Map<string, import('../positions.js').Position>} startPosById
 * @param {Map<string, import('../paths.js').Path>} paths
 * @param {number} beats
 * @param {(lark: import('../dancers.js').Dancer, robin: import('../dancers.js').Dancer, i: number) => void} addPairPaths -
 *   Adds the paths for a lark and robin, given the first place of their minor set
 */
export function createCouplePairPaths(dancerSet, who, startPosById, paths, beats, addPairPaths) {
    standStill(dancerSet, startPosById, paths, beats);
    const places = dancerSet.placesOf(who);
    for (const i of dancerSet.minorSetStarts()) {
        const lark = dancerSet.dancers.slice(i, i + 4).find((dancer, j) =>
            dancer.role === 'lark' && places.includes(i + j));
        if (lark && places.includes(dancerSet.dancers.indexOf(lark.partner))) {
            addPairPaths(lark, lark.partner, i);
        }
    }
}
