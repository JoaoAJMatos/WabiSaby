const dbService = require('../../infrastructure/database/db.service');
const { logger } = require('../../utils/logger.util');
const {
    normalizeLanguageCode,
    getSupportedLanguageCodes,
    DEFAULT_LANGUAGE
} = require('../../config/languages');

/**
 * User Controller
 * Handles user-specific preferences like language
 */

class UserController {
    /**
     * Get current user's language preference
     * For web UI: uses query param or defaults to browser language
     * For authenticated requests: uses user session
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    getLanguage(req, res) {
        // For web UI, we might not have user context
        // Check if there's a user ID in query or session
        const userId = req.query.userId || req.session?.userId;
        
        if (userId) {
            const language = dbService.getUserLanguage(userId);
            return res.json({ success: true, language });
        }
        
        // No user context - return default
        res.json({ success: true, language: DEFAULT_LANGUAGE });
    }

    /**
     * Update user's language preference
     * Body: { language: 'en' | 'pt', userId?: string }
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     */
    updateLanguage(req, res) {
        const { language, userId } = req.body;
        
        if (!language) {
            return res.status(400).json({ 
                success: false, 
                error: 'Language parameter is required' 
            });
        }
        
        // Normalize and validate language code
        const normalizedLang = normalizeLanguageCode(language);
        
        if (!normalizedLang) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid language code. Valid options: ${getSupportedLanguageCodes().join(', ')}` 
            });
        }
        
        // If userId provided, update in database
        if (userId) {
            try {
                dbService.setUserLanguage(userId, normalizedLang);
                return res.json({ 
                    success: true, 
                    language: normalizedLang,
                    message: 'Language preference updated' 
                });
            } catch (error) {
                logger.error('Error updating user language:', error);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to update language preference' 
                });
            }
        }
        
        // No userId - just return success (for web UI without user context)
        res.json({ 
            success: true, 
            language: normalizedLang,
            message: 'Language preference updated (local only)' 
        });
    }
}

module.exports = new UserController();

