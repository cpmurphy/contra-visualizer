import { Set } from './dancers.js';
import { toPixels } from './positions.js';
import { Animator, AnimationState } from './animator.js';
import { calculateMovePaths, executeMove, withSetState, pathCacheKey } from './pathCalculator.js';

// Application state
const state = {
    dance: null,
    dancerSet: null,
    currentPartIndex: 0,
    currentMoveIndex: 0,
    isPlaying: false,
    animationId: null,
    animator: new Animator(120), // 120 BPM
    animationState: null,
    lastFrameTime: null, // Timestamp of the most recently drawn frame
    currentPaths: null,
    pathCache: new Map() // Cache paths by move signature for performance
};

// DOM elements
const elements = {
    danceTitle: document.getElementById('dance-title'),
    danceAuthor: document.getElementById('dance-author'),
    danceFormation: document.getElementById('dance-formation'),
    moveList: document.getElementById('move-list'),
    canvas: document.getElementById('dance-canvas'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    prevMoveBtn: document.getElementById('prev-move-btn'),
    nextMoveBtn: document.getElementById('next-move-btn'),
    fileInput: document.getElementById('file-input'),
    loadDanceBtn: document.getElementById('load-dance-btn')
};

// File loading
elements.loadDanceBtn.addEventListener('click', () => {
    elements.fileInput.click();
});

elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                let data = JSON.parse(event.target.result);
                // If data is an array, take the first dance
                if (Array.isArray(data)) {
                    if (data.length === 0) {
                        alert('No dances found in file');
                        return;
                    }
                    data = data[0];
                }
                loadDance(data);
            } catch (error) {
                alert('Error loading dance file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
});

// Load dance data
function loadDance(dance) {
    stopAnimation();
    state.dance = dance;
    state.currentPartIndex = 0;
    state.currentMoveIndex = 0;
    state.isPlaying = false;

    // Create dancer set for improper dances
    if (dance.formation === 'improper') {
        state.dancerSet = new Set(6);
    }

    updateDanceInfo();
    updateMoveList();
    updateVisualization();
    updateControls();
}

// Update dance information display
function updateDanceInfo() {
    if (!state.dance) return;

    elements.danceTitle.textContent = state.dance.title || 'Untitled Dance';
    elements.danceAuthor.textContent = state.dance.author ? `by ${state.dance.author}` : '';
    elements.danceFormation.textContent = state.dance.formation ? `Formation: ${state.dance.formation}` : '';
}

// Update move list display
function updateMoveList() {
    elements.moveList.innerHTML = '';

    if (!state.dance || !state.dance.parts) return;

    let globalMoveIndex = 0;
    state.dance.parts.forEach((part, partIndex) => {
        const partSection = document.createElement('div');
        partSection.className = 'part-section';

        const partTitle = document.createElement('div');
        partTitle.className = 'part-title';
        partTitle.textContent = `${part.name} (${part.beats} beats)`;
        partSection.appendChild(partTitle);

        if (part.moves) {
            part.moves.forEach((move, moveIndex) => {
                const moveItem = document.createElement('li');
                moveItem.className = 'move-item';
                moveItem.dataset.partIndex = partIndex;
                moveItem.dataset.moveIndex = moveIndex;

                const description = document.createElement('span');
                description.className = 'move-description';
                description.textContent = formatMove(move);

                const beats = document.createElement('span');
                beats.className = 'move-beats';
                beats.textContent = `(${move.beats})`;

                moveItem.appendChild(description);
                moveItem.appendChild(beats);

                moveItem.addEventListener('click', () => {
                    // TODO: Implement jumping to arbitrary moves with snapshot/undo
                    // For now, disable clicking on moves
                    // state.currentPartIndex = partIndex;
                    // state.currentMoveIndex = moveIndex;
                    // updateMoveList();
                    // updateVisualization();
                });

                if (partIndex === state.currentPartIndex && moveIndex === state.currentMoveIndex) {
                    moveItem.classList.add('current');

                    // Add 'animating' class if animation is active
                    if (state.isPlaying && state.animationState) {
                        moveItem.classList.add('animating');
                    }
                }

                partSection.appendChild(moveItem);
                globalMoveIndex++;
            });
        }

        elements.moveList.appendChild(partSection);
    });
}

// Format move description
function formatMove(move) {
    let description = move.type.replace(/_/g, ' ');

    if (move.who) {
        description += ` (${move.who})`;
    }

    if (move.direction) {
        description += ` ${move.direction}`;
    }

    return description;
}

