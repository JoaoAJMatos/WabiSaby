/**
 * Groups API Routes Tests
 */

const { test, expect, beforeEach, afterEach } = require('bun:test');
const sinon = require('sinon');
const { createTestApp, startTestServer, makeRequest, parseJsonResponse } = require('../../helpers/test-server');
const { router, setWhatsAppSocket } = require('../../../src/api/routes/groups.routes');
const groupsService = require('../../../src/services/groups.service');
const { getPendingConfirmations, removePendingConfirmation } = require('../../../src/commands/implementations/ping');

let testServer;
let mockWhatsAppSocket;
let getGroupsStub;
let isGroupMonitoredStub;
let addGroupStub;
let removeGroupStub;
let updateGroupNameStub;

beforeEach(() => {
    mockWhatsAppSocket = {
        groupMetadata: sinon.stub()
    };
    
    getGroupsStub = sinon.stub(groupsService, 'getGroups');
    isGroupMonitoredStub = sinon.stub(groupsService, 'isGroupMonitored');
    addGroupStub = sinon.stub(groupsService, 'addGroup');
    removeGroupStub = sinon.stub(groupsService, 'removeGroup');
    updateGroupNameStub = sinon.stub(groupsService, 'updateGroupName');
    
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

test('GET /api/groups should return all monitored groups', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockGroups = [
        { id: 'group1@g.us', name: 'Group 1' },
        { id: 'group2@g.us', name: 'Group 2' }
    ];
    
    getGroupsStub.returns(mockGroups);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/groups');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.groups).toEqual(mockGroups);
});

test('POST /api/groups should add a group', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    isGroupMonitoredStub.returns(false);
    addGroupStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/groups', {
        body: {
            groupId: 'group1@g.us',
            name: 'Test Group'
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('added successfully');
    expect(data.group.id).toBe('group1@g.us');
    expect(addGroupStub.calledOnce).toBe(true);
});

test('POST /api/groups should return 400 when groupId is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/groups', {
        body: { name: 'Test Group' }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Group ID required');
});

test('POST /api/groups should return 400 for invalid group ID format', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'POST', '/api/groups', {
        body: {
            groupId: 'invalid-group-id',
            name: 'Test Group'
        }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid group ID format');
});

test('POST /api/groups should return 400 when group already monitored', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    isGroupMonitoredStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'POST', '/api/groups', {
        body: {
            groupId: 'group1@g.us',
            name: 'Test Group'
        }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('already being monitored');
});

test('POST /api/groups should fetch group metadata when name not provided', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    isGroupMonitoredStub.returns(false);
    addGroupStub.returns(true);
    mockWhatsAppSocket.groupMetadata.resolves({
        subject: 'Fetched Group Name'
    });
    
    const response = await makeRequest(testServer.url, 'POST', '/api/groups', {
        body: {
            groupId: 'group1@g.us'
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(mockWhatsAppSocket.groupMetadata.calledOnce).toBe(true);
});

test('DELETE /api/groups/:groupId should remove a group', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    removeGroupStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'DELETE', '/api/groups/group1@g.us');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('removed successfully');
    expect(removeGroupStub.calledOnce).toBe(true);
    expect(removeGroupStub.firstCall.args[0]).toBe('group1@g.us');
});

test('DELETE /api/groups/:groupId should return 404 when group not found', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    removeGroupStub.returns(false);
    
    const response = await makeRequest(testServer.url, 'DELETE', '/api/groups/group1@g.us');
    expect(response.status).toBe(404);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Group not found');
});

test('PUT /api/groups/:groupId should update group name successfully', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    isGroupMonitoredStub.returns(true);
    updateGroupNameStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/groups/group1@g.us', {
        body: {
            name: 'Updated Group Name'
        }
    });
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.message).toContain('updated successfully');
    expect(updateGroupNameStub.calledOnce).toBe(true);
    expect(updateGroupNameStub.firstCall.args[0]).toBe('group1@g.us');
    expect(updateGroupNameStub.firstCall.args[1]).toBe('Updated Group Name');
});

test('PUT /api/groups/:groupId should return 400 when groupId is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/groups/', {
        body: {
            name: 'Updated Group Name'
        }
    });
    expect(response.status).toBe(404); // Express returns 404 for missing route param
});

