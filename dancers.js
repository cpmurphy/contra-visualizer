// Dancer model used to keep dancer identities stable
// even as they move between minor sets or become inactive.

import { Position } from './positions.js';
import { SVG_WIDTH, SVG_HEIGHT, LEFT_LINE_X_PX, LINE_SPACING_PX, COLUMN_MIDPOINT_PX, VERTICAL_SPACING_PX, firstRowY } from './layout.js';

// A couple going down or up the center walks this far either side of the middle
const CENTER_LANE_OFFSET_PX = 30;
// Dancers going down or up the outside walk this far outside the lines
const OUTSIDE_LANE_OFFSET_PX = 50;
// After contra corners, the couple stand this far either side of the middle
const CONTRA_CORNERS_END_OFFSET_PX = 45;

const COLOR_PALETTE = [
    '#1b9e77',
    '#d95f02',
    '#7570b3',
    '#e7298a',
    '#66a61e',
    '#e6ab02'
];

export class Dancer {
    constructor(id, role, couple, active = true) {
        this.id = id;
        this.role = role;
        this.couple = couple;
        this.active = active;
    }

    setPartner(partner) {
        this.partner = partner;
    }

    activate() {
        this.active = true;
    }

    inactivate() {
        this.active = false;
    }

    getLabel() {
        return this.role.substr(0, 1).toUpperCase() + this.couple.coupleNumber;
    }
}

export class Couple {
    constructor(coupleNumber, color) {
        this.coupleNumber = coupleNumber;
        this.color = color;
    }

    setCoupleNumber(coupleNumber) {
        this.coupleNumber = coupleNumber;
    }
}

export class Set {
    /** Formations the set can be laid out in */
    static FORMATIONS = ['improper', 'proper'];

    /**
     * @param {number} coupleCount - Number of couples in the set
     * @param {string} formation - 'improper' (ones crossed over) or 'proper'
     */
    constructor(coupleCount = 6, formation = 'improper') {
        if (!Set.FORMATIONS.includes(formation)) {
            throw new Error('Unsupported formation: ' + formation);
        }
        this.formation = formation;
        this.dancers = [];
        this.snapshots = [];
        // How far (normalized) each dancer who isn't standing in their place is from it
        this.offsets = new Map();
        // Whether any move has been danced since the dancers lined up
        this.started = false;
        this.dancerMap = new Map(); // Map from dancer id to dancer object
        let dancerNumber = 1;

        for (let i = 0; i < coupleCount; i++) {
            const color = COLOR_PALETTE[(i) % COLOR_PALETTE.length];
            const coupleNumber = (i % 2) + 1;
            const couple = new Couple(coupleNumber, color);
            const active = i < coupleCount - 1 || i % 2 === 1;
            const lark = new Dancer('d' + dancerNumber, 'lark', couple, active);
            dancerNumber++;
            const robin = new Dancer('d' + dancerNumber, 'robin', couple, active);
            dancerNumber++;

            lark.setPartner(robin);
            robin.setPartner(lark);

            this.dancerMap.set(lark.id, lark);
            this.dancerMap.set(robin.id, robin);

            if (i % 2 == 0 && this.isImproper()) {
                this.dancers.push(robin);
                this.dancers.push(lark);
            } else {
                this.dancers.push(lark);
                this.dancers.push(robin);
            }
        }
        if (coupleCount % 2 != 0) {
            // make the last couple a "2", rotating them in improper dances
            const secondLast = coupleCount * 2 - 2;
            const last = coupleCount * 2 - 1;
            this.dancers[last].couple.coupleNumber = 2;
            if (this.isImproper()) {
                const robin = this.dancers[secondLast];
                const lark = this.dancers[last];
                this.dancers[secondLast] = lark; // on left, facing up
                this.dancers[last] = robin;      // on right, facing up
            }
        }
    }

    /**
     * Whether the ones start crossed over (and couples cross over when they wait
     * out at the ends of the set)
     * @returns {boolean}
     */
    isImproper() {
        return this.formation === 'improper';
    }

