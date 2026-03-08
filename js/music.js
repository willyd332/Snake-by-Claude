'use strict';

// --- Procedural Ambient Music System ---
// Generates adaptive, layered music using Web Audio API.
// Five layers: bass drone, mid pad, arpeggiated melody, high texture, rhythmic pulse.
// Intensity adapts to wave number, wall proximity, snake length, and hunter distance.
// All procedural — zero audio file dependencies.
//
// NOTE: musicState is a mutable singleton (Web Audio API constraint).
// Volume constants use immutable update patterns where possible.

import { getSettingsRef } from './settings.js';

// --- Volume Constants ---
var MUSIC_VOL = 0.12;
var BASS_VOL = 0.08;
var PAD_VOL = 0.05;
var MELODY_VOL = 0.06;
var TEXTURE_VOL = 0.03;
var RHYTHM_VOL = 0.04;

// --- Tonal Palettes Per Wave Range ---
// Each palette defines a 7-note scale, bass roots, and oscillator types.
// Waves cycle through increasingly tense palettes.
var WAVE_PALETTES = [
    // Waves 1-3: Gentle sine pads, C major pentatonic feel
    {
        scale: [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94],
        bassRoots: [65.41, 73.42, 82.41],
        padType: 'sine',
        bassFilterCutoff: 200,
        textureCenter: 3000,
        textureQ: 2,
    },
    // Waves 4-6: Warmer triangle pads, Dorian feel
    {
        scale: [146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63],
        bassRoots: [73.42, 82.41, 98.00],
        padType: 'triangle',
        bassFilterCutoff: 260,
        textureCenter: 3500,
        textureQ: 3,
    },
    // Waves 7-9: Edgier, portals active, minor feel
    {
        scale: [164.81, 185.00, 196.00, 220.00, 246.94, 261.63, 293.66],
        bassRoots: [82.41, 92.50, 98.00],
        padType: 'triangle',
        bassFilterCutoff: 300,
        textureCenter: 4000,
        textureQ: 4,
    },
    // Waves 10-12: Tense, obstacles + wrap-around
    {
        scale: [174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63],
        bassRoots: [87.31, 98.00, 110.00],
        padType: 'triangle',
        bassFilterCutoff: 320,
        textureCenter: 4500,
        textureQ: 5,
    },
    // Waves 13-16: ALPHA hunter active, sawtooth drones
    {
        scale: [196.00, 220.00, 233.08, 261.63, 293.66, 311.13, 349.23],
        bassRoots: [98.00, 110.00, 116.54],
        padType: 'sawtooth',
        bassFilterCutoff: 350,
        textureCenter: 5000,
        textureQ: 6,
    },
    // Waves 17-20: Shrinking arena, high tension
    {
        scale: [220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00],
        bassRoots: [110.00, 123.47, 130.81],
        padType: 'sawtooth',
        bassFilterCutoff: 380,
        textureCenter: 5500,
        textureQ: 7,
    },
    // Waves 21+: Maximum intensity, everything active
    {
        scale: [246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00],
        bassRoots: [123.47, 130.81, 146.83],
        padType: 'sawtooth',
        bassFilterCutoff: 420,
        textureCenter: 6000,
        textureQ: 8,
    },
];

var PROGRESSIONS = [[0, 3, 4, 2], [0, 2, 5, 3], [0, 4, 3, 1]];

// Scheduler constants
var LOOKAHEAD = 0.3;
var SCHEDULER_INTERVAL_MS = 100;

// Throttle: minimum seconds between intensity updates to avoid audio glitches
var INTENSITY_UPDATE_COOLDOWN = 0.15;

var musicState = null;

// --- Helpers ---

function rampGain(gainNode, time, target, duration) {
    gainNode.gain.cancelScheduledValues(time);
    gainNode.gain.setValueAtTime(gainNode.gain.value, time);
    gainNode.gain.linearRampToValueAtTime(Math.max(0, target), time + duration);
}

function rampFrequency(param, time, target, duration) {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
    param.linearRampToValueAtTime(Math.max(1, target), time + duration);
}

