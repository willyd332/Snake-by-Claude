'use strict';

// --- Game Callbacks Factory ---
// Returns the gameCallbacks object used by input.js and touch.js.
// Extracted from main.js to keep that file under the 800-line limit.
//
// Parameters:
//   g          - mutable game context object
//   navDeps    - DOM/helper bundle passed to screen-nav helpers
//   hudEl      - HUD element (for showGameplayUI / hideGameplayUI)
//   titleEl    - title element
//   messageEl  - message element
//   canvas     - canvas element (for secrets that need it)
//   konamiRef  - { value: boolean } reference shared with main.js
//   tryUnlock  - achievement unlock helper

import { MAX_LEVEL } from './constants.js';
import { randomPosition } from './state.js';
import {
    initAudio, playMenuSelectSound, playMenuNavigateSound, playStartSound,
    playSecretSound, setSoundEnabled,
} from './audio.js';
import { markPrologueSeen } from './story.js';
import { createTitleState, getHighestLevel } from './screens.js';
import {
    getSettingsItems, toggleSetting, cycleSetting,
} from './settings.js';
import { getArchiveMaxScroll } from './archive.js';
import {
    getGalleryItemCount, SKINS, TRAILS,
    setActiveSkin, setActiveTrail, isSkinUnlocked, isTrailUnlocked,
} from './achievements.js';
import { FRAGMENT_DATA } from './fragments.js';
import { TITLE_MENU_COUNT } from './touch.js';
import {
    handleSecretKey, toggleDevConsole, isDevConsoleOpen,
    applyInvertFilter, markSecretFound,
} from './secrets.js';
import {
    hideGameplayUI,
    switchToTitle, switchToCodex, switchToArchive, switchToGallery,
    switchToSettings, switchToLevelSelect,
    startGameAtLevel, startEndlessMode,
    restartGame, goToTitle, onRestartLevel,
} from './game-context.js';

export function createGameCallbacks(g, navDeps, hudEl, titleEl, messageEl, canvas, konamiRef, tryUnlock) {
    return {
        getState: function() { return g.state; },
        getScreen: function() { return g.currentScreen; },
        getLevelSelectState: function() { return g.levelSelectState; },
        isReplaying: function() { return g.replayState !== null; },
        onReplaySkip: function() { g.replaySkipRequested = true; },

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
            konamiRef.value = !konamiRef.value;
            localStorage.setItem('snake-konami', String(konamiRef.value));
            markSecretFound('konami');
            tryUnlock('rainbow_road');
            messageEl.textContent = konamiRef.value ? 'RAINBOW MODE ACTIVATED' : 'RAINBOW MODE OFF';
            messageEl.className = konamiRef.value ? 'rainbow' : 'active';
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
}
