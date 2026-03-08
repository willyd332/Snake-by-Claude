'use strict';

import { GRID_SIZE, FOOD_TO_LEVEL_UP, MAX_LEVEL, POWER_UP_SPAWN_INTERVAL } from './constants.js';
import { generateWalls, filterWallsFromSnake, generateObstacles, moveObstacles, getObstaclePositions, generatePortals, checkPortalTeleport } from './levels.js';
import { generateHunter, moveHunter } from './hunter.js';
import { spawnPowerUp, getPowerUpDef } from './powerups.js';
import { getLevelConfig, collides, randomPosition } from './state.js';

export function tick(prev) {
    if (prev.gameOver || !prev.started) return prev;

    var dir = prev.nextDirection;
    if (dir.x === 0 && dir.y === 0) return prev;

    var config = getLevelConfig(prev.level);
    var isGhost = prev.activePowerUp && prev.activePowerUp.type === 'ghost';
    var head = prev.snake[0];
    var newHead = { x: head.x + dir.x, y: head.y + dir.y };

    // Boundary: wrap-around or collision
    if (config.wrapAround || isGhost) {
        newHead = {
            x: (newHead.x + GRID_SIZE) % GRID_SIZE,
            y: (newHead.y + GRID_SIZE) % GRID_SIZE,
        };
    } else if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
               newHead.y < 0 || newHead.y >= GRID_SIZE) {
        return Object.assign({}, prev, { gameOver: true, direction: dir });
    }

    // Shrinking arena boundary — cannot be bypassed even with ghost
    if (config.shrinkingArena) {
        if (newHead.x < prev.arenaMinX || newHead.x > prev.arenaMaxX ||
            newHead.y < prev.arenaMinY || newHead.y > prev.arenaMaxY) {
            return Object.assign({}, prev, { gameOver: true, direction: dir });
        }
    }

    // Wall obstacle collision (ghost passes through)
    if (!isGhost && collides(newHead, prev.walls)) {
        return Object.assign({}, prev, { gameOver: true, direction: dir });
    }

    // Self collision (ghost passes through)
    if (!isGhost && collides(newHead, prev.snake)) {
        return Object.assign({}, prev, { gameOver: true, direction: dir });
    }

    // Moving obstacle collision (always fatal, even with ghost)
    if (prev.obstacles.length > 0 && collides(newHead, getObstaclePositions(prev.obstacles))) {
        return Object.assign({}, prev, { gameOver: true, direction: dir });
    }

    // Hunter collision (ghost passes through hunter body but not head)
    if (prev.hunter) {
        var hunterHead = prev.hunter.segments[0];
        var hitHunterHead = newHead.x === hunterHead.x && newHead.y === hunterHead.y;
        if (hitHunterHead) {
            return Object.assign({}, prev, { gameOver: true, direction: dir });
        }
        if (!isGhost && prev.hunter.segments.length > 1) {
            var hunterBody = prev.hunter.segments.slice(1);
            if (collides(newHead, hunterBody)) {
                return Object.assign({}, prev, { gameOver: true, direction: dir });
            }
        }
    }

    // Portal teleportation
    if (prev.portals.length > 0) {
        var teleportDest = checkPortalTeleport(newHead, prev.portals);
        if (teleportDest) {
            newHead = { x: teleportDest.x + dir.x, y: teleportDest.y + dir.y };
            if (config.wrapAround || isGhost) {
                newHead = {
                    x: (newHead.x + GRID_SIZE) % GRID_SIZE,
                    y: (newHead.y + GRID_SIZE) % GRID_SIZE,
                };
            } else if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
                       newHead.y < 0 || newHead.y >= GRID_SIZE) {
                return Object.assign({}, prev, { gameOver: true, direction: dir });
            }
            if (!isGhost && collides(newHead, prev.walls)) {
                return Object.assign({}, prev, { gameOver: true, direction: dir });
            }
        }
    }

    // Move obstacles
    var newObstacles = prev.obstacles.length > 0 ? moveObstacles(prev.obstacles) : prev.obstacles;

    // Check if obstacle moved onto snake body
    if (newObstacles.length > 0) {
        var obPositions = getObstaclePositions(newObstacles);
        var snakeHit = obPositions.some(function(op) { return collides(op, [newHead].concat(prev.snake)); });
        if (snakeHit) {
            return Object.assign({}, prev, { gameOver: true, direction: dir });
        }
    }

    // Move hunter AI
    var newHunter = prev.hunter ? moveHunter(prev.hunter, newHead, prev.walls, newObstacles, config) : null;

    var ate = prev.food && newHead.x === prev.food.x && newHead.y === prev.food.y;
    var newSnake = [newHead].concat(ate ? prev.snake : prev.snake.slice(0, -1));
    var newScore = ate ? prev.score + 10 : prev.score;
    var newFoodEaten = ate ? prev.foodEaten + 1 : prev.foodEaten;
    var newLevel = prev.level;
    var newWalls = prev.walls;
    var newPortals = prev.portals;
    var newFood = ate ? null : prev.food;

    // Check if hunter moved onto player snake
    if (newHunter) {
        var newHunterHead = newHunter.segments[0];
        var playerHead = newSnake[0];
        if (newHunterHead.x === playerHead.x && newHunterHead.y === playerHead.y) {
            return Object.assign({}, prev, { gameOver: true, direction: dir });
        }
        if (!isGhost && newSnake.length > 1) {
            if (collides(newHunterHead, newSnake.slice(1))) {
                return Object.assign({}, prev, { gameOver: true, direction: dir });
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

    // Power-up state updates
    var newPowerUp = prev.powerUp;
    var newActivePowerUp = prev.activePowerUp;
    var newPowerUpSpawnCounter = prev.powerUpSpawnCounter;
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
        newLevel = prev.level + 1;
        newFoodEaten = 0;
        newWalls = filterWallsFromSnake(generateWalls(newLevel), newSnake);
        newObstacles = generateObstacles(newLevel);
        newPortals = generatePortals(newLevel);
        newHunter = generateHunter(newLevel);
        newPowerUp = null;
        newActivePowerUp = null;
        newPowerUpSpawnCounter = 0;
    }

    // Shrinking arena
    var newArenaMinX = prev.arenaMinX;
    var newArenaMinY = prev.arenaMinY;
    var newArenaMaxX = prev.arenaMaxX;
    var newArenaMaxY = prev.arenaMaxY;
    var newShrinkCounter = prev.shrinkCounter;
    var shrinkOccurred = false;

    // Reset arena on level transition
    if (newLevel !== prev.level) {
        newArenaMinX = 0;
        newArenaMinY = 0;
        newArenaMaxX = GRID_SIZE - 1;
        newArenaMaxY = GRID_SIZE - 1;
        newShrinkCounter = 0;
    }

    if (ate && config.shrinkingArena && newLevel === prev.level) {
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
                    return Object.assign({}, prev, { gameOver: true, direction: dir });
                }
                if (newFood && collides(newFood, shrinkCells)) {
                    newFood = null;
                }
                if (newPowerUp && collides({ x: newPowerUp.x, y: newPowerUp.y }, shrinkCells)) {
                    newPowerUp = null;
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
        lastTick: prev.lastTick,
        arenaMinX: newArenaMinX,
        arenaMinY: newArenaMinY,
        arenaMaxX: newArenaMaxX,
        arenaMaxY: newArenaMaxY,
        shrinkCounter: newShrinkCounter,
        _collectedPowerUp: collectedPowerUpType,
        _shrinkOccurred: shrinkOccurred,
    };
}
