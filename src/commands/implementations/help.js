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
    
    const helpText = `🎵 *WabiSaby Music Bot*\n\n` +
        `*Available Commands:*\n\n` +
        `🎶 *Play Music*\n` +
        `\`!play <url or search>\`\n` +
        `Add a song to the queue\n\n` +
        `⏭️ *Skip*\n` +
        `\`!skip\`\n` +
        `Skip the current song\n\n` +
        `📋 *Queue*\n` +
        `\`!queue\`\n` +
        `View the current queue\n\n` +
        `🗑️ *Remove*\n` +
        `\`!remove <number>\`\n` +
        `Remove a song from queue\n\n` +
        `▶️ *Now Playing*\n` +
        `\`!np\`\n` +
        `Show current song\n\n` +
        `🔔 *Notifications*\n` +
        `\`!notifications [on|off|clear]\`\n` +
        `Manage song notifications\n\n` +
        `🎵 *Playlist* (VIP only)\n` +
        `\`!playlist <url>\`\n` +
        `Add entire playlist to queue\n\n` +
        `📡 *Ping*\n` +
        `\`!ping\`\n` +
        `Add this group to monitoring\n\n` +
        `❓ *Help*\n` +
        `\`!help\`\n` +
        `Show this message`;
    
    await sendMessageWithMention(sock, remoteJid, helpText, sender);
}

module.exports = helpCommand;
