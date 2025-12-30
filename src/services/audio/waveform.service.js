/**
 * Waveform Generation Service
 * Generates waveform data from audio files using ffmpeg for visualization
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../../utils/logger.util');

// Cache directory for waveform data
const WAVEFORM_CACHE_DIR = path.join(process.cwd(), 'dev-storage', 'temp', 'waveforms');

// Ensure cache directory exists
if (!fs.existsSync(WAVEFORM_CACHE_DIR)) {
    fs.mkdirSync(WAVEFORM_CACHE_DIR, { recursive: true });
}

/**
 * Generate a cache key from file path or URL
 * @param {string} source - File path or URL
 * @returns {string} Cache key (hash)
 */
function generateCacheKey(source) {
    return crypto.createHash('md5').update(source).digest('hex');
}

/**
 * Get cached waveform data if available
 * @param {string} source - File path or URL
 * @returns {Object|null} Cached waveform data or null
 */
function getCachedWaveform(source) {
    const cacheKey = generateCacheKey(source);
    const cachePath = path.join(WAVEFORM_CACHE_DIR, `${cacheKey}.json`);

    if (fs.existsSync(cachePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            logger.debug(`Waveform cache hit: ${cacheKey}`);
            return data;
        } catch (error) {
            logger.warn(`Failed to read cached waveform: ${error.message}`);
            // Delete corrupted cache file
            try { fs.unlinkSync(cachePath); } catch {}
        }
    }
    return null;
}

/**
 * Save waveform data to cache
 * @param {string} source - File path or URL
 * @param {Object} data - Waveform data
 */
function cacheWaveform(source, data) {
    const cacheKey = generateCacheKey(source);
    const cachePath = path.join(WAVEFORM_CACHE_DIR, `${cacheKey}.json`);

    try {
        fs.writeFileSync(cachePath, JSON.stringify(data));
        logger.debug(`Waveform cached: ${cacheKey}`);
    } catch (error) {
        logger.warn(`Failed to cache waveform: ${error.message}`);
    }
}

/**
 * Get audio duration using ffprobe
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number>} Duration in seconds
 */
async function getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);

        let stdout = '';
        let stderr = '';

        ffprobe.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffprobe failed: ${stderr}`));
                return;
            }
            const duration = parseFloat(stdout.trim());
            if (isNaN(duration)) {
                reject(new Error('Could not parse audio duration'));
                return;
            }
            resolve(duration);
        });

        ffprobe.on('error', (err) => {
            reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
        });
    });
}

/**
 * Generate waveform data from audio file
 * Uses ffmpeg to extract amplitude data at regular intervals
 *
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Generation options
 * @param {number} options.samplesPerSecond - Samples per second (default: 100)
 * @param {number} options.channels - Downmix to this many channels (default: 1 for mono)
 * @returns {Promise<Object>} Waveform data with samples and metadata
 */
async function generateWaveform(filePath, options = {}) {
    const { samplesPerSecond = 100, channels = 1 } = options;

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        throw new Error(`Audio file not found: ${filePath}`);
    }

    // Check cache first
    const cached = getCachedWaveform(filePath);
    if (cached) {
        return cached;
    }

    logger.info(`Generating waveform for: ${filePath}`);
    const startTime = Date.now();

    try {
        // Get audio duration first
        const duration = await getAudioDuration(filePath);
        const totalSamples = Math.ceil(duration * samplesPerSecond);

        // Use ffmpeg to extract audio samples
        // -filter_complex creates a chain that:
        // 1. Downmixes to mono (or specified channels)
        // 2. Resamples to our target sample rate
        // 3. Outputs raw 16-bit signed PCM
        const samples = await extractAmplitudeSamples(filePath, duration, samplesPerSecond, channels);

        const waveformData = {
            duration,
            sampleRate: samplesPerSecond,
            samples,
            generatedAt: Date.now(),
            source: filePath
        };

        // Cache the result
        cacheWaveform(filePath, waveformData);

        const elapsed = Date.now() - startTime;
        logger.info(`Waveform generated in ${elapsed}ms: ${samples.length} samples for ${duration.toFixed(2)}s audio`);

        return waveformData;
    } catch (error) {
        logger.error(`Waveform generation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Extract amplitude samples from audio file using ffmpeg
 * @param {string} filePath - Path to audio file
 * @param {number} duration - Audio duration in seconds
 * @param {number} samplesPerSecond - Target samples per second
 * @param {number} channels - Number of channels (1 for mono)
 * @returns {Promise<number[]>} Array of normalized amplitude values (0-1)
 */
