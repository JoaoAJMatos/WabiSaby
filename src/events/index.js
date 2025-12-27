/**
 * Event Contract
 * 
 * Centralized event definitions for event-driven architecture.
 * All components should use these constants to ensure consistency.
 */

// ============================================
// QUEUE EVENTS
// ============================================

/**
 * Emitted when a new item is added to the queue
 * Payload: { item: QueueItem }
 */
const QUEUE_ITEM_ADDED = 'queue_item_added';

/**
 * Emitted when an item is removed from the queue
 * Payload: { index: number, item: QueueItem }
 */
const QUEUE_ITEM_REMOVED = 'queue_item_removed';

/**
 * Emitted when queue items are reordered
 * Payload: { fromIndex: number, toIndex: number }
 */
const QUEUE_REORDERED = 'queue_reordered';

/**
 * Emitted when the queue is cleared
 * Payload: {}
 */
const QUEUE_CLEARED = 'queue_cleared';

/**
 * Emitted when queue state is updated (for UI updates)
 * Payload: {}
 */
const QUEUE_UPDATED = 'queue_updated';

// ============================================
// PLAYBACK EVENTS
// ============================================

/**
 * Emitted by PlaybackController when requesting Player to play a file
 * Payload: { filePath: string, startOffset?: number }
 */
const PLAYBACK_REQUESTED = 'playback_requested';

/**
 * Emitted by Player when playback actually starts
 * Payload: { filePath: string }
 */
const PLAYBACK_STARTED = 'playback_started';

/**
 * Emitted by Player when playback finishes
 * Payload: { filePath: string, reason: 'ended' | 'skipped' | 'error' }
 */
const PLAYBACK_FINISHED = 'playback_finished';

/**
 * Emitted by Player when playback encounters an error
 * Payload: { filePath: string, error: Error }
 */
const PLAYBACK_ERROR = 'playback_error';

/**
 * Emitted by PlaybackController to pause playback
 * Payload: {}
 */
const PLAYBACK_PAUSE = 'playback_pause';

/**
 * Emitted by Player when playback is paused
 * Payload: {}
 */
const PLAYBACK_PAUSED = 'playback_paused';

/**
 * Emitted by PlaybackController to resume playback
 * Payload: {}
 */
const PLAYBACK_RESUME = 'playback_resume';

/**
 * Emitted by Player when playback is resumed
 * Payload: {}
 */
const PLAYBACK_RESUMED = 'playback_resumed';

/**
 * Emitted by PlaybackController to seek to a position
 * Payload: { positionMs: number }
 */
const PLAYBACK_SEEK = 'playback_seek';

/**
 * Emitted by PlaybackController to skip current song
 * Payload: {}
 */
const PLAYBACK_SKIP = 'playback_skip';

/**
 * Emitted by PlaybackController when playback ends (song finished, skipped, etc.)
 * Payload: { success: boolean }
 */
const PLAYBACK_ENDED = 'playback_ended';

// ============================================
// EFFECTS EVENTS
// ============================================

/**
 * Emitted when audio effects are changed
 * Payload: {}
 */
const EFFECTS_CHANGED = 'effects_changed';

// ============================================
// WHATSAPP EVENTS
// ============================================

/**
 * Emitted when a command is received from WhatsApp
 * Payload: { command: string, args: string[], sender: string, remoteJid: string }
 */
const COMMAND_RECEIVED = 'command_received';

/**
 * Emitted when media is received from WhatsApp
 * Payload: { media: Buffer, sender: string, remoteJid: string, mimeType: string }
 */
const MEDIA_RECEIVED = 'media_received';

/**
 * Emitted when WhatsApp connection status changes
 * Payload: { connected: boolean, qrCode?: string }
 */
const CONNECTION_CHANGED = 'connection_changed';

// ============================================
// EXPORTS
// ============================================

const eventBus = require('./bus');

module.exports = {
    // Event bus singleton
    eventBus,
    
    // Queue events
    QUEUE_ITEM_ADDED,
    QUEUE_ITEM_REMOVED,
    QUEUE_REORDERED,
    QUEUE_CLEARED,
    QUEUE_UPDATED,
    
    // Playback events
    PLAYBACK_REQUESTED,
    PLAYBACK_STARTED,
    PLAYBACK_FINISHED,
    PLAYBACK_ERROR,
    PLAYBACK_PAUSE,
    PLAYBACK_PAUSED,
    PLAYBACK_RESUME,
    PLAYBACK_RESUMED,
    PLAYBACK_SEEK,
    PLAYBACK_SKIP,
    PLAYBACK_ENDED,
    
    // Effects events
    EFFECTS_CHANGED,
    
    // WhatsApp events
    COMMAND_RECEIVED,
    MEDIA_RECEIVED,
    CONNECTION_CHANGED
};

