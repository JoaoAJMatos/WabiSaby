const { deps: defaultDeps } = require('../dependencies');
const { getLanguageConfig } = require('../../config/languages');
const rateLimitService = require('../../services/user/command-rate-limit.service');

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
        sendMessageWithMention,
        i18n,
        userLang = 'en'
    } = deps;
    const remoteJid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const url = args.join(' ').trim();
    
    // Check if user is VIP
    if (!checkPriority(sender)) {
        await sendMessageWithMention(sock, remoteJid, i18n('commands.playlist.vipOnly', userLang), sender);
        return;
    }
    
    const rateLimitCheck = rateLimitService.checkRateLimit(sender, 'playlist');
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
    
    if (!url) {
        await sendMessageWithMention(sock, remoteJid, i18n('commands.playlist.usage', userLang), sender);
        return;
    }
    
    // Verify it's a playlist URL
    if (!isPlaylistUrl(url)) {
        await sendMessageWithMention(sock, remoteJid, i18n('commands.playlist.invalidUrl', userLang), sender);
        return;
    }
    
    try {
        // Get all tracks from the playlist
        const tracks = await getPlaylistTracks(url);
        
        if (!tracks || tracks.length === 0) {
            await sendMessageWithMention(sock, remoteJid, i18n('commands.playlist.empty', userLang), sender);
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
        // Handle pluralization based on language
        const langConfig = getLanguageConfig(userLang);
        const isPortuguese = langConfig && langConfig.code === 'pt';
        
        let trackText, duplicateText, plural, dupPlural;
        if (isPortuguese) {
            trackText = successCount !== 1 ? 'faixas' : 'faixa';
            duplicateText = duplicateCount > 1 ? 'duplicatas' : 'duplicata';
            plural = successCount !== 1 ? 's' : '';
            dupPlural = duplicateCount > 1 ? 's' : '';
        } else {
            trackText = successCount !== 1 ? 'tracks' : 'track';
            duplicateText = duplicateCount > 1 ? 'duplicates' : 'duplicate';
            plural = successCount !== 1 ? 's' : '';
            dupPlural = duplicateCount > 1 ? 's' : '';
        }
        
        let responseText = i18n('commands.playlist.added', userLang, { count: successCount, trackText, plural });
        if (duplicateCount > 0) {
            responseText += i18n('commands.playlist.duplicates', userLang, { count: duplicateCount, duplicateText, plural: dupPlural });
        }
        if (failCount > 0) {
            responseText += i18n('commands.playlist.failed', userLang, { count: failCount });
        }
        
        // Record successful request for rate limiting (only if at least one track was added)
        if (successCount > 0) {
            rateLimitService.recordRequest(sender, 'playlist');
        }
        
        await sendMessageWithMention(sock, remoteJid, responseText, sender);
        
    } catch (error) {
        logger.error('Playlist command failed:', error);
        await sendMessageWithMention(sock, remoteJid, i18n('commands.playlist.error', userLang, { error: error.message }), sender);
    }
}

module.exports = playlistCommand;

