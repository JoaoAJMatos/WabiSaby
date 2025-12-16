/**
 * Queue API Routes Integration Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router } = require('../../../src/api/routes/queue.routes');
const queueManager = require('../../../src/core/queue');
const playbackController = require('../../../src/core/playback.controller');
const metadataService = require('../../../src/services/metadata.service');
const searchService = require('../../../src/services/search.service');
const urlUtil = require('../../../src/utils/url.util');
const { initializeDatabase } = require('../../../src/database/index');

let testServer;
let getTrackInfoStub;
let searchYouTubeStub;
let isSpotifyUrlStub;
let isYouTubeUrlStub;
let prefetchAllStub;
let skipStub;
let pauseStub;
let resumeStub;
let seekStub;
let resetSessionStub;

beforeEach(() => {
    // Initialize database
    try {
        initializeDatabase();
    } catch (e) {
        // Already initialized
    }
    
    // Clear queue
    queueManager.queue = [];
    queueManager.removeAllListeners();
    
    // Clear playback controller
    playbackController.isPlaying = false;
    playbackController.isPaused = false;
    playbackController.currentSong = null;
    playbackController.removeAllListeners();
    
    // Mock services - stub at module level
    getTrackInfoStub = sinon.stub(metadataService, 'getTrackInfo');
    searchYouTubeStub = sinon.stub(searchService, 'searchYouTube');
    isSpotifyUrlStub = sinon.stub(urlUtil, 'isSpotifyUrl');
    isYouTubeUrlStub = sinon.stub(urlUtil, 'isYouTubeUrl');
    prefetchAllStub = sinon.stub(playbackController, 'prefetchAll');
    skipStub = sinon.stub(playbackController, 'skip');
    pauseStub = sinon.stub(playbackController, 'pause');
    resumeStub = sinon.stub(playbackController, 'resume');
    seekStub = sinon.stub(playbackController, 'seek');
    resetSessionStub = sinon.stub(playbackController, 'resetSession');
});

afterEach(async () => {
    if (testServer) {
        await testServer.close();
        testServer = null;
    }
    sinon.restore();
    queueManager.queue = [];
    queueManager.removeAllListeners();
    playbackController.currentSong = null;
    playbackController.removeAllListeners();
});

test('GET /api/queue should return queue and current song', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Add a song to queue
    playbackController.isPlaying = true; // Prevent auto-processing
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song',
        sender: 'test@whatsapp'
    });
    
    const response = await makeRequest(testServer.url, 'GET', '/api/queue');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('queue');
    expect(data).toHaveProperty('currentSong');
    expect(Array.isArray(data.queue)).toBe(true);
    expect(data.queue.length).toBe(1);
});

test('POST /api/queue/add should add YouTube URL to queue', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Initialize database to avoid errors
    const { initializeDatabase } = require('../../../src/database/index');
    try {
        initializeDatabase();
    } catch (e) {
        // Already initialized
    }
    
    // Prevent auto-processing to keep song in queue
    playbackController.isPlaying = true;
    
    isYouTubeUrlStub.returns(true);
    isSpotifyUrlStub.returns(false);
    getTrackInfoStub.resolves({
        title: 'YouTube Song',
        artist: 'YouTube Artist'
    });
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/add', {
        body: {
            url: 'https://youtube.com/watch?v=test',
            requester: 'Test User'
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.title).toBe('YouTube Song');
    expect(data.artist).toBe('YouTube Artist');
    
    // Song should be in queue (since isPlaying prevents auto-processing)
    const queue = queueManager.getQueue();
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].title).toBe('YouTube Song');
    expect(queue[0].artist).toBe('YouTube Artist');
});

test('POST /api/queue/add should add Spotify URL to queue', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    isSpotifyUrlStub.returns(true);
    isYouTubeUrlStub.returns(false);
    getTrackInfoStub.resolves({
        title: 'Spotify Song',
        artist: 'Spotify Artist'
    });
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/add', {
        body: {
            url: 'https://open.spotify.com/track/123'
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
});

test('POST /api/queue/add should search and add song from query', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Initialize database to avoid errors
    const { initializeDatabase } = require('../../../src/database/index');
    try {
        initializeDatabase();
    } catch (e) {
        // Already initialized
    }
    
    isSpotifyUrlStub.returns(false);
    isYouTubeUrlStub.returns(false);
    searchYouTubeStub.resolves({
        url: 'https://youtube.com/watch?v=found',
        title: 'Found Song',
        artist: 'Found Artist'
    });
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/add', {
        body: {
            url: 'test song query'
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.title).toBe('Found Song');
    expect(data.artist).toBe('Found Artist');
    expect(searchYouTubeStub.calledOnce).toBe(true);
});

test('POST /api/queue/add should return 400 when input is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/add', {
        body: {}
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('URL or search query is required');
});

test('POST /api/queue/skip should skip current song', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.currentSong = {
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song'
    };
    skipStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/skip');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Skipped');
    expect(skipStub.calledOnce).toBe(true);
});

test('POST /api/queue/pause should pause current song', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.isPlaying = true;
    playbackController.currentSong = {
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song'
    };
    pauseStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/pause');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Paused');
    expect(pauseStub.calledOnce).toBe(true);
});

test('POST /api/queue/pause should return 400 when not playing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.isPlaying = false;
    pauseStub.returns(false);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/pause');
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Cannot pause');
});
    
test('POST /api/queue/resume should resume current song', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.isPlaying = true;
    playbackController.isPaused = true;
    playbackController.currentSong = {
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song',
        startTime: Date.now() - 5000,
        pausedAt: Date.now() - 1000
    };
    resumeStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/resume');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Resumed');
    expect(resumeStub.calledOnce).toBe(true);
});

test('POST /api/queue/resume should return 400 when not paused', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.isPlaying = false;
    resumeStub.returns(false);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/resume');
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Cannot resume');
});

test('POST /api/queue/seek should seek to position', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.isPlaying = true;
    playbackController.currentSong = {
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song',
        duration: 300000
    };
    seekStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/seek', {
        body: { time: 60000 }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Seeked');
    expect(seekStub.calledOnce).toBe(true);
    expect(seekStub.firstCall.args[0]).toBe(60000);
});

test('POST /api/queue/seek should return 400 for invalid time', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/seek', {
        body: { time: -1 }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Valid time');
});

test('POST /api/queue/remove/:index should remove song from queue', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.isPlaying = true; // Prevent auto-processing
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'test@whatsapp'
    });
    queueManager.add({
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2',
        sender: 'test@whatsapp'
    });
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/remove/0');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.removed).not.toBeNull();
    expect(queueManager.getQueue().length).toBe(1);
});

test('POST /api/queue/remove/:index should return 400 for invalid index', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/remove/999');
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Invalid index');
});

test('POST /api/queue/reorder should reorder queue items', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.isPlaying = true; // Prevent auto-processing
    queueManager.add({
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song 1',
        sender: 'test@whatsapp'
    });
    queueManager.add({
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2',
        sender: 'test@whatsapp'
    });
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/reorder', {
        body: { fromIndex: 0, toIndex: 1 }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('reordered');
});

test('POST /api/queue/reorder should return 400 for invalid indices', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/reorder', {
        body: { fromIndex: 'invalid', toIndex: 1 }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('fromIndex and toIndex are required');
});

test('POST /api/queue/prefetch should start prefetch', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    prefetchAllStub.resolves();
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/prefetch');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Prefetch started');
});

test('POST /api/queue/newsession should reset session', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    playbackController.isPlaying = true;
    playbackController.currentSong = {
        content: 'https://youtube.com/watch?v=test1',
        title: 'Test Song'
    };
    queueManager.queue = [{
        content: 'https://youtube.com/watch?v=test2',
        title: 'Test Song 2'
    }];
    resetSessionStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/queue/newsession');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('New session started');
    expect(queueManager.queue.length).toBe(0);
    expect(resetSessionStub.calledOnce).toBe(true);
});
