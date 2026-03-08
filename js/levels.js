'use strict';

// --- Level Utilities ---
// Contains obstacle movement, obstacle/portal position helpers, and portal
// teleportation logic. Per-level generation functions have been removed since
// the game now uses endless mode exclusively (procedural generation in endless.js).

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
