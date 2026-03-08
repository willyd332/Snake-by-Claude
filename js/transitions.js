'use strict';

import { CELL_SIZE, CANVAS_SIZE } from './constants.js';
import { emitBurst, triggerShake } from './particles.js';

// --- Animation Constants ---
var DEATH_FLASH_COUNT = 4;
var DEATH_FLASH_INTERVAL = 80; // ms per flash cycle
var DEATH_SEGMENT_DELAY = 200; // ms before segments explode
var DEATH_SCREEN_FLASH_DURATION = 150; // ms for screen flash
var DEATH_TOTAL_DURATION = 1200; // ms total

var LEVEL_CELEBRATE_DURATION = 600; // ms for celebration burst
var LEVEL_FADE_OUT_DURATION = 500; // ms to fade to black
var LEVEL_TITLE_DURATION = 1200; // ms for level title card
var LEVEL_FADE_IN_DURATION = 400; // ms to fade in from black

// --- Death Animation ---

// Creates a death animation state from the snake segments at time of death.
// segments: array of {x, y} grid positions
// color: snake color at death
// killedByHunter: boolean for color variation
export function createDeathAnimation(segments, color, killedByHunter) {
    var pixelSegments = segments.map(function(seg) {
        return {
            x: seg.x * CELL_SIZE + CELL_SIZE / 2,
            y: seg.y * CELL_SIZE + CELL_SIZE / 2,
        };
    });

    // Compute center of mass for explosion direction
    var cx = 0;
    var cy = 0;
    for (var i = 0; i < pixelSegments.length; i++) {
        cx += pixelSegments[i].x;
        cy += pixelSegments[i].y;
    }
    cx = cx / pixelSegments.length;
    cy = cy / pixelSegments.length;

    return {
        startTime: Date.now(),
        segments: pixelSegments,
        center: { x: cx, y: cy },
        color: color,
        flashColor: killedByHunter ? '#f97316' : '#ef4444',
        accentColor: killedByHunter ? '#ff2200' : '#ffffff',
        killedByHunter: killedByHunter,
        phase: 'flash', // 'flash' -> 'explode' -> 'screen_flash' -> 'done'
        particlesEmitted: false,
    };
}

// Updates the death animation and returns the current phase.
// Returns null when the animation is complete.
export function updateDeathAnimation(anim) {
    if (!anim) return null;
    var elapsed = Date.now() - anim.startTime;
    if (elapsed >= DEATH_TOTAL_DURATION) return null;

    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    var explodeStart = flashEnd + DEATH_SEGMENT_DELAY;
    var screenFlashStart = explodeStart + 200;

    var phase = 'flash';
    if (elapsed >= screenFlashStart) {
        phase = 'screen_flash';
    } else if (elapsed >= explodeStart) {
        phase = 'explode';
    }

    return Object.assign({}, anim, { phase: phase });
}

// Emits segment explosion particles. Call once when phase transitions to 'explode'.
// Returns { particleSystem, shakeState } with updated values.
export function emitDeathParticles(anim, particleSystem, shakeState) {
    if (!anim || anim.particlesEmitted) {
        return { particleSystem: particleSystem, shakeState: shakeState };
    }

    var ps = particleSystem;
    var cx = anim.center.x;
    var cy = anim.center.y;

    // Each segment becomes a small burst of particles flying outward from center
    for (var i = 0; i < anim.segments.length; i++) {
        var seg = anim.segments[i];
        var dx = seg.x - cx;
        var dy = seg.y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var normX = dist > 0 ? dx / dist : (Math.random() - 0.5) * 2;
        var normY = dist > 0 ? dy / dist : (Math.random() - 0.5) * 2;

        // Convert pixel position back to grid for emitBurst
        var gridX = Math.floor(seg.x / CELL_SIZE);
        var gridY = Math.floor(seg.y / CELL_SIZE);

        var speed = 60 + dist * 0.5;
        var color = i % 2 === 0 ? anim.color : anim.accentColor;
        ps = emitBurst(ps, gridX, gridY, color, 4, speed, 0.8);
    }

    // Central explosion burst
    var centerGridX = Math.floor(cx / CELL_SIZE);
    var centerGridY = Math.floor(cy / CELL_SIZE);
    ps = emitBurst(ps, centerGridX, centerGridY, anim.flashColor, 16, 100, 0.6);

    var newShake = triggerShake(anim.killedByHunter ? 14 : 10, 0.5);

    return {
        particleSystem: ps,
        shakeState: newShake,
    };
}

