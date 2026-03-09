'use strict';

// --- Audio System ---
// All sounds are procedurally generated using Web Audio API.
// No external audio files needed.
//
// NOTE: audioCtx and masterGain are necessarily mutable singletons
// (browser API constraint). Config values use immutable update pattern.

var audioCtx = null;
var masterGain = null;
var noiseBuffer = null;
var audioConfig = { soundEnabled: true, masterVolume: 0.3 };

function getContext() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.setValueAtTime(audioConfig.masterVolume, audioCtx.currentTime);
            masterGain.connect(audioCtx.destination);
        } catch (e) {
            audioConfig = Object.assign({}, audioConfig, { soundEnabled: false });
            return null;
        }
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(function() {
            // Browser blocked audio resume (autoplay policy)
        });
    }
    return audioCtx;
}

// Helper: create an oscillator with auto-disconnect on end
function createTone(ctx, type, startTime, stopTime) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(startTime);
    osc.stop(stopTime);
    osc.onended = function() {
        osc.disconnect();
        gain.disconnect();
    };
    return { osc: osc, gain: gain };
}

// Helper: create a buffer source with auto-disconnect on end
function createBufferSource(ctx, buffer, startTime, stopTime) {
    var source = ctx.createBufferSource();
    source.buffer = buffer;
    var gain = ctx.createGain();
    source.connect(gain);
    gain.connect(masterGain);
    source.start(startTime);
    source.stop(stopTime);
    source.onended = function() {
        source.disconnect();
        gain.disconnect();
    };
    return { source: source, gain: gain };
}

function getNoiseBuffer(ctx) {
    if (noiseBuffer) return noiseBuffer;
    var bufferSize = Math.floor(ctx.sampleRate * 0.3);
    noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    return noiseBuffer;
}

export function initAudio() {
    getContext();
}

export function getAudioContext() {
    return getContext();
}

export function getMasterGain() {
    return masterGain;
}

export function setSoundEnabled(enabled) {
    audioConfig = Object.assign({}, audioConfig, { soundEnabled: enabled });
}

export function isSoundEnabled() {
    return audioConfig.soundEnabled;
}

export function setVolume(vol) {
    var clamped = Math.max(0, Math.min(1, vol));
    audioConfig = Object.assign({}, audioConfig, { masterVolume: clamped });
    if (masterGain && audioCtx) {
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
        masterGain.gain.linearRampToValueAtTime(clamped, audioCtx.currentTime + 0.02);
    }
}

export function getVolume() {
    return audioConfig.masterVolume;
}

// --- Sound Generators ---

export function playEatSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    var tone = createTone(ctx, 'sine', now, now + 0.12);
    tone.osc.frequency.setValueAtTime(440, now);
    tone.osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
    tone.gain.gain.setValueAtTime(0.25, now);
    tone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
}

export function playBonusFoodSound(foodType) {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    if (foodType === 'golden') {
        // Three rising notes — celebratory jingle
        var goldenNotes = [880, 1108, 1318]; // A5, C#6, E6
        goldenNotes.forEach(function(freq, i) {
            var t = now + i * 0.07;
            var tone = createTone(ctx, 'sine', t, t + 0.18);
            tone.osc.frequency.setValueAtTime(freq, t);
            tone.gain.gain.setValueAtTime(0, t);
            tone.gain.gain.linearRampToValueAtTime(0.28, t + 0.02);
            tone.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        });
    } else if (foodType === 'clock') {
        // Descending chime — time winding down
        var clockTone = createTone(ctx, 'triangle', now, now + 0.3);
        clockTone.osc.frequency.setValueAtTime(1200, now);
        clockTone.osc.frequency.exponentialRampToValueAtTime(400, now + 0.25);
        clockTone.gain.gain.setValueAtTime(0.2, now);
        clockTone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    } else if (foodType === 'speed') {
        // Short sharp ascending chirp — fast!
        var speedTone = createTone(ctx, 'sawtooth', now, now + 0.1);
        speedTone.osc.frequency.setValueAtTime(300, now);
        speedTone.osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
        speedTone.gain.gain.setValueAtTime(0.18, now);
        speedTone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    }
}

