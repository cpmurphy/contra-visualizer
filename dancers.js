// Dancer model used to keep dancer identities stable
// even as they move between minor sets or become inactive.

import { Position } from './positions.js';

// Layout of the set on the SVG canvas, in pixels
const SVG_WIDTH = 800;
const SVG_HEIGHT = 900;
const STAGE_HEIGHT = 100;
const START_X = 270;
const HORIZONTAL_SPACING = 160;
const VERTICAL_SPACING = 120;
const DANCER_RADIUS = 20;
// A couple going down or up the center walks this far either side of the middle
const CENTER_LANE_OFFSET_PX = 30;

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
     * In terms of the result, a star left is the same as a circle left.
     * @param {number} numberOfPlaces - The number of places to rotate
     */
    starLeft(numberOfPlaces) {
        this.circleLeft(numberOfPlaces);
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
     * In terms of the result, a star right is the same as a circle right.
     * @param {number} numberOfPlaces - The number of places to rotate
     */
    starRight(numberOfPlaces) {
        this.circleRight(numberOfPlaces);
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
        for (const index of this.placesOf(who)) {
            const dancer = this.dancers[index];
            const middle = START_X + HORIZONTAL_SPACING / 2;
            const laneX = (middle + (index % 2 === 0 ? -1 : 1) * CENTER_LANE_OFFSET_PX) / SVG_WIDTH * 100;
            const offset = this.getOffset(dancer);
            this.offsets.set(dancer.id, {
                x: laneX - places[index].x,
                y: offset.y + distancePx / SVG_HEIGHT * 100
            });
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
        const danceFloorHeight = SVG_HEIGHT - STAGE_HEIGHT;
        const numRows = Math.ceil(this.dancers.length / 2);
        const totalDancerHeight = (numRows - 1) * VERTICAL_SPACING + 2 * DANCER_RADIUS;
        const startY = STAGE_HEIGHT + (danceFloorHeight - totalDancerHeight) / 2 + DANCER_RADIUS;

        // Convert each place to normalized coordinates
        return this.dancers.map((dancer, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);

            const xPixels = START_X + col * HORIZONTAL_SPACING;
            const yPixels = startY + row * VERTICAL_SPACING;

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
