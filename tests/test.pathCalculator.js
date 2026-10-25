// Unit tests for path calculator

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths, executeMove, withSetState, pathCacheKey, isMoveSupported } from '../pathCalculator.js';
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

// Test do-si-do move
test('do-si-do should trace a full circle and return to start', () => {
    const set = new Set(4);
    const move = { type: 'do-si-do', beats: 8 };

    const paths = calculateMovePaths(move, set);

    // All dancers should return to their starting position
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(path.end, 0.01),
            `Dancer ${dancer.id} should return to start after do-si-do`);
    });

    // Dancers should actually move (not stationary) - check midpoint differs from start
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        const midPos = path.getPositionAt(0.5);
        assert(!path.start.equals(midPos, 0.5),
            `Dancer ${dancer.id} should move during do-si-do`);
    });

    // Should have more than 2 waypoints (circular path, not just start/end)
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path.waypointCount > 2,
            `Dancer ${dancer.id} should have circular path with multiple waypoints`);
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

// Test do-si-do overlaps (same threshold as swing, since it's a circular orbit)
test('do-si-do paths should have no overlaps', () => {
    const set = new Set(4);
    const move = { type: 'do-si-do', beats: 8 };
    const paths = calculateMovePaths(move, set);
    assert(hasNoOverlaps(paths, 5.0),
        'Do-si-do paths should have no overlaps');
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

    // All active dancers should have arc paths (not stationary)
    set.dancers.forEach(dancer => {
        if (dancer.active) {
            const path = paths.get(dancer.id);

            // Path should have enough waypoints to trace a full animated loop
            assert(path.waypointCount >= 8,
                `Active dancer ${dancer.id} should have an animated arc path for full rotation`);

            // Verify it's truly animating through all waypoints
            // For a full rotation, waypoints should vary in position
            const firstWaypoint = path.waypoints[0];
            const midWaypoint = path.waypoints[Math.floor(path.waypointCount / 4)]; // Quarter turn point

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

// ===== PROGRESSION AND SET STATE TESTS =====

test('calculating paths for a progression move should not mutate the Set', () => {
    const set = new Set(6);
    const before = set.dancers.map(d => `${d.id}:${d.active}:${d.couple.coupleNumber}`);

    calculateMovePaths({ type: 'do-si-do', beats: 8, progression: true }, set);

    const after = set.dancers.map(d => `${d.id}:${d.active}:${d.couple.coupleNumber}`);
    assert.deepStrictEqual(after, before);
    assert.strictEqual(set.snapshots.length, 0);
});

test('withSetState restores the Set after reading', () => {
    const set = new Set(6);
    const before = set.dancers.map(d => d.id);

    const changed = withSetState(set, s => s.progress(), s => s.dancers.map(d => d.id));

    assert.notDeepStrictEqual(changed, before);
    assert.deepStrictEqual(set.dancers.map(d => d.id), before);
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
    assert(hasNoOverlaps(paths, 5.0), 'Progression paths should have no overlaps');
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

test('swing exits should not pass through the swing partner', () => {
    // Swing from the starting formation and from the Simplicity Swing A2 setup
    // (neighbor swing then circle left 3/4), for a range of swing lengths
    const setups = [
        [],
        [{ type: 'swing', who: 'neighbor', beats: 12 }, { type: 'circle left 3/4', beats: 6 }]
    ];

    for (const setup of setups) {
        for (const who of ['neighbor', 'partner']) {
            for (const beats of [6, 8, 10, 12, 16]) {
                const set = new Set(6);
                setup.forEach(move => executeMove(set, move));

                const paths = calculateMovePaths({ type: 'swing', who, beats }, set);
                const ids = [...paths.keys()];
                for (let p = 0; p <= 200; p++) {
                    const positions = ids.map(id => paths.get(id).getPositionAt(p / 200));
                    for (let i = 0; i < ids.length; i++) {
                        for (let j = i + 1; j < ids.length; j++) {
                            const dist = distance(positions[i], positions[j]);
                            assert(dist >= 4.0,
                                `${beats}-beat ${who} swing: ${ids[i]}/${ids[j]} too close at progress ${p / 200} (got ${dist.toFixed(2)})`);
                        }
                    }
                }
            }
        }
    }
});

test('path cache key distinguishes arrangements that share the same places', () => {
    // Two full times through Simplicity Swing: everyone is active again, but the
    // couples have progressed, so the cached paths from the first time can't be reused
    const dance = [
        { type: 'balance', beats: 4, who: 'neighbor' },
        { type: 'swing', beats: 12, who: 'neighbor' },
        { type: 'circle left 3/4', beats: 6 },
        { type: 'swing', beats: 10, who: 'partner' },
        { type: 'Long lines, forward and back', beats: 8 },
        { type: 'chain to neighbor', beats: 8, who: 'robins' },
        { type: 'star left 4 places', beats: 8 },
        { type: 'do-si-do', beats: 8, progression: true }
    ];
    const set = new Set(6);
    const balance = dance[0];
    const firstKey = pathCacheKey(balance, set);

    dance.concat(dance).forEach(move => executeMove(set, move));

    assert(set.dancers.every(d => d.active), 'everyone should be active again');
    assert.notStrictEqual(pathCacheKey(balance, set), firstKey);
});

test('path cache key matches for the same arrangement', () => {
    const move = { type: 'balance', beats: 4 };
    assert.strictEqual(pathCacheKey(move, new Set(6)), pathCacheKey(move, new Set(6)));
});

// ===== ROBINS CHAIN COURTESY TURN TESTS =====

// Simplicity Swing up to B1's chain: the left-hand couple of the top minor set is
// L2 at the top with R1 crossing over to finish below him (and vice versa on the right)
function chainFromSimplicitySwingB1() {
    const set = new Set(6);
    [
        { type: 'balance', beats: 4, who: 'neighbor' },
        { type: 'swing', beats: 12, who: 'neighbor' },
        { type: 'circle left 3/4', beats: 6 },
        { type: 'swing', beats: 10, who: 'partner' },
        { type: 'Long lines, forward and back', beats: 8 }
    ].forEach(move => executeMove(set, move));

    const move = { type: 'chain to neighbor', beats: 8, who: 'robins' };
    const paths = calculateMovePaths(move, set);
    const startPositions = new Map(set.dancers.map((d, i) => [d.id, set.getPositions()[i]]));

    // Pair each crossing robin with the lark whose side she finishes on
    executeMove(set, move);
    const endPositions = new Map(set.dancers.map((d, i) => [d.id, set.getPositions()[i]]));
    const couples = set.dancers.slice(0, 4)
        .filter(d => d.role === 'robin')
        .map(robin => ({
            robin: robin.id,
            lark: set.dancers.slice(0, 4).find(d =>
                d.role === 'lark' && Math.abs(endPositions.get(d.id).x - endPositions.get(robin.id).x) < 0.01).id
        }));
    return { paths, couples, startPositions, endPositions };
}

// Angle of b as seen from a, in pixel space (y down)
function pixelAngle(a, b) {
    return Math.atan2((b.y - a.y) * 9, (b.x - a.x) * 8);
}

test('robins chain: couple courtesy turns counter-clockwise as a unit', () => {
    const { paths, couples } = chainFromSimplicitySwingB1();

    for (const { robin, lark } of couples) {
        // Over the turn (beats 3-7 of 8), the robin's bearing from the lark only
        // decreases: counter-clockwise on screen, since y points down
        let total = 0;
        let previous = pixelAngle(paths.get(lark).getPositionAt(3 / 8), paths.get(robin).getPositionAt(3 / 8));
        for (let k = 1; k <= 40; k++) {
            const progress = 3 / 8 + (k / 40) * (4 / 8);
            const angle = pixelAngle(paths.get(lark).getPositionAt(progress), paths.get(robin).getPositionAt(progress));
            let step = angle - previous;
            if (step > Math.PI) step -= 2 * Math.PI;
            if (step < -Math.PI) step += 2 * Math.PI;
            assert(step <= 1e-6, `${robin} should turn counter-clockwise around ${lark} (step ${step})`);
            total += step;
            previous = angle;
        }
        assert(total < -Math.PI, `${robin} and ${lark} should turn more than half way round (got ${total})`);
    }
});

test('robins chain: turn ends with the robin on the lark\'s right, facing in', () => {
    const { paths, couples, endPositions } = chainFromSimplicitySwingB1();

    for (const { robin, lark } of couples) {
        // At the end of the turn the robin is on the same side of the lark as her place
        const larkAtTurnEnd = paths.get(lark).getPositionAt(7 / 8);
        const robinAtTurnEnd = paths.get(robin).getPositionAt(7 / 8);
        const expected = pixelAngle(endPositions.get(lark), endPositions.get(robin));
        const actual = pixelAngle(larkAtTurnEnd, robinAtTurnEnd);
        assert(Math.abs(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected))) < 0.05,
            `${robin} should finish the turn lined up with her place beside ${lark}`);

        // ...and has eased to a stop there
        const justBefore = paths.get(robin).getPositionAt(7 / 8 - 0.01);
        assert(distance(justBefore, robinAtTurnEnd) < 0.05, `${robin} should slow to a stop at the end of the turn`);
    }
});

test('robins chain: the lark stays near his place as the pivot', () => {
    const { paths, couples, startPositions } = chainFromSimplicitySwingB1();

    for (const { lark } of couples) {
        const place = startPositions.get(lark);
        for (let k = 0; k <= 80; k++) {
            const pos = paths.get(lark).getPositionAt(k / 80);
            const offsetPx = Math.hypot((pos.x - place.x) * 8, (pos.y - place.y) * 9);
            assert(offsetPx < 50, `${lark} should stay near his place (got ${offsetPx.toFixed(1)}px away)`);
        }
    }
});

test('robins chain: robins pull by clockwise around the middle, passing right shoulders', () => {
    const { paths, couples } = chainFromSimplicitySwingB1();
    const [first, second] = couples.map(c => c.robin);

    // While the robins are in the middle (beat 1.5 of 8), each is on the other's right
    const p1 = paths.get(first).getPositionAt(1.5 / 8);
    const p2 = paths.get(second).getPositionAt(1.5 / 8);
    const v1 = paths.get(first).getVelocityAtBeat(1.5);
    const toOther = { x: (p2.x - p1.x) * 8, y: (p2.y - p1.y) * 9 };
    // Right of travel in y-down coordinates is (-vy, vx)
    const rightOfTravel = { x: -v1.y * 9, y: v1.x * 8 };
    assert(toOther.x * rightOfTravel.x + toOther.y * rightOfTravel.y > 0,
        'the other robin should be on the right while pulling by');
});

test('moves we cannot animate yet should be unsupported', () => {
    const improper = new Set(6);
    const proper = new Set(6, 'proper');
    assert(!isMoveSupported({ type: 'half hey', who: 'all', beats: 8 }, improper));
    assert(!isMoveSupported({ type: 'swing', who: 'ones', beats: 12 }, improper));
    assert(!isMoveSupported({ type: 'balance', who: 'partner', beats: 4 }, improper));
    assert(!isMoveSupported({ type: 'swing', who: 'neighbor', beats: 12 }, proper));
});

test('moves we can animate should be supported', () => {
    const improper = new Set(6);
    const proper = new Set(6, 'proper');
    assert(isMoveSupported({ type: 'swing', who: 'partner', beats: 10 }, improper));
    assert(isMoveSupported({ type: 'balance', beats: 4 }, improper));
    assert(isMoveSupported({ type: 'chain to neighbor', who: 'robins', beats: 8 }, improper));
    assert(isMoveSupported({ type: 'circle left 4 places', who: 'all', beats: 8 }, proper));
    assert(isMoveSupported({ type: 'star right 4 places', who: 'all', beats: 8 }, proper));
});

test('an unsupported move should leave every dancer where they are', () => {
    const set = new Set(6);
    const move = { type: 'turn contra corners', who: 'ones', beats: 16 };
    const before = set.dancers.map(d => d.id);
    const paths = calculateMovePaths(move, set);
    assert.equal(paths.size, 12);
    for (const path of paths.values()) {
        assert(path.start.equals(path.end), 'path should be stationary');
    }
    executeMove(set, move);
    assert.deepEqual(set.dancers.map(d => d.id), before);
});

test('an unsupported move should still progress when it is the progression', () => {
    const set = new Set(6);
    executeMove(set, { type: 'half hey', who: 'all', beats: 8, progression: true });
    assert(!set.dancers[0].active, 'top couple should wait out after progressing');
});

test('circling in a proper set should rotate the minor sets', () => {
    const set = new Set(4, 'proper');
    const [a, b, c, d] = set.dancers;
    executeMove(set, { type: 'circle left 1 place', who: 'all', beats: 2 });
    assert.deepEqual(set.dancers.slice(0, 4), [c, a, d, b]);
});

test('the path cache key should depend on the formation', () => {
    const move = { type: 'swing', who: 'neighbor', beats: 8 };
    const improper = new Set(6);
    const proper = new Set(6, 'proper');
    // Same dancers in the same places, but only the improper set can swing
    proper.dancers = improper.dancers.map(d => proper.dancerMap.get(d.id));
    assert.notEqual(pathCacheKey(move, improper), pathCacheKey(move, proper));
});
