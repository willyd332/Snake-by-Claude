'use strict';

import {
    GRID_SIZE, FRENZY_EXTRA_FOOD, FRENZY_SCORE_MULTIPLIER,
    ZONE_MIN_WAVE, ZONE_MAX_ACTIVE, ZONE_SIZE,
    ZONE_LIFETIME_MIN, ZONE_LIFETIME_MAX, ZONE_SPAWN_CHANCE, ZONE_TYPES,
} from './constants.js';
import { getSettingsRef, getDifficultyPreset } from './settings.js';
import { moveObstacles, getObstaclePositions, checkPortalTeleport } from './levels.js';
import { moveHunter } from './hunter.js';
import { spawnPowerUp, getPowerUpDef } from './powerups.js';
import { getLevelConfig, collides, randomPosition } from './state.js';
import { ENDLESS_FOOD_PER_WAVE, getEndlessConfig, generateEndlessWalls, generateEndlessObstacles, generateEndlessPortals, generateEndlessHunter } from './endless.js';
import { isModifierActive } from './modifiers.js';
import { onFoodEaten, checkComboExpiry, createComboState, COMBO_BASE_SCORE } from './combo.js';
import {
    tickWaveEvent, checkBonusFoodCollection, resetWaveEventForNewWave,
    createWaveEventState, isGoldRushActive, GOLD_RUSH_SCORE_MULTIPLIER,
} from './wave-events.js';

// Food type spawn rates (must sum to 1.0)
var FOOD_TYPE_CHANCES = [
    { type: 'golden', chance: 0.15 },   // 15% — 3x points
    { type: 'clock',  chance: 0.10 },   // 10% — slow time for 5 sec
    { type: 'speed',  chance: 0.10 },   // 10% — speed boost 1.5x for 3 sec
    // standard fills the remaining 65%
];

// Durations in ticks (game runs at ~15 ticks/sec; timeSlow doubles tick interval)
var FOOD_CLOCK_TICKS = 75;   // ~5 sec (slow = double interval so effectively 5s)
var FOOD_SPEED_TICKS = 45;   // ~3 sec at base speed

function pickFoodType() {
    var roll = Math.random();
    var cumulative = 0;
    for (var i = 0; i < FOOD_TYPE_CHANCES.length; i++) {
        cumulative += FOOD_TYPE_CHANCES[i].chance;
        if (roll < cumulative) return FOOD_TYPE_CHANCES[i].type;
    }
    return 'standard';
}

// Move food one cell toward the snake head (magnet power-up effect).
// Food already adjacent to the head (Manhattan distance <= 1) is not moved.
// Respects arena bounds to prevent food escaping the playfield.
function magnetizeFood(food, head, minX, minY, maxX, maxY) {
    var dx = food.x - head.x;
    var dy = food.y - head.y;
    var dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= 1) return food;

    // Normalize direction to -1, 0, or 1 per axis
    var stepX = dx === 0 ? 0 : (dx > 0 ? -1 : 1);
    var stepY = dy === 0 ? 0 : (dy > 0 ? -1 : 1);

    // Prefer moving on the dominant axis (larger delta moves first)
    var newX = food.x;
    var newY = food.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        newX = food.x + stepX;
    } else {
        newY = food.y + stepY;
    }

    // Clamp to arena bounds
    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));

    return Object.assign({}, food, { x: newX, y: newY });
}

// Pick a zone type weighted by rarity
function pickZoneType() {
    var roll = Math.random();
    var cumulative = 0;
    for (var i = 0; i < ZONE_TYPES.length; i++) {
        cumulative += ZONE_TYPES[i].weight;
        if (roll < cumulative) return ZONE_TYPES[i];
    }
    return ZONE_TYPES[0];
}

// Check if a proposed zone placement overlaps walls, portals, or the snake spawn area
function zoneOverlapsBlocked(x, y, walls, portals, snake) {
    for (var zy = y; zy < y + ZONE_SIZE; zy++) {
        for (var zx = x; zx < x + ZONE_SIZE; zx++) {
            var cell = { x: zx, y: zy };
            if (collides(cell, walls)) return true;
            for (var pi = 0; pi < portals.length; pi++) {
                if ((portals[pi].a.x === zx && portals[pi].a.y === zy) ||
                    (portals[pi].b.x === zx && portals[pi].b.y === zy)) {
                    return true;
                }
            }
        }
    }
    // Keep spawn area (center ±2) clear
    var center = Math.floor(GRID_SIZE / 2);
    if (x + ZONE_SIZE > center - 2 && x < center + 3 &&
        y + ZONE_SIZE > center - 2 && y < center + 3) {
        return true;
    }
    return false;
}

