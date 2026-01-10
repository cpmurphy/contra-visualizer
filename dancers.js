// Dancer model used to keep dancer identities stable
// even as they move between minor sets or become inactive.

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
    constructor(coupleCount = 6) {
        this.dancers = [];
        this.snapshots = [];
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

            if (i % 2 == 0) {
                this.dancers.push(robin);
                this.dancers.push(lark);
            } else {
                this.dancers.push(lark);
                this.dancers.push(robin);
            }
        }
        if (coupleCount % 2 != 0) {
            // rotate the last couple and make them a "2"
            const secondLast = coupleCount * 2 - 2;
            const robin = this.dancers[secondLast];
            const last = coupleCount * 2 - 1;
            const lark = this.dancers[last];
            lark.couple.coupleNumber = 2;
            this.dancers[secondLast] = lark; // on left, facing up
            this.dancers[last] = robin;      // on right, facing up
        }
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
            // rotate the couple, make them a "1"
            this.dancers[0] = robin;
            this.dancers[1] = lark;
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
            // rotate the couple, make them a "2"
            this.dancers[this.dancers.length - 2] = robin;
            this.dancers[this.dancers.length - 1] = lark;
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
            dancerStates: new Map()
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
}
