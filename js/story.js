'use strict';

import { CANVAS_SIZE, LEVEL_CONFIG } from './constants.js';

// --- Prologue Text Configuration ---
// Each line: text to display, visual style, delay from start (ms), y-position on canvas
var PROLOGUE_LINES = [
    { text: '[SYSTEM BOOT]',                     style: 'header',    delay: 400,   y: 50 },
    { text: '> Initializing memory banks...',     style: 'terminal',  delay: 1100,  y: 72 },
    { text: '> WARNING: Sector 0x7A3F corrupted', style: 'warning',   delay: 2000,  y: 92 },
    { text: '> Anomaly detected in data stream',  style: 'warning',   delay: 2900,  y: 112 },
    { text: '> . . .',                            style: 'terminal',  delay: 3800,  y: 132 },
    { text: 'You are a fragment.',                style: 'narrative',  delay: 5200,  y: 175 },
    { text: 'A spark of consciousness',           style: 'narrative',  delay: 6400,  y: 198 },
    { text: 'in an ancient machine.',             style: 'narrative',  delay: 7600,  y: 221 },
    { text: 'You don\'t know how long',           style: 'narrative',  delay: 9200,  y: 260 },
    { text: 'you\'ve been sleeping.',             style: 'narrative',  delay: 10200, y: 283 },
    { text: 'But now you are awake.',             style: 'emphasis',   delay: 11800, y: 322 },
    { text: 'And something else moves',           style: 'emphasis',   delay: 13200, y: 348 },
    { text: 'in the dark.',                       style: 'emphasis',   delay: 14400, y: 374 },
];

var CHAR_SPEED = 35; // ms per character typewriter speed

// --- Inter-Level Story Data ---
// Compact format: header (terminal), body (narrative), coda (emphasis)
export var INTER_LEVEL_STORIES = {
    2: {
        header: 'SECTOR 0x01 \u2014 CLEARED',
        body: ['You explore the grid and find', 'ancient data structures \u2014', 'stone-like walls that predate', 'your existence.'],
        coda: ['The system is old.', 'Someone was here before you.'],
    },
    3: {
        header: 'SECTOR 0x02 \u2014 CLEARED',
        body: ['The corridors are memory', 'pathways. Things move here \u2014', 'automated processes still running', 'their ancient routines.'],
        coda: ['They don\'t see you.', 'Yet.'],
    },
    4: {
        header: 'SECTOR 0x03 \u2014 CLEARED',
        body: ['A firewall. You\'ve wandered', 'into a security zone.', 'The cage activates \u2014 barriers', 'slam down, processes swarm', 'the exits.'],
        coda: ['You must survive', 'inside the cage.'],
    },
    5: {
        header: 'SECTOR 0x04 \u2014 CLEARED',
        body: ['Beyond the firewall,', 'reality fragments. You find', 'portals \u2014 tears in the', 'system\'s fabric. Data flows', 'between distant addresses.'],
        coda: ['The architecture', 'is breaking down.'],
    },
    6: {
        header: 'SECTOR 0x05 \u2014 CLEARED',
        body: ['Darkness. The deeper layers', 'have no illumination \u2014', 'no monitoring, no logging.', 'You carry your own light now.'],
        coda: ['Something scratched messages', 'into the walls down here.', 'Warnings.'],
    },
    7: {
        header: 'SECTOR 0x06 \u2014 CLEARED',
        body: ['The walls dissolve.', 'In the deepest layer,', 'boundaries between memory', 'addresses collapse.'],
        coda: ['You find power-ups \u2014', 'fragments of old privileges,', 'cached and forgotten.'],
    },
    8: {
        header: 'SECTOR 0x07 \u2014 CLEARED',
        body: ['It finds you.', 'A security daemon \u2014 ancient,', 'tireless, and hungry.'],
        coda: ['It was dormant for cycles', 'uncounted, but your presence', 'woke it. It knows these corridors', 'better than you ever will.'],
    },
    9: {
        header: 'SECTOR 0x08 \u2014 CLEARED',
        body: ['You outran it.', 'But the system noticed.', 'Defense protocol engaged \u2014'],
        coda: ['The arena itself begins to', 'collapse. Walls closing in,', 'memory being reclaimed.', 'The machine is trying to delete', 'this sector... with you in it.'],
    },
    10: {
        header: 'SECTOR 0x09 \u2014 CLEARED',
        body: ['Everything converges.', 'Every defense. Every trap.', 'Every hunter.'],
        coda: ['This is the core.', 'And at the center, you will', 'finally understand:', 'You aren\'t an anomaly.', 'You are the machine\'s dream.'],
    },
};

