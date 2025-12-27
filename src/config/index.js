const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import specialized config classes
const StorageConfig = require('./storage.config');
const ServerConfig = require('./server.config');
const DownloadConfig = require('./download.config');
const PlaybackConfig = require('./playback.config');
const LoggingConfig = require('./logging.config');
const DefaultsConfig = require('./defaults');

/**
 * Central Configuration for WabiSaby
 * Orchestrates all configuration sections
 */

class Config {
    constructor() {
        this.rootDir = process.cwd();
        this.isDevMode = process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';

        // Initialize specialized configs
        this.storageConfig = new StorageConfig(this.rootDir, this.isDevMode);
        this.serverConfig = ServerConfig;
        this.downloadConfig = new DownloadConfig(this.storageConfig);
        this.playbackConfig = PlaybackConfig;
        this.loggingConfig = LoggingConfig;
        this.defaultsConfig = DefaultsConfig;

        // Expose configurations through unified interface
        this.paths = this.storageConfig.paths;
        this.files = this.storageConfig.files;

        // API credentials (not configurable via database)
        this.spotify = {
            clientId: process.env.SPOTIFY_CLIENT_ID || null,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET || null,
        };
        this.youtube = {
            apiKey: process.env.YOUTUBE_API_KEY || null,
        };

        // Initialize settings with defaults to avoid undefined access
        // These will be overridden by loadSettings() when database is available
        const defaults = this.getDefaultSettings();
        this.server = this.serverConfig.getConfig();
        this.whatsapp = {
            ...defaults.whatsapp,
            targetGroupId: process.env.TARGET_GROUP_ID || null,
        };
        this.download = this.downloadConfig.getConfig();
        this.playback = this.playbackConfig.getConfig();
        this.logging = this.loggingConfig.getConfig(this.isDevMode);
        this.performance = { ...defaults.performance };
        this.notifications = { ...defaults.notifications };
        this.privacy = { ...defaults.privacy };

        this.storageConfig.initializeStorage();
        // Don't load settings in constructor to avoid circular dependency
        // Settings will be loaded lazily on first access or explicitly after initialization
        this._settingsLoaded = false;
    }
    
    /**
     * Get platform-specific default storage directory
     * @returns {string} Path to default storage directory
     */
    getDefaultStorageDir() {
        return this.storageConfig.getDefaultStorageDir();
    }
    
    /**
     * Get default settings (used when no persisted settings exist)
     */
    getDefaultSettings() {
        return this.defaultsConfig.getDefaultSettings();
    }
    
    /**
     * Load settings from database (or fallback to JSON file)
     */
    loadSettings() {
        if (this._settingsLoaded) {
            return; // Already loaded
        }

        let loadedSettings = {};

        // Try to load from database first
        try {
            const dbService = require('./infrastructure/database/db.service');
            const dbSettings = dbService.getAllSettings();

            // Convert flat key-value to nested structure
            if (dbSettings.server) loadedSettings.server = dbSettings.server;
            if (dbSettings.whatsapp) loadedSettings.whatsapp = dbSettings.whatsapp;
            if (dbSettings.download) loadedSettings.download = dbSettings.download;
            if (dbSettings.playback) loadedSettings.playback = dbSettings.playback;
            if (dbSettings.logging) loadedSettings.logging = dbSettings.logging;
            if (dbSettings.performance) loadedSettings.performance = dbSettings.performance;
            if (dbSettings.notifications) loadedSettings.notifications = dbSettings.notifications;
            if (dbSettings.privacy) loadedSettings.privacy = dbSettings.privacy;
        } catch (err) {
            // Database not initialized yet or no settings - try JSON file as fallback
            const settingsFile = this.files.settings;
            if (fs.existsSync(settingsFile)) {
                try {
                    const fileContent = fs.readFileSync(settingsFile, 'utf8');
                    loadedSettings = JSON.parse(fileContent);
                } catch (fileErr) {
                    console.warn('Failed to load settings file, using defaults:', fileErr.message);
                }
            }
        }

        // Get defaults and merge with loaded settings
        const defaults = this.getDefaultSettings();

        // Update configurations with loaded settings
        this.server = this.serverConfig.getConfig();
        this.whatsapp = {
            ...defaults.whatsapp,
            ...loadedSettings.whatsapp,
            // Keep targetGroupId from .env (secret) - don't override with loaded settings
            targetGroupId: process.env.TARGET_GROUP_ID || null,
        };
        this.download = { ...defaults.download, ...loadedSettings.download };
        this.playback = { ...defaults.playback, ...loadedSettings.playback };
        // In dev mode, always use debug logging regardless of saved settings
        this.logging = this.isDevMode
            ? { level: 'debug', pretty: true }
            : { ...defaults.logging, ...loadedSettings.logging };
        this.performance = { ...defaults.performance, ...loadedSettings.performance };
        this.notifications = { ...defaults.notifications, ...loadedSettings.notifications };
        this.privacy = { ...defaults.privacy, ...(loadedSettings.privacy || {}) };

        this._settingsLoaded = true;
    }
    
