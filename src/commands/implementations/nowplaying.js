const { deps: defaultDeps } = require('../dependencies');

/**
 * !np command - Show currently playing song
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function nowPlayingCommand(sock, msg, args, deps = defaultDeps) {
    const { playbackController, sendMessageWithMention, i18n, userLang = 'en' } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const np = playbackController.getCurrent();
    
    if (np) {
        const npTitle = np.title || np.content;
        const npArtist = np.artist ? `\n👤 *${np.artist}*` : '';
        await sendMessageWithMention(sock, remoteJid, i18n('commands.nowPlaying.playing', userLang, { title: npTitle, artist: npArtist }), sender);
    } else {
        await sendMessageWithMention(sock, remoteJid, i18n('commands.nowPlaying.nothingPlaying', userLang), sender);
    }
}

module.exports = nowPlayingCommand;

