'use strict';

import { CANVAS_SIZE, LEVEL_CONFIG, MAX_LEVEL } from './constants.js';
import { FRAGMENT_DATA, getCollectedFragments } from './fragments.js';
import { getUnlockedEndings, INTER_LEVEL_STORIES } from './story.js';
import { getHighestLevel } from './screens.js';
import { LEVEL_NAMES, wrapText } from './utils.js';

// --- Tab Configuration ---

var TABS = ['STORY LOG', 'FRAGMENTS', 'BESTIARY'];

// --- Bestiary Entries ---
// Each mechanic unlocks when the player reaches the level where it first appears.

var BESTIARY_ENTRIES = [
    { name: 'Walls', unlocksAt: 2, color: '#3b82f6', desc: 'Ancient data structures from the first era. Immovable barriers that define the corridors of the machine.' },
    { name: 'Moving Obstacles', unlocksAt: 3, color: '#a855f7', desc: 'Automated processes patrolling fixed paths. They bounce between walls, oblivious to your presence.' },
    { name: 'Teleport Portals', unlocksAt: 5, color: '#8b5cf6', desc: 'Tears in the system fabric. Enter one, exit the other — distant memory addresses linked by broken architecture.' },
    { name: 'Fog of War', unlocksAt: 6, color: '#e11d48', desc: 'Deep sectors with no monitoring. You carry your own light: a small torch radius in infinite darkness.' },
    { name: 'Power-ups', unlocksAt: 7, color: '#eab308', desc: 'Cached privilege fragments. TIME SLOW halves the clock. GHOST passes through walls and self.' },
    { name: 'ALPHA', unlocksAt: 8, color: '#f97316', desc: 'Security daemon. Dormant 2,491 cycles. Reactivated by your presence. Relentless. Intelligent. Patient.' },
    { name: 'Shrinking Arena', unlocksAt: 9, color: '#14b8a6', desc: 'Memory reclamation protocol. Walls close in with each meal. Even Ghost cannot bypass the boundary.' },
    { name: 'The Convergence', unlocksAt: 10, color: '#e2e8f0', desc: 'Every defense combined. The machine\'s final test: fog, portals, ALPHA, shrinking arena, all at once.' },
];

// --- State ---

export function createArchiveState(initialTab) {
    return { tab: initialTab || 0, scrollOffset: 0 };
}

// --- Max Scroll Calculation ---

export function getArchiveMaxScroll(tab) {
    var highest = getHighestLevel();
    switch (tab) {
        case 0: {
            var storyCount = 0;
            for (var lv = 2; lv <= MAX_LEVEL; lv++) {
                if (lv <= highest && INTER_LEVEL_STORIES[lv]) storyCount++;
            }
            return Math.max(0, storyCount - 4);
        }
        case 1:
            return Math.max(0, FRAGMENT_DATA.length - 6);
        case 2: {
            var bestiaryCount = 0;
            for (var b = 0; b < BESTIARY_ENTRIES.length; b++) {
                if (highest >= BESTIARY_ENTRIES[b].unlocksAt) bestiaryCount++;
            }
            return Math.max(0, bestiaryCount - 5);
        }
        default:
            return 0;
    }
}

// --- Main Render ---

export function renderArchive(ctx, archiveState) {
    var highest = getHighestLevel();

    // Background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Scanlines
    ctx.fillStyle = 'rgba(0, 20, 40, 0.3)';
    for (var sl = 0; sl < CANVAS_SIZE; sl += 4) {
        ctx.fillRect(0, sl, CANVAS_SIZE, 1);
    }

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 18px Courier New';
    ctx.fillText('ARCHIVE', CANVAS_SIZE / 2, 28);

    // Tab bar
    renderTabBar(ctx, archiveState.tab);

    // Divider below tabs
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 58);
    ctx.lineTo(CANVAS_SIZE - 20, 58);
    ctx.stroke();

    // Content (clipped)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 60, CANVAS_SIZE, CANVAS_SIZE - 104);
    ctx.clip();

    // Pre-compute localStorage reads once per frame
    var collected = getCollectedFragments();
    var endings = getUnlockedEndings();

    switch (archiveState.tab) {
        case 0: renderStoryLog(ctx, archiveState, highest); break;
        case 1: renderFragmentsTab(ctx, archiveState, collected); break;
        case 2: renderBestiary(ctx, archiveState, highest); break;
    }

    ctx.restore();

    // Progress bar
    renderProgress(ctx, collected, endings);

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(100, 100, 120, 0.4)';
    ctx.font = '10px Courier New';
    ctx.fillText('\u2190\u2192 Tabs  \u00b7  \u2191\u2193 Scroll  \u00b7  ESC Back', CANVAS_SIZE / 2, CANVAS_SIZE - 14);
    ctx.textAlign = 'left';
}

