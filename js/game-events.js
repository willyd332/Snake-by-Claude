'use strict';

import { CANVAS_SIZE, GRID_SIZE, CELL_SIZE, INVINCIBLE_TICKS, WAVE_START_INVINCIBLE_TICKS } from './constants.js';
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
    playPowerUpCollectSound, playMagnetCollectSound, playPortalSound, playShrinkSound,
    playHunterKillSound, playHunterIntroSound, playComboSound,
    playShieldBreakSound, playBonusFoodSound,
    playWaveEventFoodSurgeSound, playWaveEventSpeedWarningSound,
    playWaveEventSpeedBurstSound, playWaveEventGravityFlipSound,
    playWaveEventPortalStormSound, playWaveEventGoldRushSound,
    getAudioContext, getMasterGain,
} from './audio.js';
import {
    setMusicIntensity, transitionToWave, playWaveFanfare, stopMusic,
    onMusicFoodEaten, onMusicNearMiss, onMusicPowerUpActive, onMusicPowerUpExpired,
    onMusicHunterProximity, onMusicLowHealth, onMusicComboChange,
} from './music.js';
import { setEndlessHighScore, setEndlessHighWave, getWaveTitle, getGridSizeForWave } from './endless.js';
import { setGridSize } from './constants.js';
import {
    recordFoodEaten, recordDeath, recordPortalUse,
    recordPowerUpCollected, recordBestScore, recordEndlessWave,
    getStats,
} from './stats.js';
import { ACHIEVEMENTS, isAchievementUnlocked } from './achievements.js';
import {
    startSpeedrunTimer, stopSpeedrunTimer,
} from './speedrun.js';
import { getSettingsRef, getDifficultyPreset } from './settings.js';
import { showWavePreview, dismissWavePreview } from './wave-preview.js';

// --- Helper: compute Manhattan distance to nearest hunter segment ---
export function computeHunterDistance(state) {
    if (!state.hunter || !state.hunter.segments || !state.snake || state.snake.length === 0) {
        return null;
    }
    var head = state.snake[0];
    var minDist = Infinity;
    var segments = state.hunter.segments;
    for (var i = 0; i < segments.length; i++) {
        var d = Math.abs(head.x - segments[i].x) + Math.abs(head.y - segments[i].y);
        if (d < minDist) minDist = d;
    }
    return minDist === Infinity ? null : minDist;
}

// --- Post-Tick Event Processing ---
// Handles all game events that occur after a tick: food eaten,
// wave-up, game over, power-ups, arena shrink, teleport.

