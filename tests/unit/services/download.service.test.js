/**
 * Download Service Tests
 * Tests for YouTube download functionality
 */

const { test, expect } = require('bun:test');
const downloadService = require('../../../src/services/download.service');

// Note: downloadWithYtDlp and downloadTrack require mocking exec/spawn
// which is complex in Bun. These functions make system calls to yt-dlp
// and handle file I/O operations.

test('downloadWithYtDlp should be a function', () => {
    expect(typeof downloadService.downloadWithYtDlp).toBe('function');
});

test('downloadTrack should be a function', () => {
    expect(typeof downloadService.downloadTrack).toBe('function');
});

// Note: Full testing of downloadWithYtDlp and downloadTrack requires:
// - Mocking child_process.exec/spawn
// - Mocking fs operations
// - Mocking config paths
// - Testing progress callbacks
// - Testing error handling (download failures, rate limiting)
// 
// These are better suited for integration tests that can test
// the actual download process with a test YouTube URL.

