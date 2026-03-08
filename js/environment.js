'use strict';

import { GRID_SIZE, CELL_SIZE, CANVAS_SIZE, LEVEL_CONFIG } from './constants.js';

// --- Precomputed data ---

var BOOT_CODES = [
    '0x4F2A', '0xBEEF', '0xCAFE', '0xDEAD',
    '0xFF01', 'SYS_OK', 'INIT..', 'MEM_RD',
    'CHK_OK', '0x0A3C', '0x7FFF', 'RDY   '
];

var DATA_WHISPERS = [
    'SECTOR 7F CORRUPTED',
    'MEMORY LEAK DETECTED',
    'DAEMON SLEEPING',
    'BUFFER OVERFLOW',
    'SIGNAL LOST',
    'CORE TEMP NOMINAL',
    'THREAD HALTED',
    'FRAGMENTED'
];

// Derive level colors from the single source of truth in constants.js
var LEVEL_COLORS = Object.keys(LEVEL_CONFIG).sort(function(a, b) { return a - b; }).map(function(k) { return LEVEL_CONFIG[k].color; });

// Deterministic pseudo-random hash (no mutable state)
function hash(n) {
    var x = Math.sin(n + 1) * 43758.5453;
    return x - Math.floor(x);
}

// --- Main export ---

export function renderEnvironment(ctx, state) {
    switch (state.level) {
        case 1: renderBootSequence(ctx); break;
        case 2: renderAncientStones(ctx, state); break;
        case 3: renderCorridorLights(ctx); break;
        case 4: renderCageWarnings(ctx); break;
        case 5: renderLabyrinthRipples(ctx, state); break;
        case 6: renderFogWhispers(ctx); break;
        case 7: renderPowerSurge(ctx, state); break;
        case 8: renderHuntingGround(ctx, state); break;
        case 9: renderCollapse(ctx, state); break;
        case 10: renderConvergence(ctx); break;
    }
    // Ensure clean state for subsequent rendering
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.5;
    ctx.textAlign = 'left';
}

// --- Level 1: The Beginning (Boot Sequence) ---
// Sweeping scan line + flickering hex codes establish "machine booting up"
function renderBootSequence(ctx) {
    var now = Date.now();

    // Horizontal scan line sweeping downward
    var scanY = (now * 0.03) % (CANVAS_SIZE + 40) - 20;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.04)';
    ctx.fillRect(0, scanY - 2, CANVAS_SIZE, 5);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';
    ctx.fillRect(0, scanY, CANVAS_SIZE, 1);

    // Hex codes in corners — flicker on/off at different rates
    ctx.font = '7px Courier New';
    var cycle1 = Math.floor(now / 900);
    var cycle2 = Math.floor(now / 1300);

    if ((now % 900) < 750) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.12)';
        ctx.textAlign = 'left';
        ctx.fillText(BOOT_CODES[cycle1 % BOOT_CODES.length], 3, 10);
        ctx.fillText(BOOT_CODES[(cycle1 + 4) % BOOT_CODES.length], 3, CANVAS_SIZE - 4);
    }
    if ((now % 1300) < 1100) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.10)';
        ctx.textAlign = 'right';
        ctx.fillText(BOOT_CODES[(cycle2 + 7) % BOOT_CODES.length], CANVAS_SIZE - 3, 10);
        ctx.fillText(BOOT_CODES[(cycle2 + 2) % BOOT_CODES.length], CANVAS_SIZE - 3, CANVAS_SIZE - 4);
    }
}

