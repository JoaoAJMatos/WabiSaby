const { deps: defaultDeps } = require('../dependencies');
const dbService = require('../../database/db.service');

/**
 * !language command - Set user's language preference
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function languageCommand(sock, msg, args, deps = defaultDeps) {
    const { sendMessageWithMention, i18n, userLang = 'en' } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const requestedLang = args[0]?.toLowerCase();
    
    // Valid languages
    const validLanguages = {
        'en': 'English',
        'pt': 'Português',
        'english': 'English',
        'portuguese': 'Português',
        'português': 'Português'
    };
    
    // If no language specified, show current preference
    if (!requestedLang) {
        const currentLang = dbService.getUserLanguage(sender);
        const langName = currentLang === 'pt' ? 'Português' : 'English';
        const emoji = currentLang === 'pt' ? '🇵🇹' : '🇺🇸';
        
        const message = `🌐 *Language*\n\n${emoji} Your language is set to *${langName}*\n\n💡 Use \`!language en\` or \`!language pt\` to change it.`;
        await sendMessageWithMention(sock, remoteJid, message, sender);
        return;
    }
    
    // Normalize language code
    let langCode = requestedLang;
    if (requestedLang === 'english') langCode = 'en';
    if (requestedLang === 'portuguese' || requestedLang === 'português') langCode = 'pt';
    
    // Validate language
    if (langCode !== 'en' && langCode !== 'pt') {
        const message = `❌ *Invalid Language*\n\n💡 *Available languages:*\n• \`!language en\` - English\n• \`!language pt\` - Português`;
        await sendMessageWithMention(sock, remoteJid, message, sender);
        return;
    }
    
    // Set language preference
    dbService.setUserLanguage(sender, langCode);
    
    const langName = langCode === 'pt' ? 'Português' : 'English';
    const emoji = langCode === 'pt' ? '🇵🇹' : '🇺🇸';
    
    const message = `✅ *Language Changed*\n\n${emoji} Your language is now set to *${langName}*\n\nAll bot messages will now be in this language!`;
    await sendMessageWithMention(sock, remoteJid, message, sender);
}

module.exports = languageCommand;

