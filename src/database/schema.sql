-- ============================================
-- Core Music Data
-- ============================================

-- Songs/Tracks (normalized from queue and history)
CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL, -- URL or file path
    title TEXT NOT NULL,
    artist TEXT,
    channel TEXT, -- YouTube channel name
    duration INTEGER, -- milliseconds
    thumbnail_path TEXT,
    thumbnail_url TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(content)
);

CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_channel ON songs(channel);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at);

-- Requesters (normalized from stats)
CREATE TABLE IF NOT EXISTS requesters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    whatsapp_id TEXT, -- WhatsApp user ID if available
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_requesters_name ON requesters(name);
CREATE INDEX IF NOT EXISTS idx_requesters_whatsapp_id ON requesters(whatsapp_id);

-- ============================================
-- Queue Management
-- ============================================

-- Queue items (current queue state)
CREATE TABLE IF NOT EXISTS queue_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    group_id TEXT, -- WhatsApp group ID
    sender_id TEXT, -- WhatsApp sender ID
    position INTEGER NOT NULL, -- Order in queue
    is_priority BOOLEAN NOT NULL DEFAULT 0,
    download_status TEXT DEFAULT 'pending',
    download_progress INTEGER DEFAULT 0,
    prefetched BOOLEAN DEFAULT 0,
    added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES requesters(id)
);

CREATE INDEX IF NOT EXISTS idx_queue_position ON queue_items(position);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_items(is_priority, position);

-- Current playback state
CREATE TABLE IF NOT EXISTS playback_state (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Single row table
    current_song_id INTEGER,
    current_queue_item_id INTEGER,
    is_playing BOOLEAN NOT NULL DEFAULT 0,
    is_paused BOOLEAN NOT NULL DEFAULT 0,
    start_time INTEGER, -- Timestamp when playback started
    paused_at INTEGER, -- Timestamp when paused
    seek_position INTEGER, -- Current position in ms
    songs_played INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (current_song_id) REFERENCES songs(id),
    FOREIGN KEY (current_queue_item_id) REFERENCES queue_items(id)
);

-- ============================================
-- Statistics & History
-- ============================================

-- Play history (replaces the 100-song limit)
CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    played_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    duration INTEGER, -- Actual playback duration
    FOREIGN KEY (song_id) REFERENCES songs(id),
    FOREIGN KEY (requester_id) REFERENCES requesters(id)
);

CREATE INDEX IF NOT EXISTS idx_history_played_at ON play_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_song_id ON play_history(song_id);
CREATE INDEX IF NOT EXISTS idx_history_requester_id ON play_history(requester_id);

-- Hourly play statistics (aggregated)
CREATE TABLE IF NOT EXISTS hourly_stats (
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    play_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (hour)
);

-- ============================================
-- Groups & Users
-- ============================================

-- Monitored WhatsApp groups
CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY, -- WhatsApp group ID
    name TEXT NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Priority/VIP users
CREATE TABLE IF NOT EXISTS priority_users (
    whatsapp_id TEXT PRIMARY KEY,
    name TEXT,
    added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- ============================================
-- Playlists
-- ============================================

-- Saved playlists
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY, -- Short ID like "5496e81f7cd5162b"
    name TEXT NOT NULL,
    source TEXT, -- 'spotify', 'youtube', 'manual'
    source_url TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Playlist items (songs in playlists)
CREATE TABLE IF NOT EXISTS playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    url TEXT,
    search_query TEXT,
    position INTEGER NOT NULL,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id, position);

-- ============================================
-- Settings & Configuration
-- ============================================

-- Application settings (key-value store for flexibility)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL, -- JSON string for complex values
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Audio effects settings
CREATE TABLE IF NOT EXISTS effects (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Single row table
    enabled BOOLEAN NOT NULL DEFAULT 1,
    speed REAL NOT NULL DEFAULT 1.0,
    pitch REAL NOT NULL DEFAULT 1.0,
    eq_bass INTEGER NOT NULL DEFAULT 0,
    eq_mid INTEGER NOT NULL DEFAULT 0,
    eq_treble INTEGER NOT NULL DEFAULT 0,
    reverb_enabled BOOLEAN NOT NULL DEFAULT 0,
    reverb_room_size REAL NOT NULL DEFAULT 0.5,
    reverb_damping REAL NOT NULL DEFAULT 0.5,
    reverb_wet_level REAL NOT NULL DEFAULT 0.3,
    echo_enabled BOOLEAN NOT NULL DEFAULT 0,
    echo_delay INTEGER NOT NULL DEFAULT 300,
    echo_decay REAL NOT NULL DEFAULT 0.4,
    delay_enabled BOOLEAN NOT NULL DEFAULT 0,
    delay_delay INTEGER NOT NULL DEFAULT 500,
    delay_feedback REAL NOT NULL DEFAULT 0.3,
    distortion_enabled BOOLEAN NOT NULL DEFAULT 0,
    distortion_drive REAL NOT NULL DEFAULT 0.5,
    compressor_enabled BOOLEAN NOT NULL DEFAULT 0,
    compressor_threshold INTEGER NOT NULL DEFAULT -20,
    compressor_ratio INTEGER NOT NULL DEFAULT 4,
    limiter_enabled BOOLEAN NOT NULL DEFAULT 0,
    limiter_limit INTEGER NOT NULL DEFAULT -1,
    preset TEXT NOT NULL DEFAULT 'normal',
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

