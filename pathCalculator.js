// Path calculator for dance moves
// Computes paths for each dancer during a move

import { Position, center, distance } from './positions.js';
import { Path, createStraightPath, createStationaryPath, createArcPath } from './paths.js';

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
    } else if (type.includes('circle left') || type.includes('circle right') ||
               type.includes('star left') || type.includes('star right')) {
        // Circular moves - arc paths around minor set centers
        const isClockwise = type.includes('right');
        createCircularPaths(dancerSet, startPosById, endPosById, paths, beats, isClockwise);
    } else if (type === 'swing') {
        // Swing moves - dancers rotate around common center
        const swingWho = move.who || 'neighbor';
        createSwingPaths(dancerSet, startPosById, endPosById, paths, beats, swingWho);
    } else if (type.includes('chain')) {
        // Chain moves - dancers cross with arced paths
        createChainPaths(dancerSet, startPosById, endPosById, paths, beats);
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
 * Create circular arc paths for dancers during circle/star moves
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {boolean} isClockwise
 */
function createCircularPaths(dancerSet, startPosById, endPosById, paths, beats, isClockwise) {
    // Determine starting index based on active state
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    // Process each minor set of 4 dancers
    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) {
            break;
        }

        // Get the 4 dancers in this minor set
        const minorSetDancers = [
            dancerSet.dancers[i],
            dancerSet.dancers[i + 1],
            dancerSet.dancers[i + 2],
            dancerSet.dancers[i + 3]
        ];

        // Get start positions for this minor set
        const minorSetStartPositions = minorSetDancers.map(d => startPosById.get(d.id));

        // Calculate center point of this minor set
        const centerPos = center(minorSetStartPositions);

        // Create arc paths for each dancer in this minor set
        minorSetDancers.forEach(dancer => {
            const start = startPosById.get(dancer.id);
            const end = endPosById.get(dancer.id);

            if (!dancer.active) {
                // Dancer is inactive - create stationary path
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else if (start.equals(end, 0.01)) {
                // Full rotation (e.g., star left 4 places) - dancer returns to start
                // Generate explicit 360° circle animation
                const radius = distance(start, centerPos);
                const startAngle = Math.atan2(start.y - centerPos.y, start.x - centerPos.x);

                const waypoints = [];
                for (let i = 0; i <= 7; i++) {
                    const progress = i / 7;
                    const angleDelta = isClockwise ? -2 * Math.PI : 2 * Math.PI;
                    const angle = startAngle + angleDelta * progress;
                    waypoints.push(new Position(
                        centerPos.x + radius * Math.cos(angle),
                        centerPos.y + radius * Math.sin(angle)
                    ));
                }
                paths.set(dancer.id, new Path(waypoints, beats));
            } else {
                // Partial rotation - create normal arc path
                paths.set(dancer.id, createArcPath(start, end, centerPos, beats, 8, isClockwise));
            }
        });
    }

    // Handle any inactive dancers at the beginning
    if (startIndex === 2) {
        // First couple is inactive
        paths.set(dancerSet.dancers[0].id, createStationaryPath(startPosById.get(dancerSet.dancers[0].id), beats));
        paths.set(dancerSet.dancers[1].id, createStationaryPath(startPosById.get(dancerSet.dancers[1].id), beats));
    }

    // Handle any inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let i = dancerSet.dancers.length - remainder; i < dancerSet.dancers.length; i++) {
            const dancer = dancerSet.dancers[i];
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        }
    }
}

/**
 * Create swing paths for dancers
 * In a swing, two dancers rotate around their shared center point.
 * - Neighbor swing: L1 with R2, L2 with R1
 * - Partner swing: L1 with R1, L2 with R2
 * 
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 * @param {string} swingWho - 'neighbor' or 'partner'
 */
