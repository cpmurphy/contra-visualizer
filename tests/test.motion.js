// Unit tests for the dancers' steps and leans

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepTracker, stepAt, leans, STEP_TWIST, LEAN_PX } from '../motion.js';
import { fromPixels } from '../positions.js';
import { SVG_WIDTH, SVG_HEIGHT } from '../layout.js';

const at = (id, x, y) => ({ id, position: fromPixels(x, y, SVG_WIDTH, SVG_HEIGHT) });
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('a step is down on the beat and up between beats', () => {
    assert.ok(close(stepAt(0).lift, 0) && close(stepAt(3).lift, 0));
    assert.ok(close(stepAt(0.5).lift, 1) && close(stepAt(7.5).lift, 1));
    assert.ok(stepAt(0.25).lift > 0 && stepAt(0.25).lift < 1);
});

test('the shoulders turn one way over one beat and the other over the next', () => {
    assert.ok(close(stepAt(0).twist, 0) && close(stepAt(1).twist, 0));
    assert.ok(close(stepAt(0.5).twist, STEP_TWIST));
    assert.ok(close(stepAt(1.5).twist, -STEP_TWIST));
});

/** Run a dancer along at a speed in pixels a second, and say how they step at a beat */
function stepping(tracker, speed, beat, { frames = 60, from = 0 } = {}) {
    let step;
    for (let frame = 0; frame <= frames; frame++) {
        const time = from + frame * 16;
        step = tracker.update([at('a', 300 + speed * time / 1000, 300)], time, beat).get('a');
    }
    return step;
}

test('a dancer on the move falls into step, and one standing does not', () => {
    const walking = stepping(new StepTracker(), 60, 0.5);
    assert.ok(walking.lift > 0.95 && walking.twist > 0.95 * STEP_TWIST, `in step, not ${walking.lift}`);
    assert.deepStrictEqual(stepping(new StepTracker(), 0, 0.5), { lift: 0, twist: 0 });
});

test('a dancer falls into step over several frames', () => {
    const { lift } = stepping(new StepTracker(), 60, 0.5, { frames: 5 });
    assert.ok(lift > 0.1 && lift < 0.9, `part way, not ${lift}`);
});

test('a dancer who stops comes to rest', () => {
    const tracker = new StepTracker();
    stepping(tracker, 60, 0.5);
    let step;
    for (let frame = 1; frame <= 60; frame++) {
        step = tracker.update([at('a', 357.6, 300)], 960 + frame * 16, 0.5).get('a');
    }
    assert.ok(step.lift < 0.05, `at rest, not ${step.lift}`);
});

test('nobody steps when the dance is not playing, or on jumping to a new place', () => {
    const tracker = new StepTracker();
    stepping(tracker, 60, 0.5);
    assert.deepStrictEqual(tracker.update([at('a', 500, 500)], null, 0.5).get('a'), { lift: 0, twist: 0 });

    const jumping = new StepTracker();
    jumping.update([at('a', 300, 300)], 0, 0.5);
    assert.deepStrictEqual(jumping.update([at('a', 300, 500)], 16, 0.5).get('a'), { lift: 0, twist: 0 });
});

test('two swinging lean away from each other, by how firmly they hold', () => {
    const dancers = [{ id: 'a', point: { x: 100, y: 100 } }, { id: 'b', point: { x: 146, y: 100 } },
        { id: 'c', point: { x: 300, y: 100 } }];
    const firm = leans(dancers, [{ ids: ['a', 'b'], shape: 'swing', strength: 1 }]);
    assert.ok(close(firm.get('a').x, -LEAN_PX) && close(firm.get('a').y, 0));
    assert.ok(close(firm.get('b').x, LEAN_PX));
    assert.equal(firm.has('c'), false);
    const joining = leans(dancers, [{ ids: ['a', 'b'], shape: 'swing', strength: 0.5 }]);
    assert.ok(close(joining.get('a').x, -LEAN_PX / 2));
});

test('those turning by a hand lean away, and those just holding hands do not', () => {
    const dancers = [{ id: 'a', point: { x: 100, y: 100 } }, { id: 'b', point: { x: 100, y: 150 } }];
    const allemande = leans(dancers, [{ ids: ['a', 'b'], shape: 'line', hand: 'left', strength: 1 }]);
    assert.ok(close(allemande.get('a').y, -LEAN_PX) && close(allemande.get('b').y, LEAN_PX));
    assert.equal(leans(dancers, [{ ids: ['a', 'b'], shape: 'line', strength: 1 }]).size, 0);
    assert.equal(leans(dancers, [{ ids: ['a', 'b'], shape: 'ring', strength: 1 }]).size, 0);
});