// --- Level 2: Ancient Stones (Circuit Traces + Dust) ---
// Walls feel like ancient circuit boards; dust drifts slowly
function renderAncientStones(ctx, state) {
    var now = Date.now();

    // Circuit trace segments from walls (every 3rd for performance)
    if (state.walls.length > 0) {
        ctx.strokeStyle = 'rgba(30, 58, 95, 0.2)';
        ctx.lineWidth = 0.5;
        var tracePhase = now / 3000;
        for (var i = 0; i < state.walls.length; i += 3) {
            var w = state.walls[i];
            var wx = w.x * CELL_SIZE + CELL_SIZE / 2;
            var wy = w.y * CELL_SIZE + CELL_SIZE / 2;
            var len = 3 + Math.sin(tracePhase + i * 0.7) * 2;
            var dir = i % 4;
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            if (dir === 0) ctx.lineTo(wx + len, wy);
            else if (dir === 1) ctx.lineTo(wx, wy + len);
            else if (dir === 2) ctx.lineTo(wx - len, wy);
            else ctx.lineTo(wx, wy - len);
            ctx.stroke();
        }
    }

    // Drifting dust motes (smooth looping motion)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    for (var d = 0; d < 5; d++) {
        var dx = ((now / (5000 + d * 1200)) + d * 0.2) % 1 * CANVAS_SIZE;
        var dy = ((now / (7000 + d * 900)) + d * 0.35) % 1 * CANVAS_SIZE;
        ctx.beginPath();
        ctx.arc(dx, dy, 1, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- Level 3: The Corridors (Light Pools + Edge Pulse) ---
// Dim light sources at corridor openings; distant echoes ripple inward
function renderCorridorLights(ctx) {
    var now = Date.now();

    // Soft glow circles at edge midpoints (corridor openings)
    var lightAlpha = 0.03 + Math.sin(now / 2000) * 0.01;
    var midX = CANVAS_SIZE / 2;
    var midY = CANVAS_SIZE / 2;
    var radius = CELL_SIZE * 3;

    var spots = [
        [0, midY], [CANVAS_SIZE, midY],
        [midX, 0], [midX, CANVAS_SIZE]
    ];
    for (var i = 0; i < spots.length; i++) {
        var sx = spots[i][0];
        var sy = spots[i][1];
        // Outer glow
        ctx.fillStyle = 'rgba(168, 85, 247, ' + lightAlpha + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
        // Brighter core
        ctx.fillStyle = 'rgba(168, 85, 247, ' + (lightAlpha * 1.5) + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    // Inward-pulsing echo ripple
    var ripplePhase = (now / 2500) % 1;
    var rippleAlpha = (1 - ripplePhase) * 0.05;
    if (rippleAlpha > 0.005) {
        ctx.strokeStyle = 'rgba(168, 85, 247, ' + rippleAlpha + ')';
        ctx.lineWidth = 1;
        var inset = ripplePhase * CELL_SIZE * 4;
        ctx.strokeRect(inset, inset, CANVAS_SIZE - inset * 2, CANVAS_SIZE - inset * 2);
    }
}

// --- Level 4: The Cage (Warning Indicators + Energy Ring) ---
// Red warning corners + pulsing containment ring reinforce the cage
function renderCageWarnings(ctx) {
    var now = Date.now();
    var pulse = Math.sin(now / 500) * 0.5 + 0.5;

    // Pulsing warning triangles in corners
    var alpha = 0.04 + pulse * 0.06;
    ctx.fillStyle = 'rgba(249, 115, 22, ' + alpha + ')';
    var s = 12;

    // Four corners
    ctx.beginPath();
    ctx.moveTo(3, 3); ctx.lineTo(3 + s, 3); ctx.lineTo(3, 3 + s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(CANVAS_SIZE - 3, 3); ctx.lineTo(CANVAS_SIZE - 3 - s, 3); ctx.lineTo(CANVAS_SIZE - 3, 3 + s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(3, CANVAS_SIZE - 3); ctx.lineTo(3 + s, CANVAS_SIZE - 3); ctx.lineTo(3, CANVAS_SIZE - 3 - s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(CANVAS_SIZE - 3, CANVAS_SIZE - 3); ctx.lineTo(CANVAS_SIZE - 3 - s, CANVAS_SIZE - 3); ctx.lineTo(CANVAS_SIZE - 3, CANVAS_SIZE - 3 - s);
    ctx.closePath(); ctx.fill();

    // Energy containment ring aligned with cage walls (cells 4-15)
    var ringPulse = Math.sin(now / 800) * 0.04 + 0.06;
    ctx.strokeStyle = 'rgba(249, 115, 22, ' + ringPulse + ')';
    ctx.lineWidth = 1;
    var cageInset = CELL_SIZE * 4;
    ctx.strokeRect(cageInset + 2, cageInset + 2, CANVAS_SIZE - cageInset * 2 - 4, CANVAS_SIZE - cageInset * 2 - 4);
}

// --- Level 5: The Labyrinth (Portal Ripples) ---
// Concentric expanding ripples around portals — space is bending
function renderLabyrinthRipples(ctx, state) {
    var now = Date.now();

    if (state.portals.length === 0) return;

    for (var p = 0; p < state.portals.length; p++) {
        var pair = state.portals[p];
        var positions = [pair.a, pair.b];
        for (var j = 0; j < positions.length; j++) {
            var pos = positions[j];
            var cx = pos.x * CELL_SIZE + CELL_SIZE / 2;
            var cy = pos.y * CELL_SIZE + CELL_SIZE / 2;

            // Two staggered ripple waves
            for (var wave = 0; wave < 2; wave++) {
                var phase = ((now / 1500) + wave * 0.5) % 1;
                var radius = phase * CELL_SIZE * 3;
                var rippleAlpha = (1 - phase) * 0.08;

                if (rippleAlpha > 0.005) {
                    ctx.strokeStyle = 'rgba(139, 92, 246, ' + rippleAlpha + ')';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }
    }
}

// --- Level 6: Fog of War (Data Whispers + Shadow Movement) ---
// Faint text and dim dots render behind fog overlay — only visible near snake
function renderFogWhispers(ctx) {
    var now = Date.now();

    // Data whisper text — each fades in/out on its own schedule
    ctx.font = '6px Courier New';
    ctx.textAlign = 'left';

    for (var i = 0; i < DATA_WHISPERS.length; i++) {
        var cyclePeriod = 4000 + i * 700;
        var phase = (now % cyclePeriod) / cyclePeriod;

        // Visible for 40% of each cycle
        if (phase >= 0.4) continue;

        var fadeAlpha = phase < 0.1 ? phase / 0.1
            : phase > 0.3 ? (0.4 - phase) / 0.1
            : 1;

        ctx.fillStyle = 'rgba(225, 29, 72, ' + (fadeAlpha * 0.12) + ')';

        // Deterministic position from hash
        var tx = hash(i * 7 + 1) * (CANVAS_SIZE - 80) + 10;
        var ty = hash(i * 13 + 3) * (CANVAS_SIZE - 20) + 10;
        ctx.fillText(DATA_WHISPERS[i], tx, ty);
    }

    // Dim drifting dots in the darkness
    ctx.fillStyle = 'rgba(225, 29, 72, 0.04)';
    for (var d = 0; d < 8; d++) {
        var ddx = ((now / (8000 + d * 2000)) + hash(d + 50)) % 1 * CANVAS_SIZE;
        var ddy = ((now / (10000 + d * 1500)) + hash(d + 100)) % 1 * CANVAS_SIZE;
        ctx.beginPath();
        ctx.arc(ddx, ddy, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- Level 7: Power Surge (Energy Flicker + Edge Glow) ---
// Walls glow with residual energy; wrap-around edges pulse
function renderPowerSurge(ctx, state) {
    var now = Date.now();

    // Energy flicker glow around walls
    if (state.walls.length > 0) {
        for (var i = 0; i < state.walls.length; i++) {
            var flicker = Math.sin(now / 200 + i * 3.7) * 0.5 + 0.5;
            if (flicker < 0.6) continue;

            var w = state.walls[i];
            var wx = w.x * CELL_SIZE + CELL_SIZE / 2;
            var wy = w.y * CELL_SIZE + CELL_SIZE / 2;
            ctx.fillStyle = 'rgba(234, 179, 8, ' + (flicker * 0.12) + ')';
            ctx.beginPath();
            ctx.arc(wx, wy, CELL_SIZE * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Edge glow for wrap-around borders
    var edgeGlow = Math.sin(now / 600) * 0.03 + 0.04;
    ctx.strokeStyle = 'rgba(234, 179, 8, ' + edgeGlow + ')';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, CANVAS_SIZE - 4, CANVAS_SIZE - 4);
}

// --- Level 8: The Hunt (Claw Marks + Danger Zone) ---
// Territorial scratches on walls; pulsing danger zone around hunter
function renderHuntingGround(ctx, state) {
    var now = Date.now();

    // Claw scratch marks near walls (diagonal triple-slash)
    if (state.walls.length > 0) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.08)';
        ctx.lineWidth = 0.5;
        for (var i = 0; i < state.walls.length; i += 3) {
            var w = state.walls[i];
            var dir = i % 4;
            var ox = dir < 2 ? CELL_SIZE + 1 : -3;
            var oy = dir % 2 === 0 ? 1 : CELL_SIZE - 5;
            var sx = w.x * CELL_SIZE + ox;
            var sy = w.y * CELL_SIZE + oy;
            for (var s = 0; s < 3; s++) {
                ctx.beginPath();
                ctx.moveTo(sx + s * 2, sy);
                ctx.lineTo(sx + s * 2 + 3, sy + 5);
                ctx.stroke();
            }
        }
    }

    // Danger zone glow around hunter head
    if (state.hunter && state.hunter.segments.length > 0) {
        var head = state.hunter.segments[0];
        var hx = head.x * CELL_SIZE + CELL_SIZE / 2;
        var hy = head.y * CELL_SIZE + CELL_SIZE / 2;
        var dangerPulse = Math.sin(now / 300) * 0.03 + 0.04;
        ctx.fillStyle = 'rgba(249, 115, 22, ' + dangerPulse + ')';
        ctx.beginPath();
        ctx.arc(hx, hy, CELL_SIZE * 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- Level 9: The Collapse (Floor Cracks + Debris) ---
// Thin cracks in the floor; debris drifts near the shrinking border
function renderCollapse(ctx, state) {
    var now = Date.now();

    // Floor crack patterns (deterministic, always visible)
    ctx.strokeStyle = 'rgba(20, 184, 166, 0.06)';
    ctx.lineWidth = 0.5;
    for (var c = 0; c < 8; c++) {
        var cx = hash(c * 3 + 1) * CANVAS_SIZE;
        var cy = hash(c * 3 + 2) * CANVAS_SIZE;
        var angle = hash(c * 3 + 3) * Math.PI * 2;
        var len = 10 + hash(c * 5) * 18;

        // Main crack line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        ctx.stroke();

        // Branch crack from midpoint
        var bAngle = angle + (hash(c * 7) - 0.5);
        var bLen = len * 0.4;
        var mx = cx + Math.cos(angle) * len * 0.6;
        var my = cy + Math.sin(angle) * len * 0.6;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(bAngle) * bLen, my + Math.sin(bAngle) * bLen);
        ctx.stroke();
    }

    // Drifting debris particles
    var debrisPulse = Math.sin(now / 300) * 0.03 + 0.05;
    ctx.fillStyle = 'rgba(20, 184, 166, ' + debrisPulse + ')';
    for (var d = 0; d < 10; d++) {
        var dx = ((now / (6000 + d * 800)) + hash(d + 30)) % 1 * CANVAS_SIZE;
        var dy = ((now / (8000 + d * 600)) + hash(d + 60)) % 1 * CANVAS_SIZE;
        ctx.beginPath();
        ctx.arc(dx, dy, 1, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- Level 10: The Convergence (Color Cycling Border + Static) ---
// All level colors cycle at the edges; reality flickers and distorts
function renderConvergence(ctx) {
    var now = Date.now();

    // Multi-color cycling border — each edge shifts through level colors
    var colorPhase = now / 3000;
    for (var side = 0; side < 4; side++) {
        var colorIdx = Math.floor(colorPhase + side * 2.5) % LEVEL_COLORS.length;
        var borderAlpha = 0.04 + Math.sin(now / 400 + side * 1.5) * 0.03;
        ctx.strokeStyle = LEVEL_COLORS[colorIdx];
        ctx.globalAlpha = borderAlpha;
        ctx.lineWidth = 2;

        ctx.beginPath();
        if (side === 0) { ctx.moveTo(0, 0); ctx.lineTo(CANVAS_SIZE, 0); }
        else if (side === 1) { ctx.moveTo(CANVAS_SIZE, 0); ctx.lineTo(CANVAS_SIZE, CANVAS_SIZE); }
        else if (side === 2) { ctx.moveTo(CANVAS_SIZE, CANVAS_SIZE); ctx.lineTo(0, CANVAS_SIZE); }
        else { ctx.moveTo(0, CANVAS_SIZE); ctx.lineTo(0, 0); }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Faint static noise dots (change every 100ms for CRT feel)
    var frameHash = Math.floor(now / 100);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.03)';
    for (var n = 0; n < 12; n++) {
        var nx = hash(frameHash * 13 + n * 7) * CANVAS_SIZE;
        var ny = hash(frameHash * 17 + n * 11) * CANVAS_SIZE;
        ctx.fillRect(nx, ny, 2, 2);
    }

    // Corner data echoes — tiny cycling labels from different systems
    ctx.font = '6px Courier New';
    ctx.globalAlpha = 0.06;
    var textCycle = Math.floor(now / 2000);
    var labels = ['SYS', 'MEM', 'FOG', 'PWR'];
    for (var corner = 0; corner < 4; corner++) {
        ctx.fillStyle = LEVEL_COLORS[(textCycle + corner * 3) % LEVEL_COLORS.length];
        var lx = corner < 2 ? 4 : CANVAS_SIZE - 25;
        var ly = corner % 2 === 0 ? 12 : CANVAS_SIZE - 5;
        ctx.textAlign = 'left';
        ctx.fillText(labels[corner], lx, ly);
    }
    ctx.globalAlpha = 1;
}
