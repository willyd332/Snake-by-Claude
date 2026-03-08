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
import { recordGameStart, recordGameTime } from './stats.js';
import { createSpeedrunState, resetSpeedrun } from './speedrun.js';
import { createWaveEventState } from './wave-events.js';

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

export function switchToSettings(g, deps) {
    g.currentScreen = 'settings';
    g.settingsState = createSettingsState();
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function startEndlessMode(g, deps) {
    g.currentScreen = 'gameplay';
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
    g.state = Object.assign({}, g.state, {
        level: 1,
        endlessWave: 1,
        endlessConfig: wave1Config,
        lives: endlessDiffPreset.livesCount,
        waveEvent: createWaveEventState(),
    });

    g.hunterIntroState = null;

    g.speedrunState = resetSpeedrun(g.speedrunState || createSpeedrunState());
    deps.dom.levelLabelEl.textContent = 'Wave:';
    g.gameSessionStartTime = Date.now();
    g.gameSessionEndTime = 0;
    g.runPowerUpsCollected = 0;
    g.runFoodEaten = 0;
    g.runPrevHighScore = g.highScore || 0;
    g.summaryVisible = false;
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
        currentScreen: g.currentScreen, config: config,
        speedrunState: g.speedrunState,
        scorePopups: g.scorePopups,
        messageEl: deps.messageEl, dom: deps.dom, ui: deps.ui,
        tryUnlock: deps.tryUnlock,
        hideGameplayUI: deps.hideGameplayUI,
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
    g.currentScreen = eventCtx.currentScreen;
    g.speedrunState = eventCtx.speedrunState;
    g.scorePopups = eventCtx.scorePopups;
}

// --- Gameplay action helpers ---

export function restartGame(g, deps, newDir) {
    stopMusic();
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

    var restartDiff = getDifficultyPreset(getSettings().difficulty);
    setGridSize(ENDLESS_GRID_SIZE);
    deps.canvas.width = CANVAS_SIZE;
    deps.canvas.height = CANVAS_SIZE;

    var w1Config = getEndlessConfig(1);
    g.state = createInitialState();
    g.state = Object.assign({}, g.state, {
        level: 1,
        endlessWave: 1,
        endlessConfig: w1Config,
        started: true,
        nextDirection: newDir,
        lives: restartDiff.livesCount,
        waveEvent: createWaveEventState(),
    });
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