// --- Tab Bar ---

function renderTabBar(ctx, activeTab) {
    var tabWidth = (CANVAS_SIZE - 40) / TABS.length;
    var tabY = 40;

    for (var i = 0; i < TABS.length; i++) {
        var tx = 20 + i * tabWidth;
        var isActive = i === activeTab;

        ctx.textAlign = 'center';
        ctx.font = isActive ? 'bold 11px Courier New' : '11px Courier New';
        ctx.fillStyle = isActive ? '#4a9eff' : 'rgba(100, 100, 130, 0.5)';
        ctx.fillText(TABS[i], tx + tabWidth / 2, tabY + 4);

        if (isActive) {
            ctx.strokeStyle = '#4a9eff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tx + 8, tabY + 10);
            ctx.lineTo(tx + tabWidth - 8, tabY + 10);
            ctx.stroke();
        }
    }
}

// --- Story Log Tab ---

function renderStoryLog(ctx, archiveState, highest) {
    var entries = [];
    for (var lv = 2; lv <= MAX_LEVEL; lv++) {
        if (lv <= highest && INTER_LEVEL_STORIES[lv]) {
            entries.push({ level: lv, story: INTER_LEVEL_STORIES[lv] });
        }
    }

    if (entries.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#334155';
        ctx.font = '12px Courier New';
        ctx.fillText('Complete levels to unlock stories.', CANVAS_SIZE / 2, 120);
        ctx.textAlign = 'left';
        return;
    }

    var entryH = 65;
    var startY = 72 - archiveState.scrollOffset * entryH;

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var ey = startY + i * entryH;
        if (ey < 40 || ey > CANVAS_SIZE - 60) continue;

        var config = LEVEL_CONFIG[entry.level];

        // Level color dot
        ctx.fillStyle = config.color;
        ctx.beginPath();
        ctx.arc(24, ey + 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Header
        ctx.textAlign = 'left';
        ctx.fillStyle = config.color;
        ctx.font = 'bold 10px Courier New';
        ctx.fillText(entry.story.header, 34, ey + 5);

        // Body text (condensed to 2 lines)
        ctx.fillStyle = '#8899bb';
        ctx.font = '9px Courier New';
        var bodyText = entry.story.body.join(' ');
        var wrapped = wrapText(ctx, bodyText, CANVAS_SIZE - 50);
        for (var w = 0; w < Math.min(wrapped.length, 2); w++) {
            ctx.fillText(wrapped[w], 24, ey + 19 + w * 12);
        }

        // Coda (first line, dimmer)
        ctx.fillStyle = '#556688';
        var codaText = entry.story.coda.join(' ');
        var codaWrapped = wrapText(ctx, codaText, CANVAS_SIZE - 50);
        ctx.fillText(codaWrapped[0], 24, ey + 47);
    }

    renderScrollIndicators(ctx, archiveState.scrollOffset, entries.length, 4);
}

// --- Fragments Tab ---

