// The figures we know how to dance, each described in one place: the moves it
// covers (their type and who dances them), the formations we've worked it out for,
// what it does to the set (who ends up where, using the Set's methods in
// dancers.js), and the paths the dancers take (from the other modules in
// figures/). moves.js and pathCalculator.js both look figures up here, so to
// animate a new figure, add an entry below.

import { createDoSiDoPaths, createCircularPaths, createStarPaths, addSwingPairPaths, createSwingPaths, createAllemandePaths } from './turns.js';
import { createHalfHeyPaths, createRightAndLeftThroughPaths, createRobinsChainPaths, createChainPaths } from './crossings.js';
import { createContraCornersPaths, createReturnUpOutsidePaths, createCenterTravelPaths, createTurnAlonePaths, createCastOffPaths } from './couples.js';
import { createBalancePaths, addBalancePairPaths, createLongLinesPaths, createHallLinePaths, createCoupleTurnPaths, createBendTheLinePaths } from './forwardAndBack.js';
import { createPartnerPairPaths, createCouplePairPaths } from './shared.js';

// How far down the hall a couple goes down the center, and down the outside
const DOWN_THE_CENTER_PX = 120;
const DOWN_THE_OUTSIDE_PX = 180;
// How far a line of four goes down the hall: not as far as a couple alone, so the
// lowest line stays clear of a couple waiting out at the bottom
const DOWN_THE_HALL_PX = 100;

// The ways dances say who dances a move, and what we take each to mean
const WHO_ALIASES = {
    neighbor: 'neighbors',
    neighbors: 'neighbors',
    'new neighbor': 'neighbors',
    'new neighbors': 'neighbors',
    partner: 'partners',
    partners: 'partners',
    robin: 'robins',
    robins: 'robins',
    lark: 'larks',
    larks: 'larks',
    shadow: 'shadows',
    shadows: 'shadows'
};

const COUPLES = ['ones', 'twos'];
// Moves that don't say who dance them with their neighbors, or everyone together
const NEIGHBORS = [null, 'neighbors'];
const EVERYONE = [null, 'all'];

/**
 * Who dances a move, in the words we use for them here: 'neighbors', 'partners',
 * 'robins', 'larks', 'shadows', 'ones', 'twos', 'all', or null if the move doesn't say
 * @param {Object} move
 * @returns {string|null}
 */
export function whoDances(move) {
    if (move.who == null) return null;
    const who = move.who.toLowerCase();
    return WHO_ALIASES[who] ?? who;
}

/**
 * A figure the dancers can dance:
 * @typedef {Object} Figure
 * @property {string|RegExp} type - The move types it covers, in lowercase; a pattern's
 *   groups are passed on as `match`
 * @property {Array<string|null>} [who] - Who can dance it (see whoDances); anyone, if
 *   not given
 * @property {string[]} [formations] - The formations it's worked out for; all, if not
 *   given
 * @property {boolean} [endsInPlaces] - Whether everyone ends in their places, rather
 *   than wherever a couple dancing on their own left them
 * @property {boolean} [fromLeftDiagonal] - In Becket formation, whether it can be
 *   danced as the progression, with the couple on the left diagonal: its paths can
 *   start from where the dancers stood before sliding left (see Set.slideLeft)
 * @property {(set: import('../dancers.js').Set, step: FigureStep) => void} execute -
 *   Make the changes it makes to the set
 * @property {(step: FigureStep & FigurePaths) => void} paths - Add every dancer's
 *   path to step.paths (and any holds, as paths.holds)
 */

/**
 * @typedef {Object} FigureStep
 * @property {Object} move
 * @property {string|null} who - Who dances it (see whoDances)
 * @property {string[]} match - The move's type matched against the figure's
 */

/**
 * @typedef {Object} FigurePaths
 * @property {import('../dancers.js').Set} set - The set the figure is danced in
 * @property {Map<string, import('../positions.js').Position>} start - Where each
 *   dancer starts
 * @property {Map<string, import('../positions.js').Position>} end - Where each ends
 * @property {Map<string, import('../paths.js').Path>} paths
 * @property {number} beats
 */

