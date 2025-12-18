const { deps: defaultDeps } = require('../dependencies');
const dbService = require('../../database/db.service');

/**
 * !notifications command - Toggle or check notification status (user-level)
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
    
    // Get user's WhatsApp ID (sender is the user's JID)
    const userWhatsappId = sender;
    
    if (!action) {
        // Check user's personal preference
        const userEnabled = dbService.getUserNotificationPreference(userWhatsappId);
        // Also check global setting
        const globalEnabled = notificationService.isEnabled;
        const actuallyEnabled = globalEnabled && userEnabled;
        
        const status = actuallyEnabled ? 'enabled' : 'disabled';
        const statusEmoji = actuallyEnabled ? '✅' : '❌';
        const globalStatus = globalEnabled ? 'enabled' : 'disabled';
        const userStatus = userEnabled ? 'enabled' : 'disabled';
        
        let message = `🔔 *Notifications*\n\n${statusEmoji} Your notifications are *${status}*\n\n`;
        message += `📊 *Status:*\n`;
        message += `• Global: ${globalEnabled ? '✅' : '❌'} ${globalStatus}\n`;
        message += `• Your preference: ${userEnabled ? '✅' : '❌'} ${userStatus}\n\n`;
        message += `💡 Use \`!notifications on\` or \`!notifications off\` to change your preference`;
        
        await sendMessageWithMention(sock, remoteJid, message, sender);
        return;
    }
    
    switch(action) {
        case 'on':
        case 'enable':
            // Set user-level preference
            dbService.setUserNotificationPreference(userWhatsappId, true);
            await sendMessageWithMention(sock, remoteJid, '✅ *Notifications Enabled*\n\nYou\'ll be notified when your songs are coming up!', sender);
            break;
            
        case 'off':
        case 'disable':
            // Set user-level preference
            dbService.setUserNotificationPreference(userWhatsappId, false);
            await sendMessageWithMention(sock, remoteJid, '❌ *Notifications Disabled*\n\nYou won\'t receive upcoming song notifications.', sender);
            break;
            
        case 'clear':
            // Clear notification history (global operation)
            notificationService.clearHistory();
            await sendMessageWithMention(sock, remoteJid, '🗑️ *History Cleared*\n\nNotification history has been reset.', sender);
            break;
            
        default:
            await sendMessageWithMention(sock, remoteJid, '🔔 *Usage*\n\n`!notifications [on|off|clear]`\n\n✨ *Options:*\n• `on` - Enable notifications\n• `off` - Disable notifications\n• `clear` - Clear notification history', sender);
    }
}

module.exports = notificationsCommand;

