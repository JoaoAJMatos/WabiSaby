const express = require('express');
const path = require('path');
const fs = require('fs');
const queueManager = require('../../core/queue');
const { getAudioDuration } = require('../../services/metadata.service');
const statsService = require('../../services/stats.service');
const { getThumbnailUrl } = require('../../utils/helpers.util');

const router = express.Router();

/**
 * Status Routes
 * Handles combined status endpoint for auth, queue, and stats
 */

// In-memory storage for auth status
let latestQR = null;
let isConnected = false;
const botStartTime = Date.now();

/**
 * Update authentication status (called from WhatsApp module)
 */
function updateAuthStatus(status, qr) {
    isConnected = status === 'open';
    latestQR = qr || null;
}

/**
 * Combined Status Endpoint (Queue + Auth + Stats)
 * GET /api/status
 */
router.get('/status', async (req, res) => {
    const current = queueManager.getCurrent();
    const isPaused = queueManager.isPaused;

    // Add elapsed time for sync
    if (current && current.startTime) {
        if (isPaused && current.pausedAt) {
            current.elapsed = current.pausedAt - current.startTime;
        } else {
            current.elapsed = Date.now() - current.startTime;
        }
    }
    
    // Extract filename for streaming if it's a file path
    if (current && current.content && current.type === 'file') {
        current.streamUrl = `/stream/${path.basename(current.content)}`;
        
        // Get duration if not already cached
        if (!current.duration && fs.existsSync(current.content)) {
            current.duration = await getAudioDuration(current.content);
        }
        
        // Add thumbnail URL if available
        if (current.thumbnail && fs.existsSync(current.thumbnail)) {
            current.thumbnailUrl = getThumbnailUrl(current.thumbnail);
        }
        
        // Update stats with duration and thumbnail if we have them
        const updates = {};
        if (current.duration) updates.duration = current.duration;
        if (current.thumbnailUrl) updates.thumbnailUrl = current.thumbnailUrl;
        
        if (Object.keys(updates).length > 0) {
            statsService.updateLastSong(current.content, updates);
        }
    }

    if (current) {
        current.isPaused = isPaused;
    }

    // Add thumbnail URLs to queue items
    const queue = queueManager.getQueue();
    const addThumbnailUrl = (item) => {
        if (item.thumbnail && fs.existsSync(item.thumbnail)) {
            const thumbnailUrl = getThumbnailUrl(item.thumbnail);
            if (thumbnailUrl) {
                return { ...item, thumbnailUrl };
            }
        }
        return item;
    };
    
    const queueWithThumbnails = queue.map(addThumbnailUrl);

    // Get stats from statsService for consistency
    const detailedStats = statsService.getStats();
    
    res.json({
        auth: {
            isConnected,
            qr: latestQR
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

