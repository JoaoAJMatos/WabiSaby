const { spawn } = require('child_process');
const { logger } = require('../../utils/logger.util');

/**
 * Audio Analysis Service
 * Analyzes audio files to determine their volume levels using ffmpeg
 */

/**
 * Analyze audio file to get RMS level in dB
 * Uses ffmpeg's volumedetect filter to analyze the audio
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number>} RMS level in dB (typically negative, e.g., -20.5)
 */
async function analyzeAudioLevel(filePath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', filePath,
            '-af', 'volumedetect',
            '-f', 'null',
            '-'
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        
        let stderr = '';
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        ffmpeg.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffmpeg analysis failed with code ${code}`));
                return;
            }
            
            // Parse RMS level from output
            // Example output line: "mean_volume: -20.5 dB"
            const rmsMatch = stderr.match(/mean_volume:\s*(-?\d+\.?\d*)\s*dB/);
            if (rmsMatch) {
                const rmsDb = parseFloat(rmsMatch[1]);
                logger.debug(`Audio analysis: ${filePath} RMS = ${rmsDb} dB`);
                resolve(rmsDb);
                return;
            }
            
            // Fallback: try to get max_volume if mean_volume not found
            const maxMatch = stderr.match(/max_volume:\s*(-?\d+\.?\d*)\s*dB/);
            if (maxMatch) {
                const maxDb = parseFloat(maxMatch[1]);
                // Estimate RMS as max - 6dB (rough approximation for typical audio)
                const estimatedRms = maxDb - 6;
                logger.debug(`Audio analysis: ${filePath} (estimated RMS from max) = ${estimatedRms} dB`);
                resolve(estimatedRms);
                return;
            }
            
            reject(new Error('Could not parse audio level from ffmpeg output. Output: ' + stderr.substring(0, 500)));
        });
        
        ffmpeg.on('error', (err) => {
            reject(new Error(`Failed to spawn ffmpeg process: ${err.message}`));
        });
    });
}

module.exports = {
    analyzeAudioLevel
};

