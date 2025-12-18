const { logger } = require('../utils/logger.util');
const whatsappAdapter = require('./whatsapp');
const playbackController = require('./playback.controller');
const queueManager = require('./queue');
const { handleCommand } = require('../commands/handler');
const { downloadMedia } = require('../services/media.service');
const { checkPriority } = require('../services/priority.service');
const { sendMessageWithMention } = require('../utils/helpers.util');
const notificationService = require('../services/notification.service');
const {
    COMMAND_RECEIVED,
    MEDIA_RECEIVED,
    CONNECTION_CHANGED
} = require('./events');

/**
 * SystemCoordinator
 * 
 * Orchestrates all components via events.
 * Wires together WhatsApp, PlaybackController, QueueManager, and command handlers.
 */
class SystemCoordinator {
    constructor() {
        this.initialized = false;
    }
    
    /**
     * Initialize the system - wire all components together
     */
    async initialize() {
        if (this.initialized) {
            logger.warn('SystemCoordinator already initialized');
            return;
        }
        
        logger.info('Initializing SystemCoordinator...');
        
        // Set up WhatsApp event listeners
        this.setupWhatsAppListeners();
        
        // Set up PlaybackController event listeners
        this.setupPlaybackControllerListeners();
        
        // Connect to WhatsApp
        await whatsappAdapter.connectToWhatsApp();
        
        this.initialized = true;
        logger.info('SystemCoordinator initialized');
    }
    
    /**
     * Set up WhatsApp event listeners
     */
    setupWhatsAppListeners() {
        // Handle commands
        whatsappAdapter.on(COMMAND_RECEIVED, async ({ command, args, sender, remoteJid, message, socket }) => {
            // Reconstruct command text for handleCommand
            const commandText = `${command} ${args.join(' ')}`.trim();
            await handleCommand(socket, message, commandText);
        });
        
        // Handle media messages
        whatsappAdapter.on(MEDIA_RECEIVED, async ({ media, sender, remoteJid, socket }) => {
            const senderName = media.pushName || null;
            const isVip = checkPriority(sender);
            
            if (!isVip) {
                await sendMessageWithMention(socket, remoteJid, '🔒 *VIP Only*\n\nOnly VIP users can send audio files directly.\n\n✨ Contact an admin to get VIP access!', sender);
                return;
            }
            
            try {
                logger.info(`VIP ${senderName || sender} sent audio file, downloading...`);
                
                const mediaResult = await downloadMedia(socket, media);
                
                // Extract filename for display
                const displayName = mediaResult.originalFilename || mediaResult.filename;
                
                // Add to queue with priority (VIP priority is handled automatically by queueManager.add)
                queueManager.add({
                    type: 'file',
                    content: mediaResult.filePath,
                    title: displayName,
                    artist: '',
                    requester: senderName || 'VIP User',
                    remoteJid: remoteJid,
                    sender: sender
                });
                
                await sendMessageWithMention(socket, remoteJid, `✅ *Audio File Added*\n\n🎵 *"${displayName}"*\n\nAdded to queue with VIP priority!`, sender);
                logger.info(`Successfully added audio file to queue: ${displayName}`);
            } catch (error) {
                logger.error('Error processing VIP audio file:', error);
                const errorMessage = error.message || 'Failed to process audio file';
                await sendMessageWithMention(socket, remoteJid, `❌ *Processing Error*\n\n*${errorMessage}*\n\n💡 Make sure the file is a valid audio format.`, sender);
            }
        });
        
        // Handle connection changes
        whatsappAdapter.on(CONNECTION_CHANGED, ({ connected, qrCode }) => {
            // Update PlaybackController with connection status
            playbackController.initialize(whatsappAdapter.socket, connected);
            
            if (connected) {
                // Initialize notification service
                notificationService.initialize(whatsappAdapter.socket);
                
                // Check if there are items in the queue from a previous session and start playing
                if (queueManager.getQueue().length > 0) {
                    logger.info('Resuming queue from persistence...');
                    playbackController.processNext();
                }
            }
        });
    }
    
    /**
     * Set up PlaybackController event listeners
     */
    setupPlaybackControllerListeners() {
        // PlaybackController already sets up its own listeners in setupListeners()
        // State persistence is handled by PlaybackStatePersistence in the controller constructor
        // This method is here for future expansion if needed
    }
}

module.exports = new SystemCoordinator();

