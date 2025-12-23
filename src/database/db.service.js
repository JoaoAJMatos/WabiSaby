const { getDatabase } = require('./index');
const { logger } = require('../utils/logger.util');
const {
    normalizeLanguageCode,
    DEFAULT_LANGUAGE
} = require('../config/languages');

/**
 * Database Service Layer
 * Provides clean API for all database operations
 */

// ============================================
// Songs Operations
// ============================================

/**
 * Get or create a song record
 * @param {Object} songData - Song data
 * @returns {number} Song ID
 */
function getOrCreateSong(songData) {
    const db = getDatabase();
    
    // Validate content is provided
    if (!songData || !songData.content) {
        throw new Error('Song content is required');
    }
    
    // Try to find existing song by content
    let song = db.prepare('SELECT id FROM songs WHERE content = ?').get(songData.content);
    
    if (song) {
        // Update song if new data provided
        if (songData.title || songData.artist || songData.channel || songData.duration || songData.thumbnail_path || songData.thumbnail_url || songData.source_url) {
            db.prepare(`
                UPDATE songs 
                SET title = COALESCE(?, title),
                    artist = COALESCE(?, artist),
                    channel = COALESCE(?, channel),
                    duration = COALESCE(?, duration),
                    thumbnail_path = COALESCE(?, thumbnail_path),
                    thumbnail_url = COALESCE(?, thumbnail_url),
                    source_url = COALESCE(?, source_url)
                WHERE id = ?
            `).run(
                songData.title || null,
                songData.artist || null,
                songData.channel || null,
                songData.duration || null,
                songData.thumbnail_path || null,
                songData.thumbnail_url || null,
                songData.source_url || null,
                song.id
            );
        }
        return song.id;
    }
    
    // Create new song
    const result = db.prepare(`
        INSERT INTO songs (content, title, artist, channel, duration, thumbnail_path, thumbnail_url, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        songData.content,
        songData.title || 'Unknown',
        songData.artist || null,
        songData.channel || null,
        songData.duration || null,
        songData.thumbnail_path || null,
        songData.thumbnail_url || null,
        songData.source_url || null
    );
    
    return result.lastInsertRowid;
}

/**
 * Get song by ID
 * @param {number} songId - Song ID
 * @returns {Object|null} Song data
 */
function getSong(songId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
}

/**
 * Update song by ID
 * @param {number} songId - Song ID
 * @param {Object} updates - Fields to update
 */
function updateSong(songId, updates) {
    const db = getDatabase();
    const fields = [];
    const values = [];
    
    if (updates.content !== undefined) {
        fields.push('content = ?');
        values.push(updates.content);
    }
    if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
    }
    if (updates.artist !== undefined) {
        fields.push('artist = ?');
        values.push(updates.artist);
    }
    if (updates.channel !== undefined) {
        fields.push('channel = ?');
        values.push(updates.channel);
    }
    if (updates.duration !== undefined) {
        fields.push('duration = ?');
        values.push(updates.duration);
    }
    if (updates.thumbnail_path !== undefined) {
        fields.push('thumbnail_path = ?');
        values.push(updates.thumbnail_path);
    }
    if (updates.thumbnail_url !== undefined) {
        fields.push('thumbnail_url = ?');
        values.push(updates.thumbnail_url);
    }
    if (updates.source_url !== undefined) {
        fields.push('source_url = ?');
        values.push(updates.source_url);
    }
    if (updates.volume_gain_db !== undefined) {
        fields.push('volume_gain_db = ?');
        values.push(updates.volume_gain_db);
    }
    
    if (fields.length === 0) {
        return; // Nothing to update
    }
    
    values.push(songId);
    db.prepare(`UPDATE songs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Update volume gain for a song
 * @param {number} songId - Song ID
 * @param {number} gainDb - Gain adjustment in dB
 */
function updateSongVolumeGain(songId, gainDb) {
    const db = getDatabase();
    db.prepare('UPDATE songs SET volume_gain_db = ? WHERE id = ?')
        .run(gainDb, songId);
}

// ============================================
// Requesters Operations
// ============================================

/**
 * Get or create a requester record
 * @param {string} name - Requester name
 * @param {string} whatsappId - Optional WhatsApp ID
 * @returns {number} Requester ID
 */
function getOrCreateRequester(name, whatsappId = null) {
    const db = getDatabase();
    
    // Try to find by name first
    let requester = db.prepare('SELECT id FROM requesters WHERE name = ?').get(name);
    
    if (requester) {
        // Update WhatsApp ID if provided and different
        if (whatsappId && whatsappId !== requester.whatsapp_id) {
            db.prepare('UPDATE requesters SET whatsapp_id = ? WHERE id = ?').run(whatsappId, requester.id);
        }
        return requester.id;
    }
    
    // Try to find by WhatsApp ID if provided
    if (whatsappId) {
        requester = db.prepare('SELECT id FROM requesters WHERE whatsapp_id = ?').get(whatsappId);
        if (requester) {
            // Update name if different
            db.prepare('UPDATE requesters SET name = ? WHERE id = ?').run(name, requester.id);
            return requester.id;
        }
    }
    
    // Create new requester
    const result = db.prepare(`
        INSERT INTO requesters (name, whatsapp_id)
        VALUES (?, ?)
    `).run(name, whatsappId);
    
    return result.lastInsertRowid;
}

/**
 * Get all requesters
 * @returns {Array} List of requesters
 */
function getRequesters() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM requesters ORDER BY name').all();
}

// ============================================
// Queue Operations
// ============================================

/**
 * Get all queue items ordered by position
 * @returns {Array} Queue items with song and requester data
 */
function getQueueItems() {
    const db = getDatabase();
    return db.prepare(`
        SELECT 
            qi.*,
            s.content, s.title, s.artist, s.channel, s.duration, s.thumbnail_path, s.thumbnail_url, s.source_url,
            r.name as requester_name, r.whatsapp_id as requester_whatsapp_id
        FROM queue_items qi
        JOIN songs s ON qi.song_id = s.id
        JOIN requesters r ON qi.requester_id = r.id
        ORDER BY qi.position ASC
    `).all();
}

/**
 * Add item to queue
 * @param {Object} itemData - Queue item data
 * @returns {number} Queue item ID
 */
function addQueueItem(itemData) {
    const db = getDatabase();
    
    // Get or create song
    // If song_id is provided directly, use it; otherwise create/get song from content
    let songId = itemData.song_id;
    if (!songId) {
        if (!itemData.content) {
            throw new Error('Either song_id or content must be provided');
        }
        songId = getOrCreateSong({
            content: itemData.content,
            title: itemData.title,
            artist: itemData.artist,
            channel: itemData.channel,
            duration: itemData.duration,
            thumbnail_path: itemData.thumbnail_path,
            thumbnail_url: itemData.thumbnail_url,
            source_url: itemData.source_url
        });
    }
    
    // Get or create requester
    // If requester_id is provided directly, use it; otherwise create/get requester
    let requesterId = itemData.requester_id;
    if (!requesterId) {
        requesterId = getOrCreateRequester(
            itemData.requester || itemData.requester_name || 'Unknown',
            itemData.sender || itemData.sender_id
        );
    }
    
    // Get max position
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM queue_items').get();
    const position = itemData.position !== undefined ? itemData.position : maxPos.next_pos;
    
    // If inserting at specific position, shift others
    if (itemData.position !== undefined && itemData.position < maxPos.next_pos) {
        db.prepare('UPDATE queue_items SET position = position + 1 WHERE position >= ?').run(position);
    }
    
    const result = db.prepare(`
        INSERT INTO queue_items (song_id, requester_id, group_id, sender_id, position, is_priority, 
                                download_status, download_progress, prefetched)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        songId,
        requesterId,
        itemData.group_id || null,
        itemData.sender || itemData.sender_id || null,
        position,
        itemData.is_priority ? 1 : 0,
        itemData.download_status || 'pending',
        itemData.download_progress || 0,
        itemData.prefetched ? 1 : 0
    );
    
    return result.lastInsertRowid;
}

/**
 * Remove queue item by ID
 * @param {number} itemId - Queue item ID
 * @returns {boolean} True if removed
 */
function removeQueueItem(itemId) {
    const db = getDatabase();
    
    // Get position of item to remove
    const item = db.prepare('SELECT position FROM queue_items WHERE id = ?').get(itemId);
    if (!item) return false;
    
    // Remove item
    db.prepare('DELETE FROM queue_items WHERE id = ?').run(itemId);
    
    // Shift positions
    db.prepare('UPDATE queue_items SET position = position - 1 WHERE position > ?').run(item.position);
    
    return true;
}

/**
 * Reorder queue items
 * @param {number} fromIndex - Source position (0-based)
 * @param {number} toIndex - Target position (0-based)
 * @returns {boolean} True if successful
 */
function reorderQueue(fromIndex, toIndex) {
    const db = getDatabase();
    
    // Get all items
    const items = db.prepare('SELECT id, position FROM queue_items ORDER BY position').all();
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
        return false;
    }
    
    const transaction = db.transaction(() => {
        // Remove item from old position
        const [movedItem] = items.splice(fromIndex, 1);
        // Insert at new position
        items.splice(toIndex, 0, movedItem);
        
        // Update all positions
        items.forEach((item, index) => {
            db.prepare('UPDATE queue_items SET position = ? WHERE id = ?').run(index, item.id);
        });
    });
    
    transaction();
    return true;
}

/**
 * Clear all queue items
 */
function clearQueue() {
    const db = getDatabase();
    db.prepare('DELETE FROM queue_items').run();
}

// ============================================
// Playback State Operations
// ============================================

/**
 * Get playback state
 * @returns {Object} Playback state
 */
function getPlaybackState() {
    const db = getDatabase();
    const state = db.prepare('SELECT * FROM playback_state WHERE id = 1').get();
    
    if (state && state.current_song_id) {
        const song = getSong(state.current_song_id);
        if (song) {
            state.currentSong = song;
        }
    }
    
    return state;
}

/**
 * Update playback state
 * @param {Object} updates - State updates
 */
function updatePlaybackState(updates) {
    const db = getDatabase();
    
    const allowedFields = [
        'current_song_id', 'current_queue_item_id', 'is_playing', 'is_paused',
        'start_time', 'paused_at', 'seek_position', 'songs_played'
    ];
    
    const setClause = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (allowedFields.includes(dbKey)) {
            setClause.push(`${dbKey} = ?`);
            values.push(value);
        }
    }
    
    if (setClause.length === 0) return;
    
    values.push(1); // id = 1
    db.prepare(`UPDATE playback_state SET ${setClause.join(', ')} WHERE id = ?`).run(...values);
}

// ============================================
// Play History Operations
// ============================================

/**
 * Add play history record
 * @param {Object} historyData - History data
 * @returns {number} History record ID
 */
function addPlayHistory(historyData) {
    const db = getDatabase();
    
    // Get or create song
    const songId = getOrCreateSong({
        content: historyData.content,
        title: historyData.title,
        artist: historyData.artist,
        channel: historyData.channel,
        duration: historyData.duration,
        thumbnail_path: historyData.thumbnail_path,
        thumbnail_url: historyData.thumbnail_url
    });
    
    // Get or create requester
    const requesterId = getOrCreateRequester(
        historyData.requester || 'Unknown',
        historyData.sender || historyData.sender_id
    );
    
    // Convert played_at to timestamp if it's a Date or ISO string
    let playedAt = historyData.played_at;
    if (playedAt instanceof Date) {
        playedAt = Math.floor(playedAt.getTime() / 1000);
    } else if (typeof playedAt === 'string') {
        playedAt = Math.floor(new Date(playedAt).getTime() / 1000);
    } else if (typeof playedAt === 'number') {
        // If it's a number, check if it's in milliseconds (typically > 1e12 for dates after 2001)
        // and convert to seconds if needed
        if (playedAt > 1e12) {
            playedAt = Math.floor(playedAt / 1000);
        }
        // If it's already in seconds (or a very old timestamp), use as-is
    } else if (!playedAt) {
        playedAt = Math.floor(Date.now() / 1000);
    }
    
    const result = db.prepare(`
        INSERT INTO play_history (song_id, requester_id, played_at, duration)
        VALUES (?, ?, ?, ?)
    `).run(
        songId,
        requesterId,
        playedAt,
        historyData.duration || null
    );
    
    // Update hourly stats
    const hour = new Date(playedAt * 1000).getHours();
    db.prepare(`
        INSERT INTO hourly_stats (hour, play_count)
        VALUES (?, 1)
        ON CONFLICT(hour) DO UPDATE SET play_count = play_count + 1
    `).run(hour);
    
    return result.lastInsertRowid;
}

/**
 * Get play history
 * @param {number} limit - Max number of records
 * @param {number} offset - Offset for pagination
 * @returns {Array} History records
 */
function getPlayHistory(limit = 20, offset = 0) {
    const db = getDatabase();
    return db.prepare(`
        SELECT 
            ph.*,
            s.content, s.title, s.artist, s.channel, s.duration, s.thumbnail_path, s.thumbnail_url,
            r.name as requester_name
        FROM play_history ph
        JOIN songs s ON ph.song_id = s.id
        JOIN requesters r ON ph.requester_id = r.id
        ORDER BY ph.played_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

/**
 * Get top artists
 * @param {number} limit - Max number to return
 * @returns {Array} Top artists with play counts
 */
function getTopArtists(limit = 10) {
    const db = getDatabase();
    return db.prepare(`
        SELECT 
            s.artist as name,
            COUNT(*) as count
        FROM play_history ph
        JOIN songs s ON ph.song_id = s.id
        WHERE s.artist IS NOT NULL AND s.artist != ''
        GROUP BY s.artist
        ORDER BY count DESC
        LIMIT ?
    `).all(limit).map((row, index) => ({
        rank: index + 1,
        name: row.name,
        count: row.count
    }));
}

/**
 * Get top requesters
 * @param {number} limit - Max number to return
 * @returns {Array} Top requesters with play counts
 */
function getTopRequesters(limit = 20) {
    const db = getDatabase();
    return db.prepare(`
        SELECT 
            r.name,
            COUNT(*) as count
        FROM play_history ph
        JOIN requesters r ON ph.requester_id = r.id
        GROUP BY r.id, r.name
        ORDER BY count DESC
        LIMIT ?
    `).all(limit).map((row, index) => ({
        rank: index + 1,
        name: row.name,
        count: row.count
    }));
}

/**
 * Get hourly distribution
 * @returns {Object} Hour to count mapping
 */
function getHourlyDistribution() {
    const db = getDatabase();
    const rows = db.prepare('SELECT hour, play_count FROM hourly_stats ORDER BY hour').all();
    const distribution = {};
    rows.forEach(row => {
        distribution[row.hour] = row.play_count;
    });
    return distribution;
}

/**
 * Get stats overview
 * @returns {Object} Overview statistics
 */
function getStatsOverview() {
    const db = getDatabase();
    
    const totalSongs = db.prepare('SELECT COUNT(*) as count FROM play_history').get().count;
    const totalDuration = db.prepare('SELECT COALESCE(SUM(duration), 0) as total FROM play_history WHERE duration IS NOT NULL').get().total;
    const songsWithDuration = db.prepare('SELECT COUNT(*) as count FROM play_history WHERE duration IS NOT NULL AND duration > 0').get().count;
    const avgDuration = songsWithDuration > 0 ? Math.floor(totalDuration / songsWithDuration) : 0;
    
    const uniqueRequesters = db.prepare('SELECT COUNT(DISTINCT requester_id) as count FROM play_history').get().count;
    const uniqueArtists = db.prepare('SELECT COUNT(DISTINCT artist) as count FROM songs WHERE artist IS NOT NULL AND artist != ""').get().count;
    
    // Find peak hour
    const peakHourRow = db.prepare('SELECT hour, play_count FROM hourly_stats ORDER BY play_count DESC LIMIT 1').get();
    const peakHour = peakHourRow ? peakHourRow.hour : null;
    const peakHourCount = peakHourRow ? peakHourRow.play_count : 0;
    
    return {
        songsPlayed: totalSongs,
        totalDuration,
        avgDuration,
        uniqueRequesters,
        uniqueArtists,
        peakHour,
        peakHourCount,
        hourlyDistribution: getHourlyDistribution(),
        topArtists: getTopArtists(5),
        topChannels: getTopChannels(5)
    };
}

/**
 * Get top channels
 * @param {number} limit - Max number to return
 * @returns {Array} Top channels with play counts
 */
function getTopChannels(limit = 10) {
    const db = getDatabase();
    return db.prepare(`
        SELECT 
            s.channel as name,
            COUNT(*) as count
        FROM play_history ph
        JOIN songs s ON ph.song_id = s.id
        WHERE s.channel IS NOT NULL AND s.channel != ''
        GROUP BY s.channel
        ORDER BY count DESC
        LIMIT ?
    `).all(limit).map((row, index) => ({
        rank: index + 1,
        name: row.name,
        count: row.count
    }));
}

/**
 * Reset all stats
 */
function resetStats() {
    const db = getDatabase();
    const transaction = db.transaction(() => {
        db.prepare('DELETE FROM play_history').run();
        db.prepare('DELETE FROM hourly_stats').run();
        db.prepare('UPDATE playback_state SET songs_played = 0').run();
    });
    transaction();
}

// ============================================
// Groups Operations
// ============================================

/**
 * Get all groups
 * @returns {Array} List of groups
 */
function getGroups() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM groups ORDER BY added_at DESC').all();
}

/**
 * Add a group
 * @param {string} id - Group ID
 * @param {string} name - Group name
 * @returns {boolean} True if added
 */
function addGroup(id, name = 'Unknown Group') {
    const db = getDatabase();
    
    // Check if exists
    const existing = db.prepare('SELECT id FROM groups WHERE id = ?').get(id);
    if (existing) {
        // Update name if different
        db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name, id);
        return true;
    }
    
    db.prepare('INSERT INTO groups (id, name) VALUES (?, ?)').run(id, name);
    return true;
}

/**
 * Remove a group
 * @param {string} id - Group ID
 * @returns {boolean} True if removed
 */
function removeGroup(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    return result.changes > 0;
}

/**
 * Update group name
 * @param {string} id - Group ID
 * @param {string} name - New name
 */
function updateGroupName(id, name) {
    const db = getDatabase();
    db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name, id);
}

