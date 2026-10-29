// Paths for the figures in which dancers go forward and back: balances and long
// lines

import { Position, toPixels, center } from '../positions.js';
import { createOutAndBackPath, createStationaryPath } from '../paths.js';
import { SVG_WIDTH, SVG_HEIGHT, DANCER_RADIUS_PX } from '../layout.js';
import { TAKE_HANDS_BEATS } from './shared.js';

/**
 * Create balance paths - neighbor pairs approach each other vertically and retreat.
 * Within each minor set, left-column and right-column pairs move toward each other.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function createBalancePaths(dancerSet, startPosById, paths, beats) {
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) break;

        // Within a minor set [i, i+1, i+2, i+3]:
        // Left column pair: dancers[i] and dancers[i+2]
        // Right column pair: dancers[i+1] and dancers[i+3]
        const columnPairs = [
            [dancerSet.dancers[i], dancerSet.dancers[i + 2]],
            [dancerSet.dancers[i + 1], dancerSet.dancers[i + 3]]
        ];

        for (const [d1, d2] of columnPairs) {
            addBalancePairPaths(d1, d2, startPosById, paths, beats);
        }
    }

    // Handle inactive dancers at the beginning
    if (startIndex === 2) {
        for (let i = 0; i < 2; i++) {
            const d = dancerSet.dancers[i];
            paths.set(d.id, createStationaryPath(startPosById.get(d.id), beats));
        }
    }

    // Handle inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let i = dancerSet.dancers.length - remainder; i < dancerSet.dancers.length; i++) {
            const d = dancerSet.dancers[i];
            paths.set(d.id, createStationaryPath(startPosById.get(d.id), beats));
        }
    }
}

/**
 * Create balance paths for a pair of dancers: they step towards each other, stopping
 * a little apart, and back, holding hands (added to paths.holds).
 * @param {import('./dancers.js').Dancer} d1
 * @param {import('./dancers.js').Dancer} d2
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function addBalancePairPaths(d1, d2, startPosById, paths, beats) {
    const pos1 = startPosById.get(d1.id);
    const pos2 = startPosById.get(d2.id);

    // Compute how far to approach while maintaining a minimum gap (in pixels)
    const p1 = toPixels(pos1, SVG_WIDTH, SVG_HEIGHT);
    const p2 = toPixels(pos2, SVG_WIDTH, SVG_HEIGHT);
    const gap = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const minGap = 3 * DANCER_RADIUS_PX;
    const maxApproach = gap > 0 ? Math.max(0, (gap - minGap) / gap) : 0;

    const turn1 = new Position(pos1.x + (pos2.x - pos1.x) * maxApproach / 2, pos1.y + (pos2.y - pos1.y) * maxApproach / 2);
    const turn2 = new Position(pos2.x + (pos1.x - pos2.x) * maxApproach / 2, pos2.y + (pos1.y - pos2.y) * maxApproach / 2);

    paths.set(d1.id, createOutAndBackPath(pos1, turn1, beats));
    paths.set(d2.id, createOutAndBackPath(pos2, turn2, beats));
    paths.holds = [...(paths.holds || []),
        { ids: [d1.id, d2.id], shape: 'line', from: TAKE_HANDS_BEATS, to: beats - TAKE_HANDS_BEATS }];
}

/**
 * Create long lines paths - two vertical lines approach each other and retreat.
 * Dancers move horizontally toward the center line, then return to their starting position.
 * Each line holds hands all the way along, added to paths.holds.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function createLongLinesPaths(dancerSet, startPosById, paths, beats) {
    // Find the center x between the two columns
    const allPositions = dancerSet.dancers.map(d => startPosById.get(d.id));
    const centerX = center(allPositions).x;

    // Compute how far each side can approach while maintaining a minimum gap
    // Find the minimum distance from any dancer to center
    const activePositions = dancerSet.dancers
        .filter(d => d.active)
        .map(d => startPosById.get(d.id));
    const minDistToCenter = Math.min(...activePositions.map(p => Math.abs(p.x - centerX)));
    // Come right up to the other line, stopping just short of touching
    const minGap = ((DANCER_RADIUS_PX + 5) / SVG_WIDTH) * 100;
    const maxApproach = Math.max(0, (minDistToCenter - minGap) / minDistToCenter);

    dancerSet.dancers.forEach(dancer => {
        const start = startPosById.get(dancer.id);

        if (!dancer.active) {
            paths.set(dancer.id, createStationaryPath(start, beats));
            return;
        }

        const approachX = start.x + (centerX - start.x) * maxApproach;
        const approachPos = new Position(approachX, start.y);

        paths.set(dancer.id, createOutAndBackPath(start, approachPos, beats));
    });

    // Those out at the ends stand still, so only those dancing join the lines
    const active = dancerSet.dancers.filter(d => d.active);
    const lines = [
        active.filter(d => startPosById.get(d.id).x < centerX),
        active.filter(d => startPosById.get(d.id).x >= centerX)
    ];
    paths.holds = lines
        .filter(line => line.length > 1)
        .map(line => ({
            ids: line
                .sort((a, b) => startPosById.get(a.id).y - startPosById.get(b.id).y)
                .map(d => d.id),
            shape: 'line',
            from: TAKE_HANDS_BEATS,
            to: beats - TAKE_HANDS_BEATS
        }));
}
