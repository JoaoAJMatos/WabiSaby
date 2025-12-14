const queueManager = require('../../core/queue');
const { checkPriority } = require('../../services/priority.service');
const { getPlaylistTracks } = require('../../services/playlist.service');
const { isPlaylistUrl } = require('../../utils/url.util');
const { searchYouTube } = require('../../services/search.service');
const { logger } = require('../../utils/logger');
const { sendMessageWithMention } = require('../../utils/helpers');

/**
 * !playlist command - Add all tracks from a playlist to the queue (VIP only)
 * Accepts Spotify or YouTube playlist URLs
 */
async function playlistCommand(sock, msg, args) {
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const url = args.join(' ').trim();
    
    // Check if user is VIP
    if (!checkPriority(sender)) {
        await sendMessageWithMention(sock, remoteJid, 'Only VIP users can add playlists.', sender);
        return;
    }
    
    if (!url) {
        await sendMessageWithMention(sock, remoteJid, 'Usage: !playlist <url>', sender);
        return;
    }
    
    // Verify it's a playlist URL
    if (!isPlaylistUrl(url)) {
        await sendMessageWithMention(sock, remoteJid, 'Invalid playlist URL. Use Spotify or YouTube playlist links.', sender);
        return;
    }
    
    try {
        // Get all tracks from the playlist
        const tracks = await getPlaylistTracks(url);
        
        if (!tracks || tracks.length === 0) {
            await sendMessageWithMention(sock, remoteJid, 'No tracks found in playlist.', sender);
            return;
        }
        
        let successCount = 0;
        let failCount = 0;
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
                
                // Add to queue
                queueManager.add({ 
                    type: 'url', 
                    content: trackUrl, 
                    title: trackTitle,
                    requester: msg.pushName || 'VIP',
                    remoteJid: remoteJid,
                    sender: sender
                });
                
                successCount++;
                if (addedTracks.length < maxTracksToShow) {
                    addedTracks.push(trackTitle);
                }
                
                // Progress updates removed to reduce spam
                
            } catch (error) {
                logger.error(`Failed to add track ${i + 1}:`, error);
                failCount++;
            }
        }
        
        // Build final response message
        let responseText = `Added ${successCount} tracks`;
        if (failCount > 0) {
            responseText += ` (${failCount} failed)`;
        }
        
        await sendMessageWithMention(sock, remoteJid, responseText, sender);
        
    } catch (error) {
        logger.error('Playlist command failed:', error);
        await sendMessageWithMention(sock, remoteJid, `Failed to process playlist: ${error.message}`, sender);
    }
}

module.exports = playlistCommand;

