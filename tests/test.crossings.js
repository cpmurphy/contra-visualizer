// Unit tests for the figures in which dancers cross the set: chains, right and left
// throughs and heys

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { executeMove } from '../moves.js';
import { toPixels, distance } from '../positions.js';
import { SVG_WIDTH, SVG_HEIGHT } from '../layout.js';
import { allWaypointsInBounds, hasNoOverlaps } from './helpers/paths.js';
import { HALF_HEY, beforeHalfHey, afterCastOff } from './helpers/sets.js';

// Chains

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

// The robins chain: pulling by and courtesy turning

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
        const [p1, p2] = robins.map(id => toPixels(paths.get(id).getPositionAtBeat(beat), SVG_WIDTH, SVG_HEIGHT));
        const apart = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        assert(apart > 54 && apart < 58, `the robins should be on the pull-by circle at beat ${beat} (${apart.toFixed(1)}px apart)`);
    }
});

// Right and left through

const RIGHT_AND_LEFT = { type: 'right and left through', who: 'neighbor', beats: 8 };

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

// Half hey

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
