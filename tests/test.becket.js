// Unit tests for Becket formation: partners side by side in the lines, shadows
// beside them, and the progression by sliding left

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { findDance } from '../library.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { executeMove, isMoveSupported } from '../moves.js';
import { toPixels } from '../positions.js';
import { SVG_WIDTH, SVG_HEIGHT } from '../layout.js';
import { allWaypointsInBounds, hasNoOverlaps } from './helpers/paths.js';

const BECKET_REEL = findDance('becket-reel');
const SHADOW_ALLEMANDE = { type: 'allemande left', who: 'shadow', beats: 6 };
const DIAGONAL_RIGHT_AND_LEFT = {
    type: 'right and left through', who: 'neighbor', direction: 'left diagonal', beats: 8, progression: true
};

/** A Becket set that has started dancing, so a progression happens */
function startedSet() {
    const set = new Set(6, 'becket');
    executeMove(set, { type: 'swing', who: 'partner', beats: 10 });
    return set;
}

/** Each couple, as their places in the set, top to bottom */
function couplePlaces(set) {
    const places = new Map();
    set.dancers.forEach((dancer, index) => {
        const list = places.get(dancer.couple) || [];
        list.push(index);
        places.set(dancer.couple, list);
    });
    return places;
}

test('a Becket set has couples side by side in the lines, facing a couple across', () => {
    const set = new Set(6, 'becket');
    assert.ok(set.couplesInLines());
    assert.ok(set.dancers.every(dancer => dancer.active));
    for (const i of set.minorSetStarts()) {
        const [topLeft, topRight, bottomLeft, bottomRight] = set.dancers.slice(i, i + 4);
        // Facing across, the robin is on the lark's right
        assert.equal(topLeft.role, 'lark');
        assert.equal(bottomLeft, topLeft.partner);
        assert.equal(topRight.role, 'robin');
        assert.equal(bottomRight, topRight.partner);
        assert.notEqual(topLeft.couple, topRight.couple);
    }
    assert.deepEqual(set.minorSetStarts(), [0, 4, 8]);
});

test('a Becket set needs an even number of couples', () => {
    assert.throws(() => new Set(5, 'becket'), /even number/);
});

test('sliding left moves the left line up and the right line down, the ends crossing over', () => {
    const set = new Set(6, 'becket');
    const before = couplePlaces(set);
    set.progress();
    const after = couplePlaces(set);

    for (const [couple, [top]] of before) {
        const [newTop] = after.get(couple);
        if (top === 0) {
            // Top of the left line: over to the top of the right
            assert.equal(newTop, 1);
        } else if (top === set.dancers.length - 3) {
            // Bottom of the right line: over to the bottom of the left
            assert.equal(newTop, set.dancers.length - 4);
        } else {
            // One couple's place (two rows) up the left line, or down the right
            assert.equal(newTop, top % 2 === 0 ? top - 4 : top + 4, `couple at ${top}`);
        }
    }
    assert.ok(set.couplesInLines(), 'couples should still face across, the robin on the lark\'s right');
});

test('sliding left all the way around brings everyone home, and undoes', () => {
    const set = new Set(6, 'becket');
    const home = set.dancers.map(dancer => dancer.id);
    set.progress();
    const once = set.dancers.map(dancer => dancer.id);
    for (let k = 1; k < 6; k++) set.progress();
    assert.deepEqual(set.dancers.map(dancer => dancer.id), home);

    set.undo();
    for (let k = 1; k < 5; k++) set.undo();
    assert.deepEqual(set.dancers.map(dancer => dancer.id), once);
});

test('shadows are the lark and robin beside each other in a line, from different couples', () => {
    const set = new Set(6, 'becket');
    const pairs = set.shadowPairs();
    assert.equal(pairs.length, 4);
    for (const [a, b] of pairs) {
        const [d1, d2] = [set.dancers[a], set.dancers[b]];
        assert.notEqual(d1.role, d2.role);
        assert.notEqual(d1.partner, d2);
        // Next to each other in the same line
        assert.equal(a % 2, b % 2);
        assert.equal(b - a, 2);
    }
    // The ends of the set have no shadows there
    const shadowed = pairs.flat();
    for (const end of [0, 1, set.dancers.length - 2, set.dancers.length - 1]) {
        assert.ok(!shadowed.includes(end), `place ${end}`);
    }
});

test('shadows are only worked out in Becket formation', () => {
    assert.throws(() => new Set(6).shadowPairs(), /Becket/);
    assert.ok(!isMoveSupported(SHADOW_ALLEMANDE, new Set(6)));
    assert.ok(isMoveSupported(SHADOW_ALLEMANDE, new Set(6, 'becket')));
});

