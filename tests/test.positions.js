// Unit tests for position and path utilities

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, toPixels, fromPixels, isInBounds, distance, lerp, center } from '../positions.js';
import { Path, createStraightPath, createStationaryPath, createArcPath, createOutAndBackPath } from '../paths.js';

// Position class tests

test('Position constructor creates position with x and y', () => {
    const pos = new Position(50, 75);
    assert.strictEqual(pos.x, 50);
    assert.strictEqual(pos.y, 75);
});

test('Position clone creates independent copy', () => {
    const pos1 = new Position(30, 40);
    const pos2 = pos1.clone();

    assert.strictEqual(pos2.x, 30);
    assert.strictEqual(pos2.y, 40);

    pos2.x = 50;
    assert.strictEqual(pos1.x, 30); // Original unchanged
});

test('Position equals returns true for same position', () => {
    const pos1 = new Position(25, 50);
    const pos2 = new Position(25, 50);

    assert(pos1.equals(pos2));
});

test('Position equals returns true for positions within tolerance', () => {
    const pos1 = new Position(25.001, 50.002);
    const pos2 = new Position(25.002, 50.001);

    assert(pos1.equals(pos2, 0.01));
});

test('Position equals returns false for different positions', () => {
    const pos1 = new Position(25, 50);
    const pos2 = new Position(30, 55);

    assert(!pos1.equals(pos2));
});

// Coordinate conversion tests

test('toPixels converts normalized to pixel coordinates', () => {
    const pos = new Position(50, 75);
    const pixels = toPixels(pos, 800, 900);

    assert.strictEqual(pixels.x, 400); // 50% of 800
    assert.strictEqual(pixels.y, 675); // 75% of 900
});

test('toPixels handles corner cases', () => {
    const origin = new Position(0, 0);
    const max = new Position(100, 100);

    const originPixels = toPixels(origin, 800, 900);
    const maxPixels = toPixels(max, 800, 900);

    assert.strictEqual(originPixels.x, 0);
    assert.strictEqual(originPixels.y, 0);
    assert.strictEqual(maxPixels.x, 800);
    assert.strictEqual(maxPixels.y, 900);
});

test('fromPixels converts pixel to normalized coordinates', () => {
    const pos = fromPixels(400, 675, 800, 900);

    assert.strictEqual(pos.x, 50);
    assert.strictEqual(pos.y, 75);
});

test('fromPixels and toPixels are inverse operations', () => {
    const original = new Position(37.5, 62.3);
    const pixels = toPixels(original, 800, 900);
    const converted = fromPixels(pixels.x, pixels.y, 800, 900);

    assert(converted.equals(original, 0.001));
});

// Bounds checking tests

test('isInBounds returns true for position within bounds', () => {
    const pos = new Position(50, 50);
    assert(isInBounds(pos));
});

test('isInBounds returns true for position at boundary', () => {
    const corner1 = new Position(0, 0);
    const corner2 = new Position(100, 100);

    assert(isInBounds(corner1));
    assert(isInBounds(corner2));
});

test('isInBounds returns false for position outside bounds', () => {
    const outsideX = new Position(105, 50);
    const outsideY = new Position(50, 105);
    const outsideBoth = new Position(-5, -5);

    assert(!isInBounds(outsideX));
    assert(!isInBounds(outsideY));
    assert(!isInBounds(outsideBoth));
});

test('isInBounds respects custom bounds', () => {
    const pos = new Position(50, 50);

    assert(isInBounds(pos, 40, 40, 60, 60));
    assert(!isInBounds(pos, 60, 60, 80, 80));
});

// Distance tests

test('distance calculates Euclidean distance correctly', () => {
    const pos1 = new Position(0, 0);
    const pos2 = new Position(3, 4);

    assert.strictEqual(distance(pos1, pos2), 5); // 3-4-5 triangle
});

test('distance returns 0 for same position', () => {
    const pos = new Position(50, 50);

    assert.strictEqual(distance(pos, pos), 0);
});

test('distance is symmetric', () => {
    const pos1 = new Position(10, 20);
    const pos2 = new Position(30, 40);

    assert.strictEqual(distance(pos1, pos2), distance(pos2, pos1));
});

// Interpolation tests

test('lerp interpolates between positions', () => {
    const start = new Position(0, 0);
    const end = new Position(100, 100);

    const midpoint = lerp(start, end, 0.5);
    assert.strictEqual(midpoint.x, 50);
    assert.strictEqual(midpoint.y, 50);
});

