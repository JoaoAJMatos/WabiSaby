const express = require('express');
const path = require('path');
const config = require('../config');
const { logger } = require('../utils/logger.util');
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
const { updateVipName, setWhatsAppSocket: setPriorityServiceSocket } = require('../services/priority.service');

const app = express();
const PORT = config.server.port;

// Middleware to restrict access to localhost only
function localhostOnly(req, res, next) {
    // Check various IP sources (including proxy headers)
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const ip = realIp || 
               (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ||
               req.ip || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress;
    
    const isLocalhost = ip === '127.0.0.1' || 
                       ip === '::1' || 
                       ip === '::ffff:127.0.0.1' ||
                       req.hostname === 'localhost' ||
                       req.hostname === '127.0.0.1';
    
    if (!isLocalhost) {
        logger.warn(`Access denied to ${req.path} from ${ip} (${req.hostname})`);
        return res.status(403).send('Access denied. This page is only accessible from localhost.');
    }
    
    next();
}

app.use(express.json());

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