test('a figure is danced as a Becket progression only if it can go on the left diagonal', () => {
    const set = new Set(6, 'becket');
    assert.ok(isMoveSupported(DIAGONAL_RIGHT_AND_LEFT, set));
    assert.ok(!isMoveSupported({ type: 'star left 4 places', beats: 8, progression: true }, set));
    assert.ok(isMoveSupported({ type: 'star left 4 places', beats: 8 }, set));
});

test('shadows allemande left once around their midpoint, holding hands, and end in place', () => {
    const set = new Set(6, 'becket');
    const paths = calculateMovePaths(SHADOW_ALLEMANDE, set);
    const positions = set.getPositions();
    const turning = set.shadowPairs().flat();

    set.dancers.forEach((dancer, index) => {
        const path = paths.get(dancer.id);
        assert.ok(path.start.equals(positions[index]) && path.end.equals(positions[index]), dancer.id);
        if (!turning.includes(index)) {
            assert.ok(path.getWaypoints().every(p => p.equals(positions[index])), `${dancer.id} stands still`);
        }
    });

    for (const [a, b] of set.shadowPairs()) {
        const [d1, d2] = [set.dancers[a], set.dancers[b]];
        assert.ok(paths.holds.some(hold => hold.ids.includes(d1.id) && hold.ids.includes(d2.id)));
        // Counter-clockwise from above is anticlockwise on screen: the cross product
        // of successive offsets from the middle is negative in y-down coordinates
        const middle = toPixels(positions[a], SVG_WIDTH, SVG_HEIGHT);
        middle.y = (middle.y + toPixels(positions[b], SVG_WIDTH, SVG_HEIGHT).y) / 2;
        const offset = beat => {
            const p = toPixels(paths.get(d1.id).getPositionAtBeat(beat), SVG_WIDTH, SVG_HEIGHT);
            return { x: p.x - middle.x, y: p.y - middle.y };
        };
        for (const beat of [1.5, 2.5, 3.5]) {
            const [u, v] = [offset(beat), offset(beat + 0.5)];
            assert.ok(u.x * v.y - u.y * v.x < 0, `${d1.id} at beat ${beat}`);
        }
    }
    assert.ok(hasNoOverlaps(paths));
});

test('a right and left through on the left diagonal swaps the couples there', () => {
    const set = startedSet();
    const before = couplePlaces(set);
    const coupleAt = new Map([...before].map(([couple, places]) => [places[0], couple]));
    const paths = calculateMovePaths(DIAGONAL_RIGHT_AND_LEFT, set);
    const start = set.getPositions();
    const startById = new Map(set.dancers.map((dancer, index) => [dancer.id, start[index]]));
    executeMove(set, DIAGONAL_RIGHT_AND_LEFT);
    const after = couplePlaces(set);

    // Each couple on the right faces the couple below them on the left, on their left diagonal
    for (let top = 1; top + 3 < set.dancers.length; top += 4) {
        const right = coupleAt.get(top);
        const left = coupleAt.get(top + 3);
        assert.deepEqual(after.get(right), before.get(left), 'the right couple takes the left couple\'s places');
        assert.deepEqual(after.get(left), before.get(right), 'and the left couple the right\'s');
    }
    // With no couple on their diagonal, the couples at the top left and bottom right stand still
    for (const top of [0, set.dancers.length - 3]) {
        assert.deepEqual(after.get(coupleAt.get(top)), before.get(coupleAt.get(top)));
    }
    // Everyone travels from where they were to where they end
    set.dancers.forEach((dancer, index) => {
        assert.ok(paths.get(dancer.id).start.equals(startById.get(dancer.id)), `${dancer.id} start`);
        assert.ok(paths.get(dancer.id).end.equals(set.getPositions()[index]), `${dancer.id} end`);
    });
    assert.ok(hasNoOverlaps(paths));
});

test('Becket Reel is animated all the way around the set, without collisions', () => {
    const set = new Set(6, 'becket');
    const home = set.dancers.map(dancer => dancer.id);
    // Each time through, everyone moves one couple's place around the set
    for (let round = 0; round < 6; round++) {
        for (const part of BECKET_REEL.parts) {
            for (const move of part.moves) {
                const label = `${part.name} ${move.type} (round ${round + 1})`;
                assert.ok(isMoveSupported(move, set), `${label}: animated`);
                const paths = calculateMovePaths(move, set);
                assert.ok(hasNoOverlaps(paths), `${label}: overlaps`);
                assert.ok(allWaypointsInBounds(paths), `${label}: off the floor`);
                executeMove(set, move);
                set.dancers.forEach((dancer, index) => {
                    assert.ok(paths.get(dancer.id).end.equals(set.getPositions()[index]), `${label}: ${dancer.id} end`);
                });
            }
        }
        assert.ok(set.couplesInLines(), `round ${round + 1}`);
    }
    assert.deepEqual(set.dancers.map(dancer => dancer.id), home);
});