/** @type {Figure[]} The first that covers a move is the one danced */
const FIGURES = [
    // Rotations and long lines don't depend on who is where
    {
        type: /circle (left|right) (\d+)/,
        endsInPlaces: true,
        execute: (set, { match }) => match[1] === 'left' ? set.circleLeft(Number(match[2])) : set.circleRight(Number(match[2])),
        // Circles: arc paths around the middle of each minor set
        paths: ({ set, start, paths, beats, match }) =>
            createCircularPaths(set, start, paths, beats, Number(match[2]), match[1] === 'right')
    },
    {
        type: /star (left|right) (\d+)/,
        endsInPlaces: true,
        execute: (set, { match }) => match[1] === 'left' ? set.starLeft(Number(match[2])) : set.starRight(Number(match[2])),
        // The four step in and turn close around the middle of the minor set
        paths: ({ set, start, end, paths, beats, match }) =>
            createStarPaths(set, start, end, paths, beats, Number(match[2]), match[1] === 'right')
    },
    {
        type: /long lines/,
        endsInPlaces: true,
        execute: set => set.longLines(),
        // Two lines approach each other and retreat
        paths: ({ set, start, paths, beats }) => createLongLinesPaths(set, start, paths, beats)
    },
    {
        type: 'turn alone',
        who: EVERYONE,
        // Everyone ends where they started
        execute: () => {},
        paths: ({ set, start, paths, beats }) => createTurnAlonePaths(set, set.minorSetPlaces(), start, paths, beats, true)
    },

    // Figures for one couple ('ones' or 'twos') to dance, in any formation
    {
        type: 'down the center',
        who: COUPLES,
        execute: (set, { who }) => set.downTheCenter(who, DOWN_THE_CENTER_PX),
        paths: ({ set, start, end, paths, beats }) => createCenterTravelPaths(set, start, end, paths, beats)
    },
    {
        type: 'up the center',
        who: COUPLES,
        execute: (set, { who }) => set.upTheCenter(who, DOWN_THE_CENTER_PX),
        paths: ({ set, start, end, paths, beats }) => createCenterTravelPaths(set, start, end, paths, beats)
    },
    {
        type: 'down the outside',
        who: COUPLES,
        execute: (set, { who }) => set.downTheOutside(who, DOWN_THE_OUTSIDE_PX),
        paths: ({ set, start, end, paths, beats }) => createCenterTravelPaths(set, start, end, paths, beats)
    },
    {
        type: 'up the outside',
        who: COUPLES,
        execute: (set, { who }) => set.upTheOutside(who),
        paths: ({ set, start, end, paths, beats }) => createReturnUpOutsidePaths(set, start, end, paths, beats)
    },
    {
        type: 'turn contra corners',
        who: COUPLES,
        execute: (set, { who }) => set.contraCorners(who),
        paths: ({ set, start, end, paths, beats, who }) =>
            createContraCornersPaths(set, set.placesOf(who), start, end, paths, beats)
    },
    {
        type: 'turn alone',
        who: COUPLES,
        // Everyone ends where they started
        execute: () => {},
        paths: ({ set, start, paths, beats, who }) => createTurnAlonePaths(set, set.placesOf(who), start, paths, beats)
    },
    {
        type: 'cast off',
        who: COUPLES,
        execute: (set, { who }) => set.castOff(who),
        paths: ({ set, start, end, paths, beats, who }) =>
            createCastOffPaths(set, set.placesOf(who), start, end, paths, beats)
    },
    {
        type: 'balance',
        who: COUPLES,
        execute: () => {},
        // Partners in the couple balance towards each other
        paths: ({ set, start, paths, beats, who }) =>
            createCouplePairPaths(set, who, start, paths, beats, (lark, robin) =>
                addBalancePairPaths(lark, robin, start, paths, beats))
    },
    {
        type: 'swing',
        who: COUPLES,
        execute: (set, { move, who }) => set.swingInCenter(who, move.facing || 'down'),
        // Partners in the couple swing in the middle of the set
        paths: ({ set, start, end, paths, beats, who }) =>
            createCouplePairPaths(set, who, start, paths, beats, (lark, robin) =>
                addSwingPairPaths(lark, robin, start, end, paths, beats))
    },

    // Partners balance towards each other, wherever they are in the minor set
    {
        type: 'balance',
        who: ['partners'],
        execute: () => {},
        paths: ({ set, start, paths, beats }) =>
            createPartnerPairPaths(set, start, paths, beats, (lark, robin) =>
                addBalancePairPaths(lark, robin, start, paths, beats))
    },

    {
        type: 'right and left through',
        who: ['neighbors', 'partners'],
        endsInPlaces: true,
        fromLeftDiagonal: true,
        execute: set => set.rightAndLeftThrough(),
        paths: ({ set, start, end, paths, beats }) => createRightAndLeftThroughPaths(set, start, end, paths, beats)
    },

    // The rest are worked out for improper minor sets, some for Becket formation too
    {
        type: 'balance',
        who: NEIGHBORS,
        formations: ['improper'],
        endsInPlaces: true,
        execute: set => set.balance(),
        // Neighbor pairs approach each other vertically and retreat
        paths: ({ set, start, paths, beats }) => createBalancePaths(set, start, paths, beats)
    },
    {
        type: 'swing',
        who: ['neighbors'],
        formations: ['improper'],
        endsInPlaces: true,
        execute: (set, { move }) => {
            set.swing('neighbor');
            // Facing up or down the hall, they end in a line of four
            if (move.facing) set.lineOfFour(move.facing);
        },
        paths: ({ set, start, end, paths, beats }) => createSwingPaths(set, start, end, paths, beats, 'neighbor')
    },
    {
        type: 'swing',
        who: ['partners'],
        formations: ['improper', 'becket'],
        endsInPlaces: true,
        execute: set => set.swing('partner'),
        paths: ({ set, start, end, paths, beats }) => createSwingPaths(set, start, end, paths, beats, 'partner')
    },
    {
        type: /chain/,
        who: ['robins'],
        formations: ['improper', 'becket'],
        endsInPlaces: true,
        execute: set => set.chainRobins(),
        // Robins pull by in the middle, then courtesy turn with the lark on the far side
        paths: ({ set, start, end, paths, beats }) => createRobinsChainPaths(set, start, end, paths, beats)
    },
    {
        type: /chain/,
        who: ['larks'],
        formations: ['improper'],
        endsInPlaces: true,
        execute: set => set.chainLarks(),
        // Dancers cross with arced paths
        paths: ({ set, start, end, paths, beats }) => createChainPaths(set, start, end, paths, beats)
    },
    {
        type: /^(do-si-do|dosido)$/,
        who: NEIGHBORS,
        formations: ['improper'],
        endsInPlaces: true,
        execute: set => set.doSiDo(1.0),
        // Neighbor pairs trace a wide counter-clockwise circle around their shared center
        paths: ({ set, start, paths, beats }) => createDoSiDoPaths(set, start, paths, beats)
    },
    {
        type: 'half hey',
        who: EVERYONE,
        formations: ['improper'],
        endsInPlaces: true,
        execute: set => set.halfHey(),
        paths: ({ set, start, end, paths, beats }) => createHalfHeyPaths(set, start, end, paths, beats)
    },
    {
        type: 'down the hall',
        who: EVERYONE,
        formations: ['improper'],
        execute: set => set.downTheHall(DOWN_THE_HALL_PX),
        paths: ({ set, start, end, paths, beats }) => createHallLinePaths(set, start, end, paths, beats)
    },
    {
        type: 'turn as couples',
        who: ['neighbors'],
        formations: ['improper'],
        execute: set => set.lineOfFour('up'),
        paths: ({ set, start, end, paths, beats }) => createCoupleTurnPaths(set, start, end, paths, beats)
    },
    {
        type: 'up the hall',
        who: EVERYONE,
        formations: ['improper'],
        execute: set => set.upTheHall(DOWN_THE_HALL_PX),
        paths: ({ set, start, end, paths, beats }) => createHallLinePaths(set, start, end, paths, beats)
    },
    {
        type: 'bend the line',
        who: EVERYONE,
        formations: ['improper'],
        endsInPlaces: true,
        // Each couple ends on their side of the set, in their places
        execute: () => {},
        paths: ({ set, start, end, paths, beats }) => createBendTheLinePaths(set, start, end, paths, beats)
    },
    {
        // Once around
        type: /^allemande (left|right)(?: once| 1)?$/,
        who: ['shadows'],
        formations: ['becket'],
        endsInPlaces: true,
        execute: set => set.shadowAllemande(1),
        paths: ({ set, start, end, paths, beats, match }) =>
            createAllemandePaths(set, set.shadowPairs().map(pair => pair.map(index => set.dancers[index])),
                start, end, paths, beats, 1, match[1] === 'right')
    }
];

/**
 * The figure a move is, and how it's danced, if we know how to dance it in the set
 * @param {Object} move
 * @param {import('../dancers.js').Set} dancerSet
 * @returns {(Figure & {step: FigureStep})|null}
 */
export function findFigure(move, dancerSet) {
    const type = move.type.toLowerCase();
    const who = whoDances(move);
    for (const figure of FIGURES) {
        const match = typeof figure.type === 'string'
            ? (type === figure.type ? [type] : null)
            : type.match(figure.type);
        if (!match) continue;
        if (figure.who && !figure.who.includes(who)) continue;
        if (figure.formations && !figure.formations.includes(dancerSet.formation)) continue;
        if (dancerSet.isBecket() && move.progression && !figure.fromLeftDiagonal) continue;
        return { ...figure, step: { move, who, match } };
    }
    return null;
}
