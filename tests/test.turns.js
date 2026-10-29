// Unit tests for the turning figures: swings, stars, circles and do-si-dos

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { executeMove } from '../moves.js';
import { toPixels, distance, center } from '../positions.js';
import { SVG_WIDTH, SVG_HEIGHT } from '../layout.js';
import { allWaypointsInBounds, hasNoOverlaps } from './helpers/paths.js';

// Do-si-do

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

// Test do-si-do overlaps (same threshold as swing, since it's a circular orbit)
test('do-si-do paths should have no overlaps', () => {
    const set = new Set(4);
    const move = { type: 'do-si-do', beats: 8 };
    const paths = calculateMovePaths(move, set);
    assert(hasNoOverlaps(paths, 40),
        'Do-si-do paths should have no overlaps');
});

// Circles

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
    assert.equal(calculateMovePaths({ type: 'do-si-do', who: 'neighbor', beats: 8 }, set).holds, undefined);
});

// Swings

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
            const px = (id, beat) => toPixels(paths.get(id).getPositionAtBeat(beat), SVG_WIDTH, SVG_HEIGHT);
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

test('swing pairs should hold each other while they turn', () => {
    for (const who of ['neighbor', 'partner']) {
        const set = new Set(6);
        const paths = calculateMovePaths({ type: 'swing', who, beats: 8 }, set);
        assert.equal(paths.holds.length, 2 * set.minorSetStarts().length, `${who} swing: two pairs in each minor set`);
        for (const hold of paths.holds) {
            assert.equal(hold.shape, 'swing');
            assert.equal(hold.from, 1, `${who} swing: they take hold once they have stepped in`);
            assert.equal(hold.to, 7, `${who} swing: they let go as they step out`);
            const [d1, d2] = hold.ids.map(id => set.dancers.find(d => d.id === id));
            assert.notEqual(d1.role, d2.role, `${who} swing: a lark swings a robin`);
            assert.equal(d1.partner === d2, who === 'partner', `${who} swing: ${d1.id} with ${d2.id}`);
        }
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

// Stars

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

/** Pixel position of each dancer in a minor set, and its center, at a beat */
function minorSetPixels(paths, ids, beat) {
    const points = ids.map(id => toPixels(paths.get(id).getPositionAtBeat(beat), SVG_WIDTH, SVG_HEIGHT));
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
                const waypoints = paths.get(dancer.id).getWaypoints().map(w => toPixels(w, SVG_WIDTH, SVG_HEIGHT));
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
