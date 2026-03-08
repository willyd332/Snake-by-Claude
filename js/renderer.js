'use strict';

import { GRID_SIZE, CELL_SIZE, CANVAS_SIZE, ZONE_SIZE } from './constants.js';
import { getLevelConfig } from './state.js';
import { getPowerUpDef } from './powerups.js';
import { manhattanDistance } from './hunter.js';
import { getActiveSkin, getActiveTrail } from './achievements.js';
import { getSettingsRef } from './settings.js';
import { getActiveEventDisplay } from './wave-events.js';

function renderWaveEventBanner(ctx, waveEvent) {
    var display = getActiveEventDisplay(waveEvent);
    if (!display) return;
    var bannerAlpha = Math.min(1, waveEvent.bannerTicksLeft / 5);
    ctx.save();
    ctx.globalAlpha = bannerAlpha * 0.85;
    ctx.fillStyle = 'rgba(10, 10, 26, 0.75)';
    var bannerY = 40;
    var bannerH = 32;
    ctx.fillRect(0, bannerY, CANVAS_SIZE, bannerH);
    ctx.globalAlpha = bannerAlpha;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Courier New';
    ctx.fillStyle = display.color;
    ctx.shadowColor = display.color;
    ctx.shadowBlur = 10;
    ctx.fillText(display.icon + ' ' + display.label, CANVAS_SIZE / 2, bannerY + 21);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.restore();
}

function getDeathMessage(deathCause, level, config) {
    if (deathCause === 'hunter') {
        return 'ALPHA found you. Its jaws close around your data. Protocol complete.';
    }
    if (deathCause === 'arena' || deathCause === 'crush') {
        return 'The walls close in. Memory reclaimed. Process terminated.';
    }
    if (deathCause === 'obstacle') {
        return 'The patrol caught you. These corridors don\'t forgive mistakes.';
    }
    if (deathCause === 'self') {
        return 'You consumed yourself. The data loop closes.';
    }
    if (deathCause === 'wall') {
        return 'The structure holds firm. Your light scatters against the walls.';
    }
    return 'The grid reclaims you. Your light fades into the structure.';
}

function renderWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    var lineY = y;
    for (var n = 0; n < words.length; n++) {
        var testLine = line + (line ? ' ' : '') + words[n];
        var metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line) {
            ctx.fillText(line, x, lineY);
            line = words[n];
            lineY += lineHeight;
        } else {
            line = testLine;
        }
    }
    if (line) {
        ctx.fillText(line, x, lineY);
    }
}

function renderDeathIcon(ctx, x, y, deathCause, config) {
    ctx.save();
    switch (deathCause) {
        case 'hunter':
            ctx.fillStyle = '#f97316';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(x - 10, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 10, y, 4, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'self':
            ctx.strokeStyle = config.color;
            ctx.lineWidth = 2;
            ctx.shadowColor = config.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(x, y, 12, 0.3, Math.PI * 1.8);
            ctx.stroke();
            ctx.fillStyle = config.color;
            ctx.beginPath();
            var selfTipX = x + 12 * Math.cos(0.3);
            var selfTipY = y + 12 * Math.sin(0.3);
            ctx.moveTo(selfTipX + 5, selfTipY - 1);
            ctx.lineTo(selfTipX - 1, selfTipY + 5);
            ctx.lineTo(selfTipX - 1, selfTipY - 5);
            ctx.closePath();
            ctx.fill();
            break;
        case 'obstacle':
            ctx.strokeStyle = config.obstacleColor || '#f97316';
            ctx.lineWidth = 2;
            ctx.shadowColor = config.obstacleColor || '#f97316';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(x, y - 14);
            ctx.lineTo(x + 14, y + 10);
            ctx.lineTo(x - 14, y + 10);
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = config.obstacleColor || '#f97316';
            ctx.font = 'bold 14px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('!', x, y + 7);
            break;
        case 'arena':
        case 'crush':
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(x - 6, y - 14);
            ctx.lineTo(x - 14, y);
            ctx.lineTo(x - 6, y + 14);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 6, y - 14);
            ctx.lineTo(x + 14, y);
            ctx.lineTo(x + 6, y + 14);
            ctx.stroke();
            break;
        default:
            ctx.strokeStyle = config.wallColor || config.color;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = config.wallColor || config.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(x - 12, y - 12);
            ctx.lineTo(x + 12, y + 12);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 12, y - 12);
            ctx.lineTo(x - 12, y + 12);
            ctx.stroke();
            break;
    }
    ctx.restore();
}

function lerpPos(prev, curr, t, wrapGrid) {
    var dx = curr.x - prev.x;
    var dy = curr.y - prev.y;
    if (wrapGrid) {
        if (dx > wrapGrid / 2) dx -= wrapGrid;
        else if (dx < -wrapGrid / 2) dx += wrapGrid;
        if (dy > wrapGrid / 2) dy -= wrapGrid;
        else if (dy < -wrapGrid / 2) dy += wrapGrid;
    }
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) return curr;
    return { x: prev.x + dx * t, y: prev.y + dy * t };
}

