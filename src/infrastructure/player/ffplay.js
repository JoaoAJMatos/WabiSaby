const { spawn, execSync } = require('child_process');
const PlayerAdapter = require('./adapter');
const { logger } = require('../../utils/logger.util');
const effectsService = require('../../services/audio/effects.service');
const { getFFplayPath } = require('../../utils/dependencies.util');
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
 * FFplay Player Implementation
 * 
 * Fallback player using ffplay. Effects changes require restarting playback.
 */
class FfplayPlayer extends PlayerAdapter {
    constructor() {
        super();
        this.process = null;
        this.currentFilePath = null;
        this.isPlayingState = false;
        this.currentVolume = 100;
    }

    /**
     * Forcefully kill a process on Windows
     */
    killProcessWindows(pid) {
        if (process.platform === 'win32') {
            try {
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 1000 });
            } catch (e) {
                // Process might already be dead, ignore
            }
        }
    }

    /**
     * Build ffplay arguments with audio effects filter chain
     */
    buildArgs(filePath, startTimeOffset = 0) {
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
    startProcess(filePath, startTimeOffset = 0) {
        const args = this.buildArgs(filePath, startTimeOffset);
        const ffplayBinary = getFFplayPath();

        logger.info(`Starting ffplay: ${ffplayBinary} ${args.slice(0, 5).join(' ')} ...`);

        this.process = spawn(ffplayBinary, args);
        this.currentFilePath = filePath;
        this.isPlayingState = true;

        this.process.on('error', (err) => {
            logger.error('ffplay error:', err);
        });

        return this.process;
    }

    /**
     * Play file with ffplay backend (event-driven)
     */
    async play(filePath, startOffset = 0) {
        // Emit playback started via bus
        eventBus.emit(PLAYBACK_STARTED, { filePath });

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
                                eventBus.removeListener(e, handlers[e])
                            );
                        };

                        handlers[PLAYBACK_RESUME] = () => { cleanup(); r('resume'); };
                        handlers[PLAYBACK_SKIP] = () => { cleanup(); r('skip'); };
                        handlers[PLAYBACK_SEEK] = () => { cleanup(); r('seek'); };
                        handlers[EFFECTS_CHANGED] = () => { cleanup(); r('effects'); };

                        Object.keys(handlers).forEach(e =>
                            eventBus.once(e, handlers[e])
                        );
                    });

                    if (pauseResult === 'skip') {
                        finished = true;
                        this.stop();
                        break;
                    }

                    if (pauseResult === 'seek') {
                        continue;
                    }

                    if (pauseResult === 'effects') {
                        logger.info(`Effects changed while paused, restarting at position ${currentOffset}ms`);
                        continue;
                    }

                    if (pauseResult === 'resume') {
                        isPaused = false;
                        pauseStartTime = null;
                        playbackStartTime = null;
                    }
                }

                // Start ffplay
                const result = await new Promise((resPlay) => {
                    playbackStartTime = Date.now();
                    pauseStartTime = null;
                    const p = this.startProcess(filePath, currentOffset);
                    let killed = false;
                    let killReason = null;

                    const handlers = {
                        [PLAYBACK_PAUSE]: () => {
                            killed = true;
                            killReason = 'paused';
                            isPaused = true;
                            pauseStartTime = Date.now();
                            if (playbackStartTime) {
                                const elapsed = Date.now() - playbackStartTime;
                                currentOffset = currentOffset + elapsed;
                                logger.info(`Paused at position ${currentOffset}ms`);
                                playbackStartTime = null;
                            }
                            try {
                                if (process.platform === 'win32') {
                                    this.killProcessWindows(p.pid);
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
                            try {
                                if (process.platform === 'win32') {
                                    this.killProcessWindows(p.pid);
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
                            try {
                                if (process.platform === 'win32') {
                                    this.killProcessWindows(p.pid);
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
                            if (playbackStartTime) {
                                const elapsed = Date.now() - playbackStartTime;
                                currentOffset = currentOffset + elapsed;
                                logger.info(`Restarting ffplay with new effects at position ${currentOffset}ms`);
                            } else {
                                logger.info(`Restarting ffplay with new effects at position ${currentOffset}ms`);
                            }
                            try {
                                if (process.platform === 'win32') {
                                    this.killProcessWindows(p.pid);
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
                        eventBus.once(e, handlers[e])
                    );

                    p.on('close', (code) => {
                        Object.keys(handlers).forEach(e =>
                            eventBus.removeListener(e, handlers[e])
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
                    eventBus.emit(PLAYBACK_FINISHED, { filePath, reason: result === 'skipped' ? 'skipped' : 'ended' });
                }
            }

            this.stop();
            resolve();
        });
    }

    /**
     * Stop ffplay
     */
    async stop() {
        if (this.process) {
            const pid = this.process.pid;
            if (process.platform === 'win32') {
                try {
                    this.killProcessWindows(pid);
                } catch (err) {
                    logger.debug('ffplay process termination error:', err.message);
                }
            } else {
                try {
                    this.process.kill('SIGTERM');
                    setTimeout(() => {
                        if (this.process && !this.process.killed) {
                            this.process.kill('SIGKILL');
                        }
                    }, 100);
                } catch (err) {
                    logger.debug('ffplay process termination error:', err.message);
                }
            }
            this.process = null;
        }
        this.isPlayingState = false;
        this.currentFilePath = null;
    }

    /**
     * Pause playback (not supported by ffplay, handled by killing process)
     */
    async pause() {
        // Pause is handled by killing the process in the play() method
        // This method exists for API compatibility
    }

    /**
     * Resume playback (not supported by ffplay, handled by restarting process)
     */
    async resume() {
        // Resume is handled by restarting the process in the play() method
        // This method exists for API compatibility
    }

    /**
     * Seek to position (not supported by ffplay, handled by restarting process)
     */
    async seek(positionMs) {
        // Seek is handled by restarting the process in the play() method
        // This method exists for API compatibility
    }

    /**
     * Get current playback position (not supported by ffplay)
     */
    async getPosition() {
        return 0;
    }

    /**
     * Set volume (0-100)
     * Note: Volume will be applied via filter chain on next playback
     */
    async setVolume(volume) {
        this.currentVolume = Math.max(0, Math.min(100, volume));
        logger.info(`Volume set to ${this.currentVolume}% (will apply on next playback)`);
    }

    /**
     * Get current volume
     */
    getVolume() {
        return this.currentVolume;
    }

    /**
     * Update audio filters (requires restart for ffplay)
     * This is handled by the effects_changed event in the play() method
     */
    async updateFilters() {
        // For ffplay, effects_changed event will trigger a restart (handled in play)
        // This method exists for API compatibility
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
        return 'ffplay';
    }

    /**
     * Get current file path (for global skip handler)
     */
    getCurrentFilePath() {
        return this.currentFilePath;
    }
}

module.exports = FfplayPlayer;

