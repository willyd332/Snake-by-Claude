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
        var state = callbacks.getState();

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
