require('dotenv').config();
const { logger } = require('../utils/logger.util');
const { initializeErrorHandlers } = require('../error');
const { initializeInfrastructure } = require('./initialization/infrastructure');
const { initializeServices } = require('./initialization/services');
const { registerEventListeners } = require('./initialization/events');
const { startApplication } = require('./initialization/application');
const { setupBackgroundJobs } = require('./initialization/background-jobs');

/**
 * Application Entry Point
 * 
 * Clean separation of concerns:
 * 1. Infrastructure setup (storage, database, config)
 * 2. Service initialization (load state, queue, effects)
 * 3. Event wiring (register all listeners)
 * 4. Start application (server, WhatsApp connection)
 * 5. Background jobs (periodic tasks)
 */
const main = async () => {
    try {
        await initializeInfrastructure();
        await initializeServices();
        await registerEventListeners();
        await startApplication();
        setupBackgroundJobs();
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
}

main();