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

// --- Reactive Layer Volume Constants ---
var FLOURISH_VOL = 0.07;       // food-eaten melodic flourish
var STINGER_VOL = 0.06;        // near-miss dissonant chord
var SHIMMER_VOL = 0.04;        // power-up shimmer pad
var HUNTER_BASS_VOL = 0.09;    // hunter proximity pulsing bass
var HEARTBEAT_VOL = 0.08;      // low-health heartbeat kick
var ARPEGGIO_VOL = 0.05;       // high-combo rhythmic arpeggio

// Hunter proximity threshold (cells) for the pulsing bass layer
var HUNTER_DANGER_DISTANCE = 5;

// Combo level at which arpeggio layer kicks in
var COMBO_ARPEGGIO_THRESHOLD = 2;

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
        // Reactive layer nodes (created on demand, nulled when inactive)
        shimmerNode: null,       // power-up shimmer pad
        shimmerGain: null,
        hunterBassNode: null,    // hunter proximity pulsing bass
        hunterBassGain: null,
        heartbeatInterval: null, // low-health heartbeat scheduler
        arpeggioInterval: null,  // combo arpeggio scheduler
        currentComboLevel: 0,
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
    if (musicState.heartbeatInterval) clearInterval(musicState.heartbeatInterval);
    if (musicState.arpeggioInterval) clearInterval(musicState.arpeggioInterval);
    try {
        var ctx = musicState.audioCtx;
        if (ctx) {
            if (musicState.bass) stopBassLayer(musicState.bass, ctx);
            if (musicState.pad) stopPadLayer(musicState.pad, ctx);
            if (musicState.texture) stopTextureLayer(musicState.texture, ctx);
            if (musicState.shimmerNode) {
                try { musicState.shimmerNode.stop(); } catch (e2) { /* ignore */ }
            }
            if (musicState.hunterBassNode) {
                try { musicState.hunterBassNode.stop(); } catch (e3) { /* ignore */ }
            }
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
    // Silence all reactive layers when muting
    if (nowMuted) {
        if (musicState.shimmerGain) rampGain(musicState.shimmerGain, t, 0, 0.2);
        if (musicState.hunterBassGain) rampGain(musicState.hunterBassGain, t, 0, 0.2);
    }
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

// --- Reactive Event Triggers ---
// Called from game-events.js on specific gameplay moments.
// All functions are safe to call when musicState is null or muted.

// onMusicFoodEaten — brief melodic flourish at a pitch tied to combo level.
// comboLevel: current multiplier (1-5); higher = brighter pitch.
export function onMusicFoodEaten(comboLevel) {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;
    if (musicState.muted) return;

    var ctx = musicState.audioCtx;
    var now = ctx.currentTime;
    var palette = getPalette(musicState.wave || 1);
    var scale = palette.scale;

    // Pick pitch: higher combo = higher scale degree
    var degreeIndex = Math.min((comboLevel || 1) - 1, scale.length - 1);
    var baseFreq = scale[degreeIndex] * 2; // play an octave up for brightness

    var noteCount = 3;
    var noteSpacing = 0.06;

    for (var i = 0; i < noteCount; i++) {
        var freq = baseFreq * (1 + i * 0.5); // simple ascending flourish
        var t = now + i * noteSpacing;
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(FLOURISH_VOL, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

        osc.connect(gain);
        gain.connect(musicState.musicGain);
        osc.start(t);
        osc.stop(t + 0.2);
        osc.onended = (function(o, g) {
            return function() { o.disconnect(); g.disconnect(); };
        })(osc, gain);
    }
}

// onMusicNearMiss — brief dissonant chord that resolves (triggered on shield break).
export function onMusicNearMiss() {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;
    if (musicState.muted) return;

    var ctx = musicState.audioCtx;
    var now = ctx.currentTime;
    var palette = getPalette(musicState.wave || 1);

    // Dissonant tritone clash, then resolve up a semitone
    var rootFreq = palette.bassRoots[0] * 2;
    var dissonantFreq = rootFreq * 1.414; // tritone interval (~sqrt(2))
    var resolveFreq = rootFreq * 1.5;     // perfect fifth resolution

    var dissonantNotes = [rootFreq, dissonantFreq];
    for (var i = 0; i < dissonantNotes.length; i++) {
        let freq = dissonantNotes[i];
        var osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(resolveFreq * (i === 0 ? 1 : 1.5), now + 0.3);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(STINGER_VOL, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(musicState.musicGain);
        osc.start(now);
        osc.stop(now + 0.4);
        osc.onended = (function(o, g) {
            return function() { o.disconnect(); g.disconnect(); };
        })(osc, gain);
    }
}

// onMusicPowerUpActive — fade in a shimmering pad layer while power-up is active.
export function onMusicPowerUpActive() {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;
    if (musicState.muted) return;
    if (musicState.shimmerNode) return; // already active

    var ctx = musicState.audioCtx;
    var now = ctx.currentTime;
    var palette = getPalette(musicState.wave || 1);

    var shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(palette.scale[4] * 2, now); // shimmery high tone

    var shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.linearRampToValueAtTime(SHIMMER_VOL, now + 0.4);

    shimmer.connect(shimmerGain);
    shimmerGain.connect(musicState.musicGain);
    shimmer.start(now);

    musicState.shimmerNode = shimmer;
    musicState.shimmerGain = shimmerGain;
}

// onMusicPowerUpExpired — fade out the shimmer layer.
export function onMusicPowerUpExpired() {
    if (!musicState || !musicState.audioCtx) return;
    if (!musicState.shimmerNode) return;

    var ctx = musicState.audioCtx;
    var now = ctx.currentTime;

    rampGain(musicState.shimmerGain, now, 0, 0.5);
    var nodeToStop = musicState.shimmerNode;
    musicState.shimmerNode = null;
    musicState.shimmerGain = null;
    try { nodeToStop.stop(now + 0.6); } catch (e) { /* ignore */ }
}

// onMusicHunterProximity — pulsing bass note that scales with distance.
// distance: Manhattan cells from snake head to nearest hunter segment (null = no hunter).
export function onMusicHunterProximity(distance) {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;
    if (musicState.muted) return;

    var ctx = musicState.audioCtx;
    var now = ctx.currentTime;

    if (distance === null || distance > HUNTER_DANGER_DISTANCE) {
        // Hunter out of range — fade out hunter bass
        if (musicState.hunterBassGain) {
            rampGain(musicState.hunterBassGain, now, 0, 0.4);
        }
        return;
    }

    var palette = getPalette(musicState.wave || 1);
    // Proximity: 0 = touching, HUNTER_DANGER_DISTANCE = threshold
    var proximityRatio = 1 - (distance / HUNTER_DANGER_DISTANCE);
    var targetVol = HUNTER_BASS_VOL * proximityRatio;

    if (!musicState.hunterBassNode) {
        var hunterOsc = ctx.createOscillator();
        hunterOsc.type = 'sine';
        hunterOsc.frequency.setValueAtTime(palette.bassRoots[0] * 0.5, now); // sub-bass

        var hunterGain = ctx.createGain();
        hunterGain.gain.setValueAtTime(0, now);

        hunterOsc.connect(hunterGain);
        hunterGain.connect(musicState.musicGain);
        hunterOsc.start(now);

        musicState.hunterBassNode = hunterOsc;
        musicState.hunterBassGain = hunterGain;
    }

    rampGain(musicState.hunterBassGain, now, targetVol, 0.15);
}

// onMusicLowHealth — start/stop heartbeat rhythm layer (1 life remaining).
// active: true to start heartbeat, false to stop it.
export function onMusicLowHealth(active) {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;

    if (!active) {
        if (musicState.heartbeatInterval) {
            clearInterval(musicState.heartbeatInterval);
            musicState.heartbeatInterval = null;
        }
        return;
    }

    if (musicState.heartbeatInterval) return; // already running

    var ctx = musicState.audioCtx;

    function scheduleHeartbeat() {
        if (!musicState || !musicState.running) return;
        if (musicState.muted) return;

        var now = ctx.currentTime;
        var palette = getPalette(musicState.wave || 1);
        var beatFreq = palette.bassRoots[0] * 0.25; // low sub-kick

        // Double thump: "lub-dub"
        var offsets = [0, 0.12];
        for (var i = 0; i < offsets.length; i++) {
            var t = now + offsets[i];
            var osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(beatFreq * 1.5, t);
            osc.frequency.exponentialRampToValueAtTime(beatFreq, t + 0.08);

            var gain = ctx.createGain();
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(HEARTBEAT_VOL, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

            osc.connect(gain);
            gain.connect(musicState.musicGain);
            osc.start(t);
            osc.stop(t + 0.15);
            osc.onended = (function(o, g) {
                return function() { o.disconnect(); g.disconnect(); };
            })(osc, gain);
        }
    }

    scheduleHeartbeat();
    musicState.heartbeatInterval = setInterval(scheduleHeartbeat, 700);
}

// onMusicComboChange — layer a rhythmic arpeggio that intensifies with combo level.
// comboLevel: current multiplier (0 = no combo, 1+ = active).
export function onMusicComboChange(comboLevel) {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;

    musicState.currentComboLevel = comboLevel || 0;

    if (comboLevel < COMBO_ARPEGGIO_THRESHOLD) {
        if (musicState.arpeggioInterval) {
            clearInterval(musicState.arpeggioInterval);
            musicState.arpeggioInterval = null;
        }
        return;
    }

    if (musicState.arpeggioInterval) return; // already running

    var ctx = musicState.audioCtx;

    function scheduleArpNote() {
        if (!musicState || !musicState.running) return;
        if (musicState.muted) return;

        var level = musicState.currentComboLevel;
        if (level < COMBO_ARPEGGIO_THRESHOLD) return;

        var now = ctx.currentTime;
        var palette = getPalette(musicState.wave || 1);
        var scale = palette.scale;
        // Rotate through scale degrees based on combo
        var degreeOffset = (Math.floor(Date.now() / 120)) % scale.length;
        var freq = scale[degreeOffset] * 4; // high register arpeggio
        // Intensity scales with combo level
        var vol = ARPEGGIO_VOL * Math.min(1, (level - 1) / 4);

        var osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(musicState.musicGain);
        osc.start(now);
        osc.stop(now + 0.12);
        osc.onended = (function(o, g) {
            return function() { o.disconnect(); g.disconnect(); };
        })(osc, gain);
    }

    scheduleArpNote();
    musicState.arpeggioInterval = setInterval(scheduleArpNote, 120);
}
