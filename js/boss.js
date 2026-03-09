'use strict';

// --- Boss Snake (ALPHA Boss) ---
// Special boss snake that appears every 10 waves with 3 attack patterns.
// Architecturally similar to the hunter (see hunter.js) but with
// distinct AI behaviors and slower growth.

import { GRID_SIZE } from './constants.js';
import { getObstaclePositions } from './levels.js';

// --- Constants ---
var BOSS_INITIAL_LENGTH = 5;
var BOSS_GROW_FOOD_INTERVAL = 3;  // grows 1 segment every 3 food eaten by player
var BOSS_TICK_INTERVAL = 2;       // moves every 2 ticks (faster than hunter default)
var PATTERN_SWITCH_TICKS = 30;    // switch pattern every ~2 seconds
var ENTRANCE_TICKS = 15;          // dramatic entrance duration in ticks

// Attack patterns
var PATTERN_CHASE = 'chase';
var PATTERN_CIRCLE = 'circle';
var PATTERN_AMBUSH = 'ambush';
var ALL_PATTERNS = [PATTERN_CHASE, PATTERN_CIRCLE, PATTERN_AMBUSH];

// --- Boss State Creation ---

export function isBossWave(wave) {
    return wave > 0 && wave % 10 === 0;
}

export function createBoss(wave) {
    var startX = 5;
    var startY = Math.floor(GRID_SIZE / 2);
    var segments = [];
    for (var i = 0; i < BOSS_INITIAL_LENGTH; i++) {
        segments.push({ x: startX - i, y: startY });
    }
    return {
        segments: segments,
        direction: { x: 1, y: 0 },
        moveCounter: 0,
        growPending: 0,
        foodCounter: 0,
        pattern: pickRandomPattern(),
        patternTicks: 0,
        patternSwitchAt: PATTERN_SWITCH_TICKS,
        entranceTicks: ENTRANCE_TICKS,
        wave: wave,
        circleAngle: 0,
        circleRadius: 3,
    };
}

// --- Pattern Selection ---

function pickRandomPattern() {
    return ALL_PATTERNS[Math.floor(Math.random() * ALL_PATTERNS.length)];
}

// --- Boss Movement ---

export function moveBoss(boss, playerHead, playerDirection, walls, obstacles, config) {
    if (!boss) return null;

    // During entrance animation, slide in from the edge
    if (boss.entranceTicks > 0) {
        return Object.assign({}, boss, {
            entranceTicks: boss.entranceTicks - 1,
        });
    }

    var newCounter = boss.moveCounter + 1;
    if (newCounter < BOSS_TICK_INTERVAL) {
        return Object.assign({}, boss, { moveCounter: newCounter });
    }

    // Pattern switching
    var newPatternTicks = boss.patternTicks + 1;
    var newPattern = boss.pattern;
    var newCircleAngle = boss.circleAngle;
    var newCircleRadius = boss.circleRadius;
    if (newPatternTicks >= boss.patternSwitchAt) {
        newPattern = pickRandomPattern();
        newPatternTicks = 0;
        newCircleAngle = 0;
        newCircleRadius = 3;
    }

    var head = boss.segments[0];
    var targetPos = computeTargetPosition(
        newPattern, head, playerHead, playerDirection,
        newCircleAngle, newCircleRadius
    );

    // Increment circle angle for spiral pattern
    if (newPattern === PATTERN_CIRCLE) {
        newCircleAngle = newCircleAngle + 0.3;
        newCircleRadius = newCircleRadius + 0.15;
    }

    var bestMove = findBestMove(
        head, targetPos, boss.direction, boss.segments,
        boss.growPending, walls, obstacles, config
    );

    if (bestMove.blocked) {
        return Object.assign({}, boss, {
            moveCounter: 0,
            patternTicks: newPatternTicks,
            pattern: newPattern,
            circleAngle: newCircleAngle,
            circleRadius: newCircleRadius,
        });
    }

    var newHead = bestMove.pos;
    var newDir = bestMove.dir;
    var growing = boss.growPending > 0;
    var newSegments = [newHead].concat(
        growing ? boss.segments : boss.segments.slice(0, -1)
    );
    var newGrow = growing ? boss.growPending - 1 : 0;

    return {
        segments: newSegments,
        direction: newDir,
        moveCounter: 0,
        growPending: newGrow,
        foodCounter: boss.foodCounter,
        pattern: newPattern,
        patternTicks: newPatternTicks,
        patternSwitchAt: boss.patternSwitchAt,
        entranceTicks: 0,
        wave: boss.wave,
        circleAngle: newCircleAngle,
        circleRadius: newCircleRadius,
    };
}

