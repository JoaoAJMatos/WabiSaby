const express = require('express');
const groupsController = require('../controllers/groups.controller');

const router = express.Router();

/**
 * Groups Routes
 * Handles monitored WhatsApp groups management
 */

/**
 * Set WhatsApp socket reference for group metadata fetching
 * @param {Object} sock - WhatsApp socket instance
 */
function setWhatsAppSocket(sock) {
    groupsController.setWhatsAppSocket(sock);
}

/**
 * Get all monitored groups
 * GET /api/groups
 */
router.get('/groups', groupsController.getGroups);

/**
 * Add a group to monitoring list
 * POST /api/groups
 */
router.post('/groups', groupsController.addGroup.bind(groupsController));

/**
 * Remove a group from monitoring list
 * DELETE /api/groups/:groupId
 */
router.delete('/groups/:groupId', groupsController.removeGroup);

/**
 * Update a group name
 * PUT /api/groups/:groupId
 */
router.put('/groups/:groupId', groupsController.updateGroup);

/**
 * Get pending group confirmations
 * GET /api/groups/pending
 */
router.get('/groups/pending', groupsController.getPendingConfirmations);

/**
 * Confirm adding a group
 * POST /api/groups/pending/:groupId/confirm
 */
router.post('/groups/pending/:groupId/confirm', groupsController.confirmGroup);

/**
 * Reject a pending group confirmation
 * POST /api/groups/pending/:groupId/reject
 */
router.post('/groups/pending/:groupId/reject', groupsController.rejectGroup);

/**
 * Get group metadata (name, participants count)
 * GET /api/groups/:groupId/metadata
 */
router.get('/groups/:groupId/metadata', groupsController.getGroupMetadata.bind(groupsController));

module.exports = { router, setWhatsAppSocket };