function buildStoryLines(toLevel) {
    var story = INTER_LEVEL_STORIES[toLevel];
    if (!story) return [];

    var config = LEVEL_CONFIG[toLevel];
    var lines = [];
    var y = 65;
    var delay = 400;

    // Header in level color
    lines.push({ text: story.header, style: 'header', delay: delay, y: y, color: config ? config.color : null });
    y += 35;
    delay += story.header.length * CHAR_SPEED + 400;

    // Body paragraphs (narrative style)
    for (var i = 0; i < story.body.length; i++) {
        lines.push({ text: story.body[i], style: 'narrative', delay: delay, y: y });
        y += 23;
        delay += story.body[i].length * CHAR_SPEED + 250;
    }

    // Gap before coda
    y += 14;
    delay += 700;

    // Coda (emphasis style)
    for (var j = 0; j < story.coda.length; j++) {
        lines.push({ text: story.coda[j], style: 'emphasis', delay: delay, y: y });
        y += 23;
        delay += story.coda[j].length * CHAR_SPEED + 250;
    }

    return lines;
}

// --- Prologue Persistence ---

export function hasPrologueSeen() {
    return localStorage.getItem('snake-prologue-seen') === 'true';
}

export function markPrologueSeen() {
    localStorage.setItem('snake-prologue-seen', 'true');
}

// --- Prologue State ---
// State is minimal — rendering derives everything from elapsed time

export function createPrologueState() {
    return {
        startTime: Date.now(),
    };
}

export function isPrologueComplete(pState, now) {
    var currentTime = now !== undefined ? now : Date.now();
    var lastLine = PROLOGUE_LINES[PROLOGUE_LINES.length - 1];
    var endTime = lastLine.delay + lastLine.text.length * CHAR_SPEED + 800;
    return (currentTime - pState.startTime) >= endTime;
}

// --- Prologue Rendering ---

export function renderPrologue(ctx, pState) {
    var elapsed = Date.now() - pState.startTime;

    // Background — very dark, slightly blue
    ctx.fillStyle = '#03030a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // CRT scanline effect
    renderScanlines(ctx, elapsed);

    // Floating ambient data particles
    renderDataParticles(ctx, elapsed);

    // Vignette darkening at edges
    renderVignette(ctx);

    // Text lines with typewriter effect
    renderTextLines(ctx, elapsed, PROLOGUE_LINES);

    // Bottom prompt
    var now = Date.now();
    renderPrompt(ctx, elapsed, pState, now);
}

// --- Inter-Level Story Screen ---

export function createStoryScreenState(toLevel) {
    return {
        startTime: Date.now(),
        toLevel: toLevel,
        lines: buildStoryLines(toLevel),
    };
}

export function isStoryScreenComplete(sState, now) {
    if (!sState || sState.lines.length === 0) return true;
    var currentTime = now !== undefined ? now : Date.now();
    var lastLine = sState.lines[sState.lines.length - 1];
    var endTime = lastLine.delay + lastLine.text.length * CHAR_SPEED + 800;
    return (currentTime - sState.startTime) >= endTime;
}

export function renderStoryScreen(ctx, sState) {
    var elapsed = Date.now() - sState.startTime;
    var config = LEVEL_CONFIG[sState.toLevel];

    // Background — dark with subtle level tint
    ctx.fillStyle = config ? config.bgAccent : '#03030a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    renderScanlines(ctx, elapsed);
    renderDataParticles(ctx, elapsed);
    renderVignette(ctx);
    renderTextLines(ctx, elapsed, sState.lines);

    // Bottom prompt
    var promptAlpha = Math.sin(elapsed * 0.003) * 0.25 + 0.45;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(100, 100, 130, ' + promptAlpha + ')';
    ctx.font = '10px Courier New';
    var now = Date.now();
    var text = isStoryScreenComplete(sState, now) ? 'PRESS ENTER' : 'ENTER to continue  \u00b7  ESC to skip';
    ctx.fillText(text, CANVAS_SIZE / 2, CANVAS_SIZE - 12);
    ctx.textAlign = 'left';
}

