// Unit tests for path calculator

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { executeMove } from '../moves.js';
import { allWaypointsInBounds, hasNoOverlaps } from './helpers/paths.js';
import { toPixels } from '../positions.js';
import { SVG_WIDTH, SVG_HEIGHT, DANCER_RADIUS_PX } from '../layout.js';

test('calculateMovePaths should return paths for all dancers', () => {
    const set = new Set(4);
    const move = { type: 'balance', beats: 4 };

    const paths = calculateMovePaths(move, set);

    // Should have path for each dancer
    assert.strictEqual(paths.size, set.dancers.length);

    // Each path should be valid
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path !== undefined, `Should have path for dancer ${dancer.id}`);
        assert(path.beats === 4, 'Path should have correct beat duration');
    });
});

// Test path start positions match Set positions
test('path start positions should match Set positions', () => {
    const set = new Set(4);
    const move = { type: 'balance', beats: 4 };

    const startPositions = set.getPositions();
    const paths = calculateMovePaths(move, set);

    set.dancers.forEach((dancer, index) => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(startPositions[index], 0.01),
            `Path start for ${dancer.id} should match Set position`);
    });
});

// Test path end positions match Set positions after move
test('path end positions should match Set positions after move', () => {
    const set = new Set(4);
    const move = { type: 'balance', beats: 4 };

    const paths = calculateMovePaths(move, set);

    // Execute the move on the actual set
    set.balance();

    // Get end positions
    const endPositions = set.getPositions();
    const endPosById = new Map();
    set.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Check that path ends match
    paths.forEach((path, dancerId) => {
        const expectedEnd = endPosById.get(dancerId);
        assert(path.end.equals(expectedEnd, 0.01),
            `Path end for ${dancerId} should match Set position after move`);
    });
});

// Test all waypoints are in bounds
test('all path waypoints should be within bounds', () => {
    const set = new Set(4);
    const moves = [
        { type: 'balance', beats: 4 },
        { type: 'long lines', beats: 8 },
        { type: 'do-si-do', beats: 8 }
    ];

    moves.forEach(move => {
        const paths = calculateMovePaths(move, set);
        assert(allWaypointsInBounds(paths),
            `All waypoints for ${move.type} should be in bounds`);
    });
});

// Test no overlaps at any waypoint
test('paths should have no overlaps at any waypoint', () => {
    const set = new Set(4);
    const moves = [
        { type: 'balance', beats: 4 },
        { type: 'long lines', beats: 8 },
    ];

    moves.forEach(move => {
        const paths = calculateMovePaths(move, set);
        assert(hasNoOverlaps(paths),
            `Paths for ${move.type} should have no overlaps`);
    });
});

// Test correct number of waypoints
test('paths should have at least 2 waypoints', () => {
    const set = new Set(4);
    const move = { type: 'balance', beats: 4 };

    const paths = calculateMovePaths(move, set);

    paths.forEach((path, dancerId) => {
        assert(path.waypointCount >= 2,
            `Path for ${dancerId} should have at least 2 waypoints`);
    });
});

// Test with inactive dancers
test('paths should be created for inactive dancers', () => {
    const set = new Set(5); // Odd number - last couple inactive
    const move = { type: 'balance', beats: 4 };

    const paths = calculateMovePaths(move, set);

    // Should have paths for all dancers, including inactive
    assert.strictEqual(paths.size, set.dancers.length);

    // Inactive dancers should have stationary paths
    set.dancers.forEach(dancer => {
        if (!dancer.active) {
            const path = paths.get(dancer.id);
            assert(path.start.equals(path.end, 0.01),
                `Inactive dancer ${dancer.id} should have stationary path`);
        }
    });
});

