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
    const { notificationService, sendMessageWithMention, i18n, userLang = 'en' } = deps;
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
        
        let message = i18n('commands.notifications.status', userLang, { statusEmoji, status });
        message += i18n('commands.notifications.statusDetails', userLang);
        message += i18n('commands.notifications.global', userLang, { 
            emoji: globalEnabled ? '✅' : '❌', 
            status: globalStatus 
        });
        message += i18n('commands.notifications.userPreference', userLang, { 
            emoji: userEnabled ? '✅' : '❌', 
            status: userStatus 
        });
        message += i18n('commands.notifications.hint', userLang);
        
        await sendMessageWithMention(sock, remoteJid, message, sender);
        return;
    }
    
    switch(action) {
        case 'on':
        case 'enable':
            // Set user-level preference
            dbService.setUserNotificationPreference(userWhatsappId, true);
            await sendMessageWithMention(sock, remoteJid, i18n('commands.notifications.enabled', userLang), sender);
            break;
            
        case 'off':
        case 'disable':
            // Set user-level preference
            dbService.setUserNotificationPreference(userWhatsappId, false);
            await sendMessageWithMention(sock, remoteJid, i18n('commands.notifications.disabled', userLang), sender);
            break;
            
        case 'clear':
            // Clear notification history (global operation)
            notificationService.clearHistory();
            await sendMessageWithMention(sock, remoteJid, i18n('commands.notifications.historyCleared', userLang), sender);
            break;
            
        default:
            await sendMessageWithMention(sock, remoteJid, i18n('commands.notifications.usage', userLang), sender);
    }
}

module.exports = notificationsCommand;

