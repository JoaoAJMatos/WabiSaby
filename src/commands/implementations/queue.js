const queueManager = require('../../core/queue');
const { sendMessageWithMention } = require('../../utils/helpers.util');

/**
 * !queue command - Display the current queue
 */
async function queueCommand(sock, msg, args) {
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const queue = queueManager.getQueue();
    const current = queueManager.getCurrent();
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

