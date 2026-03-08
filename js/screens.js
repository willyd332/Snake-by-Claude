'use strict';

import { GRID_SIZE, CELL_SIZE, CANVAS_SIZE, LEVEL_CONFIG, MAX_LEVEL } from './constants.js';
import { getSettings, getSettingsItems, getDifficultyLabel } from './settings.js';

// --- Demo Snake for Title Screen ---
function createDemoSnake() {
    var segments = [];
    var startX = Math.floor(Math.random() * (GRID_SIZE - 4)) + 2;
    var startY = Math.floor(Math.random() * (GRID_SIZE - 4)) + 2;
    for (var i = 0; i < 8; i++) {
        segments.push({ x: (startX - i + GRID_SIZE) % GRID_SIZE, y: startY });
    }
    return {
        segments: segments,
        direction: { x: 1, y: 0 },
        food: spawnDemoFood(segments),
        moveTimer: 0,
        colorIndex: 0,
    };
}

function spawnDemoFood(segments) {
    var pos;
    var attempts = 0;
    do {
        pos = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE),
        };
        attempts++;
        if (attempts > 500) break;
    } while (segments.some(function(s) { return s.x === pos.x && s.y === pos.y; }));
    return pos;
}

function stepDemoSnake(demo) {
    var head = demo.segments[0];
    var dir = demo.direction;
    var food = demo.food;

    // Simple AI: steer toward food with some randomness
    var dx = food.x - head.x;
    var dy = food.y - head.y;
    var choices = [];

    if (dx > 0) choices.push({ x: 1, y: 0 });
    if (dx < 0) choices.push({ x: -1, y: 0 });
    if (dy > 0) choices.push({ x: 0, y: 1 });
    if (dy < 0) choices.push({ x: 0, y: -1 });

    // Add current direction as a choice for smooth movement
    if (choices.length > 0 && Math.random() > 0.3) {
        dir = choices[Math.floor(Math.random() * choices.length)];
    }

    // Prevent reversal
    if (dir.x + demo.direction.x === 0 && dir.y + demo.direction.y === 0) {
        dir = demo.direction;
    }

    var newHead = {
        x: (head.x + dir.x + GRID_SIZE) % GRID_SIZE,
        y: (head.y + dir.y + GRID_SIZE) % GRID_SIZE,
    };

    // Avoid self-collision
    var wouldHitSelf = demo.segments.some(function(s) {
        return s.x === newHead.x && s.y === newHead.y;
    });
    if (wouldHitSelf) {
        // Try perpendicular directions
        var alts = [
            { x: -dir.y, y: dir.x },
            { x: dir.y, y: -dir.x },
        ];
        var found = false;
        for (var i = 0; i < alts.length; i++) {
            var testHead = {
                x: (head.x + alts[i].x + GRID_SIZE) % GRID_SIZE,
                y: (head.y + alts[i].y + GRID_SIZE) % GRID_SIZE,
            };
            var hitsSelf = demo.segments.some(function(s) {
                return s.x === testHead.x && s.y === testHead.y;
            });
            if (!hitsSelf) {
                newHead = testHead;
                dir = alts[i];
                found = true;
                break;
            }
        }
        if (!found) {
            // Reset demo snake if stuck
            return createDemoSnake();
        }
    }

    var ate = newHead.x === food.x && newHead.y === food.y;
    var newSegments = [newHead].concat(ate ? demo.segments : demo.segments.slice(0, -1));

    // Cap length at 20
    if (newSegments.length > 20) {
        newSegments = newSegments.slice(0, 20);
    }

    var newFood = ate ? spawnDemoFood(newSegments) : food;
    var newColorIndex = ate ? (demo.colorIndex + 1) % MAX_LEVEL : demo.colorIndex;

    return {
        segments: newSegments,
        direction: dir,
        food: newFood,
        moveTimer: 0,
        colorIndex: newColorIndex,
    };
}

// --- Title Screen Rendering ---
export function createTitleState() {
    return {
        demo: createDemoSnake(),
        tickAccum: 0,
    };
}

export function updateTitleState(titleState) {
    var newAccum = titleState.tickAccum + 1;
    if (newAccum >= 6) {
        return {
            demo: stepDemoSnake(titleState.demo),
            tickAccum: 0,
        };
    }
    return {
        demo: titleState.demo,
        tickAccum: newAccum,
    };
}