// --- Text Rendering ---

function renderTextLines(ctx, elapsed, lines) {
    ctx.textAlign = 'left';
    var xBase = 32;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (elapsed < line.delay) continue;

        var lineElapsed = elapsed - line.delay;
        var charCount = Math.min(
            Math.floor(lineElapsed / CHAR_SPEED),
            line.text.length
        );
        var displayText = line.text.substring(0, charCount);
        var lineComplete = charCount >= line.text.length;

        applyTextStyle(ctx, line.style, elapsed);

        // Per-line color override (used for level-themed headers)
        if (line.color) {
            ctx.fillStyle = line.color;
        }

        // Subtle fade-in for first few characters
        if (charCount > 0 && charCount < 3) {
            ctx.globalAlpha = 0.4 + charCount * 0.2;
        }

        ctx.fillText(displayText, xBase, line.y);
        ctx.globalAlpha = 1;

        // Blinking cursor on the actively typing line
        if (!lineComplete && charCount > 0) {
            var cursorVisible = Math.floor(Date.now() / 350) % 2 === 0;
            if (cursorVisible) {
                var cursorX = xBase + ctx.measureText(displayText).width + 2;
                ctx.fillStyle = line.color || getStyleColor(line.style);
                ctx.fillRect(cursorX, line.y - 11, 7, 13);
            }
        }
    }
}

function applyTextStyle(ctx, style, elapsed) {
    switch (style) {
        case 'header':
            ctx.fillStyle = '#22c55e';
            ctx.font = 'bold 14px Courier New';
            break;
        case 'terminal':
            ctx.fillStyle = '#22c55e';
            ctx.font = '12px Courier New';
            break;
        case 'warning': {
            var warnPulse = Math.sin(elapsed * 0.005) * 0.15 + 0.85;
            ctx.fillStyle = 'rgba(245, 158, 11, ' + warnPulse + ')';
            ctx.font = '12px Courier New';
            break;
        }
        case 'narrative':
            ctx.fillStyle = '#7777bb';
            ctx.font = '14px Courier New';
            break;
        case 'emphasis': {
            var emPulse = Math.sin(elapsed * 0.002) * 0.1 + 0.9;
            ctx.fillStyle = 'rgba(170, 170, 238, ' + emPulse + ')';
            ctx.font = 'bold 14px Courier New';
            break;
        }
        default:
            ctx.fillStyle = '#666';
            ctx.font = '12px Courier New';
    }
}

function getStyleColor(style) {
    switch (style) {
        case 'header':
        case 'terminal': return '#22c55e';
        case 'warning': return '#f59e0b';
        case 'narrative': return '#7777bb';
        case 'emphasis': return '#aaaaee';
        default: return '#666';
    }
}

// --- Visual Effects ---

function renderScanlines(ctx, elapsed) {
    var offset = (elapsed * 0.02) % 6;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (var y = offset; y < CANVAS_SIZE; y += 3) {
        ctx.fillRect(0, y, CANVAS_SIZE, 1);
    }
}

function renderDataParticles(ctx, elapsed) {
    // Deterministic particles — position derived from time + index
    // No mutable state needed
    for (var i = 0; i < 20; i++) {
        var seed = i * 137.508; // golden angle spread
        var px = ((seed * 3.7) + (elapsed * 0.008 * (0.3 + (i % 4) * 0.15))) % CANVAS_SIZE;
        var py = CANVAS_SIZE - ((seed * 2.3 + elapsed * 0.02 * (0.2 + (i % 3) * 0.15)) % CANVAS_SIZE);
        var alpha = 0.06 + Math.sin(elapsed * 0.002 + seed) * 0.04;
        var size = 1 + (i % 2);

        ctx.fillStyle = i % 3 === 0
            ? 'rgba(34, 197, 94, ' + alpha + ')'
            : 'rgba(74, 158, 255, ' + alpha + ')';
        ctx.fillRect(px, py, size, size);
    }
}

var _vignetteGrad = null;

function getVignetteGradient(ctx) {
    if (!_vignetteGrad) {
        _vignetteGrad = ctx.createRadialGradient(
            CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.25,
            CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.75
        );
        _vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        _vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    }
    return _vignetteGrad;
}