// Renders the death animation overlay on the canvas.
// ctx: CanvasRenderingContext2D
export function renderDeathAnimation(ctx, anim) {
    if (!anim) return;
    var elapsed = Date.now() - anim.startTime;

    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    var explodeStart = flashEnd + DEATH_SEGMENT_DELAY;
    var screenFlashStart = explodeStart + 200;

    // Phase 1: Flash snake segments red/white
    if (elapsed < flashEnd) {
        var flashCycle = Math.floor(elapsed / DEATH_FLASH_INTERVAL);
        var isFlashOn = flashCycle % 2 === 0;

        if (isFlashOn) {
            ctx.save();
            var flashAlpha = 0.7 + Math.sin(elapsed / 30) * 0.3;
            ctx.globalAlpha = flashAlpha;

            for (var i = 0; i < anim.segments.length; i++) {
                var seg = anim.segments[i];
                var flashColor = (flashCycle % 4 < 2) ? anim.flashColor : anim.accentColor;
                ctx.fillStyle = flashColor;
                ctx.shadowColor = flashColor;
                ctx.shadowBlur = 12;
                ctx.fillRect(
                    seg.x - CELL_SIZE / 2 + 1,
                    seg.y - CELL_SIZE / 2 + 1,
                    CELL_SIZE - 2,
                    CELL_SIZE - 2
                );
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    // Phase 2: Segments scatter outward (rendered as fading ghost segments)
    if (elapsed >= explodeStart && elapsed < DEATH_TOTAL_DURATION) {
        var explodeProgress = (elapsed - explodeStart) / (DEATH_TOTAL_DURATION - explodeStart);
        var scatterAlpha = Math.max(0, 1 - explodeProgress * 1.5);
        var cx = anim.center.x;
        var cy = anim.center.y;

        ctx.save();
        ctx.globalAlpha = scatterAlpha;

        for (var j = 0; j < anim.segments.length; j++) {
            var sSeg = anim.segments[j];
            var sDx = sSeg.x - cx;
            var sDy = sSeg.y - cy;
            var sDist = Math.sqrt(sDx * sDx + sDy * sDy);
            var sNormX = sDist > 0 ? sDx / sDist : (j % 3 - 1);
            var sNormY = sDist > 0 ? sDy / sDist : ((j + 1) % 3 - 1);

            var scatterDist = explodeProgress * 80 * (1 + j * 0.1);
            var drawX = sSeg.x + sNormX * scatterDist;
            var drawY = sSeg.y + sNormY * scatterDist;

            // Rotation effect
            var angle = explodeProgress * (2 + j * 0.3);
            var halfSize = (CELL_SIZE / 2 - 2) * (1 - explodeProgress * 0.5);

            ctx.save();
            ctx.translate(drawX, drawY);
            ctx.rotate(angle);
            ctx.fillStyle = anim.color;
            ctx.shadowColor = anim.color;
            ctx.shadowBlur = 6 * (1 - explodeProgress);
            ctx.fillRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
            ctx.restore();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Phase 3: Screen flash overlay
    if (elapsed >= screenFlashStart && elapsed < screenFlashStart + DEATH_SCREEN_FLASH_DURATION) {
        var flashProgress = (elapsed - screenFlashStart) / DEATH_SCREEN_FLASH_DURATION;
        var overlayAlpha = Math.max(0, 0.4 * (1 - flashProgress));
        ctx.save();
        ctx.globalAlpha = overlayAlpha;
        ctx.fillStyle = anim.flashColor;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

// Returns true while the death animation is still running.
export function isDeathAnimationActive(anim) {
    if (!anim) return false;
    return (Date.now() - anim.startTime) < DEATH_TOTAL_DURATION;
}


// --- Level Transition Animation ---

// Creates a level transition animation state.
// prevLevel: the level just completed
// newLevel: the level being entered
// snakeHeadGrid: {x, y} grid position of snake head (for celebration burst)
// color: the new level's theme color
// score: current score for tally display
export function createLevelTransition(prevLevel, newLevel, snakeHeadGrid, color, prevColor, score) {
    return {
        startTime: Date.now(),
        prevLevel: prevLevel,
        newLevel: newLevel,
        snakeHead: snakeHeadGrid
            ? {
                x: snakeHeadGrid.x * CELL_SIZE + CELL_SIZE / 2,
                y: snakeHeadGrid.y * CELL_SIZE + CELL_SIZE / 2,
            }
            : { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 },
        color: color,
        prevColor: prevColor,
        score: score,
        phase: 'celebrate', // 'celebrate' -> 'fade_out' -> 'title_card' -> 'fade_in' -> 'done'
        celebrateParticlesEmitted: false,
    };
}

// Computes the current phase of the level transition.
function getLevelTransitionPhase(elapsed) {
    var fadeOutStart = LEVEL_CELEBRATE_DURATION;
    var titleStart = fadeOutStart + LEVEL_FADE_OUT_DURATION;
    var fadeInStart = titleStart + LEVEL_TITLE_DURATION;
    var totalDuration = fadeInStart + LEVEL_FADE_IN_DURATION;

    if (elapsed >= totalDuration) return 'done';
    if (elapsed >= fadeInStart) return 'fade_in';
    if (elapsed >= titleStart) return 'title_card';
    if (elapsed >= fadeOutStart) return 'fade_out';
    return 'celebrate';
}

// Returns the total duration of the level transition in ms.
export function getLevelTransitionDuration() {
    return LEVEL_CELEBRATE_DURATION + LEVEL_FADE_OUT_DURATION +
           LEVEL_TITLE_DURATION + LEVEL_FADE_IN_DURATION;
}

// Updates the level transition state. Returns null when complete.
export function updateLevelTransition(trans) {
    if (!trans) return null;
    var elapsed = Date.now() - trans.startTime;
    var phase = getLevelTransitionPhase(elapsed);
    if (phase === 'done') return null;
    return Object.assign({}, trans, { phase: phase });
}

// Emits celebration particles at transition start.
// Returns { particleSystem, shakeState } with updated values.
export function emitCelebrationParticles(trans, particleSystem, shakeState) {
    if (!trans || trans.celebrateParticlesEmitted) {
        return { particleSystem: particleSystem, shakeState: shakeState };
    }

    var headGridX = Math.floor(trans.snakeHead.x / CELL_SIZE);
    var headGridY = Math.floor(trans.snakeHead.y / CELL_SIZE);

    // Celebratory burst from snake head
    var ps = emitBurst(particleSystem, headGridX, headGridY, trans.color, 24, 80, 0.8);
    ps = emitBurst(ps, headGridX, headGridY, '#fbbf24', 12, 50, 0.6);

    var newShake = triggerShake(5, 0.3);

    return { particleSystem: ps, shakeState: newShake };
}

// Renders the level transition overlay.
export function renderLevelTransition(ctx, trans) {
    if (!trans) return;
    var elapsed = Date.now() - trans.startTime;
    var phase = getLevelTransitionPhase(elapsed);

    var fadeOutStart = LEVEL_CELEBRATE_DURATION;
    var titleStart = fadeOutStart + LEVEL_FADE_OUT_DURATION;
    var fadeInStart = titleStart + LEVEL_TITLE_DURATION;

    // Celebrate phase: subtle glow around score
    if (phase === 'celebrate') {
        var celebrateProgress = elapsed / LEVEL_CELEBRATE_DURATION;
        var glowAlpha = Math.sin(celebrateProgress * Math.PI) * 0.15;

        ctx.save();
        ctx.globalAlpha = glowAlpha;
        ctx.fillStyle = trans.prevColor || trans.color;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Fade out: darken to black with a wipe effect
    if (phase === 'fade_out' || phase === 'title_card' || phase === 'fade_in') {
        var fadeOutProgress;
        if (phase === 'fade_out') {
            fadeOutProgress = (elapsed - fadeOutStart) / LEVEL_FADE_OUT_DURATION;
        } else {
            fadeOutProgress = 1;
        }

        // Radial wipe from edges inward
        var maxRadius = CANVAS_SIZE * 0.8;
        var currentRadius = maxRadius * (1 - fadeOutProgress);

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // Cut out a shrinking circle to reveal the game underneath during fade
        if (currentRadius > 0 && phase === 'fade_out') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, currentRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
    }

    // Title card: level number with styled text
    if (phase === 'title_card') {
        var titleElapsed = elapsed - titleStart;
        var titleProgress = titleElapsed / LEVEL_TITLE_DURATION;

        // Fade text in and out
        var textAlpha;
        if (titleProgress < 0.2) {
            textAlpha = titleProgress / 0.2;
        } else if (titleProgress > 0.8) {
            textAlpha = (1 - titleProgress) / 0.2;
        } else {
            textAlpha = 1;
        }

        // Slide from below
        var slideOffset = titleProgress < 0.2
            ? (1 - titleProgress / 0.2) * 20
            : 0;

        ctx.save();
        ctx.globalAlpha = textAlpha;
        ctx.textAlign = 'center';

        // Level number
        ctx.font = 'bold 32px Courier New';
        ctx.fillStyle = trans.color;
        ctx.shadowColor = trans.color;
        ctx.shadowBlur = 16;
        ctx.fillText('LEVEL ' + trans.newLevel, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 10 + slideOffset);

        // Decorative line
        var lineWidth = 60 * textAlpha;
        ctx.strokeStyle = trans.color;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(CANVAS_SIZE / 2 - lineWidth, CANVAS_SIZE / 2 + 10 + slideOffset);
        ctx.lineTo(CANVAS_SIZE / 2 + lineWidth, CANVAS_SIZE / 2 + 10 + slideOffset);
        ctx.stroke();

        // Score tally
        var tallyAlpha = titleProgress < 0.35 ? 0 : Math.min(1, (titleProgress - 0.35) / 0.2);
        ctx.globalAlpha = textAlpha * tallyAlpha;
        ctx.font = '12px Courier New';
        ctx.fillStyle = '#999999';
        ctx.shadowBlur = 0;
        ctx.fillText('SCORE: ' + trans.score, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 35 + slideOffset);

        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Fade in: reveal the new level
    if (phase === 'fade_in') {
        var fadeInElapsed = elapsed - fadeInStart;
        var fadeInProgress = fadeInElapsed / LEVEL_FADE_IN_DURATION;
        var fadeInAlpha = Math.max(0, 1 - fadeInProgress);

        ctx.save();
        ctx.globalAlpha = fadeInAlpha;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

// Returns true while the level transition is still running.
export function isLevelTransitionActive(trans) {
    if (!trans) return false;
    var elapsed = Date.now() - trans.startTime;
    return getLevelTransitionPhase(elapsed) !== 'done';
}