export function renderTitleScreen(ctx, titleState, menuIndex) {
    var demo = titleState.demo;

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    ctx.lineWidth = 0.5;
    for (var g = 0; g <= GRID_SIZE; g++) {
        ctx.beginPath();
        ctx.moveTo(g * CELL_SIZE, 0);
        ctx.lineTo(g * CELL_SIZE, CANVAS_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, g * CELL_SIZE);
        ctx.lineTo(CANVAS_SIZE, g * CELL_SIZE);
        ctx.stroke();
    }

    // Demo snake (semi-transparent, cycling colors)
    demo.segments.forEach(function(seg, i) {
        var alpha = (1 - (i / demo.segments.length) * 0.6) * 0.4;
        var hue = ((Date.now() / 15) + i * 25) % 360;
        ctx.fillStyle = 'hsl(' + hue + ', 70%, 50%)';
        ctx.globalAlpha = alpha;
        var pad = i === 0 ? 1 : 2;
        ctx.fillRect(
            seg.x * CELL_SIZE + pad,
            seg.y * CELL_SIZE + pad,
            CELL_SIZE - pad * 2,
            CELL_SIZE - pad * 2
        );
    });
    ctx.globalAlpha = 1;

    // Demo food
    var foodPulse = Math.sin(Date.now() / 200) * 0.3 + 0.5;
    ctx.fillStyle = LEVEL_CONFIG[demo.colorIndex + 1] ? LEVEL_CONFIG[demo.colorIndex + 1].foodColor : '#ef4444';
    ctx.globalAlpha = foodPulse;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(
        demo.food.x * CELL_SIZE + CELL_SIZE / 2,
        demo.food.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 2, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Dark overlay for readability
    ctx.fillStyle = 'rgba(10, 10, 26, 0.65)';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Title: "SNAKE"
    var titleGlow = Math.sin(Date.now() / 800) * 0.3 + 0.7;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#4a9eff';
    ctx.shadowBlur = 20 * titleGlow;
    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 52px Courier New';
    ctx.fillText('SNAKE', CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 60);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.fillStyle = '#334155';
    ctx.font = '11px Courier New';
    ctx.fillText('INFINITE ENDLESS MODE', CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 35);

    // Divider line
    var lineW = 120;
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CANVAS_SIZE / 2 - lineW / 2, CANVAS_SIZE / 2 - 20);
    ctx.lineTo(CANVAS_SIZE / 2 + lineW / 2, CANVAS_SIZE / 2 - 20);
    ctx.stroke();

    // Menu options (simplified — no level select, no archive, no codex)
    var menuItems = [
        { text: 'Play', color: 'rgba(224, 224, 224, ', alpha: 0.7, font: '14px Courier New' },
        { text: 'Trophies', color: 'rgba(251, 191, 36, ', alpha: 0.4, font: '13px Courier New' },
        { text: 'Settings', color: 'rgba(120, 120, 140, ', alpha: 0.35, font: '12px Courier New' },
    ];
    var menuKeys = ['ENTER', 'T', 'S'];
    var menuYOffsets = [8, 28, 46];
    var hasMenuIndex = menuIndex !== undefined && menuIndex !== null && menuIndex >= 0;

    for (var mi = 0; mi < menuItems.length; mi++) {
        var item = menuItems[mi];
        var itemY = CANVAS_SIZE / 2 + menuYOffsets[mi];
        var isMenuSelected = hasMenuIndex && menuIndex === mi;

        if (isMenuSelected) {
            // Highlight background
            roundRect(ctx, CANVAS_SIZE / 2 - 105, itemY - 13, 210, 18, 3);
            ctx.fillStyle = 'rgba(74, 158, 255, 0.1)';
            ctx.fill();
            // Bright text with arrow
            var selPulse = Math.sin(Date.now() / 400) * 0.15 + 0.85;
            ctx.fillStyle = 'rgba(255, 255, 255, ' + selPulse + ')';
            ctx.font = 'bold ' + item.font;
            ctx.fillText('\u25B8 ' + item.text, CANVAS_SIZE / 2, itemY);
        } else if (mi === 0 && !hasMenuIndex) {
            var enterPulse = Math.sin(Date.now() / 600) * 0.3 + 0.7;
            ctx.fillStyle = item.color + enterPulse + ')';
            ctx.font = item.font;
            ctx.fillText(menuKeys[mi] + ' \u2014 ' + item.text, CANVAS_SIZE / 2, itemY);
        } else {
            ctx.fillStyle = item.color + item.alpha + ')';
            ctx.font = item.font;
            ctx.fillText(menuKeys[mi] + ' \u2014 ' + item.text, CANVAS_SIZE / 2, itemY);
        }
    }

    // Footer
    ctx.fillStyle = 'rgba(100, 100, 120, 0.3)';
    ctx.font = '10px Courier New';
    ctx.fillText('swipe or arrow keys', CANVAS_SIZE / 2, CANVAS_SIZE - 20);

    ctx.textAlign = 'left';
}

