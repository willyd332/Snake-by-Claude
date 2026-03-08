'use strict';

// --- Leaderboard ---
// Manages top-10 high scores in localStorage.
// Key: tbc-snake-leaderboard
// Entry: { score, wave, snakeLength, date }

var STORAGE_KEY = 'tbc-snake-leaderboard';
var MAX_ENTRIES = 10;

var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Returns the stored leaderboard array (sorted by score descending).
// Returns [] if localStorage is unavailable or empty.
export function loadLeaderboard() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch (_) {
        return [];
    }
}

// Adds a new entry to the leaderboard. Returns an object:
// { board: Entry[], rank: number|null }
// rank is 1-based position if the entry made the top 10, otherwise null.
export function addLeaderboardEntry(entry) {
    var board = loadLeaderboard();
    var newEntry = {
        score: entry.score || 0,
        wave: entry.wave || 1,
        snakeLength: entry.snakeLength || 1,
        date: entry.date || formatDate(new Date()),
    };

    var updated = board.concat([newEntry]);
    updated.sort(function(a, b) { return b.score - a.score; });
    var trimmed = updated.slice(0, MAX_ENTRIES);

    var rank = null;
    for (var i = 0; i < trimmed.length; i++) {
        if (
            trimmed[i].score === newEntry.score &&
            trimmed[i].wave === newEntry.wave &&
            trimmed[i].date === newEntry.date
        ) {
            rank = i + 1;
            break;
        }
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (_) {
        // localStorage unavailable — return rank based on in-memory sort
    }

    return { board: trimmed, rank: rank };
}

// Formats a Date as "Mar 8"
export function formatDate(date) {
    return MONTH_NAMES[date.getMonth()] + ' ' + date.getDate();
}