export function playLevelUpSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    var notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach(function(freq, i) {
        var startTime = now + i * 0.1;
        var tone = createTone(ctx, 'sine', startTime, startTime + 0.25);
        tone.osc.frequency.setValueAtTime(freq, startTime);
        tone.gain.gain.setValueAtTime(0, startTime);
        tone.gain.gain.linearRampToValueAtTime(0.2, startTime + 0.03);
        tone.gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
    });
}

export function playDeathSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Low rumble
    var tone = createTone(ctx, 'sawtooth', now, now + 0.5);
    tone.osc.frequency.setValueAtTime(200, now);
    tone.osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
    tone.gain.gain.setValueAtTime(0.2, now);
    tone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    // Noise burst (cached buffer)
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.3);
    buf.gain.gain.setValueAtTime(0.15, now);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
}

export function playPowerUpCollectSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Shimmering arpeggio
    var freqs = [600, 800, 1000, 1200, 1600];
    freqs.forEach(function(freq, i) {
        var startTime = now + i * 0.04;
        var tone = createTone(ctx, 'sine', startTime, startTime + 0.2);
        tone.osc.frequency.setValueAtTime(freq, startTime);
        tone.gain.gain.setValueAtTime(0, startTime);
        tone.gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
        tone.gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
    });
}

export function playMagnetCollectSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Magnetic hum: two descending sine tones pulling in together
    var hum1 = createTone(ctx, 'sine', now, now + 0.4);
    hum1.osc.frequency.setValueAtTime(900, now);
    hum1.osc.frequency.exponentialRampToValueAtTime(300, now + 0.4);
    hum1.gain.gain.setValueAtTime(0, now);
    hum1.gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
    hum1.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    // Warm low pulse underneath
    var hum2 = createTone(ctx, 'triangle', now + 0.05, now + 0.35);
    hum2.osc.frequency.setValueAtTime(220, now + 0.05);
    hum2.osc.frequency.linearRampToValueAtTime(180, now + 0.35);
    hum2.gain.gain.setValueAtTime(0.12, now + 0.05);
    hum2.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    // Final golden ping
    var ping = createTone(ctx, 'sine', now + 0.3, now + 0.55);
    ping.osc.frequency.setValueAtTime(1200, now + 0.3);
    ping.osc.frequency.exponentialRampToValueAtTime(800, now + 0.55);
    ping.gain.gain.setValueAtTime(0.08, now + 0.3);
    ping.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
}

export function playPortalSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    var tone = createTone(ctx, 'sine', now, now + 0.25);
    tone.osc.frequency.setValueAtTime(300, now);
    tone.osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    tone.osc.frequency.exponentialRampToValueAtTime(400, now + 0.25);
    tone.gain.gain.setValueAtTime(0.15, now);
    tone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
}

export function playShrinkSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Deep warning rumble
    var tone1 = createTone(ctx, 'triangle', now, now + 0.4);
    tone1.osc.frequency.setValueAtTime(80, now);
    tone1.osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
    tone1.gain.gain.setValueAtTime(0.2, now);
    tone1.gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    tone1.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    // High warning ping
    var tone2 = createTone(ctx, 'sine', now, now + 0.15);
    tone2.osc.frequency.setValueAtTime(1200, now);
    tone2.osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    tone2.gain.gain.setValueAtTime(0.08, now);
    tone2.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
}

export function playMenuSelectSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    var tone = createTone(ctx, 'sine', now, now + 0.08);
    tone.osc.frequency.setValueAtTime(660, now);
    tone.gain.gain.setValueAtTime(0.1, now);
    tone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
}

