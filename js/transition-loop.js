'use strict';

// --- Transition Loop Handlers ---
// Handles per-frame rendering during the death animation.
// Called from the main game loop when deathAnimation is active.
// Follows the same pattern as replay-loop.js.

import { render } from './renderer.js';
import { renderMatrixRain } from './secrets.js';
import { renderParticles, getShakeOffset } from './particles.js';
import { getEndlessHighScore, getEndlessHighWave } from './endless.js';
import {
    updateDeathAnimation, renderDeathAnimation, emitDeathParticles,
} from './transitions.js';

// Runs one frame of the death animation.
// Returns { deathAnimation, particleSystem, shakeState, done }
// done=true means animation finished and caller should process death events.
//
// params: {
//   ctx, deathAnimation, particleSystem, shakeState,
//   gameState, konamiActivated, dom, matrixState,
//   frameSettings, highScore,
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
        highScore: getEndlessHighScore(),
        endlessHighWave: getEndlessHighWave(),
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