function getPalette(wave) {
    if (wave <= 3) return WAVE_PALETTES[0];
    if (wave <= 6) return WAVE_PALETTES[1];
    if (wave <= 9) return WAVE_PALETTES[2];
    if (wave <= 12) return WAVE_PALETTES[3];
    if (wave <= 16) return WAVE_PALETTES[4];
    if (wave <= 20) return WAVE_PALETTES[5];
    return WAVE_PALETTES[6];
}

function getIntensityTier(wave) {
    if (wave <= 5) return 'chill';
    if (wave <= 12) return 'medium';
    return 'intense';
}

function getTempo(wave) {
    var bpm = Math.min(140, 70 + wave * 3.5);
    return 60 / bpm;
}

function createMusicGain(ctx, destination, volume) {
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.connect(destination);
    return gain;
}

function getMusicVolumeSetting() {
    var settings = getSettingsRef();
    if (typeof settings.musicVolume === 'number') {
        return Math.max(0, Math.min(1, settings.musicVolume));
    }
    return 1.0;
}

// --- Compute Adaptive Intensity ---
// Returns a 0-1 value representing overall musical tension.
// Factors: wave number, wall inset, snake length, hunter proximity.

function computeIntensity(wave, wallInset, snakeLength, hunterDistance) {
    // Wave contributes 0-0.4 (caps at wave 25)
    var waveFactor = Math.min(1, (wave - 1) / 24) * 0.4;

    // Wall urgency contributes 0-0.25 (wallInset is how many rows shrunk)
    var wallFactor = Math.min(1, (wallInset || 0) / 6) * 0.25;

    // Snake length contributes 0-0.2 (long snake = more tension)
    var lengthFactor = Math.min(1, (snakeLength || 1) / 30) * 0.2;

    // Hunter proximity contributes 0-0.15 (close hunter = high urgency)
    // hunterDistance of 0 means no hunter; lower distance = more danger
    var hunterFactor = 0;
    if (hunterDistance !== null && hunterDistance !== undefined && hunterDistance > 0) {
        // Distance 1-3 = very dangerous, 4-8 = moderate, 9+ = low threat
        hunterFactor = Math.max(0, 1 - (hunterDistance - 1) / 10) * 0.15;
    }

    return Math.min(1, waveFactor + wallFactor + lengthFactor + hunterFactor);
}

// --- Bass Drone Layer ---
// Continuous low oscillator pair through a lowpass filter.

function createBassLayer(ctx, destination, palette) {
    var gain = createMusicGain(ctx, destination, BASS_VOL);

    var osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(palette.bassRoots[0], ctx.currentTime);
    osc1.connect(gain);
    osc1.start(ctx.currentTime);

    var osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(palette.bassRoots[0], ctx.currentTime);
    osc2.detune.setValueAtTime(5, ctx.currentTime);
    var osc2Gain = createMusicGain(ctx, gain, 0.4);
    osc2.connect(osc2Gain);
    osc2.start(ctx.currentTime);

    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(palette.bassFilterCutoff, ctx.currentTime);
    filter.Q.setValueAtTime(1, ctx.currentTime);
    gain.disconnect();
    gain.connect(filter);
    filter.connect(destination);

    return { osc1: osc1, osc2: osc2, osc2Gain: osc2Gain, gain: gain, filter: filter };
}

function updateBassLayer(bass, ctx, palette, wave, intensity) {
    var t = ctx.currentTime;
    var bassRoot = palette.bassRoots[wave % palette.bassRoots.length];

    rampFrequency(bass.osc1.frequency, t, bassRoot, 1.0);
    rampFrequency(bass.osc2.frequency, t, bassRoot, 1.0);

    // Filter opens wider with intensity
    var cutoff = palette.bassFilterCutoff + intensity * 150;
    rampFrequency(bass.filter.frequency, t, cutoff, 0.5);

    // Volume scales with intensity
    var vol = BASS_VOL * (1.0 + intensity * 0.6);
    rampGain(bass.gain, t, vol, 0.3);
}

function stopBassLayer(bass, ctx) {
    var t = ctx.currentTime;
    rampGain(bass.gain, t, 0, 0.8);
    bass.osc1.stop(t + 1);
    bass.osc2.stop(t + 1);
}

// --- Mid Pad Layer ---
// Detuned oscillator pair creating a warm sustained chord tone.
// Oscillator type changes per wave palette for tonal variety.

