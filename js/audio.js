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
