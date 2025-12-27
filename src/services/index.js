/**
 * Service Registry
 * Centralized access to all services
 *
 * Architecture layers:
 * - Playback: Business logic for audio playback, queue management, download orchestration
 * - Audio: Low-level audio processing (effects, volume normalization, download)
 * - Cache: Caching services for performance
 * - YouTube/Spotify: External service integrations
 * - Media/Metadata: Content processing and metadata extraction
 * - User: User management and permissions
 * - Content: Playlist and lyrics services
 * - System: System-level services (notifications, logs, stats, state persistence)
 */

// Playback services
const playbackServices = require('./playback');

// Cache services
const youtubeCache = require('./cache/youtube-cache.service');

// YouTube services
const youtubeAPI = require('./youtube/api.service');
const youtubeQuota = require('./youtube/quota.service');
const youtubeSearch = require('./youtube/search.service');
const youtubeDownload = require('./youtube/download.service');

// Spotify services
const spotifyAuth = require('./spotify/auth.service');
const spotifyMetadata = require('./spotify/metadata.service');

// Audio services
const effectsService = require('./audio/effects.service');
const audioAnalysis = require('./audio/analysis.service');
const volumeNormalization = require('./audio/volume-normalization.service');
const audioDownload = require('./audio/download.service');

// Media services
const mediaService = require('./media/media.service');

// Metadata services
const metadataService = require('./metadata/metadata.service');

// User services
const priorityService = require('./user/priority.service');
const groupsService = require('./user/groups.service');
const commandRateLimitService = require('./user/command-rate-limit.service');

// Content services
const playlistService = require('./content/playlist.service');
const lyricsService = require('./content/lyrics.service');

// System services
const notificationService = require('./system/notification.service');
const logsService = require('./system/logs.service');
const statsService = require('./system/stats.service');
const playbackStateService = require('./system/playback-state.service');
const statusService = require('./system/status.service');

module.exports = {
    // Playback
    playback: playbackServices,

    // Cache
    cache: {
        youtube: youtubeCache,
    },

    // YouTube
    youtube: {
        api: youtubeAPI,
        quota: youtubeQuota,
        search: youtubeSearch,
        download: youtubeDownload,
    },

    // Spotify
    spotify: {
        auth: spotifyAuth,
        metadata: spotifyMetadata,
    },

    // Audio
    audio: {
        effects: effectsService,
        analysis: audioAnalysis,
        volumeNormalization,
        download: audioDownload,
    },

    // Media
    media: mediaService,

    // Metadata
    metadata: metadataService,

    // User
    user: {
        priority: priorityService,
        groups: groupsService,
        commandRateLimit: commandRateLimitService,
    },

    // Content
    content: {
        playlist: playlistService,
        lyrics: lyricsService,
    },

    // System
    system: {
        notification: notificationService,
        logs: logsService,
        stats: statsService,
        playbackState: playbackStateService,
        status: statusService,
    },
};
