'use strict';

import { GRID_SIZE, INITIAL_LIVES } from './constants.js';
import { getObstaclePositions, getPortalPositions } from './levels.js';
import { getHunterPositions } from './hunter.js';
import { createComboState } from './combo.js';

export function createInitialState() {
    return {
        snake: [{ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) }],
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
        endlessWave: 1,
        endlessConfig: null,
        lives: INITIAL_LIVES,
        invincibleTicks: 0,
        wallInset: 0,
        shieldActive: false,
        combo: createComboState(),
    };
}

function isNearObstacle(pos, obPositions) {
    for (var i = 0; i < obPositions.length; i++) {
        var dx = Math.abs(pos.x - obPositions[i].x);
        var dy = Math.abs(pos.y - obPositions[i].y);
        if (dx <= 2 && dy <= 2) return true;
    }
    return false;
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
        if (attempts > 1000) {
            // Last resort: prefer unoccupied; if all cells full just return last tried pos
            if (!occupied.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; })) {
                return pos;
            }
            for (var fx = 0; fx < GRID_SIZE; fx++) {
                for (var fy = 0; fy < GRID_SIZE; fy++) {
                    var fp = { x: fx, y: fy };
                    if (!occupied.some(function(seg) { return seg.x === fp.x && seg.y === fp.y; })) {
                        return fp;
                    }
                }
            }
            return pos;
        }
    } while (
        occupied.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; }) ||
        (attempts <= 500 && isNearObstacle(pos, obPositions))
    );
    return pos;
}

export function randomPositionInBounds(snake, walls, obstacles, portals, powerUp, hunter, minX, minY, maxX, maxY) {
    var obPositions = obstacles ? getObstaclePositions(obstacles) : [];
    var portalPositions = portals ? getPortalPositions(portals) : [];
    var hunterPositions = hunter ? getHunterPositions(hunter) : [];
    var occupied = (walls || []).concat(snake).concat(obPositions).concat(portalPositions).concat(hunterPositions);
    if (powerUp) occupied = occupied.concat([powerUp]);
    var rangeX = maxX - minX + 1;
    var rangeY = maxY - minY + 1;
    var pos;
    var attempts = 0;
    do {
        pos = {
            x: minX + Math.floor(Math.random() * rangeX),
            y: minY + Math.floor(Math.random() * rangeY),
        };
        attempts++;
        if (attempts > 1000) {
            // Last resort: prefer unoccupied; if all cells full just return last tried pos
            if (!occupied.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; })) {
                return pos;
            }
            for (var fx = minX; fx <= maxX; fx++) {
                for (var fy = minY; fy <= maxY; fy++) {
                    var fp = { x: fx, y: fy };
                    if (!occupied.some(function(seg) { return seg.x === fp.x && seg.y === fp.y; })) {
                        return fp;
                    }
                }
            }
            return pos;
        }
    } while (
        occupied.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; }) ||
        (attempts <= 500 && isNearObstacle(pos, obPositions))
    );
    return pos;
}

export function getLevelConfig(level, endlessConfig) {
    if (endlessConfig) return endlessConfig;
    // Fallback: return a basic config (should not be reached in normal gameplay)
    return { speed: 150, color: '#22c55e', foodColor: '#ef4444', wallColor: null, bgAccent: '#0d1117', gridAlpha: 0.03, obstacleColor: null, portalColor: null, fogRadius: null, wrapAround: false, powerUpsEnabled: false };
}

export function collides(pos, segments) {
    return segments.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; });
}
