const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { logger } = require('../../utils/logger.util');
const config = require('../../config');
const { getYtDlpPath } = require('../../utils/dependencies.util');

/**
 * YouTube Download Service
 * Handles downloading audio from YouTube URLs using yt-dlp
 */

/**
 * Downloads audio from YouTube using yt-dlp command line tool
 * @param {string} url - The YouTube URL to download
 * @param {string} outputPath - The output path for audio
 * @param {string} title - The track title (for thumbnail naming)
 * @param {function} progressCallback - Optional callback for progress updates
 * @returns {Promise<{audioPath: string, thumbnailPath: string|null}>}
 */
async function downloadFromYouTube(url, outputPath, title = '', progressCallback = null) {
    const downloadLogger = logger.child({
        component: 'download',
        context: {
            source: 'youtube',
            url,
            title,
            outputPath
        }
    });
    
    const downloadStartTime = Date.now();
    
    try {
        downloadLogger.info({
            context: {
                event: 'download_started',
                format: config.download.audioFormat,
                quality: config.download.audioQuality
            }
        }, 'Starting YouTube download');

        // Validate URL
        if (!url || !url.startsWith('http')) {
            throw new Error(`Invalid URL provided: ${url}`);
        }

        // Validate the YouTube URL using play-dl's validation (use cache)
        downloadLogger.debug('Validating YouTube URL');
        const play = require('play-dl');
        const { youtubeCache } = require('../cache');

        let validated = youtubeCache.getValidation(url);
        if (!validated) {
            validated = play.yt_validate(url);
            youtubeCache.setValidation(url, validated);
        }
        downloadLogger.debug({
            context: { validationResult: validated }
        }, 'URL validation completed');

        if (validated !== 'video') {
            downloadLogger.error({
                context: {
                    event: 'validation_failed',
                    validationResult: validated
                }
            }, `URL is not a valid YouTube video: ${url}`);
            throw new Error(`URL is not a valid YouTube video: ${url} (type: ${validated})`);
        }

        // Get thumbnail path in organized thumbnails directory
        const thumbnailPath = config.download.downloadThumbnails
            ? config.getThumbnailPath(title, url)
            : null;

        // Use yt-dlp via command line
        logger.info(`[YouTube Download] Attempting download with yt-dlp...`);

        return new Promise((resolve, reject) => {
            // Build yt-dlp command with config options
            let thumbnailFlags = '';
            if (config.download.downloadThumbnails && thumbnailPath) {
                // Download thumbnail and convert to desired format
                // Note: yt-dlp will save thumbnail next to audio file, we'll move it later
                thumbnailFlags = `--write-thumbnail --convert-thumbnails ${config.download.thumbnailFormat}`;
            }

            const audioOutputTemplate = outputPath.replace(`.${config.download.audioFormat}`, '') + `.%(ext)s`;
            const ytDlpBinary = getYtDlpPath();
            // Use --newline to ensure each progress line is on a new line
            // Progress is output to stderr by default, so we'll parse both stdout and stderr
            const ytDlpCmd = `"${ytDlpBinary}" -x --audio-format ${config.download.audioFormat} --audio-quality ${config.download.audioQuality} ${thumbnailFlags} --newline --progress --extractor-args "youtube:player_client=${config.download.playerClient}" -o "${audioOutputTemplate}" "${url}"`;
            logger.info(`[YouTube Download] Running: ${ytDlpCmd}`);

            const process = exec(ytDlpCmd);
            let stderrOutput = '';
            let stdoutBuffer = '';
            let stderrBuffer = '';
            let lastProgressPercent = 0;

            // Helper function to parse progress from a line
            const parseProgressLine = (line) => {
                // Try multiple progress formats
                // Format 1: [download]  45.3% of 3.24MiB at 1.23MiB/s ETA 00:02
                // Format 2: [download] 1234567/3456789 35.7% 1.23MiB/s ETA 00:02
                // Format 3: [download] 100% of 3.24MiB
                // Format 4: [download] Downloading video 1 of 1
                let progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
                if (!progressMatch) {
                    // Try format with bytes: [download] 1234567/3456789 35.7%
                    progressMatch = line.match(/\[download\]\s+\d+\/\d+\s+(\d+\.?\d*)%/);
                }
                if (!progressMatch) {
                    // Try format: [download] 100%
                    progressMatch = line.match(/\[download\]\s+(\d+)%/);
                }
                if (!progressMatch) {
                    // Try format with spaces: [download]   45.3%
                    progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)\s*%/);
                }

                if (progressMatch) {
                    const percent = parseFloat(progressMatch[1]);
                    // Only update if progress actually increased (avoid duplicates/jumps backwards)
                    // Allow small backwards jumps (up to 1%) to handle rounding differences
                    if (percent >= lastProgressPercent - 1) {
                        // Only log significant progress changes to avoid spam
                        if (Math.abs(percent - lastProgressPercent) > 0.5) {
                            logger.debug(`[YouTube Download] Progress: ${lastProgressPercent.toFixed(1)}% -> ${percent.toFixed(1)}%`);
                        }
                        lastProgressPercent = percent;
                        return percent;
                    } else {
                        logger.debug(`[YouTube Download] Ignoring backwards progress jump: ${lastProgressPercent.toFixed(1)}% -> ${percent.toFixed(1)}%`);
                    }
                }
                return null;
            };

            // Helper function to process buffered output line by line
            const processBuffer = (buffer, isStderr) => {
                const lines = buffer.split('\n');
                // Keep the last incomplete line in buffer
                const newBuffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    // Parse progress from this line
                    const progress = parseProgressLine(trimmedLine);
                    if (progress !== null && progressCallback) {
                        progressCallback({ percent: progress, status: 'downloading' });
                    }

                    // Check for post-processing
                    if (trimmedLine.includes('[ExtractAudio]') || trimmedLine.includes('[ffmpeg]')) {
                        if (progressCallback) {
                            progressCallback({ percent: 95, status: 'converting' });
                        }
                    }
                }

                return newBuffer;
            };

            // Track progress from stdout (line by line)
            process.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                stdoutBuffer = processBuffer(stdoutBuffer, false);
            });

            // Also check stderr for progress (yt-dlp sometimes outputs progress to stderr)
            process.stderr.on('data', (data) => {
                const output = data.toString();
                stderrOutput += output;
                stderrBuffer += output;
                stderrBuffer = processBuffer(stderrBuffer, true);
            });

            // Process any remaining buffered data when streams end
            process.stdout.on('end', () => {
                if (stdoutBuffer.trim()) {
                    processBuffer(stdoutBuffer + '\n', false);
                }
            });

            process.stderr.on('end', () => {
                if (stderrBuffer.trim()) {
                    processBuffer(stderrBuffer + '\n', true);
                }
            });

            process.on('close', (code) => {
                // Process any remaining buffered data
                if (stdoutBuffer.trim()) {
                    processBuffer(stdoutBuffer + '\n', false);
                }
                if (stderrBuffer.trim()) {
                    processBuffer(stderrBuffer + '\n', true);
                }

                if (code !== 0) {
                    const downloadDuration = Date.now() - downloadStartTime;
                    downloadLogger.error({
                        context: {
                            event: 'download_failed',
                            exitCode: code,
                            duration: downloadDuration,
                            stderr: stderrOutput.substring(0, 500)
                        }
                    }, `Download failed with exit code ${code}`);

                    // Check if yt-dlp command was not found
                    if (stderrOutput.includes('not recognized') || stderrOutput.includes('not found') || stderrOutput.includes('command not found')) {
                        const installInstructions = process.platform === 'win32'
                            ? '\n\n📥 To install yt-dlp on Windows:\n' +
                              '   1. Download from: https://github.com/yt-dlp/yt-dlp/releases/latest\n' +
                              '   2. Download yt-dlp.exe (or yt-dlp_x86.exe for 32-bit)\n' +
                              '   3. Place it in a folder (e.g., C:\\yt-dlp)\n' +
                              '   4. Add that folder to your system PATH:\n' +
                              '      - Search "Environment Variables" in Windows\n' +
                              '      - Edit "Path" under System variables\n' +
                              '      - Add the folder path (e.g., C:\\yt-dlp)\n' +
                              '   5. Restart your terminal/application\n' +
                              '   6. Verify: Run "yt-dlp --version" in a new terminal'
                            : '\n\n📥 To install yt-dlp:\n' +
                              '   - Using pip: pip install yt-dlp\n' +
                              '   - Using pipx: pipx install yt-dlp\n' +
                              '   - Using homebrew (macOS): brew install yt-dlp\n' +
                              '   - Or download from: https://github.com/yt-dlp/yt-dlp/releases/latest';

                        reject(new Error(`yt-dlp is not installed or not in your PATH.${installInstructions}`));
                    } else {
                        reject(new Error(`yt-dlp exited with code ${code}: ${stderrOutput.substring(0, 200)}`));
                    }
                    return;
                }

                // yt-dlp will create the file, we just need to find it
                const expectedPath = outputPath.replace(`.${config.download.audioFormat}`, '') + `.${config.download.audioFormat}`;

                if (fs.existsSync(expectedPath)) {
                    const downloadDuration = Date.now() - downloadStartTime;
                    const fileStats = fs.statSync(expectedPath);
                    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
                    
                    downloadLogger.info({
                        context: {
                            event: 'download_completed',
                            duration: downloadDuration,
                            fileSize: fileStats.size,
                            fileSizeMB: parseFloat(fileSizeMB),
                            filePath: expectedPath
                        }
                    }, `Download completed: ${title}`);

                    if (progressCallback) {
                        progressCallback({ percent: 100, status: 'complete' });
                    }

                    // Check if thumbnail was downloaded and move it to desired location
                    const result = { audioPath: expectedPath };
                    if (config.download.downloadThumbnails && thumbnailPath) {
                        // Thumbnail will be saved next to audio file with same base name
                        const audioDir = path.dirname(expectedPath);
                        const audioBaseName = path.basename(expectedPath, path.extname(expectedPath));
                        const thumbnailExtension = config.download.thumbnailFormat || 'jpg';
                        const tempThumbnailPath = path.join(audioDir, `${audioBaseName}.${thumbnailExtension}`);

                        // Check if thumbnail exists in temp location
                        if (fs.existsSync(tempThumbnailPath)) {
                            try {
                                // Ensure thumbnail directory exists
                                const thumbnailDir = path.dirname(thumbnailPath);
                                if (!fs.existsSync(thumbnailDir)) {
                                    fs.mkdirSync(thumbnailDir, { recursive: true });
                                }

                                // Move thumbnail to desired location
                                fs.renameSync(tempThumbnailPath, thumbnailPath);
                                downloadLogger.debug({
                                    context: { thumbnailPath }
                                }, 'Thumbnail moved successfully');
                                result.thumbnailPath = thumbnailPath;
                            } catch (moveError) {
                                downloadLogger.warn({
                                    context: {
                                        event: 'thumbnail_move_failed',
                                        error: moveError.message
                                    }
                                }, 'Failed to move thumbnail');
                                // If move fails, use temp location
                                if (fs.existsSync(tempThumbnailPath)) {
                                    result.thumbnailPath = tempThumbnailPath;
                                }
                            }
                        } else {
                            downloadLogger.debug({
                                context: { expectedThumbnailPath: tempThumbnailPath }
                            }, 'Thumbnail not found at expected location');
                        }
                    }

                    resolve(result);
                } else {
                    const downloadDuration = Date.now() - downloadStartTime;
                    downloadLogger.error({
                        context: {
                            event: 'download_failed',
                            reason: 'output_file_not_found',
                            expectedPath,
                            duration: downloadDuration
                        }
                    }, 'Download completed but output file not found');
                    reject(new Error('yt-dlp completed but output file not found'));
                }
            });

            process.on('error', (error) => {
                const downloadDuration = Date.now() - downloadStartTime;
                downloadLogger.error({
                    context: {
                        event: 'download_process_error',
                        error: {
                            message: error.message,
                            code: error.code,
                            name: error.name
                        },
                        duration: downloadDuration
                    }
                }, 'yt-dlp process error');

                // Check if yt-dlp is not found
                if (error.message.includes('not recognized') || error.message.includes('not found') || error.code === 'ENOENT') {
                    const installInstructions = process.platform === 'win32'
                        ? '\n\n📥 To install yt-dlp on Windows:\n' +
                          '   1. Download from: https://github.com/yt-dlp/yt-dlp/releases/latest\n' +
                          '   2. Download yt-dlp.exe (or yt-dlp_x86.exe for 32-bit)\n' +
                          '   3. Place it in a folder (e.g., C:\\yt-dlp)\n' +
                          '   4. Add that folder to your system PATH:\n' +
                          '      - Search "Environment Variables" in Windows\n' +
                          '      - Edit "Path" under System variables\n' +
                          '      - Add the folder path (e.g., C:\\yt-dlp)\n' +
                          '   5. Restart your terminal/application\n' +
                          '   6. Verify: Run "yt-dlp --version" in a new terminal'
                        : '\n\n📥 To install yt-dlp:\n' +
                          '   - Using pip: pip install yt-dlp\n' +
                          '   - Using pipx: pipx install yt-dlp\n' +
                          '   - Using homebrew (macOS): brew install yt-dlp\n' +
                          '   - Or download from: https://github.com/yt-dlp/yt-dlp/releases/latest';

                    reject(new Error(`yt-dlp is not installed or not in your PATH.${installInstructions}`));
                } else {
                    reject(new Error(`yt-dlp failed: ${error.message}`));
                }
            });
        });
    } catch (err) {
        const downloadDuration = Date.now() - downloadStartTime;
        downloadLogger.error({
            context: {
                event: 'download_error',
                error: {
                    message: err.message,
                    stack: err.stack,
                    name: err.name
                },
                duration: downloadDuration
            }
        }, 'Download error occurred:', err);
        throw err;
    }
}

module.exports = {
    downloadFromYouTube
};
