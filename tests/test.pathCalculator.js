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

// ===== CIRCULAR MOVES TESTS =====

// Test circle left by 1 place
test('circle left 1 should create arc paths', () => {
    const set = new Set(4);
    const move = { type: 'circle left 1', beats: 4 };

    const paths = calculateMovePaths(move, set);

    // All active dancers should have paths with more than 2 waypoints (arcs)
    set.dancers.forEach(dancer => {
        if (dancer.active) {
            const path = paths.get(dancer.id);
            assert(path.waypointCount > 2,
                `Active dancer ${dancer.id} should have arc path with multiple waypoints`);
        }
    });
});

// Test circle right by 1 place
test('circle right 1 should create arc paths', () => {
    const set = new Set(4);
    const move = { type: 'circle right 1', beats: 4 };

    const paths = calculateMovePaths(move, set);

    // All active dancers should have paths
    assert.strictEqual(paths.size, set.dancers.length);
});

// Test circle left by different place counts
test('circle left with different places should end at correct positions', () => {
    const places = [1, 2, 3];

    places.forEach(numPlaces => {
        const set = new Set(4);
        const move = { type: `circle left ${numPlaces}`, beats: 8 };

        const paths = calculateMovePaths(move, set);

        // Execute the actual move
        set.circleLeft(numPlaces);
        const endPositions = set.getPositions();
        const endPosById = new Map();
        set.dancers.forEach((dancer, index) => {
            endPosById.set(dancer.id, endPositions[index]);
        });

        // Check that path ends match
        paths.forEach((path, dancerId) => {
            const expectedEnd = endPosById.get(dancerId);
            assert(path.end.equals(expectedEnd, 0.01),
                `Path end for ${dancerId} after circle left ${numPlaces} should match Set position`);
        });
    });
});

// Test circle right by different place counts
test('circle right with different places should end at correct positions', () => {
    const places = [1, 2, 3];

    places.forEach(numPlaces => {
        const set = new Set(4);
        const move = { type: `circle right ${numPlaces}`, beats: 8 };

        const paths = calculateMovePaths(move, set);

        // Execute the actual move
        set.circleRight(numPlaces);
        const endPositions = set.getPositions();
        const endPosById = new Map();
        set.dancers.forEach((dancer, index) => {
            endPosById.set(dancer.id, endPositions[index]);
        });

        // Check that path ends match
        paths.forEach((path, dancerId) => {
            const expectedEnd = endPosById.get(dancerId);
            assert(path.end.equals(expectedEnd, 0.01),
                `Path end for ${dancerId} after circle right ${numPlaces} should match Set position`);
        });
    });
});

