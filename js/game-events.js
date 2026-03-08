'use strict';

import { CANVAS_SIZE, GRID_SIZE, MAX_LEVEL, AWAKENING_FOOD_THRESHOLD, DELETION_FOOD_THRESHOLD, INVINCIBLE_TICKS } from './constants.js';
import { getLevelConfig, randomPosition } from './state.js';
import { getPowerUpDef } from './powerups.js';
import {
    emitBurst, emitExplosion, emitLevelUpShower, emitPortalSwirl,
    triggerShake,
} from './particles.js';
import {
    playEatSound, playLevelUpSound, playDeathSound, playLifeLostSound,
    playPowerUpCollectSound, playPortalSound, playShrinkSound,
    playFragmentCollectSound, playHunterKillSound, playHunterIntroSound,
    playBossFoodPulseSound, playBossShadowCloneSpawnSound, playBossShockwaveSound,
    playBossPhaseTransitionSound, playBossDeathSound,
} from './audio.js';
import { getFragmentForLevel, collectFragment, getCollectedFragments } from './fragments.js';
import { createBossState } from './boss.js';
import { setHighestLevel } from './screens.js';
import { createEndingState, unlockEnding } from './story.js';
import { setEndlessHighScore, setEndlessHighWave, getWaveTitle } from './endless.js';
import {
    recordFoodEaten, recordDeath, recordLevelComplete, recordPortalUse,
    recordPowerUpCollected, recordBestScore, recordEndlessWave,
} from './stats.js';
import {
    startSpeedrunTimer, recordLevelSplit, stopSpeedrunTimer,
} from './speedrun.js';

// --- Post-Tick Event Processing ---
// Handles all game events that occur after a tick: food eaten, level up,
// game over, wave-up, power-ups, fragments, arena shrink, teleport.
// Receives a mutable context object and modifies it directly.
//
// READ-ONLY: prevState, prevLevel, endlessMode, config, messageEl, dom, ui
// MUTATED: state, prevSnake, prevHunterSegments, hunterTrailHistory,
//          particleSystem, shakeState, highScore, levelStartTime,
//          fragmentTextState, hunterIntroState, endingState,
//          currentScreen
// CALLBACKS: tryUnlock, checkAllEndings, spawnFragmentForLevel, hideGameplayUI

