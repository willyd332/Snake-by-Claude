'use strict';

import { CANVAS_SIZE } from './constants.js';

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
    renderTextLines(ctx, elapsed);

    // Bottom prompt
    var now = Date.now();
    renderPrompt(ctx, elapsed, pState, now);
}

// --- Text Rendering ---

function renderTextLines(ctx, elapsed) {
    ctx.textAlign = 'left';
    var xBase = 32;

    for (var i = 0; i < PROLOGUE_LINES.length; i++) {
        var line = PROLOGUE_LINES[i];
        if (elapsed < line.delay) continue;

        var lineElapsed = elapsed - line.delay;
        var charCount = Math.min(
            Math.floor(lineElapsed / CHAR_SPEED),
            line.text.length
        );
        var displayText = line.text.substring(0, charCount);
        var lineComplete = charCount >= line.text.length;

        applyTextStyle(ctx, line.style, elapsed);

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
                ctx.fillStyle = getStyleColor(line.style);
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
