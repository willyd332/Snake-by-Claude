'use strict';

import { GRID_SIZE, FOOD_TO_LEVEL_UP, MAX_LEVEL, POWER_UP_SPAWN_INTERVAL, setGridSize, LEVEL_GRID_SIZE, LEVEL_UP_INVINCIBLE_TICKS } from './constants.js';
import { getSettingsRef, getDifficultyPreset } from './settings.js';
import { generateWalls, filterWallsFromSnake, generateObstacles, moveObstacles, getObstaclePositions, generatePortals, checkPortalTeleport } from './levels.js';
import { generateHunter, moveHunter } from './hunter.js';
import { spawnPowerUp, getPowerUpDef } from './powerups.js';
import { getLevelConfig, collides, randomPosition } from './state.js';
import { ENDLESS_FOOD_PER_WAVE, getEndlessConfig, generateEndlessWalls, generateEndlessObstacles, generateEndlessPortals, generateEndlessHunter } from './endless.js';
import { tickBoss, createBossState, checkShadowCloneCollision, getShadowCloneHitPenalty, getShockwaveBounds, pushSnakeInward, getBerserkTickInterval } from './boss.js';

export function tick(prev) {
    // Clear one-frame event flags from previous tick
    var clean = Object.assign({}, prev, {
        _ateFood: false,
        _ateFoodPos: null,
        _collectedPowerUp: null,
        _shrinkOccurred: false,
        _collectedFragment: false,
        _collectedFragmentLevel: null,
        _killedByHunter: false,
        _deathCause: null,
        _bossCloneHit: false,
        _bossPulseTriggered: false,
        _bossPhaseChanged: false,
    });

    if (clean.gameOver || !clean.started) return clean;

    var dir = clean.nextDirection;
    if (dir.x === 0 && dir.y === 0) return clean;

    var config = getLevelConfig(clean.level, clean.endlessConfig);
    var isGhost = clean.activePowerUp && clean.activePowerUp.type === 'ghost';
    var isInvincible = clean.invincibleTicks > 0;
    var head = clean.snake[0];
    var newHead = { x: head.x + dir.x, y: head.y + dir.y };

    // Boundary: wrap-around or collision (invincible wraps instead of dying)
    if (config.wrapAround || isGhost || isInvincible) {
        newHead = {
            x: (newHead.x + GRID_SIZE) % GRID_SIZE,
            y: (newHead.y + GRID_SIZE) % GRID_SIZE,
        };
    } else if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
               newHead.y < 0 || newHead.y >= GRID_SIZE) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'boundary' });
    }

    // Shrinking arena boundary — cannot be bypassed even with ghost (invincible can bypass)
    if (config.shrinkingArena && !isInvincible) {
        if (newHead.x < clean.arenaMinX || newHead.x > clean.arenaMaxX ||
            newHead.y < clean.arenaMinY || newHead.y > clean.arenaMaxY) {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'arena' });
        }
    }

    // Wall obstacle collision (ghost or invincible passes through)
    if (!isGhost && !isInvincible && collides(newHead, clean.walls)) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'wall' });
    }

    // Self collision (ghost or invincible passes through)
    if (!isGhost && !isInvincible && collides(newHead, clean.snake)) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'self' });
    }

    // Moving obstacle collision (invincible passes through)
    if (!isInvincible && clean.obstacles.length > 0 && collides(newHead, getObstaclePositions(clean.obstacles))) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'obstacle' });
    }

    // Hunter collision (invincible passes through; ghost passes through body but not head)
    if (clean.hunter && !isInvincible) {
        var hunterHead = clean.hunter.segments[0];
        var hitHunterHead = newHead.x === hunterHead.x && newHead.y === hunterHead.y;
        if (hitHunterHead) {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _killedByHunter: true, _deathCause: 'hunter' });
        }
        if (!isGhost && clean.hunter.segments.length > 1) {
            var hunterBody = clean.hunter.segments.slice(1);
            if (collides(newHead, hunterBody)) {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _killedByHunter: true, _deathCause: 'hunter' });
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

    // Check if obstacle moved onto snake body (invincible ignores)
    if (!isInvincible && newObstacles.length > 0) {
        var obPositions = getObstaclePositions(newObstacles);
        var snakeHit = obPositions.some(function(op) { return collides(op, [newHead].concat(clean.snake)); });
        if (snakeHit) {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'obstacle' });
        }
    }

    // Move hunter AI (with berserk speed override on Level 10)
    var bossConfig = config;
    if (clean.bossState && clean.bossState.berserkActive && config.hunterTickInterval) {
        bossConfig = Object.assign({}, config, {
            hunterTickInterval: getBerserkTickInterval(config.hunterTickInterval),
        });
    }
    var newHunter = clean.hunter ? moveHunter(clean.hunter, newHead, clean.walls, newObstacles, bossConfig) : null;

    var ate = clean.food && newHead.x === clean.food.x && newHead.y === clean.food.y;
    var newSnake = [newHead].concat(ate ? clean.snake : clean.snake.slice(0, -1));
    var newScore = ate ? clean.score + 10 : clean.score;
    var newFoodEaten = ate ? clean.foodEaten + 1 : clean.foodEaten;
    var newLevel = clean.level;
    var newWalls = clean.walls;
    var newPortals = clean.portals;
    var newFood = ate ? null : clean.food;

    // Check if hunter moved onto player snake (invincible ignores)
    if (newHunter && !isInvincible) {
        var newHunterHead = newHunter.segments[0];
        var playerHead = newSnake[0];
        if (newHunterHead.x === playerHead.x && newHunterHead.y === playerHead.y) {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _killedByHunter: true, _deathCause: 'hunter' });
        }
        if (!isGhost && newSnake.length > 1) {
            if (collides(newHunterHead, newSnake.slice(1))) {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _killedByHunter: true, _deathCause: 'hunter' });
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

    // Fragment collection
    var collectedFragment = false;
    var collectedFragmentLevel = null;
    var newFragment = clean.fragment;
    if (newFragment && newHead.x === newFragment.x && newHead.y === newFragment.y) {
        collectedFragment = true;
        collectedFragmentLevel = clean.level;
        newFragment = null;
    }

    // Power-up state updates
    var newPowerUp = clean.powerUp;
    var newActivePowerUp = clean.activePowerUp;
    var newPowerUpSpawnCounter = clean.powerUpSpawnCounter;
    var collectedPowerUpType = null;

    // Check power-up collection
    if (newPowerUp && newHead.x === newPowerUp.x && newHead.y === newPowerUp.y) {
        var def = getPowerUpDef(newPowerUp.type);
        newActivePowerUp = { type: newPowerUp.type, ticksLeft: def.duration };
        collectedPowerUpType = newPowerUp.type;
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
        }
    }

    // Level up / Wave up check
    var endlessWave = clean.endlessWave;
    var endlessConfig = clean.endlessConfig;
    var foodThreshold = endlessWave > 0 ? ENDLESS_FOOD_PER_WAVE : FOOD_TO_LEVEL_UP;

    if (newFoodEaten >= foodThreshold) {
        if (endlessWave > 0) {
            // Endless mode: wave up
            endlessWave = endlessWave + 1;
            endlessConfig = getEndlessConfig(endlessWave);
            newLevel = ((endlessWave - 1) % 10) + 1;
            newFoodEaten = 0;
            newWalls = filterWallsFromSnake(generateEndlessWalls(endlessWave), newSnake);
            newObstacles = generateEndlessObstacles(endlessWave);
            newPortals = generateEndlessPortals(endlessWave).filter(function(p) {
                return !collides(p.a, newWalls) && !collides(p.b, newWalls);
            });
            newHunter = endlessConfig.hunterEnabled ? generateEndlessHunter(endlessWave) : null;
            newPowerUp = null;
            newActivePowerUp = null;
            newPowerUpSpawnCounter = 0;
            newFragment = null;
        } else if (newLevel < MAX_LEVEL) {
            // Normal mode: level up
            newLevel = clean.level + 1;
            newFoodEaten = 0;
            setGridSize(LEVEL_GRID_SIZE[newLevel] || 20);
            newWalls = filterWallsFromSnake(generateWalls(newLevel), newSnake);
            newObstacles = generateObstacles(newLevel);
            newPortals = generatePortals(newLevel);
            newHunter = generateHunter(newLevel);
            newPowerUp = null;
            newActivePowerUp = null;
            newPowerUpSpawnCounter = 0;
            newFragment = null;
        }
    }

    // Shrinking arena
    var newArenaMinX = clean.arenaMinX;
    var newArenaMinY = clean.arenaMinY;
    var newArenaMaxX = clean.arenaMaxX;
    var newArenaMaxY = clean.arenaMaxY;
    var newShrinkCounter = clean.shrinkCounter;
    var shrinkOccurred = false;

    // Reset arena on level transition
    if (newLevel !== clean.level) {
        newArenaMinX = 0;
        newArenaMinY = 0;
        newArenaMaxX = GRID_SIZE - 1;
        newArenaMaxY = GRID_SIZE - 1;
        newShrinkCounter = 0;
    }

    if (ate && config.shrinkingArena && newLevel === clean.level) {
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
                    return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'crush' });
                }
                if (newFood && collides(newFood, shrinkCells)) {
                    newFood = null;
                }
                if (newPowerUp && collides({ x: newPowerUp.x, y: newPowerUp.y }, shrinkCells)) {
                    newPowerUp = null;
                }
                if (newFragment && collides({ x: newFragment.x, y: newFragment.y }, shrinkCells)) {
                    newFragment = null;
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
        newFood = randomPosition(newSnake, newWalls, newObstacles, newPortals, newPowerUp, newHunter);
    }

    // --- Boss Fight Logic (Level 10 only) ---
    var newBossState = clean.bossState;
    var bossCloneHit = false;
    var bossPulseTriggered = false;
    var bossPhaseChanged = false;

    if (newLevel === MAX_LEVEL && clean.endlessWave === 0) {
        // Tick the boss state machine
        var prevBossPhase = newBossState ? newBossState.phase : 1;
        var bossGameState = {
            foodEaten: newFoodEaten,
            snake: newSnake,
            walls: newWalls,
            obstacles: newObstacles,
            portals: newPortals,
            powerUp: newPowerUp,
            hunter: newHunter,
        };
        newBossState = tickBoss(newBossState || createBossState(), bossGameState, config);

        if (newBossState && newBossState.phase > prevBossPhase) {
            bossPhaseChanged = true;
        }

        // Food pulse: scatter food when pulse triggers
        if (newBossState && newBossState.pulseTriggered && newFood) {
            bossPulseTriggered = true;
            newFood = randomPosition(newSnake, newWalls, newObstacles, newPortals, newPowerUp, newHunter);
        }

        // Shadow clone collision: penalty but no death
        if (newBossState && newBossState.shadowClones.length > 0) {
            if (checkShadowCloneCollision(newHead, newBossState.shadowClones)) {
                bossCloneHit = true;
                newScore = Math.max(0, newScore - getShadowCloneHitPenalty());
            }
        }

        // Shockwave: push snake inward when active
        if (newBossState && newBossState.shockwaveActive) {
            var swBounds = getShockwaveBounds(newBossState);
            if (swBounds) {
                newSnake = pushSnakeInward(newSnake, swBounds);
            }
        }
    } else if (newLevel !== MAX_LEVEL || clean.endlessWave > 0) {
        // Reset boss state when not on Level 10
        newBossState = null;
    }

    // Power-up spawning
    var newConfig = getLevelConfig(newLevel, endlessConfig);
    if (newConfig.powerUpsEnabled && !newPowerUp && !collectedPowerUpType) {
        newPowerUpSpawnCounter = newPowerUpSpawnCounter + 1;
        var puInterval = getDifficultyPreset(getSettingsRef().difficulty).powerUpFreq;
        if (newPowerUpSpawnCounter >= puInterval) {
            newPowerUp = spawnPowerUp(newSnake, newWalls, newObstacles, newPortals, newFood, null, newHunter);
            newPowerUpSpawnCounter = 0;
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
        fragment: newFragment,
        endlessWave: endlessWave,
        endlessConfig: endlessConfig,
        lives: clean.lives,
        invincibleTicks: (newLevel !== clean.level) ? LEVEL_UP_INVINCIBLE_TICKS : (isInvincible ? clean.invincibleTicks - 1 : 0),
        bossState: newBossState,
        _collectedPowerUp: collectedPowerUpType,
        _collectedFragment: collectedFragment,
        _collectedFragmentLevel: collectedFragmentLevel,
        _shrinkOccurred: shrinkOccurred,
        _ateFood: ate,
        _ateFoodPos: ate ? clean.food : null,
        _killedByHunter: false,
        _deathCause: null,
        _bossCloneHit: bossCloneHit,
        _bossPulseTriggered: bossPulseTriggered,
        _bossPhaseChanged: bossPhaseChanged,
    };
}
