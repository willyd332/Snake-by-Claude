'use strict';

import { CANVAS_SIZE } from './constants.js';
import { renderStats, getStatsRowCount } from './stats.js';

// --- Storage Keys ---
var STORAGE_KEY = 'snake-achievements';
var SKIN_KEY = 'snake-active-skin';
var TRAIL_KEY = 'snake-active-trail';

// --- Achievement Definitions (20 total) ---
export var ACHIEVEMENTS = [
    { id: 'first_byte', name: 'First Byte', desc: 'Score 100 points', category: 'score' },
    { id: 'data_hoarder', name: 'Data Hoarder', desc: 'Score 500 points', category: 'score' },
    { id: 'megabyte', name: 'Megabyte', desc: 'Score 1000 points', category: 'score' },
    { id: 'boot_sequence', name: 'Boot Sequence', desc: 'Complete Level 1', category: 'progress' },
    { id: 'deep_dive', name: 'Deep Dive', desc: 'Reach Level 5', category: 'progress' },
    { id: 'the_core', name: 'The Core', desc: 'Reach Level 10', category: 'progress' },
    { id: 'transcendence', name: 'Transcendence', desc: 'Trigger the Awakening', category: 'progress' },
    { id: 'rainbow_road', name: 'Rainbow Road', desc: 'Activate Konami code', category: 'secret' },
    { id: 'red_pill', name: 'Red Pill', desc: 'Enter the data stream', category: 'secret' },
    { id: 'upside_down', name: 'Upside Down', desc: 'Invert reality', category: 'secret' },
    { id: 'root_access', name: 'Root Access', desc: 'Open the dev console', category: 'secret' },
    { id: 'archaeologist', name: 'Archaeologist', desc: 'Collect 5 data fragments', category: 'collect' },
    { id: 'full_archive', name: 'Full Archive', desc: 'All 10 fragments collected', category: 'collect' },
    { id: 'all_endings', name: 'All Endings', desc: 'See every ending', category: 'collect' },
    { id: 'endurance', name: 'Endurance', desc: 'Reach Endless wave 10', category: 'endless' },
    { id: 'marathoner', name: 'Marathoner', desc: 'Reach Endless wave 25', category: 'endless' },
    { id: 'ghost_rider', name: 'Ghost Rider', desc: 'Collect a Ghost power-up', category: 'skill' },
    { id: 'speed_demon', name: 'Speed Demon', desc: 'Clear a level in under 20s', category: 'skill' },
    { id: 'untouchable', name: 'Untouchable', desc: 'Survive Level 8', category: 'skill' },
    { id: 'survivor', name: 'Survivor', desc: 'Arena shrinks to 8x8', category: 'skill' },
];

var CATEGORY_COLORS = {
    score: '#fbbf24',
    progress: '#22c55e',
    secret: '#a855f7',
    collect: '#4a9eff',
    endless: '#ef4444',
    skill: '#06b6d4',
};

var CATEGORY_NAMES = {
    score: 'SCORE',
    progress: 'PROGRESS',
    secret: 'SECRETS',
    collect: 'COLLECTION',
    endless: 'ENDLESS',
    skill: 'SKILL',
};

// --- Skin Definitions ---
export var SKINS = [
    { id: 'default', name: 'Default', desc: 'Classic blocks', unlockedBy: null },
    { id: 'neon', name: 'Neon', desc: 'Glowing outline', unlockedBy: 'first_byte' },
    { id: 'pixel', name: 'Pixel', desc: 'Retro dots', unlockedBy: 'boot_sequence' },
    { id: 'spectral', name: 'Spectral', desc: 'Ghostly aura', unlockedBy: 'ghost_rider' },
    { id: 'digital', name: 'Digital', desc: 'Binary pattern', unlockedBy: 'the_core' },
    { id: 'chrome', name: 'Chrome', desc: 'Metallic sheen', unlockedBy: 'megabyte' },
];

// --- Trail Definitions ---
export var TRAILS = [
    { id: 'none', name: 'None', desc: 'No trail', unlockedBy: null },
    { id: 'fade', name: 'Fade', desc: 'Fading echo', unlockedBy: 'data_hoarder' },
    { id: 'sparkle', name: 'Sparkle', desc: 'Glitter path', unlockedBy: 'deep_dive' },
    { id: 'digital', name: 'Digital', desc: 'Data residue', unlockedBy: 'full_archive' },
];

// --- Persistence ---
export function getUnlockedAchievements() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

function saveUnlocked(ids) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (e) { /* storage unavailable */ }
}

export function isAchievementUnlocked(id) {
    return getUnlockedAchievements().indexOf(id) !== -1;
}

