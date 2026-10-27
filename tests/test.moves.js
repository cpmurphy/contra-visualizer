// Unit tests for what moves do to the set

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { isMoveSupported, pathCacheKey, withSetState, executeMove } from '../moves.js';
import { properSet, ONES_DOWN, ONES_TURN } from './helpers/sets.js';

test('withSetState restores the Set after reading', () => {
    const set = new Set(6);
    const before = set.dancers.map(d => d.id);

    const changed = withSetState(set, s => s.progress(), s => s.dancers.map(d => d.id));

    assert.notDeepStrictEqual(changed, before);
    assert.deepStrictEqual(set.dancers.map(d => d.id), before);
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

test('the path cache key should depend on where dancers are off their places', () => {
    const set = properSet();
    const key = pathCacheKey(ONES_TURN, set);
    executeMove(set, ONES_DOWN);
    assert.notEqual(pathCacheKey(ONES_TURN, set), key);
});
