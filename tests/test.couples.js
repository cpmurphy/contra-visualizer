// Unit tests for the figures danced by one couple, the ones or the twos

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { executeMove } from '../moves.js';
import { toPixels, distance } from '../positions.js';
import { allWaypointsInBounds, hasNoOverlaps } from './helpers/paths.js';
import { properSet, ONES_DOWN, ONES_TURN, ONES_UP, ONES_CAST, afterCastOff } from './helpers/sets.js';

// Down the center, turn alone, come back and cast off

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
