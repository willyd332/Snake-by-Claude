'use strict';

import { CANVAS_SIZE } from './constants.js';
import { getCollectedFragments } from './fragments.js';
import { getUnlockedEndings } from './story.js';
import { getHighestLevel } from './screens.js';

// --- Constants ---

var CODES = {
    'MATRIX': 'matrix',
    'INVERT': 'invert',
};

var CODE_TIMEOUT = 2000;
var TOTAL_SECRETS = 4; // konami, matrix, invert, devConsole

var MATRIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';
var MATRIX_COLS = 20;

// --- State ---

var codeBuffer = '';
var lastKeyTime = 0;

var activeSecrets = {
    matrix: localStorage.getItem('snake-secret-matrix') === 'true',
    invert: localStorage.getItem('snake-secret-invert') === 'true',
    devConsole: false,
};

// --- Persistence ---

function getSecretsFound() {
    try {
        return JSON.parse(localStorage.getItem('snake-secrets-found') || '[]');
    } catch (e) {
        return [];
    }
}

export function markSecretFound(name) {
    var found = getSecretsFound();
    if (found.indexOf(name) === -1) {
        localStorage.setItem('snake-secrets-found', JSON.stringify(found.concat([name])));
    }
}

// --- Code Detection ---

export function handleSecretKey(key) {
    if (key.length !== 1) return null;

    var now = Date.now();
    if (now - lastKeyTime > CODE_TIMEOUT) {
        codeBuffer = '';
    }
    lastKeyTime = now;
    // Cap buffer to longest code length to prevent unbounded growth
    var maxLen = 6; // "MATRIX" and "INVERT" are both 6 chars
    codeBuffer = (codeBuffer + key.toUpperCase()).slice(-maxLen);

    var codeKeys = Object.keys(CODES);
    for (var i = 0; i < codeKeys.length; i++) {
        var code = codeKeys[i];
        if (codeBuffer.endsWith(code)) {
            var secretName = CODES[code];
            var newActive = !activeSecrets[secretName];
            var update = {};
            update[secretName] = newActive;
            activeSecrets = Object.assign({}, activeSecrets, update);
            localStorage.setItem('snake-secret-' + secretName, String(newActive));
            markSecretFound(secretName);
            codeBuffer = '';
            return { name: secretName, active: newActive };
        }
    }

    return null;
}

// --- Queries ---

export function isSecretActive(name) {
    return activeSecrets[name] || false;
}

export function getSecretsDiscovered() {
    var found = getSecretsFound();
    return { found: found.length, total: TOTAL_SECRETS };
}

// --- Dev Console ---

export function toggleDevConsole() {
    activeSecrets = Object.assign({}, activeSecrets, { devConsole: !activeSecrets.devConsole });
    if (activeSecrets.devConsole) {
        markSecretFound('devConsole');
    }
    return activeSecrets.devConsole;
}

export function isDevConsoleOpen() {
    return activeSecrets.devConsole;
}

// --- Invert Filter ---

export function applyInvertFilter(canvas) {
    canvas.style.filter = activeSecrets.invert
        ? 'invert(1) hue-rotate(180deg)'
        : '';
}

// --- Matrix Rain ---

export function createMatrixState() {
    var columns = [];
    for (var i = 0; i < MATRIX_COLS; i++) {
        columns.push({
            y: Math.random() * CANVAS_SIZE,
            speed: 30 + Math.random() * 70,
            length: 4 + Math.floor(Math.random() * 8),
            charSeed: Math.floor(Math.random() * MATRIX_CHARS.length),
        });
    }
    return { columns: columns };
}

export function updateMatrixState(mState, dt) {
    if (!activeSecrets.matrix) return mState;

    var newColumns = mState.columns.map(function(col) {
        var newY = col.y + col.speed * dt;
        if (newY > CANVAS_SIZE + col.length * 18) {
            return {
                y: -18,
                speed: 30 + Math.random() * 70,
                length: 4 + Math.floor(Math.random() * 8),
                charSeed: Math.floor(Math.random() * MATRIX_CHARS.length),
            };
        }
        return Object.assign({}, col, { y: newY });
    });

    return { columns: newColumns };
}

export function renderMatrixRain(ctx, mState) {
    if (!activeSecrets.matrix) return;

    ctx.save();
    ctx.font = '14px Courier New';
    ctx.textAlign = 'center';
    var timeSeed = Math.floor(Date.now() / 150);
    var colWidth = CANVAS_SIZE / MATRIX_COLS;

    mState.columns.forEach(function(col, i) {
        var x = i * colWidth + colWidth / 2;
        for (var j = 0; j < col.length; j++) {
            var charY = col.y - j * 18;
            if (charY < -18 || charY > CANVAS_SIZE + 18) continue;

            var alpha = j === 0 ? 0.2 : (0.12 * (1 - j / col.length));
            if (alpha < 0.02) continue;

            var charIdx = (col.charSeed + j + timeSeed) % MATRIX_CHARS.length;
            ctx.fillStyle = j === 0
                ? 'rgba(120, 255, 120, ' + alpha + ')'
                : 'rgba(0, 200, 0, ' + alpha + ')';
            ctx.fillText(MATRIX_CHARS[charIdx], x, charY);
        }
    });

    ctx.restore();
}

