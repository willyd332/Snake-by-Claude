'use strict';

// --- Death Replay Loop ---
// Handles the per-frame rendering during the death replay sequence.
// Uses the actual game renderer to reproduce each recorded frame at slow-motion speed.
// Shows an input timeline overlay with arrow indicators for each direction change.

import { render } from './renderer.js';
import { renderMatrixRain } from './secrets.js';
import { renderParticles, getShakeOffset } from './particles.js';
import {
    replayTick, isReplayComplete, getReplayFrame,
    getReplayProgress,
} from './replay.js';
import { getEndlessHighScore, getEndlessHighWave } from './endless.js';
import { CANVAS_SIZE, CELL_SIZE } from './constants.js';

// Arrow glyph map for the input timeline overlay
var DIRECTION_ARROWS = {
    '0,-1': '\u2191',  // up
    '0,1':  '\u2193',  // down
    '-1,0': '\u2190',  // left
    '1,0':  '\u2192',  // right
};

// How many frames the arrow indicator stays visible after a direction change
var INPUT_FLASH_FRAMES = 8;

// Advances the replay by one tick and renders the current frame.
// Returns { replayState, done } where done=true means replay finished.
//
// params: {
//   ctx: CanvasRenderingContext2D,
//   replayState, timestamp, speed, config,
//   gameState,        // current game state (used for fallback)
//   konamiActivated,
//   dom,
//   matrixState,
//   particleSystem,
//   shakeState,
//   frameSettings,    // from getSettingsRef()
//   highScore,
// }
export function runReplayFrame(params) {
    var updated = replayTick(params.replayState, params.timestamp);

    if (isReplayComplete(updated)) {
        return { replayState: null, done: true };
    }

    var currentFrame = getReplayFrame(updated);
    if (!currentFrame) {
        return { replayState: null, done: true };
    }

    // Build a synthetic game state from the recorded snapshot for the real renderer
    var replayGameState = {
        snake: currentFrame.snake,
        food: currentFrame.food,
        walls: currentFrame.walls || [],
        obstacles: currentFrame.obstacles || [],
        portals: currentFrame.portals || [],
        powerUp: currentFrame.powerUp || null,
        activePowerUp: currentFrame.activePowerUp || null,
        hunter: currentFrame.hunter || null,
        score: currentFrame.score || 0,
        level: currentFrame.level,
        foodEaten: 0,
        endlessWave: currentFrame.endlessWave || 1,
        endlessConfig: currentFrame.endlessConfig,
        arenaMinX: currentFrame.arenaMinX != null ? currentFrame.arenaMinX : 0,
        arenaMinY: currentFrame.arenaMinY != null ? currentFrame.arenaMinY : 0,
        arenaMaxX: currentFrame.arenaMaxX != null ? currentFrame.arenaMaxX : 23,
        arenaMaxY: currentFrame.arenaMaxY != null ? currentFrame.arenaMaxY : 23,
        wallInset: currentFrame.wallInset || 0,
        invincibleTicks: currentFrame.invincibleTicks || 0,
        lives: currentFrame.lives || 1,
        direction: currentFrame.direction || { x: 0, y: 0 },
        nextDirection: currentFrame.direction || { x: 0, y: 0 },
        gameOver: false,
        started: true,
        lastTick: 0,
        shrinkCounter: 0,
        _ateFood: false,
        _ateFoodPos: null,
        _collectedPowerUp: null,
        _shrinkOccurred: false,
        _killedByHunter: false,
        _deathCause: null,
    };

    // Build interpolation data (no interpolation during replay - static frames)
    var replayInterp = {
        progress: 0,
        prevSnake: null,
        prevHunter: null,
        hunterTrail: [],
        trailHistory: [],
        highScore: getEndlessHighScore(),
        endlessHighWave: getEndlessHighWave(),
    };

    var replayOffset = params.frameSettings.screenShake
        ? getShakeOffset(params.shakeState)
        : { x: 0, y: 0 };

    params.ctx.save();
    params.ctx.translate(replayOffset.x, replayOffset.y);

    // Use the actual game renderer with the reconstructed state
    render(params.ctx, replayGameState, params.konamiActivated, params.dom, replayInterp);

    renderMatrixRain(params.ctx, params.matrixState);
    if (params.frameSettings.particles) {
        renderParticles(params.ctx, params.particleSystem);
    }

    params.ctx.restore();

    // --- Overlays (rendered outside shake transform, always visible) ---

    var replayProgress = getReplayProgress(updated);

    // "REPLAY" indicator with progress bar
    renderReplayIndicator(params.ctx, replayProgress);

    // Input timeline: flash arrow when direction changes
    renderInputTimeline(params.ctx, updated);

    // Skip hint
    params.ctx.save();
    params.ctx.globalAlpha = 0.55;
    params.ctx.font = '10px Courier New';
    params.ctx.fillStyle = '#ffffff';
    params.ctx.textAlign = 'center';
    params.ctx.fillText('TAP / SPACE to skip', CANVAS_SIZE / 2, CANVAS_SIZE - 8);
    params.ctx.textAlign = 'left';
    params.ctx.globalAlpha = 1;
    params.ctx.restore();

    return { replayState: updated, done: false };
}

