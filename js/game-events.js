'use strict';

import { CANVAS_SIZE, GRID_SIZE, INVINCIBLE_TICKS } from './constants.js';
import { getLevelConfig, randomPosition } from './state.js';
import { getPowerUpDef } from './powerups.js';
import {
    emitBurst, emitExplosion, emitLevelUpShower, emitPortalSwirl,
    triggerShake,
} from './particles.js';
import {
    playEatSound, playLevelUpSound, playDeathSound, playLifeLostSound,
    playPowerUpCollectSound, playPortalSound, playShrinkSound,
    playHunterKillSound, playHunterIntroSound,
} from './audio.js';
import { setEndlessHighScore, setEndlessHighWave, getWaveTitle } from './endless.js';
import {
    recordFoodEaten, recordDeath, recordPortalUse,
    recordPowerUpCollected, recordBestScore, recordEndlessWave,
} from './stats.js';
import {
    startSpeedrunTimer, stopSpeedrunTimer,
} from './speedrun.js';

// --- Post-Tick Event Processing ---
// Handles all game events that occur after a tick: food eaten,
// wave-up, game over, power-ups, arena shrink, teleport.

export function processPostTickEvents(ctx) {

    // Food eaten: burst at food position, skip interpolation (snake grew)
    if (ctx.state._ateFood && ctx.state._ateFoodPos) {
        ctx.prevSnake = null;
        playEatSound();
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state._ateFoodPos.x, ctx.state._ateFoodPos.y, ctx.config.foodColor, 12, 60, 0.5);
        ctx.shakeState = triggerShake(2, 0.1);

        // Stats: food eaten + snake length
        recordFoodEaten(ctx.state.snake.length);

        // Speedrun: start timer on first food eaten
        if (ctx.speedrunState && !ctx.speedrunState.running) {
            ctx.speedrunState = startSpeedrunTimer(ctx.speedrunState);
        }

        // Score achievements
        if (ctx.state.score >= 100) ctx.tryUnlock('first_byte');
        if (ctx.state.score >= 500) ctx.tryUnlock('data_hoarder');
        if (ctx.state.score >= 1000) ctx.tryUnlock('megabyte');
    }

    // Endless wave-up detection
    if (ctx.state.endlessWave > (ctx.prevState.endlessWave || 0)) {
        recordEndlessWave(ctx.state.endlessWave);
        if (ctx.state.endlessWave >= 10) ctx.tryUnlock('endurance');
        if (ctx.state.endlessWave >= 25) ctx.tryUnlock('marathoner');
        ctx.prevSnake = null;
        ctx.prevHunterSegments = null;
        playLevelUpSound();
        var waveConfig = ctx.state.endlessConfig;
        ctx.particleSystem = emitLevelUpShower(ctx.particleSystem, CANVAS_SIZE, waveConfig.color);
        ctx.shakeState = triggerShake(4, 0.3);
        ctx.hunterTrailHistory = [];

        // ALPHA intro on first hunter wave
        if (ctx.state.hunter && !(ctx.prevState.hunter)) {
            ctx.hunterIntroState = { text: 'DESIGNATION: ALPHA \u2014 SECURITY DAEMON', startTime: Date.now() };
            playHunterIntroSound();
        }

        // Wave title message
        var waveTitle = getWaveTitle(ctx.state.endlessWave);
        if (waveTitle) {
            ctx.messageEl.textContent = 'WAVE ' + ctx.state.endlessWave + ' \u2014 ' + waveTitle;
            ctx.messageEl.className = 'levelup';
            ctx.messageEl.style.color = waveConfig.color;
            setTimeout(function() {
                ctx.messageEl.textContent = '';
                ctx.messageEl.className = '';
                ctx.messageEl.style.color = '';
            }, 2000);
        } else {
            ctx.messageEl.textContent = 'WAVE ' + ctx.state.endlessWave;
            ctx.messageEl.className = 'levelup';
            ctx.messageEl.style.color = waveConfig.color;
            setTimeout(function() {
                ctx.messageEl.textContent = '';
                ctx.messageEl.className = '';
                ctx.messageEl.style.color = '';
            }, 1500);
        }
    }

    // Power-up collected: sparkle burst
    if (ctx.state._collectedPowerUp) {
        recordPowerUpCollected();
        if (ctx.state._collectedPowerUp === 'ghost') ctx.tryUnlock('ghost_rider');
        var collectedDef = getPowerUpDef(ctx.state._collectedPowerUp);
        if (collectedDef) {
            playPowerUpCollectSound();
            ctx.ui.showPowerUpCollected(collectedDef);
            ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, collectedDef.glowColor, 16, 50, 0.6);
        }
    }

    // Arena shrink: shake
    if (ctx.state._shrinkOccurred) {
        playShrinkSound();
        ctx.ui.showShrinkMessage();
        ctx.shakeState = triggerShake(5, 0.25);
        var arenaW = ctx.state.arenaMaxX - ctx.state.arenaMinX + 1;
        var arenaH = ctx.state.arenaMaxY - ctx.state.arenaMinY + 1;
        if (arenaW <= 8 && arenaH <= 8) ctx.tryUnlock('survivor');
    }

    // Teleport: detect by checking if head moved more than 2 cells (skip on wrap-around levels)
    if (!ctx.state.gameOver && ctx.prevState.started && !ctx.config.wrapAround) {
        var headDx = Math.abs(ctx.state.snake[0].x - ctx.prevState.snake[0].x);
        var headDy = Math.abs(ctx.state.snake[0].y - ctx.prevState.snake[0].y);
        if (headDx > 2 || headDy > 2) {
            recordPortalUse();
            playPortalSound();
            var portalColor = ctx.config.portalColor || '#8b5cf6';
            ctx.particleSystem = emitPortalSwirl(ctx.particleSystem, ctx.prevState.snake[0].x, ctx.prevState.snake[0].y, portalColor);
            ctx.particleSystem = emitPortalSwirl(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, portalColor);
        }
    }

    // Death detected: check lives for respawn or game over
    if (ctx.state.gameOver && !ctx.prevState.gameOver) {
        ctx.prevSnake = null;
        ctx.prevHunterSegments = null;
        ctx.hunterIntroState = null;

        if (ctx.state.lives > 1) {
            // Life lost: respawn with invincibility instead of game over
            playLifeLostSound();
            ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, '#ffffff', 16, 50, 0.4);
            ctx.shakeState = triggerShake(5, 0.2);

            // Respawn snake at a safe position
            var spawnPos = randomPosition([], ctx.state.walls, ctx.state.obstacles, ctx.state.portals, null, ctx.state.hunter);
            var spawnSnake = [spawnPos];
            var newLives = ctx.state.lives - 1;
            var respawnState = Object.assign({}, ctx.state, {
                snake: spawnSnake,
                direction: { x: 0, y: 0 },
                nextDirection: { x: 0, y: 0 },
                gameOver: false,
                started: false,
                lives: newLives,
                invincibleTicks: INVINCIBLE_TICKS,
                powerUp: null,
                activePowerUp: null,
                powerUpSpawnCounter: 0,
                _killedByHunter: false,
                _deathCause: null,
            });
            // Respawn food at safe location
            respawnState = Object.assign({}, respawnState, {
                food: randomPosition(spawnSnake, ctx.state.walls, ctx.state.obstacles, ctx.state.portals, null, ctx.state.hunter),
            });
            ctx.state = respawnState;
            ctx.hunterTrailHistory = [];

            // Update lives HUD
            if (ctx.dom.livesEl) {
                ctx.dom.livesEl.textContent = newLives;
            }

            ctx.messageEl.textContent = 'LIFE LOST \u2014 ' + newLives + ' remaining. Arrow keys or swipe to continue';
            ctx.messageEl.className = 'active';
            ctx.messageEl.style.color = '#ef4444';
            return;
        }

        // Final death — true game over
        recordDeath(ctx.state.level);
        recordBestScore(ctx.state.level, ctx.state.score);

        // Speedrun: stop timer on final death
        if (ctx.speedrunState) {
            ctx.speedrunState = stopSpeedrunTimer(ctx.speedrunState);
        }

        // Save endless high scores on death
        setEndlessHighScore(ctx.state.score);
        setEndlessHighWave(ctx.state.endlessWave);
        if (ctx.state.score > ctx.highScore) {
            ctx.highScore = ctx.state.score;
            if (ctx.dom.highScoreEl) {
                ctx.dom.highScoreEl.textContent = ctx.highScore;
            }
        }

        if (ctx.state._killedByHunter) {
            // ALPHA kill: distinctive sound, orange particles, heavier shake
            playHunterKillSound();
            ctx.particleSystem = emitExplosion(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, ctx.config.hunterColor || '#f97316', '#ff2200');
            ctx.shakeState = triggerShake(12, 0.5);
        } else {
            playDeathSound();
            ctx.particleSystem = emitExplosion(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, ctx.config.color, '#ef4444');
            ctx.shakeState = triggerShake(8, 0.4);
        }
    }
}
