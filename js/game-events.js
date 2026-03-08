'use strict';

import { CANVAS_SIZE, GRID_SIZE, CELL_SIZE, INVINCIBLE_TICKS } from './constants.js';
import { getLevelConfig, randomPosition, randomPositionInBounds } from './state.js';
import { getPowerUpDef } from './powerups.js';
import { createComboState } from './combo.js';
import {
    emitBurst, emitExplosion, emitLevelUpShower, emitPortalSwirl,
    triggerShake,
    SHAKE_FOOD, SHAKE_POWER_UP, SHAKE_WAVE_UP, SHAKE_SHRINK,
    SHAKE_LIFE_LOST, SHAKE_DEATH, SHAKE_HUNTER_KILL,
} from './particles.js';
import {
    playEatSound, playLevelUpSound, playDeathSound, playLifeLostSound,
    playPowerUpCollectSound, playPortalSound, playShrinkSound,
    playHunterKillSound, playHunterIntroSound, playComboSound,
    playShieldBreakSound,
    getAudioContext, getMasterGain,
} from './audio.js';
import { setMusicIntensity, playWaveFanfare, stopMusic } from './music.js';
import { setEndlessHighScore, setEndlessHighWave, getWaveTitle, getGridSizeForWave } from './endless.js';
import { setGridSize } from './constants.js';
import {
    recordFoodEaten, recordDeath, recordPortalUse,
    recordPowerUpCollected, recordBestScore, recordEndlessWave,
} from './stats.js';
import {
    startSpeedrunTimer, stopSpeedrunTimer,
} from './speedrun.js';
import { getSettingsRef, getDifficultyPreset } from './settings.js';

// --- Post-Tick Event Processing ---
// Handles all game events that occur after a tick: food eaten,
// wave-up, game over, power-ups, arena shrink, teleport.

