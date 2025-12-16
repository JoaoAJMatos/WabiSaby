const queueManager = require('../../core/queue');
const { sendMessageWithMention } = require('../../utils/helpers.util');

/**
 * !np command - Show currently playing song
 */
async function nowPlayingCommand(sock, msg, args) {
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const np = queueManager.getCurrent();
    
    if (np) {
        const npTitle = np.title || np.content;
        await sendMessageWithMention(sock, remoteJid, `▶️ ${npTitle}`, sender);
    } else {
        await sendMessageWithMention(sock, remoteJid, 'Nothing playing.', sender);
    }
}

module.exports = nowPlayingCommand;

