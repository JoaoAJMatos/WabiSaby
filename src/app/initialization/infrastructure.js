/**
 * Infrastructure Initialization
 * 
 * Handles all infrastructure setup: storage, database, config, cleanup
 */

const { logger } = require('../../utils/logger.util');
const { initializeDatabase } = require('../../infrastructure/database');
const config = require('../../config');

/**
 * Initialize all infrastructure components
 */
async function initializeInfrastructure() {
    logger.info('Initializing infrastructure...');
    
    // Initialize storage directories first (before database)
    logger.info('Initializing storage directories...');
    config.initializeStorage();
    
    // Initialize database
    logger.info('Initializing database...');
    await initializeDatabase();
    
    // Load settings from database
    config.loadSettings();
    
    // Cleanup temporary files
    config.cleanupTempFiles();
    
    logger.info('Infrastructure initialized');
}

module.exports = {
    initializeInfrastructure
};

