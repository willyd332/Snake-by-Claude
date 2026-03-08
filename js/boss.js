'use strict';

import { GRID_SIZE, CELL_SIZE, CANVAS_SIZE } from './constants.js';
import { randomPosition } from './state.js';

// --- Boss Phase Constants ---
var PHASE_2_THRESHOLD = 6;
var PHASE_3_THRESHOLD = 11;
var PULSE_INTERVAL_TICKS = 100; // ~15 seconds at speed 75 (~7.5 ticks/sec * 15 = ~112, tuned down for pacing)
var SHOCKWAVE_INTERVAL_TICKS = 67; // ~10 seconds
var SHOCKWAVE_DURATION_TICKS = 20; // ~3 seconds
var SHOCKWAVE_SHRINK_CELLS = 2;
var SHADOW_CLONE_COUNT = 2;
var CLONE_HIT_PENALTY = 5;
var BERSERK_RANDOM_CHANCE = 0.35;

// --- Phase Identification ---

export function getBossPhase(foodEaten) {
    if (foodEaten >= PHASE_3_THRESHOLD) return 3;
    if (foodEaten >= PHASE_2_THRESHOLD) return 2;
    return 1;
}

// --- Boss State Creation ---

export function createBossState() {
    return {
        phase: 1,
        pulseCooldown: PULSE_INTERVAL_TICKS,
        pulseTriggered: false,
        shadowClones: [],
        shockwaveCooldown: SHOCKWAVE_INTERVAL_TICKS,
        shockwaveActive: false,
        shockwaveTicksRemaining: 0,
        shockwaveShrinkApplied: false,
        phaseTransition: null, // { phase: number, startTime: number } when transitioning
        berserkActive: false,
    };
}

// --- Boss Tick (Pure: returns new state, does NOT mutate inputs) ---

export function tickBoss(bossState, gameState, config) {
    if (!bossState) return null;

    var currentPhase = getBossPhase(gameState.foodEaten);
    var prevPhase = bossState.phase;

    // Detect phase transition
    var phaseTransition = bossState.phaseTransition;
    if (currentPhase > prevPhase) {
        phaseTransition = { phase: currentPhase, startTime: Date.now() };
    }

    // Clear phase transition after display duration (3.5 seconds)
    if (phaseTransition && (Date.now() - phaseTransition.startTime) > 3500) {
        phaseTransition = null;
    }

    // --- Phase 1: Pulse mechanic ---
    var pulseCooldown = bossState.pulseCooldown - 1;
    var pulseTriggered = false;
    if (pulseCooldown <= 0) {
        pulseTriggered = true;
        pulseCooldown = PULSE_INTERVAL_TICKS;
    }

    // --- Phase 2: Shadow clone management ---
    var shadowClones = bossState.shadowClones;
    if (currentPhase >= 2 && shadowClones.length < SHADOW_CLONE_COUNT) {
        shadowClones = spawnShadowClones(gameState);
    } else if (currentPhase < 2 && shadowClones.length > 0) {
        shadowClones = [];
    }
    // Drift clones randomly each tick
    if (shadowClones.length > 0) {
        shadowClones = driftShadowClones(shadowClones);
    }

    // --- Phase 3: Shockwave mechanic ---
    var shockwaveCooldown = bossState.shockwaveCooldown;
    var shockwaveActive = bossState.shockwaveActive;
    var shockwaveTicksRemaining = bossState.shockwaveTicksRemaining;
    var shockwaveShrinkApplied = bossState.shockwaveShrinkApplied;

    if (currentPhase >= 3) {
        if (shockwaveActive) {
            shockwaveTicksRemaining = shockwaveTicksRemaining - 1;
            if (shockwaveTicksRemaining <= 0) {
                shockwaveActive = false;
                shockwaveShrinkApplied = false;
                shockwaveCooldown = SHOCKWAVE_INTERVAL_TICKS;
            }
        } else {
            shockwaveCooldown = shockwaveCooldown - 1;
            if (shockwaveCooldown <= 0) {
                shockwaveActive = true;
                shockwaveTicksRemaining = SHOCKWAVE_DURATION_TICKS;
                shockwaveShrinkApplied = false;
            }
        }
    }

    return {
        phase: currentPhase,
        pulseCooldown: pulseCooldown,
        pulseTriggered: pulseTriggered,
        shadowClones: shadowClones,
        shockwaveCooldown: shockwaveCooldown,
        shockwaveActive: shockwaveActive,
        shockwaveTicksRemaining: shockwaveTicksRemaining,
        shockwaveShrinkApplied: shockwaveShrinkApplied,
        phaseTransition: phaseTransition,
        berserkActive: currentPhase >= 3,
    };
}

