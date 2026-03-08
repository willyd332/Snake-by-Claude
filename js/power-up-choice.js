'use strict';

// --- Power-Up Choice System ---
// When a power-up would spawn, the game pauses briefly and shows the
// player two random power-up options. Press 1 or 2 (or arrow+Enter)
// to choose. Auto-selects after timeout.

import { POWER_UP_CHOICE_TIMEOUT_MS } from './constants.js';

// --- State ---
var activeOverlay = null;
var choiceResolve = null;
var choiceKeyHandler = null;
var autoTimeoutId = null;
var selectedIndex = 0;

// --- Styles ---
var FADE_IN_MS = 200;
var FADE_OUT_MS = 250;

function injectStyles() {
    if (document.getElementById('powerup-choice-styles')) return;

    var style = document.createElement('style');
    style.id = 'powerup-choice-styles';
    style.textContent = [
        '.pu-choice-overlay {',
        '  position: fixed;',
        '  top: 0; left: 0; right: 0; bottom: 0;',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  background: rgba(10, 10, 26, 0.88);',
        '  z-index: 1000;',
        '  opacity: 0;',
        '  transition: opacity ' + FADE_IN_MS + 'ms ease-in;',
        '  font-family: "Courier New", monospace;',
        '}',
        '.pu-choice-overlay.visible {',
        '  opacity: 1;',
        '}',
        '.pu-choice-overlay.fading {',
        '  opacity: 0;',
        '  transition: opacity ' + FADE_OUT_MS + 'ms ease-out;',
        '}',
        '.pu-choice-container {',
        '  text-align: center;',
        '  padding: 20px 24px;',
        '}',
        '.pu-choice-title {',
        '  font-size: 1rem;',
        '  font-weight: bold;',
        '  letter-spacing: 3px;',
        '  color: #94a3b8;',
        '  margin-bottom: 16px;',
        '  text-transform: uppercase;',
        '}',
        '.pu-choice-cards {',
        '  display: flex;',
        '  gap: 20px;',
        '  justify-content: center;',
        '  align-items: stretch;',
        '}',
        '.pu-choice-card {',
        '  border: 2px solid #334155;',
        '  border-radius: 8px;',
        '  padding: 16px 20px;',
        '  min-width: 140px;',
        '  max-width: 170px;',
        '  cursor: pointer;',
        '  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;',
        '  background: rgba(15, 23, 42, 0.9);',
        '  display: flex;',
        '  flex-direction: column;',
        '  align-items: center;',
        '  gap: 8px;',
        '  opacity: 0;',
        '  transform: translateY(10px);',
        '  animation: puCardSlideIn 0.3s ease-out forwards;',
        '}',
        '.pu-choice-card:first-child {',
        '  animation-delay: 100ms;',
        '}',
        '.pu-choice-card:last-child {',
        '  animation-delay: 200ms;',
        '}',
        '.pu-choice-card.selected {',
        '  transform: translateY(-2px) scale(1.04);',
        '}',
        '.pu-choice-card-icon {',
        '  font-size: 1.8rem;',
        '}',
        '.pu-choice-card-name {',
        '  font-size: 0.9rem;',
        '  font-weight: bold;',
        '  letter-spacing: 2px;',
        '}',
        '.pu-choice-card-desc {',
        '  font-size: 0.7rem;',
        '  color: #94a3b8;',
        '  letter-spacing: 0.5px;',
        '  line-height: 1.3;',
        '}',
        '.pu-choice-card-key {',
        '  font-size: 0.65rem;',
        '  color: #475569;',
        '  letter-spacing: 1px;',
        '  margin-top: 4px;',
        '}',
        '.pu-choice-timer {',
        '  margin-top: 14px;',
        '  height: 3px;',
        '  background: #1e293b;',
        '  border-radius: 2px;',
        '  overflow: hidden;',
        '  width: 200px;',
        '  margin-left: auto;',
        '  margin-right: auto;',
        '}',
        '.pu-choice-timer-bar {',
        '  height: 100%;',
        '  background: #4a9eff;',
        '  border-radius: 2px;',
        '  width: 100%;',
        '  animation: puTimerShrink ' + POWER_UP_CHOICE_TIMEOUT_MS + 'ms linear forwards;',
        '}',
        '@keyframes puCardSlideIn {',
        '  to { opacity: 1; transform: translateY(0); }',
        '}',
        '@keyframes puTimerShrink {',
        '  from { width: 100%; }',
        '  to { width: 0%; }',
        '}',
    ].join('\n');

    document.head.appendChild(style);
}