// Check if a point is inside any zone
function getZoneAtPoint(x, y, zones) {
    for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (x >= z.x && x < z.x + ZONE_SIZE && y >= z.y && y < z.y + ZONE_SIZE) {
            return z;
        }
    }
    return null;
}

// Tick zone lifetimes (decrement) and remove expired zones
function tickZones(zones) {
    var result = [];
    for (var i = 0; i < zones.length; i++) {
        var updated = Object.assign({}, zones[i], { ticksLeft: zones[i].ticksLeft - 1 });
        if (updated.ticksLeft > 0) {
            result = result.concat([updated]);
        }
    }
    return result;
}

// Try to spawn a new zone, returning null if conditions aren't met
function trySpawnZone(zones, walls, portals, snake) {
    if (zones.length >= ZONE_MAX_ACTIVE) return null;
    if (Math.random() >= ZONE_SPAWN_CHANCE) return null;

    var maxAttempts = 30;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
        var zx = Math.floor(Math.random() * (GRID_SIZE - ZONE_SIZE));
        var zy = Math.floor(Math.random() * (GRID_SIZE - ZONE_SIZE));
        if (zoneOverlapsBlocked(zx, zy, walls, portals, snake)) continue;

        // Ensure no overlap with existing zones
        var overlapsExisting = false;
        for (var ei = 0; ei < zones.length; ei++) {
            var ez = zones[ei];
            if (zx < ez.x + ZONE_SIZE && zx + ZONE_SIZE > ez.x &&
                zy < ez.y + ZONE_SIZE && zy + ZONE_SIZE > ez.y) {
                overlapsExisting = true;
                break;
            }
        }
        if (overlapsExisting) continue;

        var zoneType = pickZoneType();
        var lifetime = ZONE_LIFETIME_MIN + Math.floor(Math.random() * (ZONE_LIFETIME_MAX - ZONE_LIFETIME_MIN + 1));
        return {
            x: zx,
            y: zy,
            multiplier: zoneType.multiplier,
            color: zoneType.color,
            glowColor: zoneType.glowColor,
            label: zoneType.label,
            ticksLeft: lifetime,
            maxTicks: lifetime,
        };
    }
    return null;
}

