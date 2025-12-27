const { deps: defaultDeps } = require('../dependencies');
const rateLimitService = require('../../services/user/command-rate-limit.service');

/**
 * !play command - Add a track to the queue
 * Accepts either a URL (YouTube/Spotify) or a search query (song name and artist)
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function playCommand(sock, msg, args, deps = defaultDeps) {
    const {
        queueManager,
        searchYouTube,
        isSpotifyUrl,
        isYouTubeUrl,
        getTrackInfo,
        getSpotifyMetadata,
        logger,
        sendMessageWithMention,
        i18n,
        userLang = 'en'
    } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const input = args.join(' ');
    
    if (!input) {
        await sendMessageWithMention(sock, remoteJid, i18n('commands.play.usage', userLang), sender);
        return;
    }

    // Check rate limit before processing request
    const rateLimitCheck = rateLimitService.checkRateLimit(sender, 'play');
    if (!rateLimitCheck.allowed) {
        const waitSeconds = rateLimitCheck.waitSeconds || 0;
        await sendMessageWithMention(
            sock, 
            remoteJid, 
            i18n('commands.rateLimit.exceeded', userLang, { seconds: waitSeconds }), 
            sender
        );
        return;
    }

    let url = input;
    let title = '';
    let artist = '';
    
    // Check if input is a URL
    if (isSpotifyUrl(input)) {
        try {
            const metadata = await getSpotifyMetadata(input);
            title = metadata.title;
            artist = metadata.artist;
            logger.info(`[Play] Spotify track: "${title}" by ${artist}`);
        } catch (error) {
            logger.error('Failed to get Spotify metadata:', error);
            await sendMessageWithMention(sock, remoteJid, i18n('commands.play.spotifyError', userLang), sender);
            return;
        }
    } else if (isYouTubeUrl(input)) {
        try {
            const info = await getTrackInfo(input);
            title = info.title;
            artist = info.artist;
            // Warn if we got a fallback title
            if (title.includes('Unknown Track') || title.includes('YouTube Video')) {
                logger.warn(`[Play] Got fallback title for ${input}: ${title}`);
            }
        } catch (error) {
            logger.error(`[Play] Failed to get track info for ${input}:`, error);
            await sendMessageWithMention(sock, remoteJid, i18n('commands.play.youtubeError', userLang), sender);
            return;
        }
    } else {
        // Treat as search query
        try {
            // Try to extract artist and title from input for better matching
            let expectedTitle = '';
            let expectedArtist = '';
            
            if (input.includes(' - ')) {
                // Format: "Artist - Song"
                const parts = input.split(' - ');
                expectedArtist = parts[0].trim();
                expectedTitle = parts.slice(1).join(' - ').trim();
            }
            
            const searchResult = await searchYouTube(input, {
                expectedTitle,
                expectedArtist
            });
            
            url = searchResult.url;
            title = searchResult.title;
            artist = searchResult.artist;
            logger.info(`[Play] Found track: ${title} by ${artist} at ${url} (match score: ${searchResult.matchScore})`);
        } catch (error) {
            logger.error('Search failed:', error);
            await sendMessageWithMention(sock, remoteJid, i18n('commands.play.noResults', userLang, { input }), sender);
            return;
        }
    }
    
    const result = queueManager.add({ 
        type: 'url', 
        content: url, 
        title: title,
        artist: artist,
        requester: msg.pushName || 'User',
        remoteJid: remoteJid,
        sender: sender
    });
    
    if (result === null) {
        await sendMessageWithMention(sock, remoteJid, i18n('commands.play.alreadyInQueue', userLang, { title }), sender);
    } else {
        // Record successful request for rate limiting
        rateLimitService.recordRequest(sender, 'play');
        await sendMessageWithMention(sock, remoteJid, i18n('commands.play.added', userLang, { title }), sender);
    }
}

module.exports = playCommand;