// --- Food Pulse: Scatter all food to random positions ---

function applyFoodPulse(gameState) {
    var newFood = randomPosition(
        gameState.snake, gameState.walls, gameState.obstacles,
        gameState.portals, gameState.powerUp, gameState.hunter
    );
    return Object.assign({}, gameState, { food: newFood });
}

// --- Shadow Clone Spawning ---

function spawnShadowClones(gameState) {
    var clones = [];
    for (var i = 0; i < SHADOW_CLONE_COUNT; i++) {
        var pos = randomPosition(
            gameState.snake, gameState.walls, gameState.obstacles,
            gameState.portals, gameState.powerUp, gameState.hunter
        );
        clones.push({
            x: pos.x,
            y: pos.y,
            dx: Math.random() > 0.5 ? 1 : -1,
            dy: Math.random() > 0.5 ? 1 : -1,
        });
    }
    return clones;
}

// --- Shadow Clone Movement (random drift) ---

function driftShadowClones(clones) {
    return clones.map(function(clone) {
        // Change direction randomly ~30% of the time
        var newDx = clone.dx;
        var newDy = clone.dy;
        if (Math.random() < 0.3) {
            var dirs = [
                { dx: 0, dy: -1 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 0 },
                { dx: 1, dy: 0 },
            ];
            var pick = dirs[Math.floor(Math.random() * dirs.length)];
            newDx = pick.dx;
            newDy = pick.dy;
        }
        var newX = clone.x + newDx;
        var newY = clone.y + newDy;
        // Clamp to grid bounds
        newX = Math.max(0, Math.min(GRID_SIZE - 1, newX));
        newY = Math.max(0, Math.min(GRID_SIZE - 1, newY));
        return { x: newX, y: newY, dx: newDx, dy: newDy };
    });
}

// --- Shadow Clone Collision Check ---

export function checkShadowCloneCollision(snakeHead, shadowClones) {
    for (var i = 0; i < shadowClones.length; i++) {
        if (shadowClones[i].x === snakeHead.x && shadowClones[i].y === snakeHead.y) {
            return true;
        }
    }
    return false;
}

export function getShadowCloneHitPenalty() {
    return CLONE_HIT_PENALTY;
}

// --- Shockwave: Compute effective arena bounds ---

export function getShockwaveBounds(bossState) {
    if (!bossState || !bossState.shockwaveActive) {
        return null;
    }
    return {
        minX: SHOCKWAVE_SHRINK_CELLS,
        minY: SHOCKWAVE_SHRINK_CELLS,
        maxX: GRID_SIZE - 1 - SHOCKWAVE_SHRINK_CELLS,
        maxY: GRID_SIZE - 1 - SHOCKWAVE_SHRINK_CELLS,
    };
}

// --- Shockwave: Push snake inward if caught in shrink zone ---

export function pushSnakeInward(snake, bounds) {
    if (!bounds) return snake;
    return snake.map(function(seg) {
        var x = seg.x;
        var y = seg.y;
        if (x < bounds.minX) x = bounds.minX;
        if (x > bounds.maxX) x = bounds.maxX;
        if (y < bounds.minY) y = bounds.minY;
        if (y > bounds.maxY) y = bounds.maxY;
        if (x === seg.x && y === seg.y) return seg;
        return { x: x, y: y };
    });
}

// --- Berserk: Modify hunter direction with randomness ---

