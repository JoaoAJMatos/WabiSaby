const { deps: defaultDeps } = require('../dependencies');

/**
 * !skip command - Skip the current song
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function skipCommand(sock, msg, args, deps = defaultDeps) {
    const { playbackController, queueManager, sendMessageWithMention } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const currentSong = playbackController.getCurrent();
    
    if (!currentSong) {
        await sendMessageWithMention(sock, remoteJid, '⏸️ *Nothing Playing*\n\nNo song is currently playing.', sender);
        return;
    }
    
    // Check if user is VIP
    const isVip = queueManager.checkPriority(sender);
    
    // Check if user is the requester of the current song
    const isRequester = currentSong.sender === sender;
    
    if (isVip || isRequester) {
        playbackController.skip();
        const currentTitle = currentSong.title || 'Current song';
        await sendMessageWithMention(sock, remoteJid, `⏭️ *Skipped*\n\n*"${currentTitle}"* has been skipped.`, sender);
    } else {
        await sendMessageWithMention(sock, remoteJid, '🔒 *Permission Denied*\n\nYou can only skip your own songs.\n\n✨ VIPs can skip any song.', sender);
    }
}

module.exports = skipCommand;

