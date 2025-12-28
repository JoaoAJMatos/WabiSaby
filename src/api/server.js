const express = require('express');
const path = require('path');
const config = require('../config');
const { logger } = require('../utils/logger.util');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { apiRateLimit } = require('./middleware/rate-limit.middleware');
const { localhostOnly } = require('./middleware/auth.middleware');
const requestLogger = require('./middleware/request-logger.middleware');
const { router: statusRouter, updateAuthStatus } = require('./routes/status.routes');
const { router: queueRouter } = require('./routes/queue.routes');
const { router: priorityRouter, setWhatsAppSocket: setPrioritySocket } = require('./routes/priority.routes');
const { router: notificationsRouter } = require('./routes/notifications.routes');
const { router: lyricsRouter } = require('./routes/lyrics.routes');
const { router: statsRouter } = require('./routes/stats.routes');
const { router: settingsRouter } = require('./routes/settings.routes');
const { router: logsRouter } = require('./routes/logs.routes');
const { router: effectsRouter } = require('./routes/effects.routes');
const { router: volumeRouter } = require('./routes/volume.routes');
const { router: volumeNormalizationRouter } = require('./routes/volume-normalization.routes');
const { router: groupsRouter, setWhatsAppSocket: setGroupsSocket } = require('./routes/groups.routes');
const { router: mobileRouter } = require('./routes/mobile.routes');
const { router: authRouter } = require('./routes/auth.routes');
const { router: userRouter } = require('./routes/user.routes');
const { router: vipAuthRouter } = require('./routes/vip-auth.routes');
const { router: startupSoundRouter } = require('./routes/startup-sound.routes');
const { updateVipName, setWhatsAppSocket: setPriorityServiceSocket } = require('../services/user/priority.service');

const app = express();
const PORT = config.server.port;

app.use(express.json());

// Request logging middleware (before other middleware to capture all requests)
app.use(requestLogger);

// Serve dashboard and player pages with localhost restriction (before static middleware)
app.get('/pages/dashboard.html', localhostOnly, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'pages', 'dashboard.html'));
});

app.get('/pages/player.html', localhostOnly, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'pages', 'player.html'));
});

// Serve static files (other pages remain accessible)
app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/stream', express.static(config.paths.temp));

app.use('/thumbnails', express.static(config.paths.thumbnails));

// Serve locale files
app.use('/locales', express.static(path.join(process.cwd(), 'locales')));

// API middleware
app.use('/api', apiRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    key: 'api'
}));

app.use('/api', statusRouter);
app.use('/api', queueRouter);
app.use('/api', priorityRouter);
app.use('/api', notificationsRouter);
app.use('/api', lyricsRouter);
app.use('/api/stats', statsRouter);
app.use('/api', settingsRouter);
app.use('/api', logsRouter);
app.use('/api', effectsRouter);
app.use('/api', volumeRouter);
app.use('/api', volumeNormalizationRouter);
app.use('/api', groupsRouter);
app.use('/api', mobileRouter);
app.use('/api', authRouter);
app.use('/api', userRouter);
app.use('/api', vipAuthRouter);
app.use('/api', startupSoundRouter);

// 404 handler for API routes (catch all unmatched /api routes)
// This will only match if no previous route matched
app.use(/^\/api\/.*/, notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Serve mobile VIP page
app.get('/mobile/vip', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'pages', 'mobile.html'));
});

function startServer(callback) {
    app.listen(PORT, () => {
        const url = `http://${config.server.host}:${PORT}`;
        console.log(`Visualization dashboard running at ${url}`);
        
        if (process.env.DEBUG === 'true') {
            config.print();
        }
        
        if (callback) {
            callback(url);
        }
    });
}

function setWhatsAppSocket(sock) {
    setPrioritySocket(sock);
    setGroupsSocket(sock);
    setPriorityServiceSocket(sock);
}

module.exports = { 
    startServer, 
    updateAuthStatus,
    updateVipName,
    setWhatsAppSocket 
};
