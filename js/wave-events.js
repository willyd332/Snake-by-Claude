'use strict';

// --- Procedural Wave Events System ---
// Random mid-wave surprises that trigger during gameplay.
// Events fire at random intervals (15-45 seconds apart),
// one at a time (no stacking), and are wave-aware.

import { GRID_SIZE } from './constants.js';
import { randomPosition } from './state.js';

// --- Timing Constants (in ticks; game runs at ~15 ticks/sec) ---
var MIN_EVENT_INTERVAL_TICKS = 225;   // ~15 seconds
var MAX_EVENT_INTERVAL_TICKS = 675;   // ~45 seconds
var FOOD_SURGE_DURATION_TICKS = 120;  // ~8 seconds
var FOOD_SURGE_COUNT_MIN = 3;
var FOOD_SURGE_COUNT_MAX = 5;
var SPEED_BURST_DURATION_TICKS = 75;  // ~5 seconds
var SPEED_BURST_WARNING_TICKS = 15;   // ~1 second warning flash
var SPEED_BURST_MULTIPLIER = 1.5;
var PORTAL_STORM_DURATION_TICKS = 150; // ~10 seconds
var PORTAL_STORM_PAIR_COUNT = 2;
var GOLD_RUSH_DURATION_TICKS = 90;    // ~6 seconds
var GOLD_RUSH_SCORE_MULTIPLIER = 3;
var BANNER_DISPLAY_TICKS = 30;        // ~2 seconds

// --- Event Definitions ---
var EVENT_TYPES = {
    FOOD_SURGE: 'FOOD_SURGE',
    SPEED_BURST: 'SPEED_BURST',
    GRAVITY_FLIP: 'GRAVITY_FLIP',
    PORTAL_STORM: 'PORTAL_STORM',
    GOLD_RUSH: 'GOLD_RUSH',
};

var EVENT_DISPLAY = {};
EVENT_DISPLAY[EVENT_TYPES.FOOD_SURGE] = { icon: '\u2728', label: 'FOOD SURGE!', color: '#4ade80' };
EVENT_DISPLAY[EVENT_TYPES.SPEED_BURST] = { icon: '\u26A1', label: 'SPEED BURST!', color: '#f97316' };
EVENT_DISPLAY[EVENT_TYPES.GRAVITY_FLIP] = { icon: '\u2195\uFE0F', label: 'GRAVITY FLIP!', color: '#a855f7' };
EVENT_DISPLAY[EVENT_TYPES.PORTAL_STORM] = { icon: '\uD83C\uDF00', label: 'PORTAL STORM!', color: '#8b5cf6' };
EVENT_DISPLAY[EVENT_TYPES.GOLD_RUSH] = { icon: '\uD83D\uDCB0', label: 'GOLD RUSH!', color: '#fbbf24' };

// --- State Creation ---

export function createWaveEventState() {
    return {
        ticksSinceLastEvent: 0,
        nextEventAt: rollNextEventTiming(),
        activeEvent: null,
        activeEventTicksLeft: 0,
        bannerTicksLeft: 0,
        bannerEvent: null,
        // Event-specific ephemeral data
        bonusFood: [],          // FOOD_SURGE extra food items
        stormPortals: [],       // PORTAL_STORM extra portal pairs
        speedBurstWarning: false, // SPEED_BURST: true during warning phase
        goldRushActive: false,  // GOLD_RUSH: currently boosting food score
    };
}

// --- Helpers ---

function rollNextEventTiming() {
    var range = MAX_EVENT_INTERVAL_TICKS - MIN_EVENT_INTERVAL_TICKS;
    return MIN_EVENT_INTERVAL_TICKS + Math.floor(Math.random() * range);
}

function pickRandomEvent(wave, state) {
    var candidates = [];

    // FOOD_SURGE: always available
    candidates.push(EVENT_TYPES.FOOD_SURGE);

    // SPEED_BURST: skip if time-slow or speed-boost power-up is active
    var hasTimeSlow = state.activePowerUp && state.activePowerUp.type === 'timeSlow';
    var hasSpeedBoost = state.activePowerUp && state.activePowerUp.type === 'speedBoost';
    if (!hasTimeSlow && !hasSpeedBoost) {
        candidates.push(EVENT_TYPES.SPEED_BURST);
    }

    // GRAVITY_FLIP: always available (just mirrors food position)
    candidates.push(EVENT_TYPES.GRAVITY_FLIP);

    // PORTAL_STORM: only if portals are enabled (wave >= 7)
    if (wave >= 7) {
        candidates.push(EVENT_TYPES.PORTAL_STORM);
    }

    // GOLD_RUSH: always available (makes current food golden)
    candidates.push(EVENT_TYPES.GOLD_RUSH);

    return candidates[Math.floor(Math.random() * candidates.length)];
}

