'use strict';

import { GRID_SIZE } from './constants.js';
import { getSettingsRef, getDifficultyPreset } from './settings.js';
import { moveObstacles, getObstaclePositions, checkPortalTeleport } from './levels.js';
import { moveHunter } from './hunter.js';
import { spawnPowerUp, getPowerUpDef } from './powerups.js';
import { getLevelConfig, collides, randomPosition } from './state.js';
import { ENDLESS_FOOD_PER_WAVE, getEndlessConfig, generateEndlessWalls, generateEndlessObstacles, generateEndlessPortals, generateEndlessHunter } from './endless.js';
import { onFoodEaten, checkComboExpiry, createComboState } from './combo.js';

export function tick(prev) {
    // Clear one-frame event flags from previous tick
    var clean = Object.assign({}, prev, {
        _ateFood: false,
        _ateFoodPos: null,
        _collectedPowerUp: null,
        _shrinkOccurred: false,
        _killedByHunter: false,
        _deathCause: null,
        _shieldBroke: false,
        _comboExpired: false,
        _comboMultiplier: 1,
        _comboIncreased: false,
    });

    if (clean.gameOver || !clean.started) return clean;

    var dir = clean.nextDirection;
    if (dir.x === 0 && dir.y === 0) return clean;

    var config = getLevelConfig(clean.level, clean.endlessConfig);
    var isGhost = clean.activePowerUp && clean.activePowerUp.type === 'ghost';
    var isInvincible = clean.invincibleTicks > 0;
    var isShielded = clean.shieldActive;
    var head = clean.snake[0];
    var newHead = { x: head.x + dir.x, y: head.y + dir.y };

    // Boundary: wrap-around or collision (invincible/shield wraps instead of dying)
    if (config.wrapAround || isGhost || isInvincible || isShielded) {
        newHead = {
            x: (newHead.x + GRID_SIZE) % GRID_SIZE,
            y: (newHead.y + GRID_SIZE) % GRID_SIZE,
        };
    } else if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
               newHead.y < 0 || newHead.y >= GRID_SIZE) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'boundary', shieldActive: false });
    }

    // Shrinking arena boundary — cannot be bypassed even with ghost (invincible/shield can bypass)
    if (config.shrinkingArena && !isInvincible) {
        if (newHead.x < clean.arenaMinX || newHead.x > clean.arenaMaxX ||
            newHead.y < clean.arenaMinY || newHead.y > clean.arenaMaxY) {
            if (isShielded) {
                newHead = { x: head.x, y: head.y };
                isShielded = false;
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
                    clean = Object.assign({}, clean, { shieldActive: false, activePowerUp: null, _shieldBroke: true });
                } else {
                    return Object.assign({}, clean, { gameOver: true, direction: dir, _killedByHunter: true, _deathCause: 'hunter', shieldActive: false });
                }
            }
        }
    }

    // Portal teleportation
    if (clean.portals.length > 0) {
        var teleportDest = checkPortalTeleport(newHead, clean.portals);
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

    if (ate) {
        var eatResult = onFoodEaten(currentCombo, clean.lastTick);
        newCombo = eatResult.comboState;
        newScore = clean.score + eatResult.scoreGained;
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
                        isShielded = false;
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
        newFood = randomPosition(newSnake, newWalls, newObstacles, newPortals, null, newHunter);
    }

    // Power-up spawning
    var collectedPowerUpType = null;
    var newShieldActive = clean.shieldActive;

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

    // If shield absorbed a hit this tick, ensure it's fully cleared
    if (clean._shieldBroke) {
        newShieldActive = false;
        newActivePowerUp = null;
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
        _collectedPowerUp: collectedPowerUpType,
        _shrinkOccurred: shrinkOccurred,
        _ateFood: ate,
        _ateFoodPos: ate ? clean.food : null,
        _killedByHunter: false,
        _deathCause: null,
        _shieldBroke: clean._shieldBroke,
        _comboExpired: _comboExpired,
        _comboMultiplier: _comboMultiplier,
        _comboIncreased: _comboIncreased,
    };
}
