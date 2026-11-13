// Unit tests for where the dancers' arms are

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dancerArms, ARM_REACH_PX, SHOULDER_PX } from '../arms.js';

const FACING_RIGHT = 0;
const FACING_DOWN = Math.PI / 2;
const FACING_LEFT = Math.PI;
const FACING_UP = -Math.PI / 2;

const dancer = (id, x, y, facing) => ({ id, point: { x, y }, facing });
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const near = (a, b) => distance(a, b) < 1e-6;

/** A dancer's arms by side */
function armsOf(arms, id) {
    const [left, right] = arms.get(id);
    assert.equal(left.side, 'left');
    assert.equal(right.side, 'right');
    return { left, right };
}

test('shoulders are to either side of the way a dancer faces', () => {
    const up = armsOf(dancerArms([dancer('a', 100, 100, FACING_UP)]), 'a');
    assert.ok(near(up.left.shoulder, { x: 100 - SHOULDER_PX, y: 100 }));
    assert.ok(near(up.right.shoulder, { x: 100 + SHOULDER_PX, y: 100 }));
    const down = armsOf(dancerArms([dancer('a', 100, 100, FACING_DOWN)]), 'a');
    assert.ok(near(down.right.shoulder, { x: 100 - SHOULDER_PX, y: 100 }));
});

test('free arms hang at the sides, a little in front', () => {
    const { left, right } = armsOf(dancerArms([dancer('a', 100, 100, FACING_UP)]), 'a');
    for (const arm of [left, right]) {
        assert.equal(arm.holding, false);
        assert.ok(distance(arm.shoulder, arm.hand) < 10);
        assert.ok(arm.hand.y < 100, 'in front of them');
    }
    assert.ok(left.hand.x < left.shoulder.x && right.hand.x > right.shoulder.x, 'out from the shoulders');
});

test('two side by side join the hands between them', () => {
    const arms = dancerArms(
        [dancer('a', 100, 100, FACING_UP), dancer('b', 180, 100, FACING_UP)],
        [{ ids: ['a', 'b'], shape: 'line', strength: 1 }]);
    const a = armsOf(arms, 'a');
    const b = armsOf(arms, 'b');
    assert.ok(a.right.holding && b.left.holding);
    assert.ok(!a.left.holding && !b.right.holding);
    assert.ok(near(a.right.hand, b.left.hand));
    assert.ok(near(a.right.hand, { x: 140, y: 100 }));
});

test('two facing each other take right hands', () => {
    const arms = dancerArms(
        [dancer('a', 100, 100, FACING_DOWN), dancer('b', 100, 160, FACING_UP)],
        [{ ids: ['a', 'b'], shape: 'line', strength: 1 }]);
    const a = armsOf(arms, 'a');
    const b = armsOf(arms, 'b');
    assert.ok(a.right.holding && b.right.holding && !a.left.holding && !b.left.holding);
    assert.ok(near(a.right.hand, b.right.hand));
});

test('a hold with a hand has everyone give that hand', () => {
    const dancers = [dancer('a', 100, 100, FACING_DOWN), dancer('b', 100, 160, FACING_UP)];
    const arms = dancerArms(dancers, [{ ids: ['a', 'b'], shape: 'line', hand: 'left', strength: 1 }]);
    assert.ok(armsOf(arms, 'a').left.holding && armsOf(arms, 'b').left.holding);
    assert.ok(!armsOf(arms, 'a').right.holding);
});

test('an arm never stretches past its reach', () => {
    const arms = dancerArms(
        [dancer('a', 100, 100, FACING_UP), dancer('b', 500, 100, FACING_UP)],
        [{ ids: ['a', 'b'], shape: 'line', strength: 1 }]);
    const a = armsOf(arms, 'a').right;
    const b = armsOf(arms, 'b').left;
    assert.ok(Math.abs(distance(a.shoulder, a.hand) - ARM_REACH_PX) < 1e-6);
    assert.ok(a.hand.x > a.shoulder.x, 'reaching towards the other');
    assert.ok(distance(a.hand, b.hand) > 100, 'without touching');
    assert.ok(near(a.elbow, { x: (a.shoulder.x + a.hand.x) / 2, y: 100 }), 'straight at full reach');
});

test('the elbow bends out as the hand comes close', () => {
    const arms = dancerArms(
        [dancer('a', 100, 100, FACING_UP), dancer('b', 150, 100, FACING_UP)],
        [{ ids: ['a', 'b'], shape: 'line', strength: 1 }]);
    const { shoulder, elbow, hand } = armsOf(arms, 'a').right;
    assert.ok(Math.abs(elbow.x - (shoulder.x + hand.x) / 2) < 1e-6);
    assert.ok(Math.abs(elbow.y - 100) > 5, `bent, not ${elbow.y}`);
});

/** Whether an arm's elbow is to the right of the way from its shoulder to its hand (the canvas's y goes down) */
function elbowOnRight({ shoulder, elbow, hand }) {
    return (hand.x - shoulder.x) * (elbow.y - shoulder.y) - (hand.y - shoulder.y) * (elbow.x - shoulder.x) > 0;
}

