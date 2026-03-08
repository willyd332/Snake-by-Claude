'use strict';

export function generateWalls(level) {
    var walls = [];
    if (level <= 1) return walls;

    if (level === 2) {
        [8, 9, 10, 11].forEach(function(x) { walls.push({ x: x, y: 5 }); });
        [8, 9, 10, 11].forEach(function(x) { walls.push({ x: x, y: 14 }); });
        [8, 9, 10, 11].forEach(function(y) { walls.push({ x: 5, y: y }); });
        [8, 9, 10, 11].forEach(function(y) { walls.push({ x: 14, y: y }); });
        return walls;
    }

    if (level === 3) {
        [2, 3, 4, 5, 6, 7].forEach(function(x) { walls.push({ x: x, y: 6 }); });
        [12, 13, 14, 15, 16, 17].forEach(function(x) { walls.push({ x: x, y: 6 }); });
        [2, 3, 4, 5, 6, 7].forEach(function(x) { walls.push({ x: x, y: 13 }); });
        [12, 13, 14, 15, 16, 17].forEach(function(x) { walls.push({ x: x, y: 13 }); });
        [3, 4, 5].forEach(function(y) { walls.push({ x: 10, y: y }); });
        [14, 15, 16].forEach(function(y) { walls.push({ x: 10, y: y }); });
        walls.push({ x: 3, y: 3 }, { x: 16, y: 3 });
        walls.push({ x: 3, y: 16 }, { x: 16, y: 16 });
        return walls;
    }

    if (level === 4) {
        [5, 6, 7, 8, 11, 12, 13, 14].forEach(function(x) { walls.push({ x: x, y: 4 }); });
        [5, 6, 7, 8, 11, 12, 13, 14].forEach(function(x) { walls.push({ x: x, y: 15 }); });
        [5, 6, 7, 8, 11, 12, 13, 14].forEach(function(y) { walls.push({ x: 4, y: y }); });
        [5, 6, 7, 8, 11, 12, 13, 14].forEach(function(y) { walls.push({ x: 15, y: y }); });
        walls.push({ x: 9, y: 7 }, { x: 10, y: 7 });
        walls.push({ x: 9, y: 12 }, { x: 10, y: 12 });
        walls.push({ x: 7, y: 9 }, { x: 7, y: 10 });
        walls.push({ x: 12, y: 9 }, { x: 12, y: 10 });
        return walls;
    }

    if (level === 5) {
        [3, 4, 5, 6, 7].forEach(function(x) { walls.push({ x: x, y: 3 }); });
        [3, 4, 5, 6, 7].forEach(function(x) { walls.push({ x: x, y: 8 }); });
        [4, 5, 6, 7].forEach(function(y) { walls.push({ x: 3, y: y }); });
        [12, 13, 14, 15, 16].forEach(function(x) { walls.push({ x: x, y: 11 }); });
        [12, 13, 14, 15, 16].forEach(function(x) { walls.push({ x: x, y: 16 }); });
        [12, 13, 14, 15].forEach(function(y) { walls.push({ x: 16, y: y }); });
        [0, 1, 2, 3, 4, 5, 6, 7].forEach(function(x) { walls.push({ x: x, y: 10 }); });
        [12, 13, 14, 15, 16, 17, 18, 19].forEach(function(x) { walls.push({ x: x, y: 9 }); });
        return walls;
    }

    if (level === 6) {
        walls.push({ x: 3, y: 3 }, { x: 4, y: 3 });
        walls.push({ x: 15, y: 2 }, { x: 16, y: 2 });
        walls.push({ x: 8, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 5 });
        walls.push({ x: 1, y: 8 }, { x: 2, y: 8 });
        walls.push({ x: 17, y: 7 }, { x: 17, y: 8 });
        walls.push({ x: 6, y: 11 }, { x: 7, y: 11 });
        walls.push({ x: 12, y: 10 }, { x: 13, y: 10 }, { x: 13, y: 11 });
        walls.push({ x: 5, y: 15 }, { x: 5, y: 16 });
        walls.push({ x: 10, y: 14 }, { x: 11, y: 14 });
        walls.push({ x: 14, y: 16 }, { x: 15, y: 16 }, { x: 16, y: 16 });
        walls.push({ x: 18, y: 13 });
        walls.push({ x: 2, y: 18 }, { x: 3, y: 18 });
        walls.push({ x: 9, y: 17 });
        return walls;
    }

    if (level === 7) {
        [7, 8, 9, 10].forEach(function(x) { walls.push({ x: x, y: 7 }); });
        [9, 10, 11, 12].forEach(function(x) { walls.push({ x: x, y: 12 }); });
        walls.push({ x: 3, y: 3 }, { x: 4, y: 3 });
        walls.push({ x: 15, y: 3 }, { x: 16, y: 3 });
        walls.push({ x: 3, y: 16 }, { x: 4, y: 16 });
        walls.push({ x: 15, y: 16 }, { x: 16, y: 16 });
        walls.push({ x: 5, y: 10 });
        walls.push({ x: 14, y: 9 });
        walls.push({ x: 8, y: 15 });
        walls.push({ x: 11, y: 4 });
        return walls;
    }

    if (level === 9) {
        walls.push({ x: 5, y: 5 }, { x: 6, y: 5 });
        walls.push({ x: 13, y: 5 }, { x: 14, y: 5 });
        walls.push({ x: 5, y: 14 }, { x: 6, y: 14 });
        walls.push({ x: 13, y: 14 }, { x: 14, y: 14 });
        walls.push({ x: 9, y: 9 }, { x: 10, y: 9 });
        walls.push({ x: 9, y: 10 }, { x: 10, y: 10 });
        return walls;
    }

    // Level 8: Sparse cover barriers
    walls.push({ x: 9, y: 9 }, { x: 10, y: 9 });
    walls.push({ x: 9, y: 10 }, { x: 10, y: 10 });
    walls.push({ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 });
    walls.push({ x: 15, y: 3 }, { x: 16, y: 3 }, { x: 16, y: 4 });
    walls.push({ x: 3, y: 15 }, { x: 3, y: 16 }, { x: 4, y: 16 });
    walls.push({ x: 16, y: 15 }, { x: 16, y: 16 }, { x: 15, y: 16 });
    walls.push({ x: 9, y: 3 }, { x: 10, y: 3 });
    walls.push({ x: 9, y: 16 }, { x: 10, y: 16 });
    walls.push({ x: 3, y: 9 }, { x: 3, y: 10 });
    walls.push({ x: 16, y: 9 }, { x: 16, y: 10 });

    return walls;
}

