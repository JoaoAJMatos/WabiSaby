/**
 * Priority API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router, setWhatsAppSocket } = require('../../../src/api/routes/priority.routes');
const priorityService = require('../../../src/services/priority.service');
const groupsService = require('../../../src/services/groups.service');

let testServer;
let mockWhatsAppSocket;
let getPriorityUsersStub;
let addPriorityUserStub;
let removePriorityUserStub;
let regenerateMobileTokenStub;
let sendMobileAccessLinkStub;
let getGroupsStub;

beforeEach(() => {
    mockWhatsAppSocket = {
        profilePictureUrl: sinon.stub(),
        groupMetadata: sinon.stub()
    };
    
    getPriorityUsersStub = sinon.stub(priorityService, 'getPriorityUsers');
    addPriorityUserStub = sinon.stub(priorityService, 'addPriorityUser');
    removePriorityUserStub = sinon.stub(priorityService, 'removePriorityUser');
    regenerateMobileTokenStub = sinon.stub(priorityService, 'regenerateMobileToken');
    sendMobileAccessLinkStub = sinon.stub(priorityService, 'sendMobileAccessLink');
    getGroupsStub = sinon.stub(groupsService, 'getGroups');
    
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
    
    addPriorityUserStub.resolves(true);
    
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
    
    // Mock groupsService to return a group
    getGroupsStub.returns([
        { id: 'group@g.us', name: 'Test Group' }
    ]);
    
    // Mock priorityService to return empty VIP list
    getPriorityUsersStub.returns([]);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/priority/group-members');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.groupName).toBe('Test Group');
    expect(data.participants).toBeInstanceOf(Array);
    expect(data.participants.length).toBe(2);
});

test('GET /api/priority/group-members should return 400 when no target group configured', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Mock groupsService to return empty array (no groups configured)
    getGroupsStub.returns([]);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/priority/group-members');
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('No groups configured');
});

test('GET /api/priority/group-members should return 503 when WhatsApp not connected', async () => {
    testServer = await startTestServer(createTestApp(router));
    setWhatsAppSocket(null);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/priority/group-members');
    expect(response.status).toBe(503);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('WhatsApp not connected');
});

test('POST /api/priority/regenerate-token/:whatsappId should regenerate token and send link', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    regenerateMobileTokenStub.returns('new-token-123');
    sendMobileAccessLinkStub.resolves(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/priority/regenerate-token/vip@whatsapp');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Token regenerated');
    expect(regenerateMobileTokenStub.calledOnce).toBe(true);
    expect(regenerateMobileTokenStub.firstCall.args[0]).toBe('vip@whatsapp');
    expect(sendMobileAccessLinkStub.calledOnce).toBe(true);
    expect(sendMobileAccessLinkStub.firstCall.args[0]).toBe('vip@whatsapp');
});

test('POST /api/priority/regenerate-token/:whatsappId should return 400 when whatsappId is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/priority/regenerate-token/');
    expect(response.status).toBe(404); // Express returns 404 for missing route params
});

test('POST /api/priority/regenerate-token/:whatsappId should return 500 when token generation fails', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    regenerateMobileTokenStub.returns(null);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/priority/regenerate-token/vip@whatsapp');
    expect(response.status).toBe(500);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toContain('Failed to regenerate token');
    expect(regenerateMobileTokenStub.calledOnce).toBe(true);
    expect(sendMobileAccessLinkStub.called).toBe(false);
});

test('POST /api/priority/regenerate-token/:whatsappId should handle errors gracefully', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    regenerateMobileTokenStub.throws(new Error('Database error'));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/priority/regenerate-token/vip@whatsapp');
    expect(response.status).toBe(500);
    
    const data = await parseJsonResponse(response);
    expect(data.error).toBeDefined();
});

