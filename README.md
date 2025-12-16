<div align="center">

![WabiSaby Banner](./docs/assets/banner.svg)

# WabiSaby

**A collaborative music bot for WhatsApp groups with a beautiful web dashboard**

[![Bun](https://img.shields.io/badge/Runtime-Bun-black?style=for-the-badge&logo=bun)](https://bun.sh)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)](./package.json)

[Quick Start](#-quick-start) • [Features](#-features) • [Documentation](./docs) • [Configuration](./docs/CONFIGURATION.md)

</div>

---

## 🎵 What is WabiSaby?

WabiSaby is a music bot that brings collaborative music playback to your WhatsApp groups. Share YouTube or Spotify links, and the bot plays them on your server with a beautiful web dashboard for real-time control and visualization.

Perfect for:

- 🎉 **Party hosts** who want to share music with guests
- 👥 **Friend groups** who want to collaborate on playlists
- 🏢 **Communities** looking for a shared music experience
- 🎮 **Gaming sessions** that need background music

> Hook the PC to a speaker and let your friends do the rest.

## ✨ Features

### 🎤 WhatsApp Integration

- Send YouTube/Spotify links directly or use commands
- Smart notifications when your song is about to play
- VIP system with priority queue and playlist support
- Support for multiple WhatsApp groups

### 🎨 Web Dashboard

- **Real-time audio visualizer** - See the music come alive
- **Synchronized playback control** - Play, pause, skip, and seek
- **Queue management** - Drag and drop to reorder songs
- **Statistics dashboard** - Track uptime, top requesters, and playback history
- **VIP management** - Control priority users from the web interface
- **System logs** - Monitor everything in real-time

### 🎛️ Audio Effects

- Real-time audio effects (EQ, reverb, echo, speed control)
- Preset effects (Normal, Bass Boost, Treble Boost, etc.)
- Customizable filter chains

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

- The database file is created at `storage/data/wabisaby.db`
- The `better-sqlite3` package (already included) handles all SQLite operations
- **No system-level SQLite installation needed** - everything is handled by the Node.js package

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
| `!help` | Show all available commands |

### Notification System

Get notified when your requested song is about to play! Configure the notification position in the Settings panel (default: next in queue).

- `!notifications` - Check status
- `!notifications on` - Enable
- `!notifications off` - Disable
- `!notifications clear` - Clear history

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
- `STORAGE_DIR` - Storage directory path (default: ./storage)
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

- Built with [Bun](https://bun.sh) for blazing-fast performance
- WhatsApp integration powered by [Baileys](https://github.com/WhiskeySockets/Baileys)
- Audio processing with [FFmpeg](https://ffmpeg.org/)
