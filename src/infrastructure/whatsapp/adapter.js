const EventEmitter = require('events');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { pino } = require('pino');
const config = require('../../config');
const { logger } = require('../../utils/logger.util');
const services = require('../../services');
const { eventBus, COMMAND_RECEIVED, MEDIA_RECEIVED, CONNECTION_CHANGED } = require('../../events');

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
        this.updateAuthStatus = null;
        this.updateVipName = null;
        this.setWhatsAppSocket = null;
    }
    
    /**
     * Get connection status
     * @returns {boolean}
     */
    getConnectionStatus() {
        return this.isConnected;
    }
    
    /**
     * Set callback functions (to avoid circular dependency)
     * @param {Function} updateAuthStatusFn - Function to update auth status
     * @param {Function} updateVipNameFn - Function to update VIP name
     * @param {Function} setWhatsAppSocketFn - Function to set WhatsApp socket
     */
    setCallbacks(updateAuthStatusFn, updateVipNameFn, setWhatsAppSocketFn) {
        this.updateAuthStatus = updateAuthStatusFn;
        this.updateVipName = updateVipNameFn;
        this.setWhatsAppSocket = setWhatsAppSocketFn;
    }

    /**
     * Connect to WhatsApp
     * @returns {Promise<Object>} - WhatsApp socket
     */
    async connectToWhatsApp() {
        try {
            logger.info('Starting connectToWhatsApp...');
            
            // Check if callbacks are set
            if (!this.updateAuthStatus || !this.updateVipName || !this.setWhatsAppSocket) {
                throw new Error('WhatsApp adapter callbacks not set. Call setCallbacks() first.');
            }
            
            const updateAuthStatus = this.updateAuthStatus;
            const updateVipName = this.updateVipName;
            const setWhatsAppSocket = this.setWhatsAppSocket;
            
            logger.info('Loading auth state from:', config.paths.auth);
            const fs = require('fs');
            logger.info('Auth path exists:', fs.existsSync(config.paths.auth));
            
            let state, saveCreds;
            try {
                const authResult = await useMultiFileAuthState(config.paths.auth);
                state = authResult.state;
                saveCreds = authResult.saveCreds;
                logger.info('Auth state loaded successfully');
            } catch (authError) {
                logger.error('Error loading auth state:', authError);
                logger.error('Auth error type:', typeof authError);
                logger.error('Auth error:', String(authError));
                if (authError && authError.message) {
                    logger.error('Auth error message:', authError.message);
                }
                if (authError && authError.stack) {
                    logger.error('Auth error stack:', authError.stack);
                }
                throw authError;
            }

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
                    if (updateAuthStatus) {
                        updateAuthStatus('close', null);
                    }
                    
                    const disconnectReason = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = disconnectReason !== DisconnectReason.loggedOut;
                    
                    logger.warn({
                        component: 'whatsapp',
                        context: {
                            event: 'connection_closed',
                            disconnectReason,
                            shouldReconnect,
                            error: lastDisconnect?.error?.message || 'Unknown error'
                        }
                    }, 'WhatsApp connection closed');
                    
                    this.emit(CONNECTION_CHANGED, { connected: false });
                    eventBus.emit(CONNECTION_CHANGED, { connected: false });
                    
                    if (shouldReconnect) {
                        logger.info({
                            component: 'whatsapp',
                            context: { event: 'reconnecting' }
                        }, 'Reconnecting to WhatsApp...');
                        this.connectToWhatsApp();
                    } else {
                        logger.error({
                            component: 'whatsapp',
                            context: {
                                event: 'logged_out',
                                reason: 'User logged out from another device'
                            }
                        }, 'WhatsApp logged out - manual reconnection required');
                    }
                } else if (connection === 'open') {
                    this.isConnected = true;
                    if (updateAuthStatus) {
                        updateAuthStatus('open', null);
                    }
                    
                    logger.info({
                        component: 'whatsapp',
                        context: { event: 'connection_opened' }
                    }, 'WhatsApp connection opened');
                    
                    // Migrate from TARGET_GROUP_ID to groups.json if needed
                    if (services?.user?.groups?.migrateFromTargetGroupId) {
                        try {
                            services.user.groups.migrateFromTargetGroupId();
                            logger.info({
                                component: 'whatsapp',
                                context: { event: 'groups_migrated' }
                            }, 'Migrated groups from TARGET_GROUP_ID');
                        } catch (err) {
                            logger.warn({
                                component: 'whatsapp',
                                context: {
                                    event: 'group_migration_error',
                                    error: err.message
                                }
                            }, 'Error migrating groups:', err);
                        }
                    }
                    
                    // Set WhatsApp socket for profile picture fetching
                    if (setWhatsAppSocket) {
                        setWhatsAppSocket(sock);
                    }
                    
                    // Emit connection changed event
                    this.emit(CONNECTION_CHANGED, { connected: true });
                    eventBus.emit(CONNECTION_CHANGED, { connected: true });
                } else if (qr) {
                    logger.info({
                        component: 'whatsapp',
                        context: { event: 'qr_code_generated' }
                    }, 'WhatsApp QR code generated');
                    
                    // Emit QR code
                    this.emit(CONNECTION_CHANGED, { connected: false, qrCode: qr });
                    eventBus.emit(CONNECTION_CHANGED, { connected: false, qrCode: qr });
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
                const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;
                
                // Log incoming message
                logger.debug({
                    component: 'whatsapp',
                    context: {
                        event: 'message_received',
                        remoteJid,
                        sender,
                        senderName,
                        hasText: !!messageContent,
                        hasMedia: !!(msg.message.audioMessage || msg.message.videoMessage || msg.message.imageMessage)
                    }
                }, 'Incoming WhatsApp message');
                
                // Update VIP name if this is a VIP user
                if (senderName && updateVipName) {
                    try {
                        updateVipName(sender, senderName);
                    } catch (err) {
                        logger.warn('Error updating VIP name:', err);
                    }
                }
                
                // Handle Text Commands
                if (messageContent && messageContent.startsWith('!')) {
                    const commandParts = messageContent.trim().split(' ');
                    const command = commandParts[0].toLowerCase();
                    const args = commandParts.slice(1);
                    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    
                    // Filter by monitored groups (except !ping which is allowed from any group)
                    if (command !== '!ping') {
                        if (services?.user?.groups) {
                            const groups = services.user.groups.getGroups();
                            const isMonitored = services.user.groups.isGroupMonitored(remoteJid);
                            
                            // If we have groups configured, only process messages from monitored groups
                            if (groups.length > 0 && !isMonitored) {
                                logger.debug({
                                    component: 'whatsapp',
                                    context: {
                                        command,
                                        commandId,
                                        sender,
                                        groupId: remoteJid,
                                        reason: 'group_not_monitored'
                                    }
                                }, 'Command ignored - group not monitored');
                                return;
                            }
                            
                            // Backward compatibility: if no groups exist but TARGET_GROUP_ID is set
                            const TARGET_GROUP_ID = config.whatsapp.targetGroupId;
                            if (groups.length === 0 && TARGET_GROUP_ID && remoteJid !== TARGET_GROUP_ID) {
                                logger.debug({
                                    component: 'whatsapp',
                                    context: {
                                        command,
                                        commandId,
                                        sender,
                                        groupId: remoteJid,
                                        reason: 'target_group_mismatch'
                                    }
                                }, 'Command ignored - target group mismatch');
                                return;
                            }
                        }
                    }
                    
                    // Log command received
                    logger.info({
                        component: 'whatsapp',
                        context: {
                            command,
                            commandId,
                            args,
                            sender,
                            groupId: remoteJid,
                            senderName
                        }
                    }, 'WhatsApp command received');
                    
                    // Emit command received event
                    const commandPayload = {
                        command,
                        args,
                        sender,
                        remoteJid,
                        message: msg,
                        socket: sock
                    };
                    this.emit(COMMAND_RECEIVED, commandPayload);
                    eventBus.emit(COMMAND_RECEIVED, commandPayload);
                    return;
                }
                
                // Handle Media Messages
                if (services?.media?.isAudioMessage && services.media.isAudioMessage(msg)) {
                    // Filter by monitored groups
                    if (services?.user?.groups) {
                        const groups = services.user.groups.getGroups();
                        const isMonitored = services.user.groups.isGroupMonitored(remoteJid);
                        
                        if (groups.length > 0 && !isMonitored) {
                            logger.debug({
                                component: 'whatsapp',
                                context: {
                                    event: 'media_ignored',
                                    sender,
                                    groupId: remoteJid,
                                    reason: 'group_not_monitored'
                                }
                            }, 'Media message ignored - group not monitored');
                            return;
                        }
                        
                        const TARGET_GROUP_ID = config.whatsapp.targetGroupId;
                        if (groups.length === 0 && TARGET_GROUP_ID && remoteJid !== TARGET_GROUP_ID) {
                            logger.debug({
                                component: 'whatsapp',
                                context: {
                                    event: 'media_ignored',
                                    sender,
                                    groupId: remoteJid,
                                    reason: 'target_group_mismatch'
                                }
                            }, 'Media message ignored - target group mismatch');
                            return;
                        }
                    }
                    
                    // Log media received
                    const mediaType = msg.message.audioMessage ? 'audio' : 
                                    msg.message.videoMessage ? 'video' : 
                                    msg.message.imageMessage ? 'image' : 'unknown';
                    
                    logger.info({
                        component: 'whatsapp',
                        context: {
                            event: 'media_received',
                            mediaType,
                            sender,
                            groupId: remoteJid,
                            senderName
                        }
                    }, 'WhatsApp media message received');
                    
                    // Emit media received event
                    const mediaPayload = {
                        media: msg,
                        sender,
                        remoteJid,
                        socket: sock
                    };
                    this.emit(MEDIA_RECEIVED, mediaPayload);
                    eventBus.emit(MEDIA_RECEIVED, mediaPayload);
                    return;
                }
            });
            
            return sock;
        } catch (error) {
            logger.error({
                component: 'whatsapp',
                context: {
                    event: 'connection_error',
                    error: {
                        message: error?.message || 'Unknown error',
                        stack: error?.stack,
                        name: error?.name,
                        type: typeof error
                    }
                }
            }, 'Error connecting to WhatsApp:', error);
            throw error || new Error('Unknown error in connectToWhatsApp');
        }
    }
}

module.exports = new WhatsAppAdapter();
