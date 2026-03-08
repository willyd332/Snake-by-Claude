'use strict';

// --- Game Context & Screen Navigation ---
// Manages all screen transitions and the mutable game context object (g).
// Receives a reference to the shared mutable game state container `g` and
// returns functions bound to it. Follows the same context-passing pattern
// used by game-events.js (processPostTickEvents).

import { CANVAS_SIZE, MAX_LEVEL, setGridSize, LEVEL_GRID_SIZE, ENDLESS_GRID_SIZE } from './constants.js';
import { createInitialState, randomPosition } from './state.js';
import { createParticleSystem, createShakeState } from './particles.js';
import { createTitleState, createLevelSelectState, getHighestLevel } from './screens.js';
import { createArchiveState } from './archive.js';
import { createGalleryState } from './achievements.js';
import { getSettings, getDifficultyPreset, createSettingsState } from './settings.js';
import { generateWalls, filterWallsFromSnake, generateObstacles, generatePortals } from './levels.js';
import { generateHunter } from './hunter.js';
import { getEndlessConfig, setEndlessHighScore, setEndlessHighWave } from './endless.js';
import { createReplayBuffer } from './replay.js';
import { playHunterIntroSound } from './audio.js';
import { recordGameStart, recordGameTime } from './stats.js';
import { createSpeedrunState, resetSpeedrun } from './speedrun.js';

// --- Screen UI helpers ---
// These are exported so game-loop code can reference them directly.

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
// Each function takes the mutable game context `g` plus any DOM refs needed.

