const queueManager = require('../../core/queue');
const { sendMessageWithMention } = require('../../utils/helpers.util');

/**
 * !skip command - Skip the current song
 */
async function skipCommand(sock, msg, args) {
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const currentSong = queueManager.getCurrent();
    
    if (!currentSong) {
        await sendMessageWithMention(sock, remoteJid, 'Nothing is playing.', sender);
        return;
    }
    
    // Check if user is VIP
    const isVip = queueManager.checkPriority(sender);
    
    // Check if user is the requester of the current song
    const isRequester = currentSong.sender === sender;
    
    if (isVip || isRequester) {
        queueManager.skip();
        await sendMessageWithMention(sock, remoteJid, 'Skipped', sender);
    } else {
        await sendMessageWithMention(sock, remoteJid, 'You can only skip your own songs. VIPs can skip any song.', sender);
    }
}

module.exports = skipCommand;