    /**
     * Ensure settings are loaded (lazy loading)
     */
    _ensureSettingsLoaded() {
        if (!this._settingsLoaded) {
            this.loadSettings();
        }
    }
    
    /**
     * Save current settings to database
     */
    saveSettings() {
        try {
            const dbService = require('./infrastructure/database/db.service');

            // Build server settings object - only include PORT/HOST if not set via .env
            const serverSettings = {};
            if (!process.env.PORT) {
                serverSettings.port = this.server.port;
            }
            if (!process.env.HOST) {
                serverSettings.host = this.server.host;
            }

            const settingsToSave = {
                // Only include server object if it has properties
                ...(Object.keys(serverSettings).length > 0 ? { server: serverSettings } : {}),
                whatsapp: {
                    browserName: this.whatsapp.browserName,
                    browserVersion: this.whatsapp.browserVersion,
                    // Don't save targetGroupId (it's a secret from .env)
                },
                download: this.download,
                playback: this.playback,
                logging: this.logging,
                performance: this.performance,
                notifications: this.notifications,
                privacy: this.privacy,
            };

            // Save each section as a separate setting
            Object.entries(settingsToSave).forEach(([key, value]) => {
                dbService.setSetting(key, value);
            });

            return true;
        } catch (err) {
            console.error('Failed to save settings:', err);
            return false;
        }
    }
    
    /**
     * Create all required storage directories
     */
    initializeStorage() {
        return this.storageConfig.initializeStorage();
    }
    
    /**
     * Cleanup temporary files
     */
    cleanupTempFiles() {
        const services = require('../services');
        return this.storageConfig.cleanupTempFiles(services.playback.orchestrator, services.playback.queue);
    }
    
    /**
     * Get date-based subdirectory path (YYYY-MM-DD format)
     * @param {string} baseDir - Base directory
     * @returns {string} Path with date subdirectory
     */
    getDateSubdirectory(baseDir) {
        return this.storageConfig.getDateSubdirectory(baseDir);
    }
    
    /**
     * Get output filename for a download
     * @param {string} title - The track title
     * @param {string} extension - File extension (default: mp3)
     * @returns {string} Safe filename with timestamp
     */
    getOutputFilename(title, extension = null) {
        return this.downloadConfig.getOutputFilename(title, extension);
    }
    
    /**
     * Get full output path for a download
     * @param {string} title - The track title
     * @param {string} extension - File extension (default: mp3)
     * @param {boolean} useTempDir - Whether to use temp directory (default: true)
     * @param {boolean} organizeByDate - Whether to organize by date subdirectories (default: false for temp, true for media)
     * @returns {string} Full path to output file
     */
    getOutputPath(title, extension = null, useTempDir = true, organizeByDate = null) {
        return this.downloadConfig.getOutputPath(title, extension, useTempDir, organizeByDate);
    }
    