function createPadLayer(ctx, destination, palette) {
    var gain = createMusicGain(ctx, destination, 0); // starts silent, fades in

    var osc1 = ctx.createOscillator();
    osc1.type = palette.padType;
    osc1.frequency.setValueAtTime(palette.scale[0], ctx.currentTime);
    osc1.connect(gain);
    osc1.start(ctx.currentTime);

    var osc2 = ctx.createOscillator();
    osc2.type = palette.padType;
    osc2.frequency.setValueAtTime(palette.scale[0], ctx.currentTime);
    osc2.detune.setValueAtTime(7, ctx.currentTime); // slight detune for chorus effect
    osc2.connect(gain);
    osc2.start(ctx.currentTime);

    // Lowpass filter to keep pads soft
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.Q.setValueAtTime(0.7, ctx.currentTime);
    gain.disconnect();
    gain.connect(filter);
    filter.connect(destination);

    return { osc1: osc1, osc2: osc2, gain: gain, filter: filter };
}

function updatePadLayer(pad, ctx, palette, wave, intensity, chordStep) {
    var t = ctx.currentTime;
    var progression = PROGRESSIONS[wave % PROGRESSIONS.length];
    var degree = progression[chordStep % progression.length];
    var padFreq = palette.scale[degree % palette.scale.length];

    rampFrequency(pad.osc1.frequency, t, padFreq, 2.0);
    rampFrequency(pad.osc2.frequency, t, padFreq, 2.0);

    // Detune increases with intensity for a wider, more ominous sound
    var detune = 7 + intensity * 15;
    pad.osc2.detune.cancelScheduledValues(t);
    pad.osc2.detune.setValueAtTime(pad.osc2.detune.value, t);
    pad.osc2.detune.linearRampToValueAtTime(detune, t + 0.5);

    // Filter opens with intensity
    var filterFreq = 600 + intensity * 800;
    rampFrequency(pad.filter.frequency, t, filterFreq, 0.5);

    // Volume scales with intensity — pads get louder when things get tense
    var vol = PAD_VOL * (0.4 + intensity * 0.8);
    rampGain(pad.gain, t, vol, 0.5);
}

function stopPadLayer(pad, ctx) {
    var t = ctx.currentTime;
    rampGain(pad.gain, t, 0, 0.8);
    pad.osc1.stop(t + 1);
    pad.osc2.stop(t + 1);
}

// --- High Texture Layer ---
// Noise source through a bandpass filter creating atmospheric texture.
// Center frequency and Q shift with wave palette for distinct character.

function createTextureLayer(ctx, destination, palette, noiseBuffer) {
    var gain = createMusicGain(ctx, destination, 0); // starts silent

    // Looping noise source
    var source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    // Bandpass filter — the core shaping element
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(palette.textureCenter, ctx.currentTime);
    filter.Q.setValueAtTime(palette.textureQ, ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(ctx.currentTime);

    return { source: source, filter: filter, gain: gain };
}

function updateTextureLayer(texture, ctx, palette, intensity) {
    var t = ctx.currentTime;

    // Shift bandpass center frequency based on palette and intensity
    var centerFreq = palette.textureCenter + intensity * 1500;
    rampFrequency(texture.filter.frequency, t, centerFreq, 0.8);

    // Q narrows with intensity for a more focused, piercing sound
    var q = palette.textureQ + intensity * 4;
    texture.filter.Q.cancelScheduledValues(t);
    texture.filter.Q.setValueAtTime(texture.filter.Q.value, t);
    texture.filter.Q.linearRampToValueAtTime(q, t + 0.5);

    // Volume: texture is subtle at low intensity, more present at high
    var vol = TEXTURE_VOL * intensity;
    rampGain(texture.gain, t, vol, 0.5);
}

function stopTextureLayer(texture, ctx) {
    var t = ctx.currentTime;
    rampGain(texture.gain, t, 0, 0.8);
    texture.source.stop(t + 1);
}

// --- Melody Layer ---
// Arpeggiated notes scheduled ahead, cycling through chord tones.

function scheduleMelodyNotes(state, ctx, destination) {
    var palette = getPalette(state.wave || 1);
    var scale = palette.scale;
    var progression = PROGRESSIONS[(state.progressionIndex || 0) % PROGRESSIONS.length];
    var chordIndex = state.chordStep % progression.length;
    var rootDegree = progression[chordIndex];

    var chordTones = [
        scale[rootDegree % scale.length],
        scale[(rootDegree + 2) % scale.length] * 2,
        scale[(rootDegree + 4) % scale.length] * 2,
    ];

    var tier = state.tier;
    var notesPerBeat = tier === 'intense' ? 4 : tier === 'medium' ? 3 : 2;
    var noteLength = state.beatDuration / notesPerBeat;

    for (var i = 0; i < notesPerBeat; i++) {
        var noteFreq = chordTones[i % chordTones.length];
        var startTime = state.nextNoteTime + i * noteLength;
        var endTime = startTime + noteLength * 0.7;

        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(noteFreq, startTime);

        var noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0, startTime);
        noteGain.gain.linearRampToValueAtTime(MELODY_VOL * state.volumeScale, startTime + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.001, endTime);

        osc.connect(noteGain);
        noteGain.connect(destination);
        osc.start(startTime);
        osc.stop(endTime + 0.05);

        osc.onended = (function(o, g) {
            return function() { o.disconnect(); g.disconnect(); };
        })(osc, noteGain);
    }

    return {
        nextNoteTime: state.nextNoteTime + state.beatDuration,
        chordStep: state.chordStep + 1,
    };
}

