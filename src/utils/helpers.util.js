/**
 * Helper Utilities
 * Common helper functions used across the application
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
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
 * Send a WhatsApp message with link preview support
 * Tries multiple strategies to make the link clickable
 * @param {Object} sock - WhatsApp socket instance
 * @param {string} remoteJid - Target JID (group or user)
 * @param {string} text - Message text containing the URL
 * @param {string} url - URL to generate preview for (should be included in text)
 * @param {string} title - Optional title for the link preview
 * @param {string} description - Optional description for the link preview
 * @param {string|Array<string>} mentions - User JID(s) to mention (optional)
 * @returns {Promise<void>}
 */
async function sendMessageWithLinkPreview(sock, remoteJid, text, url, title = null, description = null, mentions = null) {
    // Strategy: Send introduction first, then clean URL for easy copying
    // This provides better UX and link detection
    try {
        // First, send the introduction message
        const messageOptions = { text: text };
        
        if (mentions) {
            const mentionArray = Array.isArray(mentions) ? mentions : [mentions];
            messageOptions.mentions = mentionArray;
        }
        
        await sock.sendMessage(remoteJid, messageOptions);
        
        // Small delay between messages
        await delay(300);
        
        // Then send just the clean URL for easy copying and link detection
        await sock.sendMessage(remoteJid, { text: url });
    } catch (error) {
        // Fallback: Try with extendedTextMessage format
        try {
            const messageOptions = {
                extendedTextMessage: {
                    text: text,
                    matchedText: url,
                    canonicalUrl: url,
                    title: title || 'WabiSaby Mobile Access',
                    description: description || 'Access your VIP music bot dashboard',
                    previewType: 0
                }
            };
            
            if (mentions) {
                const mentionArray = Array.isArray(mentions) ? mentions : [mentions];
                messageOptions.mentions = mentionArray;
            }
            
            await sock.sendMessage(remoteJid, messageOptions);
        } catch (fallbackError) {
            // Final fallback: simple text message with URL
            const messageOptions = { text: text };
            if (mentions) {
                const mentionArray = Array.isArray(mentions) ? mentions : [mentions];
                messageOptions.mentions = mentionArray;
            }
            await sock.sendMessage(remoteJid, messageOptions);
        }
    }
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
 * Uses UDP socket to determine the actual interface used for external traffic
 * This is the most reliable method as it uses the OS routing table
 * @returns {Promise<string>} Local IPv4 address or 'localhost' as fallback
 */
function getLocalIPv4() {
    return new Promise((resolve) => {
        let resolved = false;
        const socket = dgram.createSocket('udp4');
        
        const safeResolve = (value) => {
            if (resolved) return;
            resolved = true;
            try {
                if (socket) {
                    socket.close();
                }
            } catch (error) {
                // Ignore errors when closing already-closed socket
            }
            resolve(value);
        };
        
        socket.on('error', () => {
            safeResolve('localhost');
        });
        
        // Connect to a public DNS server (doesn't actually send data)
        // This asks the OS which interface it would use for external traffic
        socket.connect(53, '8.8.8.8', () => {
            try {
                const address = socket.address();
                
                if (address && address.address && address.address !== '0.0.0.0') {
                    safeResolve(address.address);
                } else {
                    safeResolve('localhost');
                }
            } catch (error) {
                safeResolve('localhost');
            }
        });
        
        // Timeout after 1 second
        setTimeout(() => {
            safeResolve('localhost');
        }, 1000);
    });
}

module.exports = {
    delay,
    getRandomDelay,
    sendMessageWithMention,
    sendMessageWithLinkPreview,
    getThumbnailUrl,
    getLocalIPv4
};

