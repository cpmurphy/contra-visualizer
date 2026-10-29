// Unit tests for dancers
//
// Requirements: Node.js 20+ (includes built-in test runner, ES modules)
//
// Run tests with:
//   node --test test/test.dancers.js
//   npm test
//   ./test.sh

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { distance, isInBounds } from '../positions.js';


function internallyProgress(set) {
    const startIndex = set.dancers[0].active ? 0 : 2;
    for (let i = startIndex; i < set.dancers.length; i += 4) {
    if (set.dancers.length - i < 4) {
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

test('creating a set with even number of couples should make all active', () => {
    const set = new Set(4);
    set.dancers.forEach((dancer) => {
        assert(dancer.active, "all dancers should be active");
    });
});

test('creating a set with odd number of couples should make all but last couple active', () => {
    const set = new Set(5);
    set.dancers.forEach((dancer, index) => {
        if (index < 8) {
            assert(dancer.active, "first eight dancers should be active");
        } else {
            assert(!dancer.active, "last two dancers should be inactive");
        };
    });
});

test('creating a set should allocate ids in reading order (left to right, top to bottom), top couples swapped', () => {
    const set = new Set(4);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), ['d2', 'd1', 'd3', 'd4', 'd6', 'd5', 'd7', 'd8']);
});

test('creating a set with odd number of couples should order dancers as expected', () => {
    const set = new Set(3);
    // because there is an uneven number of couples, the last couple are swapped (they will be twos)
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), ['d2', 'd1', 'd3', 'd4', 'd5', 'd6']);
});

test('creating a set should alternate couple numbers', () => {
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

test('creating a set (even number) should have minor sets arranged R1, L1, L2, R2', () => {
    const set = new Set(6);
    const expectedRoles = ['R1', 'L1', 'L2', 'R2'];
    set.dancers.forEach((dancer, index) => {
        assert.strictEqual(dancer.getLabel(), expectedRoles[index % 4]);
    });
});

test('creating a set (odd number) should rotate bottom couple', () => {
    const set = new Set(5);
    assert.strictEqual(set.dancers[8].id, 'd9');
    assert.strictEqual(set.dancers[9].id, 'd10');
    assert.strictEqual(set.dancers[8].getLabel(), 'L2');
    assert.strictEqual(set.dancers[9].getLabel(), 'R2');
});

test('internally progressing a set (testing the helper function)', () => {
    const set = new Set(6);
    internallyProgress(set);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd3', 'd4',
        'd2', 'd1',
        'd7', 'd8',
        'd6', 'd5',
        'd11', 'd12',
        'd10', 'd9',
    ]);
});

test('circling left by one place should skip inactive dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.circleLeft(1);
    assert.strictEqual(set.dancers[0].id, "d4");
    assert.strictEqual(set.dancers[1].id, "d3");
    assert.strictEqual(set.dancers[10].id, "d9");
    assert.strictEqual(set.dancers[11].id, "d10");

    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
    assert.strictEqual(set.dancers[10].getLabel(), "L2");
    assert.strictEqual(set.dancers[11].getLabel(), "R2");
});

test('circling left by one place should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.circleLeft(1);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd3', 'd2',
        'd4', 'd1',
    ]);

    assert.strictEqual(set.dancers[0].getLabel(), "L2");
    assert.strictEqual(set.dancers[1].getLabel(), "R1");
    assert.strictEqual(set.dancers[2].getLabel(), "R2");
    assert.strictEqual(set.dancers[3].getLabel(), "L1");
});

test('after progressing when top couple is inactive, circling left by one place should rotate the minor sets with active dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.circleLeft(1);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4', 'd3',
        'd7', 'd2',
        'd8', 'd1',
        'd11', 'd6',
        'd12', 'd5',
        'd9', 'd10'
    ]);
    assert.strictEqual(set.dancers[2].getLabel(), "L2");
    assert.strictEqual(set.dancers[3].getLabel(), "R1");
    assert.strictEqual(set.dancers[4].getLabel(), "R2");
    assert.strictEqual(set.dancers[5].getLabel(), "L1");
    assert.strictEqual(set.dancers[6].getLabel(), "L2");
    assert.strictEqual(set.dancers[7].getLabel(), "R1");
    assert.strictEqual(set.dancers[8].getLabel(), "R2");
    assert.strictEqual(set.dancers[9].getLabel(), "L1");
});

