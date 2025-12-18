const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config();

/**
 * Central Configuration for WppMusicBot
 * All paths, settings, and constants are managed here
 */

class Config {
    constructor() {
        this.rootDir = process.cwd();
        const storagePath = process.env.STORAGE_DIR || process.env.STORAGE_PATH;
        this.storageDir = storagePath 
            ? (path.isAbsolute(storagePath) ? storagePath : path.join(this.rootDir, storagePath))
            : this.getDefaultStorageDir();
        
        this.paths = {
            storage: this.storageDir,
            temp: path.join(this.storageDir, 'temp'),
            data: path.join(this.storageDir, 'data'),
            database: path.join(this.storageDir, 'data', 'wabisaby.db'),
            auth: path.join(this.storageDir, 'auth'),
            media: path.join(this.storageDir, 'media'),
            thumbnails: path.join(this.storageDir, 'thumbnails'),
        };
        
        this.files = {
            queue: path.join(this.paths.data, 'queue.json'),
            priority: path.join(this.paths.data, 'priority.json'),
            stats: path.join(this.paths.data, 'stats.json'),
            groups: path.join(this.paths.data, 'groups.json'),
            settings: path.join(this.paths.data, 'settings.json'),
        };
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
        this.server = { 
            ...defaults.server,
            port: process.env.PORT ? parseInt(process.env.PORT, 10) : defaults.server.port,
            host: process.env.HOST || defaults.server.host,
        };
        this.whatsapp = {
            ...defaults.whatsapp,
            targetGroupId: process.env.TARGET_GROUP_ID || null,
        };
        this.download = { ...defaults.download };
        this.playback = { ...defaults.playback };
        this.logging = { ...defaults.logging };
        this.performance = { ...defaults.performance };
        this.notifications = { ...defaults.notifications };
        
        this.initializeStorage();
        // Don't load settings in constructor to avoid circular dependency
        // Settings will be loaded lazily on first access or explicitly after initialization
        this._settingsLoaded = false;
    }
    
    /**
     * Get platform-specific default storage directory
     * @returns {string} Path to default storage directory
     */
    getDefaultStorageDir() {
        const appName = 'wabi-saby';
        const homeDir = os.homedir();
        const platform = process.platform;
        
        // Use platform-specific standard locations
        if (platform === 'darwin') {
            // macOS: ~/Library/Application Support/wabi-saby
            return path.join(homeDir, 'Library', 'Application Support', appName);
        } else if (platform === 'win32') {
            // Windows: %APPDATA%\wabi-saby
            const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
            return path.join(appData, appName);
        } else {
            // Linux and other Unix-like systems: ~/.local/share/wabi-saby
            return path.join(homeDir, '.local', 'share', appName);
        }
    }
    
    /**
     * Get default settings (used when no persisted settings exist)
     */
    getDefaultSettings() {
        return {
            server: {
                port: 3000,
                host: 'localhost',
            },
            whatsapp: {
                browserName: 'WppMusicBot',
                browserVersion: '1.0.0',
            },
            download: {
                audioFormat: 'mp3',
                audioQuality: '128k',
                downloadThumbnails: true,
                thumbnailFormat: 'jpg',
                playerClient: 'android',
                maxFilenameLength: 50,
            },
            playback: {
                cleanupAfterPlay: true,
                cleanupOnStartup: true,
                songTransitionDelay: 100,
                confirmSkip: true,
                showRequesterName: true,
            },
            logging: {
                level: 'info',
                pretty: true,
            },
            performance: {
                prefetchNext: true,
                prefetchCount: 0,
            },
            notifications: {
                enabled: true,
                notifyAtPosition: 1,
            },
        };
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
            const dbService = require('../database/db.service');
            const dbSettings = dbService.getAllSettings();
            
            // Convert flat key-value to nested structure
            if (dbSettings.server) loadedSettings.server = dbSettings.server;
            if (dbSettings.whatsapp) loadedSettings.whatsapp = dbSettings.whatsapp;
            if (dbSettings.download) loadedSettings.download = dbSettings.download;
            if (dbSettings.playback) loadedSettings.playback = dbSettings.playback;
            if (dbSettings.logging) loadedSettings.logging = dbSettings.logging;
            if (dbSettings.performance) loadedSettings.performance = dbSettings.performance;
            if (dbSettings.notifications) loadedSettings.notifications = dbSettings.notifications;
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
        
        // Merge settings (loaded settings override defaults)
        // PORT and HOST can be set via .env (takes precedence) or settings
        this.server = { 
            ...defaults.server, 
            ...loadedSettings.server,
            // Environment variables take precedence over settings
            port: process.env.PORT ? parseInt(process.env.PORT, 10) : (loadedSettings.server?.port || defaults.server.port),
            host: process.env.HOST || loadedSettings.server?.host || defaults.server.host,
        };
        this.whatsapp = { 
            ...defaults.whatsapp, 
            ...loadedSettings.whatsapp,
            // Keep targetGroupId from .env (secret) - don't override with loaded settings
            targetGroupId: process.env.TARGET_GROUP_ID || null,
        };
        this.download = { ...defaults.download, ...loadedSettings.download };
        this.playback = { ...defaults.playback, ...loadedSettings.playback };
        this.logging = { ...defaults.logging, ...loadedSettings.logging };
        this.performance = { ...defaults.performance, ...loadedSettings.performance };
        this.notifications = { ...defaults.notifications, ...loadedSettings.notifications };
        
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
            const dbService = require('../database/db.service');
            
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
        const dirs = [
            this.paths.storage,
            this.paths.temp,
            this.paths.data,
            this.paths.auth,
            this.paths.media,
            this.paths.thumbnails,
        ];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    /**
     * Cleanup temporary files
     */
    cleanupTempFiles() {
        if (!this.playback.cleanupOnStartup) {
            return;
        }
        
        const tempDir = this.paths.temp;
        if (!fs.existsSync(tempDir)) {
            return;
        }
        
        try {
            const files = fs.readdirSync(tempDir);
            let cleanedCount = 0;
            const deletedFiles = [];
            
            // Get current song file path to exclude it from deletion
            let currentSongPath = null;
            try {
                const playbackController = require('../core/playback.controller');
                const currentSong = playbackController.getCurrent();
                if (currentSong && currentSong.content) {
                    currentSongPath = currentSong.content;
                }
            } catch (e) {
                // PlaybackController might not be initialized yet, that's okay
            }
            
            for (const file of files) {
                const filePath = path.join(tempDir, file);
                
                // Skip if this is the current song file
                if (currentSongPath && filePath === currentSongPath) {
                    continue;
                }
                
                try {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                    deletedFiles.push(filePath);
                } catch (err) {
                    console.error(`Failed to delete temp file ${file}:`, err);
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`Cleaned up ${cleanedCount} temp files.`);
            }
        } catch (err) {
            console.error('Failed to cleanup temp directory:', err);
        }
    }
    
    /**
     * Get date-based subdirectory path (YYYY-MM-DD format)
     * @param {string} baseDir - Base directory
     * @returns {string} Path with date subdirectory
     */
    getDateSubdirectory(baseDir) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const dateDir = path.join(baseDir, dateStr);
        
        // Ensure directory exists
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        
        return dateDir;
    }
    
