/**
 * Application Startup
 * 
 * Handles starting the server and connecting external services
 */

const { logger } = require('../../utils/logger.util');
const config = require('../../config');
const { startServer } = require('../../api/server');
const infrastructure = require('../../infrastructure');

/**
 * Start the application
 */
async function startApplication() {
    logger.info('Starting application...');
    logger.info(`Server will run at http://${config.server.host}:${config.server.port}`);
    
    // Set up WhatsApp adapter callbacks to break circular dependency
    // Must be done before starting server to avoid circular dependency
    const { updateAuthStatus, updateVipName, setWhatsAppSocket } = require('../../api/server');
    infrastructure.whatsapp.adapter.setCallbacks(updateAuthStatus, updateVipName, setWhatsAppSocket);
    
    // Start the HTTP server
    startServer(async (url) => {
        // Skip auto-opening browser in dev mode
        if (config.isDevelopment()) {
            logger.info('Dev mode: Skipping browser auto-open');
            return;
        }
        
        try {
            const { default: open } = await import('open');
            await open(url);
        } catch (err) {
            logger.warn(`Failed to open browser automatically: ${err.message}`);
        }
    });
    
    // Connect to WhatsApp (non-blocking, runs in background)
    logger.info('Connecting to WhatsApp...');
    infrastructure.whatsapp.adapter.connectToWhatsApp().catch(err => {
        logger.error('Failed to connect to WhatsApp:', err);
        if (err && err.stack) {
            logger.error('Error stack:', err.stack);
        }
        if (err && err.message) {
            logger.error('Error message:', err.message);
        }
        logger.error('Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        // Don't exit - server can still run without WhatsApp
    });
    
    logger.info('Application started');
}

module.exports = {
    startApplication
};

