// Unit tests for path calculator

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { isMoveSupported, pathCacheKey, executeMove } from '../moves.js';
import { toPixels, distance } from '../positions.js';
import { allWaypointsInBounds, hasNoOverlaps } from './helpers/paths.js';

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

test('robins chain: robins hold hands while they pull by', () => {
    const { paths, couples } = chainFromSimplicitySwingB1();
    const robins = couples.map(c => c.robin);
    const hold = paths.holds.find(h => robins.every(id => h.ids.includes(id)));
    assert(hold, 'the robins should hold hands');
    assert.equal(hold.shape, 'line');
    assert(hold.from > 0 && hold.to < 3 && hold.from < hold.to, 'they should let go before the courtesy turn');
    // Close together, on the pull-by circle, all the while they hold on
    for (let beat = hold.from; beat <= hold.to; beat += 0.1) {
        const [p1, p2] = robins.map(id => toPixels(paths.get(id).getPositionAtBeat(beat), 800, 1000));
        const apart = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        assert(apart > 54 && apart < 58, `the robins should be on the pull-by circle at beat ${beat} (${apart.toFixed(1)}px apart)`);
    }
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

test('each one casting off should hold hands with the two they go around', () => {
    const set = properSet();
    for (const move of [ONES_DOWN, ONES_TURN, ONES_UP]) {
        executeMove(set, move);
    }
    const paths = calculateMovePaths(ONES_CAST, set);
    const ones = set.dancers.filter(d => d.couple.coupleNumber === 1 && d.active);
    assert.equal(paths.holds.length, ones.length);
    for (const one of ones) {
        const hold = paths.holds.find(h => h.ids[0] === one.id);
        const two = set.dancers.find(d => d.id === hold.ids[1]);
        assert.equal(two.couple.coupleNumber, 2, `${one.id} should cast around a two`);
        assert.equal(two.role, one.role, `${one.id} should cast around the two on their side`);
        assert.equal(hold.shape, 'line');
        assert.equal(hold.from, 0.5);
        assert.equal(hold.to, ONES_CAST.beats - 0.5);
    }

    // Casting off from below the twos goes around no one
    const below = new Set(6);
    executeMove(below, { type: 'swing', who: 'neighbor', beats: 12 });
    assert.deepStrictEqual(calculateMovePaths(ONES_CAST, below).holds, []);
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
