'use strict';

// --- Transition Loop Handlers ---
// Handles per-frame rendering during death and level transition animations.
// Called from the main game loop when deathAnimation or levelTransition is active.
// Follows the same pattern as replay-loop.js.

import { render } from './renderer.js';
import { renderMatrixRain } from './secrets.js';
import { renderParticles, getShakeOffset } from './particles.js';
import { getEndlessHighScore, getEndlessHighWave } from './endless.js';
import {
    updateDeathAnimation, renderDeathAnimation, emitDeathParticles,
    updateLevelTransition, renderLevelTransition, emitCelebrationParticles,
} from './transitions.js';

// Runs one frame of the death animation.
// Returns { deathAnimation, particleSystem, shakeState, done }
// done=true means animation finished and caller should process death events.
//
// params: {
//   ctx, deathAnimation, particleSystem, shakeState,
//   gameState, konamiActivated, dom, matrixState,
//   frameSettings, endlessMode, highScore,
//   renderFn (the render function)
// }
export function runDeathAnimFrame(params) {
    var anim = updateDeathAnimation(params.deathAnimation);

    // Emit explosion particles when entering 'explode' phase
    var ps = params.particleSystem;
    var shake = params.shakeState;
    if (anim && anim.phase === 'explode' && !anim.particlesEmitted) {
        var fx = emitDeathParticles(anim, ps, shake);
        ps = fx.particleSystem;
        shake = fx.shakeState;
        anim = Object.assign({}, anim, { particlesEmitted: true });
    }

    if (!anim) {
        return { deathAnimation: null, particleSystem: ps, shakeState: shake, done: true };
    }

    // Render the level background (without game-over overlay)
    var renderState = Object.assign({}, params.gameState, { gameOver: false });
    var interp = {
        progress: 0, prevSnake: null, prevHunter: null,
        hunterTrail: [], trailHistory: [],
        highScore: params.endlessMode ? getEndlessHighScore() : params.highScore,
        endlessHighWave: params.endlessMode ? getEndlessHighWave() : 0,
    };

    var offset = params.frameSettings.screenShake
        ? getShakeOffset(shake)
        : { x: 0, y: 0 };

    params.ctx.save();
    params.ctx.translate(offset.x, offset.y);

    render(params.ctx, renderState, params.konamiActivated, params.dom, interp);
    renderMatrixRain(params.ctx, params.matrixState);
    renderDeathAnimation(params.ctx, anim);
    if (params.frameSettings.particles) {
        renderParticles(params.ctx, ps);
    }

    params.ctx.restore();

    return { deathAnimation: anim, particleSystem: ps, shakeState: shake, done: false };
}

// Runs one frame of the level transition animation.
// Returns { levelTransition, particleSystem, shakeState, done }
// done=true means transition finished and caller should process level-up events.
//
// params: {
//   ctx, levelTransition, particleSystem, shakeState,
//   gameState, konamiActivated, dom, matrixState,
//   frameSettings, endlessMode, highScore,
// }
export function runLevelTransitionFrame(params) {
    var trans = updateLevelTransition(params.levelTransition);

    // Emit celebration particles on first frame
    var ps = params.particleSystem;
    var shake = params.shakeState;
    if (trans && !trans.celebrateParticlesEmitted) {
        var fx = emitCelebrationParticles(trans, ps, shake);
        ps = fx.particleSystem;
        shake = fx.shakeState;
        trans = Object.assign({}, trans, { celebrateParticlesEmitted: true });
    }

    if (!trans) {
        return { levelTransition: null, particleSystem: ps, shakeState: shake, done: true };
    }

    // Render the game underneath the transition overlay
    var interp = {
        progress: 0, prevSnake: null, prevHunter: null,
        hunterTrail: [], trailHistory: [],
        highScore: params.endlessMode ? getEndlessHighScore() : params.highScore,
        endlessHighWave: params.endlessMode ? getEndlessHighWave() : 0,
    };

    var offset = params.frameSettings.screenShake
        ? getShakeOffset(shake)
        : { x: 0, y: 0 };

    params.ctx.save();
    params.ctx.translate(offset.x, offset.y);

    render(params.ctx, params.gameState, params.konamiActivated, params.dom, interp);
    renderMatrixRain(params.ctx, params.matrixState);
    if (params.frameSettings.particles) {
        renderParticles(params.ctx, ps);
    }
    renderLevelTransition(params.ctx, trans);

    params.ctx.restore();

    return { levelTransition: trans, particleSystem: ps, shakeState: shake, done: false };
}
