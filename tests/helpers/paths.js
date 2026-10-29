// Checks on dancers' paths shared by the path tests

import { toPixels, isInBounds } from '../../positions.js';
import { SVG_WIDTH, SVG_HEIGHT } from '../../layout.js';

// Helper to check if all waypoints are within bounds
export function allWaypointsInBounds(paths) {
    for (const path of paths.values()) {
        for (const waypoint of path.getWaypoints()) {
            if (!isInBounds(waypoint, 0, 0, 100, 100)) {
                return false;
            }
        }
    }
    return true;
}

// Helper to check for overlaps at any waypoint. Distances are in pixels, since
// normalized units are different sizes across and down the canvas. Dancers have a
// radius of 20px, so 40px apart is touching.
export function hasNoOverlaps(paths, minDistance = 44) {
    const allDancers = [...paths.keys()];
    const maxProgress = 20; // Check 20 points along the path

    for (let p = 0; p <= maxProgress; p++) {
        const progress = p / maxProgress;
        const positions = new Map();

        // Get position of each dancer at this progress
        for (const dancerId of allDancers) {
            const path = paths.get(dancerId);
            positions.set(dancerId, path.getPositionAt(progress));
        }

        // Check all pairs for overlap
        for (let i = 0; i < allDancers.length; i++) {
            for (let j = i + 1; j < allDancers.length; j++) {
                const pos1 = positions.get(allDancers[i]);
                const pos2 = positions.get(allDancers[j]);
                const px1 = toPixels(pos1, SVG_WIDTH, SVG_HEIGHT);
                const px2 = toPixels(pos2, SVG_WIDTH, SVG_HEIGHT);
                const dist = Math.hypot(px1.x - px2.x, px1.y - px2.y);

                if (dist < minDistance) {
                    return false;
                }
            }
        }
    }

    return true;
}
