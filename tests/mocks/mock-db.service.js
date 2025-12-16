/**
 * Mock Database Service
 * In-memory implementation of database service for testing
 */

class MockDbService {
    constructor() {
        this.songs = new Map();
        this.requesters = new Map();
        this.queueItems = [];
        this.priorityUsers = new Map();
        this.groups = new Map();
        this.playbackState = {
            is_playing: 0,
            is_paused: 0,
            current_song_id: null,
            start_time: null,
            paused_at: null,
            seek_position: null,
            songs_played: 0
        };
        this.songIdCounter = 1;
        this.requesterIdCounter = 1;
        this.queueItemIdCounter = 1;
        this.methodCalls = [];
    }

    _trackCall(method, args) {
        this.methodCalls.push({ method, args, timestamp: Date.now() });
    }

    // Songs operations
    getOrCreateSong(songData) {
        this._trackCall('getOrCreateSong', [songData]);
        
        // Find existing by content
        for (const [id, song] of this.songs) {
            if (song.content === songData.content) {
                // Update if new data provided
                if (songData.title) song.title = songData.title;
                if (songData.artist) song.artist = songData.artist;
                if (songData.channel) song.channel = songData.channel;
                if (songData.duration) song.duration = songData.duration;
                if (songData.thumbnail_path) song.thumbnail_path = songData.thumbnail_path;
                if (songData.thumbnail_url) song.thumbnail_url = songData.thumbnail_url;
                return id;
            }
        }

        // Create new
        const id = this.songIdCounter++;
        this.songs.set(id, {
            id,
            content: songData.content,
            title: songData.title || 'Unknown',
            artist: songData.artist || null,
            channel: songData.channel || null,
            duration: songData.duration || null,
            thumbnail_path: songData.thumbnail_path || null,
            thumbnail_url: songData.thumbnail_url || null
        });
        return id;
    }

    getSong(songId) {
        this._trackCall('getSong', [songId]);
        return this.songs.get(songId) || null;
    }

    // Requesters operations
    getOrCreateRequester(name, whatsappId = null) {
        this._trackCall('getOrCreateRequester', [name, whatsappId]);
        
        // Find by name
        for (const [id, requester] of this.requesters) {
            if (requester.name === name) {
                if (whatsappId && requester.whatsapp_id !== whatsappId) {
                    requester.whatsapp_id = whatsappId;
                }
                return id;
            }
        }

        // Find by WhatsApp ID
        if (whatsappId) {
            for (const [id, requester] of this.requesters) {
                if (requester.whatsapp_id === whatsappId) {
                    return id;
                }
            }
        }

        // Create new
        const id = this.requesterIdCounter++;
        this.requesters.set(id, {
            id,
            name,
            whatsapp_id: whatsappId
        });
        return id;
    }

    // Queue operations
    getQueueItems() {
        this._trackCall('getQueueItems', []);
        return this.queueItems
            .sort((a, b) => a.position - b.position)
            .map(item => {
                const song = this.songs.get(item.song_id);
                const requester = this.requesters.get(item.requester_id);
                return {
                    id: item.id,
                    content: song?.content || '',
                    title: song?.title || '',
                    artist: song?.artist || null,
                    channel: song?.channel || null,
                    duration: song?.duration || null,
                    thumbnail_path: song?.thumbnail_path || null,
                    thumbnail_url: song?.thumbnail_url || null,
                    requester_name: requester?.name || '',
                    requester_whatsapp_id: requester?.whatsapp_id || null,
                    group_id: item.group_id,
                    sender_id: item.sender_id,
                    is_priority: item.is_priority,
                    download_status: item.download_status,
                    download_progress: item.download_progress,
                    prefetched: item.prefetched
                };
            });
    }

    addQueueItem(itemData) {
        this._trackCall('addQueueItem', [itemData]);
        
        const id = this.queueItemIdCounter++;
        const item = {
            id,
            song_id: itemData.song_id || this.getOrCreateSong({ content: itemData.content || 'test', title: itemData.title || 'Test' }),
            requester_id: itemData.requester_id || this.getOrCreateRequester(itemData.requester || 'Test User'),
            group_id: itemData.group_id || null,
            sender_id: itemData.sender_id || null,
            position: itemData.position !== undefined ? itemData.position : this.queueItems.length,
            is_priority: itemData.is_priority ? 1 : 0,
            download_status: itemData.download_status || 'pending',
            download_progress: itemData.download_progress || 0,
            prefetched: itemData.prefetched ? 1 : 0
        };
        this.queueItems.push(item);
        return id;
    }

    removeQueueItem(itemId) {
        this._trackCall('removeQueueItem', [itemId]);
        this.queueItems = this.queueItems.filter(item => item.id !== itemId);
    }

    reorderQueue(fromIndex, toIndex) {
        this._trackCall('reorderQueue', [fromIndex, toIndex]);
        const items = this.queueItems.sort((a, b) => a.position - b.position);
        const [item] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, item);
        items.forEach((item, index) => {
            item.position = index;
        });
    }

    clearQueue() {
        this._trackCall('clearQueue', []);
        this.queueItems = [];
    }

    // Playback state
    getPlaybackState() {
        this._trackCall('getPlaybackState', []);
        return { ...this.playbackState };
    }

    updatePlaybackState(state) {
        this._trackCall('updatePlaybackState', [state]);
        Object.assign(this.playbackState, state);
    }

    // Priority users
    isPriorityUser(whatsappId) {
        this._trackCall('isPriorityUser', [whatsappId]);
        return this.priorityUsers.has(whatsappId);
    }

    addPriorityUser(whatsappId, name) {
        this._trackCall('addPriorityUser', [whatsappId, name]);
        this.priorityUsers.set(whatsappId, { whatsapp_id: whatsappId, name });
    }

    // Groups
    getGroups() {
        this._trackCall('getGroups', []);
        return Array.from(this.groups.values());
    }

    addGroup(groupId, name) {
        this._trackCall('addGroup', [groupId, name]);
        this.groups.set(groupId, { id: groupId, name });
    }

    // Utility methods for testing
    clear() {
        this.songs.clear();
        this.requesters.clear();
        this.queueItems = [];
        this.priorityUsers.clear();
        this.groups.clear();
        this.playbackState = {
            is_playing: 0,
            is_paused: 0,
            current_song_id: null,
            start_time: null,
            paused_at: null,
            seek_position: null,
            songs_played: 0
        };
        this.methodCalls = [];
    }

    getMethodCalls() {
        return [...this.methodCalls];
    }
}

module.exports = MockDbService;

