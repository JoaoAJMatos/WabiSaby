/**
 * URL Utility Tests
 */

const { test, expect } = require('bun:test');
const {
    isSpotifyUrl,
    isYouTubeUrl,
    isSpotifyPlaylist,
    isYouTubePlaylist,
    isPlaylistUrl,
    isSpotifyTrackUrl
} = require('../../../src/utils/url.util');

test('isSpotifyUrl should identify Spotify URLs', () => {
    expect(isSpotifyUrl('https://open.spotify.com/track/123')).toBe(true);
    expect(isSpotifyUrl('https://spotify.com/album/456')).toBe(true);
    expect(isSpotifyUrl('http://open.spotify.com/playlist/789')).toBe(true);
    expect(isSpotifyUrl('https://youtube.com/watch?v=abc')).toBe(false);
    expect(isSpotifyUrl('not a url')).toBe(false);
    expect(isSpotifyUrl('')).toBe(false);
});

test('isYouTubeUrl should identify YouTube URLs', () => {
    expect(isYouTubeUrl('https://youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/abc123')).toBe(true);
    expect(isYouTubeUrl('http://youtu.be/abc123')).toBe(true);
    expect(isYouTubeUrl('https://open.spotify.com/track/123')).toBe(false);
    expect(isYouTubeUrl('not a url')).toBe(false);
    expect(isYouTubeUrl('')).toBe(false);
});

test('isSpotifyPlaylist should identify Spotify playlists and albums', () => {
    expect(isSpotifyPlaylist('https://open.spotify.com/playlist/123')).toBe(true);
    expect(isSpotifyPlaylist('https://open.spotify.com/album/456')).toBe(true);
    expect(isSpotifyPlaylist('https://open.spotify.com/track/789')).toBe(false);
    expect(isSpotifyPlaylist('https://youtube.com/watch?v=abc')).toBe(false);
});

test('isYouTubePlaylist should identify YouTube playlists', () => {
    expect(isYouTubePlaylist('https://youtube.com/watch?v=abc&list=xyz')).toBe(true);
    expect(isYouTubePlaylist('https://youtu.be/abc?list=xyz')).toBe(true);
    expect(isYouTubePlaylist('https://youtube.com/watch?v=abc')).toBe(false);
    expect(isYouTubePlaylist('https://open.spotify.com/playlist/123')).toBe(false);
});

test('isPlaylistUrl should identify any playlist URL', () => {
    expect(isPlaylistUrl('https://open.spotify.com/playlist/123')).toBe(true);
    expect(isPlaylistUrl('https://open.spotify.com/album/456')).toBe(true);
    expect(isPlaylistUrl('https://youtube.com/watch?v=abc&list=xyz')).toBe(true);
    expect(isPlaylistUrl('https://youtube.com/watch?v=abc')).toBe(false);
    expect(isPlaylistUrl('https://open.spotify.com/track/789')).toBe(false);
});

test('isSpotifyTrackUrl should identify Spotify track URLs', () => {
    expect(isSpotifyTrackUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toBe(true);
    expect(isSpotifyTrackUrl('https://open.spotify.com/track/abc123')).toBe(true);
    expect(isSpotifyTrackUrl('https://open.spotify.com/playlist/123')).toBe(false);
    expect(isSpotifyTrackUrl('https://open.spotify.com/album/456')).toBe(false);
    expect(isSpotifyTrackUrl('https://youtube.com/watch?v=abc')).toBe(false);
});

