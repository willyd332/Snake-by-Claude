'use strict';

import { GRID_SIZE, CELL_SIZE, CANVAS_SIZE } from './constants.js';
import { getLevelConfig } from './state.js';
import { getPowerUpDef } from './powerups.js';

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
    var config = getLevelConfig(state.level);
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

    // Hunter snake
    if (state.hunter && config.hunterColor) {
        var hunterPulse = Math.sin(Date.now() / 250) * 0.15 + 0.85;
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
            if (i === 0) {
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ff0000';
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 4;
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
                ctx.arc(ex1, ey1, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(ex2, ey2, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    // Teleport portals
    if (state.portals.length > 0) {
        var portalConfig = getLevelConfig(state.level);
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

    // Snake (with sub-cell interpolation)
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
        if (konamiActivated) {
            var hue = ((Date.now() / 10) + i * 20) % 360;
            ctx.fillStyle = 'hsl(' + hue + ', 80%, 60%)';
        } else {
            ctx.fillStyle = config.color;
        }
        ctx.globalAlpha = alpha;
        var padding = i === 0 ? 1 : 2;
        ctx.fillRect(
            drawX * CELL_SIZE + padding,
            drawY * CELL_SIZE + padding,
            CELL_SIZE - padding * 2,
            CELL_SIZE - padding * 2
        );
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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 28px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 20);

        ctx.fillStyle = '#888';
        ctx.font = '14px Courier New';
        ctx.fillText('Score: ' + state.score, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 10);
        ctx.fillText('Press any arrow key to restart', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 35);
        ctx.textAlign = 'left';
    }

    // HUD
    dom.scoreEl.textContent = state.score;
    dom.levelEl.textContent = state.level;

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