export function playMenuNavigateSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    var tone = createTone(ctx, 'sine', now, now + 0.05);
    tone.osc.frequency.setValueAtTime(440, now);
    tone.gain.gain.setValueAtTime(0.06, now);
    tone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
}

export function playFragmentCollectSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Crystal chime: ascending high-pitch sine tones
    var freqs = [1200, 1800, 2400];
    freqs.forEach(function(freq, i) {
        var startTime = now + i * 0.08;
        var tone = createTone(ctx, 'sine', startTime, startTime + 0.3);
        tone.osc.frequency.setValueAtTime(freq, startTime);
        tone.gain.gain.setValueAtTime(0, startTime);
        tone.gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
        tone.gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
    });
}

export function playStartSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Quick ascending two-note
    var notes = [330, 440];
    notes.forEach(function(freq, i) {
        var t = now + i * 0.08;
        var tone = createTone(ctx, 'sine', t, t + 0.12);
        tone.osc.frequency.setValueAtTime(freq, t);
        tone.gain.gain.setValueAtTime(0.15, t);
        tone.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    });
}

export function playLifeLostSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Warning descending tone — less dramatic than death, signals danger
    var tone = createTone(ctx, 'triangle', now, now + 0.35);
    tone.osc.frequency.setValueAtTime(600, now);
    tone.osc.frequency.exponentialRampToValueAtTime(200, now + 0.35);
    tone.gain.gain.setValueAtTime(0.2, now);
    tone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    // Short noise burst
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.15);
    buf.gain.gain.setValueAtTime(0.08, now);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
}

export function playHunterKillSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Aggressive growl: descending sawtooth
    var growl = createTone(ctx, 'sawtooth', now, now + 0.6);
    growl.osc.frequency.setValueAtTime(250, now);
    growl.osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
    growl.gain.gain.setValueAtTime(0.25, now);
    growl.gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    growl.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    // Sharp attack bite: short high square wave
    var bite = createTone(ctx, 'square', now, now + 0.08);
    bite.osc.frequency.setValueAtTime(800, now);
    bite.osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
    bite.gain.gain.setValueAtTime(0.12, now);
    bite.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    // Noise burst
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.4);
    buf.gain.gain.setValueAtTime(0.18, now);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
}

export function playSecretSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Glitchy digital activation: descending square + ascending square
    var tone1 = createTone(ctx, 'square', now, now + 0.08);
    tone1.osc.frequency.setValueAtTime(1200, now);
    tone1.osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
    tone1.gain.gain.setValueAtTime(0.08, now);
    tone1.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    var tone2 = createTone(ctx, 'square', now + 0.1, now + 0.2);
    tone2.osc.frequency.setValueAtTime(800, now + 0.1);
    tone2.osc.frequency.exponentialRampToValueAtTime(1600, now + 0.2);
    tone2.gain.gain.setValueAtTime(0.06, now + 0.1);
    tone2.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
}

export function playAchievementSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Triumphant ascending chime: bright sine notes with shimmer
    var notes = [660, 880, 1100, 1320];
    notes.forEach(function(freq, i) {
        var t = now + i * 0.07;
        var tone = createTone(ctx, 'sine', t, t + 0.35);
        tone.osc.frequency.setValueAtTime(freq, t);
        tone.gain.gain.setValueAtTime(0, t);
        tone.gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
        tone.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    });
    // Final shimmer
    var shimmer = createTone(ctx, 'triangle', now + 0.28, now + 0.6);
    shimmer.osc.frequency.setValueAtTime(1760, now + 0.28);
    shimmer.gain.gain.setValueAtTime(0.06, now + 0.28);
    shimmer.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
}

export function playComboSound(multiplier) {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Short ascending ping — pitch scales with multiplier (2x through 5x)
    var baseFreq = 600 + (multiplier - 2) * 200; // 600, 800, 1000, 1200
    var tone = createTone(ctx, 'sine', now, now + 0.1);
    tone.osc.frequency.setValueAtTime(baseFreq, now);
    tone.osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.07);
    tone.gain.gain.setValueAtTime(0.15, now);
    tone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
}

