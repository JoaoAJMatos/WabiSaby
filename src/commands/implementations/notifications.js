const { deps: defaultDeps } = require('../dependencies');

/**
 * !notifications command - Toggle or check notification status
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function notificationsCommand(sock, msg, args, deps = defaultDeps) {
    const { notificationService, sendMessageWithMention } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const action = args[0]?.toLowerCase();
    
    if (!action) {
        const status = notificationService.isEnabled ? 'enabled' : 'disabled';
        const statusEmoji = notificationService.isEnabled ? '✅' : '❌';
        await sendMessageWithMention(sock, remoteJid, `🔔 *Notifications*\n\n${statusEmoji} Currently *${status}*\n\n💡 Use \`!notifications on\` or \`!notifications off\` to change`, sender);
        return;
    }
    
    switch(action) {
        case 'on':
        case 'enable':
            notificationService.setEnabled(true);
            await sendMessageWithMention(sock, remoteJid, '✅ *Notifications Enabled*\n\nYou\'ll be notified when your songs are coming up!', sender);
            break;
            
        case 'off':
        case 'disable':
            notificationService.setEnabled(false);
            await sendMessageWithMention(sock, remoteJid, '❌ *Notifications Disabled*\n\nYou won\'t receive upcoming song notifications.', sender);
            break;
            
        case 'clear':
            notificationService.clearHistory();
            await sendMessageWithMention(sock, remoteJid, '🗑️ *History Cleared*\n\nNotification history has been reset.', sender);
            break;
            
        default:
            await sendMessageWithMention(sock, remoteJid, '🔔 *Usage*\n\n`!notifications [on|off|clear]`\n\n✨ *Options:*\n• `on` - Enable notifications\n• `off` - Disable notifications\n• `clear` - Clear notification history', sender);
    }
}

module.exports = notificationsCommand;

