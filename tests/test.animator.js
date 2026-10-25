// Unit tests for animation timing system

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Animator, AnimationState } from '../animator.js';
import { Position } from '../positions.js';
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