test('lerp returns start at t=0', () => {
    const start = new Position(20, 30);
    const end = new Position(80, 70);

    const result = lerp(start, end, 0);
    assert(result.equals(start));
});

test('lerp returns end at t=1', () => {
    const start = new Position(20, 30);
    const end = new Position(80, 70);

    const result = lerp(start, end, 1);
    assert(result.equals(end));
});

test('lerp handles arbitrary progress values', () => {
    const start = new Position(0, 0);
    const end = new Position(100, 50);

    const quarter = lerp(start, end, 0.25);
    assert.strictEqual(quarter.x, 25);
    assert.strictEqual(quarter.y, 12.5);
});

// Center calculation tests

test('center calculates midpoint of positions', () => {
    const positions = [
        new Position(0, 0),
        new Position(100, 100)
    ];

    const mid = center(positions);
    assert.strictEqual(mid.x, 50);
    assert.strictEqual(mid.y, 50);
});

test('center handles multiple positions', () => {
    const positions = [
        new Position(0, 0),
        new Position(60, 0),
        new Position(60, 60),
        new Position(0, 60)
    ];

    const mid = center(positions);
    assert.strictEqual(mid.x, 30);
    assert.strictEqual(mid.y, 30);
});

test('center returns default for empty array', () => {
    const mid = center([]);
    assert.strictEqual(mid.x, 50);
    assert.strictEqual(mid.y, 50);
});

// Path class tests

test('Path constructor creates path with waypoints and beats', () => {
    const waypoints = [new Position(0, 0), new Position(100, 100)];
    const path = new Path(waypoints, 8);

    assert.strictEqual(path.waypoints.length, 2);
    assert.strictEqual(path.beats, 8);
});

test('Path rejects less than 2 waypoints', () => {
    assert.throws(() => {
        new Path([new Position(0, 0)], 8);
    }, /at least 2 waypoints/);
});

test('Path rejects non-positive beats', () => {
    const waypoints = [new Position(0, 0), new Position(100, 100)];

    assert.throws(() => {
        new Path(waypoints, 0);
    }, /must be positive/);
});

test('Path start and end properties work correctly', () => {
    const start = new Position(10, 20);
    const end = new Position(90, 80);
    const path = new Path([start, new Position(50, 50), end], 8);

    assert(path.start.equals(start));
    assert(path.end.equals(end));
});

test('Path getPositionAt returns start at progress 0', () => {
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    const path = new Path([start, end], 8);

    const pos = path.getPositionAt(0);
    assert(pos.equals(start));
});

test('Path getPositionAt returns end at progress 1', () => {
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    const path = new Path([start, end], 8);

    const pos = path.getPositionAt(1);
    assert(pos.equals(end));
});

test('Path getPositionAt interpolates at midpoint', () => {
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    const path = new Path([start, end], 8);

    const pos = path.getPositionAt(0.5);
    assert(pos.equals(new Position(50, 50), 0.01));
});

test('Path getPositionAt handles multiple segments', () => {
    const waypoints = [
        new Position(0, 0),
        new Position(50, 0),
        new Position(50, 50),
        new Position(0, 50)
    ];
    const path = new Path(waypoints, 8);

    // At 0.25, should be halfway through second segment
    const pos1 = path.getPositionAt(0.5);
    assert(pos1.equals(new Position(50, 25), 0.01));
});

test('Path getPositionAt clamps to valid range', () => {
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    const path = new Path([start, end], 8);

    const beforeStart = path.getPositionAt(-0.5);
    const afterEnd = path.getPositionAt(1.5);

    assert(beforeStart.equals(start));
    assert(afterEnd.equals(end));
});

test('Path waypointCount returns correct count', () => {
    const waypoints = [
        new Position(0, 0),
        new Position(50, 50),
        new Position(100, 100)
    ];
    const path = new Path(waypoints, 8);

    assert.strictEqual(path.waypointCount, 3);
});

// Path creation helper tests

test('createStraightPath creates path with correct waypoints', () => {
    const start = new Position(0, 0);
    const end = new Position(100, 100);
    const path = createStraightPath(start, end, 8, 5);

    assert.strictEqual(path.waypointCount, 5);
    assert(path.start.equals(start));
    assert(path.end.equals(end));
    assert.strictEqual(path.beats, 8);
});

