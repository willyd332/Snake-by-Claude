'use strict';

import { CANVAS_SIZE, MAX_LEVEL, LEVEL_CONFIG } from './constants.js';
import { LEVEL_NAMES } from './utils.js';

// --- Storage ---
var STORAGE_KEY = 'snake-stats';

function createDefaultStats() {
    var deathsByLevel = {};
    var bestScoreByLevel = {};
    var fastestLevelMs = {};
    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
        deathsByLevel[lv] = 0;
        bestScoreByLevel[lv] = 0;
        fastestLevelMs[lv] = 0;
    }
    return {
        gamesPlayed: 0,
        totalFoodEaten: 0,
        totalDeaths: 0,
        totalTimePlayed: 0,
        longestSnake: 1,
        portalsUsed: 0,
        powerUpsCollected: 0,
        levelsCompleted: 0,
        bestEndlessWave: 0,
        deathsByLevel: deathsByLevel,
        bestScoreByLevel: bestScoreByLevel,
        fastestLevelMs: fastestLevelMs,
    };
}

export function getStats() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return createDefaultStats();
        var parsed = JSON.parse(raw);
        // Merge with defaults so new fields are present
        var defaults = createDefaultStats();
        return Object.assign({}, defaults, parsed, {
            deathsByLevel: Object.assign({}, defaults.deathsByLevel, parsed.deathsByLevel || {}),
            bestScoreByLevel: Object.assign({}, defaults.bestScoreByLevel, parsed.bestScoreByLevel || {}),
            fastestLevelMs: Object.assign({}, defaults.fastestLevelMs, parsed.fastestLevelMs || {}),
        });
    } catch (e) {
        return createDefaultStats();
    }
}

function saveStats(stats) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) { /* storage unavailable */ }
}

// --- Recording Functions ---

export function recordGameStart() {
    var stats = getStats();
    saveStats(Object.assign({}, stats, { gamesPlayed: stats.gamesPlayed + 1 }));
}

export function recordFoodEaten(snakeLength) {
    var stats = getStats();
    saveStats(Object.assign({}, stats, {
        totalFoodEaten: stats.totalFoodEaten + 1,
        longestSnake: Math.max(stats.longestSnake, snakeLength),
    }));
}

export function recordDeath(level) {
    var stats = getStats();
    var newDeaths = Object.assign({}, stats.deathsByLevel);
    newDeaths[level] = (newDeaths[level] || 0) + 1;
    saveStats(Object.assign({}, stats, {
        totalDeaths: stats.totalDeaths + 1,
        deathsByLevel: newDeaths,
    }));
}

export function recordLevelComplete(level, timeMs) {
    var stats = getStats();
    var newFastest = Object.assign({}, stats.fastestLevelMs);
    if (timeMs > 0 && (newFastest[level] === 0 || timeMs < newFastest[level])) {
        newFastest[level] = timeMs;
    }
    saveStats(Object.assign({}, stats, {
        levelsCompleted: stats.levelsCompleted + 1,
        fastestLevelMs: newFastest,
    }));
}

export function recordPortalUse() {
    var stats = getStats();
    saveStats(Object.assign({}, stats, { portalsUsed: stats.portalsUsed + 1 }));
}

export function recordPowerUpCollected() {
    var stats = getStats();
    saveStats(Object.assign({}, stats, { powerUpsCollected: stats.powerUpsCollected + 1 }));
}

export function recordGameTime(ms) {
    if (ms <= 0) return;
    var stats = getStats();
    saveStats(Object.assign({}, stats, { totalTimePlayed: stats.totalTimePlayed + ms }));
}

export function recordBestScore(level, score) {
    var stats = getStats();
    var newBest = Object.assign({}, stats.bestScoreByLevel);
    if (score > (newBest[level] || 0)) {
        newBest[level] = score;
    }
    saveStats(Object.assign({}, stats, { bestScoreByLevel: newBest }));
}

export function recordEndlessWave(wave) {
    var stats = getStats();
    if (wave > stats.bestEndlessWave) {
        saveStats(Object.assign({}, stats, { bestEndlessWave: wave }));
    }
}

// --- Rendering ---

function formatTime(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    if (hours > 0) {
        return hours + 'h ' + minutes + 'm';
    }
    if (minutes > 0) {
        return minutes + 'm ' + seconds + 's';
    }
    return seconds + 's';
}

