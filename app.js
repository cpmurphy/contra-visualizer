import { Set } from './dancers.js';
import { toPixels } from './positions.js';
import { Animator, AnimationState } from './animator.js';
import { calculateMovePaths, executeMove, withSetState, pathCacheKey, isMoveSupported } from './pathCalculator.js';
import { dances, danceSlug, findDance } from './library.js';
import { Metronome, beatAccent, danceBeats, locateBeat, moveStartBeat } from './metronome.js';
import { INTRO_BEATS, PRACTICE_ROUNDS, callSchedule, displayCall, judgeCall } from './calls.js';
import { createStationaryPath } from './paths.js';

const APP_TITLE = document.title;

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
    pathCache: new Map(), // Cache paths by move signature for performance
    session: null // Practice session in progress (see startSession)
};

/** Beats a finished call stays lit before the next one replaces it */
const CALL_HOLD_BEATS = 1;

// Clicks on the beat while playing, accented by where the beat falls in its part
const metronome = new Metronome({
    accentOf: beat => beatAccent(locateBeat(state.dance, beat).beatInPart)
});

const METRONOME_SETTING = 'metronome';

// DOM elements
const elements = {
    danceTitle: document.getElementById('dance-title'),
    danceAuthor: document.getElementById('dance-author'),
    danceFormation: document.getElementById('dance-formation'),
    danceNotes: document.getElementById('dance-notes'),
    moveList: document.getElementById('move-list'),
    canvas: document.getElementById('dance-canvas'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    prevMoveBtn: document.getElementById('prev-move-btn'),
    nextMoveBtn: document.getElementById('next-move-btn'),
    metronomeToggle: document.getElementById('metronome-toggle'),
    practiceBtn: document.getElementById('practice-btn'),
    testBtn: document.getElementById('test-btn'),
    beatCounter: document.getElementById('beat-counter'),
    callLine: document.getElementById('call-line'),
    callNext: document.getElementById('call-next'),
    callFeedback: document.getElementById('call-feedback'),
    callBtn: document.getElementById('call-btn'),
    menuView: document.getElementById('menu-view'),
    danceMenu: document.getElementById('dance-menu'),
    danceView: document.getElementById('dance-view'),
    menuLink: document.getElementById('menu-link')
};

/**
 * Show the dance named in the URL (e.g. "#lady-of-the-lake"), or the menu when
 * there isn't one, so that reloading the page stays on the same dance
 */
function route() {
    const slug = decodeURIComponent(location.hash.slice(1));
    const dance = slug ? findDance(slug) : null;

    if (!dance) {
        if (slug) {
            console.warn(`No dance named "${slug}"`);
        }
        showMenu();
    } else if (dance !== state.dance) {
        showDance(dance);
    }
}

function showMenu() {
    endSession();
    stopAnimation();
    state.dance = null;
    state.dancerSet = null;
    state.isPlaying = false;
    updateControls();

    // Drop an empty "#" left over from following the menu link
    if (location.href.endsWith('#')) {
        history.replaceState(null, '', location.pathname + location.search);
    }

    document.title = APP_TITLE;
    elements.danceView.hidden = true;
    elements.menuView.hidden = false;
}

function showDance(dance) {
    elements.menuView.hidden = true;
    elements.danceView.hidden = false;
    document.title = `${dance.title} - ${APP_TITLE}`;
    loadDance(dance);
}

// Build the menu of built-in dances
function buildMenu() {
    dances.forEach(dance => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#' + danceSlug(dance);

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = dance.title;

        const details = document.createElement('div');
        details.className = 'menu-details';
        details.textContent = [dance.author && `by ${dance.author}`, dance.formation]
            .filter(Boolean).join(' · ');

        const support = document.createElement('div');
        support.className = 'menu-support';
        support.textContent = describeSupport(dance);

        link.append(title, details, support);
        item.appendChild(link);
        elements.danceMenu.appendChild(item);
    });
}

/**
 * Say how much of a dance can be animated
 * @param {Object} dance
 * @returns {string}
 */
