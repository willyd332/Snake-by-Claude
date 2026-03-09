'use strict';

// --- Game Context & Screen Navigation ---
// Manages all screen transitions and the mutable game context object (g).

import { CANVAS_SIZE, setGridSize, ENDLESS_GRID_SIZE } from './constants.js';
import { createInitialState, randomPosition } from './state.js';
import { createParticleSystem, createShakeState } from './particles.js';
import { createTitleState } from './screens.js';
import { createGalleryState } from './achievements.js';
import { getSettings, getDifficultyPreset, createSettingsState } from './settings.js';
import { getEndlessConfig, setEndlessHighScore, setEndlessHighWave } from './endless.js';
import { createReplayBuffer } from './replay.js';
import { playHunterIntroSound } from './audio.js';
import { stopMusic } from './music.js';
import { recordGameStart, recordGameTime, recordBestStreak, recordPowerUpTypeCollected, recordShieldHit, getAllPowerUpTypesCollected } from './stats.js';
import {
    getCurrentStreak, incrementStreak, resetStreak, getStreakBonus,
} from './streak.js';
import { createSpeedrunState, resetSpeedrun } from './speedrun.js';
import { createWaveEventState } from './wave-events.js';
import {
    createModifierScreenState, getActiveModifierIds, getModifierStatePatch,
    computeModifierMultiplier,
} from './modifiers.js';
import { createShopState } from './shop.js';
import { getRunBonus, resetResilienceUsed } from './progression.js';

// --- Screen UI helpers ---

export function showGameplayUI(hudEl, titleEl, messageEl) {
    hudEl.style.display = 'flex';
    if (titleEl) titleEl.style.display = 'block';
    messageEl.style.display = 'block';
}

export function hideGameplayUI(hudEl, titleEl, messageEl) {
    hudEl.style.display = 'none';
    if (titleEl) titleEl.style.display = 'none';
    messageEl.style.display = 'none';
}

// --- Screen navigation ---

