import { drawScene, drawMessage } from './canvas.js';
import { Animator, AnimationState } from './animator.js';
import { perform } from './performance.js';
import { dances, danceSlug, findDance } from './library.js';
import { Metronome, beatAccent } from './metronome.js';
import { INTRO_BEATS, beatLabel, danceBeats, locateBeat, moveStartBeat } from './timeline.js';
import { PRACTICE_ROUNDS } from './calls.js';
import { PracticeSession } from './practice.js';
import { CallPanel } from './callPanel.js';
import { DEFAULT_LEAD, LEADS, MusicPlayer, findTune, tunes } from './music.js';

const APP_TITLE = document.title;

/** Beats per minute to start at: slower than most dances, for learners */
const DEFAULT_TEMPO = 100;
const TEMPO_SETTING = 'tempo';

// Application state
const state = {
    dance: null,
    performance: null, // The dance being performed, if we can lay out its formation
    isPlaying: false,
    animationId: null,
    animator: new Animator(DEFAULT_TEMPO),
    animationState: null,
    lastFrameTime: null, // Timestamp of the most recently drawn frame
    currentPaths: null,
    session: null // Practice session in progress (see startSession)
};

// The metronome and the music share one audio context, made on first use
let audioContext = null;
const createContext = () => (audioContext ??= new AudioContext());

// Clicks on the beat while playing, accented by where the beat falls in its part
const metronome = new Metronome({
    createContext,
    accentOf: beat => beatAccent(locateBeat(state.dance, beat).beatInPart)
});

// A tune played under the dance, if one is chosen
const music = new MusicPlayer({ createContext });

const METRONOME_SETTING = 'metronome';
const MUSIC_SETTING = 'music';
const LEAD_SETTING = 'lead';

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
    musicSelect: document.getElementById('music-select'),
    leadSelect: document.getElementById('lead-select'),
    tempoSlider: document.getElementById('tempo-slider'),
    tempoValue: document.getElementById('tempo-value'),
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

const callPanel = new CallPanel(elements);

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
    state.performance = null;
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
    const danced = perform(dance);
    if (!danced) {
        return `${dance.formation} formation isn't animated yet`;
    }
    const moves = dance.parts.flatMap(part => part.moves);
    const supported = moves.filter(move => danced.isSupported(move)).length;
    return supported === moves.length
        ? 'All figures animated'
        : `${supported} of ${moves.length} figures animated`;
}

