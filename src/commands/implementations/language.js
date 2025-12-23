const { deps: defaultDeps } = require('../dependencies');
const dbService = require('../../database/db.service');
const {
    normalizeLanguageCode,
    getLanguageName,
    getLanguageEmoji,
    getLanguagesForDisplay,
    DEFAULT_LANGUAGE
} = require('../../config/languages');

/**
 * !language command - Set user's language preference
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function languageCommand(sock, msg, args, deps = defaultDeps) {
    const { sendMessageWithMention, i18n, userLang = DEFAULT_LANGUAGE } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const requestedLang = args[0]?.toLowerCase();
    
    // If no language specified, show current preference
    if (!requestedLang) {
        const currentLang = dbService.getUserLanguage(sender) || DEFAULT_LANGUAGE;
        const langName = getLanguageName(currentLang);
        const emoji = getLanguageEmoji(currentLang);
        
        // Build available languages list
        const languagesList = getLanguagesForDisplay()
            .map(lang => `• \`!language ${lang.code}\` - ${lang.name}`)
            .join('\n');
        
        const message = `🌐 *Language*\n\n${emoji} Your language is set to *${langName}*\n\n💡 *Available languages:*\n${languagesList}`;
        await sendMessageWithMention(sock, remoteJid, message, sender);
        return;
    }
    
    // Normalize and validate language code
    const langCode = normalizeLanguageCode(requestedLang);
    
    if (!langCode) {
        // Build available languages list for error message
        const languagesList = getLanguagesForDisplay()
            .map(lang => `• \`!language ${lang.code}\` - ${lang.name}`)
            .join('\n');
        
        const message = `❌ *Invalid Language*\n\n💡 *Available languages:*\n${languagesList}`;
        await sendMessageWithMention(sock, remoteJid, message, sender);
        return;
    }
    
    // Set language preference
    dbService.setUserLanguage(sender, langCode);
    
    const langName = getLanguageName(langCode);
    const emoji = getLanguageEmoji(langCode);
    
    const message = `✅ *Language Changed*\n\n${emoji} Your language is now set to *${langName}*\n\nAll bot messages will now be in this language!`;
    await sendMessageWithMention(sock, remoteJid, message, sender);
}

module.exports = languageCommand;