    /**
     * Rotate each minor set to the left by the given number of places.
     * @param {number} numberOfPlaces - The number of places to rotate
     */
    circleLeft(numberOfPlaces) {
        this.snapshot();
        const startIndex = this.dancers[0].active ? 0 : 2;
        for (let i = startIndex; i < this.dancers.length; i += 4) {
            if (this.dancers.length - i < 4) {
                break;
            }
            for (let j = 0; j < numberOfPlaces; j++) {
                const originalFirst = this.dancers[i];
                const originalSecond = this.dancers[i + 1];
                const originalThird = this.dancers[i + 2];
                const originalFourth = this.dancers[i + 3];
                this.dancers[i] = originalThird;
                this.dancers[i + 1] = originalFirst;
                this.dancers[i + 2] = originalFourth;
                this.dancers[i + 3] = originalSecond;
            }
        }
    }

    /**
     * A star left: left hands in the middle, walking forward, so the dancers turn
     * counter-clockwise (seen from above), the same way as a circle right.
     * @param {number} numberOfPlaces - The number of places to rotate
     */
    starLeft(numberOfPlaces) {
        this.circleRight(numberOfPlaces);
    }

    /**
     * Rotate each minor set to the right by the given number of places.
     * @param {number} numberOfPlaces - The number of places to rotate
     */
    circleRight(numberOfPlaces) {
        this.snapshot();
        const startIndex = this.dancers[0].active ? 0 : 2;
        for (let i = startIndex; i < this.dancers.length; i += 4) {
            if (this.dancers.length - i < 4) {
                break;
            }
            for (let j = 0; j < numberOfPlaces; j++) {
                const originalFirst = this.dancers[i];
                const originalSecond = this.dancers[i + 1];
                const originalThird = this.dancers[i + 2];
                const originalFourth = this.dancers[i + 3];
                this.dancers[i] = originalSecond;
                this.dancers[i + 1] = originalFourth;
                this.dancers[i + 2] = originalFirst;
                this.dancers[i + 3] = originalThird;
            }
        }
    }

    /**
     * A star right: right hands in the middle, walking forward, so the dancers turn
     * clockwise (seen from above), the same way as a circle left.
     * @param {number} numberOfPlaces - The number of places to rotate
     */
    starRight(numberOfPlaces) {
        this.circleLeft(numberOfPlaces);
    }

    balance() {
        this.snapshot();
    }

    /**
     * The index of the first place of each complete minor set
     * @returns {number[]}
     */
    minorSetStarts() {
        const starts = [];
        for (let i = this.dancers[0].active ? 0 : 2; i + 4 <= this.dancers.length; i += 4) {
            starts.push(i);
        }
        return starts;
    }

    /**
     * The places of the active dancers in complete minor sets who are in the given
     * couple ('ones' or 'twos')
     * @param {string} who
     * @returns {number[]} Indexes into this.dancers
     */
    placesOf(who) {
        const coupleNumber = { ones: 1, twos: 2 }[who];
        if (!coupleNumber) {
            throw new Error('Invalid couple: ' + who);
        }
        return this.minorSetStarts()
            .flatMap(i => [i, i + 1, i + 2, i + 3])
            .filter(index => {
                const dancer = this.dancers[index];
                return dancer.active && dancer.couple.coupleNumber === coupleNumber;
            });
    }

    /**
     * The couple goes down (or, for a negative distance, up) the center of the set,
     * each walking on their own side of the middle
     * @param {string} who - 'ones' or 'twos'
     * @param {number} distancePx - How far down the hall to go, in pixels
     */
    downTheCenter(who, distancePx) {
        this.snapshot();
        const places = this.getPlacePositions();
        const positions = this.getPositions();
        for (const index of this.placesOf(who)) {
            const dancer = this.dancers[index];
            const offset = this.getOffset(dancer);
            this.offsets.set(dancer.id, {
                x: this.laneX(positions[index].x < this.middleX()) - places[index].x,
                y: offset.y + distancePx / SVG_HEIGHT * 100
            });
        }
    }

