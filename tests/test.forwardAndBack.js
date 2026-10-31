// Unit tests for the figures in which dancers go forward and back: balances, long
// lines, and lines of four going down the hall and back

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { isMoveSupported, executeMove } from '../moves.js';
import { distance } from '../positions.js';
import { dances } from '../library.js';
import { hasNoOverlaps, allWaypointsInBounds } from './helpers/paths.js';
import { HALF_HEY, beforeHalfHey } from './helpers/sets.js';

// Balances

// Test balance move
test('balance should create stationary paths', () => {
    const set = new Set(4);
    const move = { type: 'balance', beats: 4 };

    const paths = calculateMovePaths(move, set);

    // Should have path for each dancer
    assert.strictEqual(paths.size, set.dancers.length);

    // All dancers should return to their starting position
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(path.end, 0.01),
            `Dancer ${dancer.id} should return to start after balance`);
    });

    // At midpoint, neighbor pairs should be closer together vertically
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        const midPos = path.getPositionAt(0.5);
        // X should not change (movement is purely vertical)
        assert(Math.abs(midPos.x - path.start.x) < 0.01,
            `Dancer ${dancer.id} should not move horizontally during balance`);
    });
});

test('balance paths should have correct beat duration', () => {
    const set = new Set(4);
    const move = { type: 'balance', beats: 4 };

    const paths = calculateMovePaths(move, set);

    paths.forEach((path, dancerId) => {
        assert.strictEqual(path.beats, 4, `Path for ${dancerId} should be 4 beats`);
    });
});

test('those balancing should hold hands', () => {
    const moves = [
        { type: 'balance', who: 'neighbor', beats: 4 },
        { type: 'balance', who: 'partner', beats: 4 },
        { type: 'balance', who: 'ones', beats: 4 }
    ];
    for (const move of moves) {
        const set = new Set(6);
        const paths = calculateMovePaths(move, set);
        const balancing = [...paths.keys()].filter(id => !paths.get(id).getWaypoints().every(p => p.equals(paths.get(id).start)));
        assert.deepStrictEqual(paths.holds.flatMap(hold => hold.ids).sort(), balancing.sort(),
            `${move.who} balance: everyone balancing should hold hands`);
        for (const hold of paths.holds) {
            assert.equal(hold.shape, 'line');
            assert.equal(hold.ids.length, 2);
            assert.equal(hold.from, 0.5);
            assert.equal(hold.to, 3.5);
        }
    }
});

test('partners should balance towards each other, on the side or across the set', () => {
    // After Hay in the Barn's first half hey, partners are on the same side
    const set = beforeHalfHey();
    executeMove(set, HALF_HEY);
    const paths = calculateMovePaths({ type: 'balance', who: 'partner', beats: 4 }, set);
    assert(hasNoOverlaps(paths), 'partner balance should have no overlaps');
    for (const i of set.minorSetStarts()) {
        for (const dancer of set.dancers.slice(i, i + 4)) {
            const path = paths.get(dancer.id);
            const partnerPath = paths.get(dancer.partner.id);
            assert(path.start.equals(path.end), 'a balance ends where it starts');
            const before = distance(path.start, partnerPath.start);
            const during = distance(path.getPositionAt(0.5), partnerPath.getPositionAt(0.5));
            assert(during < before - 1, `${dancer.getLabel()} should step towards their partner`);
        }
    }
    assert(isMoveSupported({ type: 'balance', who: 'partner', beats: 4 }, new Set(6, 'proper')));
});

// Long lines

// Test long lines move
test('long lines should approach center and retreat', () => {
    const set = new Set(4);
    const move = { type: 'long lines', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All dancers should end where they started
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(path.end, 0.01),
            `Dancer ${dancer.id} should return to start after long lines`);
    });

    // At midpoint (progress=0.5), dancers should be closer to center than at start
    const positions = set.getPositions();
    const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;

    set.dancers.forEach((dancer, index) => {
        const path = paths.get(dancer.id);
        const startPos = path.start;
        const midPos = path.getPositionAt(0.5);

        const startDistFromCenter = Math.abs(startPos.x - centerX);
        const midDistFromCenter = Math.abs(midPos.x - centerX);

        assert(midDistFromCenter < startDistFromCenter,
            `Dancer ${dancer.id} should be closer to center at midpoint`);
    });
});

