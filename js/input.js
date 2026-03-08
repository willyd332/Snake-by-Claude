'use strict';

import { KONAMI_SEQUENCE } from './constants.js';

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

        // --- Prologue ---
        if (screen === 'prologue') {
            if (e.key === 'Enter') {
                e.preventDefault();
                callbacks.onPrologueAdvance();
            }
            return;
        }

        // --- Story Screen (inter-level) ---
        if (screen === 'story_screen') {
            if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                callbacks.onStoryScreenAdvance();
            }
            return;
        }

        // --- Title Screen ---
        if (screen === 'title') {
            if (e.key === 'Enter') {
                e.preventDefault();
                callbacks.onTitlePlay();
                return;
            }
            if (e.key === 'l' || e.key === 'L') {
                e.preventDefault();
                callbacks.onTitleLevelSelect();
                return;
            }
            return;
        }

        // --- Level Select ---
        if (screen === 'levelSelect') {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                callbacks.onLevelSelectNavigate(-2);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                callbacks.onLevelSelectNavigate(2);
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                callbacks.onLevelSelectNavigate(-1);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                callbacks.onLevelSelectNavigate(1);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                callbacks.onLevelSelectConfirm();
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                callbacks.onLevelSelectBack();
                return;
            }
            return;
        }

        // --- Gameplay ---
        var state = callbacks.getState();

        // ESC to return to title (when not mid-game)
        if (e.key === 'Escape' && (!state.started || state.gameOver)) {
            e.preventDefault();
            callbacks.goToTitle();
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

        // Prevent 180-degree reversal
        var isOpposite = (newDir.x + state.direction.x === 0 && newDir.y + state.direction.y === 0);
        if (!isOpposite) {
            callbacks.changeDirection(newDir);
        }
    });
}