    /**
     * Get thumbnail path for a track
     * @param {string} title - The track title
     * @param {string} url - Optional URL for hash-based naming
     * @param {boolean} organizeByDate - Whether to organize by date subdirectories (default: true)
     * @returns {string} Full path to thumbnail file
     */
    getThumbnailPath(title, url = null, organizeByDate = true) {
        return this.downloadConfig.getThumbnailPath(title, url, organizeByDate);
    }
    
    /**
     * Validate configuration
     * @returns {Object} Validation result with warnings
     */
    validate() {
        const warnings = [];

        // Check audio backend availability
        // Only warn about FFmpeg if MPV is not available (MPV is preferred and doesn't require FFmpeg)
        const { isCommandInPath } = require('../utils/dependencies.util');
        const hasMPV = isCommandInPath('mpv');
        
        if (!hasMPV) {
            // MPV not available, check if FFmpeg/ffplay is available
            const { isFFplayAvailable } = require('../utils/dependencies.util');
            if (!isFFplayAvailable()) {
                // Neither MPV nor ffplay available - warn about FFmpeg
                warnings.push('Make sure FFmpeg is installed and in your PATH (or install MPV for better performance)');
            }
        }

        // Validate server config
        const serverWarnings = this.serverConfig.validate(this.server);
        warnings.push(...serverWarnings);

        // Validate download config
        const downloadWarnings = this.downloadConfig.validate(this.download);
        warnings.push(...downloadWarnings);

        return {
            valid: warnings.length === 0,
            warnings
        };
    }
    
    /**
     * Check if running in development mode
     * @returns {boolean} True if in dev mode
     */
    isDevelopment() {
        return this.isDevMode;
    }
    
    /**
     * Print current configuration (for debugging)
     */
    print() {
        console.log('\n=== WabiSaby Configuration ===');
        console.log('Storage Locations:');
        Object.entries(this.paths).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
        });
        console.log('\nServer:');
        console.log(`  URL: ${this.serverConfig.getUrl(this.server)}`);
        console.log('\nDownload Settings:');
        console.log(`  Audio Format: ${this.download.audioFormat}`);
        console.log(`  Audio Quality: ${this.download.audioQuality}`);
        console.log(`  Download Thumbnails: ${this.download.downloadThumbnails}`);
        console.log('\nPlayback:');
        console.log(`  Cleanup After Play: ${this.playback.cleanupAfterPlay}`);
        console.log(`  Cleanup On Startup: ${this.playback.cleanupOnStartup}`);
        console.log('\nPerformance:');
        console.log(`  Prefetch Enabled: ${this.performance.prefetchNext}`);
        console.log(`  Prefetch Count: ${this.performance.prefetchCount === 0 ? 'All' : this.performance.prefetchCount}`);
        console.log('\nNotifications:');
        console.log(`  Enabled: ${this.notifications.enabled}`);
        console.log(`  Notify At Position: ${this.notifications.notifyAtPosition}`);
        console.log('\nSpotify API:');
        console.log(`  Configured: ${this.spotify.clientId && this.spotify.clientSecret ? 'Yes' : 'No (Spotify playlists will not work)'}`);
        console.log('\nYouTube Data API:');
        console.log(`  Configured: ${this.youtube.apiKey ? 'Yes' : 'No (will use play-dl fallback)'}`);
        console.log('=================================\n');
    }
}

// Export singleton instance
const config = new Config();

// Load settings after singleton is created (deferred to avoid circular dependency)
// Settings will be loaded when database is available, or fallback to defaults/JSON file
process.nextTick(() => {
    try {
        config.loadSettings();
    } catch (err) {
        // If settings can't be loaded yet, defaults are already set in constructor
        // Settings will be loaded when database becomes available
    }
});

// Validate on load
const validation = config.validate();
if (validation.warnings.length > 0) {
    console.warn('Configuration warnings:');
    validation.warnings.forEach(w => console.warn(`  - ${w}`));
}

module.exports = config;

