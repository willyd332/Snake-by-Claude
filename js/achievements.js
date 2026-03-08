'use strict';

import { CANVAS_SIZE } from './constants.js';
import { renderStats, getStatsRowCount } from './stats.js';

// --- Storage Keys ---
var STORAGE_KEY = 'snake-achievements';
var SKIN_KEY = 'snake-active-skin';
var TRAIL_KEY = 'snake-active-trail';

// --- Achievement Definitions (53 total: 28 original + 25 new) ---
export var ACHIEVEMENTS = [
    // Score milestones (5)
    { id: 'first_byte', name: 'First Byte', desc: 'Score 100 points', category: 'score' },
    { id: 'data_hoarder', name: 'Data Hoarder', desc: 'Score 500 points', category: 'score' },
    { id: 'megabyte', name: 'Megabyte', desc: 'Score 1000 points', category: 'score' },
    { id: 'centurion', name: 'Centurion', desc: 'Score 2000 points', category: 'score' },
    { id: 'transcendent', name: 'Transcendent', desc: 'Score 5000 points', category: 'score' },
    // Wave milestones (6)
    { id: 'first_wave', name: 'First Wave', desc: 'Complete wave 1', category: 'endless' },
    { id: 'wave_rider', name: 'Wave Rider', desc: 'Reach wave 5', category: 'endless' },
    { id: 'endurance', name: 'Endurance', desc: 'Reach wave 10', category: 'endless' },
    { id: 'deep_runner', name: 'Deep Runner', desc: 'Reach wave 15', category: 'endless' },
    { id: 'marathoner', name: 'Marathoner', desc: 'Reach wave 25', category: 'endless' },
    { id: 'legend', name: 'Legend', desc: 'Reach wave 50', category: 'endless' },
    // Skill-based (10)
    { id: 'ghost_rider', name: 'Ghost Rider', desc: 'Collect a Ghost power-up', category: 'skill' },
    { id: 'power_collector', name: 'Power Collector', desc: 'Collect a Slow power-up', category: 'skill' },
    { id: 'long_snake', name: 'Long Snake', desc: 'Reach length 20', category: 'skill' },
    { id: 'serpent_king', name: 'Serpent King', desc: 'Reach length 40', category: 'skill' },
    { id: 'speed_demon', name: 'Speed Demon', desc: 'Survive at max speed (wave 21+)', category: 'skill' },
    { id: 'portal_master', name: 'Portal Master', desc: 'Use a portal', category: 'skill' },
    { id: 'survivor', name: 'Survivor', desc: 'Arena shrinks to 8x8', category: 'skill' },
    { id: 'close_call', name: 'Close Call', desc: 'Arena shrinks to 6x6', category: 'skill' },
    { id: 'hunter_survivor', name: 'Hunter Survivor', desc: 'Survive ALPHA for a full wave', category: 'skill' },
    { id: 'iron_will', name: 'Iron Will', desc: 'Reach wave 5 without losing a life', category: 'skill' },
    { id: 'feeding_frenzy', name: 'Feeding Frenzy', desc: 'Eat all 3 frenzy food items during a Frenzy', category: 'skill' },
    // Streak (2)
    { id: 'relentless', name: 'Relentless', desc: 'Reach a 5-run streak', category: 'skill' },
    { id: 'possessed', name: 'Possessed', desc: 'Reach a 10-run streak', category: 'skill' },
    // Secrets (4)
    { id: 'rainbow_road', name: 'Rainbow Road', desc: 'Activate Konami code', category: 'secret' },
    { id: 'red_pill', name: 'Red Pill', desc: 'Enter the data stream', category: 'secret' },
    { id: 'upside_down', name: 'Upside Down', desc: 'Invert reality', category: 'secret' },
    { id: 'root_access', name: 'Root Access', desc: 'Open the dev console', category: 'secret' },

    // --- NEW ACHIEVEMENTS (25) ---

    // Score milestones — extended (2)
    { id: 'gigabyte', name: 'Gigabyte', desc: 'Score 10,000 points in one run', category: 'score' },
    { id: 'terabyte', name: 'Terabyte', desc: 'Score 25,000 points in one run', category: 'score' },

    // Wave milestones — extended (2)
    { id: 'deep_space', name: 'Deep Space', desc: 'Reach wave 75', category: 'endless' },
    { id: 'century', name: 'Century', desc: 'Reach wave 100', category: 'endless' },

    // Survival / endurance (4)
    { id: 'serpent_god', name: 'Serpent God', desc: 'Reach length 60', category: 'skill' },
    { id: 'iron_core', name: 'Iron Core', desc: 'Reach wave 10 without losing a life', category: 'skill' },
    { id: 'long_haul', name: 'Long Haul', desc: 'Play for 10 minutes total (lifetime)', category: 'skill' },
    { id: 'alpha_dodger', name: 'Alpha Dodger', desc: 'Survive 3 waves in a row while ALPHA hunts you', category: 'skill' },

    // Power-up mastery (4)
    { id: 'power_addict', name: 'Power Addict', desc: 'Collect 50 power-ups (lifetime)', category: 'skill' },
    { id: 'type_collector', name: 'Type Collector', desc: 'Collect every power-up type at least once', category: 'skill' },
    { id: 'pacifist', name: 'Pacifist', desc: 'Complete a wave without collecting any power-ups', category: 'skill' },
    { id: 'shield_hero', name: 'Shield Hero', desc: 'Have Shield absorb 5 hits (lifetime)', category: 'skill' },

    // Speed / skill (4)
    { id: 'combo_king', name: 'Combo King', desc: 'Reach the maximum x5 combo multiplier', category: 'skill' },
    { id: 'hypnotic', name: 'Hypnotic', desc: 'Eat 20 foods in a single combo chain', category: 'skill' },
    { id: 'ghost_zone', name: 'Ghost Zone', desc: 'Eat food in a score zone while Ghost is active', category: 'skill' },
    { id: 'quick_draw', name: 'Quick Draw', desc: 'Eat 3 foods in a score zone in one wave', category: 'skill' },

    // Exploration / discovery (4)
    { id: 'portal_hopper', name: 'Portal Hopper', desc: 'Use 10 portals in a single run', category: 'skill' },
    { id: 'zone_hunter', name: 'Zone Hunter', desc: 'Eat food in a x3 score multiplier zone', category: 'skill' },
    { id: 'wrap_survivor', name: 'Wrap Survivor', desc: 'Survive 5 waves with wrap-around active', category: 'skill' },
    { id: 'foodie', name: 'Foodie', desc: 'Eat 1000 food items total (lifetime)', category: 'skill' },

    // Meta / fun (5)
    { id: 'hunter_bait', name: 'Hunter Bait', desc: 'Be eliminated by ALPHA (not walls or self)', category: 'skill' },
    { id: 'big_eater', name: 'Big Eater', desc: 'Eat 100 food items in one run', category: 'skill' },
    { id: 'no_power_legend', name: 'Purist', desc: 'Reach wave 15 without ever collecting a power-up', category: 'skill' },
    { id: 'combo_zone', name: 'Combo Zone', desc: 'Eat food in a score zone while at x3 or higher combo', category: 'skill' },
    { id: 'completionist', name: 'The Completionist', desc: 'Unlock all other achievements', category: 'secret' },
];

