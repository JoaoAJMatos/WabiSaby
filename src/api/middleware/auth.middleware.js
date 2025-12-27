const dbService = require('../../infrastructure/database/db.service');
const { logger } = require('../../utils/logger.util');

/**
 * Authentication Middleware
 * Handles various authentication methods for API endpoints
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
    // Extract fingerprint from query parameter, header, or body (for different request types)
    const fingerprint = req.query.fingerprint || req.headers['x-device-fingerprint'] || (req.body && req.body.fingerprint);

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

/**
 * Check if user has VIP/priority access
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requireVip(req, res, next) {
    const services = require('../../services');
    const { whatsappId } = req.vip || {};

    if (!whatsappId) {
        return res.status(401).json({ error: 'VIP authentication required' });
    }

    const isVip = services.user.priority.checkPriority(whatsappId);
    if (!isVip) {
        return res.status(403).json({ error: 'VIP access required' });
    }

    next();
}

/**
 * Restrict access to localhost only
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function localhostOnly(req, res, next) {
    // Check various IP sources (including proxy headers)
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const ip = realIp || 
               (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ||
               req.ip || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress;
    
    const isLocalhost = ip === '127.0.0.1' || 
                       ip === '::1' || 
                       ip === '::ffff:127.0.0.1' ||
                       req.hostname === 'localhost' ||
                       req.hostname === '127.0.0.1';
    
    if (!isLocalhost) {
        logger.warn(`Access denied to ${req.path} from ${ip} (${req.hostname})`);
        return res.status(403).send('Access denied. This page is only accessible from localhost.');
    }
    
    next();
}

module.exports = {
    authenticateMobile,
    requireVip,
    localhostOnly
};
