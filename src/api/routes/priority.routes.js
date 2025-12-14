const express = require('express');
const priorityService = require('../../services/priority.service');

const router = express.Router();

// Store reference to WhatsApp socket
let whatsappSocket = null;

/**
 * Set WhatsApp socket reference for profile picture fetching
 * @param {Object} sock - WhatsApp socket instance
 */
function setWhatsAppSocket(sock) {
    whatsappSocket = sock;
}

/**
 * Priority Routes
 * Handles VIP/priority user management
 */

/**
 * Get priority users
 * GET /api/priority
 */
router.get('/priority', (req, res) => {
    res.json(priorityService.getPriorityUsers());
});

/**
 * Add priority user
 * POST /api/priority/add
 */
router.post('/priority/add', (req, res) => {
    const { id, name } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: 'ID required' });
    }
    
    priorityService.addPriorityUser(id, name);
    res.json({ success: true });
});

/**
 * Remove priority user
 * POST /api/priority/remove
 */
router.post('/priority/remove', (req, res) => {
    const { id } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: 'ID required' });
    }
    
    priorityService.removePriorityUser(id);
    res.json({ success: true });
});

/**
 * Get profile picture URL for a user
 * GET /api/priority/profile-picture/:userId
 */
router.get('/priority/profile-picture/:userId', async (req, res) => {
    const { userId } = req.params;
    
    if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
    }
    
    try {
        if (!whatsappSocket) {
            return res.status(503).json({ error: 'WhatsApp not connected' });
        }
        
        // Fetch profile picture URL from WhatsApp
        const profilePicUrl = await whatsappSocket.profilePictureUrl(userId, 'image');
        
        if (profilePicUrl) {
            res.json({ url: profilePicUrl });
        } else {
            // Return default avatar if no profile picture
            res.json({ url: null });
        }
    } catch (error) {
        // User might not have a profile picture or error fetching
        console.error('Error fetching profile picture:', error.message);
        res.json({ url: null });
    }
});

/**
 * Get group participants (for easier VIP selection)
 * GET /api/priority/group-members
 */
router.get('/priority/group-members', async (req, res) => {
    try {
        if (!whatsappSocket) {
            return res.status(503).json({ error: 'WhatsApp not connected' });
        }
        
        // Get the target group ID from config
        const config = require('../../config');
        const groupId = config.whatsapp.targetGroupId;
        
        if (!groupId) {
            return res.status(400).json({ 
                error: 'No target group configured',
                message: 'Set TARGET_GROUP_ID in your .env file to use this feature'
            });
        }
        
        // Fetch group metadata
        const groupMetadata = await whatsappSocket.groupMetadata(groupId);
        
        // Get all participants with their details
        const participants = await Promise.all(
            groupMetadata.participants.map(async (participant) => {
                const userId = participant.id;
                let profilePicUrl = null;
                let name = null;
                
                // Try to get profile picture
                try {
                    profilePicUrl = await whatsappSocket.profilePictureUrl(userId, 'image');
                } catch (error) {
                    // No profile picture available
                }
                
                // Try to get name from group metadata or contact
                try {
                    // First check if we have the name in our VIP list
                    const vipUsers = priorityService.getPriorityUsers();
                    const vipUser = vipUsers.find(u => (typeof u === 'string' ? u : u.id) === userId);
                    if (vipUser && typeof vipUser === 'object' && vipUser.name) {
                        name = vipUser.name;
                    }
                    
                    // If not in VIP list, try to get from WhatsApp
                    if (!name) {
                        // Check if there's a verifiedName or notify
                        name = participant.notify || participant.verifiedName || null;
                    }
                } catch (error) {
                    // Ignore
                }
                
                return {
                    id: userId,
                    name: name,
                    profilePicUrl: profilePicUrl,
                    isAdmin: participant.admin === 'admin' || participant.admin === 'superadmin'
                };
            })
        );
        
        // Sort by name (named users first, then by name alphabetically)
        participants.sort((a, b) => {
            if (a.name && !b.name) return -1;
            if (!a.name && b.name) return 1;
            if (a.name && b.name) return a.name.localeCompare(b.name);
            return a.id.localeCompare(b.id);
        });
        
        res.json({
            groupName: groupMetadata.subject,
            participants: participants
        });
    } catch (error) {
        console.error('Error fetching group members:', error);
        res.status(500).json({ 
            error: 'Failed to fetch group members',
            message: error.message 
        });
    }
});

module.exports = { router, setWhatsAppSocket };

