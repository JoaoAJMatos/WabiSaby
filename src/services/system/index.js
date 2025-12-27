/**
 * System Services
 * Exports all system-related services
 */

const notificationService = require('./notification.service');
const logsService = require('./logs.service');
const statsService = require('./stats.service');
const playbackStateService = require('./playback-state.service');
const cleanupService = require('./cleanup.service');
const sessionService = require('./session.service');
const statusService = require('./status.service');

module.exports = {
    notification: notificationService,
    logs: logsService,
    stats: statsService,
    playbackState: playbackStateService,
    cleanup: cleanupService,
    session: sessionService,
    status: statusService
};
