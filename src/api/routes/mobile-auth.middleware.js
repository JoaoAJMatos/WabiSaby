const dbService = require('../../database/db.service');
const { logger } = require('../../utils/logger.util');

/**
 * Mobile Authentication Middleware
 * Verifies token and device fingerprint for mobile VIP access
 */

/**
 * Authenticate mobile request using token and device fingerprint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function authenticateMobile(req, res, next) {
    // Extract token from query parameter or header
    const token = req.query.token || req.headers['x-mobile-token'];
    const fingerprint = req.headers['x-device-fingerprint'] || req.body.fingerprint;
    
    if (!token) {
        return res.status(401).json({ error: 'Mobile token required' });
    }
    
    if (!fingerprint) {
        return res.status(401).json({ error: 'Device fingerprint required' });
    }
    
    try {
        // Get VIP info by token
        const vip = dbService.getVipByToken(token);
        
        if (!vip) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        // Verify device fingerprint
        const isValid = dbService.verifyDeviceFingerprint(token, fingerprint);
        
        if (!isValid) {
            return res.status(403).json({ 
                error: 'Device fingerprint mismatch',
                message: 'This link is bound to a different device. Please use the device you originally accessed this link from.'
            });
        }
        
        // Store fingerprint if this is first access
        if (!vip.device_fingerprint) {
            dbService.storeDeviceFingerprint(token, fingerprint);
            logger.info(`Device fingerprint registered for VIP: ${vip.whatsapp_id}`);
        }
        
        // Attach VIP info to request
        req.vip = {
            whatsappId: vip.whatsapp_id,
            name: vip.name
        };
        
        next();
    } catch (error) {
        logger.error('Mobile authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
}

module.exports = {
    authenticateMobile
};