    /**
     * Partners in the couple swing in the middle of the set, halfway between where
     * they were, and end side by side there facing up or down the hall, the robin on
     * the lark's right. Their places are swapped if need be so that each is in the
     * column on the side of the set they end on.
     * @param {string} who - 'ones' or 'twos'
     * @param {string} facing - 'up' or 'down'
     */
    swingInCenter(who, facing) {
        this.snapshot();
        const swinging = this.placesOf(who);
        const positions = this.getPositions();
        const places = this.getPlacePositions();
        for (const larkIndex of swinging.filter(index => this.dancers[index].role === 'lark')) {
            const lark = this.dancers[larkIndex];
            const robinIndex = this.dancers.indexOf(lark.partner);
            if (!swinging.includes(robinIndex)) continue;

            // Facing down the hall, the lark's right is on the left side of the set
            const robinOnLeft = facing !== 'up';
            const leftDancer = robinOnLeft ? lark.partner : lark;
            const rightDancer = robinOnLeft ? lark : lark.partner;
            if (larkIndex % 2 !== robinIndex % 2 && this.dancers.indexOf(leftDancer) % 2 !== 0) {
                // They end on the opposite sides from their columns: trade places
                this.dancers[larkIndex] = lark.partner;
                this.dancers[robinIndex] = lark;
            }
            const leftIndex = this.dancers.indexOf(leftDancer);
            const rightIndex = this.dancers.indexOf(rightDancer);

            const y = (positions[larkIndex].y + positions[robinIndex].y) / 2;
            for (const [index, onLeft] of [[leftIndex, true], [rightIndex, false]]) {
                this.offsets.set(this.dancers[index].id, {
                    x: this.laneX(onLeft) - places[index].x,
                    y: y - places[index].y
                });
            }
        }
    }

    /**
     * A right and left through across the set: each dancer passes the one straight
     * across by the right shoulder, and the two who arrive on the same side courtesy
     * turn, so everyone ends in the place diagonally across the minor set from them
     */
    rightAndLeftThrough() {
        this.snapshot();
        for (const i of this.minorSetStarts()) {
            const [a, b, c, d] = this.dancers.slice(i, i + 4);
            this.dancers.splice(i, 4, d, c, b, a);
        }
    }

    /**
     * Half a hey for four, started by the robins passing right shoulders in the
     * middle. The four dancers are in a line (see heyLine) and travel half way
     * around a figure eight along it, so the line ends up reversed: each lark ends in
     * the other lark's place, and each robin in the other robin's.
     */
    halfHey() {
        this.snapshot();
        for (const i of this.minorSetStarts()) {
            const hey = this.heyLine(i);
            if (!hey) {
                throw new Error('A hey needs a lark and a robin on each side of the minor set');
            }
            const dancers = hey.map(index => this.dancers[index]);
            hey.forEach((index, k) => {
                this.dancers[index] = dancers[3 - k];
            });
        }
    }

    /**
     * The places of the dancers in a minor set, in order along the line of a hey that
     * the robins start: the left lark, left robin, right robin and right lark
     * @param {number} i - Index of the first place of the minor set
     * @returns {number[]|null} Null if a side doesn't have one lark and one robin
     */
    heyLine(i) {
        const side = column => {
            const places = [i + column, i + 2 + column];
            const lark = places.find(index => this.dancers[index].role === 'lark');
            const robin = places.find(index => this.dancers[index].role === 'robin');
            return lark !== undefined && robin !== undefined ? { lark, robin } : null;
        };
        const left = side(0);
        const right = side(1);
        return left && right ? [left.lark, left.robin, right.robin, right.lark] : null;
    }

    /**
     * Normalized x of the middle of the set
     * @returns {number}
     */
    middleX() {
        return COLUMN_MIDPOINT_PX / SVG_WIDTH * 100;
    }

    /**
     * Normalized x at which a dancer in a couple in the middle of the set stands
     * @param {boolean} onLeft - Whether they're on the left side of the middle
     * @returns {number}
     */
    laneX(onLeft) {
        return this.middleX() + (onLeft ? -1 : 1) * CENTER_LANE_OFFSET_PX / SVG_WIDTH * 100;
    }

    /**
     * The couple separate to the nearest outside of the set and walk down it
     * @param {string} who - 'ones' or 'twos'
     * @param {number} distancePx - How far down the hall to go, in pixels
     */
    downTheOutside(who, distancePx) {
        this.snapshot();
        const places = this.getPlacePositions();
        const positions = this.getPositions();
        for (const index of this.placesOf(who)) {
            const dancer = this.dancers[index];
            const onLeft = positions[index].x < this.middleX();
            const outsideX = (onLeft ? LEFT_LINE_X_PX - OUTSIDE_LANE_OFFSET_PX
                : LEFT_LINE_X_PX + LINE_SPACING_PX + OUTSIDE_LANE_OFFSET_PX) / SVG_WIDTH * 100;
            this.offsets.set(dancer.id, {
                x: outsideX - places[index].x,
                y: this.getOffset(dancer).y + distancePx / SVG_HEIGHT * 100
            });
        }
    }