// Update visualization
function updateVisualization(customPositions = null) {
    // Clear canvas
    const svg = elements.canvas;
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }

    // Draw stage area
    drawStage(svg);

    if (!state.dance) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '400');
        text.setAttribute('y', '450');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '18');
        text.setAttribute('fill', '#999');
        text.textContent = 'Load a dance to begin';
        svg.appendChild(text);
        return;
    }

    // Draw dancers
    if (state.dancerSet) {
        drawDancers(svg, state.dancerSet, customPositions);
    }
}

// Draw stage with caller and musicians
function drawStage(svg) {
    // Stage background
    const stageRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    stageRect.setAttribute('x', '0');
    stageRect.setAttribute('y', '0');
    stageRect.setAttribute('width', '800');
    stageRect.setAttribute('height', '100');
    stageRect.setAttribute('fill', '#e8e8e8');
    stageRect.setAttribute('stroke', '#999');
    stageRect.setAttribute('stroke-width', '1');
    svg.appendChild(stageRect);

    const circleRadius = 12;

    // Caller (left side)
    const callerX = 150;
    const callerY = 50;

    const caller = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    caller.setAttribute('cx', callerX);
    caller.setAttribute('cy', callerY);
    caller.setAttribute('r', circleRadius);
    caller.setAttribute('fill', '#4a4a4a');
    caller.setAttribute('stroke', '#333');
    caller.setAttribute('stroke-width', '2');
    svg.appendChild(caller);

    // Caller label below
    const callerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    callerLabel.setAttribute('x', callerX);
    callerLabel.setAttribute('y', callerY + circleRadius + 14);
    callerLabel.setAttribute('text-anchor', 'middle');
    callerLabel.setAttribute('font-size', '11');
    callerLabel.setAttribute('fill', '#333');
    callerLabel.textContent = 'Caller';
    svg.appendChild(callerLabel);

    // Musicians in a regular crescent (to the right of caller)
    const baseX = 300;
    const spacing = 60;
    const musicians = [
        { cx: baseX, cy: 50, label: 'Musician' },
        { cx: baseX + spacing, cy: 50, label: 'Musician' },
        { cx: baseX + spacing * 2, cy: 50, label: 'Musician' }
    ];

    musicians.forEach((musician) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', musician.cx);
        circle.setAttribute('cy', musician.cy);
        circle.setAttribute('r', circleRadius);
        circle.setAttribute('fill', '#666');
        circle.setAttribute('stroke', '#444');
        circle.setAttribute('stroke-width', '1.5');
        svg.appendChild(circle);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', musician.cx);
        label.setAttribute('y', musician.cy + circleRadius + 14);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '11');
        label.setAttribute('fill', '#333');
        label.textContent = musician.label;
        svg.appendChild(label);
    });
}

// Draw dancers from the Set
function drawDancers(svg, dancerSet, customPositions = null) {
    const dancers = dancerSet.dancers;
    const svgWidth = 800;
    const svgHeight = 900;
    const dancerRadius = 20;

    // Get normalized positions - either custom (for animation) or from the Set
    let positions;
    if (customPositions) {
        // Custom positions is a Map from dancer ID to Position
        positions = dancers.map(dancer => customPositions.get(dancer.id));
    } else {
        // Get positions from the Set
        positions = dancerSet.getPositions();
    }

    // Draw dancers in reading order: left to right, top to bottom
    // The Set stores 12 dancers in a 2-column layout (6 rows)
    dancers.forEach((dancer, index) => {
        // Convert normalized position to pixel coordinates
        const pixelPos = toPixels(positions[index], svgWidth, svgHeight);
        const x = pixelPos.x;
        const y = pixelPos.y;

        // Draw circle with couple color
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', dancerRadius);
        circle.setAttribute('fill', dancer.couple.color);
        circle.setAttribute('stroke', '#333');
        circle.setAttribute('stroke-width', '2');

        // Make inactive dancers semi-transparent with smooth transition
        if (!dancer.active) {
            circle.setAttribute('opacity', '0.3');
        } else {
            circle.setAttribute('opacity', '1.0');
        }

        // Add CSS transition for smooth opacity changes
        circle.style.transition = 'opacity 0.3s ease-in-out';

        svg.appendChild(circle);

        // Draw label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', y + 5);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '14');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('fill', 'white');
        label.textContent = dancer.getLabel();

        if (!dancer.active) {
            label.setAttribute('opacity', '0.3');
        } else {
            label.setAttribute('opacity', '1.0');
        }

        label.style.transition = 'opacity 0.3s ease-in-out';

        svg.appendChild(label);
    });
}

