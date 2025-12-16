/**
 * Test Fixtures
 * Provides sample data for tests
 */

/**
 * Sample queue items for testing
 */
const sampleQueueItems = [
    {
        content: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        channel: 'RickAstleyVEVO',
        requester: 'Test User 1',
        sender: 'user1@whatsapp',
        remoteJid: 'group1@whatsapp',
        isPriority: false,
        duration: 213000,
        downloadStatus: 'pending',
        downloadProgress: 0,
        prefetched: false
    },
    {
        content: 'https://youtube.com/watch?v=9bZkp7q19f0',
        title: 'Gangnam Style',
        artist: 'PSY',
        channel: 'officialpsy',
        requester: 'Test User 2',
        sender: 'user2@whatsapp',
        remoteJid: 'group1@whatsapp',
        isPriority: true,
        duration: 252000,
        downloadStatus: 'ready',
        downloadProgress: 100,
        prefetched: true
    },
    {
        content: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
        title: 'Test Spotify Track',
        artist: 'Test Artist',
        requester: 'Test User 3',
        sender: 'user3@whatsapp',
        remoteJid: 'group1@whatsapp',
        isPriority: false,
        duration: 180000,
        downloadStatus: 'downloading',
        downloadProgress: 50,
        prefetched: false
    }
];

/**
 * Sample songs for database seeding
 */
const sampleSongs = [
    {
        content: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        channel: 'RickAstleyVEVO',
        duration: 213000,
        thumbnail_path: '/thumbnails/test1.jpg',
        thumbnail_url: '/api/thumbnails/test1.jpg'
    },
    {
        content: 'https://youtube.com/watch?v=9bZkp7q19f0',
        title: 'Gangnam Style',
        artist: 'PSY',
        channel: 'officialpsy',
        duration: 252000,
        thumbnail_path: '/thumbnails/test2.jpg',
        thumbnail_url: '/api/thumbnails/test2.jpg'
    }
];

/**
 * Sample requesters for database seeding
 */
const sampleRequesters = [
    {
        name: 'Test User 1',
        whatsapp_id: 'user1@whatsapp'
    },
    {
        name: 'Test User 2',
        whatsapp_id: 'user2@whatsapp'
    },
    {
        name: 'VIP User',
        whatsapp_id: 'vip@whatsapp'
    }
];

/**
 * Sample priority users
 */
const samplePriorityUsers = [
    {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User'
    }
];

/**
 * Sample groups
 */
const sampleGroups = [
    {
        id: 'group1@whatsapp',
        name: 'Test Group 1'
    },
    {
        id: 'group2@whatsapp',
        name: 'Test Group 2'
    }
];

/**
 * Sample WhatsApp messages
 */
const sampleWhatsAppMessages = [
    {
        key: {
            remoteJid: 'group1@whatsapp',
            fromMe: false,
            id: 'msg1'
        },
        message: {
            conversation: 'https://youtube.com/watch?v=dQw4w9WgXcQ'
        },
        pushName: 'Test User 1',
        messageTimestamp: Date.now()
    },
    {
        key: {
            remoteJid: 'group1@whatsapp',
            fromMe: false,
            id: 'msg2'
        },
        message: {
            conversation: '!play Never Gonna Give You Up'
        },
        pushName: 'Test User 2',
        messageTimestamp: Date.now()
    }
];

/**
 * Sample effects configuration
 */
const sampleEffects = {
    enabled: true,
    speed: 1.0,
    pitch: 1.0,
    eq: {
        bass: 0,
        mid: 0,
        treble: 0
    },
    reverb: {
        enabled: false,
        roomSize: 0.5,
        damping: 0.5,
        wetLevel: 0.3
    },
    echo: {
        enabled: false,
        delay: 300,
        decay: 0.4
    }
};

/**
 * Sample playback state
 */
const samplePlaybackState = {
    is_playing: true,
    is_paused: false,
    current_song_id: 1,
    start_time: Math.floor(Date.now() / 1000),
    paused_at: null,
    seek_position: null,
    songs_played: 5
};

/**
 * Create a complete test dataset
 */
function createTestDataset() {
    return {
        songs: sampleSongs,
        requesters: sampleRequesters,
        priorityUsers: samplePriorityUsers,
        groups: sampleGroups,
        queueItems: sampleQueueItems.map((item, index) => ({
            ...item,
            position: index
        })),
        effects: sampleEffects,
        playbackState: samplePlaybackState
    };
}

module.exports = {
    sampleQueueItems,
    sampleSongs,
    sampleRequesters,
    samplePriorityUsers,
    sampleGroups,
    sampleWhatsAppMessages,
    sampleEffects,
    samplePlaybackState,
    createTestDataset
};

