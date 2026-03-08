'use strict';

import { GRID_SIZE, LEVEL_CONFIG, MAX_LEVEL, INITIAL_LIVES } from './constants.js';
import { getObstaclePositions, getPortalPositions } from './levels.js';
import { getHunterPositions } from './hunter.js';

export function createInitialState() {
    return {
        snake: [{ x: 10, y: 10 }],
        direction: { x: 0, y: 0 },
        nextDirection: { x: 0, y: 0 },
        food: null,
        walls: [],
        obstacles: [],
        portals: [],
        powerUp: null,
        activePowerUp: null,
        powerUpSpawnCounter: 0,
        hunter: null,
        score: 0,
        level: 1,
        foodEaten: 0,
        gameOver: false,
        started: false,
        lastTick: 0,
        arenaMinX: 0,
        arenaMinY: 0,
        arenaMaxX: GRID_SIZE - 1,
        arenaMaxY: GRID_SIZE - 1,
        shrinkCounter: 0,
        fragment: null,
        endlessWave: 0,
        endlessConfig: null,
        lives: INITIAL_LIVES,
        invincibleTicks: 0,
    };
}

export function randomPosition(snake, walls, obstacles, portals, powerUp, hunter) {
    var obPositions = obstacles ? getObstaclePositions(obstacles) : [];
    var portalPositions = portals ? getPortalPositions(portals) : [];
    var hunterPositions = hunter ? getHunterPositions(hunter) : [];
    var occupied = (walls || []).concat(snake).concat(obPositions).concat(portalPositions).concat(hunterPositions);
    if (powerUp) occupied = occupied.concat([powerUp]);
    var pos;
    var attempts = 0;
    do {
        pos = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE),
        };
        attempts++;
        if (attempts > 1000) return pos;
    } while (occupied.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; }));
    return pos;
}

export function getLevelConfig(level, endlessConfig) {
    if (endlessConfig) return endlessConfig;
    var clamped = Math.min(level, MAX_LEVEL);
    return LEVEL_CONFIG[clamped];
}

export function collides(pos, segments) {
    return segments.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; });
}
