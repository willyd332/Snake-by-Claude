'use strict';

export function createUI(messageEl) {
    var powerUpMsgTimer = null;
    var shrinkMsgTimer = null;

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

    var comboBreakTimer = null;

    function showComboBreak() {
        messageEl.textContent = 'COMBO BREAK';
        messageEl.className = 'powerup-msg';
        messageEl.style.color = '#f97316';
        if (comboBreakTimer) clearTimeout(comboBreakTimer);
        comboBreakTimer = setTimeout(function() {
            messageEl.textContent = '';
            messageEl.className = '';
            messageEl.style.color = '';
            comboBreakTimer = null;
        }, 900);
    }

    function clearTimers() {
        if (powerUpMsgTimer) { clearTimeout(powerUpMsgTimer); powerUpMsgTimer = null; }
        if (shrinkMsgTimer) { clearTimeout(shrinkMsgTimer); shrinkMsgTimer = null; }
        if (comboBreakTimer) { clearTimeout(comboBreakTimer); comboBreakTimer = null; }
    }

    return {
        showPowerUpCollected: showPowerUpCollected,
        showShrinkMessage: showShrinkMessage,
        showComboBreak: showComboBreak,
        clearTimers: clearTimers,
    };
}