export function tick(prev) {
    // Clear one-frame event flags from previous tick
    var clean = Object.assign({}, prev, {
        _ateFood: false,
        _ateFoodPos: null,
        _ateFoodType: null,
        _collectedPowerUp: null,
        _shrinkOccurred: false,
        _killedByHunter: false,
        _deathCause: null,
        _shieldBroke: false,
        _comboExpired: false,
        _comboMultiplier: 1,
        _comboIncreased: false,
        _scoreGained: 0,
        _waveEventTriggered: null,
        _waveEventEffects: null,
        _ateBonusFood: false,
        _ateBonusFoodPos: null,
        _frenzyStarted: false,
        _frenzyEnded: false,
        _ateFrenzyFood: false,
        _ateFrenzyFoodPos: null,
        _activeZone: null,
        _hungryLost: false,
    });

    if (clean.gameOver || !clean.started) return clean;

    var dir = clean.nextDirection;
    if (dir.x === 0 && dir.y === 0) return clean;

    // GLASS SNAKE modifier: die if player tries a direction on the same axis as current
    // (effectively prevents any reversal-like maneuver — you can only turn perpendicular)
    if (isModifierActive(clean, 'glass_snake') && clean.direction.x !== 0 || clean.direction.y !== 0) {
        var isReversal = (dir.x + clean.direction.x === 0 && dir.y + clean.direction.y === 0);
        if (isReversal) {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'self' });
        }
    }

    var config = getLevelConfig(clean.level, clean.endlessConfig);

    // SHRINKING WORLD modifier: double the shrink speed by halving the interval
    if (isModifierActive(clean, 'shrinking_world') && config.shrinkingArena && config.shrinkInterval) {
        config = Object.assign({}, config, {
            shrinkInterval: Math.max(1, Math.floor(config.shrinkInterval / 2)),
        });
    }
    var isGhost = clean.activePowerUp && clean.activePowerUp.type === 'ghost';
    var isInvincible = clean.invincibleTicks > 0;
    var isShielded = clean.shieldActive;
    var newShieldActive = clean.shieldActive;
    var head = clean.snake[0];
    var newHead = { x: head.x + dir.x, y: head.y + dir.y };

    // Boundary: wrap-around or collision (invincible/ghost wraps instead of dying)
    if (config.wrapAround || isGhost || isInvincible) {
        newHead = {
            x: (newHead.x + GRID_SIZE) % GRID_SIZE,
            y: (newHead.y + GRID_SIZE) % GRID_SIZE,
        };
    } else if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
               newHead.y < 0 || newHead.y >= GRID_SIZE) {
        if (isShielded) {
            newHead = { x: head.x, y: head.y };
            isShielded = false;
            newShieldActive = false;
            clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
        } else {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'boundary', shieldActive: false });
        }
    }

    // Shrinking arena boundary — cannot be bypassed even with ghost (invincible/shield can bypass)
    if (config.shrinkingArena && !isInvincible) {
        if (newHead.x < clean.arenaMinX || newHead.x > clean.arenaMaxX ||
            newHead.y < clean.arenaMinY || newHead.y > clean.arenaMaxY) {
            if (isShielded) {
                newHead = { x: head.x, y: head.y };
                isShielded = false;
                newShieldActive = false;
                clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
            } else {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'arena', shieldActive: false });
            }
        }
    }

    // Wall obstacle collision (ghost or invincible passes through)
    if (!isGhost && !isInvincible && collides(newHead, clean.walls)) {
        if (isShielded) {
            newHead = { x: head.x, y: head.y };
            isShielded = false;
            newShieldActive = false;
            clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
        } else {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'wall', shieldActive: false });
        }
    }

    // Self collision (ghost or invincible passes through)
    if (!isGhost && !isInvincible && collides(newHead, clean.snake)) {
        if (isShielded) {
            newHead = { x: head.x, y: head.y };
            isShielded = false;
            newShieldActive = false;
            clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
        } else {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'self', shieldActive: false });
        }
    }

    // Moving obstacle collision (invincible passes through)
    if (!isInvincible && clean.obstacles.length > 0 && collides(newHead, getObstaclePositions(clean.obstacles))) {
        if (isShielded) {
            newHead = { x: head.x, y: head.y };
            isShielded = false;
            newShieldActive = false;
            clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
        } else {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'obstacle', shieldActive: false });
        }
    }

    // Hunter collision (invincible passes through; ghost passes through body but not head)
    if (clean.hunter && !isInvincible) {
        var hunterHead = clean.hunter.segments[0];
        var hitHunterHead = newHead.x === hunterHead.x && newHead.y === hunterHead.y;
        if (hitHunterHead) {
            if (isShielded) {
                newHead = { x: head.x, y: head.y };
                isShielded = false;
                newShieldActive = false;
                clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
            } else {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _killedByHunter: true, _deathCause: 'hunter', shieldActive: false });
            }
        }
        if (!isGhost && clean.hunter.segments.length > 1) {
            var hunterBody = clean.hunter.segments.slice(1);
            if (collides(newHead, hunterBody)) {
                if (isShielded) {
                    newHead = { x: head.x, y: head.y };
                    isShielded = false;
                    newShieldActive = false;
                    clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
                } else {
                    return Object.assign({}, clean, { gameOver: true, direction: dir, _killedByHunter: true, _deathCause: 'hunter', shieldActive: false });
                }
            }
        }
    }

    // Portal teleportation (includes storm portals from wave events)
    var allPortals = clean.portals;
    if (clean.waveEvent && clean.waveEvent.stormPortals && clean.waveEvent.stormPortals.length > 0) {
        allPortals = clean.portals.concat(clean.waveEvent.stormPortals);
    }
    if (allPortals.length > 0) {
        var teleportDest = checkPortalTeleport(newHead, allPortals);
        if (teleportDest) {
            newHead = { x: teleportDest.x + dir.x, y: teleportDest.y + dir.y };
            if (config.wrapAround || isGhost || isInvincible) {
                newHead = {
                    x: (newHead.x + GRID_SIZE) % GRID_SIZE,
                    y: (newHead.y + GRID_SIZE) % GRID_SIZE,
                };
            } else if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
                       newHead.y < 0 || newHead.y >= GRID_SIZE) {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'boundary' });
            }
            if (!isGhost && !isInvincible && collides(newHead, clean.walls)) {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'wall' });
            }
        }
    }

    // Move obstacles
    var newObstacles = clean.obstacles.length > 0 ? moveObstacles(clean.obstacles) : clean.obstacles;

    // Check if obstacle moved onto snake head (invincible ignores; body is safe)
    if (!isInvincible && newObstacles.length > 0) {
        var obPositions = getObstaclePositions(newObstacles);
        var snakeHit = obPositions.some(function(op) { return collides(op, [newHead]); });
        if (snakeHit) {
            if (isShielded) {
                newHead = { x: head.x, y: head.y };
                isShielded = false;
                newShieldActive = false;
                clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
            } else {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'obstacle', shieldActive: false });
            }
        }
    }

    // Move hunter AI
    var newHunter = clean.hunter ? moveHunter(clean.hunter, newHead, clean.walls, newObstacles, config) : null;

    var ate = clean.food && newHead.x === clean.food.x && newHead.y === clean.food.y;
    var newSnake = [newHead].concat(ate ? clean.snake : clean.snake.slice(0, -1));

    // Combo: check window expiry first, then apply food eaten
    var prevCombo = clean.combo || { multiplier: 1, streak: 0, windowEnd: 0 };
    var expiredCombo = checkComboExpiry(prevCombo, clean.lastTick);
    var currentCombo = expiredCombo !== null ? expiredCombo : prevCombo;
    var newCombo = currentCombo;
    var newScore = clean.score;
    var _comboExpired = expiredCombo !== null && prevCombo.multiplier > 1;
    var _comboMultiplier = currentCombo.multiplier;
    var _comboIncreased = false;
    var _scoreGained = 0;

    var ateFoodType = ate ? (clean.food.type || 'standard') : null;

    // Determine active score zone at head position (checked before scoring)
    var _activeZone = ate ? getZoneAtPoint(newHead.x, newHead.y, clean.scoreZones || []) : null;

    if (ate) {
        var eatResult = onFoodEaten(currentCombo, clean.lastTick);
        newCombo = eatResult.comboState;
        // Golden apple: 3x base score before combo multiplier
        var foodScoreMultiplier = ateFoodType === 'golden' ? 3 : 1;
        // Gold Rush event: all food worth 3x
        if (clean.waveEvent && isGoldRushActive(clean.waveEvent)) {
            foodScoreMultiplier = Math.max(foodScoreMultiplier, GOLD_RUSH_SCORE_MULTIPLIER);
        }
        // Frenzy active: all food worth 3x
        if (clean.activePowerUp && clean.activePowerUp.type === 'frenzy') {
            foodScoreMultiplier = Math.max(foodScoreMultiplier, FRENZY_SCORE_MULTIPLIER);
        }
        // Score zone: stacks multiplicatively with other multipliers
        if (_activeZone) {
            foodScoreMultiplier = foodScoreMultiplier * _activeZone.multiplier;
        }
        _scoreGained = eatResult.scoreGained * foodScoreMultiplier;
        newScore = clean.score + _scoreGained;
        _comboMultiplier = eatResult.comboState.multiplier;
        _comboIncreased = eatResult.wasComboIncrease;
    }

    var newFoodEaten = ate ? clean.foodEaten + 1 : clean.foodEaten;
    var newLevel = clean.level;
    var newWalls = clean.walls;
    var newPortals = clean.portals;
    var newFood = ate ? null : clean.food;

    // Check if hunter moved onto player head (invincible ignores; body is safe)
    if (newHunter && !isInvincible) {
        var newHunterHead = newHunter.segments[0];
        var playerHead = newSnake[0];
        if (newHunterHead.x === playerHead.x && newHunterHead.y === playerHead.y) {
            if (isShielded) {
                isShielded = false;
                newShieldActive = false;
                clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
            } else {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _killedByHunter: true, _deathCause: 'hunter', shieldActive: false });
            }
        }
    }

    // Hunter grows when player eats food
    if (ate && newHunter) {
        newHunter = Object.assign({}, newHunter, { growPending: newHunter.growPending + 1 });
    }

    // Check if hunter landed on food — respawn food to prevent soft-lock
    if (newHunter && newFood) {
        var hHead = newHunter.segments[0];
        if (hHead.x === newFood.x && hHead.y === newFood.y) {
            newHunter = Object.assign({}, newHunter, { growPending: newHunter.growPending + 1 });
            newFood = null;
        }
    }

    // Wave up check (endless mode is the only mode now)
    var endlessWave = clean.endlessWave;
    var endlessConfig = clean.endlessConfig;

    var newPowerUp = clean.powerUp;
    var newActivePowerUp = clean.activePowerUp;
    var newPowerUpSpawnCounter = clean.powerUpSpawnCounter;
    var newFrenzyFood = clean.frenzyFood || [];

    // Food type effects: clock triggers time slow, speed triggers speed boost
    if (ate && ateFoodType === 'clock') {
        newShieldActive = false;
        newActivePowerUp = { type: 'timeSlow', ticksLeft: FOOD_CLOCK_TICKS, fromFood: true };
    } else if (ate && ateFoodType === 'speed') {
        newShieldActive = false;
        newActivePowerUp = { type: 'speedBoost', ticksLeft: FOOD_SPEED_TICKS, fromFood: true };
    }

    // Track wave event state — will be updated at end of tick
    var newWaveEvent = clean.waveEvent || createWaveEventState();

    if (newFoodEaten >= ENDLESS_FOOD_PER_WAVE) {
        endlessWave = endlessWave + 1;
        endlessConfig = getEndlessConfig(endlessWave);
        newLevel = ((endlessWave - 1) % 10) + 1;
        newFoodEaten = 0;
        newWalls = generateEndlessWalls(endlessWave).filter(function(w) {
            return !newSnake.some(function(seg) { return seg.x === w.x && seg.y === w.y; });
        });
        newObstacles = generateEndlessObstacles(endlessWave);
        newPortals = generateEndlessPortals(endlessWave).filter(function(p) {
            return !collides(p.a, newWalls) && !collides(p.b, newWalls);
        });
        newHunter = endlessConfig.hunterEnabled ? generateEndlessHunter(endlessWave) : null;
        newFood = null;
        newPowerUp = null;
        newActivePowerUp = null;
        newPowerUpSpawnCounter = 0;
        newFrenzyFood = [];
        // Reset wave events on new wave
        newWaveEvent = resetWaveEventForNewWave();
    }

    // Shrinking arena
    var newArenaMinX = clean.arenaMinX;
    var newArenaMinY = clean.arenaMinY;
    var newArenaMaxX = clean.arenaMaxX;
    var newArenaMaxY = clean.arenaMaxY;
    var newShrinkCounter = clean.shrinkCounter;
    var shrinkOccurred = false;

    // Reset arena on wave transition
    if (endlessWave !== clean.endlessWave) {
        newArenaMinX = 0;
        newArenaMinY = 0;
        newArenaMaxX = GRID_SIZE - 1;
        newArenaMaxY = GRID_SIZE - 1;
        newShrinkCounter = 0;
    }

    if (ate && config.shrinkingArena && endlessWave === clean.endlessWave) {
        newShrinkCounter = newShrinkCounter + 1;
        if (newShrinkCounter >= config.shrinkInterval) {
            newShrinkCounter = 0;
            var canShrinkH = newArenaMaxX - newArenaMinX >= 6;
            var canShrinkV = newArenaMaxY - newArenaMinY >= 6;
            var shrinkEdges = [];
            if (canShrinkH) { shrinkEdges.push('left'); shrinkEdges.push('right'); }
            if (canShrinkV) { shrinkEdges.push('top'); shrinkEdges.push('bottom'); }

            if (shrinkEdges.length > 0) {
                shrinkOccurred = true;
                var edge = shrinkEdges[Math.floor(Math.random() * shrinkEdges.length)];
                var shrinkCells = [];
                if (edge === 'top') {
                    for (var sx = newArenaMinX; sx <= newArenaMaxX; sx++) {
                        shrinkCells.push({ x: sx, y: newArenaMinY });
                    }
                    newArenaMinY = newArenaMinY + 1;
                } else if (edge === 'bottom') {
                    for (var sx2 = newArenaMinX; sx2 <= newArenaMaxX; sx2++) {
                        shrinkCells.push({ x: sx2, y: newArenaMaxY });
                    }
                    newArenaMaxY = newArenaMaxY - 1;
                } else if (edge === 'left') {
                    for (var sy = newArenaMinY; sy <= newArenaMaxY; sy++) {
                        shrinkCells.push({ x: newArenaMinX, y: sy });
                    }
                    newArenaMinX = newArenaMinX + 1;
                } else {
                    for (var sy2 = newArenaMinY; sy2 <= newArenaMaxY; sy2++) {
                        shrinkCells.push({ x: newArenaMaxX, y: sy2 });
                    }
                    newArenaMaxX = newArenaMaxX - 1;
                }
                newWalls = newWalls.concat(shrinkCells);

                var snakeCrushed = newSnake.some(function(seg) {
                    return collides(seg, shrinkCells);
                });
                if (snakeCrushed && !isInvincible) {
                    if (isShielded) {
                        newHead = { x: head.x, y: head.y };
                        newSnake = [newHead].concat(clean.snake.slice(0, -1));
                        isShielded = false;
                        newShieldActive = false;
                        clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
                    } else {
                        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'crush', shieldActive: false });
                    }
                }
                if (newFood && collides(newFood, shrinkCells)) {
                    newFood = null;
                }
            }
        }
    }

    // Remove obstacles engulfed by shrinking arena
    if (config.shrinkingArena && newObstacles.length > 0) {
        newObstacles = newObstacles.filter(function(ob) {
            return ob.x >= newArenaMinX && ob.x <= newArenaMaxX &&
                   ob.y >= newArenaMinY && ob.y <= newArenaMaxY;
        });
    }

    // --- Score Multiplier Zones ---
    // Reset zones on wave transition; otherwise tick lifetimes and maybe spawn
    var newScoreZones = clean.scoreZones || [];
    if (endlessWave !== clean.endlessWave) {
        newScoreZones = [];
    } else {
        newScoreZones = tickZones(newScoreZones);
        if (endlessWave >= ZONE_MIN_WAVE) {
            var spawnedZone = trySpawnZone(newScoreZones, newWalls, newPortals, newSnake);
            if (spawnedZone) {
                newScoreZones = newScoreZones.concat([spawnedZone]);
            }
        }
    }

    // Spawn food if needed
    if (!newFood) {
        var spawnedPos = randomPosition(newSnake, newWalls, newObstacles, newPortals, null, newHunter);
        var spawnedFoodType = pickFoodType();
        // Inherit zone multiplier for food spawned inside a zone
        var spawnedFoodZone = getZoneAtPoint(spawnedPos.x, spawnedPos.y, newScoreZones);
        newFood = Object.assign({}, spawnedPos, { type: spawnedFoodType, zoneMultiplier: spawnedFoodZone ? spawnedFoodZone.multiplier : 1 });
    }

    // Magnet effect: move food one cell closer to snake head each tick
    var magnetActive = newActivePowerUp && newActivePowerUp.type === 'magnet';
    if (newFood && magnetActive) {
        newFood = magnetizeFood(newFood, newHead, newArenaMinX, newArenaMinY, newArenaMaxX, newArenaMaxY);
    }

    // Magnet also attracts bonus food during FOOD_SURGE
    if (magnetActive && newWaveEvent && newWaveEvent.bonusFood && newWaveEvent.bonusFood.length > 0) {
        var attractedBonusFood = newWaveEvent.bonusFood.map(function(bf) {
            return magnetizeFood(bf, newHead, newArenaMinX, newArenaMinY, newArenaMaxX, newArenaMaxY);
        });
        newWaveEvent = Object.assign({}, newWaveEvent, { bonusFood: attractedBonusFood });
    }

    // Power-up spawning
    var collectedPowerUpType = null;

    // Check power-up collection
    if (newPowerUp && newHead.x === newPowerUp.x && newHead.y === newPowerUp.y) {
        var def = getPowerUpDef(newPowerUp.type);
        newActivePowerUp = { type: newPowerUp.type, ticksLeft: def.duration };
        collectedPowerUpType = newPowerUp.type;
        if (newPowerUp.type === 'shield') {
            newShieldActive = true;
        }
        newPowerUp = null;
        newPowerUpSpawnCounter = 0;
    }

    // Frenzy: spawn extra food when frenzy is first activated
    var frenzyJustStarted = collectedPowerUpType === 'frenzy';
    if (frenzyJustStarted) {
        newFrenzyFood = [];
        for (var fi = 0; fi < FRENZY_EXTRA_FOOD; fi++) {
            // Exclude regular food and all previously chosen frenzy positions so
            // frenzy items never overlap each other or the regular food cell.
            var frenzyExclude = newFood ? [newFood].concat(newFrenzyFood) : newFrenzyFood.slice();
            var frenzyFoodPos = randomPosition(newSnake, newWalls, newObstacles, newPortals, frenzyExclude[0] || null, newHunter);
            // If there are multiple cells to exclude, keep re-sampling until we land
            // on a free cell (handles the case where FRENZY_EXTRA_FOOD > 1).
            if (frenzyExclude.length > 1) {
                var maxAttempts = 200;
                var attempts2 = 0;
                while (attempts2 < maxAttempts && frenzyExclude.some(function(ex) { return ex.x === frenzyFoodPos.x && ex.y === frenzyFoodPos.y; })) {
                    frenzyFoodPos = randomPosition(newSnake, newWalls, newObstacles, newPortals, null, newHunter);
                    attempts2++;
                }
            }
            newFrenzyFood = newFrenzyFood.concat([{ x: frenzyFoodPos.x, y: frenzyFoodPos.y }]);
        }
    }

    // Frenzy: check collection of extra food items
    var isFrenzyActive = newActivePowerUp && newActivePowerUp.type === 'frenzy';
    var ateFrenzyFood = false;
    var ateFrenzyFoodPos = null;
    if (isFrenzyActive && newFrenzyFood.length > 0) {
        var remainingFrenzyFood = [];
        for (var fj = 0; fj < newFrenzyFood.length; fj++) {
            if (!ateFrenzyFood && newHead.x === newFrenzyFood[fj].x && newHead.y === newFrenzyFood[fj].y) {
                ateFrenzyFood = true;
                ateFrenzyFoodPos = newFrenzyFood[fj];
                var frenzyEatResult = onFoodEaten(newCombo, clean.lastTick);
                newCombo = frenzyEatResult.comboState;
                var frenzyScoreGained = frenzyEatResult.scoreGained * FRENZY_SCORE_MULTIPLIER;
                newScore = newScore + frenzyScoreGained;
                _scoreGained = _scoreGained + frenzyScoreGained;
                // Snake grows from frenzy food
                newSnake = newSnake.concat([newSnake[newSnake.length - 1]]);
            } else {
                remainingFrenzyFood = remainingFrenzyFood.concat([newFrenzyFood[fj]]);
            }
        }
        newFrenzyFood = remainingFrenzyFood;
    }


    // Decrement power-up despawn timer
    if (newPowerUp) {
        newPowerUp = Object.assign({}, newPowerUp, { ticksLeft: newPowerUp.ticksLeft - 1 });
        if (newPowerUp.ticksLeft <= 0) {
            newPowerUp = null;
        }
    }

    // Decrement active power-up duration (skip if just collected this tick)
    if (newActivePowerUp && !collectedPowerUpType) {
        newActivePowerUp = Object.assign({}, newActivePowerUp, { ticksLeft: newActivePowerUp.ticksLeft - 1 });
        if (newActivePowerUp.ticksLeft <= 0) {
            newActivePowerUp = null;
            // Shield expired without absorbing a hit: disarm
            if (newShieldActive) {
                newShieldActive = false;
            }
        }
    }

    // Frenzy ended: clean up extra food (detected after decrement)
    var wasFrenzyActive = clean.activePowerUp && clean.activePowerUp.type === 'frenzy';
    var frenzyJustEnded = wasFrenzyActive && !(newActivePowerUp && newActivePowerUp.type === 'frenzy') && !frenzyJustStarted;
    if (frenzyJustEnded) {
        newFrenzyFood = [];
    }

    // Power-up spawning from config — spawn one at a random position
    // HARDCORE modifier: completely disables power-up spawning
    var newConfig = getLevelConfig(newLevel, endlessConfig);
    var hardcoreActive = isModifierActive(clean, 'hardcore');
    if (newConfig.powerUpsEnabled && !newPowerUp && !collectedPowerUpType && !hardcoreActive) {
        newPowerUpSpawnCounter = newPowerUpSpawnCounter + 1;
        var puInterval = getDifficultyPreset(getSettingsRef().difficulty).powerUpFreq;
        if (newPowerUpSpawnCounter >= puInterval) {
            newPowerUp = spawnPowerUp(newSnake, newWalls, newObstacles, newPortals, newFood, null, newHunter, endlessWave);
            newPowerUpSpawnCounter = 0;
        }
    }

    // Handle power-up/shrink items cleared by arena shrink
    if (shrinkOccurred && newPowerUp) {
        var shrinkWalls = newWalls;
        if (collides({ x: newPowerUp.x, y: newPowerUp.y }, shrinkWalls)) {
            newPowerUp = null;
        }
    }

    // --- Wave Events System ---
    var waveEventTriggered = null;
    var waveEventEffects = null;
    var ateBonusFood = false;
    var ateBonusFoodPos = null;

    // Tick the wave event timer/state
    var waveTickResult = tickWaveEvent(newWaveEvent, {
        endlessWave: endlessWave,
        activePowerUp: newActivePowerUp,
        snake: newSnake,
        walls: newWalls,
        obstacles: newObstacles,
        portals: newPortals,
        powerUp: newPowerUp,
        hunter: newHunter,
        food: newFood,
        arenaMinX: newArenaMinX,
        arenaMinY: newArenaMinY,
        arenaMaxX: newArenaMaxX,
        arenaMaxY: newArenaMaxY,
    });
    newWaveEvent = waveTickResult.waveEvent;

    if (waveTickResult.effects) {
        waveEventEffects = waveTickResult.effects;
        waveEventTriggered = newWaveEvent.activeEvent;

        // Apply immediate effects
        if (waveTickResult.effects.type === 'gravityFlip' && waveTickResult.effects.newFoodPos) {
            newFood = Object.assign({}, newFood, waveTickResult.effects.newFoodPos);
        }
    }

    // Check if snake head collected a bonus food item (FOOD_SURGE)
    if (newWaveEvent.bonusFood.length > 0) {
        var bonusResult = checkBonusFoodCollection(newWaveEvent, newSnake[0]);
        if (bonusResult.collected) {
            ateBonusFood = true;
            ateBonusFoodPos = bonusResult.collected;
            // Bonus food grants score (3x like golden)
            var bonusEatResult = onFoodEaten(newCombo, clean.lastTick);
            newCombo = bonusEatResult.comboState;
            var bonusScoreGained = bonusEatResult.scoreGained * 3;
            newScore = newScore + bonusScoreGained;
            _scoreGained = _scoreGained + bonusScoreGained;
            // Snake grows from bonus food
            newSnake = newSnake.concat([newSnake[newSnake.length - 1]]);
        }
        newWaveEvent = Object.assign({}, newWaveEvent, { bonusFood: bonusResult.bonusFood });
    }

    // --- HUNGRY modifier: lose a tail segment every 8 moves ---
    var HUNGRY_INTERVAL = 8;
    var newHungryCounter = clean.hungryCounter || 0;
    var hungryLost = false;
    if (isModifierActive(clean, 'hungry')) {
        newHungryCounter = newHungryCounter + 1;
        if (newHungryCounter >= HUNGRY_INTERVAL && newSnake.length > 1) {
            newSnake = newSnake.slice(0, -1);
            newHungryCounter = 0;
            hungryLost = true;
        }
    }

    // --- Apply modifier score multiplier ---
    var modifierMultiplier = clean.modifierMultiplier || 1;
    if (modifierMultiplier > 1 && _scoreGained > 0) {
        var bonusFromModifiers = Math.round(_scoreGained * (modifierMultiplier - 1));
        newScore = newScore + bonusFromModifiers;
        _scoreGained = _scoreGained + bonusFromModifiers;
    }

    return {
        snake: newSnake,
        direction: dir,
        nextDirection: dir,
        food: newFood,
        walls: newWalls,
        obstacles: newObstacles,
        portals: newPortals,
        powerUp: hardcoreActive ? null : newPowerUp,
        activePowerUp: newActivePowerUp,
        powerUpSpawnCounter: newPowerUpSpawnCounter,
        hunter: newHunter,
        score: newScore,
        level: newLevel,
        foodEaten: newFoodEaten,
        gameOver: false,
        started: true,
        lastTick: clean.lastTick,
        arenaMinX: newArenaMinX,
        arenaMinY: newArenaMinY,
        arenaMaxX: newArenaMaxX,
        arenaMaxY: newArenaMaxY,
        shrinkCounter: newShrinkCounter,
        endlessWave: endlessWave,
        endlessConfig: endlessConfig,
        wallInset: 0,
        lives: clean.lives,
        invincibleTicks: isInvincible ? clean.invincibleTicks - 1 : 0,
        combo: newCombo,
        shieldActive: newShieldActive,
        waveEvent: newWaveEvent,
        frenzyFood: newFrenzyFood,
        modifiers: clean.modifiers || [],
        modifierMultiplier: modifierMultiplier,
        hungryCounter: newHungryCounter,
        fogActive: clean.fogActive || false,
        _collectedPowerUp: collectedPowerUpType,
        _shrinkOccurred: shrinkOccurred,
        _ateFood: ate,
        _ateFoodPos: ate ? clean.food : null,
        _ateFoodType: ateFoodType,
        _killedByHunter: false,
        _deathCause: null,
        _shieldBroke: clean._shieldBroke,
        _comboExpired: _comboExpired,
        _comboMultiplier: _comboMultiplier,
        _comboIncreased: _comboIncreased,
        _scoreGained: _scoreGained,
        _waveEventTriggered: waveEventTriggered,
        _waveEventEffects: waveEventEffects,
        _ateBonusFood: ateBonusFood,
        _ateBonusFoodPos: ateBonusFoodPos,
        _frenzyStarted: frenzyJustStarted,
        _frenzyEnded: frenzyJustEnded,
        _ateFrenzyFood: ateFrenzyFood,
        _ateFrenzyFoodPos: ateFrenzyFoodPos,
        scoreZones: newScoreZones,
        _activeZone: _activeZone,
        _hungryLost: hungryLost,
    };
}