// Load dance data
function loadDance(dance) {
    endSession();
    stopAnimation();
    state.dance = dance;
    state.isPlaying = false;
    state.performance = perform(dance);

    updateDanceInfo();
    updateMoveList();
    updateVisualization();
    updateControls();
    callPanel.showIdle();
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

                if (state.performance && !state.performance.isSupported(move)) {
                    moveItem.classList.add('unsupported');
                    const unsupported = document.createElement('span');
                    unsupported.className = 'move-unsupported';
                    unsupported.textContent = 'not animated yet';
                    moveItem.appendChild(unsupported);
                }

                moveItem.addEventListener('click', () => {
                    // TODO: Implement jumping to arbitrary moves with snapshot/undo
                    // For now, disable clicking on moves
                    // (DancePerformance would dance up to it from the top)
                    // updateMoveList();
                    // updateVisualization();
                });

                if (partIndex === state.performance?.partIndex && moveIndex === state.performance.moveIndex) {
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
// customPositions: Map from dancer ID to Position, while animating
// holds: groups of dancers holding hands (see AnimationState.getCurrentHolds)
function updateVisualization(customPositions = null, holds = []) {
    if (state.performance) {
        drawScene(elements.canvas, state.performance.dancers(customPositions), holds);
    } else {
        drawMessage(elements.canvas, state.dance
            ? `${state.dance.formation} formation isn't animated yet`
            : 'Choose a dance to begin');
    }
}

// Control button handlers
elements.playPauseBtn.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    updateControls();

    if (state.isPlaying) {
        // Audio may only start in response to a click like this one
        unlockAudio();
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
    if (!state.performance) return;
    state.performance.next();
    updateControls();
    updateMoveList();
    updateVisualization();
}

function goToPreviousMove() {
    if (!state.performance) return;
    state.performance.previous();
    updateControls();
    updateMoveList();
    updateVisualization();
}

/**
 * Start animating the current move
 * @param {number} [startTime] - Timestamp at which the move begins; when continuing
 *   from the previous move this is that move's completion time, so no time is lost.
 *   Otherwise it begins now, once its paths are worked out.
 */
function startAnimation(startTime = null) {
    if (!state.performance) {
        console.warn('Cannot start animation: no dance performance loaded');
        return;
    }

    try {
        // Paths of the move just finished (null when starting from a standstill)
        const previousPaths = state.currentPaths;

        const { current, next } = state.performance.paths();
        state.currentPaths = current;

        // Create animation state, blending into the adjacent moves at each end
        state.animationState = new AnimationState(current, state.animator, {
            previous: previousPaths,
            next
        });
        state.animationState.start(startTime ?? performance.now());

        state.animationId = requestAnimationFrame(animate);

        // Update move list to show animating state
        updateMoveList();
    } catch (error) {
        console.error('Failed to start animation:', error);
        stopAudio();
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

        // Start the clicks and music on the first frame after play or resume
        if (!metronome.isRunning()) {
            startAudio(timestamp);
        }

        // Get current positions
        const currentPositions = state.animationState.getCurrentPositions(timestamp);

        // Update visualization with interpolated positions
        updateVisualization(currentPositions, state.animationState.getCurrentHolds(timestamp));
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
 * Start the metronome and music in time with the current move
 * @param {number} timestamp - Frame timestamp from requestAnimationFrame
 */
function startAudio(timestamp) {
    const beat = currentBeat(timestamp);
    const tempo = state.animator.getTempo();
    metronome.start(beat, timestamp, tempo);
    music.start(beat, timestamp, tempo);
}

function stopAudio() {
    metronome.stop();
    music.stop();
}

/**
 * Make (or wake) the audio context; browsers only allow this in response to a
 * click or key press
 */
function unlockAudio() {
    metronome.unlock();
    music.unlock();
}

// Coming back to the page, wake the audio if the browser stopped it; the audio
// clock may have stopped while the animation clock ran on, so the metronome
// and music restart in time with the dancers on the next frame
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        metronome.wake();
        music.wake();
        stopAudio();
    }
});

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
        + moveStartBeat(state.dance, state.performance.partIndex, state.performance.moveIndex)
        + elapsed;
}

/**
 * Pause mid-move, keeping the animation state so play continues from here
 */
function pauseAnimation() {
    stopAudio();
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
    stopAudio();
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
    if (!state.performance) return;

    state.performance.next();
    updateControls();
    updateMoveList();

    // A practice session stops after its times through the dance
    if (state.session && state.performance.atTop) {
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
    elements.prevMoveBtn.disabled = !state.performance?.canGoBack || Boolean(mode);
    elements.nextMoveBtn.disabled = !state.performance || Boolean(mode);
    elements.playPauseBtn.disabled = !state.performance;
    elements.practiceBtn.textContent = mode === 'karaoke' ? 'Stop Practice' : 'Practice Calls';
    elements.testBtn.textContent = mode === 'test' ? 'Stop Test' : 'Test Me';
    elements.practiceBtn.disabled = !state.performance || mode === 'test';
    elements.testBtn.disabled = !state.performance || mode === 'karaoke';
    elements.callBtn.hidden = mode !== 'test';
}

// ===== PRACTICE SESSIONS =====
// Playing the dance for a session (see practice.js)

/**
 * Start a practice session from the top of the dance
 * @param {'karaoke'|'test'} mode
 */
function startSession(mode) {
    if (!state.performance) return;

    stopAnimation();
    state.performance.restart();
    state.session = new PracticeSession(state.dance, mode, callPanel);
    state.isPlaying = true;
    unlockAudio();

    updateControls();
    updateCallPanel(-INTRO_BEATS);
    startIntro();
}

/**
 * Play the intro: the dancers wait in place through the potatoes
 */
function startIntro() {
    const { current, next } = state.performance.waitingPaths(INTRO_BEATS);
    state.currentPaths = current;
    state.animationState = new AnimationState(current, state.animator, { next });
    // Starting now, after the paths are worked out, so the first beat isn't missed
    state.animationState.start(performance.now());
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

    session.finish();
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
    updateVisualization();
    updateControls();
    callPanel.showIdle();
}

/**
 * Bring the call panel up to date with the music
 * @param {number} beat - Beats from the start of the dance
 */
function updateCallPanel(beat) {
    callPanel.showBeat(beatLabel(state.dance, beat));
    state.session?.update(beat);
}

/**
 * Test mode: the trainee starts the next call now
 * @param {number} timestamp - performance.now() time of the press
 */
function makeCall(timestamp) {
    if (state.session?.mode !== 'test' || !state.isPlaying || !state.animationState) return;
    state.session.makeCall(currentBeat(timestamp));
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
        unlockAudio();
    }
    metronome.setEnabled(enabled);
    try {
        localStorage.setItem(METRONOME_SETTING, enabled ? 'on' : 'off');
    } catch {
        // No storage: the setting lasts until the page is reloaded
    }
});

