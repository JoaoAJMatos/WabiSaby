const services = require('../../services');
const infrastructure = require('../../infrastructure');

/**
 * Priority Controller
 * Handles VIP/priority user management
 */

class PriorityController {
    constructor() {
        this.whatsappSocket = null;
    }

    /**
     * Set WhatsApp socket reference
     * @param {Object} sock - WhatsApp socket instance
     */
    setWhatsAppSocket(sock) {
        this.whatsappSocket = sock;
    }

    /**
     * Get priority users
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getPriorityUsers(req, res) {
        try {
            const users = services.user.priority.getPriorityUsers();
            // Transform database format (whatsapp_id) to API format (id)
            const transformed = users.map(user => ({
                id: user.whatsapp_id || user.id,
                name: user.name || null
            }));
            res.json(transformed);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get priority users' });
        }
    }

    /**
     * Add priority user
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async addPriorityUser(req, res) {
        const { id, name } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'ID required' });
        }

        try {
            const added = await services.user.priority.addPriorityUser(id, name);
            if (added) {
                res.json({ success: true });
            } else {
                res.status(500).json({ error: 'Failed to add priority user' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Failed to add priority user' });
        }
    }

    /**
     * Remove priority user
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    removePriorityUser(req, res) {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'ID required' });
        }

        try {
            services.user.priority.removePriorityUser(id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to remove priority user' });
        }
    }

    /**
     * Get profile picture URL for a user
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async getProfilePicture(req, res) {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        try {
            if (!this.whatsappSocket) {
                return res.status(503).json({ error: 'WhatsApp not connected' });
            }

            const profilePicUrl = await this.whatsappSocket.profilePictureUrl(userId, 'image');

            if (profilePicUrl) {
                res.json({ url: profilePicUrl });
            } else {
                res.json({ url: null });
            }
        } catch (error) {
            console.error('Error fetching profile picture:', error.message);
            res.json({ url: null });
        }
    }

    /**
     * Get group participants (for easier VIP selection)
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async getGroupMembers(req, res) {
        try {
            if (!this.whatsappSocket) {
                return res.status(503).json({ error: 'WhatsApp not connected' });
            }

            const groups = services.user.groups.getGroups();

            if (!groups || groups.length === 0) {
                return res.status(400).json({
                    error: 'No groups configured',
                    message: 'Add at least one group in the Groups section to use this feature'
                });
            }

            const allParticipantsMap = new Map(); // Use Map to deduplicate by user ID
            const groupNames = [];

            for (const group of groups) {
                try {
                    const groupMetadata = await this.whatsappSocket.groupMetadata(group.id);
                    const groupName = group.name || groupMetadata.subject || 'Unknown Group';
                    groupNames.push(groupName);

                    for (const participant of groupMetadata.participants) {
                        const userId = participant.id;

                        if (allParticipantsMap.has(userId)) {
                            const existingUser = allParticipantsMap.get(userId);
                            if (!existingUser.groups.includes(groupName)) {
                                existingUser.groups.push(groupName);
                            }
                            continue;
                        }

                        let profilePicUrl = null;
                        let name = null;

                        try {
                            profilePicUrl = await this.whatsappSocket.profilePictureUrl(userId, 'image');
                        } catch (error) {
                        }

                        try {
                            const vipUsers = services.user.priority.getPriorityUsers();
                            const vipUser = vipUsers.find(u => (typeof u === 'string' ? u : u.id) === userId);
                            if (vipUser && typeof vipUser === 'object' && vipUser.name) {
                                name = vipUser.name;
                            }

                            if (!name) {
                                name = participant.notify || participant.verifiedName || null;
                            }
                        } catch (error) {
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
    }

    /**
     * Regenerate mobile token for a VIP
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async regenerateToken(req, res) {
        const { whatsappId } = req.params;

        if (!whatsappId) {
            return res.status(400).json({ error: 'WhatsApp ID required' });
        }

        try {
            const token = services.user.priority.regenerateMobileToken(whatsappId);
            if (token) {
                // Send new link via WhatsApp
                await services.user.priority.sendMobileAccessLink(whatsappId);
                res.json({ success: true, message: 'Token regenerated and sent via WhatsApp' });
            } else {
                res.status(500).json({ error: 'Failed to regenerate token' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new PriorityController();
