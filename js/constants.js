'use strict';

export var GRID_SIZE = 20;
export var CELL_SIZE = 20;
export var CANVAS_SIZE = GRID_SIZE * CELL_SIZE;

export var ENDLESS_GRID_SIZE = 24;

export function setGridSize(size) {
    GRID_SIZE = size;
    CANVAS_SIZE = size * CELL_SIZE;
}

export var INITIAL_LIVES = 3;
export var INVINCIBLE_TICKS = 15;
export var POWER_UP_SPAWN_INTERVAL = 15;
export var POWER_UP_DESPAWN_TICKS = 40;

// Endless mode uses a base config for color cycling — these are color palettes only
export var LEVEL_CONFIG = {
    1: { speed: 150, color: '#22c55e', foodColor: '#ef4444', wallColor: null,      bgAccent: '#0d1117', gridAlpha: 0.03, obstacleColor: null, portalColor: null, fogRadius: null, wrapAround: false, powerUpsEnabled: false },
    2: { speed: 140, color: '#3b82f6', foodColor: '#f59e0b', wallColor: '#1e3a5f', bgAccent: '#0d1320', gridAlpha: 0.04, obstacleColor: null, portalColor: null, fogRadius: null, wrapAround: false, powerUpsEnabled: false },
    3: { speed: 125, color: '#a855f7', foodColor: '#ec4899', wallColor: '#3b1f5e', bgAccent: '#130d1a', gridAlpha: 0.05, obstacleColor: '#7c3aed', portalColor: null, fogRadius: null, wrapAround: false, powerUpsEnabled: false },
    4: { speed: 115, color: '#f97316', foodColor: '#06b6d4', wallColor: '#78350f', bgAccent: '#1a0f0a', gridAlpha: 0.06, obstacleColor: '#ea580c', portalColor: null, fogRadius: null, wrapAround: false, powerUpsEnabled: false },
    5: { speed: 100, color: '#06b6d4', foodColor: '#f43f5e', wallColor: '#164e63', bgAccent: '#0a1419', gridAlpha: 0.07, obstacleColor: '#0891b2', portalColor: '#8b5cf6', fogRadius: null, wrapAround: false, powerUpsEnabled: false },
    6: { speed: 95,  color: '#e11d48', foodColor: '#fbbf24', wallColor: '#4a1a2e', bgAccent: '#0a0508', gridAlpha: 0.02, obstacleColor: '#be123c', portalColor: '#a855f7', fogRadius: null, wrapAround: false, powerUpsEnabled: false },
    7: { speed: 85,  color: '#eab308', foodColor: '#f43f5e', wallColor: '#5c4200', bgAccent: '#0a0800', gridAlpha: 0.04, obstacleColor: '#b45309', portalColor: null, fogRadius: null, wrapAround: true, powerUpsEnabled: true },
    8: { speed: 80,  color: '#dc2626', foodColor: '#34d399', wallColor: '#7f1d1d', bgAccent: '#0a0505', gridAlpha: 0.03, obstacleColor: '#b91c1c', portalColor: null, fogRadius: null, wrapAround: true, powerUpsEnabled: true, hunterEnabled: true, hunterColor: '#f97316', hunterTickInterval: 3 },
    9: { speed: 85,  color: '#14b8a6', foodColor: '#fbbf24', wallColor: '#115e59', bgAccent: '#042f2e', gridAlpha: 0.03, obstacleColor: '#0d9488', portalColor: null, fogRadius: null, wrapAround: false, powerUpsEnabled: true, hunterEnabled: false, hunterColor: null, hunterTickInterval: null, shrinkingArena: true, shrinkInterval: 3 },
    10: { speed: 75, color: '#e2e8f0', foodColor: '#ff4444', wallColor: '#475569', bgAccent: '#080810', gridAlpha: 0.02, obstacleColor: '#64748b', portalColor: '#f472b6', fogRadius: null, wrapAround: false, powerUpsEnabled: true, hunterEnabled: true, hunterColor: '#ff6600', hunterTickInterval: 2, shrinkingArena: true, shrinkInterval: 4 },
};

export var MAX_LEVEL = Object.keys(LEVEL_CONFIG).length;

export var SHIELD_DURATION = 225; // ~15 seconds at ~15 ticks/sec

export var POWER_UP_TYPES = [
    { type: 'timeSlow', name: 'SLOW', color: '#60a5fa', glowColor: '#3b82f6', duration: 40 },
    { type: 'ghost', name: 'GHOST', color: '#e2e8f0', glowColor: '#94a3b8', duration: 30 },
    { type: 'shield', name: 'SHIELD', color: '#22d3ee', glowColor: '#06b6d4', duration: SHIELD_DURATION },
];

export var KONAMI_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
