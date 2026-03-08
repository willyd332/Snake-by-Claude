'use strict';

import { GRID_SIZE, LEVEL_CONFIG } from './constants.js';

// Food eaten per wave before advancing
export var ENDLESS_FOOD_PER_WAVE = 3;

// Wave names for narrative flavor
var WAVE_TITLES = {
    3: 'Walls rise.',
    5: 'The patrol begins.',
    7: 'Portals tear open.',
    9: 'Darkness descends.',
    11: 'Borders dissolve.',
    13: 'ALPHA awakens.',
    16: 'The arena contracts.',
    20: 'Everything converges.',
};

export function getWaveTitle(wave) {
    return WAVE_TITLES[wave] || null;
}

// Generate endless mode config for a given wave
export function getEndlessConfig(wave) {
    // Speed: starts at 140ms, decreases to 40ms minimum
    var speed = Math.max(40, 145 - wave * 5);

    // Cycle through level color palettes
    var colorIdx = ((wave - 1) % 10) + 1;
    var base = LEVEL_CONFIG[colorIdx];

    // Progressive mechanic introduction
    var hasWalls = wave >= 3;
    var hasObstacles = wave >= 5;
    var hasPowerUps = wave >= 6;
    var hasPortals = wave >= 7;
    var hasFog = wave >= 9;
    var hasWrap = wave >= 11;
    var hasHunter = wave >= 13;
    var hasShrink = wave >= 16;

    // Fog radius shrinks as waves increase
    var fogRadius = hasFog ? Math.max(3, 6 - Math.floor((wave - 9) / 4)) : null;

    // Hunter gets faster over time
    var hunterInterval = hasHunter ? Math.max(2, 4 - Math.floor((wave - 13) / 5)) : null;

    // Shrink gets more aggressive
    var shrinkInterval = hasShrink ? Math.max(2, 4 - Math.floor((wave - 16) / 4)) : null;

    return {
        speed: speed,
        color: base.color,
        foodColor: base.foodColor,
        wallColor: hasWalls ? (base.wallColor || '#1e3a5f') : null,
        bgAccent: base.bgAccent,
        gridAlpha: Math.min(0.08, 0.03 + wave * 0.002),
        obstacleColor: hasObstacles ? (base.obstacleColor || base.color) : null,
        portalColor: hasPortals ? (base.portalColor || '#8b5cf6') : null,
        fogRadius: fogRadius,
        wrapAround: hasWrap,
        powerUpsEnabled: hasPowerUps,
        hunterEnabled: hasHunter,
        hunterColor: hasHunter ? '#f97316' : null,
        hunterTickInterval: hunterInterval,
        shrinkingArena: hasShrink,
        shrinkInterval: shrinkInterval,
    };
}

// Deterministic pseudo-random from wave seed
function seededRand(seed) {
    var s = ((seed * 1103515245 + 12345) & 0x7fffffff);
    return {
        value: s % 1000 / 1000,
        next: s,
    };
}

// Procedural wall generation
export function generateEndlessWalls(wave) {
    if (wave < 3) return [];

    var walls = [];
    var complexity = Math.min(wave - 2, 10);
    var numClusters = Math.min(2 + Math.floor(complexity / 2), 7);
    var seed = wave * 7919 + 1;

    for (var c = 0; c < numClusters; c++) {
        var r1 = seededRand(seed);
        seed = r1.next;
        var r2 = seededRand(seed);
        seed = r2.next;
        var r3 = seededRand(seed);
        seed = r3.next;
        var r4 = seededRand(seed);
        seed = r4.next;

        var cx = 2 + Math.floor(r1.value * (GRID_SIZE - 5));
        var cy = 2 + Math.floor(r2.value * (GRID_SIZE - 5));

        // Keep spawn area (8-12, 8-12) clear
        if (cx >= 8 && cx <= 12 && cy >= 8 && cy <= 12) {
            cx = (cx + 6) % (GRID_SIZE - 4) + 2;
        }

        var clusterType = Math.floor(r3.value * 4);

        if (clusterType === 0) {
            // Horizontal line
            var hLen = 2 + Math.floor(r4.value * 3);
            for (var i = 0; i < hLen && cx + i < GRID_SIZE - 1; i++) {
                walls.push({ x: cx + i, y: cy });
            }
        } else if (clusterType === 1) {
            // Vertical line
            var vLen = 2 + Math.floor(r4.value * 3);
            for (var j = 0; j < vLen && cy + j < GRID_SIZE - 1; j++) {
                walls.push({ x: cx, y: cy + j });
            }
        } else if (clusterType === 2) {
            // L-shape
            walls.push({ x: cx, y: cy });
            if (cx + 1 < GRID_SIZE - 1) walls.push({ x: cx + 1, y: cy });
            if (cy + 1 < GRID_SIZE - 1) walls.push({ x: cx, y: cy + 1 });
        } else {
            // 2x2 block
            walls.push({ x: cx, y: cy });
            if (cx + 1 < GRID_SIZE - 1) walls.push({ x: cx + 1, y: cy });
            if (cy + 1 < GRID_SIZE - 1) walls.push({ x: cx, y: cy + 1 });
            if (cx + 1 < GRID_SIZE - 1 && cy + 1 < GRID_SIZE - 1) {
                walls.push({ x: cx + 1, y: cy + 1 });
            }
        }
    }

    // Clear spawn area (snake starts at 10,10) and hunter spawn area
    walls = walls.filter(function(w) {
        var inSpawn = w.x >= 7 && w.x <= 13 && w.y >= 7 && w.y <= 13;
        var inHunterSpawn = w.y === 17 && w.x >= 16 && w.x <= 19;
        return !inSpawn && !inHunterSpawn;
    });

    return walls;
}

