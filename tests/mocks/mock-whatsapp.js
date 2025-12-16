/**
 * Mock WhatsApp Connection
 * Simulates WhatsApp message sending and connection state
 */

const EventEmitter = require('events');

class MockWhatsApp extends EventEmitter {
    constructor() {
        super();
        this.isConnected = false;
        this.sentMessages = [];
        this.qrCode = null;
        this.connectionState = 'disconnected';
    }

    async connect() {
        this.connectionState = 'connecting';
        this.emit('connection.update', { connection: 'connecting' });

        // Simulate QR code generation
        setTimeout(() => {
            this.qrCode = 'test_qr_code';
            this.emit('qr', this.qrCode);
        }, 100);

        // Simulate connection after delay
        setTimeout(() => {
            this.isConnected = true;
            this.connectionState = 'open';
            this.emit('connection.update', { connection: 'open' });
        }, 500);
    }

    async sendMessage(remoteJid, messageOptions) {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }

        const message = {
            remoteJid,
            text: messageOptions.text || '',
            mentions: messageOptions.mentions || [],
            timestamp: Date.now()
        };

        this.sentMessages.push(message);
        this.emit('message.sent', message);

        return Promise.resolve({
            key: {
                remoteJid,
                id: `msg_${Date.now()}`,
                fromMe: true
            }
        });
    }

    getConnectionStatus() {
        return this.isConnected;
    }

    getQRCode() {
        return this.qrCode;
    }

    getSentMessages() {
        return [...this.sentMessages];
    }

    // Test utilities
    _simulateDisconnect() {
        this.isConnected = false;
        this.connectionState = 'close';
        this.emit('connection.update', { connection: 'close' });
    }

    _simulateReconnect() {
        this.isConnected = true;
        this.connectionState = 'open';
        this.emit('connection.update', { connection: 'open' });
    }

    _clearSentMessages() {
        this.sentMessages = [];
    }
}

module.exports = MockWhatsApp;

