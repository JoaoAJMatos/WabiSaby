require('dotenv').config();
const { logger } = require('../utils/logger.util');
const { initializeDatabase } = require('../database');
const config = require('../config');
const { startServer } = require('../api/server');
const systemCoordinator = require('../core/coordinator');
const { initializeErrorHandlers } = require('../error');

(async () => {
    try {
        logger.info('Initializing database...');
        await initializeDatabase();

        // Load queue after database is initialized
        const queueManager = require('../core/queue');
        queueManager.loadQueue();

        config.loadSettings();
        config.cleanupTempFiles();

        // Validate currentSong after cleanup (cleanup may have deleted the file)
        const playbackController = require('../core/playback.controller');
        playbackController.validateCurrentSong();

        initializeErrorHandlers();

        logger.info('Initializing WabiSaby...');
        logger.info(`Server will run at http://${config.server.host}:${config.server.port}`);

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

        // Initialize system via coordinator
        systemCoordinator.initialize().catch(err => {
            logger.error('Failed to initialize system:', err);
            process.exit(1);
        });

        logger.info('WabiSaby is running...');
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
})();

