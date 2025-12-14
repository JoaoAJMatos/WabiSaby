const { logger } = require('../utils/logger');
const { sendMessageWithMention } = require('../utils/helpers');
const playCommand = require('./implementations/play');
const skipCommand = require('./implementations/skip');
const queueCommand = require('./implementations/queue');
const removeCommand = require('./implementations/remove');
const nowPlayingCommand = require('./implementations/nowplaying');
const helpCommand = require('./implementations/help');
const notificationsCommand = require('./implementations/notifications');
const playlistCommand = require('./implementations/playlist');
const { pingCommand } = require('./implementations/ping');

/**
 * Command Handler
 * Routes incoming commands to their implementations
 */

const COMMANDS = {
    PLAY: '!play',
    SKIP: '!skip',
    QUEUE: '!queue',
    REMOVE: '!remove',
    NP: '!np',
    HELP: '!help',
    NOTIFICATIONS: '!notifications',
    PLAYLIST: '!playlist',
    PING: '!ping'
};

/**
 * Handle incoming command
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} text - Command text
 */
async function handleCommand(sock, msg, text) {
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const [command, ...args] = text.trim().split(' ');

    try {
        switch (command) {
            case COMMANDS.PLAY:
                await playCommand(sock, msg, args);
                break;

            case COMMANDS.SKIP:
                await skipCommand(sock, msg, args);
                break;

            case COMMANDS.QUEUE:
                await queueCommand(sock, msg, args);
                break;

            case COMMANDS.REMOVE:
                await removeCommand(sock, msg, args);
                break;

            case COMMANDS.NP:
                await nowPlayingCommand(sock, msg, args);
                break;
                
            case COMMANDS.HELP:
                await helpCommand(sock, msg, args);
                break;
                
            case COMMANDS.NOTIFICATIONS:
                await notificationsCommand(sock, msg, args);
                break;
                
            case COMMANDS.PLAYLIST:
                await playlistCommand(sock, msg, args);
                break;
                
            case COMMANDS.PING:
                await pingCommand(sock, msg);
                break;
                
            default:
                await sendMessageWithMention(sock, remoteJid, `Unknown command: ${command}. Type !help for commands.`, sender);
        }
    } catch (error) {
        logger.error('Error handling command:', error);
        await sendMessageWithMention(sock, remoteJid, 'Error processing command.', sender);
    }
}

module.exports = { handleCommand };

