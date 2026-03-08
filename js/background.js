'use strict';

// --- Background Theme System ---
// Renders animated backgrounds on a dedicated canvas behind the game canvas.
// Each theme is a pure function that draws onto the background canvas context.
// No external assets — all CSS/canvas animations.

export var BACKGROUND_THEMES = [
    { id: 'neonGrid',    label: 'Neon Grid' },
    { id: 'digitalRain', label: 'Digital Rain' },
    { id: 'darkSpace',   label: 'Dark Space' },
    { id: 'geometry',    label: 'Geometry' },
    { id: 'solid',       label: 'Solid Dark' },
];

export var THEME_ORDER = BACKGROUND_THEMES.map(function(t) { return t.id; });

export function getThemeLabel(id) {
    for (var i = 0; i < BACKGROUND_THEMES.length; i++) {
        if (BACKGROUND_THEMES[i].id === id) return BACKGROUND_THEMES[i].label;
    }
    return 'Neon Grid';
}

// --- Theme State ---

export function createBackgroundState() {
    return {
        // Digital rain columns
        rainDrops: [],
        rainInited: false,

        // Dark space stars
        stars: [],
        starsInited: false,
        shootingStars: [],

        // Abstract geometry shapes
        shapes: [],
        shapesInited: false,

        // Neon grid scroll offset
        gridOffset: 0,

        // Last frame time for dt
        lastTime: 0,
    };
}

// --- Digital Rain ---

var RAIN_CHARS = '01';
var RAIN_FONT_SIZE = 14;
var RAIN_FADE_SPEED = 0.012;

function initRain(bgState, width) {
    var cols = Math.floor(width / RAIN_FONT_SIZE);
    var drops = [];
    for (var i = 0; i < cols; i++) {
        drops.push({
            x: i,
            y: Math.random() * -50,
            speed: 0.3 + Math.random() * 0.7,
            chars: [],
            charTimer: 0,
        });
    }
    return Object.assign({}, bgState, { rainDrops: drops, rainInited: true });
}

function updateRain(bgState, dt, height) {
    var drops = bgState.rainDrops.map(function(drop) {
        var newY = drop.y + drop.speed * dt * 60;
        var maxY = height / RAIN_FONT_SIZE;

        // Reset when off screen
        if (newY > maxY + 5) {
            return Object.assign({}, drop, {
                y: Math.random() * -10,
                speed: 0.3 + Math.random() * 0.7,
                chars: [],
            });
        }

        // Add new character at head
        var newTimer = drop.charTimer + dt;
        var newChars = drop.chars;
        if (newTimer > 0.05) {
            var ch = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
            newChars = [{ ch: ch, alpha: 1.0 }].concat(
                drop.chars.map(function(c) {
                    return { ch: c.ch, alpha: Math.max(0, c.alpha - RAIN_FADE_SPEED) };
                }).filter(function(c) { return c.alpha > 0; })
            );
            newTimer = 0;
        }

        return Object.assign({}, drop, { y: newY, chars: newChars, charTimer: newTimer });
    });
    return Object.assign({}, bgState, { rainDrops: drops });
}

function renderRain(ctx, bgState, width, height) {
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    ctx.font = RAIN_FONT_SIZE + 'px Courier New';
    ctx.textAlign = 'left';

    for (var i = 0; i < bgState.rainDrops.length; i++) {
        var drop = bgState.rainDrops[i];
        var px = drop.x * RAIN_FONT_SIZE;

        for (var j = 0; j < drop.chars.length; j++) {
            var c = drop.chars[j];
            var py = (drop.y - j) * RAIN_FONT_SIZE;
            if (py < 0 || py > height) continue;

            if (j === 0) {
                // Head: bright green-white
                ctx.fillStyle = 'rgba(180, 255, 180, ' + (c.alpha * 0.9) + ')';
                ctx.shadowColor = '#00ff41';
                ctx.shadowBlur = 8;
            } else {
                ctx.fillStyle = 'rgba(0, 255, 65, ' + (c.alpha * 0.5) + ')';
                ctx.shadowBlur = 0;
            }
            ctx.fillText(c.ch, px, py);
        }
    }
    ctx.shadowBlur = 0;
}

// --- Dark Space / Stars ---

var STAR_COUNT = 120;
var SHOOTING_STAR_CHANCE = 0.003;

function initStars(bgState, width, height) {
    var stars = [];
    for (var i = 0; i < STAR_COUNT; i++) {
        stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 2 + 0.5,
            twinkleSpeed: 0.5 + Math.random() * 2,
            twinkleOffset: Math.random() * Math.PI * 2,
            brightness: 0.3 + Math.random() * 0.7,
        });
    }
    return Object.assign({}, bgState, { stars: stars, starsInited: true, shootingStars: [] });
}