export function processPostTickEvents(ctx) {

    // Food eaten: burst at food position, skip interpolation (snake grew)
    if (ctx.state._ateFood && ctx.state._ateFoodPos) {
        ctx.prevSnake = null;
        playEatSound();
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state._ateFoodPos.x, ctx.state._ateFoodPos.y, ctx.config.foodColor, 12, 60, 0.5);
        ctx.shakeState = triggerShake(SHAKE_FOOD.intensity, SHAKE_FOOD.duration);
        ctx.headFlashState = { remaining: 0.18, duration: 0.18, color: ctx.config.foodColor };

        // Score popup at food position — show actual scored value and multiplier label
        var comboMult = ctx.state._comboMultiplier || 1;
        var scoreGained = ctx.state._scoreGained || 0;
        var popupText = comboMult > 1 ? '+' + scoreGained + ' x' + comboMult : '+' + scoreGained;
        ctx.scorePopups = (ctx.scorePopups || []).concat([{
            x: ctx.state._ateFoodPos.x * CELL_SIZE + CELL_SIZE / 2,
            y: ctx.state._ateFoodPos.y * CELL_SIZE + CELL_SIZE / 2,
            text: popupText,
            alpha: 1,
            vy: -0.8,
            color: comboMult > 1 ? '#f59e0b' : '#fbbf24',
        }]);

        // Combo sound on multiplier increase (2x and above)
        if (ctx.state._comboIncreased && comboMult >= 2) {
            playComboSound(comboMult);
        }

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
        if (ctx.state.score >= 2000) ctx.tryUnlock('centurion');
        if (ctx.state.score >= 5000) ctx.tryUnlock('transcendent');

        // Length achievements
        if (ctx.state.snake.length >= 20) ctx.tryUnlock('long_snake');
        if (ctx.state.snake.length >= 40) ctx.tryUnlock('serpent_king');
    }

    // Combo break: flash "COMBO BREAK" when a streak expires
    if (ctx.state._comboExpired) {
        ctx.ui.showComboBreak();
    }

    // Endless wave-up detection
    if (ctx.state.endlessWave > (ctx.prevState.endlessWave || 0)) {
        recordEndlessWave(ctx.state.endlessWave);

        // Expand the grid on wave transition
        setGridSize(getGridSizeForWave(ctx.state.endlessWave));

        // Wave milestone achievements
        if (ctx.state.endlessWave >= 2) ctx.tryUnlock('first_wave');
        if (ctx.state.endlessWave >= 5) ctx.tryUnlock('wave_rider');
        if (ctx.state.endlessWave >= 10) ctx.tryUnlock('endurance');
        if (ctx.state.endlessWave >= 15) ctx.tryUnlock('deep_runner');
        if (ctx.state.endlessWave >= 25) ctx.tryUnlock('marathoner');
        if (ctx.state.endlessWave >= 50) ctx.tryUnlock('legend');

        // Speed demon: wave 21+ means speed is at minimum (40ms)
        if (ctx.state.endlessWave >= 21) ctx.tryUnlock('speed_demon');

        // Hunter survivor: survived a wave that had ALPHA active
        if (ctx.prevState.hunter) ctx.tryUnlock('hunter_survivor');

        // Iron will: reach wave 5 without losing a life
        if (ctx.state.endlessWave >= 5) {
            var maxLives = getDifficultyPreset(getSettingsRef().difficulty).livesCount;
            if (ctx.state.lives >= maxLives) ctx.tryUnlock('iron_will');
        }

        ctx.prevSnake = null;
        ctx.prevHunterSegments = null;
        playLevelUpSound();
        playWaveFanfare(getAudioContext(), getMasterGain(), ctx.state.endlessWave);
        setMusicIntensity(ctx.state.endlessWave, ctx.state.wallInset || 0);
        var waveConfig = ctx.state.endlessConfig;
        ctx.particleSystem = emitLevelUpShower(ctx.particleSystem, CANVAS_SIZE, waveConfig.color);
        ctx.shakeState = triggerShake(SHAKE_WAVE_UP.intensity, SHAKE_WAVE_UP.duration);
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
        if (ctx.state._collectedPowerUp === 'timeSlow') ctx.tryUnlock('power_collector');
        var collectedDef = getPowerUpDef(ctx.state._collectedPowerUp);
        if (collectedDef) {
            playPowerUpCollectSound();
            ctx.ui.showPowerUpCollected(collectedDef);
            ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, collectedDef.glowColor, 16, 50, 0.6);
            ctx.shakeState = triggerShake(SHAKE_POWER_UP.intensity, SHAKE_POWER_UP.duration);

            // Popup label for power-up at snake head position
            ctx.scorePopups = (ctx.scorePopups || []).concat([{
                x: ctx.state.snake[0].x * CELL_SIZE + CELL_SIZE / 2,
                y: ctx.state.snake[0].y * CELL_SIZE + CELL_SIZE / 2,
                text: collectedDef.name + '!',
                alpha: 1,
                vy: -0.8,
                color: collectedDef.color,
            }]);
        }
    }

    // Arena shrink: shake + update music intensity for wall urgency
    if (ctx.state._shrinkOccurred) {
        playShrinkSound();
        ctx.ui.showShrinkMessage();
        ctx.shakeState = triggerShake(SHAKE_SHRINK.intensity, SHAKE_SHRINK.duration);
        setMusicIntensity(ctx.state.endlessWave || 1, ctx.state.wallInset || 0);
        var arenaW = ctx.state.arenaMaxX - ctx.state.arenaMinX + 1;
        var arenaH = ctx.state.arenaMaxY - ctx.state.arenaMinY + 1;
        if (arenaW <= 8 && arenaH <= 8) ctx.tryUnlock('survivor');
        if (arenaW <= 6 && arenaH <= 6) ctx.tryUnlock('close_call');
    }

    // Shield broke: absorbed a lethal hit — dramatic flash + particles
    if (ctx.state._shieldBroke) {
        playShieldBreakSound();
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, '#22d3ee', 20, 70, 0.5);
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, '#ffffff', 10, 40, 0.3);
        ctx.shakeState = triggerShake(6, 0.25);
        ctx.scorePopups = (ctx.scorePopups || []).concat([{
            x: ctx.state.snake[0].x * CELL_SIZE + CELL_SIZE / 2,
            y: ctx.state.snake[0].y * CELL_SIZE + CELL_SIZE / 2,
            text: 'SHIELD BROKE!',
            alpha: 1,
            vy: -1.0,
            color: '#22d3ee',
        }]);
        ctx.messageEl.textContent = 'SHIELD ABSORBED THE HIT';
        ctx.messageEl.className = 'active';
        ctx.messageEl.style.color = '#22d3ee';
        setTimeout(function() {
            ctx.messageEl.textContent = '';
            ctx.messageEl.className = '';
            ctx.messageEl.style.color = '';
        }, 1500);
    }

    // Teleport: detect by checking if head moved more than 2 cells (skip on wrap-around levels)
    if (!ctx.state.gameOver && ctx.prevState.started && !ctx.config.wrapAround) {
        var headDx = Math.abs(ctx.state.snake[0].x - ctx.prevState.snake[0].x);
        var headDy = Math.abs(ctx.state.snake[0].y - ctx.prevState.snake[0].y);
        if (headDx > 2 || headDy > 2) {
            recordPortalUse();
            playPortalSound();
            ctx.tryUnlock('portal_master');
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
            ctx.shakeState = triggerShake(SHAKE_LIFE_LOST.intensity, SHAKE_LIFE_LOST.duration);

            // Respawn snake at a safe position within current grid
            var spawnPos = randomPositionInBounds([], ctx.state.walls, ctx.state.obstacles, ctx.state.portals, null, ctx.state.hunter, 0, 0, GRID_SIZE - 1, GRID_SIZE - 1);
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
                combo: createComboState(),
            });
            // Respawn food at safe location
            respawnState = Object.assign({}, respawnState, {
                food: randomPositionInBounds(spawnSnake, ctx.state.walls, ctx.state.obstacles, ctx.state.portals, null, ctx.state.hunter, 0, 0, GRID_SIZE - 1, GRID_SIZE - 1),
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
        stopMusic();
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
            ctx.shakeState = triggerShake(SHAKE_HUNTER_KILL.intensity, SHAKE_HUNTER_KILL.duration);
        } else {
            playDeathSound();
            ctx.particleSystem = emitExplosion(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, ctx.config.color, '#ef4444');
            ctx.shakeState = triggerShake(SHAKE_DEATH.intensity, SHAKE_DEATH.duration);
        }
    }
}
