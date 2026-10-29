import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform } from '../performance.js';
import { findDance } from '../library.js';
import { calculateMovePaths } from '../pathCalculator.js';
import { Set } from '../dancers.js';

const DANCE = findDance('simplicity-swing');
const MOVE_COUNT = DANCE.parts.flatMap(part => part.moves).length;
const LAST_PART = DANCE.parts.length - 1;
const LAST_MOVE = DANCE.parts[LAST_PART].moves.length - 1;

const ids = danced => danced.dancers().map(d => d.id).join(',');

test('perform gives null for a formation we cannot lay out', () => {
    assert.equal(perform({ ...DANCE, formation: 'becket' }), null);
});

test('a danced starts at the top', () => {
    const danced = perform(DANCE);
    assert.equal(danced.partIndex, 0);
    assert.equal(danced.moveIndex, 0);
    assert.ok(danced.atTop);
    assert.equal(danced.currentMove, DANCE.parts[0].moves[0]);
});

test('next goes through the moves in order and wraps around to the top', () => {
    const danced = perform(DANCE);
    const moves = DANCE.parts.flatMap(part => part.moves);
    for (let i = 1; i < MOVE_COUNT; i++) {
        danced.next();
        assert.equal(danced.currentMove, moves[i]);
    }
    assert.deepEqual([danced.partIndex, danced.moveIndex], [LAST_PART, LAST_MOVE]);
    danced.next();
    assert.ok(danced.atTop);
});

test('previous undoes next, back to the top of the dance', () => {
    const danced = perform(DANCE);
    const before = [];
    for (let i = 0; i < MOVE_COUNT; i++) {
        before.push(ids(danced));
        danced.next();
    }
    for (let i = MOVE_COUNT - 1; i >= 0; i--) {
        danced.previous();
        assert.equal(ids(danced), before[i]);
    }
    assert.ok(danced.atTop);
});

test('previous from the top wraps around to the last move', () => {
    const danced = perform(DANCE);
    danced.previous();
    assert.equal(danced.partIndex, LAST_PART);
    assert.equal(danced.moveIndex, LAST_MOVE);
});

test('restart puts everyone back in their starting places', () => {
    const danced = perform(DANCE);
    const start = ids(danced);
    danced.next();
    danced.next();
    danced.restart();
    assert.ok(danced.atTop);
    assert.equal(ids(danced), start);
});

test('paths are for the current move, with the next worked out from after it', () => {
    const danced = perform(DANCE);
    const { current, next } = danced.paths();

    assert.deepEqual(current, calculateMovePaths(DANCE.parts[0].moves[0], new Set(6)));
    danced.next();
    assert.deepEqual(next, danced.paths().current);
});

test('paths leave the set where it was', () => {
    const danced = perform(DANCE);
    const before = ids(danced);
    danced.paths();
    assert.equal(ids(danced), before);
    assert.ok(danced.atTop);
});

test('paths are cached', () => {
    const danced = perform(DANCE);
    assert.equal(danced.paths().current, danced.paths().current);
});

test('waiting paths hold everyone where the current move starts', () => {
    const danced = perform(DANCE);
    const { current, next } = danced.waitingPaths(4);
    assert.equal(next, danced.paths().current);
    for (const [id, path] of current) {
        const start = next.get(id).getPositionAtBeat(0);
        assert.deepEqual(path.getPositionAtBeat(0), start);
        assert.deepEqual(path.getPositionAtBeat(4), start);
    }
});

test('dancers says who each dancer is and where they are', () => {
    const danced = perform(DANCE);
    const dancers = danced.dancers();
    assert.equal(dancers.length, 12);
    // Improper: the ones are crossed over, robin on the left
    assert.equal(dancers[0].label, 'R1');
    assert.equal(dancers[1].label, 'L1');
    assert.ok(dancers.every(d => d.color && d.position));

    const moved = new Map(dancers.map(d => [d.id, { x: 1, y: 2 }]));
    assert.ok(danced.dancers(moved).every(d => d.position.x === 1 && d.position.y === 2));
});

test('isSupported says which moves are animated', () => {
    const danced = perform(DANCE);
    assert.ok(danced.isSupported({ type: 'circle left 4', beats: 8 }));
    assert.ok(!danced.isSupported({ type: 'mad robin', who: 'robins', beats: 8 }));
});
