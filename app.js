import { Set } from './dancers.js';

// Application state
const state = {
    dance: null,
    dancerSet: null,
    currentPartIndex: 0,
    currentMoveIndex: 0,
    isPlaying: false,
    animationId: null
};

// DOM elements
const elements = {
    danceTitle: document.getElementById('dance-title'),
    danceAuthor: document.getElementById('dance-author'),
    danceFormation: document.getElementById('dance-formation'),
    moveList: document.getElementById('move-list'),
    canvas: document.getElementById('dance-canvas'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    prevMoveBtn: document.getElementById('prev-move-btn'),
    nextMoveBtn: document.getElementById('next-move-btn'),
    fileInput: document.getElementById('file-input'),
    loadDanceBtn: document.getElementById('load-dance-btn')
};

// File loading
elements.loadDanceBtn.addEventListener('click', () => {
    elements.fileInput.click();
});

elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                let data = JSON.parse(event.target.result);
                // If data is an array, take the first dance
                if (Array.isArray(data)) {
                    if (data.length === 0) {
                        alert('No dances found in file');
                        return;
                    }
                    data = data[0];
                }
                loadDance(data);
            } catch (error) {
                alert('Error loading dance file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
});

// Load dance data
function loadDance(dance) {
    state.dance = dance;
    state.currentPartIndex = 0;
    state.currentMoveIndex = 0;
    state.isPlaying = false;

    // Create dancer set for improper dances
    if (dance.formation === 'improper') {
        state.dancerSet = new Set(6);
    }

    updateDanceInfo();
    updateMoveList();
    updateVisualization();
    updateControls();
}

// Update dance information display
function updateDanceInfo() {
    if (!state.dance) return;

    elements.danceTitle.textContent = state.dance.title || 'Untitled Dance';
    elements.danceAuthor.textContent = state.dance.author ? `by ${state.dance.author}` : '';
    elements.danceFormation.textContent = state.dance.formation ? `Formation: ${state.dance.formation}` : '';
}

// Update move list display
function updateMoveList() {
    elements.moveList.innerHTML = '';

    if (!state.dance || !state.dance.parts) return;

    let globalMoveIndex = 0;
    state.dance.parts.forEach((part, partIndex) => {
        const partSection = document.createElement('div');
        partSection.className = 'part-section';

        const partTitle = document.createElement('div');
        partTitle.className = 'part-title';
        partTitle.textContent = `${part.name} (${part.beats} beats)`;
        partSection.appendChild(partTitle);

        if (part.moves) {
            part.moves.forEach((move, moveIndex) => {
                const moveItem = document.createElement('li');
                moveItem.className = 'move-item';
                moveItem.dataset.partIndex = partIndex;
                moveItem.dataset.moveIndex = moveIndex;

                const description = document.createElement('span');
                description.className = 'move-description';
                description.textContent = formatMove(move);

                const beats = document.createElement('span');
                beats.className = 'move-beats';
                beats.textContent = `(${move.beats})`;

                moveItem.appendChild(description);
                moveItem.appendChild(beats);

                moveItem.addEventListener('click', () => {
                    state.currentPartIndex = partIndex;
                    state.currentMoveIndex = moveIndex;
                    updateMoveList();
                    updateVisualization();
                });

                if (partIndex === state.currentPartIndex && moveIndex === state.currentMoveIndex) {
                    moveItem.classList.add('current');
                }

                partSection.appendChild(moveItem);
                globalMoveIndex++;
            });
        }

        elements.moveList.appendChild(partSection);
    });
}

// Format move description
function formatMove(move) {
    let description = move.type.replace(/_/g, ' ');

    if (move.who) {
        description += ` (${move.who})`;
    }

    if (move.direction) {
        description += ` ${move.direction}`;
    }

    return description;
}

// Update visualization
function updateVisualization() {
    // Clear canvas
    const svg = elements.canvas;
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }

    // Draw stage area
    drawStage(svg);

    if (!state.dance) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '400');
        text.setAttribute('y', '450');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '18');
        text.setAttribute('fill', '#999');
        text.textContent = 'Load a dance to begin';
        svg.appendChild(text);
        return;
    }

    // Draw dancers
    if (state.dancerSet) {
        drawDancers(svg, state.dancerSet);
    }
}

