const { deps: defaultDeps } = require('../dependencies');

/**
 * !help command - Show available commands
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function helpCommand(sock, msg, args, deps = defaultDeps) {
    const { sendMessageWithMention, i18n, userLang = 'en' } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const helpText = i18n('commands.help.title', userLang) +
        i18n('commands.help.availableCommands', userLang) +
        i18n('commands.help.play.title', userLang) +
        i18n('commands.help.play.usage', userLang) +
        i18n('commands.help.play.description', userLang) + '\n\n' +
        i18n('commands.help.skip.title', userLang) +
        i18n('commands.help.skip.usage', userLang) +
        i18n('commands.help.skip.description', userLang) + '\n\n' +
        i18n('commands.help.queue.title', userLang) +
        i18n('commands.help.queue.usage', userLang) +
        i18n('commands.help.queue.description', userLang) + '\n\n' +
        i18n('commands.help.remove.title', userLang) +
        i18n('commands.help.remove.usage', userLang) +
        i18n('commands.help.remove.description', userLang) + '\n\n' +
        i18n('commands.help.nowPlaying.title', userLang) +
        i18n('commands.help.nowPlaying.usage', userLang) +
        i18n('commands.help.nowPlaying.description', userLang) + '\n\n' +
        i18n('commands.help.notifications.title', userLang) +
        i18n('commands.help.notifications.usage', userLang) +
        i18n('commands.help.notifications.description', userLang) + '\n\n' +
        i18n('commands.help.playlist.title', userLang) +
        i18n('commands.help.playlist.usage', userLang) +
        i18n('commands.help.playlist.description', userLang) + '\n\n' +
        i18n('commands.help.ping.title', userLang) +
        i18n('commands.help.ping.usage', userLang) +
        i18n('commands.help.ping.description', userLang) + '\n\n' +
        i18n('commands.help.help.title', userLang) +
        i18n('commands.help.help.usage', userLang) +
        i18n('commands.help.help.description', userLang) + '\n\n' +
        i18n('commands.help.language.title', userLang) +
        i18n('commands.help.language.usage', userLang) +
        i18n('commands.help.language.description', userLang) + '\n\n' +
        i18n('commands.help.lyrics.title', userLang) +
        i18n('commands.help.lyrics.usage', userLang) +
        i18n('commands.help.lyrics.description', userLang);
    
    await sendMessageWithMention(sock, remoteJid, helpText, sender);
}

module.exports = helpCommand;
