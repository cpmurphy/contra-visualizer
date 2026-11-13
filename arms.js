// Where the dancers' arms are, seen from above. An arm goes from its shoulder to
// its hand, bending at the elbow (the way an elbow bends) and never longer than
// ARM_REACH_PX: two too far
// apart to hold hands reach for each other without touching. A free arm hangs
// at the dancer's side. All in pixels, with angles as in facing.js.

import { DANCER_RADIUS_PX } from './layout.js';

// From the middle of a dancer out to each shoulder, where the arm starts
export const SHOULDER_PX = DANCER_RADIUS_PX - 5;
// The furthest a hand goes from its shoulder
export const ARM_REACH_PX = 70;
// How far the elbow of an arm holding on sticks out as the hand comes closer
// than that, as a fraction of what it would if the arm were held level: from
// above, an elbow mostly bends downwards
const ELBOW_BEND = 0.3;
// Where a free hand hangs: this far out from the shoulder, and in front of it
const REST_OUT_PX = 3;
const REST_FORWARD_PX = 7;
// Dancers take right hands with someone in front of them, until that someone is
// this far round to their left (as a fraction of how far away they are)
const LEFT_HAND_FROM = -0.35;
// In a swing, how far out to the side the joined hands are held, and how far
// round the other's back the leader's hand goes
const SWING_HANDS_OUT_PX = 32;
const SWING_BACK_PX = 6;

/**
 * @typedef {Object} Arm
 * @property {'left'|'right'} side
 * @property {{x: number, y: number}} shoulder
 * @property {{x: number, y: number}} elbow - The control point of a curve from
 *   the shoulder to the hand (a quadratic Bezier), which bends towards it
 * @property {{x: number, y: number}} hand
 * @property {boolean} holding - Whether the hand is holding (or reaching for) another
 */

const SIDES = ['left', 'right'];
const other = side => (side === 'left' ? 'right' : 'left');
const middleOf = points => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
});

/**
 * A dancer's body: which way is forward and to their right, and their shoulders
 * @param {{x: number, y: number}} point - Where they are
 * @param {number} facing
 */
function bodyOf(point, facing) {
    const forward = { x: Math.cos(facing), y: Math.sin(facing) };
    const right = { x: -forward.y, y: forward.x }; // The canvas's y goes down
    const shoulder = sign => ({ x: point.x + sign * SHOULDER_PX * right.x, y: point.y + sign * SHOULDER_PX * right.y });
    return { point, forward, right, shoulders: { left: shoulder(-1), right: shoulder(1) } };
}

/**
 * Where a dancer's hand hangs when it's free
 */
function restingHand(body, side) {
    const out = side === 'right' ? REST_OUT_PX : -REST_OUT_PX;
    const shoulder = body.shoulders[side];
    return {
        x: shoulder.x + out * body.right.x + REST_FORWARD_PX * body.forward.x,
        y: shoulder.y + out * body.right.y + REST_FORWARD_PX * body.forward.y
    };
}

/**
 * Which hand a dancer gives to someone, or to hands joined somewhere: the one
 * on that side of them, and the right to someone straight ahead
 * @param {Object} body
 * @param {{x: number, y: number}} towards
 * @returns {'left'|'right'}
 */
export function handTowards(body, towards) {
    const dx = towards.x - body.point.x;
    const dy = towards.y - body.point.y;
    const toRight = dx * body.right.x + dy * body.right.y;
    return toRight >= LEFT_HAND_FROM * Math.hypot(dx, dy) ? 'right' : 'left';
}

/**
 * An arm from a shoulder to a hand, or as far towards it as the arm reaches
 * @param {Object} body
 * @param {'left'|'right'} side
 * @param {{x: number, y: number}} hand - Where the hand would be
 * @param {boolean} holding
 * @returns {Arm}
 */
function armTo(body, side, hand, holding) {
    const shoulder = body.shoulders[side];
    let dx = hand.x - shoulder.x;
    let dy = hand.y - shoulder.y;
    const length = Math.hypot(dx, dy) || 1;
    const reach = Math.min(length, ARM_REACH_PX);
    dx *= reach / length;
    dy *= reach / length;

    // An elbow only bends one way, the forearm folding in towards the front of
    // the upper arm: seen from above, going from the shoulder to the hand, a
    // right elbow is always on the right of the arm and a left elbow on the left.
    // (So it's behind an arm held out to the side, outside one held forward,
    // and in front of one reaching across the body.)
    const middle = { x: shoulder.x + dx / 2, y: shoulder.y + dy / 2 };
    const bend = holding ? ELBOW_BEND * Math.sqrt((ARM_REACH_PX / 2) ** 2 - (reach / 2) ** 2) : 0;
    const outward = side === 'right' ? 1 : -1;
    const across = { x: outward * -dy / reach, y: outward * dx / reach }; // The canvas's y goes down
    return {
        side,
        shoulder,
        elbow: { x: middle.x + bend * across.x, y: middle.y + bend * across.y },
        hand: { x: shoulder.x + dx, y: shoulder.y + dy },
        holding
    };
}

