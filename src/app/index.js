require('dotenv').config();
const open = require('open');
const { logger } = require('../utils/logger');
const { initializeDatabase } = require('../database');
const config = require('../config');
const { startServer } = require('../api/server');
const { connectToWhatsApp } = require('../core/whatsapp');
const { initializeErrorHandlers } = require('../error');

logger.info('Initializing database...');
initializeDatabase();
config.cleanupTempFiles();

initializeErrorHandlers();

logger.info('Initializing WabiSaby...');
logger.info(`Server will run at http://${config.server.host}:${config.server.port}`);

startServer(async (url) => {
    try {
        await open(url);
    } catch (err) {
        logger.warn(`Failed to open browser automatically: ${err.message}`);
    }
});

connectToWhatsApp();

logger.info('WabiSaby is running...');

