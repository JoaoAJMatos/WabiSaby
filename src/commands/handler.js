const { logger } = require('../utils/logger.util');
const { sendMessageWithMention } = require('../utils/helpers.util');
const { deps } = require('./dependencies');
const { t: i18n } = require('../utils/i18n.util');
const dbService = require('../database/db.service');
const playCommand = require('./implementations/play');
const skipCommand = require('./implementations/skip');
const queueCommand = require('./implementations/queue');
const removeCommand = require('./implementations/remove');
const nowPlayingCommand = require('./implementations/nowplaying');
const helpCommand = require('./implementations/help');
const notificationsCommand = require('./implementations/notifications');
const playlistCommand = require('./implementations/playlist');
const { pingCommand } = require('./implementations/ping');
const languageCommand = require('./implementations/language');

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
    PING: '!ping',
    LANGUAGE: '!language',
    LANG: '!lang'
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
    
    // Get user's language preference
    const userLang = dbService.getUserLanguage(sender);
    
    // Create deps with language context
    const depsWithLang = {
        ...deps,
        userLang
    };

    try {
        switch (command) {
            case COMMANDS.PLAY:
                await playCommand(sock, msg, args, depsWithLang);
                break;

            case COMMANDS.SKIP:
                await skipCommand(sock, msg, args, depsWithLang);
                break;

            case COMMANDS.QUEUE:
                await queueCommand(sock, msg, args, depsWithLang);
                break;

            case COMMANDS.REMOVE:
                await removeCommand(sock, msg, args, depsWithLang);
                break;

            case COMMANDS.NP:
                await nowPlayingCommand(sock, msg, args, depsWithLang);
                break;
                
            case COMMANDS.HELP:
                await helpCommand(sock, msg, args, depsWithLang);
                break;
                
            case COMMANDS.NOTIFICATIONS:
                await notificationsCommand(sock, msg, args, depsWithLang);
                break;
                
            case COMMANDS.PLAYLIST:
                await playlistCommand(sock, msg, args, depsWithLang);
                break;
                
            case COMMANDS.PING:
                await pingCommand(sock, msg, depsWithLang);
                break;
                
            case COMMANDS.LANGUAGE:
            case COMMANDS.LANG:
                await languageCommand(sock, msg, args, depsWithLang);
                break;
                
            default:
                await sendMessageWithMention(sock, remoteJid, i18n('commands.unknown', userLang, { command }), sender);
        }
    } catch (error) {
        logger.error('Error handling command:', error);
        await sendMessageWithMention(sock, remoteJid, i18n('commands.error', userLang), sender);
    }
}

module.exports = { handleCommand };

