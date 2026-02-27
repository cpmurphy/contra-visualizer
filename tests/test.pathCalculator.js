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
function hasNoOverlaps(paths, minDistance = 6.0) {
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

test('star left 4 places should animate (not stationary)', () => {
    const set = new Set(4);
    const move = { type: 'star left 4', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All active dancers should have arc paths with 8 waypoints (not stationary)
    set.dancers.forEach(dancer => {
        if (dancer.active) {
            const path = paths.get(dancer.id);

            // Path should have 8 waypoints (full animated arc)
            assert.strictEqual(path.waypointCount, 8,
                `Active dancer ${dancer.id} should have 8-waypoint arc path for full rotation`);

            // Verify it's truly animating through all waypoints
            // For a full rotation, waypoints should vary in position
            const firstWaypoint = path.waypoints[0];
            const midWaypoint = path.waypoints[3]; // Quarter turn point

            // Mid-waypoint should be significantly different from start
            const midDistance = distance(firstWaypoint, midWaypoint);
            assert(midDistance > 5.0,
                `Full rotation should have animated waypoints (distance: ${midDistance})`);
        }
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
        assert(hasNoOverlaps(paths, 6.0),
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
    // Test neighbor swing on fresh set (realistic - neighbors are on same side in improper)
    const neighborSet = new Set(4);
    const neighborMove = { type: 'swing', who: 'neighbor', beats: 8 };
    const neighborPaths = calculateMovePaths(neighborMove, neighborSet);
    assert(hasNoOverlaps(neighborPaths, 5.0),
        `Paths for swing neighbor should have no collisions`);

    // Test partner swing on a set positioned realistically
    // In real dances, partner swings happen after moves that bring partners to same side
    // e.g., after neighbor swing + circle left 3, partners are in same column
    const partnerSet = new Set(4);
    partnerSet.swing('neighbor');  // First, neighbors swing
    partnerSet.circleLeft(3);      // Then circle left 3/4 brings partners together
    const partnerMove = { type: 'swing', who: 'partner', beats: 8 };
    const partnerPaths = calculateMovePaths(partnerMove, partnerSet);
    assert(hasNoOverlaps(partnerPaths, 5.0),
        `Paths for swing partner should have no collisions`);
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

// Test swing waypoint count structure
test('swing paths should have correct waypoint count for 8-beat swing', () => {
    const set = new Set(4);
    const move = { type: 'swing', who: 'neighbor', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // For 8-beat swing: totalRotation = 3pi, rotationSteps = 12
    // Waypoints: 1 (start) + 1 (entry) + 12 (rotation) + 1 (end) = 15
    set.dancers.forEach(dancer => {
        if (dancer.active) {
            const path = paths.get(dancer.id);
            assert.strictEqual(path.waypointCount, 15,
                `Active dancer ${dancer.id} should have 15 waypoints for 8-beat swing`);
        }
    });
});

// Test within-pair separation during rotation
test('swing pair dancers should remain separated during rotation', () => {
    const set = new Set(4);
    const move = { type: 'swing', who: 'neighbor', beats: 8 };

    // Identify neighbor pairs in the first minor set before swing modifies set
    const leftLark = set.dancers[0].role === 'lark' ? set.dancers[0] : set.dancers[2];
    const leftRobin = set.dancers[0].role === 'robin' ? set.dancers[0] : set.dancers[2];
    const rightLark = set.dancers[1].role === 'lark' ? set.dancers[1] : set.dancers[3];
    const rightRobin = set.dancers[1].role === 'robin' ? set.dancers[1] : set.dancers[3];

    const paths = calculateMovePaths(move, set);

    const pairs = [
        [leftLark.id, leftRobin.id],
        [rightLark.id, rightRobin.id]
    ];

    // Within-pair distance should stay above 4.0 (2*dancerRadius in normalized units)
    pairs.forEach(([id1, id2]) => {
        const path1 = paths.get(id1);
        const path2 = paths.get(id2);

        for (let p = 0; p <= 20; p++) {
            const progress = p / 20;
            const pos1 = path1.getPositionAt(progress);
            const pos2 = path2.getPositionAt(progress);
            const dist = distance(pos1, pos2);

            assert(dist >= 4.0,
                `Pair ${id1}/${id2} should stay separated at progress ${progress} (got ${dist.toFixed(2)})`);
        }
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
        assert(hasNoOverlaps(paths, 6.0),
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
