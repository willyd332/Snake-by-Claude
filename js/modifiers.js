'use strict';

// --- Run Modifiers System ---
// Optional challenge modes that modify gameplay parameters in exchange
// for score multipliers. Players toggle modifiers on/off before starting a run.

import { CANVAS_SIZE, CELL_SIZE } from './constants.js';
import { isAchievementUnlocked } from './achievements.js';
import { getStats } from './stats.js';

// --- Storage ---
var STORAGE_KEY = 'snake-active-modifiers';

// --- Modifier Definitions ---
// Each modifier has:
//   id            - unique key
//   name          - display name
//   desc          - one-line description
//   scoreBonus    - percentage bonus (e.g. 50 = +50%)
//   color         - theme color for UI
//   icon          - text icon for compact display
//   unlockCheck   - function returning true if unlocked (null = always available)
//   unlockHint    - text shown when locked

export var MODIFIERS = [
    {
        id: 'hardcore',
        name: 'HARDCORE',
        desc: 'No power-ups spawn at all',
        scoreBonus: 50,
        color: '#ef4444',
        icon: '\u2620',
        unlockCheck: function() { return isAchievementUnlocked('endurance'); },
        unlockHint: 'Unlock: Reach wave 10',
    },
    {
        id: 'glass_snake',
        name: 'GLASS SNAKE',
        desc: 'No 180-degree turns allowed ever',
        scoreBonus: 25,
        color: '#e2e8f0',
        icon: '\u26A0',
        unlockCheck: function() { return isAchievementUnlocked('first_wave'); },
        unlockHint: 'Unlock: Complete wave 1',
    },
    {
        id: 'shrinking_world',
        name: 'SHRINKING WORLD',
        desc: 'Walls close in 2x faster',
        scoreBonus: 40,
        color: '#f97316',
        icon: '\u25A3',
        unlockCheck: function() { return isAchievementUnlocked('survivor'); },
        unlockHint: 'Unlock: Arena shrinks to 8x8',
    },
    {
        id: 'hungry',
        name: 'HUNGRY',
        desc: 'Snake loses a segment every 8 moves',
        scoreBonus: 35,
        color: '#22c55e',
        icon: '\u2615',
        unlockCheck: function() { return isAchievementUnlocked('long_snake'); },
        unlockHint: 'Unlock: Reach length 20',
    },
    {
        id: 'foggy',
        name: 'FOGGY',
        desc: 'Permanent fog of war from wave 1',
        scoreBonus: 30,
        color: '#6366f1',
        icon: '\u2601',
        unlockCheck: function() { return isAchievementUnlocked('wave_rider'); },
        unlockHint: 'Unlock: Reach wave 5',
    },
    {
        id: 'speed_demon',
        name: 'SPEED DEMON',
        desc: 'Snake moves 30% faster from wave 1',
        scoreBonus: 20,
        color: '#eab308',
        icon: '\u26A1',
        unlockCheck: null,
        unlockHint: null,
    },
    {
        id: 'one_life',
        name: 'ONE LIFE',
        desc: 'Single life, no death replay',
        scoreBonus: 60,
        color: '#dc2626',
        icon: '\u2764',
        unlockCheck: function() {
            var stats = getStats();
            return stats.totalDeaths >= 100;
        },
        unlockHint: 'Unlock: Die 100 times total',
    },
    {
        id: 'blindspot',
        name: 'BLINDSPOT',
        desc: 'Last 3 snake segments are invisible',
        scoreBonus: 25,
        color: '#8b5cf6',
        icon: '\u25CC',
        unlockCheck: function() { return isAchievementUnlocked('serpent_king'); },
        unlockHint: 'Unlock: Reach length 40',
    },
];

// --- Persistence ---

export function getActiveModifierIds() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

export function saveActiveModifierIds(ids) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (e) { /* storage unavailable */ }
}

export function toggleModifier(id) {
    var current = getActiveModifierIds();
    var idx = current.indexOf(id);
    if (idx !== -1) {
        return current.filter(function(mid) { return mid !== id; });
    }
    return current.concat([id]);
}

