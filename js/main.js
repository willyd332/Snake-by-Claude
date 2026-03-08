'use strict';

import { CANVAS_SIZE } from './constants.js';
import { createInitialState, getLevelConfig } from './state.js';
import { tick } from './tick.js';
import { render, renderScorePopups } from './renderer.js';
import { createUI } from './ui.js';
import { setupInput } from './input.js';
import { setupTouch } from './touch.js';
import { getPowerUpDef } from './powerups.js';
import {
    createTitleState, updateTitleState, renderTitleScreen,
    renderSettings,
} from './screens.js';
import {
    getSettings, getSettingsRef, createSettingsState, getDifficultyPreset,
} from './settings.js';
import {
    createParticleSystem, updateParticles, renderParticles, emitSparkle,
    createShakeState, updateShake, getShakeOffset,
} from './particles.js';
import { setSoundEnabled, playAchievementSound } from './audio.js';
import { getEndlessHighScore, getEndlessHighWave } from './endless.js';
import { processPostTickEvents, computeHunterDistance } from './game-events.js';
import { setMusicIntensity, onMusicHunterProximity } from './music.js';
import {
    createReplayBuffer, recordFrame, startReplay,
} from './replay.js';
import {
    applyInvertFilter,
    createMatrixState, updateMatrixState, renderMatrixRain, renderDevConsole,
} from './secrets.js';
import {
    unlockAchievement, createPopupState, renderPopup,
    createGalleryState, renderGallery,
} from './achievements.js';
import {
    hideGameplayUI,
    switchToTitle,
    buildEventCtx, applyEventCtx,
} from './game-context.js';
import { runReplayFrame } from './replay-loop.js';
import { createDeathAnimation } from './transitions.js';
import { runDeathAnimFrame } from './transition-loop.js';
import {
    createSpeedrunState, renderSpeedrunTimer, renderSplitOverlay, resumeSpeedrunTimer,
} from './speedrun.js';
import { createGameCallbacks } from './game-callbacks.js';
import { showRunSummary } from './run-summary.js';
import { isSpeedBurstActive, SPEED_BURST_MULTIPLIER } from './wave-events.js';
import { getCurrentStreak, getStreakBonus, STREAK_VISUAL_THRESHOLD } from './streak.js';
import { emitStreakRing } from './particles.js';

// --- Canvas setup ---
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

// Apply persisted invert filter on load
applyInvertFilter(canvas);

// --- DOM references ---
var dom = {
    scoreEl: document.getElementById('score'),
    levelEl: document.getElementById('level'),
    highScoreEl: document.getElementById('highScore'),
    powerUpHudEl: document.getElementById('powerUpHud'),
    powerUpNameEl: document.getElementById('powerUpName'),
    arenaHudEl: document.getElementById('arenaHud'),
    arenaSizeEl: document.getElementById('arenaSize'),
    levelLabelEl: document.getElementById('levelLabel'),
    livesHudEl: document.getElementById('livesHud'),
    livesEl: document.getElementById('lives'),
    comboHudEl: document.getElementById('comboHud'),
    comboLabelEl: document.getElementById('comboLabel'),
    streakHudEl: document.getElementById('streakHud'),
    streakLabelEl: document.getElementById('streakLabel'),
};

var messageEl = document.getElementById('message');
var hudEl = document.getElementById('hud');
var titleEl = document.getElementById('title');

// --- Mutable game context (g) ---
var g = {
    // Screen state
    currentScreen: 'title',
    titleState: createTitleState(),
    hunterIntroState: null,
    hunterTrailHistory: [],
    achievementPopup: null,
    achievementPopupQueue: [],
    galleryState: createGalleryState(),
    settingsState: createSettingsState(),
    snakeTrailHistory: [],
    replayBuffer: createReplayBuffer(),
    replayState: null,
    replaySkipRequested: false,
    replayDeathContext: null,
    deathAnimation: null,
    titleMenuIndex: null,
    speedrunState: createSpeedrunState(),
    gameSessionStartTime: 0,
    gameSessionEndTime: 0,
    runPowerUpsCollected: 0,
    runFoodEaten: 0,
    runPrevHighScore: 0,
    summaryVisible: false,
    waveTransitionActive: false,
    streakRingEmitted: false,

    // Game state
    state: createInitialState(),
    particleSystem: createParticleSystem(),
    shakeState: createShakeState(),
    headFlashState: null,
    prevSnake: null,
    prevHunterSegments: null,
    highScore: parseInt(localStorage.getItem('snake-endless-highscore') || '0', 10),
    scorePopups: [],
};

