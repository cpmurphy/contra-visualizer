// Paths for the figures in which dancers cross the set, passing each other: chains,
// right and left throughs and heys

import { Position, toPixels, fromPixels, center } from '../positions.js';
import { Path, createStationaryPath, createArcPath } from '../paths.js';
import { SVG_WIDTH, SVG_HEIGHT } from '../layout.js';
import { TAKE_HANDS_BEATS } from './shared.js';

// Routes through half a hey for the left robin and left lark of a minor set with
// the robins on the diagonal from bottom left to top right, as [time, x, y]: time
// is the fraction of the hey, and x and y are in units of half the minor set's
// width and height from its center (y down). The right robin and lark follow the
// same routes turned half way around. Everyone travels half way around a figure
// eight, and the four passes come about a quarter of the hey apart:
// - the robins pass right shoulders in the middle;
// - each robin, going down the inside of the far line, passes the lark coming up
//   the outside of it by the left;
// - the larks pass right shoulders in the middle, the robins looping around the
//   far ends;
// - each robin, coming back up the outside of the far line, passes the lark going
//   down the inside of it by the left.
// Each lark ends in the other lark's place, and each robin in the other robin's.
const HEY_ROUTES = {
    robin: [
        [0, -1, 1],
        [0.08, -0.75, 0.45],
        [0.16, -0.18, -0.32],
        [0.27, 0.4, -0.85],
        [0.375, 0.7, -0.33],
        [0.5, 0.7, 0.6],
        [0.6, 0.95, 1.45],
        [0.7, 1.3, 0.75],
        [0.875, 1.3, -0.17],
        [1, 1, -1]
    ],
    lark: [
        [0, -1, -1],
        [0.15, -1.2, -0.4],
        [0.375, -1.3, 0.33],
        [0.47, -0.95, 1.25],
        [0.55, -0.6, 0.65],
        [0.625, -0.18, -0.32],
        [0.72, 0.4, -0.85],
        [0.875, 0.7, 0.17],
        [1, 1, 1]
    ]
};
// Waypoints between each point of a route through a hey
const HEY_SAMPLES_PER_STEP = 8;

// In a right and left through, how far dancers bear to their left to pass the one
// coming across the other way by the right shoulder, and how close together the
// two who courtesy turn come as they turn
const PASS_THROUGH_BULGE_PX = 26;
const COURTESY_TURN_RADIUS_PX = 25;
// Waypoints for each half of a right and left through
const RIGHT_AND_LEFT_SAMPLES = 16;

