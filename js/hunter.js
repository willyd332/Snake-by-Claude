'use strict';

import { GRID_SIZE, LEVEL_CONFIG } from './constants.js';
import { getObstaclePositions } from './levels.js';

export function generateHunter(level) {
    var config = LEVEL_CONFIG[level];
    if (!config || !config.hunterEnabled) return null;
    // Level 10: corner walls block default spawn; start in open space near bottom
    if (level === 10) {
        return {
            segments: [
                { x: GRID_SIZE - 6, y: GRID_SIZE - 2 },
                { x: GRID_SIZE - 5, y: GRID_SIZE - 2 },
                { x: GRID_SIZE - 4, y: GRID_SIZE - 2 },
            ],
            direction: { x: -1, y: 0 },
            moveCounter: 0,
            growPending: 0,
        };
    }
    // Default: spawn near bottom-right corner
    return {
        segments: [
            { x: GRID_SIZE - 3, y: GRID_SIZE - 3 },
            { x: GRID_SIZE - 2, y: GRID_SIZE - 3 },
            { x: GRID_SIZE - 1, y: GRID_SIZE - 3 },
        ],
        direction: { x: -1, y: 0 },
        moveCounter: 0,
        growPending: 0,
    };
}

export function getHunterPositions(hunter) {
    if (!hunter) return [];
    return hunter.segments.map(function(s) { return { x: s.x, y: s.y }; });
}

export function manhattanDistance(a, b, wrap) {
    if (wrap) {
        var dx = Math.abs(a.x - b.x);
        var dy = Math.abs(a.y - b.y);
        return Math.min(dx, GRID_SIZE - dx) + Math.min(dy, GRID_SIZE - dy);
    }
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function moveHunter(hunter, targetHead, walls, obstacles, config) {
    if (!hunter) return null;
    var newCounter = hunter.moveCounter + 1;
    var interval = config.hunterTickInterval || 3;
    if (newCounter < interval) {
        return Object.assign({}, hunter, { moveCounter: newCounter });
    }
    var head = hunter.segments[0];
    var directions = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
    ];
    directions = directions.filter(function(d) {
        return !(d.x + hunter.direction.x === 0 && d.y + hunter.direction.y === 0);
    });
    var wrap = config.wrapAround;
    var obPositions = obstacles ? getObstaclePositions(obstacles) : [];
    var scored = directions.map(function(d) {
        var nextPos = { x: head.x + d.x, y: head.y + d.y };
        if (wrap) {
            nextPos = { x: (nextPos.x + GRID_SIZE) % GRID_SIZE, y: (nextPos.y + GRID_SIZE) % GRID_SIZE };
        } else if (nextPos.x < 0 || nextPos.x >= GRID_SIZE || nextPos.y < 0 || nextPos.y >= GRID_SIZE) {
            return { dir: d, pos: nextPos, dist: 9999, blocked: true };
        }
        var hitsWall = walls.some(function(w) { return w.x === nextPos.x && w.y === nextPos.y; });
        var bodyToCheck = hunter.growPending > 0 ? hunter.segments : hunter.segments.slice(0, -1);
        var hitsSelf = bodyToCheck.some(function(s) { return s.x === nextPos.x && s.y === nextPos.y; });
        var hitsObstacle = obPositions.some(function(o) { return o.x === nextPos.x && o.y === nextPos.y; });
        var blocked = hitsWall || hitsSelf || hitsObstacle;
        var dist = manhattanDistance(nextPos, targetHead, wrap);
        return { dir: d, pos: nextPos, dist: dist, blocked: blocked };
    });
    scored.sort(function(a, b) {
        if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
        return a.dist - b.dist;
    });
    var best = scored[0];
    if (best.blocked) {
        return Object.assign({}, hunter, { moveCounter: 0 });
    }
    var newHead = best.pos;
    var newDir = best.dir;
    var growing = hunter.growPending > 0;
    var newSegments = [newHead].concat(growing ? hunter.segments : hunter.segments.slice(0, -1));
    var newGrow = growing ? hunter.growPending - 1 : 0;
    return {
        segments: newSegments,
        direction: newDir,
        moveCounter: 0,
        growPending: newGrow,
    };
}
