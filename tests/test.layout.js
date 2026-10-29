// Unit tests for the layout of the canvas

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SVG_WIDTH, SVG_HEIGHT, STAGE_HEIGHT, VERTICAL_SPACING_PX, firstRowY } from '../layout.js';

test('the canvas in index.html is the size of the layout', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const canvas = html.match(/<svg id="dance-canvas"[^>]*>/)[0];
    assert.match(canvas, new RegExp(`width="${SVG_WIDTH}" height="${SVG_HEIGHT}"`));
    assert.match(canvas, new RegExp(`viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}"`));
});

test('firstRowY centers the rows on the dance floor', () => {
    const floorMiddle = (STAGE_HEIGHT + SVG_HEIGHT) / 2;
    for (const rows of [1, 2, 6]) {
        const lastRowY = firstRowY(rows) + (rows - 1) * VERTICAL_SPACING_PX;
        assert.equal((firstRowY(rows) + lastRowY) / 2, floorMiddle);
    }
});
