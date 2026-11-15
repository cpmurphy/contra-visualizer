// Path calculator for dance moves
// Computes paths for each dancer during a move, using the paths for each figure in
// figures/catalog.js

import { center, toPixels, fromPixels } from './positions.js';
import { Path, createStationaryPath } from './paths.js';
import { SVG_WIDTH, SVG_HEIGHT, DANCER_RADIUS_PX } from './layout.js';
import { getPositionsById, withSetState, progresses, executeMove } from './moves.js';
import { findFigure } from './figures/catalog.js';

/**
 * Calculate paths for all dancers during a move. The map may also have a `holds`
 * property listing groups of dancers who join hands in the middle of them, as
 * {ids, from, to} with the beats of the move during which they hold on (see
 * createStarPaths), and a `facing` property, a map from dancer ID to the way
 * they face throughout the move, whichever way they go (see createDoSiDoPaths).
 * @param {Object} move - The move object with type, beats, etc.
 * @param {import('./dancers.js').Set} dancerSet - The current set state
 * @returns {Map<string, import('./paths.js').Path>} Map from dancer ID to Path
 */
export function calculateMovePaths(move, dancerSet) {
    const paths = new Map();
    const beats = move.beats || 8;

    // Map dancer IDs to their start and end positions
    const startPosById = getPositionsById(dancerSet);
    const endPosById = withSetState(dancerSet, set => executeMove(set, move), getPositionsById);

    const figure = findFigure(move, dancerSet);
    const addFigurePaths = set => {
        if (figure) {
            figure.paths({ ...figure.step, set, start: startPosById, end: endPosById, paths, beats });
        } else {
            // Not animated yet: everyone holds their place
            set.dancers.forEach(dancer => {
                paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
            });
        }
    };

    if (!progresses(move, dancerSet)) {
        addFigurePaths(dancerSet);
        return paths;
    }

    // Progression happens at the start of the move: the figure is danced with the
    // new neighbors, from where everyone was. Those it leaves standing still but who
    // the progression moved (the couples crossing over at the ends of the set)
    // travel to their new places during the move instead of jumping.
    withSetState(dancerSet, set => set.progress(), addFigurePaths);
    addCrossOverPaths(paths, endPosById);
    return paths;
}

// Couples crossing over at the ends slide past each other along their row,
// bowing apart only enough to pass: the one nearer the rest of the set barely
// at all, so as to keep out of the way of those dancing, and the other, out at
// the end, enough to clear them (in pixels)
const CROSS_OVER_INSIDE_PX = 6;
const CROSS_OVER_OUTSIDE_PX = 2 * DANCER_RADIUS_PX + 4 - CROSS_OVER_INSIDE_PX;
// Waypoints along each slide
const CROSS_OVER_SAMPLES = 24;

/**
 * Give dancers whom the figure leaves standing where they were, but whom the
 * progression moved (the couples crossing over at the ends of the set), a path from
 * their old position to their new one. Partners slide past each other across the
 * end of the set, easing in and out, the one who starts on the left passing
 * nearer the rest of the set.
 * @param {Map<string, import('./paths.js').Path>} paths - The figure's paths
 * @param {Map<string, import('./positions.js').Position>} endPosById - Where each dancer ends the move
 */
function addCrossOverPaths(paths, endPosById) {
    const setCenter = toPixels(center([...paths.values()].map(path => path.start)), SVG_WIDTH, SVG_HEIGHT);
    const ease = u => (1 - Math.cos(Math.PI * u)) / 2;

    paths.forEach((path, dancerId) => {
        const to = endPosById.get(dancerId);
        if (path.end.equals(to, 0.01)) return;

        if (!path.start.equals(path.end, 0.01)) {
            throw new Error(`Dancer ${dancerId} both progresses and moves; cannot animate cross-over`);
        }
        const from = toPixels(path.start, SVG_WIDTH, SVG_HEIGHT);
        const end = toPixels(to, SVG_WIDTH, SVG_HEIGHT);
        // Towards the rest of the set, at right angles to the slide
        const across = Math.hypot(end.x - from.x, end.y - from.y);
        let inward = { x: -(end.y - from.y) / across, y: (end.x - from.x) / across };
        const toCenter = (setCenter.x - from.x) * inward.x + (setCenter.y - from.y) * inward.y;
        if (toCenter < 0) inward = { x: -inward.x, y: -inward.y };
        // Partners going opposite ways: the one going right passes on the inside
        const bow = end.x > from.x ? CROSS_OVER_INSIDE_PX : -CROSS_OVER_OUTSIDE_PX;

        const waypoints = [];
        for (let k = 0; k <= CROSS_OVER_SAMPLES; k++) {
            const u = ease(k / CROSS_OVER_SAMPLES);
            const aside = bow * Math.sin(Math.PI * u);
            waypoints.push(fromPixels(
                from.x + (end.x - from.x) * u + inward.x * aside,
                from.y + (end.y - from.y) * u + inward.y * aside,
                SVG_WIDTH, SVG_HEIGHT));
        }
        waypoints[waypoints.length - 1] = to.clone();
        const times = waypoints.map((_, k) => k / CROSS_OVER_SAMPLES);
        paths.set(dancerId, new Path(waypoints, path.beats, times));
    });
}
