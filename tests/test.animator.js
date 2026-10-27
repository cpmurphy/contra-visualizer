// Unit tests for animation timing system

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Animator, AnimationState, blendHalfWidth } from '../animator.js';
import { Position, distance } from '../positions.js';
import { Path, createStraightPath, createStationaryPath } from '../paths.js';

// ===== ANIMATOR CLASS TESTS =====

test('Animator constructor accepts tempo', () => {
    const animator = new Animator(120);
    assert.strictEqual(animator.getTempo(), 120);
});

test('Animator constructor defaults to 120 BPM', () => {
    const animator = new Animator();
    assert.strictEqual(animator.getTempo(), 120);
});

test('Animator constructor rejects non-positive tempo', () => {
    assert.throws(() => new Animator(0), /must be positive/);
    assert.throws(() => new Animator(-10), /must be positive/);
});

// Beat-to-millisecond conversion tests

test('beatsToMs converts correctly at 120 BPM', () => {
    const animator = new Animator(120);

    // At 120 BPM: 1 beat = 500ms (60000ms / 120)
    assert.strictEqual(animator.beatsToMs(1), 500);
    assert.strictEqual(animator.beatsToMs(2), 1000);
    assert.strictEqual(animator.beatsToMs(4), 2000);
    assert.strictEqual(animator.beatsToMs(8), 4000);
});

test('beatsToMs converts correctly at 60 BPM', () => {
    const animator = new Animator(60);

    // At 60 BPM: 1 beat = 1000ms
    assert.strictEqual(animator.beatsToMs(1), 1000);
    assert.strictEqual(animator.beatsToMs(2), 2000);
});

test('beatsToMs converts correctly at 180 BPM', () => {
    const animator = new Animator(180);

    // At 180 BPM: 1 beat ≈ 333.33ms
    const result = animator.beatsToMs(1);
    assert(Math.abs(result - 333.33) < 0.01, `Expected ~333.33, got ${result}`);
});

test('beatsToMs handles fractional beats', () => {
    const animator = new Animator(120);

    // 0.5 beats at 120 BPM = 250ms
    assert.strictEqual(animator.beatsToMs(0.5), 250);
});

test('beatsToMs handles zero beats', () => {
    const animator = new Animator(120);
    assert.strictEqual(animator.beatsToMs(0), 0);
});

test('beatsToMs rejects negative beats', () => {
    const animator = new Animator(120);
    assert.throws(() => animator.beatsToMs(-1), /must be non-negative/);
});

// Millisecond-to-beat conversion tests

test('msToBeats converts correctly at 120 BPM', () => {
    const animator = new Animator(120);

    assert.strictEqual(animator.msToBeats(500), 1);
    assert.strictEqual(animator.msToBeats(1000), 2);
    assert.strictEqual(animator.msToBeats(2000), 4);
});

test('msToBeats is inverse of beatsToMs', () => {
    const animator = new Animator(120);

    const beats = 8;
    const ms = animator.beatsToMs(beats);
    const convertedBack = animator.msToBeats(ms);

    assert.strictEqual(convertedBack, beats);
});

test('msToBeats rejects negative milliseconds', () => {
    const animator = new Animator(120);
    assert.throws(() => animator.msToBeats(-100), /must be non-negative/);
});

// Progress calculation tests

test('calculateProgress returns 0 at start', () => {
    const animator = new Animator(120);
    const progress = animator.calculateProgress(0, 1000);
    assert.strictEqual(progress, 0);
});

test('calculateProgress returns 1 at end', () => {
    const animator = new Animator(120);
    const progress = animator.calculateProgress(1000, 1000);
    assert.strictEqual(progress, 1);
});

test('calculateProgress returns 0.5 at midpoint', () => {
    const animator = new Animator(120);
    const progress = animator.calculateProgress(500, 1000);
    assert.strictEqual(progress, 0.5);
});

test('calculateProgress clamps values above 1', () => {
    const animator = new Animator(120);
    const progress = animator.calculateProgress(1500, 1000);
    assert.strictEqual(progress, 1);
});