export function unlockAchievement(id) {
    var unlocked = getUnlockedAchievements();
    if (unlocked.indexOf(id) !== -1) return null;
    var ach = ACHIEVEMENTS.find(function(a) { return a.id === id; });
    if (!ach) return null;
    saveUnlocked(unlocked.concat([id]));
    return ach;
}

// --- Skin / Trail Selection ---
export function getActiveSkin() {
    return localStorage.getItem(SKIN_KEY) || 'default';
}

export function setActiveSkin(id) {
    try { localStorage.setItem(SKIN_KEY, id); } catch (e) { /* storage unavailable */ }
}

export function getActiveTrail() {
    return localStorage.getItem(TRAIL_KEY) || 'none';
}

export function setActiveTrail(id) {
    try { localStorage.setItem(TRAIL_KEY, id); } catch (e) { /* storage unavailable */ }
}

export function isSkinUnlocked(skinId) {
    var skin = SKINS.find(function(s) { return s.id === skinId; });
    if (!skin) return false;
    if (!skin.unlockedBy) return true;
    return isAchievementUnlocked(skin.unlockedBy);
}

export function isTrailUnlocked(trailId) {
    var trail = TRAILS.find(function(t) { return t.id === trailId; });
    if (!trail) return false;
    if (!trail.unlockedBy) return true;
    return isAchievementUnlocked(trail.unlockedBy);
}

// --- Popup ---
export function createPopupState(achievement) {
    return { achievement: achievement, startTime: Date.now(), duration: 3500 };
}

export function renderPopup(ctx, popup) {
    if (!popup) return false;
    var elapsed = Date.now() - popup.startTime;
    if (elapsed > popup.duration) return false;

    var ach = popup.achievement;
    var catColor = CATEGORY_COLORS[ach.category] || '#fff';

    var slideIn = Math.min(elapsed / 300, 1);
    var fadeOut = elapsed > popup.duration - 500 ? (popup.duration - elapsed) / 500 : 1;
    var alpha = slideIn * fadeOut;
    var yOff = -40 + slideIn * 40;

    var barW = 220;
    var barH = 50;
    var barX = CANVAS_SIZE - barW - 10;
    var barY = 10 + yOff;

    ctx.save();
    ctx.globalAlpha = alpha * 0.92;

    ctx.fillStyle = 'rgba(10, 10, 20, 0.9)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = catColor;
    ctx.fillRect(barX, barY, 3, barH);

    ctx.textAlign = 'left';
    ctx.font = '8px Courier New';
    ctx.fillStyle = catColor;
    ctx.fillText(CATEGORY_NAMES[ach.category] || '', barX + 10, barY + 14);

    ctx.font = 'bold 11px Courier New';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(ach.name, barX + 10, barY + 28);

    ctx.font = '9px Courier New';
    ctx.fillStyle = 'rgba(180, 180, 190, 0.8)';
    ctx.fillText(ach.desc, barX + 10, barY + 42);

    ctx.restore();
    return true;
}

// --- Gallery State ---
export function createGalleryState() {
    return { tab: 0, scrollOffset: 0, selectedIndex: 0 };
}

export function getGalleryItemCount(tab) {
    if (tab === 0) return ACHIEVEMENTS.length;
    if (tab === 1) return SKINS.length;
    if (tab === 2) return TRAILS.length;
    return getStatsRowCount();
}

export function renderGallery(ctx, gs) {
    var tab = gs.tab;
    var unlocked = getUnlockedAchievements();

    ctx.fillStyle = '#080812';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 20px Courier New';
    ctx.fillText('TROPHIES', CANVAS_SIZE / 2, 30);

    // Tabs
    var tabs = ['Achievements', 'Skins', 'Trails', 'Stats'];
    var tabSpacing = 80;
    var tabStartX = CANVAS_SIZE / 2 - tabSpacing * 1.5;
    for (var t = 0; t < tabs.length; t++) {
        var tx = tabStartX + t * tabSpacing;
        ctx.fillStyle = t === tab ? '#fbbf24' : 'rgba(150, 150, 170, 0.4)';
        ctx.font = t === tab ? 'bold 11px Courier New' : '11px Courier New';
        ctx.fillText(tabs[t], tx, 50);
    }

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 60);
    ctx.lineTo(CANVAS_SIZE - 40, 60);
    ctx.stroke();

    ctx.textAlign = 'left';

    if (tab === 0) {
        renderAchievementsList(ctx, gs, unlocked);
    } else if (tab === 1) {
        renderRewardList(ctx, SKINS, getActiveSkin(), gs.selectedIndex, unlocked);
    } else if (tab === 2) {
        renderRewardList(ctx, TRAILS, getActiveTrail(), gs.selectedIndex, unlocked);
    } else {
        renderStats(ctx, gs.scrollOffset);
    }

    // Count
    ctx.textAlign = 'center';
    ctx.fillStyle = '#666';
    ctx.font = '10px Courier New';
    if (tab === 0) {
        ctx.fillText(unlocked.length + ' / ' + ACHIEVEMENTS.length + ' unlocked', CANVAS_SIZE / 2, CANVAS_SIZE - 36);
    }

    // Footer
    ctx.fillStyle = 'rgba(150, 150, 170, 0.4)';
    ctx.font = '10px Courier New';
    var hint;
    if (tab === 0 || tab === 3) {
        hint = '\u2191\u2193 Scroll  \u00b7  \u2190\u2192 Tab  \u00b7  ESC Back';
    } else {
        hint = '\u2191\u2193 Select  \u00b7  ENTER Equip  \u00b7  \u2190\u2192 Tab  \u00b7  ESC Back';
    }
    ctx.fillText(hint, CANVAS_SIZE / 2, CANVAS_SIZE - 16);
    ctx.textAlign = 'left';
}