// ============================================
// Priority Users Operations
// ============================================

/**
 * Get all priority users
 * @returns {Array} List of priority users
 */
function getPriorityUsers() {
    const db = getDatabase();
    return db.prepare('SELECT whatsapp_id, name FROM priority_users ORDER BY added_at DESC').all();
}

/**
 * Check if user is priority
 * @param {string} whatsappId - WhatsApp user ID
 * @returns {boolean} True if priority
 */
function isPriorityUser(whatsappId) {
    if (!whatsappId) return false;
    const db = getDatabase();
    const result = db.prepare('SELECT 1 FROM priority_users WHERE whatsapp_id = ?').get(whatsappId);
    return !!result;
}

/**
 * Add priority user
 * @param {string} whatsappId - WhatsApp user ID
 * @param {string} name - Optional name
 * @returns {boolean} True if added
 */
function addPriorityUser(whatsappId, name = null) {
    if (!whatsappId) return false;
    const db = getDatabase();
    
    const existing = db.prepare('SELECT whatsapp_id FROM priority_users WHERE whatsapp_id = ?').get(whatsappId);
    if (existing) {
        if (name) {
            db.prepare('UPDATE priority_users SET name = ? WHERE whatsapp_id = ?').run(name, whatsappId);
        }
        return true;
    }
    
    db.prepare('INSERT INTO priority_users (whatsapp_id, name) VALUES (?, ?)').run(whatsappId, name);
    return true;
}