test('calculateProgress rejects negative elapsed time', () => {
    const animator = new Animator(120);
    assert.throws(() => animator.calculateProgress(-1, 1000), /must be non-negative/);
});

test('calculateProgress rejects non-positive duration', () => {
    const animator = new Animator(120);
    assert.throws(() => animator.calculateProgress(500, 0), /must be positive/);
    assert.throws(() => animator.calculateProgress(500, -100), /must be positive/);
});

// Progress with beats tests

test('calculateProgressBeats works correctly', () => {
    const animator = new Animator(120);

    // 8 beats at 120 BPM = 4000ms
    // At 2000ms (halfway), progress should be 0.5
    const progress = animator.calculateProgressBeats(2000, 8);
    assert.strictEqual(progress, 0.5);
});

// Position along path tests

test('getPositionAtTime returns start at t=0', () => {
    const animator = new Animator(120);
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    const path = createStraightPath(start, end, 8);

    const position = animator.getPositionAtTime(path, 0);
    assert(position.equals(start, 0.01));
});

test('getPositionAtTime returns end at completion', () => {
    const animator = new Animator(120);
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    const path = createStraightPath(start, end, 8);

    const duration = animator.beatsToMs(8);
    const position = animator.getPositionAtTime(path, duration);
    assert(position.equals(end, 0.01));
});

test('getPositionAtTime returns midpoint at half duration', () => {
    const animator = new Animator(120);
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    const path = createStraightPath(start, end, 8);

    const duration = animator.beatsToMs(8);
    const position = animator.getPositionAtTime(path, duration / 2);
    assert(position.equals(new Position(50, 50), 0.01));
});

// Animation completion tests

test('isComplete returns false before completion', () => {
    const animator = new Animator(120);
    assert.strictEqual(animator.isComplete(1000, 8), false);
});

test('isComplete returns true at completion', () => {
    const animator = new Animator(120);
    const duration = animator.beatsToMs(8);
    assert.strictEqual(animator.isComplete(duration, 8), true);
});

test('isComplete returns true after completion', () => {
    const animator = new Animator(120);
    const duration = animator.beatsToMs(8);
    assert.strictEqual(animator.isComplete(duration + 1000, 8), true);
});

// Tempo change tests

test('setTempo changes tempo', () => {
    const animator = new Animator(120);
    animator.setTempo(180);
    assert.strictEqual(animator.getTempo(), 180);
});

test('setTempo affects beat conversion', () => {
    const animator = new Animator(120);
    const ms1 = animator.beatsToMs(1);

    animator.setTempo(60);
    const ms2 = animator.beatsToMs(1);

    // At 60 BPM, beats take twice as long
    assert.strictEqual(ms2, ms1 * 2);
});

test('setTempo rejects non-positive tempo', () => {
    const animator = new Animator(120);
    assert.throws(() => animator.setTempo(0), /must be positive/);
});

// ===== ANIMATION STATE TESTS =====

test('AnimationState constructor requires paths', () => {
    const animator = new Animator(120);
    const paths = new Map();

    assert.throws(() => new AnimationState(paths, animator), /at least one path/);
});

test('AnimationState constructor requires animator', () => {
    const paths = new Map();
    const path = createStationaryPath(new Position(50, 50), 8);
    paths.set('dancer1', path);

    assert.throws(() => new AnimationState(paths, null), /provide an animator/);
});

test('AnimationState can be created with valid parameters', () => {
    const animator = new Animator(120);
    const paths = new Map();
    const path = createStationaryPath(new Position(50, 50), 8);
    paths.set('dancer1', path);

    const state = new AnimationState(paths, animator);
    assert(state !== null);
});

// Start/pause/resume tests

test('AnimationState start sets start time', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(1000);

    assert.strictEqual(state.getElapsedTime(1500), 500);
});

