/**
 * Spotify Auth Service Tests
 * Tests for Spotify API authentication
 */

const { test, expect, beforeEach } = require('bun:test');
const config = require('../../../src/config');
const spotifyAuthService = require('../../../src/services/spotify-auth.service');

// Store original config
const originalClientId = config.spotify?.clientId;
const originalClientSecret = config.spotify?.clientSecret;

beforeEach(() => {
    // Clear token cache
    spotifyAuthService.clearToken();
    
    // Reset config
    if (config.spotify) {
        config.spotify.clientId = originalClientId;
        config.spotify.clientSecret = originalClientSecret;
    }
});

test('hasSpotifyCredentials should return false when credentials not set', () => {
    // Store original env vars
    const originalEnvId = process.env.SPOTIFY_CLIENT_ID;
    const originalEnvSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    // Clear env vars
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!config.spotify) config.spotify = {};
    config.spotify.clientId = null;
    config.spotify.clientSecret = null;
    
    try {
        expect(spotifyAuthService.hasSpotifyCredentials()).toBe(false);
    } finally {
        // Restore env vars
        if (originalEnvId) process.env.SPOTIFY_CLIENT_ID = originalEnvId;
        if (originalEnvSecret) process.env.SPOTIFY_CLIENT_SECRET = originalEnvSecret;
    }
});

test('hasSpotifyCredentials should return false when only clientId set', () => {
    // Store original env vars
    const originalEnvId = process.env.SPOTIFY_CLIENT_ID;
    const originalEnvSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    // Clear env vars
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!config.spotify) config.spotify = {};
    config.spotify.clientId = 'test-id';
    config.spotify.clientSecret = null;
    
    try {
        expect(spotifyAuthService.hasSpotifyCredentials()).toBe(false);
    } finally {
        // Restore env vars
        if (originalEnvId) process.env.SPOTIFY_CLIENT_ID = originalEnvId;
        if (originalEnvSecret) process.env.SPOTIFY_CLIENT_SECRET = originalEnvSecret;
    }
});

test('hasSpotifyCredentials should return false when only clientSecret set', () => {
    // Store original env vars
    const originalEnvId = process.env.SPOTIFY_CLIENT_ID;
    const originalEnvSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    // Clear env vars
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!config.spotify) config.spotify = {};
    config.spotify.clientId = null;
    config.spotify.clientSecret = 'test-secret';
    
    try {
        expect(spotifyAuthService.hasSpotifyCredentials()).toBe(false);
    } finally {
        // Restore env vars
        if (originalEnvId) process.env.SPOTIFY_CLIENT_ID = originalEnvId;
        if (originalEnvSecret) process.env.SPOTIFY_CLIENT_SECRET = originalEnvSecret;
    }
});

test('hasSpotifyCredentials should return true when both credentials set', () => {
    if (!config.spotify) config.spotify = {};
    config.spotify.clientId = 'test-id';
    config.spotify.clientSecret = 'test-secret';
    
    expect(spotifyAuthService.hasSpotifyCredentials()).toBe(true);
});

test('clearToken should clear cached token', () => {
    // Token is cleared in beforeEach, so this tests the function exists
    expect(() => {
        spotifyAuthService.clearToken();
    }).not.toThrow();
});

test('getSpotifyAccessToken should throw when credentials not configured', async () => {
    if (!config.spotify) config.spotify = {};
    config.spotify.clientId = null;
    config.spotify.clientSecret = null;
    
    // Clear env vars if they exist
    const originalEnvId = process.env.SPOTIFY_CLIENT_ID;
    const originalEnvSecret = process.env.SPOTIFY_CLIENT_SECRET;
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    
    try {
        await expect(
            spotifyAuthService.getSpotifyAccessToken()
        ).rejects.toThrow('Spotify API credentials not configured');
    } finally {
        // Restore env vars
        if (originalEnvId) process.env.SPOTIFY_CLIENT_ID = originalEnvId;
        if (originalEnvSecret) process.env.SPOTIFY_CLIENT_SECRET = originalEnvSecret;
    }
});

// Note: Full testing of getSpotifyAccessToken requires mocking axios
// which is complex in Bun. The above tests cover the configuration checks.
// Integration tests would test the actual API calls.