// Renders the "REPLAY" label and progress bar at the top of the canvas.
function renderReplayIndicator(ctx, progress) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px Courier New';
    var labelPulse = Math.sin(Date.now() / 300) * 0.2 + 0.8;
    ctx.globalAlpha = labelPulse;
    ctx.fillStyle = '#ef4444';
    ctx.fillText('REPLAY', CANVAS_SIZE / 2, 18);

    // Progress bar
    var barWidth = 80;
    var barHeight = 3;
    var barX = (CANVAS_SIZE - barWidth) / 2;
    var barY = 24;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.restore();
}

// Renders arrow key indicators during replay when direction changes occur.
// Detects direction changes between consecutive frames and flashes the arrow.
function renderInputTimeline(ctx, replayState) {
    if (!replayState || replayState.totalFrames < 2) return;

    var currentIdx = Math.min(replayState.currentIndex, replayState.totalFrames - 1);
    var currentFrame = replayState.frames[currentIdx];
    if (!currentFrame || !currentFrame.direction) return;

    // Check recent frames for direction changes and display them
    var flashDir = null;
    var flashAge = INPUT_FLASH_FRAMES; // how many frames ago the change happened

    for (var lookback = 0; lookback < INPUT_FLASH_FRAMES; lookback++) {
        var checkIdx = currentIdx - lookback;
        if (checkIdx < 1) break;

        var thisFrame = replayState.frames[checkIdx];
        var prevFrame = replayState.frames[checkIdx - 1];

        if (!thisFrame || !prevFrame) continue;
        if (!thisFrame.direction || !prevFrame.direction) continue;

        var dirChanged = thisFrame.direction.x !== prevFrame.direction.x ||
                         thisFrame.direction.y !== prevFrame.direction.y;

        if (dirChanged) {
            flashDir = thisFrame.direction;
            flashAge = lookback;
            break;
        }
    }

    if (!flashDir) return;

    var dirKey = flashDir.x + ',' + flashDir.y;
    var arrow = DIRECTION_ARROWS[dirKey];
    if (!arrow) return;

    // Fade out over INPUT_FLASH_FRAMES
    var fadeProgress = flashAge / INPUT_FLASH_FRAMES;
    var alpha = Math.max(0, 0.9 * (1 - fadeProgress));

    // Position the arrow indicator near bottom-right
    var indicatorX = CANVAS_SIZE - 30;
    var indicatorY = CANVAS_SIZE - 30;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Background circle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 14, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Arrow glyph
    ctx.fillStyle = '#d4a017';
    ctx.font = 'bold 16px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(arrow, indicatorX, indicatorY);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    ctx.restore();
}
