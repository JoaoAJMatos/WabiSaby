/**
 * Infrastructure Initialization
 * 
 * Handles all infrastructure setup: storage, database, config
 */

const { logger } = require('../../utils/logger.util');
const { initializeDatabase } = require('../../infrastructure/database');
const config = require('../../config');

/**
 * Initialize all infrastructure components
 */
async function initializeInfrastructure() {
    logger.info('Initializing infrastructure...');
    
    logger.info('Initializing storage directories...');
    config.initializeStorage();
    
    logger.info('Initializing database...');
    await initializeDatabase();
    
    config.loadSettings();
    
    logger.info('Infrastructure initialized');
}

module.exports = {
    initializeInfrastructure
};

