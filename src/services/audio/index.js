/**
 * Audio Services
 * Exports all audio-related services
 */

const effectsService = require('./effects.service');
const analysisService = require('./analysis.service');
const volumeNormalizationService = require('./volume-normalization.service');
const downloadService = require('./download.service');

module.exports = {
    effects: effectsService,
    analysis: analysisService,
    volumeNormalization: volumeNormalizationService,
    download: downloadService
};
