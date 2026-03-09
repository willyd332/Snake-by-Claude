'use strict';

import { KONAMI_SEQUENCE } from './constants.js';
import { isMilestoneActive, dismissMilestone } from './milestone.js';

var DIRECTION_MAP = {
    ArrowUp:    { x: 0, y: -1 },
    ArrowDown:  { x: 0, y: 1 },
    ArrowLeft:  { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
};

export function setupInput(callbacks) {
    var konamiProgress = 0;

    document.addEventListener('keydown', function(e) {
        var screen = callbacks.getScreen();

        // Dismiss milestone overlay on any key
        if (isMilestoneActive()) { dismissMilestone(); return; }

        // --- Title Screen ---
        if (screen === 'title') {
            // Dev console open — only accept close keys
            if (callbacks.isDevConsoleOpen && callbacks.isDevConsoleOpen()) {
                if (e.key === '`' || e.key === 'Escape') {
                    e.preventDefault();
                    callbacks.onToggleDevConsole();
                }
                return;
            }
            // Backtick opens dev console
            if (e.key === '`') {
                e.preventDefault();
                callbacks.onToggleDevConsole();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                callbacks.onTitlePlay();
                return;
            }
            if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                callbacks.onTitleModifiers();
                return;
            }
            if (e.key === 't' || e.key === 'T') {
                e.preventDefault();
                callbacks.onTitleGallery();
                return;
            }
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                callbacks.onTitleSettings();
                return;
            }
            return;
        }

        // --- Settings Screen ---
        if (screen === 'settings') {
            if (e.key === 'Escape') {
                e.preventDefault();
                callbacks.onSettingsBack();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                callbacks.onSettingsNavigate(-1);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                callbacks.onSettingsNavigate(1);
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                callbacks.onSettingsToggle(-1);
                return;
            }
            if (e.key === 'Enter' || e.key === 'ArrowRight') {
                e.preventDefault();
                callbacks.onSettingsToggle(1);
                return;
            }
            return;
        }

        // --- Modifiers Screen ---
        if (screen === 'modifiers') {
            if (e.key === 'Escape') {
                e.preventDefault();
                callbacks.onModifiersBack();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                callbacks.onModifiersNavigate(-1);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                callbacks.onModifiersNavigate(1);
                return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                callbacks.onModifiersToggle();
                return;
            }
            return;
        }

        // --- Gallery Screen ---
        if (screen === 'gallery') {
            if (e.key === 'Escape') {
                e.preventDefault();
                callbacks.onGalleryBack();
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                callbacks.onGalleryTabChange(-1);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                callbacks.onGalleryTabChange(1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                callbacks.onGalleryNavigate(-1);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                callbacks.onGalleryNavigate(1);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                callbacks.onGallerySelect();
                return;
            }
            return;
        }

        // --- Gameplay ---
        var state = callbacks.getState();

        // During death replay: skip on Space/Escape/Enter, block everything else
        if (callbacks.isReplaying && callbacks.isReplaying()) {
            e.preventDefault();
            if (e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') {
                callbacks.onReplaySkip();
            }
            return;
        }

        // While run summary is visible: block all gameplay keys (summary handles input)
        if (callbacks.isSummaryVisible && callbacks.isSummaryVisible()) {
            return;
        }

        // While power-up choice overlay is active: block gameplay keys (choice handles input)
        if (callbacks.isPowerUpChoiceActive && callbacks.isPowerUpChoiceActive()) {
            return;
        }

        // ESC to return to title (when not mid-game)
        if (e.key === 'Escape' && (!state.started || state.gameOver)) {
            e.preventDefault();
            callbacks.goToTitle();
            return;
        }

        // R to restart on game over
        if (state.gameOver && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            callbacks.onRestartLevel();
            return;
        }

        // Konami code detection (only before game starts)
        if (!state.started && !state.gameOver) {
            if (e.key === KONAMI_SEQUENCE[konamiProgress]) {
                konamiProgress++;
                e.preventDefault();
                if (konamiProgress >= KONAMI_SEQUENCE.length) {
                    konamiProgress = 0;
                    callbacks.toggleKonami();
                }
                return;
            }
            konamiProgress = 0;

            // Secret code detection (letter keys only)
            if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
                e.preventDefault();
                callbacks.onSecretKey(e.key);
                return;
            }
        }

        // M key: toggle music mute (during gameplay)
        if ((e.key === 'm' || e.key === 'M') && state.started && !state.gameOver) {
            e.preventDefault();
            if (callbacks.onToggleMusic) {
                callbacks.onToggleMusic();
            }
            return;
        }

        var newDir = DIRECTION_MAP[e.key];
        if (!newDir) return;

        e.preventDefault();

        if (state.gameOver) {
            callbacks.restartGame(newDir);
            return;
        }

        if (!state.started) {
            callbacks.startGame(newDir);
            return;
        }

        // Prevent 180-degree reversal (unless Glass Snake modifier is active
        // — in which case let it through so tick can kill the snake)
        var isOpposite = (newDir.x + state.direction.x === 0 && newDir.y + state.direction.y === 0);
        var glassSnakeActive = state.modifiers && state.modifiers.indexOf('glass_snake') !== -1;
        if (!isOpposite || glassSnakeActive) {
            callbacks.changeDirection(newDir);
        }
    });
}