export function filterWallsFromSnake(walls, snake) {
    return walls.filter(function(w) {
        return !snake.some(function(seg) { return seg.x === w.x && seg.y === w.y; });
    });
}

export function generateObstacles(level) {
    if (level < 3) return [];

    if (level === 3) {
        return [
            { x: 8, y: 9, path: [8, 9, 10, 11], axis: 'x', pathIndex: 0, dir: 1 },
            { x: 11, y: 10, path: [11, 10, 9, 8], axis: 'x', pathIndex: 0, dir: 1 },
        ];
    }

    if (level === 4) {
        return [
            { x: 9, y: 1, path: [1, 2, 3], axis: 'y', pathIndex: 0, dir: 1 },
            { x: 10, y: 16, path: [16, 17, 18], axis: 'y', pathIndex: 0, dir: 1 },
            { x: 1, y: 9, path: [1, 2, 3], axis: 'x', pathIndex: 0, dir: 1 },
            { x: 18, y: 10, path: [18, 17, 16], axis: 'x', pathIndex: 0, dir: 1 },
        ];
    }

    if (level === 5) {
        return [
            { x: 8, y: 9, path: [8, 9, 10, 11], axis: 'x', pathIndex: 0, dir: 1 },
            { x: 11, y: 10, path: [11, 10, 9, 8], axis: 'x', pathIndex: 0, dir: 1 },
            { x: 4, y: 5, path: [5, 6, 7], axis: 'y', pathIndex: 0, dir: 1 },
        ];
    }

    if (level === 6) {
        return [
            { x: 5, y: 7, path: [5, 6, 7, 8, 9], axis: 'x', pathIndex: 0, dir: 1 },
            { x: 14, y: 13, path: [13, 12, 11, 10], axis: 'y', pathIndex: 0, dir: 1 },
        ];
    }

    if (level === 7) {
        return [
            { x: 3, y: 5, path: [3, 4, 5, 6, 7, 8], axis: 'x', pathIndex: 0, dir: 1 },
            { x: 15, y: 10, path: [10, 11, 12, 13, 14, 15], axis: 'y', pathIndex: 0, dir: 1 },
            { x: 11, y: 14, path: [11, 12, 13, 14, 15, 16], axis: 'x', pathIndex: 0, dir: 1 },
        ];
    }

    if (level === 9) {
        return [
            { x: 7, y: 7, path: [7, 8, 9, 10, 11, 12], axis: 'x', pathIndex: 0, dir: 1 },
        ];
    }

    // Level 8
    return [
        { x: 6, y: 6, path: [6, 7, 8], axis: 'x', pathIndex: 0, dir: 1 },
        { x: 13, y: 13, path: [13, 12, 11], axis: 'y', pathIndex: 0, dir: 1 },
    ];
}

export function moveObstacles(obstacles) {
    return obstacles.map(function(ob) {
        var nextIdx = ob.pathIndex + ob.dir;
        var newDir = ob.dir;
        if (nextIdx >= ob.path.length || nextIdx < 0) {
            newDir = -ob.dir;
            nextIdx = ob.pathIndex + newDir;
        }
        var newOb = { x: ob.x, y: ob.y, path: ob.path, axis: ob.axis, pathIndex: nextIdx, dir: newDir };
        if (ob.axis === 'x') {
            newOb.x = ob.path[nextIdx];
        } else {
            newOb.y = ob.path[nextIdx];
        }
        return newOb;
    });
}

export function getObstaclePositions(obstacles) {
    return obstacles.map(function(ob) { return { x: ob.x, y: ob.y }; });
}

export function generatePortals(level) {
    if (level === 5) {
        return [
            { a: { x: 5, y: 5 }, b: { x: 14, y: 14 } },
            { a: { x: 1, y: 15 }, b: { x: 18, y: 4 } },
        ];
    }

    if (level === 6) {
        return [
            { a: { x: 2, y: 2 }, b: { x: 17, y: 17 } },
        ];
    }

    return [];
}

export function getPortalPositions(portals) {
    var positions = [];
    portals.forEach(function(pair) {
        positions.push(pair.a);
        positions.push(pair.b);
    });
    return positions;
}

export function checkPortalTeleport(head, portals) {
    for (var i = 0; i < portals.length; i++) {
        var pair = portals[i];
        if (head.x === pair.a.x && head.y === pair.a.y) {
            return pair.b;
        }
        if (head.x === pair.b.x && head.y === pair.b.y) {
            return pair.a;
        }
    }
    return null;
}