function getBerserkDirection(hunter) {
    if (!hunter) return null;
    if (Math.random() < BERSERK_RANDOM_CHANCE) {
        var dirs = [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
        ];
        // Exclude reverse direction
        var filtered = dirs.filter(function(d) {
            return !(d.x + hunter.direction.x === 0 && d.y + hunter.direction.y === 0);
        });
        return filtered[Math.floor(Math.random() * filtered.length)];
    }
    return null;
}

// --- Berserk: Override hunter tick interval ---

export function getBerserkTickInterval(baseInterval) {
    return Math.max(1, Math.floor(baseInterval / 2));
}

// --- Phase Transition Text ---

export function getPhaseTransitionText(phase) {
    if (phase === 2) return 'ALPHA EVOLVED \u2014 PHASE 2';
    if (phase === 3) return 'ALPHA BERSERK \u2014 FINAL PHASE';
    return null;
}

// --- Rendering: Shadow Clones ---

export function renderShadowClones(ctx, clones, hunterColor) {
    if (!clones || clones.length === 0) return;

    var pulse = Math.sin(Date.now() / 200) * 0.15 + 0.35;

    for (var i = 0; i < clones.length; i++) {
        var clone = clones[i];
        var cx = clone.x * CELL_SIZE + CELL_SIZE / 2;
        var cy = clone.y * CELL_SIZE + CELL_SIZE / 2;

        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = hunterColor;
        ctx.shadowColor = hunterColor;
        ctx.shadowBlur = 12;

        // Diamond shape to distinguish from real hunter
        ctx.beginPath();
        ctx.moveTo(cx, cy - CELL_SIZE / 2 + 1);
        ctx.lineTo(cx + CELL_SIZE / 2 - 1, cy);
        ctx.lineTo(cx, cy + CELL_SIZE / 2 - 1);
        ctx.lineTo(cx - CELL_SIZE / 2 + 1, cy);
        ctx.closePath();
        ctx.fill();

        // Inner "eye" glow
        ctx.globalAlpha = pulse * 0.8;
        ctx.fillStyle = '#ff0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// --- Rendering: Shockwave Border ---

export function renderShockwaveBorder(ctx, bossState) {
    if (!bossState || !bossState.shockwaveActive) return;

    var bounds = getShockwaveBounds(bossState);
    if (!bounds) return;

    var progress = 1 - (bossState.shockwaveTicksRemaining / SHOCKWAVE_DURATION_TICKS);
    var pulse = Math.sin(Date.now() / 100) * 0.2 + 0.8;

    // Danger zone: red overlay on shrunk edges
    ctx.save();

    // Top strip
    ctx.globalAlpha = 0.25 * pulse;
    ctx.fillStyle = '#ff2200';
    ctx.fillRect(0, 0, CANVAS_SIZE, bounds.minY * CELL_SIZE);

    // Bottom strip
    ctx.fillRect(0, (bounds.maxY + 1) * CELL_SIZE, CANVAS_SIZE, CANVAS_SIZE - (bounds.maxY + 1) * CELL_SIZE);

    // Left strip
    ctx.fillRect(0, bounds.minY * CELL_SIZE, bounds.minX * CELL_SIZE, (bounds.maxY - bounds.minY + 1) * CELL_SIZE);

    // Right strip
    ctx.fillRect((bounds.maxX + 1) * CELL_SIZE, bounds.minY * CELL_SIZE, CANVAS_SIZE - (bounds.maxX + 1) * CELL_SIZE, (bounds.maxY - bounds.minY + 1) * CELL_SIZE);

    // Pulsing border line at the safe zone edge
    ctx.globalAlpha = pulse * 0.9;
    ctx.strokeStyle = '#ff4400';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 10;
    ctx.strokeRect(
        bounds.minX * CELL_SIZE,
        bounds.minY * CELL_SIZE,
        (bounds.maxX - bounds.minX + 1) * CELL_SIZE,
        (bounds.maxY - bounds.minY + 1) * CELL_SIZE
    );

    // Animated "closing" lines that sweep inward
    var sweepOffset = progress * SHOCKWAVE_SHRINK_CELLS * CELL_SIZE;
    ctx.globalAlpha = (1 - progress) * 0.4;
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 1;
    // Top sweep
    ctx.beginPath();
    ctx.moveTo(0, sweepOffset);
    ctx.lineTo(CANVAS_SIZE, sweepOffset);
    ctx.stroke();
    // Bottom sweep
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_SIZE - sweepOffset);
    ctx.lineTo(CANVAS_SIZE, CANVAS_SIZE - sweepOffset);
    ctx.stroke();
    // Left sweep
    ctx.beginPath();
    ctx.moveTo(sweepOffset, 0);
    ctx.lineTo(sweepOffset, CANVAS_SIZE);
    ctx.stroke();
    // Right sweep
    ctx.beginPath();
    ctx.moveTo(CANVAS_SIZE - sweepOffset, 0);
    ctx.lineTo(CANVAS_SIZE - sweepOffset, CANVAS_SIZE);
    ctx.stroke();

    ctx.restore();
}

// --- Rendering: Phase Transition Flash ---

export function renderPhaseTransition(ctx, bossState) {
    if (!bossState || !bossState.phaseTransition) return;

    var elapsed = Date.now() - bossState.phaseTransition.startTime;
    if (elapsed < 0 || elapsed >= 3500) return;

    var text = getPhaseTransitionText(bossState.phaseTransition.phase);
    if (!text) return;

    // Fade: in 0-400ms, hold 400-2800ms, out 2800-3500ms
    var alpha;
    if (elapsed < 400) {
        alpha = elapsed / 400;
    } else if (elapsed < 2800) {
        alpha = 1;
    } else {
        alpha = 1 - (elapsed - 2800) / 700;
    }

    ctx.save();

    // Full-screen flash on first 200ms
    if (elapsed < 200) {
        var flashAlpha = (1 - elapsed / 200) * 0.3;
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = bossState.phaseTransition.phase === 3 ? '#ff0000' : '#ff6600';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    // Text
    ctx.globalAlpha = alpha * 0.95;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Courier New';
    ctx.fillStyle = bossState.phaseTransition.phase === 3 ? '#ff2200' : '#ff6600';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 16;
    ctx.fillText(text, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 10);

    // Sub-text for phase description
    ctx.font = '10px Courier New';
    ctx.globalAlpha = alpha * 0.7;
    ctx.shadowBlur = 8;
    var subtext = bossState.phaseTransition.phase === 2
        ? 'Shadow clones deployed. Trust nothing.'
        : 'All systems critical. No escape.';
    ctx.fillText(subtext, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 10);

    ctx.restore();
}

// --- Rendering: Pulse Burst Visual ---

export function renderPulseBurst(ctx, bossState, hunterHead) {
    if (!bossState || !bossState.pulseTriggered || !hunterHead) return;

    // Brief expanding ring from hunter position
    var elapsed = Date.now() % 500; // short repeating pulse visual
    var radius = elapsed / 500 * GRID_SIZE * CELL_SIZE * 0.4;
    var alpha = 1 - elapsed / 500;

    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(
        hunterHead.x * CELL_SIZE + CELL_SIZE / 2,
        hunterHead.y * CELL_SIZE + CELL_SIZE / 2,
        radius, 0, Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
}

// --- Boss Phase Indicator (HUD-style text at top) ---

export function renderBossPhaseIndicator(ctx, bossState) {
    if (!bossState) return;

    var phaseText = 'PHASE ' + bossState.phase;
    var phaseColor = bossState.phase === 3 ? '#ff2200'
        : bossState.phase === 2 ? '#ff6600'
        : '#ff9900';

    var pulse = Math.sin(Date.now() / 400) * 0.15 + 0.85;

    ctx.save();
    ctx.globalAlpha = pulse * 0.8;
    ctx.textAlign = 'right';
    ctx.font = 'bold 9px Courier New';
    ctx.fillStyle = phaseColor;
    ctx.shadowColor = phaseColor;
    ctx.shadowBlur = 4;
    ctx.fillText(phaseText, CANVAS_SIZE - 8, 14);
    ctx.restore();
}