test('AnimationState elapsed time is zero for timestamps before start', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(1000);

    // requestAnimationFrame can deliver a frame timestamp earlier than start
    assert.strictEqual(state.getElapsedTime(990), 0);
    assert.doesNotThrow(() => state.getCurrentPositions(990));
});

test('AnimationState pause stops elapsed time', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(1000);
    state.pause(1500);

    // Time should stay at 500ms even though we check at 2000ms
    assert.strictEqual(state.getElapsedTime(2000), 500);
});

test('AnimationState resume continues from pause point', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(1000);   // Start at t=1000
    state.pause(1500);   // Pause at t=1500 (elapsed: 500ms)
    state.resume(2000);  // Resume at t=2000 (paused for 500ms)

    // At t=2500, elapsed should be 1000ms (2500 - 1000 - 500)
    assert.strictEqual(state.getElapsedTime(2500), 1000);
});

test('AnimationState pause throws if not started', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    assert.throws(() => state.pause(1000), /not started/);
});

test('AnimationState resume throws if not paused', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(1000);
    assert.throws(() => state.resume(1500), /not paused/);
});

// Current positions tests

test('getCurrentPositions returns positions for all dancers', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(25, 25), 8));
    paths.set('d2', createStationaryPath(new Position(75, 75), 8));

    const state = new AnimationState(paths, animator);
    state.start(1000);

    const positions = state.getCurrentPositions(1500);
    assert.strictEqual(positions.size, 2);
    assert(positions.has('d1'));
    assert(positions.has('d2'));
});

test('getCurrentPositions returns correct positions along paths', () => {
    const animator = new Animator(120);
    const paths = new Map();
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    paths.set('d1', createStraightPath(start, end, 8));

    const state = new AnimationState(paths, animator);
    state.start(0);

    // At halfway point (2000ms for 8 beats at 120 BPM)
    const positions = state.getCurrentPositions(2000);
    const pos = positions.get('d1');
    assert(pos.equals(new Position(50, 50), 0.01));
});

// Animation completion tests

test('isComplete returns false before animation ends', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(0);

    assert.strictEqual(state.isComplete(2000), false);
});

test('isComplete returns true after animation ends', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(0);

    // 8 beats at 120 BPM = 4000ms
    assert.strictEqual(state.isComplete(4000), true);
});

test('isComplete uses longest path duration', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 4)); // 4 beats
    paths.set('d2', createStationaryPath(new Position(75, 75), 8)); // 8 beats (longer)

    const state = new AnimationState(paths, animator);
    state.start(0);

    // At 2000ms (4 beats), d1 is done but d2 is not
    assert.strictEqual(state.isComplete(2000), false);

    // At 4000ms (8 beats), all dancers are done
    assert.strictEqual(state.isComplete(4000), true);
});

// Reset tests

test('reset clears animation state', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(1000);
    state.reset();

    assert.strictEqual(state.getElapsedTime(2000), 0);
});

test('reset allows restarting animation', () => {
    const animator = new Animator(120);
    const paths = new Map();
    paths.set('d1', createStationaryPath(new Position(50, 50), 8));

    const state = new AnimationState(paths, animator);
    state.start(1000);
    state.reset();
    state.start(2000);

    assert.strictEqual(state.getElapsedTime(2500), 500);
});

// ===== MOVE BLENDING TESTS =====

// At 120 BPM one beat is 500ms
function blendedMoves() {
    const animator = new Animator(120);
    // Move A heads right along y=0 and ends at the origin; move B heads down from there
    const previous = new Map([['d1', createStraightPath(new Position(-8, 0), new Position(0, 0), 8)]]);
    const current = new Map([['d1', createStraightPath(new Position(0, 0), new Position(0, 8), 8)]]);
    const next = new Map([['d1', createStraightPath(new Position(0, 8), new Position(8, 8), 8)]]);
    return { animator, previous, current, next };
}

test('blendHalfWidth is capped by a quarter of either move', () => {
    assert.strictEqual(blendHalfWidth(8, 8), 1);
    assert.strictEqual(blendHalfWidth(2, 8), 0.5);
    assert.strictEqual(blendHalfWidth(8, 2), 0.5);
});