function renderScoreZones(ctx, zones, now) {
    ctx.save();
    for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        // Fade out in the last 10 ticks
        var fadeAlpha = z.ticksLeft <= 10 ? z.ticksLeft / 10 : 1;
        var pulse = Math.sin(now / 350 + i * 1.4) * 0.15 + 0.85;
        var zPx = z.x * CELL_SIZE;
        var zPy = z.y * CELL_SIZE;
        var zW = CELL_SIZE * ZONE_SIZE;
        var zH = CELL_SIZE * ZONE_SIZE;

        // Fill: subtle tinted overlay
        ctx.globalAlpha = 0.18 * fadeAlpha * pulse;
        ctx.fillStyle = z.color;
        ctx.fillRect(zPx, zPy, zW, zH);

        // Border glow
        ctx.globalAlpha = 0.55 * fadeAlpha * pulse;
        ctx.strokeStyle = z.glowColor;
        ctx.shadowColor = z.glowColor;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(zPx + 0.75, zPy + 0.75, zW - 1.5, zH - 1.5);
        ctx.shadowBlur = 0;

        // Label (x2 or x3) at center
        ctx.globalAlpha = 0.9 * fadeAlpha * pulse;
        ctx.fillStyle = z.glowColor;
        ctx.shadowColor = z.glowColor;
        ctx.shadowBlur = 6;
        ctx.font = 'bold 9px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(z.label, zPx + zW / 2, zPy + zH / 2 + 3);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.5;
    ctx.restore();
}

