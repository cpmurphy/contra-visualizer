// Which way each dancer faces, worked out from what they're doing as the dance is
// drawn, frame by frame: the paths say only where dancers are. Two swinging face
// each other until they open out side by side, the follower on the leader's
// right, a ring faces its middle, and anyone else faces the way they're
// going, unless that's nearly behind them, when they're backing up (as in the
// back of a forward and back). Someone standing still keeps facing as they were.
// Those turning around each other by the hand, as in an allemande or a star, face
// the way round, a little in towards the middle. A figure can say which way its
// dancers face instead, as a do-si-do does, or that they turn round on the spot,
// as in a turn alone.
// A couple out at the end of the set turn to face up or down the hall, towards
// the dancers they're waiting to join.
// Angles are in radians on the canvas: 0 faces right, and a quarter turn
// (Math.PI / 2) faces down the hall, away from the stage.

import { toPixels } from './positions.js';
import { SVG_WIDTH, SVG_HEIGHT, COLUMN_MIDPOINT_PX } from './layout.js';

// How far a dancer goes, in pixels, before we take the way they went as their
// direction: enough to tell from a wobble
const TRAVEL_STEP_PX = 4;
// Having opened out of a swing, how far they go before they take the way they're
// going as their direction: further, as they're still carried a little round
const OPENED_OUT_STEP_PX = 12;
// Going further than this off the way they face, they're backing up, not turning
const BACKING_UP_ANGLE = Math.PI * 0.6;
// Further than this in a frame is a jump to somewhere else, not dancing there
const JUMP_PX = 50;
// How quickly a dancer turns to face a new way: the time, in milliseconds, to
// make about two thirds of the turn
const TURN_MS = 120;
// The longest a frame counts for, so that a pause isn't a chance to turn
const MAX_FRAME_MS = 100;
// How far in from the way round those turning by the hand face, towards the hand
// they've given
const TURNING_INWARD_ANGLE = Math.PI / 6;

export const FACING_UP = -Math.PI / 2;
const FACING_DOWN = Math.PI / 2;

/**
 * The turn from one angle to another, the short way round
 * @param {number} from
 * @param {number} to
 * @returns {number} Between -PI and PI
 */
export function turnBetween(from, to) {
    const turn = (to - from) % (2 * Math.PI);
    if (turn > Math.PI) return turn - 2 * Math.PI;
    if (turn < -Math.PI) return turn + 2 * Math.PI;
    return turn;
}

/**
 * Which way a dancer faces with nothing else to go on: across the set, as in
 * the lines at the start of a dance, or up the hall from the middle of the set
 * @param {{x: number, y: number}} point - Where they are, in pixels
 * @returns {number}
 */
export function facingAcross(point) {
    if (Math.abs(point.x - COLUMN_MIDPOINT_PX) < 1) return FACING_UP;
    return point.x < COLUMN_MIDPOINT_PX ? 0 : Math.PI;
}

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const angleTo = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

/**
 * Follows the dancers from frame to frame, to say which way each is facing
 */
export class FacingTracker {
    constructor() {
        this.reset();
    }

    /** Forget the dancers, as for a new dance */
    reset() {
        this.dancers = new Map(); // By id: {angle, target, last, anchor}
        this.lastTime = null;
    }