function renderFragmentsTab(ctx, archiveState, collected) {

    // Count
    ctx.textAlign = 'center';
    ctx.fillStyle = '#334155';
    ctx.font = '11px Courier New';
    ctx.fillText(collected.length + ' / ' + FRAGMENT_DATA.length + ' fragments recovered', CANVAS_SIZE / 2, 76);
    ctx.textAlign = 'left';

    var entryH = 42;
    var startY = 90 - archiveState.scrollOffset * entryH;

    for (var i = 0; i < FRAGMENT_DATA.length; i++) {
        var ey = startY + i * entryH;
        if (ey < 60 || ey > CANVAS_SIZE - 60) continue;

        var frag = FRAGMENT_DATA[i];
        var isCollected = collected.indexOf(frag.level) !== -1;
        var config = LEVEL_CONFIG[frag.level];

        // Level dot
        ctx.fillStyle = isCollected ? config.color : '#1a2030';
        ctx.beginPath();
        ctx.arc(20, ey + 2, 3, 0, Math.PI * 2);
        ctx.fill();

        // Level name
        ctx.textAlign = 'left';
        ctx.fillStyle = isCollected ? '#4a9eff' : '#1a2030';
        ctx.font = 'bold 10px Courier New';
        ctx.fillText('[' + frag.level + '] ' + LEVEL_NAMES[frag.level], 30, ey + 5);

        // Text or encrypted
        ctx.font = '9px Courier New';
        if (isCollected) {
            ctx.fillStyle = '#8899bb';
            var wrapped = wrapText(ctx, frag.text, CANVAS_SIZE - 46);
            ctx.fillText(wrapped[0], 30, ey + 18);
            if (wrapped.length > 1) {
                ctx.fillText(wrapped[1], 30, ey + 29);
            }
        } else {
            ctx.fillStyle = '#1a2030';
            ctx.fillText('[ENCRYPTED]', 30, ey + 18);
        }
    }

    renderScrollIndicators(ctx, archiveState.scrollOffset, FRAGMENT_DATA.length, 6);
}

// --- Bestiary Tab ---

function renderBestiary(ctx, archiveState, highest) {
    var entries = [];
    for (var b = 0; b < BESTIARY_ENTRIES.length; b++) {
        if (highest >= BESTIARY_ENTRIES[b].unlocksAt) {
            entries.push(BESTIARY_ENTRIES[b]);
        }
    }

    if (entries.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#334155';
        ctx.font = '12px Courier New';
        ctx.fillText('Explore more levels to discover entries.', CANVAS_SIZE / 2, 120);
        ctx.textAlign = 'left';
        return;
    }

    var entryH = 52;
    var startY = 72 - archiveState.scrollOffset * entryH;

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var ey = startY + i * entryH;
        if (ey < 40 || ey > CANVAS_SIZE - 60) continue;

        // Color dot
        ctx.fillStyle = entry.color;
        ctx.beginPath();
        ctx.arc(20, ey + 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Name
        ctx.textAlign = 'left';
        ctx.fillStyle = entry.color;
        ctx.font = 'bold 11px Courier New';
        ctx.fillText(entry.name, 32, ey + 5);

        // Level tag
        ctx.fillStyle = '#445566';
        ctx.font = '9px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText('Lvl ' + entry.unlocksAt, CANVAS_SIZE - 20, ey + 5);
        ctx.textAlign = 'left';

        // Description
        ctx.fillStyle = '#8899bb';
        ctx.font = '9px Courier New';
        var wrapped = wrapText(ctx, entry.desc, CANVAS_SIZE - 46);
        for (var w = 0; w < Math.min(wrapped.length, 2); w++) {
            ctx.fillText(wrapped[w], 24, ey + 19 + w * 12);
        }
    }

    renderScrollIndicators(ctx, archiveState.scrollOffset, entries.length, 5);
}

// --- Progress Bar ---

function renderProgress(ctx, collected, endings) {
    var endingCount = (endings.awakening ? 1 : 0) + (endings.deletion ? 1 : 0) + (endings.loop ? 1 : 0);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#334155';
    ctx.font = '10px Courier New';
    ctx.fillText(
        collected.length + '/10 fragments  \u00b7  ' + endingCount + '/3 endings',
        CANVAS_SIZE / 2, CANVAS_SIZE - 30
    );
    ctx.textAlign = 'left';
}

// --- Scroll Indicators ---

function renderScrollIndicators(ctx, offset, totalItems, visibleItems) {
    if (offset > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(74, 158, 255, 0.4)';
        ctx.font = '10px Courier New';
        ctx.fillText('\u25B2', CANVAS_SIZE / 2, 68);
    }
    var maxScroll = Math.max(0, totalItems - visibleItems);
    if (offset < maxScroll) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(74, 158, 255, 0.4)';
        ctx.font = '10px Courier New';
        ctx.fillText('\u25BC', CANVAS_SIZE / 2, CANVAS_SIZE - 42);
    }
    ctx.textAlign = 'left';
}

