'use strict';

// --- Run Summary Screen ---
// Renders a DOM overlay with post-death statistics after the death replay ends.
// Call showRunSummary(data, onRestart, onMenu) to display.
// Returns a cleanup function that removes the overlay.
//
// data: {
//   wave: number,
//   score: number,
//   timeAliveMs: number (ms duration),
//   foodEaten: number,
//   deathCause: string (raw cause key),
//   killedByHunter: boolean,
//   powerUpsCollected: number,
//   highScore: number,
//   previousHighScore: number,
// }

import { addLeaderboardEntry, formatDate } from './leaderboard.js';

var DEATH_CAUSE_LABELS = {
    boundary:  'Hit a wall',
    arena:     'Crushed by shrinking arena',
    wall:      'Hit a wall segment',
    self:      'Bit your own tail',
    obstacle:  'Struck a moving obstacle',
    hunter:    'Devoured by ALPHA',
    crush:     'Crushed by shrinking arena',
};

function formatDeathCause(deathCause, killedByHunter) {
    if (killedByHunter) return 'Devoured by ALPHA';
    return DEATH_CAUSE_LABELS[deathCause] || 'Unknown cause';
}

function formatTimeAlive(timeAliveMs) {
    if (!timeAliveMs || timeAliveMs <= 0) return '--:--';
    var totalSeconds = Math.floor(timeAliveMs / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function createStatRow(label, value, valueColor) {
    var row = document.createElement('div');
    row.style.cssText = [
        'display: flex',
        'justify-content: space-between',
        'align-items: baseline',
        'padding: 6px 0',
        'border-bottom: 1px solid rgba(255,255,255,0.05)',
        'gap: 16px',
    ].join(';');

    var labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: rgba(160, 160, 180, 0.8); font-size: 12px;';

    var valueEl = document.createElement('span');
    valueEl.textContent = value;
    valueEl.style.cssText = [
        'font-weight: bold',
        'font-size: 13px',
        'color: ' + (valueColor || '#e0e0e0'),
        'white-space: nowrap',
    ].join(';');

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
}

function createButton(text, primary, onClick) {
    var btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = [
        'font-family: "Courier New", monospace',
        'font-size: 13px',
        'font-weight: bold',
        'letter-spacing: 1px',
        'padding: 12px 24px',
        'border-radius: 4px',
        'cursor: pointer',
        'min-width: 120px',
        'min-height: 44px',
        'border: 1px solid ' + (primary ? 'rgba(74, 158, 255, 0.6)' : 'rgba(255,255,255,0.15)'),
        'background: ' + (primary ? 'rgba(74, 158, 255, 0.15)' : 'rgba(255,255,255,0.05)'),
        'color: ' + (primary ? '#4a9eff' : 'rgba(200, 200, 210, 0.7)'),
        'transition: background 0.15s, border-color 0.15s',
        'outline: none',
        '-webkit-tap-highlight-color: transparent',
    ].join(';');

    btn.addEventListener('mouseover', function() {
        btn.style.background = primary
            ? 'rgba(74, 158, 255, 0.25)'
            : 'rgba(255,255,255,0.1)';
    });
    btn.addEventListener('mouseout', function() {
        btn.style.background = primary
            ? 'rgba(74, 158, 255, 0.15)'
            : 'rgba(255,255,255,0.05)';
    });
    btn.addEventListener('click', onClick);
    return btn;
}

function createLeaderboardSection(board, currentRank) {
    var section = document.createElement('div');
    section.style.cssText = [
        'margin-bottom: 20px',
        'border-top: 1px solid rgba(255,255,255,0.08)',
        'padding-top: 14px',
    ].join(';');

    var heading = document.createElement('div');
    heading.textContent = 'TOP SCORES';
    heading.style.cssText = [
        'font-size: 10px',
        'letter-spacing: 2px',
        'color: rgba(160, 160, 180, 0.6)',
        'margin-bottom: 8px',
        'text-align: center',
    ].join(';');
    section.appendChild(heading);

    for (var i = 0; i < board.length; i++) {
        var entry = board[i];
        var isCurrentRun = currentRank !== null && i + 1 === currentRank;

        var row = document.createElement('div');
        row.style.cssText = [
            'display: flex',
            'align-items: baseline',
            'gap: 6px',
            'padding: 3px 6px',
            'border-radius: 3px',
            'font-size: 11px',
            isCurrentRun
                ? 'background: rgba(251, 191, 36, 0.08); border: 1px solid rgba(251, 191, 36, 0.2);'
                : 'border: 1px solid transparent;',
        ].join(';');

        var rankEl = document.createElement('span');
        rankEl.textContent = '#' + (i + 1);
        rankEl.style.cssText = [
            'min-width: 22px',
            'color: ' + (isCurrentRun ? '#fbbf24' : 'rgba(120, 120, 140, 0.7)'),
            'font-weight: bold',
        ].join(';');

        var scoreEl = document.createElement('span');
        scoreEl.textContent = String(entry.score);
        scoreEl.style.cssText = [
            'flex: 1',
            'font-weight: bold',
            'color: ' + (isCurrentRun ? '#fbbf24' : '#e0e0e0'),
        ].join(';');

        var waveEl = document.createElement('span');
        waveEl.textContent = 'W' + entry.wave;
        waveEl.style.cssText = 'color: rgba(239, 68, 68, 0.7); min-width: 28px; text-align: right;';

        var dateEl = document.createElement('span');
        dateEl.textContent = entry.date;
        dateEl.style.cssText = 'color: rgba(120, 120, 140, 0.6); min-width: 38px; text-align: right;';

        row.appendChild(rankEl);
        row.appendChild(scoreEl);
        row.appendChild(waveEl);
        row.appendChild(dateEl);

        if (isCurrentRun) {
            var badge = document.createElement('span');
            badge.textContent = 'NEW!';
            badge.style.cssText = [
                'font-size: 9px',
                'font-weight: bold',
                'color: #fbbf24',
                'letter-spacing: 1px',
            ].join(';');
            row.appendChild(badge);
        }

        section.appendChild(row);
    }

    return section;
}

export function showRunSummary(data, onRestart, onMenu) {
    var isNewBest = data.score > data.previousHighScore && data.score > 0;
    var timeAlive = formatTimeAlive(data.timeAliveMs);
    var causeText = formatDeathCause(data.deathCause, data.killedByHunter);

    // Save to leaderboard and get rank
    var leaderboardResult = { board: [], rank: null };
    if (data.score > 0) {
        leaderboardResult = addLeaderboardEntry({
            score: data.score,
            wave: data.wave,
            snakeLength: data.snakeLength || 1,
            date: formatDate(new Date()),
        });
    }

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.style.cssText = [
        'position: fixed',
        'inset: 0',
        'background: rgba(5, 5, 18, 0.88)',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'z-index: 9999',
        'opacity: 0',
        'transition: opacity 0.3s ease',
        'padding: 16px',
        'box-sizing: border-box',
    ].join(';');

    // Card
    var card = document.createElement('div');
    card.style.cssText = [
        'background: #0d1117',
        'border: 1px solid rgba(74, 158, 255, 0.25)',
        'border-radius: 6px',
        'padding: 24px',
        'max-width: 340px',
        'width: 100%',
        'font-family: "Courier New", monospace',
        'box-shadow: 0 0 40px rgba(74, 158, 255, 0.1)',
    ].join(';');

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'text-align: center; margin-bottom: 20px;';

    var titleEl = document.createElement('div');
    titleEl.textContent = 'RUN COMPLETE';
    titleEl.style.cssText = [
        'font-size: 18px',
        'font-weight: bold',
        'letter-spacing: 3px',
        'color: #4a9eff',
        'margin-bottom: 4px',
    ].join(';');

    var subtitleEl = document.createElement('div');
    subtitleEl.textContent = causeText;
    subtitleEl.style.cssText = 'font-size: 11px; color: rgba(239, 68, 68, 0.8); letter-spacing: 1px;';

    header.appendChild(titleEl);
    header.appendChild(subtitleEl);

    // New best banner
    if (isNewBest) {
        var bestBanner = document.createElement('div');
        bestBanner.textContent = '\u2605 NEW BEST!';
        bestBanner.style.cssText = [
            'text-align: center',
            'font-size: 13px',
            'font-weight: bold',
            'letter-spacing: 2px',
            'color: #fbbf24',
            'background: rgba(251, 191, 36, 0.1)',
            'border: 1px solid rgba(251, 191, 36, 0.3)',
            'border-radius: 3px',
            'padding: 6px 12px',
            'margin-bottom: 16px',
        ].join(';');
        card.appendChild(header);
        card.appendChild(bestBanner);
    } else {
        card.appendChild(header);
    }

    // Stats section
    var statsEl = document.createElement('div');
    statsEl.style.cssText = 'margin-bottom: 20px;';

    statsEl.appendChild(createStatRow('Wave reached', String(data.wave), '#ef4444'));
    statsEl.appendChild(createStatRow('Final score', String(data.score), '#4a9eff'));
    statsEl.appendChild(createStatRow('Time alive', timeAlive, '#22c55e'));
    statsEl.appendChild(createStatRow('Food eaten', String(data.foodEaten), '#22c55e'));

    if (data.powerUpsCollected > 0) {
        statsEl.appendChild(createStatRow('Power-ups used', String(data.powerUpsCollected), '#8b5cf6'));
    }

    var highScoreColor = isNewBest ? '#fbbf24' : 'rgba(160, 160, 180, 0.8)';
    var highScoreLabel = isNewBest ? 'New high score' : 'High score';
    statsEl.appendChild(createStatRow(highScoreLabel, String(data.highScore), highScoreColor));

    card.appendChild(statsEl);

    // Leaderboard section
    if (leaderboardResult.board.length > 0) {
        card.appendChild(createLeaderboardSection(leaderboardResult.board, leaderboardResult.rank));
    }

    // Buttons
    var btnRow = document.createElement('div');
    btnRow.style.cssText = [
        'display: flex',
        'gap: 12px',
        'justify-content: center',
    ].join(';');

    var restartBtn = createButton('PLAY AGAIN', true, function() {
        cleanup();
        onRestart();
    });

    var menuBtn = createButton('MAIN MENU', false, function() {
        cleanup();
        onMenu();
    });

    btnRow.appendChild(restartBtn);
    btnRow.appendChild(menuBtn);
    card.appendChild(btnRow);

    // Keyboard hint
    var hintEl = document.createElement('div');
    hintEl.textContent = 'Space/Enter to play \u00b7 Esc for menu';
    hintEl.style.cssText = [
        'text-align: center',
        'font-size: 10px',
        'color: rgba(120, 120, 140, 0.5)',
        'margin-top: 16px',
        'letter-spacing: 1px',
    ].join(';');
    card.appendChild(hintEl);

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    // Fade in
    requestAnimationFrame(function() {
        backdrop.style.opacity = '1';
    });

    // Keyboard handler
    function onKeyDown(e) {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            cleanup();
            onRestart();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
            onMenu();
        }
    }
    document.addEventListener('keydown', onKeyDown);

    function cleanup() {
        document.removeEventListener('keydown', onKeyDown);
        if (backdrop.parentNode) {
            backdrop.parentNode.removeChild(backdrop);
        }
    }

    return cleanup;
}
