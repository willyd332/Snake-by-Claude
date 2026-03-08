'use strict';

var SWIPE_THRESHOLD = 30;
var TAP_THRESHOLD = 15;
var LONG_PRESS_MS = 500;

var DIRECTION_MAP = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

var TITLE_MENU_ACTIONS = [
    'onTitlePlay',
    'onTitleLevelSelect',
    'onTitleCodex',
    'onTitleArchive',
    'onTitleEndless',
    'onTitleGallery',
    'onTitleSettings',
];

export var TITLE_MENU_COUNT = TITLE_MENU_ACTIONS.length;

export function setupTouch(canvas, callbacks) {
    var startX = 0;
    var startY = 0;
    var startTime = 0;
    var longPressTimer = null;
    var longPressFired = false;

    function getSwipeDirection(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'right' : 'left';
        }
        return dy > 0 ? 'down' : 'up';
    }

    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        var touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startTime = Date.now();
        longPressFired = false;

        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(function() {
            longPressFired = true;
            handleLongPress();
        }, LONG_PRESS_MS);
    }, { passive: false });

    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault();
        var touch = e.touches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;
        if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }
    }, { passive: false });

    canvas.addEventListener('touchcancel', function() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressFired = false;
    }, { passive: false });

    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (longPressFired) return;

        var touch = e.changedTouches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < TAP_THRESHOLD) {
            handleTap();
        } else if (dist >= SWIPE_THRESHOLD) {
            handleSwipe(getSwipeDirection(dx, dy));
        }
    }, { passive: false });

    function handleTap() {
        // Block tap during death replay
        if (callbacks.isReplaying && callbacks.isReplaying()) return;

        var screen = callbacks.getScreen();

        if (screen === 'prologue') {
            callbacks.onPrologueAdvance();
            return;
        }
        if (screen === 'ending') {
            var endingType = callbacks.getEndingType ? callbacks.getEndingType() : null;
            if (endingType !== 'loop') {
                callbacks.onEndingAdvance();
            }
            return;
        }
        if (screen === 'title') {
            var idx = callbacks.getTitleMenuIndex();
            if (idx === null || idx === undefined) idx = 0;
            var actionName = TITLE_MENU_ACTIONS[idx];
            if (callbacks[actionName]) {
                callbacks[actionName]();
            }
            return;
        }
        if (screen === 'levelSelect') {
            callbacks.onLevelSelectConfirm();
            return;
        }
        if (screen === 'gallery') {
            callbacks.onGallerySelect();
            return;
        }
        if (screen === 'settings') {
            callbacks.onSettingsToggle(1);
            return;
        }

        var state = callbacks.getState();
        if (state.gameOver) {
            callbacks.onRestartLevel();
        }
    }

    function handleSwipe(direction) {
        // Block swipe during death replay
        if (callbacks.isReplaying && callbacks.isReplaying()) return;

        var screen = callbacks.getScreen();
        var newDir = DIRECTION_MAP[direction];

        if (screen === 'prologue') {
            callbacks.onPrologueAdvance();
            return;
        }
        if (screen === 'ending') {
            var endingType = callbacks.getEndingType ? callbacks.getEndingType() : null;
            if (endingType !== 'loop') {
                callbacks.onEndingAdvance();
            }
            return;
        }
        if (screen === 'title') {
            if (direction === 'up' || direction === 'down') {
                callbacks.onTitleMenuNavigate(direction === 'down' ? 1 : -1);
            }
            return;
        }
        if (screen === 'codex') {
            if (direction === 'up') callbacks.onCodexScroll(-1);
            else if (direction === 'down') callbacks.onCodexScroll(1);
            return;
        }
        if (screen === 'archive') {
            if (direction === 'left') callbacks.onArchiveTabChange(-1);
            else if (direction === 'right') callbacks.onArchiveTabChange(1);
            else if (direction === 'up') callbacks.onArchiveScroll(-1);
            else if (direction === 'down') callbacks.onArchiveScroll(1);
            return;
        }
        if (screen === 'gallery') {
            if (direction === 'left') callbacks.onGalleryTabChange(-1);
            else if (direction === 'right') callbacks.onGalleryTabChange(1);
            else if (direction === 'up') callbacks.onGalleryNavigate(-1);
            else if (direction === 'down') callbacks.onGalleryNavigate(1);
            return;
        }
        if (screen === 'settings') {
            if (direction === 'up') callbacks.onSettingsNavigate(-1);
            else if (direction === 'down') callbacks.onSettingsNavigate(1);
            else if (direction === 'left') callbacks.onSettingsToggle(-1);
            else if (direction === 'right') callbacks.onSettingsToggle(1);
            return;
        }
        if (screen === 'levelSelect') {
            if (direction === 'up') callbacks.onLevelSelectNavigate(-2);
            else if (direction === 'down') callbacks.onLevelSelectNavigate(2);
            else if (direction === 'left') callbacks.onLevelSelectNavigate(-1);
            else if (direction === 'right') callbacks.onLevelSelectNavigate(1);
            return;
        }

        // Gameplay
        var state = callbacks.getState();

        if (state.gameOver) {
            callbacks.restartGame(newDir);
            return;
        }
        if (!state.started) {
            callbacks.startGame(newDir);
            return;
        }

        var isOpposite = (newDir.x + state.direction.x === 0 && newDir.y + state.direction.y === 0);
        if (!isOpposite) {
            callbacks.changeDirection(newDir);
        }
    }

    function handleLongPress() {
        // Block long press during death replay
        if (callbacks.isReplaying && callbacks.isReplaying()) return;

        var screen = callbacks.getScreen();

        if (screen === 'codex') { callbacks.onCodexBack(); return; }
        if (screen === 'archive') { callbacks.onArchiveBack(); return; }
        if (screen === 'gallery') { callbacks.onGalleryBack(); return; }
        if (screen === 'settings') { callbacks.onSettingsBack(); return; }
        if (screen === 'levelSelect') { callbacks.onLevelSelectBack(); return; }

        var state = callbacks.getState();
        if (screen === 'gameplay' && (!state.started || state.gameOver)) {
            callbacks.goToTitle();
        }
    }
}
