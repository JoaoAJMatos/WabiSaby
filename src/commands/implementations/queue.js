const { deps: defaultDeps } = require('../dependencies');

/**
 * !queue command - Display the current queue
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function queueCommand(sock, msg, args, deps = defaultDeps) {
    const { queueManager, playbackController, sendMessageWithMention } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const queue = queueManager.getQueue();
    const current = playbackController.getCurrent();
    let response = '*Queue*\n';
    
    if (current) {
        const currentTitle = current.title || current.content;
        response += `▶️ ${currentTitle}\n\n`;
    }
    
    // Show queue
    if (queue.length > 0) {
        queue.forEach((item, index) => {
            const itemTitle = item.title || item.content;
            response += `${index + 1}. ${itemTitle}\n`;
        });
    } else {
        response += 'Empty';
    }
    
    await sendMessageWithMention(sock, remoteJid, response, sender);
}

module.exports = queueCommand;