test('circling left by two places should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.circleLeft(2);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4', 'd3',
        'd1', 'd2',
    ]);
    assert.strictEqual(set.dancers[0].getLabel(), "R2");
    assert.strictEqual(set.dancers[1].getLabel(), "L2");
    assert.strictEqual(set.dancers[2].getLabel(), "L1");
    assert.strictEqual(set.dancers[3].getLabel(), "R1");
});

test('circling left by three places should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.circleLeft(3);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd1', 'd4',
        'd2', 'd3',
    ]);
    assert.strictEqual(set.dancers[0].getLabel(), "L1");
    assert.strictEqual(set.dancers[1].getLabel(), "R2");
    assert.strictEqual(set.dancers[2].getLabel(), "R1");
    assert.strictEqual(set.dancers[3].getLabel(), "L2");
});

test('circling left by four places should return active dancers to their original positions', () => {
    const set = new Set(2);
    set.circleLeft(4);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd2', 'd1',
        'd3', 'd4',
    ]);
    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
    assert.strictEqual(set.dancers[2].getLabel(), "L2");
    assert.strictEqual(set.dancers[3].getLabel(), "R2");
});

test('circling right by one place should skip inactive dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.circleRight(1);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4', 'd3',
        'd1', 'd8',
        'd2', 'd7',
        'd5', 'd12',
        'd6', 'd11',
        'd9', 'd10'
  ]);
    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
    assert.strictEqual(set.dancers[10].getLabel(), "L2");
    assert.strictEqual(set.dancers[11].getLabel(), "R2");
});
test('circling right by one place should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.circleRight(1);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd1', 'd4',
        'd2', 'd3',
    ]);
    assert.strictEqual(set.dancers[0].getLabel(), "L1");
    assert.strictEqual(set.dancers[1].getLabel(), "R2");
    assert.strictEqual(set.dancers[2].getLabel(), "R1");
    assert.strictEqual(set.dancers[3].getLabel(), "L2");
});

test('after progressing when top couple is inactive, circling right by one place should rotate the minor sets with active dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.circleRight(1);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4', 'd3',
        'd1', 'd8',
        'd2', 'd7',
        'd5', 'd12',
        'd6', 'd11',
        'd9', 'd10'
    ]);
    assert.strictEqual(set.dancers[2].getLabel(), "L1");
    assert.strictEqual(set.dancers[3].getLabel(), "R2");
    assert.strictEqual(set.dancers[4].getLabel(), "R1");
    assert.strictEqual(set.dancers[5].getLabel(), "L2");
    assert.strictEqual(set.dancers[6].getLabel(), "L1");
    assert.strictEqual(set.dancers[7].getLabel(), "R2");
    assert.strictEqual(set.dancers[8].getLabel(), "R1");
    assert.strictEqual(set.dancers[9].getLabel(), "L2");
});

test('circling right by two places should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.circleRight(2);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4', 'd3',
        'd1', 'd2',
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        "R2", "L2",
        "L1", "R1",
    ]);
});

test('circling right by three places should rotate a minor set with active dancers', () => {
    const set = new Set(2);
    set.circleRight(3);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd3', 'd2',
        'd4', 'd1',
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        "L2", "R1",
        "R2", "L1",
    ]);
});

test('circling right by four places should return active dancers to their original positions', () => {
    const set = new Set(2);
    set.circleRight(4);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd2', 'd1',
        'd3', 'd4',
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        "R1", "L1",
        "L2", "R2",
    ]);
});

test('a balance should return active dancers to their original positions', () => {
    const set = new Set(2);
    set.balance();
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd2', 'd1',
        'd3', 'd4',
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        "R1", "L1",
        "L2", "R2",
    ]);
});

test('a neighbor swing should move active dancers to the correct positions', () => {
    const set = new Set(2);
    set.swing('neighbor');
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd3', 'd4',
        'd2', 'd1',
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        "L2", "R2",
        "R1", "L1",
    ]);
});

test('a neighbor swing should skip inactive dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.swing('neighbor');
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4',  'd3',
        'd7',  'd8',
        'd2',  'd1',
        'd11', 'd12',
        'd6',  'd5',
        'd9',  'd10'
    ]);
    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
    assert.strictEqual(set.dancers[10].getLabel(), "L2");
    assert.strictEqual(set.dancers[11].getLabel(), "R2");
});

