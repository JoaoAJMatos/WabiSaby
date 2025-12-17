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
const { router: groupsRouter, setWhatsAppSocket: setGroupsSocket } = require('./routes/groups.routes');
const { router: mobileRouter } = require('./routes/mobile.routes');
const { updateVipName, setWhatsAppSocket: setPriorityServiceSocket } = require('../services/priority.service');

const app = express();
const PORT = config.server.port;

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/stream', express.static(config.paths.temp));

app.use('/thumbnails', express.static(config.paths.thumbnails));

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
app.use('/api', mobileRouter);

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
