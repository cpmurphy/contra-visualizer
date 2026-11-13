// Draws on the SVG canvas: the stage across the top (the caller and musicians), and
// on the dance floor below it either the dancers or a message.

import { toPixels } from './positions.js';
import { SVG_WIDTH, SVG_HEIGHT, STAGE_HEIGHT, DANCER_RADIUS_PX } from './layout.js';
import { FACING_UP } from './facing.js';
import { dancerArms } from './arms.js';
import { leans } from './motion.js';

const OUTLINE = '#333';
// Over the couple's color, on the shoulders and sleeves, to set the head and
// hands off from them
const SHADE = 'rgba(0, 0, 0, 0.22)';
const ARM_WIDTH_PX = 6;
const HAND_RADIUS_PX = 4.5;
// How much bigger a dancer looks at the top of a step
const STEP_SCALE = 0.04;
const STANDING = { lift: 0, twist: 0 };

// A dancer from above: shoulders DANCER_RADIUS_PX to either side and this deep
// from front to back, with a head on top, and a nose at the front of it
const SHOULDER_DEPTH_PX = 11;
const HEAD_RADIUS_PX = 13;
const NOSE_RADIUS_PX = 5;

/**
 * Make an SVG element
 * @param {string} name - e.g. "circle"
 * @param {Object<string, string|number>} attributes
 * @returns {SVGElement}
 */
function svgElement(name, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [attribute, value] of Object.entries(attributes)) {
        element.setAttribute(attribute, value);
    }
    return element;
}

/**
 * Draw the dancers, with their arms behind them
 * @param {SVGElement} svg
 * @param {import('./performance.js').DancerView[]} dancers
 * @param {{ids: string[], shape?: string, hand?: string, strength: number}[]} holds - Groups of
 *   dancers holding hands (see AnimationState.getCurrentHolds)
 * @param {Map<string, number>} [facings] - Which way each dancer faces (see
 *   facing.js); anyone left out faces up the hall
 * @param {Map<string, import('./motion.js').Step>} [steps] - How each dancer is
 *   stepping (see motion.js); anyone left out is standing
 */
export function drawScene(svg, dancers, holds = [], facings = new Map(), steps = new Map()) {
    clearToStage(svg);
    const points = dancers.map(dancer => ({ id: dancer.id, point: toPixels(dancer.position, SVG_WIDTH, SVG_HEIGHT) }));
    // The shoulders, where the arms start, turn with each step
    const arms = dancerArms(points.map(({ id, point }) => ({
        id,
        point,
        facing: (facings.get(id) ?? FACING_UP) + (steps.get(id)?.twist ?? 0)
    })), holds);
    // Everyone's arms go under everyone's bodies
    dancers.forEach(dancer => drawArms(svg, dancer, arms.get(dancer.id)));
    drawDancers(svg, dancers, facings, steps, leans(points, holds));
}

/**
 * Draw a message in place of the dancers
 * @param {SVGElement} svg
 * @param {string} message
 */
export function drawMessage(svg, message) {
    clearToStage(svg);
    const text = svgElement('text', {
        x: SVG_WIDTH / 2,
        y: SVG_HEIGHT / 2,
        'text-anchor': 'middle',
        'font-size': '18',
        fill: '#999'
    });
    text.textContent = message;
    svg.appendChild(text);
}

// Clear the canvas, leaving only the stage
function clearToStage(svg) {
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
    drawStage(svg);
}

// Draw stage with caller and musicians
function drawStage(svg) {
    // Stage background
    svg.appendChild(svgElement('rect', {
        x: '0',
        y: '0',
        width: SVG_WIDTH,
        height: STAGE_HEIGHT,
        fill: '#e8e8e8',
        stroke: '#999',
        'stroke-width': '1'
    }));

    const circleRadius = 12;

    // Caller (left side)
    const callerX = 150;
    const callerY = 50;

    svg.appendChild(svgElement('circle', {
        cx: callerX,
        cy: callerY,
        r: circleRadius,
        fill: '#4a4a4a',
        stroke: '#333',
        'stroke-width': '2'
    }));

    // Caller label below
    const callerLabel = svgElement('text', {
        x: callerX,
        y: callerY + circleRadius + 14,
        'text-anchor': 'middle',
        'font-size': '11',
        fill: '#333'
    });
    callerLabel.textContent = 'Caller';
    svg.appendChild(callerLabel);

    // Musicians in a regular crescent (to the right of caller)
    const baseX = 300;
    const spacing = 60;
    const musicians = [
        { cx: baseX, cy: 50, label: 'Musician' },
        { cx: baseX + spacing, cy: 50, label: 'Musician' },
        { cx: baseX + spacing * 2, cy: 50, label: 'Musician' }
    ];

    musicians.forEach((musician) => {
        svg.appendChild(svgElement('circle', {
            cx: musician.cx,
            cy: musician.cy,
            r: circleRadius,
            fill: '#666',
            stroke: '#444',
            'stroke-width': '1.5'
        }));

        const label = svgElement('text', {
            x: musician.cx,
            y: musician.cy + circleRadius + 14,
            'text-anchor': 'middle',
            'font-size': '11',
            fill: '#333'
        });
        label.textContent = musician.label;
        svg.appendChild(label);
    });
}