export function processPostTickEvents(ctx) {

    // Food eaten: burst at food position, skip interpolation (snake grew)
    if (ctx.state._ateFood && ctx.state._ateFoodPos) {
        ctx.prevSnake = null;
        playEatSound();
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state._ateFoodPos.x, ctx.state._ateFoodPos.y, ctx.config.foodColor, 12, 60, 0.5);
        ctx.shakeState = triggerShake(2, 0.1);

        // Stats: food eaten + snake length
        recordFoodEaten(ctx.state.snake.length);

        // Speedrun: start timer on first food eaten
        if (ctx.speedrunState && !ctx.speedrunState.running) {
            ctx.speedrunState = startSpeedrunTimer(ctx.speedrunState);
        }

        // Score achievements
        if (ctx.state.score >= 100) ctx.tryUnlock('first_byte');
        if (ctx.state.score >= 500) ctx.tryUnlock('data_hoarder');
        if (ctx.state.score >= 1000) ctx.tryUnlock('megabyte');

        // Boss: first food eaten on Level 10
        if (ctx.state.level === MAX_LEVEL && ctx.state.foodEaten === 1) ctx.tryUnlock('first_blood');

        // Boss: ate food during active shockwave
        if (ctx.state._bossAteInShockwave) ctx.tryUnlock('calm_in_storm');
    }

    // Awakening ending: eat enough food on Level 10 while alive (normal mode only)
    if (!ctx.endlessMode && ctx.state._ateFood && ctx.state.level === MAX_LEVEL && ctx.state.foodEaten >= AWAKENING_FOOD_THRESHOLD) {
        if (ctx.state.score > ctx.highScore) {
            ctx.highScore = ctx.state.score;
            localStorage.setItem('snake-highscore', String(ctx.highScore));
            ctx.dom.highScoreEl.textContent = ctx.highScore;
        }
        playBossDeathSound();
        ctx.endingState = createEndingState('awakening');
        unlockEnding('awakening');
        ctx.tryUnlock('transcendence');
        ctx.tryUnlock('ghost_of_machine');
        if (!ctx.state.bossCloneHitThisRun) ctx.tryUnlock('no_clone_casualty');
        ctx.checkAllEndings();
        ctx.currentScreen = 'ending';
        ctx.hideGameplayUI();
        ctx.ui.clearTimers();
        // Speedrun: stop timer on game completion
        if (ctx.speedrunState) {
            ctx.speedrunState = stopSpeedrunTimer(ctx.speedrunState);
        }
    }

    // Endless wave-up detection
    if (ctx.endlessMode && ctx.state.endlessWave > (ctx.prevState.endlessWave || 0)) {
        recordEndlessWave(ctx.state.endlessWave);
        if (ctx.state.endlessWave >= 10) ctx.tryUnlock('endurance');
        if (ctx.state.endlessWave >= 25) ctx.tryUnlock('marathoner');
        ctx.prevSnake = null;
        ctx.prevHunterSegments = null;
        playLevelUpSound();
        var waveConfig = ctx.state.endlessConfig;
        ctx.particleSystem = emitLevelUpShower(ctx.particleSystem, CANVAS_SIZE, waveConfig.color);
        ctx.shakeState = triggerShake(4, 0.3);
        ctx.hunterTrailHistory = [];

        // ALPHA intro on first hunter wave
        if (ctx.state.hunter && !(ctx.prevState.hunter)) {
            ctx.hunterIntroState = { text: 'DESIGNATION: ALPHA \u2014 SECURITY DAEMON', startTime: Date.now() };
            playHunterIntroSound();
        }

        // Wave title message
        var waveTitle = getWaveTitle(ctx.state.endlessWave);
        if (waveTitle) {
            ctx.messageEl.textContent = 'WAVE ' + ctx.state.endlessWave + ' \u2014 ' + waveTitle;
            ctx.messageEl.className = 'levelup';
            ctx.messageEl.style.color = waveConfig.color;
            setTimeout(function() {
                ctx.messageEl.textContent = '';
                ctx.messageEl.className = '';
                ctx.messageEl.style.color = '';
            }, 2000);
        } else {
            ctx.messageEl.textContent = 'WAVE ' + ctx.state.endlessWave;
            ctx.messageEl.className = 'levelup';
            ctx.messageEl.style.color = waveConfig.color;
            setTimeout(function() {
                ctx.messageEl.textContent = '';
                ctx.messageEl.className = '';
                ctx.messageEl.style.color = '';
            }, 1500);
        }
    }

    // Level up: shower + shake + story screen (normal mode)
    if (!ctx.endlessMode && ctx.state.level > ctx.prevLevel) {
        ctx.prevSnake = null;
        ctx.prevHunterSegments = null;
        playLevelUpSound();
        setHighestLevel(ctx.state.level);

        // Progression achievements
        if (ctx.prevLevel === 1) ctx.tryUnlock('boot_sequence');
        if (ctx.state.level >= 5) ctx.tryUnlock('deep_dive');
        if (ctx.state.level >= 10) ctx.tryUnlock('the_core');
        if (ctx.prevLevel === 8) ctx.tryUnlock('untouchable');

        // Stats: level completed with time and score
        var levelTimeMs = ctx.levelStartTime > 0 ? Date.now() - ctx.levelStartTime : 0;
        recordLevelComplete(ctx.prevLevel, levelTimeMs);
        recordBestScore(ctx.prevLevel, ctx.state.score);

        // Speedrun: record split for completed level
        if (ctx.speedrunState) {
            ctx.speedrunState = recordLevelSplit(ctx.speedrunState, ctx.prevLevel);
        }

        // Speed demon: cleared prev level in under 20s
        if (ctx.levelStartTime > 0 && (Date.now() - ctx.levelStartTime) < 20000) {
            ctx.tryUnlock('speed_demon');
        }
        ctx.levelStartTime = Date.now();
        var newConfig = getLevelConfig(ctx.state.level);
        ctx.particleSystem = emitLevelUpShower(ctx.particleSystem, CANVAS_SIZE, newConfig.color);
        ctx.shakeState = triggerShake(4, 0.3);

        // Spawn fragment for new level
        var newLevelFrag = ctx.spawnFragmentForLevel(ctx.state.level, 0);
        if (newLevelFrag) {
            ctx.state = Object.assign({}, ctx.state, { fragment: newLevelFrag });
        }

        // Reset hunter trail for new level
        ctx.hunterTrailHistory = [];

        // ALPHA intro when leveling up to a hunter level
        if (ctx.state.hunter) {
            var hunterLevelText = ctx.state.level === 10
                ? 'ALPHA REMEMBERS YOU.'
                : 'DESIGNATION: ALPHA \u2014 SECURITY DAEMON';
            ctx.hunterIntroState = { text: hunterLevelText, startTime: Date.now() + 1500 };
        }

        // Show level-up message (story screens removed)
        ctx.ui.showLevelUp(ctx.state.level);
    }

    // Power-up collected: sparkle burst
    if (ctx.state._collectedPowerUp) {
        recordPowerUpCollected();
        if (ctx.state._collectedPowerUp === 'ghost') ctx.tryUnlock('ghost_rider');
        var collectedDef = getPowerUpDef(ctx.state._collectedPowerUp);
        if (collectedDef) {
            playPowerUpCollectSound();
            ctx.ui.showPowerUpCollected(collectedDef);
            ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, collectedDef.glowColor, 16, 50, 0.6);
        }
    }

    // Fragment collected: sound, particles, text overlay, localStorage
    if (ctx.state._collectedFragment) {
        var fragLevel = ctx.state._collectedFragmentLevel;
        var fragData = getFragmentForLevel(fragLevel);
        if (fragData) {
            playFragmentCollectSound();
            collectFragment(fragLevel);
            // Fragment achievements (check after collecting)
            var totalFrags = getCollectedFragments().length;
            if (totalFrags >= 5) ctx.tryUnlock('archaeologist');
            if (totalFrags >= 10) ctx.tryUnlock('full_archive');
            ctx.fragmentTextState = { text: fragData.text, startTime: Date.now() };
            ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, '#4a9eff', 20, 70, 0.8);
            ctx.shakeState = triggerShake(3, 0.15);
        }
    }

    // Fragment conditional spawning: check if food threshold now met
    if (ctx.state._ateFood && !ctx.state.fragment && !ctx.state._collectedFragment) {
        var pendingFrag = ctx.spawnFragmentForLevel(ctx.state.level, ctx.state.foodEaten);
        if (pendingFrag) {
            ctx.state = Object.assign({}, ctx.state, { fragment: pendingFrag });
        }
    }

    // Boss clone hit: score penalty + visual feedback
    if (ctx.state._bossCloneHit) {
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, '#ff6600', 8, 40, 0.3);
        ctx.shakeState = triggerShake(3, 0.15);
        ctx.messageEl.textContent = 'SHADOW CLONE \u2014 -5 POINTS';
        ctx.messageEl.className = 'active';
        ctx.messageEl.style.color = '#ff6600';
        setTimeout(function() {
            ctx.messageEl.textContent = '';
            ctx.messageEl.className = '';
            ctx.messageEl.style.color = '';
        }, 1200);
    }

    // Boss food pulse: visual burst from hunter
    if (ctx.state._bossPulseTriggered && ctx.state.hunter) {
        var pulseHead = ctx.state.hunter.segments[0];
        playBossFoodPulseSound();
        ctx.particleSystem = emitBurst(ctx.particleSystem, pulseHead.x, pulseHead.y, '#ff6600', 20, 80, 0.6);
        ctx.shakeState = triggerShake(4, 0.2);
    }

    // Boss phase transition: dramatic shake + escalating sound
    if (ctx.state._bossPhaseChanged && ctx.state.bossState) {
        var phaseShakeIntensity = ctx.state.bossState.phase === 3 ? 10 : 6;
        playBossPhaseTransitionSound(ctx.state.bossState.phase);
        ctx.shakeState = triggerShake(phaseShakeIntensity, 0.4);
        ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, '#ff4400', 24, 90, 0.7);
        // Shadow clones materialize at phase 2 entry
        if (ctx.state.bossState.phase === 2) {
            playBossShadowCloneSpawnSound();
        }
    }

    // Boss shockwave activation: alarming crunch as arena closes
    if (ctx.state._bossShockwaveActivated) {
        playBossShockwaveSound();
    }

    // Boss Phase 3 survival: 30 seconds = ~400 ticks at ~13.3 ticks/sec
    if (ctx.state.bossState && ctx.state.bossState.phase === 3 && ctx.state.bossPhase3Ticks >= 400 && !ctx.state._bossPhase3Unlocked) {
        ctx.tryUnlock('boss_phase3_survivor');
        ctx.state = Object.assign({}, ctx.state, { _bossPhase3Unlocked: true });
    }

    // Arena shrink: shake
    if (ctx.state._shrinkOccurred) {
        playShrinkSound();
        ctx.ui.showShrinkMessage();
        ctx.shakeState = triggerShake(5, 0.25);
        var arenaW = ctx.state.arenaMaxX - ctx.state.arenaMinX + 1;
        var arenaH = ctx.state.arenaMaxY - ctx.state.arenaMinY + 1;
        if (arenaW <= 8 && arenaH <= 8) ctx.tryUnlock('survivor');
    }

    // Teleport: detect by checking if head moved more than 2 cells (skip on wrap-around levels)
    if (!ctx.state.gameOver && ctx.prevState.started && !ctx.config.wrapAround) {
        var headDx = Math.abs(ctx.state.snake[0].x - ctx.prevState.snake[0].x);
        var headDy = Math.abs(ctx.state.snake[0].y - ctx.prevState.snake[0].y);
        if (headDx > 2 || headDy > 2) {
            recordPortalUse();
            playPortalSound();
            var portalColor = ctx.config.portalColor || '#8b5cf6';
            ctx.particleSystem = emitPortalSwirl(ctx.particleSystem, ctx.prevState.snake[0].x, ctx.prevState.snake[0].y, portalColor);
            ctx.particleSystem = emitPortalSwirl(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, portalColor);
        }
    }

    // Death detected: check lives for respawn or game over
    if (ctx.state.gameOver && !ctx.prevState.gameOver) {
        ctx.prevSnake = null;
        ctx.prevHunterSegments = null;
        ctx.hunterIntroState = null;

        if (ctx.state.lives > 1) {
            // Life lost: respawn with invincibility instead of game over
            playLifeLostSound();
            ctx.particleSystem = emitBurst(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, '#ffffff', 16, 50, 0.4);
            ctx.shakeState = triggerShake(5, 0.2);

            // Respawn snake at a safe position (avoids walls, obstacles, portals, hunter)
            var spawnPos = randomPosition([], ctx.state.walls, ctx.state.obstacles, ctx.state.portals, null, ctx.state.hunter);
            var spawnSnake = [spawnPos];
            var newLives = ctx.state.lives - 1;
            var respawnState = Object.assign({}, ctx.state, {
                snake: spawnSnake,
                direction: { x: 0, y: 0 },
                nextDirection: { x: 0, y: 0 },
                gameOver: false,
                started: false,
                lives: newLives,
                invincibleTicks: INVINCIBLE_TICKS,
                powerUp: null,
                activePowerUp: null,
                powerUpSpawnCounter: 0,
                bossState: ctx.state.bossState ? createBossState() : null,
                bossPhase3Ticks: 0,
                bossCloneHitThisRun: false,
                _bossPhase3Unlocked: false,
                _killedByHunter: false,
                _deathCause: null,
            });
            // Respawn food at safe location
            respawnState = Object.assign({}, respawnState, {
                food: randomPosition(spawnSnake, ctx.state.walls, ctx.state.obstacles, ctx.state.portals, null, ctx.state.hunter),
            });
            ctx.state = respawnState;
            ctx.hunterTrailHistory = [];

            // Update lives HUD
            if (ctx.dom.livesEl) {
                ctx.dom.livesEl.textContent = newLives;
            }

            ctx.messageEl.textContent = 'LIFE LOST \u2014 ' + newLives + ' remaining. Arrow keys or swipe to continue';
            ctx.messageEl.className = 'active';
            ctx.messageEl.style.color = '#ef4444';
            return;
        }

        // Final death — true game over
        recordDeath(ctx.state.level);
        recordBestScore(ctx.state.level, ctx.state.score);

        // Speedrun: stop timer on final death
        if (ctx.speedrunState) {
            ctx.speedrunState = stopSpeedrunTimer(ctx.speedrunState);
        }

        // Save endless high scores on death
        if (ctx.endlessMode) {
            setEndlessHighScore(ctx.state.score);
            setEndlessHighWave(ctx.state.endlessWave);
        }

        if (ctx.state._killedByHunter) {
            // ALPHA kill: distinctive sound, orange particles, heavier shake
            playHunterKillSound();
            ctx.particleSystem = emitExplosion(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, ctx.config.hunterColor || '#f97316', '#ff2200');
            ctx.shakeState = triggerShake(12, 0.5);
        } else {
            playDeathSound();
            ctx.particleSystem = emitExplosion(ctx.particleSystem, ctx.state.snake[0].x, ctx.state.snake[0].y, ctx.config.color, '#ef4444');
            ctx.shakeState = triggerShake(8, 0.4);
        }

        // Ending sequence for Level 10 deaths (normal mode only)
        if (!ctx.endlessMode && ctx.state.level === MAX_LEVEL && ctx.currentScreen !== 'ending') {
            if (ctx.state.score > ctx.highScore) {
                ctx.highScore = ctx.state.score;
                localStorage.setItem('snake-highscore', String(ctx.highScore));
                ctx.dom.highScoreEl.textContent = ctx.highScore;
            }
            var deathEndingType = ctx.state.foodEaten >= DELETION_FOOD_THRESHOLD ? 'deletion' : 'loop';
            ctx.endingState = createEndingState(deathEndingType);
            unlockEnding(deathEndingType);
            ctx.checkAllEndings();
            ctx.currentScreen = 'ending';
            ctx.hideGameplayUI();
            ctx.ui.clearTimers();
        }
    }
}
