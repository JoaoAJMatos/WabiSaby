/**
 * Service Initialization
 * 
 * Handles loading and initializing all services from database/state
 */

const { logger } = require('../../utils/logger.util');
const services = require('../../services');

/**
 * Initialize all services
 */
async function initializeServices() {
    logger.info('Initializing services...');
    
    // Load queue after database is initialized
    services.playback.queue.loadQueue();
    
    // Load state from database
    services.playback.orchestrator.loadState();
    
    // Load effects settings from database
    services.audio.effects.load();
    
    // Validate currentSong after cleanup (cleanup may have deleted the file)
    services.playback.orchestrator.validateCurrentSong();
    
    logger.info('Services initialized');
}

module.exports = {
    initializeServices
};

