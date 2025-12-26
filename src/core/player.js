const EventEmitter = require('events');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const os = require('os');
const config = require('../config');
const { logger } = require('../utils/logger.util');
const effectsService = require('../services/effects.service');
const { isFFplayAvailable, getFFplayPath, isCommandInPath } = require('../utils/dependencies.util');
const {
    PLAYBACK_REQUESTED,
    PLAYBACK_STARTED,
    PLAYBACK_FINISHED,
    PLAYBACK_ERROR,
    PLAYBACK_PAUSE,
    PLAYBACK_RESUME,
    PLAYBACK_SEEK,
    PLAYBACK_SKIP,
    EFFECTS_CHANGED
} = require('./events');

/**
 * Player Module
 * 
 * Pure Audio Backend - manages MPV/ffplay processes and provides playback control API.
 * Listens to events from PlaybackController and emits playback events.
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
let currentVolume = 100; // Volume in percentage (0-100)

// Event emitter for internal events (mpv_file_ended)
const playerEvents = new EventEmitter();

// ============================================
// BACKEND DETECTION
// ============================================

/**
 * Check if a command is available
 */
function isCommandAvailable(command) {
    return isCommandInPath(command);
}

/**
 * Detect and select the best available audio backend
 * @returns {string|null} 'mpv', 'ffplay', or null if neither is available
 */
function detectBackend() {
    if (audioBackend) return audioBackend;

    if (isCommandAvailable('mpv')) {
        audioBackend = 'mpv';
        logger.info('🎵 Audio backend: MPV (seamless effect changes)');
    } else if (isFFplayAvailable()) {
        audioBackend = 'ffplay';
        logger.info('🎵 Audio backend: ffplay (effect changes may cause brief interruption)');
        logger.info('   For seamless effects, install MPV: brew install mpv (or see docs/adr/001-audio-player-backend.md)');
    } else {
        audioBackend = null;
        logger.warn('⚠️  No audio backend available. Please install mpv or ffmpeg.');
    }

    return audioBackend;
}

// ============================================
// MPV BACKEND (Seamless Effects)
// ============================================

/**
 * Generate unique IPC socket path for MPV
 * On Windows, MPV uses named pipes, so we use a simple name
 * On Unix, we use a file path
 */
function getSocketPath() {
    const IS_WINDOWS = os.platform() === 'win32';
    if (IS_WINDOWS) {
        // On Windows, MPV creates a named pipe, so we use a simple name
        // The pipe will be created as \\.\pipe\mpv-socket-<pid>
        return `mpv-socket-${process.pid}`;
    } else {
        // On Unix, use a file path
        return path.join(config.paths.temp, `mpv-socket-${process.pid}`);
    }
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

        const IS_WINDOWS = os.platform() === 'win32';
        let retries = 0;
        // Windows named pipes may take longer to be ready
        const maxRetries = IS_WINDOWS ? 50 : 20;
        const retryDelay = IS_WINDOWS ? 150 : 100;

        const tryConnect = () => {
            // Check if MPV process is still running
            if (!mpvProcess || mpvProcess.killed) {
                reject(new Error('MPV process is not running'));
                return;
            }

            // On Windows, named pipes use \\.\pipe\<name> format
            const connectionPath = IS_WINDOWS 
                ? `\\\\.\\pipe\\${ipcSocketPath}`
                : ipcSocketPath;

            ipcSocket = net.createConnection(connectionPath);

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
                                playerEvents.emit('mpv_file_ended', msg.reason);
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
                    if (retries % 10 === 0) {
                        logger.debug(`Retrying MPV connection (attempt ${retries}/${maxRetries})...`);
                    }
                    setTimeout(tryConnect, retryDelay);
                } else {
                    reject(new Error(`Failed to connect to MPV socket after ${maxRetries} attempts: ${err.message}`));
                }
            });
        };

        // On Windows, give MPV a bit more time to create the named pipe
        const initialDelay = IS_WINDOWS ? 200 : 50;
        setTimeout(tryConnect, initialDelay);
    });
}

/**
 * Start MPV process with IPC
 */
