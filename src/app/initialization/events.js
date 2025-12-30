/**
 * Event System Initialization
 * 
 * Registers all event listeners via the centralized registry
 */

const { logger } = require('../../utils/logger.util');
const eventListeners = require('../../events/listeners');
const services = require('../../services');

/**
 * Register all event listeners
 */
async function registerEventListeners() {
    logger.info('Registering event listeners...');
    
    await eventListeners.registerAll();
    
    services.playback.orchestrator.setupInternalListeners();
    
    logger.info('Event listeners registered');
}

module.exports = {
    registerEventListeners
};

