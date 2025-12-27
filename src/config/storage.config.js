const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Storage Configuration
 * Manages all file system paths and storage operations
 */

class StorageConfig {
    constructor(rootDir, isDevMode) {
        this.rootDir = rootDir;
        this.isDevMode = isDevMode;

        // In dev mode, use local dev-storage directory
        if (this.isDevMode) {
            this.storageDir = path.join(this.rootDir, 'dev-storage');
        } else {
            const storagePath = process.env.STORAGE_DIR || process.env.STORAGE_PATH;
            this.storageDir = storagePath
                ? (path.isAbsolute(storagePath) ? storagePath : path.join(this.rootDir, storagePath))
                : this.getDefaultStorageDir();
        }

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
    cleanupTempFiles(playbackController, queueManager) {
        if (!playbackController?.playback?.cleanupOnStartup) {
            return;
        }

        const tempDir = this.paths.temp;
        if (!fs.existsSync(tempDir)) {
            return;
        }

        try {
            // First, try to kill any orphaned ffplay processes that might be holding files
            try {
                const { execSync } = require('child_process');
                if (process.platform === 'win32') {
                    // On Windows, try to kill any ffplay.exe processes
                    execSync('taskkill /f /im ffplay.exe 2>nul', { stdio: 'ignore' });
                } else {
                    // On Unix-like systems
                    execSync('pkill -9 ffplay 2>/dev/null', { stdio: 'ignore' });
                }
            } catch (e) {
                // Ignore errors - processes might not exist
            }

            // Processes should be killed immediately

            const files = fs.readdirSync(tempDir);
            let cleanedCount = 0;
            const deletedFiles = [];

            // Get current song file path to exclude it from deletion
            let currentSongPath = null;
            try {
                const currentSong = playbackController.getCurrent();
                if (currentSong && currentSong.content) {
                    currentSongPath = currentSong.content;
                }
            } catch (e) {
                // PlaybackController might not be initialized yet, that's okay
            }

            // Get queue file paths to exclude from deletion
            const queueFilePaths = new Set();
            try {
                // Ensure queue is loaded by requiring the queue manager
                const queue = queueManager.getQueue();

                queue.forEach(item => {
                    // Check if item has a file path (not a URL)
                    if (item.content) {
                        const isFilePath = item.content.includes(path.sep) ||
                                          item.content.startsWith('/') ||
                                          (!item.content.startsWith('http://') && !item.content.startsWith('https://'));

                        if (isFilePath && item.type === 'file') {
                            // It's a file path - normalize it for comparison
                            try {
                                const normalizedPath = path.resolve(item.content);
                                queueFilePaths.add(normalizedPath.toLowerCase()); // Case-insensitive on Windows
                                // Also add the original path in case paths differ
                                queueFilePaths.add(item.content.toLowerCase());
                                // Add just the filename in case of path differences
                                const fileName = path.basename(item.content);
                                if (fileName) {
                                    queueFilePaths.add(fileName.toLowerCase());
                                }
                            } catch (e) {
                                // Path resolution failed, just use original
                                queueFilePaths.add(item.content.toLowerCase());
                            }
                        }
                    }
                    // Also check thumbnail paths
                    if (item.thumbnail) {
                        try {
                            const normalizedThumb = path.resolve(item.thumbnail);
                            queueFilePaths.add(normalizedThumb.toLowerCase());
                            queueFilePaths.add(item.thumbnail.toLowerCase());
                        } catch (e) {
                            queueFilePaths.add(item.thumbnail.toLowerCase());
                        }
                    }
                });

                if (queueFilePaths.size > 0) {
                    const { logger } = require('../utils/logger.util');
                    logger.info(`Protecting ${queueFilePaths.size} file paths from cleanup (queue items)`);
                }
            } catch (e) {
                // QueueManager might not be initialized yet, that's okay
            }

            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const normalizedFilePath = path.resolve(filePath);
                const filePathLower = filePath.toLowerCase();
                const normalizedFilePathLower = normalizedFilePath.toLowerCase();
                const fileNameLower = file.toLowerCase();

                // Skip if this is the current song file
                if (currentSongPath) {
                    const currentSongPathLower = currentSongPath.toLowerCase();
                    const normalizedCurrentSongPath = path.resolve(currentSongPath).toLowerCase();
                    if (filePathLower === currentSongPathLower ||
                        normalizedFilePathLower === normalizedCurrentSongPath) {
                        continue;
                    }
                }

                // Skip if this file is referenced in the queue (case-insensitive comparison)
                if (queueFilePaths.has(filePathLower) ||
                    queueFilePaths.has(normalizedFilePathLower) ||
                    queueFilePaths.has(fileNameLower)) {
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
                const { logger } = require('../utils/logger.util');
                logger.info(`Cleaned up ${cleanedCount} temp files on startup.`);
                if (deletedFiles.length > 0 && deletedFiles.length <= 10) {
                    logger.debug(`Deleted files: ${deletedFiles.join(', ')}`);
                }
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
        const ext = extension || 'mp3';
        const safeTitle = title
            .replace(/[^a-z0-9]/gi, '_')
            .substring(0, 50); // maxFilenameLength
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
            filename = `thumb_${hash}.jpg`; // thumbnailFormat
        } else {
            const safeTitle = title
                .replace(/[^a-z0-9]/gi, '_')
                .substring(0, 50); // maxFilenameLength
            filename = `${safeTitle}_${Date.now()}.jpg`;
        }

        const targetDir = organizeByDate
            ? this.getDateSubdirectory(this.paths.thumbnails)
            : this.paths.thumbnails;

        return path.join(targetDir, filename);
    }
}

module.exports = StorageConfig;