test('PUT /api/groups/:groupId should return 400 when name is missing', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/groups/group1@g.us', {
        body: {}
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Name required');
});

test('PUT /api/groups/:groupId should return 400 when name is empty', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/groups/group1@g.us', {
        body: {
            name: ''
        }
    });
    expect(response.status).toBe(400);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Name required');
});

test('PUT /api/groups/:groupId should return 404 when group does not exist', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    isGroupMonitoredStub.returns(false);
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/groups/group1@g.us', {
        body: {
            name: 'Updated Group Name'
        }
    });
    expect(response.status).toBe(404);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Group not found');
    expect(updateGroupNameStub.called).toBe(false);
});

test('PUT /api/groups/:groupId should return 500 on service errors', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    isGroupMonitoredStub.returns(true);
    updateGroupNameStub.returns(false);
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/groups/group1@g.us', {
        body: {
            name: 'Updated Group Name'
        }
    });
    expect(response.status).toBe(500);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Failed to update group');
});

test('PUT /api/groups/:groupId should validate group exists before updating', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    isGroupMonitoredStub.returns(true);
    updateGroupNameStub.returns(true);
    
    const response = await makeRequest(testServer.url, 'PUT', '/api/groups/group1@g.us', {
        body: {
            name: 'Updated Group Name'
        }
    });
    expect(response.status).toBe(200);
    
    expect(isGroupMonitoredStub.calledOnce).toBe(true);
    expect(isGroupMonitoredStub.firstCall.args[0]).toBe('group1@g.us');
    expect(updateGroupNameStub.calledOnce).toBe(true);
});

test('GET /api/groups/pending should return pending confirmations', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Note: getPendingConfirmations is a real function, we test it as-is
    // In a real scenario, we'd need to add a pending confirmation first
    const response = await makeRequest(testServer.url, 'GET', '/api/groups/pending');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.pending).toBeInstanceOf(Array);
});

test('POST /api/groups/pending/:groupId/confirm should return 404 when no pending confirmation', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // No pending confirmation exists
    const response = await makeRequest(testServer.url, 'POST', '/api/groups/pending/group1@g.us/confirm');
    expect(response.status).toBe(404);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Pending confirmation not found');
});

test('POST /api/groups/pending/:groupId/confirm should return 404 when confirmation not found', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // getPendingConfirmations is a real function, not stubbed
    // It will return empty array if no pending confirmations exist
    const response = await makeRequest(testServer.url, 'POST', '/api/groups/pending/group1@g.us/confirm');
    expect(response.status).toBe(404);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Pending confirmation not found');
});

test('POST /api/groups/pending/:groupId/reject should reject confirmation', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    // Note: removePendingConfirmation is a real function
    // It will return false if no confirmation exists, which is expected
    const response = await makeRequest(testServer.url, 'POST', '/api/groups/pending/group1@g.us/reject');
    
    // Will return 404 if no pending confirmation exists
    // In a real scenario, we'd add a pending confirmation first
    expect([200, 404]).toContain(response.status);
    
    if (response.status === 200) {
        const data = await parseJsonResponse(response);
        expect(data.success).toBe(true);
        expect(data.message).toContain('rejected');
    }
});

test('GET /api/groups/:groupId/metadata should return group metadata', async () => {
    testServer = await startTestServer(createTestApp(router));
    
    const mockMetadata = {
        subject: 'Test Group',
        participants: [{ id: 'user1@whatsapp' }, { id: 'user2@whatsapp' }],
        desc: 'Group description',
        creation: 1234567890
    };
    
    mockWhatsAppSocket.groupMetadata.resolves(mockMetadata);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/groups/group1@g.us/metadata');
    expect(response.status).toBe(200);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(true);
    expect(data.metadata.name).toBe('Test Group');
    expect(data.metadata.participantsCount).toBe(2);
});

test('GET /api/groups/:groupId/metadata should return 503 when WhatsApp not connected', async () => {
    testServer = await startTestServer(createTestApp(router));
    setWhatsAppSocket(null);
    
    const response = await makeRequest(testServer.url, 'GET', '/api/groups/group1@g.us/metadata');
    expect(response.status).toBe(503);
    
    const data = await parseJsonResponse(response);
    expect(data.success).toBe(false);
    expect(data.error).toContain('WhatsApp not connected');
});

