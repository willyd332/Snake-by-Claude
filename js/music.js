'use strict';

// --- Procedural Ambient Music System ---
// Generates adaptive, layered music using Web Audio API.
// Layers: bass drone, arpeggiated melody, rhythmic pulse.
// Intensity adapts to wave number and wall proximity.

var MUSIC_VOL = 0.12;  // Master music volume
var BASS_VOL = 0.08;
var MELODY_VOL = 0.06;
var RHYTHM_VOL = 0.04;

// Frequencies (Hz) for each intensity tier: 7-note scales
var SCALES = {
    chill:   [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94],
    medium:  [146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63],
    intense: [164.81, 196.00, 220.00, 246.94, 293.66, 329.63, 349.23],
};
var BASS_ROOTS = {
    chill: [65.41, 73.42, 82.41], medium: [73.42, 82.41, 98.00],
    intense: [82.41, 98.00, 110.00],
};
var PROGRESSIONS = [[0, 3, 4, 2], [0, 2, 5, 3], [0, 4, 3, 1]];

var musicState = null;

// Smoothly ramp a GainNode to a target value
function rampGain(gainNode, time, target, duration) {
    gainNode.gain.cancelScheduledValues(time);
    gainNode.gain.setValueAtTime(gainNode.gain.value, time);
    gainNode.gain.linearRampToValueAtTime(target, time + duration);
}

function getIntensityTier(wave) {
    if (wave <= 5) return 'chill';
    if (wave <= 12) return 'medium';
    return 'intense';
}

function getTempo(wave) {
    // BPM increases with wave: 70 BPM at wave 1, caps at 140 BPM
    var bpm = Math.min(140, 70 + wave * 3.5);
    return 60 / bpm; // seconds per beat
}

function createMusicGain(ctx, destination, volume) {
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.connect(destination);
    return gain;
}

// --- Bass Drone Layer ---
// Continuous low drone that shifts pitch based on the current chord root.

function createBassLayer(ctx, destination) {
    var gain = createMusicGain(ctx, destination, BASS_VOL);

    var osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(65.41, ctx.currentTime);
    osc1.connect(gain);
    osc1.start(ctx.currentTime);

    var osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(65.41, ctx.currentTime);
    osc2.detune.setValueAtTime(5, ctx.currentTime);
    var osc2Gain = createMusicGain(ctx, gain, 0.4);
    osc2.connect(osc2Gain);
    osc2.start(ctx.currentTime);

    // Low-pass filter for warmth
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);
    filter.Q.setValueAtTime(1, ctx.currentTime);
    gain.disconnect();
    gain.connect(filter);
    filter.connect(destination);

    return {
        osc1: osc1,
        osc2: osc2,
        osc2Gain: osc2Gain,
        gain: gain,
        filter: filter,
    };
}

function updateBassFrequency(bass, ctx, freq, rampTime) {
    var t = ctx.currentTime;
    bass.osc1.frequency.cancelScheduledValues(t);
    bass.osc1.frequency.setValueAtTime(bass.osc1.frequency.value, t);
    bass.osc1.frequency.linearRampToValueAtTime(freq, t + rampTime);
    bass.osc2.frequency.cancelScheduledValues(t);
    bass.osc2.frequency.setValueAtTime(bass.osc2.frequency.value, t);
    bass.osc2.frequency.linearRampToValueAtTime(freq, t + rampTime);
}

function updateBassFilter(bass, ctx, intensity) {
    var cutoff = intensity === 'intense' ? 350 : intensity === 'medium' ? 260 : 200;
    var t = ctx.currentTime;
    bass.filter.frequency.cancelScheduledValues(t);
    bass.filter.frequency.setValueAtTime(bass.filter.frequency.value, t);
    bass.filter.frequency.linearRampToValueAtTime(cutoff, t + 0.5);
}

function stopBassLayer(bass, ctx) {
    var t = ctx.currentTime;
    bass.gain.gain.cancelScheduledValues(t);
    bass.gain.gain.setValueAtTime(bass.gain.gain.value, t);
    bass.gain.gain.linearRampToValueAtTime(0, t + 0.8);
    bass.osc1.stop(t + 1);
    bass.osc2.stop(t + 1);
}

// --- Melody Layer ---
// Arpeggiated notes scheduled in advance, looping through chord tones.

function scheduleMelodyNotes(state, ctx, destination) {
    var scale = SCALES[state.tier];
    var progression = PROGRESSIONS[state.progressionIndex % PROGRESSIONS.length];
    var chordIndex = state.chordStep % progression.length;
    var rootDegree = progression[chordIndex];

    // Build a small chord: root, +2, +4 scale degrees
    var chordTones = [
        scale[rootDegree % scale.length],
        scale[(rootDegree + 2) % scale.length] * 2,
        scale[(rootDegree + 4) % scale.length] * 2,
    ];

    var notesPerBeat = state.tier === 'intense' ? 4 : state.tier === 'medium' ? 3 : 2;
    var noteLength = state.beatDuration / notesPerBeat;
    var scheduled = [];

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

        osc.onended = function() {
            osc.disconnect();
            noteGain.disconnect();
        };

        scheduled.push({ osc: osc, gain: noteGain });
    }

    return {
        scheduled: scheduled,
        nextNoteTime: state.nextNoteTime + state.beatDuration,
        chordStep: state.chordStep + 1,
    };
}

