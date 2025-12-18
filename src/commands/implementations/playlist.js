const { deps: defaultDeps } = require('../dependencies');

/**
 * !playlist command - Add all tracks from a playlist to the queue (VIP only)
 * Accepts Spotify or YouTube playlist URLs
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {Array} args - Command arguments
 * @param {Object} deps - Dependencies (injected, defaults to production dependencies)
 */
async function playlistCommand(sock, msg, args, deps = defaultDeps) {
    const {
        queueManager,
        checkPriority,
        getPlaylistTracks,
        isPlaylistUrl,
        searchYouTube,
        logger,
        sendMessageWithMention
    } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const url = args.join(' ').trim();
    
    // Check if user is VIP
    if (!checkPriority(sender)) {
        await sendMessageWithMention(sock, remoteJid, '🔒 *VIP Only*\n\nThis feature is exclusive to VIP users.\n\n✨ Contact an admin to get VIP access!', sender);
        return;
    }
    
    if (!url) {
        await sendMessageWithMention(sock, remoteJid, '🎵 *Usage*\n\n`!playlist <url>`\n\n✨ *Supported:*\n• Spotify playlist links\n• YouTube playlist links', sender);
        return;
    }
    
    // Verify it's a playlist URL
    if (!isPlaylistUrl(url)) {
        await sendMessageWithMention(sock, remoteJid, '❌ *Invalid Playlist URL*\n\nPlease provide a valid:\n• Spotify playlist link\n• YouTube playlist link', sender);
        return;
    }
    
    try {
        // Get all tracks from the playlist
        const tracks = await getPlaylistTracks(url);
        
        if (!tracks || tracks.length === 0) {
            await sendMessageWithMention(sock, remoteJid, '🔍 *Empty Playlist*\n\nNo tracks found in this playlist.\n\n💡 Make sure the playlist is public and contains songs.', sender);
            return;
        }
        
        let successCount = 0;
        let failCount = 0;
        let duplicateCount = 0;
        const maxTracksToShow = 5;
        const addedTracks = [];
        
        // Process each track
        for (let i = 0; i < tracks.length; i++) {
            try {
                const track = tracks[i];
                let trackUrl = track.url;
                let trackTitle = track.title;
                
                // If it's a Spotify track (no URL, only search query), search YouTube for it
                if (!trackUrl && track.searchQuery) {
                    try {
                        const searchResult = await searchYouTube(track.searchQuery);
                        trackUrl = searchResult.url;
                        trackTitle = searchResult.title;
                        logger.info(`Found YouTube video for "${track.searchQuery}": ${trackTitle}`);
                    } catch (searchError) {
                        logger.error(`Failed to find YouTube video for "${track.searchQuery}":`, searchError);
                        failCount++;
                        continue;
                    }
                }
                
                // Add to queue (returns null if duplicate)
                const result = queueManager.add({ 
                    type: 'url', 
                    content: trackUrl, 
                    title: trackTitle,
                    requester: msg.pushName || 'VIP',
                    remoteJid: remoteJid,
                    sender: sender
                });
                
                if (result === null) {
                    // Duplicate was skipped
                    duplicateCount++;
                } else {
                    successCount++;
                    if (addedTracks.length < maxTracksToShow) {
                        addedTracks.push(trackTitle);
                    }
                }
                
                // Progress updates removed to reduce spam
                
            } catch (error) {
                logger.error(`Failed to add track ${i + 1}:`, error);
                failCount++;
            }
        }
        
        // Build final response message
        let responseText = `✅ *Playlist Added*\n\n🎵 *${successCount}* track${successCount !== 1 ? 's' : ''} added to queue`;
        if (duplicateCount > 0) {
            responseText += `\n⚠️ *${duplicateCount}* duplicate${duplicateCount > 1 ? 's' : ''} skipped`;
        }
        if (failCount > 0) {
            responseText += `\n❌ *${failCount}* failed`;
        }
        
        await sendMessageWithMention(sock, remoteJid, responseText, sender);
        
    } catch (error) {
        logger.error('Playlist command failed:', error);
        await sendMessageWithMention(sock, remoteJid, `❌ *Playlist Error*\n\nFailed to process playlist:\n*${error.message}*\n\n💡 Make sure the playlist is public and accessible.`, sender);
    }
}

module.exports = playlistCommand;

