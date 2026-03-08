'use strict';

import { GRID_SIZE, CELL_SIZE, CANVAS_SIZE, LEVEL_CONFIG, MAX_LEVEL } from './constants.js';
import { getCollectedFragments } from './fragments.js';
import { getUnlockedEndings } from './story.js';

var LEVEL_NAMES = {
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

var LEVEL_TAGS = {
    1: 'No obstacles',
    2: 'Walls',
    3: 'Moving obstacles',
    4: 'Fire cage',
    5: 'Portals',
    6: 'Darkness',
    7: 'Wrap + Power-ups',
    8: 'Hunter AI',
    9: 'Shrinking arena',
    10: 'Everything',
};

export function getHighestLevel() {
    return parseInt(localStorage.getItem('snake-highest-level') || '1', 10);
}

export function setHighestLevel(level) {
    var current = getHighestLevel();
    if (level > current) {
        localStorage.setItem('snake-highest-level', String(level));
    }
}

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

// --- Dynamic Subtitle ---
function getTitleSubtitle() {
    var collected = getCollectedFragments();
    if (collected.length >= 10) return 'System fully mapped.';

    var endings = getUnlockedEndings();
    if (endings.awakening || endings.deletion || endings.loop) return 'The machine remembers.';

    var highest = getHighestLevel();
    if (highest >= 8) return 'ALPHA is watching.';
    if (highest >= 5) return 'Deeper into the machine...';

    return 'THE BLUE COMPUTER';
}

// --- Title Screen Rendering ---
export function createTitleState() {
    return {
        demo: createDemoSnake(),
        tickAccum: 0,
        subtitle: getTitleSubtitle(),
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

export function renderTitleScreen(ctx, titleState) {
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

    // Hunter blip in background (after Level 8)
    var highest = getHighestLevel();
    if (highest >= 8) {
        var now = Date.now();
        var blipCycle = (now / 4000) % 1;
        if (blipCycle < 0.25) {
            var blipAlpha = Math.sin(blipCycle / 0.25 * Math.PI) * 0.25;
            var blipX = ((now * 0.031 + 137) % (CANVAS_SIZE - CELL_SIZE));
            var blipY = ((now * 0.019 + 89) % (CANVAS_SIZE - CELL_SIZE));
            ctx.fillStyle = 'rgba(249, 115, 22, ' + blipAlpha + ')';
            ctx.fillRect(blipX, blipY, CELL_SIZE - 4, CELL_SIZE - 4);
        }
    }

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

    // Dynamic subtitle (cached in titleState)
    var subtitle = titleState.subtitle;
    var isDefaultSubtitle = subtitle === 'THE BLUE COMPUTER';
    if (isDefaultSubtitle) {
        ctx.fillStyle = '#334155';
    } else {
        var subPulse = Math.sin(Date.now() / 1200) * 0.15 + 0.55;
        ctx.fillStyle = 'rgba(150, 170, 200, ' + subPulse + ')';
    }
    ctx.font = '11px Courier New';
    ctx.fillText(subtitle, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 35);

    // Divider line
    var lineW = 120;
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CANVAS_SIZE / 2 - lineW / 2, CANVAS_SIZE / 2 - 20);
    ctx.lineTo(CANVAS_SIZE / 2 + lineW / 2, CANVAS_SIZE / 2 - 20);
    ctx.stroke();

    // Menu options
    var enterPulse = Math.sin(Date.now() / 600) * 0.3 + 0.7;
    ctx.fillStyle = 'rgba(224, 224, 224, ' + enterPulse + ')';
    ctx.font = '14px Courier New';
    ctx.fillText('ENTER \u2014 Play', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 10);

    ctx.fillStyle = 'rgba(150, 150, 170, 0.6)';
    ctx.font = '13px Courier New';
    ctx.fillText('L \u2014 Level Select', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 32);

    ctx.fillStyle = 'rgba(74, 158, 255, 0.4)';
    ctx.font = '13px Courier New';
    ctx.fillText('C \u2014 Data Codex', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 52);

    ctx.fillStyle = 'rgba(150, 130, 170, 0.4)';
    ctx.font = '13px Courier New';
    ctx.fillText('A \u2014 Archive', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 72);

    // Level dots
    var dotY = CANVAS_SIZE / 2 + 98;
    var dotSpacing = 28;
    var dotsStartX = CANVAS_SIZE / 2 - (dotSpacing * (MAX_LEVEL - 1)) / 2;
    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
        var dotX = dotsStartX + (lv - 1) * dotSpacing;
        var lvColor = LEVEL_CONFIG[lv].color;
        var unlocked = lv <= highest;
        var dotPulse = Math.sin(Date.now() / 500 + lv * 0.5) * 0.2 + 0.8;

        if (unlocked) {
            ctx.fillStyle = lvColor;
            ctx.globalAlpha = dotPulse * 0.8;
            ctx.shadowColor = lvColor;
            ctx.shadowBlur = 6;
        } else {
            ctx.fillStyle = '#333';
            ctx.globalAlpha = 0.3;
            ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Ending icons below level dots
    var endings = getUnlockedEndings();
    var iconY = dotY + 18;
    var iconSpacing = 24;
    var iconStartX = CANVAS_SIZE / 2 - iconSpacing;
    ctx.font = '11px Courier New';

    ctx.fillStyle = endings.awakening ? '#eab308' : 'rgba(80, 80, 80, 0.15)';
    ctx.fillText('\u2605', iconStartX, iconY);

    ctx.fillStyle = endings.deletion ? '#ef4444' : 'rgba(80, 80, 80, 0.15)';
    ctx.fillText('\u2716', iconStartX + iconSpacing, iconY);

    ctx.fillStyle = endings.loop ? '#666' : 'rgba(80, 80, 80, 0.15)';
    ctx.fillText('\u21BB', iconStartX + iconSpacing * 2, iconY);

    // Footer
    ctx.fillStyle = 'rgba(100, 100, 120, 0.3)';
    ctx.font = '10px Courier New';
    ctx.fillText('10 levels \u00b7 arrow keys to play', CANVAS_SIZE / 2, CANVAS_SIZE - 20);

    ctx.textAlign = 'left';
}

// --- Level Select Rendering ---
export function createLevelSelectState() {
    return {
        selectedLevel: 1,
        scrollOffset: 0,
    };
}

export function renderLevelSelect(ctx, selectState) {
    var highest = getHighestLevel();
    var selected = selectState.selectedLevel;

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 22px Courier New';
    ctx.fillText('SELECT LEVEL', CANVAS_SIZE / 2, 35);

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 48);
    ctx.lineTo(CANVAS_SIZE - 60, 48);
    ctx.stroke();

    // Level cards — 2 columns, 5 rows
    var cardW = 160;
    var cardH = 55;
    var gapX = 16;
    var gapY = 10;
    var startX = (CANVAS_SIZE - cardW * 2 - gapX) / 2;
    var startY = 62;

    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
        var col = (lv - 1) % 2;
        var row = Math.floor((lv - 1) / 2);
        var cx = startX + col * (cardW + gapX);
        var cy = startY + row * (cardH + gapY);
        var unlocked = lv <= highest;
        var isSelected = lv === selected;
        var config = LEVEL_CONFIG[lv];

        // Card background
        if (isSelected && unlocked) {
            ctx.fillStyle = 'rgba(74, 158, 255, 0.12)';
            ctx.strokeStyle = config.color;
            ctx.lineWidth = 2;
            ctx.shadowColor = config.color;
            ctx.shadowBlur = 8;
        } else if (unlocked) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 1;
            ctx.shadowBlur = 0;
        }

        // Rounded rect
        roundRect(ctx, cx, cy, cardW, cardH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Color dot
        var dotX = cx + 14;
        var dotCy = cy + cardH / 2;
        if (unlocked) {
            ctx.fillStyle = config.color;
            ctx.shadowColor = config.color;
            ctx.shadowBlur = 4;
        } else {
            ctx.fillStyle = '#333';
            ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(dotX, dotCy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Level number and name
        ctx.textAlign = 'left';
        if (unlocked) {
            ctx.fillStyle = '#e0e0e0';
        } else {
            ctx.fillStyle = '#444';
        }
        ctx.font = 'bold 13px Courier New';
        ctx.fillText(lv + '. ' + LEVEL_NAMES[lv], cx + 28, cy + 20);

        // Tag
        if (unlocked) {
            ctx.fillStyle = 'rgba(150, 150, 170, 0.6)';
        } else {
            ctx.fillStyle = '#333';
        }
        ctx.font = '10px Courier New';
        ctx.fillText(unlocked ? LEVEL_TAGS[lv] : 'LOCKED', cx + 28, cy + 36);

        // Lock icon for locked levels
        if (!unlocked) {
            ctx.fillStyle = '#444';
            ctx.font = '16px Courier New';
            ctx.textAlign = 'right';
            ctx.fillText('[X]', cx + cardW - 16, cy + cardH / 2 + 5);
        }

        // Selected indicator (arrow)
        if (isSelected && unlocked) {
            var arrowPulse = Math.sin(Date.now() / 300) * 2;
            ctx.fillStyle = config.color;
            ctx.font = 'bold 14px Courier New';
            ctx.textAlign = 'right';
            ctx.fillText('\u25B6', cx + cardW - 8 + arrowPulse, cy + 22);
        }
    }

    ctx.textAlign = 'center';

    // Footer instructions
    ctx.fillStyle = 'rgba(150, 150, 170, 0.5)';
    ctx.font = '11px Courier New';
    ctx.fillText('\u2190\u2191\u2192\u2193 Navigate  \u00b7  ENTER Select  \u00b7  ESC Back', CANVAS_SIZE / 2, CANVAS_SIZE - 16);

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