// Control button handlers
elements.playPauseBtn.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    updateControls();

    if (state.isPlaying) {
        if (state.animationState) {
            // Resume a paused move (on the next frame) where it left off
            state.animationId = requestAnimationFrame(animate);
            updateMoveList();
        } else {
            startAnimation();
        }
    } else {
        pauseAnimation();
    }
});

elements.prevMoveBtn.addEventListener('click', () => {
    // Stop any ongoing animation
    stopAnimation();
    state.isPlaying = false;
    updateControls();
    goToPreviousMove();
});

elements.nextMoveBtn.addEventListener('click', () => {
    // Stop any ongoing animation
    stopAnimation();
    state.isPlaying = false;
    updateControls();
    goToNextMove();
});

function goToNextMove() {
    if (!state.dance || !state.dancerSet) return;

    const currentPart = state.dance.parts[state.currentPartIndex];
    const currentMove = currentPart.moves[state.currentMoveIndex];

    // If we're at the first move, clear snapshots before advancing
    // (we don't need history from previous iterations)
    if (state.currentPartIndex === 0 && state.currentMoveIndex === 0) {
        state.dancerSet.clearSnapshots();
    }

    // Execute the current move (snapshot is taken automatically)
    executeMove(state.dancerSet, currentMove);

    // Advance to next move
    if (state.currentMoveIndex < currentPart.moves.length - 1) {
        state.currentMoveIndex++;
    } else if (state.currentPartIndex < state.dance.parts.length - 1) {
        state.currentPartIndex++;
        state.currentMoveIndex = 0;
    } else {
        // Loop back to beginning
        state.currentPartIndex = 0;
        state.currentMoveIndex = 0;
    }

    updateMoveList();
    updateVisualization();
}

function goToPreviousMove() {
    if (!state.dance || !state.dancerSet) return;

    // Undo to restore previous snapshot
    state.dancerSet.undo();

    // Move pointer backwards
    if (state.currentMoveIndex > 0) {
        state.currentMoveIndex--;
    } else if (state.currentPartIndex > 0) {
        state.currentPartIndex--;
        const prevPart = state.dance.parts[state.currentPartIndex];
        state.currentMoveIndex = prevPart.moves.length - 1;
    } else {
        // Go to last move
        state.currentPartIndex = state.dance.parts.length - 1;
        const lastPart = state.dance.parts[state.currentPartIndex];
        state.currentMoveIndex = lastPart.moves.length - 1;
    }

    updateMoveList();
    updateVisualization();
}

/**
 * Get paths for a move from the given set state, using the cache when possible
 * @param {Object} move - The move object
 * @param {Set} dancerSet - The set state the move starts from
 * @returns {Map<string, import('./paths.js').Path>}
 */
function getMovePaths(move, dancerSet) {
    // Cache key is based on move properties and current positions
    const cacheKey = pathCacheKey(move, dancerSet);
    let paths = state.pathCache.get(cacheKey);

    if (!paths) {
        paths = calculateMovePaths(move, dancerSet);
        state.pathCache.set(cacheKey, paths);
    }

    return paths;
}

/**
 * Get the move after the current one, wrapping around to the start of the dance
 * @returns {Object}
 */
function getNextMove() {
    const parts = state.dance.parts;
    const currentPart = parts[state.currentPartIndex];
    if (state.currentMoveIndex < currentPart.moves.length - 1) {
        return currentPart.moves[state.currentMoveIndex + 1];
    }
    const nextPart = parts[(state.currentPartIndex + 1) % parts.length];
    return nextPart.moves[0];
}

/**
 * Start animating the current move
 * @param {number} startTime - Timestamp at which the move begins; when continuing
 *   from the previous move this is that move's completion time, so no time is lost
 */
