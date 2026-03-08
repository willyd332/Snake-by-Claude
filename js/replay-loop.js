'use strict';

// --- Death Replay Loop ---
// Handles the per-frame rendering during the death replay sequence.
// Called from the main game loop when replayState is active.
// Returns an object indicating whether replay is still running.

import { render, renderReplayGhost } from './renderer.js';
import { renderMatrixRain } from './secrets.js';
import { renderParticles, getShakeOffset } from './particles.js';
import {
    replayTick, isReplayComplete, getReplayFrame,
    getReplayProgress, getReplayTrail,
} from './replay.js';
import { getEndlessHighScore, getEndlessHighWave } from './endless.js';
import { CANVAS_SIZE } from './constants.js';

// Advances the replay by one tick and renders the current frame.
// Returns { replayState, done } where done=true means replay finished.
//
// params: {
//   ctx: CanvasRenderingContext2D,
//   replayState, timestamp, speed, config,
//   gameState,        // current game state (used for level bg)
//   konamiActivated,
//   dom,
//   matrixState,
//   particleSystem,
//   shakeState,
//   frameSettings,    // from getSettingsRef()
//   endlessMode,
//   highScore,
// }
export function runReplayFrame(params) {
    var updated = replayTick(params.replayState, params.timestamp);

    if (isReplayComplete(updated)) {
        return { replayState: null, done: true };
    }

    // Render level background with a non-gameOver state
    var replayRenderState = Object.assign({}, params.gameState, { gameOver: false });
    var replayInterp = {
        progress: 0, prevSnake: null, prevHunter: null,
        hunterTrail: [], trailHistory: [],
        highScore: params.endlessMode ? getEndlessHighScore() : params.highScore,
        endlessHighWave: params.endlessMode ? getEndlessHighWave() : 0,
    };

    var replayOffset = params.frameSettings.screenShake
        ? getShakeOffset(params.shakeState)
        : { x: 0, y: 0 };

    params.ctx.save();
    params.ctx.translate(replayOffset.x, replayOffset.y);

    render(params.ctx, replayRenderState, params.konamiActivated, params.dom, replayInterp);

    // Render ghost snake on top
    var currentFrame = getReplayFrame(updated);
    var trailFrames = getReplayTrail(updated);
    var replayProgress = getReplayProgress(updated);
    renderReplayGhost(params.ctx, currentFrame, trailFrames, params.config, replayProgress);

    renderMatrixRain(params.ctx, params.matrixState);
    if (params.frameSettings.particles) {
        renderParticles(params.ctx, params.particleSystem);
    }

    params.ctx.restore();

    // Render skip hint (outside shake transform, always visible)
    params.ctx.save();
    params.ctx.globalAlpha = 0.55;
    params.ctx.font = '10px Courier New';
    params.ctx.fillStyle = '#ffffff';
    params.ctx.textAlign = 'center';
    params.ctx.fillText('SPACE to skip', CANVAS_SIZE / 2, CANVAS_SIZE - 8);
    params.ctx.textAlign = 'left';
    params.ctx.globalAlpha = 1;
    params.ctx.restore();

    return { replayState: updated, done: false };
}
