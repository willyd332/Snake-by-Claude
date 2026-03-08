'use strict';

import { CANVAS_SIZE, getGridOffset } from './constants.js';
import { createInitialState, getLevelConfig } from './state.js';
import { tick } from './tick.js';
import { render } from './renderer.js';
import { createUI } from './ui.js';
import { setupInput } from './input.js';
import { setupTouch } from './touch.js';
import { getPowerUpDef } from './powerups.js';
import {
    createTitleState, updateTitleState, renderTitleScreen,
    createLevelSelectState, renderLevelSelect,
    renderSettings,
} from './screens.js';
import {
    getSettings, getSettingsRef, createSettingsState, getDifficultyPreset,
} from './settings.js';
import {
    hasPrologueSeen,
    createPrologueState, renderPrologue,
    renderEndingScreen, getUnlockedEndings,
} from './story.js';
import {
    createParticleSystem, updateParticles, renderParticles, emitSparkle,
    createShakeState, updateShake, getShakeOffset,
} from './particles.js';
import { setSoundEnabled, playAchievementSound } from './audio.js';
import {
    getFragmentForLevel, isFragmentCollected,
    renderFragmentOverlay, renderCodex,
} from './fragments.js';
import { createArchiveState, renderArchive } from './archive.js';
import { getEndlessHighScore, getEndlessHighWave } from './endless.js';
import { processPostTickEvents } from './game-events.js';
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
import { createDeathAnimation, createLevelTransition } from './transitions.js';
import { runDeathAnimFrame, runLevelTransitionFrame } from './transition-loop.js';
import {
    createSpeedrunState, renderSpeedrunTimer, renderSplitOverlay, resumeSpeedrunTimer,
    pauseSpeedrunTimer,
} from './speedrun.js';
import { createGameCallbacks } from './game-callbacks.js';

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
};

var messageEl = document.getElementById('message');
var hudEl = document.getElementById('hud');
var titleEl = document.getElementById('title');

// --- Mutable game context (g) ---
// All game state lives here so screen-nav and event-ctx helpers can
// read and write it without closing over individual variables.
var g = {
    // Screen state
    currentScreen: null,
    prologueState: null,
    endingState: null,
    titleState: createTitleState(),
    levelSelectState: createLevelSelectState(),
    codexState: { scrollOffset: 0 },
    archiveState: createArchiveState(),
    fragmentTextState: null,
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
    levelTransition: null,
    levelUpEventCtx: null,
    levelStartTime: 0,
    gameSessionStartTime: 0,
    titleMenuIndex: null,
    speedrunState: createSpeedrunState(),

    // Game state
    state: createInitialState(),
    startingLevel: 1,
    endlessMode: false,
    particleSystem: createParticleSystem(),
    shakeState: createShakeState(),
    prevSnake: null,
    prevHunterSegments: null,
    highScore: parseInt(localStorage.getItem('snake-highscore') || '0', 10),
};

// Initialise screen based on prologue
var showPrologue = !hasPrologueSeen();
g.currentScreen = showPrologue ? 'prologue' : 'title';
g.prologueState = showPrologue ? createPrologueState() : null;

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
    spawnFragmentForLevel: spawnFragmentForLevel,
    updateLivesHUD: updateLivesHUD,
    tryUnlock: tryUnlock,
    checkAllEndings: checkAllEndings,
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

function checkAllEndings() {
    var endings = getUnlockedEndings();
    if (endings.awakening && endings.deletion && endings.loop) {
        tryUnlock('all_endings');
    }
}

