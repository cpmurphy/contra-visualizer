// Path calculator for dance moves
// Computes paths for each dancer during a move

import { Position, center, distance } from './positions.js';
import { createStraightPath, createStationaryPath, createArcPath } from './paths.js';

/**
 * Calculate paths for all dancers during a move
 * @param {Object} move - The move object with type, beats, etc.
 * @param {import('./dancers.js').Set} dancerSet - The current set state
 * @returns {Map<string, import('./paths.js').Path>} Map from dancer ID to Path
 */
export function calculateMovePaths(move, dancerSet) {
    const paths = new Map();

    // Get current positions (before the move)
    const startPositions = dancerSet.getPositions();

    // Create a temporary clone to execute the move and get end positions
    const endDancerSet = cloneSetState(dancerSet);
    executeMoveSilently(endDancerSet, move);
    const endPositions = endDancerSet.getPositions();

    // Map dancer IDs to their start and end positions
    const startPosById = new Map();
    const endPosById = new Map();

    dancerSet.dancers.forEach((dancer, index) => {
        startPosById.set(dancer.id, startPositions[index]);
    });

    endDancerSet.dancers.forEach((dancer, index) => {
        endPosById.set(dancer.id, endPositions[index]);
    });

    // Generate paths for each dancer
    const type = move.type.toLowerCase();
    const beats = move.beats || 8;

    if (type === 'balance' || type.includes('long lines')) {
        // No movement - stationary paths
        dancerSet.dancers.forEach(dancer => {
            const pos = startPosById.get(dancer.id);
            paths.set(dancer.id, createStationaryPath(pos, beats));
        });
    } else if (type === 'do-si-do' || type === 'dosido') {
        // Check if it's an integer number of times (returns to start)
        const times = 1.0; // Default from app.js

        if (Number.isInteger(times)) {
            // Returns to original position - stationary
            dancerSet.dancers.forEach(dancer => {
                const pos = startPosById.get(dancer.id);
                paths.set(dancer.id, createStationaryPath(pos, beats));
            });
        } else {
            // Swaps positions - create arc paths to avoid collisions
            dancerSet.dancers.forEach(dancer => {
                const start = startPosById.get(dancer.id);
                const end = endPosById.get(dancer.id);

                if (start.equals(end, 0.01)) {
                    // Dancer doesn't move (inactive)
                    paths.set(dancer.id, createStationaryPath(start, beats));
                } else {
                    // Create arc path to avoid collision
                    // Use midpoint as center, offset to the side
                    const mid = new Position(
                        (start.x + end.x) / 2 + 5, // Offset to avoid collision
                        (start.y + end.y) / 2
                    );
                    paths.set(dancer.id, createArcPath(start, end, mid, beats, 8, false));
                }
            });
        }
    } else {
        // For any other move, create straight paths
        dancerSet.dancers.forEach(dancer => {
            const start = startPosById.get(dancer.id);
            const end = endPosById.get(dancer.id);

            if (start.equals(end, 0.01)) {
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else {
                paths.set(dancer.id, createStraightPath(start, end, beats, 5));
            }
        });
    }

    return paths;
}

/**
 * Clone the dancer set state for simulation
 * @param {import('./dancers.js').Set} dancerSet
 * @returns {import('./dancers.js').Set}
 */
function cloneSetState(dancerSet) {
    // Create a shallow clone by manipulating the dancers array
    // We can't easily deep clone the Set, so we'll work with the existing one
    // This is a temporary solution - in production we'd need proper cloning
    const clonedSet = Object.create(Object.getPrototypeOf(dancerSet));
    clonedSet.dancers = [...dancerSet.dancers];
    clonedSet.dancerMap = dancerSet.dancerMap;
    clonedSet.snapshots = [];

    return clonedSet;
}

/**
 * Execute a move without taking snapshots (for simulation)
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Object} move
 */
function executeMoveSilently(dancerSet, move) {
    const type = move.type.toLowerCase();

    // Override snapshot to do nothing during simulation
    const originalSnapshot = dancerSet.snapshot;
    dancerSet.snapshot = () => {};

    try {
        // Handle progression at the START of the move
        if (move.progression) {
            dancerSet.progress();
        }

        // Parse and execute the move (copied from app.js)
        if (type.includes('circle left')) {
            const match = type.match(/circle left (\d+)/);
            if (match) {
                dancerSet.circleLeft(parseInt(match[1]));
            }
        } else if (type.includes('circle right')) {
            const match = type.match(/circle right (\d+)/);
            if (match) {
                dancerSet.circleRight(parseInt(match[1]));
            }
        } else if (type.includes('star left')) {
            const match = type.match(/star left (\d+)/);
            if (match) {
                dancerSet.starLeft(parseInt(match[1]));
            }
        } else if (type.includes('star right')) {
            const match = type.match(/star right (\d+)/);
            if (match) {
                dancerSet.starRight(parseInt(match[1]));
            }
        } else if (type === 'balance') {
            dancerSet.balance();
        } else if (type === 'swing') {
            if (move.who === 'neighbor') {
                dancerSet.swing('neighbor');
            } else if (move.who === 'partner') {
                dancerSet.swing('partner');
            }
        } else if (type.includes('long lines')) {
            dancerSet.longLines();
        } else if (type.includes('chain')) {
            if (move.who === 'robins' || move.who === 'robin') {
                dancerSet.chainRobins();
            } else if (move.who === 'larks' || move.who === 'lark') {
                dancerSet.chainLarks();
            }
        } else if (type === 'do-si-do' || type === 'dosido') {
            dancerSet.doSiDo(1.0);
        }
    } finally {
        // Restore original snapshot function
        dancerSet.snapshot = originalSnapshot;
    }
}