export function isModifierUnlocked(id) {
    var mod = MODIFIERS.find(function(m) { return m.id === id; });
    if (!mod) return false;
    if (!mod.unlockCheck) return true;
    return mod.unlockCheck();
}

export function getModifierDef(id) {
    return MODIFIERS.find(function(m) { return m.id === id; }) || null;
}

// --- Score Calculation ---

export function computeModifierMultiplier(activeIds) {
    var totalBonus = 0;
    for (var i = 0; i < activeIds.length; i++) {
        var mod = getModifierDef(activeIds[i]);
        if (mod) {
            totalBonus += mod.scoreBonus;
        }
    }
    return 1 + totalBonus / 100;
}

export function getActiveModifiers() {
    var ids = getActiveModifierIds();
    var result = [];
    for (var i = 0; i < ids.length; i++) {
        var mod = getModifierDef(ids[i]);
        if (mod && isModifierUnlocked(ids[i])) {
            result.push(mod);
        }
    }
    return result;
}

// --- Modifier Application ---
// Returns a patch object to merge into game state at the start of a run.

export function getModifierStatePatch(activeIds) {
    var patch = {
        modifiers: activeIds.slice(),
        modifierMultiplier: computeModifierMultiplier(activeIds),
        hungryCounter: 0,
    };

    for (var i = 0; i < activeIds.length; i++) {
        var id = activeIds[i];
        if (id === 'one_life') {
            patch.lives = 1;
        }
        if (id === 'foggy') {
            patch.fogActive = true;
        }
    }

    return patch;
}

// Check if a specific modifier is active in the current game state
export function isModifierActive(state, modId) {
    if (!state.modifiers) return false;
    return state.modifiers.indexOf(modId) !== -1;
}

// --- Modifier Screen State ---

export function createModifierScreenState() {
    return {
        selectedIndex: 0,
        scrollOffset: 0,
    };
}

// --- Modifier Screen Rendering ---

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

