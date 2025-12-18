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
        await sendMessageWithMention(sock, remoteJid, 'Usage: !play <url or search>', sender);
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
            await sendMessageWithMention(sock, remoteJid, 'Failed to resolve Spotify link. Try YouTube or search.', sender);
            return;
        }
    } else if (isYouTubeUrl(input)) {
        const info = await getTrackInfo(input);
        title = info.title;
        artist = info.artist;
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
            await sendMessageWithMention(sock, remoteJid, `No results found for: ${input}`, sender);
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
        await sendMessageWithMention(sock, remoteJid, `Song already in queue: ${title}`, sender);
    } else {
        await sendMessageWithMention(sock, remoteJid, `Added: ${title}`, sender);
    }
}

module.exports = playCommand;