export function processPostTickEvents(ctx) {

    // Food eaten: burst at food position, skip interpolation (snake grew)
    if (ctx.state._ateFood && ctx.state._ateFoodPos) {
        ctx.prevSnake = null;
        var eatFoodType = ctx.state._ateFoodType || 'standard';

        // Distinct colors and sounds per food type
        var foodParticleColor = ctx.config.foodColor;
        var foodFlashColor = ctx.config.foodColor;
        if (eatFoodType === 'golden') {
            foodParticleColor = '#fbbf24';
            foodFlashColor = '#fbbf24';
            playBonusFoodSound('golden');
        } else if (eatFoodType === 'clock') {
            foodParticleColor = '#22d3ee';
            foodFlashColor = '#22d3ee';
            playBonusFoodSound('clock');
        } else if (eatFoodType === 'speed') {
            foodParticleColor = '#f97316';
            foodFlashColor = '#f97316';
            playBonusFoodSound('speed');
        } else {
            playEatSound();
        }

        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state._ateFoodPos.x, ctx.state._ateFoodPos.y, foodParticleColor, 12, 60, 0.5);
        ctx.shakeState = triggerShake(SHAKE_FOOD.intensity, SHAKE_FOOD.duration);
        ctx.headFlashState = { remaining: 0.18, duration: 0.18, color: foodFlashColor };

        // Score popup at food position — show actual scored value and multiplier label
        var comboMult = ctx.state._comboMultiplier || 1;
        var scoreGained = ctx.state._scoreGained || 0;
        var activeZone = ctx.state._activeZone || null;
        var popupText = comboMult > 1 ? '+' + scoreGained + ' x' + comboMult : '+' + scoreGained;
        // Zone multiplier label prepended
        if (activeZone) popupText = activeZone.label + ' ZONE! ' + popupText;
        // Bonus food: prepend label
        if (eatFoodType === 'golden') popupText = 'GOLDEN! ' + popupText;
        if (eatFoodType === 'clock') popupText = 'SLOW TIME! ' + popupText;
        if (eatFoodType === 'speed') popupText = 'SPEED! ' + popupText;
        var popupColor = activeZone
            ? activeZone.glowColor
            : eatFoodType === 'golden'
            ? '#fbbf24'
            : eatFoodType === 'clock'
            ? '#22d3ee'
            : eatFoodType === 'speed'
            ? '#f97316'
            : comboMult > 1
            ? '#f59e0b'
            : '#fbbf24';
        ctx.scorePopups = (ctx.scorePopups || []).concat([{
            x: ctx.state._ateFoodPos.x * CELL_SIZE + CELL_SIZE / 2,
            y: ctx.state._ateFoodPos.y * CELL_SIZE + CELL_SIZE / 2,
            text: popupText,
            alpha: 1,
            vy: -0.8,
            color: popupColor,
        }]);

        // Combo sound on multiplier increase (2x and above)
        if (ctx.state._comboIncreased && comboMult >= 2) {
            playComboSound(comboMult);
        }

        // Reactive music: melodic flourish pitched to combo level
        onMusicFoodEaten(comboMult);

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
        if (ctx.state.score >= 10000) ctx.tryUnlock('gigabyte');
        if (ctx.state.score >= 25000) ctx.tryUnlock('terabyte');

        // Length achievements
        if (ctx.state.snake.length >= 20) ctx.tryUnlock('long_snake');
        if (ctx.state.snake.length >= 40) ctx.tryUnlock('serpent_king');
        if (ctx.state.snake.length >= 60) ctx.tryUnlock('serpent_god');

        // Combo achievements
        if (ctx.state._comboMultiplier >= 5) ctx.tryUnlock('combo_king');
        if (ctx.state.combo && ctx.state.combo.streak >= 20) ctx.tryUnlock('hypnotic');

        // Lifetime food achievement
        var statsOnEat = getStats();
        if (statsOnEat.totalFoodEaten >= 1000) ctx.tryUnlock('foodie');

        // Per-run food achievement
        if (ctx.runFoodEaten >= 100) ctx.tryUnlock('big_eater');

        // Ghost + zone: ate food while ghost active inside a score zone
        if (ctx.state.activePowerUp && ctx.state.activePowerUp.type === 'ghost' && ctx.state._activeZone) {
            ctx.tryUnlock('ghost_zone');
        }

        // Combo + zone: ate food in a score zone at x3 or higher combo
        if (ctx.state._activeZone && ctx.state._comboMultiplier >= 3) {
            ctx.tryUnlock('combo_zone');
        }

        // Track foods eaten in score zone per wave (for quick_draw) and zone_hunter
        if (ctx.state._activeZone) {
            ctx.runZoneFoodsThisWave = (ctx.runZoneFoodsThisWave || 0) + 1;
            if (ctx.runZoneFoodsThisWave >= 3) {
                ctx.tryUnlock('quick_draw');
            }
            // Zone hunter: eat food in a x3 multiplier zone
            if (ctx.state._activeZone.multiplier >= 3) {
                ctx.tryUnlock('zone_hunter');
            }
        }
    }

    // Reactive music: update combo arpeggio layer on any combo change
    if (ctx.state._ateFood || ctx.state._comboExpired) {
        var currentComboMult = ctx.state._comboExpired ? 0 : (ctx.state._comboMultiplier || 1);
        onMusicComboChange(currentComboMult);
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
        if (ctx.state.endlessWave >= 75) ctx.tryUnlock('deep_space');
        if (ctx.state.endlessWave >= 100) ctx.tryUnlock('century');

        // Speed demon: wave 21+ means speed is at minimum (40ms)
        if (ctx.state.endlessWave >= 21) ctx.tryUnlock('speed_demon');

        // Hunter survivor: survived a wave that had ALPHA active
        if (ctx.prevState.hunter) ctx.tryUnlock('hunter_survivor');

        // Iron will: reach wave 5 without losing a life
        if (ctx.state.endlessWave >= 5) {
            var maxLives = getDifficultyPreset(getSettingsRef().difficulty).livesCount;
            if (ctx.state.lives >= maxLives) ctx.tryUnlock('iron_will');
        }

        // Iron core: reach wave 10 without losing a life
        if (ctx.state.endlessWave >= 10) {
            var maxLivesCore = getDifficultyPreset(getSettingsRef().difficulty).livesCount;
            if (ctx.state.lives >= maxLivesCore) ctx.tryUnlock('iron_core');
        }

        // Pacifist: completed a wave without collecting any power-ups
        if (!ctx.runPowerUpCollectedThisWave) {
            ctx.tryUnlock('pacifist');
        }

        // Purist: reached wave 15 without ever collecting a power-up
        if (ctx.state.endlessWave >= 15 && !ctx.runEverCollectedPowerUp) {
            ctx.tryUnlock('no_power_legend');
        }

        // Wrap survivor: count waves with wrap-around active
        if (ctx.prevState.endlessConfig && ctx.prevState.endlessConfig.wrapAround) {
            ctx.runWrapWaves = (ctx.runWrapWaves || 0) + 1;
            if (ctx.runWrapWaves >= 5) ctx.tryUnlock('wrap_survivor');
        }

        // Alpha dodger: consecutive hunter waves survived
        if (ctx.prevState.hunter) {
            ctx.runConsecutiveHunterWaves = (ctx.runConsecutiveHunterWaves || 0) + 1;
            if (ctx.runConsecutiveHunterWaves >= 3) ctx.tryUnlock('alpha_dodger');
        } else {
            ctx.runConsecutiveHunterWaves = 0;
        }

        // Long haul: check on wave transitions too (accumulated from past sessions)
        var longHaulWaveStats = getStats();
        if (longHaulWaveStats.totalTimePlayed >= 10 * 60 * 1000) ctx.tryUnlock('long_haul');

        // Reset per-wave tracking
        ctx.runPowerUpCollectedThisWave = false;
        ctx.runZoneFoodsThisWave = 0;

        ctx.prevSnake = null;
        ctx.prevHunterSegments = null;
        playLevelUpSound();
        playWaveFanfare(getAudioContext(), getMasterGain(), ctx.state.endlessWave);
        transitionToWave(ctx.state.endlessWave, ctx.state.wallInset || 0);
        var waveConfig = ctx.state.endlessConfig;
        ctx.particleSystem = emitLevelUpShower(ctx.particleSystem, CANVAS_SIZE, waveConfig.color);
        ctx.shakeState = triggerShake(SHAKE_WAVE_UP.intensity, SHAKE_WAVE_UP.duration);
        ctx.hunterTrailHistory = [];

        // Show wave preview overlay — pause game loop while it displays,
        // then grant 3-second invulnerability when the new wave begins.
        if (ctx.setWaveTransitionActive) {
            ctx.setWaveTransitionActive(true);
        }
        showWavePreview(ctx.state.endlessWave, waveConfig.color).then(function() {
            if (ctx.setWaveTransitionActive) {
                ctx.setWaveTransitionActive(false);
            }
            if (ctx.grantWaveStartInvulnerability) {
                ctx.grantWaveStartInvulnerability(WAVE_START_INVINCIBLE_TICKS);
            }
        });

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

    // Reactive music: power-up shimmer layer on/off
    if (ctx.state._collectedPowerUp) {
        onMusicPowerUpActive();
    } else if (ctx.prevState.activePowerUp && !ctx.state.activePowerUp) {
        onMusicPowerUpExpired();
    }

    // Power-up collected: sparkle burst
    if (ctx.state._collectedPowerUp) {
        recordPowerUpCollected();
        // Track per-wave and lifetime power-up collection for achievements
        ctx.runPowerUpCollectedThisWave = true;
        ctx.runEverCollectedPowerUp = true;
        ctx.recordPowerUpTypeCollected(ctx.state._collectedPowerUp);
        // Lifetime power-up count
        var puStats = getStats();
        if (puStats.powerUpsCollected >= 50) ctx.tryUnlock('power_addict');
        // Type collector: all 5 types collected at least once
        var types = ctx.getAllPowerUpTypesCollected();
        if (types.timeSlow && types.ghost && types.shield && types.magnet && types.frenzy) {
            ctx.tryUnlock('type_collector');
        }
        if (ctx.state._collectedPowerUp === 'ghost') ctx.tryUnlock('ghost_rider');
        if (ctx.state._collectedPowerUp === 'timeSlow') ctx.tryUnlock('power_collector');
        var collectedDef = getPowerUpDef(ctx.state._collectedPowerUp);
        if (collectedDef) {
            if (ctx.state._collectedPowerUp === 'magnet') {
                playMagnetCollectSound();
            } else {
                playPowerUpCollectSound();
            }
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

    // Frenzy ended: cleanup message
    if (ctx.state._frenzyEnded) {
        ctx.messageEl.textContent = 'FRENZY OVER';
        ctx.messageEl.className = 'powerup-msg';
        ctx.messageEl.style.color = '#94a3b8';
        setTimeout(function() {
            ctx.messageEl.textContent = '';
            ctx.messageEl.className = '';
            ctx.messageEl.style.color = '';
        }, 1000);
    }

    // Frenzy food collected: particles + popup + achievement tracking
    if (ctx.state._ateFrenzyFood && ctx.state._ateFrenzyFoodPos) {
        ctx.prevSnake = null;
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state._ateFrenzyFoodPos.x, ctx.state._ateFrenzyFoodPos.y, '#f97316', 14, 60, 0.5);
        ctx.shakeState = triggerShake(SHAKE_FOOD.intensity, SHAKE_FOOD.duration);
        ctx.scorePopups = (ctx.scorePopups || []).concat([{
            x: ctx.state._ateFrenzyFoodPos.x * CELL_SIZE + CELL_SIZE / 2,
            y: ctx.state._ateFrenzyFoodPos.y * CELL_SIZE + CELL_SIZE / 2,
            text: 'FRENZY! x3',
            alpha: 1,
            vy: -0.8,
            color: '#f97316',
        }]);
        // Track frenzy food eaten for achievement (all 3 eaten during a single frenzy)
        ctx.frenzyFoodEatenThisFrenzy = (ctx.frenzyFoodEatenThisFrenzy || 0) + 1;
        if (ctx.frenzyFoodEatenThisFrenzy >= 3) {
            ctx.tryUnlock('feeding_frenzy');
        }
    }

    // Reset frenzy food eaten counter when frenzy ends or starts
    if (ctx.state._frenzyEnded || ctx.state._frenzyStarted) {
        ctx.frenzyFoodEatenThisFrenzy = 0;
    }

    // Arena shrink: shake + update music intensity for wall urgency
    if (ctx.state._shrinkOccurred) {
        playShrinkSound();
        ctx.ui.showShrinkMessage();
        ctx.shakeState = triggerShake(SHAKE_SHRINK.intensity, SHAKE_SHRINK.duration);
        var shrinkHunterDist = computeHunterDistance(ctx.state);
        setMusicIntensity(
            ctx.state.endlessWave || 1,
            ctx.state.wallInset || 0,
            ctx.state.snake ? ctx.state.snake.length : 1,
            shrinkHunterDist
        );
        var arenaW = ctx.state.arenaMaxX - ctx.state.arenaMinX + 1;
        var arenaH = ctx.state.arenaMaxY - ctx.state.arenaMinY + 1;
        if (arenaW <= 8 && arenaH <= 8) ctx.tryUnlock('survivor');
        if (arenaW <= 6 && arenaH <= 6) ctx.tryUnlock('close_call');
    }

    // Shield broke: absorbed a lethal hit — dramatic flash + particles
    if (ctx.state._shieldBroke) {
        ctx.recordShieldHit();
        var shieldStats = getStats();
        if (shieldStats.shieldHitsAbsorbed >= 5) ctx.tryUnlock('shield_hero');
        onMusicNearMiss();
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

    // Wave event triggered: play sound stinger and show particles
    if (ctx.state._waveEventEffects) {
        var effectType = ctx.state._waveEventEffects.type;
        if (effectType === 'foodSurgeStart') {
            playWaveEventFoodSurgeSound();
            ctx.shakeState = triggerShake(3, 0.15);
        } else if (effectType === 'speedBurstWarning') {
            playWaveEventSpeedWarningSound();
        } else if (effectType === 'speedBurstStart') {
            playWaveEventSpeedBurstSound();
            ctx.shakeState = triggerShake(4, 0.2);
        } else if (effectType === 'gravityFlip') {
            playWaveEventGravityFlipSound();
            ctx.shakeState = triggerShake(5, 0.25);
            // Flash particles at the food position if it moved
            if (ctx.state.food) {
                ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.food.x, ctx.state.food.y, '#a855f7', 16, 50, 0.5);
            }
        } else if (effectType === 'portalStormStart') {
            playWaveEventPortalStormSound();
            ctx.shakeState = triggerShake(3, 0.15);
            // Particle swirls at storm portal positions
            var stormP = ctx.state._waveEventEffects.stormPortals || [];
            for (var sp = 0; sp < stormP.length; sp++) {
                ctx.particleSystem = emitPortalSwirl(ctx.particleSystem, stormP[sp].a.x, stormP[sp].a.y, '#8b5cf6');
                ctx.particleSystem = emitPortalSwirl(ctx.particleSystem, stormP[sp].b.x, stormP[sp].b.y, '#8b5cf6');
            }
        } else if (effectType === 'goldRushStart') {
            playWaveEventGoldRushSound();
            ctx.shakeState = triggerShake(3, 0.15);
            // Golden burst at current food
            if (ctx.state.food) {
                ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.food.x, ctx.state.food.y, '#fbbf24', 14, 50, 0.5);
            }
        } else if (effectType === 'speedBurstEnd') {
            // Speed returned to normal - brief notification
            ctx.messageEl.textContent = 'SPEED NORMALIZED';
            ctx.messageEl.className = 'powerup-msg';
            ctx.messageEl.style.color = '#94a3b8';
            setTimeout(function() {
                ctx.messageEl.textContent = '';
                ctx.messageEl.className = '';
                ctx.messageEl.style.color = '';
            }, 1000);
        }
    }

    // Bonus food collected (FOOD_SURGE): particles + popup
    if (ctx.state._ateBonusFood && ctx.state._ateBonusFoodPos) {
        ctx.prevSnake = null;
        playBonusFoodSound('golden');
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state._ateBonusFoodPos.x, ctx.state._ateBonusFoodPos.y, '#fbbf24', 14, 60, 0.5);
        ctx.shakeState = triggerShake(SHAKE_FOOD.intensity, SHAKE_FOOD.duration);
        ctx.scorePopups = (ctx.scorePopups || []).concat([{
            x: ctx.state._ateBonusFoodPos.x * CELL_SIZE + CELL_SIZE / 2,
            y: ctx.state._ateBonusFoodPos.y * CELL_SIZE + CELL_SIZE / 2,
            text: 'BONUS!',
            alpha: 1,
            vy: -0.8,
            color: '#fbbf24',
        }]);
    }

    // Teleport: detect by checking if head moved more than 2 cells (skip on wrap-around levels)
    if (!ctx.state.gameOver && ctx.prevState.started && !ctx.config.wrapAround) {
        var headDx = Math.abs(ctx.state.snake[0].x - ctx.prevState.snake[0].x);
        var headDy = Math.abs(ctx.state.snake[0].y - ctx.prevState.snake[0].y);
        if (headDx > 2 || headDy > 2) {
            recordPortalUse();
            playPortalSound();
            ctx.tryUnlock('portal_master');
            // Portal hopper: 10 portals in one run
            ctx.runPortalUses = (ctx.runPortalUses || 0) + 1;
            if (ctx.runPortalUses >= 10) ctx.tryUnlock('portal_hopper');
            var portalColor = ctx.config.portalColor || '#8b5cf6';
            ctx.particleSystem = emitPortalSwirl(ctx.particleSystem, ctx.prevState.snake[0].x, ctx.prevState.snake[0].y, portalColor);
            ctx.particleSystem = emitPortalSwirl(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, portalColor);
        }
    }

    // Death detected: check lives for respawn or game over
    if (ctx.state.gameOver && !ctx.prevState.gameOver) {
        dismissWavePreview();
        ctx.prevSnake = null;
        ctx.prevHunterSegments = null;
        ctx.hunterIntroState = null;

        if (ctx.state.lives > 1) {
            // Life lost: cancel any in-progress wave transition so the game loop
            // doesn't stay frozen (waveTransitionActive = true) permanently.
            if (ctx.setWaveTransitionActive) {
                ctx.setWaveTransitionActive(false);
            }

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

            // Reactive music: start heartbeat layer when down to last life
            onMusicLowHealth(newLives === 1);

            ctx.messageEl.textContent = 'LIFE LOST \u2014 ' + newLives + ' remaining. Arrow keys or swipe to continue';
            ctx.messageEl.className = 'active';
            ctx.messageEl.style.color = '#ef4444';
            return;
        }

        // Final death — true game over
        // Reset frenzy counter so it doesn't carry into the next game
        ctx.frenzyFoodEatenThisFrenzy = 0;
        // Stop all reactive layers before stopping music
        onMusicLowHealth(false);
        onMusicComboChange(0);
        onMusicPowerUpExpired();
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
            ctx.tryUnlock('hunter_bait');
            playHunterKillSound();
            ctx.particleSystem = emitExplosion(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, ctx.config.hunterColor || '#f97316', '#ff2200');
            ctx.shakeState = triggerShake(SHAKE_HUNTER_KILL.intensity, SHAKE_HUNTER_KILL.duration);
        } else {
            playDeathSound();
            ctx.particleSystem = emitExplosion(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, ctx.config.color, '#ef4444');
            ctx.shakeState = triggerShake(SHAKE_DEATH.intensity, SHAKE_DEATH.duration);
        }

        // Long haul: check lifetime time played on death (past sessions only — current session
        // time is added on restart, so this checks previously accumulated time)
        var longHaulStats = getStats();
        if (longHaulStats.totalTimePlayed >= 10 * 60 * 1000) ctx.tryUnlock('long_haul');

        // Completionist: check if all other achievements are now unlocked
        var allUnlocked = ACHIEVEMENTS.filter(function(a) { return a.id !== 'completionist'; }).every(function(a) {
            return isAchievementUnlocked(a.id);
        });
        if (allUnlocked) ctx.tryUnlock('completionist');
    }
}

