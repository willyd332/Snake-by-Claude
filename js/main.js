'use strict';

import { CANVAS_SIZE, MAX_LEVEL } from './constants.js';
import { createInitialState, randomPosition, getLevelConfig } from './state.js';
import { tick } from './tick.js';
import { render } from './renderer.js';
import { createUI } from './ui.js';
import { setupInput } from './input.js';
import { getPowerUpDef } from './powerups.js';
import { generateWalls, filterWallsFromSnake, generateObstacles, generatePortals } from './levels.js';
import { generateHunter } from './hunter.js';
import {
    createTitleState, updateTitleState, renderTitleScreen,
    createLevelSelectState, renderLevelSelect,
    getHighestLevel, setHighestLevel,
} from './screens.js';

// --- Canvas setup ---
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

// --- DOM references ---
var dom = {
    scoreEl: document.getElementById('score'),
    levelEl: document.getElementById('level'),
    highScoreEl: document.getElementById('highScore'),
    powerUpHudEl: document.getElementById('powerUpHud'),
    powerUpNameEl: document.getElementById('powerUpName'),
    arenaHudEl: document.getElementById('arenaHud'),
    arenaSizeEl: document.getElementById('arenaSize'),
};

var messageEl = document.getElementById('message');
var hudEl = document.getElementById('hud');
var titleEl = document.getElementById('title');

// --- Screen State ---
// Screens: 'title', 'levelSelect', 'gameplay'
var currentScreen = 'title';
var titleState = createTitleState();
var levelSelectState = createLevelSelectState();

// --- Game State ---
var state = createInitialState();
var startingLevel = 1;
var highScore = parseInt(localStorage.getItem('snake-highscore') || '0', 10);
var konamiActivated = localStorage.getItem('snake-konami') === 'true';
dom.highScoreEl.textContent = highScore;

// --- UI ---
var ui = createUI(messageEl);

// --- Screen Management ---
function showGameplayUI() {
    hudEl.style.display = 'flex';
    if (titleEl) titleEl.style.display = 'block';
    messageEl.style.display = 'block';
}

function hideGameplayUI() {
    hudEl.style.display = 'none';
    if (titleEl) titleEl.style.display = 'none';
    messageEl.style.display = 'none';
}

function switchToTitle() {
    currentScreen = 'title';
    titleState = createTitleState();
    hideGameplayUI();
}

function switchToLevelSelect() {
    currentScreen = 'levelSelect';
    levelSelectState = Object.assign({}, createLevelSelectState(), {
        selectedLevel: Math.min(getHighestLevel(), MAX_LEVEL),
    });
    hideGameplayUI();
}

function startGameAtLevel(level) {
    currentScreen = 'gameplay';
    startingLevel = level;
    showGameplayUI();
    ui.clearTimers();

    state = createInitialState();
    // Set up for the chosen level
    state = Object.assign({}, state, {
        level: level,
        walls: filterWallsFromSnake(generateWalls(level), state.snake),
        obstacles: generateObstacles(level),
        portals: generatePortals(level),
        hunter: generateHunter(level),
    });

    messageEl.textContent = 'Press any arrow key to start';
    messageEl.className = '';
    messageEl.style.color = '';
}

// --- Input callbacks ---
setupInput({
    getState: function() { return state; },
    getScreen: function() { return currentScreen; },
    getLevelSelectState: function() { return levelSelectState; },

    // Title screen actions
    onTitlePlay: function() {
        startGameAtLevel(1);
    },
    onTitleLevelSelect: function() {
        switchToLevelSelect();
    },

    // Level select actions
    onLevelSelectNavigate: function(delta) {
        var highest = getHighestLevel();
        var newLevel = levelSelectState.selectedLevel + delta;
        if (newLevel >= 1 && newLevel <= Math.min(highest, MAX_LEVEL)) {
            levelSelectState = Object.assign({}, levelSelectState, {
                selectedLevel: newLevel,
            });
        }
    },
    onLevelSelectConfirm: function() {
        var highest = getHighestLevel();
        if (levelSelectState.selectedLevel <= highest) {
            startGameAtLevel(levelSelectState.selectedLevel);
        }
    },
    onLevelSelectBack: function() {
        switchToTitle();
    },

    // Gameplay actions
    toggleKonami: function() {
        konamiActivated = !konamiActivated;
        localStorage.setItem('snake-konami', String(konamiActivated));
        messageEl.textContent = konamiActivated ? 'RAINBOW MODE ACTIVATED' : 'RAINBOW MODE OFF';
        messageEl.className = konamiActivated ? 'rainbow' : 'active';
        setTimeout(function() {
            if (!state.started) {
                messageEl.textContent = 'Press any arrow key to start';
                messageEl.className = '';
            }
        }, 2500);
    },

    restartGame: function(newDir) {
        if (state.score > highScore) {
            highScore = state.score;
            localStorage.setItem('snake-highscore', String(highScore));
            dom.highScoreEl.textContent = highScore;
        }
        ui.clearTimers();
        state = createInitialState();
        state = Object.assign({}, state, {
            level: startingLevel,
            walls: filterWallsFromSnake(generateWalls(startingLevel), state.snake),
            obstacles: generateObstacles(startingLevel),
            portals: generatePortals(startingLevel),
            hunter: generateHunter(startingLevel),
            started: true,
            nextDirection: newDir,
        });
        state = Object.assign({}, state, {
            food: randomPosition(state.snake, state.walls, state.obstacles, state.portals, state.powerUp, state.hunter),
        });
        messageEl.textContent = '';
        messageEl.className = '';
        messageEl.style.color = '';
    },

    startGame: function(newDir) {
        state = Object.assign({}, state, {
            started: true,
            nextDirection: newDir,
            food: randomPosition(state.snake, state.walls, state.obstacles, state.portals, state.powerUp, state.hunter),
        });
        messageEl.textContent = '';
        messageEl.className = '';
    },

    changeDirection: function(newDir) {
        state = Object.assign({}, state, { nextDirection: newDir });
    },

    goToTitle: function() {
        if (state.score > highScore) {
            highScore = state.score;
            localStorage.setItem('snake-highscore', String(highScore));
            dom.highScoreEl.textContent = highScore;
        }
        switchToTitle();
    },
});

// --- Game loop ---
function gameLoop(timestamp) {
    if (currentScreen === 'title') {
        titleState = updateTitleState(titleState);
        renderTitleScreen(ctx, titleState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (currentScreen === 'levelSelect') {
        renderLevelSelect(ctx, levelSelectState);
        requestAnimationFrame(gameLoop);
        return;
    }

    // Gameplay
    var config = getLevelConfig(state.level);
    var speed = config.speed;

    if (state.activePowerUp && state.activePowerUp.type === 'timeSlow') {
        speed = speed * 2;
    }

    var elapsed = timestamp - state.lastTick;

    if (elapsed >= speed) {
        var prevLevel = state.level;
        state = tick(Object.assign({}, state, { lastTick: timestamp }));
        state = Object.assign({}, state, { lastTick: timestamp });

        if (state.level > prevLevel) {
            ui.showLevelUp(state.level);
            // Track highest level reached
            setHighestLevel(state.level);
        }

        if (state._collectedPowerUp) {
            var collectedDef = getPowerUpDef(state._collectedPowerUp);
            if (collectedDef) ui.showPowerUpCollected(collectedDef);
        }

        if (state._shrinkOccurred) {
            ui.showShrinkMessage();
        }
    }

    render(ctx, state, konamiActivated, dom);
    requestAnimationFrame(gameLoop);
}

// --- Start on title screen ---
hideGameplayUI();
requestAnimationFrame(gameLoop);
