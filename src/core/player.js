const { spawn, execSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const config = require('../config');
const { logger } = require('../utils/logger.util');
const { sendMessageWithMention, getThumbnailUrl } = require('../utils/helpers.util');
const queueManager = require('./queue');
const { downloadTrack } = require('../services/download.service');
const effectsService = require('../services/effects.service');
const statsService = require('../services/stats.service');
const { isRateLimitError } = require('../utils/rate-limit.util');

/**
 * Player Module
 * Handles local audio playback with automatic backend selection:
 * - MPV (preferred): Seamless real-time effect changes via IPC
 * - ffplay (fallback): Effect changes require restart
 * 
 * See docs/adr/001-audio-player-backend.md for architecture details
 */

// Backend detection
let audioBackend = null; // 'mpv' or 'ffplay'

// MPV state
let mpvProcess = null;
let ipcSocket = null;
let ipcSocketPath = null;
let requestId = 1;
let pendingRequests = new Map();

// ffplay state  
let ffplayProcess = null;

// Shared state
let currentFilePath = null;
let isPlaying = false;

// ============================================
// BACKEND DETECTION
// ============================================

/**
 * Check if a command is available
 */
function isCommandAvailable(command) {
    try {
        execSync(`which ${command}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Detect and select the best available audio backend
 */
function detectBackend() {
    if (audioBackend) return audioBackend;

    if (isCommandAvailable('mpv')) {
        audioBackend = 'mpv';
        logger.info('🎵 Audio backend: MPV (seamless effect changes)');
    } else if (isCommandAvailable('ffplay')) {
        audioBackend = 'ffplay';
        logger.info('🎵 Audio backend: ffplay (effect changes may cause brief interruption)');
        logger.info('   For seamless effects, install MPV: brew install mpv (or see docs/adr/001-audio-player-backend.md)');
    } else {
        throw new Error('No audio backend available. Please install mpv or ffmpeg.');
    }

    return audioBackend;
}

// ============================================
// MPV BACKEND (Seamless Effects)
// ============================================

/**
 * Generate unique IPC socket path for MPV
 */
function getSocketPath() {
    return path.join(config.paths.temp, `mpv-socket-${process.pid}`);
}

/**
 * Send command to MPV via IPC
 */
function sendMpvCommand(command) {
    return new Promise((resolve, reject) => {
        if (!ipcSocket || ipcSocket.destroyed) {
            reject(new Error('IPC socket not connected'));
            return;
        }

        const id = requestId++;
        const message = JSON.stringify({ command, request_id: id }) + '\n';

        pendingRequests.set(id, { resolve, reject });

        setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('MPV command timeout'));
            }
        }, 5000);

        ipcSocket.write(message);
    });
}

/**
 * Connect to MPV IPC socket
 */
function connectToMpv() {
    return new Promise((resolve, reject) => {
        if (!ipcSocketPath) {
            reject(new Error('No socket path'));
            return;
        }

        let retries = 0;
        const maxRetries = 20;
        const retryDelay = 100;

        const tryConnect = () => {
            ipcSocket = net.createConnection(ipcSocketPath);

            ipcSocket.on('connect', () => {
                logger.info('Connected to MPV IPC socket');

                let buffer = '';
                ipcSocket.on('data', (data) => {
                    buffer += data.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const msg = JSON.parse(line);

                            if (msg.request_id && pendingRequests.has(msg.request_id)) {
                                const { resolve, reject } = pendingRequests.get(msg.request_id);
                                pendingRequests.delete(msg.request_id);
                                if (msg.error && msg.error !== 'success') {
                                    reject(new Error(msg.error));
                                } else {
                                    resolve(msg.data);
                                }
                            }

                            if (msg.event === 'end-file') {
                                logger.info('MPV: File ended');
                                queueManager.emit('mpv_file_ended', msg.reason);
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                });

                resolve();
            });

            ipcSocket.on('error', (err) => {
                if (retries < maxRetries) {
                    retries++;
                    setTimeout(tryConnect, retryDelay);
                } else {
                    reject(new Error(`Failed to connect to MPV socket: ${err.message}`));
                }
            });
        };

        tryConnect();
    });
}

/**
 * Start MPV process with IPC
 */
async function startMpv(filePath, startTimeOffset = 0) {
    ipcSocketPath = getSocketPath();
    if (fs.existsSync(ipcSocketPath)) {
        fs.unlinkSync(ipcSocketPath);
    }

    const args = [
        '--no-video',
        '--no-terminal',
        '--audio-display=no',
        `--input-ipc-server=${ipcSocketPath}`,
        '--idle=once',
    ];

    if (startTimeOffset > 0) {
        args.push(`--start=${(startTimeOffset / 1000).toFixed(2)}`);
    }

    const filterChain = effectsService.buildFilterChain();
    if (filterChain) {
        args.push(`--af=lavfi=[${filterChain}]`);
        logger.info(`Initial audio effects: ${filterChain}`);
    }

    args.push(filePath);

    logger.info(`Starting MPV: mpv ${args.slice(0, 5).join(' ')} ...`);

    mpvProcess = spawn('mpv', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    mpvProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('AO:') && !output.includes('Audio:')) {
            logger.debug(`MPV: ${output}`);
        }
    });

    mpvProcess.on('error', (err) => {
        logger.error('MPV process error:', err);
    });

    currentFilePath = filePath;
    isPlaying = true;

    await connectToMpv();
}

/**
 * Update audio filters seamlessly via MPV IPC
 */
async function updateMpvFilters() {
    if (!ipcSocket || ipcSocket.destroyed) {
        logger.warn('Cannot update filters: MPV not connected');
        return;
    }

    const filterChain = effectsService.buildFilterChain();

    try {
        if (filterChain) {
            await sendMpvCommand(['set_property', 'af', `lavfi=[${filterChain}]`]);
            logger.info(`✨ Seamlessly applied effects: ${filterChain}`);
        } else {
            await sendMpvCommand(['set_property', 'af', '']);
            logger.info('Cleared all audio effects');
        }
    } catch (err) {
        logger.error('Failed to update filters:', err);
    }
}

/**
 * Stop MPV and cleanup
 */
async function stopMpv() {
    if (ipcSocket && !ipcSocket.destroyed) {
        try {
            await sendMpvCommand(['quit']);
        } catch (e) { }
        ipcSocket.destroy();
        ipcSocket = null;
    }

    if (mpvProcess) {
        mpvProcess.kill('SIGTERM');
        mpvProcess = null;
    }

    if (ipcSocketPath && fs.existsSync(ipcSocketPath)) {
        try { fs.unlinkSync(ipcSocketPath); } catch (e) { }
    }

    isPlaying = false;
    currentFilePath = null;
    pendingRequests.clear();
}

// ============================================
// FFPLAY BACKEND (Fallback)
// ============================================

/**
 * Build ffplay arguments with audio effects filter chain
 */
function buildFfplayArgs(filePath, startTimeOffset = 0) {
    const args = ['-nodisp', '-autoexit', '-hide_banner', '-loglevel', 'quiet'];

    if (startTimeOffset > 0) {
        args.push('-ss', (startTimeOffset / 1000).toFixed(2));
    }

    const filterChain = effectsService.buildFilterChain();
    if (filterChain) {
        args.push('-af', filterChain);
        logger.info(`Applying audio effects: ${filterChain}`);
    }

    args.push(filePath);
    return args;
}

/**
 * Start ffplay process
 */
function startFfplay(filePath, startTimeOffset = 0) {
    const args = buildFfplayArgs(filePath, startTimeOffset);

    logger.info(`Starting ffplay: ffplay ${args.slice(0, 5).join(' ')} ...`);

    ffplayProcess = spawn('ffplay', args);
    currentFilePath = filePath;
    isPlaying = true;

    ffplayProcess.on('error', (err) => {
        logger.error('ffplay error:', err);
    });

    return ffplayProcess;
}

/**
 * Stop ffplay
 */
function stopFfplay() {
    if (ffplayProcess) {
        ffplayProcess.kill('SIGKILL');
        ffplayProcess = null;
    }
    isPlaying = false;
    currentFilePath = null;
}

// ============================================
// UNIFIED API
// ============================================

/**
 * Update filters - seamless for MPV, requires restart for ffplay
 */
async function updateFilters() {
    if (audioBackend === 'mpv') {
        await updateMpvFilters();
    }
    // For ffplay, the effects_changed event triggers a restart in processQueueItem
}

/**
 * Pause playback
 */
async function pausePlayback() {
    if (audioBackend === 'mpv' && ipcSocket && !ipcSocket.destroyed) {
        try {
            await sendMpvCommand(['set_property', 'pause', true]);
            isPlaying = false;
            logger.info('Paused');
        } catch (err) {
            logger.error('Failed to pause:', err);
        }
    }
    // ffplay pause is handled by killing the process
}

/**
 * Resume playback
 */
async function resumePlayback() {
    if (audioBackend === 'mpv' && ipcSocket && !ipcSocket.destroyed) {
        try {
            await sendMpvCommand(['set_property', 'pause', false]);
            isPlaying = true;
            logger.info('Resumed');
        } catch (err) {
            logger.error('Failed to resume:', err);
        }
    }
}

/**
 * Seek to position
 */
async function seekTo(positionMs) {
    if (audioBackend === 'mpv' && ipcSocket && !ipcSocket.destroyed) {
        try {
            await sendMpvCommand(['seek', positionMs / 1000, 'absolute']);
            logger.info(`Seeked to ${positionMs}ms`);
        } catch (err) {
            logger.error('Failed to seek:', err);
        }
    }
}

/**
 * Get current playback position
 */
async function getPosition() {
    if (audioBackend === 'mpv' && ipcSocket && !ipcSocket.destroyed) {
        try {
            const pos = await sendMpvCommand(['get_property', 'time-pos']);
            return Math.round((pos || 0) * 1000);
        } catch (err) {
            return 0;
        }
    }
    return 0;
}

// ============================================
// PREFETCH
// ============================================

// Track if prefetching is in progress to avoid duplicate calls
let isPrefetching = false;

// Track URLs currently being downloaded to prevent duplicate downloads
const downloadingUrls = new Set();

// Rate limiting for prefetch operations
let prefetchRateLimitDelay = 2000; // Start with 2 second delay between prefetches
let lastPrefetchTime = 0;
const MAX_CONCURRENT_PREFETCHES = 2; // Limit concurrent prefetches to avoid rate limiting
let activePrefetchCount = 0;

async function prefetchNext(count = null) {
    if (!config.performance.prefetchNext) return;

    // Prevent concurrent prefetching calls
    if (isPrefetching) {
        logger.debug('Prefetch already in progress, skipping');
        return;
    }

    if (count === null) count = config.performance.prefetchCount;

    const queue = queueManager.getQueue();
    if (queue.length === 0) return;

    // Filter to only songs that need prefetching and are not already being downloaded
    const itemsNeedingPrefetch = queue.filter(item => {
        if (item.type !== 'url') return false;
        if (item.prefetched) return false;
        if (item.downloading) return false;
        // Check if URL is already being downloaded (prevents duplicate downloads)
        if (downloadingUrls.has(item.content)) {
            logger.debug(`Skipping duplicate download for: ${item.title || item.content}`);
            return false;
        }
        return true;
    });

    if (itemsNeedingPrefetch.length === 0) {
        logger.debug('No songs need prefetching');
        return;
    }

    const itemsToPrefetch = count === 0 ? itemsNeedingPrefetch.length : Math.min(count, itemsNeedingPrefetch.length);

    logger.info(`Prefetching ${itemsToPrefetch} song(s) from ${itemsNeedingPrefetch.length} that need prefetching (total queue: ${queue.length})`);

    isPrefetching = true;

    // Prefetch songs with rate limiting and concurrency control
    let prefetchedCount = 0;
    let failedCount = 0;

    // Process items sequentially with delays to avoid rate limiting
    for (let i = 0; i < itemsToPrefetch; i++) {
        // Wait if we have too many concurrent prefetches
        while (activePrefetchCount >= MAX_CONCURRENT_PREFETCHES) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Rate limiting: wait between prefetches to avoid bursts
        const timeSinceLastPrefetch = Date.now() - lastPrefetchTime;
        if (timeSinceLastPrefetch < prefetchRateLimitDelay && i > 0) {
            const waitTime = prefetchRateLimitDelay - timeSinceLastPrefetch;
            logger.debug(`Rate limiting: waiting ${waitTime}ms before next prefetch`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const item = itemsNeedingPrefetch[i];
        const originalUrl = item.content; // Capture URL before it changes

        // Skip if URL is already being downloaded (race condition check)
        if (downloadingUrls.has(originalUrl)) {
            logger.debug(`Skipping duplicate download (race): ${item.title || originalUrl}`);
            continue;
        }

        // Mark URL as being downloaded
        downloadingUrls.add(originalUrl);
        activePrefetchCount++;
        lastPrefetchTime = Date.now();

        // Start prefetching (don't await - let it run in background)
        (async () => {
            logger.info(`Prefetching song #${i + 1}/${itemsToPrefetch}: ${item.title || item.content}`);
            item.downloadStatus = 'preparing';
            item.downloadProgress = 0;
            item.downloading = true;
            queueManager.saveQueue(true);

            try {
                const result = await downloadTrack(originalUrl, (progress) => {
                    item.downloadProgress = progress.percent || 0;
                    item.downloadStatus = progress.status || 'downloading';
                    queueManager.saveQueue(true);
                });

                item.type = 'file';
                item.content = result.filePath;
                item.title = result.title;
                item.thumbnail = result.thumbnailPath;
                item.prefetched = true;
                item.downloading = false;
                item.downloadStatus = 'ready';
                item.downloadProgress = 100;
                logger.info(`✓ Prefetch complete for: ${item.title}`);
                queueManager.saveQueue(true);
                prefetchedCount++;

                // On success, slightly reduce delay (but not below 1 second)
                prefetchRateLimitDelay = Math.max(1000, prefetchRateLimitDelay - 100);
            } catch (err) {
                const errorMsg = err?.message || String(err) || 'Unknown error';
                logger.error(`✗ Prefetch failed for ${item.title || originalUrl}:`, errorMsg);
                item.downloading = false;
                item.downloadStatus = 'error';
                item.downloadProgress = 0;
                queueManager.saveQueue(true);
                failedCount++;

                // On rate limit error, increase delay significantly
                if (isRateLimitError(err)) {
                    prefetchRateLimitDelay = Math.min(10000, prefetchRateLimitDelay * 2); // Double delay, max 10s
                    logger.warn(`Rate limited during prefetch. Increasing delay to ${prefetchRateLimitDelay}ms`);
                } else {
                    // On other errors, slightly increase delay
                    prefetchRateLimitDelay = Math.min(5000, prefetchRateLimitDelay + 500);
                }
            } finally {
                // Always remove URL from downloading set and decrement active count
                downloadingUrls.delete(originalUrl);
                activePrefetchCount--;
            }
        })();

        // Small delay between starting prefetches to avoid bursts
        if (i < itemsToPrefetch - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Wait a bit for prefetches to complete before marking as done
    // (but don't wait forever - they'll complete in background)
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info(`Prefetch batch started: ${prefetchedCount} completed, ${failedCount} failed, ${activePrefetchCount} still active`);

    isPrefetching = false;
}

async function prefetchAll() {
    logger.info('Starting prefetch for all queued songs...');
    await prefetchNext(0);
}

// ============================================
// MAIN PLAYBACK LOGIC
// ============================================

/**
 * Process a queue item (download if needed, then play)
 */
async function processQueueItem(sock, item, isConnected) {
    // Detect backend on first use
    detectBackend();

    try {
        let filePath;
        let title = 'Audio';

        // Prefetch ALL songs in background
        // Use count = 0 to prefetch all songs that need prefetching
        prefetchNext(0).catch(err => logger.error('Prefetch error', err));

        if (item.type === 'url') {
            item.downloadStatus = 'preparing';
            item.downloadProgress = 0;
            queueManager.saveQueue();

            const result = await downloadTrack(item.content, (progress) => {
                item.downloadProgress = progress.percent || 0;
                item.downloadStatus = progress.status || 'downloading';
                queueManager.saveQueue();
            });

            filePath = result.filePath;
            title = result.title;

            // Update stats with thumbnail
            if (result.thumbnailPath) {
                const thumbnailUrl = getThumbnailUrl(result.thumbnailPath);
                if (thumbnailUrl) {
                    statsService.updateLastSong(item.content, { thumbnailUrl });
                }
            }

            item.type = 'file';
            item.content = filePath;
            item.thumbnail = result.thumbnailPath;
            item.downloadStatus = 'ready';
            item.downloadProgress = 100;
            queueManager.saveQueue();
        } else if (item.type === 'file') {
            filePath = item.content;
            title = item.title || 'User Attachment';
        }

        if (filePath && fs.existsSync(filePath)) {
            if (isConnected && item.remoteJid && item.remoteJid !== 'WEB_DASHBOARD') {
                try {
                    await sendMessageWithMention(sock, item.remoteJid, `▶️ ${title}`, item.sender);
                } catch (e) {
                    logger.warn('Failed to send playing notification:', e.message);
                }
            }

            logger.info(`Playing locally: ${filePath}`);

            if (audioBackend === 'mpv') {
                await playWithMpv(filePath);
            } else {
                await playWithFfplay(filePath);
            }

            // Cleanup after playback if configured
            if (config.playback.cleanupAfterPlay) {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                if (item.thumbnail && fs.existsSync(item.thumbnail)) fs.unlinkSync(item.thumbnail);
            }
        } else {
            logger.error('File not found or download failed');
            if (isConnected && item.remoteJid && item.remoteJid !== 'WEB_DASHBOARD') {
                try {
                    await sendMessageWithMention(sock, item.remoteJid, 'Failed to play song.', item.sender);
                } catch (e) { }
            }
            // Mark as failed to prevent retry loop
            await new Promise(resolve => setTimeout(resolve, config.playback.songTransitionDelay));
            queueManager.songFinished(true); // Pass true to indicate failure
            return; // Exit early, don't continue
        }

    } catch (error) {
        logger.error('Error processing queue item:', error);
        if (audioBackend === 'mpv') await stopMpv();
        else stopFfplay();

        if (isConnected && item.remoteJid && item.remoteJid !== 'WEB_DASHBOARD') {
            try {
                await sendMessageWithMention(sock, item.remoteJid, `Error: ${error.message}`, item.sender);
            } catch (e) { }
        }
        // Mark as failed to prevent retry loop
        await new Promise(resolve => setTimeout(resolve, config.playback.songTransitionDelay));
        queueManager.songFinished(true); // Pass true to indicate failure
        return; // Exit early, don't continue
    }

    // Only reach here if song played successfully
    await new Promise(resolve => setTimeout(resolve, config.playback.songTransitionDelay));
    queueManager.songFinished(false); // Pass false to indicate success
}

/**
 * Play with MPV backend (seamless effects)
 */
async function playWithMpv(filePath) {
    let startOffset = 0;
    const current = queueManager.getCurrent();
    if (current && current.startTime) {
        startOffset = Math.max(0, Date.now() - current.startTime);
    } else if (current) {
        current.startTime = Date.now();
        queueManager.saveQueue();
    }

    await startMpv(filePath, startOffset);

    // Event handlers
    const effectsHandler = () => updateMpvFilters();

    const pauseHandler = async () => {
        await pausePlayback();
        const current = queueManager.getCurrent();
        if (current) {
            current.pausedAt = Date.now();
            queueManager.saveQueue();
        }
    };

    const resumeHandler = async () => {
        await resumePlayback();
        const current = queueManager.getCurrent();
        if (current && current.pausedAt && current.startTime) {
            const pauseDuration = Date.now() - current.pausedAt;
            current.startTime += pauseDuration;
            current.pausedAt = null;
            queueManager.saveQueue();
        }
    };

    const seekHandler = async () => {
        const current = queueManager.getCurrent();
        if (current && current.startTime) {
            const newPosition = Date.now() - current.startTime;
            await seekTo(newPosition);
        }
        queueManager.isSeeking = false;
    };

    const skipHandler = async () => {
        await stopMpv();
    };

    queueManager.on('effects_changed', effectsHandler);
    queueManager.on('pause_current', pauseHandler);
    queueManager.on('resume_current', resumeHandler);
    queueManager.on('seek_current', seekHandler);
    queueManager.on('skip_current', skipHandler);

    await new Promise((resolve) => {
        const cleanup = () => {
            queueManager.removeListener('effects_changed', effectsHandler);
            queueManager.removeListener('pause_current', pauseHandler);
            queueManager.removeListener('resume_current', resumeHandler);
            queueManager.removeListener('seek_current', seekHandler);
            queueManager.removeListener('skip_current', skipHandler);
            queueManager.removeListener('mpv_file_ended', fileEndHandler);
        };

        const fileEndHandler = (reason) => {
            logger.info(`Playback ended: ${reason}`);
            cleanup();
            resolve();
        };

        queueManager.on('mpv_file_ended', fileEndHandler);

        if (mpvProcess) {
            mpvProcess.on('close', (code) => {
                logger.info(`MPV exited with code ${code}`);
                cleanup();
                resolve();
            });
        }
    });

    await stopMpv();
}

/**
 * Play with ffplay backend (restart-based effects)
 */
async function playWithFfplay(filePath) {
    await new Promise(async (resolve) => {
        let finished = false;

        while (!finished) {
            const current = queueManager.getCurrent();
            if (!current) break;

            let offset = 0;

            // Handle pause state
            if (current.pausedAt) {
                const pauseResult = await new Promise(r => {
                    const handlers = {};
                    const cleanup = () => {
                        Object.keys(handlers).forEach(e =>
                            queueManager.removeListener(e, handlers[e])
                        );
                    };

                    handlers.resume_current = () => { cleanup(); r('resume'); };
                    handlers.skip_current = () => { cleanup(); r('skip'); };
                    handlers.seek_current = () => { cleanup(); r('seek'); };
                    handlers.effects_changed = () => { cleanup(); r('effects'); };

                    Object.keys(handlers).forEach(e =>
                        queueManager.on(e, handlers[e])
                    );
                });

                if (pauseResult === 'skip') {
                    finished = true;
                    stopFfplay();
                    break;
                }

                if (pauseResult === 'seek' || pauseResult === 'effects') {
                    queueManager.isSeeking = false;
                    continue;
                }
            }

            // Calculate offset
            if (current.startTime) {
                offset = Math.max(0, Date.now() - current.startTime);
                logger.info(`Starting/Resuming at offset: ${offset}ms`);
            } else {
                current.startTime = Date.now();
                queueManager.saveQueue();
            }

            // Start ffplay
            const result = await new Promise((resPlay) => {
                const p = startFfplay(filePath, offset);
                let killed = false;
                let killReason = null;

                const handlers = {
                    pause_current: () => {
                        killed = true;
                        killReason = 'paused';
                        p.kill('SIGKILL');
                    },
                    skip_current: () => {
                        killed = true;
                        killReason = 'skipped';
                        p.kill('SIGKILL');
                    },
                    seek_current: () => {
                        killed = true;
                        killReason = 'seek';
                        p.kill('SIGKILL');
                    },
                    effects_changed: () => {
                        killed = true;
                        killReason = 'effects';
                        const current = queueManager.getCurrent();
                        if (current && current.startTime) {
                            const elapsed = Date.now() - current.startTime;
                            current.startTime = Date.now() - elapsed;
                        }
                        p.kill('SIGKILL');
                        logger.info('Restarting ffplay with new effects');
                    }
                };

                Object.keys(handlers).forEach(e =>
                    queueManager.once(e, handlers[e])
                );

                p.on('close', (code) => {
                    Object.keys(handlers).forEach(e =>
                        queueManager.removeListener(e, handlers[e])
                    );

                    if (killed) {
                        if (killReason === 'paused' || queueManager.isPaused) {
                            resPlay('paused');
                        } else if (killReason === 'seek' || queueManager.isSeeking) {
                            resPlay('seek');
                        } else if (killReason === 'effects') {
                            resPlay('effects');
                        } else {
                            resPlay('skipped');
                        }
                    } else {
                        resPlay('finished');
                    }
                });
            });

            if (result === 'seek' || result === 'effects') {
                queueManager.isSeeking = false;
                continue;
            }

            if (result === 'finished' || result === 'skipped') {
                finished = true;
            }
        }

        stopFfplay();
        resolve();
    });
}

/**
 * Play audio file
 */
async function playAudio(filePath, startTimeOffset = 0) {
    detectBackend();

    if (audioBackend === 'mpv') {
        await startMpv(filePath, startTimeOffset);
        return new Promise((resolve) => {
            const handler = () => {
                queueManager.removeListener('mpv_file_ended', handler);
                stopMpv().then(resolve);
            };
            queueManager.on('mpv_file_ended', handler);
            if (mpvProcess) {
                mpvProcess.on('close', () => {
                    queueManager.removeListener('mpv_file_ended', handler);
                    resolve();
                });
            }
        });
    } else {
        return new Promise((resolve) => {
            const p = startFfplay(filePath, startTimeOffset);
            p.on('close', () => {
                stopFfplay();
                resolve();
            });
        });
    }
}

// ============================================
// EXPORTS
// ============================================

function getEffects() {
    return effectsService.getEffects();
}

function getPresets() {
    return effectsService.getPresetsInfo();
}

function getBackend() {
    return audioBackend || detectBackend();
}

module.exports = {
    processQueueItem,
    playAudio,
    prefetchNext,
    prefetchAll,
    getEffects,
    getPresets,
    getBackend,
    updateFilters,
    pausePlayback,
    resumePlayback,
    seekTo,
    getPosition,
    stopMpv,
    stopFfplay
};
