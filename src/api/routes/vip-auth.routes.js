const express = require('express');
const bcrypt = require('bcrypt');
const dbService = require('../../database/db.service');
const { logger } = require('../../utils/logger.util');

const router = express.Router();

/**
 * VIP Authentication Routes
 * Handles VIP password management and verification
 */

/**
 * GET /api/vip-auth/status
 * Check if VIP password is configured
 */
router.get('/vip-auth/status', (req, res) => {
    try {
        const isConfigured = dbService.hasVipPassword();
        res.json({ 
            configured: isConfigured 
        });
    } catch (error) {
        logger.error('Error checking VIP password status:', error);
        res.status(500).json({ 
            configured: false,
            error: 'Failed to check password status' 
        });
    }
});

/**
 * POST /api/vip-auth/setup
 * Set VIP password (first-time setup only)
 * Body: { password: string }
 */
router.post('/vip-auth/setup', async (req, res) => {
    const { password } = req.body;
    
    if (!password || password.length < 6) {
        return res.status(400).json({ 
            success: false, 
            error: 'Password must be at least 6 characters' 
        });
    }
    
    // Check if already configured
    if (dbService.hasVipPassword()) {
        return res.status(403).json({ 
            success: false, 
            error: 'VIP password is already configured. Use change password endpoint to update it.' 
        });
    }
    
    try {
        // Hash password with bcrypt
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        dbService.setVipPasswordHash(hash);
        
        logger.info('VIP password configured');
        res.json({ 
            success: true, 
            message: 'VIP password configured successfully' 
        });
    } catch (error) {
        logger.error('Error setting VIP password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to set VIP password' 
        });
    }
});

/**
 * POST /api/vip-auth/verify
 * Verify VIP password for unlocking
 * Body: { password: string }
 */
router.post('/vip-auth/verify', async (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ 
            success: false, 
            error: 'Password is required' 
        });
    }
    
    // Check if password is configured
    if (!dbService.hasVipPassword()) {
        return res.status(400).json({ 
            success: false, 
            error: 'VIP password not configured. Please set it up first.' 
        });
    }
    
    try {
        const hash = dbService.getVipPasswordHash();
        const isValid = await bcrypt.compare(password, hash);
        
        if (isValid) {
            res.json({ 
                success: true, 
                message: 'Password verified' 
            });
        } else {
            res.status(401).json({ 
                success: false, 
                error: 'Incorrect password' 
            });
        }
    } catch (error) {
        logger.error('Error verifying VIP password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to verify password' 
        });
    }
});

/**
 * POST /api/vip-auth/change
 * Change existing VIP password
 * Body: { currentPassword: string, newPassword: string }
 */
router.post('/vip-auth/change', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
            success: false, 
            error: 'Both current and new passwords are required' 
        });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ 
            success: false, 
            error: 'New password must be at least 6 characters' 
        });
    }
    
    try {
        // Verify current password
        const hash = dbService.getVipPasswordHash();
        if (!hash) {
            return res.status(400).json({ 
                success: false, 
                error: 'VIP password not configured' 
            });
        }
        
        const isValid = await bcrypt.compare(currentPassword, hash);
        if (!isValid) {
            return res.status(401).json({ 
                success: false, 
                error: 'Current password is incorrect' 
            });
        }
        
        // Set new password
        const saltRounds = 10;
        const newHash = await bcrypt.hash(newPassword, saltRounds);
        dbService.setVipPasswordHash(newHash);
        
        logger.info('VIP password changed');
        res.json({ 
            success: true, 
            message: 'Password changed successfully' 
        });
    } catch (error) {
        logger.error('Error changing VIP password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to change password' 
        });
    }
});

module.exports = { router };

