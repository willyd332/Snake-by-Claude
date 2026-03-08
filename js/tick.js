'use strict';

import { GRID_SIZE, FOOD_TO_LEVEL_UP, MAX_LEVEL, POWER_UP_SPAWN_INTERVAL } from './constants.js';
import { generateWalls, filterWallsFromSnake, generateObstacles, moveObstacles, getObstaclePositions, generatePortals, checkPortalTeleport } from './levels.js';
import { generateHunter, moveHunter } from './hunter.js';
import { spawnPowerUp, getPowerUpDef } from './powerups.js';
import { getLevelConfig, collides, randomPosition } from './state.js';

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
    });

    if (clean.gameOver || !clean.started) return clean;

    var dir = clean.nextDirection;
    if (dir.x === 0 && dir.y === 0) return clean;

    var config = getLevelConfig(clean.level);
    var isGhost = clean.activePowerUp && clean.activePowerUp.type === 'ghost';
    var head = clean.snake[0];
    var newHead = { x: head.x + dir.x, y: head.y + dir.y };

    // Boundary: wrap-around or collision
    if (config.wrapAround || isGhost) {
        newHead = {
            x: (newHead.x + GRID_SIZE) % GRID_SIZE,
            y: (newHead.y + GRID_SIZE) % GRID_SIZE,
        };
    } else if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
               newHead.y < 0 || newHead.y >= GRID_SIZE) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'boundary' });
    }

    // Shrinking arena boundary — cannot be bypassed even with ghost
    if (config.shrinkingArena) {
        if (newHead.x < clean.arenaMinX || newHead.x > clean.arenaMaxX ||
            newHead.y < clean.arenaMinY || newHead.y > clean.arenaMaxY) {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'arena' });
        }
    }

    // Wall obstacle collision (ghost passes through)
    if (!isGhost && collides(newHead, clean.walls)) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'wall' });
    }

    // Self collision (ghost passes through)
    if (!isGhost && collides(newHead, clean.snake)) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'self' });
    }

    // Moving obstacle collision (always fatal, even with ghost)
    if (clean.obstacles.length > 0 && collides(newHead, getObstaclePositions(clean.obstacles))) {
        return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'obstacle' });
    }

    // Hunter collision (ghost passes through hunter body but not head)
    if (clean.hunter) {
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
            if (config.wrapAround || isGhost) {
                newHead = {
                    x: (newHead.x + GRID_SIZE) % GRID_SIZE,
                    y: (newHead.y + GRID_SIZE) % GRID_SIZE,
                };
            } else if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
                       newHead.y < 0 || newHead.y >= GRID_SIZE) {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'boundary' });
            }
            if (!isGhost && collides(newHead, clean.walls)) {
                return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'wall' });
            }
        }
    }

    // Move obstacles
    var newObstacles = clean.obstacles.length > 0 ? moveObstacles(clean.obstacles) : clean.obstacles;

    // Check if obstacle moved onto snake body
    if (newObstacles.length > 0) {
        var obPositions = getObstaclePositions(newObstacles);
        var snakeHit = obPositions.some(function(op) { return collides(op, [newHead].concat(clean.snake)); });
        if (snakeHit) {
            return Object.assign({}, clean, { gameOver: true, direction: dir, _deathCause: 'obstacle' });
        }
    }

    // Move hunter AI
    var newHunter = clean.hunter ? moveHunter(clean.hunter, newHead, clean.walls, newObstacles, config) : null;

    var ate = clean.food && newHead.x === clean.food.x && newHead.y === clean.food.y;
    var newSnake = [newHead].concat(ate ? clean.snake : clean.snake.slice(0, -1));
    var newScore = ate ? clean.score + 10 : clean.score;
    var newFoodEaten = ate ? clean.foodEaten + 1 : clean.foodEaten;
    var newLevel = clean.level;
    var newWalls = clean.walls;
    var newPortals = clean.portals;
    var newFood = ate ? null : clean.food;

    // Check if hunter moved onto player snake
    if (newHunter) {
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

    // Level up check
    if (newFoodEaten >= FOOD_TO_LEVEL_UP && newLevel < MAX_LEVEL) {
        newLevel = clean.level + 1;
        newFoodEaten = 0;
        newWalls = filterWallsFromSnake(generateWalls(newLevel), newSnake);
        newObstacles = generateObstacles(newLevel);
        newPortals = generatePortals(newLevel);
        newHunter = generateHunter(newLevel);
        newPowerUp = null;
        newActivePowerUp = null;
        newPowerUpSpawnCounter = 0;
        newFragment = null;
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
                if (snakeCrushed) {
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

    // Power-up spawning
    var newConfig = getLevelConfig(newLevel);
    if (newConfig.powerUpsEnabled && !newPowerUp && !collectedPowerUpType) {
        newPowerUpSpawnCounter = newPowerUpSpawnCounter + 1;
        if (newPowerUpSpawnCounter >= POWER_UP_SPAWN_INTERVAL) {
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
        _collectedPowerUp: collectedPowerUpType,
        _collectedFragment: collectedFragment,
        _collectedFragmentLevel: collectedFragmentLevel,
        _shrinkOccurred: shrinkOccurred,
        _ateFood: ate,
        _ateFoodPos: ate ? clean.food : null,
        _killedByHunter: false,
        _deathCause: null,
    };
}
