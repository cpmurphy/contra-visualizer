// What each move does to the set: who ends up where. Animating the move (the
// dancers' paths along the way) is pathCalculator.js's job. Each figure is
// described in figures/catalog.js.

import { findFigure } from './figures/catalog.js';

/**
 * Whether a move is one we know how to execute and animate in the set's formation.
 * Figures we don't know yet (heys, casts, the ones-only figures of the old dances,
 * and so on) leave the dancers where they are rather than animating them wrongly.
 * @param {Object} move - The move object with type, who, etc.
 * @param {import('./dancers.js').Set} dancerSet - The set the move would be danced in
 * @returns {boolean}
 */
export function isMoveSupported(move, dancerSet) {
    return findFigure(move, dancerSet) !== null;
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
export function getPositionsById(dancerSet) {
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
 * Whether the progression marked on a move happens. A progression on the first move
 * of the dance doesn't happen the first time through: the dancers line up facing
 * their first neighbors.
 * @param {Object} move
 * @param {import('./dancers.js').Set} dancerSet - The set the move starts from
 * @returns {boolean}
 */
export function progresses(move, dancerSet) {
    return Boolean(move.progression) && dancerSet.started;
}

/**
 * Execute a move on the set, recording exactly one undo snapshot: the set as it was
 * before the move
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Object} move
 * @throws {Error} If the set can't dance the move (such as progressing without a
 *   couple at each end), leaving the set as it was
 */
export function executeMove(dancerSet, move) {
    const depth = dancerSet.snapshots.length;
    dancerSet.snapshot();
    try {
        executeMoveSteps(dancerSet, move);
    } catch (error) {
        // Leave the set as it was, history and all
        while (dancerSet.snapshots.length > depth) {
            dancerSet.undo();
        }
        throw error;
    }
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
    // The figure is worked out before the progression, which in Becket formation
    // moves everyone
    const figure = findFigure(move, dancerSet);

    // Handle progression at the START of the move
    if (progresses(move, dancerSet)) {
        dancerSet.progress();
    }

    // A figure we don't know yet leaves the dancers where they are
    if (!figure) return;
    if (figure.endsInPlaces) {
        dancerSet.clearOffsets();
    }
    figure.execute(dancerSet, figure.step);
}
