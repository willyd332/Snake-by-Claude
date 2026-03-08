'use strict';

// --- Speedrun Timer & Split Tracking ---
// Tracks current run time, per-level splits, and personal bests in localStorage.
// Timer starts when the level starts (levelStartTime is set), pauses while
// state.started === false (waiting for input), and stops on death or completion.

var STORAGE_KEY = 'snake-speedrun-pbs';

// --- Personal Best Storage ---

function getPersonalBests() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

function savePersonalBests(pbs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pbs));
    } catch (e) { /* storage unavailable */ }
}

// Returns true if this time is a new PB for the given level (and saves it).
export function checkAndSaveSplit(level, timeMs) {
    if (timeMs <= 0) return false;
    var pbs = getPersonalBests();
    var existing = pbs[level] || 0;
    if (existing === 0 || timeMs < existing) {
        var updated = Object.assign({}, pbs);
        updated[level] = timeMs;
        savePersonalBests(updated);
        return true;
    }
    return false;
}

export function getBestSplitMs(level) {
    var pbs = getPersonalBests();
    return pbs[level] || 0;
}

// --- Timer State ---

export function createSpeedrunState() {
    return {
        // Accumulated time for current level (ms), excluding paused gaps
        levelElapsedMs: 0,
        // Accumulated time for full run (ms), excluding paused gaps
        runElapsedMs: 0,
        // Wall-clock timestamp when the last "unpaused" period began (0 = paused)
        unpausedAt: 0,
        // Whether the timer is currently running
        running: false,
        // Split overlay: { level, timeMs, isPB, startTime }
        splitOverlay: null,
        // Completed splits for this run: { level -> timeMs }
        runSplits: {},
    };
}

// Call on game start / restart to reset everything.
export function resetSpeedrun(speedrunState) {
    return Object.assign({}, speedrunState, {
        levelElapsedMs: 0,
        runElapsedMs: 0,
        unpausedAt: 0,
        running: false,
        splitOverlay: null,
        runSplits: {},
    });
}

// Call when the player gives their first input and the game begins ticking.
export function startSpeedrunTimer(speedrunState) {
    if (speedrunState.running) return speedrunState;
    return Object.assign({}, speedrunState, {
        running: true,
        unpausedAt: Date.now(),
    });
}

// Call when the game pauses (story screen, life-lost respawn wait, etc.)
export function pauseSpeedrunTimer(speedrunState) {
    if (!speedrunState.running) return speedrunState;
    var now = Date.now();
    var elapsed = now - speedrunState.unpausedAt;
    return Object.assign({}, speedrunState, {
        running: false,
        unpausedAt: 0,
        levelElapsedMs: speedrunState.levelElapsedMs + elapsed,
        runElapsedMs: speedrunState.runElapsedMs + elapsed,
    });
}

// Call when resuming after a pause.
export function resumeSpeedrunTimer(speedrunState) {
    if (speedrunState.running) return speedrunState;
    return Object.assign({}, speedrunState, {
        running: true,
        unpausedAt: Date.now(),
    });
}

// Returns live elapsed time for current level (ms).
export function getLevelElapsedMs(speedrunState) {
    if (!speedrunState.running) return speedrunState.levelElapsedMs;
    return speedrunState.levelElapsedMs + (Date.now() - speedrunState.unpausedAt);
}

// Returns live elapsed time for full run (ms).
export function getRunElapsedMs(speedrunState) {
    if (!speedrunState.running) return speedrunState.runElapsedMs;
    return speedrunState.runElapsedMs + (Date.now() - speedrunState.unpausedAt);
}

// Call when a level is completed. Records split, checks PB, shows overlay.
// Returns updated speedrunState with overlay set and level timer reset.
export function recordLevelSplit(speedrunState, level) {
    var levelMs = getLevelElapsedMs(speedrunState);
    var isPB = checkAndSaveSplit(level, levelMs);

    var newRunSplits = Object.assign({}, speedrunState.runSplits);
    newRunSplits[level] = levelMs;

    var overlay = {
        level: level,
        timeMs: levelMs,
        isPB: isPB,
        startTime: Date.now(),
    };

    // Reset level timer but keep run timer running.
    // If currently running, restart unpausedAt from now for the new level.
    return Object.assign({}, speedrunState, {
        levelElapsedMs: 0,
        unpausedAt: speedrunState.running ? Date.now() : 0,
        splitOverlay: overlay,
        runSplits: newRunSplits,
    });
}

// Call on final death or game completion.
export function stopSpeedrunTimer(speedrunState) {
    if (!speedrunState.running) return speedrunState;
    var now = Date.now();
    var elapsed = now - speedrunState.unpausedAt;
    return Object.assign({}, speedrunState, {
        running: false,
        unpausedAt: 0,
        levelElapsedMs: speedrunState.levelElapsedMs + elapsed,
        runElapsedMs: speedrunState.runElapsedMs + elapsed,
    });
}

// --- Time Formatting ---

export function formatSpeedrunTime(ms) {
    if (ms <= 0) return '0:00.0';
    var totalTenths = Math.floor(ms / 100);
    var tenths = totalTenths % 10;
    var totalSeconds = Math.floor(ms / 1000);
    var seconds = totalSeconds % 60;
    var minutes = Math.floor(totalSeconds / 60);
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds + '.' + tenths;
}

// --- Canvas Rendering ---

import { CANVAS_SIZE } from './constants.js';

// Renders the live timer in the top-right corner.
export function renderSpeedrunTimer(ctx, speedrunState, gameActive) {
    if (!gameActive) return;

    var ms = getRunElapsedMs(speedrunState);
    var timeStr = formatSpeedrunTime(ms);

    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = 'bold 10px Courier New';

    // Subtle shadow for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(timeStr, CANVAS_SIZE - 7, 15);

    ctx.fillStyle = 'rgba(200, 200, 220, 0.65)';
    ctx.fillText(timeStr, CANVAS_SIZE - 8, 14);

    ctx.textAlign = 'left';
    ctx.restore();
}

var SPLIT_DISPLAY_MS = 2200;
var SPLIT_FADE_MS = 400;

// Renders the split overlay (level X: MM:SS.s — PB!).
// Returns true while overlay is still active, false when it should be cleared.
export function renderSplitOverlay(ctx, splitOverlay) {
    if (!splitOverlay) return false;

    var elapsed = Date.now() - splitOverlay.startTime;
    if (elapsed >= SPLIT_DISPLAY_MS) return false;

    var alpha;
    if (elapsed > SPLIT_DISPLAY_MS - SPLIT_FADE_MS) {
        alpha = 1 - (elapsed - (SPLIT_DISPLAY_MS - SPLIT_FADE_MS)) / SPLIT_FADE_MS;
    } else {
        alpha = Math.min(1, elapsed / 150);
    }

    var timeStr = formatSpeedrunTime(splitOverlay.timeMs);
    var label = 'LVL ' + splitOverlay.level + '  ' + timeStr;
    if (splitOverlay.isPB) label += '  PB!';

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'right';

    // Glow for PB
    if (splitOverlay.isPB) {
        ctx.font = 'bold 11px Courier New';
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 8;
    } else {
        ctx.font = '10px Courier New';
        ctx.fillStyle = 'rgba(180, 220, 180, 0.9)';
        ctx.shadowBlur = 0;
    }

    ctx.fillText(label, CANVAS_SIZE - 8, 28);

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.restore();

    return true;
}