export function playShieldBreakSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Crystal shatter: high descending ping + noise burst
    var ping = createTone(ctx, 'sine', now, now + 0.3);
    ping.osc.frequency.setValueAtTime(1800, now);
    ping.osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
    ping.gain.gain.setValueAtTime(0.18, now);
    ping.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    // Short high square hit
    var hit = createTone(ctx, 'square', now, now + 0.1);
    hit.osc.frequency.setValueAtTime(2400, now);
    hit.osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    hit.gain.gain.setValueAtTime(0.1, now);
    hit.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    // Noise burst
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.2);
    buf.gain.gain.setValueAtTime(0.1, now);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
}

export function playHunterIntroSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Ominous low drone + warning ping
    var drone = createTone(ctx, 'triangle', now, now + 0.8);
    drone.osc.frequency.setValueAtTime(60, now);
    drone.osc.frequency.linearRampToValueAtTime(80, now + 0.4);
    drone.osc.frequency.linearRampToValueAtTime(55, now + 0.8);
    drone.gain.gain.setValueAtTime(0.15, now);
    drone.gain.gain.linearRampToValueAtTime(0.2, now + 0.2);
    drone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    // Warning stab
    var stab = createTone(ctx, 'square', now + 0.15, now + 0.35);
    stab.osc.frequency.setValueAtTime(440, now + 0.15);
    stab.osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);
    stab.gain.gain.setValueAtTime(0.08, now + 0.15);
    stab.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
}

// --- Boss-Specific Sound Effects ---

// Phase 1: Food pulse broadcast — ethereal pulsing wave from the boss
export function playBossFoodPulseSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Sweeping sine wave: low to high, then decay — feels like a broadcast ping
    var sweep = createTone(ctx, 'sine', now, now + 0.5);
    sweep.osc.frequency.setValueAtTime(200, now);
    sweep.osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
    sweep.osc.frequency.exponentialRampToValueAtTime(300, now + 0.5);
    sweep.gain.gain.setValueAtTime(0, now);
    sweep.gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
    sweep.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    // Ethereal shimmer: two high sine tones
    var shimmer1 = createTone(ctx, 'sine', now + 0.1, now + 0.45);
    shimmer1.osc.frequency.setValueAtTime(1400, now + 0.1);
    shimmer1.osc.frequency.linearRampToValueAtTime(1600, now + 0.45);
    shimmer1.gain.gain.setValueAtTime(0, now + 0.1);
    shimmer1.gain.gain.linearRampToValueAtTime(0.07, now + 0.15);
    shimmer1.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    var shimmer2 = createTone(ctx, 'sine', now + 0.18, now + 0.4);
    shimmer2.osc.frequency.setValueAtTime(2000, now + 0.18);
    shimmer2.osc.frequency.linearRampToValueAtTime(1800, now + 0.4);
    shimmer2.gain.gain.setValueAtTime(0, now + 0.18);
    shimmer2.gain.gain.linearRampToValueAtTime(0.05, now + 0.22);
    shimmer2.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
}

// Phase 2: Shadow clone spawn — dark, menacing materialization
export function playBossShadowCloneSpawnSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Deep descending growl: sawtooth drone materializing from nothing
    var growl = createTone(ctx, 'sawtooth', now, now + 0.6);
    growl.osc.frequency.setValueAtTime(180, now);
    growl.osc.frequency.exponentialRampToValueAtTime(55, now + 0.6);
    growl.gain.gain.setValueAtTime(0, now);
    growl.gain.gain.linearRampToValueAtTime(0.22, now + 0.08);
    growl.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    // Sinister high whine: brief square stab
    var whine = createTone(ctx, 'square', now, now + 0.12);
    whine.osc.frequency.setValueAtTime(900, now);
    whine.osc.frequency.exponentialRampToValueAtTime(400, now + 0.12);
    whine.gain.gain.setValueAtTime(0.1, now);
    whine.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    // Noise burst: brief static crackle of dark energy
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now + 0.05, now + 0.25);
    buf.gain.gain.setValueAtTime(0.12, now + 0.05);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
}