test('long lines should come close to the other line', () => {
    const set = new Set(4);
    const paths = calculateMovePaths({ type: 'long lines', beats: 8 }, set);

    // Facing dancers in the top row end up nearly touching (40px diameter)
    const left = paths.get(set.dancers[0].id).getPositionAt(0.5);
    const right = paths.get(set.dancers[1].id).getPositionAt(0.5);
    const gapPx = (right.x - left.x) * 8; // 800px wide SVG
    assert(gapPx >= 40 && gapPx <= 55, `gap should be just over a dancer width (got ${gapPx.toFixed(1)}px)`);
});

test('long lines should hold hands all along each line', () => {
    const set = new Set(6);
    const paths = calculateMovePaths({ type: 'long lines', beats: 8 }, set);
    assert.equal(paths.holds.length, 2);
    const active = set.dancers.filter(d => d.active).map(d => d.id);
    const held = paths.holds.flatMap(hold => hold.ids);
    assert.deepStrictEqual([...held].sort(), [...active].sort(), 'everyone dancing should be in a line');
    for (const hold of paths.holds) {
        assert.equal(hold.shape, 'line');
        assert.equal(hold.from, 0.5);
        assert.equal(hold.to, 7.5);
        const xs = hold.ids.map(id => paths.get(id).start.x);
        const ys = hold.ids.map(id => paths.get(id).start.y);
        assert(xs.every(x => Math.abs(x - xs[0]) < 1), 'a line should be one side of the set');
        assert(ys.every((y, i) => i === 0 || y > ys[i - 1]), 'a line should be in order from top to bottom');
    }
});

// Lines of four

const AFTER_THE_FLU = dances.find(dance => dance.title === 'After the Flu.com');
const SWING_INTO_LINE = { type: 'swing', who: 'neighbor', beats: 8, facing: 'down' };
const DOWN_THE_HALL = { type: 'down the hall', who: 'all', beats: 6 };
const TURN_AS_COUPLES = { type: 'turn as couples', who: 'neighbor', beats: 2 };
const UP_THE_HALL = { type: 'up the hall', who: 'all', beats: 6 };
const BEND_THE_LINE = { type: 'bend the line', who: 'all', beats: 2 };

// The dancers of the first minor set across the hall, from the right side to the left
const lineFromTheRight = set => set.dancers.slice(0, 4)
    .map((dancer, index) => ({ label: dancer.getLabel(), position: set.getPositions()[index] }))
    .sort((a, b) => b.position.x - a.position.x);

test('a neighbor swing facing down should end in a line of four, neighbors side by side', () => {
    const set = new Set(6);
    const paths = calculateMovePaths(SWING_INTO_LINE, set);
    executeMove(set, SWING_INTO_LINE);
    const line = lineFromTheRight(set);
    assert.deepStrictEqual(line.map(dancer => dancer.label), ['L1', 'R2', 'L2', 'R1']);
    assert(line.every(dancer => Math.abs(dancer.position.y - line[0].position.y) < 0.01), 'should be in a row');
    const gaps = line.slice(1).map((dancer, k) => (line[k].position.x - dancer.position.x) * 8);
    assert(gaps.every(gap => gap >= 44), `should have room between them (got ${gaps})`);
    set.dancers.forEach((dancer, index) => {
        assert(paths.get(dancer.id).end.equals(set.getPositions()[index]), `${dancer.id} should end in the line`);
    });
});

test('a line of four should go down the hall and hold hands, without moving those waiting out', () => {
    const set = new Set(6);
    // After a progression, a couple waits out at each end
    for (const move of AFTER_THE_FLU.parts.flatMap(part => part.moves)) executeMove(set, move);
    executeMove(set, { type: 'circle left 4 places', who: 'all', beats: 8 });
    executeMove(set, SWING_INTO_LINE);

    const paths = calculateMovePaths(DOWN_THE_HALL, set);
    assert.equal(paths.holds.length, 2);
    for (const hold of paths.holds) {
        assert.equal(hold.shape, 'line');
        assert.equal(hold.ids.length, 4);
        const xs = hold.ids.map(id => paths.get(id).start.x);
        assert(xs.every((x, i) => i === 0 || x > xs[i - 1]), 'should hold hands in order along the line');
    }
    set.dancers.forEach((dancer, index) => {
        const path = paths.get(dancer.id);
        if (set.minorSetPlaces().includes(index)) {
            assert(path.end.y > path.start.y, `${dancer.id} should go down`);
            assert(Math.abs(path.end.x - path.start.x) < 0.01, `${dancer.id} should walk straight`);
        } else {
            assert(path.start.equals(path.end, 0.01), `${dancer.id} is waiting out`);
        }
    });
    assert(hasNoOverlaps(paths));
});

