/**
 * Centralized Event Listener Registry
 * 
 * All event listeners are registered here using the centralized event bus.
 * This provides:
 * - Single source of truth for all event wiring
 * - Clear initialization order
 * - Easier debugging (all events go through one bus)
 * - Decoupled components (components don't need direct references)
 */

const { logger } = require('../../utils/logger.util');
const { eventBus } = require('../');
const {
    // Queue events
    QUEUE_ITEM_ADDED,
    QUEUE_UPDATED,
    QUEUE_ITEM_REMOVED,
    // Playback events
    PLAYBACK_STARTED,
    PLAYBACK_FINISHED,
    PLAYBACK_ERROR,
    PLAYBACK_REQUESTED,
    PLAYBACK_SKIP,
    PLAYBACK_PAUSE,
    PLAYBACK_RESUME,
    PLAYBACK_SEEK,
    // Effects events
    EFFECTS_CHANGED,
    // WhatsApp events
    COMMAND_RECEIVED,
    MEDIA_RECEIVED,
    CONNECTION_CHANGED
} = require('../');

class EventListenerRegistry {
    constructor() {
        this.initialized = false;
        this.listeners = []; // Track listeners for cleanup
    }

    /**
     * Register all event listeners
     * Should be called after all services are initialized
     */
    async registerAll() {
        if (this.initialized) {
            logger.warn('Event listeners already registered');
            return;
        }

        logger.info('Registering event listeners via event bus...');

        // Register in dependency order
        this.registerPlaybackListeners();
        this.registerQueueListeners();
        this.registerWhatsAppListeners();
        this.registerNotificationListeners();
        this.registerEffectsListeners();

        this.initialized = true;
        logger.info(`Registered ${this.listeners.length} event listeners`);
    }

    registerPlaybackListeners() {
        const services = require('../../services');
        const player = require('../../infrastructure/player');
        const orchestrator = services.playback.orchestrator;

        // Playback orchestrator requests playback
        this.on(PLAYBACK_REQUESTED, ({ filePath, startOffset = 0 }) => {
            player.playFile(filePath, startOffset).catch(err => {
                logger.error('Failed to play file:', err);
                eventBus.emit(PLAYBACK_ERROR, { filePath, error: err });
            });
        });

        // Skip handler
        this.on(PLAYBACK_SKIP, async () => {
            logger.info('Skip requested via event bus');
            const playerInstance = player.getPlayerInstance();
            if (!playerInstance) return;

            const filePathToEmit = playerInstance.getCurrentFilePath?.() || null;
            await playerInstance.stop();

            if (filePathToEmit) {
                eventBus.emit(PLAYBACK_FINISHED, {
                    filePath: filePathToEmit,
                    reason: 'skipped'
                });
            }
        });

        // Effects changed - update player
        this.on(EFFECTS_CHANGED, () => {
            const playerInstance = player.getPlayerInstance();
            if (!playerInstance) return;
            
            const MpvPlayer = require('../../infrastructure/player/mpv');
            const FfplayPlayer = require('../../infrastructure/player/ffplay');
            
            if (playerInstance instanceof MpvPlayer && playerInstance.isSocketConnected()) {
                playerInstance.updateFilters().catch(err => {
                    logger.error('Failed to update MPV filters:', err);
                });
            } else if (playerInstance instanceof FfplayPlayer && playerInstance.process && !playerInstance.process.killed) {
                logger.info('Effects changed - restarting playback');
                playerInstance.stop();
            }
        });

        // Playback started/finished/error -> orchestrator state updates
        this.on(PLAYBACK_STARTED, ({ filePath }) => {
            if (orchestrator.currentSong) {
                orchestrator.isPlaying = true;
                orchestrator.isPaused = false;
                orchestrator.emitStateChanged();
            }
        });

        this.on(PLAYBACK_ERROR, ({ filePath, error }) => {
            logger.error('Playback error:', error);
            orchestrator.handlePlaybackFinished(false);
        });
    }

