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
import { createImproperFormation, progress } from '../dancers.js';


function internallyProgress(dancers) {
    for (let i = 0; i < dancers.length; i+= 2) {
        if (dancers.length - i < 3) {
            break;
        }
        const temp1 = dancers[i];
        const temp2 = dancers[i + 1];
        dancers[i] = dancers[i + 2];
        dancers[i + 1] = dancers[i + 3];
        dancers[i + 2] = temp1;
        dancers[i + 3] = temp2;
    }
}

test('createImproperFormation with even number of couples should make all active', () => {
    const dancers = createImproperFormation(4);
    dancers.forEach((dancer) => {
        assert(dancer.active, "all dancers should be active");
    });
});

test('createImproperFormation with odd number of couples should make all but last couple active', () => {
    const dancers = createImproperFormation(5);
    dancers.forEach((dancer, index) => {
        if (index < 8) {
            assert(dancer.active, "first eight dancers should be active");
        } else {
            assert(!dancer.active, "last two dancers should be inactive");
        };
    });
});

test('createImproperFormation with odd number of couples should order dancers as expected', () => {
    const dancers = createImproperFormation(3);
    assert.strictEqual(dancers[0].id, 'd2');
    assert.strictEqual(dancers[1].id, 'd1');
    assert.strictEqual(dancers[2].id, 'd3');
    assert.strictEqual(dancers[3].id, 'd4');
    // the last couple are out of the dance, so lark comes first
    assert.strictEqual(dancers[4].id, 'd5');
    assert.strictEqual(dancers[5].id, 'd6');
});

test('createImproperFormation should alternate couple numbers', () => {
    const dancers = createImproperFormation(5);
    for (let i = 0; i < 8; i++) {
        const dancer = dancers[i];
        if (Math.trunc(i / 2) % 2 === 0) {
            assert.strictEqual(dancer.couple.coupleNumber, 1);
        } else {
            assert.strictEqual(dancer.couple.coupleNumber, 2);
        };
    }
    // because there is an uneven number of couples, the last couple are twos
    assert.strictEqual(dancers[8].couple.coupleNumber, 2);
    assert.strictEqual(dancers[9].couple.coupleNumber, 2);
});

test('createImproperFormation (even number) should have minor sets arranged R1, L1, L2, R2', () => {
    const dancers = createImproperFormation(6);
    const expectedRoles = ['R1', 'L1', 'L2', 'R2'];
    dancers.forEach((dancer, index) => {
        assert.strictEqual(dancer.getLabel(), expectedRoles[index % 4]);
    });
});

test('createImproperFormation (odd number) should rotate bottom couple', () => {
    const dancers = createImproperFormation(5);
    const expectedRoles = ['R1', 'L1', 'L2', 'R2'];
    assert.strictEqual(dancers[8].getLabel(), 'L2');
    assert.strictEqual(dancers[9].getLabel(), 'R2');
});

test('progress (even number of couples) should put top couple out', () => {
    const dancers = createImproperFormation(6);
    internallyProgress(dancers);
    progress(dancers);
    assert(!dancers[0].active);
    assert(!dancers[1].active);
});

test('progress (even number of couples, all active) should rotate top couple', () => {
    const dancers = createImproperFormation(6);
    internallyProgress(dancers);
    assert.strictEqual(dancers[0].getLabel(), "L2");
    assert.strictEqual(dancers[1].getLabel(), "R2");
    progress(dancers);
    assert.strictEqual(dancers[0].getLabel(), "R1");
    assert.strictEqual(dancers[1].getLabel(), "L1");
});

test('progress (even number of couples, all active) should put bottom couple out', () => {
    const dancers = createImproperFormation(6);
    internallyProgress(dancers);
    progress(dancers);
    assert(!dancers[10].active);
    assert(!dancers[11].active);
});

test('progress (even number of couples, all active) should rotate bottom couple', () => {
    const dancers = createImproperFormation(6);
    internallyProgress(dancers);
    assert.strictEqual(dancers[10].getLabel(), "R1");
    assert.strictEqual(dancers[11].getLabel(), "L1");
    progress(dancers);
    assert.strictEqual(dancers[10].getLabel(), "L2");
    assert.strictEqual(dancers[11].getLabel(), "R2");
});
