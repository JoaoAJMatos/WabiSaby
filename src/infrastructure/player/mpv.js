const EventEmitter = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const os = require('os');
const PlayerAdapter = require('./adapter');
const config = require('../../config');
const { logger } = require('../../utils/logger.util');
const effectsService = require('../../services/audio/effects.service');
const { eventBus } = require('../../events');
const {
    PLAYBACK_STARTED,
    PLAYBACK_FINISHED,
    PLAYBACK_PAUSE,
    PLAYBACK_RESUME,
    PLAYBACK_SEEK,
    PLAYBACK_SKIP,
    EFFECTS_CHANGED
} = require('../../events');

/**
 * MPV Player Implementation
 * 
 * Provides seamless audio effects via MPV IPC.
 */
class MpvPlayer extends PlayerAdapter {
    constructor() {
        super();
        this.process = null;
        this.ipcSocket = null;
        this.ipcSocketPath = null;
        this.requestId = 1;
        this.pendingRequests = new Map();
        this.currentFilePath = null;
        this.isPlayingState = false;
        this.currentVolume = 100;
        this.playerEvents = new EventEmitter();
    }

    /**
     * Generate unique IPC socket path for MPV
     */
    getSocketPath() {
        const IS_WINDOWS = os.platform() === 'win32';
        if (IS_WINDOWS) {
            return `mpv-socket-${process.pid}`;
        } else {
            return path.join(config.paths.temp, `mpv-socket-${process.pid}`);
        }
    }