export function switchToTitle(g, deps) {
    g.currentScreen = 'title';
    g.endlessMode = false;
    g.titleMenuIndex = null;
    setGridSize(20);
    deps.canvas.width = CANVAS_SIZE;
    deps.canvas.height = CANVAS_SIZE;
    deps.dom.levelLabelEl.textContent = 'Level:';
    g.titleState = createTitleState();
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function switchToCodex(g, deps) {
    g.currentScreen = 'codex';
    g.codexState = { scrollOffset: 0 };
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function switchToArchive(g, deps, initialTab) {
    g.currentScreen = 'archive';
    g.archiveState = createArchiveState(initialTab || 0);
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

export function switchToLevelSelect(g, deps) {
    g.currentScreen = 'levelSelect';
    g.levelSelectState = Object.assign({}, createLevelSelectState(), {
        selectedLevel: Math.min(getHighestLevel(), MAX_LEVEL),
    });
    hideGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
}

export function startGameAtLevel(g, deps, level) {
    g.currentScreen = 'gameplay';
    g.endlessMode = false;
    g.startingLevel = level;
    setGridSize(LEVEL_GRID_SIZE[level] || 20);
    deps.canvas.width = CANVAS_SIZE;
    deps.canvas.height = CANVAS_SIZE;
    showGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
    deps.ui.clearTimers();
    g.particleSystem = createParticleSystem();
    g.shakeState = createShakeState();
    g.prevSnake = null;
    g.prevHunterSegments = null;
    g.hunterTrailHistory = [];
    g.snakeTrailHistory = [];
    g.replayBuffer = createReplayBuffer();
    g.replayState = null;
    g.replayDeathContext = null;
    g.deathAnimation = null;
    g.levelTransition = null;
    g.levelUpEventCtx = null;

    var diffPreset = getDifficultyPreset(getSettings().difficulty);
    g.state = createInitialState();
    g.state = Object.assign({}, g.state, {
        level: level,
        walls: filterWallsFromSnake(generateWalls(level), g.state.snake),
        obstacles: generateObstacles(level),
        portals: generatePortals(level),
        hunter: generateHunter(level),
        fragment: deps.spawnFragmentForLevel(level, 0),
        lives: diffPreset.livesCount,
    });

    g.fragmentTextState = null;
    g.hunterIntroState = null;

    // ALPHA introduction when starting on hunter levels
    if (g.state.hunter) {
        var introText = level === 10
            ? 'ALPHA REMEMBERS YOU.'
            : 'DESIGNATION: ALPHA \u2014 SECURITY DAEMON';
        g.hunterIntroState = { text: introText, startTime: Date.now() };
        playHunterIntroSound();
    }

    g.speedrunState = resetSpeedrun(g.speedrunState || createSpeedrunState());
    g.levelStartTime = Date.now();
    g.gameSessionStartTime = Date.now();
    recordGameStart();
    deps.updateLivesHUD(diffPreset.livesCount);
    deps.messageEl.textContent = 'Arrow keys or swipe to start';
    deps.messageEl.className = '';
    deps.messageEl.style.color = '';
}

export function startEndlessMode(g, deps) {
    g.currentScreen = 'gameplay';
    g.endlessMode = true;
    g.startingLevel = 0;
    setGridSize(ENDLESS_GRID_SIZE);
    deps.canvas.width = CANVAS_SIZE;
    deps.canvas.height = CANVAS_SIZE;
    showGameplayUI(deps.hudEl, deps.titleEl, deps.messageEl);
    deps.ui.clearTimers();
    g.particleSystem = createParticleSystem();
    g.shakeState = createShakeState();
    g.prevSnake = null;
    g.prevHunterSegments = null;
    g.hunterTrailHistory = [];
    g.snakeTrailHistory = [];
    g.replayBuffer = createReplayBuffer();
    g.replayState = null;
    g.replayDeathContext = null;
    g.deathAnimation = null;
    g.levelTransition = null;
    g.levelUpEventCtx = null;

    var wave1Config = getEndlessConfig(1);
    var endlessDiffPreset = getDifficultyPreset(getSettings().difficulty);

    g.state = createInitialState();
    g.state = Object.assign({}, g.state, {
        level: 1,
        endlessWave: 1,
        endlessConfig: wave1Config,
        lives: endlessDiffPreset.livesCount,
    });

    g.fragmentTextState = null;
    g.hunterIntroState = null;

    g.speedrunState = resetSpeedrun(g.speedrunState || createSpeedrunState());
    deps.dom.levelLabelEl.textContent = 'Wave:';
    g.gameSessionStartTime = Date.now();
    recordGameStart();
    deps.updateLivesHUD(endlessDiffPreset.livesCount);

    deps.messageEl.textContent = 'ENDLESS MODE \u2014 Swipe or press arrow to begin';
    deps.messageEl.className = '';
    deps.messageEl.style.color = '#ef4444';
}

// --- Event context helpers ---
// buildEventCtx packages all mutable game vars into a context object for
// processPostTickEvents (game-events.js). applyEventCtx writes results back.

export function buildEventCtx(g, prevState, prevLevel, config, deps) {
    return {
        state: g.state, prevState: prevState, prevLevel: prevLevel,
        prevSnake: g.prevSnake, prevHunterSegments: g.prevHunterSegments,
        hunterTrailHistory: g.hunterTrailHistory,
        particleSystem: g.particleSystem, shakeState: g.shakeState,
        highScore: g.highScore, levelStartTime: g.levelStartTime,
        fragmentTextState: g.fragmentTextState, hunterIntroState: g.hunterIntroState,
        endingState: g.endingState,
        currentScreen: g.currentScreen, endlessMode: g.endlessMode, config: config,
        speedrunState: g.speedrunState,
        messageEl: deps.messageEl, dom: deps.dom, ui: deps.ui,
        tryUnlock: deps.tryUnlock, checkAllEndings: deps.checkAllEndings,
        spawnFragmentForLevel: deps.spawnFragmentForLevel,
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
    g.highScore = eventCtx.highScore;
    g.levelStartTime = eventCtx.levelStartTime;
    g.fragmentTextState = eventCtx.fragmentTextState;
    g.hunterIntroState = eventCtx.hunterIntroState;
    g.endingState = eventCtx.endingState;
    g.currentScreen = eventCtx.currentScreen;
    g.speedrunState = eventCtx.speedrunState;
}

// --- Gameplay action helpers ---
// Large callbacks extracted from gameCallbacks to keep main.js under the line limit.

export function restartGame(g, deps, newDir) {
    if (g.gameSessionStartTime > 0) {
        recordGameTime(Date.now() - g.gameSessionStartTime);
        g.gameSessionStartTime = 0;
    }
    if (g.endlessMode) {
        setEndlessHighScore(g.state.score);
        setEndlessHighWave(g.state.endlessWave);
    } else if (g.state.score > g.highScore) {
        g.highScore = g.state.score;
        localStorage.setItem('snake-highscore', String(g.highScore));
        deps.dom.highScoreEl.textContent = g.highScore;
    }
    g.speedrunState = resetSpeedrun(g.speedrunState || createSpeedrunState());
    deps.ui.clearTimers();
    g.particleSystem = createParticleSystem();
    g.shakeState = createShakeState();
    g.prevSnake = null;
    g.prevHunterSegments = null;
    g.fragmentTextState = null;
    g.hunterIntroState = null;
    g.hunterTrailHistory = [];
    g.snakeTrailHistory = [];
    g.replayBuffer = createReplayBuffer();
    g.replayState = null;
    g.replayDeathContext = null;
    g.deathAnimation = null;
    g.levelTransition = null;
    g.levelUpEventCtx = null;
    var restartDiff = getDifficultyPreset(getSettings().difficulty);
    setGridSize(g.endlessMode ? ENDLESS_GRID_SIZE : (LEVEL_GRID_SIZE[g.startingLevel] || 20));
    deps.canvas.width = CANVAS_SIZE;
    deps.canvas.height = CANVAS_SIZE;
    g.state = createInitialState();
    if (g.endlessMode) {
        var w1Config = getEndlessConfig(1);
        g.state = Object.assign({}, g.state, {
            level: 1,
            endlessWave: 1,
            endlessConfig: w1Config,
            started: true,
            nextDirection: newDir,
            lives: restartDiff.livesCount,
        });
    } else {
        g.state = Object.assign({}, g.state, {
            level: g.startingLevel,
            walls: filterWallsFromSnake(generateWalls(g.startingLevel), g.state.snake),
            obstacles: generateObstacles(g.startingLevel),
            portals: generatePortals(g.startingLevel),
            hunter: generateHunter(g.startingLevel),
            fragment: deps.spawnFragmentForLevel(g.startingLevel, 0),
            started: true,
            nextDirection: newDir,
            lives: restartDiff.livesCount,
        });
    }
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
    }
    if (g.endlessMode) {
        setEndlessHighScore(g.state.score);
        setEndlessHighWave(g.state.endlessWave);
    } else if (g.state.score > g.highScore) {
        g.highScore = g.state.score;
        localStorage.setItem('snake-highscore', String(g.highScore));
        deps.dom.highScoreEl.textContent = g.highScore;
    }
    switchToTitle(g, deps);
}

export function onRestartLevel(g, deps) {
    if (g.gameSessionStartTime > 0) {
        recordGameTime(Date.now() - g.gameSessionStartTime);
        g.gameSessionStartTime = 0;
    }
    if (g.endlessMode) {
        setEndlessHighScore(g.state.score);
        setEndlessHighWave(g.state.endlessWave);
        startEndlessMode(g, deps);
    } else {
        if (g.state.score > g.highScore) {
            g.highScore = g.state.score;
            localStorage.setItem('snake-highscore', String(g.highScore));
            deps.dom.highScoreEl.textContent = g.highScore;
        }
        startGameAtLevel(g, deps, g.startingLevel);
    }
}
