'use strict';

import { CANVAS_SIZE, MAX_LEVEL, getGridOffset } from './constants.js';
import { createInitialState, randomPosition, getLevelConfig } from './state.js';
import { tick } from './tick.js';
import { render } from './renderer.js';
import { createUI } from './ui.js';
import { setupInput } from './input.js';
import { setupTouch, TITLE_MENU_COUNT } from './touch.js';
import { getPowerUpDef } from './powerups.js';
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
    playSecretSound, setSoundEnabled,
} from './audio.js';
import {
    FRAGMENT_DATA, getFragmentForLevel, isFragmentCollected,
    renderFragmentOverlay, renderCodex,
} from './fragments.js';
import { createArchiveState, renderArchive, getArchiveMaxScroll } from './archive.js';
import { getEndlessHighScore, getEndlessHighWave } from './endless.js';
import { processPostTickEvents } from './game-events.js';
import {
    createReplayBuffer, recordFrame, startReplay,
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
import {
    showGameplayUI, hideGameplayUI,
    switchToTitle, switchToCodex, switchToArchive, switchToGallery,
    switchToSettings, switchToLevelSelect,
    startGameAtLevel, startEndlessMode,
    buildEventCtx, applyEventCtx,
    restartGame, goToTitle, onRestartLevel,
} from './game-context.js';
import { runReplayFrame } from './replay-loop.js';

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
    storyScreenState: null,
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
    replayDeathContext: null,
    levelStartTime: 0,
    gameSessionStartTime: 0,
    titleMenuIndex: null,

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
var konamiActivated = localStorage.getItem('snake-konami') === 'true';

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
var gameCallbacks = {
    getState: function() { return g.state; },
    getScreen: function() { return g.currentScreen; },
    getLevelSelectState: function() { return g.levelSelectState; },
    isReplaying: function() { return g.replayState !== null; },

    // Prologue actions
    onPrologueAdvance: function() {
        initAudio();
        markPrologueSeen();
        playMenuSelectSound();
        g.prologueState = null;
        g.currentScreen = 'title';
        g.titleState = createTitleState();
        hideGameplayUI(hudEl, titleEl, messageEl);
    },

    // Story screen actions (inter-level)
    onStoryScreenAdvance: function() {
        playMenuSelectSound();
        g.storyScreenState = null;
        g.currentScreen = 'gameplay';
        showGameplayUI(hudEl, titleEl, messageEl);
        g.prevSnake = null;
        g.prevHunterSegments = null;
        // Reset lastTick so game doesn't try to catch up on elapsed time
        g.state = Object.assign({}, g.state, { lastTick: 0 });
    },

    // Ending screen actions
    getEndingType: function() { return g.endingState ? g.endingState.endingType : null; },
    onEndingAdvance: function() {
        playMenuSelectSound();
        g.endingState = null;
        switchToTitle(g, navDeps);
    },

    // Title screen actions
    onTitlePlay: function() {
        initAudio();
        playMenuSelectSound();
        startGameAtLevel(g, navDeps, 1);
    },
    onTitleLevelSelect: function() {
        initAudio();
        playMenuSelectSound();
        switchToLevelSelect(g, navDeps);
    },
    onTitleCodex: function() {
        initAudio();
        playMenuSelectSound();
        switchToCodex(g, navDeps);
    },
    onTitleArchive: function() {
        initAudio();
        playMenuSelectSound();
        switchToArchive(g, navDeps, 0);
    },
    onTitleEndless: function() {
        initAudio();
        playMenuSelectSound();
        startEndlessMode(g, navDeps);
    },
    onTitleGallery: function() {
        initAudio();
        playMenuSelectSound();
        switchToGallery(g, navDeps);
    },
    onTitleSettings: function() {
        initAudio();
        playMenuSelectSound();
        switchToSettings(g, navDeps);
    },

    // Settings actions
    onSettingsBack: function() {
        playMenuNavigateSound();
        switchToTitle(g, navDeps);
    },
    onSettingsNavigate: function(delta) {
        var count = getSettingsItems().length;
        var newIdx = g.settingsState.selectedIndex + delta;
        if (newIdx >= 0 && newIdx < count) {
            playMenuNavigateSound();
            g.settingsState = Object.assign({}, g.settingsState, { selectedIndex: newIdx });
        }
    },
    onSettingsToggle: function(direction) {
        var items = getSettingsItems();
        var item = items[g.settingsState.selectedIndex];
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
        switchToTitle(g, navDeps);
    },
    onArchiveTabChange: function(delta) {
        var newTab = g.archiveState.tab + delta;
        if (newTab >= 0 && newTab <= 2) {
            playMenuNavigateSound();
            g.archiveState = Object.assign({}, g.archiveState, { tab: newTab, scrollOffset: 0 });
        }
    },
    onArchiveScroll: function(delta) {
        var maxScroll = getArchiveMaxScroll(g.archiveState.tab);
        var newOffset = Math.max(0, Math.min(maxScroll, g.archiveState.scrollOffset + delta));
        if (newOffset !== g.archiveState.scrollOffset) {
            playMenuNavigateSound();
            g.archiveState = Object.assign({}, g.archiveState, { scrollOffset: newOffset });
        }
    },

    // Gallery actions
    onGalleryBack: function() {
        playMenuNavigateSound();
        switchToTitle(g, navDeps);
    },
    onGalleryTabChange: function(delta) {
        var newTab = g.galleryState.tab + delta;
        if (newTab >= 0 && newTab <= 3) {
            playMenuNavigateSound();
            g.galleryState = Object.assign({}, g.galleryState, { tab: newTab, scrollOffset: 0, selectedIndex: 0 });
        }
    },
    onGalleryNavigate: function(delta) {
        var count = getGalleryItemCount(g.galleryState.tab);
        if (g.galleryState.tab === 0 || g.galleryState.tab === 3) {
            // Achievements/Stats tabs: scroll
            var newScroll = g.galleryState.scrollOffset + delta;
            newScroll = Math.max(0, Math.min(count - 1, newScroll));
            if (newScroll !== g.galleryState.scrollOffset) {
                playMenuNavigateSound();
                g.galleryState = Object.assign({}, g.galleryState, { scrollOffset: newScroll, selectedIndex: newScroll });
            }
        } else {
            // Skins/Trails: select
            var newIdx = Math.max(0, Math.min(count - 1, g.galleryState.selectedIndex + delta));
            if (newIdx !== g.galleryState.selectedIndex) {
                playMenuNavigateSound();
                g.galleryState = Object.assign({}, g.galleryState, { selectedIndex: newIdx });
            }
        }
    },
    onGallerySelect: function() {
        if (g.galleryState.tab === 1) {
            var skin = SKINS[g.galleryState.selectedIndex];
            if (skin && isSkinUnlocked(skin.id)) {
                playMenuSelectSound();
                setActiveSkin(skin.id);
            }
        } else if (g.galleryState.tab === 2) {
            var trail = TRAILS[g.galleryState.selectedIndex];
            if (trail && isTrailUnlocked(trail.id)) {
                playMenuSelectSound();
                setActiveTrail(trail.id);
            }
        }
    },

    // Codex actions
    onCodexBack: function() {
        playMenuNavigateSound();
        switchToTitle(g, navDeps);
    },
    onCodexScroll: function(delta) {
        var maxScroll = Math.max(0, FRAGMENT_DATA.length - 8);
        var newOffset = Math.max(0, Math.min(maxScroll, g.codexState.scrollOffset + delta));
        if (newOffset !== g.codexState.scrollOffset) {
            playMenuNavigateSound();
            g.codexState = Object.assign({}, g.codexState, { scrollOffset: newOffset });
        }
    },

    // Level select actions
    onLevelSelectNavigate: function(delta) {
        var highest = getHighestLevel();
        var newLevel = g.levelSelectState.selectedLevel + delta;
        if (newLevel >= 1 && newLevel <= Math.min(highest, MAX_LEVEL)) {
            playMenuNavigateSound();
            g.levelSelectState = Object.assign({}, g.levelSelectState, {
                selectedLevel: newLevel,
            });
        }
    },
    onLevelSelectConfirm: function() {
        var highest = getHighestLevel();
        if (g.levelSelectState.selectedLevel <= highest) {
            playMenuSelectSound();
            startGameAtLevel(g, navDeps, g.levelSelectState.selectedLevel);
        }
    },
    onLevelSelectBack: function() {
        playMenuNavigateSound();
        switchToTitle(g, navDeps);
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
            if (!g.state.started) {
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
                    if (!g.state.started) {
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

    restartGame: function(newDir) { restartGame(g, navDeps, newDir); },

    startGame: function(newDir) {
        playStartSound();
        g.prevSnake = null;
        g.prevHunterSegments = null;
        g.state = Object.assign({}, g.state, {
            started: true,
            nextDirection: newDir,
            food: randomPosition(g.state.snake, g.state.walls, g.state.obstacles, g.state.portals, g.state.powerUp, g.state.hunter),
        });
        messageEl.textContent = '';
        messageEl.className = '';
    },

    changeDirection: function(newDir) {
        g.state = Object.assign({}, g.state, { nextDirection: newDir });
    },

    goToTitle: function() { goToTitle(g, navDeps); },

    onRestartLevel: function() { onRestartLevel(g, navDeps); },

    // Touch-specific callbacks
    getTitleMenuIndex: function() { return g.titleMenuIndex; },
    onTitleMenuNavigate: function(delta) {
        initAudio();
        if (g.titleMenuIndex === null) {
            g.titleMenuIndex = 0;
            playMenuNavigateSound();
            return;
        }
        var newIdx = g.titleMenuIndex + delta;
        if (newIdx >= 0 && newIdx < TITLE_MENU_COUNT) {
            playMenuNavigateSound();
            g.titleMenuIndex = newIdx;
        }
    },
};

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

    if (g.currentScreen === 'story_screen') {
        renderStoryScreen(ctx, g.storyScreenState);
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
        var replayResult = runReplayFrame({
            ctx: ctx,
            replayState: g.replayState,
            timestamp: timestamp,
            speed: speed,
            config: config,
            gameState: g.state,
            konamiActivated: konamiActivated,
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
            // Replay finished — process stashed death events
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
            // Stash the death context and start replay
            g.replayDeathContext = buildEventCtx(g, prevState, prevLevel, config, navDeps);
            g.replayState = startReplay(g.replayBuffer, speed);
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

    render(ctx, g.state, konamiActivated, dom, interp);
    renderMatrixRain(ctx, matrixState);
    if (frameSettings.particles) {
        renderParticles(ctx, g.particleSystem);
    }

    ctx.restore();

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
