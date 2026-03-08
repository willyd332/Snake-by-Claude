'use strict';

import { CELL_SIZE } from './constants.js';

// --- Particle System ---
// Frame-rate independent particle effects. Update every frame, not every tick.

function createParticle(x, y, vx, vy, life, color, size) {
    return {
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        life: life,
        maxLife: life,
        color: color,
        size: size,
    };
}

export function createParticleSystem() {
    return { particles: [] };
}

export function updateParticles(system, dt) {
    var alive = [];
    for (var i = 0; i < system.particles.length; i++) {
        var p = system.particles[i];
        var next = {
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vx: p.vx * 0.97,
            vy: p.vy * 0.97,
            life: p.life - dt,
            maxLife: p.maxLife,
            color: p.color,
            size: p.size,
        };
        if (next.life > 0) {
            alive.push(next);
        }
    }
    // Hard cap to prevent performance issues
    if (alive.length > 300) {
        alive = alive.slice(alive.length - 300);
    }
    return { particles: alive };
}

export function renderParticles(ctx, system) {
    ctx.shadowBlur = 0;
    for (var i = 0; i < system.particles.length; i++) {
        var p = system.particles[i];
        var alpha = Math.max(0, p.life / p.maxLife);
        var currentSize = p.size * (0.3 + 0.7 * alpha);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// --- Emitters ---

// Radial burst from a grid cell (food eaten, power-up collected)
export function emitBurst(system, gridX, gridY, color, count, speed, life) {
    var cx = gridX * CELL_SIZE + CELL_SIZE / 2;
    var cy = gridY * CELL_SIZE + CELL_SIZE / 2;
    var newParticles = system.particles.slice();
    for (var i = 0; i < count; i++) {
        var angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        var spd = speed * (0.5 + Math.random() * 0.5);
        newParticles.push(createParticle(
            cx + (Math.random() - 0.5) * 4,
            cy + (Math.random() - 0.5) * 4,
            Math.cos(angle) * spd,
            Math.sin(angle) * spd,
            life * (0.7 + Math.random() * 0.3),
            color,
            1.5 + Math.random() * 1.5
        ));
    }
    return { particles: newParticles };
}

// Large explosion (death)
export function emitExplosion(system, gridX, gridY, color, bgColor) {
    var cx = gridX * CELL_SIZE + CELL_SIZE / 2;
    var cy = gridY * CELL_SIZE + CELL_SIZE / 2;
    var newParticles = system.particles.slice();
    // Inner ring — bright, fast
    for (var i = 0; i < 20; i++) {
        var angle = (Math.PI * 2 * i) / 20;
        var spd = 80 + Math.random() * 60;
        newParticles.push(createParticle(
            cx, cy,
            Math.cos(angle) * spd,
            Math.sin(angle) * spd,
            0.6 + Math.random() * 0.3,
            color,
            2 + Math.random() * 2
        ));
    }
    // Outer ring — dimmer, slower
    for (var j = 0; j < 12; j++) {
        var angle2 = (Math.PI * 2 * j) / 12 + 0.15;
        var spd2 = 30 + Math.random() * 40;
        newParticles.push(createParticle(
            cx, cy,
            Math.cos(angle2) * spd2,
            Math.sin(angle2) * spd2,
            0.8 + Math.random() * 0.4,
            bgColor || '#ef4444',
            1 + Math.random() * 1.5
        ));
    }
    return { particles: newParticles };
}

// Sparkle trail (power-up active aura)
export function emitSparkle(system, gridX, gridY, color) {
    var cx = gridX * CELL_SIZE + CELL_SIZE / 2;
    var cy = gridY * CELL_SIZE + CELL_SIZE / 2;
    var newParticles = system.particles.slice();
    for (var i = 0; i < 2; i++) {
        newParticles.push(createParticle(
            cx + (Math.random() - 0.5) * CELL_SIZE,
            cy + (Math.random() - 0.5) * CELL_SIZE,
            (Math.random() - 0.5) * 20,
            -15 - Math.random() * 25,
            0.4 + Math.random() * 0.3,
            color,
            1 + Math.random()
        ));
    }
    return { particles: newParticles };
}

// Level-up shower (rains from top)
export function emitLevelUpShower(system, canvasSize, color) {
    var newParticles = system.particles.slice();
    for (var i = 0; i < 30; i++) {
        newParticles.push(createParticle(
            Math.random() * canvasSize,
            -5,
            (Math.random() - 0.5) * 30,
            60 + Math.random() * 80,
            1.0 + Math.random() * 0.5,
            color,
            1.5 + Math.random() * 2
        ));
    }
    return { particles: newParticles };
}

// Edge pulse (arena shrink)
export function emitEdgePulse(system, edge, arenaMin, arenaMax, canvasSize) {
    var newParticles = system.particles.slice();
    var color = '#ef4444';
    for (var i = 0; i < 15; i++) {
        var x, y, vx, vy;
        if (edge === 'top' || edge === 'bottom') {
            x = arenaMin.x * CELL_SIZE + Math.random() * (arenaMax.x - arenaMin.x + 1) * CELL_SIZE;
            y = edge === 'top' ? arenaMin.y * CELL_SIZE : (arenaMax.y + 1) * CELL_SIZE;
            vx = (Math.random() - 0.5) * 40;
            vy = edge === 'top' ? 20 + Math.random() * 30 : -20 - Math.random() * 30;
        } else {
            x = edge === 'left' ? arenaMin.x * CELL_SIZE : (arenaMax.x + 1) * CELL_SIZE;
            y = arenaMin.y * CELL_SIZE + Math.random() * (arenaMax.y - arenaMin.y + 1) * CELL_SIZE;
            vx = edge === 'left' ? 20 + Math.random() * 30 : -20 - Math.random() * 30;
            vy = (Math.random() - 0.5) * 40;
        }
        newParticles.push(createParticle(x, y, vx, vy, 0.5 + Math.random() * 0.3, color, 1.5 + Math.random()));
    }
    return { particles: newParticles };
}

// Portal swirl (teleportation)
export function emitPortalSwirl(system, gridX, gridY, color) {
    var cx = gridX * CELL_SIZE + CELL_SIZE / 2;
    var cy = gridY * CELL_SIZE + CELL_SIZE / 2;
    var newParticles = system.particles.slice();
    for (var i = 0; i < 8; i++) {
        var angle = (Math.PI * 2 * i) / 8;
        var radius = CELL_SIZE * 0.6;
        newParticles.push(createParticle(
            cx + Math.cos(angle) * radius,
            cy + Math.sin(angle) * radius,
            Math.cos(angle + 1.2) * 40,
            Math.sin(angle + 1.2) * 40,
            0.5 + Math.random() * 0.2,
            color,
            1.5 + Math.random()
        ));
    }
    return { particles: newParticles };
}

// --- Screen Shake ---

export function createShakeState() {
    return { intensity: 0, duration: 0, remaining: 0 };
}

export function triggerShake(intensity, duration) {
    return { intensity: intensity, duration: duration, remaining: duration };
}

export function updateShake(shake, dt) {
    if (shake.remaining <= 0) {
        return { intensity: 0, duration: 0, remaining: 0 };
    }
    return {
        intensity: shake.intensity,
        duration: shake.duration,
        remaining: shake.remaining - dt,
    };
}

export function getShakeOffset(shake) {
    if (shake.remaining <= 0) return { x: 0, y: 0 };
    var decay = shake.remaining / shake.duration;
    var mag = shake.intensity * decay;
    return {
        x: (Math.random() - 0.5) * 2 * mag,
        y: (Math.random() - 0.5) * 2 * mag,
    };
}
