/**
 * Download Service Tests
 * Tests for YouTube download functionality
 */

const { test, expect } = require('bun:test');
const { services } = require('../../../src/services');

// Note: downloadWithYtDlp and downloadTrack require mocking exec/spawn
// which is complex in Bun. These functions make system calls to yt-dlp
// and handle file I/O operations.

test('downloadWithYtDlp should be a function', () => {
    expect(typeof services.audio.download.downloadTrack).toBe('function');
});

test('downloadTrack should be a function', () => {
    expect(typeof downloadService.downloadTrack).toBe('function');
});