'use strict';

import { GRID_SIZE, POWER_UP_TYPES, POWER_UP_DESPAWN_TICKS } from './constants.js';
import { getObstaclePositions, getPortalPositions } from './levels.js';
import { getHunterPositions } from './hunter.js';

export function spawnPowerUp(snake, walls, obstacles, portals, food, currentPowerUp, hunter) {
    if (currentPowerUp) return currentPowerUp;
    var typeDef = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
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
