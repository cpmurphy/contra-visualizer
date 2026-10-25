// Unit tests for the built-in dance library

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Set } from '../dancers.js';
import { dances, danceSlug, findDance } from '../library.js';
import { calculateMovePaths, executeMove } from '../pathCalculator.js';

test('every dance should have a title, author and formation', () => {
    for (const dance of dances) {
        assert(dance.title, 'dance should have a title');
        assert(dance.author, `${dance.title} should have an author`);
        assert(dance.formation, `${dance.title} should have a formation`);
    }
});

test('every part\'s moves should add up to the part\'s beats', () => {
    for (const dance of dances) {
        for (const part of dance.parts) {
            const total = part.moves.reduce((sum, move) => sum + move.beats, 0);
            assert.equal(total, part.beats, `${dance.title} ${part.name}`);
        }
    }
});

test('every move should have a type and a number of beats', () => {
    for (const dance of dances) {
        for (const move of dance.parts.flatMap(part => part.moves)) {
            assert.equal(typeof move.type, 'string', `${dance.title}: move type`);
            assert(move.beats > 0, `${dance.title} ${move.type}: beats`);
        }
    }
});

test('every dance should have a distinct slug', () => {
    const slugs = dances.map(danceSlug);
    assert.equal(new globalThis.Set(slugs).size, slugs.length);
});

test('slugs should be lowercase words joined by hyphens', () => {
    assert.equal(danceSlug({ title: 'Lady of the Lake' }), 'lady-of-the-lake');
    assert.equal(danceSlug({ title: 'Jefferson and Liberty' }), 'jefferson-and-liberty');
    assert.equal(danceSlug({ title: 'Petronella\'s Café!' }), 'petronella-s-cafe');
});

test('findDance should find a dance by its slug', () => {
    for (const dance of dances) {
        assert.equal(findDance(danceSlug(dance)), dance);
    }
    assert.equal(findDance('no-such-dance'), undefined);
});

test('every dance in a supported formation should play through three times', () => {
    for (const dance of dances) {
        if (!Set.FORMATIONS.includes(dance.formation)) continue;
        const set = new Set(6, dance.formation);
        for (let round = 0; round < 3; round++) {
            for (const move of dance.parts.flatMap(part => part.moves)) {
                const paths = calculateMovePaths(move, set);
                assert.equal(paths.size, 12, `${dance.title} ${move.type}: a path for every dancer`);
                executeMove(set, move);
            }
        }
    }
});