function startAnimation(startTime = performance.now()) {
    if (!state.dance || !state.dancerSet) {
        console.warn('Cannot start animation: no dance or dancer set loaded');
        return;
    }

    const currentPart = state.dance.parts[state.currentPartIndex];
    if (!currentPart) {
        console.error('Invalid part index:', state.currentPartIndex);
        return;
    }

    const currentMove = currentPart.moves[state.currentMoveIndex];
    if (!currentMove) {
        console.error('Invalid move index:', state.currentMoveIndex);
        return;
    }

    try {
        // Paths of the move just finished (null when starting from a standstill)
        const previousPaths = state.currentPaths;

        state.currentPaths = getMovePaths(currentMove, state.dancerSet);

        // Paths of the upcoming move, computed from the set as it will be after this one
        const nextPaths = withSetState(
            state.dancerSet,
            set => executeMove(set, currentMove),
            set => getMovePaths(getNextMove(), set)
        );

        // Create animation state, blending into the adjacent moves at each end
        state.animationState = new AnimationState(state.currentPaths, state.animator, {
            previous: previousPaths,
            next: nextPaths
        });
        state.animationState.start(startTime);

        state.animationId = requestAnimationFrame(animate);

        // Update move list to show animating state
        updateMoveList();
    } catch (error) {
        console.error('Failed to start animation:', error);
        state.isPlaying = false;
        updateControls();
    }
}

/**
 * Animation loop: draw the current frame and schedule the next one
 * @param {number} timestamp - Frame timestamp from requestAnimationFrame
 */
function animate(timestamp) {
    // Check if animation should stop (user may have stopped it)
    if (!state.isPlaying || !state.animationState) return;

    try {
        // Resuming after a pause: the clock picks up from the last frame drawn
        if (state.animationState.isPaused()) {
            state.animationState.resume(timestamp);
        }

        // Get current positions
        const currentPositions = state.animationState.getCurrentPositions(timestamp);

        // Update visualization with interpolated positions
        updateVisualization(currentPositions);
        state.lastFrameTime = timestamp;

        // Check if animation is complete
        if (state.animationState.isComplete(timestamp)) {
            // Animation finished - advance to next move, starting it exactly
            // where this one ended
            advanceToNextMove(state.animationState.getCompletionTime());
        } else {
            // Continue animation
            state.animationId = requestAnimationFrame(animate);
        }
    } catch (error) {
        console.error('Animation error:', error);
        stopAnimation();
        state.isPlaying = false;
        updateControls();
    }
}

/**
 * Pause mid-move, keeping the animation state so play continues from here
 */
function pauseAnimation() {
    if (state.animationId) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
    }

    // Freeze at the last frame drawn, so resuming continues from what's on screen
    // (or at the start, if this move hasn't drawn a frame yet)
    const animationState = state.animationState;
    if (animationState && !animationState.isPaused()) {
        animationState.pause(Math.max(state.lastFrameTime ?? -Infinity, animationState.startTime));
    }

    updateMoveList();
}

function stopAnimation() {
    if (state.animationId) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
    }
    state.animationState = null;
    state.currentPaths = null;

    // Update move list to remove animating state
    updateMoveList();
}

/**
 * Execute the current move and advance to the next one
 * @param {number} startTime - Timestamp at which the next move's animation begins
 */
function advanceToNextMove(startTime) {
    if (!state.dance || !state.dancerSet) return;

    const currentPart = state.dance.parts[state.currentPartIndex];
    const currentMove = currentPart.moves[state.currentMoveIndex];

    // If we're at the first move, clear snapshots before advancing
    // (we don't need history from previous iterations)
    if (state.currentPartIndex === 0 && state.currentMoveIndex === 0) {
        state.dancerSet.clearSnapshots();
    }

    // Execute the current move on the Set (snapshot is taken automatically)
    executeMove(state.dancerSet, currentMove);

    // Advance to next move
    if (state.currentMoveIndex < currentPart.moves.length - 1) {
        state.currentMoveIndex++;
    } else if (state.currentPartIndex < state.dance.parts.length - 1) {
        state.currentPartIndex++;
        state.currentMoveIndex = 0;
    } else {
        // Loop back to beginning
        state.currentPartIndex = 0;
        state.currentMoveIndex = 0;
    }

    updateMoveList();

    // If still playing, start animation for next move
    if (state.isPlaying) {
        startAnimation(startTime);
    } else {
        // Not playing anymore - just update visualization
        updateVisualization();
    }
}

function updateControls() {
    elements.playPauseBtn.textContent = state.isPlaying ? 'Pause' : 'Play';
    elements.prevMoveBtn.disabled = !state.dance;
    elements.nextMoveBtn.disabled = !state.dance;
    elements.playPauseBtn.disabled = !state.dance;
}

// Initialize
updateControls();