function createSwingPaths(dancerSet, startPosById, endPosById, paths, beats, swingWho) {
    // Determine starting index based on active state
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    // Process each minor set of 4 dancers
    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) {
            break;
        }

        // Get the 4 dancers in this minor set
        const minorSetDancers = [
            dancerSet.dancers[i],
            dancerSet.dancers[i + 1],
            dancerSet.dancers[i + 2],
            dancerSet.dancers[i + 3]
        ];

        // Identify dancers by role and position
        // Position 0 and 2 are left column, 1 and 3 are right column
        const leftDancers = [minorSetDancers[0], minorSetDancers[2]];
        const rightDancers = [minorSetDancers[1], minorSetDancers[3]];

        // Find larks and robins
        const leftLark = leftDancers.find(d => d.role === 'lark');
        const leftRobin = leftDancers.find(d => d.role === 'robin');
        const rightLark = rightDancers.find(d => d.role === 'lark');
        const rightRobin = rightDancers.find(d => d.role === 'robin');

        // Determine swing pairs based on swing type
        // Each pair also has a side indicator for offset calculation
        // All pairs swing clockwise, but we offset the swing center outward to avoid collisions
        let swingPairs;
        if (swingWho === 'partner') {
            // Partner swing: each lark swings with their partner (robin)
            // In improper formation, partners start on opposite sides of the set
            // Assign side based on where they END UP (on the lark's original side)
            const leftLarkSide = startPosById.get(leftLark?.id)?.x < 45 ? 'left' : 'right';
            const rightLarkSide = startPosById.get(rightLark?.id)?.x < 45 ? 'left' : 'right';
            swingPairs = [
                { dancers: [leftLark, leftLark?.partner], side: leftLarkSide },
                { dancers: [rightLark, rightLark?.partner], side: rightLarkSide }
            ].filter(pair => pair.dancers[0] && pair.dancers[1]);
        } else {
            // Neighbor swing: dancers on left side swing together, dancers on right side swing together
            // In a minor set, neighbors are those across from each other on the same side
            swingPairs = [
                { dancers: [leftLark, leftRobin], side: 'left' },
                { dancers: [rightLark, rightRobin], side: 'right' }
            ].filter(pair => pair.dancers[0] && pair.dancers[1]);
        }

        // Create swing paths for each pair
        swingPairs.forEach(({ dancers: [dancer1, dancer2], side }) => {
            if (!dancer1.active || !dancer2.active) {
                // Create stationary paths for inactive dancers
                if (!dancer1.active) {
                    paths.set(dancer1.id, createStationaryPath(startPosById.get(dancer1.id), beats));
                }
                if (!dancer2.active) {
                    paths.set(dancer2.id, createStationaryPath(startPosById.get(dancer2.id), beats));
                }
                return;
            }

            const start1 = startPosById.get(dancer1.id);
            const start2 = startPosById.get(dancer2.id);
            const end1 = endPosById.get(dancer1.id);
            const end2 = endPosById.get(dancer2.id);

            // Calculate the center point between the two dancers' END positions
            const swingCenterX = (end1.x + end2.x) / 2;
            const swingCenterY = (end1.y + end2.y) / 2;
            
            // Determine if this is a "same column" swing (neighbors) or "cross column" swing (partners)
            // For same-column swings, offset outward to avoid collision with other pair
            // For cross-column swings, the dancers meet in the middle so use no offset
            const startDist = Math.abs(start1.x - start2.x);
            const isSameColumnSwing = startDist < 5.0; // Dancers start in same column
            
            let swingCenter;
            if (isSameColumnSwing) {
                // Neighbor swing: offset center outward to avoid collision with other pair
                const outwardOffset = 8.0;
                const offsetX = side === 'left' ? -outwardOffset : outwardOffset;
                swingCenter = new Position(swingCenterX + offsetX, swingCenterY);
            } else {
                // Partner swing in improper: dancers come together from opposite sides
                // Use the end center without offset, and stagger the vertical position
                // to avoid collision between the two swinging pairs
                const verticalOffset = side === 'left' ? -3.0 : 3.0;
                swingCenter = new Position(swingCenterX, swingCenterY + verticalOffset);
            }

            // Calculate radius from end positions to the offset center
            const radius = distance(end1, swingCenter);

            // All swings are clockwise (standard in contra dance)
            const clockwise = true;

            // Create arc paths for both dancers rotating around the shared center
            [dancer1, dancer2].forEach(dancer => {
                const start = startPosById.get(dancer.id);
                const end = endPosById.get(dancer.id);

                if (start.equals(end, 0.01)) {
                    // Full rotation - dancer returns to start position
                    const startAngle = Math.atan2(start.y - swingCenter.y, start.x - swingCenter.x);

                    const waypoints = [];
                    for (let j = 0; j <= 8; j++) {
                        const progress = j / 8;
                        // Clockwise rotation
                        const angleDelta = -2 * Math.PI;
                        const angle = startAngle + angleDelta * progress;
                        waypoints.push(new Position(
                            swingCenter.x + radius * Math.cos(angle),
                            swingCenter.y + radius * Math.sin(angle)
                        ));
                    }
                    paths.set(dancer.id, new Path(waypoints, beats));
                } else {
                    // Create a swing path that ensures exact start and end positions
                    // We generate waypoints that arc from start toward the swing center, then to end
                    const startAngle = Math.atan2(start.y - swingCenter.y, start.x - swingCenter.x);
                    const endAngle = Math.atan2(end.y - swingCenter.y, end.x - swingCenter.x);
                    
                    // Calculate angular distance (clockwise = negative)
                    let angleDelta = endAngle - startAngle;
                    if (angleDelta > 0) angleDelta -= 2 * Math.PI;
                    
                    // Generate waypoints
                    const waypointCount = 8;
                    const waypoints = [];
                    
                    for (let j = 0; j < waypointCount; j++) {
                        const progress = j / (waypointCount - 1);
                        
                        if (j === 0) {
                            // First waypoint is exactly the start position
                            waypoints.push(start.clone());
                        } else if (j === waypointCount - 1) {
                            // Last waypoint is exactly the end position
                            waypoints.push(end.clone());
                        } else {
                            // Intermediate waypoints arc around the offset swing center
                            const angle = startAngle + angleDelta * progress;
                            // Interpolate radius from start to end
                            const startRadius = distance(start, swingCenter);
                            const endRadius = radius;
                            const currentRadius = startRadius + (endRadius - startRadius) * progress;
                            waypoints.push(new Position(
                                swingCenter.x + currentRadius * Math.cos(angle),
                                swingCenter.y + currentRadius * Math.sin(angle)
                            ));
                        }
                    }
                    
                    paths.set(dancer.id, new Path(waypoints, beats));
                }
            });
        });
    }

    // Handle any inactive dancers at the beginning
    if (startIndex === 2) {
        // First couple is inactive
        paths.set(dancerSet.dancers[0].id, createStationaryPath(startPosById.get(dancerSet.dancers[0].id), beats));
        paths.set(dancerSet.dancers[1].id, createStationaryPath(startPosById.get(dancerSet.dancers[1].id), beats));
    }

    // Handle any inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let i = dancerSet.dancers.length - remainder; i < dancerSet.dancers.length; i++) {
            const dancer = dancerSet.dancers[i];
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        }
    }
}

