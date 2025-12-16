/**
 * Priority API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router, setWhatsAppSocket } = require('../../../src/api/routes/priority.routes');
const priorityService = require('../../../src/services/priority.service');

let testServer;
let mockWhatsAppSocket;
let getPriorityUsersStub;
let addPriorityUserStub;
let removePriorityUserStub;

beforeEach(() => {
    mockWhatsAppSocket = {
        profilePictureUrl: sinon.stub(),
        groupMetadata: sinon.stub()
    };
    
    getPriorityUsersStub = sinon.stub(priorityService, 'getPriorityUsers');
    addPriorityUserStub = sinon.stub(priorityService, 'addPriorityUser');
    removePriorityUserStub = sinon.stub(priorityService, 'removePriorityUser');
    
    setWhatsAppSocket(mockWhatsAppSocket);
});

afterEach(async () => {
    if (testServer) {
        await testServer.close();
        testServer = null;
    }
    sinon.restore();
    setWhatsAppSocket(null);
});

test('GET /api/priority should return priority users', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockUsers = [
        { id: 'user1@whatsapp', name: 'User 1' },
        { id: 'user2@whatsapp', name: 'User 2' }
    ];
    
    getPriorityUsersStub.returns(mockUsers);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/priority');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data).toEqual(mockUsers);
    expect(getPriorityUsersStub.calledOnce).toBe(true);
});

test('POST /api/priority/add should add priority user', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/priority/add', {
        body: { id: 'user1@whatsapp', name: 'User 1' }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(addPriorityUserStub.calledOnce).toBe(true);
    expect(addPriorityUserStub.firstCall.args[0]).toBe('user1@whatsapp');
    expect(addPriorityUserStub.firstCall.args[1]).toBe('User 1');
});

test('POST /api/priority/add should return 400 when ID is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/priority/add', {
        body: { name: 'User 1' }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('ID required');
});

test('POST /api/priority/remove should remove priority user', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/priority/remove', {
        body: { id: 'user1@whatsapp' }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(removePriorityUserStub.calledOnce).toBe(true);
    expect(removePriorityUserStub.firstCall.args[0]).toBe('user1@whatsapp');
});

test('POST /api/priority/remove should return 400 when ID is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/priority/remove', {
        body: {}
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('ID required');
});

test('GET /api/priority/profile-picture/:userId should return profile picture URL', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    mockWhatsAppSocket.profilePictureUrl.resolves('https://example.com/pic.jpg');
    
    const response = await makeRequest(testServer.url, 'GET', '/api/priority/profile-picture/user1@whatsapp');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.url).toBe('https://example.com/pic.jpg');
    expect(mockWhatsAppSocket.profilePictureUrl.calledOnce).toBe(true);
});

test('GET /api/priority/profile-picture/:userId should return null when no picture', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    mockWhatsAppSocket.profilePictureUrl.resolves(null);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/priority/profile-picture/user1@whatsapp');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.url).toBeNull();
});

test('GET /api/priority/profile-picture/:userId should return 503 when WhatsApp not connected', async () => {
    testServer = await startTestServer(createTestApp(router));
    setWhatsAppSocket(null);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/priority/profile-picture/user1@whatsapp');
    expect(response.status).toBe(503);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('WhatsApp not connected');
});

test('GET /api/priority/group-members should return group members', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockGroupMetadata = {
        subject: 'Test Group',
        participants: [
            { id: 'user1@whatsapp', admin: 'admin', notify: 'User 1' },
            { id: 'user2@whatsapp', admin: null, notify: 'User 2' }
        ]
    };
    
    mockWhatsAppSocket.groupMetadata.resolves(mockGroupMetadata);
    mockWhatsAppSocket.profilePictureUrl.resolves(null);
    
    // Mock config
    const config = require('../../../src/config');
    const originalGroupId = config.whatsapp.targetGroupId;
    config.whatsapp.targetGroupId = 'group@g.us';
    
    try {
        const response = await makeRequest(testServer.url, 'GET', '/api/priority/group-members');
        expect(response.status).toBe(200);
        
        const data = await parseJsonResponse(response);
        expect(data.groupName).toBe('Test Group');
        expect(data.participants).toBeInstanceOf(Array);
        expect(data.participants.length).toBe(2);
    } finally {
        config.whatsapp.targetGroupId = originalGroupId;
    }
});

test('GET /api/priority/group-members should return 400 when no target group configured', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const config = require('../../../src/config');
    const originalGroupId = config.whatsapp.targetGroupId;
    config.whatsapp.targetGroupId = null;
    
    try {
        const response = await makeRequest(testServer.url, 'GET', '/api/priority/group-members');
        expect(response.status).toBe(400);
        
        const data = await parseJsonResponse(response);
        expect(data.error).toContain('No target group configured');
    } finally {
        config.whatsapp.targetGroupId = originalGroupId;
    }
});

test('GET /api/priority/group-members should return 503 when WhatsApp not connected', async () => {
    testServer = await startTestServer(createTestApp(router));
    setWhatsAppSocket(null);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/priority/group-members');
    expect(response.status).toBe(503);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('WhatsApp not connected');
});

