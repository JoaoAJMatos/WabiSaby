/**
 * Mobile API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router } = require('../../../src/api/routes/mobile.routes');
const dbService = require('../../../src/database/db.service');
const { initializeDatabase, getDatabase } = require('../../../src/database/index');
const playbackController = require('../../../src/core/playback.controller');
const queueManager = require('../../../src/core/queue');
const effectsService = require('../../../src/services/effects.service');
const whatsappAdapter = require('../../../src/core/whatsapp');
const player = require('../../../src/core/player');
const metadataService = require('../../../src/services/metadata.service');
const helpersUtil = require('../../../src/utils/helpers.util');

let testServer;
let getVipByTokenStub;
let verifyDeviceFingerprintStub;
let storeDeviceFingerprintStub;
let getCurrentStub;
let getQueueStub;
let getConnectionStatusStub;
let getEffectsStub;
let getPresetsInfoStub;
let getBackendStub;
let getAudioDurationStub;
let getThumbnailUrlStub;
let existsSyncStub;

beforeEach(() => {
    // Initialize database
    try {
        initializeDatabase();
    } catch (e) {
        // Database might already be initialized
    }
    
    // Clear priority users
    const db = getDatabase();
    db.exec('DELETE FROM priority_users;');
    
    // Setup stubs
    getVipByTokenStub = sinon.stub(dbService, 'getVipByToken');
    verifyDeviceFingerprintStub = sinon.stub(dbService, 'verifyDeviceFingerprint');
    storeDeviceFingerprintStub = sinon.stub(dbService, 'storeDeviceFingerprint');
    
    getCurrentStub = sinon.stub(playbackController, 'getCurrent');
    
    getQueueStub = sinon.stub(queueManager, 'getQueue');
    getConnectionStatusStub = sinon.stub(whatsappAdapter, 'getConnectionStatus');
    getEffectsStub = sinon.stub(effectsService, 'getEffects');
    getPresetsInfoStub = sinon.stub(effectsService, 'getPresetsInfo');
    getBackendStub = sinon.stub(player, 'getBackend');
    getAudioDurationStub = sinon.stub(metadataService, 'getAudioDuration');
    getThumbnailUrlStub = sinon.stub(helpersUtil, 'getThumbnailUrl');
    existsSyncStub = sinon.stub(require('fs'), 'existsSync');
});

afterEach(async () => {
    if (testServer) {
        await testServer.close();
        testServer = null;
    }
    sinon.restore();
});

test('POST /api/mobile/auth should authenticate with valid token and fingerprint (first access)', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: null
    };
    
    getVipByTokenStub.returns(mockVip);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/mobile/auth', {
        body: {
            token: 'test-token-123',
            fingerprint: 'device-fingerprint-hash'
        }
    });
    
    expect(response.status).toBe(200);
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.vip.whatsappId).toBe('vip@whatsapp');
    expect(data.vip.name).toBe('VIP User');
    expect(data.firstAccess).toBe(true);
    expect(storeDeviceFingerprintStub.calledOnce).toBe(true);
    expect(storeDeviceFingerprintStub.firstCall.args[0]).toBe('test-token-123');
    expect(storeDeviceFingerprintStub.firstCall.args[1]).toBe('device-fingerprint-hash');
});

test('POST /api/mobile/auth should authenticate with valid token and matching fingerprint (subsequent access)', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: 'device-fingerprint-hash'
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/mobile/auth', {
        body: {
            token: 'test-token-123',
            fingerprint: 'device-fingerprint-hash'
        }
    });
    
    expect(response.status).toBe(200);
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.firstAccess).toBe(false);
    expect(verifyDeviceFingerprintStub.calledOnce).toBe(true);
    expect(storeDeviceFingerprintStub.called).toBe(false);
});

test('POST /api/mobile/auth should return 400 when token is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/mobile/auth', {
        body: {
            fingerprint: 'device-fingerprint-hash'
        }
    });
    
    expect(response.status).toBe(400);
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Token required');
});

test('POST /api/mobile/auth should return 400 when fingerprint is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/mobile/auth', {
        body: {
            token: 'test-token-123'
        }
    });
    
    expect(response.status).toBe(400);
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Device fingerprint required');
});

test('POST /api/mobile/auth should return 401 when token is invalid', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    getVipByTokenStub.returns(null);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/mobile/auth', {
        body: {
            token: 'invalid-token',
            fingerprint: 'device-fingerprint-hash'
        }
    });
    
    expect(response.status).toBe(401);
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Invalid token');
});

test('POST /api/mobile/auth should return 403 when fingerprint does not match', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: 'different-fingerprint'
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(false);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/mobile/auth', {
        body: {
            token: 'test-token-123',
            fingerprint: 'wrong-fingerprint'
        }
    });
    
    expect(response.status).toBe(403);
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Device fingerprint mismatch');
});

test('GET /api/mobile/status should return status with authentication', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Setup authentication - create VIP and token
    const db = getDatabase();
    const token = 'test-token-123';
    const fingerprint = 'device-fingerprint-hash';
    db.exec(`
        INSERT INTO priority_users (whatsapp_id, name, mobile_token, device_fingerprint)
        VALUES ('vip@whatsapp', 'VIP User', '${token}', '${fingerprint}')
    `);
    
    // Restore stubs to use real database functions for authentication
    getVipByTokenStub.restore();
    verifyDeviceFingerprintStub.restore();
    storeDeviceFingerprintStub.restore();
    
    const mockCurrent = {
        content: '/path/to/song.mp3',
        title: 'Test Song',
        artist: 'Test Artist',
        type: 'file',
        startTime: Date.now() - 10000,
        thumbnail: '/path/to/thumb.jpg'
    };
    
    const mockQueue = [
        {
            content: 'url1',
            title: 'Queue Song 1',
            thumbnail: '/path/to/thumb1.jpg'
        }
    ];
    
    playbackController.isPaused = false;
    getCurrentStub.returns(mockCurrent);
    getQueueStub.returns(mockQueue);
    getConnectionStatusStub.returns(true);
    getEffectsStub.returns({ speed: 1.0, enabled: true });
    getPresetsInfoStub.returns([{ id: 'normal', name: 'Normal' }]);
    existsSyncStub.returns(true);
    getThumbnailUrlStub.returns('http://localhost:3000/api/thumbnails/thumb.jpg');
    getAudioDurationStub.resolves(200000);
    
    const response = await makeRequest(testServer.url, 'GET', `/api/mobile/status?token=${token}&fingerprint=${fingerprint}`);
    
    expect(response.status).toBe(200);
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('auth');
    expect(data).toHaveProperty('queue');
    expect(data).toHaveProperty('effects');
    expect(data.auth.isConnected).toBe(true);
    expect(data.queue.currentSong).toBeDefined();
    expect(data.queue.queue).toBeInstanceOf(Array);
    expect(data.effects.effects).toBeDefined();
});

test('GET /api/mobile/status should return 401 when not authenticated', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'GET', '/api/mobile/status');
    
    expect(response.status).toBe(401);
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Mobile token required');
});

test('GET /api/mobile/effects should return effects with authentication', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Setup authentication
    const db = getDatabase();
    const token = 'test-token-123';
    const fingerprint = 'device-fingerprint-hash';
    db.exec(`
        INSERT INTO priority_users (whatsapp_id, name, mobile_token, device_fingerprint)
        VALUES ('vip@whatsapp', 'VIP User', '${token}', '${fingerprint}')
    `);
    
    // Restore stubs to use real database functions for authentication
    getVipByTokenStub.restore();
    verifyDeviceFingerprintStub.restore();
    storeDeviceFingerprintStub.restore();
    
    const mockEffects = {
        speed: 1.0,
        enabled: true,
        preset: 'normal'
    };
    
    const mockPresets = [
        { id: 'normal', name: 'Normal' },
        { id: 'slowed', name: 'Slowed' }
    ];
    
    getEffectsStub.returns(mockEffects);
    getPresetsInfoStub.returns(mockPresets);
    getBackendStub.returns('mpv');
    
    const response = await makeRequest(testServer.url, 'GET', `/api/mobile/effects?token=${token}&fingerprint=${fingerprint}`);
    
    expect(response.status).toBe(200);
    const data = await parseJsonResponse(response);
    expect(data.effects).toEqual(mockEffects);
    expect(data.presets).toEqual(mockPresets);
    expect(data.backend).toBe('mpv');
    expect(data.seamless).toBe(true);
});

test('GET /api/mobile/effects should return 401 when not authenticated', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'GET', '/api/mobile/effects');
    
    expect(response.status).toBe(401);
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Mobile token required');
});

test('PUT /api/mobile/effects should update effects with authentication', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Setup authentication
    const db = getDatabase();
    const token = 'test-token-123';
    const fingerprint = 'device-fingerprint-hash';
    db.exec(`
        INSERT INTO priority_users (whatsapp_id, name, mobile_token, device_fingerprint)
        VALUES ('vip@whatsapp', 'VIP User', '${token}', '${fingerprint}')
    `);
    
    // Restore stubs to use real database functions for authentication
    getVipByTokenStub.restore();
    verifyDeviceFingerprintStub.restore();
    storeDeviceFingerprintStub.restore();
    
    const newSettings = {
        speed: 1.2,
        enabled: true
    };
    
    const updatedEffects = {
        ...newSettings,
        preset: 'custom'
    };
    
    const validateStub = sinon.stub(effectsService, 'validate').returns([]);
    const updateEffectsStub = sinon.stub(effectsService, 'updateEffects').returns(updatedEffects);
    const buildFilterChainStub = sinon.stub(effectsService, 'buildFilterChain').returns('filter-chain');
    const emitStub = sinon.stub(playbackController, 'emit');
    getCurrentStub.returns({ title: 'Current Song' });
    getBackendStub.returns('mpv');
    
    const response = await makeRequest(testServer.url, 'PUT', `/api/mobile/effects?token=${token}&fingerprint=${fingerprint}`, {
        body: newSettings
    });
    
    expect(response.status).toBe(200);
    const data = await parseJsonResponse(response);
    expect(data.effects).toEqual(updatedEffects);
    expect(updateEffectsStub.calledOnce).toBe(true);
    expect(validateStub.calledOnce).toBe(true);
    
    validateStub.restore();
    updateEffectsStub.restore();
    buildFilterChainStub.restore();
    emitStub.restore();
});

test('PUT /api/mobile/effects should return 400 for invalid settings', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Setup authentication
    const db = getDatabase();
    const token = 'test-token-123';
    const fingerprint = 'device-fingerprint-hash';
    db.exec(`
        INSERT INTO priority_users (whatsapp_id, name, mobile_token, device_fingerprint)
        VALUES ('vip@whatsapp', 'VIP User', '${token}', '${fingerprint}')
    `);
    
    // Restore stubs to use real database functions for authentication
    getVipByTokenStub.restore();
    verifyDeviceFingerprintStub.restore();
    storeDeviceFingerprintStub.restore();
    
    const validateStub = sinon.stub(effectsService, 'validate').returns(['Invalid speed value']);
    
    const response = await makeRequest(testServer.url, 'PUT', `/api/mobile/effects?token=${token}&fingerprint=${fingerprint}`, {
        body: { speed: 5.0 }
    });
    
    expect(response.status).toBe(400);
    const data = await parseJsonResponse(response);
    expect(data.errors).toBeInstanceOf(Array);
    expect(data.errors.length).toBeGreaterThan(0);
    
    validateStub.restore();
});

test('POST /api/mobile/effects/preset/:presetId should apply preset with authentication', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Setup authentication
    const db = getDatabase();
    const token = 'test-token-123';
    const fingerprint = 'device-fingerprint-hash';
    db.exec(`
        INSERT INTO priority_users (whatsapp_id, name, mobile_token, device_fingerprint)
        VALUES ('vip@whatsapp', 'VIP User', '${token}', '${fingerprint}')
    `);
    
    // Restore stubs to use real database functions for authentication
    getVipByTokenStub.restore();
    verifyDeviceFingerprintStub.restore();
    storeDeviceFingerprintStub.restore();
    
    const updatedEffects = {
        speed: 0.85,
        preset: 'slowed'
    };
    
    const applyPresetStub = sinon.stub(effectsService, 'applyPreset').returns(updatedEffects);
    const buildFilterChainStub = sinon.stub(effectsService, 'buildFilterChain').returns('preset-filter-chain');
    const emitStub = sinon.stub(playbackController, 'emit');
    getCurrentStub.returns({ title: 'Current Song' });
    getBackendStub.returns('mpv');
    
    const response = await makeRequest(testServer.url, 'POST', `/api/mobile/effects/preset/slowed?token=${token}&fingerprint=${fingerprint}`);
    
    expect(response.status).toBe(200);
    const data = await parseJsonResponse(response);
    expect(data.effects).toEqual(updatedEffects);
    expect(applyPresetStub.calledOnce).toBe(true);
    expect(applyPresetStub.firstCall.args[0]).toBe('slowed');
    
    applyPresetStub.restore();
    buildFilterChainStub.restore();
    emitStub.restore();
});

test('POST /api/mobile/effects/preset/:presetId should return 400 for invalid preset', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Setup authentication
    const db = getDatabase();
    const token = 'test-token-123';
    const fingerprint = 'device-fingerprint-hash';
    db.exec(`
        INSERT INTO priority_users (whatsapp_id, name, mobile_token, device_fingerprint)
        VALUES ('vip@whatsapp', 'VIP User', '${token}', '${fingerprint}')
    `);
    
    // Restore stubs to use real database functions for authentication
    getVipByTokenStub.restore();
    verifyDeviceFingerprintStub.restore();
    storeDeviceFingerprintStub.restore();
    
    const applyPresetStub = sinon.stub(effectsService, 'applyPreset').throws(new Error('Preset not found'));
    
    const response = await makeRequest(testServer.url, 'POST', `/api/mobile/effects/preset/invalid?token=${token}&fingerprint=${fingerprint}`);
    
    expect(response.status).toBe(400);
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Preset not found');
    
    applyPresetStub.restore();
});

test('POST /api/mobile/effects/preset/:presetId should return 401 when not authenticated', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/mobile/effects/preset/slowed');
    
    expect(response.status).toBe(401);
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Mobile token required');
});

