// What each move does to the set: who ends up where. Animating the move (the
// dancers' paths along the way) is pathCalculator.js's job.

// How far down the hall a couple goes down the center, and down the outside
const DOWN_THE_CENTER_PX = 120;
const DOWN_THE_OUTSIDE_PX = 180;

// Figures for one couple ('ones' or 'twos') to dance, in either formation
const COUPLE_FIGURES = ['down the center', 'up the center', 'turn alone', 'cast off', 'balance', 'swing',
    'down the outside', 'up the outside', 'turn contra corners'];
export const COUPLES = ['ones', 'twos'];

// "who" values that mean each dancer's neighbor (moves that don't say mean neighbors)
const NEIGHBOR_WHO = [undefined, null, 'neighbor', 'neighbors', 'new neighbor'];
export const PARTNER_WHO = ['partner', 'partners'];

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
    if (type === 'balance' && PARTNER_WHO.includes(who)) return true;
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
    } else if (type === 'down the outside') {
        dancerSet.downTheOutside(move.who, DOWN_THE_OUTSIDE_PX);
    } else if (type === 'up the outside') {
        dancerSet.upTheOutside(move.who);
    } else if (type === 'turn contra corners') {
        dancerSet.contraCorners(move.who);
    } else if (type === 'turn alone' || (type === 'balance' && (COUPLES.includes(move.who) || PARTNER_WHO.includes(move.who)))) {
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