    /**
     * The couple turn contra corners: partners allemande right in the middle, each
     * allemandes left with their first corner, partners allemande right again, and
     * each allemandes left with their second corner. They end crossed over, facing
     * each other across the middle of the set at their row, so their places are
     * swapped.
     * @param {string} who - 'ones' or 'twos'
     */
    contraCorners(who) {
        this.snapshot();
        const turning = this.placesOf(who);
        const places = this.getPlacePositions();
        const positions = this.getPositions();
        for (const larkIndex of turning.filter(index => this.dancers[index].role === 'lark')) {
            const lark = this.dancers[larkIndex];
            const robinIndex = this.dancers.indexOf(lark.partner);
            if (!turning.includes(robinIndex)) continue;
            const y = (positions[larkIndex].y + positions[robinIndex].y) / 2;
            this.dancers[larkIndex] = lark.partner;
            this.dancers[robinIndex] = lark;
            for (const index of [larkIndex, robinIndex]) {
                const onLeft = index % 2 === 0;
                const x = this.middleX() + (onLeft ? -1 : 1) * CONTRA_CORNERS_END_OFFSET_PX / SVG_WIDTH * 100;
                this.offsets.set(this.dancers[index].id, { x: x - places[index].x, y: y - places[index].y });
            }
        }
    }

    /**
     * A dancer's contra corners: facing across the set, the first is on their right
     * diagonal and the second on their left
     * @param {number} index - The dancer's place
     * @returns {{first: number, second: number}} Places of the corners; either may be
     *   off the end of the set
     */
    contraCornersOf(index) {
        const row = Math.floor(index / 2);
        const column = index % 2;
        const across = 1 - column;
        // Facing across from the left, your right is down the hall
        const firstRow = column === 0 ? row + 1 : row - 1;
        const secondRow = column === 0 ? row - 1 : row + 1;
        return { first: firstRow * 2 + across, second: secondRow * 2 + across };
    }

    /**
     * The couple come back up the outside of the set to their places
     * @param {string} who - 'ones' or 'twos'
     */
    upTheOutside(who) {
        this.snapshot();
        for (const index of this.placesOf(who)) {
            this.offsets.delete(this.dancers[index].id);
        }
    }

    /**
     * The couple comes back up the center of the set
     * @param {string} who - 'ones' or 'twos'
     * @param {number} distancePx - How far up the hall to come, in pixels
     */
    upTheCenter(who, distancePx) {
        this.downTheCenter(who, -distancePx);
    }

    /**
     * Each of the couple casts off around the dancer on their side of the minor set,
     * ending in the line below them (the other dancer moving up if need be)
     * @param {string} who - 'ones' or 'twos'
     */
    castOff(who) {
        this.snapshot();
        const casting = this.placesOf(who);
        for (const i of this.minorSetStarts()) {
            for (const column of [0, 1]) {
                const upper = i + column;
                const lower = i + 2 + column;
                const castingIndex = [upper, lower].find(index => casting.includes(index));
                if (castingIndex === undefined) continue;
                const caster = this.dancers[castingIndex];
                const pivot = this.dancers[castingIndex === upper ? lower : upper];
                this.dancers[lower] = caster;
                this.dancers[upper] = pivot;
                this.offsets.delete(caster.id);
                this.offsets.delete(pivot.id);
            }
        }
    }

    /**
     * How far a dancer is from their place (zero when they're in it)
     * @param {Dancer} dancer
     * @returns {{x: number, y: number}} Normalized offset
     */
    getOffset(dancer) {
        return this.offsets.get(dancer.id) || { x: 0, y: 0 };
    }

    /**
     * Put everyone back in their places
     */
    clearOffsets() {
        this.offsets.clear();
    }

    swing(kind) {
        this.snapshot();
        if (kind === 'neighbor') {
            this.swingNeighbor();
        } else if (kind === 'partner') {
            this.swingPartner();
        } else {
            throw new Error('Invalid swing kind: ' + kind);
        }
    }

    longLines() {
        this.snapshot();
    }

    swingNeighbor() {
        const startIndex = this.dancers[0].active ? 0 : 2;
        for (let i = startIndex; i < this.dancers.length; i += 4) {
            if (this.dancers.length - i < 4) {
                break;
            }
            const leftLark = this.dancers[i].role === 'lark' ? this.dancers[i] : this.dancers[i + 2];
            const leftRobin = this.dancers[i].role === 'robin' ? this.dancers[i] : this.dancers[i + 2];
            const rightLark = this.dancers[i + 1].role === 'lark' ? this.dancers[i + 1] : this.dancers[i + 3];
            const rightRobin = this.dancers[i + 1].role === 'robin' ? this.dancers[i + 1] : this.dancers[i + 3];
            this.dancers[i] = leftLark;
            this.dancers[i + 1] = rightRobin;
            this.dancers[i + 2] = leftRobin;
            this.dancers[i + 3] = rightLark;
        }
    }