/**
 * Remove priority user
 * @param {string} whatsappId - WhatsApp user ID
 * @returns {boolean} True if removed
 */
function removePriorityUser(whatsappId) {
    if (!whatsappId) return false;
    const db = getDatabase();
    const result = db.prepare('DELETE FROM priority_users WHERE whatsapp_id = ?').run(whatsappId);
    return result.changes > 0;
}

/**
 * Update VIP name
 * @param {string} whatsappId - WhatsApp user ID
 * @param {string} name - New name
 */
function updateVipName(whatsappId, name) {
    if (!whatsappId || !name) return;
    const db = getDatabase();
    db.prepare('UPDATE priority_users SET name = ? WHERE whatsapp_id = ?').run(name, whatsappId);
}

/**
 * Generate a secure mobile token
 * @returns {string} Base64url encoded token
 */
function generateMobileToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * Get mobile token for a VIP user
 * @param {string} whatsappId - WhatsApp user ID
 * @returns {string|null} Mobile token or null if not found
 */
function getMobileToken(whatsappId) {
    if (!whatsappId) return null;
    const db = getDatabase();
    const result = db.prepare('SELECT mobile_token FROM priority_users WHERE whatsapp_id = ?').get(whatsappId);
    return result ? result.mobile_token : null;
}