test('after progressing when top couple is inactive, a neighbor swing should move active dancers to the correct positions', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.swing('neighbor');
    assert.strictEqual(set.dancers[2].getLabel(), "L2");
    assert.strictEqual(set.dancers[3].getLabel(), "R2");
    assert.strictEqual(set.dancers[4].getLabel(), "R1");
    assert.strictEqual(set.dancers[5].getLabel(), "L1");
    assert.strictEqual(set.dancers[6].getLabel(), "L2");
    assert.strictEqual(set.dancers[7].getLabel(), "R2");
    assert.strictEqual(set.dancers[8].getLabel(), "R1");
    assert.strictEqual(set.dancers[9].getLabel(), "L1");
});

test('a partner swing should move active dancers to the correct positions', () => {
    const set = new Set(2);
    set.swing('partner');
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd3', 'd2',
        'd4', 'd1',
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        "L2", "R1",
        "R2", "L1",
    ]);
});

// A star right turns clockwise (right hands in, walking forward), like a circle left
test('star right should move dancers the same as circle left', () => {
    for (let i = 1; i <= 4; i++) {
        const circleSet = new Set(4);
        const starSet = new Set(4);
        circleSet.circleLeft(i);
        starSet.starRight(i);
        assert.deepStrictEqual(circleSet.dancers.map((dancer) => {
            return dancer.id;
        }), starSet.dancers.map((dancer) => {
            return dancer.id;
        }));
    }
});

// A star left turns counter-clockwise, like a circle right
test('star left should move dancers the same as circle right', () => {
    for (let i = 1; i <= 4; i++) {
        const circleSet = new Set(4);
        const starSet = new Set(4);
        circleSet.circleRight(i);
        starSet.starLeft(i);
        assert.deepStrictEqual(circleSet.dancers.map((dancer) => {
            return dancer.id;
        }), starSet.dancers.map((dancer) => {
            return dancer.id;
        }));
    }
});

test('long lines should return active dancers to their original positions', () => {
    const set = new Set(2);
    set.longLines();
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd2', 'd1',
        'd3', 'd4',
    ]);
    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
    assert.strictEqual(set.dancers[2].getLabel(), "L2");
    assert.strictEqual(set.dancers[3].getLabel(), "R2");
});

test('chaining the robins should swap the robins but not the larks', () => {
    const set = new Set(2);
    set.chainRobins();
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4', 'd1',
        'd3', 'd2',
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        "R2", "L1",
        "L2", "R1",
    ]);
});

test('chaining the robins should skip inactive dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.chainRobins();
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4',  'd3',
        'd8',  'd1',
        'd7',  'd2',
        'd12', 'd5',
        'd11', 'd6',
        'd9',  'd10'
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        'R1', 'L1',
        'R2', 'L1',
        'L2', 'R1',
        'R2', 'L1',
        'L2', 'R1',
        'L2', 'R2',
    ]);
});

test('chaining the larks should swap the larks but not the robins', () => {
    const set = new Set(2);
    set.chainLarks();
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd2', 'd3',
        'd1', 'd4',
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        "R1", "L2",
        "L1", "R2",
    ]);
});

test('chaining the larks should skip inactive dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    // now top and bottom couples are inactive
    set.chainLarks();
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4',  'd3',
        'd2',  'd7',
        'd1',  'd8',
        'd6', 'd11',
        'd5', 'd12',
        'd9',  'd10'
    ]);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.getLabel();
    }), [
        'R1', 'L1',
        'R1', 'L2',
        'L1', 'R2',
        'R1', 'L2',
        'L1', 'R2',
        'L2', 'R2'
    ]);
});


test('do-si-do once should return dancers to original positions', () => {
    const set = new Set(2);
    set.doSiDo(1);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd2', 'd1',
        'd3', 'd4',
    ]);
});

test('do-si-do once and a half should swap the neighbors', () => {
    const set = new Set(2);
    set.doSiDo(1.5);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd3', 'd4',
        'd2', 'd1',
    ]);
});

