// A dance being performed: the set of dancers, where they've got to in the dance,
// and the paths they dance along. This is what the app shows and plays; what each
// move does to the set (moves.js) and the paths it takes (pathCalculator.js) are
// worked out behind it.

import { Set } from './dancers.js';
import { calculateMovePaths } from './pathCalculator.js';
import { executeMove, withSetState, pathCacheKey, isMoveSupported } from './moves.js';
import { createStationaryPath } from './paths.js';

/**
 * Start performing a dance, from the top
 * @param {Object} dance
 * @returns {DancePerformance|null} null if we can't lay out the dance's formation
 */
export function perform(dance) {
    return Set.FORMATIONS.includes(dance.formation) ? new DancePerformance(dance) : null;
}

/**
 * How a dancer looks at a moment: who they are, and where they are
 * @typedef {Object} DancerView
 * @property {string} id
 * @property {string} label - e.g. "L1"
 * @property {string} color - Their couple's color
 * @property {boolean} active - False while they're out at the end of the set, and
 *   standing in their place there rather than dancing
 * @property {import('./positions.js').Position} position
 */

export class DancePerformance {
    /**
     * @param {Object} dance - A dance in a formation the set can be laid out in
     */
    constructor(dance) {
        this.dance = dance;
        this.pathCache = new Map(); // Paths by move and arrangement of the set
        this.restart();
    }

    /**
     * Go back to the top of the dance, with everyone in their starting places
     */
    restart() {
        this.set = new Set(6, this.dance.formation);
        this.partIndex = 0;
        this.moveIndex = 0;
    }

    /** The move about to be danced (or being danced) */
    get currentMove() {
        return this.dance.parts[this.partIndex].moves[this.moveIndex];
    }

    /** Whether we're at the top of the dance, about to dance its first move */
    get atTop() {
        return this.partIndex === 0 && this.moveIndex === 0;
    }

    /**
     * Whether there's a move to go back to: there isn't before the first move
     * @returns {boolean}
     */
    get canGoBack() {
        return this.set.snapshots.length > 0;
    }

    /**
     * Whether a move of this dance is animated, or the dancers hold their places
     * @param {Object} move
     * @returns {boolean}
     */
    isSupported(move) {
        return isMoveSupported(move, this.set);
    }

    /**
     * Dance the current move, and go on to the next one, wrapping around to the top
     */
    next() {
        // The set keeps the history of every move danced, for going back
        executeMove(this.set, this.currentMove);

        const parts = this.dance.parts;
        if (this.moveIndex < parts[this.partIndex].moves.length - 1) {
            this.moveIndex++;
        } else {
            this.partIndex = (this.partIndex + 1) % parts.length;
            this.moveIndex = 0;
        }
    }

    /**
     * Go back to the move before, wrapping around to the end of the dance from the
     * top, as it was the time before. Before the first move, there's nothing to go
     * back to, and the performance stays where it is.
     */
    previous() {
        if (!this.canGoBack) return;
        this.set.undo();

        const parts = this.dance.parts;
        if (this.moveIndex > 0) {
            this.moveIndex--;
        } else {
            this.partIndex = (this.partIndex + parts.length - 1) % parts.length;
            this.moveIndex = parts[this.partIndex].moves.length - 1;
        }
    }

    /**
     * The paths of the current move, and of the move after it, for blending into
     * @returns {{current: Map<string, import('./paths.js').Path>, next: Map<string, import('./paths.js').Path>}}
     */
    paths() {
        const move = this.currentMove;
        return {
            current: this.movePaths(move, this.set),
            // Worked out from the set as it will be after this move
            next: withSetState(this.set, set => executeMove(set, move),
                set => this.movePaths(this.moveAfter(), set))
        };
    }

    /**
     * Paths for the dancers to wait in their places before the current move, and
     * that move's paths, to blend into
     * @param {number} beats - How long they wait
     * @returns {{current: Map<string, import('./paths.js').Path>, next: Map<string, import('./paths.js').Path>}}
     */
    waitingPaths(beats) {
        const next = this.movePaths(this.currentMove, this.set);
        const current = new Map([...next].map(([id, path]) =>
            [id, createStationaryPath(path.getPositionAtBeat(0), beats)]));
        return { current, next };
    }

    /**
     * The dancers, in reading order (left to right, top to bottom of the set)
     * @param {Map<string, import('./positions.js').Position>} [positions] - Where each
     *   dancer is part way through a move; otherwise they're where the set has them
     * @returns {DancerView[]}
     */
    dancers(positions = null) {
        const setPositions = this.set.getPositions();
        return this.set.dancers.map((dancer, index) => ({
            id: dancer.id,
            label: dancer.getLabel(),
            color: dancer.couple.color,
            active: dancer.active || (positions !== null && !positions.get(dancer.id).equals(setPositions[index])),
            position: positions ? positions.get(dancer.id) : setPositions[index]
        }));
    }

    /**
     * The move after the current one, wrapping around to the top of the dance
     * @returns {Object}
     */
    moveAfter() {
        const parts = this.dance.parts;
        const moves = parts[this.partIndex].moves;
        if (this.moveIndex < moves.length - 1) {
            return moves[this.moveIndex + 1];
        }
        return parts[(this.partIndex + 1) % parts.length].moves[0];
    }

    /**
     * Paths for a move from the given set state, using the cache when possible
     * @param {Object} move
     * @param {Set} set - The set state the move starts from
     * @returns {Map<string, import('./paths.js').Path>}
     */
    movePaths(move, set) {
        const key = pathCacheKey(move, set);
        let paths = this.pathCache.get(key);
        if (!paths) {
            paths = calculateMovePaths(move, set);
            this.pathCache.set(key, paths);
        }
        return paths;
    }
}
