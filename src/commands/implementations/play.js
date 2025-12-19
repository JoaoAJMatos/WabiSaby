const { deps: defaultDeps } = require('../dependencies');

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
        sendMessageWithMention
    } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const input = args.join(' ');
    
    if (!input) {
        await sendMessageWithMention(sock, remoteJid, '🎵 *Usage*\n\n`!play <url or search>`\n\n✨ *Examples:*\n• `!play https://youtube.com/...`\n• `!play Artist - Song Name`\n• `!play song name`', sender);
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
            await sendMessageWithMention(sock, remoteJid, '❌ *Spotify Link Error*\n\nCouldn\'t resolve this Spotify link.\n\n💡 *Try:*\n• YouTube URL\n• Search query (song name)', sender);
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
            await sendMessageWithMention(sock, remoteJid, '❌ *YouTube Link Error*\n\nCouldn\'t resolve this YouTube link.\n\n💡 *Try:*\n• Search query (song name)\n• Different YouTube URL', sender);
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
            await sendMessageWithMention(sock, remoteJid, `🔍 *No Results Found*\n\nCouldn't find any matches for:\n*"${input}"*\n\n💡 *Try:*\n• More specific search terms\n• Include artist name\n• Use a YouTube or Spotify URL`, sender);
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
        await sendMessageWithMention(sock, remoteJid, `⚠️ *Already in Queue*\n\n*"${title}"* is already queued.`, sender);
    } else {
        await sendMessageWithMention(sock, remoteJid, `✅ *Added to Queue*\n\n🎶 *"${title}"*`, sender);
    }
}

module.exports = playCommand;