    /**
     * Take in a frame, and say which way everyone is facing in it
     * @param {{id: string, position: import('./positions.js').Position, out?: boolean}[]} dancers -
     *   Those who are `out` at the ends of the set face the others
     * @param {{ids: string[], shape?: string}[]} [holds] - Dancers holding hands
     *   (see AnimationState.getCurrentHolds)
     * @param {number|null} [timestamp] - The frame's time in milliseconds while the
     *   dance plays. Without one the dancers are standing in their places: any
     *   who are somewhere new face across the set
     * @param {Map<string, number|{turn: {turn: number, toward: number}, turned: number}>} [told] -
     *   Which way the figure says dancers face, by id: an angle, or a turn on the
     *   spot (by `turn.turn`, starting towards the angle `turn.toward`) and how
     *   much of it they've made (see AnimationState.getCurrentFacings)
     * @returns {Map<string, number>} Angles by dancer id
     */
    update(dancers, holds = [], timestamp = null, told = new Map()) {
        const playing = timestamp !== null;
        const points = new Map(dancers.map(dancer =>
            [dancer.id, toPixels(dancer.position, SVG_WIDTH, SVG_HEIGHT)]));
        const { facings: held, openings } = facingInHolds(holds, points);
        // How far down the hall the middle of those dancing is, for those out to face
        const dancing = dancers.filter(dancer => !dancer.out).map(dancer => points.get(dancer.id).y);
        const middleY = dancing.reduce((sum, y) => sum + y, 0) / dancing.length;
        const out = new Set(dancers.filter(dancer => dancer.out).map(dancer => dancer.id));

        // How much of a turn towards their target the dancers make this frame
        let turned = 1;
        if (playing && this.lastTime !== null) {
            const elapsed = Math.min(Math.max(timestamp - this.lastTime, 0), MAX_FRAME_MS);
            turned = 1 - Math.exp(-elapsed / TURN_MS);
        }
        this.lastTime = timestamp;

        const facings = new Map();
        for (const [id, point] of points) {
            let dancer = this.dancers.get(id);
            const moved = dancer ? distance(dancer.last, point) : 0;
            if (!dancer || moved > (playing ? JUMP_PX : 1)) {
                const angle = facingAcross(point);
                dancer = { angle, target: angle, anchor: point };
                this.dancers.set(id, dancer);
            }
            dancer.last = point;

            const turning = told.get(id);
            if (typeof turning === 'object' && !held.has(id)) {
                // Turning round on the spot, from the way they faced when they began
                const begun = dancer.turn === turning.turn;
                if (!begun) {
                    dancer.turn = turning.turn;
                    dancer.turnFrom = dancer.angle;
                    dancer.turnSign = Math.sign(turnBetween(dancer.angle, turning.turn.toward)) || 1;
                }
                const target = dancer.turnFrom + dancer.turnSign * turning.turn.turn * turning.turned;
                if (begun) dancer.angle += turnBetween(dancer.target, target);
                dancer.target = target;
                dancer.anchor = point;
                dancer.held = false;
                dancer.angle += turnBetween(dancer.angle, dancer.target) * turned;
                facings.set(id, dancer.angle);
                continue;
            }
            dancer.turn = null;
            const wasHeld = dancer.held;
            dancer.held = held.has(id);
            // Letting go of a swing, they open out to face the same way
            const opening = dancer.opening;
            dancer.opening = openings.get(id);

            if (!dancer.held && opening !== undefined) {
                dancer.target = opening;
                dancer.anchor = point;
                dancer.step = OPENED_OUT_STEP_PX;
            } else if (held.has(id) || told.has(id)) {
                const target = held.get(id) ?? told.get(id);
                // Going round in a hold, they turn with it rather than lagging behind
                if (dancer.held && wasHeld) dancer.angle += turnBetween(dancer.target, target);
                dancer.target = target;
                dancer.anchor = point;
            } else if (out.has(id) && dancing.length > 0) {
                dancer.target = point.y < middleY ? FACING_DOWN : FACING_UP;
                dancer.anchor = point;
            } else if (distance(dancer.anchor, point) >= (dancer.step ?? TRAVEL_STEP_PX)) {
                const going = angleTo(dancer.anchor, point);
                if (Math.abs(turnBetween(dancer.target, going)) <= BACKING_UP_ANGLE) {
                    dancer.target = going;
                }
                dancer.anchor = point;
                dancer.step = TRAVEL_STEP_PX;
            }

            dancer.angle += turnBetween(dancer.angle, dancer.target) * turned;
            facings.set(id, dancer.angle);
        }
        return facings;
    }
}

/**
 * Which way the dancers in swings and rings face: at each other, or the middle;
 * and those turning around the middle by the hand: the way round, a little in.
 * Those in a swing open out when they let go, to face the way it says.
 * @param {{ids: string[], shape?: string, hand?: 'left'|'right', turning?: boolean, opening?: number}[]} holds
 * @param {Map<string, {x: number, y: number}>} points - Dancers' places in pixels
 * @returns {{facings: Map<string, number>, openings: Map<string, number>}} Angles
 *   by dancer id, for those dancers only: which way they face, and for those
 *   swinging, which way they'll face when they open out
 */
function facingInHolds(holds, points) {
    const facings = new Map();
    const openings = new Map();
    for (const hold of holds) {
        const around = hold.turning && hold.hand;
        if (hold.shape !== 'swing' && hold.shape !== 'ring' && !around) continue;
        const group = hold.ids.map(id => points.get(id));
        const middle = {
            x: group.reduce((sum, point) => sum + point.x, 0) / group.length,
            y: group.reduce((sum, point) => sum + point.y, 0) / group.length
        };
        // A right hand turn goes clockwise, seen from above: increasing angle, with y down
        const way = hold.hand === 'right' ? 1 : -1;
        hold.ids.forEach((id, i) => {
            if (distance(group[i], middle) === 0) return;
            const inward = angleTo(group[i], middle);
            facings.set(id, around ? inward + way * (TURNING_INWARD_ANGLE - Math.PI / 2) : inward);
            if (hold.shape === 'swing' && hold.opening !== undefined) openings.set(id, hold.opening);
        });
    }
    return { facings, openings };
}
