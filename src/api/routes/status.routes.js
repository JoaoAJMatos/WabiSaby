const express = require('express');
const path = require('path');
const fs = require('fs');
const queueManager = require('../../core/queue');
const playbackController = require('../../core/playback.controller');
const whatsappAdapter = require('../../core/whatsapp');
const metadataService = require('../../services/metadata.service');
const statsService = require('../../services/stats.service');
const groupsService = require('../../services/groups.service');
const helpersUtil = require('../../utils/helpers.util');

const router = express.Router();

/**
 * Status Routes
 * Handles combined status endpoint for auth, queue, and stats
 */

// In-memory storage for auth status (QR code)
let latestQR = null;

/**
 * Update authentication status (called from WhatsApp module for QR code)
 */
function updateAuthStatus(status, qr) {
    latestQR = qr || null;
}

/**
 * Combined Status Endpoint (Queue + Auth + Stats)
 * GET /api/status
 */
router.get('/status', async (req, res) => {
    const current = playbackController.getCurrent();
    const isPaused = playbackController.isPaused;

    // Add elapsed time for sync
    if (current && current.startTime) {
        if (isPaused && current.pausedAt) {
            current.elapsed = current.pausedAt - current.startTime;
        } else {
            current.elapsed = Date.now() - current.startTime;
        }
    }
    
    // Extract filename for streaming if it's a file path
    // Check if content is a file path (not a URL) - either by type or by content pattern
    const isFile = current && current.content && (
        current.type === 'file' || 
        (!current.content.startsWith('http://') && !current.content.startsWith('https://'))
    );
    
    if (isFile) {
        const fileExists = fs.existsSync(current.content);
        
        // Only generate streamUrl if file exists
        if (fileExists) {
            current.streamUrl = `/stream/${path.basename(current.content)}`;
            // Ensure type is set
            if (!current.type) {
                current.type = 'file';
            }
            
            // Get duration if not already cached
            if (!current.duration) {
                current.duration = await metadataService.getAudioDuration(current.content);
            }
            
            // Add thumbnail URL if available
            if (current.thumbnail && fs.existsSync(current.thumbnail)) {
                current.thumbnailUrl = helpersUtil.getThumbnailUrl(current.thumbnail);
            }
            
            // Update stats with duration and thumbnail if we have them
            const updates = {};
            if (current.duration) updates.duration = current.duration;
            if (current.thumbnailUrl) updates.thumbnailUrl = current.thumbnailUrl;
            
            if (Object.keys(updates).length > 0) {
                statsService.updateLastSong(current.content, updates);
            }
        }
    }

    if (current) {
        current.isPaused = isPaused;
    }

    // Add thumbnail URLs to queue items
    const queue = queueManager.getQueue();
    const addThumbnailUrl = (item) => {
        if (item.thumbnail && fs.existsSync(item.thumbnail)) {
            const thumbnailUrl = helpersUtil.getThumbnailUrl(item.thumbnail);
            if (thumbnailUrl) {
                return { ...item, thumbnailUrl };
            }
        }
        return item;
    };
    
    const queueWithThumbnails = queue.map(addThumbnailUrl);

    // Get stats from statsService for consistency
    const detailedStats = statsService.getStats();
    const isConnected = whatsappAdapter.getConnectionStatus();
    
    // Get groups count for onboarding hints
    const groupsCount = groupsService.getGroups().length;
    
    // Action required when connected but no groups configured
    const actionRequired = isConnected && groupsCount === 0;
    
    res.json({
        auth: {
            isConnected,
            qr: latestQR,
            groupsCount,
            actionRequired
        },
        queue: {
            queue: queueWithThumbnails,
            currentSong: current,
            isPaused: isPaused
        },
        stats: {
            uptime: statsService.getUptime(),
            songsPlayed: detailedStats.songsPlayed,
            queueLength: queue.length
        }
    });
});

module.exports = { router, updateAuthStatus };