// Phase 3: Shockwave activation — intense alarming pulse as arena closes in
export function playBossShockwaveSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Heavy low impact: triangle thud
    var thud = createTone(ctx, 'triangle', now, now + 0.35);
    thud.osc.frequency.setValueAtTime(100, now);
    thud.osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);
    thud.gain.gain.setValueAtTime(0.28, now);
    thud.gain.gain.linearRampToValueAtTime(0.3, now + 0.03);
    thud.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    // Sharp alarm ping: descending square
    var alarm = createTone(ctx, 'square', now, now + 0.18);
    alarm.osc.frequency.setValueAtTime(1100, now);
    alarm.osc.frequency.exponentialRampToValueAtTime(550, now + 0.18);
    alarm.gain.gain.setValueAtTime(0.12, now);
    alarm.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    // Second alarm ping: delayed
    var alarm2 = createTone(ctx, 'square', now + 0.12, now + 0.28);
    alarm2.osc.frequency.setValueAtTime(880, now + 0.12);
    alarm2.osc.frequency.exponentialRampToValueAtTime(440, now + 0.28);
    alarm2.gain.gain.setValueAtTime(0.08, now + 0.12);
    alarm2.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    // Noise burst: shockwave impact
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.2);
    buf.gain.gain.setValueAtTime(0.15, now);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
}

// Phase transitions (1→2 and 2→3): escalating dramatic sting
// phase: 2 = evolved (dark/menacing), 3 = berserk (intense/catastrophic)
export function playBossPhaseTransitionSound(phase) {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    if (phase === 3) {
        // Phase 3 (BERSERK): catastrophic — deep explosion + screaming descent
        var blast = createTone(ctx, 'sawtooth', now, now + 0.8);
        blast.osc.frequency.setValueAtTime(300, now);
        blast.osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);
        blast.gain.gain.setValueAtTime(0.3, now);
        blast.gain.gain.linearRampToValueAtTime(0.35, now + 0.05);
        blast.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        var scream = createTone(ctx, 'square', now, now + 0.5);
        scream.osc.frequency.setValueAtTime(800, now);
        scream.osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
        scream.gain.gain.setValueAtTime(0.15, now);
        scream.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.5);
        buf.gain.gain.setValueAtTime(0.2, now);
        buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        // Ringing alarm after the blast
        var ring = createTone(ctx, 'sine', now + 0.3, now + 1.0);
        ring.osc.frequency.setValueAtTime(440, now + 0.3);
        ring.osc.frequency.exponentialRampToValueAtTime(220, now + 1.0);
        ring.gain.gain.setValueAtTime(0, now + 0.3);
        ring.gain.gain.linearRampToValueAtTime(0.12, now + 0.4);
        ring.gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    } else {
        // Phase 2 (EVOLVED): ominous ascending swell + dark stab
        var swell = createTone(ctx, 'triangle', now, now + 0.7);
        swell.osc.frequency.setValueAtTime(80, now);
        swell.osc.frequency.exponentialRampToValueAtTime(200, now + 0.4);
        swell.osc.frequency.exponentialRampToValueAtTime(60, now + 0.7);
        swell.gain.gain.setValueAtTime(0, now);
        swell.gain.gain.linearRampToValueAtTime(0.25, now + 0.2);
        swell.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

        var darkStab = createTone(ctx, 'sawtooth', now + 0.1, now + 0.4);
        darkStab.osc.frequency.setValueAtTime(500, now + 0.1);
        darkStab.osc.frequency.exponentialRampToValueAtTime(120, now + 0.4);
        darkStab.gain.gain.setValueAtTime(0.18, now + 0.1);
        darkStab.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        var darkBuf = createBufferSource(ctx, getNoiseBuffer(ctx), now + 0.05, now + 0.3);
        darkBuf.gain.gain.setValueAtTime(0.1, now + 0.05);
        darkBuf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    }
}

