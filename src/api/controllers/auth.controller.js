const fs = require('fs');
const path = require('path');
const config = require('../../config');
const infrastructure = require('../../infrastructure');
const { logger } = require('../../utils/logger.util');

/**
 * Auth Controller
 * Handles authentication and logout business logic
 */

class AuthController {
    /**
     * Logout from WhatsApp and remove auth data
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    async logout(req, res) {
        try {
            await this.disconnectWhatsApp();

            await this.deleteAuthStateFiles();

            await this.triggerReconnection();

            res.json({
                success: true,
                message: 'Logged out successfully. WhatsApp disconnected and auth data removed.'
            });
        } catch (error) {
            logger.error('Error during logout:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to logout',
                message: error.message
            });
        }
    }

    async disconnectWhatsApp() {
        if (infrastructure.whatsapp.adapter.socket) {
            try {
                await infrastructure.whatsapp.adapter.socket.logout();
                logger.info('WhatsApp socket logged out successfully');
            } catch (error) {
                logger.warn('Error during socket logout (may already be disconnected):', error.message);
            }
        }
    }

    async deleteAuthStateFiles() {
        const authDir = config.paths.auth;
        if (fs.existsSync(authDir)) {
                try {
                    const files = fs.readdirSync(authDir);
                    let deletedCount = 0;

                    for (const file of files) {
                        const filePath = path.join(authDir, file);
                        try {
                            const stat = fs.statSync(filePath);
                            if (stat.isFile()) {
                                fs.unlinkSync(filePath);
                                deletedCount++;
                            } else if (stat.isDirectory()) {
                                // Recursively delete directory contents
                                fs.rmSync(filePath, { recursive: true, force: true });
                                deletedCount++;
                            }
                        } catch (fileError) {
                            logger.warn(`Failed to delete auth file ${file}:`, fileError.message);
                        }
                    }

                    logger.info(`Deleted ${deletedCount} auth state file(s)`);
                } catch (dirError) {
                    logger.error('Error reading auth directory:', dirError);
                    // Continue even if directory read fails
                }
        }
    }

    async triggerReconnection() {
        setTimeout(async () => {
            try {
                await infrastructure.whatsapp.adapter.connectToWhatsApp();
                logger.info('WhatsApp reconnection initiated after logout');
            } catch (error) {
                logger.error('Error initiating reconnection after logout:', error);
            }
        }, 500);
    }
}

module.exports = new AuthController();
