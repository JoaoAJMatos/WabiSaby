const express = require('express');
const path = require('path');
const config = require('../config');
const { logger } = require('../utils/logger');
const { router: statusRouter, updateAuthStatus } = require('./routes/status.routes');
const { router: queueRouter } = require('./routes/queue.routes');
const { router: priorityRouter, setWhatsAppSocket: setPrioritySocket } = require('./routes/priority.routes');
const { router: notificationsRouter } = require('./routes/notifications.routes');
const { router: lyricsRouter } = require('./routes/lyrics.routes');
const { router: statsRouter } = require('./routes/stats.routes');
const { router: settingsRouter } = require('./routes/settings.routes');
const { router: logsRouter } = require('./routes/logs.routes');
const { router: effectsRouter } = require('./routes/effects.routes');
const { router: groupsRouter, setWhatsAppSocket: setGroupsSocket } = require('./routes/groups.routes');
const { updateVipName } = require('../services/priority.service');

/**
 * Express Server
 * Serves the web dashboard and API endpoints
 */

const app = express();
const PORT = config.server.port;

// Middleware
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// Serve temp directory for audio streaming/visualization
app.use('/stream', express.static(config.paths.temp));

// Serve thumbnails
app.use('/thumbnails', express.static(config.paths.thumbnails));

// API Routes
app.use('/api', statusRouter);
app.use('/api', queueRouter);
app.use('/api', priorityRouter);
app.use('/api', notificationsRouter);
app.use('/api', lyricsRouter);
app.use('/api/stats', statsRouter);
app.use('/api', settingsRouter);
app.use('/api', logsRouter);
app.use('/api', effectsRouter);
app.use('/api', groupsRouter);

/**
 * Start the Express server
 */
function startServer() {
    app.listen(PORT, () => {
        console.log(`Visualization dashboard running at http://${config.server.host}:${PORT}`);
        
        // Print configuration on startup
        if (process.env.DEBUG === 'true') {
            config.print();
        }
    });
}

function setWhatsAppSocket(sock) {
    setPrioritySocket(sock);
    setGroupsSocket(sock);
}

module.exports = { 
    startServer, 
    updateAuthStatus,
    updateVipName,
    setWhatsAppSocket 
};