/**
 * Create half hey paths, for a minor set with the robins on one diagonal: on the
 * left side the lark above the robin, and on the right the robin above the lark (see
 * HEY_ROUTES). Each dancer follows a smooth curve through their route.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function createHalfHeyPaths(dancerSet, startPosById, endPosById, paths, beats) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });

    for (const i of dancerSet.minorSetStarts()) {
        const [leftLark, leftRobin, rightRobin, rightLark] = dancerSet.heyLine(i).map(index => dancerSet.dancers[index]);
        const px = dancer => toPixels(startPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);
        if (px(leftLark).y > px(leftRobin).y) {
            throw new Error('Half hey with the robins starting above the larks on the left is not animated yet');
        }

        // The routes are in units of half the minor set's width and height, from its center
        const corners = [leftLark, leftRobin, rightRobin, rightLark].map(px);
        const centerPx = {
            x: corners.reduce((sum, p) => sum + p.x, 0) / 4,
            y: corners.reduce((sum, p) => sum + p.y, 0) / 4
        };
        const halfWidth = (px(rightRobin).x - px(leftRobin).x) / 2;
        const halfHeight = (px(leftRobin).y - px(leftLark).y) / 2;

        // The dancers on the right follow the same routes turned half way around
        const routes = [
            [leftRobin, HEY_ROUTES.robin, 1],
            [rightRobin, HEY_ROUTES.robin, -1],
            [leftLark, HEY_ROUTES.lark, 1],
            [rightLark, HEY_ROUTES.lark, -1]
        ];
        for (const [dancer, route, turn] of routes) {
            const points = route.map(([, u, v]) => ({
                x: centerPx.x + turn * u * halfWidth,
                y: centerPx.y + turn * v * halfHeight
            }));
            // Start and end exactly in place
            points[0] = px(dancer);
            points[points.length - 1] = toPixels(endPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);

            const padded = [points[0], ...points, points[points.length - 1]];
            const waypoints = [startPosById.get(dancer.id).clone()];
            const times = [0];
            for (let k = 0; k < route.length - 1; k++) {
                for (let j = 1; j <= HEY_SAMPLES_PER_STEP; j++) {
                    const u = j / HEY_SAMPLES_PER_STEP;
                    const point = catmullRom(padded[k], padded[k + 1], padded[k + 2], padded[k + 3], u);
                    waypoints.push(fromPixels(point.x, point.y, SVG_WIDTH, SVG_HEIGHT));
                    times.push(route[k][0] + (route[k + 1][0] - route[k][0]) * u);
                }
            }
            paths.set(dancer.id, new Path(waypoints, beats, times));
        }
    }
}

/**
 * Create right and left through paths. For the first half everyone passes straight
 * across the set, bearing left to pass the dancer coming the other way by the right
 * shoulder. For the second half the two who arrived on each side courtesy turn:
 * they come close together, turn half way around counter-clockwise (as seen from
 * above, with the music at the top) about the middle of their side of the minor set,
 * and spread back out into the places there, holding hands as they turn (added to
 * paths.holds).
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function createRightAndLeftThroughPaths(dancerSet, startPosById, endPosById, paths, beats) {
    dancerSet.dancers.forEach(dancer => {
        paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
    });
    // Ease in and out of each half
    const ease = u => (1 - Math.cos(Math.PI * u)) / 2;
    const holds = [];

    for (const i of dancerSet.minorSetStarts()) {
        const minorSet = dancerSet.dancers.slice(i, i + 4);
        // The two who end on each side courtesy turn together
        const endX = dancer => endPosById.get(dancer.id).x;
        for (const dancer of minorSet) {
            const other = minorSet.find(d => d !== dancer && Math.abs(endX(d) - endX(dancer)) < 0.01);
            if (other && minorSet.indexOf(dancer) < minorSet.indexOf(other)) {
                holds.push({ ids: [dancer.id, other.id], shape: 'line', from: beats / 2, to: beats - TAKE_HANDS_BEATS });
            }
        }
        for (const dancer of minorSet) {
            const start = toPixels(startPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);
            const end = toPixels(endPosById.get(dancer.id), SVG_WIDTH, SVG_HEIGHT);
            // Across the set at their own row, then turning about the middle of the far side
            const arrival = { x: end.x, y: start.y };
            const pivot = { x: end.x, y: (start.y + end.y) / 2 };
            const heading = Math.sign(arrival.x - start.x);
            // Bearing left: heading right across the screen, that's up
            const bulge = { x: (start.x + arrival.x) / 2, y: start.y - heading * PASS_THROUGH_BULGE_PX };

            const waypoints = [];
            const times = [];
            for (let k = 0; k <= RIGHT_AND_LEFT_SAMPLES; k++) {
                const u = ease(k / RIGHT_AND_LEFT_SAMPLES);
                // Quadratic curve through the bulge halfway across
                const control = { x: 2 * bulge.x - (start.x + arrival.x) / 2, y: 2 * bulge.y - (start.y + arrival.y) / 2 };
                waypoints.push({
                    x: (1 - u) ** 2 * start.x + 2 * (1 - u) * u * control.x + u ** 2 * arrival.x,
                    y: (1 - u) ** 2 * start.y + 2 * (1 - u) * u * control.y + u ** 2 * arrival.y
                });
                times.push(k / RIGHT_AND_LEFT_SAMPLES / 2);
            }

            // Counter-clockwise from above is anticlockwise on screen: decreasing
            // angle in y-down coordinates
            const startAngle = Math.atan2(arrival.y - pivot.y, arrival.x - pivot.x);
            const outerRadius = Math.hypot(arrival.x - pivot.x, arrival.y - pivot.y);
            for (let k = 1; k <= RIGHT_AND_LEFT_SAMPLES; k++) {
                const u = ease(k / RIGHT_AND_LEFT_SAMPLES);
                const angle = startAngle - Math.PI * u;
                const radius = outerRadius - (outerRadius - COURTESY_TURN_RADIUS_PX) * Math.sin(Math.PI * u);
                waypoints.push({ x: pivot.x + radius * Math.cos(angle), y: pivot.y + radius * Math.sin(angle) });
                times.push(0.5 + k / RIGHT_AND_LEFT_SAMPLES / 2);
            }

            const normalized = waypoints.map(point => fromPixels(point.x, point.y, SVG_WIDTH, SVG_HEIGHT));
            normalized[normalized.length - 1] = endPosById.get(dancer.id).clone();
            paths.set(dancer.id, new Path(normalized, beats, times));
        }
    }

    paths.holds = holds;
}

/**
 * Point on a centripetal Catmull-Rom segment from p1 to p2
 * @param {{x: number, y: number}} p0
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {{x: number, y: number}} p3
 * @param {number} u - Progress from p1 (0) to p2 (1)
 * @returns {{x: number, y: number}}
 */