test('turning as couples should have the robin walk forward and the lark back up', () => {
    const set = new Set(6);
    executeMove(set, SWING_INTO_LINE);
    executeMove(set, DOWN_THE_HALL);
    const y = set.getPositions()[0].y;

    const paths = calculateMovePaths(TURN_AS_COUPLES, set);
    for (const dancer of set.dancers) {
        const { start } = paths.get(dancer.id);
        const halfway = paths.get(dancer.id).getPositionAt(0.5);
        assert(dancer.role === 'robin' ? halfway.y > start.y : halfway.y < start.y,
            `${dancer.id}: facing down the hall, forward is down`);
    }
    assert(hasNoOverlaps(paths));

    executeMove(set, TURN_AS_COUPLES);
    assert.deepStrictEqual(lineFromTheRight(set).map(dancer => dancer.label), ['R2', 'L1', 'R1', 'L2']);
    assert(Math.abs(set.getPositions()[0].y - y) < 0.01, 'should stay where they turned');
});

test('bending the line should put everyone back in their places, facing across', () => {
    const set = new Set(6);
    executeMove(set, SWING_INTO_LINE);
    const inLine = set.getPositions();
    executeMove(set, DOWN_THE_HALL);
    executeMove(set, TURN_AS_COUPLES);
    executeMove(set, UP_THE_HALL);
    assert(set.getPositions().every(position => inLine.some(p => Math.abs(p.y - position.y) < 0.01)),
        'should come back up to where they started');

    const paths = calculateMovePaths(BEND_THE_LINE, set);
    assert(hasNoOverlaps(paths));
    executeMove(set, BEND_THE_LINE);
    assert.equal(set.offsets.size, 0);
    assert.deepStrictEqual(set.dancers.slice(0, 4).map(dancer => dancer.getLabel()), ['L2', 'R2', 'R1', 'L1']);
});

test('a line of four needs a lark and a robin on each side of the minor set', () => {
    const proper = new Set(6, 'proper');
    assert.throws(() => proper.lineOfFour('down'), /line of four/);
});

test('turning alone together should stay clear of the couples crossing over at the ends', () => {
    const set = new Set(6);
    const moves = AFTER_THE_FLU.parts.flatMap(part => part.moves);
    for (const move of moves.slice(0, -1)) executeMove(set, move);
    const turnAlone = moves[moves.length - 1];
    assert.equal(turnAlone.type, 'turn alone');
    assert(hasNoOverlaps(calculateMovePaths(turnAlone, set)));
});

test('After the Flu.com should be animated up and down the set, without collisions', () => {
    const set = new Set(6);
    for (let round = 0; round < 12; round++) {
        for (const part of AFTER_THE_FLU.parts) {
            for (const move of part.moves) {
                const label = `${part.name} ${move.type} (round ${round + 1})`;
                assert(isMoveSupported(move, set), `${label}: animated`);
                const paths = calculateMovePaths(move, set);
                assert(allWaypointsInBounds(paths), `${label}: off the floor`);
                // Those swinging come closer together than anywhere else
                if (move.type !== 'swing') {
                    assert(hasNoOverlaps(paths), `${label}: overlaps`);
                }
                executeMove(set, move);
                set.dancers.forEach((dancer, index) => {
                    assert(paths.get(dancer.id).end.equals(set.getPositions()[index]), `${label}: ${dancer.id} end`);
                });
            }
        }
    }
});

test('After the Flu.com should dance with new neighbors each time through', () => {
    const set = new Set(6);
    const lark = set.dancerMap.get('d1');
    const neighbors = [];
    for (let round = 0; round < 3; round++) {
        // Neighbors start each time through in the same column of the minor set
        const index = set.dancers.indexOf(lark);
        const first = set.minorSetStarts().find(i => index >= i && index < i + 4);
        neighbors.push(set.dancers[first + (index - first + 2) % 4].id);
        for (const move of AFTER_THE_FLU.parts.flatMap(part => part.moves)) executeMove(set, move);
    }
    assert.equal(new globalThis.Set(neighbors).size, 3, `the first lark's neighbors: ${neighbors}`);
});
