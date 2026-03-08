'use strict';

// --- Game Callbacks Factory ---
// Returns the gameCallbacks object used by input.js and touch.js.

import { randomPosition } from './state.js';
import {
    initAudio, playMenuSelectSound, playMenuNavigateSound, playStartSound,
    playSecretSound, setSoundEnabled, isSoundEnabled,
    getAudioContext, getMasterGain,
} from './audio.js';
import {
    startMusic, toggleMusicMute, setMusicVolume,
} from './music.js';
import { createTitleState } from './screens.js';
import {
    getSettingsItems, toggleSetting, cycleSetting,
} from './settings.js';
import {
    getGalleryItemCount, SKINS, TRAILS,
    setActiveSkin, setActiveTrail, isSkinUnlocked, isTrailUnlocked,
} from './achievements.js';
import { TITLE_MENU_COUNT } from './touch.js';
import {
    handleSecretKey, toggleDevConsole, isDevConsoleOpen,
    applyInvertFilter, markSecretFound,
} from './secrets.js';
import {
    hideGameplayUI,
    switchToTitle, switchToGallery,
    switchToSettings,
    startEndlessMode,
    restartGame, goToTitle, onRestartLevel,
} from './game-context.js';

export function createGameCallbacks(g, navDeps, hudEl, titleEl, messageEl, canvas, konamiRef, tryUnlock) {
    return {
        getState: function() { return g.state; },
        getScreen: function() { return g.currentScreen; },
        isReplaying: function() { return g.replayState !== null; },
        isSummaryVisible: function() { return !!g.summaryVisible; },
        onReplaySkip: function() { g.replaySkipRequested = true; },

        // Title screen actions
        onTitlePlay: function() {
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
                var cycled = cycleSetting(item.key, item.options, direction);
                if (item.key === 'musicLevel') {
                    setMusicVolume(cycled.musicVolume);
                }
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
                    messageEl.textContent = 'Swipe or press arrow to begin';
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
                            messageEl.textContent = 'Swipe or press arrow to begin';
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
            restartGame(g, navDeps, newDir);
            startMusic(getAudioContext(), getMasterGain());
        },

        startGame: function(newDir) {
            playStartSound();
            startMusic(getAudioContext(), getMasterGain());
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

        onToggleMusic: function() {
            var muted = toggleMusicMute();
            if (g.state.started && !g.state.gameOver) {
                messageEl.textContent = muted ? 'Music OFF' : 'Music ON';
                messageEl.className = 'active';
                setTimeout(function() {
                    if (g.state.started && !g.state.gameOver) {
                        messageEl.textContent = '';
                        messageEl.className = '';
                    }
                }, 1200);
            }
        },

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
