// Unit tests for which way the dancers face

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FacingTracker, FACING_UP, facingAcross, turnBetween } from '../facing.js';
import { fromPixels } from '../positions.js';
import { SVG_WIDTH, SVG_HEIGHT, COLUMN_MIDPOINT_PX } from '../layout.js';

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