    /**
     * Get output filename for a download
     * @param {string} title - The track title
     * @param {string} extension - File extension (default: mp3)
     * @returns {string} Safe filename with timestamp
     */
    getOutputFilename(title, extension = null) {
        const ext = extension || this.download.audioFormat;
        const safeTitle = title
            .replace(/[^a-z0-9]/gi, '_')
            .substring(0, this.download.maxFilenameLength);
        return `${safeTitle}_${Date.now()}.${ext}`;
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
        const filename = this.getOutputFilename(title, extension);
        
        // Default: organize media by date, but not temp files
        const shouldOrganize = organizeByDate !== null ? organizeByDate : !useTempDir;
        
        let targetDir;
        if (useTempDir) {
            targetDir = this.paths.temp;
        } else {
            targetDir = shouldOrganize ? this.getDateSubdirectory(this.paths.media) : this.paths.media;
        }
        
        return path.join(targetDir, filename);
    }
    
    /**
     * Get thumbnail path for a track
     * @param {string} title - The track title
     * @param {string} url - Optional URL for hash-based naming
     * @param {boolean} organizeByDate - Whether to organize by date subdirectories (default: true)
     * @returns {string} Full path to thumbnail file
     */
    getThumbnailPath(title, url = null, organizeByDate = true) {
        const crypto = require('crypto');
        
        // Use URL hash if available for better deduplication, otherwise use title + timestamp
        let filename;
        if (url) {
            const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
            filename = `thumb_${hash}.${this.download.thumbnailFormat}`;
        } else {
            const safeTitle = title
                .replace(/[^a-z0-9]/gi, '_')
                .substring(0, this.download.maxFilenameLength);
            filename = `${safeTitle}_${Date.now()}.${this.download.thumbnailFormat}`;
        }
        
        const targetDir = organizeByDate 
            ? this.getDateSubdirectory(this.paths.thumbnails)
            : this.paths.thumbnails;
        
        return path.join(targetDir, filename);
    }
    
    /**
     * Validate configuration
     * @returns {Object} Validation result with warnings
     */
    validate() {
        const warnings = [];
        
        // Check if FFmpeg is available (basic check)
        // This is a simple warning - actual validation happens when spawning processes
        if (process.platform === 'win32') {
            warnings.push('Make sure FFmpeg is installed and in your PATH');
        }
        
        // Validate port
        if (this.server.port < 1 || this.server.port > 65535) {
            warnings.push(`Invalid port number: ${this.server.port}. Using default: 3000`);
            this.server.port = 3000;
        }
        
        // Validate audio quality format
        const validQualityPattern = /^\d+k$/;
        if (!validQualityPattern.test(this.download.audioQuality)) {
            warnings.push(`Invalid audio quality format: ${this.download.audioQuality}. Should be like "128k" or "256k". Using default: 128k`);
            this.download.audioQuality = '128k';
        }
        
        return {
            valid: warnings.length === 0,
            warnings
        };
    }
    
    /**
     * Print current configuration (for debugging)
     */
    print() {
        console.log('\n=== WppMusicBot Configuration ===');
        console.log('Storage Locations:');
        Object.entries(this.paths).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
        });
        console.log('\nServer:');
        console.log(`  URL: http://${this.server.host}:${this.server.port}`);
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

