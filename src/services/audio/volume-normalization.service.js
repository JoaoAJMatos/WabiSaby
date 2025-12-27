const dbService = require('../../infrastructure/database/db.service');
const { analyzeAudioLevel } = require('./analysis.service');
const { logger } = require('../../utils/logger.util');

/**
 * Volume Normalization Service
 * Manages volume normalization settings and calculates gain adjustments for songs
 */

/**
 * Get volume normalization settings from database
 * @returns {Object} Normalization settings with defaults
 */
function getNormalizationSettings() {
    const settings = dbService.getSetting('volumeNormalization');
    
    if (!settings) {
        // Return defaults if not configured
        return {
            enabled: false,
            thresholdTooLow: -20,  // dB - songs below this are considered too quiet
            thresholdTooHigh: -6,   // dB - songs above this are considered too loud
            targetLevel: -12        // dB - target RMS level for normalization
        };
    }
    
    // Merge with defaults to ensure all fields exist
    // Remove thresholdOk if it exists (backward compatibility)
    const { thresholdOk, ...restSettings } = settings;
    
    return {
        enabled: restSettings.enabled !== undefined ? restSettings.enabled : false,
        thresholdTooLow: restSettings.thresholdTooLow !== undefined ? restSettings.thresholdTooLow : -20,
        thresholdTooHigh: restSettings.thresholdTooHigh !== undefined ? restSettings.thresholdTooHigh : -6,
        targetLevel: restSettings.targetLevel !== undefined ? restSettings.targetLevel : -12
    };
}

/**
 * Calculate required gain adjustment in dB based on current RMS level and thresholds
 * @param {number} currentRmsDb - Current RMS level in dB (typically negative)
 * @param {Object} settings - Normalization settings
 * @returns {number} Gain adjustment in dB (positive = boost, negative = cut)
 */
function calculateGainAdjustment(currentRmsDb, settings) {
    const { targetLevel, thresholdTooLow, thresholdTooHigh } = settings;
    
    // If too low: boost to target
    if (currentRmsDb < thresholdTooLow) {
        const gain = targetLevel - currentRmsDb;
        logger.debug(`Audio too low (${currentRmsDb.toFixed(2)} dB < ${thresholdTooLow} dB), boosting by ${gain.toFixed(2)} dB`);
        return gain;
    }
    
    // If too high: reduce to target
    if (currentRmsDb > thresholdTooHigh) {
        const gain = targetLevel - currentRmsDb;
        logger.debug(`Audio too high (${currentRmsDb.toFixed(2)} dB > ${thresholdTooHigh} dB), reducing by ${Math.abs(gain).toFixed(2)} dB`);
        return gain;
    }
    
    // Otherwise (between thresholds): adjust to target for consistency
    const gain = targetLevel - currentRmsDb;
    if (Math.abs(gain) > 0.1) { // Only log if adjustment is significant
        logger.debug(`Audio in acceptable range (${currentRmsDb.toFixed(2)} dB), adjusting to target by ${gain.toFixed(2)} dB`);
    }
    return gain;
}

/**
 * Analyze audio file and store volume gain adjustment in database
 * @param {number} songId - Song ID
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number>} Gain adjustment in dB
 */
async function analyzeAndStoreGain(songId, filePath) {
    const settings = getNormalizationSettings();
    
    if (!settings.enabled) {
        logger.debug('Volume normalization disabled, skipping analysis');
        return 0;
    }
    
    try {
        // Analyze audio file
        const rmsDb = await analyzeAudioLevel(filePath);
        
        // Calculate required gain
        const gainDb = calculateGainAdjustment(rmsDb, settings);
        
        // Store in database
        dbService.updateSongVolumeGain(songId, gainDb);
        
        logger.info(`Volume normalization: Song ${songId} analyzed (RMS: ${rmsDb.toFixed(2)} dB, Gain: ${gainDb.toFixed(2)} dB)`);
        
        return gainDb;
    } catch (error) {
        logger.error(`Failed to analyze audio for song ${songId}:`, error);
        // Store 0 gain on error (no adjustment)
        dbService.updateSongVolumeGain(songId, 0);
        return 0;
    }
}

/**
 * Get stored volume gain for a song
 * @param {number} songId - Song ID
 * @returns {number} Gain adjustment in dB (defaults to 0 if not set)
 */
function getSongGain(songId) {
    if (!songId) {
        return 0;
    }
    
    try {
        const song = dbService.getSong(songId);
        return song?.volume_gain_db || 0;
    } catch (error) {
        logger.debug(`Could not get volume gain for song ${songId}:`, error.message);
        return 0;
    }
}

module.exports = {
    getNormalizationSettings,
    calculateGainAdjustment,
    analyzeAndStoreGain,
    getSongGain
};

