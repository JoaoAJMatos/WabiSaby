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
        await sendMessageWithMention(sock, remoteJid, '🎵 *Usage*\n\n`!remove <number>`\n\n💡 Use `!queue` to see the queue numbers.', sender);
        return;
    }
    
    const removed = queueManager.remove(index);
    if (removed) {
        const removedTitle = removed.title || removed.content;
        await sendMessageWithMention(sock, remoteJid, `🗑️ *Removed*\n\n*"${removedTitle}"* has been removed from the queue.`, sender);
    } else {
        await sendMessageWithMention(sock, remoteJid, '❌ *Invalid Index*\n\nThat position doesn\'t exist in the queue.\n\n💡 Use `!queue` to see valid numbers.', sender);
    }
}

module.exports = removeCommand;