async function startMpv(filePath, startTimeOffset = 0) {
    const IS_WINDOWS = os.platform() === 'win32';
    ipcSocketPath = getSocketPath();
    
    // On Unix, clean up old socket file if it exists
    // On Windows, named pipes don't exist as files, so skip this
    if (!IS_WINDOWS && fs.existsSync(ipcSocketPath)) {
        try {
            fs.unlinkSync(ipcSocketPath);
        } catch (err) {
            logger.debug(`Could not remove old socket file: ${err.message}`);
        }
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
    
    // Load and apply volume from database after connecting
    try {
        const dbService = require('../database/db.service');
        const savedVolume = dbService.getSetting('volume');
        if (savedVolume !== null) {
            currentVolume = savedVolume;
            await sendMpvCommand(['set_property', 'volume', currentVolume]);
            logger.info(`Applied saved volume: ${currentVolume}%`);
        }
    } catch (err) {
        // If database not available or volume not set, use default (100)
        logger.debug('Could not load volume from database, using default:', err.message);
    }
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
    const ffplayBinary = getFFplayPath();

    logger.info(`Starting ffplay: ${ffplayBinary} ${args.slice(0, 5).join(' ')} ...`);

    ffplayProcess = spawn(ffplayBinary, args);
    currentFilePath = filePath;
    isPlaying = true;

    ffplayProcess.on('error', (err) => {
        logger.error('ffplay error:', err);
    });

    return ffplayProcess;
}

/**
 * Forcefully kill a process on Windows
 */
function killProcessWindows(pid) {
    if (process.platform === 'win32') {
        try {
            // Use taskkill for immediate termination on Windows
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 1000 });
        } catch (e) {
            // Process might already be dead, ignore
        }
    }
}

/**
 * Stop ffplay
 */
