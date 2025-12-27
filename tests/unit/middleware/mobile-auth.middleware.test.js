/**
 * Mobile Authentication Middleware Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { authenticateMobile } = require('../../../src/api/middleware/auth.middleware');
const dbService = require('../../../src/database/db.service');
const { initializeDatabase, getDatabase } = require('../../../src/database/index');

let getVipByTokenStub;
let verifyDeviceFingerprintStub;
let storeDeviceFingerprintStub;

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
    
    getVipByTokenStub = sinon.stub(dbService, 'getVipByToken');
    verifyDeviceFingerprintStub = sinon.stub(dbService, 'verifyDeviceFingerprint');
    storeDeviceFingerprintStub = sinon.stub(dbService, 'storeDeviceFingerprint');
});

afterEach(() => {
    sinon.restore();
});

test('authenticateMobile should call next() when token and fingerprint are valid', (done) => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: 'device-fingerprint-hash'
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const req = {
        query: { token: 'test-token', fingerprint: 'device-fingerprint-hash' },
        headers: {},
        body: {}
    };
    
    const res = {};
    const next = () => {
        expect(getVipByTokenStub.calledOnce).toBe(true);
        expect(getVipByTokenStub.firstCall.args[0]).toBe('test-token');
        expect(verifyDeviceFingerprintStub.calledOnce).toBe(true);
        expect(req.vip).toBeDefined();
        expect(req.vip.whatsappId).toBe('vip@whatsapp');
        expect(req.vip.name).toBe('VIP User');
        done();
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should extract token from query parameter', (done) => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: 'device-fingerprint-hash'
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const req = {
        query: { token: 'query-token', fingerprint: 'device-fingerprint-hash' },
        headers: {},
        body: {}
    };
    
    const res = {};
    const next = () => {
        expect(getVipByTokenStub.firstCall.args[0]).toBe('query-token');
        done();
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should extract token from header', (done) => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: 'device-fingerprint-hash'
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const req = {
        query: {},
        headers: { 'x-mobile-token': 'header-token', 'x-device-fingerprint': 'device-fingerprint-hash' },
        body: {}
    };
    
    const res = {};
    const next = () => {
        expect(getVipByTokenStub.firstCall.args[0]).toBe('header-token');
        done();
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should extract fingerprint from query parameter', (done) => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: null
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const req = {
        query: { token: 'test-token', fingerprint: 'query-fingerprint' },
        headers: {},
        body: {}
    };
    
    const res = {};
    const next = () => {
        expect(verifyDeviceFingerprintStub.firstCall.args[1]).toBe('query-fingerprint');
        done();
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should extract fingerprint from header', (done) => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: null
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const req = {
        query: { token: 'test-token' },
        headers: { 'x-device-fingerprint': 'header-fingerprint' },
        body: {}
    };
    
    const res = {};
    const next = () => {
        expect(verifyDeviceFingerprintStub.firstCall.args[1]).toBe('header-fingerprint');
        done();
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should extract fingerprint from body', (done) => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: null
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const req = {
        query: { token: 'test-token' },
        headers: {},
        body: { fingerprint: 'body-fingerprint' }
    };
    
    const res = {};
    const next = () => {
        expect(verifyDeviceFingerprintStub.firstCall.args[1]).toBe('body-fingerprint');
        done();
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should return 401 when token is missing', () => {
    const req = {
        query: { fingerprint: 'device-fingerprint-hash' },
        headers: {},
        body: {}
    };
    
    const res = {
        status: (code) => {
            expect(code).toBe(401);
            return res;
        },
        json: (data) => {
            expect(data.error).toContain('Mobile token required');
        }
    };
    
    const next = () => {
        throw new Error('next() should not be called');
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should return 401 when fingerprint is missing', () => {
    const req = {
        query: { token: 'test-token' },
        headers: {},
        body: {}
    };
    
    const res = {
        status: (code) => {
            expect(code).toBe(401);
            return res;
        },
        json: (data) => {
            expect(data.error).toContain('Device fingerprint required');
        }
    };
    
    const next = () => {
        throw new Error('next() should not be called');
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should return 401 when token is invalid', () => {
    getVipByTokenStub.returns(null);
    
    const req = {
        query: { token: 'invalid-token', fingerprint: 'device-fingerprint-hash' },
        headers: {},
        body: {}
    };
    
    const res = {
        status: (code) => {
            expect(code).toBe(401);
            return res;
        },
        json: (data) => {
            expect(data.error).toContain('Invalid token');
        }
    };
    
    const next = () => {
        throw new Error('next() should not be called');
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should return 403 when fingerprint does not match', () => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: 'different-fingerprint'
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(false);
    
    const req = {
        query: { token: 'test-token', fingerprint: 'wrong-fingerprint' },
        headers: {},
        body: {}
    };
    
    const res = {
        status: (code) => {
            expect(code).toBe(403);
            return res;
        },
        json: (data) => {
            expect(data.error).toContain('Device fingerprint mismatch');
        }
    };
    
    const next = () => {
        throw new Error('next() should not be called');
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should store fingerprint on first access', (done) => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: null
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const req = {
        query: { token: 'test-token', fingerprint: 'device-fingerprint-hash' },
        headers: {},
        body: {}
    };
    
    const res = {};
    const next = () => {
        expect(storeDeviceFingerprintStub.calledOnce).toBe(true);
        expect(storeDeviceFingerprintStub.firstCall.args[0]).toBe('test-token');
        expect(storeDeviceFingerprintStub.firstCall.args[1]).toBe('device-fingerprint-hash');
        done();
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should not store fingerprint on subsequent access', (done) => {
    const mockVip = {
        whatsapp_id: 'vip@whatsapp',
        name: 'VIP User',
        device_fingerprint: 'device-fingerprint-hash'
    };
    
    getVipByTokenStub.returns(mockVip);
    verifyDeviceFingerprintStub.returns(true);
    
    const req = {
        query: { token: 'test-token', fingerprint: 'device-fingerprint-hash' },
        headers: {},
        body: {}
    };
    
    const res = {};
    const next = () => {
        expect(storeDeviceFingerprintStub.called).toBe(false);
        done();
    };
    
    authenticateMobile(req, res, next);
});

test('authenticateMobile should return 500 on database error', () => {
    getVipByTokenStub.throws(new Error('Database error'));
    
    const req = {
        query: { token: 'test-token', fingerprint: 'device-fingerprint-hash' },
        headers: {},
        body: {}
    };
    
    const res = {
        status: (code) => {
            expect(code).toBe(500);
            return res;
        },
        json: (data) => {
            expect(data.error).toContain('Authentication failed');
        }
    };
    
    const next = () => {
        throw new Error('next() should not be called');
    };
    
    authenticateMobile(req, res, next);
});