function describeSupport(dance) {
    const dancerSet = createDancerSet(dance);
    if (!dancerSet) {
        return `${dance.formation} formation isn't animated yet`;
    }
    const moves = dance.parts.flatMap(part => part.moves);
    const supported = moves.filter(move => isMoveSupported(move, dancerSet)).length;
    return supported === moves.length
        ? 'All figures animated'
        : `${supported} of ${moves.length} figures animated`;
}

/**
 * Create the set of dancers for a dance, if we can lay out its formation
 * @param {Object} dance
 * @returns {Set|null}
 */
function createDancerSet(dance) {
    return Set.FORMATIONS.includes(dance.formation) ? new Set(6, dance.formation) : null;
}

// Load dance data
function loadDance(dance) {
    endSession();
    stopAnimation();
    state.dance = dance;
    state.currentPartIndex = 0;
    state.currentMoveIndex = 0;
    state.isPlaying = false;
    state.dancerSet = createDancerSet(dance);

    updateDanceInfo();
    updateMoveList();
    updateVisualization();
    updateControls();
    showIdleCallPanel();
}

// Update dance information display
function updateDanceInfo() {
    if (!state.dance) return;

    elements.danceTitle.textContent = state.dance.title || 'Untitled Dance';
    elements.danceAuthor.textContent = state.dance.author ? `by ${state.dance.author}` : '';
    elements.danceFormation.textContent = state.dance.formation ? `Formation: ${state.dance.formation}` : '';
    elements.danceNotes.textContent = state.dance.notes || '';
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

                if (move.detail) {
                    const detail = document.createElement('span');
                    detail.className = 'move-detail';
                    detail.textContent = move.detail;
                    moveItem.appendChild(detail);
                }

                if (state.dancerSet && !isMoveSupported(move, state.dancerSet)) {
                    moveItem.classList.add('unsupported');
                    const unsupported = document.createElement('span');
                    unsupported.className = 'move-unsupported';
                    unsupported.textContent = 'not animated yet';
                    moveItem.appendChild(unsupported);
                }

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
                    if (state.isPlaying && state.animationState && !state.session?.intro) {
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

    if (!state.dance || !state.dancerSet) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '400');
        text.setAttribute('y', '500');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '18');
        text.setAttribute('fill', '#999');
        text.textContent = state.dance
            ? `${state.dance.formation} formation isn't animated yet`
            : 'Choose a dance to begin';
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
    const svgHeight = 1000;
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
        // Audio may only start in response to a click like this one
        metronome.unlock();
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
        metronome.stop();
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

        // Start the clicks on the first frame after play or resume
        if (!metronome.isRunning()) {
            startMetronome(timestamp);
        }

        // Get current positions
        const currentPositions = state.animationState.getCurrentPositions(timestamp);

        // Update visualization with interpolated positions
        updateVisualization(currentPositions);
        updateCallPanel(currentBeat(timestamp));
        state.lastFrameTime = timestamp;

        // Check if animation is complete
        if (state.animationState.isComplete(timestamp)) {
            // Animation finished - advance to next move, starting it exactly
            // where this one ended
            if (state.session?.intro) {
                state.session.intro = false;
                startAnimation(state.animationState.getCompletionTime());
            } else {
                advanceToNextMove(state.animationState.getCompletionTime());
            }
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
 * Start the metronome in time with the current move
 * @param {number} timestamp - Frame timestamp from requestAnimationFrame
 */
function startMetronome(timestamp) {
    metronome.start(currentBeat(timestamp), timestamp, state.animator.getTempo());
}

/**
 * Where the music has got to: beats from the start of the dance (the first time
 * through, in a practice session; the intro before it is negative)
 * @param {number} timestamp - A performance.now() time during the current move
 * @returns {number}
 */
function currentBeat(timestamp) {
    const elapsed = state.animator.msToBeats(state.animationState.getElapsedTime(timestamp));
    if (state.session?.intro) {
        return elapsed - INTRO_BEATS;
    }
    const round = state.session?.round ?? 0;
    return round * danceBeats(state.dance)
        + moveStartBeat(state.dance, state.currentPartIndex, state.currentMoveIndex)
        + elapsed;
}

/**
 * Pause mid-move, keeping the animation state so play continues from here
 */
function pauseAnimation() {
    metronome.stop();
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
    metronome.stop();
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

    // A practice session stops after its times through the dance
    if (state.session && state.currentPartIndex === 0 && state.currentMoveIndex === 0) {
        state.session.round++;
        if (state.session.round >= PRACTICE_ROUNDS) {
            finishSession();
            return;
        }
    }

    // If still playing, start animation for next move
    if (state.isPlaying) {
        startAnimation(startTime);
    } else {
        // Not playing anymore - just update visualization
        updateVisualization();
    }
}

function updateControls() {
    const mode = state.session?.mode;
    elements.playPauseBtn.textContent = state.isPlaying ? 'Pause' : 'Play';
    elements.prevMoveBtn.disabled = !state.dancerSet || Boolean(mode);
    elements.nextMoveBtn.disabled = !state.dancerSet || Boolean(mode);
    elements.playPauseBtn.disabled = !state.dancerSet;
    elements.practiceBtn.textContent = mode === 'karaoke' ? 'Stop Practice' : 'Practice Calls';
    elements.testBtn.textContent = mode === 'test' ? 'Stop Test' : 'Test Me';
    elements.practiceBtn.disabled = !state.dancerSet || mode === 'test';
    elements.testBtn.disabled = !state.dancerSet || mode === 'karaoke';
    elements.callBtn.hidden = mode !== 'test';
}

// ===== PRACTICE SESSIONS =====
// A session plays an intro and then the dance PRACTICE_ROUNDS times from the top,
// with the calls: shown as they're said ('karaoke'), or made by the trainee, who
// presses Call when they would start each one ('test').

/**
 * Start a practice session from the top of the dance
 * @param {'karaoke'|'test'} mode
 */
function startSession(mode) {
    if (!state.dance || !state.dancerSet) return;

    stopAnimation();
    state.dancerSet = createDancerSet(state.dance);
    state.currentPartIndex = 0;
    state.currentMoveIndex = 0;
    state.session = {
        mode,
        calls: callSchedule(state.dance),
        intro: true,
        round: 0,
        attempts: [], // Test mode: for each call, how the trainee did
        nextCall: 0, // Test mode: the next call the trainee is to make
        shown: null // The call (or attempt) on the call line
    };
    state.isPlaying = true;
    metronome.unlock();

    elements.callFeedback.replaceChildren();
    elements.callNext.textContent = '';
    updateControls();
    updateCallPanel(-INTRO_BEATS);
    startIntro();
}

/**
 * Play the intro: the dancers wait in place while the music starts
 * @param {number} [startTime]
 */
function startIntro(startTime = performance.now()) {
    const firstPaths = getMovePaths(state.dance.parts[0].moves[0], state.dancerSet);
    state.currentPaths = new Map([...firstPaths].map(([id, path]) =>
        [id, createStationaryPath(path.getPositionAtBeat(0), INTRO_BEATS)]));
    state.animationState = new AnimationState(state.currentPaths, state.animator, { next: firstPaths });
    state.animationState.start(startTime);
    state.animationId = requestAnimationFrame(animate);
    updateMoveList();
}

/**
 * The session has played through: stop, and say how it went
 */
function finishSession() {
    const session = state.session;
    state.isPlaying = false;
    stopAnimation();
    updateVisualization();

    if (session.mode === 'test') {
        // Calls still to come when the music stopped count as missed
        for (let i = session.nextCall; i < session.calls.length; i++) {
            session.attempts[i] = { missed: true };
        }
        showTestSummary(session);
    } else {
        elements.callNext.textContent = '';
        elements.callFeedback.textContent = `That's ${PRACTICE_ROUNDS} times through.`;
    }
    state.session = null;
    updateControls();
}

/**
 * Abandon any session in progress
 */
function endSession() {
    if (!state.session) return;
    state.session = null;
    state.isPlaying = false;
    stopAnimation();
    updateControls();
    showIdleCallPanel();
}

function showIdleCallPanel() {
    elements.beatCounter.textContent = '';
    elements.callLine.replaceChildren();
    elements.callLine.className = 'idle';
    elements.callLine.textContent = 'Practice Calls shows the calls in time; Test Me lets you make them.';
    elements.callNext.textContent = '';
    elements.callFeedback.replaceChildren();
}

/**
 * Name of a beat, e.g. "A1 · 3" (beats counted from 1, as the music is)
 * @param {number} beat - Beats from the start of the dance
 * @returns {string}
 */
function beatLabel(beat) {
    const whole = Math.floor(beat + 1e-6);
    if (whole < 0) {
        return `Intro · ${whole + INTRO_BEATS + 1}`;
    }
    const { partIndex, beatInPart } = locateBeat(state.dance, whole);
    return `${state.dance.parts[partIndex].name} · ${beatInPart + 1}`;
}

/**
 * Bring the call panel up to date with the music
 * @param {number} beat - Beats from the start of the dance
 */
function updateCallPanel(beat) {
    elements.beatCounter.textContent = beatLabel(beat);
    const session = state.session;
    if (!session) return;

    if (session.mode === 'karaoke') {
        // The call being said, or the next one coming
        const index = session.calls.findIndex(call => call.end + CALL_HOLD_BEATS > beat);
        const call = index < 0 ? null : session.calls[index];
        showOnCallLine(call, 0, beat);
        const next = index < 0 ? null : session.calls[index + 1];
        elements.callNext.textContent = next ? `Then: ${displayCall(next.syllables)}` : '';
        return;
    }

    // Test mode: a call whose figure has started without being made is missed
    while (session.nextCall < session.calls.length && beat >= session.calls[session.nextCall].figureBeat) {
        const call = session.calls[session.nextCall];
        session.attempts[session.nextCall] = { missed: true };
        showFeedback(`Missed: ${displayCall(call.syllables)}`, 'off');
        session.nextCall++;
    }

    // The call the trainee made, while they are saying it; otherwise a reminder
    // of what comes next, like the card a caller keeps in hand
    const lastIndex = session.attempts.findLastIndex(attempt => attempt && !attempt.missed);
    const last = session.attempts[lastIndex];
    const lastCall = session.calls[lastIndex];
    if (last && beat < lastCall.end + last.offset + CALL_HOLD_BEATS) {
        showOnCallLine(lastCall, last.offset, beat);
    } else {
        showOnCallLine(null, 0, beat);
    }
    const upcoming = session.calls[session.nextCall];
    elements.callNext.textContent = upcoming ? `Next: ${displayCall(upcoming.syllables)}` : '';
}

/**
 * Show a call on the call line, lighting up the syllables said so far
 * @param {Object|null} call - From callSchedule
 * @param {number} offset - Beats later than scheduled that the call is said
 * @param {number} beat - Beats from the start of the dance
 */
function showOnCallLine(call, offset, beat) {
    const session = state.session;
    const key = call ? `${session.calls.indexOf(call)}@${offset}` : null;
    if (session.shown !== key) {
        session.shown = key;
        elements.callLine.className = '';
        elements.callLine.replaceChildren();
        call?.syllables.forEach((syllable, i) => {
            if (i > 0 && syllable.word !== call.syllables[i - 1].word) {
                elements.callLine.append(' ');
            }
            const span = document.createElement('span');
            span.className = syllable.stressed ? 'syllable stressed' : 'syllable';
            // The call's first letter is a capital, as in displayCall
            span.textContent = i === 0
                ? syllable.text.charAt(0).toUpperCase() + syllable.text.slice(1)
                : syllable.text;
            elements.callLine.append(span);
        });
    }
    if (!call) return;

    elements.callLine.classList.toggle('upcoming', beat < call.start + offset);
    const spans = elements.callLine.querySelectorAll('.syllable');
    call.syllables.forEach((syllable, i) => {
        const said = beat >= syllable.beat + offset;
        const saying = said && !(beat >= (call.syllables[i + 1]?.beat ?? call.end) + offset);
        spans[i].classList.toggle('said', said);
        spans[i].classList.toggle('saying', saying);
    });
}

/**
 * Add a line to the feedback list, newest first
 * @param {string} text
 * @param {string} grade - For styling: 'on-time', 'nearly', 'off' or 'summary'
 */
function showFeedback(text, grade) {
    const item = document.createElement('div');
    item.className = `feedback ${grade}`;
    item.textContent = text;
    elements.callFeedback.prepend(item);
}

/**
 * Format a number of beats, e.g. "1.5 beats"
 * @param {number} beats
 * @returns {string}
 */
function formatBeats(beats) {
    const rounded = Math.round(Math.abs(beats) * 4) / 4;
    return `${rounded} beat${rounded === 1 ? '' : 's'}`;
}

/**
 * Test mode: the trainee starts the next call now
 * @param {number} timestamp - performance.now() time of the press
 */
function makeCall(timestamp) {
    const session = state.session;
    if (session?.mode !== 'test' || !state.isPlaying || !state.animationState) return;
    if (session.nextCall >= session.calls.length) return;

    const beat = currentBeat(timestamp);
    const index = session.nextCall++;
    const call = session.calls[index];
    const judged = judgeCall(beat, call);
    session.attempts[index] = { clickBeat: beat, ...judged };

    let text = `${displayCall(call.syllables)}: ${judged.grade}`;
    if (judged.grade !== 'on time') {
        text += ` (${formatBeats(judged.offset)})`;
    }
    if (judged.endsBefore < 0) {
        text += `, running ${formatBeats(judged.endsBefore)} into the figure`;
    }
    const style = judged.grade === 'on time' ? 'on-time' : judged.grade.startsWith('a little') ? 'nearly' : 'off';
    showFeedback(text, style);
}

/**
 * Test mode: how the trainee did over the whole session
 * @param {Object} session
 */
function showTestSummary(session) {
    const counts = { onTime: 0, nearly: 0, missed: 0 };
    for (const attempt of session.attempts) {
        if (attempt.missed) counts.missed++;
        else if (attempt.grade === 'on time') counts.onTime++;
        else if (attempt.grade.startsWith('a little')) counts.nearly++;
    }
    const total = session.calls.length;
    let text = `On time for ${counts.onTime} of ${total} calls`;
    if (counts.nearly) text += `, close on ${counts.nearly}`;
    if (counts.missed) text += `, missed ${counts.missed}`;
    showOnCallLine(null, 0, 0);
    elements.callLine.className = 'summary';
    elements.callLine.textContent = `${text}.`;
    elements.callNext.textContent = 'Each call is listed on the right.';
    showFeedback(`${text}.`, 'summary');
}

elements.practiceBtn.addEventListener('click', () => {
    if (state.session) {
        endSession();
    } else {
        startSession('karaoke');
    }
});

elements.testBtn.addEventListener('click', () => {
    if (state.session) {
        endSession();
    } else {
        startSession('test');
    }
});

// Calls are made on the press, not the release, which comes noticeably later
elements.callBtn.addEventListener('pointerdown', event => makeCall(event.timeStamp));
elements.canvas.addEventListener('pointerdown', event => makeCall(event.timeStamp));
document.addEventListener('keydown', event => {
    if (event.code === 'Space' && state.session?.mode === 'test') {
        // Don't also press whichever button has the focus
        event.preventDefault();
        if (!event.repeat) {
            makeCall(event.timeStamp);
        }
    }
});

// The metronome setting is remembered between visits (where storage is allowed)
try {
    elements.metronomeToggle.checked = localStorage.getItem(METRONOME_SETTING) !== 'off';
} catch {
    // No storage: keep the default (on)
}
metronome.setEnabled(elements.metronomeToggle.checked);

elements.metronomeToggle.addEventListener('change', () => {
    const enabled = elements.metronomeToggle.checked;
    if (enabled) {
        metronome.unlock();
    }
    metronome.setEnabled(enabled);
    try {
        localStorage.setItem(METRONOME_SETTING, enabled ? 'on' : 'off');
    } catch {
        // No storage: the setting lasts until the page is reloaded
    }
});

// Initialize
buildMenu();
window.addEventListener('hashchange', route);
route();
