/**
 * Helper Utilities
 * Common helper functions used across the application
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');

/**
 * Delay execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get a random delay between min and max milliseconds
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 * @returns {number} Random delay value
 */
const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Send a WhatsApp message with proper user mentions
 * @param {Object} sock - WhatsApp socket instance
 * @param {string} remoteJid - Target JID (group or user)
 * @param {string} text - Message text
 * @param {string|Array<string>} mentions - User JID(s) to mention (optional)
 * @returns {Promise<void>}
 */
async function sendMessageWithMention(sock, remoteJid, text, mentions = null) {
    const messageOptions = { text };
    
    if (mentions) {
        // Convert single mention to array
        const mentionArray = Array.isArray(mentions) ? mentions : [mentions];
        messageOptions.mentions = mentionArray;
    }
    
    await sock.sendMessage(remoteJid, messageOptions);
}

/**
 * Convert thumbnail file path to URL for serving
 * @param {string} thumbnailPath - Full path to thumbnail file
 * @returns {string|null} URL path or null if file doesn't exist or path is invalid
 */
function getThumbnailUrl(thumbnailPath) {
    if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
        return null;
    }
    
    // Get relative path from thumbnails directory
    const relativePath = path.relative(config.paths.thumbnails, thumbnailPath);
    
    // If path is outside thumbnails directory, return null
    if (relativePath.startsWith('..')) {
        return null;
    }
    
    // Convert to URL path (use forward slashes)
    const urlPath = relativePath.replace(/\\/g, '/');
    return `/thumbnails/${urlPath}`;
}

/**
 * Get local IPv4 address for network access
 * @returns {string} Local IPv4 address or 'localhost' as fallback
 */
function getLocalIPv4() {
    try {
        const interfaces = os.networkInterfaces();
        
        // Priority order: non-internal, IPv4, not loopback
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        
        // Fallback: try to find any IPv4 address
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4') {
                    return iface.address;
                }
            }
        }
    } catch (error) {
        // If we can't get the IP, fall back to localhost
    }
    
    // Final fallback
    return 'localhost';
}

module.exports = {
    delay,
    getRandomDelay,
    sendMessageWithMention,
    getThumbnailUrl,
    getLocalIPv4
};