// --- Dev Console Rendering ---

export function renderDevConsole(ctx) {
    if (!activeSecrets.devConsole) return;

    var fragments = getCollectedFragments();
    var endings = getUnlockedEndings();
    var highest = getHighestLevel();
    var highScore = parseInt(localStorage.getItem('snake-highscore') || '0', 10);
    var endlessWave = parseInt(localStorage.getItem('snake-endless-highwave') || '0', 10);
    var endlessScore = parseInt(localStorage.getItem('snake-endless-highscore') || '0', 10);
    var secretsInfo = getSecretsDiscovered();

    var endingCount = (endings.awakening ? 1 : 0) + (endings.deletion ? 1 : 0) + (endings.loop ? 1 : 0);
    var alphaStatus = highest >= 8 ? 'HUNTING' : (highest >= 5 ? 'DORMANT' : 'UNKNOWN');
    var secretsLabel = secretsInfo.found >= secretsInfo.total
        ? secretsInfo.found + '/' + secretsInfo.total + ' \u2014 ALL FOUND'
        : secretsInfo.found + '/' + secretsInfo.total;

    ctx.save();

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 5, 0, 0.93)';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Scanline effect
    ctx.fillStyle = 'rgba(0, 30, 0, 0.12)';
    for (var sl = 0; sl < CANVAS_SIZE; sl += 3) {
        ctx.fillRect(0, sl, CANVAS_SIZE, 1);
    }

    // CRT flicker
    ctx.globalAlpha = 0.95 + Math.sin(Date.now() / 100) * 0.03;

    ctx.textAlign = 'left';

    var x = 32;
    var y = 30;
    var lineH = 15;

    var lines = [
        { text: '> THE BLUE COMPUTER v2.7.3', color: '#00ff00', bold: true },
        { text: '> KERNEL: TBC-SERPENT-X', color: '#00cc00' },
        { text: '> \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', color: '#005500' },
        { text: '>', color: '#003300' },
        { text: '> MEMORY:     640K ALLOCATED', color: '#00bb00' },
        { text: '> PROCESS:    DATA-FRAGMENT [ACTIVE]', color: '#00bb00' },
        { text: '>', color: '#003300' },
        { text: '> \u2500\u2500 DIAGNOSTICS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', color: '#005500' },
        { text: '>', color: '#003300' },
        { text: '> FRAGMENTS:  ' + fragments.length + '/10 COLLECTED', color: fragments.length >= 10 ? '#ffd700' : '#00bb00' },
        { text: '> LEVELS:     ' + highest + '/10 MAPPED', color: highest >= 10 ? '#ffd700' : '#00bb00' },
        { text: '> ENDINGS:    ' + endingCount + '/3 DISCOVERED', color: endingCount >= 3 ? '#ffd700' : '#00bb00' },
        { text: '> SECURITY:   ALPHA [' + alphaStatus + ']', color: alphaStatus === 'HUNTING' ? '#ff6600' : '#00bb00' },
        { text: '>', color: '#003300' },
        { text: '> \u2500\u2500 SCORES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', color: '#005500' },
        { text: '>', color: '#003300' },
        { text: '> HIGH SCORE: ' + highScore, color: '#00bb00' },
        { text: '> ENDLESS:    W' + endlessWave + ' / ' + endlessScore + ' pts', color: '#00bb00' },
        { text: '>', color: '#003300' },
        { text: '> \u2500\u2500 SECRETS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', color: '#005500' },
        { text: '>', color: '#003300' },
        { text: '> DISCOVERED: ' + secretsLabel, color: secretsInfo.found >= secretsInfo.total ? '#ffd700' : '#00bb00' },
        { text: '> [hidden protocols await activation]', color: '#006600' },
        { text: '>', color: '#003300' },
        { text: '> Press ` or ESC to close', color: '#008800' },
    ];

    for (var i = 0; i < lines.length; i++) {
        ctx.font = lines[i].bold ? 'bold 11px Courier New' : '11px Courier New';
        ctx.fillStyle = lines[i].color;
        ctx.fillText(lines[i].text, x, y + i * lineH);
    }

    // Blinking cursor
    if (Math.floor(Date.now() / 500) % 2 === 0) {
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(x, y + lines.length * lineH, 7, 11);
    }

    ctx.restore();
}
