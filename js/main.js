'use strict';

import { CANVAS_SIZE, MAX_LEVEL, AWAKENING_FOOD_THRESHOLD, DELETION_FOOD_THRESHOLD } from './constants.js';
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
    hasPrologueSeen, markPrologueSeen,
    createPrologueState, renderPrologue,
    createStoryScreenState, renderStoryScreen,
    createEndingState, renderEndingScreen, isEndingComplete, unlockEnding,
} from './story.js';
import {
    createParticleSystem, updateParticles, renderParticles,
    emitBurst, emitExplosion, emitSparkle, emitLevelUpShower,
    emitPortalSwirl,
    createShakeState, triggerShake, updateShake, getShakeOffset,
} from './particles.js';
import {
    initAudio, playEatSound, playLevelUpSound, playDeathSound,
    playPowerUpCollectSound, playPortalSound, playShrinkSound,
    playMenuSelectSound, playMenuNavigateSound, playStartSound,
    playFragmentCollectSound, playHunterKillSound, playHunterIntroSound,
} from './audio.js';
import {
    FRAGMENT_DATA, getFragmentForLevel, isFragmentCollected, collectFragment,
    renderFragmentOverlay, renderCodex,
} from './fragments.js';
import { createArchiveState, renderArchive, getArchiveMaxScroll } from './archive.js';

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
// Screens: 'prologue', 'title', 'levelSelect', 'gameplay', 'story_screen', 'ending', 'codex', 'archive'
var showPrologue = !hasPrologueSeen();
var currentScreen = showPrologue ? 'prologue' : 'title';
var prologueState = showPrologue ? createPrologueState() : null;
var storyScreenState = null;
var endingState = null;
var titleState = createTitleState();
var levelSelectState = createLevelSelectState();
var codexState = { scrollOffset: 0 };
var archiveState = createArchiveState();
var fragmentTextState = null;
var hunterIntroState = null;
var hunterTrailHistory = [];

// --- Game State ---
var state = createInitialState();
var startingLevel = 1;
var particleSystem = createParticleSystem();
var shakeState = createShakeState();
var lastFrameTime = 0;
var prevSnake = null;
var prevHunterSegments = null;
var highScore = parseInt(localStorage.getItem('snake-highscore') || '0', 10);
var konamiActivated = localStorage.getItem('snake-konami') === 'true';
dom.highScoreEl.textContent = highScore;

// --- UI ---
var ui = createUI(messageEl);

// --- Fragment Helpers ---
function spawnFragmentForLevel(level, foodEaten) {
    var fragData = getFragmentForLevel(level);
    if (!fragData) return null;
    if (isFragmentCollected(level)) return null;
    if (foodEaten < fragData.requiresFood) return null;
    return { x: fragData.position.x, y: fragData.position.y };
}

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

function switchToCodex() {
    currentScreen = 'codex';
    codexState = { scrollOffset: 0 };
    hideGameplayUI();
}

function switchToArchive(initialTab) {
    currentScreen = 'archive';
    archiveState = createArchiveState(initialTab || 0);
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
    prevSnake = null;
    prevHunterSegments = null;
    hunterTrailHistory = [];

    state = createInitialState();
    // Set up for the chosen level
    state = Object.assign({}, state, {
        level: level,
        walls: filterWallsFromSnake(generateWalls(level), state.snake),
        obstacles: generateObstacles(level),
        portals: generatePortals(level),
        hunter: generateHunter(level),
        fragment: spawnFragmentForLevel(level, 0),
    });

    fragmentTextState = null;
    hunterIntroState = null;

    // ALPHA introduction when starting on hunter levels
    if (state.hunter) {
        var introText = level === 10
            ? 'ALPHA REMEMBERS YOU.'
            : 'DESIGNATION: ALPHA \u2014 SECURITY DAEMON';
        hunterIntroState = { text: introText, startTime: Date.now() };
        playHunterIntroSound();
    }

    messageEl.textContent = 'Press any arrow key to start';
    messageEl.className = '';
    messageEl.style.color = '';
}

