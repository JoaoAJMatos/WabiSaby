const { sendMessageWithMention } = require('../../utils/helpers.util');

/**
 * !help command - Show available commands
 */
async function helpCommand(sock, msg, args) {
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
