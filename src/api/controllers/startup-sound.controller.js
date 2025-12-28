const { logger } = require('../../utils/logger.util');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { isCommandAvailable } = require('../../infrastructure/player/detection');
const { isFFplayAvailable } = require('../../utils/dependencies.util');

/**
 * Startup Sound Controller
 * Plays the startup sound on the backend using MPV/ffplay
 */

let startupSoundPlayed = false;

/**
 * Play startup sound on backend
 * POST /api/startup-sound/play
 */
async function playStartupSound(req, res) {
    // Only play once per server session
    if (startupSoundPlayed) {
        return res.json({ success: true, message: 'Startup sound already played' });
    }

    const soundPath = path.join(process.cwd(), 'public', 'assets', 'startup-sound.mp3');
    
    try {
        // Check if sound file exists
        if (!fs.existsSync(soundPath)) {
            logger.warn(`Startup sound file not found: ${soundPath}`);
            return res.status(404).json({ success: false, error: 'Startup sound file not found' });
        }

        // Detect available backend
        let command, args;
        if (isCommandAvailable('mpv')) {
            command = 'mpv';
            args = [
                '--no-video',
                '--no-terminal',
                '--audio-display=no',
                '--volume=50', // 50% volume
                soundPath
            ];
        } else if (isFFplayAvailable()) {
            command = 'ffplay';
            args = [
                '-nodisp',
                '-autoexit',
                '-volume', '50', // 50% volume
                '-loglevel', 'quiet',
                soundPath
            ];
        } else {
            logger.warn('No audio backend available for startup sound');
            return res.status(503).json({ 
                success: false, 
                error: 'No audio backend available' 
            });
        }

        // Spawn process to play sound
        const process = spawn(command, args, { 
            stdio: 'ignore', // Suppress output
            detached: true // Don't wait for it to finish
        });

        // Don't wait for the process - let it play in background
        process.unref();

        // Mark as played
        startupSoundPlayed = true;

        logger.info('✓ Startup sound playing on backend');
        res.json({ success: true, message: 'Startup sound playing' });

    } catch (error) {
        logger.error('Error playing startup sound:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = {
    playStartupSound
};