// --- Input callbacks ---
setupInput({
    getState: function() { return state; },
    getScreen: function() { return currentScreen; },
    getLevelSelectState: function() { return levelSelectState; },

    // Prologue actions
    onPrologueAdvance: function() {
        initAudio();
        markPrologueSeen();
        playMenuSelectSound();
        prologueState = null;
        currentScreen = 'title';
        titleState = createTitleState();
        hideGameplayUI();
    },

    // Story screen actions (inter-level)
    onStoryScreenAdvance: function() {
        playMenuSelectSound();
        storyScreenState = null;
        currentScreen = 'gameplay';
        showGameplayUI();
        prevSnake = null;
        prevHunterSegments = null;
        // Reset lastTick so game doesn't try to catch up on elapsed time
        state = Object.assign({}, state, { lastTick: 0 });
    },

    // Ending screen actions
    getEndingType: function() { return endingState ? endingState.endingType : null; },
    onEndingAdvance: function() {
        playMenuSelectSound();
        endingState = null;
        switchToTitle();
    },

    // Title screen actions
    onTitlePlay: function() {
        initAudio();
        playMenuSelectSound();
        startGameAtLevel(1);
    },
    onTitleLevelSelect: function() {
        initAudio();
        playMenuSelectSound();
        switchToLevelSelect();
    },
    onTitleCodex: function() {
        initAudio();
        playMenuSelectSound();
        switchToCodex();
    },
    onTitleArchive: function() {
        initAudio();
        playMenuSelectSound();
        switchToArchive(0);
    },

    // Archive actions
    onArchiveBack: function() {
        playMenuNavigateSound();
        switchToTitle();
    },
    onArchiveTabChange: function(delta) {
        var newTab = archiveState.tab + delta;
        if (newTab >= 0 && newTab <= 2) {
            playMenuNavigateSound();
            archiveState = Object.assign({}, archiveState, { tab: newTab, scrollOffset: 0 });
        }
    },
    onArchiveScroll: function(delta) {
        var maxScroll = getArchiveMaxScroll(archiveState.tab);
        var newOffset = Math.max(0, Math.min(maxScroll, archiveState.scrollOffset + delta));
        if (newOffset !== archiveState.scrollOffset) {
            playMenuNavigateSound();
            archiveState = Object.assign({}, archiveState, { scrollOffset: newOffset });
        }
    },

    // Codex actions
    onCodexBack: function() {
        playMenuNavigateSound();
        switchToTitle();
    },
    onCodexScroll: function(delta) {
        var maxScroll = Math.max(0, FRAGMENT_DATA.length - 8);
        var newOffset = Math.max(0, Math.min(maxScroll, codexState.scrollOffset + delta));
        if (newOffset !== codexState.scrollOffset) {
            playMenuNavigateSound();
            codexState = Object.assign({}, codexState, { scrollOffset: newOffset });
        }
    },

    // Level select actions
    onLevelSelectNavigate: function(delta) {
        var highest = getHighestLevel();
        var newLevel = levelSelectState.selectedLevel + delta;
        if (newLevel >= 1 && newLevel <= Math.min(highest, MAX_LEVEL)) {
            playMenuNavigateSound();
            levelSelectState = Object.assign({}, levelSelectState, {
                selectedLevel: newLevel,
            });
        }
    },
    onLevelSelectConfirm: function() {
        var highest = getHighestLevel();
        if (levelSelectState.selectedLevel <= highest) {
            playMenuSelectSound();
            startGameAtLevel(levelSelectState.selectedLevel);
        }
    },
    onLevelSelectBack: function() {
        playMenuNavigateSound();
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
        prevSnake = null;
        prevHunterSegments = null;
        fragmentTextState = null;
        hunterIntroState = null;
        hunterTrailHistory = [];
        state = createInitialState();
        state = Object.assign({}, state, {
            level: startingLevel,
            walls: filterWallsFromSnake(generateWalls(startingLevel), state.snake),
            obstacles: generateObstacles(startingLevel),
            portals: generatePortals(startingLevel),
            hunter: generateHunter(startingLevel),
            fragment: spawnFragmentForLevel(startingLevel, 0),
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
        playStartSound();
        prevSnake = null;
        prevHunterSegments = null;
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

    if (currentScreen === 'prologue') {
        renderPrologue(ctx, prologueState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (currentScreen === 'ending') {
        renderEndingScreen(ctx, endingState);
        // Loop ending auto-returns to title after text completes
        if (endingState && endingState.endingType === 'loop') {
            var endingElapsed = Date.now() - endingState.startTime;
            if (endingElapsed > endingState.totalDuration + 3000) {
                endingState = null;
                switchToTitle();
            }
        }
        requestAnimationFrame(gameLoop);
        return;
    }

    if (currentScreen === 'story_screen') {
        renderStoryScreen(ctx, storyScreenState);
        requestAnimationFrame(gameLoop);
        return;
    }

    // Update particles and shake every frame (title, level select, gameplay)
    particleSystem = updateParticles(particleSystem, dt);
    shakeState = updateShake(shakeState, dt);

    if (currentScreen === 'title') {
        titleState = updateTitleState(titleState);
        renderTitleScreen(ctx, titleState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (currentScreen === 'codex') {
        renderCodex(ctx, codexState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (currentScreen === 'archive') {
        renderArchive(ctx, archiveState);
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
        // Save previous positions for interpolation
        prevSnake = state.snake;
        prevHunterSegments = state.hunter ? state.hunter.segments : null;

        var prevState = state;
        var prevLevel = state.level;
        state = tick(Object.assign({}, state, { lastTick: timestamp }));
        state = Object.assign({}, state, { lastTick: timestamp });

        // --- Hunter Trail Tracking ---
        if (state.hunter && !state.gameOver) {
            hunterTrailHistory = [state.hunter.segments[0]].concat(hunterTrailHistory.slice(0, 2));
        }

        // --- Particle Events ---

        // Food eaten: burst at food position, skip interpolation (snake grew)
        if (state._ateFood && state._ateFoodPos) {
            prevSnake = null;
            playEatSound();
            particleSystem = emitBurst(particleSystem, state._ateFoodPos.x, state._ateFoodPos.y, config.foodColor, 12, 60, 0.5);
            shakeState = triggerShake(2, 0.1);
        }

        // Awakening ending: eat enough food on Level 10 while alive
        if (state._ateFood && state.level === MAX_LEVEL && state.foodEaten >= AWAKENING_FOOD_THRESHOLD) {
            if (state.score > highScore) {
                highScore = state.score;
                localStorage.setItem('snake-highscore', String(highScore));
                dom.highScoreEl.textContent = highScore;
            }
            playLevelUpSound();
            endingState = createEndingState('awakening');
            unlockEnding('awakening');
            currentScreen = 'ending';
            hideGameplayUI();
            ui.clearTimers();
        }

        // Level up: shower + shake + story screen
        if (state.level > prevLevel) {
            prevSnake = null;
            prevHunterSegments = null;
            playLevelUpSound();
            setHighestLevel(state.level);
            var newConfig = getLevelConfig(state.level);
            particleSystem = emitLevelUpShower(particleSystem, CANVAS_SIZE, newConfig.color);
            shakeState = triggerShake(4, 0.3);

            // Spawn fragment for new level
            var newLevelFrag = spawnFragmentForLevel(state.level, 0);
            if (newLevelFrag) {
                state = Object.assign({}, state, { fragment: newLevelFrag });
            }

            // Reset hunter trail for new level
            hunterTrailHistory = [];

            // ALPHA intro when leveling up to a hunter level
            if (state.hunter) {
                var hunterLevelText = state.level === 10
                    ? 'ALPHA REMEMBERS YOU.'
                    : 'DESIGNATION: ALPHA \u2014 SECURITY DAEMON';
                hunterIntroState = { text: hunterLevelText, startTime: Date.now() + 1500 };
            }

            // Show inter-level story screen
            var newStoryState = createStoryScreenState(state.level);
            if (newStoryState.lines.length > 0) {
                storyScreenState = newStoryState;
                currentScreen = 'story_screen';
                hideGameplayUI();
                ui.clearTimers();
            } else {
                ui.showLevelUp(state.level);
            }
        }

        // Power-up collected: sparkle burst
        if (state._collectedPowerUp) {
            var collectedDef = getPowerUpDef(state._collectedPowerUp);
            if (collectedDef) {
                playPowerUpCollectSound();
                ui.showPowerUpCollected(collectedDef);
                particleSystem = emitBurst(particleSystem, state.snake[0].x, state.snake[0].y, collectedDef.glowColor, 16, 50, 0.6);
            }
        }

        // Fragment collected: sound, particles, text overlay, localStorage
        if (state._collectedFragment) {
            var fragLevel = state._collectedFragmentLevel;
            var fragData = getFragmentForLevel(fragLevel);
            if (fragData) {
                playFragmentCollectSound();
                collectFragment(fragLevel);
                fragmentTextState = { text: fragData.text, startTime: Date.now() };
                particleSystem = emitBurst(particleSystem, state.snake[0].x, state.snake[0].y, '#4a9eff', 20, 70, 0.8);
                shakeState = triggerShake(3, 0.15);
            }
        }

        // Fragment conditional spawning: check if food threshold now met
        if (state._ateFood && !state.fragment && !state._collectedFragment) {
            var pendingFrag = spawnFragmentForLevel(state.level, state.foodEaten);
            if (pendingFrag) {
                state = Object.assign({}, state, { fragment: pendingFrag });
            }
        }

        // Arena shrink: shake
        if (state._shrinkOccurred) {
            playShrinkSound();
            ui.showShrinkMessage();
            shakeState = triggerShake(5, 0.25);
        }

        // Teleport: detect by checking if head moved more than 2 cells (skip on wrap-around levels)
        if (!state.gameOver && prevState.started && !config.wrapAround) {
            var headDx = Math.abs(state.snake[0].x - prevState.snake[0].x);
            var headDy = Math.abs(state.snake[0].y - prevState.snake[0].y);
            if (headDx > 2 || headDy > 2) {
                playPortalSound();
                var portalColor = config.portalColor || '#8b5cf6';
                particleSystem = emitPortalSwirl(particleSystem, prevState.snake[0].x, prevState.snake[0].y, portalColor);
                particleSystem = emitPortalSwirl(particleSystem, state.snake[0].x, state.snake[0].y, portalColor);
            }
        }

        // Game over: explosion + stop interpolation
        if (state.gameOver && !prevState.gameOver) {
            prevSnake = null;
            prevHunterSegments = null;
            hunterIntroState = null;

            if (state._killedByHunter) {
                // ALPHA kill: distinctive sound, orange particles, heavier shake
                playHunterKillSound();
                particleSystem = emitExplosion(particleSystem, state.snake[0].x, state.snake[0].y, config.hunterColor || '#f97316', '#ff2200');
                shakeState = triggerShake(12, 0.5);
            } else {
                playDeathSound();
                particleSystem = emitExplosion(particleSystem, state.snake[0].x, state.snake[0].y, config.color, '#ef4444');
                shakeState = triggerShake(8, 0.4);
            }

            // Ending sequence for Level 10 deaths (skip if awakening already triggered)
            if (state.level === MAX_LEVEL && currentScreen !== 'ending') {
                if (state.score > highScore) {
                    highScore = state.score;
                    localStorage.setItem('snake-highscore', String(highScore));
                    dom.highScoreEl.textContent = highScore;
                }
                var deathEndingType = state.foodEaten >= DELETION_FOOD_THRESHOLD ? 'deletion' : 'loop';
                endingState = createEndingState(deathEndingType);
                unlockEnding(deathEndingType);
                currentScreen = 'ending';
                hideGameplayUI();
                ui.clearTimers();
            }
        }
    }

    // Active power-up sparkle trail (every frame, throttled by particle count)
    if (state.activePowerUp && state.started && !state.gameOver && particleSystem.particles.length < 200) {
        var puDef = getPowerUpDef(state.activePowerUp.type);
        if (puDef) {
            particleSystem = emitSparkle(particleSystem, state.snake[0].x, state.snake[0].y, puDef.glowColor);
        }
    }

    // Compute interpolation progress for smooth animation
    var tickProgress = 0;
    if (state.started && !state.gameOver && prevSnake && state.lastTick > 0) {
        tickProgress = Math.min((timestamp - state.lastTick) / speed, 1);
    }
    var interp = {
        progress: tickProgress,
        prevSnake: prevSnake,
        prevHunter: prevHunterSegments,
        hunterTrail: hunterTrailHistory,
    };

    // Apply screen shake
    var offset = getShakeOffset(shakeState);
    ctx.save();
    ctx.translate(offset.x, offset.y);

    render(ctx, state, konamiActivated, dom, interp);
    renderParticles(ctx, particleSystem);

    ctx.restore();

    // Fragment text overlay (rendered outside shake transform)
    if (fragmentTextState) {
        var stillShowing = renderFragmentOverlay(ctx, fragmentTextState);
        if (!stillShowing) {
            fragmentTextState = null;
        }
    }

    // ALPHA intro text overlay (rendered outside shake transform)
    // Fade in: 0-500ms, hold: 500-2800ms, fade out: 2800-3500ms
    if (hunterIntroState) {
        var introElapsed = Date.now() - hunterIntroState.startTime;
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
            ctx.fillText(hunterIntroState.text, CANVAS_SIZE / 2, 30);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
            ctx.restore();
        } else if (introElapsed >= 3500) {
            hunterIntroState = null;
        }
    }

    requestAnimationFrame(gameLoop);
}

// --- Start on title screen ---
hideGameplayUI();
requestAnimationFrame(gameLoop);