async function extractAmplitudeSamples(filePath, duration, samplesPerSecond, channels) {
    return new Promise((resolve, reject) => {
        // Calculate the target sample rate for our waveform visualization
        // We want samplesPerSecond samples per second of audio
        const targetSampleRate = samplesPerSecond;

        // Use ffmpeg to extract audio as raw PCM samples
        const ffmpeg = spawn('ffmpeg', [
            '-i', filePath,
            '-ac', String(channels),        // Downmix to mono
            '-ar', String(targetSampleRate), // Resample to target rate
            '-f', 's16le',                  // 16-bit signed little-endian PCM
            '-acodec', 'pcm_s16le',
            'pipe:1'                        // Output to stdout
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        const chunks = [];

        ffmpeg.stdout.on('data', (data) => {
            chunks.push(data);
        });

        let stderr = '';
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffmpeg failed with code ${code}: ${stderr.substring(0, 500)}`));
                return;
            }

            try {
                // Combine all chunks into a single buffer
                const buffer = Buffer.concat(chunks);

                // Parse 16-bit samples and normalize to 0-1 range
                const samples = [];
                const bytesPerSample = 2; // 16-bit = 2 bytes
                const sampleCount = Math.floor(buffer.length / bytesPerSample);

                for (let i = 0; i < sampleCount; i++) {
                    // Read 16-bit signed integer
                    const sample = buffer.readInt16LE(i * bytesPerSample);
                    // Normalize to 0-1 (absolute value, scaled by max 16-bit value)
                    const normalized = Math.abs(sample) / 32768;
                    samples.push(normalized);
                }

                // Apply smoothing by averaging nearby samples
                const smoothedSamples = smoothSamples(samples, 3);

                resolve(smoothedSamples);
            } catch (parseError) {
                reject(new Error(`Failed to parse audio samples: ${parseError.message}`));
            }
        });

        ffmpeg.on('error', (err) => {
            reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
        });
    });
}

/**
 * Apply simple moving average smoothing to samples
 * @param {number[]} samples - Raw samples
 * @param {number} windowSize - Smoothing window size
 * @returns {number[]} Smoothed samples
 */
function smoothSamples(samples, windowSize) {
    if (windowSize <= 1) return samples;

    const smoothed = [];
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < samples.length; i++) {
        let sum = 0;
        let count = 0;

        for (let j = -halfWindow; j <= halfWindow; j++) {
            const idx = i + j;
            if (idx >= 0 && idx < samples.length) {
                sum += samples[idx];
                count++;
            }
        }

        smoothed.push(sum / count);
    }

    return smoothed;
}

/**
 * Clear waveform cache for a specific source
 * @param {string} source - File path or URL
 */
function clearWaveformCache(source) {
    const cacheKey = generateCacheKey(source);
    const cachePath = path.join(WAVEFORM_CACHE_DIR, `${cacheKey}.json`);

    if (fs.existsSync(cachePath)) {
        try {
            fs.unlinkSync(cachePath);
            logger.debug(`Waveform cache cleared: ${cacheKey}`);
        } catch (error) {
            logger.warn(`Failed to clear waveform cache: ${error.message}`);
        }
    }
}

/**
 * Clear all waveform cache
 */
function clearAllWaveformCache() {
    try {
        const files = fs.readdirSync(WAVEFORM_CACHE_DIR);
        for (const file of files) {
            if (file.endsWith('.json')) {
                fs.unlinkSync(path.join(WAVEFORM_CACHE_DIR, file));
            }
        }
        logger.info('All waveform cache cleared');
    } catch (error) {
        logger.warn(`Failed to clear waveform cache: ${error.message}`);
    }
}

module.exports = {
    generateWaveform,
    getCachedWaveform,
    clearWaveformCache,
    clearAllWaveformCache,
    getAudioDuration
};