test('do-si-do once and a half should skip inactive dancers', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();
    set.doSiDo(1.5);
    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4', 'd3',
        'd7', 'd8',
        'd2', 'd1',
        'd11', 'd12',
        'd6', 'd5',
        'd9', 'd10',
    ]);
});


test('progressing the set (even number of couples) should put top couple out', () => {
    const set = new Set(6);
    set.progress();
    assert(!set.dancers[0].active);
    assert(!set.dancers[1].active);
});

test('progressing the set (even number of couples, all active) should rotate top couple', () => {
    const set = new Set(6);
    internallyProgress(set);
    assert.strictEqual(set.dancers[0].getLabel(), "L2");
    assert.strictEqual(set.dancers[1].getLabel(), "R2");
    set.progress();

    assert.strictEqual(set.dancers[0].id, "d4");
    assert.strictEqual(set.dancers[1].id, "d3");

    assert.strictEqual(set.dancers[0].getLabel(), "R1");
    assert.strictEqual(set.dancers[1].getLabel(), "L1");
});

test('progressing the set (even number of couples, all active) should put bottom couple out', () => {
    const set = new Set(6);
    internallyProgress(set);
    set.progress();

    assert.deepStrictEqual(set.dancers.map((dancer) => {
        return dancer.id;
    }), [
        'd4', 'd3',
        'd2', 'd1',
        'd7', 'd8',
        'd6', 'd5',
        'd11', 'd12',
        'd9',  'd10'
    ]);

    assert(!set.dancers[10].active);
    assert(!set.dancers[11].active);
});

test('progressing the set (even number of couples, all active) should rotate bottom couple', () => {
    const set = new Set(6);
    internallyProgress(set);
    assert.strictEqual(set.dancers[10].getLabel(), "R1");
    assert.strictEqual(set.dancers[11].getLabel(), "L1");
    set.progress();
    assert.strictEqual(set.dancers[10].getLabel(), "L2");
    assert.strictEqual(set.dancers[11].getLabel(), "R2");
});

// Snapshot and undo tests

test('automatic snapshot should capture current dancer positions', () => {
    const set = new Set(4);
    const initialState = set.dancers.map(d => d.id);

    set.circleLeft(1);

    // Dancers should have moved
    assert.notDeepStrictEqual(set.dancers.map(d => d.id), initialState);
});

test('undo should restore previous dancer positions after one move', () => {
    const set = new Set(4);
    const initialState = set.dancers.map(d => d.id);

    set.circleLeft(1);
    set.undo();

    assert.deepStrictEqual(set.dancers.map(d => d.id), initialState);
});

test('undo should restore previous dancer positions after multiple moves', () => {
    const set = new Set(4);
    const stateBeforeMoves = set.dancers.map(d => d.id);

    set.circleLeft(1);
    set.chainRobins();
    set.swing('neighbor');

    // Undo three times to get back to start
    set.undo();
    set.undo();
    set.undo();

    assert.deepStrictEqual(set.dancers.map(d => d.id), stateBeforeMoves);
});

test('multiple snapshots and undos should work correctly', () => {
    const set = new Set(4);

    const state0 = set.dancers.map(d => d.id);

    set.circleLeft(1);
    const state1 = set.dancers.map(d => d.id);

    set.chainRobins();
    const state2 = set.dancers.map(d => d.id);

    set.swing('neighbor');

    // Undo once - back to state2
    set.undo();
    assert.deepStrictEqual(set.dancers.map(d => d.id), state2);

    // Undo again - back to state1
    set.undo();
    assert.deepStrictEqual(set.dancers.map(d => d.id), state1);

    // Undo again - back to state0
    set.undo();
    assert.deepStrictEqual(set.dancers.map(d => d.id), state0);
});

test('undo when snapshot stack is empty should do nothing', () => {
    const set = new Set(4);
    const initialState = set.dancers.map(d => d.id);

    set.circleLeft(1);
    // Undo once to go back to initial state
    set.undo();

    // Undo again when snapshot stack is empty - should stay in initial state
    set.undo();

    assert.deepStrictEqual(set.dancers.map(d => d.id), initialState);
});

test('undo should restore active/inactive state of dancers', () => {
    const set = new Set(6);

    const initialActive = set.dancers[0].active;
    assert(initialActive);

    set.progress();
    assert(!set.dancers[0].active);

    set.undo();
    assert(set.dancers[0].active);
});