var matrixState = createMatrixState();
var lastFrameTime = 0;
var konamiRef = { value: localStorage.getItem('snake-konami') === 'true' };

dom.highScoreEl.textContent = g.highScore;

// Apply persisted settings on load
var initSettings = getSettings();
setSoundEnabled(initSettings.sound);

// --- UI ---
var ui = createUI(messageEl);

// --- DOM bundle passed to screen-nav helpers ---
var navDeps = {
    canvas: canvas,
    dom: dom,
    hudEl: hudEl,
    titleEl: titleEl,
    messageEl: messageEl,
    ui: ui,
    updateLivesHUD: updateLivesHUD,
    tryUnlock: tryUnlock,
    hideGameplayUI: function() { hideGameplayUI(hudEl, titleEl, messageEl); },
};

// --- Achievement Helpers ---
function tryUnlock(id) {
    var ach = unlockAchievement(id);
    if (ach) {
        g.achievementPopupQueue.push(createPopupState(ach));
        playAchievementSound();
    }
}

// --- Lives HUD ---
function updateLivesHUD(lives) {
    if (dom.livesEl) {
        dom.livesEl.textContent = lives;
    }
    if (dom.livesHudEl) {
        var maxLives = getDifficultyPreset(getSettings().difficulty).livesCount;
        dom.livesHudEl.style.display = lives < maxLives ? 'inline' : 'none';
    }
}

// --- Input callbacks ---
var gameCallbacks = createGameCallbacks(g, navDeps, hudEl, titleEl, messageEl, canvas, konamiRef, tryUnlock);

setupInput(gameCallbacks);
setupTouch(canvas, gameCallbacks);