// Boss death: triumphant cosmic resolution — the ALPHA falls
export function playBossDeathSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Descending cosmic impact: sawtooth crash
    var crash = createTone(ctx, 'sawtooth', now, now + 0.6);
    crash.osc.frequency.setValueAtTime(400, now);
    crash.osc.frequency.exponentialRampToValueAtTime(40, now + 0.6);
    crash.gain.gain.setValueAtTime(0.3, now);
    crash.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    // Noise explosion
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.5);
    buf.gain.gain.setValueAtTime(0.25, now);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    // Triumphant rising chord: ascending bright sine notes
    var chord = [330, 440, 554, 660, 880, 1108];
    chord.forEach(function(freq, i) {
        var t = now + 0.3 + i * 0.1;
        var tone = createTone(ctx, 'sine', t, t + 0.7);
        tone.osc.frequency.setValueAtTime(freq, t);
        tone.gain.gain.setValueAtTime(0, t);
        tone.gain.gain.linearRampToValueAtTime(0.14, t + 0.04);
        tone.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    });

    // Final cosmic shimmer: high triangle sustain
    var shimmer = createTone(ctx, 'triangle', now + 0.8, now + 2.0);
    shimmer.osc.frequency.setValueAtTime(2200, now + 0.8);
    shimmer.osc.frequency.linearRampToValueAtTime(1760, now + 2.0);
    shimmer.gain.gain.setValueAtTime(0, now + 0.8);
    shimmer.gain.gain.linearRampToValueAtTime(0.08, now + 0.95);
    shimmer.gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
}

// --- Wave Event Stingers ---

// Food Surge: bright ascending sparkle burst
export function playWaveEventFoodSurgeSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
        var t = now + i * 0.06;
        var tone = createTone(ctx, 'sine', t, t + 0.25);
        tone.osc.frequency.setValueAtTime(notes[i], t);
        tone.gain.gain.setValueAtTime(0.15, t);
        tone.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    }
}

// Speed Burst warning: quick alarm beeps
export function playWaveEventSpeedWarningSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;
    for (var i = 0; i < 3; i++) {
        var t = now + i * 0.12;
        var tone = createTone(ctx, 'square', t, t + 0.08);
        tone.osc.frequency.setValueAtTime(880, t);
        tone.gain.gain.setValueAtTime(0.12, t);
        tone.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    }
}

// Speed Burst start: aggressive rising saw
export function playWaveEventSpeedBurstSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;
    var tone = createTone(ctx, 'sawtooth', now, now + 0.35);
    tone.osc.frequency.setValueAtTime(200, now);
    tone.osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
    tone.osc.frequency.exponentialRampToValueAtTime(600, now + 0.35);
    tone.gain.gain.setValueAtTime(0.18, now);
    tone.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
}

// Gravity Flip: dramatic whoosh with pitch inversion
export function playWaveEventGravityFlipSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;
    var whoosh = createTone(ctx, 'triangle', now, now + 0.4);
    whoosh.osc.frequency.setValueAtTime(800, now);
    whoosh.osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);
    whoosh.gain.gain.setValueAtTime(0.2, now);
    whoosh.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.2);
    buf.gain.gain.setValueAtTime(0.1, now);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
}

