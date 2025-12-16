/**
 * Command Dependencies
 * 
 * Centralized dependency injection container for commands.
 * This pattern makes commands:
 * - Testable (easy to inject mocks)
 * - Maintainable (dependencies in one place)
 * - Explicit (clear what each command needs)
 * 
 * Usage in production:
 *   const { deps } = require('./dependencies');
 *   playCommand(sock, msg, args, deps);
 * 
 * Usage in tests:
 *   const { createDeps } = require('./dependencies');
 *   const testDeps = createDeps({
 *     searchYouTube: mockSearch,
 *     queueManager: mockQueue
 *   });
 *   playCommand(sock, msg, args, testDeps);
 */

// Core dependencies
const queueManager = require('../core/queue');
const playbackController = require('../core/playback.controller');

// Service dependencies
const { searchYouTube } = require('../services/search.service');
const { getTrackInfo, getSpotifyMetadata } = require('../services/metadata.service');
const { checkPriority } = require('../services/priority.service');
const { getPlaylistTracks } = require('../services/playlist.service');
const notificationService = require('../services/notification.service');
const groupsService = require('../services/groups.service');

// Utility dependencies
const { isSpotifyUrl, isYouTubeUrl, isPlaylistUrl } = require('../utils/url.util');
const { logger } = require('../utils/logger.util');
const { sendMessageWithMention } = require('../utils/helpers.util');

/**
 * Default dependencies for production use
 * All commands receive this object unless overridden
 */
const deps = {
    // Core
    queueManager,
    playbackController,
    
    // Services
    searchYouTube,
    getTrackInfo,
    getSpotifyMetadata,
    checkPriority,
    getPlaylistTracks,
    notificationService,
    groupsService,
    
    // Utilities
    isSpotifyUrl,
    isYouTubeUrl,
    isPlaylistUrl,
    logger,
    sendMessageWithMention
};

/**
 * Create dependencies with optional overrides
 * 
 * This is useful for testing where you want to replace specific
 * dependencies with mocks while keeping the rest as defaults.
 * 
 * @param {Object} overrides - Dependencies to override
 * @returns {Object} - New dependencies object with overrides applied
 * 
 * @example
 * const testDeps = createDeps({
 *   searchYouTube: async () => ({ url: 'test', title: 'Test' }),
 *   queueManager: { add: () => {} }
 * });
 */
function createDeps(overrides = {}) {
    return {
        ...deps,
        ...overrides
    };
}

module.exports = {
    deps,
    createDeps
};