/**
 * Set the tempo, keeping the dancers' place in the move if it is playing
 * @param {number} tempo - Beats per minute
 */
function setTempo(tempo) {
    if (state.animationState) {
        state.animationState.changeTempo(tempo, performance.now());
        // The metronome and music restart at the new tempo on the next frame
        stopAudio();
    } else {
        state.animator.setTempo(tempo);
    }
    elements.tempoSlider.value = tempo;
    elements.tempoValue.textContent = `${tempo} BPM`;
}

// The tune is remembered too
for (const tune of tunes) {
    const option = document.createElement('option');
    option.value = tune.title;
    option.textContent = `${tune.title} (${tune.type})`;
    elements.musicSelect.append(option);
}
try {
    const saved = localStorage.getItem(MUSIC_SETTING);
    elements.musicSelect.value = findTune(saved) ? saved : '';
} catch {
    // No storage: no music to start with
}
music.setTune(findTune(elements.musicSelect.value) ?? null);

elements.musicSelect.addEventListener('change', () => {
    const title = elements.musicSelect.value;
    unlockAudio();
    music.setTune(findTune(title) ?? null);
    try {
        localStorage.setItem(MUSIC_SETTING, title);
    } catch {
        // No storage: the choice lasts until the page is reloaded
    }
});

// So is who plays the melody
for (const [lead, { name }] of Object.entries(LEADS)) {
    const option = document.createElement('option');
    option.value = lead;
    option.textContent = name;
    elements.leadSelect.append(option);
}
elements.leadSelect.value = DEFAULT_LEAD;
try {
    const saved = localStorage.getItem(LEAD_SETTING);
    if (Object.hasOwn(LEADS, saved)) elements.leadSelect.value = saved;
} catch {
    // No storage: the usual lead to start with
}
music.setLead(elements.leadSelect.value);

elements.leadSelect.addEventListener('change', () => {
    const lead = elements.leadSelect.value;
    unlockAudio();
    music.setLead(lead);
    try {
        localStorage.setItem(LEAD_SETTING, lead);
    } catch {
        // No storage: the choice lasts until the page is reloaded
    }
});

// The tempo is remembered between visits too
try {
    const saved = parseInt(localStorage.getItem(TEMPO_SETTING));
    const min = parseInt(elements.tempoSlider.min);
    const max = parseInt(elements.tempoSlider.max);
    setTempo(saved >= min && saved <= max ? saved : DEFAULT_TEMPO);
} catch {
    setTempo(DEFAULT_TEMPO);
}

elements.tempoSlider.addEventListener('input', () => {
    const tempo = parseInt(elements.tempoSlider.value);
    setTempo(tempo);
    try {
        localStorage.setItem(TEMPO_SETTING, String(tempo));
    } catch {
        // No storage: the tempo lasts until the page is reloaded
    }
});

// Initialize
buildMenu();
window.addEventListener('hashchange', route);
route();
