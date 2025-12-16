const queueManager = require('../../core/queue');
const { sendMessageWithMention } = require('../../utils/helpers.util');

/**
 * !remove command - Remove a song from the queue
 */
async function removeCommand(sock, msg, args) {
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const index = parseInt(args[0]) - 1;
    
    if (isNaN(index)) {
        await sendMessageWithMention(sock, remoteJid, 'Usage: !remove <number>', sender);
        return;
    }
    
    const removed = queueManager.remove(index);
    if (removed) {
        const removedTitle = removed.title || removed.content;
        await sendMessageWithMention(sock, remoteJid, `Removed: ${removedTitle}`, sender);
    } else {
        await sendMessageWithMention(sock, remoteJid, 'Invalid index.', sender);
    }
}

module.exports = removeCommand;

