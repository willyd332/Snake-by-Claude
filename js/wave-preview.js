'use strict';

// --- Wave Preview System ---
// Shows a brief overlay before each new wave starts,
// displaying the wave number and active mechanics.

import { getEndlessConfig, getGridSizeForWave } from './endless.js';
import { ENDLESS_GRID_SIZE } from './constants.js';

// Duration the preview overlay is shown (ms)
var PREVIEW_DISPLAY_MS = 2500;
// Fade-in / fade-out durations (ms)
var FADE_IN_MS = 300;
var FADE_OUT_MS = 400;

// --- Mechanic Detection ---

// Mechanic threshold definitions: each entry defines when a mechanic
// becomes active and how to describe it to the player.
var MECHANIC_DESCRIPTORS = [
    {
        key: 'walls',
        minWave: 3,
        icon: '\uD83E\uDDF1',
        label: 'Walls Active',
        color: '#ef4444',
    },
    {
        key: 'obstacles',
        minWave: 5,
        icon: '\u26A0\uFE0F',
        label: 'Moving Obstacles',
        color: '#f97316',
    },
    {
        key: 'powerUps',
        minWave: 6,
        icon: '\u2B50',
        label: 'Power-Ups Enabled',
        color: '#60a5fa',
    },
    {
        key: 'portals',
        minWave: 7,
        icon: '\uD83C\uDF00',
        label: 'Portals Open',
        color: '#8b5cf6',
    },
    {
        key: 'wrapAround',
        minWave: 11,
        icon: '\u267E\uFE0F',
        label: 'Wrap-Around Borders',
        color: '#22d3ee',
    },
    {
        key: 'hunter',
        minWave: 13,
        icon: '\uD83D\uDC7E',
        label: 'ALPHA Hunting',
        color: '#f97316',
    },
    {
        key: 'shrink',
        minWave: 16,
        icon: '\uD83D\uDD25',
        label: 'Shrinking Arena',
        color: '#ef4444',
    },
];

// Returns a list of mechanic descriptions active for the given wave.
// Prioritises newly introduced mechanics and the most impactful ones.
function detectActiveMechanics(wave) {
    var active = [];
    var newlyIntroduced = [];

    for (var i = 0; i < MECHANIC_DESCRIPTORS.length; i++) {
        var desc = MECHANIC_DESCRIPTORS[i];
        if (wave < desc.minWave) continue;

        var isNew = wave === desc.minWave;
        var entry = {
            icon: desc.icon,
            label: desc.label,
            color: desc.color,
            isNew: isNew,
        };

        if (isNew) {
            newlyIntroduced.push(entry);
        } else {
            active.push(entry);
        }
    }

    // Speed info: compute percentage increase from base
    var currentSpeed = getEndlessConfig(wave).speed;
    var speedIncrease = Math.round((1 - currentSpeed / 145) * 100);
    var speedEntry = {
        icon: '\u26A1',
        label: 'Speed +' + speedIncrease + '%',
        color: '#fbbf24',
        isNew: false,
    };

    // Grid expansion info
    var gridSize = getGridSizeForWave(wave);
    var gridExpanded = gridSize > ENDLESS_GRID_SIZE;
    var gridEntry = gridExpanded ? {
        icon: '\uD83D\uDDFA\uFE0F',
        label: 'Grid ' + gridSize + 'x' + gridSize,
        color: '#4ade80',
        isNew: gridSize !== getGridSizeForWave(wave - 1),
    } : null;

    // Build the final list: newly introduced first, then speed, grid, then active.
    // Cap at 3 items to keep the overlay concise.
    var result = [];

    // Always show new mechanics first
    for (var n = 0; n < newlyIntroduced.length && result.length < 3; n++) {
        result.push(newlyIntroduced[n]);
    }

    // Then speed (always relevant)
    if (result.length < 3) {
        result.push(speedEntry);
    }

    // Then grid expansion if new
    if (gridEntry && gridEntry.isNew && result.length < 3) {
        result.push(gridEntry);
    }

    // Fill remaining slots with most impactful active mechanics (reverse order = highest wave first)
    for (var a = active.length - 1; a >= 0 && result.length < 3; a--) {
        result.push(active[a]);
    }

    // Grid expansion (not new) as last resort
    if (gridEntry && !gridEntry.isNew && result.length < 3) {
        result.push(gridEntry);
    }

    return result;
}

// --- DOM Overlay ---

var activeOverlay = null;
var dismissTimer = null;

function createOverlayElement(wave, mechanics, waveColor) {
    var overlay = document.createElement('div');
    overlay.className = 'wave-preview-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    var container = document.createElement('div');
    container.className = 'wave-preview-container';

    // Wave number
    var waveNum = document.createElement('div');
    waveNum.className = 'wave-preview-number';
    waveNum.textContent = 'WAVE ' + wave;
    waveNum.style.color = waveColor;
    waveNum.style.textShadow = '0 0 20px ' + waveColor + ', 0 0 40px ' + waveColor + '80';
    container.appendChild(waveNum);

    // Divider line
    var divider = document.createElement('div');
    divider.className = 'wave-preview-divider';
    divider.style.background = 'linear-gradient(90deg, transparent, ' + waveColor + ', transparent)';
    container.appendChild(divider);

    // Mechanics list
    var mechList = document.createElement('div');
    mechList.className = 'wave-preview-mechanics';

    for (var i = 0; i < mechanics.length; i++) {
        var mech = mechanics[i];
        var mechItem = document.createElement('div');
        mechItem.className = 'wave-preview-mechanic' + (mech.isNew ? ' wave-preview-new' : '');
        mechItem.style.animationDelay = (150 + i * 120) + 'ms';

        var icon = document.createElement('span');
        icon.className = 'wave-preview-icon';
        icon.textContent = mech.icon;
        mechItem.appendChild(icon);

        var label = document.createElement('span');
        label.className = 'wave-preview-label';
        label.textContent = mech.label;
        label.style.color = mech.color;
        mechItem.appendChild(label);

        if (mech.isNew) {
            var badge = document.createElement('span');
            badge.className = 'wave-preview-badge';
            badge.textContent = 'NEW';
            mechItem.appendChild(badge);
        }

        mechList.appendChild(mechItem);
    }

    container.appendChild(mechList);
    overlay.appendChild(container);

    return overlay;
}

