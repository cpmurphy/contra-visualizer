// Unit tests for which way the dancers face

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FacingTracker, FACING_UP, facingAcross, turnBetween } from '../facing.js';
import { fromPixels, toPixels } from '../positions.js';
import { SVG_WIDTH, SVG_HEIGHT, COLUMN_MIDPOINT_PX } from '../layout.js';
import { Set as DancerSet } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { executeMove } from '../moves.js';
import { Animator, AnimationState } from '../animator.js';
import { properSet, ONES_DOWN, ONES_TURN, ONES_UP } from './helpers/sets.js';

const FACING_RIGHT = 0;
const FACING_DOWN = Math.PI / 2;
const FACING_LEFT = Math.PI;

const at = (id, x, y) => ({ id, position: fromPixels(x, y, SVG_WIDTH, SVG_HEIGHT) });

function assertFacing(actual, expected, message) {
    assert.ok(Math.abs(turnBetween(actual, expected)) < 0.05,
        `${message ?? 'facing'}: ${actual} is not ${expected}`);
}

/**
 * Walk a dancer through places, a frame at a time, and say where they end up facing
 */
function walk(tracker, id, places, holds = [], startTime = 0) {
    let facing;
    places.forEach(([x, y], frame) => {
        facing = tracker.update([at(id, x, y)], holds, startTime + frame * 16).get(id);
    });
    return facing;
}

const steps = (from, to, count = 60) => Array.from({ length: count + 1 }, (_, i) =>
    [from[0] + (to[0] - from[0]) * i / count, from[1] + (to[1] - from[1]) * i / count]);

test('turnBetween goes the short way round', () => {
    assert.ok(Math.abs(turnBetween(0.1, 2 * Math.PI - 0.1) + 0.2) < 1e-9);
    assert.ok(Math.abs(turnBetween(-3, 3) + (2 * Math.PI - 6)) < 1e-9);
    assert.equal(turnBetween(1, 1), 0);
});

test('dancers standing in their lines face across the set', () => {
    const facings = new FacingTracker().update([
        at('left', COLUMN_MIDPOINT_PX - 80, 300),
        at('right', COLUMN_MIDPOINT_PX + 80, 300),
        at('middle', COLUMN_MIDPOINT_PX, 300)
    ]);
    assertFacing(facings.get('left'), FACING_RIGHT);
    assertFacing(facings.get('right'), FACING_LEFT);
    assertFacing(facings.get('middle'), FACING_UP);
    assert.equal(facingAcross({ x: 0, y: 0 }), FACING_RIGHT);
});

test('a dancer turns to face the way they are going', () => {
    const tracker = new FacingTracker();
    assertFacing(walk(tracker, 'a', steps([300, 300], [300, 500])), FACING_DOWN);
});

test('a dancer turns over several frames, not at once', () => {
    const tracker = new FacingTracker();
    const facing = walk(tracker, 'a', steps([300, 300], [300, 306], 6));
    assert.ok(facing > 0.05 && facing < FACING_DOWN - 0.05, `part way round, not ${facing}`);
});

test('a dancer going back the way they came is backing up', () => {
    const tracker = new FacingTracker();
    const forward = steps([270, 300], [330, 300]);
    assertFacing(walk(tracker, 'a', forward), FACING_RIGHT);
    assertFacing(walk(tracker, 'a', forward.toReversed(), [], 1000), FACING_RIGHT, 'backing up');
});

test('a dancer standing still keeps facing as they were', () => {
    const tracker = new FacingTracker();
    walk(tracker, 'a', steps([300, 300], [300, 500]));
    assertFacing(walk(tracker, 'a', steps([300, 500], [300, 500]), [], 1000), FACING_DOWN);
});

test('two swinging face each other, and a ring faces its middle', () => {
    const tracker = new FacingTracker();
    const dancers = [at('a', 300, 300), at('b', 300, 340), at('c', 500, 300),
        at('d', 600, 300), at('e', 600, 400), at('f', 500, 400)];
    const holds = [
        { ids: ['a', 'b'], shape: 'swing', strength: 1 },
        { ids: ['c', 'd', 'e', 'f'], shape: 'ring', strength: 1 }
    ];
    let facings;
    for (let frame = 0; frame < 60; frame++) facings = tracker.update(dancers, holds, frame * 16);
    assertFacing(facings.get('a'), FACING_DOWN);
    assertFacing(facings.get('b'), FACING_UP);
    assertFacing(facings.get('c'), Math.PI / 4);
    assertFacing(facings.get('e'), -3 * Math.PI / 4);
});

test('dancers holding hands in a line face the way they are going', () => {
    const tracker = new FacingTracker();
    const holds = [{ ids: ['a', 'b'], shape: 'line', strength: 1 }];
    assertFacing(walk(tracker, 'a', steps([300, 300], [300, 500]), holds), FACING_DOWN);
});

test('a dancer put somewhere new while not playing faces across the set', () => {
    const tracker = new FacingTracker();
    walk(tracker, 'a', steps([300, 300], [300, 500]));
    const facing = tracker.update([at('a', COLUMN_MIDPOINT_PX + 80, 700)]).get('a');
    assertFacing(facing, FACING_LEFT);
});