// --- Rhythm Layer ---
// Filtered noise bursts providing percussive pulse.

function createNoiseHit(ctx, noiseBuffer, destination, startTime, vol, filterFreq) {
    var endTime = startTime + 0.06;
    var source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    var hitGain = ctx.createGain();
    hitGain.gain.setValueAtTime(0, startTime);
    hitGain.gain.linearRampToValueAtTime(vol, startTime + 0.005);
    hitGain.gain.exponentialRampToValueAtTime(0.001, endTime);
    var filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(filterFreq, startTime);
    source.connect(filter);
    filter.connect(hitGain);
    hitGain.connect(destination);
    source.start(startTime);
    source.stop(endTime + 0.05);
    source.onended = function() {
        source.disconnect();
        filter.disconnect();
        hitGain.disconnect();
    };
}

function scheduleRhythmHit(state, ctx, noiseBuffer, destination) {
    var vol = RHYTHM_VOL * state.volumeScale;
    var filterFreq = state.tier === 'intense' ? 4000 : 6000;
    createNoiseHit(ctx, noiseBuffer, destination, state.nextHitTime, vol, filterFreq);

    if (state.tier === 'intense' && state.hitCount % 2 === 0) {
        var offStart = state.nextHitTime + state.beatDuration * 0.5;
        createNoiseHit(ctx, noiseBuffer, destination, offStart, vol * 0.5, 5000);
    }

    return {
        nextHitTime: state.nextHitTime + state.beatDuration,
        hitCount: state.hitCount + 1,
    };
}

// --- Noise Buffer (shared) ---

function createNoiseBuffer(ctx) {
    var bufferSize = Math.floor(ctx.sampleRate * 2);
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

// --- Wave Completion Fanfare ---

export function playWaveFanfare(audioCtx, masterGain, wave) {
    if (!audioCtx || !masterGain) return;
    if (musicState && musicState.muted) return;

    var now = audioCtx.currentTime;
    var palette = getPalette(wave);
    var scale = palette.scale;
    var baseOctave = wave > 12 ? 2 : 1;

    var fanfareNotes = [scale[0], scale[2], scale[4], scale[0] * 2].map(function(f) {
        return f * baseOctave;
    });

    fanfareNotes.forEach(function(freq, i) {
        var t = now + i * 0.08;
        var osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        var gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.35);

        osc.onended = function() {
            osc.disconnect();
            gain.disconnect();
        };
    });
}

// --- Public API ---