/**
 * Both arms of every dancer
 * @param {{id: string, point: {x: number, y: number}, facing: number}[]} dancers
 * @param {{ids: string[], shape?: string, hand?: 'left'|'right', strength: number}[]} [holds] -
 *   Dancers holding hands (see AnimationState.getCurrentHolds). Each reaches out
 *   as the hold gets stronger. With a `hand`, that's the hand they all give;
 *   otherwise each gives the hand on that side of them. In a swing the first
 *   of the two leads
 * @returns {Map<string, Arm[]>} By dancer id: the left arm, then the right
 */
export function dancerArms(dancers, holds = []) {
    const bodies = new Map(dancers.map(dancer => [dancer.id, bodyOf(dancer.point, dancer.facing)]));
    // By dancer id, what each hand is reaching for and how firmly it holds
    const reaching = new Map(dancers.map(dancer => [dancer.id, {}]));

    // The side a dancer's hand is on that's given towards a point: the one the
    // hold says, or the one on that side of them, or their other if that's taken
    const give = (id, towards, hand) => {
        const side = hand ?? handTowards(bodies.get(id), towards);
        return reaching.get(id)[side] ? other(side) : side;
    };
    const reach = (id, side, target, strength) => {
        if (!reaching.get(id)[side]) reaching.get(id)[side] = { target, strength };
    };
    // Two join hands half way between the shoulders of the hands they give
    const join = (a, b, strength, hand) => {
        const sideA = give(a, bodies.get(b).point, hand);
        const sideB = give(b, bodies.get(a).point, hand);
        const target = middleOf([bodies.get(a).shoulders[sideA], bodies.get(b).shoulders[sideB]]);
        reach(a, sideA, target, strength);
        reach(b, sideB, target, strength);
    };

    for (const hold of holds) {
        const ids = hold.ids.filter(id => bodies.has(id));
        if (hold.shape === 'swing') {
            if (ids.length === 2) swing(bodies.get(ids[0]), bodies.get(ids[1]), ids, hold.strength, reach);
        } else if (hold.shape === 'line' || hold.shape === 'ring') {
            ids.slice(1).forEach((id, i) => join(ids[i], id, hold.strength, hold.hand));
            if (hold.shape === 'ring' && ids.length > 2) join(ids[ids.length - 1], ids[0], hold.strength, hold.hand);
        } else if (ids.length > 1) {
            // All join hands in the middle, as in a star
            const hub = middleOf(ids.map(id => bodies.get(id).point));
            for (const id of ids) reach(id, give(id, hub, hold.hand), hub, hold.strength);
        }
    }

    return new Map(dancers.map(({ id }) => {
        const body = bodies.get(id);
        return [id, SIDES.map(side => {
            const rest = restingHand(body, side);
            const held = reaching.get(id)[side];
            if (!held) return armTo(body, side, rest, false);
            return armTo(body, side, {
                x: rest.x + (held.target.x - rest.x) * held.strength,
                y: rest.y + (held.target.y - rest.y) * held.strength
            }, true);
        })];
    }));
}

/**
 * Two in a swing: the leader's right hand is on the other's back and the other's
 * left on the leader's shoulder, and their other hands are joined out to the side
 */
function swing(leader, follower, [leaderId, followerId], strength, reach) {
    const back = follower.shoulders.left;
    reach(leaderId, 'right', {
        x: back.x - SWING_BACK_PX * follower.forward.x,
        y: back.y - SWING_BACK_PX * follower.forward.y
    }, strength);
    reach(followerId, 'left', leader.shoulders.right, strength);

    const between = middleOf([leader.point, follower.point]);
    const joined = {
        x: between.x - SWING_HANDS_OUT_PX * leader.right.x,
        y: between.y - SWING_HANDS_OUT_PX * leader.right.y
    };
    reach(leaderId, 'left', joined, strength);
    reach(followerId, 'right', joined, strength);
}