function stopFfplay() {
    if (ffplayProcess) {
        const pid = ffplayProcess.pid;
        // On Windows, use taskkill for immediate termination
        if (process.platform === 'win32') {
            try {
                killProcessWindows(pid);
            } catch (err) {
                logger.debug('ffplay process termination error:', err.message);
            }
        } else {
            // Unix-like systems
            try {
                ffplayProcess.kill('SIGTERM');
                setTimeout(() => {
                    if (ffplayProcess && !ffplayProcess.killed) {
                        ffplayProcess.kill('SIGKILL');
                    }
                }, 100);
            } catch (err) {
                logger.debug('ffplay process termination error:', err.message);
            }
        }
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
    // For ffplay, effects_changed event will trigger a restart (handled in playFile)
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

/**
 * Set volume (0-100)
 */
async function setVolume(volume) {
    // Clamp volume to 0-100
    currentVolume = Math.max(0, Math.min(100, volume));
    
    if (audioBackend === 'mpv' && ipcSocket && !ipcSocket.destroyed) {
        try {
            // MPV volume is 0-100
            await sendMpvCommand(['set_property', 'volume', currentVolume]);
            logger.info(`Volume set to ${currentVolume}%`);
        } catch (err) {
            logger.error('Failed to set volume:', err);
        }
    } else if (audioBackend === 'ffplay') {
        // For ffplay, volume will be applied via filter chain on next playback
        logger.info(`Volume set to ${currentVolume}% (will apply on next playback)`);
    }
}

/**
 * Get current volume
 */
function getVolume() {
    return currentVolume;
}

// ============================================
// EVENT-DRIVEN PLAYBACK
// ============================================

/**
 * Play file with MPV backend (event-driven)
 */
async function playFileWithMpv(filePath, startOffset = 0) {
    const playbackController = require('./playback.controller');
    
    // Ensure any previous MPV process is fully stopped before starting new one
    await stopMpv();
    
    await startMpv(filePath, startOffset);
    
    // Verify socket is connected before proceeding
    if (!ipcSocket || ipcSocket.destroyed) {
        throw new Error('Failed to establish MPV IPC connection');
    }
    
    // Emit playback started
    playbackController.emit(PLAYBACK_STARTED, { filePath });
    
    // Set up event handlers
    // Note: Effects are also handled by a global listener, but we keep per-playback listener
    // for consistency and to ensure effects are applied immediately when socket is ready
    const effectsHandler = () => {
        if (ipcSocket && !ipcSocket.destroyed) {
            updateMpvFilters().catch(err => {
                logger.error('Failed to update MPV filters:', err);
            });
        }
    };
    const pauseHandler = async () => {
        if (ipcSocket && !ipcSocket.destroyed) {
            await pausePlayback();
        } else {
            logger.warn('Cannot pause: MPV socket not ready');
        }
    };
    const resumeHandler = async () => {
        if (ipcSocket && !ipcSocket.destroyed) {
            await resumePlayback();
        } else {
            logger.warn('Cannot resume: MPV socket not ready');
        }
    };
    const seekHandler = async ({ positionMs }) => {
        if (ipcSocket && !ipcSocket.destroyed) {
            await seekTo(positionMs);
        } else {
            logger.warn('Cannot seek: MPV socket not ready');
        }
    };
    const skipHandler = async () => {
        // Skip should work even if socket is not ready - it will stop the process
        await stopMpv();
    };
    
    playbackController.on(EFFECTS_CHANGED, effectsHandler);
    playbackController.on(PLAYBACK_PAUSE, pauseHandler);
    playbackController.on(PLAYBACK_RESUME, resumeHandler);
    playbackController.on(PLAYBACK_SEEK, seekHandler);
    playbackController.on(PLAYBACK_SKIP, skipHandler);
    
    // Wait for playback to finish
    await new Promise((resolve) => {
        let finished = false; // Guard flag to prevent duplicate PLAYBACK_FINISHED events
        const currentProcess = mpvProcess; // Capture the specific process instance for this playback
        
        const processCloseHandler = (code) => {
            // Only handle close if it's for this specific process instance
            if (mpvProcess === currentProcess) {
                logger.info(`MPV exited with code ${code}`);
                handleFinished('process_close', `exit code ${code}`);
            } else {
                logger.debug(`Ignoring close event from old MPV process (current process: ${mpvProcess?.pid}, closed process: ${currentProcess?.pid})`);
            }
        };
        
        const cleanup = () => {
            playbackController.removeListener(EFFECTS_CHANGED, effectsHandler);
            playbackController.removeListener(PLAYBACK_PAUSE, pauseHandler);
            playbackController.removeListener(PLAYBACK_RESUME, resumeHandler);
            playbackController.removeListener(PLAYBACK_SEEK, seekHandler);
            playbackController.removeListener(PLAYBACK_SKIP, skipHandler);
            playerEvents.removeListener('mpv_file_ended', fileEndHandler);
            // Remove the close handler for this specific process
            if (currentProcess) {
                currentProcess.removeListener('close', processCloseHandler);
            }
        };
        
        const handleFinished = async (source, reason) => {
            if (finished) {
                logger.debug(`Playback finish already handled (ignoring ${source})`);
                return;
            }
            finished = true;
            logger.info(`Playback ended: ${reason} (${source})`);
            cleanup();
            
            // Stop MPV and wait for cleanup before resolving
            // This ensures the old process/socket is fully cleaned up before new playback starts
            await stopMpv();
            
            playbackController.emit(PLAYBACK_FINISHED, { filePath, reason: 'ended' });
            resolve();
        };
        
        const fileEndHandler = (reason) => {
            handleFinished('mpv_file_ended', reason);
        };
        
        playerEvents.on('mpv_file_ended', fileEndHandler);
        
        if (currentProcess) {
            currentProcess.on('close', processCloseHandler);
        }
    });
    
    // Note: stopMpv() is now called in handleFinished before resolving
    // This ensures cleanup happens before new playback can start
}

/**
 * Play file with ffplay backend (event-driven)
 */
/**
 * Play file with ffplay backend (event-driven)
 */
async function playFileWithFfplay(filePath, startOffset = 0) {
    const playbackController = require('./playback.controller');
    
    // Emit playback started
    playbackController.emit(PLAYBACK_STARTED, { filePath });
    
    let currentOffset = startOffset;
    let isPaused = false;
    let playbackStartTime = null;
    let pauseStartTime = null;
    
    await new Promise(async (resolve) => {
        let finished = false;
        
        while (!finished) {
            // Handle pause state
            if (isPaused) {
                const pauseResult = await new Promise(r => {
                    const handlers = {};
                    const cleanup = () => {
                        Object.keys(handlers).forEach(e =>
                            playbackController.removeListener(e, handlers[e])
                        );
                    };
                    
                    handlers[PLAYBACK_RESUME] = () => { cleanup(); r('resume'); };
                    handlers[PLAYBACK_SKIP] = () => { cleanup(); r('skip'); };
                    handlers[PLAYBACK_SEEK] = () => { cleanup(); r('seek'); };
                    handlers[EFFECTS_CHANGED] = () => { cleanup(); r('effects'); };
                    
                    Object.keys(handlers).forEach(e =>
                        playbackController.once(e, handlers[e])
                    );
                });
                
                if (pauseResult === 'skip') {
                    finished = true;
                    stopFfplay();
                    break;
                }
                
                if (pauseResult === 'seek') {
                    continue;
                }
                
                if (pauseResult === 'effects') {
                    // currentOffset was already updated when we paused, so it's already correct
                    // Just continue to restart playback with new effects
                    logger.info(`Effects changed while paused, restarting at position ${currentOffset}ms`);
                    continue;
                }
                
                if (pauseResult === 'resume') {
                    isPaused = false;
                    // currentOffset was already updated when we paused, so we can just resume
                    pauseStartTime = null;
                    playbackStartTime = null; // Will be reset when we start the new ffplay process
                }
            }
            
            // Start ffplay
            const result = await new Promise((resPlay) => {
                playbackStartTime = Date.now();
                pauseStartTime = null;
                const p = startFfplay(filePath, currentOffset);
                let killed = false;
                let killReason = null;
                
                const handlers = {
                    [PLAYBACK_PAUSE]: () => {
                        killed = true;
                        killReason = 'paused';
                        isPaused = true;
                        pauseStartTime = Date.now();
                        // Calculate current position before killing
                        if (playbackStartTime) {
                            const elapsed = Date.now() - playbackStartTime;
                            currentOffset = currentOffset + elapsed;
                            logger.info(`Paused at position ${currentOffset}ms`);
                            playbackStartTime = null; // Reset so effects change logic knows we're paused
                        }
                        // Force kill the process - use Windows-specific method
                        try {
                            if (process.platform === 'win32') {
                                killProcessWindows(p.pid);
                            } else {
                                p.kill('SIGTERM');
                                setTimeout(() => {
                                    if (!p.killed) {
                                        p.kill('SIGKILL');
                                    }
                                }, 100);
                            }
                        } catch (e) {
                            // Process might already be dead
                        }
                    },
                    [PLAYBACK_SKIP]: () => {
                        killed = true;
                        killReason = 'skipped';
                        // Force kill the process - use Windows-specific method
                        try {
                            if (process.platform === 'win32') {
                                killProcessWindows(p.pid);
                            } else {
                                p.kill('SIGTERM');
                                setTimeout(() => {
                                    if (!p.killed) {
                                        p.kill('SIGKILL');
                                    }
                                }, 100);
                            }
                        } catch (e) {
                            // Process might already be dead
                        }
                    },
                    [PLAYBACK_SEEK]: ({ positionMs }) => {
                        killed = true;
                        killReason = 'seek';
                        currentOffset = positionMs;
                        playbackStartTime = null;
                        // Force kill the process - use Windows-specific method
                        try {
                            if (process.platform === 'win32') {
                                killProcessWindows(p.pid);
                            } else {
                                p.kill('SIGTERM');
                                setTimeout(() => {
                                    if (!p.killed) {
                                        p.kill('SIGKILL');
                                    }
                                }, 100);
                            }
                        } catch (e) {
                            // Process might already be dead
                        }
                    },
                    [EFFECTS_CHANGED]: () => {
                        killed = true;
                        killReason = 'effects';
                        // Calculate current position before killing
                        if (playbackStartTime) {
                            const elapsed = Date.now() - playbackStartTime;
                            currentOffset = currentOffset + elapsed;
                            logger.info(`Restarting ffplay with new effects at position ${currentOffset}ms`);
                        } else {
                            // If playbackStartTime is null, we're likely in pause state
                            // currentOffset should already be correct from pause handler, just log
                            logger.info(`Restarting ffplay with new effects at position ${currentOffset}ms`);
                        }
                        // Force kill the process - use Windows-specific method
                        try {
                            if (process.platform === 'win32') {
                                killProcessWindows(p.pid);
                            } else {
                                p.kill('SIGTERM');
                                setTimeout(() => {
                                    if (!p.killed) {
                                        p.kill('SIGKILL');
                                    }
                                }, 100);
                            }
                        } catch (e) {
                            // Process might already be dead
                        }
                    }
                };
                
                Object.keys(handlers).forEach(e =>
                    playbackController.once(e, handlers[e])
                );
                
                p.on('close', (code) => {
                    Object.keys(handlers).forEach(e =>
                        playbackController.removeListener(e, handlers[e])
                    );
                    
                    if (killed) {
                        if (killReason === 'paused') {
                            resPlay('paused');
                        } else if (killReason === 'seek' || killReason === 'effects') {
                            resPlay(killReason);
                        } else {
                            resPlay('skipped');
                        }
                    } else {
                        resPlay('finished');
                    }
                });
            });
            
            if (result === 'seek' || result === 'effects') {
                continue;
            }
            
            if (result === 'finished' || result === 'skipped') {
                finished = true;
                playbackController.emit(PLAYBACK_FINISHED, { filePath, reason: result === 'skipped' ? 'skipped' : 'ended' });
            }
        }
        
        stopFfplay();
        resolve();
    });
}

/**
 * Play file (event-driven entry point)
 */
async function playFile(filePath, startOffset = 0) {
    const playbackController = require('./playback.controller');
    
    const backend = detectBackend();
    
    if (!backend) {
        const error = new Error('No audio backend available. Please install mpv or ffmpeg.');
        logger.error('Playback error:', error);
        playbackController.emit(PLAYBACK_ERROR, { filePath, error });
        throw error;
    }
    
    try {
        if (audioBackend === 'mpv') {
            await playFileWithMpv(filePath, startOffset);
        } else {
            await playFileWithFfplay(filePath, startOffset);
        }
    } catch (error) {
        logger.error('Playback error:', error);
        playbackController.emit(PLAYBACK_ERROR, { filePath, error });
        throw error;
    }
}

// ============================================
// EVENT LISTENERS SETUP
// ============================================

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
    const playbackController = require('./playback.controller');

    // Listen for playback requests from PlaybackController
    playbackController.on(PLAYBACK_REQUESTED, ({ filePath, startOffset = 0 }) => {
        playFile(filePath, startOffset).catch(err => {
            logger.error('Failed to play file:', err);
            playbackController.emit(PLAYBACK_ERROR, { filePath, error: err });
        });
    });

    // Listen for effects changes (global listener that works even if per-playback listeners aren't set up)
    // For MPV: Seamlessly updates filters via IPC
    // For ffplay: Restarts playback with new filters
    playbackController.on(EFFECTS_CHANGED, () => {
        if (audioBackend === 'mpv' && ipcSocket && !ipcSocket.destroyed) {
            // MPV: Apply effects seamlessly via IPC
            updateMpvFilters().catch(err => {
                logger.error('Failed to update MPV filters via global listener:', err);
            });
        } else if (audioBackend === 'ffplay' && ffplayProcess && !ffplayProcess.killed) {
            logger.info('Effects changed while ffplay is running - restarting with new filters');
            // Kill current ffplay process - it will restart automatically if in playback loop
            stopFfplay();
        }
    });
}

// Initialize on module load
initializeEventListeners();

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
    playFile,
    getEffects,
    getPresets,
    getBackend,
    updateFilters,
    pausePlayback,
    resumePlayback,
    seekTo,
    getPosition,
    stopMpv,
    stopFfplay,
    setVolume,
    getVolume
};
