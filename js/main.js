'use strict';

import { CANVAS_SIZE, MAX_LEVEL, setGridSize, LEVEL_GRID_SIZE, ENDLESS_GRID_SIZE, getGridOffset } from './constants.js';
import { createInitialState, randomPosition, getLevelConfig } from './state.js';
import { tick } from './tick.js';
import { render, renderReplayGhost } from './renderer.js';
import { createUI } from './ui.js';
import { setupInput } from './input.js';
import { setupTouch, TITLE_MENU_COUNT } from './touch.js';
import { getPowerUpDef } from './powerups.js';
import { generateWalls, filterWallsFromSnake, generateObstacles, generatePortals } from './levels.js';
import { generateHunter } from './hunter.js';
import {
    createTitleState, updateTitleState, renderTitleScreen,
    createLevelSelectState, renderLevelSelect, getHighestLevel,
    renderSettings,
} from './screens.js';
import {
    getSettings, getSettingsRef, createSettingsState, getSettingsItems,
    toggleSetting, cycleSetting, getDifficultyPreset,
} from './settings.js';
import {
    hasPrologueSeen, markPrologueSeen,
    createPrologueState, renderPrologue, renderStoryScreen,
    renderEndingScreen, getUnlockedEndings,
} from './story.js';
import {
    createParticleSystem, updateParticles, renderParticles, emitSparkle,
    createShakeState, updateShake, getShakeOffset,
} from './particles.js';
import {
    initAudio, playMenuSelectSound, playMenuNavigateSound, playStartSound,
    playHunterIntroSound, playSecretSound, setSoundEnabled,
} from './audio.js';
import {
    FRAGMENT_DATA, getFragmentForLevel, isFragmentCollected,
    renderFragmentOverlay, renderCodex,
} from './fragments.js';
import { createArchiveState, renderArchive, getArchiveMaxScroll } from './archive.js';
import {
    getEndlessConfig, getEndlessHighScore, setEndlessHighScore,
    getEndlessHighWave, setEndlessHighWave,
} from './endless.js';
import { processPostTickEvents } from './game-events.js';
import {
    createReplayBuffer, recordFrame, startReplay,
    replayTick, isReplayComplete, getReplayFrame,
    getReplayProgress, getReplayTrail,
} from './replay.js';
import {
    handleSecretKey, toggleDevConsole, isDevConsoleOpen,
    applyInvertFilter, markSecretFound,
    createMatrixState, updateMatrixState, renderMatrixRain, renderDevConsole,
} from './secrets.js';
import {
    unlockAchievement, createPopupState, renderPopup,
    createGalleryState, renderGallery, getGalleryItemCount,
    SKINS, TRAILS, setActiveSkin, setActiveTrail, isSkinUnlocked, isTrailUnlocked,
} from './achievements.js';
import { playAchievementSound } from './audio.js';
import { recordGameStart, recordGameTime } from './stats.js';

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

// --- Screen State ---
// Screens: 'prologue', 'title', 'levelSelect', 'gameplay', 'story_screen', 'ending', 'codex', 'archive', 'gallery', 'settings'
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
var achievementPopup = null;
var achievementPopupQueue = [];
var galleryState = createGalleryState();
var settingsState = createSettingsState();
var snakeTrailHistory = [];
var replayBuffer = createReplayBuffer();
var replayState = null;
var replayDeathContext = null; // Stashed death context for post-replay processing
var levelStartTime = 0;
var gameSessionStartTime = 0;
var titleMenuIndex = null;

// --- Game State ---
var state = createInitialState();
var startingLevel = 1;
var endlessMode = false;
var particleSystem = createParticleSystem();
var shakeState = createShakeState();
var matrixState = createMatrixState();
var lastFrameTime = 0;
var prevSnake = null;
var prevHunterSegments = null;
var highScore = parseInt(localStorage.getItem('snake-highscore') || '0', 10);
var konamiActivated = localStorage.getItem('snake-konami') === 'true';
dom.highScoreEl.textContent = highScore;

// Apply persisted settings on load
var initSettings = getSettings();
setSoundEnabled(initSettings.sound);

// --- UI ---
var ui = createUI(messageEl);