    swingPartner() {
        const startIndex = this.dancers[0].active ? 0 : 2;
        for (let i = startIndex; i < this.dancers.length; i += 4) {
            if (this.dancers.length - i < 4) {
                break;
            }
            const leftLark = this.dancers[i].role === 'lark' ? this.dancers[i] : this.dancers[i + 2];
            const leftRobin = leftLark.partner;
            const rightLark = this.dancers[i + 1].role === 'lark' ? this.dancers[i + 1] : this.dancers[i + 3];
            const rightRobin = rightLark.partner;
            this.dancers[i] = leftLark;
            this.dancers[i + 1] = rightRobin;
            this.dancers[i + 2] = leftRobin;
            this.dancers[i + 3] = rightLark;
        }
    }

    chain(kind) {
        if (kind === 'robins') {
            this.chainRobins();
        } else if (kind === 'larks') {
            this.chainLarks();
        } else {
            throw new Error('Invalid chain kind: ' + kind);
        }
    }

    chainRobins() {
        this.snapshot();
        const startIndex = this.dancers[0].active ? 0 : 2;
        for (let i = startIndex; i < this.dancers.length; i += 4) {
            if (this.dancers.length - i < 4) {
                break;
            }
            const leftRobinIndex = this.dancers[i].role === 'robin' ? i : i + 2;
            const rightRobinIndex = this.dancers[i + 1].role === 'robin' ? i + 1 : i + 3;
            const leftRobin = this.dancers[leftRobinIndex];
            const rightRobin = this.dancers[rightRobinIndex];
            this.dancers[leftRobinIndex] = rightRobin;
            this.dancers[rightRobinIndex] = leftRobin;
        }
    }

    chainLarks() {
        this.snapshot();
        const startIndex = this.dancers[0].active ? 0 : 2;
        for (let i = startIndex; i < this.dancers.length; i += 4) {
            if (this.dancers.length - i < 4) {
                break;
            }
            const leftLarkIndex = this.dancers[i].role === 'lark' ? i : i + 2;
            const rightLarkIndex = this.dancers[i + 1].role === 'lark' ? i + 1 : i + 3;
            const leftLark = this.dancers[leftLarkIndex];
            const rightLark = this.dancers[rightLarkIndex];
            this.dancers[leftLarkIndex] = rightLark;
            this.dancers[rightLarkIndex] = leftLark;
        }
    }

    doSiDo(numberOfTimes) {
        this.snapshot();
        if (Number.isInteger(numberOfTimes)) {
            // returns dancers to original positions
        } else if (Number.isFinite(numberOfTimes)) {
            // swaps the dancers vertically
            const startIndex = this.dancers[0].active ? 0 : 2;
            for (let i = startIndex; i < this.dancers.length; i += 4) {
                if (this.dancers.length - i < 4) {
                    break;
                }
                const topLeft = this.dancers[i];
                const topRight = this.dancers[i + 1];
                const bottomLeft = this.dancers[i + 2];
                const bottomRight = this.dancers[i + 3];
                this.dancers[i] = bottomLeft;
                this.dancers[i + 1] = bottomRight;
                this.dancers[i + 2] = topLeft;
                this.dancers[i + 3] = topRight;
            }
        } else {
            throw new Error('Unsupported number of times: ' + numberOfTimes);
        }
    }

    progress() {
        this.snapshot();
        this.progressFirstCouple();
        this.progressLastCouple();
        // Couples waiting out at the ends stand in their places
        this.dancers.filter(dancer => !dancer.active).forEach(dancer => this.offsets.delete(dancer.id));
    }

    progressFirstCouple() {
        if (this.dancers[0].active) {
            // inactivate the first couple
            const lark = this.dancers[0];
            const robin = this.dancers[1];
            lark.inactivate();
            robin.inactivate();
            // in improper dances, rotate the couple; either way, make them a "1"
            if (this.isImproper()) {
                this.dancers[0] = robin;
                this.dancers[1] = lark;
            }
            lark.couple.coupleNumber = 1;
        } else {
            // activate the first couple
            const robin = this.dancers[0];
            const lark = this.dancers[1];
            lark.activate();
            robin.activate();
        }
    }

