'use strict';

// --- Streak System ---
// Tracks consecutive runs (Play Again without returning to menu).
// Module-level counter survives game restarts but resets on menu return.

var STREAK_STORAGE_KEY = 'snake-best-streak';

// Bonus points granted at game start based on streak level
export var STREAK_BONUS_PER_LEVEL = 50;
export var STREAK_BONUS_MAX = 200;

// Streak threshold for special visual effects
export var STREAK_VISUAL_THRESHOLD = 5;

// Minimum streak level to show the HUD badge
export var STREAK_DISPLAY_MIN = 2;

// Current in-memory streak (not persisted — resets on page reload)
var _currentStreak = 0;

export function getCurrentStreak() {
    return _currentStreak;
}

export function incrementStreak() {
    _currentStreak = _currentStreak + 1;
    var best = getBestStreak();
    if (_currentStreak > best) {
        saveBestStreak(_currentStreak);
    }
    return _currentStreak;
}

export function resetStreak() {
    _currentStreak = 0;
}

export function getStreakBonus(streak) {
    if (streak < STREAK_DISPLAY_MIN) return 0;
    return Math.min((streak - 1) * STREAK_BONUS_PER_LEVEL, STREAK_BONUS_MAX);
}

export function getBestStreak() {
    try {
        return parseInt(localStorage.getItem(STREAK_STORAGE_KEY) || '0', 10);
    } catch (e) {
        return 0;
    }
}

function saveBestStreak(streak) {
    try {
        localStorage.setItem(STREAK_STORAGE_KEY, String(streak));
    } catch (e) { /* storage unavailable */ }
}