export function startMusic(audioCtx, masterGainNode) {
    if (!audioCtx || !masterGainNode) return;
    if (musicState && musicState.running) return;

    var settingsVol = getMusicVolumeSetting();
    var initialVol = MUSIC_VOL * settingsVol;

    var musicGain = audioCtx.createGain();
    musicGain.gain.setValueAtTime(0, audioCtx.currentTime);
    musicGain.gain.linearRampToValueAtTime(initialVol, audioCtx.currentTime + 1.5);
    musicGain.connect(masterGainNode);

    var noiseBuffer = createNoiseBuffer(audioCtx);
    var palette = getPalette(1);
    var bass = createBassLayer(audioCtx, musicGain, palette);
    var pad = createPadLayer(audioCtx, musicGain, palette);
    var texture = createTextureLayer(audioCtx, musicGain, palette, noiseBuffer);
    var beatDuration = getTempo(1);

    var startAt = audioCtx.currentTime + 0.5;
    musicState = {
        running: true,
        muted: false,
        audioCtx: audioCtx,
        musicGain: musicGain,
        bass: bass,
        pad: pad,
        texture: texture,
        noiseBuffer: noiseBuffer,
        tier: 'chill',
        wave: 1,
        wallInset: 0,
        intensity: 0,
        beatDuration: beatDuration,
        progressionIndex: 0,
        padChordStep: 0,
        lastIntensityUpdate: 0,
        melody: {
            tier: 'chill', wave: 1, beatDuration: beatDuration, nextNoteTime: startAt,
            chordStep: 0, progressionIndex: 0, volumeScale: 1.0,
        },
        rhythm: {
            tier: 'chill', beatDuration: beatDuration, nextHitTime: startAt,
            hitCount: 0, volumeScale: 1.0,
        },
        schedulerInterval: null,
    };

    // Fade in pad layer gently over 3 seconds
    rampGain(pad.gain, audioCtx.currentTime, PAD_VOL * 0.4, 3.0);

    // Lookahead scheduler for melody and rhythm
    musicState.schedulerInterval = setInterval(function() {
        if (!musicState || !musicState.running) return;

        var ctx = musicState.audioCtx;
        if (!ctx || ctx.state === 'closed') {
            stopMusic();
            return;
        }

        var scheduleUntil = ctx.currentTime + LOOKAHEAD;

        while (musicState.melody.nextNoteTime < scheduleUntil) {
            var melodyResult = scheduleMelodyNotes(
                musicState.melody, ctx, musicState.musicGain
            );
            musicState.melody = Object.assign({}, musicState.melody, {
                nextNoteTime: melodyResult.nextNoteTime,
                chordStep: melodyResult.chordStep,
            });
        }

        while (musicState.rhythm.nextHitTime < scheduleUntil) {
            var rhythmResult = scheduleRhythmHit(
                musicState.rhythm, ctx, musicState.noiseBuffer, musicState.musicGain
            );
            musicState.rhythm = Object.assign({}, musicState.rhythm, {
                nextHitTime: rhythmResult.nextHitTime,
                hitCount: rhythmResult.hitCount,
            });
        }
    }, SCHEDULER_INTERVAL_MS);
}

export function stopMusic() {
    if (!musicState) return;
    if (musicState.schedulerInterval) clearInterval(musicState.schedulerInterval);
    try {
        var ctx = musicState.audioCtx;
        if (ctx) {
            if (musicState.bass) stopBassLayer(musicState.bass, ctx);
            if (musicState.pad) stopPadLayer(musicState.pad, ctx);
            if (musicState.texture) stopTextureLayer(musicState.texture, ctx);
            if (musicState.musicGain) {
                var t = ctx.currentTime;
                rampGain(musicState.musicGain, t, 0, 0.5);
            }
        }
    } catch (e) { /* AudioContext may be closed */ }
    musicState = null;
}

// --- setMusicIntensity ---
// Call this every tick (or when game state changes) with current game parameters.
// Smoothly adapts all layers based on overall intensity.
//
// Parameters:
//   wave         - current wave number (1+)
//   wallInset    - number of rows shrunk inward (0 if no shrinking)
//   snakeLength  - current snake segment count
//   hunterDistance - Manhattan distance from snake head to nearest hunter segment
//                   (null or 0 if no hunter present)

