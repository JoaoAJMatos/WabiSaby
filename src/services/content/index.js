/**
 * Content Services
 * Exports all content-related services
 */

const playlistService = require('./playlist.service');
const lyricsService = require('./lyrics.service');

module.exports = {
    playlist: playlistService,
    lyrics: lyricsService
};