function createOverlayElement(choices) {
    var overlay = document.createElement('div');
    overlay.className = 'pu-choice-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Choose a power-up');

    var container = document.createElement('div');
    container.className = 'pu-choice-container';

    var title = document.createElement('div');
    title.className = 'pu-choice-title';
    title.textContent = 'CHOOSE POWER-UP';
    container.appendChild(title);

    var cards = document.createElement('div');
    cards.className = 'pu-choice-cards';

    for (var i = 0; i < choices.length; i++) {
        var choice = choices[i];
        var card = document.createElement('div');
        card.className = 'pu-choice-card';
        card.setAttribute('data-index', String(i));
        card.style.borderColor = choice.glowColor || choice.color;
        if (i === 0) {
            card.classList.add('selected');
            card.style.boxShadow = '0 0 15px ' + (choice.glowColor || choice.color) + '60';
        }

        var icon = document.createElement('div');
        icon.className = 'pu-choice-card-icon';
        icon.textContent = choice.icon || '';
        card.appendChild(icon);

        var name = document.createElement('div');
        name.className = 'pu-choice-card-name';
        name.textContent = choice.name;
        name.style.color = choice.color;
        card.appendChild(name);

        var desc = document.createElement('div');
        desc.className = 'pu-choice-card-desc';
        desc.textContent = choice.desc || '';
        card.appendChild(desc);

        var key = document.createElement('div');
        key.className = 'pu-choice-card-key';
        key.textContent = 'Press ' + (i + 1);
        card.appendChild(key);

        cards.appendChild(card);
    }

    container.appendChild(cards);

    var timer = document.createElement('div');
    timer.className = 'pu-choice-timer';
    var timerBar = document.createElement('div');
    timerBar.className = 'pu-choice-timer-bar';
    timer.appendChild(timerBar);
    container.appendChild(timer);

    overlay.appendChild(container);
    return overlay;
}

function updateSelection(overlay, index, choices) {
    var cardEls = overlay.querySelectorAll('.pu-choice-card');
    for (var i = 0; i < cardEls.length; i++) {
        if (i === index) {
            cardEls[i].classList.add('selected');
            cardEls[i].style.boxShadow = '0 0 15px ' + (choices[i].glowColor || choices[i].color) + '60';
            cardEls[i].style.transform = 'translateY(-2px) scale(1.04)';
        } else {
            cardEls[i].classList.remove('selected');
            cardEls[i].style.boxShadow = 'none';
            cardEls[i].style.transform = '';
        }
    }
}

function cleanup() {
    if (choiceKeyHandler) {
        document.removeEventListener('keydown', choiceKeyHandler);
        choiceKeyHandler = null;
    }
    if (autoTimeoutId) {
        clearTimeout(autoTimeoutId);
        autoTimeoutId = null;
    }
    if (activeOverlay && activeOverlay.parentNode) {
        activeOverlay.parentNode.removeChild(activeOverlay);
    }
    activeOverlay = null;
    choiceResolve = null;
    selectedIndex = 0;
}

function resolveChoice(index) {
    var resolve = choiceResolve;
    var overlay = activeOverlay;

    // Prevent double-resolve
    choiceResolve = null;

    if (choiceKeyHandler) {
        document.removeEventListener('keydown', choiceKeyHandler);
        choiceKeyHandler = null;
    }
    if (autoTimeoutId) {
        clearTimeout(autoTimeoutId);
        autoTimeoutId = null;
    }

    if (!overlay || !resolve) return;

    // Fade out then remove
    overlay.classList.remove('visible');
    overlay.classList.add('fading');

    setTimeout(function() {
        if (activeOverlay === overlay) {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            activeOverlay = null;
        }
        resolve(index);
    }, FADE_OUT_MS);
}

// --- Public API ---

// Shows the power-up choice overlay. Returns a Promise that resolves
// with the index (0 or 1) of the chosen power-up.
export function showPowerUpChoice(choices) {
    // Clean up any leftover state
    cleanup();

    injectStyles();

    selectedIndex = 0;
    var overlay = createOverlayElement(choices);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    return new Promise(function(resolve) {
        choiceResolve = resolve;

        // Fade in
        requestAnimationFrame(function() {
            if (activeOverlay !== overlay) {
                resolve(0);
                return;
            }
            overlay.classList.add('visible');
        });

        // Keyboard handler
        choiceKeyHandler = function(e) {
            if (e.key === '1') {
                e.preventDefault();
                e.stopPropagation();
                resolveChoice(0);
            } else if (e.key === '2') {
                e.preventDefault();
                e.stopPropagation();
                resolveChoice(1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = 0;
                updateSelection(overlay, selectedIndex, choices);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = 1;
                updateSelection(overlay, selectedIndex, choices);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                resolveChoice(selectedIndex);
            }
        };
        // Use capture phase so it fires before the game's input handler
        document.addEventListener('keydown', choiceKeyHandler, true);

        // Auto-select after timeout
        autoTimeoutId = setTimeout(function() {
            autoTimeoutId = null;
            resolveChoice(selectedIndex);
        }, POWER_UP_CHOICE_TIMEOUT_MS);
    });
}

// Immediately dismiss any active choice overlay (e.g. on game over or restart).
export function dismissPowerUpChoice() {
    if (choiceResolve) {
        // Resolve with default so the promise doesn't hang
        var resolve = choiceResolve;
        choiceResolve = null;
        if (choiceKeyHandler) {
            document.removeEventListener('keydown', choiceKeyHandler, true);
            choiceKeyHandler = null;
        }
        if (autoTimeoutId) {
            clearTimeout(autoTimeoutId);
            autoTimeoutId = null;
        }
        if (activeOverlay && activeOverlay.parentNode) {
            activeOverlay.parentNode.removeChild(activeOverlay);
        }
        activeOverlay = null;
        resolve(-1);
    } else {
        cleanup();
    }
}

// Returns true if the choice overlay is currently active.
export function isPowerUpChoiceActive() {
    return activeOverlay !== null;
}
