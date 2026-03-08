'use strict';

// --- Death Replay System ---
// Records full game state snapshots in a circular buffer during normal play.
// On death, replays the last N frames at 0.3x speed using the actual renderer,
// with an input timeline showing which direction was pressed each frame.

var REPLAY_BUFFER_SIZE = 150;
var REPLAY_SPEED_MULT = 0.3; // Slow-motion (takes ~3.3x longer to play each frame)

// Creates a new empty circular buffer for recording game frames.
// Returns an immutable buffer object.
export function createReplayBuffer() {
    return {
        frames: [],
        maxSize: REPLAY_BUFFER_SIZE,
    };
}

// Records a full snapshot of the current game state into the buffer.
// Captures all entities needed for the actual renderer to reproduce the frame.
// Returns a new buffer (immutable).
export function recordFrame(buffer, gameState, direction) {
    var snapshot = {
        snake: gameState.snake.map(function(seg) {
            return { x: seg.x, y: seg.y };
        }),
        food: gameState.food ? { x: gameState.food.x, y: gameState.food.y } : null,
        walls: gameState.walls,
        obstacles: gameState.obstacles,
        portals: gameState.portals,
        powerUp: gameState.powerUp,
        activePowerUp: gameState.activePowerUp,
        hunter: gameState.hunter,
        score: gameState.score,
        level: gameState.level,
        endlessWave: gameState.endlessWave,
        endlessConfig: gameState.endlessConfig,
        arenaMinX: gameState.arenaMinX,
        arenaMinY: gameState.arenaMinY,
        arenaMaxX: gameState.arenaMaxX,
        arenaMaxY: gameState.arenaMaxY,
        wallInset: gameState.wallInset,
        invincibleTicks: gameState.invincibleTicks,
        lives: gameState.lives,
        direction: direction ? { x: direction.x, y: direction.y } : null,
    };

    var newFrames = buffer.frames.concat([snapshot]);
    if (newFrames.length > buffer.maxSize) {
        newFrames = newFrames.slice(newFrames.length - buffer.maxSize);
    }

    return {
        frames: newFrames,
        maxSize: buffer.maxSize,
    };
}

// Starts a replay from the recorded buffer.
// Returns a replay state object that tracks playback progress.
// normalTickSpeed is the millisecond interval of the game tick at death.
export function startReplay(buffer, normalTickSpeed) {
    if (buffer.frames.length === 0) {
        return null;
    }

    return {
        frames: buffer.frames,
        currentIndex: 0,
        totalFrames: buffer.frames.length,
        tickSpeed: Math.round(normalTickSpeed / REPLAY_SPEED_MULT),
        lastTickTime: 0,
        startTime: 0,
    };
}

// Advances the replay by one tick if enough time has elapsed.
// Returns a new replay state (immutable).
export function replayTick(replayState, timestamp) {
    if (!replayState) return null;

    var updated = replayState;

    // Initialize timing on first tick
    if (updated.startTime === 0) {
        updated = Object.assign({}, updated, {
            startTime: timestamp,
            lastTickTime: timestamp,
        });
    }

    var elapsed = timestamp - updated.lastTickTime;
    if (elapsed >= updated.tickSpeed) {
        var nextIndex = updated.currentIndex + 1;
        updated = Object.assign({}, updated, {
            currentIndex: nextIndex,
            lastTickTime: timestamp,
        });
    }

    return updated;
}

// Returns true when the replay has played all recorded frames.
export function isReplayComplete(replayState) {
    if (!replayState) return true;
    return replayState.currentIndex >= replayState.totalFrames;
}

// Returns the current frame's snake segments for rendering, or null if invalid.
export function getReplayFrame(replayState) {
    if (!replayState) return null;
    var idx = Math.min(replayState.currentIndex, replayState.totalFrames - 1);
    return replayState.frames[idx];
}

// Returns the replay progress as a value from 0 to 1.
export function getReplayProgress(replayState) {
    if (!replayState || replayState.totalFrames <= 1) return 1;
    return Math.min(replayState.currentIndex / (replayState.totalFrames - 1), 1);
}

// Returns a slice of recent frames for the ghost trail effect.
// trailLength controls how many previous frames to include.
var GHOST_TRAIL_LENGTH = 5;

export function getReplayTrail(replayState) {
    if (!replayState) return [];
    var idx = Math.min(replayState.currentIndex, replayState.totalFrames - 1);
    var startIdx = Math.max(0, idx - GHOST_TRAIL_LENGTH);
    var trail = [];
    for (var i = startIdx; i < idx; i++) {
        trail.push(replayState.frames[i]);
    }
    return trail;
}
