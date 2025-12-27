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
    
    // Register all listeners via centralized registry
    await eventListeners.registerAll();
    
    // Set up internal orchestrator listeners (for state management)
    services.playback.orchestrator.setupInternalListeners();
    
    logger.info('Event listeners registered');
}

module.exports = {
    registerEventListeners
};