    /**
     * Send command to MPV via IPC
     */
    sendCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.ipcSocket || this.ipcSocket.destroyed) {
                reject(new Error('IPC socket not connected'));
                return;
            }

            const id = this.requestId++;
            const message = JSON.stringify({ command, request_id: id }) + '\n';

            this.pendingRequests.set(id, { resolve, reject });

            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('MPV command timeout'));
                }
            }, 5000);

            this.ipcSocket.write(message);
        });
    }

    /**
     * Connect to MPV IPC socket
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (!this.ipcSocketPath) {
                reject(new Error('No socket path'));
                return;
            }

            const IS_WINDOWS = os.platform() === 'win32';
            let retries = 0;
            const maxRetries = IS_WINDOWS ? 50 : 20;
            const retryDelay = IS_WINDOWS ? 150 : 100;

            const tryConnect = () => {
                if (!this.process || this.process.killed) {
                    reject(new Error('MPV process is not running'));
                    return;
                }

                const connectionPath = IS_WINDOWS
                    ? `\\\\.\\pipe\\${this.ipcSocketPath}`
                    : this.ipcSocketPath;

                this.ipcSocket = net.createConnection(connectionPath);

                this.ipcSocket.on('connect', () => {
                    logger.info('Connected to MPV IPC socket');

                    let buffer = '';
                    this.ipcSocket.on('data', (data) => {
                        buffer += data.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const msg = JSON.parse(line);

                                if (msg.request_id && this.pendingRequests.has(msg.request_id)) {
                                    const { resolve, reject } = this.pendingRequests.get(msg.request_id);
                                    this.pendingRequests.delete(msg.request_id);
                                    if (msg.error && msg.error !== 'success') {
                                        reject(new Error(msg.error));
                                    } else {
                                        resolve(msg.data);
                                    }
                                }

                                if (msg.event === 'end-file') {
                                    logger.info('MPV: File ended');
                                    this.playerEvents.emit('mpv_file_ended', msg.reason);
                                }
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                    });

                    resolve();
                });

                this.ipcSocket.on('error', (err) => {
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

            const initialDelay = IS_WINDOWS ? 200 : 50;
            setTimeout(tryConnect, initialDelay);
        });
    }

    /**
     * Start MPV process with IPC
     */
    async startProcess(filePath, startTimeOffset = 0) {
        const IS_WINDOWS = os.platform() === 'win32';
        this.ipcSocketPath = this.getSocketPath();

        if (!IS_WINDOWS && fs.existsSync(this.ipcSocketPath)) {
            try {
                fs.unlinkSync(this.ipcSocketPath);
            } catch (err) {
                logger.debug(`Could not remove old socket file: ${err.message}`);
            }
        }

        const args = [
            '--no-video',
            '--no-terminal',
            '--audio-display=no',
            `--input-ipc-server=${this.ipcSocketPath}`,
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

        this.process = spawn('mpv', args, { stdio: ['pipe', 'pipe', 'pipe'] });

        this.process.stderr.on('data', (data) => {
            const output = data.toString().trim();
            if (output && !output.includes('AO:') && !output.includes('Audio:')) {
                logger.debug(`MPV: ${output}`);
            }
        });

        this.process.on('error', (err) => {
            logger.error('MPV process error:', err);
        });

        this.currentFilePath = filePath;
        this.isPlayingState = true;

        await this.connect();

        // Load and apply volume from database after connecting
        try {
            const dbService = require('../database/db.service');
            const savedVolume = dbService.getSetting('volume');
            if (savedVolume !== null) {
                this.currentVolume = savedVolume;
                await this.sendCommand(['set_property', 'volume', this.currentVolume]);
                logger.info(`Applied saved volume: ${this.currentVolume}%`);
            }
        } catch (err) {
            logger.debug('Could not load volume from database, using default:', err.message);
        }
    }

    /**
     * Play file with MPV backend (event-driven)
     */
    async play(filePath, startOffset = 0) {
        // Ensure any previous MPV process is fully stopped before starting new one
        await this.stop();

        await this.startProcess(filePath, startOffset);

        // Verify socket is connected before proceeding
        if (!this.ipcSocket || this.ipcSocket.destroyed) {
            throw new Error('Failed to establish MPV IPC connection');
        }

        // Emit playback started via bus
        eventBus.emit(PLAYBACK_STARTED, { filePath });

        // Set up event handlers
        const effectsHandler = () => {
            if (this.ipcSocket && !this.ipcSocket.destroyed) {
                this.updateFilters().catch(err => {
                    logger.error('Failed to update MPV filters:', err);
                });
            }
        };
        const pauseHandler = async () => {
            if (this.ipcSocket && !this.ipcSocket.destroyed) {
                await this.pause();
            } else {
                logger.warn('Cannot pause: MPV socket not ready');
            }
        };
        const resumeHandler = async () => {
            if (this.ipcSocket && !this.ipcSocket.destroyed) {
                await this.resume();
            } else {
                logger.warn('Cannot resume: MPV socket not ready');
            }
        };
        const seekHandler = async ({ positionMs }) => {
            if (this.ipcSocket && !this.ipcSocket.destroyed) {
                await this.seek(positionMs);
            } else {
                logger.warn('Cannot seek: MPV socket not ready');
            }
        };

        // Wait for playback to finish
        await new Promise((resolve) => {
            let finished = false;
            const currentProcess = this.process;

            const cleanup = () => {
                eventBus.removeListener(EFFECTS_CHANGED, effectsHandler);
                eventBus.removeListener(PLAYBACK_PAUSE, pauseHandler);
                eventBus.removeListener(PLAYBACK_RESUME, resumeHandler);
                eventBus.removeListener(PLAYBACK_SEEK, seekHandler);
                eventBus.removeListener(PLAYBACK_SKIP, skipHandler);
                this.playerEvents.removeListener('mpv_file_ended', fileEndHandler);
                if (currentProcess) {
                    currentProcess.removeListener('close', processCloseHandler);
                }
            };

            const handleFinished = async (source, reason, skipReason = 'ended') => {
                if (finished) {
                    logger.debug(`Playback finish already handled (ignoring ${source})`);
                    return;
                }
                finished = true;
                logger.info(`Playback ended: ${reason} (${source})`);
                cleanup();

                await this.stop();

                eventBus.emit(PLAYBACK_FINISHED, { filePath, reason: skipReason });
                resolve();
            };

            const processCloseHandler = (code) => {
                if (this.process === currentProcess) {
                    logger.info(`MPV exited with code ${code}`);
                    handleFinished('process_close', `exit code ${code}`);
                } else {
                    logger.debug(`Ignoring close event from old MPV process (current process: ${this.process?.pid}, closed process: ${currentProcess?.pid})`);
                }
            };

            const fileEndHandler = (reason) => {
                handleFinished('mpv_file_ended', reason);
            };

            const skipHandler = async () => {
                if (!finished) {
                    finished = true;
                    cleanup();
                    resolve();
                }
            };

            eventBus.on(EFFECTS_CHANGED, effectsHandler);
            eventBus.on(PLAYBACK_PAUSE, pauseHandler);
            eventBus.on(PLAYBACK_RESUME, resumeHandler);
            eventBus.on(PLAYBACK_SEEK, seekHandler);
            eventBus.on(PLAYBACK_SKIP, skipHandler);

            this.playerEvents.on('mpv_file_ended', fileEndHandler);

            if (currentProcess) {
                currentProcess.on('close', processCloseHandler);
            }
        });
    }

    /**
     * Stop MPV and cleanup
     */
    async stop() {
        if (this.ipcSocket && !this.ipcSocket.destroyed) {
            try {
                await this.sendCommand(['quit']);
            } catch (e) { }
            this.ipcSocket.destroy();
            this.ipcSocket = null;
        }

        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }

        if (this.ipcSocketPath && fs.existsSync(this.ipcSocketPath)) {
            try { fs.unlinkSync(this.ipcSocketPath); } catch (e) { }
        }

        this.isPlayingState = false;
        this.currentFilePath = null;
        this.pendingRequests.clear();
    }

    /**
     * Pause playback
     */
    async pause() {
        if (this.ipcSocket && !this.ipcSocket.destroyed) {
            try {
                await this.sendCommand(['set_property', 'pause', true]);
                this.isPlayingState = false;
                logger.info('Paused');
            } catch (err) {
                logger.error('Failed to pause:', err);
            }
        }
    }

    /**
     * Resume playback
     */
    async resume() {
        if (this.ipcSocket && !this.ipcSocket.destroyed) {
            try {
                await this.sendCommand(['set_property', 'pause', false]);
                this.isPlayingState = true;
                logger.info('Resumed');
            } catch (err) {
                logger.error('Failed to resume:', err);
            }
        }
    }

    /**
     * Seek to position
     */
    async seek(positionMs) {
        if (this.ipcSocket && !this.ipcSocket.destroyed) {
            try {
                await this.sendCommand(['seek', positionMs / 1000, 'absolute']);
                logger.info(`Seeked to ${positionMs}ms`);
            } catch (err) {
                logger.error('Failed to seek:', err);
            }
        }
    }

    /**
     * Get current playback position
     */
    async getPosition() {
        if (this.ipcSocket && !this.ipcSocket.destroyed) {
            try {
                const pos = await this.sendCommand(['get_property', 'time-pos']);
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
    async setVolume(volume) {
        this.currentVolume = Math.max(0, Math.min(100, volume));

        if (this.ipcSocket && !this.ipcSocket.destroyed) {
            try {
                await this.sendCommand(['set_property', 'volume', this.currentVolume]);
                logger.info(`Volume set to ${this.currentVolume}%`);
            } catch (err) {
                logger.error('Failed to set volume:', err);
            }
        }
    }

    /**
     * Get current volume
     */
    getVolume() {
        return this.currentVolume;
    }

    /**
     * Update audio filters seamlessly via MPV IPC
     */
    async updateFilters() {
        if (!this.ipcSocket || this.ipcSocket.destroyed) {
            logger.warn('Cannot update filters: MPV not connected');
            return;
        }

        const filterChain = effectsService.buildFilterChain();

        try {
            if (filterChain) {
                await this.sendCommand(['set_property', 'af', `lavfi=[${filterChain}]`]);
                logger.info(`✨ Seamlessly applied effects: ${filterChain}`);
            } else {
                await this.sendCommand(['set_property', 'af', '']);
                logger.info('Cleared all audio effects');
            }
        } catch (err) {
            logger.error('Failed to update filters:', err);
        }
    }

    /**
     * Check if playback is currently active
     */
    isPlaying() {
        return this.isPlayingState;
    }

    /**
     * Get the name of this backend
     */
    getName() {
        return 'mpv';
    }

    /**
     * Get current file path (for global skip handler)
     */
    getCurrentFilePath() {
        return this.currentFilePath;
    }

    /**
     * Check if IPC socket is connected
     */
    isSocketConnected() {
        return this.ipcSocket && !this.ipcSocket.destroyed;
    }
}

module.exports = MpvPlayer;

