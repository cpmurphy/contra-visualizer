// Sets part way through a dance, and the moves that get them there, shared by the
// tests

import { Set } from '../../dancers.js';
import { executeMove } from '../../moves.js';

/** A proper set with the ones at the top of each minor set */
export function properSet() {
    return new Set(6, 'proper');
}

export const ONES_DOWN = { type: 'down the center', who: 'ones', beats: 4 };
export const ONES_TURN = { type: 'turn alone', who: 'ones', beats: 4 };
export const ONES_UP = { type: 'up the center', who: 'ones', beats: 4 };
export const ONES_CAST = { type: 'cast off', who: 'ones', beats: 4 };

export const HALF_HEY = { type: 'half hey', who: 'all', beats: 8 };

/** An improper set as Hay in the Barn has it for its first half hey: in each minor
 * set, the twos on the left (lark above robin) and the ones on the right */
export function beforeHalfHey() {
    const set = new Set(6);
    executeMove(set, { type: 'swing', who: 'neighbor', beats: 12 });
    executeMove(set, { type: 'chain to partner', who: 'robins', beats: 8 });
    return set;
}

/** Jefferson and Liberty's B2: a proper set after the ones cast off, the larks on the
 * left and the robins on the right */
export function afterCastOff() {
    const set = new Set(6, 'proper');
    for (const move of [ONES_DOWN, ONES_TURN, ONES_UP, ONES_CAST]) {
        executeMove(set, move);
    }
    return set;
}
