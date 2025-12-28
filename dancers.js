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
    rotateLeft(numberOfPlaces) {
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

    balance() {
    }

    progress() {
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
}