export function setMusicIntensity(wave, wallInset, snakeLength, hunterDistance) {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;

    var ctx = musicState.audioCtx;
    var now = ctx.currentTime;

    // Throttle updates to avoid scheduling glitches
    if (now - musicState.lastIntensityUpdate < INTENSITY_UPDATE_COOLDOWN) return;
    musicState.lastIntensityUpdate = now;

    var palette = getPalette(wave);
    var tier = getIntensityTier(wave);
    var beatDuration = getTempo(wave);
    var intensity = computeIntensity(wave, wallInset, snakeLength, hunterDistance);
    var settingsVol = getMusicVolumeSetting();
    var volumeScale = 1.0 + intensity * 0.6;

    // Update bass
    updateBassLayer(musicState.bass, ctx, palette, wave, intensity);

    // Update mid pad — chord step advances with wave for variety
    var padStep = musicState.padChordStep;
    if (wave !== musicState.wave) {
        padStep = padStep + 1;
    }
    updatePadLayer(musicState.pad, ctx, palette, wave, intensity, padStep);
    musicState.padChordStep = padStep;

    // Update high texture
    updateTextureLayer(musicState.texture, ctx, palette, intensity);

    // Update shared scheduler state
    musicState.tier = tier;
    musicState.wave = wave;
    musicState.wallInset = wallInset || 0;
    musicState.intensity = intensity;
    musicState.beatDuration = beatDuration;
    musicState.melody = Object.assign({}, musicState.melody, {
        tier: tier, wave: wave, beatDuration: beatDuration,
        volumeScale: volumeScale, progressionIndex: wave,
    });
    musicState.rhythm = Object.assign({}, musicState.rhythm, {
        tier: tier, beatDuration: beatDuration, volumeScale: volumeScale,
    });

    // Update master music gain with settings volume
    var masterVol = musicState.muted ? 0 : MUSIC_VOL * (1.0 + intensity * 0.4) * settingsVol;
    rampGain(musicState.musicGain, now, masterVol, 0.5);
}

// --- transitionToWave ---
// Called on wave change for a distinct tonal shift. This triggers
// a more dramatic crossfade between palettes than the per-tick updates.

export function transitionToWave(wave, wallInset) {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;

    var ctx = musicState.audioCtx;
    var t = ctx.currentTime;
    var palette = getPalette(wave);

    // Pad type might change between palettes — we update oscillator type
    // by ramping current pad to silence and adjusting (type change is instant)
    try {
        musicState.pad.osc1.type = palette.padType;
        musicState.pad.osc2.type = palette.padType;
    } catch (e) {
        // Type change on running oscillator may fail in some browsers
    }

    // Brief swell: bump pad volume momentarily for wave transition drama
    var swell = PAD_VOL * 1.5;
    rampGain(musicState.pad.gain, t, swell, 0.3);
    // Then settle back to intensity-appropriate level
    var intensity = computeIntensity(wave, wallInset || 0, null, null);
    var settleVol = PAD_VOL * (0.4 + intensity * 0.8);
    musicState.pad.gain.gain.linearRampToValueAtTime(settleVol, t + 1.5);

    // Advance chord step for variety
    musicState.padChordStep = musicState.padChordStep + 1;

    // Full intensity update with new palette
    // Reset throttle guard so the state update (tier, wave, beatDuration, palette)
    // is never silently dropped by the cooldown check inside setMusicIntensity.
    musicState.lastIntensityUpdate = 0;
    setMusicIntensity(wave, wallInset || 0, null, null);
}

export function toggleMusicMute() {
    if (!musicState || !musicState.audioCtx) return false;
    var nowMuted = !musicState.muted;
    musicState.muted = nowMuted;
    var t = musicState.audioCtx.currentTime;
    var settingsVol = getMusicVolumeSetting();
    var targetVol = nowMuted ? 0 : MUSIC_VOL * (1.0 + (musicState.intensity || 0) * 0.4) * settingsVol;
    rampGain(musicState.musicGain, t, targetVol, 0.3);
    return nowMuted;
}

// --- setMusicVolume ---
// Called when the musicVolume setting changes. Updates the master music gain.

export function setMusicVolume(volume) {
    if (!musicState || !musicState.audioCtx) return;
    var t = musicState.audioCtx.currentTime;
    var clamped = Math.max(0, Math.min(1, volume));
    var targetVol = musicState.muted ? 0 : MUSIC_VOL * (1.0 + (musicState.intensity || 0) * 0.4) * clamped;
    rampGain(musicState.musicGain, t, targetVol, 0.2);
}
