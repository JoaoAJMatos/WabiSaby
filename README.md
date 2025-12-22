<div align="center">

![WabiSaby Banner](./docs/assets/banner.svg)

# WabiSaby 🍃

**A collaborative music bot for WhatsApp groups with a beautiful web dashboard**

[![Bun](https://img.shields.io/badge/Runtime-Bun-black?style=for-the-badge&logo=bun)](https://bun.sh)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)](./package.json)

[Quick Start](#-quick-start) • [Features](#-features) • [Documentation](./docs) • [Configuration](./docs/CONFIGURATION.md)

</div>

---

## 🎵 What is WabiSaby?

WabiSaby is a music bot that brings collaborative music playback to your WhatsApp groups. Share YouTube/Spotify links or song names, and WabiSaby will play them. It also has a clean dashboard for real-time control and visualization.

Perfect for:

- 🎊 **House parties** and spontaneous get-togethers with friends
- 💈 **Barbershops and salons** curating a fresh vibe for customers and staff
- 🍔 **Cafés, lounges, and small venues** creating a collaborative music mood
- 🕹️ **Game nights** or casual hangouts needing communal background tunes

> Hook the PC to a speaker and let your friends do the rest.

## ✨ Features

### 🎤 WhatsApp Integration

- Send YouTube/Spotify links directly or use commands
- Smart notifications when your song is about to play
- VIP system with priority queue and playlist support
- Support for multiple WhatsApp groups
- **Groups management** - Use `!ping` to request group monitoring, manage groups from dashboard
- **Multi-language support** - English and Portuguese with `!language` command

### 🎨 Web Dashboard

- **Real-time audio visualizer** - See the music come alive
- **Synchronized playback control** - Play, pause, skip, and seek
- **Queue management** - Drag and drop to reorder songs
- **Statistics dashboard** - Track uptime, top requesters, playback history, and other cool stuff
- **VIP management** - Control priority users from the web interface
- **Groups management** - Add/remove monitored groups, approve pending requests
- **System logs** - Monitor everything in real-time
- **Fullscreen player** - Dedicated fullscreen window for music visualization and lyrics

### 📱 Mobile VIP Access

- **Mobile-optimized interface** - Access from your phone or tablet
- **Real-time queue viewing** - See current song and upcoming tracks
- **Audio effects control** - Adjust speed, EQ, and effects on the go
- **Device-bound security** - Links are secured to your device
- **Automatic access** - VIPs receive a mobile access link via WhatsApp

### 🎛️ Audio Effects

- Real-time audio effects (EQ, reverb, echo, speed control)
- Preset effects (Normal, Bass Boost, Treble Boost, etc.)
- Customizable filter chains
- **Volume normalization** - Automatic volume leveling across songs with configurable thresholds

### 📊 Statistics & Analytics

- Uptime tracking
- Songs played counter
- Top requesters leaderboard
- Playback history
- Top artists analytics

### 🎯 VIP Features

- Priority queue (VIP songs added to front)
- Skip any song (not just own requests)
- Playlist support (Spotify/YouTube playlists)
- Profile picture display
- **Mobile access** - Dedicated mobile interface for viewing queue and controlling effects

### 🎼 Lyrics

- Automatic lyrics retrieval for current song
- Search by title, artist, and duration

---

## 🚀 Quick Start

### Prerequisites

- **[Bun](https://bun.sh)** (latest version recommended)
- **[FFmpeg](https://ffmpeg.org/)** (includes `ffplay` for server-side playback)

<details>
<summary><b>Install FFmpeg</b></summary>

- **macOS**: `brew install ffmpeg`
- **Linux**: `sudo apt install ffmpeg`
- **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add `bin` folder to PATH

</details>

<details>
<summary><b>SQLite Database</b></summary>

WabiSaby uses SQLite for data storage. **No additional setup is required** - the database is automatically created and initialized on first run.

- The database file is created at `{STORAGE_DIR}/data/wabisaby.db` (default location depends on platform)
- Uses Bun's built-in SQLite support (`bun:sqlite`) - no external dependencies needed
- **No system-level SQLite installation needed** - everything is handled by Bun's native SQLite

</details>

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd wpp-music-bot

# 2. Install dependencies
bun install

# 3. (Optional) Configure API keys
cp config.example .env
# Edit .env and add your API keys - see docs/CONFIGURATION.md for details

# 4. Start the bot
bun start
```

Open `http://localhost:3000` in your browser and scan the QR code to connect WhatsApp!

### Docker Installation

```bash
# 1. Clone repository
git clone <repository-url>
cd wpp-music-bot

# 2. (Optional) Configure API keys
cp config.example .env

# 3. Start with Docker Compose
docker-compose -f docker/docker-compose.yml up -d

# 4. View logs
docker-compose -f docker/docker-compose.yml logs -f
```

---

## 📖 Usage

### Connecting WhatsApp

1. Start the bot (`bun start`)
2. Open `http://localhost:3000` in your browser
3. Scan the QR code using WhatsApp (Linked Devices)

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
| `!ping` | Request to add this group to monitoring |
| `!language [en\|pt]` | Set your language preference (English/Portuguese) |
| `!help` | Show all available commands |

### Notification System

Get notified when your requested song is about to play! Configure the notification position in the Settings panel (default: next in queue).

- `!notifications` - Check status
- `!notifications on` - Enable
- `!notifications off` - Disable
- `!notifications clear` - Clear history

### Groups Management

Control which WhatsApp groups the bot monitors. Groups can request to be added using `!ping`, and you can approve or reject requests from the dashboard.

- `!ping` - Request to add current group to monitoring (requires dashboard approval)
- Manage groups from the Settings panel in the dashboard
- View pending group requests and approve/reject them
- Edit group names and remove groups as needed

### Language Support

WabiSaby supports multiple languages. Users can set their preferred language, and all bot messages will be in that language.

- `!language` - Show current language preference
- `!language en` - Set to English
- `!language pt` - Set to Português

Currently supported languages: 🇬🇧 English and 🇵🇹 Portuguese

---

## ⚙️ Configuration

Configuration is split into two parts:

1. **Secrets** (`.env` file) - API keys and sensitive settings
2. **Settings** (Web UI) - All other configuration managed through the dashboard

### Quick Setup

```bash
# Copy the example file
cp config.example .env

# Then edit .env and add your API keys
```

**Available Environment Variables:**

- `PORT` - Port for web dashboard (default: 3000)
- `HOST` - Host address (default: localhost)
- `STORAGE_DIR` - Storage directory path (default: platform-specific standard location)
- `TARGET_GROUP_ID` - Restrict bot to specific WhatsApp group (optional)
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` - Required for Spotify playlists
- `YOUTUBE_API_KEY` - Optional, improves search accuracy

**📚 For detailed documentation** on each variable, including why they're needed, default values, fallback behavior, and setup instructions, see the [Configuration Guide](./docs/CONFIGURATION.md).

> **Note:** Most settings (audio quality, playback settings, etc.) are managed through the web UI and automatically saved.

---

## 🎯 Advanced Features

### Spotify Playlist Support

Spotify API credentials are required for playlist/album support. Individual Spotify tracks work without credentials.

**Quick Setup:**

1. Get credentials from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Add to `.env`:

   ```bash
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```

3. Restart bot

**For detailed setup instructions**, see [Configuration Guide](./docs/CONFIGURATION.md#spotify-api-configuration).

### YouTube API (Improved Search)

Optional but improves search accuracy. Falls back to `play-dl` if not configured.

**Quick Setup:**

1. Get API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add to `.env`:

   ```bash
   YOUTUBE_API_KEY=your_api_key
   ```

**For detailed setup instructions**, see [Configuration Guide](./docs/CONFIGURATION.md#youtube-data-api-configuration).

### VIP Playlist Support

VIPs can add entire playlists using `!playlist <url>`:

- **Spotify**: Playlists and albums (requires API credentials)
- **YouTube**: Public playlists (no credentials needed)

All tracks are added with VIP priority. Progress updates sent every 10 tracks.

### Mobile VIP Access

When a user is granted VIP status, they automatically receive a mobile access link via WhatsApp. This link provides:

- **Mobile-optimized interface** at `/mobile/vip?token=...`
- **Real-time updates** - Current song, queue, and connection status
- **Audio effects control** - Full control over speed, EQ, reverb, echo, distortion, and compressor
- **Device security** - Link is bound to the first device that accesses it for security

### Volume Normalization

You know when a song comes on and it's too loud, so you rush to turn it down? Or when the next track is way too quiet and you can barely hear it? Volume normalization fixes that automatically.

WabiSaby analyzes each song when it's added to the queue and adjusts the volume so everything plays at a consistent level. No more jumping for the volume knob between tracks! You can configure what's considered "too quiet" or "too loud" and set your preferred target volume level.

- **Automatic analysis** - Songs are analyzed when added to the queue
- **Configurable thresholds** - Set what's considered "too quiet" or "too loud"
- **Target level** - Adjust all songs to a consistent target volume
- **Per-song gain** - Each song gets its own volume adjustment
- Manage settings from the Settings panel in the dashboard

### Playback State Persistence

WabiSaby automatically saves and restores playback state, so you can restart the bot without losing your place in the current song or queue position.

---

## 🐳 Docker Deployment

### Quick Start

```bash
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.yml logs -f
```

### Development Mode (with hot reload)

```bash
docker-compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up
```

### Volume Mounts

The `docker/docker-compose.yml` mounts:

- `./storage:/app/storage` - Persistent data (auth, database, queue, stats, etc.)
  - Database file: `storage/data/wabisaby.db`
  - WhatsApp auth: `storage/auth/`
  - Media files: `storage/media/`

**Custom Storage Location:**

You can use a custom storage directory by setting `STORAGE_DIR` in your `.env` file:

```bash
STORAGE_DIR=/var/lib/wabisaby
```

Then update `docker/docker-compose.yml` to mount your custom path:

```yaml
volumes:
  - /var/lib/wabisaby:/app/storage
```

### Audio Playback in Docker

Audio playback in Docker requires additional configuration. For most use cases, running directly on the host is recommended. See the [Docker Deployment Guide](./docs) for detailed instructions.

---

## 📚 Documentation

- **[Configuration Guide](./docs/CONFIGURATION.md)** - Complete guide to all environment variables
- **[API Documentation](./docs/API.md)** - Full API reference
- **[Architecture Decisions](./docs/adr/)** - Technical design decisions

---

## 🔧 Troubleshooting

### Common Issues

<details>
<summary><b>ffplay not found</b></summary>

- Ensure FFmpeg is installed: `ffmpeg -version`
- Verify `ffplay` is available: `which ffplay` (Linux/macOS)

</details>

<details>
<summary><b>Spotify playlists not working</b></summary>

- Verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set
- Check credentials in Spotify Developer Dashboard
- Ensure playlist is public or shared with link
- Check logs for authentication errors

</details>

<details>
<summary><b>WhatsApp connection issues</b></summary>

- Delete `storage/auth/` and restart to regenerate QR code
- Check network connectivity
- Verify WhatsApp account is not restricted

</details>

<details>
<summary><b>Web dashboard not loading</b></summary>

- Check server port and host settings in the Settings panel
- Verify no firewall blocking the port
- Default is `http://localhost:3000`

</details>

For more troubleshooting tips, see the [Configuration Guide](./docs/CONFIGURATION.md#troubleshooting).

---

## 🛠️ Development

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

- **Runtime**: [Bun](https://bun.sh)
- **Web Framework**: [Express](https://expressjs.com/)
- **WhatsApp**: [Baileys](https://github.com/WhiskeySockets/Baileys)
- **Audio**: FFmpeg, MPV
- **Download**: play-dl, yt-dlp
- **Logging**: [Pino](https://getpino.io/)

### Setup for Development

```bash
# Install dependencies
bun install

# Set DEBUG=true for detailed logs
echo "DEBUG=true" >> .env

# Start in development
bun start
```

---

## 🙏 Acknowledgments

These are the actual smart people:

- Built with [Bun](https://bun.sh) for blazing-fast performance
- WhatsApp integration powered by [Baileys](https://github.com/WhiskeySockets/Baileys)
- Audio processing with [FFmpeg](https://ffmpeg.org/)

Support them.
