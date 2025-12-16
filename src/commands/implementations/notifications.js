const notificationService = require('../../services/notification.service');
const { sendMessageWithMention } = require('../../utils/helpers.util');

/**
 * !notifications command - Toggle or check notification status
 */
async function notificationsCommand(sock, msg, args) {
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

