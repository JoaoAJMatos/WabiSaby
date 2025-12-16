const { deps: defaultDeps } = require('../dependencies');

/**
 * !help command - Show available commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function helpCommand(sock, msg, args, deps = defaultDeps) {
    const { sendMessageWithMention } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const helpText = `*Commands*\n` +
        `!play <url or search>\n` +
        `!skip\n` +
        `!queue\n` +
        `!remove <number>\n` +
        `!np\n` +
        `!notifications [on|off|clear]\n` +
        `!playlist <url> (VIP only)\n` +
        `!ping - Add this group to monitoring\n` +
        `!help`;
    
    await sendMessageWithMention(sock, remoteJid, helpText, sender);
}

module.exports = helpCommand;
