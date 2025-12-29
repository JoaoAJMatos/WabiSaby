const { deps: defaultDeps } = require('../dependencies');

/**
 * !lyrics command - Toggle lyrics display in the fullscreen player
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function lyricsCommand(sock, msg, args, deps = defaultDeps) {
    const { sendMessageWithMention, i18n, userLang = 'en' } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const action = args[0]?.toLowerCase();
    
    // Get the broadcast service to send message to player
    const { eventBus } = require('../../events');
    const { LYRICS_TOGGLE } = require('../../events');
    
    if (!action || action === 'toggle') {
        // Toggle lyrics mode
        eventBus.emit(LYRICS_TOGGLE, { action: 'toggle' });
        await sendMessageWithMention(sock, remoteJid, i18n('commands.lyrics.toggled', userLang), sender);
        return;
    }
    
    switch(action) {
        case 'on':
        case 'enable':
        case 'show':
            eventBus.emit(LYRICS_TOGGLE, { action: 'show' });
            await sendMessageWithMention(sock, remoteJid, i18n('commands.lyrics.enabled', userLang), sender);
            break;
            
        case 'off':
        case 'disable':
        case 'hide':
            eventBus.emit(LYRICS_TOGGLE, { action: 'hide' });
            await sendMessageWithMention(sock, remoteJid, i18n('commands.lyrics.disabled', userLang), sender);
            break;
            
        default:
            await sendMessageWithMention(sock, remoteJid, i18n('commands.lyrics.usage', userLang), sender);
    }
}

module.exports = lyricsCommand;

