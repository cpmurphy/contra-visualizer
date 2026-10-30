// Draws on the SVG canvas: the stage across the top (the caller and musicians), and
// on the dance floor below it either the dancers or a message.

import { toPixels } from './positions.js';
import { SVG_WIDTH, SVG_HEIGHT, STAGE_HEIGHT, DANCER_RADIUS_PX } from './layout.js';

// In a swing, how far to either side of the two swinging their arms join, in
// pixels: far enough out from behind the dancers to show two arms from each
const SWING_HOLD_SPREAD = 24;

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
 * Draw the dancers, with the arms of any holding hands behind them
 * @param {SVGElement} svg
 * @param {import('./performance.js').DancerView[]} dancers
 * @param {{ids: string[], shape?: string, strength: number}[]} holds - Groups of
 *   dancers holding hands (see AnimationState.getCurrentHolds)
 */
export function drawScene(svg, dancers, holds = []) {
    clearToStage(svg);
    drawHolds(svg, holds, new Map(dancers.map(dancer => [dancer.id, dancer.position])));
    drawDancers(svg, dancers);
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
 * Draw arms reaching from dancers to their joined hands: for a line or a ring
 * (a line closed into a circle), from each to hands joined half way to those
 * beside them; for a swing, from each of the two to where their arms join on
 * either side of them; otherwise from each to hands joined in the middle of them
 * all, as in a star
 * @param {SVGElement} svg
 * @param {{ids: string[], shape?: string, strength: number}[]} holds
 * @param {Map<string, import('./positions.js').Position>} positions
 */
function drawHolds(svg, holds, positions) {
    for (const hold of holds) {
        const points = hold.ids.map(id => toPixels(positions.get(id), SVG_WIDTH, SVG_HEIGHT));
        const group = svgElement('g', { opacity: hold.strength });
        if (hold.shape === 'swing') {
            const [a, b] = points;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const apart = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            // Across the line between them, to either side
            const across = { x: -(b.y - a.y) / apart, y: (b.x - a.x) / apart };
            for (const side of [1, -1]) {
                drawJoinedHands(group, [a, b], {
                    x: mid.x + side * SWING_HOLD_SPREAD * across.x,
                    y: mid.y + side * SWING_HOLD_SPREAD * across.y
                });
            }
        } else if (hold.shape === 'line' || hold.shape === 'ring') {
            const neighbors = points.slice(1).map((point, i) => [points[i], point]);
            if (hold.shape === 'ring') neighbors.push([points[points.length - 1], points[0]]);
            for (const [a, b] of neighbors) {
                drawJoinedHands(group, [a, b], { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }
        } else {
            const hub = {
                x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
                y: points.reduce((sum, p) => sum + p.y, 0) / points.length
            };
            drawJoinedHands(group, points, hub);
        }
        svg.appendChild(group);
    }
}

/**
 * Draw arms from each of the points to hands joined at one place
 * @param {SVGElement} group
 * @param {{x: number, y: number}[]} points - Dancers' positions in pixels
 * @param {{x: number, y: number}} handsAt - Where their hands join, in pixels
 */
function drawJoinedHands(group, points, handsAt) {
    for (const point of points) {
        group.appendChild(svgElement('line', {
            x1: point.x,
            y1: point.y,
            x2: handsAt.x,
            y2: handsAt.y,
            stroke: '#555',
            'stroke-width': '5',
            'stroke-linecap': 'round'
        }));
    }
    group.appendChild(svgElement('circle', {
        cx: handsAt.x,
        cy: handsAt.y,
        r: 6,
        fill: '#555'
    }));
}

/**
 * Draw the dancers
 * @param {SVGElement} svg
 * @param {import('./performance.js').DancerView[]} dancers
 */
function drawDancers(svg, dancers) {
    dancers.forEach(dancer => {
        // Convert normalized position to pixel coordinates
        const { x, y } = toPixels(dancer.position, SVG_WIDTH, SVG_HEIGHT);

        // Make inactive dancers semi-transparent
        const opacity = dancer.active ? '1.0' : '0.3';

        // Draw circle with couple color
        const circle = svgElement('circle', {
            cx: x,
            cy: y,
            r: DANCER_RADIUS_PX,
            fill: dancer.color,
            stroke: '#333',
            'stroke-width': '2',
            opacity
        });

        // Draw label
        const label = svgElement('text', {
            x,
            y: y + 5,
            'text-anchor': 'middle',
            'font-size': '14',
            'font-weight': 'bold',
            fill: 'white',
            opacity
        });
        label.textContent = dancer.label;

        // Add CSS transition for smooth opacity changes
        for (const shape of [circle, label]) {
            shape.style.transition = 'opacity 0.3s ease-in-out';
            svg.appendChild(shape);
        }
    });
}
