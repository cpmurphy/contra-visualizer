// Unit tests for path calculator

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths, executeMove, withSetState, pathCacheKey, isMoveSupported } from '../pathCalculator.js';
import { center, distance, isInBounds, toPixels } from '../positions.js';

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

// Helper to check for overlaps at any waypoint. Distances are in pixels, since
// normalized units are different sizes across and down the canvas. Dancers have a
// radius of 20px, so 40px apart is touching.
function hasNoOverlaps(paths, minDistance = 44) {
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
                const px1 = toPixels(pos1, 800, 1000);
                const px2 = toPixels(pos2, 800, 1000);
                const dist = Math.hypot(px1.x - px2.x, px1.y - px2.y);

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
    assert(hasNoOverlaps(paths, 40),
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
        assert(hasNoOverlaps(paths),
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
    assert(hasNoOverlaps(neighborPaths, 40),
        `Paths for swing neighbor should have no collisions`);

    // Test partner swing on a set positioned realistically
    // In real dances, partner swings happen after moves that bring partners to same side
    // e.g., after neighbor swing + circle left 3, partners are in same column
    const partnerSet = new Set(4);
    partnerSet.swing('neighbor');  // First, neighbors swing
    partnerSet.circleLeft(3);      // Then circle left 3/4 brings partners together
    const partnerMove = { type: 'swing', who: 'partner', beats: 8 };
    const partnerPaths = calculateMovePaths(partnerMove, partnerSet);
    assert(hasNoOverlaps(partnerPaths, 40),
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

    // For 8-beat swing: 6 beats turning, once every 2 beats is 3 turns, adjusted to
    // 3.5 to leave on the side facing the end position, so rotationSteps = 84
    // Waypoints: 1 (start) + 1 (entry) + 84 (rotation) + 1 (end) = 87
    set.dancers.forEach(dancer => {
        if (dancer.active) {
            const path = paths.get(dancer.id);
            assert.strictEqual(path.waypointCount, 87,
                `Active dancer ${dancer.id} should have 87 waypoints for 8-beat swing`);
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

// The two swinging hold each other: between stepping in and out (a beat each),
// they turn steadily about a fixed point, close but not touching, closer together
// than in an allemande
test('swing pairs should turn close together, steadily opposite each other', () => {
    const setups = [
        [],
        [{ type: 'swing', who: 'neighbor', beats: 12 }, { type: 'circle left 3/4', beats: 6 }]
    ];
    for (const setup of setups) {
        for (const who of ['neighbor', 'partner']) {
            const set = new Set(6);
            setup.forEach(move => executeMove(set, move));
            const beats = 8;
            const paths = calculateMovePaths({ type: 'swing', who, beats }, set);
            const px = (id, beat) => toPixels(paths.get(id).getPositionAtBeat(beat), 800, 1000);
            const apart = (id1, id2, beat) => {
                const [p1, p2] = [px(id1, beat), px(id2, beat)];
                return Math.hypot(p1.x - p2.x, p1.y - p2.y);
            };
            // Pair up the swingers by who is close to whom half way through
            const ids = [...paths.keys()].filter(id => !paths.get(id).start.equals(paths.get(id).end));
            const partnerOf = new Map();
            for (const id of ids) {
                const other = ids.find(otherId => otherId !== id && apart(id, otherId, beats / 2) < 50);
                if (other) partnerOf.set(id, other);
            }
            assert(partnerOf.size >= 4, `${who} swing: swinging pairs should be close at the half way point`);

            for (const [id1, id2] of partnerOf) {
                const centers = [];
                for (let beat = 1; beat <= beats - 1; beat += 0.25) {
                    const [p1, p2] = [px(id1, beat), px(id2, beat)];
                    const dist = apart(id1, id2, beat);
                    assert(dist >= 44 && dist <= 48,
                        `${who} swing: ${id1}/${id2} should be close but not touching at beat ${beat} (got ${dist.toFixed(1)})`);
                    centers.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
                }
                for (const c of centers) {
                    assert(Math.hypot(c.x - centers[0].x, c.y - centers[0].y) < 1,
                        `${who} swing: ${id1}/${id2} should turn about a fixed point`);
                }
            }
        }
    }
});

// ===== STAR TESTS =====

/** Pixel position of each dancer in a minor set, and its center, at a beat */
function minorSetPixels(paths, ids, beat) {
    const points = ids.map(id => toPixels(paths.get(id).getPositionAtBeat(beat), 800, 1000));
    const center = {
        x: points.reduce((sum, p) => sum + p.x, 0) / 4,
        y: points.reduce((sum, p) => sum + p.y, 0) / 4
    };
    return { points, center };
}

test('stars should turn close around the middle, closer than a circle, evenly spaced', () => {
    const set = new Set(6);
    const ids = set.dancers.slice(0, 4).map(d => d.id);
    const star = calculateMovePaths({ type: 'star right 4 places', beats: 8 }, set);
    const circle = calculateMovePaths({ type: 'circle left 4 places', beats: 8 }, set);
    const { center } = minorSetPixels(star, ids, 0);

    for (let beat = 1; beat <= 7; beat += 0.25) {
        const { points } = minorSetPixels(star, ids, beat);
        const circlePoints = minorSetPixels(circle, ids, beat).points;
        points.forEach((p, j) => {
            const r = Math.hypot(p.x - center.x, p.y - center.y);
            assert(Math.abs(r - 40) < 1, `at beat ${beat}, ${ids[j]} should be 40px from the middle (got ${r.toFixed(1)})`);
            const circleR = Math.hypot(circlePoints[j].x - center.x, circlePoints[j].y - center.y);
            assert(r < circleR / 2, `at beat ${beat}, ${ids[j]} should be much closer in than in a circle`);
        });
        // Each is a quarter turn from the next: the diagonals are equal
        const diagonal1 = Math.hypot(points[0].x - points[3].x, points[0].y - points[3].y);
        const diagonal2 = Math.hypot(points[1].x - points[2].x, points[1].y - points[2].y);
        assert(Math.abs(diagonal1 - diagonal2) < 1, `at beat ${beat}, the four should be evenly spaced`);
    }
});

test('a star right should turn clockwise and a star left counter-clockwise', () => {
    for (const [type, sign] of [['star right 4 places', 1], ['star left 4 places', -1]]) {
        const set = new Set(6);
        const ids = set.dancers.slice(0, 4).map(d => d.id);
        const paths = calculateMovePaths({ type, beats: 8 }, set);
        const before = minorSetPixels(paths, ids, 2);
        const after = minorSetPixels(paths, ids, 2.25);
        before.points.forEach((p, j) => {
            const q = after.points[j];
            // Cross product of position (from the middle) and motion: positive is
            // clockwise on screen, with y down
            const cross = (p.x - before.center.x) * (q.y - p.y) - (p.y - before.center.y) * (q.x - p.x);
            assert(Math.sign(cross) === sign, `${type}: ${ids[j]} should turn ${sign > 0 ? 'clockwise' : 'counter-clockwise'}`);
        });
    }
});

test('stars should end where the set says, without collisions, for any number of places', () => {
    for (const hand of ['left', 'right']) {
        for (const places of [1, 2, 3, 4]) {
            const set = new Set(6);
            const move = { type: `star ${hand} ${places} places`, beats: 8 };
            const paths = calculateMovePaths(move, set);
            assert(hasNoOverlaps(paths), `${move.type} should have no overlaps`);
            assert(allWaypointsInBounds(paths), `${move.type} should stay in bounds`);
            executeMove(set, move);
            set.dancers.forEach((dancer, index) => {
                assert(paths.get(dancer.id).end.equals(set.getPositions()[index]), `${move.type}: ${dancer.id} end`);
            });
            // The step out goes straight from the circle to the new corner: it
            // shouldn't be longer than the step in
            for (const dancer of set.dancers) {
                const waypoints = paths.get(dancer.id).getWaypoints().map(w => toPixels(w, 800, 1000));
                if (waypoints.length < 4) continue;
                const stepIn = Math.hypot(waypoints[1].x - waypoints[0].x, waypoints[1].y - waypoints[0].y);
                const stepOut = Math.hypot(waypoints.at(-1).x - waypoints.at(-2).x, waypoints.at(-1).y - waypoints.at(-2).y);
                assert(Math.abs(stepIn - stepOut) < 1, `${move.type}: ${dancer.id} should step out as far as in`);
            }
        }
    }
});

test('stars should hold hands in the middle of each minor set while they turn', () => {
    const set = new Set(6);
    const paths = calculateMovePaths({ type: 'star left 4 places', beats: 8 }, set);
    assert.deepStrictEqual(paths.holds, set.minorSetStarts().map(i => ({
        ids: set.dancers.slice(i, i + 4).map(d => d.id),
        from: 1,
        to: 7
    })));
});

test('circles should hold hands all the way around each minor set', () => {
    const set = new Set(6);
    const paths = calculateMovePaths({ type: 'circle left 3 places', beats: 6 }, set);
    assert.equal(paths.holds.length, set.minorSetStarts().length);
    for (const [k, i] of set.minorSetStarts().entries()) {
        const hold = paths.holds[k];
        assert.equal(hold.shape, 'ring');
        assert.equal(hold.from, 0.5);
        assert.equal(hold.to, 5.5);
        assert.deepStrictEqual([...hold.ids].sort(), set.dancers.slice(i, i + 4).map(d => d.id).sort());
        // In order around the circle: each is beside the next, never across from them
        const starts = hold.ids.map(id => paths.get(id).start);
        const mid = center(starts);
        const side = p => [Math.sign(p.x - mid.x), Math.sign(p.y - mid.y)];
        for (let j = 0; j < 4; j++) {
            const [a, b] = [side(starts[j]), side(starts[(j + 1) % 4])];
            assert(a[0] === b[0] || a[1] === b[1], `${hold.ids[j]} and ${hold.ids[(j + 1) % 4]} should be beside each other`);
        }
    }
    assert.equal(calculateMovePaths({ type: 'balance', who: 'neighbor', beats: 4 }, set).holds, undefined);
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
        assert(hasNoOverlaps(paths),
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
    assert(hasNoOverlaps(paths, 40), 'Progression paths should have no overlaps');
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

test('robins chain: each couple holds hands while they courtesy turn', () => {
    const { paths, couples } = chainFromSimplicitySwingB1();
    for (const { robin, lark } of couples) {
        assert.deepStrictEqual(paths.holds.find(hold => hold.ids.includes(robin)),
            { ids: [lark, robin], shape: 'line', from: 3, to: 7 });
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
    assert(!isMoveSupported({ type: 'petronella', who: 'all', beats: 8 }, improper));
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

test('an unsupported move should still progress when it is the progression', () => {
    const set = new Set(6);
    executeMove(set, { type: 'balance', beats: 4 });
    executeMove(set, { type: 'petronella', who: 'all', beats: 8, progression: true });
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

test('a progression should not happen before the dance has started', () => {
    const set = new Set(6);
    const move = { type: 'balance', who: 'neighbor', beats: 4, progression: true };
    executeMove(set, move);
    assert(set.dancers.every(d => d.active), 'nobody should wait out the first time through');
    executeMove(set, move);
    assert(!set.dancers[0].active, 'the top couple should wait out once the dance has started');
});

test('every move should record exactly one undo snapshot', () => {
    const set = new Set(6);
    executeMove(set, { type: 'balance', beats: 4 });
    const moves = [
        { type: 'do-si-do', who: 'new neighbor', beats: 8, progression: true },
        { type: 'petronella', who: 'all', beats: 8 },
        { type: 'down the center', who: 'ones', beats: 4 },
        { type: 'swing', who: 'neighbor', beats: 12 }
    ];
    for (const move of moves) {
        const before = { ids: set.dancers.map(d => d.id), active: set.dancers.map(d => d.active),
            positions: set.getPositions() };
        const depth = set.snapshots.length;
        executeMove(set, move);
        assert.equal(set.snapshots.length, depth + 1, `${move.type} should take one snapshot`);
        set.undo();
        assert.deepEqual(set.dancers.map(d => d.id), before.ids, `undoing ${move.type} should restore places`);
        assert.deepEqual(set.dancers.map(d => d.active), before.active, `undoing ${move.type} should restore active`);
        assert.deepEqual(set.getPositions(), before.positions, `undoing ${move.type} should restore positions`);
        executeMove(set, move);
    }
});

// Down the center, turn alone, come back and cast off

/** A proper set with the ones at the top of each minor set */
function properSet() {
    return new Set(6, 'proper');
}

const ONES_DOWN = { type: 'down the center', who: 'ones', beats: 4 };
const ONES_TURN = { type: 'turn alone', who: 'ones', beats: 4 };
const ONES_UP = { type: 'up the center', who: 'ones', beats: 4 };
const ONES_CAST = { type: 'cast off', who: 'ones', beats: 4 };

test('going down the center should take the ones into the middle and down the hall', () => {
    const set = properSet();
    const before = set.getPositions();
    executeMove(set, ONES_DOWN);
    const after = set.getPositions();
    set.dancers.forEach((dancer, index) => {
        if (dancer.couple.coupleNumber === 1) {
            assert(after[index].y > before[index].y + 10, `${dancer.getLabel()} should go down`);
            assert(Math.abs(after[index].x - 43.75) < 5, `${dancer.getLabel()} should be near the middle`);
        } else {
            assert(after[index].equals(before[index]), `${dancer.getLabel()} should stay put`);
        }
    });
    // Each walks on their own side of the middle
    assert(after[0].x < 43.75 && after[1].x > 43.75);
});

test('coming back up the center should return the ones to where they turned', () => {
    const set = properSet();
    executeMove(set, ONES_DOWN);
    const down = set.getPositions();
    executeMove(set, ONES_TURN);
    assert.deepEqual(set.getPositions(), down, 'turning alone should not move anyone');
    executeMove(set, ONES_UP);
    const up = set.getPositions();
    set.dancers.forEach((dancer, index) => {
        if (dancer.couple.coupleNumber === 1) {
            assert(up[index].y < down[index].y - 10, `${dancer.getLabel()} should come back up`);
        }
    });
});

test('casting off should put the ones in the lines below the twos', () => {
    const set = properSet();
    const before = set.dancers.map(d => d.getLabel());
    for (const move of [ONES_DOWN, ONES_TURN, ONES_UP, ONES_CAST]) {
        executeMove(set, move);
    }
    assert.deepEqual(before.slice(0, 4), ['L1', 'R1', 'L2', 'R2']);
    assert.deepEqual(set.dancers.map(d => d.getLabel()).slice(0, 4), ['L2', 'R2', 'L1', 'R1']);
    assert.equal(set.offsets.size, 0, 'everyone should be back in places');
});

test('casting off from below the twos should leave the twos in place', () => {
    const set = new Set(6);
    executeMove(set, { type: 'swing', who: 'neighbor', beats: 12 }); // ones end below
    const before = set.dancers.map(d => d.id);
    executeMove(set, ONES_CAST);
    assert.deepEqual(set.dancers.map(d => d.id), before);
});

test('down the center, turn alone, up the center and cast off paths should not collide', () => {
    for (const set of [properSet(), new Set(6)]) {
        for (const move of [ONES_DOWN, ONES_TURN, ONES_UP, ONES_CAST]) {
            const paths = calculateMovePaths(move, set);
            // The ones hold each other in the swing, so they come closer than in the rest
            const minDistance = move === ONES_SWING ? 40 : 44;
            assert(hasNoOverlaps(paths, minDistance), `${set.formation} ${move.type} should have no overlaps`);
            assert(allWaypointsInBounds(paths), `${set.formation} ${move.type} should stay in bounds`);
            executeMove(set, move);
        }
    }
});

test('paths for the ones\' figures should start and end where the set says', () => {
    const set = properSet();
    for (const move of [ONES_DOWN, ONES_TURN, ONES_UP, ONES_CAST]) {
        const start = set.getPositions();
        const paths = calculateMovePaths(move, set);
        const ids = set.dancers.map(d => d.id);
        executeMove(set, move);
        const end = new Map(set.dancers.map((d, i) => [d.id, set.getPositions()[i]]));
        ids.forEach((id, index) => {
            assert(paths.get(id).start.equals(start[index]), `${move.type}: ${id} start`);
            assert(paths.get(id).end.equals(end.get(id)), `${move.type}: ${id} end`);
        });
    }
});

test('turning alone should loop on the spot', () => {
    const set = properSet();
    executeMove(set, ONES_DOWN);
    const paths = calculateMovePaths(ONES_TURN, set);
    const one = paths.get(set.dancers[0].id);
    assert(one.start.equals(one.end));
    assert(one.getWaypoints().some(p => distance(p, one.start) > 1), 'should move during the turn');
    const two = paths.get(set.dancers[2].id);
    assert(two.getWaypoints().every(p => p.equals(two.start)), 'twos should stand still');
});

test('the path cache key should depend on where dancers are off their places', () => {
    const set = properSet();
    const key = pathCacheKey(ONES_TURN, set);
    executeMove(set, ONES_DOWN);
    assert.notEqual(pathCacheKey(ONES_TURN, set), key);
});

// Ones balance and swing in the center

const ONES_BALANCE = { type: 'balance', who: 'ones', beats: 4 };
const ONES_SWING = { type: 'swing', who: 'ones', beats: 12 };

/** An improper set after the neighbor swing, with the ones below the twos */
function afterNeighborSwing() {
    const set = new Set(6);
    executeMove(set, { type: 'swing', who: 'neighbor', beats: 12 });
    return set;
}

test('the ones should balance towards each other while the twos stand still', () => {
    const set = afterNeighborSwing();
    const paths = calculateMovePaths(ONES_BALANCE, set);
    set.dancers.forEach(dancer => {
        const path = paths.get(dancer.id);
        assert(path.start.equals(path.end), 'a balance ends where it starts');
        const moves = path.getWaypoints().some(p => distance(p, path.start) > 1);
        assert.equal(moves, dancer.couple.coupleNumber === 1, `${dancer.getLabel()} should ${moves ? 'not ' : ''}move`);
    });
    const [r1, l1] = [set.dancers[2], set.dancers[3]];
    assert.equal(r1.getLabel() + l1.getLabel(), 'R1L1');
    const r1Mid = paths.get(r1.id).getPositionAt(0.5);
    assert(r1Mid.x > paths.get(r1.id).start.x + 1, 'R1 should step across towards L1');
});

test('the ones should swing in the middle and end side by side facing down', () => {
    const set = afterNeighborSwing();
    const before = set.getPositions();
    executeMove(set, ONES_SWING);
    const after = set.getPositions();
    // R1 and L1 are in the bottom row of the top minor set
    const [r1, l1] = [set.dancers[2], set.dancers[3]];
    assert.equal(r1.getLabel() + l1.getLabel(), 'R1L1');
    assert(after[2].x < 43.75 && after[3].x > 43.75, 'facing down, the robin is on the lark\'s right');
    assert(Math.abs(after[2].y - before[2].y) < 0.01, 'they swing at their row');
    assert(Math.abs(after[3].x - after[2].x) < 10, 'they end side by side in the middle');
    for (const index of [0, 1]) {
        assert(after[index].equals(before[index]), 'the twos stay put');
    }
});

test('the ones should end facing up with the robin on the lark\'s right, trading places if need be', () => {
    const set = afterNeighborSwing();
    executeMove(set, { ...ONES_SWING, facing: 'up' });
    const positions = set.getPositions();
    const robin = set.dancers.findIndex(d => d.getLabel() === 'R1');
    const lark = set.dancers.findIndex(d => d.getLabel() === 'L1');
    assert(positions[robin].x > positions[lark].x, 'facing up, the robin is on the right');
    assert.equal(robin % 2, 1, 'the robin should be in the right column');
    assert.equal(lark % 2, 0, 'the lark should be in the left column');
});

test('the ones\' balance and swing should not collide and should end where the set says', () => {
    for (const set of [afterNeighborSwing(), new Set(6, 'proper')]) {
        for (const move of [ONES_BALANCE, ONES_SWING, ONES_DOWN, ONES_TURN, ONES_UP, ONES_CAST]) {
            const paths = calculateMovePaths(move, set);
            // The ones hold each other in the swing, so they come closer than in the rest
            const minDistance = move === ONES_SWING ? 40 : 44;
            assert(hasNoOverlaps(paths, minDistance), `${set.formation} ${move.type} should have no overlaps`);
            assert(allWaypointsInBounds(paths), `${set.formation} ${move.type} should stay in bounds`);
            executeMove(set, move);
            set.dancers.forEach((dancer, index) => {
                assert(paths.get(dancer.id).end.equals(set.getPositions()[index]), `${move.type}: ${dancer.id} end`);
            });
        }
    }
});

// Half hey

const HALF_HEY = { type: 'half hey', who: 'all', beats: 8 };

/** An improper set as Hay in the Barn has it for its first half hey: in each minor
 * set, the twos on the left (lark above robin) and the ones on the right */
function beforeHalfHey() {
    const set = new Set(6);
    executeMove(set, { type: 'swing', who: 'neighbor', beats: 12 });
    executeMove(set, { type: 'chain to partner', who: 'robins', beats: 8 });
    return set;
}

test('half a hey should reverse the line: larks trade places, and so do robins', () => {
    const set = beforeHalfHey();
    assert.deepEqual(set.dancers.slice(0, 4).map(d => d.getLabel()), ['L2', 'R1', 'R2', 'L1']);
    executeMove(set, HALF_HEY);
    assert.deepEqual(set.dancers.slice(0, 4).map(d => d.getLabel()), ['L1', 'R2', 'R1', 'L2']);
});

test('half hey paths should not collide, and should start and end where the set says', () => {
    const set = beforeHalfHey();
    const start = set.getPositions();
    const ids = set.dancers.map(d => d.id);
    const paths = calculateMovePaths(HALF_HEY, set);
    assert(hasNoOverlaps(paths), 'half hey should have no overlaps');
    assert(allWaypointsInBounds(paths), 'half hey should stay in bounds');
    executeMove(set, HALF_HEY);
    const end = new Map(set.dancers.map((d, i) => [d.id, set.getPositions()[i]]));
    ids.forEach((id, index) => {
        assert(paths.get(id).start.equals(start[index]), `${id} should start in place`);
        assert(paths.get(id).end.equals(end.get(id)), `${id} should end in place`);
    });
});

test('in half a hey everyone should travel', () => {
    const set = beforeHalfHey();
    const paths = calculateMovePaths(HALF_HEY, set);
    for (const [id, path] of paths) {
        assert(!path.start.equals(path.end), `${id} should end somewhere else`);
    }
});

test('half a hey with the robins starting in the other diagonal should say it is not animated', () => {
    const set = new Set(6); // R1 above L2 on the left
    assert.throws(() => calculateMovePaths(HALF_HEY, set), /not animated yet/);
});

// Right and left through

const RIGHT_AND_LEFT = { type: 'right and left through', who: 'neighbor', beats: 8 };

/** Jefferson and Liberty's B2: a proper set after the ones cast off, the larks on the
 * left and the robins on the right */
function afterCastOff() {
    const set = new Set(6, 'proper');
    for (const move of [ONES_DOWN, ONES_TURN, ONES_UP, ONES_CAST]) {
        executeMove(set, move);
    }
    return set;
}

test('a right and left through should put everyone diagonally across the minor set', () => {
    const set = afterCastOff();
    assert.deepEqual(set.dancers.slice(0, 4).map(d => d.getLabel()), ['L2', 'R2', 'L1', 'R1']);
    executeMove(set, RIGHT_AND_LEFT);
    assert.deepEqual(set.dancers.slice(0, 4).map(d => d.getLabel()), ['R1', 'L1', 'R2', 'L2']);
    executeMove(set, RIGHT_AND_LEFT);
    assert.deepEqual(set.dancers.slice(0, 4).map(d => d.getLabel()), ['L2', 'R2', 'L1', 'R1'],
        'over and back should return everyone home');
});

test('right and left through paths should not collide, and should start and end where the set says', () => {
    for (const set of [afterCastOff(), new Set(6)]) {
        const start = set.getPositions();
        const ids = set.dancers.map(d => d.id);
        const paths = calculateMovePaths(RIGHT_AND_LEFT, set);
        assert(hasNoOverlaps(paths), `${set.formation} right and left through should have no overlaps`);
        assert(allWaypointsInBounds(paths), `${set.formation} right and left through should stay in bounds`);
        executeMove(set, RIGHT_AND_LEFT);
        const end = new Map(set.dancers.map((d, i) => [d.id, set.getPositions()[i]]));
        ids.forEach((id, index) => {
            assert(paths.get(id).start.equals(start[index]), `${id} should start in place`);
            assert(paths.get(id).end.equals(end.get(id)), `${id} should end in place`);
        });
    }
});

test('in a right and left through the two on each side hold hands as they courtesy turn', () => {
    const set = afterCastOff();
    const paths = calculateMovePaths(RIGHT_AND_LEFT, set);
    assert.equal(paths.holds.length, 2 * set.minorSetStarts().length);
    executeMove(set, RIGHT_AND_LEFT);
    for (const hold of paths.holds) {
        assert.equal(hold.shape, 'line');
        assert.equal(hold.from, RIGHT_AND_LEFT.beats / 2, 'they take hands as they start to turn');
        assert(hold.to > RIGHT_AND_LEFT.beats - 1, 'they hold on until they are nearly in place');
        // The two end side by side, on the same side of the set
        const [p1, p2] = hold.ids.map(id => paths.get(id).end);
        assert(Math.abs(p1.x - p2.x) < 0.01, `${hold.ids.join('/')} should end on the same side`);
    }
});

test('in a right and left through the dancers should pass right shoulders', () => {
    const set = afterCastOff();
    const paths = calculateMovePaths(RIGHT_AND_LEFT, set);
    // L2 crosses from the left to the right, R2 from the right to the left
    const [l2, r2] = [set.dancers[0], set.dancers[1]];
    const quarter = [paths.get(l2.id).getPositionAt(0.25), paths.get(r2.id).getPositionAt(0.25)];
    assert(quarter[0].y < quarter[1].y, 'heading right, L2 should keep R2 on the right (below)');
});

// Down and up the outside

const ONES_DOWN_OUTSIDE = { type: 'down the outside', who: 'ones', beats: 8 };
const ONES_UP_OUTSIDE = { type: 'up the outside', who: 'ones', beats: 8 };

test('going down the outside should take the ones outside the lines and down the hall', () => {
    const set = properSet();
    const before = set.getPositions();
    executeMove(set, ONES_DOWN_OUTSIDE);
    const after = set.getPositions();
    set.dancers.forEach((dancer, index) => {
        if (dancer.couple.coupleNumber === 1) {
            assert(after[index].y > before[index].y + 10, `${dancer.getLabel()} should go down`);
            const outward = index % 2 === 0 ? before[index].x - after[index].x : after[index].x - before[index].x;
            assert(outward > 3, `${dancer.getLabel()} should be outside the line`);
        } else {
            assert(after[index].equals(before[index]), `${dancer.getLabel()} should stay put`);
        }
    });
});

test('coming up the outside should return the ones to their places', () => {
    const set = properSet();
    const before = set.getPositions();
    executeMove(set, ONES_DOWN_OUTSIDE);
    executeMove(set, ONES_UP_OUTSIDE);
    assert.deepEqual(set.getPositions(), before);
});

test('down and up the outside paths should not collide, and should end where the set says', () => {
    const set = properSet();
    for (const move of [ONES_DOWN_OUTSIDE, ONES_UP_OUTSIDE]) {
        const paths = calculateMovePaths(move, set);
        assert(hasNoOverlaps(paths), `${move.type} should have no overlaps`);
        assert(allWaypointsInBounds(paths), `${move.type} should stay in bounds`);
        executeMove(set, move);
        set.dancers.forEach((dancer, index) => {
            assert(paths.get(dancer.id).end.equals(set.getPositions()[index]), `${move.type}: ${dancer.id} end`);
        });
    }
});

// Contra corners

const ONES_CONTRA_CORNERS = { type: 'turn contra corners', who: 'ones', beats: 16 };

test('contra corners should leave the ones crossed over in the middle, facing each other', () => {
    const set = afterCastOff(); // L2 R2 / L1 R1 in each minor set
    executeMove(set, ONES_CONTRA_CORNERS);
    assert.deepEqual(set.dancers.slice(0, 4).map(d => d.getLabel()), ['L2', 'R2', 'R1', 'L1']);
    const positions = set.getPositions();
    assert(positions[2].x > 33.75 + 3 && positions[2].x < 43.75, 'R1 should be in the middle, left of center');
    assert(positions[3].x < 53.75 - 3 && positions[3].x > 43.75, 'L1 should be in the middle, right of center');
    assert(Math.abs(positions[2].y - positions[3].y) < 0.01, 'the ones should be level');
    for (const index of [0, 1]) {
        assert(!set.offsets.has(set.dancers[index].id), 'the twos should be in their places');
    }
});

test('contra corners should turn the corners on the diagonals', () => {
    const set = afterCastOff();
    // L1 (left, second row) has R2 below right as first corner and R2 above right as second
    assert.deepEqual(set.contraCornersOf(2), { first: 5, second: 1 });
    // R1 (right, second row) has L2 above left as first corner and L2 below left as second
    assert.deepEqual(set.contraCornersOf(3), { first: 0, second: 4 });
});

test('in contra corners every corner should turn and end in place', () => {
    const set = afterCastOff();
    const paths = calculateMovePaths(ONES_CONTRA_CORNERS, set);
    set.dancers.forEach(dancer => {
        if (dancer.couple.coupleNumber !== 2 || !dancer.active) return;
        const path = paths.get(dancer.id);
        assert(path.start.equals(path.end), `${dancer.id} should end in place`);
        assert(path.getWaypoints().some(p => distance(p, path.start) > 2), `${dancer.id} should turn`);
    });
});

test('contra corners paths should not collide, and should start and end where the set says', () => {
    const set = afterCastOff();
    const start = set.getPositions();
    const ids = set.dancers.map(d => d.id);
    const paths = calculateMovePaths(ONES_CONTRA_CORNERS, set);
    assert(hasNoOverlaps(paths), 'contra corners should have no overlaps');
    assert(allWaypointsInBounds(paths), 'contra corners should stay in bounds');
    executeMove(set, ONES_CONTRA_CORNERS);
    const end = new Map(set.dancers.map((d, i) => [d.id, set.getPositions()[i]]));
    ids.forEach((id, index) => {
        assert(paths.get(id).start.equals(start[index]), `${id} should start in place`);
        assert(paths.get(id).end.equals(end.get(id)), `${id} should end where the set says`);
    });
});

test('in contra corners the two turning should hold hands while they turn', () => {
    const set = afterCastOff();
    const paths = calculateMovePaths(ONES_CONTRA_CORNERS, set);
    const ones = set.dancers.filter(d => d.couple.coupleNumber === 1 && d.active);
    for (const one of ones) {
        // Twice with their partner, and once with each corner that is really there
        const held = paths.holds.filter(hold => hold.ids.includes(one.id));
        const withPartner = held.filter(hold => hold.ids.includes(one.partner.id));
        const { first, second } = set.contraCornersOf(set.dancers.indexOf(one));
        const corners = [first, second].filter(i => set.dancers[i]);
        assert.equal(withPartner.length, 2, `${one.id} should turn their partner twice`);
        assert.equal(held.length, 2 + corners.length, `${one.id} should hold each corner's hand`);
        for (const hold of held) {
            assert.equal(hold.shape, 'line');
            assert.equal(hold.ids.length, 2);
            // Close enough to join hands half way through the turn
            const [p1, p2] = hold.ids.map(id => toPixels(
                paths.get(id).getPositionAtBeat((hold.from + hold.to) / 2), 800, 1000));
            assert(Math.hypot(p1.x - p2.x, p1.y - p2.y) < 60, `${hold.ids.join('/')} should be close while turning`);
        }
    }
});

// Partner balance

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