function renderAchievementsList(ctx, gs, unlocked) {
    var listY = 75;
    var itemH = 32;
    var visible = Math.floor((CANVAS_SIZE - listY - 50) / itemH);
    var startIdx = gs.scrollOffset;
    var endIdx = Math.min(startIdx + visible, ACHIEVEMENTS.length);

    for (var i = startIdx; i < endIdx; i++) {
        var ach = ACHIEVEMENTS[i];
        var done = unlocked.indexOf(ach.id) !== -1;
        var y = listY + (i - startIdx) * itemH;
        var catColor = CATEGORY_COLORS[ach.category] || '#fff';

        if (i === gs.selectedIndex) {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.06)';
            ctx.fillRect(15, y - 12, CANVAS_SIZE - 30, itemH);
        }

        if (done) {
            ctx.fillStyle = catColor;
            ctx.shadowColor = catColor;
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(30, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(30, y, 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = done ? '#e0e0e0' : '#444';
        ctx.font = done ? 'bold 11px Courier New' : '11px Courier New';
        ctx.fillText(done ? ach.name : '???', 44, y + 4);

        ctx.fillStyle = done ? 'rgba(180, 180, 190, 0.6)' : '#333';
        ctx.font = '9px Courier New';
        ctx.fillText(done ? ach.desc : 'Locked', 44, y + 16);

        ctx.textAlign = 'right';
        ctx.fillStyle = done ? catColor : '#333';
        ctx.font = '8px Courier New';
        ctx.fillText(CATEGORY_NAMES[ach.category] || '', CANVAS_SIZE - 20, y + 4);
        ctx.textAlign = 'left';
    }

    // Scroll bar
    if (ACHIEVEMENTS.length > visible) {
        var maxScroll = ACHIEVEMENTS.length - visible;
        var frac = gs.scrollOffset / Math.max(1, maxScroll);
        var trackH = CANVAS_SIZE - listY - 50;
        var thumbH = Math.max(20, trackH * (visible / ACHIEVEMENTS.length));
        var thumbY = listY + frac * (trackH - thumbH);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
        ctx.fillRect(CANVAS_SIZE - 8, thumbY, 4, thumbH);
    }
}

function renderRewardList(ctx, items, activeId, selected, unlockedAchievements) {
    var listY = 75;
    var itemH = 48;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var isUnlocked = !item.unlockedBy || unlockedAchievements.indexOf(item.unlockedBy) !== -1;
        var isActive = item.id === activeId;
        var y = listY + i * itemH;

        if (i === selected) {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.06)';
            ctx.fillRect(25, y - 12, CANVAS_SIZE - 50, itemH);
        }
        if (isActive) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1;
            ctx.strokeRect(25, y - 12, CANVAS_SIZE - 50, itemH);
        }

        ctx.fillStyle = isUnlocked ? '#e0e0e0' : '#444';
        ctx.font = isUnlocked ? 'bold 12px Courier New' : '12px Courier New';
        ctx.fillText(isUnlocked ? item.name : '???', 40, y + 4);

        ctx.fillStyle = isUnlocked ? 'rgba(180, 180, 190, 0.6)' : '#333';
        ctx.font = '9px Courier New';
        if (isUnlocked) {
            ctx.fillText(item.desc, 40, y + 18);
        } else {
            var reqAch = ACHIEVEMENTS.find(function(a) { return a.id === item.unlockedBy; });
            ctx.fillText('Requires: ' + (reqAch ? reqAch.name : '???'), 40, y + 18);
        }

        if (isActive) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 10px Courier New';
            ctx.fillText('EQUIPPED', CANVAS_SIZE - 35, y + 4);
            ctx.textAlign = 'left';
        }
    }
}
