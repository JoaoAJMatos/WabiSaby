/**
 * Stats API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router } = require('../../../src/api/routes/stats.routes');
const statsService = require('../../../src/services/stats.service');
const queueManager = require('../../../src/core/queue');
const playbackController = require('../../../src/core/playback.controller');

let testServer;
let getStatsStub;
let getOverviewStub;
let getTopArtistsStub;
let getTopRequestersStub;
let getHistoryStub;
let recordSongPlayedStub;
let resetStatsStub;
let getUptimeStub;

beforeEach(() => {
    getStatsStub = sinon.stub(statsService, 'getStats');
    getOverviewStub = sinon.stub(statsService, 'getOverview');
    getTopArtistsStub = sinon.stub(statsService, 'getTopArtists');
    getTopRequestersStub = sinon.stub(statsService, 'getTopRequesters');
    getHistoryStub = sinon.stub(statsService, 'getHistory');
    recordSongPlayedStub = sinon.stub(statsService, 'recordSongPlayed');
    resetStatsStub = sinon.stub(statsService, 'resetStats');
    getUptimeStub = sinon.stub(statsService, 'getUptime');
    
    // Clear queue
    queueManager.queue = [];
    playbackController.isPlaying = false;
    playbackController.currentSong = null;
});

afterEach(async () => {
    if (testServer) {
        await testServer.close();
        testServer = null;
    }
    sinon.restore();
    queueManager.queue = [];
    playbackController.currentSong = null;
});

test('GET /api/stats should return all stats', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const mockStats = {
        uptime: 7200000, // Add uptime property
        songsPlayed: 100,
        requesters: { 'user1': 50, 'user2': 30 },
        history: []
    };
    
    getStatsStub.returns(mockStats);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/stats');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('songsPlayed');
    expect(data).toHaveProperty('queueLength');
    expect(data).toHaveProperty('requesters');
    expect(data).toHaveProperty('historyCount');
    expect(data.songsPlayed).toBe(100);
});

test('GET /api/stats/overview should return detailed overview', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const mockOverview = {
        songsPlayed: 100,
        totalDuration: 3600000,
        topArtists: [],
        topRequesters: []
    };
    
    getOverviewStub.returns(mockOverview);
    getUptimeStub.returns(7200000);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/stats/overview');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('songsPlayed');
    expect(data).toHaveProperty('queueLength');
    expect(data).toHaveProperty('uptime');
});

test('GET /api/stats/artists should return top artists', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const mockArtists = [
        { name: 'Artist 1', count: 50 },
        { name: 'Artist 2', count: 30 }
    ];
    
    getTopArtistsStub.returns(mockArtists);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/stats/artists');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toEqual(mockArtists);
    expect(getTopArtistsStub.firstCall.args[0]).toBe(10); // default limit
});

test('GET /api/stats/artists should respect limit parameter', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    getTopArtistsStub.returns([]);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/stats/artists?limit=5');
    expect(response.status).toBe(200);
    
    expect(getTopArtistsStub.firstCall.args[0]).toBe(5);
});

test('GET /api/stats/requesters should return top requesters', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const mockRequesters = [
        { name: 'User 1', count: 50 },
        { name: 'User 2', count: 30 }
    ];
    
    getTopRequestersStub.returns(mockRequesters);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/stats/requesters');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toEqual(mockRequesters);
    expect(getTopRequestersStub.firstCall.args[0]).toBe(20); // default limit
});

test('GET /api/stats/history should return play history', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const mockHistory = [
        { title: 'Song 1', requester: 'User 1', timestamp: Date.now() },
        { title: 'Song 2', requester: 'User 2', timestamp: Date.now() }
    ];
    
    getHistoryStub.returns(mockHistory);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/stats/history');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toEqual(mockHistory);
    expect(getHistoryStub.firstCall.args[0]).toBe(20); // default limit
});

test('POST /api/stats/record should record played song', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/stats/record', {
        body: {
            title: 'Test Song',
            requester: 'Test User',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            content: 'https://youtube.com/watch?v=test'
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(recordSongPlayedStub.calledOnce).toBe(true);
    expect(recordSongPlayedStub.firstCall.args[0]).toHaveProperty('title', 'Test Song');
});

test('POST /api/stats/record should return 400 when title and content are missing', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/stats/record', {
        body: {}
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Song title or content required');
});

test('POST /api/stats/reset should reset stats', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/stats/reset');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(resetStatsStub.calledOnce).toBe(true);
});

test('GET /api/stats/debug should return debug stats', async () => {
    testServer = await startTestServer(createTestApp(router, '/api/stats'));
    
    const mockStats = {
        songsPlayed: 100,
        history: [{ duration: 180000 }, { duration: 0 }],
        requesters: { 'user1': 50 },
        artists: { 'artist1': 30 }
    };
    
    getStatsStub.returns(mockStats);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/stats/debug');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('raw');
    expect(data).toHaveProperty('computed');
    expect(data.computed.historyCount).toBe(2);
    expect(data.computed.songsWithDuration).toBe(1);
});

