'use strict';

// --- Shop Screen ---
// Renders a purchasable items shop where players spend Data Fragments
// on premium board themes and run bonuses.

import { CANVAS_SIZE } from './constants.js';
import {
    getProgression, unlockTheme, isThemeUnlocked,
    purchaseRunBonus, isBonusPurchased, setRunBonus,
    RUN_BONUSES,
} from './progression.js';
import { PREMIUM_THEMES } from './background.js';

// --- Shop State ---

var CATEGORY_COUNT = 2;
var CATEGORY_LABELS = ['BOARD THEMES', 'RUN BONUSES'];

/**
 * Create initial shop screen state.
 * @returns {{ category: number, selectedIndex: number, scrollOffset: number, purchaseFlash: number }}
 */
export function createShopState() {
    return {
        category: 0,
        selectedIndex: 0,
        scrollOffset: 0,
        purchaseFlash: 0,
    };
}

/**
 * Get the items for the current shop category.
 * @param {number} category
 * @returns {Array}
 */
function getItemsForCategory(category) {
    if (category === 0) return PREMIUM_THEMES;
    return RUN_BONUSES;
}

/**
 * Get the item count for the current category.
 * @param {number} category
 * @returns {number}
 */
export function getShopItemCount(category) {
    return getItemsForCategory(category).length;
}

/**
 * Handle purchase attempt for the currently selected item.
 * @param {{ category: number, selectedIndex: number }} shopState
 * @returns {{ success: boolean, message: string }}
 */
export function handleShopPurchase(shopState) {
    var items = getItemsForCategory(shopState.category);
    var item = items[shopState.selectedIndex];
    if (!item) return { success: false, message: 'Invalid selection' };

    var prog = getProgression();

    if (shopState.category === 0) {
        // Theme purchase
        if (isThemeUnlocked(item.id)) {
            return { success: false, message: 'Already owned' };
        }
        if (prog.fragments < item.price) {
            return { success: false, message: 'Not enough fragments' };
        }
        var themeResult = unlockTheme(item.id, item.price);
        if (themeResult) {
            return { success: true, message: item.label + ' unlocked!' };
        }
        return { success: false, message: 'Purchase failed' };
    }

    // Run bonus purchase or toggle
    if (isBonusPurchased(item.id)) {
        // Toggle active/inactive
        var currentBonus = prog.active_run_bonus;
        if (currentBonus === item.id) {
            setRunBonus(null);
            return { success: true, message: item.name + ' deactivated' };
        }
        setRunBonus(item.id);
        return { success: true, message: item.name + ' activated!' };
    }

    if (prog.fragments < item.price) {
        return { success: false, message: 'Not enough fragments' };
    }
    var bonusResult = purchaseRunBonus(item.id, item.price);
    if (bonusResult) {
        setRunBonus(item.id);
        return { success: true, message: item.name + ' purchased & activated!' };
    }
    return { success: false, message: 'Purchase failed' };
}

// --- Rendering Helpers ---

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

// --- Main Render ---

/**
 * Render the shop screen onto the game canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ category: number, selectedIndex: number, scrollOffset: number, purchaseFlash: number }} shopState
 */
