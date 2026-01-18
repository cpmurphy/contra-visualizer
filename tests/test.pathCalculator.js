// Unit tests for path calculator

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { distance, isInBounds } from '../positions.js';

// Helper to check if all waypoints are within bounds
function allWaypointsInBounds(paths) {
    for (const path of paths.values()) {
        for (const waypoint of path.getWaypoints()) {
            if (!isInBounds(waypoint, 0, 0, 100, 100)) {
                return false;
            }
        }
    }
    return true;
}

// Helper to check for overlaps at any waypoint
function hasNoOverlaps(paths, minDistance = 2.0) {
    const allDancers = [...paths.keys()];
    const maxProgress = 20; // Check 20 points along the path

    for (let p = 0; p <= maxProgress; p++) {
        const progress = p / maxProgress;
        const positions = new Map();

        // Get position of each dancer at this progress
        for (const dancerId of allDancers) {
            const path = paths.get(dancerId);
            positions.set(dancerId, path.getPositionAt(progress));
        }

        // Check all pairs for overlap
        for (let i = 0; i < allDancers.length; i++) {
            for (let j = i + 1; j < allDancers.length; j++) {
                const pos1 = positions.get(allDancers[i]);
                const pos2 = positions.get(allDancers[j]);
                const dist = distance(pos1, pos2);

                if (dist < minDistance) {
                    return false;
                }
            }
        }
    }

    return true;
}

// Test balance move
test('balance should create stationary paths', () => {
    const set = new Set(4);
    const move = { type: 'balance', beats: 4 };

    const paths = calculateMovePaths(move, set);

    // Should have path for each dancer
    assert.strictEqual(paths.size, set.dancers.length);

    // All paths should be stationary (start = end)
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(path.end, 0.01),
            `Dancer ${dancer.id} should not move during balance`);
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

// Test long lines move
test('long lines should create stationary paths', () => {
    const set = new Set(4);
    const move = { type: 'long lines', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All paths should be stationary (start = end)
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(path.end, 0.01),
            `Dancer ${dancer.id} should not move during long lines`);
    });
});

// Test do-si-do move (integer times)
test('do-si-do once should create stationary paths', () => {
    const set = new Set(4);
    const move = { type: 'do-si-do', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All paths should be stationary (dancers return to start)
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(path.end, 0.01),
            `Dancer ${dancer.id} should return to start after do-si-do once`);
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
        { type: 'do-si-do', beats: 8 }
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