test('blended move rounds the corner near the boundary position', () => {
    const { animator, previous, current } = blendedMoves();
    const state = new AnimationState(current, animator, { previous });
    state.start(0);

    // Cuts inside the corner at (0, 0): already heading down, not yet at x = 0
    const pos = state.getCurrentPositions(0).get('d1');
    assert(pos.x < 0 && pos.y > 0);
    assert(distance(pos, new Position(0, 0)) < 0.5);
});

test('blending out of a standstill never moves backwards', () => {
    const animator = new Animator(120);
    const still = new Map([['d1', createStationaryPath(new Position(0, 0), 8)]]);
    const moving = new Map([['d1', createStraightPath(new Position(0, 0), new Position(8, 0), 8)]]);
    const state = new AnimationState(still, animator, { next: moving });
    state.start(0);

    let lastX = 0;
    for (let ms = 3000; ms <= 4000; ms += 50) {
        const x = state.getCurrentPositions(ms).get('d1').x;
        assert(x >= lastX - 1e-9, `x should not decrease (at ${ms}ms: ${x} < ${lastX})`);
        lastX = x;
    }
});

test('blending is continuous across a move boundary', () => {
    const { animator, previous, current, next } = blendedMoves();

    const before = new AnimationState(previous, animator, { next: current });
    before.start(0);
    const after = new AnimationState(current, animator, { previous });
    after.start(before.getCompletionTime());

    const boundary = before.getCompletionTime();
    const epsilon = 1;
    const justBefore = before.getCurrentPositions(boundary - epsilon).get('d1');
    const atBoundary = after.getCurrentPositions(boundary).get('d1');
    const justAfter = after.getCurrentPositions(boundary + epsilon).get('d1');

    // No jump, and the velocity on either side matches
    assert(justBefore.equals(atBoundary, 0.01));
    const vBefore = { x: atBoundary.x - justBefore.x, y: atBoundary.y - justBefore.y };
    const vAfter = { x: justAfter.x - atBoundary.x, y: justAfter.y - atBoundary.y };
    assert(Math.abs(vBefore.x - vAfter.x) < 1e-4 && Math.abs(vBefore.y - vAfter.y) < 1e-4);

    // Blending only touches the edges: mid-move is the plain path position
    const mid = new AnimationState(current, animator, { previous, next });
    mid.start(0);
    assert(mid.getCurrentPositions(2000).get('d1').equals(new Position(0, 4), 0.0001));
});

test('blending starts moving toward the next move before the boundary', () => {
    const { animator, current, next } = blendedMoves();
    const state = new AnimationState(current, animator, { next });
    state.start(0);

    // Half a beat before the end the dancer is already drifting right
    const pos = state.getCurrentPositions(3750).get('d1');
    assert(pos.x > 0);
});

test('getCompletionTime accounts for duration and pauses', () => {
    const { animator, current } = blendedMoves();
    const state = new AnimationState(current, animator);
    state.start(1000);
    state.pause(2000);
    state.resume(2500);

    assert.strictEqual(state.getCompletionTime(), 1000 + 500 + 4000);
});

test('isPaused reflects pause and resume', () => {
    const animator = new Animator(120);
    const paths = new Map([['d1', createStationaryPath(new Position(50, 50), 8)]]);
    const state = new AnimationState(paths, animator);
    state.start(0);

    assert.strictEqual(state.isPaused(), false);
    state.pause(1000);
    assert.strictEqual(state.isPaused(), true);
    state.resume(5000);
    assert.strictEqual(state.isPaused(), false);
});

