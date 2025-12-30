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

test('star right should move dancers the same as circle right', () => {
    for (let i = 1; i <= 4; i++) {
        const circleSet = new Set(4);
        const starSet = new Set(4);
        circleSet.circleRight(i);
        starSet.starRight(i);
        assert.deepStrictEqual(circleSet.dancers.map((dancer) => {
            return dancer.id;
        }), starSet.dancers.map((dancer) => {
            return dancer.id;
        }));
    }
});

test('star left should move dancers the same as circle left', () => {
    for (let i = 1; i <= 4; i++) {
        const circleSet = new Set(4);
        const starSet = new Set(4);
        circleSet.circleLeft(i);
        starSet.starLeft(i);
        assert.deepStrictEqual(circleSet.dancers.map((dancer) => {
            return dancer.id;
        }), starSet.dancers.map((dancer) => {
            return dancer.id;
        }));
    }
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