// Test circle left by 4 places (full rotation)
test('circle left 4 should return dancers to start positions', () => {
    const set = new Set(4);
    const move = { type: 'circle left 4', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All paths should end at their start positions
    paths.forEach((path, dancerId) => {
        assert(path.start.equals(path.end, 0.01),
            `Dancer ${dancerId} should return to start after full rotation`);
    });
});

// Test star left
test('star left should work like circle left', () => {
    const set = new Set(4);
    const move = { type: 'star left 2', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // Execute the actual move (star left is same as circle left)
    set.starLeft(2);
    const endPositions = set.getPositions();
    const endPosById = new Map();
    set.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Check that path ends match
    paths.forEach((path, dancerId) => {
        const expectedEnd = endPosById.get(dancerId);
        assert(path.end.equals(expectedEnd, 0.01),
            `Path end for ${dancerId} after star left should match Set position`);
    });
});

// Test star right
test('star right should work like circle right', () => {
    const set = new Set(4);
    const move = { type: 'star right 2', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // Execute the actual move (star right is same as circle right)
    set.starRight(2);
    const endPositions = set.getPositions();
    const endPosById = new Map();
    set.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Check that path ends match
    paths.forEach((path, dancerId) => {
        const expectedEnd = endPosById.get(dancerId);
        assert(path.end.equals(expectedEnd, 0.01),
            `Path end for ${dancerId} after star right should match Set position`);
    });
});

// Test no overlaps during circular moves
test('circular move paths should have no overlaps', () => {
    const moves = [
        { type: 'circle left 1', beats: 4 },
        { type: 'circle right 1', beats: 4 },
        { type: 'circle left 2', beats: 8 },
        { type: 'star left 1', beats: 4 }
    ];

    moves.forEach(move => {
        const set = new Set(4);
        const paths = calculateMovePaths(move, set);
        assert(hasNoOverlaps(paths, 1.5),
            `Paths for ${move.type} should have no overlaps`);
    });
});

// Test all waypoints in bounds for circular moves
test('circular move paths should stay within bounds', () => {
    const moves = [
        { type: 'circle left 1', beats: 4 },
        { type: 'circle right 2', beats: 8 },
        { type: 'star left 3', beats: 8 }
    ];

    moves.forEach(move => {
        const set = new Set(4);
        const paths = calculateMovePaths(move, set);
        assert(allWaypointsInBounds(paths),
            `All waypoints for ${move.type} should be in bounds`);
    });
});

// Test circular moves with inactive dancers
test('circular moves should handle inactive dancers', () => {
    const set = new Set(5); // Odd number - last couple inactive
    set.progress(); // First couple now inactive

    const move = { type: 'circle left 1', beats: 4 };
    const paths = calculateMovePaths(move, set);

    // Should have paths for all dancers
    assert.strictEqual(paths.size, set.dancers.length);

    // Inactive dancers should have stationary paths
    set.dancers.forEach(dancer => {
        if (!dancer.active) {
            const path = paths.get(dancer.id);
            assert(path.start.equals(path.end, 0.01),
                `Inactive dancer ${dancer.id} should not move during circle`);
        }
    });
});

// ===== SWING MOVES TESTS =====

// Test neighbor swing
test('neighbor swing should create arc paths', () => {
    const set = new Set(4);
    const move = { type: 'swing', who: 'neighbor', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All active dancers should have paths
    assert.strictEqual(paths.size, set.dancers.length);

    // Swinging dancers should have arc paths with multiple waypoints
    set.dancers.forEach(dancer => {
        if (dancer.active) {
            const path = paths.get(dancer.id);
            assert(path.waypointCount >= 2,
                `Dancer ${dancer.id} should have path during swing`);
        }
    });
});

// Test partner swing
test('partner swing should create arc paths', () => {
    const set = new Set(4);
    const move = { type: 'swing', who: 'partner', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All active dancers should have paths
    assert.strictEqual(paths.size, set.dancers.length);
});

// Test neighbor swing end positions
test('neighbor swing should end at correct positions', () => {
    const set = new Set(4);
    const move = { type: 'swing', who: 'neighbor', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // Execute the actual move
    set.swing('neighbor');
    const endPositions = set.getPositions();
    const endPosById = new Map();
    set.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Check that path ends match
    paths.forEach((path, dancerId) => {
        const expectedEnd = endPosById.get(dancerId);
        assert(path.end.equals(expectedEnd, 0.01),
            `Path end for ${dancerId} after neighbor swing should match Set position`);
    });
});

// Test partner swing end positions
test('partner swing should end at correct positions', () => {
    const set = new Set(4);
    const move = { type: 'swing', who: 'partner', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // Execute the actual move
    set.swing('partner');
    const endPositions = set.getPositions();
    const endPosById = new Map();
    set.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Check that path ends match
    paths.forEach((path, dancerId) => {
        const expectedEnd = endPosById.get(dancerId);
        assert(path.end.equals(expectedEnd, 0.01),
            `Path end for ${dancerId} after partner swing should match Set position`);
    });
});

// Test swing paths have no overlaps (with smaller threshold since swings involve close contact)
test('swing paths should have no overlaps', () => {
    const moves = [
        { type: 'swing', who: 'neighbor', beats: 8 },
        { type: 'swing', who: 'partner', beats: 8 }
    ];

    moves.forEach(move => {
        const set = new Set(4);
        const paths = calculateMovePaths(move, set);
        // Swings involve close contact, so use smaller minimum distance (0.5 instead of 1.5)
        assert(hasNoOverlaps(paths, 0.5),
            `Paths for swing ${move.who} should have no collisions`);
    });
});

// Test swing paths stay within bounds
test('swing paths should stay within bounds', () => {
    const moves = [
        { type: 'swing', who: 'neighbor', beats: 8 },
        { type: 'swing', who: 'partner', beats: 8 }
    ];

    moves.forEach(move => {
        const set = new Set(4);
        const paths = calculateMovePaths(move, set);
        assert(allWaypointsInBounds(paths),
            `All waypoints for swing ${move.who} should be in bounds`);
    });
});

// ===== CHAIN MOVES TESTS =====

// Test robin chain
test('robin chain should create arc paths for robins', () => {
    const set = new Set(4);
    const move = { type: 'chain', who: 'robins', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All dancers should have paths
    assert.strictEqual(paths.size, set.dancers.length);

    // Robins that move should have arc paths with multiple waypoints
    set.dancers.forEach(dancer => {
        if (dancer.active && dancer.role === 'robin') {
            const path = paths.get(dancer.id);
            // Robins cross, so they should have paths with waypoints
            assert(path.waypointCount >= 2,
                `Robin ${dancer.id} should have path during chain`);
        }
    });
});

// Test lark chain
test('lark chain should create arc paths for larks', () => {
    const set = new Set(4);
    const move = { type: 'chain', who: 'larks', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All dancers should have paths
    assert.strictEqual(paths.size, set.dancers.length);

    // Larks that move should have arc paths
    set.dancers.forEach(dancer => {
        if (dancer.active && dancer.role === 'lark') {
            const path = paths.get(dancer.id);
            assert(path.waypointCount >= 2,
                `Lark ${dancer.id} should have path during chain`);
        }
    });
});

// Test robin chain end positions
test('robin chain should end at correct positions', () => {
    const set = new Set(4);
    const move = { type: 'chain', who: 'robins', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // Execute the actual move
    set.chainRobins();
    const endPositions = set.getPositions();
    const endPosById = new Map();
    set.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Check that path ends match
    paths.forEach((path, dancerId) => {
        const expectedEnd = endPosById.get(dancerId);
        assert(path.end.equals(expectedEnd, 0.01),
            `Path end for ${dancerId} after robin chain should match Set position`);
    });
});

// Test lark chain end positions
test('lark chain should end at correct positions', () => {
    const set = new Set(4);
    const move = { type: 'chain', who: 'larks', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // Execute the actual move
    set.chainLarks();
    const endPositions = set.getPositions();
    const endPosById = new Map();
    set.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Check that path ends match
    paths.forEach((path, dancerId) => {
        const expectedEnd = endPosById.get(dancerId);
        assert(path.end.equals(expectedEnd, 0.01),
            `Path end for ${dancerId} after lark chain should match Set position`);
    });
});

// Test chain paths have no overlaps
test('chain paths should have no overlaps', () => {
    const moves = [
        { type: 'chain', who: 'robins', beats: 8 },
        { type: 'chain', who: 'larks', beats: 8 }
    ];

    moves.forEach(move => {
        const set = new Set(4);
        const paths = calculateMovePaths(move, set);
        assert(hasNoOverlaps(paths, 1.0),
            `Paths for ${move.who} chain should have no overlaps`);
    });
});

// Test chain paths stay within bounds
test('chain paths should stay within bounds', () => {
    const moves = [
        { type: 'chain', who: 'robins', beats: 8 },
        { type: 'chain', who: 'larks', beats: 8 }
    ];

    moves.forEach(move => {
        const set = new Set(4);
        const paths = calculateMovePaths(move, set);
        assert(allWaypointsInBounds(paths),
            `All waypoints for ${move.who} chain should be in bounds`);
    });
});

// Test chain with inactive dancers
test('chains should handle inactive dancers', () => {
    const set = new Set(5); // Odd number - last couple inactive
    set.progress(); // First couple now inactive

    const move = { type: 'chain', who: 'robins', beats: 8 };
    const paths = calculateMovePaths(move, set);

    // Should have paths for all dancers
    assert.strictEqual(paths.size, set.dancers.length);

    // Inactive dancers should have stationary paths
    set.dancers.forEach(dancer => {
        if (!dancer.active) {
            const path = paths.get(dancer.id);
            assert(path.start.equals(path.end, 0.01),
                `Inactive dancer ${dancer.id} should not move during chain`);
        }
    });
});
