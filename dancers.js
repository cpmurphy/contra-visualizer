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

/**
 * Create an array of dancers representing the entire set
 * @param {number} coupleCount
 * @returns {{lineup: Array<Dancer>}}
 */
export function createImproperFormation(coupleCount = 6) {
    const lineup = [];
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
            lineup.push(robin);
            lineup.push(lark);
        } else {
            lineup.push(lark);
            lineup.push(robin);
        }
    }
    if (coupleCount % 2 != 0) {
        // rotate the last couple and make them a "2"
        const secondLast = coupleCount * 2 - 2;
        const robin = lineup[secondLast];
        const last = coupleCount * 2 - 1;
        const lark = lineup[last];
        lark.couple.coupleNumber = 2;
        lineup[secondLast] = lark; // on left, facing up
        lineup[last] = robin;      // on right, facing up
    }
    return lineup;
}

/**
 * Rotate the lineup of dancers making couples active/inactive as appropriate
 * @param {{lineup: Array<Dancer>}}
 */
export function progress(lineup) {
    progressFirstCouple(lineup);
    progressLastCouple(lineup);
}

function progressFirstCouple(lineup) {
    if (lineup[0].active) {
        // inactivate the first couple
        const lark = lineup[0];
        const robin = lineup[1];
        lark.inactivate();
        robin.inactivate();
        // rotate the couple, make them a "1"
        lineup[0] = robin;
        lineup[1] = lark;
        lark.couple.coupleNumber = 1;
    } else {
        // activate the first couple
        const robin = lineup[0];
        const lark = lineup[1];
        lark.activate();
        robin.activate();
    }
}

function progressLastCouple(lineup) {
    if (lineup[lineup.length - 2].active) {
        // inactivate the last couple
        const lark = lineup[lineup.length - 2];
        const robin = lineup[lineup.length - 1];
        lark.inactivate();
        robin.inactivate();
        // rotate the couple, make them a "2"
        lineup[lineup.length - 2] = robin;
        lineup[lineup.length - 1] = lark;
        lark.couple.coupleNumber = 2;
    } else {
        // activate the last couple
        const lark = lineup[lineup.length - 2];
        const robin = lineup[lineup.length - 1];
        lark.activate();
        robin.activate();
    }
}