function generateBonusFood(count, snake, walls, obstacles, portals, powerUp, hunter) {
    var items = [];
    for (var i = 0; i < count; i++) {
        var pos = randomPosition(snake, walls, obstacles, portals, powerUp, hunter);
        items.push({ x: pos.x, y: pos.y, type: 'golden' });
    }
    return items;
}

function generateStormPortals(count, snake, walls, obstacles, existingPortals, hunter) {
    var portals = [];
    for (var i = 0; i < count; i++) {
        var posA = randomPosition(snake, walls, obstacles, existingPortals, null, hunter);
        var posB = randomPosition(snake, walls, obstacles, existingPortals, posA, hunter);
        portals.push({ a: { x: posA.x, y: posA.y }, b: { x: posB.x, y: posB.y } });
    }
    return portals;
}

function mirrorPosition(pos, arenaMinX, arenaMinY, arenaMaxX, arenaMaxY) {
    var mirroredX = (GRID_SIZE - 1) - pos.x;
    var mirroredY = (GRID_SIZE - 1) - pos.y;
    var clampedX = Math.max(arenaMinX, Math.min(arenaMaxX, mirroredX));
    var clampedY = Math.max(arenaMinY, Math.min(arenaMaxY, mirroredY));
    return { x: clampedX, y: clampedY };
}

// --- Tick Update ---
// Called every game tick. Returns an updated waveEvent state and
// optional mutations to apply to the main game state.

export function tickWaveEvent(waveEvent, gameState) {
    // Don't run events on very early waves (before wave 3)
    if (gameState.endlessWave < 3) {
        return { waveEvent: waveEvent, effects: null };
    }

    // Decrement banner timer
    var newBannerTicks = waveEvent.bannerTicksLeft > 0 ? waveEvent.bannerTicksLeft - 1 : 0;
    var newBannerEvent = newBannerTicks > 0 ? waveEvent.bannerEvent : null;

    // --- Active event countdown ---
    if (waveEvent.activeEvent) {
        return tickActiveEvent(waveEvent, gameState, newBannerTicks, newBannerEvent);
    }

    // --- Waiting for next event ---
    var newTicksSince = waveEvent.ticksSinceLastEvent + 1;

    if (newTicksSince >= waveEvent.nextEventAt) {
        return triggerNewEvent(waveEvent, gameState, newBannerTicks, newBannerEvent, newTicksSince);
    }

    return {
        waveEvent: Object.assign({}, waveEvent, {
            ticksSinceLastEvent: newTicksSince,
            bannerTicksLeft: newBannerTicks,
            bannerEvent: newBannerEvent,
        }),
        effects: null,
    };
}

function tickActiveEvent(waveEvent, gameState, bannerTicks, bannerEvent) {
    var remaining = waveEvent.activeEventTicksLeft - 1;
    var effects = null;

    // SPEED_BURST: transition from warning to active phase
    if (waveEvent.activeEvent === EVENT_TYPES.SPEED_BURST && waveEvent.speedBurstWarning) {
        if (remaining <= SPEED_BURST_WARNING_TICKS) {
            return {
                waveEvent: Object.assign({}, waveEvent, {
                    activeEventTicksLeft: remaining,
                    speedBurstWarning: false,
                    bannerTicksLeft: bannerTicks,
                    bannerEvent: bannerEvent,
                }),
                effects: { type: 'speedBurstStart' },
            };
        }
    }

    // Event expired
    if (remaining <= 0) {
        return expireEvent(waveEvent, bannerTicks, bannerEvent);
    }

    return {
        waveEvent: Object.assign({}, waveEvent, {
            activeEventTicksLeft: remaining,
            bannerTicksLeft: bannerTicks,
            bannerEvent: bannerEvent,
        }),
        effects: effects,
    };
}

function expireEvent(waveEvent, bannerTicks, bannerEvent) {
    var effects = null;

    if (waveEvent.activeEvent === EVENT_TYPES.SPEED_BURST) {
        effects = { type: 'speedBurstEnd' };
    }

    return {
        waveEvent: Object.assign({}, createWaveEventState(), {
            ticksSinceLastEvent: 0,
            nextEventAt: rollNextEventTiming(),
            bannerTicksLeft: bannerTicks,
            bannerEvent: bannerEvent,
        }),
        effects: effects,
    };
}