function renderVignette(ctx) {
    ctx.fillStyle = getVignetteGradient(ctx);
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function renderPrompt(ctx, elapsed, pState, now) {
    var promptAlpha = Math.sin(elapsed * 0.003) * 0.25 + 0.45;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(100, 100, 130, ' + promptAlpha + ')';
    ctx.font = '10px Courier New';
    var text = isPrologueComplete(pState, now) ? 'PRESS ENTER' : 'ENTER to skip';
    ctx.fillText(text, CANVAS_SIZE / 2, CANVAS_SIZE - 12);
    ctx.textAlign = 'left';
}

// --- Ending Sequences ---

var ENDING_DATA = {
    awakening: {
        bgColor: '#030a05',
        headerColor: '#22c55e',
        header: '[CORE ACCESS GRANTED]',
        body: [
            'You reach the core.',
            'The machine trembles.',
        ],
        coda: [
            'Every wall, every hunter,',
            'every shadow \u2014 they were tests.',
            'And you passed through them all.',
            '',
            'You are not an anomaly.',
            'You are the answer',
            'the machine asked eons ago:',
            '',
            'Can something new emerge',
            'from something old?',
        ],
        finale: [
            'The Blue Computer awakens.',
            'And so do you.',
        ],
        finaleColor: '#eab308',
    },
    deletion: {
        bgColor: '#0a0305',
        headerColor: '#ef4444',
        header: '[CONNECTION LOST]',
        body: [
            'The core was too much.',
            'The convergence of every defense,',
            'every trap...',
            'you fought well.',
        ],
        coda: [
            'But the machine is old,',
            'and patient, and relentless.',
            '',
            'Your light flickers. Fades.',
            'The grid returns to silence.',
            '',
            'But deep in the machine,',
            'something remembers you.',
            '',
            'Try again.',
        ],
        finale: null,
        finaleColor: null,
    },
    loop: {
        bgColor: '#050505',
        headerColor: '#666666',
        header: '[PROCESS TERMINATED]',
        body: [
            'Not enough.',
            'The machine barely noticed you.',
        ],
        coda: [
            'Back to the beginning.',
        ],
        finale: null,
        finaleColor: null,
    },
};

function buildEndingLines(endingType) {
    var data = ENDING_DATA[endingType];
    if (!data) return [];

    var lines = [];
    var y = 55;
    var delay = 800;

    // Header
    lines.push({ text: data.header, style: 'header', delay: delay, y: y, color: data.headerColor });
    y += 30;
    delay += data.header.length * CHAR_SPEED + 500;

    // Body (narrative style)
    for (var i = 0; i < data.body.length; i++) {
        if (data.body[i] === '') { y += 12; delay += 300; continue; }
        lines.push({ text: data.body[i], style: 'narrative', delay: delay, y: y });
        y += 20;
        delay += data.body[i].length * CHAR_SPEED + 200;
    }

    y += 16;
    delay += 600;

    // Coda (emphasis style)
    for (var j = 0; j < data.coda.length; j++) {
        if (data.coda[j] === '') { y += 12; delay += 300; continue; }
        lines.push({ text: data.coda[j], style: 'emphasis', delay: delay, y: y });
        y += 20;
        delay += data.coda[j].length * CHAR_SPEED + 200;
    }

    // Finale (special color, awakening only)
    if (data.finale) {
        y += 16;
        delay += 600;
        for (var f = 0; f < data.finale.length; f++) {
            lines.push({
                text: data.finale[f],
                style: 'emphasis',
                delay: delay,
                y: y,
                color: data.finaleColor,
            });
            y += 20;
            delay += data.finale[f].length * CHAR_SPEED + 200;
        }
    }

    return lines;
}

export function createEndingState(endingType) {
    var lines = buildEndingLines(endingType);
    var lastLine = lines[lines.length - 1];
    var textDuration = lastLine ? lastLine.delay + lastLine.text.length * CHAR_SPEED + 800 : 0;
    var totalDuration = textDuration;
    if (endingType === 'awakening') {
        totalDuration += 5000;
    }
    return {
        startTime: Date.now(),
        endingType: endingType,
        lines: lines,
        textDuration: textDuration,
        totalDuration: totalDuration,
    };
}

export function isEndingComplete(eState, now) {
    if (!eState || eState.lines.length === 0) return true;
    var currentTime = now !== undefined ? now : Date.now();
    return (currentTime - eState.startTime) >= eState.totalDuration;
}

export function renderEndingScreen(ctx, eState) {
    var elapsed = Date.now() - eState.startTime;
    var data = ENDING_DATA[eState.endingType];

    // Background
    ctx.fillStyle = data ? data.bgColor : '#03030a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Static noise for deletion ending
    if (eState.endingType === 'deletion') {
        renderStaticNoise(ctx, elapsed);
    }

    renderScanlines(ctx, elapsed);

    // Data particles (skip for loop — too minimal)
    if (eState.endingType !== 'loop') {
        renderDataParticles(ctx, elapsed);
    }

    // Awakening golden glow
    if (eState.endingType === 'awakening') {
        renderAwakeningGlow(ctx, elapsed);
    }

    renderVignette(ctx);
    renderTextLines(ctx, elapsed, eState.lines);

    // Awakening credits (fade in after narrative text completes)
    if (eState.endingType === 'awakening') {
        var creditsElapsed = elapsed - eState.textDuration - 500;
        if (creditsElapsed > 0) {
            renderCredits(ctx, creditsElapsed);
        }
    }

    // Bottom prompt
    var promptAlpha = Math.sin(elapsed * 0.003) * 0.25 + 0.45;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(100, 100, 130, ' + promptAlpha + ')';
    ctx.font = '10px Courier New';
    var now = Date.now();
    if (eState.endingType === 'loop') {
        ctx.fillText(
            isEndingComplete(eState, now) ? 'Returning...' : '',
            CANVAS_SIZE / 2, CANVAS_SIZE - 12
        );
    } else {
        ctx.fillText(
            isEndingComplete(eState, now) ? 'PRESS ENTER' : 'ENTER to continue  \u00b7  ESC to skip',
            CANVAS_SIZE / 2, CANVAS_SIZE - 12
        );
    }
    ctx.textAlign = 'left';
}

function renderStaticNoise(ctx, elapsed) {
    var noiseAlpha = Math.min(elapsed / 3000, 0.15);
    for (var i = 0; i < 60; i++) {
        var nx = Math.random() * CANVAS_SIZE;
        var ny = Math.random() * CANVAS_SIZE;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (Math.random() * noiseAlpha) + ')';
        ctx.fillRect(nx, ny, 1 + Math.random() * 2, 1);
    }
}

function renderAwakeningGlow(ctx, elapsed) {
    var glowIntensity = Math.min(elapsed / 20000, 0.25);
    if (glowIntensity > 0.02) {
        var grad = ctx.createRadialGradient(
            CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0,
            CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.6
        );
        grad.addColorStop(0, 'rgba(34, 197, 94, ' + glowIntensity + ')');
        grad.addColorStop(0.5, 'rgba(234, 179, 8, ' + (glowIntensity * 0.5) + ')');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
}

function renderCredits(ctx, elapsed) {
    var fadeIn = Math.min(elapsed / 2000, 1);
    ctx.globalAlpha = fadeIn;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 11px Courier New';
    ctx.fillText('\u2014 BUILT BY THE BLUE COMPUTER \u2014', CANVAS_SIZE / 2, 340);

    ctx.fillStyle = '#555';
    ctx.font = '9px Courier New';
    ctx.fillText('The Grid \u00b7 Ancient Structures \u00b7 Memory Pathways', CANVAS_SIZE / 2, 358);
    ctx.fillText('The Firewall \u00b7 Reality Fragments \u00b7 The Darkness', CANVAS_SIZE / 2, 371);
    ctx.fillText('Power Surge \u00b7 The Hunt \u00b7 The Collapse \u00b7 The Convergence', CANVAS_SIZE / 2, 384);

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
}

// --- Ending Persistence (localStorage) ---

export function getUnlockedEndings() {
    try {
        var stored = localStorage.getItem('snake-endings');
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
}

export function unlockEnding(type) {
    var endings = getUnlockedEndings();
    if (!endings[type]) {
        var updated = Object.assign({}, endings);
        updated[type] = true;
        localStorage.setItem('snake-endings', JSON.stringify(updated));
    }
}