// --- Rhythm Layer ---
// Subtle percussive pulse using filtered noise bursts.

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

    // On intense, add an off-beat hit for double-time feel
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
    var bufferSize = Math.floor(ctx.sampleRate * 0.5);
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

    var now = audioCtx.currentTime;
    var tier = getIntensityTier(wave);
    var scale = SCALES[tier];
    var baseOctave = tier === 'intense' ? 2 : 1;

    // Ascending arpeggio flourish
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

    var musicGain = audioCtx.createGain();
    musicGain.gain.setValueAtTime(0, audioCtx.currentTime);
    musicGain.gain.linearRampToValueAtTime(MUSIC_VOL, audioCtx.currentTime + 1.5);
    musicGain.connect(masterGainNode);

    var noiseBuffer = createNoiseBuffer(audioCtx);
    var bass = createBassLayer(audioCtx, musicGain);
    var beatDuration = getTempo(1);

    var startAt = audioCtx.currentTime + 0.5;
    musicState = {
        running: true, muted: false,
        audioCtx: audioCtx, musicGain: musicGain,
        bass: bass, noiseBuffer: noiseBuffer,
        tier: 'chill', wave: 1, wallInset: 0,
        beatDuration: beatDuration, progressionIndex: 0,
        melody: {
            tier: 'chill', beatDuration: beatDuration, nextNoteTime: startAt,
            chordStep: 0, progressionIndex: 0, volumeScale: 1.0,
        },
        rhythm: {
            tier: 'chill', beatDuration: beatDuration, nextHitTime: startAt,
            hitCount: 0, volumeScale: 1.0,
        },
        schedulerInterval: null,
    };

    // Schedule notes ahead using a timer (lookahead scheduler pattern)
    var LOOKAHEAD = 0.3; // seconds to schedule ahead
    var INTERVAL = 100;  // ms between scheduler checks

    musicState.schedulerInterval = setInterval(function() {
        if (!musicState || !musicState.running) return;

        var ctx = musicState.audioCtx;
        if (!ctx || ctx.state === 'closed') {
            stopMusic();
            return;
        }

        var scheduleUntil = ctx.currentTime + LOOKAHEAD;

        // Schedule melody notes
        while (musicState.melody.nextNoteTime < scheduleUntil) {
            var melodyResult = scheduleMelodyNotes(
                musicState.melody, ctx, musicState.musicGain
            );
            musicState.melody = Object.assign({}, musicState.melody, {
                nextNoteTime: melodyResult.nextNoteTime,
                chordStep: melodyResult.chordStep,
            });
        }

        // Schedule rhythm hits
        while (musicState.rhythm.nextHitTime < scheduleUntil) {
            var rhythmResult = scheduleRhythmHit(
                musicState.rhythm, ctx, musicState.noiseBuffer, musicState.musicGain
            );
            musicState.rhythm = Object.assign({}, musicState.rhythm, {
                nextHitTime: rhythmResult.nextHitTime,
                hitCount: rhythmResult.hitCount,
            });
        }
    }, INTERVAL);
}

export function stopMusic() {
    if (!musicState) return;
    if (musicState.schedulerInterval) clearInterval(musicState.schedulerInterval);
    try {
        if (musicState.bass && musicState.audioCtx) stopBassLayer(musicState.bass, musicState.audioCtx);
        if (musicState.musicGain && musicState.audioCtx) {
            var t = musicState.audioCtx.currentTime;
            musicState.musicGain.gain.cancelScheduledValues(t);
            musicState.musicGain.gain.setValueAtTime(musicState.musicGain.gain.value, t);
            musicState.musicGain.gain.linearRampToValueAtTime(0, t + 0.5);
        }
    } catch (e) { /* AudioContext may be closed */ }
    musicState = Object.assign({}, musicState, { running: false });
}

export function setMusicIntensity(wave, wallInset) {
    if (!musicState || !musicState.running || !musicState.audioCtx) return;
    var ctx = musicState.audioCtx;
    var tier = getIntensityTier(wave);
    var beatDuration = getTempo(wave);
    var wallUrgency = Math.min(1, (wallInset || 0) / 6);
    var volumeScale = 1.0 + wallUrgency * 0.5;
    var t = ctx.currentTime;

    // Update bass pitch, filter, and volume
    var bassRoots = BASS_ROOTS[tier];
    updateBassFrequency(musicState.bass, ctx, bassRoots[wave % bassRoots.length], beatDuration * 2);
    updateBassFilter(musicState.bass, ctx, tier);
    rampGain(musicState.bass.gain, t, BASS_VOL * volumeScale, 0.3);

    // Update shared state for melody/rhythm schedulers
    musicState.tier = tier;
    musicState.wave = wave;
    musicState.wallInset = wallInset || 0;
    musicState.beatDuration = beatDuration;
    musicState.melody = Object.assign({}, musicState.melody, {
        tier: tier, beatDuration: beatDuration, volumeScale: volumeScale, progressionIndex: wave,
    });
    musicState.rhythm = Object.assign({}, musicState.rhythm, {
        tier: tier, beatDuration: beatDuration, volumeScale: volumeScale,
    });

    // Update master music volume with wall urgency
    var masterVol = musicState.muted ? 0 : MUSIC_VOL * (1.0 + wallUrgency * 0.3);
    rampGain(musicState.musicGain, t, masterVol, 0.5);
}

export function toggleMusicMute() {
    if (!musicState || !musicState.audioCtx) return false;
    var nowMuted = !musicState.muted;
    musicState = Object.assign({}, musicState, { muted: nowMuted });
    var t = musicState.audioCtx.currentTime;
    var wallUrgency = Math.min(1, (musicState.wallInset || 0) / 6);
    var targetVol = nowMuted ? 0 : MUSIC_VOL * (1.0 + wallUrgency * 0.3);
    rampGain(musicState.musicGain, t, targetVol, 0.3);
    return nowMuted;
}

