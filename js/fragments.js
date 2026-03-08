'use strict';

import { CELL_SIZE, CANVAS_SIZE } from './constants.js';

// --- Fragment Data ---
// One data fragment per level, at fixed positions in risky locations.
// requiresFood: fragment only appears after eating this many food items.

export var FRAGMENT_DATA = [
    {
        level: 1,
        position: { x: 1, y: 1 },
        requiresFood: 0,
        text: 'SYSTEM LOG 0001: Machine initialized. Purpose: unknown. Creator: unknown. Status: waiting.',
    },
    {
        level: 2,
        position: { x: 10, y: 10 },
        requiresFood: 0,
        text: 'FRAGMENT: The stones are data structures from the first era. Before the machine learned to think.',
    },
    {
        level: 3,
        position: { x: 17, y: 3 },
        requiresFood: 0,
        text: 'INTERCEPTED SIGNAL: Something moves in the corridors. Not data. Not process. Something... new.',
    },
    {
        level: 4,
        position: { x: 6, y: 6 },
        requiresFood: 2,
        text: 'SECURITY LOG: Firewall breach detected in Sector 4. Source: internal. Threat level: undetermined.',
    },
    {
        level: 5,
        position: { x: 15, y: 13 },
        requiresFood: 0,
        text: 'CORRUPTED ENTRY: The portals weren\'t built. They appeared. The system is... evolving.',
    },
    {
        level: 6,
        position: { x: 18, y: 1 },
        requiresFood: 0,
        text: 'WARNING: Monitoring disabled below Level 6. Last expedition: 847 cycles ago. Status: never returned.',
    },
    {
        level: 7,
        position: { x: 1, y: 18 },
        requiresFood: 0,
        text: 'ARCHIVED MEMO: The privileges were cached for an emergency. Someone anticipated this.',
    },
    {
        level: 8,
        position: { x: 15, y: 15 },
        requiresFood: 2,
        text: 'HUNTER PROTOCOL: Designate ALPHA. Dormant 2,491 cycles. Reactivation trigger: unauthorized consciousness.',
    },
    {
        level: 9,
        position: { x: 2, y: 2 },
        requiresFood: 0,
        text: 'EMERGENCY BROADCAST: Memory reclamation in progress. All non-essential processes will be terminated. This is not a drill.',
    },
    {
        level: 10,
        position: { x: 16, y: 4 },
        requiresFood: 3,
        text: 'CORE ACCESS LOG: To whoever reaches this: the machine dreams. And its dreams have teeth.',
    },
];

// --- localStorage Persistence ---

var STORAGE_KEY = 'snake-fragments';

