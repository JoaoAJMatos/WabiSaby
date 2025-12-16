const express = require('express');
const groupsService = require('../../services/groups.service');
const { getPendingConfirmations, removePendingConfirmation } = require('../../commands/implementations/ping');
const { logger } = require('../../utils/logger.util');

const router = express.Router();

// Store reference to WhatsApp socket
let whatsappSocket = null;

/**
 * Set WhatsApp socket reference for group metadata fetching
 * @param {Object} sock - WhatsApp socket instance
 */
function setWhatsAppSocket(sock) {
    whatsappSocket = sock;
}

/**
 * Groups Routes
 * Handles monitored WhatsApp groups management
 */

/**
 * Get all monitored groups
 * GET /api/groups
 */
router.get('/groups', (req, res) => {
    try {
        const groups = groupsService.getGroups();
        res.json({
            success: true,
            groups
        });
    } catch (error) {
        logger.error('Error getting groups:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get groups'
        });
    }
});

/**
 * Add a group to monitoring list
 * POST /api/groups
 */
router.post('/groups', async (req, res) => {
    const { groupId, name } = req.body;
    
    if (!groupId) {
        return res.status(400).json({
            success: false,
            error: 'Group ID required'
        });
    }
    
    // Validate group ID format (should end with @g.us)
    if (!groupId.includes('@g.us')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid group ID format. Must be a WhatsApp group ID (ending with @g.us)'
        });
    }
    
    // Check if group is already monitored
    if (groupsService.isGroupMonitored(groupId)) {
        return res.status(400).json({
            success: false,
            error: 'Group is already being monitored'
        });
    }
    
    try {
        // Try to fetch group metadata if WhatsApp is connected
        let groupName = name || 'Unknown Group';
        if (whatsappSocket && !name) {
            try {
                const groupMetadata = await whatsappSocket.groupMetadata(groupId);
                groupName = groupMetadata.subject || 'Unknown Group';
            } catch (error) {
                logger.warn(`Could not fetch group metadata for ${groupId}:`, error);
                // Continue with default name
            }
        }
        
        const added = groupsService.addGroup(groupId, groupName);
        
        if (added) {
            res.json({
                success: true,
                message: 'Group added successfully',
                group: {
                    id: groupId,
                    name: groupName
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to add group'
            });
        }
    } catch (error) {
        logger.error('Error adding group:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add group'
        });
    }
});

/**
 * Remove a group from monitoring list
 * DELETE /api/groups/:groupId
 */
router.delete('/groups/:groupId', (req, res) => {
    const { groupId } = req.params;
    
    if (!groupId) {
        return res.status(400).json({
            success: false,
            error: 'Group ID required'
        });
    }
    
    try {
        const removed = groupsService.removeGroup(groupId);
        
        if (removed) {
            res.json({
                success: true,
                message: 'Group removed successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Group not found'
            });
        }
    } catch (error) {
        logger.error('Error removing group:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove group'
        });
    }
});

/**
 * Get pending group confirmations
 * GET /api/groups/pending
 */
router.get('/groups/pending', (req, res) => {
    try {
        const pending = getPendingConfirmations();
        res.json({
            success: true,
            pending
        });
    } catch (error) {
        logger.error('Error getting pending confirmations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get pending confirmations'
        });
    }
});

/**
 * Confirm adding a group
 * POST /api/groups/pending/:groupId/confirm
 */
router.post('/groups/pending/:groupId/confirm', async (req, res) => {
    const { groupId } = req.params;
    
    if (!groupId) {
        return res.status(400).json({
            success: false,
            error: 'Group ID required'
        });
    }
    
    try {
        const pending = getPendingConfirmations();
        const confirmation = pending.find(p => p.groupId === groupId);
        
        if (!confirmation) {
            return res.status(404).json({
                success: false,
                error: 'Pending confirmation not found'
            });
        }
        
        // Remove from pending
        removePendingConfirmation(groupId);
        
        // Add to monitored groups
        const added = groupsService.addGroup(groupId, confirmation.groupName);
        
        if (added) {
            res.json({
                success: true,
                message: 'Group added successfully',
                group: {
                    id: groupId,
                    name: confirmation.groupName
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to add group'
            });
        }
    } catch (error) {
        logger.error('Error confirming group:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to confirm group'
        });
    }
});

/**
 * Reject a pending group confirmation
 * POST /api/groups/pending/:groupId/reject
 */
router.post('/groups/pending/:groupId/reject', (req, res) => {
    const { groupId } = req.params;
    
    if (!groupId) {
        return res.status(400).json({
            success: false,
            error: 'Group ID required'
        });
    }
    
    try {
        const removed = removePendingConfirmation(groupId);
        
        if (removed) {
            res.json({
                success: true,
                message: 'Pending confirmation rejected'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Pending confirmation not found'
            });
        }
    } catch (error) {
        logger.error('Error rejecting confirmation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reject confirmation'
        });
    }
});

/**
 * Get group metadata (name, participants count)
 * GET /api/groups/:groupId/metadata
 */
router.get('/groups/:groupId/metadata', async (req, res) => {
    const { groupId } = req.params;
    
    if (!groupId) {
        return res.status(400).json({
            success: false,
            error: 'Group ID required'
        });
    }
    
    try {
        if (!whatsappSocket) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp not connected'
            });
        }
        
        const groupMetadata = await whatsappSocket.groupMetadata(groupId);
        
        res.json({
            success: true,
            metadata: {
                id: groupId,
                name: groupMetadata.subject || 'Unknown Group',
                participantsCount: groupMetadata.participants?.length || 0,
                description: groupMetadata.desc || null,
                creation: groupMetadata.creation || null
            }
        });
    } catch (error) {
        logger.error('Error fetching group metadata:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch group metadata'
        });
    }
});

module.exports = { router, setWhatsAppSocket };