function catmullRom(p0, p1, p2, p3, u) {
    // Knot spacing grows with the square root of distance (centripetal), which
    // keeps the curve from overshooting at sharp corners
    const gap = (a, b) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-6);
    const t0 = 0;
    const t1 = t0 + gap(p0, p1);
    const t2 = t1 + gap(p1, p2);
    const t3 = t2 + gap(p2, p3);
    const t = t1 + (t2 - t1) * u;
    const mix = (a, b, ta, tb) => ta === tb ? a : {
        x: (tb - t) / (tb - ta) * a.x + (t - ta) / (tb - ta) * b.x,
        y: (tb - t) / (tb - ta) * a.y + (t - ta) / (tb - ta) * b.y
    };
    const a1 = mix(p0, p1, t0, t1);
    const a2 = mix(p1, p2, t1, t2);
    const a3 = mix(p2, p3, t2, t3);
    const b1 = mix(a1, a2, t0, t2);
    const b2 = mix(a2, a3, t1, t3);
    return mix(b1, b2, t1, t2);
}

// Robins chain geometry (pixels). The robins pull by right hands, swinging briefly
// clockwise around each other at the center of the minor set; each then courtesy
// turns counter-clockwise around a pivot beside the lark she meets, the lark close
// to the pivot and the robin around him.
const CHAIN_PULL_BY_RADIUS_PX = 28;
const COURTESY_PIVOT_START_FRACTION = 0.1;
const COURTESY_PIVOT_START_INWARD_PX = 0;
const COURTESY_PIVOT_END_FRACTION = 0.35;
const COURTESY_LARK_RADIUS_PX = 18;
const COURTESY_ROBIN_RADIUS_PX = 38;
// Phases of the chain, as fractions of its duration: for 8 beats, cross in 3,
// courtesy turn in 4, release into place in 1
const CHAIN_ARRIVAL_END = 3 / 8;
const CHAIN_TURN_END = 7 / 8;
// Waypoints per beat when sampling the chain paths
const CHAIN_SAMPLES_PER_BEAT = 12;