function triggerNewEvent(waveEvent, gameState, bannerTicks, bannerEvent, ticksSince) {
    var eventType = pickRandomEvent(gameState.endlessWave, gameState);
    var effects = null;
    var duration = 0;
    var bonusFood = [];
    var stormPortals = [];
    var speedWarning = false;
    var goldRush = false;

    switch (eventType) {
        case EVENT_TYPES.FOOD_SURGE:
            duration = FOOD_SURGE_DURATION_TICKS;
            var surgeCount = FOOD_SURGE_COUNT_MIN + Math.floor(Math.random() * (FOOD_SURGE_COUNT_MAX - FOOD_SURGE_COUNT_MIN + 1));
            bonusFood = generateBonusFood(
                surgeCount,
                gameState.snake, gameState.walls, gameState.obstacles,
                gameState.portals, gameState.powerUp, gameState.hunter
            );
            effects = { type: 'foodSurgeStart', bonusFood: bonusFood };
            break;

        case EVENT_TYPES.SPEED_BURST:
            duration = SPEED_BURST_DURATION_TICKS;
            speedWarning = true;
            effects = { type: 'speedBurstWarning' };
            break;

        case EVENT_TYPES.GRAVITY_FLIP:
            duration = 1; // instant event
            effects = buildGravityFlipEffects(gameState);
            break;

        case EVENT_TYPES.PORTAL_STORM:
            duration = PORTAL_STORM_DURATION_TICKS;
            stormPortals = generateStormPortals(
                PORTAL_STORM_PAIR_COUNT,
                gameState.snake, gameState.walls, gameState.obstacles,
                gameState.portals, gameState.hunter
            );
            effects = { type: 'portalStormStart', stormPortals: stormPortals };
            break;

        case EVENT_TYPES.GOLD_RUSH:
            duration = GOLD_RUSH_DURATION_TICKS;
            goldRush = true;
            effects = { type: 'goldRushStart' };
            break;
    }

    return {
        waveEvent: Object.assign({}, waveEvent, {
            ticksSinceLastEvent: 0,
            nextEventAt: rollNextEventTiming(),
            activeEvent: eventType,
            activeEventTicksLeft: duration,
            bannerTicksLeft: BANNER_DISPLAY_TICKS,
            bannerEvent: eventType,
            bonusFood: bonusFood,
            stormPortals: stormPortals,
            speedBurstWarning: speedWarning,
            goldRushActive: goldRush,
        }),
        effects: effects,
    };
}

function buildGravityFlipEffects(gameState) {
    if (!gameState.food) {
        return { type: 'gravityFlip', newFoodPos: null };
    }
    var arenaMinX = gameState.arenaMinX !== undefined ? gameState.arenaMinX : 0;
    var arenaMinY = gameState.arenaMinY !== undefined ? gameState.arenaMinY : 0;
    var arenaMaxX = gameState.arenaMaxX !== undefined ? gameState.arenaMaxX : GRID_SIZE - 1;
    var arenaMaxY = gameState.arenaMaxY !== undefined ? gameState.arenaMaxY : GRID_SIZE - 1;
    var mirrored = mirrorPosition(gameState.food, arenaMinX, arenaMinY, arenaMaxX, arenaMaxY);
    return { type: 'gravityFlip', newFoodPos: mirrored };
}

// --- Bonus Food Collection ---
// Checks if the snake head hit any bonus food items.
// Returns updated bonusFood array and score to add.

export function checkBonusFoodCollection(waveEvent, head) {
    if (!waveEvent.activeEvent || waveEvent.bonusFood.length === 0) {
        return { bonusFood: waveEvent.bonusFood, collected: null };
    }

    var collected = null;
    var remaining = [];

    for (var i = 0; i < waveEvent.bonusFood.length; i++) {
        var bf = waveEvent.bonusFood[i];
        if (bf.x === head.x && bf.y === head.y && !collected) {
            collected = bf;
        } else {
            remaining.push(bf);
        }
    }

    return { bonusFood: remaining, collected: collected };
}

// --- Wave Reset ---
// Call when a new wave starts to reset event timing.

export function resetWaveEventForNewWave() {
    return createWaveEventState();
}

// --- Query Helpers ---

export function getActiveEventDisplay(waveEvent) {
    if (!waveEvent.bannerEvent) return null;
    return EVENT_DISPLAY[waveEvent.bannerEvent] || null;
}

export function isSpeedBurstActive(waveEvent) {
    return waveEvent.activeEvent === EVENT_TYPES.SPEED_BURST && !waveEvent.speedBurstWarning;
}

export function isGoldRushActive(waveEvent) {
    return waveEvent.goldRushActive;
}

export function getStormPortals(waveEvent) {
    if (waveEvent.activeEvent !== EVENT_TYPES.PORTAL_STORM) return [];
    return waveEvent.stormPortals;
}

export function getBonusFood(waveEvent) {
    if (waveEvent.activeEvent !== EVENT_TYPES.FOOD_SURGE) return [];
    return waveEvent.bonusFood;
}

export { SPEED_BURST_MULTIPLIER, GOLD_RUSH_SCORE_MULTIPLIER, EVENT_TYPES, EVENT_DISPLAY };
