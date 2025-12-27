const express = require('express');
const priorityController = require('../controllers/priority.controller');

const router = express.Router();

/**
 * Set WhatsApp socket reference for profile picture fetching
 * @param {Object} sock - WhatsApp socket instance
 */
function setWhatsAppSocket(sock) {
    priorityController.setWhatsAppSocket(sock);
}

/**
 * Priority Routes
 * Handles VIP/priority user management
 */

/**
 * Get priority users
 * GET /api/priority
 */
router.get('/priority', priorityController.getPriorityUsers);

/**
 * Add priority user
 * POST /api/priority/add
 */
router.post('/priority/add', priorityController.addPriorityUser);

/**
 * Remove priority user
 * POST /api/priority/remove
 */
router.post('/priority/remove', priorityController.removePriorityUser);

/**
 * Get profile picture URL for a user
 * GET /api/priority/profile-picture/:userId
 */
router.get('/priority/profile-picture/:userId', priorityController.getProfilePicture.bind(priorityController));

/**
 * Get group participants (for easier VIP selection)
 * GET /api/priority/group-members
 */
router.get('/priority/group-members', priorityController.getGroupMembers.bind(priorityController));

/**
 * Regenerate mobile token for a VIP
 * POST /api/priority/regenerate-token/:whatsappId
 */
router.post('/priority/regenerate-token/:whatsappId', priorityController.regenerateToken);

module.exports = { router, setWhatsAppSocket };

