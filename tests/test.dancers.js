// Unit tests for dancers
//
// Requirements: Node.js 20+ (includes built-in test runner, ES modules)
//
// Run tests with:
//   node --test test/test.dancers.js
//   npm test
//   ./test.sh
//
// The built-in test runner provides:
//   - TAP (Test Anything Protocol) output
//   - Parallel test execution
//   - Built-in assertions
//   - No external dependencies

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';


function internallyProgress(set) {
    for (let i = 0; i < set.dancers.length; i+= 2) {
        if (set.dancers.length - i < 3) {
            break;
        }
        const temp1 = set.dancers[i];
        const temp2 = set.dancers[i + 1];
        set.dancers[i] = set.dancers[i + 2];
        set.dancers[i + 1] = set.dancers[i + 3];
        set.dancers[i + 2] = temp1;
        set.dancers[i + 3] = temp2;
    }
}

test('creating Set with even number of couples should make all active', () => {
    const set = new Set(4);
    set.dancers.forEach((dancer) => {
        assert(dancer.active, "all dancers should be active");
    });
});

test('creating Set with odd number of couples should make all but last couple active', () => {
    const set = new Set(5);
    set.dancers.forEach((dancer, index) => {
        if (index < 8) {
            assert(dancer.active, "first eight dancers should be active");
        } else {
            assert(!dancer.active, "last two dancers should be inactive");
        };
    });
});

test('creating Set with odd number of couples should order dancers as expected', () => {
    const set = new Set(3);
    assert.strictEqual(set.dancers[0].id, 'd2');
    assert.strictEqual(set.dancers[1].id, 'd1');
    assert.strictEqual(set.dancers[2].id, 'd3');
    assert.strictEqual(set.dancers[3].id, 'd4');
    // the last couple are out of the dance, so lark comes first
    assert.strictEqual(set.dancers[4].id, 'd5');
    assert.strictEqual(set.dancers[5].id, 'd6');
});

test('creating Set should alternate couple numbers', () => {
    const set = new Set(5);
    for (let i = 0; i < 8; i++) {
        const dancer = set.dancers[i];
        if (Math.trunc(i / 2) % 2 === 0) {
            assert.strictEqual(dancer.couple.coupleNumber, 1);
        } else {
            assert.strictEqual(dancer.couple.coupleNumber, 2);
        };
    }
    // because there is an uneven number of couples, the last couple are twos
    assert.strictEqual(set.dancers[8].couple.coupleNumber, 2);
    assert.strictEqual(set.dancers[9].couple.coupleNumber, 2);
});

test('creating Set (even number) should have minor sets arranged R1, L1, L2, R2', () => {
    const set = new Set(6);
    const expectedRoles = ['R1', 'L1', 'L2', 'R2'];
    set.dancers.forEach((dancer, index) => {
        assert.strictEqual(dancer.getLabel(), expectedRoles[index % 4]);
    });
});

test('creating Set (odd number) should rotate bottom couple', () => {
    const set = new Set(5);
    assert.strictEqual(set.dancers[8].getLabel(), 'L2');
    assert.strictEqual(set.dancers[9].getLabel(), 'R2');
});

test('rotating left by one place should skip inactive dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.rotateLeft(1);
    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
    assert.strictEqual(set.dancers[10].getLabel(), "L2");
    assert.strictEqual(set.dancers[11].getLabel(), "R2");
});

test('rotating left by one place should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.rotateLeft(1);
    assert.strictEqual(set.dancers[0].getLabel(), "L2");
    assert.strictEqual(set.dancers[1].getLabel(), "R1");
    assert.strictEqual(set.dancers[2].getLabel(), "R2");
    assert.strictEqual(set.dancers[3].getLabel(), "L1");
});

test('after progressing when top couple is inactive, rotating left by one place should rotate the minor sets with active dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.rotateLeft(1);
    assert.strictEqual(set.dancers[2].getLabel(), "L2");
    assert.strictEqual(set.dancers[3].getLabel(), "R1");
    assert.strictEqual(set.dancers[4].getLabel(), "R2");
    assert.strictEqual(set.dancers[5].getLabel(), "L1");
    assert.strictEqual(set.dancers[6].getLabel(), "L2");
    assert.strictEqual(set.dancers[7].getLabel(), "R1");
    assert.strictEqual(set.dancers[8].getLabel(), "R2");
    assert.strictEqual(set.dancers[9].getLabel(), "L1");
});

test('rotating left by two places should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.rotateLeft(2);
    assert.strictEqual(set.dancers[0].getLabel(), "R2");
    assert.strictEqual(set.dancers[1].getLabel(), "L2");
    assert.strictEqual(set.dancers[2].getLabel(), "L1");
    assert.strictEqual(set.dancers[3].getLabel(), "R1");
});

test('rotating left by three places should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.rotateLeft(3);
    assert.strictEqual(set.dancers[0].getLabel(), "L1");
    assert.strictEqual(set.dancers[1].getLabel(), "R2");
    assert.strictEqual(set.dancers[2].getLabel(), "R1");
    assert.strictEqual(set.dancers[3].getLabel(), "L2");
});

test('rotating left by four places should return active dancers to their original positions', () => {
    const set = new Set(2);
    set.rotateLeft(4);
    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
    assert.strictEqual(set.dancers[2].getLabel(), "L2");
    assert.strictEqual(set.dancers[3].getLabel(), "R2");
});


test('progressing Set (even number of couples) should put top couple out', () => {
    const set = new Set(6);
    set.progress();
    assert(!set.dancers[0].active);
    assert(!set.dancers[1].active);
});

test('progressing Set (even number of couples, all active) should rotate top couple', () => {
    const set = new Set(6);
    internallyProgress(set);
    assert.strictEqual(set.dancers[0].getLabel(), "L2");
    assert.strictEqual(set.dancers[1].getLabel(), "R2");
    set.progress();
    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
});

test('progressing Set (even number of couples, all active) should put bottom couple out', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    assert(!set.dancers[10].active);
    assert(!set.dancers[11].active);
});

test('progressing Set (even number of couples, all active) should rotate bottom couple', () => {
    const set = new Set(6);
    internallyProgress(set);
    assert.strictEqual(set.dancers[10].getLabel(), "R1");
    assert.strictEqual(set.dancers[11].getLabel(), "L1");
    set.progress();
    assert.strictEqual(set.dancers[10].getLabel(), "L2");
    assert.strictEqual(set.dancers[11].getLabel(), "R2");
});