// Procedural obstacle generation
export function generateEndlessObstacles(wave) {
    if (wave < 5) return [];

    var obstacles = [];
    var numObs = Math.min(1 + Math.floor((wave - 4) / 3), 4);
    var seed = wave * 6271 + 3;

    for (var i = 0; i < numObs; i++) {
        var r1 = seededRand(seed);
        seed = r1.next;
        var r2 = seededRand(seed);
        seed = r2.next;
        var r3 = seededRand(seed);
        seed = r3.next;

        var axis = r1.value < 0.5 ? 'x' : 'y';
        var pathLen = 3 + Math.floor(r2.value * 5);
        var startPos = 2 + Math.floor(r3.value * (GRID_SIZE - pathLen - 4));

        var r4 = seededRand(seed);
        seed = r4.next;
        var crossPos = 2 + Math.floor(r4.value * (GRID_SIZE - 4));

        var path = [];
        for (var p = 0; p < pathLen; p++) {
            path.push(startPos + p);
        }

        obstacles.push({
            x: axis === 'x' ? path[0] : crossPos,
            y: axis === 'y' ? path[0] : crossPos,
            path: path,
            axis: axis,
            pathIndex: 0,
            dir: 1,
        });
    }

    return obstacles;
}

// Procedural portal generation
export function generateEndlessPortals(wave) {
    if (wave < 7) return [];

    var numPortals = Math.min(1 + Math.floor((wave - 6) / 5), 3);
    var portals = [];
    var seed = wave * 5381 + 7;

    for (var i = 0; i < numPortals; i++) {
        var r1 = seededRand(seed);
        seed = r1.next;
        var r2 = seededRand(seed);
        seed = r2.next;
        var r3 = seededRand(seed);
        seed = r3.next;
        var r4 = seededRand(seed);
        seed = r4.next;

        var ax = 1 + Math.floor(r1.value * (GRID_SIZE / 2 - 2));
        var ay = 1 + Math.floor(r2.value * (GRID_SIZE - 3));
        var bx = Math.floor(GRID_SIZE / 2) + 1 + Math.floor(r3.value * (GRID_SIZE / 2 - 2));
        var by = 1 + Math.floor(r4.value * (GRID_SIZE - 3));

        portals.push({
            a: { x: ax, y: ay },
            b: { x: bx, y: by },
        });
    }

    return portals;
}

// Hunter generation for endless mode
export function generateEndlessHunter(wave) {
    if (wave < 13) return null;
    return {
        segments: [{ x: 17, y: 17 }, { x: 18, y: 17 }, { x: 19, y: 17 }],
        direction: { x: -1, y: 0 },
        moveCounter: 0,
        growPending: 0,
    };
}

// Endless high score persistence
export function getEndlessHighScore() {
    return parseInt(localStorage.getItem('snake-endless-highscore') || '0', 10);
}

export function setEndlessHighScore(score) {
    var current = getEndlessHighScore();
    if (score > current) {
        localStorage.setItem('snake-endless-highscore', String(score));
    }
}

export function getEndlessHighWave() {
    return parseInt(localStorage.getItem('snake-endless-highwave') || '0', 10);
}

export function setEndlessHighWave(wave) {
    var current = getEndlessHighWave();
    if (wave > current) {
        localStorage.setItem('snake-endless-highwave', String(wave));
    }
}
