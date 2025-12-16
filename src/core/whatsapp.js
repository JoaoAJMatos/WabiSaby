const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { pino } = require('pino');
const config = require('../config');
const { logger } = require('../utils/logger.util');
const { sendMessageWithMention } = require('../utils/helpers.util');
const { handleCommand } = require('../commands/handler');
const queueManager = require('./queue');
const { processQueueItem, prefetchNext } = require('./player');
const { updateAuthStatus, updateVipName, setWhatsAppSocket } = require('../api/server');
const notificationService = require('../services/notification.service');
const { checkPriority } = require('../services/priority.service');
const { downloadMedia, isAudioMessage } = require('../services/media.service');
const groupsService = require('../services/groups.service');

/**
 * WhatsApp Connection Module
 * Handles WhatsApp authentication, connection, and message handling
 */

let isConnected = false;

/**
 * Get connection status
 * @returns {boolean}
 */
function getConnectionStatus() {
    return isConnected;
}

/**
 * Connect to WhatsApp
 * @returns {Promise<Object>} - WhatsApp socket
 */
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(config.paths.auth);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: [config.whatsapp.browserName, 'Chrome', config.whatsapp.browserVersion]
    });

    queueManager.removeAllListeners('play_next');
    queueManager.removeAllListeners('skip_current');
    queueManager.removeAllListeners('pause_current');
    queueManager.removeAllListeners('resume_current');
    queueManager.removeAllListeners('queue_updated');

    queueManager.on('play_next', async (item) => {
        await processQueueItem(sock, item, isConnected);
    });
    
    // Automatically start prefetching when queue is updated
    queueManager.on('queue_updated', () => {
        // Start prefetching in the background (don't wait for it)
        prefetchNext().catch(err => logger.error('Auto-prefetch error:', err));
    });

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Update Web UI status
        if (connection) {
            updateAuthStatus(connection, qr);
        } else if (qr) {
            updateAuthStatus('qr', qr);
        }

        if (connection === 'close') {
            isConnected = false;
            updateAuthStatus('close', null);
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.error('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isConnected = true;
            updateAuthStatus('open', null);
            logger.info('Opened connection');
            
            // Migrate from TARGET_GROUP_ID to groups.json if needed
            groupsService.migrateFromTargetGroupId();
            
            // Initialize notification service
            notificationService.initialize(sock);
            
            // Set WhatsApp socket for profile picture fetching
            setWhatsAppSocket(sock);
            
            // Check if there are items in the queue from a previous session and start playing
            if (queueManager.getQueue().length > 0) {
                logger.info('Resuming queue from persistence...');
                queueManager.processQueue();
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const senderName = msg.pushName || null;
        console.log('Incoming message from JID:', remoteJid, 'Sender:', sender, 'Name:', senderName);
        
        // Update VIP name if this is a VIP user
        if (senderName) {
            updateVipName(sender, senderName);
        }
        
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        // Handle Text Commands
        // Allow !ping from ANY group (even unmonitored) for group discovery
        if (messageContent && messageContent.startsWith('!')) {
            const command = messageContent.trim().split(' ')[0].toLowerCase();
            if (command === '!ping') {
                // Allow ping from any group
                await handleCommand(sock, msg, messageContent);
                return;
            }
        }
        
        // Filter by monitored groups
        const groups = groupsService.getGroups();
        const isMonitored = groupsService.isGroupMonitored(remoteJid);
        
        // If we have groups configured, only process messages from monitored groups
        if (groups.length > 0 && !isMonitored) {
            return;
        }
        
        // Backward compatibility: if no groups exist but TARGET_GROUP_ID is set
        const TARGET_GROUP_ID = config.whatsapp.targetGroupId;
        if (groups.length === 0 && TARGET_GROUP_ID && remoteJid !== TARGET_GROUP_ID) {
            return;
        }

        // Handle Text Commands (for monitored groups)
        if (messageContent && messageContent.startsWith('!')) {
            await handleCommand(sock, msg, messageContent);
            return;
        }
        
        // Handle Media Messages (VIP only - audio files)
        if (isAudioMessage(msg)) {
            const isVip = checkPriority(sender);
            
            if (!isVip) {
                await sendMessageWithMention(sock, remoteJid, 'Only VIP users can send audio files directly.', sender);
                return;
            }
            
            try {
                logger.info(`VIP ${senderName || sender} sent audio file, downloading...`);
                
                const mediaResult = await downloadMedia(sock, msg);
                
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
                
                await sendMessageWithMention(sock, remoteJid, `Added audio file: ${displayName}`, sender);
                logger.info(`Successfully added audio file to queue: ${displayName}`);
            } catch (error) {
                logger.error('Error processing VIP audio file:', error);
                const errorMessage = error.message || 'Failed to process audio file';
                await sendMessageWithMention(sock, remoteJid, `Error: ${errorMessage}`, sender);
            }
            return;
        }
    });
    
    return sock;
}

module.exports = {
    connectToWhatsApp,
    getConnectionStatus
};