/**
 * Draw a dancer's arms, in their couple's color: sleeves from the shoulders,
 * which the body is drawn over, to the hands
 * @param {SVGElement} svg
 * @param {import('./performance.js').DancerView} dancer
 * @param {import('./arms.js').Arm[]} arms
 */
function drawArms(svg, dancer, arms) {
    const group = svgElement('g', { opacity: dancerOpacity(dancer) });
    for (const { shoulder, elbow, hand } of arms) {
        const curve = {
            d: `M ${shoulder.x} ${shoulder.y} Q ${elbow.x} ${elbow.y} ${hand.x} ${hand.y}`,
            fill: 'none',
            'stroke-linecap': 'round'
        };
        group.appendChild(svgElement('path', { ...curve, stroke: OUTLINE, 'stroke-width': ARM_WIDTH_PX + 3 }));
        group.appendChild(svgElement('path', { ...curve, stroke: dancer.color, 'stroke-width': ARM_WIDTH_PX }));
        group.appendChild(svgElement('path', { ...curve, stroke: SHADE, 'stroke-width': ARM_WIDTH_PX }));
        group.appendChild(svgElement('circle', {
            cx: hand.x,
            cy: hand.y,
            r: HAND_RADIUS_PX,
            fill: dancer.color,
            stroke: OUTLINE,
            'stroke-width': '1.5'
        }));
    }
    svg.appendChild(group);
}

// Dancers out at the ends of the set, not dancing, are semi-transparent
const dancerOpacity = dancer => (dancer.active ? '1.0' : '0.3');

/**
 * Draw the dancers, as seen from above: shoulders, and a head with a nose to
 * show which way they face. The body is drawn facing right and turned to face
 * their way; the label stays upright
 * @param {SVGElement} svg
 * @param {import('./performance.js').DancerView[]} dancers
 * @param {Map<string, number>} facings - Which way each faces (see facing.js)
 * @param {Map<string, import('./motion.js').Step>} steps - How each is stepping
 * @param {Map<string, {x: number, y: number}>} leaning - How far each one's head leans
 */
function drawDancers(svg, dancers, facings, steps, leaning) {
    dancers.forEach(dancer => {
        // Convert normalized position to pixel coordinates
        const { x, y } = toPixels(dancer.position, SVG_WIDTH, SVG_HEIGHT);
        const degrees = angle => angle * 180 / Math.PI;
        const facing = facings.get(dancer.id) ?? FACING_UP;
        const { lift, twist } = steps.get(dancer.id) ?? STANDING;
        const lean = leaning.get(dancer.id) ?? { x: 0, y: 0 };
        // Up between footfalls is nearer to us, so a little bigger
        const scale = 1 + STEP_SCALE * lift;

        const figure = svgElement('g', { opacity: dancerOpacity(dancer) });

        // Shoulders in the couple's color, shaded to set the head off from them,
        // turning with each step
        const body = svgElement('g', {
            transform: `translate(${x} ${y}) rotate(${degrees(facing + twist)}) scale(${scale})`
        });
        const shoulders = { cx: 0, cy: 0, rx: SHOULDER_DEPTH_PX, ry: DANCER_RADIUS_PX };
        body.appendChild(svgElement('ellipse', { ...shoulders, fill: dancer.color }));
        body.appendChild(svgElement('ellipse', {
            ...shoulders,
            fill: SHADE,
            stroke: OUTLINE,
            'stroke-width': '2'
        }));
        figure.appendChild(body);

        // The head looks the way they face, and leans; the nose pokes out from
        // under the front of it
        const head = svgElement('g', {
            transform: `translate(${x + lean.x} ${y + lean.y}) rotate(${degrees(facing)}) scale(${scale})`
        });
        const skin = { fill: dancer.color, stroke: OUTLINE, 'stroke-width': '2' };
        head.appendChild(svgElement('circle', { cx: HEAD_RADIUS_PX + 1, cy: 0, r: NOSE_RADIUS_PX, fill: OUTLINE }));
        head.appendChild(svgElement('circle', { cx: 0, cy: 0, r: HEAD_RADIUS_PX, ...skin }));
        figure.appendChild(head);

        const label = svgElement('text', {
            x: x + lean.x,
            y: y + lean.y + 4,
            'text-anchor': 'middle',
            'font-size': '12',
            'font-weight': 'bold',
            fill: 'white'
        });
        label.textContent = dancer.label;
        figure.appendChild(label);

        svg.appendChild(figure);
    });
}
