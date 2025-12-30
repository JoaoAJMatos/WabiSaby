/**
 * Service Initialization
 * 
 * Handles loading and initializing all services from database/state
 */

const { logger } = require('../../utils/logger.util');
const services = require('../../services');
const config = require('../../config');

/**
 * Initialize all services
 */
async function initializeServices() {
    logger.info('Initializing services...');
    
    services.playback.queue.loadQueue();
    
    services.playback.orchestrator.loadState();
    
    services.audio.effects.load();
    
    services.playback.orchestrator.validateCurrentSong();
    
    // Cleanup temp files AFTER queue is loaded so it can protect queue files
    config.cleanupTempFiles();
    
    logger.info('Services initialized');
}

module.exports = {
    initializeServices
};

