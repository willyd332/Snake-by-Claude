'use strict';

// --- Level Names ---
// Single source of truth for level display names.

export var LEVEL_NAMES = {
    1: 'The Beginning',
    2: 'Ancient Stones',
    3: 'The Corridors',
    4: 'The Cage',
    5: 'The Labyrinth',
    6: 'Fog of War',
    7: 'Power Surge',
    8: 'The Hunt',
    9: 'The Collapse',
    10: 'The Convergence',
};

// --- Text Wrapping ---
// Wraps text to fit within a given pixel width using canvas measureText.

export function wrapText(ctx, text, maxWidth) {
    var words = text.split(' ');
    var lines = [];
    var currentLine = '';

    for (var i = 0; i < words.length; i++) {
        var testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}
