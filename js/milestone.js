'use strict';

// --- Milestone Ceremony System ---
// Shows a full-screen celebration overlay when the player reaches
// milestone waves: 10, 25, 50, 100, and every 50 thereafter.

// Display duration before auto-dismiss (ms)
var MILESTONE_DISPLAY_MS = 4000;
var FADE_IN_MS = 300;
var FADE_OUT_MS = 400;

// --- Milestone Detection ---

var MILESTONE_WAVES = [10, 25, 50];
var MILESTONE_TITLES = { 10: 'SURVIVOR', 25: 'VETERAN', 50: 'LEGEND' };

export function isMilestoneWave(wave) {
    if (wave < 10) return false;
    if (MILESTONE_WAVES.indexOf(wave) !== -1) return true;
    return wave >= 100 && wave % 50 === 0;
}

export function getMilestoneTitle(wave) {
    if (wave >= 100) return 'IMMORTAL';
    return MILESTONE_TITLES[wave] || 'MILESTONE';
}

// --- DOM Overlay ---

var activeOverlay = null;
var dismissTimer = null;

function injectStyles() {
    if (document.getElementById('milestone-styles')) return;

    var style = document.createElement('style');
    style.id = 'milestone-styles';
    style.textContent = [
        '.milestone-overlay {',
        '  position: fixed;',
        '  top: 0; left: 0; right: 0; bottom: 0;',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  background: rgba(0, 0, 0, 0.82);',
        '  z-index: 1100;',
        '  opacity: 0;',
        '  transition: opacity ' + FADE_IN_MS + 'ms ease-in;',
        '  pointer-events: none;',
        '  font-family: "Courier New", monospace;',
        '}',
        '.milestone-overlay.visible {',
        '  opacity: 1;',
        '}',
        '.milestone-overlay.fading {',
        '  opacity: 0;',
        '  transition: opacity ' + FADE_OUT_MS + 'ms ease-out;',
        '}',
        '.milestone-container {',
        '  text-align: center;',
        '  padding: 32px 48px;',
        '  animation: milestoneScaleIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;',
        '}',
        '.milestone-wave-num {',
        '  font-size: 4rem;',
        '  font-weight: bold;',
        '  letter-spacing: 4px;',
        '  margin-bottom: 8px;',
        '  line-height: 1;',
        '}',
        '.milestone-subtitle {',
        '  font-size: 1rem;',
        '  letter-spacing: 2px;',
        '  opacity: 0.7;',
        '  margin-bottom: 20px;',
        '}',
        '.milestone-badge {',
        '  display: inline-block;',
        '  font-size: 1.5rem;',
        '  font-weight: bold;',
        '  letter-spacing: 6px;',
        '  margin-bottom: 24px;',
        '  padding: 4px 16px;',
        '  border: 2px solid currentColor;',
        '}',
        '.milestone-stats {',
        '  display: flex;',
        '  gap: 32px;',
        '  justify-content: center;',
        '  font-size: 0.8rem;',
        '  letter-spacing: 1px;',
        '  opacity: 0.65;',
        '  margin-bottom: 24px;',
        '}',
        '.milestone-continue {',
        '  font-size: 0.7rem;',
        '  letter-spacing: 3px;',
        '  opacity: 0;',
        '  animation: milestoneContinueBlink 0.9s ease-in-out 0.8s infinite alternate;',
        '}',
        '@keyframes milestoneScaleIn {',
        '  0% { transform: scale(0.1); opacity: 0; }',
        '  100% { transform: scale(1); opacity: 1; }',
        '}',
        '@keyframes milestoneContinueBlink {',
        '  0% { opacity: 0; }',
        '  100% { opacity: 0.7; }',
        '}',
    ].join('\n');

    document.head.appendChild(style);
}

function createOverlayElement(wave, score, length, color) {
    var overlay = document.createElement('div');
    overlay.className = 'milestone-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    var container = document.createElement('div');
    container.className = 'milestone-container';

    // Wave number
    var waveNum = document.createElement('div');
    waveNum.className = 'milestone-wave-num';
    waveNum.textContent = 'WAVE ' + wave;
    waveNum.style.color = color;
    waveNum.style.textShadow = '0 0 30px ' + color + ', 0 0 60px ' + color + '60';
    container.appendChild(waveNum);

    // "MILESTONE REACHED" subtitle
    var subtitle = document.createElement('div');
    subtitle.className = 'milestone-subtitle';
    subtitle.textContent = 'MILESTONE REACHED';
    subtitle.style.color = color;
    container.appendChild(subtitle);

    // Badge
    var badge = document.createElement('div');
    badge.className = 'milestone-badge';
    badge.textContent = getMilestoneTitle(wave);
    badge.style.color = color;
    badge.style.textShadow = '0 0 12px ' + color;
    badge.style.borderColor = color;
    badge.style.boxShadow = '0 0 16px ' + color + '40';
    container.appendChild(badge);

    // Stats
    var stats = document.createElement('div');
    stats.className = 'milestone-stats';

    var scoreEl = document.createElement('div');
    scoreEl.textContent = 'SCORE: ' + score;
    stats.appendChild(scoreEl);

    var lengthEl = document.createElement('div');
    lengthEl.textContent = 'LENGTH: ' + length;
    stats.appendChild(lengthEl);

    container.appendChild(stats);

    // Continue prompt
    var cont = document.createElement('div');
    cont.className = 'milestone-continue';
    cont.textContent = 'PRESS ANY KEY TO CONTINUE';
    cont.style.color = color;
    container.appendChild(cont);

    overlay.appendChild(container);
    return overlay;
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

// Returns true if a milestone overlay is currently showing.
export function isMilestoneActive() {
    return activeOverlay !== null;
}

// Show the milestone overlay. The game keeps running while it displays.
// Auto-dismisses after MILESTONE_DISPLAY_MS milliseconds.
export function showMilestone(wave, score, length, color) {
    removeOverlay();
    injectStyles();

    var overlayColor = color || '#fbbf24';
    var overlay = createOverlayElement(wave, score, length, overlayColor);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    // Trigger fade-in on next frame
    requestAnimationFrame(function() {
        if (activeOverlay !== overlay) return;
        overlay.classList.add('visible');

        // Auto-dismiss after display duration
        dismissTimer = setTimeout(function() {
            if (activeOverlay !== overlay) return;
            dismissMilestone();
        }, MILESTONE_DISPLAY_MS - FADE_OUT_MS);
    });
}

// Immediately dismiss the milestone overlay (on key/tap or auto-timeout).
export function dismissMilestone() {
    if (!activeOverlay) return;
    var overlay = activeOverlay;
    overlay.classList.remove('visible');
    overlay.classList.add('fading');

    dismissTimer = setTimeout(function() {
        if (activeOverlay === overlay) {
            removeOverlay();
        }
    }, FADE_OUT_MS);
}