test('undo should restore couple numbers correctly', () => {
    const set = new Set(6);
    internallyProgress(set);

    // After internal progress, bottom couple should be R1/L1 (couple #1)
    const initialCoupleNumber = set.dancers[10].couple.coupleNumber;
    assert.strictEqual(initialCoupleNumber, 1);

    // Progress changes bottom couple number to 2
    set.progress();
    const changedCoupleNumber = set.dancers[10].couple.coupleNumber;
    assert.strictEqual(changedCoupleNumber, 2);

    set.undo();
    assert.strictEqual(set.dancers[10].couple.coupleNumber, initialCoupleNumber);
});

test('automatic snapshot should preserve dancer identities across complex moves', () => {
    const set = new Set(4);

    const initialIds = set.dancers.map(d => d.id);
    const initialLabels = set.dancers.map(d => d.getLabel());

    // Complex sequence of moves
    set.circleLeft(2);
    set.chainRobins();
    set.doSiDo(1.0);

    // Undo three times
    set.undo();
    set.undo();
    set.undo();

    // IDs should match
    assert.deepStrictEqual(set.dancers.map(d => d.id), initialIds);
    // Labels should match (which depends on couple numbers and roles)
    assert.deepStrictEqual(set.dancers.map(d => d.getLabel()), initialLabels);
});

test('clearSnapshots should remove all snapshots', () => {
    const set = new Set(4);
    const initialState = set.dancers.map(d => d.id);

    set.circleLeft(1);
    set.chainRobins();
    set.swing('neighbor');

    // Clear all snapshots
    set.clearSnapshots();

    // Undo should do nothing since snapshots are cleared
    set.undo();

    // Should still be in the current state (after 3 moves)
    const currentState = set.dancers.map(d => d.id);
    assert.notDeepStrictEqual(currentState, initialState);

    // And undo shouldn't change anything
    set.undo();
    assert.deepStrictEqual(set.dancers.map(d => d.id), currentState);
});

// Position calculation tests

test('getPositions should return correct number of positions', () => {
    const set = new Set(6);
    const positions = set.getPositions();

    assert.strictEqual(positions.length, 12); // 6 couples = 12 dancers
});

test('getPositions should return positions for all dancers in set', () => {
    const set = new Set(4);
    const positions = set.getPositions();

    assert.strictEqual(positions.length, 8); // 4 couples = 8 dancers
});

test('all positions should be within bounds (0-100)', () => {
    const set = new Set(6);
    const positions = set.getPositions();

    positions.forEach((pos, index) => {
        assert(isInBounds(pos, 0, 0, 100, 100),
            `Position ${index} (${pos.x}, ${pos.y}) should be within bounds`);
    });
});

test('positions should not overlap (minimum distance maintained)', () => {
    const set = new Set(6);
    const positions = set.getPositions();

    // Minimum distance should be at least 2 units (accounting for dancer radius in normalized coords)
    const minDistance = 2;

    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const dist = distance(positions[i], positions[j]);
            assert(dist >= minDistance,
                `Dancers ${i} and ${j} are too close: ${dist} < ${minDistance}`);
        }
    }
});

test('inactive dancers should still have positions', () => {
    const set = new Set(5); // Odd number makes some inactive
    const positions = set.getPositions();

    assert.strictEqual(positions.length, 10); // Still 10 dancers
    assert.strictEqual(set.dancers.filter(d => !d.active).length, 2); // 2 inactive
});

test('positions should be in two columns', () => {
    const set = new Set(6);
    const positions = set.getPositions();

    // Group by x coordinate (should have 2 unique x values)
    // Use filter to get unique values instead of built-in Set to avoid name collision
    const xCoords = positions.map(p => p.x.toFixed(1)).filter((x, i, arr) => arr.indexOf(x) === i);
    assert.strictEqual(xCoords.length, 2, 'Should have exactly 2 columns');
});

test('positions should have consistent vertical spacing', () => {
    const set = new Set(6);
    const positions = set.getPositions();

    // Check left column (even indices)
    const leftColumn = positions.filter((_, i) => i % 2 === 0);
    const ySpacings = [];

    for (let i = 1; i < leftColumn.length; i++) {
        const spacing = leftColumn[i].y - leftColumn[i - 1].y;
        ySpacings.push(spacing);
    }

    // All spacings should be approximately equal
    const avgSpacing = ySpacings.reduce((a, b) => a + b, 0) / ySpacings.length;
    ySpacings.forEach((spacing, i) => {
        assert(Math.abs(spacing - avgSpacing) < 0.1,
            `Spacing ${i} (${spacing}) should be close to average (${avgSpacing})`);
    });
});

