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

        // --- Ending Screen ---
        if (screen === 'ending') {
            // Loop ending auto-returns — no manual advance
            var endingType = callbacks.getEndingType ? callbacks.getEndingType() : null;
            if (endingType !== 'loop' && (e.key === 'Enter' || e.key === 'Escape')) {
                e.preventDefault();
                callbacks.onEndingAdvance();
            }
            return;
        }

        // --- Codex Screen ---
        if (screen === 'codex') {
            if (e.key === 'Escape') {
                e.preventDefault();
                callbacks.onCodexBack();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                callbacks.onCodexScroll(-1);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                callbacks.onCodexScroll(1);
                return;
            }
            return;
        }

        // --- Archive Screen ---
        if (screen === 'archive') {
            if (e.key === 'Escape') {
                e.preventDefault();
                callbacks.onArchiveBack();
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                callbacks.onArchiveTabChange(-1);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                callbacks.onArchiveTabChange(1);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                callbacks.onArchiveScroll(-1);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                callbacks.onArchiveScroll(1);
                return;
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
            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                callbacks.onTitleCodex();
                return;
            }
            if (e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                callbacks.onTitleArchive();
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