export function renderModifierScreen(ctx, screenState) {
    var activeIds = getActiveModifierIds();
    var selected = screenState.selectedIndex;

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Header with glow
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 20px Courier New';
    ctx.fillText('MODIFIERS', CANVAS_SIZE / 2, 32);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.fillStyle = 'rgba(180, 180, 190, 0.5)';
    ctx.font = '10px Courier New';
    ctx.fillText('Risk / Reward Challenge Modes', CANVAS_SIZE / 2, 46);

    // Divider
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 54);
    ctx.lineTo(CANVAS_SIZE - 60, 54);
    ctx.stroke();

    // Combined multiplier display
    var multiplier = computeModifierMultiplier(activeIds);
    var hasActive = activeIds.length > 0;
    var multColor = hasActive ? '#fbbf24' : 'rgba(120, 120, 140, 0.5)';
    ctx.fillStyle = multColor;
    if (hasActive) {
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 8;
    }
    ctx.font = 'bold 13px Courier New';
    ctx.fillText(
        hasActive
            ? 'SCORE: ' + multiplier.toFixed(2) + 'x (' + activeIds.length + ' active)'
            : 'No modifiers active',
        CANVAS_SIZE / 2,
        70
    );
    ctx.shadowBlur = 0;

    // Modifier list
    var listY = 84;
    var itemH = 42;
    var rowW = CANVAS_SIZE - 40;
    var rowX = 20;
    var maxVisible = Math.floor((CANVAS_SIZE - listY - 50) / itemH);
    var startIdx = screenState.scrollOffset;
    var endIdx = Math.min(startIdx + maxVisible, MODIFIERS.length);

    for (var i = startIdx; i < endIdx; i++) {
        var mod = MODIFIERS[i];
        var isSelected = i === selected;
        var isActive = activeIds.indexOf(mod.id) !== -1;
        var isUnlocked = isModifierUnlocked(mod.id);
        var ry = listY + (i - startIdx) * itemH;

        // Row background
        if (isSelected) {
            roundRect(ctx, rowX, ry, rowW, itemH - 4, 4);
            ctx.fillStyle = isActive
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(74, 158, 255, 0.08)';
            ctx.fill();
            ctx.strokeStyle = isActive
                ? 'rgba(239, 68, 68, 0.3)'
                : 'rgba(74, 158, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (isActive) {
            roundRect(ctx, rowX, ry, rowW, itemH - 4, 4);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
            ctx.fill();
        }

        // Active indicator
        ctx.textAlign = 'left';
        var indicatorX = rowX + 10;
        if (isActive) {
            ctx.fillStyle = mod.color;
            ctx.shadowColor = mod.color;
            ctx.shadowBlur = 6;
            ctx.font = 'bold 14px Courier New';
            ctx.fillText('\u2713', indicatorX, ry + 16);
            ctx.shadowBlur = 0;
        } else if (isUnlocked) {
            ctx.fillStyle = 'rgba(100, 100, 120, 0.4)';
            ctx.font = '14px Courier New';
            ctx.fillText('\u25CB', indicatorX, ry + 16);
        } else {
            ctx.fillStyle = 'rgba(80, 80, 100, 0.3)';
            ctx.font = '14px Courier New';
            ctx.fillText('\u2716', indicatorX, ry + 16);
        }

        // Icon
        var iconX = indicatorX + 20;
        ctx.font = '13px Courier New';
        ctx.fillStyle = isUnlocked ? mod.color : 'rgba(80, 80, 100, 0.4)';
        ctx.fillText(mod.icon, iconX, ry + 16);

        // Name
        var nameX = iconX + 20;
        var nameAlpha = isUnlocked ? (isSelected ? 0.95 : 0.75) : 0.3;
        ctx.fillStyle = isUnlocked
            ? 'rgba(224, 224, 224, ' + nameAlpha + ')'
            : 'rgba(100, 100, 120, 0.4)';
        ctx.font = isSelected ? 'bold 12px Courier New' : '12px Courier New';
        ctx.fillText(isUnlocked ? mod.name : '???', nameX, ry + 16);

        // Description or lock hint
        ctx.fillStyle = isUnlocked
            ? 'rgba(160, 160, 180, ' + (isSelected ? 0.7 : 0.4) + ')'
            : 'rgba(100, 100, 120, 0.35)';
        ctx.font = '9px Courier New';
        ctx.fillText(
            isUnlocked ? mod.desc : (mod.unlockHint || 'Locked'),
            nameX,
            ry + 30
        );

        // Score bonus badge (right side)
        ctx.textAlign = 'right';
        var bonusX = rowX + rowW - 10;
        if (isUnlocked) {
            var bonusAlpha = isActive ? 0.9 : (isSelected ? 0.7 : 0.4);
            ctx.fillStyle = isActive
                ? '#fbbf24'
                : 'rgba(251, 191, 36, ' + bonusAlpha + ')';
            if (isActive) {
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 4;
            }
            ctx.font = isSelected ? 'bold 11px Courier New' : '11px Courier New';
            ctx.fillText('+' + mod.scoreBonus + '%', bonusX, ry + 16);
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = 'rgba(80, 80, 100, 0.3)';
            ctx.font = '10px Courier New';
            ctx.fillText('\u2014', bonusX, ry + 16);
        }

        ctx.textAlign = 'left';
    }

    // Scrollbar (if needed)
    if (MODIFIERS.length > maxVisible) {
        var maxScroll = MODIFIERS.length - maxVisible;
        var frac = screenState.scrollOffset / Math.max(1, maxScroll);
        var trackH = CANVAS_SIZE - listY - 50;
        var thumbH = Math.max(20, trackH * (maxVisible / MODIFIERS.length));
        var thumbY = listY + frac * (trackH - thumbH);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(CANVAS_SIZE - 8, thumbY, 4, thumbH);
    }

    // Footer
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(150, 150, 170, 0.3)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = 'rgba(150, 150, 170, 0.55)';
    ctx.font = '10px Courier New';
    ctx.fillText('\u2191\u2193 Navigate  \u00b7  ENTER Toggle  \u00b7  ESC Back', CANVAS_SIZE / 2, CANVAS_SIZE - 16);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
}
