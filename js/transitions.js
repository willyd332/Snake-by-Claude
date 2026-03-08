'use strict';

import { CELL_SIZE, CANVAS_SIZE } from './constants.js';
import { emitBurst, triggerShake } from './particles.js';

// --- Animation Constants ---
var DEATH_FLASH_COUNT = 4;
var DEATH_FLASH_INTERVAL = 80; // ms per flash cycle
var DEATH_SEGMENT_DELAY = 200; // ms before segments explode
var DEATH_SCREEN_FLASH_DURATION = 150; // ms for screen flash
var DEATH_TOTAL_DURATION = 1200; // ms total

// --- Death Cause Color Palettes ---
var CAUSE_PALETTES = {
    wall:     { flash: '#ef4444', accent: '#ffffff', screen: '#ef4444' },
    boundary: { flash: '#ef4444', accent: '#ffffff', screen: '#ef4444' },
    arena:    { flash: '#ef4444', accent: '#ff6b6b', screen: '#ef4444' },
    crush:    { flash: '#ef4444', accent: '#ff6b6b', screen: '#ef4444' },
    self:     { flash: '#a855f7', accent: '#e879f9', screen: '#a855f7' },
    obstacle: { flash: '#f97316', accent: '#fbbf24', screen: '#f97316' },
    hunter:   { flash: '#f97316', accent: '#ff2200', screen: '#ff4400' },
};

var DEFAULT_PALETTE = { flash: '#ef4444', accent: '#ffffff', screen: '#ef4444' };

function getPalette(deathCause) {
    return CAUSE_PALETTES[deathCause] || DEFAULT_PALETTE;
}

// --- Death Animation ---

