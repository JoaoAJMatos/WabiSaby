# API Documentation

## Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Get combined status (auth, queue, stats) |

## Queue

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/queue` | GET | Get queue and current song |
| `/api/queue/add` | POST | Add song (URL or search query) |
| `/api/queue/skip` | POST | Skip current song |
| `/api/queue/pause` | POST | Pause playback |
| `/api/queue/resume` | POST | Resume playback |
| `/api/queue/seek` | POST | Seek to position (time in ms) |
| `/api/queue/remove/:index` | POST | Remove song by index |
| `/api/queue/reorder` | POST | Reorder queue items |
| `/api/queue/prefetch` | POST | Prefetch all songs |
| `/api/queue/newsession` | POST | Start new session (clear queue) |

## Priority (VIP)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/priority` | GET | Get VIP users |
| `/api/priority/add` | POST | Add VIP user |
| `/api/priority/remove` | POST | Remove VIP user |
| `/api/priority/profile-picture/:userId` | GET | Get user profile picture |
| `/api/priority/group-members` | GET | Get group members for VIP selection |

## Effects

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/effects` | GET | Get current effects and presets |
| `/api/effects` | PUT | Update effects settings |
| `/api/effects/preset/:presetId` | POST | Apply preset |
| `/api/effects/reset` | POST | Reset to defaults |
| `/api/effects/presets` | GET | Get all presets |

## Statistics API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats` | GET | Get all statistics |
| `/api/stats/overview` | GET | Get detailed overview |
| `/api/stats/artists` | GET | Get top artists |
| `/api/stats/requesters` | GET | Get top requesters |
| `/api/stats/history` | GET | Get playback history |
| `/api/stats/record` | POST | Record played song |
| `/api/stats/reset` | POST | Reset statistics |

## Notifications

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notifications/status` | GET | Get notification status |
| `/api/notifications/enable` | POST | Enable notifications |
| `/api/notifications/disable` | POST | Disable notifications |
| `/api/notifications/clear` | POST | Clear notification history |

## Settings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | Get editable settings |
| `/api/settings` | POST | Update single setting |
| `/api/settings/bulk` | POST | Update multiple settings |
| `/api/settings/reset` | POST | Reset to defaults |

## Groups

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/groups` | GET | Get monitored groups |
| `/api/groups` | POST | Add group to monitoring |
| `/api/groups/:groupId` | DELETE | Remove group |
| `/api/groups/pending` | GET | Get pending confirmations |
| `/api/groups/pending/:groupId/confirm` | POST | Confirm group addition |
| `/api/groups/pending/:groupId/reject` | POST | Reject group addition |
| `/api/groups/:groupId/metadata` | GET | Get group metadata |

## Lyrics API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lyrics` | GET | Get lyrics (query: title, artist, duration) |

## Logs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/logs` | GET | Get recent logs (query: limit, level, search) |
| `/api/logs/stream` | GET | Stream logs via SSE |
| `/api/logs/stats` | GET | Get log statistics |
| `/api/logs/clear` | POST | Clear logs |