// --- Target Position Computation ---

function computeTargetPosition(pattern, bossHead, playerHead, playerDir, circleAngle, circleRadius) {
    if (pattern === PATTERN_CHASE) {
        // Aggressively chase the player head
        return { x: playerHead.x, y: playerHead.y };
    }

    if (pattern === PATTERN_CIRCLE) {
        // Move in an expanding spiral around the player
        var cx = playerHead.x + Math.round(Math.cos(circleAngle) * circleRadius);
        var cy = playerHead.y + Math.round(Math.sin(circleAngle) * circleRadius);
        cx = Math.max(0, Math.min(GRID_SIZE - 1, cx));
        cy = Math.max(0, Math.min(GRID_SIZE - 1, cy));
        return { x: cx, y: cy };
    }

    if (pattern === PATTERN_AMBUSH) {
        // Move to cut off the player's predicted path
        var predictSteps = 5;
        var predictX = playerHead.x + playerDir.x * predictSteps;
        var predictY = playerHead.y + playerDir.y * predictSteps;
        predictX = Math.max(0, Math.min(GRID_SIZE - 1, predictX));
        predictY = Math.max(0, Math.min(GRID_SIZE - 1, predictY));
        return { x: predictX, y: predictY };
    }

    // Fallback: chase
    return { x: playerHead.x, y: playerHead.y };
}

// --- Pathfinding ---

function bossDistance(a, b, wrap) {
    if (wrap) {
        var dx = Math.abs(a.x - b.x);
        var dy = Math.abs(a.y - b.y);
        return Math.min(dx, GRID_SIZE - dx) + Math.min(dy, GRID_SIZE - dy);
    }
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function findBestMove(head, target, currentDir, segments, growPending, walls, obstacles, config) {
    var directions = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
    ];

    // Prevent immediate reversal
    directions = directions.filter(function(d) {
        return !(d.x + currentDir.x === 0 && d.y + currentDir.y === 0);
    });

    var wrap = config.wrapAround;
    var obPositions = obstacles ? getObstaclePositions(obstacles) : [];

    var scored = directions.map(function(d) {
        var nextPos = { x: head.x + d.x, y: head.y + d.y };
        if (wrap) {
            nextPos = {
                x: (nextPos.x + GRID_SIZE) % GRID_SIZE,
                y: (nextPos.y + GRID_SIZE) % GRID_SIZE,
            };
        } else if (nextPos.x < 0 || nextPos.x >= GRID_SIZE ||
                   nextPos.y < 0 || nextPos.y >= GRID_SIZE) {
            return { dir: d, pos: nextPos, dist: 9999, blocked: true };
        }

        var hitsWall = walls.some(function(w) {
            return w.x === nextPos.x && w.y === nextPos.y;
        });
        var bodyToCheck = growPending > 0 ? segments : segments.slice(0, -1);
        var hitsSelf = bodyToCheck.some(function(s) {
            return s.x === nextPos.x && s.y === nextPos.y;
        });
        var hitsObstacle = obPositions.some(function(o) {
            return o.x === nextPos.x && o.y === nextPos.y;
        });
        var blocked = hitsWall || hitsSelf || hitsObstacle;
        var dist = bossDistance(nextPos, target, wrap);
        return { dir: d, pos: nextPos, dist: dist, blocked: blocked };
    });

    scored.sort(function(a, b) {
        if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
        return a.dist - b.dist;
    });

    return scored[0];
}

// --- Boss Growth ---
// Call when player eats food. Boss grows 1 segment every BOSS_GROW_FOOD_INTERVAL foods.

export function onPlayerAteFood(boss) {
    if (!boss) return null;
    var newFoodCounter = boss.foodCounter + 1;
    var shouldGrow = newFoodCounter >= BOSS_GROW_FOOD_INTERVAL;
    return Object.assign({}, boss, {
        foodCounter: shouldGrow ? 0 : newFoodCounter,
        growPending: shouldGrow ? boss.growPending + 1 : boss.growPending,
    });
}

// --- Exports ---
export {
    PATTERN_CHASE,
    PATTERN_CIRCLE,
    PATTERN_AMBUSH,
    BOSS_INITIAL_LENGTH,
};
