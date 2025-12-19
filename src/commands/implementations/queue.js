const { deps: defaultDeps } = require('../dependencies');

/**
 * !queue command - Display the current queue
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function queueCommand(sock, msg, args, deps = defaultDeps) {
    const { queueManager, playbackController, sendMessageWithMention, i18n, userLang = 'en' } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const queue = queueManager.getQueue();
    const current = playbackController.getCurrent();
    let response = i18n('commands.queue.title', userLang);
    
    if (current) {
        const currentTitle = current.title || current.content;
        const currentArtist = current.artist ? ` - ${current.artist}` : '';
        response += i18n('commands.queue.nowPlaying', userLang, { title: currentTitle, artist: currentArtist });
    }
    
    // Show queue
    if (queue.length > 0) {
        response += i18n('commands.queue.upcoming', userLang, { count: queue.length });
        queue.forEach((item, index) => {
            const itemTitle = item.title || item.content;
            const itemArtist = item.artist ? ` - ${item.artist}` : '';
            response += `${index + 1}. ${itemTitle}${itemArtist}\n`;
        });
    } else {
        response += i18n('commands.queue.empty', userLang);
    }
    
    await sendMessageWithMention(sock, remoteJid, response, sender);
}

module.exports = queueCommand;

