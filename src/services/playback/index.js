/**
 * Playback Services
 * Exports all playback-related services
 */

const queueService = require('./queue.service');
const downloadOrchestratorService = require('./download-orchestrator.service');
const prefetchService = require('./prefetch.service');
const songPreparationService = require('./song-preparation.service');
const songResolutionService = require('./song-resolution.service');
const repeatModeService = require('./repeat-mode.service');
const shuffleService = require('./shuffle.service');
const orchestratorService = require('./orchestrator.service');

module.exports = {
    queue: queueService,
    downloadOrchestrator: downloadOrchestratorService,
    prefetch: prefetchService,
    songPreparation: songPreparationService,
    songResolution: songResolutionService,
    repeatMode: repeatModeService,
    shuffle: shuffleService,
    orchestrator: orchestratorService
};
