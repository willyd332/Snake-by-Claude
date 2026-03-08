'use strict';

import { GRID_SIZE, CELL_SIZE, CANVAS_SIZE } from './constants.js';
import { getLevelConfig } from './state.js';
import { getPowerUpDef } from './powerups.js';
import { renderEnvironment } from './environment.js';
import { manhattanDistance } from './hunter.js';
import { getActiveSkin, getActiveTrail } from './achievements.js';

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
    if (config.fogRadius) {
        return 'Lost in the dark. The fog swallows your light whole.';
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

export function render(ctx, state, konamiActivated, dom, interp) {
    var config = getLevelConfig(state.level, state.endlessConfig);
    var isGhost = state.activePowerUp && state.activePowerUp.type === 'ghost';
    var interpProgress = interp ? interp.progress : 0;
    var iPrevSnake = interp ? interp.prevSnake : null;
    var iPrevHunter = interp ? interp.prevHunter : null;
    var wrapGrid = (config.wrapAround || isGhost) ? GRID_SIZE : null;

    // Clear
    ctx.fillStyle = config.bgAccent;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + config.gridAlpha + ')';
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

    // Environmental details (rendered behind game elements)
    renderEnvironment(ctx, state);

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

    // Walls
    if (state.walls.length > 0 && config.wallColor) {
        ctx.shadowColor = config.wallColor;
        ctx.shadowBlur = 4;
        state.walls.forEach(function(w) {
            ctx.fillStyle = config.wallColor;
            ctx.fillRect(
                w.x * CELL_SIZE + 1,
                w.y * CELL_SIZE + 1,
                CELL_SIZE - 2,
                CELL_SIZE - 2
            );
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(
                w.x * CELL_SIZE + 3,
                w.y * CELL_SIZE + 3,
                CELL_SIZE - 6,
                CELL_SIZE - 6
            );
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
        var proximityFactor = Math.max(0, 1 - proximityDist / (GRID_SIZE * 0.75)); // 1=close, 0=far

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

    // Data fragment
    if (state.fragment) {
        var fragPulse = Math.sin(Date.now() / 400) * 0.3 + 0.7;
        var fragX = state.fragment.x * CELL_SIZE + CELL_SIZE / 2;
        var fragY = state.fragment.y * CELL_SIZE + CELL_SIZE / 2;
        ctx.shadowColor = '#4a9eff';
        ctx.shadowBlur = 10;
        ctx.globalAlpha = fragPulse;
        ctx.fillStyle = '#4a9eff';
        // Diamond shape (rotated square)
        ctx.beginPath();
        ctx.moveTo(fragX, fragY - 6);
        ctx.lineTo(fragX + 6, fragY);
        ctx.lineTo(fragX, fragY + 6);
        ctx.lineTo(fragX - 6, fragY);
        ctx.closePath();
        ctx.fill();
        // Inner highlight
        ctx.fillStyle = 'rgba(200, 230, 255, 0.7)';
        ctx.beginPath();
        ctx.moveTo(fragX, fragY - 3);
        ctx.lineTo(fragX + 3, fragY);
        ctx.lineTo(fragX, fragY + 3);
        ctx.lineTo(fragX - 3, fragY);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
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
            }

            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }
    }

    // Food
    if (state.food) {
        ctx.fillStyle = config.foodColor;
        ctx.shadowColor = config.foodColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(
            state.food.x * CELL_SIZE + CELL_SIZE / 2,
            state.food.y * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE / 2 - 2,
            0, Math.PI * 2
        );
        ctx.fill();
        ctx.shadowBlur = 0;
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

    // Fog of War overlay (uses interpolated head position)
    if (config.fogRadius && state.started && !state.gameOver) {
        var headPixX = interpHeadX * CELL_SIZE + CELL_SIZE / 2;
        var headPixY = interpHeadY * CELL_SIZE + CELL_SIZE / 2;
        var flicker = Math.sin(Date.now() / 200) * 0.05 + 1;
        var outerRadius = config.fogRadius * CELL_SIZE * flicker;
        var innerRadius = outerRadius * 0.4;

        var fogGrad = ctx.createRadialGradient(headPixX, headPixY, innerRadius, headPixX, headPixY, outerRadius);
        fogGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        fogGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.7)');
        fogGrad.addColorStop(1, 'rgba(0, 0, 0, 0.97)');

        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
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
        var goLevelLabel = state.endlessWave > 0
            ? '\u25B2 Wave: ' + state.endlessWave
            : '\u25B2 Level: ' + state.level;
        ctx.fillText(goLevelLabel, goCenterX, goBreakdownY + 18);
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

        // Endless mode best wave
        if (state.endlessWave > 0 && interp && interp.endlessHighWave > 0) {
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
    if (state.endlessWave > 0) {
        dom.levelEl.textContent = 'W' + state.endlessWave;
    } else {
        dom.levelEl.textContent = state.level;
    }

    // Power-up HUD indicator
    if (state.activePowerUp) {
        var activeDef = getPowerUpDef(state.activePowerUp.type);
        dom.powerUpHudEl.style.display = 'block';
        dom.powerUpNameEl.textContent = activeDef.name + ' [' + state.activePowerUp.ticksLeft + ']';
        dom.powerUpNameEl.style.color = activeDef.color;
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
            // Corner dots
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
            // Binary overlay
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