test('an elbow bends only the way elbows do, wherever the hand is', () => {
    // One dancer facing up, holding hands with another put all around them, near and far
    for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 12) {
        for (const away of [30, 60, 90]) {
            for (const hand of ['left', 'right']) {
                const arms = dancerArms(
                    [dancer('a', 100, 100, FACING_UP), dancer('b', 100 + away * Math.cos(angle), 100 + away * Math.sin(angle), FACING_DOWN)],
                    [{ ids: ['a', 'b'], shape: 'line', hand, strength: 1 }]);
                const arm = armsOf(arms, 'a')[hand];
                // At full reach the arm is straight, and its elbow is on neither side;
                // nor is it with the hand at the shoulder
                const length = distance(arm.shoulder, arm.hand);
                if (length > ARM_REACH_PX - 1 || length < 1) continue;
                assert.equal(elbowOnRight(arm), hand === 'right', `${hand} arm towards ${angle}, ${away} away`);
            }
        }
    }
});

test('the elbows of dancers in a line are behind them, and stay there as their shoulders turn', () => {
    for (const twist of [-0.12, -0.01, 0, 0.01, 0.12]) {
        const arms = dancerArms(
            [dancer('a', 100, 100, FACING_UP + twist), dancer('b', 190, 100, FACING_UP + twist), dancer('c', 280, 100, FACING_UP + twist)],
            [{ ids: ['a', 'b', 'c'], shape: 'line', strength: 1 }]);
        for (const arm of [armsOf(arms, 'a').right, armsOf(arms, 'b').left, armsOf(arms, 'b').right, armsOf(arms, 'c').left]) {
            assert.ok(arm.elbow.y > (arm.shoulder.y + arm.hand.y) / 2 + 1, `behind, with a twist of ${twist}`);
        }
    }
});

test('a hand reaches out as the hold gets stronger', () => {
    const dancers = [dancer('a', 100, 100, FACING_UP), dancer('b', 180, 100, FACING_UP)];
    const reachAt = strength => {
        const { shoulder, hand } = armsOf(dancerArms(dancers, [{ ids: ['a', 'b'], shape: 'line', strength }]), 'a').right;
        return distance(shoulder, hand);
    };
    assert.ok(reachAt(0.1) < reachAt(0.5) && reachAt(0.5) < reachAt(1));
});

test('the middle of a line gives a hand to each side, and a ring joins its ends', () => {
    const dancers = [dancer('a', 100, 100, FACING_UP), dancer('b', 160, 100, FACING_UP), dancer('c', 220, 100, FACING_UP)];
    const line = dancerArms(dancers, [{ ids: ['a', 'b', 'c'], shape: 'line', strength: 1 }]);
    const b = armsOf(line, 'b');
    assert.ok(near(b.left.hand, armsOf(line, 'a').right.hand));
    assert.ok(near(b.right.hand, armsOf(line, 'c').left.hand));
    assert.ok(!armsOf(line, 'a').left.holding && !armsOf(line, 'c').right.holding);

    // Four facing the middle of a square
    const square = [dancer('a', 100, 100, Math.PI / 4), dancer('b', 180, 100, 3 * Math.PI / 4),
        dancer('c', 180, 180, -3 * Math.PI / 4), dancer('d', 100, 180, -Math.PI / 4)];
    const ring = dancerArms(square, [{ ids: ['a', 'b', 'c', 'd'], shape: 'ring', strength: 1 }]);
    for (const [id, next] of [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]) {
        assert.ok(near(armsOf(ring, id).left.hand, armsOf(ring, next).right.hand), `${id} and ${next}`);
    }
});

test('a star joins hands in the middle', () => {
    const dancers = [dancer('a', 100, 60, FACING_LEFT), dancer('b', 140, 100, FACING_UP),
        dancer('c', 100, 140, FACING_RIGHT), dancer('d', 60, 100, FACING_DOWN)];
    const arms = dancerArms(dancers, [{ ids: ['a', 'b', 'c', 'd'], hand: 'left', strength: 1 }]);
    for (const { id } of dancers) {
        const { left, right } = armsOf(arms, id);
        assert.ok(near(left.hand, { x: 100, y: 100 }), id);
        assert.ok(!right.holding);
    }
});

test('in a swing the leader holds the other\'s back, and their other hands join out to the side', () => {
    const arms = dancerArms(
        [dancer('lark', 100, 100, FACING_RIGHT), dancer('robin', 146, 100, FACING_LEFT)],
        [{ ids: ['lark', 'robin'], shape: 'swing', strength: 1 }]);
    const lark = armsOf(arms, 'lark');
    const robin = armsOf(arms, 'robin');
    assert.ok(near(lark.left.hand, robin.right.hand), 'joined hands');
    assert.ok(lark.left.hand.y < 80, 'out to the lark\'s left');
    assert.ok(lark.right.hand.x > 146, 'around the robin\'s back');
    assert.ok(near(robin.left.hand, lark.right.shoulder), 'on the lark\'s shoulder');
});