/**
 * Set mobile token for a VIP user
 * @param {string} whatsappId - WhatsApp user ID
 * @param {string} token - Mobile token
 * @returns {boolean} True if successful
 */
function setMobileToken(whatsappId, token) {
    if (!whatsappId || !token) return false;
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE priority_users SET mobile_token = ?, token_created_at = ? WHERE whatsapp_id = ?').run(token, now, whatsappId);
    return true;
}

/**
 * Get VIP user by mobile token
 * @param {string} token - Mobile token
 * @returns {Object|null} VIP user info or null
 */
function getVipByToken(token) {
    if (!token) return null;
    const db = getDatabase();
    const result = db.prepare('SELECT whatsapp_id, name, device_fingerprint, fingerprint_created_at FROM priority_users WHERE mobile_token = ?').get(token);
    return result || null;
}

/**
 * Store device fingerprint for a token
 * @param {string} token - Mobile token
 * @param {string} fingerprint - Device fingerprint hash
 * @returns {boolean} True if successful
 */
function storeDeviceFingerprint(token, fingerprint) {
    if (!token || !fingerprint) return false;
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE priority_users SET device_fingerprint = ?, fingerprint_created_at = ? WHERE mobile_token = ?').run(fingerprint, now, token);
    return true;
}

/**
 * Verify device fingerprint for a token
 * @param {string} token - Mobile token
 * @param {string} fingerprint - Device fingerprint hash to verify
 * @returns {boolean} True if fingerprint matches or no fingerprint is set (first access)
 */