function injectStyles() {
    if (document.getElementById('wave-preview-styles')) return;

    var style = document.createElement('style');
    style.id = 'wave-preview-styles';
    style.textContent = [
        '.wave-preview-overlay {',
        '  position: fixed;',
        '  top: 0; left: 0; right: 0; bottom: 0;',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  background: rgba(10, 10, 26, 0.85);',
        '  z-index: 1000;',
        '  opacity: 0;',
        '  transition: opacity ' + FADE_IN_MS + 'ms ease-in;',
        '  pointer-events: none;',
        '  font-family: "Courier New", monospace;',
        '}',
        '.wave-preview-overlay.visible {',
        '  opacity: 1;',
        '}',
        '.wave-preview-overlay.fading {',
        '  opacity: 0;',
        '  transition: opacity ' + FADE_OUT_MS + 'ms ease-out;',
        '}',
        '.wave-preview-container {',
        '  text-align: center;',
        '  padding: 24px 40px;',
        '}',
        '.wave-preview-number {',
        '  font-size: 2.2rem;',
        '  font-weight: bold;',
        '  letter-spacing: 6px;',
        '  margin-bottom: 12px;',
        '  animation: wavePreviewPulse 0.6s ease-in-out infinite alternate;',
        '}',
        '.wave-preview-divider {',
        '  height: 1px;',
        '  width: 120px;',
        '  margin: 0 auto 16px;',
        '  opacity: 0.6;',
        '}',
        '.wave-preview-mechanics {',
        '  display: flex;',
        '  flex-direction: column;',
        '  gap: 8px;',
        '  align-items: center;',
        '}',
        '.wave-preview-mechanic {',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 8px;',
        '  font-size: 0.85rem;',
        '  opacity: 0;',
        '  transform: translateY(8px);',
        '  animation: wavePreviewSlideIn 0.35s ease-out forwards;',
        '}',
        '.wave-preview-icon {',
        '  font-size: 1rem;',
        '}',
        '.wave-preview-label {',
        '  letter-spacing: 1px;',
        '  font-weight: bold;',
        '}',
        '.wave-preview-new .wave-preview-label {',
        '  text-shadow: 0 0 8px currentColor;',
        '}',
        '.wave-preview-badge {',
        '  font-size: 0.6rem;',
        '  background: #f59e0b;',
        '  color: #0a0a1a;',
        '  padding: 1px 5px;',
        '  border-radius: 3px;',
        '  font-weight: bold;',
        '  letter-spacing: 1px;',
        '}',
        '@keyframes wavePreviewPulse {',
        '  0% { opacity: 0.85; transform: scale(1); }',
        '  100% { opacity: 1; transform: scale(1.03); }',
        '}',
        '@keyframes wavePreviewSlideIn {',
        '  to { opacity: 1; transform: translateY(0); }',
        '}',
    ].join('\n');

    document.head.appendChild(style);
}

function removeOverlay() {
    if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
    }
    if (activeOverlay && activeOverlay.parentNode) {
        activeOverlay.parentNode.removeChild(activeOverlay);
    }
    activeOverlay = null;
}

// --- Public API ---

// Shows the wave preview overlay. Returns a Promise that resolves
// when the overlay finishes displaying (after PREVIEW_DISPLAY_MS).
// If called while a previous preview is showing, the old one is dismissed.
export function showWavePreview(wave, waveColor) {
    // Defensive: clean up any leftover overlay
    removeOverlay();

    // Inject CSS on first use
    injectStyles();

    var mechanics = detectActiveMechanics(wave);
    var overlay = createOverlayElement(wave, mechanics, waveColor || '#4a9eff');
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    return new Promise(function(resolve) {
        // Trigger fade-in on next frame (allows CSS transition to fire)
        requestAnimationFrame(function() {
            if (activeOverlay !== overlay) {
                resolve();
                return;
            }
            overlay.classList.add('visible');

            // Schedule fade-out
            dismissTimer = setTimeout(function() {
                if (activeOverlay !== overlay) {
                    resolve();
                    return;
                }
                overlay.classList.remove('visible');
                overlay.classList.add('fading');

                // Remove after fade-out completes
                dismissTimer = setTimeout(function() {
                    if (activeOverlay === overlay) {
                        removeOverlay();
                    }
                    resolve();
                }, FADE_OUT_MS);
            }, PREVIEW_DISPLAY_MS - FADE_OUT_MS);
        });
    });
}

// Immediately dismiss any active wave preview (e.g. if the player dies).
export function dismissWavePreview() {
    removeOverlay();
}