// --- Achievement Helpers ---
function tryUnlock(id) {
    var ach = unlockAchievement(id);
    if (ach) {
        achievementPopupQueue.push(createPopupState(ach));
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
    endlessMode = false;
    titleMenuIndex = null;
    setGridSize(20);
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    dom.levelLabelEl.textContent = 'Level:';
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

function switchToGallery() {
    currentScreen = 'gallery';
    galleryState = createGalleryState();
    hideGameplayUI();
}

function switchToSettings() {
    currentScreen = 'settings';
    settingsState = createSettingsState();
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
    endlessMode = false;
    startingLevel = level;
    setGridSize(LEVEL_GRID_SIZE[level] || 20);
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    showGameplayUI();
    ui.clearTimers();
    particleSystem = createParticleSystem();
    shakeState = createShakeState();
    prevSnake = null;
    prevHunterSegments = null;
    hunterTrailHistory = [];
    snakeTrailHistory = [];
    replayBuffer = createReplayBuffer();
    replayState = null;
    replayDeathContext = null;

    var diffPreset = getDifficultyPreset(getSettings().difficulty);
    state = createInitialState();
    // Set up for the chosen level
    state = Object.assign({}, state, {
        level: level,
        walls: filterWallsFromSnake(generateWalls(level), state.snake),
        obstacles: generateObstacles(level),
        portals: generatePortals(level),
        hunter: generateHunter(level),
        fragment: spawnFragmentForLevel(level, 0),
        lives: diffPreset.livesCount,
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

    levelStartTime = Date.now();
    gameSessionStartTime = Date.now();
    recordGameStart();
    updateLivesHUD(diffPreset.livesCount);
    messageEl.textContent = 'Arrow keys or swipe to start';
    messageEl.className = '';
    messageEl.style.color = '';
}

function startEndlessMode() {
    currentScreen = 'gameplay';
    endlessMode = true;
    startingLevel = 0;
    setGridSize(ENDLESS_GRID_SIZE);
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    showGameplayUI();
    ui.clearTimers();
    particleSystem = createParticleSystem();
    shakeState = createShakeState();
    prevSnake = null;
    prevHunterSegments = null;
    hunterTrailHistory = [];
    snakeTrailHistory = [];
    replayBuffer = createReplayBuffer();
    replayState = null;
    replayDeathContext = null;

    var wave1Config = getEndlessConfig(1);
    var endlessDiffPreset = getDifficultyPreset(getSettings().difficulty);

    state = createInitialState();
    state = Object.assign({}, state, {
        level: 1,
        endlessWave: 1,
        endlessConfig: wave1Config,
        lives: endlessDiffPreset.livesCount,
    });

    fragmentTextState = null;
    hunterIntroState = null;

    dom.levelLabelEl.textContent = 'Wave:';
    gameSessionStartTime = Date.now();
    recordGameStart();
    updateLivesHUD(endlessDiffPreset.livesCount);

    messageEl.textContent = 'ENDLESS MODE \u2014 Swipe or press arrow to begin';
    messageEl.className = '';
    messageEl.style.color = '#ef4444';
}

// --- Input callbacks ---
var gameCallbacks = {
    getState: function() { return state; },
    getScreen: function() { return currentScreen; },
    getLevelSelectState: function() { return levelSelectState; },
    isReplaying: function() { return replayState !== null; },

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
    onTitleEndless: function() {
        initAudio();
        playMenuSelectSound();
        startEndlessMode();
    },
    onTitleGallery: function() {
        initAudio();
        playMenuSelectSound();
        switchToGallery();
    },
    onTitleSettings: function() {
        initAudio();
        playMenuSelectSound();
        switchToSettings();
    },

    // Settings actions
    onSettingsBack: function() {
        playMenuNavigateSound();
        switchToTitle();
    },
    onSettingsNavigate: function(delta) {
        var count = getSettingsItems().length;
        var newIdx = settingsState.selectedIndex + delta;
        if (newIdx >= 0 && newIdx < count) {
            playMenuNavigateSound();
            settingsState = Object.assign({}, settingsState, { selectedIndex: newIdx });
        }
    },
    onSettingsToggle: function(direction) {
        var items = getSettingsItems();
        var item = items[settingsState.selectedIndex];
        if (!item) return;
        playMenuSelectSound();
        if (item.type === 'toggle') {
            var updated = toggleSetting(item.key);
            if (item.key === 'sound') {
                setSoundEnabled(updated.sound);
            }
        } else if (item.type === 'cycle') {
            cycleSetting(item.key, item.options, direction);
        }
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

    // Gallery actions
    onGalleryBack: function() {
        playMenuNavigateSound();
        switchToTitle();
    },
    onGalleryTabChange: function(delta) {
        var newTab = galleryState.tab + delta;
        if (newTab >= 0 && newTab <= 3) {
            playMenuNavigateSound();
            galleryState = Object.assign({}, galleryState, { tab: newTab, scrollOffset: 0, selectedIndex: 0 });
        }
    },
    onGalleryNavigate: function(delta) {
        var count = getGalleryItemCount(galleryState.tab);
        if (galleryState.tab === 0 || galleryState.tab === 3) {
            // Achievements/Stats tabs: scroll
            var newScroll = galleryState.scrollOffset + delta;
            newScroll = Math.max(0, Math.min(count - 1, newScroll));
            if (newScroll !== galleryState.scrollOffset) {
                playMenuNavigateSound();
                galleryState = Object.assign({}, galleryState, { scrollOffset: newScroll, selectedIndex: newScroll });
            }
        } else {
            // Skins/Trails: select
            var newIdx = Math.max(0, Math.min(count - 1, galleryState.selectedIndex + delta));
            if (newIdx !== galleryState.selectedIndex) {
                playMenuNavigateSound();
                galleryState = Object.assign({}, galleryState, { selectedIndex: newIdx });
            }
        }
    },
    onGallerySelect: function() {
        if (galleryState.tab === 1) {
            var skin = SKINS[galleryState.selectedIndex];
            if (skin && isSkinUnlocked(skin.id)) {
                playMenuSelectSound();
                setActiveSkin(skin.id);
            }
        } else if (galleryState.tab === 2) {
            var trail = TRAILS[galleryState.selectedIndex];
            if (trail && isTrailUnlocked(trail.id)) {
                playMenuSelectSound();
                setActiveTrail(trail.id);
            }
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
        markSecretFound('konami');
        tryUnlock('rainbow_road');
        messageEl.textContent = konamiActivated ? 'RAINBOW MODE ACTIVATED' : 'RAINBOW MODE OFF';
        messageEl.className = konamiActivated ? 'rainbow' : 'active';
        setTimeout(function() {
            if (!state.started) {
                messageEl.textContent = 'Arrow keys or swipe to start';
                messageEl.className = '';
            }
        }, 2500);
    },

    // Secret code detection
    onSecretKey: function(key) {
        var result = handleSecretKey(key);
        if (result) {
            initAudio();
            playSecretSound();

            if (result.name === 'invert') {
                applyInvertFilter(canvas);
                tryUnlock('upside_down');
            }
            if (result.name === 'matrix') {
                tryUnlock('red_pill');
            }

            var messages = {
                matrix: { on: 'DATA STREAM \u2014 ENABLED', off: 'DATA STREAM \u2014 DISABLED' },
                invert: { on: 'DISPLAY POLARITY \u2014 REVERSED', off: 'DISPLAY POLARITY \u2014 RESTORED' },
            };
            var msg = messages[result.name];
            if (msg) {
                messageEl.textContent = result.active ? msg.on : msg.off;
                messageEl.className = 'secret';
                messageEl.style.color = result.name === 'matrix' ? '#00ff00' : '#e0e0e0';
                setTimeout(function() {
                    if (!state.started) {
                        messageEl.textContent = 'Arrow keys or swipe to start';
                        messageEl.className = '';
                        messageEl.style.color = '';
                    }
                }, 2500);
            }
        }
    },

    // Dev console
    isDevConsoleOpen: function() { return isDevConsoleOpen(); },
    onToggleDevConsole: function() {
        initAudio();
        playSecretSound();
        toggleDevConsole();
        tryUnlock('root_access');
    },

    restartGame: function(newDir) {
        if (gameSessionStartTime > 0) {
            recordGameTime(Date.now() - gameSessionStartTime);
            gameSessionStartTime = 0;
        }
        if (endlessMode) {
            setEndlessHighScore(state.score);
            setEndlessHighWave(state.endlessWave);
        } else if (state.score > highScore) {
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
        snakeTrailHistory = [];
        replayBuffer = createReplayBuffer();
        replayState = null;
        replayDeathContext = null;
        var restartDiff = getDifficultyPreset(getSettings().difficulty);
        setGridSize(endlessMode ? ENDLESS_GRID_SIZE : (LEVEL_GRID_SIZE[startingLevel] || 20));
        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
        state = createInitialState();
        if (endlessMode) {
            var w1Config = getEndlessConfig(1);
            state = Object.assign({}, state, {
                level: 1,
                endlessWave: 1,
                endlessConfig: w1Config,
                started: true,
                nextDirection: newDir,
                lives: restartDiff.livesCount,
            });
        } else {
            state = Object.assign({}, state, {
                level: startingLevel,
                walls: filterWallsFromSnake(generateWalls(startingLevel), state.snake),
                obstacles: generateObstacles(startingLevel),
                portals: generatePortals(startingLevel),
                hunter: generateHunter(startingLevel),
                fragment: spawnFragmentForLevel(startingLevel, 0),
                started: true,
                nextDirection: newDir,
                lives: restartDiff.livesCount,
            });
        }
        state = Object.assign({}, state, {
            food: randomPosition(state.snake, state.walls, state.obstacles, state.portals, state.powerUp, state.hunter),
        });
        updateLivesHUD(restartDiff.livesCount);
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
        if (gameSessionStartTime > 0) {
            recordGameTime(Date.now() - gameSessionStartTime);
            gameSessionStartTime = 0;
        }
        if (endlessMode) {
            setEndlessHighScore(state.score);
            setEndlessHighWave(state.endlessWave);
        } else if (state.score > highScore) {
            highScore = state.score;
            localStorage.setItem('snake-highscore', String(highScore));
            dom.highScoreEl.textContent = highScore;
        }
        switchToTitle();
    },

    onRestartLevel: function() {
        if (gameSessionStartTime > 0) {
            recordGameTime(Date.now() - gameSessionStartTime);
            gameSessionStartTime = 0;
        }
        if (endlessMode) {
            setEndlessHighScore(state.score);
            setEndlessHighWave(state.endlessWave);
            startEndlessMode();
        } else {
            if (state.score > highScore) {
                highScore = state.score;
                localStorage.setItem('snake-highscore', String(highScore));
                dom.highScoreEl.textContent = highScore;
            }
            startGameAtLevel(startingLevel);
        }
    },

    // Touch-specific callbacks
    getTitleMenuIndex: function() { return titleMenuIndex; },
    onTitleMenuNavigate: function(delta) {
        initAudio();
        if (titleMenuIndex === null) {
            titleMenuIndex = 0;
            playMenuNavigateSound();
            return;
        }
        var newIdx = titleMenuIndex + delta;
        if (newIdx >= 0 && newIdx < TITLE_MENU_COUNT) {
            playMenuNavigateSound();
            titleMenuIndex = newIdx;
        }
    },
};

setupInput(gameCallbacks);
setupTouch(canvas, gameCallbacks);

// --- Event context helpers (avoid duplication in game loop) ---
function buildEventCtx(prevState, prevLevel, config) {
    return {
        state: state, prevState: prevState, prevLevel: prevLevel,
        prevSnake: prevSnake, prevHunterSegments: prevHunterSegments,
        hunterTrailHistory: hunterTrailHistory,
        particleSystem: particleSystem, shakeState: shakeState,
        highScore: highScore, levelStartTime: levelStartTime,
        fragmentTextState: fragmentTextState, hunterIntroState: hunterIntroState,
        endingState: endingState, storyScreenState: storyScreenState,
        currentScreen: currentScreen, endlessMode: endlessMode, config: config,
        messageEl: messageEl, dom: dom, ui: ui,
        tryUnlock: tryUnlock, checkAllEndings: checkAllEndings,
        spawnFragmentForLevel: spawnFragmentForLevel,
        hideGameplayUI: hideGameplayUI,
    };
}

function applyEventCtx(eventCtx) {
    state = eventCtx.state;
    prevSnake = eventCtx.prevSnake;
    prevHunterSegments = eventCtx.prevHunterSegments;
    hunterTrailHistory = eventCtx.hunterTrailHistory;
    particleSystem = eventCtx.particleSystem;
    shakeState = eventCtx.shakeState;
    highScore = eventCtx.highScore;
    levelStartTime = eventCtx.levelStartTime;
    fragmentTextState = eventCtx.fragmentTextState;
    hunterIntroState = eventCtx.hunterIntroState;
    endingState = eventCtx.endingState;
    storyScreenState = eventCtx.storyScreenState;
    currentScreen = eventCtx.currentScreen;
}

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

    // Update particles, shake, and matrix rain every frame
    particleSystem = updateParticles(particleSystem, dt);
    shakeState = updateShake(shakeState, dt);
    matrixState = updateMatrixState(matrixState, dt);

    if (currentScreen === 'title') {
        titleState = updateTitleState(titleState);
        renderTitleScreen(ctx, titleState, titleMenuIndex);
        renderDevConsole(ctx);
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

    if (currentScreen === 'gallery') {
        renderGallery(ctx, galleryState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (currentScreen === 'settings') {
        renderSettings(ctx, settingsState);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (currentScreen === 'levelSelect') {
        renderLevelSelect(ctx, levelSelectState);
        requestAnimationFrame(gameLoop);
        return;
    }

    // Gameplay
    var config = getLevelConfig(state.level, state.endlessConfig);
    var frameSettings = getSettingsRef();
    var gameplayDiff = getDifficultyPreset(frameSettings.difficulty);
    var speed = Math.round(config.speed * gameplayDiff.speedMult);

    if (state.activePowerUp && state.activePowerUp.type === 'timeSlow') {
        speed = speed * 2;
    }

    // --- Death Replay Mode ---
    if (replayState) {
        replayState = replayTick(replayState, timestamp);

        if (isReplayComplete(replayState)) {
            // Replay finished — process stashed death events
            replayState = null;
            if (replayDeathContext) {
                processPostTickEvents(replayDeathContext);
                applyEventCtx(replayDeathContext);
                replayDeathContext = null;
            }
        } else {
            // Render the level background with a non-gameOver state for replay
            var replayRenderState = Object.assign({}, state, { gameOver: false });
            var replayInterp = {
                progress: 0, prevSnake: null, prevHunter: null,
                hunterTrail: [], trailHistory: [],
                highScore: endlessMode ? getEndlessHighScore() : highScore,
                endlessHighWave: endlessMode ? getEndlessHighWave() : 0,
            };

            var replayOffset = frameSettings.screenShake ? getShakeOffset(shakeState) : { x: 0, y: 0 };
            ctx.save();
            ctx.translate(replayOffset.x, replayOffset.y);

            render(ctx, replayRenderState, konamiActivated, dom, replayInterp);

            // Render ghost snake on top
            var currentFrame = getReplayFrame(replayState);
            var trailFrames = getReplayTrail(replayState);
            var replayProgress = getReplayProgress(replayState);
            renderReplayGhost(ctx, currentFrame, trailFrames, config, replayProgress);

            renderMatrixRain(ctx, matrixState);
            if (frameSettings.particles) {
                renderParticles(ctx, particleSystem);
            }

            ctx.restore();

            requestAnimationFrame(gameLoop);
            return;
        }
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

        // --- Record frame for death replay ---
        if (state.started && !state.gameOver) {
            replayBuffer = recordFrame(replayBuffer, state);
        }

        // --- Hunter Trail Tracking ---
        if (state.hunter && !state.gameOver) {
            hunterTrailHistory = [state.hunter.segments[0]].concat(hunterTrailHistory.slice(0, 2));
        }

        // --- Snake Trail Tracking ---
        if (state.started && !state.gameOver && prevSnake) {
            var tail = prevSnake[prevSnake.length - 1];
            snakeTrailHistory = [tail].concat(snakeTrailHistory.slice(0, 7));
        }

        // Check for final death — start replay instead of immediate game-over
        var isFinalDeath = state.gameOver && !prevState.gameOver && state.lives <= 1;
        if (isFinalDeath && replayBuffer.frames.length > 0 && !replayState) {
            // Stash the death context and start replay
            replayDeathContext = buildEventCtx(prevState, prevLevel, config);
            replayState = startReplay(replayBuffer, speed);
        } else {
            // Normal flow: process post-tick events immediately
            var eventCtx = buildEventCtx(prevState, prevLevel, config);
            processPostTickEvents(eventCtx);
            applyEventCtx(eventCtx);
        }

        // Sync canvas dimensions if grid size changed (level transition)
        if (canvas.width !== CANVAS_SIZE) {
            canvas.width = CANVAS_SIZE;
            canvas.height = CANVAS_SIZE;
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
        trailHistory: snakeTrailHistory,
        highScore: endlessMode ? getEndlessHighScore() : highScore,
        endlessHighWave: endlessMode ? getEndlessHighWave() : 0,
    };

    // Apply screen shake (respects settings)
    var offset = frameSettings.screenShake ? getShakeOffset(shakeState) : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(offset.x, offset.y);

    render(ctx, state, konamiActivated, dom, interp);
    renderMatrixRain(ctx, matrixState);
    if (frameSettings.particles) {
        renderParticles(ctx, particleSystem);
    }

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

    // Achievement popup (rendered outside shake transform, on all gameplay screens)
    if (!achievementPopup && achievementPopupQueue.length > 0) {
        achievementPopup = achievementPopupQueue.shift();
    }
    if (achievementPopup) {
        var popupActive = renderPopup(ctx, achievementPopup);
        if (!popupActive) {
            achievementPopup = null;
        }
    }

    requestAnimationFrame(gameLoop);
}

// --- Start on title screen ---
hideGameplayUI();
requestAnimationFrame(gameLoop);
