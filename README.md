# WabiSaby

![WabiSaby Banner](./public/assets/banner.svg)

A collaborative music bot that plays audio from YouTube/Spotify links via WhatsApp or a web dashboard. Features real-time audio visualization, synchronized playback, and a cyberpunk-themed UI.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Advanced Features](#advanced-features)
- [Docker Deployment](#docker-deployment)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Overview

WabiSaby is a music bot that integrates with WhatsApp and provides a web dashboard for collaborative music playback. Users can request songs via WhatsApp commands or the web interface, and the bot plays audio on the server using FFmpeg. The web dashboard syncs with server playback and provides real-time visualization.

## Features

### WhatsApp Integration

- Send YouTube/Spotify links to add songs to queue
- Command-based control (`!play`, `!skip`, `!queue`, etc.)
- Smart notifications when your song is about to play
- VIP system with priority queue and playlist support

### Web Dashboard

- Real-time audio visualizer
- Synchronized playback control (play/pause/skip/seek)
- Queue management with drag-and-drop reordering
- Current song display with progress tracking
- VIP management interface
- Statistics dashboard (uptime, songs played, top requesters, history)
- System logs viewer

### Audio Effects

- Real-time audio effects (EQ, reverb, echo, speed control)
- Preset effects (Normal, Bass Boost, Treble Boost, etc.)
- Seamless effect updates (MPV backend) or restart-based (ffplay)
- Customizable filter chains

### Statistics

- Uptime tracking
- Songs played counter
- Top requesters leaderboard
- Playback history
- Top artists analytics

### VIP Management

- Priority queue (VIP songs added to front)
- Skip any song (not just own requests)
- Playlist support (Spotify/YouTube playlists)
- Profile picture display

### Groups Management

- Monitor multiple WhatsApp groups
- Group metadata and participant management
- Confirmation system for group additions

### Lyrics

- Automatic lyrics retrieval for current song
- Search by title, artist, and duration

## Screenshots

> **Note:** Screenshots coming soon. The dashboard features a cyberpunk-themed UI with real-time audio visualization, queue management, and comprehensive controls.

- **Dashboard**: Main interface with now-playing card, queue, and controls
- **Audio Effects**: Real-time effects panel with EQ, reverb, echo, and presets
- **Statistics**: Analytics dashboard with uptime, top requesters, and playback history
- **VIP Management**: Interface for managing priority users
- **System Logs**: Real-time log viewer with filtering

## Quick Start

### Manual Installation

```bash
# 1. Clone and install
git clone <repository-url>
cd wpp-music-bot
bun install

# 2. Configure API keys (optional)
# Create .env file with your API keys (see Configuration section)

# 3. Start
bun start
```

### Docker Installation

```bash
# 1. Clone repository
git clone <repository-url>
cd wpp-music-bot

# 2. Configure API keys (optional)
# Create .env file with your API keys (see Configuration section)

# 3. Start with Docker Compose
docker-compose up -d
```

Open `http://localhost:3000` and scan the QR code to connect WhatsApp.

## Installation

### Prerequisites

- **Bun** (latest version recommended)
- **FFmpeg** (includes `ffplay` for server-side playback)

#### Install FFmpeg

- **macOS**: `brew install ffmpeg`
- **Linux**: `sudo apt install ffmpeg`
- **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add `bin` folder to PATH

### Manual Installation Steps

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd wpp-music-bot
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Create `.env` file for API keys (optional):

   ```bash
   # Create .env file and add your API keys
   # See Configuration section for details
   ```

4. Start the bot:

   ```bash
   bun start
   ```

### Docker Installation Steps

See [Docker Deployment](#docker-deployment) section for detailed instructions.

## Usage

### Starting the Bot

```bash
bun start
```

The web dashboard will be available at `http://localhost:3000` (default). Server settings can be changed in the web UI.

### Connecting WhatsApp

1. Start the bot
2. Open `http://localhost:3000` in your browser
3. Scan the QR code displayed in the "System Authentication" section using WhatsApp (Linked Devices)

### Playing Music

**Via WhatsApp:**

- Send a YouTube/Spotify link directly
- Use commands: `!play <url>`, `!playlist <url>` (VIP only)

**Via Web Dashboard:**

- Use the "Request Track" form
- Enter URL or search query

### WhatsApp Commands

| Command | Description |
|---------|-------------|
| `!play <url>` | Add YouTube/Spotify song to queue |
| `!skip` | Skip current song (own requests or VIP) |
| `!queue` | Display current queue |
| `!remove <number>` | Remove song from queue by position |
| `!np` | Show currently playing song |
| `!notifications [on\|off\|clear]` | Manage notification settings |
| `!playlist <url>` | Add entire playlist (VIP only) |
| `!help` | Show all available commands |

### Notification System

Users are automatically notified when their requested song reaches a configurable position in the queue (default: next in queue).

- `!notifications` - Check status
- `!notifications on` - Enable
- `!notifications off` - Disable
- `!notifications clear` - Clear history

Configure notification position in the Settings panel of the web UI (default: 1 = next in queue).

## Configuration

Configuration is split into two parts:

1. **Secrets** (`.env` file) - API keys and sensitive settings
2. **Settings** (Web UI) - All other configuration managed through the dashboard

### Secrets (.env file)

The `.env` file is for **secrets and server configuration** - API keys, sensitive settings, and server host/port. Create a `.env` file in the project root with:

```bash
# Server Configuration (optional, can also be set in UI)
# Port for the web dashboard (default: 3000)
PORT=3000

# Host for the web server (default: localhost)
HOST=localhost

# WhatsApp Configuration (optional)
# Restrict bot to a specific WhatsApp group ID
TARGET_GROUP_ID=

# Spotify API Configuration (for Playlist Support)
# Get credentials at: https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# YouTube Data API Configuration (optional, for improved search)
# Get API key at: https://console.cloud.google.com/apis/credentials
YOUTUBE_API_KEY=
```

**Note:**

- `PORT` and `HOST` can be set via `.env` (takes precedence) or through the web UI
- All other settings (audio quality, playback settings, etc.) are managed through the web UI and automatically saved to `storage/data/settings.json`

### Settings (Web UI)

All non-secret settings are managed through the **Settings** panel in the web dashboard:

#### Server Settings

- Port (default: 3000)
- Host (default: localhost)
- *Note: Server settings require a restart to take effect*
- *Note: These can also be set via `PORT` and `HOST` environment variables (takes precedence over UI settings)*

#### Download Settings

- Audio format (mp3, m4a, opus, flac, wav)
- Audio quality/bitrate (64k, 128k, 192k, 256k, 320k)
- Download thumbnails
- Thumbnail format (jpg, png, webp)
- Player client (android, web, ios)
- Maximum filename length

#### Playback Settings

- Cleanup after play
- Cleanup on startup
- Song transition delay
- Skip confirmation
- Show requester name

#### Performance Settings

- Prefetch next song
- Prefetch count

#### Notification Settings

- Enable notifications
- Notify at position

#### Logging Settings

- Log level
- Pretty print logs

Settings are saved automatically when changed and persist across restarts. Default values are used on first startup.

### Storage Organization

All data is organized under `storage/`:

- `storage/temp/` - Temporary downloads
- `storage/data/` - Persistent data
  - `queue.json` - Current queue
  - `priority.json` - VIP users
  - `stats.json` - Statistics
  - `groups.json` - Monitored groups
  - `settings.json` - **UI-managed settings** (auto-generated)
- `storage/auth/` - WhatsApp authentication session
- `storage/media/` - Downloaded media (if cleanup disabled)
- `storage/thumbnails/` - Thumbnail images

## API Documentation

See [API Documentation](docs/API.md) for complete API reference.

## Advanced Features

### Spotify API Setup (Playlists)

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create app (name: `WabiSaby`, redirect URI: `http://localhost`)
3. Get Client ID and Client Secret
4. Add to `.env`:

   ```bash
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```

5. Restart bot (API keys are loaded from `.env` on startup)

**Note:** YouTube playlists work without API credentials.

### YouTube API Setup (Search)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create project or select existing
3. Enable "YouTube Data API v3"
4. Create API Key
5. Add to `.env`:

   ```bash
   YOUTUBE_API_KEY=your_api_key
   ```

**Note:** Free quota: 10,000 units/day (~100 searches/day). Falls back to play-dl if not configured.

### VIP Playlist Support

VIPs can add entire playlists using `!playlist <url>`:

- **Spotify**: Playlists and albums (requires API credentials)
- **YouTube**: Public playlists (no credentials needed)

All tracks are added with VIP priority. Progress updates sent every 10 tracks.

## Docker Deployment

### Docker Prerequisites

- Docker and Docker Compose installed
- FFmpeg available in container (included in Dockerfile)

### Docker Quick Start

```bash
# 1. Clone repository
git clone <repository-url>
cd wpp-music-bot

# 2. Configure API keys (optional)
# Create .env file with your API keys (see Configuration section)

# 3. Start
docker-compose up -d

# 4. View logs
docker-compose logs -f
```

### Volume Mounts

The `docker-compose.yml` mounts:

- `./storage:/app/storage` - Persistent data (auth, queue, stats, etc.)

### Environment Variables

Only secrets (API keys) need to be set in `.env`. All other settings are managed through the web UI and stored in `storage/data/settings.json`.

### Audio Playback

For audio playback on the host system:

#### Option 1: Network Mode (Linux)

```yaml
network_mode: host
```

#### Option 2: PulseAudio Socket (Linux)

```yaml
volumes:
  - /run/user/1000/pulse:/run/user/1000/pulse:ro
  - ${XDG_RUNTIME_DIR}/pulse:${XDG_RUNTIME_DIR}/pulse:ro
```

#### Option 3: ALSA Devices (Linux)

```yaml
devices:
  - /dev/snd:/dev/snd
```

**Note:** Audio playback in Docker requires additional configuration. For most use cases, running directly on the host is recommended.

### Docker Troubleshooting

- **Container won't start**: Check logs with `docker-compose logs`
- **Audio not playing**: Configure audio playback (see above) or use host network mode
- **Storage not persisting**: Ensure `./storage` directory exists and has correct permissions
- **Port conflicts**: Change `PORT` in `.env` or docker-compose.yml

## Troubleshooting

### Common Issues

#### "ffplay not found"

- Ensure FFmpeg is installed: `ffmpeg -version`
- Verify `ffplay` is available: `which ffplay` (Linux/macOS)

#### Files not cleaning up

- Check cleanup settings in the Settings panel of the web UI
- Verify `storage/temp/` directory permissions

#### Slow downloads

- Adjust download settings in the Settings panel (disable thumbnails or reduce audio quality)
- Check network connection and YouTube API rate limits

#### Spotify playlists not working

- Verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set
- Check credentials in Spotify Developer Dashboard
- Ensure playlist is public or shared with link
- Check logs for authentication errors

#### YouTube playlists not working

- Ensure playlist is public
- Update `yt-dlp`: `pip install -U yt-dlp`

#### WhatsApp connection issues

- Delete `storage/auth/` and restart to regenerate QR code
- Check network connectivity
- Verify WhatsApp account is not restricted

#### Web dashboard not loading

- Check server port and host settings in the Settings panel (or check `storage/data/settings.json`)
- Verify no firewall blocking the port
- Check logs for server errors
- Default is `http://localhost:3000`

## Development

### Project Structure

```text
wpp-music-bot/
├── src/
│   ├── api/          # Express server and routes
│   ├── commands/     # WhatsApp command handlers
│   ├── config/       # Configuration management
│   ├── core/         # Core functionality (player, queue, WhatsApp)
│   ├── services/     # Business logic services
│   └── utils/         # Utility functions
├── public/           # Web dashboard (HTML, CSS, JS)
├── storage/          # Data storage (auth, queue, media, etc.)
└── docs/            # Documentation
```

### Key Technologies

- **Runtime**: Bun
- **Web Framework**: Express
- **WhatsApp**: Baileys
- **Audio**: FFmpeg, MPV
- **Download**: play-dl, yt-dlp
- **Logging**: Pino

### Setup for Development

```bash
# Install dependencies
bun install

# Set DEBUG=true for detailed logs
echo "DEBUG=true" >> .env

# Start in development
bun start
```

### Development Configuration

- **Secrets**: Add API keys to `.env` (see Configuration section)
- **Settings**: Manage all other settings through the web UI
- **Debug**: Set `DEBUG=true` in `.env` to view full configuration on startup

Settings are automatically persisted to `storage/data/settings.json` and loaded on startup.
