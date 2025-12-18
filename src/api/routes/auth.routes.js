const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const whatsappAdapter = require('../../core/whatsapp');
const { logger } = require('../../utils/logger.util');

const router = express.Router();

/**
 * Auth Routes
 * Handles authentication and logout endpoints
 */

/**
 * POST /api/auth/logout
 * Disconnect from WhatsApp and remove auth data
 */
router.post('/auth/logout', async (req, res) => {
    try {
        // Disconnect WhatsApp socket if connected
        if (whatsappAdapter.socket) {
            try {
                await whatsappAdapter.socket.logout();
                logger.info('WhatsApp socket logged out successfully');
            } catch (error) {
                logger.warn('Error during socket logout (may already be disconnected):', error.message);
                // Continue with cleanup even if logout fails
            }
        }

        // Delete all auth state files
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

        // Trigger reconnection to start generating new QR code
        // Wait a bit for cleanup to complete, then reconnect
        setTimeout(async () => {
            try {
                await whatsappAdapter.connectToWhatsApp();
                logger.info('WhatsApp reconnection initiated after logout');
            } catch (error) {
                logger.error('Error initiating reconnection after logout:', error);
            }
        }, 500);

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
});

module.exports = { router };