function formatTimeShort(ms) {
    if (ms <= 0) return '--';
    var totalSeconds = Math.floor(ms / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    if (minutes > 0) {
        return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    }
    return seconds + 's';
}

export function getStatsRowCount() {
    // 8 general stat rows + header + spacer + per-level header + 10 level rows
    return 8 + 1 + 1 + MAX_LEVEL;
}

export function renderStats(ctx, scrollOffset) {
    var stats = getStats();

    var listY = 75;
    var rowH = 24;

    // General stats
    var generalStats = [
        { label: 'Games Played', value: String(stats.gamesPlayed), color: '#e0e0e0' },
        { label: 'Total Food Eaten', value: String(stats.totalFoodEaten), color: '#22c55e' },
        { label: 'Total Deaths', value: String(stats.totalDeaths), color: '#ef4444' },
        { label: 'Time Played', value: formatTime(stats.totalTimePlayed), color: '#4a9eff' },
        { label: 'Longest Snake', value: String(stats.longestSnake), color: '#eab308' },
        { label: 'Portals Used', value: String(stats.portalsUsed), color: '#8b5cf6' },
        { label: 'Power-ups Collected', value: String(stats.powerUpsCollected), color: '#06b6d4' },
        { label: 'Best Endless Wave', value: stats.bestEndlessWave > 0 ? String(stats.bestEndlessWave) : '--', color: '#ef4444' },
    ];

    var allRows = [];
    for (var gi = 0; gi < generalStats.length; gi++) {
        allRows.push({ type: 'stat', data: generalStats[gi] });
    }
    allRows.push({ type: 'spacer' });
    allRows.push({ type: 'header', text: 'PER-LEVEL RECORDS' });

    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
        allRows.push({
            type: 'level',
            level: lv,
            deaths: stats.deathsByLevel[lv] || 0,
            bestScore: stats.bestScoreByLevel[lv] || 0,
            fastest: stats.fastestLevelMs[lv] || 0,
        });
    }

    var visible = Math.floor((CANVAS_SIZE - listY - 50) / rowH);
    var startIdx = scrollOffset;
    var endIdx = Math.min(startIdx + visible, allRows.length);

    for (var i = startIdx; i < endIdx; i++) {
        var row = allRows[i];
        var y = listY + (i - startIdx) * rowH;

        if (row.type === 'spacer') {
            continue;
        }

        if (row.type === 'header') {
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(74, 158, 255, 0.6)';
            ctx.font = 'bold 10px Courier New';
            ctx.fillText(row.text, CANVAS_SIZE / 2, y + 4);
            ctx.strokeStyle = 'rgba(74, 158, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(60, y + 10);
            ctx.lineTo(CANVAS_SIZE - 60, y + 10);
            ctx.stroke();
            ctx.textAlign = 'left';
            continue;
        }

        if (row.type === 'stat') {
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(180, 180, 190, 0.6)';
            ctx.font = '11px Courier New';
            ctx.fillText(row.data.label, 30, y + 4);

            ctx.textAlign = 'right';
            ctx.fillStyle = row.data.color;
            ctx.font = 'bold 11px Courier New';
            ctx.fillText(row.data.value, CANVAS_SIZE - 30, y + 4);
            ctx.textAlign = 'left';
            continue;
        }

        if (row.type === 'level') {
            // Level color dot
            var lvConfig = LEVEL_CONFIG[row.level];
            ctx.fillStyle = lvConfig ? lvConfig.color : '#666';
            ctx.beginPath();
            ctx.arc(24, y, 3, 0, Math.PI * 2);
            ctx.fill();

            // Level name
            ctx.textAlign = 'left';
            ctx.fillStyle = '#e0e0e0';
            ctx.font = '10px Courier New';
            ctx.fillText(row.level + '. ' + (LEVEL_NAMES[row.level] || ''), 34, y + 4);

            // Deaths / Best / Fastest
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(180, 180, 190, 0.5)';
            ctx.font = '9px Courier New';
            var detail = '\u2620' + row.deaths;
            detail += '  \u2605' + (row.bestScore > 0 ? row.bestScore : '--');
            detail += '  \u23F1' + formatTimeShort(row.fastest);
            ctx.fillText(detail, CANVAS_SIZE - 16, y + 4);
            ctx.textAlign = 'left';
        }
    }

    // Scrollbar
    if (allRows.length > visible) {
        var maxScroll = allRows.length - visible;
        var frac = scrollOffset / Math.max(1, maxScroll);
        var trackH = CANVAS_SIZE - listY - 50;
        var thumbH = Math.max(20, trackH * (visible / allRows.length));
        var thumbY = listY + frac * (trackH - thumbH);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
        ctx.fillRect(CANVAS_SIZE - 8, thumbY, 4, thumbH);
    }

    return allRows.length;
}