test('resuming continues from the paused position', () => {
    const animator = new Animator(120);
    const paths = new Map([['d1', createStraightPath(new Position(0, 0), new Position(8, 0), 8)]]);
    const state = new AnimationState(paths, animator);
    state.start(0);

    const atPause = state.getCurrentPositions(1000).get('d1');
    state.pause(1000);
    // Still frozen while paused
    assert(state.getCurrentPositions(3000).get('d1').equals(atPause));
    state.resume(7000);
    assert(state.getCurrentPositions(7000).get('d1').equals(atPause));
    assert(state.getCurrentPositions(7500).get('d1').equals(new Position(3, 0), 0.0001));
});

// ===== CHANGING TEMPO =====

/**
 * One dancer walking 100 units in 8 beats, started at time 0
 */
function walkingAt(tempo) {
    const paths = new Map([['d', createStraightPath(new Position(0, 0), new Position(100, 0), 8)]]);
    const state = new AnimationState(paths, new Animator(tempo));
    state.start(0);
    return state;
}

test('changeTempo keeps the dancers where they are', () => {
    const state = walkingAt(120);
    // 1000ms at 120 BPM is beat 2 of 8
    const before = state.getCurrentPositions(1000).get('d');
    state.changeTempo(60, 1000);
    const after = state.getCurrentPositions(1000).get('d');
    assert.ok(distance(before, after) < 1e-9);
    assert.strictEqual(state.animator.getTempo(), 60);
});

test('changeTempo plays the rest of the move at the new tempo', () => {
    const state = walkingAt(120);
    state.changeTempo(60, 1000); // At beat 2
    // Six beats left, at a second a beat
    assert.strictEqual(state.getCompletionTime(), 7000);
    assert.strictEqual(state.isComplete(6999), false);
    assert.strictEqual(state.isComplete(7000), true);
});

test('changeTempo while paused keeps the place for resuming', () => {
    const state = walkingAt(120);
    state.pause(1000); // At beat 2
    state.changeTempo(60, 3000);
    state.resume(5000);
    const position = state.getCurrentPositions(5000).get('d');
    assert.ok(Math.abs(position.x - 25) < 1e-9, `x is ${position.x}`);
    // One beat later at 60 BPM is beat 3
    assert.ok(Math.abs(state.getCurrentPositions(6000).get('d').x - 37.5) < 1e-9);
});

test('changeTempo before starting just sets the tempo', () => {
    const paths = new Map([['d', createStationaryPath(new Position(0, 0), 4)]]);
    const state = new AnimationState(paths, new Animator(120));
    state.changeTempo(90, 0);
    assert.strictEqual(state.animator.getTempo(), 90);
    assert.strictEqual(state.startTime, null);
});

test('getCurrentHolds fades hands in as they join and out as they let go', () => {
    const animator = new Animator(60); // a beat a second
    const paths = new Map([['d1', createStationaryPath(new Position(10, 10), 8)]]);
    paths.holds = [{ ids: ['d1'], from: 1, to: 7 }];
    const state = new AnimationState(paths, animator);
    state.start(0);
    const strengthAt = beat => state.getCurrentHolds(beat * 1000)[0]?.strength ?? 0;
    assert.equal(strengthAt(0), 0);
    assert.equal(strengthAt(0.75), 0.5);
    assert.equal(strengthAt(1), 1);
    assert.equal(strengthAt(4), 1);
    assert.equal(strengthAt(7.25), 0.5);
    assert.equal(strengthAt(8), 0);
});

test('getCurrentHolds keeps the shape of a line', () => {
    const paths = new Map([['d1', createStationaryPath(new Position(10, 10), 8)]]);
    paths.holds = [{ ids: ['d1'], shape: 'line', from: 1, to: 7 }];
    const state = new AnimationState(paths, new Animator(60));
    state.start(0);
    assert.deepStrictEqual(state.getCurrentHolds(4000), [{ ids: ['d1'], shape: 'line', strength: 1 }]);
});

test('getCurrentHolds is empty for a move without holds', () => {
    const paths = new Map([['d1', createStationaryPath(new Position(10, 10), 8)]]);
    const state = new AnimationState(paths, new Animator(60));
    state.start(0);
    assert.deepStrictEqual(state.getCurrentHolds(4000), []);
});
