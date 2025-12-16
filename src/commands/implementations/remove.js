const { deps: defaultDeps } = require('../dependencies');

/**
 * !remove command - Remove a song from the queue
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function removeCommand(sock, msg, args, deps = defaultDeps) {
    const { queueManager, sendMessageWithMention } = deps;
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