function verifyDeviceFingerprint(token, fingerprint) {
    if (!token || !fingerprint) return false;
    const db = getDatabase();
    const result = db.prepare('SELECT device_fingerprint FROM priority_users WHERE mobile_token = ?').get(token);
    
    if (!result) return false;
    
    // If no fingerprint is set, this is first access (allow it)
    if (!result.device_fingerprint) return true;
    
    // Verify fingerprint matches
    return result.device_fingerprint === fingerprint;
}

// ============================================
// Playlists Operations
// ============================================

/**
 * Get all playlists
 * @returns {Array} List of playlists
 */
function getPlaylists() {
    const db = getDatabase();
    const playlists = db.prepare('SELECT * FROM playlists ORDER BY updated_at DESC').all();
    
    // Load items for each playlist
    return playlists.map(playlist => {
        const items = db.prepare(`
            SELECT * FROM playlist_items 
            WHERE playlist_id = ? 
            ORDER BY position ASC
        `).all(playlist.id);
        
        return {
            ...playlist,
            songs: items
        };
    });
}

/**
 * Create playlist
 * @param {Object} playlistData - Playlist data
 * @returns {string} Playlist ID
 */
function createPlaylist(playlistData) {
    const db = getDatabase();
    const playlistId = playlistData.id || require('crypto').randomBytes(8).toString('hex');
    
    db.prepare(`
        INSERT INTO playlists (id, name, source, source_url)
        VALUES (?, ?, ?, ?)
    `).run(
        playlistId,
        playlistData.name,
        playlistData.source || null,
        playlistData.source_url || null
    );
    
    return playlistId;
}

