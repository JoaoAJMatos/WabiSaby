/**
 * Domain Models
 * Exports all domain model classes
 */

const QueueItem = require('./queue-item');
const User = require('./user');
const Song = require('./song');
const { Playlist, PlaylistItem } = require('./playlist');

module.exports = {
    QueueItem,
    User,
    Song,
    Playlist,
    PlaylistItem
};