var CATEGORY_COLORS = {
    score: '#fbbf24',
    endless: '#ef4444',
    skill: '#06b6d4',
    secret: '#a855f7',
};

var CATEGORY_NAMES = {
    score: 'SCORE',
    endless: 'ENDLESS',
    skill: 'SKILL',
    secret: 'SECRETS',
};

// --- Skin Definitions ---
export var SKINS = [
    { id: 'default', name: 'Default', desc: 'Classic blocks', unlockedBy: null },
    { id: 'neon', name: 'Neon', desc: 'Glowing outline', unlockedBy: 'first_byte' },
    { id: 'pixel', name: 'Pixel', desc: 'Retro dots', unlockedBy: 'first_wave' },
    { id: 'spectral', name: 'Spectral', desc: 'Ghostly aura', unlockedBy: 'ghost_rider' },
    { id: 'digital', name: 'Digital', desc: 'Binary pattern', unlockedBy: 'deep_runner' },
    { id: 'chrome', name: 'Chrome', desc: 'Metallic sheen', unlockedBy: 'megabyte' },
    // --- New Skins ---
    { id: 'plasma', name: 'Plasma', desc: 'Superheated energy core', unlockedBy: 'centurion' },
    { id: 'lava', name: 'Lava', desc: 'Molten data fragment', unlockedBy: 'endurance' },
    { id: 'galaxy', name: 'Galaxy', desc: 'Stardust and void', unlockedBy: 'deep_runner' },
    { id: 'toxic', name: 'Toxic', desc: 'Corrupted sector glow', unlockedBy: 'serpent_king' },
    { id: 'sunset', name: 'Sunset', desc: 'Gradient memory burn', unlockedBy: 'wave_rider' },
    { id: 'ice', name: 'Ice', desc: 'Frozen instruction set', unlockedBy: 'iron_will' },
    { id: 'ember', name: 'Ember', desc: 'Dying process heat', unlockedBy: 'speed_demon' },
    { id: 'void', name: 'Void', desc: 'Null pointer incarnate', unlockedBy: 'legend' },
];

// --- Trail Definitions ---
export var TRAILS = [
    { id: 'none', name: 'None', desc: 'No trail', unlockedBy: null },
    { id: 'fade', name: 'Fade', desc: 'Fading echo', unlockedBy: 'data_hoarder' },
    { id: 'sparkle', name: 'Sparkle', desc: 'Glitter path', unlockedBy: 'wave_rider' },
    { id: 'digital', name: 'Digital', desc: 'Data residue', unlockedBy: 'long_snake' },
    // --- New Trails ---
    { id: 'smoke', name: 'Smoke', desc: 'Dissipating process exhaust', unlockedBy: 'endurance' },
    { id: 'lightning', name: 'Lightning', desc: 'Electric discharge burst', unlockedBy: 'speed_demon' },
    { id: 'ripple', name: 'Ripple', desc: 'Expanding waveform rings', unlockedBy: 'portal_master' },
    { id: 'crystal', name: 'Crystal', desc: 'Fractured data shards', unlockedBy: 'deep_runner' },
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
