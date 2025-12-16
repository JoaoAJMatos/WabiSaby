const EventEmitter = require('events');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { pino } = require('pino');
const config = require('../config');
const { logger } = require('../utils/logger.util');
const { isAudioMessage } = require('../services/media.service');
const groupsService = require('../services/groups.service');
const { COMMAND_RECEIVED, MEDIA_RECEIVED, CONNECTION_CHANGED } = require('./events');

/**
 * WhatsApp Connection Module
 * 
 * Handles WhatsApp authentication, connection, and message I/O.
 * Emits events for commands and media - business logic handled elsewhere.
 */
class WhatsAppAdapter extends EventEmitter {
    constructor() {
        super();
        this.isConnected = false;
        this.socket = null;
    }
    
    /**
     * Get connection status
     * @returns {boolean}
     */
    getConnectionStatus() {
        return this.isConnected;
    }
    
    /**
     * Connect to WhatsApp
     * @returns {Promise<Object>} - WhatsApp socket
     */
    async connectToWhatsApp() {
        // Lazy load server functions to avoid circular dependency
        const { updateAuthStatus, updateVipName, setWhatsAppSocket } = require('../api/server');
        
        const { state, saveCreds } = await useMultiFileAuthState(config.paths.auth);

        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: [config.whatsapp.browserName, 'Chrome', config.whatsapp.browserVersion]
        });
        
        this.socket = sock;

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
                this.isConnected = false;
                updateAuthStatus('close', null);
                this.emit(CONNECTION_CHANGED, { connected: false });
                
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                logger.error('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                if (shouldReconnect) {
                    this.connectToWhatsApp();
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                updateAuthStatus('open', null);
                logger.info('Opened connection');
                
                // Migrate from TARGET_GROUP_ID to groups.json if needed
                groupsService.migrateFromTargetGroupId();
                
                // Set WhatsApp socket for profile picture fetching
                setWhatsAppSocket(sock);
                
                // Emit connection changed event
                this.emit(CONNECTION_CHANGED, { connected: true });
            } else if (qr) {
                // Emit QR code
                this.emit(CONNECTION_CHANGED, { connected: false, qrCode: qr });
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
            if (messageContent && messageContent.startsWith('!')) {
                const commandParts = messageContent.trim().split(' ');
                const command = commandParts[0].toLowerCase();
                const args = commandParts.slice(1);
                
                // Filter by monitored groups (except !ping which is allowed from any group)
                if (command !== '!ping') {
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
                }
                
                // Emit command received event
                this.emit(COMMAND_RECEIVED, {
                    command,
                    args,
                    sender,
                    remoteJid,
                    message: msg,
                    socket: sock
                });
                return;
            }
            
            // Handle Media Messages
            if (isAudioMessage(msg)) {
                // Filter by monitored groups
                const groups = groupsService.getGroups();
                const isMonitored = groupsService.isGroupMonitored(remoteJid);
                
                if (groups.length > 0 && !isMonitored) {
                    return;
                }
                
                const TARGET_GROUP_ID = config.whatsapp.targetGroupId;
                if (groups.length === 0 && TARGET_GROUP_ID && remoteJid !== TARGET_GROUP_ID) {
                    return;
                }
                
                // Emit media received event
                this.emit(MEDIA_RECEIVED, {
                    media: msg,
                    sender,
                    remoteJid,
                    socket: sock
                });
                return;
            }
        });
        
        return sock;
    }
}

module.exports = new WhatsAppAdapter();