    progressLastCouple() {
        if (this.dancers[this.dancers.length - 2].active) {
            // inactivate the last couple
            const lark = this.dancers[this.dancers.length - 2];
            const robin = this.dancers[this.dancers.length - 1];
            lark.inactivate();
            robin.inactivate();
            // in improper dances, rotate the couple; either way, make them a "2"
            if (this.isImproper()) {
                this.dancers[this.dancers.length - 2] = robin;
                this.dancers[this.dancers.length - 1] = lark;
            }
            lark.couple.coupleNumber = 2;
        } else {
            // activate the last couple
            const lark = this.dancers[this.dancers.length - 2];
            const robin = this.dancers[this.dancers.length - 1];
            lark.activate();
            robin.activate();
        }
    }

    /**
     * Capture a snapshot of the current dancer positions and state.
     * This allows for undo functionality.
     */
    snapshot() {
        const snapshot = {
            dancerIds: this.dancers.map(d => d.id),
            dancerStates: new Map(),
            offsets: new Map([...this.offsets].map(([id, offset]) => [id, { ...offset }])),
            started: this.started
        };

        // Store active state and couple number for each dancer
        this.dancers.forEach(dancer => {
            snapshot.dancerStates.set(dancer.id, {
                active: dancer.active,
                coupleNumber: dancer.couple.coupleNumber
            });
        });

        this.snapshots.push(snapshot);
    }

    /**
     * Restore the dancer positions and state from the most recent snapshot.
     * If no snapshots exist, this method does nothing.
     */
    undo() {
        if (this.snapshots.length === 0) {
            return;
        }

        const snapshot = this.snapshots.pop();

        // Restore the dancers array order using the dancerMap
        this.dancers = snapshot.dancerIds.map(id => this.dancerMap.get(id));
        this.offsets = snapshot.offsets;
        this.started = snapshot.started;

        // Restore active state and couple numbers
        snapshot.dancerStates.forEach((state, id) => {
            const dancer = this.dancerMap.get(id);
            if (state.active) {
                dancer.activate();
            } else {
                dancer.inactivate();
            }
            dancer.couple.coupleNumber = state.coupleNumber;
        });
    }

    /**
     * Clear all snapshots. This is useful when restarting a dance from the beginning
     * to avoid keeping unnecessary history.
     */
    clearSnapshots() {
        this.snapshots = [];
    }

    /**
     * Get normalized positions (0-100 range) for all dancers: their places, moved by
     * any offsets of dancers who aren't standing in their places.
     *
     * @returns {import('./positions.js').Position[]} Array of Position objects
     */
    getPositions() {
        const places = this.getPlacePositions();
        return this.dancers.map((dancer, index) => {
            const offset = this.getOffset(dancer);
            return new Position(places[index].x + offset.x, places[index].y + offset.y);
        });
    }

    /**
     * Get normalized positions (0-100 range) of the places in the set, in the order
     * of this.dancers. This maps the current layout to a coordinate system that can
     * be used for animation.
     *
     * Layout: 2 columns, rows centered vertically in dance floor
     * - Left column: x ≈ 33.75 (270/800)
     * - Right column: x ≈ 53.75 (430/800)
     * - Vertical spacing scaled proportionally
     *
     * @returns {import('./positions.js').Position[]} Array of Position objects
     */
    getPlacePositions() {
        const startY = firstRowY(Math.ceil(this.dancers.length / 2));

        // Convert each place to normalized coordinates
        return this.dancers.map((dancer, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);

            const xPixels = LEFT_LINE_X_PX + col * LINE_SPACING_PX;
            const yPixels = startY + row * VERTICAL_SPACING_PX;

            return new Position(
                (xPixels / SVG_WIDTH) * 100,
                (yPixels / SVG_HEIGHT) * 100
            );
        });
    }

    /**
     * Calculate paths for all dancers during a move
     * @param {Object} move - The move object with type, beats, etc.
     * @returns {Promise<Map<string, import('./paths.js').Path>>} Map from dancer ID to Path
     */
    async calculateMovePath(move) {
        // Import calculateMovePaths dynamically to avoid circular dependency
        const { calculateMovePaths } = await import('./pathCalculator.js');
        return calculateMovePaths(move, this);
    }
}
