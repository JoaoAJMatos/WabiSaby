/**
 * Spotify Services
 * Exports all Spotify-related services
 */

const authService = require('./auth.service');
const metadataService = require('./metadata.service');

module.exports = {
    auth: authService,
    metadata: metadataService
};
