/**
 * Settings API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router } = require('../../../src/api/routes/settings.routes');
const config = require('../../../src/config');

let testServer;
let saveSettingsStub;
let originalConfig;

beforeEach(() => {
    // Save original config values
    originalConfig = {
        download: { ...config.download },
        playback: { ...config.playback },
        performance: { ...config.performance },
        notifications: { ...config.notifications }
    };
    
    // Mock saveSettings if it exists
    if (config.saveSettings) {
        saveSettingsStub = sinon.stub(config, 'saveSettings');
        saveSettingsStub.returns(true);
    }
});

afterEach(async () => {
    if (testServer) {
        await testServer.close();
        testServer = null;
    }
    sinon.restore();
    
    // Restore original config values
    if (originalConfig) {
        Object.assign(config.download, originalConfig.download);
        Object.assign(config.playback, originalConfig.playback);
        Object.assign(config.performance, originalConfig.performance);
        Object.assign(config.notifications, originalConfig.notifications);
    }
});

test('GET /api/settings should return current settings', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'GET', '/api/settings');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('settings');
    expect(data).toHaveProperty('options');
    expect(data.settings).toHaveProperty('server');
    expect(data.settings).toHaveProperty('download');
    expect(data.settings).toHaveProperty('playback');
    expect(data.settings).toHaveProperty('performance');
    expect(data.settings).toHaveProperty('notifications');
});

test('POST /api/settings should update a single setting', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const originalValue = config.download.audioFormat;
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings', {
        body: {
            category: 'download',
            key: 'audioFormat',
            value: 'm4a'
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.newValue).toBe('m4a');
    expect(config.download.audioFormat).toBe('m4a');
    
    // Restore
    config.download.audioFormat = originalValue;
});

test('POST /api/settings should return 400 for invalid category', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings', {
        body: {
            category: 'invalid',
            key: 'audioFormat',
            value: 'm4a'
        }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid category');
});

test('POST /api/settings should return 400 for non-editable key', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings', {
        body: {
            category: 'download',
            key: 'invalidKey',
            value: 'test'
        }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('cannot be modified');
});

test('POST /api/settings should return 400 for invalid value in select field', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings', {
        body: {
            category: 'download',
            key: 'audioFormat',
            value: 'invalid'
        }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid value');
});

test('POST /api/settings should validate boolean fields', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings', {
        body: {
            category: 'download',
            key: 'downloadThumbnails',
            value: 'not-a-boolean'
        }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('must be a boolean');
});

test('POST /api/settings should validate integer fields', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings', {
        body: {
            category: 'playback',
            key: 'songTransitionDelay',
            value: 'not-a-number'
        }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('must be a non-negative integer');
});

test('POST /api/settings/bulk should update multiple settings', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings/bulk', {
        body: {
            settings: {
                download: {
                    audioFormat: 'm4a',
                    audioQuality: '192k'
                },
                playback: {
                    cleanupAfterPlay: false
                }
            }
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.updated).toContain('download.audioFormat');
    expect(data.updated).toContain('download.audioQuality');
    expect(data.updated).toContain('playback.cleanupAfterPlay');
});

test('POST /api/settings/bulk should return errors for invalid settings', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings/bulk', {
        body: {
            settings: {
                invalidCategory: {
                    key: 'value'
                },
                download: {
                    invalidKey: 'value'
                }
            }
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.errors).toBeInstanceOf(Array);
    expect(data.errors.length).toBeGreaterThan(0);
});

test('POST /api/settings/reset should reset all settings to defaults', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Change some settings first
    config.download.audioFormat = 'opus';
    config.playback.cleanupAfterPlay = false;
    
    const response = await makeRequest(testServer.url, 'POST', '/api/settings/reset');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('reset to defaults');
    expect(data).toHaveProperty('settings');
});