    registerQueueListeners() {
        const services = require('../../services');
        const orchestrator = services.playback.orchestrator;
        const queue = services.playback.queue;

        // Queue item added - auto-play if not playing
        this.on(QUEUE_ITEM_ADDED, ({ item }) => {
            if (!orchestrator.isPlaying && !orchestrator.isProcessing && queue.getQueue().length > 0) {
                orchestrator.processNext();
            }
            // Trigger prefetch
            services.playback.prefetch.prefetchNext()
                .catch(err => logger.error('Auto-prefetch error:', err));
        });

        // Queue updated - trigger prefetch
        this.on(QUEUE_UPDATED, () => {
            services.playback.prefetch.prefetchNext()
                .catch(err => logger.error('Prefetch error:', err));
        });
    }

    registerWhatsAppListeners() {
        const infrastructure = require('../../infrastructure');
        const whatsappAdapter = infrastructure.whatsapp.adapter;
        const services = require('../../services');
        const { handleCommand } = require('../../commands/handler');
        const { sendMessageWithMention } = require('../../utils/helpers.util');

        // WhatsApp adapter already emits to eventBus directly, so we just listen to bus events
        // Handle command via bus
        this.on(COMMAND_RECEIVED, async ({ command, args, sender, remoteJid, message, socket }) => {
            try {
                const commandText = `${command} ${args.join(' ')}`.trim();
                await handleCommand(socket, message, commandText);
            } catch (error) {
                logger.error('Error handling command:', error);
            }
        });

        // Handle media via bus
        this.on(MEDIA_RECEIVED, async ({ media, sender, remoteJid, socket }) => {
            const senderName = media.pushName || null;
            const isVip = services.user.priority.checkPriority(sender);
            
            if (!isVip) {
                await sendMessageWithMention(socket, remoteJid, 
                    '🔒 *VIP Only*\n\nOnly VIP users can send audio files directly.\n\n✨ Contact an admin to get VIP access!', sender);
                return;
            }
            
            try {
                logger.info(`VIP ${senderName || sender} sent audio file, downloading...`);
                const mediaResult = await services.media.downloadMedia(socket, media);
                const displayName = mediaResult.originalFilename || mediaResult.filename;
                
                services.playback.queue.add({
                    type: 'file',
                    content: mediaResult.filePath,
                    title: displayName,
                    artist: '',
                    requester: senderName || 'VIP User',
                    remoteJid: remoteJid,
                    sender: sender
                });
                
                await sendMessageWithMention(socket, remoteJid, 
                    `✅ *Audio File Added*\n\n🎵 *"${displayName}"*\n\nAdded to queue with VIP priority!`, sender);
            } catch (error) {
                logger.error('Error processing VIP audio file:', error);
                const errorMessage = error.message || 'Failed to process audio file';
                await sendMessageWithMention(socket, remoteJid, 
                    `❌ *Processing Error*\n\n*${errorMessage}*\n\n💡 Make sure the file is a valid audio format.`, sender);
            }
        });

        // Handle connection changes via bus
        this.on(CONNECTION_CHANGED, async ({ connected, qrCode }) => {
            if (connected) {
                services.system.notification.initialize(whatsappAdapter.socket, connected);
                if (services.playback.queue.getQueue().length > 0) {
                    logger.info('Resuming queue from persistence...');
                    await services.playback.orchestrator.processNext();
                }
            }
        });
    }

    registerNotificationListeners() {
        const services = require('../../services');

        this.on(QUEUE_UPDATED, async () => {
            await services.system.notification.checkAndNotifyUpcomingSongs();
        });
    }

    registerEffectsListeners() {
        // Effects service will emit to bus, listeners already registered above
    }

    /**
     * Helper to register listener and track it
     */
    on(event, handler) {
        eventBus.on(event, handler);
        this.listeners.push({ event, handler });
    }

    /**
     * Remove all listeners (useful for testing)
     */
    unregisterAll() {
        this.listeners.forEach(({ event, handler }) => {
            eventBus.removeListener(event, handler);
        });
        this.listeners = [];
        this.initialized = false;
    }
}

module.exports = new EventListenerRegistry();

