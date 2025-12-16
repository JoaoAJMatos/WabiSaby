/**
 * Effects API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router } = require('../../../src/api/routes/effects.routes');
const effectsService = require('../../../src/services/effects.service');
const queueManager = require('../../../src/core/queue');
const player = require('../../../src/core/player');

let testServer;
let getEffectsStub;
let getPresetsInfoStub;
let buildFilterChainStub;
let validateStub;
let updateEffectsStub;
let applyPresetStub;
let resetStub;
let getBackendStub;

beforeEach(() => {
    getEffectsStub = sinon.stub(effectsService, 'getEffects');
    getPresetsInfoStub = sinon.stub(effectsService, 'getPresetsInfo');
    buildFilterChainStub = sinon.stub(effectsService, 'buildFilterChain');
    validateStub = sinon.stub(effectsService, 'validate');
    updateEffectsStub = sinon.stub(effectsService, 'updateEffects');
    applyPresetStub = sinon.stub(effectsService, 'applyPreset');
    resetStub = sinon.stub(effectsService, 'reset');
    getBackendStub = sinon.stub(player, 'getBackend');
    
    queueManager.removeAllListeners();
});

afterEach(async () => {
    if (testServer) {
        await testServer.close();
        testServer = null;
    }
    sinon.restore();
    queueManager.removeAllListeners();
});

test('GET /api/effects should return current effects and presets', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockEffects = {
        enabled: true,
        speed: 1.0,
        preset: 'normal'
    };
    
    const mockPresets = [
        { id: 'normal', name: 'Normal' },
        { id: 'slowed', name: 'Slowed' }
    ];
    
    getEffectsStub.returns(mockEffects);
    getPresetsInfoStub.returns(mockPresets);
    buildFilterChainStub.returns('filter-chain');
    getBackendStub.returns('mpv');
    
    const response = await makeRequest(testServer.url, 'GET', '/api/effects');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('effects');
    expect(data).toHaveProperty('presets');
    expect(data).toHaveProperty('filterChain');
    expect(data).toHaveProperty('backend');
    expect(data).toHaveProperty('seamless');
    expect(data.effects).toEqual(mockEffects);
    expect(data.backend).toBe('mpv');
    expect(data.seamless).toBe(true);
});

test('PUT /api/effects should update effects settings', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const newSettings = {
        speed: 1.2,
        enabled: true
    };
    
    const updatedEffects = {
        ...newSettings,
        preset: 'custom'
    };
    
    validateStub.returns([]); // No errors
    updateEffectsStub.returns(updatedEffects);
    buildFilterChainStub.returns('new-filter-chain');
    getBackendStub.returns('mpv');
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/effects', {
        body: newSettings
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('effects');
    expect(data).toHaveProperty('filterChain');
    expect(updateEffectsStub.calledOnce).toBe(true);
});

test('PUT /api/effects should return 400 for invalid settings', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    validateStub.returns(['Invalid speed value']);
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/effects', {
        body: { speed: 5.0 }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.errors).toBeInstanceOf(Array);
    expect(data.errors.length).toBeGreaterThan(0);
});

test('POST /api/effects/preset/:presetId should apply preset', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const updatedEffects = {
        speed: 0.85,
        preset: 'slowed'
    };
    
    applyPresetStub.returns(updatedEffects);
    buildFilterChainStub.returns('preset-filter-chain');
    
    const response = await makeRequest(testServer.url, 'POST', '/api/effects/preset/slowed');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('effects');
    expect(data).toHaveProperty('filterChain');
    expect(applyPresetStub.calledOnce).toBe(true);
    expect(applyPresetStub.firstCall.args[0]).toBe('slowed');
});

test('POST /api/effects/preset/:presetId should return 400 for invalid preset', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    applyPresetStub.throws(new Error('Preset not found'));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/effects/preset/invalid');
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Preset not found');
});

test('POST /api/effects/reset should reset effects to defaults', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const resetEffects = {
        enabled: true,
        speed: 1.0,
        preset: 'normal'
    };
    
    resetStub.returns(resetEffects);
    buildFilterChainStub.returns('default-filter-chain');
    
    const response = await makeRequest(testServer.url, 'POST', '/api/effects/reset');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('effects');
    expect(data).toHaveProperty('filterChain');
    expect(resetStub.calledOnce).toBe(true);
});

test('GET /api/effects/presets should return all presets', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockPresets = [
        { id: 'normal', name: 'Normal' },
        { id: 'slowed', name: 'Slowed' }
    ];
    
    const mockEffects = {
        preset: 'normal'
    };
    
    getPresetsInfoStub.returns(mockPresets);
    getEffectsStub.returns(mockEffects);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/effects/presets');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toHaveProperty('presets');
    expect(data).toHaveProperty('current');
    expect(data.presets).toEqual(mockPresets);
    expect(data.current).toBe('normal');
});