function updateStars(bgState, dt, width, height) {
    // Slowly drift stars
    var stars = bgState.stars.map(function(s) {
        var newY = s.y + s.size * 0.1 * dt * 60;
        if (newY > height) {
            return Object.assign({}, s, { y: 0, x: Math.random() * width });
        }
        return Object.assign({}, s, { y: newY });
    });

    // Shooting stars
    var shooters = bgState.shootingStars.map(function(ss) {
        return Object.assign({}, ss, {
            x: ss.x + ss.vx * dt * 60,
            y: ss.y + ss.vy * dt * 60,
            life: ss.life - dt,
        });
    }).filter(function(ss) { return ss.life > 0; });

    // Maybe spawn a new shooting star
    if (Math.random() < SHOOTING_STAR_CHANCE && shooters.length < 3) {
        shooters.push({
            x: Math.random() * width,
            y: Math.random() * height * 0.3,
            vx: 3 + Math.random() * 4,
            vy: 1 + Math.random() * 2,
            life: 0.8 + Math.random() * 0.5,
            maxLife: 1.3,
        });
    }

    return Object.assign({}, bgState, { stars: stars, shootingStars: shooters });
}

function renderStars(ctx, bgState, width, height, now) {
    // Deep space gradient
    var grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#050510');
    grad.addColorStop(0.5, '#0a0a1f');
    grad.addColorStop(1, '#0f0a20');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle nebula patches
    var nebulaColors = ['rgba(60, 20, 80, 0.06)', 'rgba(20, 40, 80, 0.05)', 'rgba(80, 20, 40, 0.04)'];
    for (var n = 0; n < 3; n++) {
        var nx = width * (0.2 + n * 0.3) + Math.sin(now / 8000 + n) * 30;
        var ny = height * (0.3 + n * 0.2) + Math.cos(now / 10000 + n) * 20;
        var nGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, 120 + n * 30);
        nGrad.addColorStop(0, nebulaColors[n]);
        nGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = nGrad;
        ctx.fillRect(0, 0, width, height);
    }

    // Stars with twinkle
    for (var i = 0; i < bgState.stars.length; i++) {
        var s = bgState.stars[i];
        var twinkle = Math.sin(now / 1000 * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7;
        var alpha = s.brightness * twinkle;

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 230, 255, ' + alpha + ')';
        if (s.size > 1.5) {
            ctx.shadowColor = 'rgba(200, 220, 255, 0.5)';
            ctx.shadowBlur = 4;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Shooting stars
    for (var j = 0; j < bgState.shootingStars.length; j++) {
        var ss = bgState.shootingStars[j];
        var ssAlpha = Math.min(1, ss.life * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (ssAlpha * 0.8) + ')';
        ctx.shadowColor = 'rgba(200, 220, 255, 0.6)';
        ctx.shadowBlur = 6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(ss.x - ss.vx * 8, ss.y - ss.vy * 8);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}

// --- Abstract Geometry ---

var SHAPE_COUNT = 15;

function initGeometry(bgState, width, height) {
    var shapes = [];
    for (var i = 0; i < SHAPE_COUNT; i++) {
        shapes.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: 20 + Math.random() * 60,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.3,
            sides: 3 + Math.floor(Math.random() * 4), // 3-6 sides
            drift: { x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.2 },
            hue: Math.floor(Math.random() * 360),
            alpha: 0.04 + Math.random() * 0.06,
        });
    }
    return Object.assign({}, bgState, { shapes: shapes, shapesInited: true });
}

function updateGeometry(bgState, dt, width, height) {
    var shapes = bgState.shapes.map(function(s) {
        var newX = s.x + s.drift.x * dt * 60;
        var newY = s.y + s.drift.y * dt * 60;
        var newRot = s.rotation + s.rotSpeed * dt;

        // Wrap around
        if (newX < -s.size) newX = width + s.size;
        if (newX > width + s.size) newX = -s.size;
        if (newY < -s.size) newY = height + s.size;
        if (newY > height + s.size) newY = -s.size;

        return Object.assign({}, s, { x: newX, y: newY, rotation: newRot });
    });
    return Object.assign({}, bgState, { shapes: shapes });
}

function renderGeometry(ctx, bgState, width, height) {
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, width, height);

    for (var i = 0; i < bgState.shapes.length; i++) {
        var s = bgState.shapes[i];
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);
        ctx.strokeStyle = 'hsla(' + s.hue + ', 60%, 50%, ' + s.alpha + ')';
        ctx.lineWidth = 1;

        ctx.beginPath();
        for (var j = 0; j <= s.sides; j++) {
            var angle = (j / s.sides) * Math.PI * 2;
            var px = Math.cos(angle) * s.size;
            var py = Math.sin(angle) * s.size;
            if (j === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.stroke();

        // Inner shape (smaller, slightly brighter)
        ctx.strokeStyle = 'hsla(' + s.hue + ', 70%, 60%, ' + (s.alpha * 0.7) + ')';
        ctx.beginPath();
        var innerSize = s.size * 0.5;
        for (var k = 0; k <= s.sides; k++) {
            var iAngle = (k / s.sides) * Math.PI * 2 + Math.PI / s.sides;
            var ipx = Math.cos(iAngle) * innerSize;
            var ipy = Math.sin(iAngle) * innerSize;
            if (k === 0) {
                ctx.moveTo(ipx, ipy);
            } else {
                ctx.lineTo(ipx, ipy);
            }
        }
        ctx.stroke();

        ctx.restore();
    }
}

// --- Neon Grid ---

var NEON_GRID_SPACING = 40;
var NEON_SCROLL_SPEED = 15;

function renderNeonGrid(ctx, bgState, width, height, now) {
    ctx.fillStyle = '#060612';
    ctx.fillRect(0, 0, width, height);

    var offset = bgState.gridOffset;
    var pulse = Math.sin(now / 2000) * 0.15 + 0.85;

    // Horizontal perspective lines
    ctx.lineWidth = 0.5;
    var horizY = height * 0.55;

    // Vertical lines
    for (var vx = -NEON_GRID_SPACING; vx <= width + NEON_GRID_SPACING; vx += NEON_GRID_SPACING) {
        var adjustedX = vx + (offset % NEON_GRID_SPACING);
        var distFromCenter = Math.abs(adjustedX - width / 2) / (width / 2);
        var lineAlpha = (1 - distFromCenter * 0.6) * 0.12 * pulse;
        ctx.strokeStyle = 'rgba(74, 158, 255, ' + lineAlpha + ')';
        ctx.beginPath();
        ctx.moveTo(adjustedX, 0);
        ctx.lineTo(adjustedX, height);
        ctx.stroke();
    }

    // Horizontal lines with perspective fade
    for (var hy = 0; hy <= height; hy += NEON_GRID_SPACING) {
        var adjustedY = hy + (offset * 0.5 % NEON_GRID_SPACING);
        var distFromHorizon = Math.abs(adjustedY - horizY) / height;
        var hLineAlpha = (0.5 + distFromHorizon * 0.5) * 0.1 * pulse;
        ctx.strokeStyle = 'rgba(74, 158, 255, ' + hLineAlpha + ')';
        ctx.beginPath();
        ctx.moveTo(0, adjustedY);
        ctx.lineTo(width, adjustedY);
        ctx.stroke();
    }

    // Horizon glow line
    ctx.strokeStyle = 'rgba(74, 158, 255, ' + (0.15 * pulse) + ')';
    ctx.shadowColor = '#4a9eff';
    ctx.shadowBlur = 15;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizY);
    ctx.lineTo(width, horizY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Corner accent glows
    var cornerAlpha = Math.sin(now / 3000) * 0.03 + 0.04;
    var cornerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 200);
    cornerGrad.addColorStop(0, 'rgba(74, 158, 255, ' + cornerAlpha + ')');
    cornerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = cornerGrad;
    ctx.fillRect(0, 0, width, height);

    var cornerGrad2 = ctx.createRadialGradient(width, height, 0, width, height, 200);
    cornerGrad2.addColorStop(0, 'rgba(168, 85, 247, ' + cornerAlpha + ')');
    cornerGrad2.addColorStop(1, 'transparent');
    ctx.fillStyle = cornerGrad2;
    ctx.fillRect(0, 0, width, height);
}

