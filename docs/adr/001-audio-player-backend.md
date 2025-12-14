# ADR 001: Audio Player Backend Selection

## Status

Accepted

## Date

2025-01-08

## Context

The WabiSaby music bot needs to play audio locally on the server and support real-time audio effects (speed, EQ, reverb, echo, etc.). Users expect effect changes to be seamless without audio interruption.

### Requirements

1. Play audio files locally on the server
2. Apply audio effects (FFmpeg filter chain)
3. Support real-time effect changes during playback
4. Minimal dependencies and cross-platform support
5. Handle pause, resume, seek operations

### Options Considered

#### Option A: ffplay (FFmpeg)

- **Pros**: 
  - Bundled with FFmpeg (widely available)
  - Supports full FFmpeg filter chain
  - Simple to spawn and control
- **Cons**:
  - No runtime filter modification
  - Effect changes require killing and restarting the process
  - Causes audible gap (~100-500ms) when effects change

#### Option B: MPV Player

- **Pros**:
  - JSON IPC interface for runtime control
  - Supports FFmpeg lavfi filters
  - Can change filters without interrupting playback (seamless!)
  - Better pause/resume/seek via IPC
- **Cons**:
  - Additional dependency to install
  - May require compilation on some systems (macOS without Xcode)
  - Slightly more complex IPC socket management

#### Option C: GStreamer

- **Pros**:
  - Very flexible pipeline architecture
  - Dynamic pipeline modification
- **Cons**:
  - Heavy dependency
  - Complex API
  - Overkill for this use case

#### Option D: Web Audio API (Browser-side)

- **Pros**:
  - Instant, seamless effect changes
  - No server-side dependencies
- **Cons**:
  - Audio plays from browser, not server speakers
  - Doesn't meet requirement of local server playback

## Decision

**Implement a dual-backend approach with automatic fallback:**

1. **Primary**: MPV with IPC for seamless effect changes
2. **Fallback**: ffplay when MPV is not available

The player module detects which backend is available at startup and uses the best option:

- If MPV is installed → Seamless real-time effect changes via IPC
- If only ffplay → Effect changes restart playback (with position preservation)

## Implementation

### Backend Detection

```javascript
async function detectBackend() {
    // Try MPV first (preferred)
    if (await isCommandAvailable('mpv')) {
        return 'mpv';
    }
    // Fallback to ffplay
    if (await isCommandAvailable('ffplay')) {
        return 'ffplay';
    }
    throw new Error('No audio backend available');
}
```

### MPV Mode

- Launch with `--input-ipc-server=/path/to/socket`
- Send commands via Unix socket: `{ "command": ["set_property", "af", "..."] }`
- Effect changes are instant and seamless

### ffplay Mode

- Launch with `-af` filter chain argument
- Effect changes require:
  1. Store current playback position
  2. Kill ffplay process
  3. Restart with new filters at saved position
- Small audio gap is unavoidable

### User Experience

- Both modes are transparent to the UI
- Effects panel works identically
- MPV mode shows no interruption; ffplay mode has brief gap

## Consequences

### Positive

- Works on any system with at least ffplay
- Optimal experience when MPV is available
- No forced dependency on MPV
- Clear upgrade path for users who want seamless effects

### Negative

- Two code paths to maintain
- Users without MPV have degraded (but functional) experience
- Need to document MPV installation for best experience

### Neutral

- Adds complexity but improves flexibility
- IPC socket management only needed for MPV mode

## Installation Notes

### macOS

```bash
# With Homebrew (may require Xcode)
brew install mpv

# Pre-built binary (no compilation)
# Download from: https://laboratory.stolendata.net/~djinn/mpv_osx/
# Then: sudo ln -s /Applications/mpv.app/Contents/MacOS/mpv /usr/local/bin/mpv
```

### Linux

```bash
# Ubuntu/Debian
sudo apt install mpv

# Arch
sudo pacman -S mpv

# Fedora
sudo dnf install mpv
```

### Windows

```bash
# With Chocolatey
choco install mpv

# Or download from: https://mpv.io/installation/
```

## References

- [MPV IPC Documentation](https://mpv.io/manual/master/#json-ipc)
- [FFmpeg Audio Filters](https://ffmpeg.org/ffmpeg-filters.html#Audio-Filters)
- [MPV macOS Builds](https://laboratory.stolendata.net/~djinn/mpv_osx/)