/**
 * Add item to playlist
 * @param {string} playlistId - Playlist ID
 * @param {Object} itemData - Item data
 */
function addPlaylistItem(playlistId, itemData) {
    const db = getDatabase();
    
    // Get max position
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM playlist_items WHERE playlist_id = ?').get(playlistId);
    
    db.prepare(`
        INSERT INTO playlist_items (playlist_id, title, artist, url, search_query, position)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        playlistId,
        itemData.title,
        itemData.artist || null,
        itemData.url || null,
        itemData.searchQuery || null,
        maxPos.next_pos
    );
}

/**
 * Delete playlist
 * @param {string} playlistId - Playlist ID
 */
function deletePlaylist(playlistId) {
    const db = getDatabase();
    db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);
}

// ============================================
// Settings Operations
// ============================================

/**
 * Get setting value
 * @param {string} key - Setting key
 * @returns {any} Setting value (parsed JSON if applicable)
 */
function getSetting(key) {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return null;
    
    try {
        return JSON.parse(row.value);
    } catch {
        return row.value;
    }
}

/**
 * Set setting value
 * @param {string} key - Setting key
 * @param {any} value - Setting value (will be JSON stringified)
 */
function setSetting(key, value) {
    const db = getDatabase();
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    
    db.prepare(`
        INSERT INTO settings (key, value) 
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = strftime('%s', 'now')
    `).run(key, valueStr, valueStr);
}

/**
 * Get all settings
 * @returns {Object} All settings as key-value pairs
 */
function getAllSettings() {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    
    rows.forEach(row => {
        try {
            settings[row.key] = JSON.parse(row.value);
        } catch {
            settings[row.key] = row.value;
        }
    });
    
    return settings;
}

// ============================================
// User Notification Preferences Operations
// ============================================

/**
 * Get user notification preference
 * @param {string} whatsappId - WhatsApp user ID
 * @returns {boolean} True if notifications enabled for user (defaults to true if not set)
 */
function getUserNotificationPreference(whatsappId) {
    if (!whatsappId) return true; // Default to enabled
    const db = getDatabase();
    const result = db.prepare('SELECT notifications_enabled FROM user_notification_preferences WHERE whatsapp_id = ?').get(whatsappId);
    if (!result) return true; // Default to enabled if no preference set
    return result.notifications_enabled === 1;
}

/**
 * Set user notification preference
 * @param {string} whatsappId - WhatsApp user ID
 * @param {boolean} enabled - Whether notifications are enabled
 */
function setUserNotificationPreference(whatsappId, enabled) {
    if (!whatsappId) return;
    const db = getDatabase();
    db.prepare(`
        INSERT INTO user_notification_preferences (whatsapp_id, notifications_enabled, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(whatsapp_id) DO UPDATE SET
            notifications_enabled = ?,
            updated_at = strftime('%s', 'now')
    `).run(whatsappId, enabled ? 1 : 0, enabled ? 1 : 0);
}

// ============================================
// User Language Preferences Operations
// ============================================

/**
 * Get user language preference
 * @param {string} whatsappId - WhatsApp user ID
 * @returns {string} Language code (defaults to configured default if not set)
 */
function getUserLanguage(whatsappId) {
    if (!whatsappId) return DEFAULT_LANGUAGE;
    const db = getDatabase();
    const result = db.prepare('SELECT language FROM user_notification_preferences WHERE whatsapp_id = ?').get(whatsappId);
    
    if (!result || !result.language) {
        return DEFAULT_LANGUAGE;
    }
    
    return result.language;
}

/**
 * Set user language preference
 * @param {string} whatsappId - WhatsApp user ID
 * @param {string} language - Language code (e.g., 'en', 'pt')
 */
function setUserLanguage(whatsappId, language) {
    if (!whatsappId || !language) return;
    
    // Normalize and validate language code
    const normalizedLang = normalizeLanguageCode(language);
    
    if (!normalizedLang) {
        logger.warn(`Invalid language code: ${language}, ignoring`);
        return;
    }
    
    const db = getDatabase();
    // Ensure the row exists (create if not exists)
    db.prepare(`
        INSERT INTO user_notification_preferences (whatsapp_id, language, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(whatsapp_id) DO UPDATE SET
            language = ?,
            updated_at = strftime('%s', 'now')
    `).run(whatsappId, normalizedLang, normalizedLang);
}

// ============================================
// Effects Operations
// ============================================

/**
 * Get effects settings
 * @returns {Object} Effects settings
 */
function getEffects() {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM effects WHERE id = 1').get();
    
    if (!row) {
        // Initialize with defaults
        db.prepare('INSERT INTO effects (id) VALUES (1)').run();
        return getEffects();
    }
    
    // Convert to nested structure
    return {
        enabled: row.enabled === 1,
        speed: row.speed,
        pitch: row.pitch,
        eq: {
            bass: row.eq_bass,
            mid: row.eq_mid,
            treble: row.eq_treble
        },
        reverb: {
            enabled: row.reverb_enabled === 1,
            roomSize: row.reverb_room_size,
            damping: row.reverb_damping,
            wetLevel: row.reverb_wet_level
        },
        echo: {
            enabled: row.echo_enabled === 1,
            delay: row.echo_delay,
            decay: row.echo_decay
        },
        delay: {
            enabled: row.delay_enabled === 1,
            delay: row.delay_delay,
            feedback: row.delay_feedback
        },
        distortion: {
            enabled: row.distortion_enabled === 1,
            drive: row.distortion_drive
        },
        compressor: {
            enabled: row.compressor_enabled === 1,
            threshold: row.compressor_threshold,
            ratio: row.compressor_ratio
        },
        limiter: {
            enabled: row.limiter_enabled === 1,
            limit: row.limiter_limit
        },
        preset: row.preset
    };
}

/**
 * Update effects settings
 * @param {Object} effects - Effects settings
 */
function updateEffects(effects) {
    const db = getDatabase();
    
    db.prepare(`
        UPDATE effects SET
            enabled = ?,
            speed = ?,
            pitch = ?,
            eq_bass = ?,
            eq_mid = ?,
            eq_treble = ?,
            reverb_enabled = ?,
            reverb_room_size = ?,
            reverb_damping = ?,
            reverb_wet_level = ?,
            echo_enabled = ?,
            echo_delay = ?,
            echo_decay = ?,
            delay_enabled = ?,
            delay_delay = ?,
            delay_feedback = ?,
            distortion_enabled = ?,
            distortion_drive = ?,
            compressor_enabled = ?,
            compressor_threshold = ?,
            compressor_ratio = ?,
            limiter_enabled = ?,
            limiter_limit = ?,
            preset = ?,
            updated_at = strftime('%s', 'now')
        WHERE id = 1
    `).run(
        effects.enabled ? 1 : 0,
        effects.speed || 1.0,
        effects.pitch || 1.0,
        effects.eq?.bass || 0,
        effects.eq?.mid || 0,
        effects.eq?.treble || 0,
        effects.reverb?.enabled ? 1 : 0,
        effects.reverb?.roomSize || 0.5,
        effects.reverb?.damping || 0.5,
        effects.reverb?.wetLevel || 0.3,
        effects.echo?.enabled ? 1 : 0,
        effects.echo?.delay || 300,
        effects.echo?.decay || 0.4,
        effects.delay?.enabled ? 1 : 0,
        effects.delay?.delay || 500,
        effects.delay?.feedback || 0.3,
        effects.distortion?.enabled ? 1 : 0,
        effects.distortion?.drive || 0.5,
        effects.compressor?.enabled ? 1 : 0,
        effects.compressor?.threshold || -20,
        effects.compressor?.ratio || 4,
        effects.limiter?.enabled ? 1 : 0,
        effects.limiter?.limit || -1,
        effects.preset || 'normal'
    );
}

module.exports = {
    // Songs
    getOrCreateSong,
    getSong,
    updateSong,
    updateSongVolumeGain,
    
    // Requesters
    getOrCreateRequester,
    getRequesters,
    
    // Queue
    getQueueItems,
    addQueueItem,
    removeQueueItem,
    reorderQueue,
    clearQueue,
    
    // Playback State
    getPlaybackState,
    updatePlaybackState,
    
    // Play History & Stats
    addPlayHistory,
    getPlayHistory,
    getTopArtists,
    getTopRequesters,
    getTopChannels,
    getHourlyDistribution,
    getStatsOverview,
    resetStats,
    
    // Groups
    getGroups,
    addGroup,
    removeGroup,
    updateGroupName,
    
    // Priority Users
    getPriorityUsers,
    isPriorityUser,
    addPriorityUser,
    removePriorityUser,
    updateVipName,
    
    // Mobile Access
    generateMobileToken,
    getMobileToken,
    setMobileToken,
    getVipByToken,
    storeDeviceFingerprint,
    verifyDeviceFingerprint,
    
    // Playlists
    getPlaylists,
    createPlaylist,
    addPlaylistItem,
    deletePlaylist,
    
    // Settings
    getSetting,
    setSetting,
    getAllSettings,
    
    // User Notification Preferences
    getUserNotificationPreference,
    setUserNotificationPreference,
    
    // User Language Preferences
    getUserLanguage,
    setUserLanguage,
    
    // Effects
    getEffects,
    updateEffects
};

