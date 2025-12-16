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
        await sendMessageWithMention(sock, remoteJid, `Notifications: ${status}`, sender);
        return;
    }
    
    switch(action) {
        case 'on':
        case 'enable':
            notificationService.setEnabled(true);
            await sendMessageWithMention(sock, remoteJid, 'Notifications enabled', sender);
            break;
            
        case 'off':
        case 'disable':
            notificationService.setEnabled(false);
            await sendMessageWithMention(sock, remoteJid, 'Notifications disabled', sender);
            break;
            
        case 'clear':
            notificationService.clearHistory();
            await sendMessageWithMention(sock, remoteJid, 'Notification history cleared', sender);
            break;
            
        default:
            await sendMessageWithMention(sock, remoteJid, 'Usage: !notifications [on|off|clear]', sender);
    }
}

module.exports = notificationsCommand;

