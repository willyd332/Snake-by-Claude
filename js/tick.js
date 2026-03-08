'use strict';

import { GRID_SIZE } from './constants.js';
import { getSettingsRef, getDifficultyPreset } from './settings.js';
import { moveObstacles, getObstaclePositions, checkPortalTeleport } from './levels.js';
import { moveHunter } from './hunter.js';
import { spawnPowerUp, getPowerUpDef } from './powerups.js';
import { getLevelConfig, collides, randomPosition } from './state.js';
import { ENDLESS_FOOD_PER_WAVE, getEndlessConfig, generateEndlessWalls, generateEndlessObstacles, generateEndlessPortals, generateEndlessHunter } from './endless.js';
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
    });

    if (clean.gameOver || !clean.started) return clean;

    var dir = clean.nextDirection;
    if (dir.x === 0 && dir.y === 0) return clean;

    var config = getLevelConfig(clean.level, clean.endlessConfig);
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

    if (ate) {
        var eatResult = onFoodEaten(currentCombo, clean.lastTick);
        newCombo = eatResult.comboState;
        // Golden apple: 3x base score before combo multiplier
        var foodScoreMultiplier = ateFoodType === 'golden' ? 3 : 1;
        // Gold Rush event: all food worth 3x
        if (clean.waveEvent && isGoldRushActive(clean.waveEvent)) {
            foodScoreMultiplier = Math.max(foodScoreMultiplier, GOLD_RUSH_SCORE_MULTIPLIER);
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

    // Spawn food if needed
    if (!newFood) {
        var spawnedPos = randomPosition(newSnake, newWalls, newObstacles, newPortals, null, newHunter);
        newFood = Object.assign({}, spawnedPos, { type: pickFoodType() });
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

    // Power-up spawning from config
    var newConfig = getLevelConfig(newLevel, endlessConfig);
    if (newConfig.powerUpsEnabled && !newPowerUp && !collectedPowerUpType) {
        newPowerUpSpawnCounter = newPowerUpSpawnCounter + 1;
        var puInterval = getDifficultyPreset(getSettingsRef().difficulty).powerUpFreq;
        if (newPowerUpSpawnCounter >= puInterval) {
            newPowerUp = spawnPowerUp(newSnake, newWalls, newObstacles, newPortals, newFood, null, newHunter);
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

    return {
        snake: newSnake,
        direction: dir,
        nextDirection: dir,
        food: newFood,
        walls: newWalls,
        obstacles: newObstacles,
        portals: newPortals,
        powerUp: newPowerUp,
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
    };
}