// --- Game loop ---
function gameLoop(timestamp) {
    var dt = lastFrameTime > 0 ? (timestamp - lastFrameTime) / 1000 : 0.016;
    dt = Math.min(dt, 0.05); // cap delta to avoid huge jumps
    lastFrameTime = timestamp;

    // Update particles, shake, head flash, matrix rain, and score popups every frame
    g.particleSystem = updateParticles(g.particleSystem, dt);
    g.shakeState = updateShake(g.shakeState, dt);
    if (g.headFlashState && g.headFlashState.remaining > 0) {
        g.headFlashState = { remaining: g.headFlashState.remaining - dt, duration: g.headFlashState.duration, color: g.headFlashState.color };
        if (g.headFlashState.remaining <= 0) {
            g.headFlashState = null;
        }
    }
    matrixState = updateMatrixState(matrixState, dt);
    if (g.scorePopups && g.scorePopups.length > 0) {
        g.scorePopups = g.scorePopups
            .map(function(p) { return { x: p.x, y: p.y + p.vy, text: p.text, alpha: p.alpha - dt * 1.2, vy: p.vy, color: p.color }; })
            .filter(function(p) { return p.alpha > 0; });
    }

    if (g.currentScreen === 'title') {
        g.titleState = updateTitleState(g.titleState);
        renderTitleScreen(ctx, g.titleState, g.titleMenuIndex);
        renderDevConsole(ctx);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (g.currentScreen === 'gallery') {
        renderGallery(ctx, g.galleryState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (g.currentScreen === 'settings') {
        renderSettings(ctx, g.settingsState);
        requestAnimationFrame(gameLoop);
        return;
    }

    // When summary overlay is visible, idle the loop
    if (g.summaryVisible) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Gameplay
    var config = getLevelConfig(g.state.level, g.state.endlessConfig);
    var frameSettings = getSettingsRef();
    var gameplayDiff = getDifficultyPreset(frameSettings.difficulty);
    var speed = Math.round(config.speed * gameplayDiff.speedMult);

    if (g.state.activePowerUp && g.state.activePowerUp.type === 'timeSlow') {
        speed = speed * 2;
    }
    if (g.state.activePowerUp && g.state.activePowerUp.type === 'speedBoost') {
        speed = Math.round(speed / 1.5);
    }
    if (g.state.activePowerUp && g.state.activePowerUp.type === 'frenzy') {
        speed = Math.round(speed / 2);
    }
    // Wave event: SPEED_BURST increases speed by multiplier
    if (g.state.waveEvent && isSpeedBurstActive(g.state.waveEvent)) {
        speed = Math.round(speed / SPEED_BURST_MULTIPLIER);
    }

    // --- Death Replay Mode ---
    if (g.replayState) {
        // Handle skip request from keypress
        if (g.replaySkipRequested) {
            g.replaySkipRequested = false;
            g.replayState = null;
            if (g.replayDeathContext) {
                var skipDeathConfig = getLevelConfig(g.state.level, g.state.endlessConfig);
                g.deathAnimation = createDeathAnimation(
                    g.state.snake,
                    skipDeathConfig.color,
                    g.state._killedByHunter,
                    g.state._deathCause
                );
            }
        } else {
            var replayResult = runReplayFrame({
                ctx: ctx,
                replayState: g.replayState,
                timestamp: timestamp,
                speed: speed,
                config: config,
                gameState: g.state,
                konamiActivated: konamiRef.value,
                dom: dom,
                matrixState: matrixState,
                particleSystem: g.particleSystem,
                shakeState: g.shakeState,
                frameSettings: frameSettings,
                highScore: g.highScore,
            });

            g.replayState = replayResult.replayState;

            if (replayResult.done) {
                if (g.replayDeathContext) {
                    var deathConfig = getLevelConfig(g.state.level, g.state.endlessConfig);
                    g.deathAnimation = createDeathAnimation(
                        g.state.snake,
                        deathConfig.color,
                        g.state._killedByHunter,
                        g.state._deathCause
                    );
                }
            } else {
                requestAnimationFrame(gameLoop);
                return;
            }
        }
    }

    // --- Death Animation Mode ---
    if (g.deathAnimation) {
        var deathResult = runDeathAnimFrame({
            ctx: ctx, deathAnimation: g.deathAnimation,
            particleSystem: g.particleSystem, shakeState: g.shakeState,
            gameState: g.state, konamiActivated: konamiRef.value, dom: dom,
            matrixState: matrixState, frameSettings: frameSettings,
            highScore: g.highScore,
        });
        g.deathAnimation = deathResult.deathAnimation;
        g.particleSystem = deathResult.particleSystem;
        g.shakeState = deathResult.shakeState;

        if (deathResult.done) {
            if (g.replayDeathContext) {
                var deathCtxState = g.replayDeathContext.state;
                var summaryDeathCause = deathCtxState._deathCause;
                var summaryKilledByHunter = deathCtxState._killedByHunter;
                var summaryWave = deathCtxState.endlessWave || 1;
                var summaryScore = deathCtxState.score || 0;
                var summarySnakeLength = deathCtxState.snake ? deathCtxState.snake.length : 1;
                var summaryFoodEaten = g.runFoodEaten;
                var summaryPowerUps = g.runPowerUpsCollected;
                var summaryTimeAliveMs = g.gameSessionStartTime > 0 ? (g.gameSessionEndTime || Date.now()) - g.gameSessionStartTime : 0;
                var summaryPrevHighScore = g.runPrevHighScore;

                processPostTickEvents(g.replayDeathContext);
                applyEventCtx(g, g.replayDeathContext);
                g.replayDeathContext = null;

                g.summaryVisible = true;
                showRunSummary(
                    {
                        wave: summaryWave,
                        score: summaryScore,
                        snakeLength: summarySnakeLength,
                        timeAliveMs: summaryTimeAliveMs,
                        foodEaten: summaryFoodEaten,
                        deathCause: summaryDeathCause,
                        killedByHunter: summaryKilledByHunter,
                        powerUpsCollected: summaryPowerUps,
                        highScore: g.highScore,
                        previousHighScore: summaryPrevHighScore,
                        currentStreak: getCurrentStreak(),
                    },
                    function() { g.summaryVisible = false; gameCallbacks.restartGame({ x: 1, y: 0 }); },
                    function() { g.summaryVisible = false; gameCallbacks.goToTitle(); }
                );
            }
        } else {
            requestAnimationFrame(gameLoop);
            return;
        }
    }

    var elapsed = timestamp - g.state.lastTick;

    // Pause game tick processing while wave transition overlay is showing
    if (g.waveTransitionActive) {
        // Keep lastTick current so the snake doesn't lurch forward on resume
        g.state = Object.assign({}, g.state, { lastTick: timestamp });
        elapsed = 0;
    }

    if (elapsed >= speed) {
        // Save previous positions for interpolation
        g.prevSnake = g.state.snake;
        g.prevHunterSegments = g.state.hunter ? g.state.hunter.segments : null;

        var prevState = g.state;
        var prevLevel = g.state.level;
        g.state = tick(Object.assign({}, g.state, { lastTick: timestamp }));

        // --- Record frame for death replay ---
        if (g.state.started && !g.state.gameOver) {
            g.replayBuffer = recordFrame(g.replayBuffer, g.state, g.state.direction);
        }

        // --- Per-run stat tracking ---
        if (g.state._ateFood) {
            g.runFoodEaten = g.runFoodEaten + 1;
        }
        if (g.state._collectedPowerUp) {
            g.runPowerUpsCollected = g.runPowerUpsCollected + 1;
        }

        // --- Streak ring particle burst on first tick of a new run ---
        if (g.state.started && !g.streakRingEmitted) {
            var streak = getCurrentStreak();
            if (streak >= STREAK_VISUAL_THRESHOLD) {
                g.particleSystem = emitStreakRing(g.particleSystem, CANVAS_SIZE, '#f97316');
            }
            g.streakRingEmitted = true;
        }

        // --- Hunter Trail Tracking ---
        if (g.state.hunter && !g.state.gameOver) {
            g.hunterTrailHistory = [g.state.hunter.segments[0]].concat(g.hunterTrailHistory.slice(0, 2));
        }

        // --- Snake Trail Tracking ---
        if (g.state.started && !g.state.gameOver && g.prevSnake) {
            var tail = g.prevSnake[g.prevSnake.length - 1];
            g.snakeTrailHistory = [tail].concat(g.snakeTrailHistory.slice(0, 7));
        }

        // Check for final death — start replay instead of immediate game-over
        var isFinalDeath = g.state.gameOver && !prevState.gameOver && g.state.lives <= 1;
        if (isFinalDeath) {
            g.gameSessionEndTime = Date.now();
        }
        if (isFinalDeath && g.replayBuffer.frames.length > 0 && !g.replayState) {
            g.scorePopups = [];
            g.replayDeathContext = buildEventCtx(g, prevState, prevLevel, config, navDeps);
            g.replayState = startReplay(g.replayBuffer, speed);
        } else if (isFinalDeath && g.replayBuffer.frames.length === 0) {
            var noReplayConfig = getLevelConfig(g.state.level, g.state.endlessConfig);
            g.replayDeathContext = buildEventCtx(g, prevState, prevLevel, config, navDeps);
            g.deathAnimation = createDeathAnimation(
                g.state.snake,
                noReplayConfig.color,
                g.state._killedByHunter,
                g.state._deathCause
            );
        } else {
            // Normal flow: process post-tick events immediately
            var eventCtx = buildEventCtx(g, prevState, prevLevel, config, navDeps);
            processPostTickEvents(eventCtx);
            applyEventCtx(g, eventCtx);
        }

        // --- Per-tick adaptive music update ---
        // Updates music intensity based on current game state (snake length,
        // hunter proximity) for smooth real-time adaptation.
        if (g.state.started && !g.state.gameOver) {
            var tickHunterDist = computeHunterDistance(g.state);
            setMusicIntensity(
                g.state.endlessWave || 1,
                g.state.wallInset || 0,
                g.state.snake ? g.state.snake.length : 1,
                tickHunterDist
            );
            // Reactive music: hunter proximity pulsing bass layer
            onMusicHunterProximity(tickHunterDist);
        }

        // Sync canvas dimensions if grid size changed
        if (canvas.width !== CANVAS_SIZE) {
            canvas.width = CANVAS_SIZE;
            canvas.height = CANVAS_SIZE;
        }
    }

    // Active power-up sparkle trail (every frame, throttled by particle count)
    if (g.state.activePowerUp && g.state.started && !g.state.gameOver && g.particleSystem.particles.length < 200) {
        var puDef = getPowerUpDef(g.state.activePowerUp.type);
        if (puDef) {
            // Frenzy: emit more intense trail along entire snake body
            if (g.state.activePowerUp.type === 'frenzy') {
                var frenzyTrailSeg = Math.floor(Math.random() * Math.min(g.state.snake.length, 4));
                var frenzyColors = ['#ef4444', '#f97316', '#fbbf24'];
                var frenzyColor = frenzyColors[Math.floor(Math.random() * frenzyColors.length)];
                g.particleSystem = emitSparkle(g.particleSystem, g.state.snake[frenzyTrailSeg].x, g.state.snake[frenzyTrailSeg].y, frenzyColor);
            } else {
                g.particleSystem = emitSparkle(g.particleSystem, g.state.snake[0].x, g.state.snake[0].y, puDef.glowColor);
            }
        }
    }

    // Compute interpolation progress for smooth animation
    var tickProgress = 0;
    if (g.state.started && !g.state.gameOver && g.prevSnake && g.state.lastTick > 0) {
        tickProgress = Math.min((timestamp - g.state.lastTick) / speed, 1);
    }
    var interp = {
        progress: tickProgress,
        prevSnake: g.prevSnake,
        prevHunter: g.prevHunterSegments,
        hunterTrail: g.hunterTrailHistory,
        trailHistory: g.snakeTrailHistory,
        highScore: getEndlessHighScore(),
        endlessHighWave: getEndlessHighWave(),
        headFlashState: g.headFlashState,
        currentStreak: getCurrentStreak(),
        streakBonus: getStreakBonus(getCurrentStreak()),
    };

    // Apply screen shake (respects settings)
    var offset = frameSettings.screenShake ? getShakeOffset(g.shakeState) : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(offset.x, offset.y);

    render(ctx, g.state, konamiRef.value, dom, interp);
    renderMatrixRain(ctx, matrixState);
    if (frameSettings.particles) {
        renderParticles(ctx, g.particleSystem);
    }
    if (g.state.started && !g.replayState && !g.deathAnimation) {
        renderScorePopups(ctx, g.scorePopups);
    }

    ctx.restore();

    // Speedrun timer overlay (rendered outside shake transform)
    if (g.state.started && !g.state.gameOver && g.speedrunState) {
        renderSpeedrunTimer(ctx, g.speedrunState, true);
        var splitStillShowing = renderSplitOverlay(ctx, g.speedrunState.splitOverlay);
        if (!splitStillShowing && g.speedrunState.splitOverlay) {
            g.speedrunState = Object.assign({}, g.speedrunState, { splitOverlay: null });
        }
    }

    // ALPHA intro text overlay (rendered outside shake transform)
    if (g.hunterIntroState) {
        var introElapsed = Date.now() - g.hunterIntroState.startTime;
        if (introElapsed >= 0 && introElapsed < 3500) {
            var introFade = introElapsed < 500
                ? introElapsed / 500
                : introElapsed > 2800
                    ? 1 - (introElapsed - 2800) / 700
                    : 1;
            ctx.save();
            ctx.globalAlpha = introFade * 0.9;
            ctx.textAlign = 'center';
            ctx.font = 'bold 11px Courier New';
            ctx.fillStyle = '#f97316';
            ctx.fillText(g.hunterIntroState.text, CANVAS_SIZE / 2, 30);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
            ctx.restore();
        } else if (introElapsed >= 3500) {
            g.hunterIntroState = null;
        }
    }

    // Achievement popup (rendered outside shake transform, on all gameplay screens)
    if (!g.achievementPopup && g.achievementPopupQueue.length > 0) {
        g.achievementPopup = g.achievementPopupQueue.shift();
    }
    if (g.achievementPopup) {
        var popupActive = renderPopup(ctx, g.achievementPopup);
        if (!popupActive) {
            g.achievementPopup = null;
        }
    }

    requestAnimationFrame(gameLoop);
}

// --- Start on title screen ---
hideGameplayUI(hudEl, titleEl, messageEl);
requestAnimationFrame(gameLoop);
