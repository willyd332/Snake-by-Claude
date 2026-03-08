'use strict';

// --- Settings System ---
// Persists player preferences to localStorage.
// getSettings() returns immutable copy (safe for mutation). getSettingsRef() returns
// the cached reference (no allocation, use in hot paths like game loop/renderer).

var STORAGE_KEY = 'snake-settings';

var DIFFICULTY_PRESETS = {
    easy:   { label: 'Easy',   speedMult: 1.4, livesCount: 5, powerUpFreq: 10 },
    normal: { label: 'Normal', speedMult: 1.0, livesCount: 3, powerUpFreq: 15 },
    hard:   { label: 'Hard',   speedMult: 0.7, livesCount: 1, powerUpFreq: 25 },
};

var DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

var SETTINGS_ITEMS = [
    { key: 'difficulty', label: 'Difficulty',    type: 'cycle', options: DIFFICULTY_ORDER },
    { key: 'gridLines',  label: 'Grid Lines',   type: 'toggle' },
    { key: 'particles',  label: 'Particles',    type: 'toggle' },
    { key: 'screenShake',label: 'Screen Shake',  type: 'toggle' },
    { key: 'sound',      label: 'Sound',         type: 'toggle' },
    { key: 'highContrast',label: 'High Contrast', type: 'toggle' },
];

var DEFAULT_SETTINGS = {
    difficulty: 'normal',
    gridLines: true,
    particles: true,
    screenShake: true,
    sound: true,
    highContrast: false,
};

var cachedSettings = null;

function loadFromStorage() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            var parsed = JSON.parse(raw);
            return Object.assign({}, DEFAULT_SETTINGS, parsed);
        }
    } catch (e) {
        // Corrupted storage — use defaults
    }
    return Object.assign({}, DEFAULT_SETTINGS);
}

function saveToStorage(settings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        // Storage full or unavailable — silently fail
    }
}

export function getSettings() {
    if (!cachedSettings) {
        cachedSettings = loadFromStorage();
    }
    return Object.assign({}, cachedSettings);
}

// Hot-path version: returns cached reference without copying.
// Only use for reading — never mutate the returned object.
export function getSettingsRef() {
    if (!cachedSettings) {
        cachedSettings = loadFromStorage();
    }
    return cachedSettings;
}

export function updateSetting(key, value) {
    var current = getSettings();
    var updated = Object.assign({}, current);
    updated[key] = value;
    cachedSettings = updated;
    saveToStorage(updated);
    return Object.assign({}, updated);
}

export function toggleSetting(key) {
    var current = getSettings();
    return updateSetting(key, !current[key]);
}

export function cycleSetting(key, options, direction) {
    var current = getSettings();
    var idx = options.indexOf(current[key]);
    var delta = (direction && direction < 0) ? -1 : 1;
    var next = (idx + delta + options.length) % options.length;
    return updateSetting(key, options[next]);
}

export function getDifficultyPreset(difficultyKey) {
    return DIFFICULTY_PRESETS[difficultyKey] || DIFFICULTY_PRESETS.normal;
}

export function getSettingsItems() {
    return SETTINGS_ITEMS;
}

export function getDifficultyLabel(key) {
    var preset = DIFFICULTY_PRESETS[key];
    return preset ? preset.label : 'Normal';
}

// --- Settings Screen State ---
export function createSettingsState() {
    return { selectedIndex: 0 };
}