/**
 * Create robins chain paths: the robins pull by right hands in the middle of the
 * minor set, each meets the lark on the far side, and the couple courtesy turns
 * counter-clockwise as a unit (lark backing, robin walking forward around him),
 * coming to rest facing in with the robin on the lark's right. They then release
 * into their places. The robins hold hands while they pull by, and each couple
 * while they turn, added to paths.holds.
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function createRobinsChainPaths(dancerSet, startPosById, endPosById, paths, beats) {
    const startIndex = dancerSet.dancers[0].active ? 0 : 2;
    const holds = [];

    for (let i = startIndex; i + 4 <= dancerSet.dancers.length; i += 4) {
        const minorSetDancers = dancerSet.dancers.slice(i, i + 4);
        const setCenterPx = toPixels(center(minorSetDancers.map(d => startPosById.get(d.id))),
            SVG_WIDTH, SVG_HEIGHT);

        const robins = minorSetDancers.filter(d =>
            d.active && d.role === 'robin' && !startPosById.get(d.id).equals(endPosById.get(d.id), 0.01));

        // When each robin is on the pull-by circle, in beats
        const pullBys = [];
        for (const robin of robins) {
            const robinEnd = endPosById.get(robin.id);
            // The robin turns with the lark already standing on the side she ends on
            const lark = minorSetDancers.find(d =>
                d.role === 'lark' && Math.abs(startPosById.get(d.id).x - robinEnd.x) < 0.01);
            if (!lark) {
                throw new Error(`No lark for ${robin.id} to courtesy turn with`);
            }

            const [robinWaypoints, larkWaypoints, times, pullBy] = courtesyTurnChainWaypoints(
                toPixels(startPosById.get(robin.id), SVG_WIDTH, SVG_HEIGHT),
                toPixels(robinEnd, SVG_WIDTH, SVG_HEIGHT),
                toPixels(startPosById.get(lark.id), SVG_WIDTH, SVG_HEIGHT),
                setCenterPx,
                beats
            );
            paths.set(robin.id, new Path(robinWaypoints, beats, times));
            paths.set(lark.id, new Path(larkWaypoints, beats, times));
            holds.push({ ids: [lark.id, robin.id], shape: 'line',
                from: CHAIN_ARRIVAL_END * beats, to: CHAIN_TURN_END * beats });
            pullBys.push(pullBy);
        }
        // The robins hold hands while both are on the pull-by circle
        if (robins.length === 2) {
            holds.push({ ids: robins.map(robin => robin.id), shape: 'line',
                from: Math.max(...pullBys.map(p => p.from)), to: Math.min(...pullBys.map(p => p.to)) });
        }
    }
    paths.holds = holds;

    // Everyone else (other active dancers, inactive couples) stays put
    dancerSet.dancers.forEach(dancer => {
        if (!paths.has(dancer.id)) {
            paths.set(dancer.id, createStationaryPath(startPosById.get(dancer.id), beats));
        }
    });
}

/**
 * Sample the paths of one robin and her courtesy-turn lark through a chain.
 * The robin's arrival is built from tangent lines and arcs: straight onto the
 * pull-by circle (clockwise), around it, then along the inner tangent onto the
 * courtesy-turn circle (counter-clockwise), so her path never has a corner.
 * All inputs are in pixels; returns normalized waypoints and their shared times,
 * and the beats from and to which the robin is on the pull-by circle.
 * @param {{x: number, y: number}} robinStart
 * @param {{x: number, y: number}} robinEnd
 * @param {{x: number, y: number}} larkPlace - Lark's place (start and end)
 * @param {{x: number, y: number}} setCenter - Center of the minor set
 * @param {number} beats
 * @returns {[Position[], Position[], number[], {from: number, to: number}]}
 */