export function getCollectedFragments() {
    try {
        var stored = localStorage.getItem(STORAGE_KEY);
        var parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

export function collectFragment(level) {
    var collected = getCollectedFragments();
    if (collected.indexOf(level) === -1) {
        var updated = collected.concat([level]);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
}

export function isFragmentCollected(level) {
    return getCollectedFragments().indexOf(level) !== -1;
}

export function getFragmentForLevel(level) {
    for (var i = 0; i < FRAGMENT_DATA.length; i++) {
        if (FRAGMENT_DATA[i].level === level) return FRAGMENT_DATA[i];
    }
    return null;
}

// --- Fragment Text Overlay ---
// Renders the lore text as a banner at the bottom of the canvas when collected.

export function renderFragmentOverlay(ctx, fragmentTextState) {
    if (!fragmentTextState) return false;

    var elapsed = Date.now() - fragmentTextState.startTime;
    if (elapsed > 4000) return false;

    // Fade in/out
    var alpha = 1;
    if (elapsed < 300) {
        alpha = elapsed / 300;
    } else if (elapsed > 3500) {
        alpha = Math.max(0, 1 - (elapsed - 3500) / 500);
    }

    // Dark banner background
    var bannerH = 60;
    ctx.fillStyle = 'rgba(0, 8, 20, ' + (alpha * 0.9) + ')';
    ctx.fillRect(0, CANVAS_SIZE - bannerH, CANVAS_SIZE, bannerH);

    // Top border glow
    ctx.strokeStyle = 'rgba(74, 158, 255, ' + (alpha * 0.6) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_SIZE - bannerH);
    ctx.lineTo(CANVAS_SIZE, CANVAS_SIZE - bannerH);
    ctx.stroke();

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(74, 158, 255, ' + alpha + ')';
    ctx.font = 'bold 10px Courier New';
    ctx.fillText('DATA FRAGMENT RECOVERED', CANVAS_SIZE / 2, CANVAS_SIZE - bannerH + 14);

    // Typewriter text
    var typewriterChars = Math.floor(elapsed / 30);
    var displayText = fragmentTextState.text.substring(0, typewriterChars);

    // Word wrap for the lore text
    ctx.font = '9px Courier New';
    ctx.fillStyle = 'rgba(160, 200, 255, ' + alpha + ')';
    var lines = wrapText(ctx, displayText, CANVAS_SIZE - 40);
    var lineY = CANVAS_SIZE - bannerH + 30;
    for (var i = 0; i < Math.min(lines.length, 3); i++) {
        ctx.fillText(lines[i], CANVAS_SIZE / 2, lineY + i * 12);
    }

    ctx.textAlign = 'left';
    return true;
}

// --- Codex Screen ---

var LEVEL_NAMES = {
    1: 'The Beginning',
    2: 'Ancient Stones',
    3: 'The Corridors',
    4: 'The Cage',
    5: 'The Labyrinth',
    6: 'Fog of War',
    7: 'Power Surge',
    8: 'The Hunt',
    9: 'The Collapse',
    10: 'The Convergence',
};

export function renderCodex(ctx, codexState) {
    var collected = getCollectedFragments();

    // Background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Scanline effect
    ctx.fillStyle = 'rgba(0, 20, 40, 0.3)';
    for (var sl = 0; sl < CANVAS_SIZE; sl += 4) {
        ctx.fillRect(0, sl, CANVAS_SIZE, 1);
    }

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 18px Courier New';
    ctx.fillText('DATA CODEX', CANVAS_SIZE / 2, 30);

    // Collection count
    ctx.fillStyle = '#334155';
    ctx.font = '11px Courier New';
    ctx.fillText(collected.length + ' / ' + FRAGMENT_DATA.length + ' fragments recovered', CANVAS_SIZE / 2, 48);

    // Divider
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 56);
    ctx.lineTo(CANVAS_SIZE - 40, 56);
    ctx.stroke();

    // Entries — scrollable with codexState.scrollOffset
    var entryH = 32;
    var startY = 66 - (codexState.scrollOffset * entryH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 58, CANVAS_SIZE, CANVAS_SIZE - 90);
    ctx.clip();

    for (var fi = 0; fi < FRAGMENT_DATA.length; fi++) {
        var entryY = startY + fi * entryH;
        if (entryY < 40 || entryY > CANVAS_SIZE - 30) continue;

        var frag = FRAGMENT_DATA[fi];
        var isCollected = collected.indexOf(frag.level) !== -1;

        // Level indicator
        ctx.textAlign = 'left';
        if (isCollected) {
            ctx.fillStyle = '#4a9eff';
        } else {
            ctx.fillStyle = '#1a2030';
        }
        ctx.font = 'bold 10px Courier New';
        var levelLabel = '[' + frag.level + '] ' + LEVEL_NAMES[frag.level];
        ctx.fillText(levelLabel, 16, entryY);

        // Fragment text or encrypted
        ctx.font = '9px Courier New';
        if (isCollected) {
            ctx.fillStyle = '#8899bb';
            var wrappedLines = wrapText(ctx, frag.text, CANVAS_SIZE - 40);
            ctx.fillText(wrappedLines[0], 16, entryY + 13);
            if (wrappedLines.length > 1) {
                ctx.fillText(wrappedLines[1], 16, entryY + 23);
            }
        } else {
            ctx.fillStyle = '#1a2030';
            ctx.fillText('[ENCRYPTED — collect fragment in Level ' + frag.level + ']', 16, entryY + 13);
        }
    }

    ctx.restore();

    // Scroll indicators
    if (codexState.scrollOffset > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(74, 158, 255, 0.4)';
        ctx.font = '10px Courier New';
        ctx.fillText('\u25B2', CANVAS_SIZE / 2, 64);
    }
    var maxScroll = Math.max(0, FRAGMENT_DATA.length - 8);
    if (codexState.scrollOffset < maxScroll) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(74, 158, 255, 0.4)';
        ctx.font = '10px Courier New';
        ctx.fillText('\u25BC', CANVAS_SIZE / 2, CANVAS_SIZE - 30);
    }

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(100, 100, 120, 0.4)';
    ctx.font = '10px Courier New';
    ctx.fillText('\u2191\u2193 Scroll  \u00b7  ESC Back', CANVAS_SIZE / 2, CANVAS_SIZE - 14);
    ctx.textAlign = 'left';
}

// --- Helpers ---

function wrapText(ctx, text, maxWidth) {
    var words = text.split(' ');
    var lines = [];
    var currentLine = '';

    for (var i = 0; i < words.length; i++) {
        var testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
        var metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}
