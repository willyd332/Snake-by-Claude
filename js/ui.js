'use strict';

import { LEVEL_NARRATIVES } from './constants.js';

export function createUI(messageEl) {
    var levelUpTimer = null;
    var powerUpMsgTimer = null;
    var shrinkMsgTimer = null;

    function showLevelUp(level) {
        messageEl.textContent = 'LEVEL ' + level + '!';
        messageEl.className = 'levelup';
        if (levelUpTimer) clearTimeout(levelUpTimer);
        levelUpTimer = setTimeout(function() {
            var narrative = LEVEL_NARRATIVES[level];
            if (narrative) {
                messageEl.textContent = narrative;
                messageEl.className = 'narrative';
                levelUpTimer = setTimeout(function() {
                    messageEl.textContent = '';
                    messageEl.className = '';
                    levelUpTimer = null;
                }, 3000);
            } else {
                messageEl.textContent = '';
                messageEl.className = '';
                levelUpTimer = null;
            }
        }, 1500);
    }

    function showPowerUpCollected(typeDef) {
        messageEl.textContent = typeDef.name + ' ACTIVATED';
        messageEl.className = 'powerup-msg';
        messageEl.style.color = typeDef.color;
        if (powerUpMsgTimer) clearTimeout(powerUpMsgTimer);
        powerUpMsgTimer = setTimeout(function() {
            messageEl.textContent = '';
            messageEl.className = '';
            messageEl.style.color = '';
            powerUpMsgTimer = null;
        }, 1500);
    }

    function showShrinkMessage() {
        messageEl.textContent = 'THE WALLS CLOSE IN';
        messageEl.className = 'powerup-msg';
        messageEl.style.color = '#ef4444';
        if (shrinkMsgTimer) clearTimeout(shrinkMsgTimer);
        shrinkMsgTimer = setTimeout(function() {
            messageEl.textContent = '';
            messageEl.className = '';
            messageEl.style.color = '';
            shrinkMsgTimer = null;
        }, 1500);
    }

    function clearTimers() {
        if (levelUpTimer) { clearTimeout(levelUpTimer); levelUpTimer = null; }
        if (powerUpMsgTimer) { clearTimeout(powerUpMsgTimer); powerUpMsgTimer = null; }
        if (shrinkMsgTimer) { clearTimeout(shrinkMsgTimer); shrinkMsgTimer = null; }
    }

    return {
        showLevelUp: showLevelUp,
        showPowerUpCollected: showPowerUpCollected,
        showShrinkMessage: showShrinkMessage,
        clearTimers: clearTimers,
    };
}