test('positions remain stable while dancer IDs change after moves', () => {
    const set = new Set(4);
    const initialPositions = set.getPositions();
    const initialDancerIds = set.dancers.map(d => d.id);

    // Circle left changes dancer order in array but not positions
    set.circleLeft(1);
    const newPositions = set.getPositions();
    const newDancerIds = set.dancers.map(d => d.id);

    // Position coordinates should remain the same (indexed by array position)
    for (let i = 0; i < initialPositions.length; i++) {
        assert(initialPositions[i].equals(newPositions[i], 0.01),
            `Position ${i} should remain stable after move`);
    }

    // But dancer IDs at those positions should have changed
    let changedCount = 0;
    for (let i = 0; i < initialDancerIds.length; i++) {
        if (initialDancerIds[i] !== newDancerIds[i]) {
            changedCount++;
        }
    }
    assert(changedCount > 0, 'Dancer IDs should change after circle left');
});

test('positions after progression should still be valid', () => {
    const set = new Set(6);

    set.progress();
    const positions = set.getPositions();

    // All positions should still be in bounds
    positions.forEach((pos, index) => {
        assert(isInBounds(pos, 0, 0, 100, 100),
            `Position ${index} after progression should be in bounds`);
    });

    // Should still maintain minimum distance
    const minDistance = 2;
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const dist = distance(positions[i], positions[j]);
            assert(dist >= minDistance,
                `Dancers ${i} and ${j} too close after progression: ${dist}`);
        }
    }
});

test('a proper set should put all the larks on one side and all the robins on the other', () => {
    const set = new Set(6, 'proper');
    set.dancers.forEach((dancer, index) => {
        const expectedRole = index % 2 === 0 ? 'lark' : 'robin';
        assert.equal(dancer.role, expectedRole, `dancer at place ${index} should be a ${expectedRole}`);
    });
    assert.deepEqual(set.dancers.map(d => d.getLabel()),
        ['L1', 'R1', 'L2', 'R2', 'L1', 'R1', 'L2', 'R2', 'L1', 'R1', 'L2', 'R2']);
});

test('an improper set should cross the ones over', () => {
    const set = new Set(4);
    assert.deepEqual(set.dancers.map(d => d.getLabel()),
        ['R1', 'L1', 'L2', 'R2', 'R1', 'L1', 'L2', 'R2']);
});

test('a proper set with an odd number of couples should not cross over the last couple', () => {
    const set = new Set(5, 'proper');
    assert.deepEqual(set.dancers.slice(-2).map(d => d.getLabel()), ['L2', 'R2']);
    assert(!set.dancers[9].active, 'last couple should be inactive');
});

test('progressing a proper set should not cross over the couples waiting out at the ends', () => {
    const set = new Set(6, 'proper');
    set.progress();
    assert.deepEqual(set.dancers.map(d => d.role),
        new Array(6).fill(['lark', 'robin']).flat());
    assert(!set.dancers[0].active && !set.dancers[1].active, 'top couple should wait out');
    assert(!set.dancers[10].active && !set.dancers[11].active, 'bottom couple should wait out');
    assert.equal(set.dancers[0].couple.coupleNumber, 1, 'top couple should become ones');
    assert.equal(set.dancers[10].couple.coupleNumber, 2, 'bottom couple should become twos');
});

test('creating a set in an unknown formation should throw', () => {
    assert.throws(() => new Set(6, 'becket'), /Unsupported formation/);
});

test('couples who wait out at the ends after progressing should stand in their places', () => {
    const set = new Set(6, 'proper');
    // Everyone a little off their places
    set.dancers.forEach(dancer => set.offsets.set(dancer.id, { x: 2, y: 1 }));
    set.progress();
    set.dancers.forEach(dancer => {
        assert.equal(set.offsets.has(dancer.id), dancer.active,
            `${dancer.getLabel()} should ${dancer.active ? 'keep' : 'lose'} their offset`);
    });
});