function courtesyTurnChainWaypoints(robinStart, robinEnd, larkPlace, setCenter, beats) {
    const add = (a, b, k = 1) => ({ x: a.x + k * b.x, y: a.y + k * b.y });
    const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
    const dot = (a, b) => a.x * b.x + a.y * b.y;
    const length = a => Math.hypot(a.x, a.y);
    const unit = a => { const l = length(a); return { x: a.x / l, y: a.y / l }; };
    const angleOf = a => Math.atan2(a.y, a.x);
    const onCircle = (angle, radius) => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
    const fullTurn = 2 * Math.PI;
    const positiveAngle = a => ((a % fullTurn) + fullTurn) % fullTurn;
    // Direction of travel at an angle on a circle (y-down: clockwise = increasing angle)
    const clockwiseHeading = angle => ({ x: -Math.sin(angle), y: Math.cos(angle) });
    const counterClockwiseHeading = angle => ({ x: Math.sin(angle), y: -Math.cos(angle) });
    const smoothstep = x => x * x * (3 - 2 * x);

    // Courtesy turn pivot: just beside the lark, toward the robin's place and the
    // center, drifting a little further toward her place as they turn
    const larkToRobinEnd = sub(robinEnd, larkPlace);
    const endDirection = unit(larkToRobinEnd);
    const larkToCenter = sub(setCenter, larkPlace);
    const inward = unit(add(larkToCenter, endDirection, -dot(larkToCenter, endDirection)));
    const robinRadius = COURTESY_ROBIN_RADIUS_PX;
    const larkRadius = COURTESY_LARK_RADIUS_PX;
    const pullByRadius = CHAIN_PULL_BY_RADIUS_PX;
    let pivot = add(add(larkPlace, endDirection, COURTESY_PIVOT_START_FRACTION * length(larkToRobinEnd)),
        inward, COURTESY_PIVOT_START_INWARD_PX);
    // The pull-by and courtesy circles mustn't overlap, or there's no tangent between them
    const minPivotDistance = pullByRadius + robinRadius + 4;
    const pivotFromCenter = sub(pivot, setCenter);
    if (length(pivotFromCenter) < minPivotDistance) {
        pivot = add(setCenter, unit(pivotFromCenter), minPivotDistance);
    }
    const pivotEnd = add(larkPlace, endDirection, COURTESY_PIVOT_END_FRACTION * length(larkToRobinEnd));

    // 1. Straight from her start onto the pull-by circle, joining it clockwise
    const startFromCenter = sub(robinStart, setCenter);
    const tangentOffset = Math.acos(Math.min(1, pullByRadius / length(startFromCenter)));
    const pullByEntryAngle = [angleOf(startFromCenter) + tangentOffset, angleOf(startFromCenter) - tangentOffset]
        .find(angle => dot(clockwiseHeading(angle), sub(add(setCenter, onCircle(angle, pullByRadius)), robinStart)) > 0);
    const pullByEntry = add(setCenter, onCircle(pullByEntryAngle, pullByRadius));

    // 2. Leave the pull-by circle along the inner tangent that joins the courtesy
    // circle counter-clockwise: the pivot must lie on the left of the line, robinRadius away
    const tangentError = angle => {
        const from = add(setCenter, onCircle(angle, pullByRadius));
        const heading = clockwiseHeading(angle);
        return dot(sub(pivot, from), { x: heading.y, y: -heading.x }) - robinRadius;
    };
    const ahead = angle => dot(sub(pivot, add(setCenter, onCircle(angle, pullByRadius))), clockwiseHeading(angle)) > 0;
    let pullBySweep = null;
    const steps = 720;
    for (let k = 0; k < steps && pullBySweep === null; k++) {
        const a = pullByEntryAngle + fullTurn * k / steps;
        const b = pullByEntryAngle + fullTurn * (k + 1) / steps;
        if (tangentError(a) * tangentError(b) <= 0 && ahead(a)) {
            let lo = a, hi = b;
            for (let n = 0; n < 40; n++) {
                const m = (lo + hi) / 2;
                if (tangentError(lo) * tangentError(m) <= 0) hi = m; else lo = m;
            }
            pullBySweep = (lo + hi) / 2 - pullByEntryAngle;
        }
    }
    if (pullBySweep === null) {
        throw new Error('No path from the pull-by into the courtesy turn');
    }
    const pullByExitAngle = pullByEntryAngle + pullBySweep;
    const pullByExit = add(setCenter, onCircle(pullByExitAngle, pullByRadius));
    const exitHeading = clockwiseHeading(pullByExitAngle);
    const turnEntry = add(pullByExit, exitHeading, dot(sub(pivot, pullByExit), exitHeading));

    // 3. Courtesy turn: counter-clockwise from where she joins to facing in, with the
    // robin on the lark's right
    const turnStartAngle = angleOf(sub(turnEntry, pivot));
    const turnSweep = positiveAngle(turnStartAngle - angleOf(endDirection));

    // Arrival as a sequence of pieces, each a function of distance along it
    const pieces = [
        { length: length(sub(pullByEntry, robinStart)),
          at: d => add(robinStart, unit(sub(pullByEntry, robinStart)), d) },
        { length: pullBySweep * pullByRadius,
          at: d => add(setCenter, onCircle(pullByEntryAngle + d / pullByRadius, pullByRadius)) },
        { length: length(sub(turnEntry, pullByExit)),
          at: d => add(pullByExit, exitHeading, d) }
    ];
    const arrivalLength = pieces.reduce((sum, piece) => sum + piece.length, 0);
    const arrivalAt = fraction => {
        let d = fraction * arrivalLength;
        for (const piece of pieces) {
            if (d <= piece.length) return piece.at(d);
            d -= piece.length;
        }
        return turnEntry;
    };

    // The turn starts at her arrival pace and eases to a stop (the lark's cue that
    // the turn is over): Hermite profile with initial slope matched to that pace
    const arrivalBeats = CHAIN_ARRIVAL_END * beats;
    const turnBeats = (CHAIN_TURN_END - CHAIN_ARRIVAL_END) * beats;
    const arrivalSpeed = arrivalLength / arrivalBeats;
    const initialSlope = Math.min(3, arrivalSpeed * turnBeats / (turnSweep * robinRadius));
    const turnProgress = x => (x * x * x - 2 * x * x + x) * initialSlope + (3 * x * x - 2 * x * x * x);

    const larkTurnStart = add(pivot, onCircle(turnStartAngle, larkRadius), -1);
    const robinTurnEnd = add(pivotEnd, endDirection, robinRadius);
    const larkTurnEnd = add(pivotEnd, endDirection, -larkRadius);

    const robinWaypoints = [];
    const larkWaypoints = [];
    const times = [];
    const sampleCount = Math.max(16, Math.round(CHAIN_SAMPLES_PER_BEAT * beats));
    for (let k = 0; k <= sampleCount; k++) {
        const progress = k / sampleCount;
        let robin, lark;
        if (progress <= CHAIN_ARRIVAL_END) {
            // Robin crosses at a steady pace; lark steps up beside the pivot to meet her
            const x = progress / CHAIN_ARRIVAL_END;
            robin = arrivalAt(x);
            lark = add(larkPlace, sub(larkTurnStart, larkPlace), smoothstep(x));
        } else if (progress <= CHAIN_TURN_END) {
            // Rotate together about the pivot, the lark opposite the robin
            const x = (progress - CHAIN_ARRIVAL_END) / (CHAIN_TURN_END - CHAIN_ARRIVAL_END);
            const angle = turnStartAngle - turnSweep * turnProgress(x);
            const turnPivot = add(pivot, sub(pivotEnd, pivot), smoothstep(x));
            robin = add(turnPivot, onCircle(angle, robinRadius));
            lark = add(turnPivot, onCircle(angle, larkRadius), -1);
        } else {
            // Release: both ease out into their places
            const x = smoothstep((progress - CHAIN_TURN_END) / (1 - CHAIN_TURN_END));
            robin = add(robinTurnEnd, sub(robinEnd, robinTurnEnd), x);
            lark = add(larkTurnEnd, sub(larkPlace, larkTurnEnd), x);
        }
        robinWaypoints.push(fromPixels(robin.x, robin.y, SVG_WIDTH, SVG_HEIGHT));
        larkWaypoints.push(fromPixels(lark.x, lark.y, SVG_WIDTH, SVG_HEIGHT));
        times.push(progress);
    }

    // Land exactly on the places
    robinWaypoints[0] = fromPixels(robinStart.x, robinStart.y, SVG_WIDTH, SVG_HEIGHT);
    robinWaypoints[robinWaypoints.length - 1] = fromPixels(robinEnd.x, robinEnd.y, SVG_WIDTH, SVG_HEIGHT);
    larkWaypoints[0] = fromPixels(larkPlace.x, larkPlace.y, SVG_WIDTH, SVG_HEIGHT);
    larkWaypoints[larkWaypoints.length - 1] = fromPixels(larkPlace.x, larkPlace.y, SVG_WIDTH, SVG_HEIGHT);
    times[times.length - 1] = 1;

    // She crosses at a steady pace, so the time on each piece is in proportion to its length
    const pullBy = {
        from: pieces[0].length / arrivalLength * arrivalBeats,
        to: (pieces[0].length + pieces[1].length) / arrivalLength * arrivalBeats
    };
    return [robinWaypoints, larkWaypoints, times, pullBy];
}

/**
 * Create chain paths for dancers - crossing paths with collision avoidance
 * @param {import('./dancers.js').Set} dancerSet
 * @param {Map<string, Position>} startPosById
 * @param {Map<string, Position>} endPosById
 * @param {Map<string, import('./paths.js').Path>} paths
 * @param {number} beats
 */
export function createChainPaths(dancerSet, startPosById, endPosById, paths, beats) {
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