export function switchToTitle(g, deps) {
    stopMusic();
    g.waveTransitionActive = false;
    g.currentScreen = 'title';
    g.titleMenuIndex = null;
    setGridSize(20);
    deps.canvas.width = CANVAS_SIZE;
    deps.canvas.height = CANVAS_SIZE;
    deps.dom.levelLabelEl.textContent = 'Wave:';
    g.titleState = createTitleState();
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function switchToGallery(g, deps) {
    g.currentScreen = 'gallery';
    g.galleryState = createGalleryState();
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function switchToModifiers(g, deps) {
    g.currentScreen = 'modifiers';
    g.modifierScreenState = createModifierScreenState();
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function switchToSettings(g, deps) {
    g.currentScreen = 'settings';
    g.settingsState = createSettingsState();
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function switchToShop(g, deps) {
    g.currentScreen = 'shop';
    g.shopState = createShopState();
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function startEndlessMode(g, deps) {
    g.currentScreen = 'gameplay';
    g.waveTransitionActive = false;
    setGridSize(ENDLESS_GRID_SIZE);
    deps.canvas.width = CANVAS_SIZE;
    deps.canvas.height = CANVAS_SIZE;
    showGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
    deps.ui.clearTimers();
    g.particleSystem = createParticleSystem();
    g.shakeState = createShakeState();
    g.headFlashState = null;
    g.prevSnake = null;
    g.prevHunterSegments = null;
    g.hunterTrailHistory = [];
    g.snakeTrailHistory = [];
    g.replayBuffer = createReplayBuffer();
    g.replayState = null;
    g.replaySkipRequested = false;
    g.replayDeathContext = null;
    g.deathAnimation = null;
    g.scorePopups = [];

    var wave1Config = getEndlessConfig(1);
    var endlessDiffPreset = getDifficultyPreset(getSettings().difficulty);

    g.state = createInitialState();
    var modPatch = getModifierStatePatch(getActiveModifierIds());
    g.state = Object.assign({}, g.state, {
        level: 1,
        endlessWave: 1,
        endlessConfig: wave1Config,
        lives: endlessDiffPreset.livesCount,
        waveEvent: createWaveEventState(),
    }, modPatch);
    // One Life modifier overrides lives (already in patch), but ensure it takes effect
    // even if difficulty preset sets more lives
    if (modPatch.lives !== undefined) {
        g.state = Object.assign({}, g.state, { lives: modPatch.lives });
    }

    // Head Start bonus: expand snake to length 5
    if (getRunBonus() === 'head_start') {
        var hsHead = g.state.snake[0];
        g.state = Object.assign({}, g.state, {
            snake: [
                hsHead,
                { x: hsHead.x - 1, y: hsHead.y },
                { x: hsHead.x - 2, y: hsHead.y },
                { x: hsHead.x - 3, y: hsHead.y },
                { x: hsHead.x - 4, y: hsHead.y },
            ],
        });
    }

    // Resilience: reset used flag at start of each session
    resetResilienceUsed();

    g.hunterIntroState = null;
    g.bossIntroState = null;

    g.speedrunState = resetSpeedrun(g.speedrunState || createSpeedrunState());
    deps.dom.levelLabelEl.textContent = 'Wave:';
    g.gameSessionStartTime = Date.now();
    g.gameSessionEndTime = 0;
    g.runPowerUpsCollected = 0;
    g.runFoodEaten = 0;
    g.runPrevHighScore = g.highScore || 0;
    g.summaryVisible = false;
    g.runPortalUses = 0;
    g.runWrapWaves = 0;
    g.runNoPowerUpWaves = 0;
    g.runPowerUpCollectedThisWave = false;
    g.runConsecutiveHunterWaves = 0;
    g.runEverCollectedPowerUp = false;
    g.runZoneFoodsThisWave = 0;
    resetStreak();
    g.streakRingEmitted = false;
    g.frenzyFoodEatenThisFrenzy = 0;
    recordGameStart();
    deps.updateLivesHUD(endlessDiffPreset.livesCount);

    deps.messageEl.textContent = 'Swipe or press arrow to begin';
    deps.messageEl.className = '';
    deps.messageEl.style.color = '';

    // Start ambient music (will init on first user gesture)
    stopMusic();
}

// --- Event context helpers ---

export function buildEventCtx(g, prevState, prevLevel, config, deps) {
    return {
        state: g.state, prevState: prevState, prevLevel: prevLevel,
        prevSnake: g.prevSnake, prevHunterSegments: g.prevHunterSegments,
        hunterTrailHistory: g.hunterTrailHistory,
        particleSystem: g.particleSystem, shakeState: g.shakeState,
        headFlashState: g.headFlashState,
        highScore: g.highScore,
        hunterIntroState: g.hunterIntroState,
        bossIntroState: g.bossIntroState,
        currentScreen: g.currentScreen, config: config,
        speedrunState: g.speedrunState,
        scorePopups: g.scorePopups,
        messageEl: deps.messageEl, dom: deps.dom, ui: deps.ui,
        tryUnlock: deps.tryUnlock,
        hideGameplayUI: deps.hideGameplayUI,
        // Per-run tracking for new achievements
        runPortalUses: g.runPortalUses || 0,
        runWrapWaves: g.runWrapWaves || 0,
        runNoPowerUpWaves: g.runNoPowerUpWaves || 0,
        runPowerUpCollectedThisWave: g.runPowerUpCollectedThisWave || false,
        runConsecutiveHunterWaves: g.runConsecutiveHunterWaves || 0,
        runEverCollectedPowerUp: g.runEverCollectedPowerUp || false,
        runFoodEaten: g.runFoodEaten || 0,
        runZoneFoodsThisWave: g.runZoneFoodsThisWave || 0,
        frenzyFoodEatenThisFrenzy: g.frenzyFoodEatenThisFrenzy || 0,
        recordPowerUpTypeCollected: recordPowerUpTypeCollected,
        recordShieldHit: recordShieldHit,
        getAllPowerUpTypesCollected: getAllPowerUpTypesCollected,
        // Wave transition: callbacks that directly update the mutable game context
        setWaveTransitionActive: function(active) { g.waveTransitionActive = active; },
        grantWaveStartInvulnerability: function(ticks) {
            if (!g.waveTransitionActive) return; // transition was cancelled (death or restart)
            g.state = Object.assign({}, g.state, { invincibleTicks: ticks });
        },
    };
}

export function applyEventCtx(g, eventCtx) {
    g.state = eventCtx.state;
    g.prevSnake = eventCtx.prevSnake;
    g.prevHunterSegments = eventCtx.prevHunterSegments;
    g.hunterTrailHistory = eventCtx.hunterTrailHistory;
    g.particleSystem = eventCtx.particleSystem;
    g.shakeState = eventCtx.shakeState;
    g.headFlashState = eventCtx.headFlashState;
    g.highScore = eventCtx.highScore;
    g.hunterIntroState = eventCtx.hunterIntroState;
    g.bossIntroState = eventCtx.bossIntroState;
    g.currentScreen = eventCtx.currentScreen;
    g.speedrunState = eventCtx.speedrunState;
    g.scorePopups = eventCtx.scorePopups;
    g.runPortalUses = eventCtx.runPortalUses;
    g.runWrapWaves = eventCtx.runWrapWaves;
    g.runNoPowerUpWaves = eventCtx.runNoPowerUpWaves;
    g.runPowerUpCollectedThisWave = eventCtx.runPowerUpCollectedThisWave;
    g.runConsecutiveHunterWaves = eventCtx.runConsecutiveHunterWaves;
    g.runEverCollectedPowerUp = eventCtx.runEverCollectedPowerUp;
    g.runFoodEaten = eventCtx.runFoodEaten;
    g.runZoneFoodsThisWave = eventCtx.runZoneFoodsThisWave;
    g.frenzyFoodEatenThisFrenzy = eventCtx.frenzyFoodEatenThisFrenzy;
}

// --- Gameplay action helpers ---

export function restartGame(g, deps, newDir) {
    stopMusic();
    g.waveTransitionActive = false;
    if (g.gameSessionStartTime > 0) {
        recordGameTime(Date.now() - g.gameSessionStartTime);
        g.gameSessionStartTime = 0;
        g.gameSessionEndTime = 0;
    }
    setEndlessHighScore(g.state.score);
    setEndlessHighWave(g.state.endlessWave);
    if (g.state.score > g.highScore) {
        g.highScore = g.state.score;
        if (deps.dom && deps.dom.highScoreEl) {
            deps.dom.highScoreEl.textContent = g.highScore;
        }
    }

    g.speedrunState = resetSpeedrun(g.speedrunState || createSpeedrunState());
    deps.ui.clearTimers();
    g.particleSystem = createParticleSystem();
    g.shakeState = createShakeState();
    g.headFlashState = null;
    g.prevSnake = null;
    g.prevHunterSegments = null;
    g.hunterIntroState = null;
    g.bossIntroState = null;
    g.hunterTrailHistory = [];
    g.snakeTrailHistory = [];
    g.replayBuffer = createReplayBuffer();
    g.replayState = null;
    g.replaySkipRequested = false;
    g.replayDeathContext = null;
    g.deathAnimation = null;
    g.scorePopups = [];
    g.runPowerUpsCollected = 0;
    g.runFoodEaten = 0;
    g.runPrevHighScore = g.highScore || 0;
    g.summaryVisible = false;
    g.runPortalUses = 0;
    g.runWrapWaves = 0;
    g.runNoPowerUpWaves = 0;
    g.runPowerUpCollectedThisWave = false;
    g.runConsecutiveHunterWaves = 0;
    g.runEverCollectedPowerUp = false;
    g.runZoneFoodsThisWave = 0;

    var restartDiff = getDifficultyPreset(getSettings().difficulty);
    setGridSize(ENDLESS_GRID_SIZE);
    deps.canvas.width = CANVAS_SIZE;
    deps.canvas.height = CANVAS_SIZE;

    var newStreak = incrementStreak();
    recordBestStreak(newStreak);
    var streakBonus = getStreakBonus(newStreak);
    g.streakRingEmitted = false;
    g.frenzyFoodEatenThisFrenzy = 0;

    if (newStreak >= 5 && deps.tryUnlock) {
        deps.tryUnlock('relentless');
    }
    if (newStreak >= 10 && deps.tryUnlock) {
        deps.tryUnlock('possessed');
    }

    var w1Config = getEndlessConfig(1);
    var restartModPatch = getModifierStatePatch(getActiveModifierIds());
    g.state = createInitialState();
    g.state = Object.assign({}, g.state, {
        level: 1,
        endlessWave: 1,
        endlessConfig: w1Config,
        started: true,
        nextDirection: newDir,
        lives: restartDiff.livesCount,
        waveEvent: createWaveEventState(),
        score: streakBonus,
    }, restartModPatch);
    if (restartModPatch.lives !== undefined) {
        g.state = Object.assign({}, g.state, { lives: restartModPatch.lives });
    }

    // Head Start bonus: expand snake to length 5
    if (getRunBonus() === 'head_start') {
        var restartHsHead = g.state.snake[0];
        g.state = Object.assign({}, g.state, {
            snake: [
                restartHsHead,
                { x: restartHsHead.x - 1, y: restartHsHead.y },
                { x: restartHsHead.x - 2, y: restartHsHead.y },
                { x: restartHsHead.x - 3, y: restartHsHead.y },
                { x: restartHsHead.x - 4, y: restartHsHead.y },
            ],
        });
    }

    // Resilience: reset used flag at start of each session
    resetResilienceUsed();

    g.state = Object.assign({}, g.state, {
        food: randomPosition(g.state.snake, g.state.walls, g.state.obstacles, g.state.portals, g.state.powerUp, g.state.hunter),
    });
    deps.updateLivesHUD(restartDiff.livesCount);
    deps.messageEl.textContent = '';
    deps.messageEl.className = '';
    deps.messageEl.style.color = '';
}

export function goToTitle(g, deps) {
    if (g.gameSessionStartTime > 0) {
        recordGameTime(Date.now() - g.gameSessionStartTime);
        g.gameSessionStartTime = 0;
        g.gameSessionEndTime = 0;
    }
    setEndlessHighScore(g.state.score);
    setEndlessHighWave(g.state.endlessWave);
    if (g.state.score > g.highScore) {
        g.highScore = g.state.score;
        if (deps.dom && deps.dom.highScoreEl) {
            deps.dom.highScoreEl.textContent = g.highScore;
        }
    }
    resetStreak();
    switchToTitle(g, deps);
}

export function onRestartLevel(g, deps) {
    if (g.gameSessionStartTime > 0) {
        recordGameTime(Date.now() - g.gameSessionStartTime);
        g.gameSessionStartTime = 0;
        g.gameSessionEndTime = 0;
    }
    setEndlessHighScore(g.state.score);
    setEndlessHighWave(g.state.endlessWave);
    if (g.state.score > g.highScore) {
        g.highScore = g.state.score;
        if (deps.dom && deps.dom.highScoreEl) {
            deps.dom.highScoreEl.textContent = g.highScore;
        }
    }
    startEndlessMode(g, deps);
}
