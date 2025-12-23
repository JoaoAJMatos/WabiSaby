/**
 * Dependencies Utility
 * Provides functions to check and locate yt-dlp and ffmpeg binaries
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', '..', 'bin');
const IS_WINDOWS = process.platform === 'win32';

/**
 * Check if a command is available in PATH
 * @param {string} command - Command name to check
 * @returns {boolean} True if command is available
 */
function isCommandInPath(command) {
    try {
        if (IS_WINDOWS) {
            execSync(`where ${command}`, { stdio: 'ignore' });
        } else {
            execSync(`which ${command}`, { stdio: 'ignore' });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Get path to local binary in bin directory
 * @param {string} binaryName - Binary name (without extension)
 * @returns {string|null} Full path to binary or null if not found
 */
function getLocalBinaryPath(binaryName) {
    const binaryPath = path.join(BIN_DIR, IS_WINDOWS ? `${binaryName}.exe` : binaryName);
    if (fs.existsSync(binaryPath)) {
        return binaryPath;
    }
    return null;
}

/**
 * Get full path to yt-dlp binary
 * Checks local bin directory first, then PATH
 * @returns {string} Path to yt-dlp (or 'yt-dlp' if found in PATH)
 */
function getYtDlpPath() {
    // Check local bin directory first
    const localPath = getLocalBinaryPath('yt-dlp');
    if (localPath) {
        return localPath;
    }
    
    // Check if available in PATH
    if (isCommandInPath('yt-dlp')) {
        return 'yt-dlp';
    }
    
    // Return default (will fail with clear error message)
    return 'yt-dlp';
}

/**
 * Get full path to ffmpeg binary
 * Checks local bin directory first, then PATH
 * @returns {string} Path to ffmpeg (or 'ffmpeg' if found in PATH)
 */
function getFFmpegPath() {
    // Check local bin directory first
    const localPath = getLocalBinaryPath('ffmpeg');
    if (localPath) {
        return localPath;
    }
    
    // Check if available in PATH
    if (isCommandInPath('ffmpeg')) {
        return 'ffmpeg';
    }
    
    // Return default (will fail with clear error message)
    return 'ffmpeg';
}

/**
 * Get full path to ffplay binary
 * Checks local bin directory first, then PATH
 * @returns {string} Path to ffplay (or 'ffplay' if found in PATH)
 */
function getFFplayPath() {
    // Check local bin directory first
    const localPath = getLocalBinaryPath('ffplay');
    if (localPath) {
        return localPath;
    }
    
    // Check if available in PATH
    if (isCommandInPath('ffplay')) {
        return 'ffplay';
    }
    
    // Return default (will fail with clear error message)
    return 'ffplay';
}

/**
 * Check if yt-dlp is available (either locally or in PATH)
 * @returns {boolean} True if yt-dlp is available
 */
function isYtDlpAvailable() {
    return getLocalBinaryPath('yt-dlp') !== null || isCommandInPath('yt-dlp');
}

/**
 * Check if ffmpeg is available (either locally or in PATH)
 * @returns {boolean} True if ffmpeg is available
 */
function isFFmpegAvailable() {
    return getLocalBinaryPath('ffmpeg') !== null || isCommandInPath('ffmpeg');
}

/**
 * Check if ffplay is available (either locally or in PATH)
 * @returns {boolean} True if ffplay is available
 */
function isFFplayAvailable() {
    return getLocalBinaryPath('ffplay') !== null || isCommandInPath('ffplay');
}

module.exports = {
    getYtDlpPath,
    getFFmpegPath,
    getFFplayPath,
    isYtDlpAvailable,
    isFFmpegAvailable,
    isFFplayAvailable,
    isCommandInPath,
    getLocalBinaryPath
};

