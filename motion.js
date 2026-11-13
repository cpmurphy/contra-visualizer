// The small movements that make the dancers look alive: a step on every beat
// for those on the move, and leaning away from each other in a turn. Neither
// changes where a dancer is, only how they're drawn there. In pixels, with
// angles as in facing.js.

import { toPixels } from './positions.js';
import { SVG_WIDTH, SVG_HEIGHT } from './layout.js';

// Slower than this, in pixels a second, a dancer is standing rather than stepping
const STEPPING_SPEED = 15;
// How quickly a dancer falls into step or comes to rest: the time, in
// milliseconds, to get about two thirds of the way
const SETTLE_MS = 150;
// The longest a frame counts for (as in facing.js)
const MAX_FRAME_MS = 100;
// Further than this in a frame is a jump to somewhere else, not dancing there
const JUMP_PX = 50;
// How far the shoulders turn with each step, one way and then the other
export const STEP_TWIST = 7 * Math.PI / 180;
// How far the head leans away from the middle of a turn
export const LEAN_PX = 3;

/**
 * A dancer's step at a moment
 * @typedef {Object} Step
 * @property {number} lift - How far up they are between footfalls, from 0 (a
 *   foot landing, on the beat, or standing) to 1
 * @property {number} twist - How far their shoulders are turned from the way
 *   they face, towards the foot that's forward
 */

/**
 * How a dancer in full step is at a beat: down on the beat and up between
 * beats, their shoulders turning one way over one beat and back over the next
 * @param {number} beat - Beats into the music
 * @returns {Step}
 */
export function stepAt(beat) {
    return {
        lift: (1 - Math.cos(2 * Math.PI * beat)) / 2,
        twist: STEP_TWIST * Math.sin(Math.PI * beat)
    };
}

/**
 * Follows the dancers from frame to frame, to say who is stepping
 */
export class StepTracker {
    constructor() {
        this.reset();
    }

    /** Forget the dancers, as for a new dance */
    reset() {
        this.dancers = new Map(); // By id: {last, stepping}
        this.lastTime = null;
    }

    /**
     * Take in a frame, and say how everyone is stepping in it
     * @param {{id: string, position: import('./positions.js').Position}[]} dancers
     * @param {number|null} [timestamp] - The frame's time in milliseconds while
     *   the dance plays. Without one, everyone is standing
     * @param {number} [beat] - Beats into the music
     * @returns {Map<string, Step>} By dancer id
     */
    update(dancers, timestamp = null, beat = 0) {
        const elapsed = timestamp !== null && this.lastTime !== null
            ? Math.min(Math.max(timestamp - this.lastTime, 0), MAX_FRAME_MS)
            : 0;
        this.lastTime = timestamp;
        const inStep = stepAt(beat);

        const steps = new Map();
        for (const { id, position } of dancers) {
            const point = toPixels(position, SVG_WIDTH, SVG_HEIGHT);
            const dancer = this.dancers.get(id) ?? { last: point, stepping: 0 };
            this.dancers.set(id, dancer);
            if (timestamp === null) {
                dancer.stepping = 0;
            } else if (elapsed > 0) {
                const moved = Math.hypot(point.x - dancer.last.x, point.y - dancer.last.y);
                const moving = moved <= JUMP_PX && moved / elapsed * 1000 >= STEPPING_SPEED;
                dancer.stepping += ((moving ? 1 : 0) - dancer.stepping) * (1 - Math.exp(-elapsed / SETTLE_MS));
            }
            dancer.last = point;
            steps.set(id, { lift: inStep.lift * dancer.stepping, twist: inStep.twist * dancer.stepping });
        }
        return steps;
    }
}

/**
 * How far each dancer in a turn leans away from the middle of it: two in a
 * swing, and those turning by a hand (an allemande, a star, a pull by)
 * @param {{id: string, point: {x: number, y: number}}[]} dancers
 * @param {{ids: string[], shape?: string, hand?: string, strength: number}[]} [holds] -
 *   Dancers holding hands (see AnimationState.getCurrentHolds)
 * @returns {Map<string, {x: number, y: number}>} By dancer id, for those leaning
 */
export function leans(dancers, holds = []) {
    const points = new Map(dancers.map(dancer => [dancer.id, dancer.point]));
    const leaning = new Map();
    for (const hold of holds) {
        if (hold.shape !== 'swing' && !hold.hand) continue;
        const ids = hold.ids.filter(id => points.has(id));
        if (ids.length < 2) continue;
        const middle = {
            x: ids.reduce((sum, id) => sum + points.get(id).x, 0) / ids.length,
            y: ids.reduce((sum, id) => sum + points.get(id).y, 0) / ids.length
        };
        for (const id of ids) {
            const point = points.get(id);
            const away = Math.hypot(point.x - middle.x, point.y - middle.y);
            if (away === 0) continue;
            leaning.set(id, {
                x: LEAN_PX * hold.strength * (point.x - middle.x) / away,
                y: LEAN_PX * hold.strength * (point.y - middle.y) / away
            });
        }
    }
    return leaning;
}
