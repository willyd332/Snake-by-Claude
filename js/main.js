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
import {
    createParticleSystem, updateParticles, renderParticles,
    emitBurst, emitExplosion, emitSparkle, emitLevelUpShower,
    emitPortalSwirl,
    createShakeState, triggerShake, updateShake, getShakeOffset,
} from './particles.js';

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
var particleSystem = createParticleSystem();
var shakeState = createShakeState();
var lastFrameTime = 0;
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
    particleSystem = createParticleSystem();
    shakeState = createShakeState();

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
        particleSystem = createParticleSystem();
        shakeState = createShakeState();
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
    var dt = lastFrameTime > 0 ? (timestamp - lastFrameTime) / 1000 : 0.016;
    dt = Math.min(dt, 0.05); // cap delta to avoid huge jumps
    lastFrameTime = timestamp;

    // Update particles and shake every frame (all screens)
    particleSystem = updateParticles(particleSystem, dt);
    shakeState = updateShake(shakeState, dt);

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
        var prevState = state;
        var prevLevel = state.level;
        state = tick(Object.assign({}, state, { lastTick: timestamp }));
        state = Object.assign({}, state, { lastTick: timestamp });

        // --- Particle Events ---

        // Food eaten: burst at food position
        if (state._ateFood && state._ateFoodPos) {
            particleSystem = emitBurst(particleSystem, state._ateFoodPos.x, state._ateFoodPos.y, config.foodColor, 12, 60, 0.5);
            shakeState = triggerShake(2, 0.1);
        }

        // Level up: shower + bigger shake
        if (state.level > prevLevel) {
            ui.showLevelUp(state.level);
            setHighestLevel(state.level);
            var newConfig = getLevelConfig(state.level);
            particleSystem = emitLevelUpShower(particleSystem, CANVAS_SIZE, newConfig.color);
            shakeState = triggerShake(4, 0.3);
        }

        // Power-up collected: sparkle burst
        if (state._collectedPowerUp) {
            var collectedDef = getPowerUpDef(state._collectedPowerUp);
            if (collectedDef) {
                ui.showPowerUpCollected(collectedDef);
                particleSystem = emitBurst(particleSystem, state.snake[0].x, state.snake[0].y, collectedDef.glowColor, 16, 50, 0.6);
            }
        }

        // Arena shrink: shake
        if (state._shrinkOccurred) {
            ui.showShrinkMessage();
            shakeState = triggerShake(5, 0.25);
        }

        // Teleport: detect by checking if head moved more than 2 cells (skip on wrap-around levels)
        if (!state.gameOver && prevState.started && !config.wrapAround) {
            var headDx = Math.abs(state.snake[0].x - prevState.snake[0].x);
            var headDy = Math.abs(state.snake[0].y - prevState.snake[0].y);
            if (headDx > 2 || headDy > 2) {
                var portalColor = config.portalColor || '#8b5cf6';
                particleSystem = emitPortalSwirl(particleSystem, prevState.snake[0].x, prevState.snake[0].y, portalColor);
                particleSystem = emitPortalSwirl(particleSystem, state.snake[0].x, state.snake[0].y, portalColor);
            }
        }

        // Game over: explosion
        if (state.gameOver && !prevState.gameOver) {
            particleSystem = emitExplosion(particleSystem, state.snake[0].x, state.snake[0].y, config.color, '#ef4444');
            shakeState = triggerShake(8, 0.4);
        }
    }

    // Active power-up sparkle trail (every frame, throttled by particle count)
    if (state.activePowerUp && state.started && !state.gameOver && particleSystem.particles.length < 200) {
        var puDef = getPowerUpDef(state.activePowerUp.type);
        if (puDef) {
            particleSystem = emitSparkle(particleSystem, state.snake[0].x, state.snake[0].y, puDef.glowColor);
        }
    }

    // Apply screen shake
    var offset = getShakeOffset(shakeState);
    ctx.save();
    ctx.translate(offset.x, offset.y);

    render(ctx, state, konamiActivated, dom);
    renderParticles(ctx, particleSystem);

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

// --- Start on title screen ---
hideGameplayUI();
requestAnimationFrame(gameLoop);