// --- Fragment Helpers ---
function spawnFragmentForLevel(level, foodEaten) {
    var fragData = getFragmentForLevel(level);
    if (!fragData) return null;
    if (isFragmentCollected(level)) return null;
    if (foodEaten < fragData.requiresFood) return null;
    var off = getGridOffset();
    return { x: fragData.position.x + off, y: fragData.position.y + off };
}

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

    if (g.currentScreen === 'prologue') {
        renderPrologue(ctx, g.prologueState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (g.currentScreen === 'ending') {
        renderEndingScreen(ctx, g.endingState);
        // Loop ending auto-returns to title after text completes
        if (g.endingState && g.endingState.endingType === 'loop') {
            var endingElapsed = Date.now() - g.endingState.startTime;
            if (endingElapsed > g.endingState.totalDuration + 3000) {
                g.endingState = null;
                switchToTitle(g, navDeps);
            }
        }
        requestAnimationFrame(gameLoop);
        return;
    }

    // Update particles, shake, and matrix rain every frame
    g.particleSystem = updateParticles(g.particleSystem, dt);
    g.shakeState = updateShake(g.shakeState, dt);
    matrixState = updateMatrixState(matrixState, dt);

    if (g.currentScreen === 'title') {
        g.titleState = updateTitleState(g.titleState);
        renderTitleScreen(ctx, g.titleState, g.titleMenuIndex);
        renderDevConsole(ctx);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (g.currentScreen === 'codex') {
        renderCodex(ctx, g.codexState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (g.currentScreen === 'archive') {
        renderArchive(ctx, g.archiveState);
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

    if (g.currentScreen === 'levelSelect') {
        renderLevelSelect(ctx, g.levelSelectState);
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

    // --- Death Replay Mode ---
    if (g.replayState) {
        // Handle skip request from keypress — treat as if replay completed
        if (g.replaySkipRequested) {
            g.replaySkipRequested = false;
            g.replayState = null;
            if (g.replayDeathContext) {
                var skipDeathConfig = getLevelConfig(g.state.level, g.state.endlessConfig);
                g.deathAnimation = createDeathAnimation(
                    g.state.snake,
                    skipDeathConfig.color,
                    g.state._killedByHunter
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
                endlessMode: g.endlessMode,
                highScore: g.highScore,
            });

            g.replayState = replayResult.replayState;

            if (replayResult.done) {
                // Replay finished — start death animation before processing events
                if (g.replayDeathContext) {
                    var deathConfig = getLevelConfig(g.state.level, g.state.endlessConfig);
                    g.deathAnimation = createDeathAnimation(
                        g.state.snake,
                        deathConfig.color,
                        g.state._killedByHunter
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
            endlessMode: g.endlessMode, highScore: g.highScore,
        });
        g.deathAnimation = deathResult.deathAnimation;
        g.particleSystem = deathResult.particleSystem;
        g.shakeState = deathResult.shakeState;

        if (deathResult.done) {
            // Death animation complete — process stashed death events
            if (g.replayDeathContext) {
                processPostTickEvents(g.replayDeathContext);
                applyEventCtx(g, g.replayDeathContext);
                g.replayDeathContext = null;
            }
        } else {
            requestAnimationFrame(gameLoop);
            return;
        }
    }

    // --- Level Transition Mode ---
    if (g.levelTransition) {
        var transResult = runLevelTransitionFrame({
            ctx: ctx, levelTransition: g.levelTransition,
            particleSystem: g.particleSystem, shakeState: g.shakeState,
            gameState: g.state, konamiActivated: konamiRef.value, dom: dom,
            matrixState: matrixState, frameSettings: frameSettings,
            endlessMode: g.endlessMode, highScore: g.highScore,
        });
        g.levelTransition = transResult.levelTransition;
        g.particleSystem = transResult.particleSystem;
        g.shakeState = transResult.shakeState;

        if (transResult.done) {
            // Transition complete — process stashed level-up events
            if (g.levelUpEventCtx) {
                processPostTickEvents(g.levelUpEventCtx);
                applyEventCtx(g, g.levelUpEventCtx);
                g.levelUpEventCtx = null;
                g.speedrunState = resumeSpeedrunTimer(g.speedrunState);
            }
        } else {
            requestAnimationFrame(gameLoop);
            return;
        }
    }

    var elapsed = timestamp - g.state.lastTick;

    if (elapsed >= speed) {
        // Save previous positions for interpolation
        g.prevSnake = g.state.snake;
        g.prevHunterSegments = g.state.hunter ? g.state.hunter.segments : null;

        var prevState = g.state;
        var prevLevel = g.state.level;
        g.state = tick(Object.assign({}, g.state, { lastTick: timestamp }));
        g.state = Object.assign({}, g.state, { lastTick: timestamp });

        // --- Record frame for death replay ---
        if (g.state.started && !g.state.gameOver) {
            g.replayBuffer = recordFrame(g.replayBuffer, g.state);
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
        if (isFinalDeath && g.replayBuffer.frames.length > 0 && !g.replayState) {
            // Stash the death context — replay plays first, then death animation
            g.replayDeathContext = buildEventCtx(g, prevState, prevLevel, config, navDeps);
            g.replayState = startReplay(g.replayBuffer, speed);
        } else if (isFinalDeath && g.replayBuffer.frames.length === 0) {
            // Final death with no replay buffer — go straight to death animation
            var noReplayConfig = getLevelConfig(g.state.level, g.state.endlessConfig);
            g.replayDeathContext = buildEventCtx(g, prevState, prevLevel, config, navDeps);
            g.deathAnimation = createDeathAnimation(
                g.state.snake,
                noReplayConfig.color,
                g.state._killedByHunter
            );
        } else if (!g.endlessMode && g.state.level > prevLevel) {
            // Level-up detected — pause timer at the moment of completion,
            // then start transition animation and defer events.
            g.speedrunState = pauseSpeedrunTimer(g.speedrunState);
            var lvlConfig = getLevelConfig(g.state.level, g.state.endlessConfig);
            var prevConfig = getLevelConfig(prevLevel, null);
            g.levelUpEventCtx = buildEventCtx(g, prevState, prevLevel, config, navDeps);
            g.levelTransition = createLevelTransition(
                prevLevel,
                g.state.level,
                prevState.snake[0],
                lvlConfig.color,
                prevConfig.color,
                g.state.score
            );
        } else {
            // Normal flow: process post-tick events immediately
            var eventCtx = buildEventCtx(g, prevState, prevLevel, config, navDeps);
            processPostTickEvents(eventCtx);
            applyEventCtx(g, eventCtx);
        }

        // Sync canvas dimensions if grid size changed (level transition)
        if (canvas.width !== CANVAS_SIZE) {
            canvas.width = CANVAS_SIZE;
            canvas.height = CANVAS_SIZE;
        }
    }

    // Active power-up sparkle trail (every frame, throttled by particle count)
    if (g.state.activePowerUp && g.state.started && !g.state.gameOver && g.particleSystem.particles.length < 200) {
        var puDef = getPowerUpDef(g.state.activePowerUp.type);
        if (puDef) {
            g.particleSystem = emitSparkle(g.particleSystem, g.state.snake[0].x, g.state.snake[0].y, puDef.glowColor);
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
        highScore: g.endlessMode ? getEndlessHighScore() : g.highScore,
        endlessHighWave: g.endlessMode ? getEndlessHighWave() : 0,
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

    ctx.restore();

    // Speedrun timer overlay (rendered outside shake transform)
    if (g.state.started && !g.state.gameOver && g.speedrunState) {
        renderSpeedrunTimer(ctx, g.speedrunState, true);
        var splitStillShowing = renderSplitOverlay(ctx, g.speedrunState.splitOverlay);
        if (!splitStillShowing && g.speedrunState.splitOverlay) {
            g.speedrunState = Object.assign({}, g.speedrunState, { splitOverlay: null });
        }
    }

    // Fragment text overlay (rendered outside shake transform)
    if (g.fragmentTextState) {
        var stillShowing = renderFragmentOverlay(ctx, g.fragmentTextState);
        if (!stillShowing) {
            g.fragmentTextState = null;
        }
    }

    // ALPHA intro text overlay (rendered outside shake transform)
    // Fade in: 0-500ms, hold: 500-2800ms, fade out: 2800-3500ms
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