test('those out at the ends of the set face the dancers, even while going to their places', () => {
    const tracker = new FacingTracker();
    const dancing = [at('a', 270, 400), at('b', 430, 400), at('c', 270, 520), at('d', 430, 520)];
    let facings;
    for (let frame = 0; frame <= 60; frame++) {
        // The couple at the top cross over as they wait; the one at the bottom stands
        facings = tracker.update([
            ...dancing,
            { ...at('top1', 270 + frame * 2, 280), out: true },
            { ...at('top2', 430 - frame * 2, 280), out: true },
            { ...at('bottom1', 270, 640), out: true },
            { ...at('bottom2', 430, 640), out: true }
        ], [], frame * 16);
    }
    assertFacing(facings.get('top1'), FACING_DOWN);
    assertFacing(facings.get('top2'), FACING_DOWN);
    assertFacing(facings.get('bottom1'), FACING_UP);
    assertFacing(facings.get('bottom2'), FACING_UP);
    assertFacing(facings.get('a'), FACING_RIGHT, 'those dancing still face across');

    // And at once when the dancers are put in their places, not playing
    const standing = new FacingTracker().update([...dancing, { ...at('top1', 270, 280), out: true }]);
    assertFacing(standing.get('top1'), FACING_DOWN);
});

test('a pause is not a chance to turn', () => {
    const tracker = new FacingTracker();
    tracker.update([at('a', 300, 300)], [], 0);
    // One step down, seen a long time later
    const facing = tracker.update([at('a', 300, 310)], [], 60000).get('a');
    assert.ok(facing < FACING_DOWN - 0.3, `still turning, not ${facing}`);
});

const MS_PER_BEAT = 600;
const FRAME_MS = 16;

/**
 * Dance moves from the set's places, a frame at a time, as the animation does,
 * and say which way everyone faces at the end of each move and each frame of it
 */
function danceMoves(tracker, set, moves) {
    const results = [];
    let time = 0;
    for (const move of moves) {
        const paths = calculateMovePaths(move, set);
        const frames = [];
        const state = new AnimationState(paths, new Animator(60000 / MS_PER_BEAT));
        state.start(time);
        for (let ms = 0; ms <= move.beats * MS_PER_BEAT; ms += FRAME_MS, time += FRAME_MS) {
            const dancers = [...state.getCurrentPositions(time)].map(([id, position]) => ({ id, position }));
            const facings = tracker.update(dancers, state.getCurrentHolds(time), time, state.getCurrentFacings(time));
            frames.push({ beat: ms / MS_PER_BEAT, paths, facings });
        }
        results.push(frames);
        executeMove(set, move);
    }
    return results;
}

test('the ones turn alone to face back up the hall, and walk up it forwards', () => {
    const tracker = new FacingTracker();
    const set = properSet();
    const ones = set.dancers.filter(dancer => dancer.couple.coupleNumber === 1).map(dancer => dancer.id);
    const [down, turning, up] = danceMoves(tracker, set, [ONES_DOWN, ONES_TURN, ONES_UP]);
    for (const id of ones) {
        assertFacing(down.at(-1).facings.get(id), FACING_DOWN, `${id} going down`);
        assertFacing(turning.at(-1).facings.get(id), FACING_UP, `${id} after turning alone`);
        for (const frame of up.slice(up.length / 4)) {
            assertFacing(frame.facings.get(id), FACING_UP, `${id} coming up at beat ${frame.beat}`);
        }
    }
    // Each turns in towards the other: half way round, the one on the left of the
    // hall faces right, and the one on the right faces left
    const half = turning[Math.floor(turning.length / 2)].facings;
    for (const id of ones) {
        const x = toPixels(turning[0].paths.get(id).start, SVG_WIDTH, SVG_HEIGHT).x;
        const inward = x < COLUMN_MIDPOINT_PX ? FACING_RIGHT : FACING_LEFT;
        assert.ok(Math.abs(turnBetween(half.get(id), inward)) < 0.5, `${id} turns in: ${half.get(id)}`);
    }
});

test('those turning alone at the end of a circle turn to face out of it', () => {
    const tracker = new FacingTracker();
    const set = new DancerSet(6);
    const [circle, turning] = danceMoves(tracker, set, [
        { type: 'circle left 4 places', who: 'all', beats: 8 },
        { type: 'turn alone', who: 'all', beats: 2 }]);
    for (const id of set.dancers.map(dancer => dancer.id)) {
        const before = circle.at(-1).facings.get(id);
        assertFacing(turning.at(-1).facings.get(id), before + Math.PI, `${id} after turning alone`);
    }
});

/**
 * The angle between which way a dancer faces and the way they're going, positive
 * when they face in towards a point on their right
 */
function facingOffTheWay(frame, id) {
    const path = frame.paths.get(id);
    const velocity = path.getVelocityAtBeat(frame.beat);
    return turnBetween(Math.atan2(velocity.y, velocity.x), frame.facings.get(id));
}

for (const [hand, move] of [
    ['right', { type: 'allemande right', who: 'shadows', beats: 8 }],
    ['left', { type: 'allemande left', who: 'shadows', beats: 8 }],
    ['right', { type: 'star right 4', who: 'all', beats: 8 }],
    ['left', { type: 'star left 4', who: 'all', beats: 8 }]]) {
    test(`those in a${move.type.startsWith('a') ? 'n' : ''} ${move.type} face the way round, a little in towards their ${hand} hand`, () => {
        const tracker = new FacingTracker();
        const set = new DancerSet(6, move.type.startsWith('allemande') ? 'becket' : 'improper');
        const [frames] = danceMoves(tracker, set, [move]);
        const middle = frames.slice(frames.length * 0.3, frames.length * 0.7);
        const turning = new Set(frames[0].paths.holds.flatMap(hold => hold.ids));
        assert.ok(turning.size >= 8);
        for (const id of turning) {
            for (const frame of middle) {
                const off = facingOffTheWay(frame, id) * (hand === 'right' ? 1 : -1);
                assert.ok(off > 0.2 && off < 0.8, `${id} at beat ${frame.beat.toFixed(2)}: ${off} off the way round`);
            }
        }
    });
}
