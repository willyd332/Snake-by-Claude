'use strict';

import { GRID_SIZE, POWER_UP_TYPES, POWER_UP_DESPAWN_TICKS, FRENZY_MIN_WAVE } from './constants.js';
import { getObstaclePositions, getPortalPositions } from './levels.js';
import { getHunterPositions } from './hunter.js';

export function spawnPowerUp(snake, walls, obstacles, portals, food, currentPowerUp, hunter, endlessWave) {
    if (currentPowerUp) return currentPowerUp;
    var availableTypes = POWER_UP_TYPES.filter(function(t) {
        if (t.type === 'frenzy') return (endlessWave || 1) >= FRENZY_MIN_WAVE;
        return true;
    });
    var typeDef = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    var hunterPositions = hunter ? getHunterPositions(hunter) : [];
    var occupied = (walls || []).concat(snake).concat(getObstaclePositions(obstacles || [])).concat(getPortalPositions(portals || [])).concat(hunterPositions);
    if (food) occupied = occupied.concat([food]);
    var pos;
    var attempts = 0;
    do {
        pos = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE),
        };
        attempts++;
        if (attempts > 1000) return null;
    } while (occupied.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; }));
    return { x: pos.x, y: pos.y, type: typeDef.type, ticksLeft: POWER_UP_DESPAWN_TICKS };
}

export function getPowerUpDef(type) {
    for (var i = 0; i < POWER_UP_TYPES.length; i++) {
        if (POWER_UP_TYPES[i].type === type) return POWER_UP_TYPES[i];
    }
    return null;
}

// Returns two distinct random power-up type definitions from the available pool.
export function getTwoPowerUpChoices(endlessWave) {
    var availableTypes = POWER_UP_TYPES.filter(function(t) {
        if (t.type === 'frenzy') return (endlessWave || 1) >= FRENZY_MIN_WAVE;
        return true;
    });
    if (availableTypes.length < 2) {
        return availableTypes.concat(availableTypes).slice(0, 2);
    }
    var shuffled = availableTypes.slice();
    // Fisher-Yates partial shuffle for first 2 elements
    for (var i = 0; i < 2; i++) {
        var j = i + Math.floor(Math.random() * (shuffled.length - i));
        var temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
    }
    return [shuffled[0], shuffled[1]];
}

// Spawns a power-up of the given type at a random empty position.
export function spawnPowerUpOfType(typeDef, snake, walls, obstacles, portals, food, hunter) {
    var hunterPositions = hunter ? getHunterPositions(hunter) : [];
    var occupied = (walls || []).concat(snake).concat(getObstaclePositions(obstacles || [])).concat(getPortalPositions(portals || [])).concat(hunterPositions);
    if (food) occupied = occupied.concat([food]);
    var pos;
    var attempts = 0;
    do {
        pos = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE),
        };
        attempts++;
        if (attempts > 1000) return null;
    } while (occupied.some(function(seg) { return seg.x === pos.x && seg.y === pos.y; }));
    return { x: pos.x, y: pos.y, type: typeDef.type, ticksLeft: POWER_UP_DESPAWN_TICKS };
}
