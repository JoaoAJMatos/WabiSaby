# Configuration Guide

This guide provides comprehensive documentation for all environment variables used by WabiSaby, including why they're needed and what fallback behavior occurs when they're not set.

## Quick Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | `3000` | Port for the web dashboard server |
| `HOST` | No | `localhost` | Host address for the web server |
| `TARGET_GROUP_ID` | No | `null` | Restrict bot to a specific WhatsApp group |
| `SPOTIFY_CLIENT_ID` | No* | `null` | Spotify API Client ID (required for playlists) |
| `SPOTIFY_CLIENT_SECRET` | No* | `null` | Spotify API Client Secret (required for playlists) |
| `YOUTUBE_API_KEY` | No | `null` | YouTube Data API v3 key for improved search |

\* Required for Spotify playlist/album support. Individual Spotify tracks work without credentials.

## Environment Variables

### Server Configuration

#### `PORT`

- **Type**: Integer
- **Required**: No
- **Default**: `3000`
- **Purpose**: Port number for the web dashboard server

**Fallback Behavior:**

- If not set, defaults to `3000`
- Can also be configured via the web UI (stored in `storage/data/settings.json`)
- Environment variable takes precedence over UI settings

**Notes:**

- Requires a restart to take effect
- Must be a valid port number (1-65535)
- If invalid, the system will default to 3000

**Example:**

```bash
PORT=8080
```

---

#### `HOST`

- **Type**: String
- **Required**: No
- **Default**: `localhost`
- **Purpose**: Host address for the web server

**Fallback Behavior:**

- If not set, defaults to `localhost`
- Can also be configured via the web UI (stored in `storage/data/settings.json`)
- Environment variable takes precedence over UI settings

**Notes:**

- Requires a restart to take effect
- Set to `0.0.0.0` to allow external connections
- Use `localhost` for local-only access

**Example:**

```bash
HOST=0.0.0.0  # Allow external connections
```

---

### WhatsApp Configuration

#### `TARGET_GROUP_ID`

- **Type**: String
- **Required**: No
- **Default**: `null` (responds to all groups)
- **Purpose**: Restrict bot to respond only to a specific WhatsApp group

**Fallback Behavior:**

- If not set, the bot responds to all groups it's added to
- Can also manage multiple groups via the web UI (stored in `storage/data/groups.json`)
- When using `TARGET_GROUP_ID`, only messages from that group are processed
- If groups are configured via UI, `TARGET_GROUP_ID` is used as backward compatibility fallback

**Notes:**

- Find the group ID in logs when a message is sent
- Format: `123456789@g.us`
- For managing multiple groups, use the web UI instead

**Example:**

```bash
TARGET_GROUP_ID=123456789@g.us
```

---

### Spotify API Configuration

#### `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`

- **Type**: String
- **Required**: No* (required for playlists/albums)
- **Default**: `null`
- **Purpose**: Spotify API credentials for playlist/album support and improved track metadata

**Fallback Behavior:**

- **Individual Spotify Tracks**:
  - Falls back to web scraping if API credentials are not available
  - Works without credentials, but metadata may be less accurate

- **Spotify Playlists/Albums**:
  - **Will NOT work** without credentials (throws error)
  - Required for VIP playlist feature (`!playlist` command)
  - Both `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` must be set together

**Setup Instructions:**

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create app"
4. Fill in the app details:
   - App name: `WabiSaby` (or any name you prefer)
   - App description: Optional
   - Redirect URI: `http://localhost` (required but not used for this use case)
5. Accept the terms and click "Save"
6. Copy the **Client ID** and **Client Secret** from the app dashboard
7. Add both to your `.env` file

**Notes:**

- Both credentials must be set together (one without the other will not work)
- Credentials are loaded from `.env` on startup
- The bot uses the Client Credentials flow (no user authentication required)
- YouTube playlists work without any API credentials

**Example:**

```bash
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

---

### YouTube Data API Configuration

#### `YOUTUBE_API_KEY`

- **Type**: String
- **Required**: No
- **Default**: `null`
- **Purpose**: YouTube Data API v3 key for more accurate search results

**Fallback Behavior:**

- If not configured, falls back to `play-dl` library for search
- YouTube playlists work without API key (uses `yt-dlp`)
- Search results may be less accurate without the API key
- The API provides better matching for song titles and artists

**Setup Instructions:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select an existing one
3. Enable the "YouTube Data API v3":
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key
   - (Optional) Restrict the API key to "YouTube Data API v3" for security
5. Add the API key to your `.env` file

**Notes:**

- Free quota: 10,000 units/day (~100 searches/day)
- Each search uses 100 units
- If quota is exceeded, the bot automatically falls back to `play-dl`
- The API provides more accurate results, especially for artist-song matching
- YouTube playlists and direct video URLs work without the API key

**Example:**

```bash
YOUTUBE_API_KEY=your_api_key_here
```

---

## Fallback Behavior Summary

| Feature | Without Credentials | With Credentials |
|---------|-------------------|------------------|
| **Individual Spotify Tracks** | ✅ Works (web scraping) | ✅ Works (API, better metadata) |
| **Spotify Playlists/Albums** | ❌ Not supported | ✅ Works |
| **YouTube Search** | ✅ Works (play-dl) | ✅ Works (API, more accurate) |
| **YouTube Playlists** | ✅ Works (yt-dlp) | ✅ Works (yt-dlp) |
| **YouTube Direct URLs** | ✅ Works | ✅ Works |

## Creating Your .env File

1. Copy the example configuration file:

   ```bash
   cp config.example .env
   ```

2. Edit `.env` and add your API keys:

   ```bash
   # Required for Spotify playlists
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

   # Optional: For improved YouTube search
   YOUTUBE_API_KEY=your_youtube_api_key
   ```

3. Restart the bot for changes to take effect

## Configuration Priority

1. **Environment Variables** (`.env` file) - Highest priority
2. **Web UI Settings** (`storage/data/settings.json`) - For non-secret settings
3. **Default Values** - Used when neither of the above are set

**Note:** Server settings (`PORT`, `HOST`) require a restart to take effect, regardless of where they're configured.

## Troubleshooting

### Spotify Playlists Not Working

- Verify both `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set
- Check credentials in Spotify Developer Dashboard
- Ensure playlist is public or shared with link
- Check logs for authentication errors
- Restart the bot after adding credentials

### YouTube Search Not Using API

- Verify `YOUTUBE_API_KEY` is set correctly
- Check if API quota is exceeded (logs will show warnings)
- Ensure "YouTube Data API v3" is enabled in Google Cloud Console
- The bot will automatically fall back to `play-dl` if API fails

### Bot Not Responding to Groups

- If `TARGET_GROUP_ID` is set, verify the group ID is correct
- Check logs to see the group ID when a message is sent
- Use the web UI to manage multiple groups instead of `TARGET_GROUP_ID`
- Ensure the bot is added to the group

### Server Not Accessible

- Check `HOST` setting (use `0.0.0.0` for external access)
- Verify `PORT` is not in use by another application
- Check firewall settings
- Ensure the bot has been restarted after changing `PORT` or `HOST`
