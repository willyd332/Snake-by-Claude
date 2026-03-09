'use strict';

// --- Meta-Progression System ---
// Manages "Data Fragments" — a persistent currency earned from gameplay.
// Players earn fragments based on score and wave reached, then spend them
// in the shop to unlock premium themes and run bonuses.

var STORAGE_KEY = 'tbc_progression';

// --- Fragment Earning Formula ---
// Generous early, scales with skill: floor(score / 50) + (wave * 3)
var SCORE_DIVISOR = 50;
var WAVE_MULTIPLIER = 3;
var FRAGMENT_BOOST_PERCENT = 25;

// --- Run Bonus Definitions ---
// Persistent perks that apply each run.
export var RUN_BONUSES = [
    {
        id: 'head_start',
        name: 'Head Start',
        desc: 'Snake starts at length 5 instead of 3',
        price: 150,
        icon: '\u25B6',
        color: '#22c55e',
    },
    {
        id: 'fragment_boost',
        name: 'Fragment Boost',
        desc: '+25% fragments earned per run',
        price: 200,
        icon: '\u2B06',
        color: '#fbbf24',
    },
    {
        id: 'power_surge',
        name: 'Power Surge',
        desc: 'First power-up in each wave guaranteed',
        price: 250,
        icon: '\u26A1',
        color: '#8b5cf6',
    },
    {
        id: 'resilience',
        name: 'Resilience',
        desc: 'First death each session is survived (ghost through once)',
        price: 300,
        icon: '\u2764',
        color: '#ef4444',
    },
];

// --- Persistence ---

/**
 * Returns the current progression state from localStorage.
 * @returns {{ fragments: number, lifetime_earned: number, unlocked_themes: string[], purchased_bonuses: string[], active_run_bonus: string|null, resilience_used: boolean }}
 */
export function getProgression() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            var parsed = JSON.parse(raw);
            return {
                fragments: parsed.fragments || 0,
                lifetime_earned: parsed.lifetime_earned || 0,
                unlocked_themes: parsed.unlocked_themes || [],
                purchased_bonuses: parsed.purchased_bonuses || [],
                active_run_bonus: parsed.active_run_bonus || null,
                resilience_used: parsed.resilience_used || false,
            };
        }
    } catch (e) {
        // Corrupted storage — return defaults
    }
    return {
        fragments: 0,
        lifetime_earned: 0,
        unlocked_themes: [],
        purchased_bonuses: [],
        active_run_bonus: null,
        resilience_used: false,
    };
}

function saveProgression(prog) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prog));
    } catch (e) {
        // Storage unavailable
    }
}

/**
 * Calculate fragments earned from a run.
 * @param {number} score - Final score of the run
 * @param {number} wave - Wave reached
 * @returns {number} Fragments earned (before bonuses)
 */
export function calculateFragments(score, wave) {
    var base = Math.floor(score / SCORE_DIVISOR) + (wave * WAVE_MULTIPLIER);
    return Math.max(0, base);
}

/**
 * Add fragments to the player's balance.
 * Applies Fragment Boost if active.
 * @param {number} amount - Base fragments to earn
 * @returns {{ earned: number, total: number }} The actual fragments earned (after bonuses) and new total
 */
export function earnFragments(amount) {
    var prog = getProgression();
    var actual = amount;

    // Apply Fragment Boost if purchased and active
    if (prog.active_run_bonus === 'fragment_boost') {
        actual = Math.floor(amount * (1 + FRAGMENT_BOOST_PERCENT / 100));
    }

    var updated = {
        fragments: prog.fragments + actual,
        lifetime_earned: prog.lifetime_earned + actual,
        unlocked_themes: prog.unlocked_themes,
        purchased_bonuses: prog.purchased_bonuses,
        active_run_bonus: prog.active_run_bonus,
        resilience_used: prog.resilience_used,
    };
    saveProgression(updated);
    return { earned: actual, total: updated.fragments };
}

/**
 * Spend fragments. Returns false if insufficient balance.
 * @param {number} amount - Fragments to spend
 * @returns {boolean} Whether the spend was successful
 */
export function spendFragments(amount) {
    var prog = getProgression();
    if (prog.fragments < amount) return false;

    var updated = {
        fragments: prog.fragments - amount,
        lifetime_earned: prog.lifetime_earned,
        unlocked_themes: prog.unlocked_themes,
        purchased_bonuses: prog.purchased_bonuses,
        active_run_bonus: prog.active_run_bonus,
        resilience_used: prog.resilience_used,
    };
    saveProgression(updated);
    return true;
}

