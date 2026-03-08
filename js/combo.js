'use strict';

// --- Combo Multiplier System ---
// Eating food within COMBO_WINDOW_MS of the previous food builds a streak.
// Multiplier scales from 1x to COMBO_MAX_MULTIPLIER, capped there.

export var COMBO_WINDOW_MS = 3000;
export var COMBO_MAX_MULTIPLIER = 5;
export var COMBO_BASE_SCORE = 10;

export function createComboState() {
    return {
        multiplier: 1,
        streak: 0,
        windowEnd: 0, // timestamp (ms) by which next food must be eaten
    };
}

// Called when food is eaten. Returns new combo state and the actual score to add.
export function onFoodEaten(combo, nowMs) {
    var inWindow = combo.windowEnd > 0 && nowMs <= combo.windowEnd;
    var newStreak = inWindow ? combo.streak + 1 : 1;
    var newMultiplier = Math.min(newStreak, COMBO_MAX_MULTIPLIER);
    var newWindowEnd = nowMs + COMBO_WINDOW_MS;
    var scoreGained = COMBO_BASE_SCORE * newMultiplier;

    return {
        comboState: {
            multiplier: newMultiplier,
            streak: newStreak,
            windowEnd: newWindowEnd,
        },
        scoreGained: scoreGained,
        wasComboIncrease: newMultiplier > combo.multiplier,
    };
}

// Called each tick to check if the window expired.
// Returns null if still valid, or a reset state if expired.
export function checkComboExpiry(combo, nowMs) {
    if (combo.windowEnd > 0 && nowMs > combo.windowEnd) {
        return createComboState();
    }
    return null;
}
