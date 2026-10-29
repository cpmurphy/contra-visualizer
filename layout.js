// Where things are on the canvas, in pixels: the stage across the top (the caller
// and musicians), and the set on the dance floor below it. Positions elsewhere are
// normalized to 0-100 across and down the canvas (see toPixels and fromPixels in
// positions.js). The canvas in index.html is this size.

export const SVG_WIDTH = 800;
export const SVG_HEIGHT = 1000;
export const STAGE_HEIGHT = 100;
export const DANCER_RADIUS_PX = 20;

// The set's two lines: where the left one stands, and how far apart they are
export const LEFT_LINE_X_PX = 270;
export const LINE_SPACING_PX = 160;
// Down the middle of the set, between the lines
export const COLUMN_MIDPOINT_PX = LEFT_LINE_X_PX + LINE_SPACING_PX / 2;
// Between one row of the set and the next
export const VERTICAL_SPACING_PX = 120;

/**
 * Where the top row of a set stands, with its rows centered on the dance floor
 * @param {number} rowCount - Rows in the set
 * @returns {number} y, in pixels
 */
export function firstRowY(rowCount) {
    const danceFloorHeight = SVG_HEIGHT - STAGE_HEIGHT;
    const totalDancerHeight = (rowCount - 1) * VERTICAL_SPACING_PX + 2 * DANCER_RADIUS_PX;
    return STAGE_HEIGHT + (danceFloorHeight - totalDancerHeight) / 2 + DANCER_RADIUS_PX;
}