// Creates a death animation state from the snake segments at time of death.
// segments: array of {x, y} grid positions
// color: snake color at death
// killedByHunter: boolean for color variation
// deathCause: string identifying what killed the snake
export function createDeathAnimation(segments, color, killedByHunter, deathCause) {
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

    var cause = deathCause || 'boundary';
    var palette = getPalette(cause);

    return {
        startTime: Date.now(),
        segments: pixelSegments,
        center: { x: cx, y: cy },
        color: color,
        flashColor: palette.flash,
        accentColor: palette.accent,
        screenFlashColor: palette.screen,
        killedByHunter: killedByHunter,
        deathCause: cause,
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

// --- Cause-Specific Particle Emission ---

function emitWallSplatParticles(anim, ps) {
    var head = anim.segments[0];
    var gridX = Math.floor(head.x / CELL_SIZE);
    var gridY = Math.floor(head.y / CELL_SIZE);

    // Big directional burst from the head (splat against wall)
    ps = emitBurst(ps, gridX, gridY, anim.flashColor, 20, 90, 0.7);
    ps = emitBurst(ps, gridX, gridY, anim.accentColor, 10, 50, 0.5);

    // Smaller bursts along the body trailing away
    for (var i = 1; i < Math.min(anim.segments.length, 6); i++) {
        var seg = anim.segments[i];
        var gx = Math.floor(seg.x / CELL_SIZE);
        var gy = Math.floor(seg.y / CELL_SIZE);
        ps = emitBurst(ps, gx, gy, anim.color, 3, 40 + i * 5, 0.5);
    }

    return ps;
}

function emitSelfTangleParticles(anim, ps) {
    var cx = anim.center.x;
    var cy = anim.center.y;
    var centerGridX = Math.floor(cx / CELL_SIZE);
    var centerGridY = Math.floor(cy / CELL_SIZE);

    // Central implosion flash
    ps = emitBurst(ps, centerGridX, centerGridY, '#ffffff', 24, 120, 0.5);
    ps = emitBurst(ps, centerGridX, centerGridY, anim.flashColor, 16, 70, 0.8);

    // Ring of particles from each segment converging inward
    for (var i = 0; i < anim.segments.length; i++) {
        var seg = anim.segments[i];
        var gx = Math.floor(seg.x / CELL_SIZE);
        var gy = Math.floor(seg.y / CELL_SIZE);
        ps = emitBurst(ps, gx, gy, anim.accentColor, 3, 30, 0.6);
    }

    return ps;
}

function emitHunterDevouredParticles(anim, ps) {
    var head = anim.segments[0];
    var gridX = Math.floor(head.x / CELL_SIZE);
    var gridY = Math.floor(head.y / CELL_SIZE);

    // Aggressive burst from collision point
    ps = emitBurst(ps, gridX, gridY, '#f97316', 24, 110, 0.7);
    ps = emitBurst(ps, gridX, gridY, '#ff2200', 12, 80, 0.5);
    ps = emitBurst(ps, gridX, gridY, '#fbbf24', 8, 60, 0.4);

    return ps;
}

function emitObstacleParticles(anim, ps) {
    var head = anim.segments[0];
    var gridX = Math.floor(head.x / CELL_SIZE);
    var gridY = Math.floor(head.y / CELL_SIZE);

    ps = emitBurst(ps, gridX, gridY, anim.flashColor, 18, 80, 0.6);
    ps = emitBurst(ps, gridX, gridY, anim.accentColor, 10, 50, 0.5);

    return ps;
}

function emitDefaultParticles(anim, ps) {
    var cx = anim.center.x;
    var cy = anim.center.y;

    for (var i = 0; i < anim.segments.length; i++) {
        var seg = anim.segments[i];
        var gridX = Math.floor(seg.x / CELL_SIZE);
        var gridY = Math.floor(seg.y / CELL_SIZE);
        var segColor = i % 2 === 0 ? anim.color : anim.accentColor;
        var dx = seg.x - cx;
        var dy = seg.y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var speed = 60 + dist * 0.5;
        ps = emitBurst(ps, gridX, gridY, segColor, 4, speed, 0.8);
    }

    var centerGridX = Math.floor(cx / CELL_SIZE);
    var centerGridY = Math.floor(cy / CELL_SIZE);
    ps = emitBurst(ps, centerGridX, centerGridY, anim.flashColor, 16, 100, 0.6);

    return ps;
}

// Emits death particles based on the cause. Call once when phase transitions to 'explode'.
// Returns { particleSystem, shakeState } with updated values.
export function emitDeathParticles(anim, particleSystem, shakeState) {
    if (!anim || anim.particlesEmitted) {
        return { particleSystem: particleSystem, shakeState: shakeState };
    }

    var ps = particleSystem;
    var cause = anim.deathCause || 'boundary';

    switch (cause) {
        case 'wall':
        case 'boundary':
            ps = emitWallSplatParticles(anim, ps);
            break;
        case 'arena':
        case 'crush':
            ps = emitWallSplatParticles(anim, ps);
            break;
        case 'self':
            ps = emitSelfTangleParticles(anim, ps);
            break;
        case 'hunter':
            ps = emitHunterDevouredParticles(anim, ps);
            break;
        case 'obstacle':
            ps = emitObstacleParticles(anim, ps);
            break;
        default:
            ps = emitDefaultParticles(anim, ps);
            break;
    }

    var shakeIntensity = cause === 'hunter' ? 14 : cause === 'self' ? 12 : 10;
    var newShake = triggerShake(shakeIntensity, 0.5);

    return {
        particleSystem: ps,
        shakeState: newShake,
    };
}

// --- Cause-Specific Flash Rendering ---

function renderWallFlash(ctx, anim, elapsed) {
    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    if (elapsed >= flashEnd) return;

    var flashCycle = Math.floor(elapsed / DEATH_FLASH_INTERVAL);
    var isFlashOn = flashCycle % 2 === 0;
    if (!isFlashOn) return;

    var head = anim.segments[0];

    ctx.save();
    var flashAlpha = 0.7 + Math.sin(elapsed / 30) * 0.3;
    ctx.globalAlpha = flashAlpha;

    // Head flattens: scale X or Y based on approach direction
    var squishProgress = elapsed / flashEnd;
    var squishX = 1 + squishProgress * 0.6;
    var squishY = 1 - squishProgress * 0.4;

    // Render head with squish
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.scale(squishX, squishY);
    ctx.fillStyle = anim.flashColor;
    ctx.shadowColor = anim.flashColor;
    ctx.shadowBlur = 14;
    ctx.fillRect(-CELL_SIZE / 2 + 1, -CELL_SIZE / 2 + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    ctx.restore();

    // Remaining segments flash normally
    for (var i = 1; i < anim.segments.length; i++) {
        var seg = anim.segments[i];
        var segFlash = (flashCycle % 4 < 2) ? anim.flashColor : anim.accentColor;
        ctx.fillStyle = segFlash;
        ctx.shadowColor = segFlash;
        ctx.shadowBlur = 10;
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

function renderSelfFlash(ctx, anim, elapsed) {
    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    if (elapsed >= flashEnd) return;

    var flashCycle = Math.floor(elapsed / DEATH_FLASH_INTERVAL);
    var implodeProgress = elapsed / flashEnd;
    var cx = anim.center.x;
    var cy = anim.center.y;

    ctx.save();
    var flashAlpha = 0.6 + Math.sin(elapsed / 25) * 0.4;
    ctx.globalAlpha = flashAlpha;

    // Segments glow and pull inward toward center
    for (var i = 0; i < anim.segments.length; i++) {
        var seg = anim.segments[i];
        var dx = seg.x - cx;
        var dy = seg.y - cy;
        var pullX = seg.x - dx * implodeProgress * 0.4;
        var pullY = seg.y - dy * implodeProgress * 0.4;

        var segColor = (flashCycle % 2 === 0) ? anim.flashColor : anim.accentColor;
        ctx.fillStyle = segColor;
        ctx.shadowColor = anim.flashColor;
        ctx.shadowBlur = 8 + implodeProgress * 12;
        ctx.fillRect(
            pullX - CELL_SIZE / 2 + 1,
            pullY - CELL_SIZE / 2 + 1,
            CELL_SIZE - 2,
            CELL_SIZE - 2
        );
    }

    // Growing central glow during implosion
    if (implodeProgress > 0.3) {
        var glowAlpha = (implodeProgress - 0.3) * 1.4;
        ctx.globalAlpha = Math.min(glowAlpha, 0.8);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = anim.flashColor;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL_SIZE * implodeProgress * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
}

function renderHunterFlash(ctx, anim, elapsed) {
    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    if (elapsed >= flashEnd) return;

    var flashCycle = Math.floor(elapsed / DEATH_FLASH_INTERVAL);
    var isFlashOn = flashCycle % 2 === 0;
    var head = anim.segments[0];
    var devourProgress = elapsed / flashEnd;

    ctx.save();
    var flashAlpha = 0.8 + Math.sin(elapsed / 20) * 0.2;
    ctx.globalAlpha = flashAlpha;

    // Hunter "consuming" effect: head area grows briefly
    if (isFlashOn) {
        var growScale = 1 + devourProgress * 0.5;
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.scale(growScale, growScale);
        ctx.fillStyle = '#f97316';
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 16;
        ctx.fillRect(-CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
        ctx.restore();
    }

    // Body segments flash with hunter colors, shrinking as if devoured
    for (var i = 1; i < anim.segments.length; i++) {
        var seg = anim.segments[i];
        var shrinkFactor = Math.max(0, 1 - devourProgress * (i / anim.segments.length));
        var halfSize = (CELL_SIZE / 2 - 1) * shrinkFactor;
        if (halfSize <= 0) continue;
        var segColor = (flashCycle % 4 < 2) ? anim.flashColor : anim.accentColor;
        ctx.fillStyle = segColor;
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur = 10;
        ctx.fillRect(seg.x - halfSize, seg.y - halfSize, halfSize * 2, halfSize * 2);
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
}

function renderDefaultFlash(ctx, anim, elapsed) {
    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    if (elapsed >= flashEnd) return;

    var flashCycle = Math.floor(elapsed / DEATH_FLASH_INTERVAL);
    var isFlashOn = flashCycle % 2 === 0;
    if (!isFlashOn) return;

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

// --- Cause-Specific Explode Rendering ---

function renderWallExplode(ctx, anim, elapsed) {
    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    var explodeStart = flashEnd + DEATH_SEGMENT_DELAY;
    if (elapsed < explodeStart || elapsed >= DEATH_TOTAL_DURATION) return;

    var explodeProgress = (elapsed - explodeStart) / (DEATH_TOTAL_DURATION - explodeStart);
    var scatterAlpha = Math.max(0, 1 - explodeProgress * 1.5);
    var head = anim.segments[0];

    ctx.save();
    ctx.globalAlpha = scatterAlpha;

    // Head stays and flattens further (splat residue)
    var flatX = 1 + explodeProgress * 1.2;
    var flatY = Math.max(0.1, 1 - explodeProgress * 0.8);
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.scale(flatX, flatY);
    ctx.fillStyle = anim.color;
    ctx.shadowColor = anim.flashColor;
    ctx.shadowBlur = 4 * (1 - explodeProgress);
    ctx.fillRect(-CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
    ctx.restore();

    // Body scatters outward from head
    for (var j = 1; j < anim.segments.length; j++) {
        var seg = anim.segments[j];
        var dx = seg.x - head.x;
        var dy = seg.y - head.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var normX = dist > 0 ? dx / dist : (j % 3 - 1);
        var normY = dist > 0 ? dy / dist : ((j + 1) % 3 - 1);

        var scatterDist = explodeProgress * 70 * (1 + j * 0.15);
        var drawX = seg.x + normX * scatterDist;
        var drawY = seg.y + normY * scatterDist;
        var angle = explodeProgress * (1.5 + j * 0.2);
        var halfSize = (CELL_SIZE / 2 - 2) * (1 - explodeProgress * 0.6);

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(angle);
        ctx.fillStyle = anim.color;
        ctx.fillRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
        ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}

function renderSelfExplode(ctx, anim, elapsed) {
    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    var explodeStart = flashEnd + DEATH_SEGMENT_DELAY;
    if (elapsed < explodeStart || elapsed >= DEATH_TOTAL_DURATION) return;

    var explodeProgress = (elapsed - explodeStart) / (DEATH_TOTAL_DURATION - explodeStart);
    var cx = anim.center.x;
    var cy = anim.center.y;

    ctx.save();

    // Segments implode fully then a bright flash expands
    if (explodeProgress < 0.4) {
        // Still collapsing inward
        var collapseProgress = explodeProgress / 0.4;
        var collapseAlpha = Math.max(0, 1 - collapseProgress * 0.5);
        ctx.globalAlpha = collapseAlpha;

        for (var i = 0; i < anim.segments.length; i++) {
            var seg = anim.segments[i];
            var dx = seg.x - cx;
            var dy = seg.y - cy;
            var pullX = seg.x - dx * collapseProgress;
            var pullY = seg.y - dy * collapseProgress;
            var shrink = (CELL_SIZE / 2 - 2) * (1 - collapseProgress * 0.7);

            ctx.fillStyle = anim.flashColor;
            ctx.shadowColor = anim.flashColor;
            ctx.shadowBlur = 8;
            ctx.fillRect(pullX - shrink, pullY - shrink, shrink * 2, shrink * 2);
        }
    }

    // Central flash expansion after collapse
    if (explodeProgress >= 0.3) {
        var flashProgress = (explodeProgress - 0.3) / 0.7;
        var flashRadius = flashProgress * CELL_SIZE * 4;
        var flashAlpha = Math.max(0, 0.9 * (1 - flashProgress));

        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = anim.flashColor;
        ctx.shadowBlur = 20 * (1 - flashProgress);
        ctx.beginPath();
        ctx.arc(cx, cy, flashRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
}

function renderHunterExplode(ctx, anim, elapsed) {
    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    var explodeStart = flashEnd + DEATH_SEGMENT_DELAY;
    if (elapsed < explodeStart || elapsed >= DEATH_TOTAL_DURATION) return;

    var explodeProgress = (elapsed - explodeStart) / (DEATH_TOTAL_DURATION - explodeStart);
    var head = anim.segments[0];

    ctx.save();

    // Hunter "bite" effect: two converging arcs at head position
    if (explodeProgress < 0.5) {
        var biteProgress = explodeProgress / 0.5;
        var biteAlpha = 0.8 * (1 - biteProgress);
        ctx.globalAlpha = biteAlpha;
        ctx.strokeStyle = '#f97316';
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        // Upper jaw
        ctx.beginPath();
        ctx.arc(head.x, head.y - 4, CELL_SIZE * (1 + biteProgress), 0.3, Math.PI - 0.3);
        ctx.stroke();
        // Lower jaw
        ctx.beginPath();
        ctx.arc(head.x, head.y + 4, CELL_SIZE * (1 + biteProgress), Math.PI + 0.3, -0.3);
        ctx.stroke();
        ctx.lineWidth = 0.5;
    }

    // Body segments dissolve outward with orange/red tint
    var dissolveAlpha = Math.max(0, 1 - explodeProgress * 1.5);
    ctx.globalAlpha = dissolveAlpha;

    for (var j = 0; j < anim.segments.length; j++) {
        var seg = anim.segments[j];
        var dx = seg.x - head.x;
        var dy = seg.y - head.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var fallbackAngle = (j / Math.max(anim.segments.length, 1)) * Math.PI * 2;
        var normX = dist > 0 ? dx / dist : Math.cos(fallbackAngle);
        var normY = dist > 0 ? dy / dist : Math.sin(fallbackAngle);

        var scatterDist = explodeProgress * 90 * (1 + j * 0.1);
        var drawX = seg.x + normX * scatterDist;
        var drawY = seg.y + normY * scatterDist;
        var halfSize = (CELL_SIZE / 2 - 2) * (1 - explodeProgress * 0.6);

        ctx.fillStyle = j % 2 === 0 ? '#f97316' : anim.color;
        ctx.fillRect(drawX - halfSize, drawY - halfSize, halfSize * 2, halfSize * 2);
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
}

function renderDefaultExplode(ctx, anim, elapsed) {
    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    var explodeStart = flashEnd + DEATH_SEGMENT_DELAY;
    if (elapsed < explodeStart || elapsed >= DEATH_TOTAL_DURATION) return;

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

// --- Main Render Entry Point ---

// Renders the death animation overlay on the canvas.
// ctx: CanvasRenderingContext2D
export function renderDeathAnimation(ctx, anim) {
    if (!anim) return;
    var elapsed = Date.now() - anim.startTime;
    var cause = anim.deathCause || 'boundary';

    var flashEnd = DEATH_FLASH_COUNT * DEATH_FLASH_INTERVAL * 2;
    var explodeStart = flashEnd + DEATH_SEGMENT_DELAY;
    var screenFlashStart = explodeStart + 200;

    // Phase 1: Cause-specific flash
    if (elapsed < flashEnd) {
        switch (cause) {
            case 'wall':
            case 'boundary':
            case 'arena':
            case 'crush':
                renderWallFlash(ctx, anim, elapsed);
                break;
            case 'self':
                renderSelfFlash(ctx, anim, elapsed);
                break;
            case 'hunter':
                renderHunterFlash(ctx, anim, elapsed);
                break;
            default:
                renderDefaultFlash(ctx, anim, elapsed);
                break;
        }
    }

    // Phase 2: Cause-specific explode
    if (elapsed >= explodeStart && elapsed < DEATH_TOTAL_DURATION) {
        switch (cause) {
            case 'wall':
            case 'boundary':
            case 'arena':
            case 'crush':
                renderWallExplode(ctx, anim, elapsed);
                break;
            case 'self':
                renderSelfExplode(ctx, anim, elapsed);
                break;
            case 'hunter':
                renderHunterExplode(ctx, anim, elapsed);
                break;
            default:
                renderDefaultExplode(ctx, anim, elapsed);
                break;
        }
    }

    // Phase 3: Screen flash overlay (shared, uses cause-specific color)
    if (elapsed >= screenFlashStart && elapsed < screenFlashStart + DEATH_SCREEN_FLASH_DURATION) {
        var flashProgress = (elapsed - screenFlashStart) / DEATH_SCREEN_FLASH_DURATION;
        var overlayAlpha = Math.max(0, 0.4 * (1 - flashProgress));
        ctx.save();
        ctx.globalAlpha = overlayAlpha;
        ctx.fillStyle = anim.screenFlashColor;
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
