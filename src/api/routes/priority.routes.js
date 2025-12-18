const express = require('express');
const priorityService = require('../../services/priority.service');
const groupsService = require('../../services/groups.service');

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
    const users = priorityService.getPriorityUsers();
    // Transform database format (whatsapp_id) to API format (id)
    const transformed = users.map(user => ({
        id: user.whatsapp_id || user.id,
        name: user.name || null
    }));
    res.json(transformed);
});

/**
 * Add priority user
 * POST /api/priority/add
 */
router.post('/priority/add', async (req, res) => {
    const { id, name } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: 'ID required' });
    }
    
    const added = await priorityService.addPriorityUser(id, name);
    if (added) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to add priority user' });
    }
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
        
        // Get configured groups from the groups service
        const groups = groupsService.getGroups();
        
        if (!groups || groups.length === 0) {
            return res.status(400).json({ 
                error: 'No groups configured',
                message: 'Add at least one group in the Groups section to use this feature'
            });
        }
        
        // Fetch participants from all configured groups and merge them
        const allParticipantsMap = new Map(); // Use Map to deduplicate by user ID
        const groupNames = [];
        
        for (const group of groups) {
            try {
                const groupMetadata = await whatsappSocket.groupMetadata(group.id);
                // Prioritize database name over WhatsApp metadata (allows custom names)
                const groupName = group.name || groupMetadata.subject || 'Unknown Group';
                groupNames.push(groupName);
                
                // Process participants from this group
                for (const participant of groupMetadata.participants) {
                    const userId = participant.id;
                    
                    // Check if we already have this user
                    if (allParticipantsMap.has(userId)) {
                        // User exists - add this group to their groups array
                        const existingUser = allParticipantsMap.get(userId);
                        if (!existingUser.groups.includes(groupName)) {
                            existingUser.groups.push(groupName);
                        }
                        continue;
                    }
                    
                    // New user - initialize with empty groups array
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
                    
                    allParticipantsMap.set(userId, {
                        id: userId,
                        name: name,
                        profilePicUrl: profilePicUrl,
                        isAdmin: participant.admin === 'admin' || participant.admin === 'superadmin',
                        groups: [groupName] // Initialize with current group
                    });
                }
            } catch (error) {
                console.error(`Error fetching metadata for group ${group.id}:`, error);
                // Continue with other groups even if one fails
            }
        }
        
        // Convert Map to array
        const participants = Array.from(allParticipantsMap.values());
        
        // Sort by name (named users first, then by name alphabetically)
        participants.sort((a, b) => {
            if (a.name && !b.name) return -1;
            if (!a.name && b.name) return 1;
            if (a.name && b.name) return a.name.localeCompare(b.name);
            return a.id.localeCompare(b.id);
        });
        
        // Create a combined group name if multiple groups
        const groupName = groupNames.length === 1 
            ? groupNames[0] 
            : `${groupNames.length} Groups (${groupNames.join(', ')})`;
        
        res.json({
            groupName: groupName,
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

/**
 * Regenerate mobile token for a VIP
 * POST /api/priority/regenerate-token/:whatsappId
 */
router.post('/priority/regenerate-token/:whatsappId', async (req, res) => {
    const { whatsappId } = req.params;
    
    if (!whatsappId) {
        return res.status(400).json({ error: 'WhatsApp ID required' });
    }
    
    try {
        const token = priorityService.regenerateMobileToken(whatsappId);
        if (token) {
            // Send new link via WhatsApp
            await priorityService.sendMobileAccessLink(whatsappId);
            res.json({ success: true, message: 'Token regenerated and sent via WhatsApp' });
        } else {
            res.status(500).json({ error: 'Failed to regenerate token' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = { router, setWhatsAppSocket };