// Portal Storm: eerie warbling tones
export function playWaveEventPortalStormSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;
    var tone1 = createTone(ctx, 'sine', now, now + 0.5);
    tone1.osc.frequency.setValueAtTime(300, now);
    tone1.osc.frequency.linearRampToValueAtTime(500, now + 0.25);
    tone1.osc.frequency.linearRampToValueAtTime(300, now + 0.5);
    tone1.gain.gain.setValueAtTime(0.15, now);
    tone1.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    var tone2 = createTone(ctx, 'sine', now + 0.05, now + 0.45);
    tone2.osc.frequency.setValueAtTime(450, now + 0.05);
    tone2.osc.frequency.linearRampToValueAtTime(650, now + 0.25);
    tone2.osc.frequency.linearRampToValueAtTime(450, now + 0.45);
    tone2.gain.gain.setValueAtTime(0.1, now + 0.05);
    tone2.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
}

// --- Hazard Sound Effects ---

// Lava death: deep rumbling bass + sharp hiss/sizzle
export function playLavaDeathSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Deep rumble: sawtooth descending from 80Hz to 20Hz
    var rumble = createTone(ctx, 'sawtooth', now, now + 0.5);
    rumble.osc.frequency.setValueAtTime(80, now);
    rumble.osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
    rumble.gain.gain.setValueAtTime(0.25, now);
    rumble.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    // Sizzle: high-pass filtered noise burst
    var buf = createBufferSource(ctx, getNoiseBuffer(ctx), now, now + 0.5);
    var sizzleFilter = ctx.createBiquadFilter();
    sizzleFilter.type = 'highpass';
    sizzleFilter.frequency.setValueAtTime(2000, now);
    buf.gain.disconnect();
    buf.source.disconnect();
    buf.source.connect(sizzleFilter);
    sizzleFilter.connect(buf.gain);
    buf.gain.connect(masterGain);
    buf.gain.gain.setValueAtTime(0.15, now);
    buf.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    buf.source.onended = function() {
        buf.source.disconnect();
        sizzleFilter.disconnect();
        buf.gain.disconnect();
    };
}

// Spike death: sharp metallic snap/clang, short and percussive
export function playSpikeDeathSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Metallic clang: square wave with rapid decay
    var clang = createTone(ctx, 'square', now, now + 0.2);
    clang.osc.frequency.setValueAtTime(600, now);
    clang.osc.frequency.exponentialRampToValueAtTime(1, now + 0.15);
    clang.gain.gain.setValueAtTime(0.22, now);
    clang.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    // High-frequency ping
    var ping = createTone(ctx, 'sine', now, now + 0.1);
    ping.osc.frequency.setValueAtTime(2000, now);
    ping.osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
    ping.gain.gain.setValueAtTime(0.12, now);
    ping.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
}

// Ice slide: soft shimmering glide (non-lethal, player is slowed)
export function playIceSlideSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;

    // Gentle sine sweep from 800Hz down to 400Hz
    var glide = createTone(ctx, 'sine', now, now + 0.3);
    glide.osc.frequency.setValueAtTime(800, now);
    glide.osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
    glide.gain.gain.setValueAtTime(0.1, now);
    glide.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
}

// Gold Rush: triumphant coin-like chime
export function playWaveEventGoldRushSound() {
    var ctx = getContext();
    if (!ctx || !audioConfig.soundEnabled) return;
    var now = ctx.currentTime;
    var chime1 = createTone(ctx, 'sine', now, now + 0.3);
    chime1.osc.frequency.setValueAtTime(1318, now);
    chime1.gain.gain.setValueAtTime(0.18, now);
    chime1.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    var chime2 = createTone(ctx, 'sine', now + 0.08, now + 0.35);
    chime2.osc.frequency.setValueAtTime(1568, now + 0.08);
    chime2.gain.gain.setValueAtTime(0.15, now + 0.08);
    chime2.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    var chime3 = createTone(ctx, 'triangle', now + 0.16, now + 0.45);
    chime3.osc.frequency.setValueAtTime(2093, now + 0.16);
    chime3.gain.gain.setValueAtTime(0.1, now + 0.16);
    chime3.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
}