// Draw stage with caller and musicians
function drawStage(svg) {
    // Stage background
    const stageRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    stageRect.setAttribute('x', '0');
    stageRect.setAttribute('y', '0');
    stageRect.setAttribute('width', '800');
    stageRect.setAttribute('height', '100');
    stageRect.setAttribute('fill', '#e8e8e8');
    stageRect.setAttribute('stroke', '#999');
    stageRect.setAttribute('stroke-width', '1');
    svg.appendChild(stageRect);

    const circleRadius = 12;

    // Caller (left side)
    const callerX = 150;
    const callerY = 50;

    const caller = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    caller.setAttribute('cx', callerX);
    caller.setAttribute('cy', callerY);
    caller.setAttribute('r', circleRadius);
    caller.setAttribute('fill', '#4a4a4a');
    caller.setAttribute('stroke', '#333');
    caller.setAttribute('stroke-width', '2');
    svg.appendChild(caller);

    // Caller label below
    const callerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    callerLabel.setAttribute('x', callerX);
    callerLabel.setAttribute('y', callerY + circleRadius + 14);
    callerLabel.setAttribute('text-anchor', 'middle');
    callerLabel.setAttribute('font-size', '11');
    callerLabel.setAttribute('fill', '#333');
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
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', musician.cx);
        circle.setAttribute('cy', musician.cy);
        circle.setAttribute('r', circleRadius);
        circle.setAttribute('fill', '#666');
        circle.setAttribute('stroke', '#444');
        circle.setAttribute('stroke-width', '1.5');
        svg.appendChild(circle);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', musician.cx);
        label.setAttribute('y', musician.cy + circleRadius + 14);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '11');
        label.setAttribute('fill', '#333');
        label.textContent = musician.label;
        svg.appendChild(label);
    });
}

// Draw dancers from the Set
function drawDancers(svg, dancerSet) {
    const dancers = dancerSet.dancers;

    // Layout parameters
    const svgHeight = 900;
    const stageHeight = 100;
    const danceFloorHeight = svgHeight - stageHeight;

    const numRows = Math.ceil(dancers.length / 2);
    const dancerRadius = 20;
    const verticalSpacing = 120;
    const horizontalSpacing = 100;

    // Calculate total height needed for dancers
    const totalDancerHeight = (numRows - 1) * verticalSpacing + 2 * dancerRadius;

    // Center dancers vertically in the dance floor
    const startY = stageHeight + (danceFloorHeight - totalDancerHeight) / 2 + dancerRadius;
    const startX = 300;

    // Draw dancers in reading order: left to right, top to bottom
    // The Set stores 12 dancers in a 2-column layout (6 rows)
    dancers.forEach((dancer, index) => {
        const col = index % 2;  // 0 or 1
        const row = Math.floor(index / 2);

        const x = startX + col * horizontalSpacing;
        const y = startY + row * verticalSpacing;

        // Draw circle with couple color
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', dancerRadius);
        circle.setAttribute('fill', dancer.couple.color);
        circle.setAttribute('stroke', '#333');
        circle.setAttribute('stroke-width', '2');

        // Make inactive dancers semi-transparent
        if (!dancer.active) {
            circle.setAttribute('opacity', '0.3');
        }

        svg.appendChild(circle);

        // Draw label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', y + 5);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '14');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('fill', 'white');
        label.textContent = dancer.getLabel();

        if (!dancer.active) {
            label.setAttribute('opacity', '0.3');
        }

        svg.appendChild(label);
    });
}

// Control button handlers
elements.playPauseBtn.addEventListener('click', () => {
    state.isPlaying = !state.isPlaying;
    updateControls();

    if (state.isPlaying) {
        startAnimation();
    } else {
        stopAnimation();
    }
});

elements.prevMoveBtn.addEventListener('click', () => {
    goToPreviousMove();
});

elements.nextMoveBtn.addEventListener('click', () => {
    goToNextMove();
});

function goToNextMove() {
    if (!state.dance) return;

    const currentPart = state.dance.parts[state.currentPartIndex];

    if (state.currentMoveIndex < currentPart.moves.length - 1) {
        state.currentMoveIndex++;
    } else if (state.currentPartIndex < state.dance.parts.length - 1) {
        state.currentPartIndex++;
        state.currentMoveIndex = 0;
    } else {
        // Loop back to beginning
        state.currentPartIndex = 0;
        state.currentMoveIndex = 0;
    }

    updateMoveList();
    updateVisualization();
}

function goToPreviousMove() {
    if (!state.dance) return;

    if (state.currentMoveIndex > 0) {
        state.currentMoveIndex--;
    } else if (state.currentPartIndex > 0) {
        state.currentPartIndex--;
        const prevPart = state.dance.parts[state.currentPartIndex];
        state.currentMoveIndex = prevPart.moves.length - 1;
    } else {
        // Go to last move
        state.currentPartIndex = state.dance.parts.length - 1;
        const lastPart = state.dance.parts[state.currentPartIndex];
        state.currentMoveIndex = lastPart.moves.length - 1;
    }

    updateMoveList();
    updateVisualization();
}

function startAnimation() {
    // TODO: Implement animation logic
    console.log('Animation started');
}

function stopAnimation() {
    if (state.animationId) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
    }
    console.log('Animation stopped');
}

function updateControls() {
    elements.playPauseBtn.textContent = state.isPlaying ? 'Pause' : 'Play';
    elements.prevMoveBtn.disabled = !state.dance;
    elements.nextMoveBtn.disabled = !state.dance;
    elements.playPauseBtn.disabled = !state.dance;
}

// Initialize
updateControls();
