// Path calculator for dance moves
// Computes paths for each dancer during a move, using the paths for each figure in
// figures/catalog.js

import { Position, center } from './positions.js';
import { createStationaryPath, createArcPath } from './paths.js';
import { getPositionsById, withSetState, progresses, executeMove } from './moves.js';
import { findFigure } from './figures/catalog.js';

/**
 * Calculate paths for all dancers during a move. The map may also have a `holds`
 * property listing groups of dancers who join hands in the middle of them, as
 * {ids, from, to} with the beats of the move during which they hold on (see
 * createStarPaths).
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

/**
 * Give dancers whom the figure leaves standing where they were, but whom the
 * progression moved (the couples crossing over at the ends of the set), a path from
 * their old position to their new one. Partners circle around their shared
 * midpoint, so they stay opposite each other, bulging away from the rest of the set.
 * @param {Map<string, import('./paths.js').Path>} paths - The figure's paths
 * @param {Map<string, Position>} endPosById - Where each dancer ends the move
 */
function addCrossOverPaths(paths, endPosById) {
    const setCenterY = center([...paths.values()].map(path => path.start)).y;

    paths.forEach((path, dancerId) => {
        const to = endPosById.get(dancerId);
        if (path.end.equals(to, 0.01)) return;

        if (!path.start.equals(path.end, 0.01)) {
            throw new Error(`Dancer ${dancerId} both progresses and moves; cannot animate cross-over`);
        }
        const from = path.start;
        const midpoint = new Position((from.x + to.x) / 2, (from.y + to.y) / 2);
        // Clockwise arcs pass over the top (y-down), counter-clockwise under the bottom
        const overTheTop = midpoint.y < setCenterY;
        paths.set(dancerId, createArcPath(from, to, midpoint, path.beats, 9, overTheTop));
    });
}