/**
 * Unlock a premium theme. Deducts fragments and records the unlock.
 * @param {string} themeId - Theme to unlock
 * @param {number} price - Cost in fragments
 * @returns {boolean} Whether the unlock succeeded
 */
export function unlockTheme(themeId, price) {
    var prog = getProgression();
    if (prog.fragments < price) return false;
    if (prog.unlocked_themes.indexOf(themeId) !== -1) return false;

    var updated = {
        fragments: prog.fragments - price,
        lifetime_earned: prog.lifetime_earned,
        unlocked_themes: prog.unlocked_themes.concat([themeId]),
        purchased_bonuses: prog.purchased_bonuses,
        active_run_bonus: prog.active_run_bonus,
        resilience_used: prog.resilience_used,
    };
    saveProgression(updated);
    return true;
}

/**
 * Check if a theme is unlocked.
 * @param {string} themeId
 * @returns {boolean}
 */
export function isThemeUnlocked(themeId) {
    var prog = getProgression();
    return prog.unlocked_themes.indexOf(themeId) !== -1;
}

/**
 * Purchase a run bonus. Deducts fragments.
 * @param {string} bonusId
 * @param {number} price
 * @returns {boolean}
 */
export function purchaseRunBonus(bonusId, price) {
    var prog = getProgression();
    if (prog.fragments < price) return false;
    if (prog.purchased_bonuses.indexOf(bonusId) !== -1) return false;

    var updated = {
        fragments: prog.fragments - price,
        lifetime_earned: prog.lifetime_earned,
        unlocked_themes: prog.unlocked_themes,
        purchased_bonuses: prog.purchased_bonuses.concat([bonusId]),
        active_run_bonus: prog.active_run_bonus,
        resilience_used: prog.resilience_used,
    };
    saveProgression(updated);
    return true;
}

/**
 * Check if a run bonus has been purchased.
 * @param {string} bonusId
 * @returns {boolean}
 */
export function isBonusPurchased(bonusId) {
    var prog = getProgression();
    return prog.purchased_bonuses.indexOf(bonusId) !== -1;
}

/**
 * Set the active run bonus. Must already be purchased.
 * Pass null to deactivate.
 * @param {string|null} bonusId
 */
export function setRunBonus(bonusId) {
    var prog = getProgression();
    if (bonusId !== null && prog.purchased_bonuses.indexOf(bonusId) === -1) return;

    var updated = {
        fragments: prog.fragments,
        lifetime_earned: prog.lifetime_earned,
        unlocked_themes: prog.unlocked_themes,
        purchased_bonuses: prog.purchased_bonuses,
        active_run_bonus: bonusId,
        resilience_used: prog.resilience_used,
    };
    saveProgression(updated);
}

/**
 * Get the active run bonus ID (or null).
 * @returns {string|null}
 */
export function getRunBonus() {
    return getProgression().active_run_bonus;
}

/**
 * Get the run bonus definition by ID.
 * @param {string} bonusId
 * @returns {Object|null}
 */
export function getRunBonusDef(bonusId) {
    return RUN_BONUSES.find(function(b) { return b.id === bonusId; }) || null;
}

/**
 * Mark resilience as used for the current session.
 */
export function markResilienceUsed() {
    var prog = getProgression();
    var updated = {
        fragments: prog.fragments,
        lifetime_earned: prog.lifetime_earned,
        unlocked_themes: prog.unlocked_themes,
        purchased_bonuses: prog.purchased_bonuses,
        active_run_bonus: prog.active_run_bonus,
        resilience_used: true,
    };
    saveProgression(updated);
}

/**
 * Reset resilience used flag (called at session start).
 */
export function resetResilienceUsed() {
    var prog = getProgression();
    if (!prog.resilience_used) return; // no-op
    var updated = {
        fragments: prog.fragments,
        lifetime_earned: prog.lifetime_earned,
        unlocked_themes: prog.unlocked_themes,
        purchased_bonuses: prog.purchased_bonuses,
        active_run_bonus: prog.active_run_bonus,
        resilience_used: false,
    };
    saveProgression(updated);
}

/**
 * Check if resilience can be used (purchased, active, not yet used this session).
 * @returns {boolean}
 */
export function canUseResilience() {
    var prog = getProgression();
    return prog.active_run_bonus === 'resilience' && !prog.resilience_used;
}
