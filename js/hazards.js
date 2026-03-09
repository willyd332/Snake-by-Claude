'use strict';

import { GRID_SIZE } from './constants.js';

// --- Hazard Visual Constants ---
export var HAZARD_LAVA_COLOR = '#ff4400';
export var HAZARD_LAVA_GLOW = '#ff6600';
export var HAZARD_ICE_COLOR = '#88ccff';
export var HAZARD_ICE_GLOW = '#aaddff';
export var HAZARD_SPIKE_COLOR = '#333344';
export var HAZARD_SPIKE_ACTIVE_COLOR = '#ff2244';
export var SPIKE_PERIOD_TICKS = 30;
export var SPIKE_WARN_TICKS = 8;

function positionOccupied(x, y, occupied) {
    for (var i = 0; i < occupied.length; i++) {
        if (occupied[i].x === x && occupied[i].y === y) return true;
    }
    return false;
}

function findFreePosition(occupied, gridSize) {
    var attempts = 0;
    while (attempts < 200) {
        var x = Math.floor(Math.random() * gridSize);
        var y = Math.floor(Math.random() * gridSize);
        var center = Math.floor(gridSize / 2);
        if (x >= center - 3 && x <= center + 3 && y >= center - 3 && y <= center + 3) { attempts++; continue; }
        if (!positionOccupied(x, y, occupied)) return { x: x, y: y };
        attempts++;
    }
    return null;
}

export function createHazards(wave, existingPositions) {
    var hazards = [];
    var allOccupied = existingPositions.slice();
    var lavaCount = Math.min(Math.floor(wave / 4), 5);
    for (var li = 0; li < lavaCount; li++) {
        var lavaCells = [];
        var poolSize = 1 + Math.floor(Math.random() * 3);
        for (var lc = 0; lc < poolSize; lc++) {
            var pos = findFreePosition(allOccupied, GRID_SIZE);
            if (pos) { lavaCells.push(pos); allOccupied.push(pos); }
        }
        if (lavaCells.length > 0) hazards.push({ type: 'lava', cells: lavaCells, tickCount: 0 });
    }
    if (wave >= 5) {
        var iceCount = Math.max(1, Math.min(Math.floor(wave / 6), 4));
        for (var ii = 0; ii < iceCount; ii++) {
            var iceCells = [];
            var iceSize = 1 + Math.floor(Math.random() * 2);
            for (var ic = 0; ic < iceSize; ic++) {
                var icePos = findFreePosition(allOccupied, GRID_SIZE);
                if (icePos) { iceCells.push(icePos); allOccupied.push(icePos); }
            }
            if (iceCells.length > 0) hazards.push({ type: 'ice', cells: iceCells, tickCount: 0 });
        }
    }
    if (wave >= 10) {
        var spikeCount = Math.max(1, Math.min(Math.floor(wave / 10), 3));
        for (var si = 0; si < spikeCount; si++) {
            var spikePos = findFreePosition(allOccupied, GRID_SIZE);
            if (spikePos) { allOccupied.push(spikePos); hazards.push({ type: 'spike', cells: [spikePos], tickCount: 0 }); }
        }
    }
    return hazards;
}

export function updateHazards(hazards, tickCount) {
    return hazards.map(function(h) { return Object.assign({}, h, { tickCount: tickCount }); });
}

export function getHazardAt(hazards, x, y) {
    for (var i = 0; i < hazards.length; i++) {
        var cells = hazards[i].cells;
        for (var j = 0; j < cells.length; j++) {
            if (cells[j].x === x && cells[j].y === y) return hazards[i];
        }
    }
    return null;
}

export function isHazardDeadly(hazard, tickCount) {
    if (hazard.type === 'lava') return true;
    if (hazard.type === 'spike') return (tickCount % (2 * SPIKE_PERIOD_TICKS)) < SPIKE_PERIOD_TICKS;
    return false;
}

export function isSpikeInWarningPhase(hazard, tickCount) {
    if (hazard.type !== 'spike') return false;
    var cyclePos = tickCount % (2 * SPIKE_PERIOD_TICKS);
    return cyclePos >= (2 * SPIKE_PERIOD_TICKS - SPIKE_WARN_TICKS) || (cyclePos >= (SPIKE_PERIOD_TICKS - SPIKE_WARN_TICKS) && cyclePos < SPIKE_PERIOD_TICKS);
}

export function isIceAt(hazards, x, y) {
    for (var i = 0; i < hazards.length; i++) {
        if (hazards[i].type !== 'ice') continue;
        var cells = hazards[i].cells;
        for (var j = 0; j < cells.length; j++) { if (cells[j].x === x && cells[j].y === y) return true; }
    }
    return false;
}

export function getHazardPositions(hazards) {
    var positions = [];
    for (var i = 0; i < hazards.length; i++) {
        for (var j = 0; j < hazards[i].cells.length; j++) positions.push(hazards[i].cells[j]);
    }
    return positions;
}