export function renderShopScreen(ctx, shopState) {
    var prog = getProgression();
    var category = shopState.category;
    var selected = shopState.selectedIndex;
    var now = Date.now();

    // Background
    ctx.fillStyle = '#080812';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Header
    ctx.textAlign = 'center';
    ctx.shadowColor = '#4a9eff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 16px Courier New';
    ctx.fillText('[ DATA FRAGMENT SHOP ]', CANVAS_SIZE / 2, 28);
    ctx.shadowBlur = 0;

    // Fragment balance
    var balancePulse = Math.sin(now / 600) * 0.15 + 0.85;
    ctx.fillStyle = 'rgba(251, 191, 36, ' + balancePulse + ')';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 8;
    ctx.font = 'bold 14px Courier New';
    ctx.fillText('\u25C6 ' + prog.fragments + ' Fragments', CANVAS_SIZE / 2, 48);
    ctx.shadowBlur = 0;

    // Lifetime earned (subtle)
    ctx.fillStyle = 'rgba(160, 160, 180, 0.35)';
    ctx.font = '9px Courier New';
    ctx.fillText('Lifetime earned: ' + prog.lifetime_earned, CANVAS_SIZE / 2, 62);

    // Category tabs
    var tabSpacing = 120;
    var tabStartX = CANVAS_SIZE / 2 - tabSpacing * 0.5;
    for (var t = 0; t < CATEGORY_COUNT; t++) {
        var tx = tabStartX + t * tabSpacing;
        ctx.fillStyle = t === category ? '#4a9eff' : 'rgba(150, 150, 170, 0.4)';
        ctx.font = t === category ? 'bold 11px Courier New' : '11px Courier New';
        ctx.fillText(CATEGORY_LABELS[t], tx, 82);
    }

    // Tab underline
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 90);
    ctx.lineTo(CANVAS_SIZE - 40, 90);
    ctx.stroke();

    ctx.textAlign = 'left';

    // Item list
    var items = getItemsForCategory(category);
    var listY = 100;
    var itemH = category === 0 ? 52 : 48;
    var maxVisible = Math.floor((CANVAS_SIZE - listY - 55) / itemH);
    var startIdx = shopState.scrollOffset;
    var endIdx = Math.min(startIdx + maxVisible, items.length);

    for (var i = startIdx; i < endIdx; i++) {
        var item = items[i];
        var isSelected = i === selected;
        var ry = listY + (i - startIdx) * itemH;

        var isOwned, isActive;
        if (category === 0) {
            isOwned = isThemeUnlocked(item.id);
            isActive = false; // Themes are applied via settings
        } else {
            isOwned = isBonusPurchased(item.id);
            isActive = prog.active_run_bonus === item.id;
        }

        var rowW = CANVAS_SIZE - 40;
        var rowX = 20;

        // Row background
        if (isSelected) {
            roundRect(ctx, rowX, ry, rowW, itemH - 4, 4);
            ctx.fillStyle = isOwned
                ? 'rgba(34, 197, 94, 0.08)'
                : 'rgba(74, 158, 255, 0.08)';
            ctx.fill();
            ctx.strokeStyle = isOwned
                ? 'rgba(34, 197, 94, 0.25)'
                : 'rgba(74, 158, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (isActive) {
            roundRect(ctx, rowX, ry, rowW, itemH - 4, 4);
            ctx.fillStyle = 'rgba(34, 197, 94, 0.05)';
            ctx.fill();
        }

        // Status indicator
        var indicatorX = rowX + 10;
        if (isActive) {
            ctx.fillStyle = '#22c55e';
            ctx.shadowColor = '#22c55e';
            ctx.shadowBlur = 6;
            ctx.font = 'bold 14px Courier New';
            ctx.fillText('\u2713', indicatorX, ry + 18);
            ctx.shadowBlur = 0;
        } else if (isOwned) {
            ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
            ctx.font = '14px Courier New';
            ctx.fillText('\u2713', indicatorX, ry + 18);
        } else {
            ctx.fillStyle = 'rgba(100, 100, 120, 0.4)';
            ctx.font = '14px Courier New';
            ctx.fillText('\u25CB', indicatorX, ry + 18);
        }

        // Icon
        var iconX = indicatorX + 20;
        var itemColor = item.color || '#4a9eff';
        ctx.font = '13px Courier New';
        ctx.fillStyle = isOwned ? itemColor : 'rgba(180, 180, 190, 0.5)';
        ctx.fillText(item.icon || '\u25A0', iconX, ry + 18);

        // Name
        var nameX = iconX + 22;
        var nameAlpha = isSelected ? 0.95 : 0.7;
        ctx.fillStyle = isOwned
            ? 'rgba(224, 224, 224, ' + nameAlpha + ')'
            : 'rgba(200, 200, 210, ' + nameAlpha + ')';
        ctx.font = isSelected ? 'bold 12px Courier New' : '12px Courier New';
        ctx.fillText(item.name || item.label, nameX, ry + 18);

        // Description
        ctx.fillStyle = 'rgba(160, 160, 180, ' + (isSelected ? 0.65 : 0.4) + ')';
        ctx.font = '9px Courier New';
        ctx.fillText(item.desc || '', nameX, ry + 32);

        // Price or status (right side)
        ctx.textAlign = 'right';
        var priceX = rowX + rowW - 10;

        if (isActive) {
            ctx.fillStyle = '#22c55e';
            ctx.shadowColor = '#22c55e';
            ctx.shadowBlur = 4;
            ctx.font = 'bold 10px Courier New';
            ctx.fillText('ACTIVE', priceX, ry + 18);
            ctx.shadowBlur = 0;
        } else if (isOwned) {
            ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
            ctx.font = '10px Courier New';
            ctx.fillText('OWNED', priceX, ry + 18);
        } else {
            var canAfford = prog.fragments >= item.price;
            ctx.fillStyle = canAfford
                ? 'rgba(251, 191, 36, ' + (isSelected ? 0.9 : 0.6) + ')'
                : 'rgba(239, 68, 68, ' + (isSelected ? 0.8 : 0.5) + ')';
            if (isSelected && canAfford) {
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 4;
            }
            ctx.font = isSelected ? 'bold 11px Courier New' : '11px Courier New';
            ctx.fillText('\u25C6 ' + item.price, priceX, ry + 18);
            ctx.shadowBlur = 0;
        }

        ctx.textAlign = 'left';
    }

    // Scrollbar
    if (items.length > maxVisible) {
        var maxScroll = items.length - maxVisible;
        var frac = shopState.scrollOffset / Math.max(1, maxScroll);
        var trackH = CANVAS_SIZE - listY - 55;
        var thumbH = Math.max(20, trackH * (maxVisible / items.length));
        var thumbY = listY + frac * (trackH - thumbH);
        ctx.fillStyle = 'rgba(74, 158, 255, 0.15)';
        ctx.fillRect(CANVAS_SIZE - 8, thumbY, 4, thumbH);
    }

    // Purchase flash message
    if (shopState.purchaseFlash > 0) {
        var FLASH_DURATION = 1500;
        var elapsed = Date.now() - shopState.purchaseFlash;
        var flashAlpha = Math.max(0, 1 - elapsed / FLASH_DURATION);
        if (flashAlpha > 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(34, 197, 94, ' + flashAlpha + ')';
            ctx.shadowColor = '#22c55e';
            ctx.shadowBlur = 8;
            ctx.font = 'bold 12px Courier New';
            ctx.fillText('Purchase successful!', CANVAS_SIZE / 2, CANVAS_SIZE - 55);
            ctx.shadowBlur = 0;
        }
    }

    // Footer
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(150, 150, 170, 0.3)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = 'rgba(150, 150, 170, 0.55)';
    ctx.font = '10px Courier New';
    ctx.fillText('\u2191\u2193 Navigate  \u00b7  \u2190\u2192 Category  \u00b7  ENTER Buy/Toggle  \u00b7  ESC Back', CANVAS_SIZE / 2, CANVAS_SIZE - 16);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
}