// --- Settings Screen Rendering ---
export function renderSettings(ctx, settingsState) {
    var settings = getSettings();
    var items = getSettingsItems();
    var selected = settingsState.selectedIndex;

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 22px Courier New';
    ctx.fillText('SETTINGS', CANVAS_SIZE / 2, 40);

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 53);
    ctx.lineTo(CANVAS_SIZE - 80, 53);
    ctx.stroke();

    // Settings rows
    var rowH = 42;
    var startY = 80;
    var rowW = 280;
    var rowX = (CANVAS_SIZE - rowW) / 2;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var ry = startY + i * rowH;
        var isSelected = i === selected;

        // Row background
        if (isSelected) {
            roundRect(ctx, rowX, ry, rowW, 32, 4);
            ctx.fillStyle = 'rgba(74, 158, 255, 0.1)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(74, 158, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Label
        ctx.textAlign = 'left';
        var labelAlpha = isSelected ? 0.9 : 0.5;
        ctx.fillStyle = 'rgba(224, 224, 224, ' + labelAlpha + ')';
        ctx.font = isSelected ? 'bold 13px Courier New' : '13px Courier New';
        var labelX = rowX + 16;
        ctx.fillText(item.label, labelX, ry + 21);

        // Value
        ctx.textAlign = 'right';
        var valueX = rowX + rowW - 16;
        var value = settings[item.key];

        if (item.type === 'toggle') {
            var isOn = value;
            ctx.fillStyle = isOn
                ? 'rgba(34, 197, 94, ' + (isSelected ? 0.9 : 0.6) + ')'
                : 'rgba(239, 68, 68, ' + (isSelected ? 0.7 : 0.4) + ')';
            ctx.font = isSelected ? 'bold 13px Courier New' : '13px Courier New';
            ctx.fillText(isOn ? 'ON' : 'OFF', valueX, ry + 21);
        } else if (item.type === 'cycle') {
            var label = getDifficultyLabel(value);
            var diffColors = { Easy: '#22c55e', Normal: '#eab308', Hard: '#ef4444' };
            var diffColor = diffColors[label] || '#e0e0e0';
            ctx.fillStyle = diffColor;
            ctx.globalAlpha = isSelected ? 0.9 : 0.6;
            ctx.font = isSelected ? 'bold 13px Courier New' : '13px Courier New';
            ctx.fillText('\u25C0 ' + label + ' \u25B6', valueX, ry + 21);
            ctx.globalAlpha = 1;
        }
    }

    // Difficulty description
    var preset = settings.difficulty;
    var descriptions = {
        easy:   'Slower speed, 5 lives, more power-ups',
        normal: 'Standard speed, 3 lives, normal power-ups',
        hard:   'Faster speed, 1 life, rare power-ups',
    };
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(150, 150, 170, 0.4)';
    ctx.font = '10px Courier New';
    ctx.fillText(descriptions[preset] || '', CANVAS_SIZE / 2, startY + items.length * rowH + 16);

    // High contrast preview indicator
    if (settings.highContrast) {
        ctx.fillStyle = 'rgba(255, 255, 100, 0.3)';
        ctx.font = '10px Courier New';
        ctx.fillText('High contrast active', CANVAS_SIZE / 2, startY + items.length * rowH + 36);
    }

    // Footer
    ctx.fillStyle = 'rgba(150, 150, 170, 0.5)';
    ctx.font = '11px Courier New';
    ctx.fillText('Swipe / \u2191\u2193 Navigate  \u00b7  Tap / ENTER Toggle  \u00b7  Hold / ESC Back', CANVAS_SIZE / 2, CANVAS_SIZE - 16);

    ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