/**
 * Create chain paths for dancers - crossing paths with collision avoidance
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
function createChainPaths(dancerSet, startPosById, endPosById, paths, beats) {
    // Determine starting index based on active state
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;

    // Process each minor set of 4 dancers
    for (let i = startIndex; i < dancerSet.dancers.length; i += 4) {
        if (dancerSet.dancers.length - i < 4) {
            break;
        }

        // Get the 4 dancers in this minor set
        const minorSetDancers = [
            dancerSet.dancers[i],
            dancerSet.dancers[i + 1],
            dancerSet.dancers[i + 2],
            dancerSet.dancers[i + 3]
        ];

        // Create paths for each dancer
        minorSetDancers.forEach(dancer => {
            const start = startPosById.get(dancer.id);
            const end = endPosById.get(dancer.id);

            if (!dancer.active) {
                // Dancer is inactive - create stationary path
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else if (start.equals(end, 0.01)) {
                // Active dancer doesn't move during this chain (other role is chaining)
                paths.set(dancer.id, createStationaryPath(start, beats));
            } else {
                // Dancers cross - create arc path to avoid collision
                const midX = (start.x + end.x) / 2;
                const midY = (start.y + end.y) / 2;

                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const perpX = -dy;
                const perpY = dx;
                const len = Math.sqrt(perpX * perpX + perpY * perpY);

                const offsetScale = 12.0; // Higher arcs to prevent collisions during chains
                const offsetX = len > 0 ? (perpX / len) * offsetScale : 0;
                const offsetY = len > 0 ? (perpY / len) * offsetScale : 0;

                const centerPos = new Position(midX + offsetX, midY + offsetY);
                paths.set(dancer.id, createArcPath(start, end, centerPos, beats, 10, false));
            }
        });
    }

    // Handle any inactive dancers at the beginning
    if (startIndex === 2) {
        // First couple is inactive
        paths.set(dancerSet.dancers[0].id, createStationaryPath(startPosById.get(dancerSet.dancers[0].id), beats));
        paths.set(dancerSet.dancers[1].id, createStationaryPath(startPosById.get(dancerSet.dancers[1].id), beats));
    }

    // Handle any inactive dancers at the end
    const remainder = (dancerSet.dancers.length - startIndex) % 4;
    if (remainder > 0) {
        for (let i = dancerSet.dancers.length - remainder; i < dancerSet.dancers.length; i++) {
            const dancer = dancerSet.dancers[i];
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        }
    }
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