// --- Solid Dark (minimal) ---

function renderSolid(ctx, width, height) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);
}

// --- Main Update & Render ---

export function updateBackground(bgState, dt, theme, width, height) {
    var now = Date.now();
    var state = Object.assign({}, bgState, { lastTime: now });

    switch (theme) {
        case 'digitalRain':
            if (!state.rainInited) state = initRain(state, width);
            state = updateRain(state, dt, height);
            break;
        case 'darkSpace':
            if (!state.starsInited) state = initStars(state, width, height);
            state = updateStars(state, dt, width, height);
            break;
        case 'geometry':
            if (!state.shapesInited) state = initGeometry(state, width, height);
            state = updateGeometry(state, dt, width, height);
            break;
        case 'neonGrid':
            state = Object.assign({}, state, { gridOffset: state.gridOffset + NEON_SCROLL_SPEED * dt });
            break;
        case 'solid':
        default:
            break;
    }

    return state;
}

export function renderBackground(ctx, bgState, theme, width, height) {
    var now = Date.now();

    switch (theme) {
        case 'digitalRain':
            renderRain(ctx, bgState, width, height);
            break;
        case 'darkSpace':
            renderStars(ctx, bgState, width, height, now);
            break;
        case 'geometry':
            renderGeometry(ctx, bgState, width, height);
            break;
        case 'neonGrid':
            renderNeonGrid(ctx, bgState, width, height, now);
            break;
        case 'solid':
        default:
            renderSolid(ctx, width, height);
            break;
    }
}