export function render(ctx, state, konamiActivated, dom, interp) {
    var config = getLevelConfig(state.level, state.endlessConfig);
    var userSettings = getSettingsRef();
    var isGhost = state.activePowerUp && state.activePowerUp.type === 'ghost';
    var interpProgress = interp ? interp.progress : 0;
    var iPrevSnake = interp ? interp.prevSnake : null;
    var iPrevHunter = interp ? interp.prevHunter : null;
    var wrapGrid = (config.wrapAround || isGhost) ? GRID_SIZE : null;
    var hc = userSettings.highContrast;

    // Clear
    ctx.fillStyle = config.bgAccent;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid lines
    if (userSettings.gridLines) {
        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (hc ? Math.min(config.gridAlpha * 2.5, 0.15) : config.gridAlpha) + ')';
        ctx.lineWidth = 0.5;
        for (var i = 0; i <= GRID_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL_SIZE, 0);
            ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * CELL_SIZE);
            ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
            ctx.stroke();
        }
    }

    // Wrap-around edge indicators
    if (config.wrapAround && state.started && !state.gameOver) {
        var edgePulse = Math.sin(Date.now() / 500) * 0.3 + 0.5;
        ctx.strokeStyle = 'rgba(234, 179, 8, ' + (edgePulse * 0.3) + ')';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, CANVAS_SIZE - 2, CANVAS_SIZE - 2);
        ctx.lineWidth = 0.5;
    }

    // Shrinking arena border indicator
    if (config.shrinkingArena && state.started && !state.gameOver) {
        var arenaMinPx = state.arenaMinX * CELL_SIZE;
        var arenaMinPy = state.arenaMinY * CELL_SIZE;
        var arenaW = (state.arenaMaxX - state.arenaMinX + 1) * CELL_SIZE;
        var arenaH = (state.arenaMaxY - state.arenaMinY + 1) * CELL_SIZE;
        var shrinkPulse = Math.sin(Date.now() / 400) * 0.3 + 0.4;
        ctx.strokeStyle = 'rgba(239, 68, 68, ' + shrinkPulse + ')';
        ctx.lineWidth = 2;
        ctx.strokeRect(arenaMinPx + 1, arenaMinPy + 1, arenaW - 2, arenaH - 2);
        ctx.lineWidth = 0.5;
    }

    // Score multiplier zones (rendered as semi-transparent glowing overlays)
    if (state.scoreZones && state.scoreZones.length > 0 && state.started && !state.gameOver) {
        renderScoreZones(ctx, state.scoreZones, Date.now());
    }

    // Walls
    if (state.walls.length > 0 && config.wallColor) {
        ctx.shadowColor = config.wallColor;
        ctx.shadowBlur = hc ? 8 : 4;
        state.walls.forEach(function(w) {
            ctx.fillStyle = config.wallColor;
            ctx.fillRect(
                w.x * CELL_SIZE + 1,
                w.y * CELL_SIZE + 1,
                CELL_SIZE - 2,
                CELL_SIZE - 2
            );
            ctx.fillStyle = hc ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(
                w.x * CELL_SIZE + 3,
                w.y * CELL_SIZE + 3,
                CELL_SIZE - 6,
                CELL_SIZE - 6
            );
            if (hc) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    w.x * CELL_SIZE + 1,
                    w.y * CELL_SIZE + 1,
                    CELL_SIZE - 2,
                    CELL_SIZE - 2
                );
            }
        });
        ctx.shadowBlur = 0;
    }

    // Moving obstacles
    if (state.obstacles.length > 0 && config.obstacleColor) {
        state.obstacles.forEach(function(ob) {
            var cx = ob.x * CELL_SIZE + CELL_SIZE / 2;
            var cy = ob.y * CELL_SIZE + CELL_SIZE / 2;
            ctx.shadowColor = config.obstacleColor;
            ctx.shadowBlur = 10;
            ctx.fillStyle = config.obstacleColor;
            ctx.beginPath();
            ctx.arc(cx, cy, CELL_SIZE / 2 - 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }

    // Hunter snake (ALPHA)
    if (state.hunter && config.hunterColor) {
        var hunterPulse = Math.sin(Date.now() / 250) * 0.15 + 0.85;
        var hunterTrail = interp ? interp.hunterTrail : null;

        // Proximity calculation for eye glow
        var proximityDist = manhattanDistance(state.hunter.segments[0], state.snake[0], config.wrapAround);
        var proximityFactor = Math.max(0, 1 - proximityDist / (GRID_SIZE * 0.75));

        // Afterimage trail (render before main body)
        if (hunterTrail && hunterTrail.length > 0) {
            for (var ti = hunterTrail.length - 1; ti >= 0; ti--) {
                var trailPos = hunterTrail[ti];
                var trailAlpha = 0.12 - ti * 0.04;
                if (trailAlpha <= 0) continue;
                ctx.globalAlpha = trailAlpha;
                ctx.fillStyle = config.hunterColor;
                ctx.fillRect(
                    trailPos.x * CELL_SIZE + 2,
                    trailPos.y * CELL_SIZE + 2,
                    CELL_SIZE - 4,
                    CELL_SIZE - 4
                );
            }
            ctx.globalAlpha = 1;
        }

        // Main hunter body
        state.hunter.segments.forEach(function(seg, i) {
            var hDrawX = seg.x;
            var hDrawY = seg.y;
            if (iPrevHunter && iPrevHunter[i] && interpProgress < 1) {
                var hl = lerpPos(iPrevHunter[i], seg, interpProgress, wrapGrid);
                hDrawX = hl.x;
                hDrawY = hl.y;
            }
            var hAlpha = (1 - (i / state.hunter.segments.length) * 0.4) * hunterPulse;
            ctx.globalAlpha = hAlpha;
            ctx.fillStyle = config.hunterColor;
            ctx.shadowColor = config.hunterColor;
            ctx.shadowBlur = i === 0 ? 8 : 3;
            var hPad = i === 0 ? 1 : 2;
            ctx.fillRect(
                hDrawX * CELL_SIZE + hPad,
                hDrawY * CELL_SIZE + hPad,
                CELL_SIZE - hPad * 2,
                CELL_SIZE - hPad * 2
            );

            // Energy lines between segments
            if (i > 0) {
                var prevSeg = state.hunter.segments[i - 1];
                var pDrawX = prevSeg.x;
                var pDrawY = prevSeg.y;
                if (iPrevHunter && iPrevHunter[i - 1] && interpProgress < 1) {
                    var pl = lerpPos(iPrevHunter[i - 1], prevSeg, interpProgress, wrapGrid);
                    pDrawX = pl.x;
                    pDrawY = pl.y;
                }
                var eDist = Math.abs(hDrawX - pDrawX) + Math.abs(hDrawY - pDrawY);
                if (eDist <= 1.5) {
                    var linePulse = Math.sin(Date.now() / 150 + i * 1.2) * 0.2 + 0.3;
                    ctx.globalAlpha = linePulse;
                    ctx.strokeStyle = '#ff4400';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(pDrawX * CELL_SIZE + CELL_SIZE / 2, pDrawY * CELL_SIZE + CELL_SIZE / 2);
                    ctx.lineTo(hDrawX * CELL_SIZE + CELL_SIZE / 2, hDrawY * CELL_SIZE + CELL_SIZE / 2);
                    ctx.stroke();
                }
            }

            // Head: eyes with proximity-based glow
            if (i === 0) {
                var eyeGlow = 4 + proximityFactor * 10;
                var eyeRadius = 2 + proximityFactor * 0.8;
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ff0000';
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = eyeGlow;
                var hcx = hDrawX * CELL_SIZE + CELL_SIZE / 2;
                var hcy = hDrawY * CELL_SIZE + CELL_SIZE / 2;
                var hDir = state.hunter.direction;
                var eyeFwd = 2;
                var eyeSpread = 3;
                var ex1 = hcx + hDir.x * eyeFwd + (-hDir.y) * eyeSpread;
                var ey1 = hcy + hDir.y * eyeFwd + hDir.x * eyeSpread;
                var ex2 = hcx + hDir.x * eyeFwd + hDir.y * eyeSpread;
                var ey2 = hcy + hDir.y * eyeFwd + (-hDir.x) * eyeSpread;
                ctx.beginPath();
                ctx.arc(ex1, ey1, eyeRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(ex2, ey2, eyeRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.lineWidth = 0.5;
    }

    // Teleport portals
    if (state.portals.length > 0) {
        var portalConfig = getLevelConfig(state.level, state.endlessConfig);
        if (portalConfig.portalColor) {
            var portalPulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
            state.portals.forEach(function(pair) {
                [pair.a, pair.b].forEach(function(pos) {
                    var pcx = pos.x * CELL_SIZE + CELL_SIZE / 2;
                    var pcy = pos.y * CELL_SIZE + CELL_SIZE / 2;
                    ctx.shadowColor = portalConfig.portalColor;
                    ctx.shadowBlur = 12;
                    ctx.globalAlpha = portalPulse;
                    ctx.strokeStyle = portalConfig.portalColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(pcx, pcy, CELL_SIZE / 2 - 1, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = portalConfig.portalColor;
                    ctx.globalAlpha = portalPulse * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(pcx, pcy - 5);
                    ctx.lineTo(pcx + 5, pcy);
                    ctx.lineTo(pcx, pcy + 5);
                    ctx.lineTo(pcx - 5, pcy);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.shadowBlur = 0;
                });
            });
        }
    }

    // Power-up
    if (state.powerUp) {
        var puDef = getPowerUpDef(state.powerUp.type);
        if (puDef) {
            var puCx = state.powerUp.x * CELL_SIZE + CELL_SIZE / 2;
            var puCy = state.powerUp.y * CELL_SIZE + CELL_SIZE / 2;
            var puPulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
            ctx.shadowColor = puDef.glowColor;
            ctx.shadowBlur = 14;
            ctx.globalAlpha = puPulse;

            if (state.powerUp.type === 'timeSlow') {
                ctx.fillStyle = puDef.color;
                ctx.beginPath();
                ctx.moveTo(puCx - 5, puCy - 7);
                ctx.lineTo(puCx + 5, puCy - 7);
                ctx.lineTo(puCx, puCy);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(puCx - 5, puCy + 7);
                ctx.lineTo(puCx + 5, puCy + 7);
                ctx.lineTo(puCx, puCy);
                ctx.closePath();
                ctx.fill();
            } else if (state.powerUp.type === 'ghost') {
                ctx.fillStyle = puDef.color;
                ctx.beginPath();
                ctx.arc(puCx, puCy - 2, 5, Math.PI, 0);
                ctx.lineTo(puCx + 5, puCy + 5);
                ctx.lineTo(puCx + 3, puCy + 3);
                ctx.lineTo(puCx, puCy + 5);
                ctx.lineTo(puCx - 3, puCy + 3);
                ctx.lineTo(puCx - 5, puCy + 5);
                ctx.closePath();
                ctx.fill();
            } else if (state.powerUp.type === 'shield') {
                // Shield icon: hexagon outline
                ctx.strokeStyle = puDef.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (var si = 0; si < 6; si++) {
                    var sAngle = (Math.PI / 3) * si - Math.PI / 6;
                    var sr = 6;
                    if (si === 0) ctx.moveTo(puCx + Math.cos(sAngle) * sr, puCy + Math.sin(sAngle) * sr);
                    else ctx.lineTo(puCx + Math.cos(sAngle) * sr, puCy + Math.sin(sAngle) * sr);
                }
                ctx.closePath();
                ctx.stroke();
                // Inner dot
                ctx.fillStyle = puDef.color;
                ctx.beginPath();
                ctx.arc(puCx, puCy, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 0.5;
            } else if (state.powerUp.type === 'magnet') {
                // Magnet icon: U-shape with poles
                ctx.strokeStyle = puDef.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(puCx, puCy + 2, 5, Math.PI, 0);
                ctx.stroke();
                // Left pole
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(puCx - 5, puCy + 2);
                ctx.lineTo(puCx - 5, puCy - 5);
                ctx.stroke();
                // Right pole
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(puCx + 5, puCy + 2);
                ctx.lineTo(puCx + 5, puCy - 5);
                ctx.stroke();
                ctx.lineWidth = 0.5;
            } else if (state.powerUp.type === 'frenzy') {
                // Frenzy icon: red/orange pulsing orb with exclamation mark
                var frenzyOrb1 = Math.sin(Date.now() / 100) * 0.4 + 0.6;
                var frenzyOrb2 = Math.sin(Date.now() / 100 + Math.PI) * 0.4 + 0.6;
                // Outer glow ring
                ctx.globalAlpha = puPulse * frenzyOrb1 * 0.5;
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(puCx, puCy, 8, 0, Math.PI * 2);
                ctx.stroke();
                // Inner orb (orange)
                ctx.globalAlpha = puPulse * frenzyOrb2;
                ctx.fillStyle = '#f97316';
                ctx.beginPath();
                ctx.arc(puCx, puCy, 5, 0, Math.PI * 2);
                ctx.fill();
                // Exclamation mark
                ctx.globalAlpha = puPulse;
                ctx.fillStyle = '#fff';
                ctx.fillRect(puCx - 1, puCy - 4, 2, 5);
                ctx.fillRect(puCx - 1, puCy + 2, 2, 2);
                ctx.lineWidth = 0.5;
            }

            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }
    }

    // Frenzy extra food items
    if (state.frenzyFood && state.frenzyFood.length > 0) {
        var frenzyFoodPulse = Math.sin(Date.now() / 150) * 0.3 + 0.7;
        for (var ffi = 0; ffi < state.frenzyFood.length; ffi++) {
            var ffx = state.frenzyFood[ffi].x * CELL_SIZE + CELL_SIZE / 2;
            var ffy = state.frenzyFood[ffi].y * CELL_SIZE + CELL_SIZE / 2;
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 12;
            ctx.globalAlpha = frenzyFoodPulse;
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.arc(ffx, ffy, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
            ctx.fill();
            // Inner highlight
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(ffx - 2, ffy - 2, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }
    }

    // Food
    if (state.food) {
        var foodType = state.food.type || 'standard';
        var isMagnetActive = state.activePowerUp && state.activePowerUp.type === 'magnet';
        var fcx = state.food.x * CELL_SIZE + CELL_SIZE / 2;
        var fcy = state.food.y * CELL_SIZE + CELL_SIZE / 2;
        var foodPulse = Math.sin(Date.now() / 220) * 0.2 + 0.8;

        if (foodType === 'golden') {
            // Golden apple: larger glowing gold circle with shimmer ring
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = hc ? 18 : 12;
            ctx.fillStyle = '#f59e0b';
            ctx.globalAlpha = foodPulse;
            ctx.beginPath();
            ctx.arc(fcx, fcy, CELL_SIZE / 2 - 1, 0, Math.PI * 2);
            ctx.fill();
            // Inner highlight
            ctx.fillStyle = '#fde68a';
            ctx.beginPath();
            ctx.arc(fcx - 2, fcy - 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // Outer shimmer ring
            ctx.globalAlpha = foodPulse * 0.4;
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(fcx, fcy, CELL_SIZE / 2 + 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 0.5;
            ctx.shadowBlur = 0;

        } else if (foodType === 'clock') {
            // Clock food: cyan circle with clock hands symbol
            ctx.shadowColor = '#22d3ee';
            ctx.shadowBlur = hc ? 16 : 10;
            ctx.fillStyle = '#06b6d4';
            ctx.globalAlpha = foodPulse;
            ctx.beginPath();
            ctx.arc(fcx, fcy, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
            ctx.fill();
            // Clock hands
            ctx.strokeStyle = '#e0f7ff';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(fcx, fcy);
            ctx.lineTo(fcx, fcy - 3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(fcx, fcy);
            ctx.lineTo(fcx + 2.5, fcy + 1);
            ctx.stroke();
            ctx.lineWidth = 0.5;
            ctx.shadowBlur = 0;

        } else if (foodType === 'speed') {
            // Speed boost: orange/red diamond shape
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = hc ? 16 : 10;
            ctx.fillStyle = '#ea580c';
            ctx.globalAlpha = foodPulse;
            ctx.beginPath();
            ctx.moveTo(fcx, fcy - (CELL_SIZE / 2 - 1));
            ctx.lineTo(fcx + (CELL_SIZE / 2 - 1), fcy);
            ctx.lineTo(fcx, fcy + (CELL_SIZE / 2 - 1));
            ctx.lineTo(fcx - (CELL_SIZE / 2 - 1), fcy);
            ctx.closePath();
            ctx.fill();
            // Inner highlight
            ctx.fillStyle = '#fdba74';
            ctx.globalAlpha = foodPulse * 0.7;
            ctx.beginPath();
            ctx.moveTo(fcx, fcy - 3);
            ctx.lineTo(fcx + 3, fcy);
            ctx.lineTo(fcx, fcy + 3);
            ctx.lineTo(fcx - 3, fcy);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

        } else {
            // Standard food
            ctx.fillStyle = config.foodColor;
            ctx.shadowColor = config.foodColor;
            ctx.shadowBlur = hc ? 14 : 8;
            ctx.beginPath();
            ctx.arc(fcx, fcy, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
            ctx.fill();
            if (hc) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        }

        // Magnet active: draw a pulsing gold ring around the food item
        if (isMagnetActive) {
            var magnetRingPulse = Math.sin(Date.now() / 120) * 0.3 + 0.6;
            ctx.globalAlpha = magnetRingPulse;
            ctx.strokeStyle = '#fbbf24';
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 8;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(fcx, fcy, CELL_SIZE / 2 + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.lineWidth = 0.5;
        }
    }

    // Wave Event: Bonus food items (FOOD_SURGE)
    if (state.waveEvent && state.waveEvent.bonusFood && state.waveEvent.bonusFood.length > 0) {
        var bfPulse = Math.sin(Date.now() / 180) * 0.25 + 0.75;
        state.waveEvent.bonusFood.forEach(function(bf) {
            var bfcx = bf.x * CELL_SIZE + CELL_SIZE / 2;
            var bfcy = bf.y * CELL_SIZE + CELL_SIZE / 2;
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#f59e0b';
            ctx.globalAlpha = bfPulse;
            ctx.beginPath();
            ctx.arc(bfcx, bfcy, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fde68a';
            ctx.beginPath();
            ctx.arc(bfcx - 1, bfcy - 1, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = bfPulse * 0.4;
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(bfcx, bfcy, CELL_SIZE / 2 + 1, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.lineWidth = 0.5;
        });
    }

    // Wave Event: Storm portals (PORTAL_STORM)
    if (state.waveEvent && state.waveEvent.stormPortals && state.waveEvent.stormPortals.length > 0) {
        var spPulse = Math.sin(Date.now() / 250) * 0.3 + 0.7;
        state.waveEvent.stormPortals.forEach(function(pair) {
            [pair.a, pair.b].forEach(function(pos) {
                var spcx = pos.x * CELL_SIZE + CELL_SIZE / 2;
                var spcy = pos.y * CELL_SIZE + CELL_SIZE / 2;
                ctx.shadowColor = '#c084fc';
                ctx.shadowBlur = 14;
                ctx.globalAlpha = spPulse;
                ctx.strokeStyle = '#c084fc';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(spcx, spcy, CELL_SIZE / 2 - 1, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#c084fc';
                ctx.globalAlpha = spPulse * 0.5;
                ctx.beginPath();
                ctx.moveTo(spcx, spcy - 4);
                ctx.lineTo(spcx + 4, spcy);
                ctx.lineTo(spcx, spcy + 4);
                ctx.lineTo(spcx - 4, spcy);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
            });
        });
        ctx.lineWidth = 0.5;
    }

    // Trail effect (rendered before snake)
    var trailHistory = interp ? interp.trailHistory : null;
    var activeTrail = getActiveTrail();
    if (trailHistory && trailHistory.length > 0 && activeTrail !== 'none' && state.started && !state.gameOver) {
        renderTrailEffect(ctx, trailHistory, config, activeTrail);
    }

    // Snake (with sub-cell interpolation + skin support)
    var activeSkin = getActiveSkin();
    var interpHeadX = state.snake[0].x;
    var interpHeadY = state.snake[0].y;
    state.snake.forEach(function(seg, i) {
        var drawX = seg.x;
        var drawY = seg.y;
        if (iPrevSnake && iPrevSnake[i] && interpProgress < 1) {
            var sl = lerpPos(iPrevSnake[i], seg, interpProgress, wrapGrid);
            drawX = sl.x;
            drawY = sl.y;
        }
        if (i === 0) {
            interpHeadX = drawX;
            interpHeadY = drawY;
        }
        var alpha = 1 - (i / state.snake.length) * 0.5;
        if (isGhost) alpha *= 0.45;
        if (state.invincibleTicks > 0) {
            alpha *= Math.sin(Date.now() / 60) * 0.35 + 0.65;
        }
        var segColor;
        if (konamiActivated) {
            var hue = ((Date.now() / 10) + i * 20) % 360;
            segColor = 'hsl(' + hue + ', 80%, 60%)';
        } else if (state.invincibleTicks > 0) {
            segColor = '#ffffff';
        } else {
            segColor = config.color;
        }
        ctx.globalAlpha = alpha;
        renderSnakeSegment(ctx, drawX, drawY, i, state.snake.length, segColor, activeSkin);
    });
    ctx.globalAlpha = 1;

    // Head flash ring (food eaten pulse)
    var headFlash = interp ? interp.headFlashState : null;
    if (headFlash && headFlash.remaining > 0 && state.started && !state.gameOver) {
        var flashProgress = headFlash.remaining / headFlash.duration;
        var flashScale = 1 + (1 - flashProgress) * 0.8;
        var flashAlpha = flashProgress * 0.85;
        var flashRadius = (CELL_SIZE / 2 + 3) * flashScale;
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.strokeStyle = headFlash.color;
        ctx.shadowColor = headFlash.color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
            interpHeadX * CELL_SIZE + CELL_SIZE / 2,
            interpHeadY * CELL_SIZE + CELL_SIZE / 2,
            flashRadius, 0, Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
    }

    // Ghost aura around head (uses interpolated position)
    if (isGhost && state.started && !state.gameOver) {
        var ghostPulse = Math.sin(Date.now() / 150) * 0.2 + 0.3;
        ctx.strokeStyle = 'rgba(226, 232, 240, ' + ghostPulse + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
            interpHeadX * CELL_SIZE + CELL_SIZE / 2,
            interpHeadY * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 2 + 3, 0, Math.PI * 2
        );
        ctx.stroke();
        ctx.lineWidth = 0.5;
    }

    // Shield aura around head (uses interpolated position)
    if (state.shieldActive && state.started && !state.gameOver) {
        var shieldPulse = Math.sin(Date.now() / 200) * 0.25 + 0.6;
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 211, 238, ' + shieldPulse + ')';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
            interpHeadX * CELL_SIZE + CELL_SIZE / 2,
            interpHeadY * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 2 + 4, 0, Math.PI * 2
        );
        ctx.stroke();
        // Second outer ring for depth
        ctx.globalAlpha = shieldPulse * 0.4;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(
            interpHeadX * CELL_SIZE + CELL_SIZE / 2,
            interpHeadY * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 2 + 7, 0, Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
    }

    // Magnet aura around head (uses interpolated position)
    var isMagnetHeadActive = state.activePowerUp && state.activePowerUp.type === 'magnet';
    if (isMagnetHeadActive && state.started && !state.gameOver) {
        var magnetHeadPulse = Math.sin(Date.now() / 130) * 0.25 + 0.55;
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, ' + magnetHeadPulse + ')';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
            interpHeadX * CELL_SIZE + CELL_SIZE / 2,
            interpHeadY * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 2 + 4, 0, Math.PI * 2
        );
        ctx.stroke();
        // Second outer ring for depth
        ctx.globalAlpha = magnetHeadPulse * 0.4;
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(
            interpHeadX * CELL_SIZE + CELL_SIZE / 2,
            interpHeadY * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 2 + 7, 0, Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
    }

    // Game over overlay
    if (state.gameOver) {
        var goDeathCause = state._deathCause || 'boundary';
        var goKilledByHunter = state._killedByHunter;
        var goHighScore = interp ? interp.highScore : 0;
        var goCenterX = CANVAS_SIZE / 2;

        // Level-themed dark background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = config.color;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.globalAlpha = 1;

        ctx.textAlign = 'center';

        // Death icon
        renderDeathIcon(ctx, goCenterX, 65, goDeathCause, config);

        // Title
        var goTitleColor = goKilledByHunter ? '#f97316' : '#ef4444';
        var goTitleText = goKilledByHunter ? 'ALPHA CAUGHT YOU' : 'GAME OVER';
        ctx.fillStyle = goTitleColor;
        ctx.font = 'bold 24px Courier New';
        ctx.shadowColor = goTitleColor;
        ctx.shadowBlur = 8;
        ctx.fillText(goTitleText, goCenterX, 115);
        ctx.shadowBlur = 0;

        // Narrative death message
        var goMessage = getDeathMessage(goDeathCause, state.level, config);
        ctx.fillStyle = 'rgba(180, 180, 190, 0.85)';
        ctx.font = 'italic 10px Courier New';
        renderWrappedText(ctx, goMessage, goCenterX, 145, CANVAS_SIZE - 80, 14);

        // Score breakdown
        var goTotalFood = Math.floor(state.score / 10);
        var goBreakdownY = 200;
        ctx.font = '11px Courier New';
        ctx.fillStyle = config.foodColor;
        ctx.fillText('\u25CF Food: ' + goTotalFood, goCenterX, goBreakdownY);
        ctx.fillStyle = config.color;
        ctx.fillText('\u25B2 Wave: ' + state.endlessWave, goCenterX, goBreakdownY + 18);
        ctx.fillStyle = '#ccc';
        ctx.fillText('\u2605 Score: ' + state.score, goCenterX, goBreakdownY + 36);

        // High score
        var goIsNewHigh = state.score > goHighScore && state.score > 0;
        if (goIsNewHigh) {
            var goHighPulse = Math.sin(Date.now() / 300) * 0.2 + 0.8;
            ctx.globalAlpha = goHighPulse;
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 13px Courier New';
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 8;
            ctx.fillText('\u2605 NEW HIGH SCORE \u2605', goCenterX, goBreakdownY + 62);
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        } else if (goHighScore > 0) {
            ctx.fillStyle = '#666';
            ctx.font = '11px Courier New';
            ctx.fillText('High Score: ' + goHighScore, goCenterX, goBreakdownY + 62);
        }

        // Best wave
        if (interp && interp.endlessHighWave > 0) {
            ctx.fillStyle = '#666';
            ctx.font = '10px Courier New';
            ctx.fillText('Best Wave: ' + interp.endlessHighWave, goCenterX, goBreakdownY + 80);
        }

        // Controls
        ctx.fillStyle = '#777';
        ctx.font = '11px Courier New';
        ctx.fillText('R / Tap \u2014 Restart', goCenterX, CANVAS_SIZE - 50);
        ctx.fillText('ESC / Hold \u2014 Title', goCenterX, CANVAS_SIZE - 34);

        ctx.textAlign = 'left';
    }

    // HUD
    dom.scoreEl.textContent = state.score;
    dom.levelEl.textContent = 'W' + state.endlessWave;

    // Power-up HUD indicator
    if (state.activePowerUp) {
        var activeDef = getPowerUpDef(state.activePowerUp.type);
        dom.powerUpHudEl.style.display = 'block';
        if (activeDef) {
            dom.powerUpNameEl.textContent = activeDef.name + ' [' + state.activePowerUp.ticksLeft + ']';
            dom.powerUpNameEl.style.color = activeDef.color;
        } else if (state.activePowerUp.type === 'speedBoost') {
            dom.powerUpNameEl.textContent = 'SPEED [' + state.activePowerUp.ticksLeft + ']';
            dom.powerUpNameEl.style.color = '#f97316';
        } else {
            dom.powerUpNameEl.textContent = state.activePowerUp.type + ' [' + state.activePowerUp.ticksLeft + ']';
            dom.powerUpNameEl.style.color = '#ffffff';
        }
    } else {
        dom.powerUpHudEl.style.display = 'none';
    }

    // Arena size HUD for shrinking levels
    if (config.shrinkingArena && state.started && !state.gameOver) {
        var aw = state.arenaMaxX - state.arenaMinX + 1;
        var ah = state.arenaMaxY - state.arenaMinY + 1;
        dom.arenaHudEl.style.display = 'block';
        dom.arenaSizeEl.textContent = aw + '\u00d7' + ah;
    } else {
        dom.arenaHudEl.style.display = 'none';
    }

    // Combo HUD indicator
    if (dom.comboHudEl && dom.comboLabelEl) {
        var combo = state.combo;
        var comboMult = combo ? combo.multiplier : 1;
        if (comboMult >= 2 && state.started && !state.gameOver) {
            dom.comboHudEl.style.display = 'inline';
            dom.comboLabelEl.textContent = 'x' + comboMult + ' COMBO!';
        } else {
            dom.comboHudEl.style.display = 'none';
        }
    }

    // Streak HUD badge
    if (dom.streakHudEl && dom.streakLabelEl) {
        var currentStreak = interp ? interp.currentStreak : 0;
        if (currentStreak >= 2 && state.started && !state.gameOver) {
            dom.streakHudEl.style.display = 'inline';
            dom.streakLabelEl.textContent = currentStreak + 'x';
        } else {
            dom.streakHudEl.style.display = 'none';
        }
    }

    // Wave Event Banner (rendered on top of gameplay)
    if (state.waveEvent && state.waveEvent.bannerEvent && state.waveEvent.bannerTicksLeft > 0 && state.started && !state.gameOver) {
        renderWaveEventBanner(ctx, state.waveEvent);
    }

    // Speed Burst visual warning flash (pulsing border when warning phase)
    if (state.waveEvent && state.waveEvent.activeEvent === 'SPEED_BURST' && state.waveEvent.speedBurstWarning && state.started && !state.gameOver) {
        var warnPulse = Math.sin(Date.now() / 80) * 0.4 + 0.5;
        ctx.save();
        ctx.strokeStyle = 'rgba(249, 115, 22, ' + warnPulse + ')';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, CANVAS_SIZE - 4, CANVAS_SIZE - 4);
        ctx.restore();
    }

    // Gold Rush: golden tint overlay while active
    if (state.waveEvent && state.waveEvent.goldRushActive && state.started && !state.gameOver) {
        ctx.save();
        ctx.globalAlpha = 0.04 + Math.sin(Date.now() / 400) * 0.02;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.restore();
    }

    // Frenzy: red pulsing screen edge
    if (state.activePowerUp && state.activePowerUp.type === 'frenzy' && state.started && !state.gameOver) {
        var frenzyEdgePulse = Math.sin(Date.now() / 80) * 0.4 + 0.5;
        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, ' + frenzyEdgePulse + ')';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, CANVAS_SIZE - 4, CANVAS_SIZE - 4);
        ctx.restore();
    }
}

// --- Skin Rendering ---
function renderSnakeSegment(ctx, drawX, drawY, index, total, color, skin) {
    var px = drawX * CELL_SIZE;
    var py = drawY * CELL_SIZE;
    var isHead = index === 0;
    var pad = isHead ? 1 : 2;

    switch (skin) {
        case 'neon':
            ctx.strokeStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = isHead ? 10 : 6;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + pad + 0.5, py + pad + 0.5, CELL_SIZE - pad * 2 - 1, CELL_SIZE - pad * 2 - 1);
            ctx.shadowBlur = 0;
            ctx.lineWidth = 0.5;
            break;

        case 'pixel':
            ctx.fillStyle = color;
            var innerPad = isHead ? 3 : 4;
            ctx.fillRect(px + innerPad, py + innerPad, CELL_SIZE - innerPad * 2, CELL_SIZE - innerPad * 2);
            ctx.fillRect(px + pad, py + pad, 2, 2);
            ctx.fillRect(px + CELL_SIZE - pad - 2, py + pad, 2, 2);
            ctx.fillRect(px + pad, py + CELL_SIZE - pad - 2, 2, 2);
            ctx.fillRect(px + CELL_SIZE - pad - 2, py + CELL_SIZE - pad - 2, 2, 2);
            break;

        case 'spectral':
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.globalAlpha *= 0.6;
            ctx.fillRect(px + pad, py + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2);
            ctx.shadowBlur = 0;
            break;

        case 'digital':
            ctx.fillStyle = color;
            ctx.fillRect(px + pad, py + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            if (index % 2 === 0) {
                ctx.fillRect(px + pad, py + pad, (CELL_SIZE - pad * 2) / 2, CELL_SIZE - pad * 2);
            } else {
                ctx.fillRect(px + pad + (CELL_SIZE - pad * 2) / 2, py + pad, (CELL_SIZE - pad * 2) / 2, CELL_SIZE - pad * 2);
            }
            break;

        case 'chrome':
            var grad = ctx.createLinearGradient(px, py, px, py + CELL_SIZE);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, color);
            grad.addColorStop(0.7, color);
            grad.addColorStop(1, '#333333');
            ctx.fillStyle = grad;
            ctx.fillRect(px + pad, py + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2);
            break;

        default:
            ctx.fillStyle = color;
            ctx.fillRect(px + pad, py + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2);
            break;
    }
}

// --- Death Replay Ghost Rendering ---
export function renderReplayGhost(ctx, currentFrame, trailFrames, config, progress) {
    if (!currentFrame) return;

    var snake = currentFrame.snake;

    // Render ghost trail (previous frames fading out)
    for (var t = 0; t < trailFrames.length; t++) {
        var trailFrame = trailFrames[t];
        var trailAlpha = 0.08 + (t / trailFrames.length) * 0.12;
        ctx.globalAlpha = trailAlpha;
        ctx.fillStyle = config.color;
        for (var ts = 0; ts < trailFrame.snake.length; ts++) {
            var tSeg = trailFrame.snake[ts];
            ctx.fillRect(
                tSeg.x * CELL_SIZE + 3,
                tSeg.y * CELL_SIZE + 3,
                CELL_SIZE - 6,
                CELL_SIZE - 6
            );
        }
    }

    // Render current frame snake as semi-transparent ghost
    for (var i = 0; i < snake.length; i++) {
        var seg = snake[i];
        var segAlpha = (0.5 - (i / snake.length) * 0.25);
        var isHead = i === 0;
        var pad = isHead ? 1 : 2;

        ctx.globalAlpha = segAlpha;
        ctx.fillStyle = config.color;
        ctx.shadowColor = config.color;
        ctx.shadowBlur = isHead ? 8 : 4;
        ctx.fillRect(
            seg.x * CELL_SIZE + pad,
            seg.y * CELL_SIZE + pad,
            CELL_SIZE - pad * 2,
            CELL_SIZE - pad * 2
        );
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // "REPLAY" label with progress bar
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px Courier New';
    var labelPulse = Math.sin(Date.now() / 300) * 0.2 + 0.8;
    ctx.globalAlpha = labelPulse;
    ctx.fillStyle = '#ef4444';
    ctx.fillText('REPLAY', CANVAS_SIZE / 2, 18);

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

// --- Score Popup Rendering ---
export function renderScorePopups(ctx, popups) {
    if (!popups || popups.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
        var p = popups[i];
        ctx.globalAlpha = p.alpha;
        ctx.font = 'bold 11px Courier New';
        ctx.fillStyle = p.color || '#fbbf24';
        ctx.shadowColor = p.color || '#fbbf24';
        ctx.shadowBlur = 6;
        ctx.fillText(p.text, p.x, p.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.restore();
}

// --- Trail Rendering ---
function renderTrailEffect(ctx, trailHistory, config, trailType) {
    ctx.save();
    for (var i = 0; i < trailHistory.length; i++) {
        var pos = trailHistory[i];
        var trailAlpha = (1 - i / trailHistory.length) * 0.3;

        switch (trailType) {
            case 'fade':
                ctx.globalAlpha = trailAlpha;
                ctx.fillStyle = config.color;
                ctx.fillRect(
                    pos.x * CELL_SIZE + 3,
                    pos.y * CELL_SIZE + 3,
                    CELL_SIZE - 6,
                    CELL_SIZE - 6
                );
                break;

            case 'sparkle':
                ctx.globalAlpha = trailAlpha * 1.2;
                ctx.fillStyle = '#ffffff';
                var sparkleSize = 2 + Math.sin(Date.now() / 100 + i * 2) * 1;
                var sx = pos.x * CELL_SIZE + CELL_SIZE / 2 + Math.sin(Date.now() / 200 + i) * 3;
                var sy = pos.y * CELL_SIZE + CELL_SIZE / 2 + Math.cos(Date.now() / 200 + i) * 3;
                ctx.beginPath();
                ctx.arc(sx, sy, sparkleSize, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'digital':
                ctx.globalAlpha = trailAlpha * 0.8;
                ctx.fillStyle = config.color;
                ctx.font = '10px Courier New';
                ctx.textAlign = 'center';
                var digit = (i + Math.floor(Date.now() / 200)) % 2 === 0 ? '0' : '1';
                ctx.fillText(digit, pos.x * CELL_SIZE + CELL_SIZE / 2, pos.y * CELL_SIZE + CELL_SIZE / 2 + 4);
                ctx.textAlign = 'left';
                break;
        }
    }
    ctx.restore();
}
