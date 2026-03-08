'use strict';

import { CELL_SIZE, CANVAS_SIZE } from './constants.js';
import { emitBurst, triggerShake } from './particles.js';

// --- Animation Constants ---
var DEATH_FLASH_COUNT = 4;
var DEATH_FLASH_INTERVAL = 80; // ms per flash cycle
var DEATH_SEGMENT_DELAY = 200; // ms before segments explode
var DEATH_SCREEN_FLASH_DURATION = 150; // ms for screen flash
var DEATH_TOTAL_DURATION = 1200; // ms total

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