// Test path calculation doesn't mutate original set
test('calculating paths should not mutate original Set', () => {
    const set = new Set(4);
    const originalDancerIds = set.dancers.map(d => d.id);

    const move = { type: 'balance', beats: 4 };
    calculateMovePaths(move, set);

    // Dancer order should be unchanged
    const afterDancerIds = set.dancers.map(d => d.id);
    assert.deepStrictEqual(afterDancerIds, originalDancerIds,
        'Set dancers should not be reordered by path calculation');
});

// ===== PROGRESSION, AND MOVES NOT ANIMATED YET =====

test('calculating paths for a progression move should not mutate the Set', () => {
    const set = new Set(6);
    const before = set.dancers.map(d => `${d.id}:${d.active}:${d.couple.coupleNumber}`);

    calculateMovePaths({ type: 'do-si-do', beats: 8, progression: true }, set);

    const after = set.dancers.map(d => `${d.id}:${d.active}:${d.couple.coupleNumber}`);
    assert.deepStrictEqual(after, before);
    assert.strictEqual(set.snapshots.length, 0);
});

test('progression move paths run from current positions to post-move positions', () => {
    const set = new Set(6);
    const move = { type: 'do-si-do', beats: 8, progression: true };
    const startPositions = new Map(set.dancers.map((d, i) => [d.id, set.getPositions()[i]]));

    const paths = calculateMovePaths(move, set);

    executeMove(set, move);
    set.dancers.forEach((dancer, i) => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(startPositions.get(dancer.id), 0.01),
            `${dancer.id} path should start where the dancer currently is`);
        assert(path.end.equals(set.getPositions()[i], 0.01),
            `${dancer.id} path should end where the dancer is after the move`);
    });
});

test('couples crossing over at the ends stay apart', () => {
    const set = new Set(6);
    const paths = calculateMovePaths({ type: 'do-si-do', beats: 8, progression: true }, set);
    assert(hasNoOverlaps(paths, 40), 'Progression paths should have no overlaps');
});

test('couples crossing over at the ends slide past each other along their row, out of the way of the set', () => {
    const set = new Set(6);
    // Once the dance has started, the couples at the ends wait out, crossing over
    executeMove(set, { type: 'do-si-do', beats: 8, progression: true });
    const paths = calculateMovePaths({ type: 'do-si-do', beats: 8, progression: true }, set);
    const rows = [...paths.values()].map(path => toPixels(path.start, SVG_WIDTH, SVG_HEIGHT).y);
    const middle = rows.reduce((sum, y) => sum + y, 0) / rows.length;
    let crossing = 0;
    for (const [id, path] of paths) {
        const start = toPixels(path.start, SVG_WIDTH, SVG_HEIGHT);
        const end = toPixels(path.end, SVG_WIDTH, SVG_HEIGHT);
        if (Math.abs(start.x - end.x) < 1) continue;
        crossing++;
        for (let k = 0; k <= 40; k++) {
            const point = toPixels(path.getPositionAt(k / 40), SVG_WIDTH, SVG_HEIGHT);
            // Positive towards the rest of the set
            const inward = (point.y - start.y) * Math.sign(middle - start.y);
            assert(inward < 10, `${id} keeps out of the set: ${inward.toFixed(0)}px in`);
            assert(inward > -2 * DANCER_RADIUS_PX - 10, `${id} stays close to the end of the set: ${(-inward).toFixed(0)}px out`);
        }
    }
    assert.equal(crossing, 4, 'a couple crosses over at each end');
    assert(hasNoOverlaps(paths, 2 * DANCER_RADIUS_PX), 'they pass without bumping');
});

test('an unsupported move should leave every dancer where they are', () => {
    const set = new Set(6);
    const move = { type: 'petronella', who: 'all', beats: 8 };
    const before = set.dancers.map(d => d.id);
    const paths = calculateMovePaths(move, set);
    assert.equal(paths.size, 12);
    for (const path of paths.values()) {
        assert(path.start.equals(path.end), 'path should be stationary');
    }
    executeMove(set, move);
    assert.deepEqual(set.dancers.map(d => d.id), before);
});