test('createStraightPath waypoints are evenly spaced', () => {
    const start = new Position(0, 0);
    const end = new Position(100, 0);
    const path = createStraightPath(start, end, 8, 3);

    const waypoints = path.getWaypoints();
    assert.strictEqual(waypoints[1].x, 50); // Midpoint
});

test('createStationaryPath creates path with same start and end', () => {
    const pos = new Position(50, 50);
    const path = createStationaryPath(pos, 8);

    assert(path.start.equals(pos));
    assert(path.end.equals(pos));
    assert.strictEqual(path.beats, 8);
});

test('createArcPath creates path around center point', () => {
    const center = new Position(50, 50);
    const start = new Position(70, 50);   // Right of center
    const end = new Position(50, 70);     // Below center (90 degrees counter-clockwise)

    const path = createArcPath(start, end, center, 8, 8, false);

    assert(path.start.equals(start, 0.1));
    assert(path.end.equals(end, 0.1));
    assert.strictEqual(path.beats, 8);
});

test('createArcPath maintains radius throughout', () => {
    const center = new Position(50, 50);
    const start = new Position(70, 50);
    const end = new Position(50, 70);

    const path = createArcPath(start, end, center, 8, 8, false);
    const radius = 20;

    // Check all waypoints are approximately the same distance from center
    path.getWaypoints().forEach(waypoint => {
        const dist = distance(waypoint, center);
        assert(Math.abs(dist - radius) < 0.5, `Distance ${dist} should be close to ${radius}`);
    });
});

// Path timing tests

test('Path moves at constant speed across segments of different lengths', () => {
    // First segment is 10 long, second is 30 long
    const path = new Path([new Position(0, 0), new Position(10, 0), new Position(40, 0)], 8);

    assert(path.getPositionAt(0.25).equals(new Position(10, 0), 0.01));
    assert(path.getPositionAt(0.5).equals(new Position(20, 0), 0.01));
});

test('Path follows explicit waypoint times', () => {
    const path = new Path([new Position(0, 0), new Position(10, 0), new Position(40, 0)], 8, [0, 0.5, 1]);

    assert(path.getPositionAt(0.5).equals(new Position(10, 0), 0.01));
    assert(path.getPositionAt(0.75).equals(new Position(25, 0), 0.01));
});

test('Path rejects invalid times', () => {
    const waypoints = [new Position(0, 0), new Position(10, 0), new Position(40, 0)];
    assert.throws(() => new Path(waypoints, 8, [0, 1]), /match waypoint count/);
    assert.throws(() => new Path(waypoints, 8, [0.1, 0.5, 1]), /start at 0 and end at 1/);
    assert.throws(() => new Path(waypoints, 8, [0, 1.2, 1]), /non-decreasing/);
});

test('stationary Path stays put', () => {
    const pos = new Position(30, 40);
    const path = createStationaryPath(pos, 8);
    assert(path.getPositionAt(0.5).equals(pos));
    assert(path.getPositionAtBeat(10).equals(pos));
    assert.deepStrictEqual(path.getVelocityAtBeat(4), { x: 0, y: 0 });
});

test('Path getPositionAtBeat and getVelocityAtBeat use beat time', () => {
    // Two 10-unit legs over 4 beats: 5 units per beat throughout
    const path = new Path([new Position(0, 0), new Position(10, 0), new Position(10, 10)], 4);

    assert(path.getPositionAtBeat(1).equals(new Position(5, 0), 0.01));
    assert(path.getPositionAtBeat(5).equals(new Position(10, 10), 0.01));
    assert.deepStrictEqual(path.getVelocityAtBeat(1), { x: 5, y: 0 });
    assert.deepStrictEqual(path.getVelocityAtBeat(3), { x: 0, y: 5 });
    assert.deepStrictEqual(path.getVelocityAtBeat(4), { x: 0, y: 5 });
});

test('createOutAndBackPath reaches the turn point halfway and returns', () => {
    const start = new Position(40, 50);
    const turn = new Position(44, 50);
    const path = createOutAndBackPath(start, turn, 8);

    assert(path.start.equals(start));
    assert(path.end.equals(start));
    assert(path.getPositionAt(0.5).equals(turn, 0.01));
});

test('createOutAndBackPath eases in and out', () => {
    const path = createOutAndBackPath(new Position(0, 0), new Position(10, 0), 8);

    // Covers less ground in the first eighth than in the second eighth
    const firstEighth = path.getPositionAt(0.125).x;
    const secondEighth = path.getPositionAt(0.25).x - firstEighth;
    assert(firstEighth < secondEighth);
});
