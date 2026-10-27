// Unit tests for the figures in which dancers go forward and back: balances and
// long lines

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { isMoveSupported, executeMove } from '../moves.js';
import { distance } from '../positions.js';
import { hasNoOverlaps } from './helpers/paths.js';
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
