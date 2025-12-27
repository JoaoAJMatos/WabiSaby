/**
 * User Domain Model
 * Represents a user in the system
 */
class User {
    constructor(data = {}) {
        this.id = data.id || null;
        this.whatsappId = data.whatsappId || data.whatsapp_id || '';
        this.name = data.name || '';
        this.isPriority = data.isPriority || false;
        this.mobileToken = data.mobileToken || data.mobile_token || null;
        this.deviceFingerprint = data.deviceFingerprint || data.device_fingerprint || null;
        this.tokenCreatedAt = data.tokenCreatedAt || data.token_created_at || null;
        this.fingerprintCreatedAt = data.fingerprintCreatedAt || data.fingerprint_created_at || null;
        this.addedAt = data.addedAt || data.added_at || null;
        this.notificationsEnabled = data.notificationsEnabled !== undefined ? data.notificationsEnabled : true;
        this.language = data.language || 'en';
    }

    /**
     * Create User from priority user database record
     * @param {Object} dbRecord - Database record from priority_users table
     * @returns {User} User instance
     */
    static fromPriorityUserRecord(dbRecord) {
        return new User({
            whatsappId: dbRecord.whatsapp_id,
            name: dbRecord.name,
            isPriority: true,
            mobileToken: dbRecord.mobile_token,
            deviceFingerprint: dbRecord.device_fingerprint,
            tokenCreatedAt: dbRecord.token_created_at,
            fingerprintCreatedAt: dbRecord.fingerprint_created_at,
            addedAt: dbRecord.added_at
        });
    }

    /**
     * Create User from requester database record
     * @param {Object} dbRecord - Database record from requesters table
     * @returns {User} User instance
     */
    static fromRequesterRecord(dbRecord) {
        return new User({
            id: dbRecord.id,
            whatsappId: dbRecord.whatsapp_id,
            name: dbRecord.name,
            isPriority: false // Requesters are not necessarily priority users
        });
    }

    /**
     * Convert to database format for priority_users table
     * @returns {Object} Database record format
     */
    toPriorityUserDatabase() {
        return {
            whatsapp_id: this.whatsappId,
            name: this.name,
            mobile_token: this.mobileToken,
            device_fingerprint: this.deviceFingerprint,
            token_created_at: this.tokenCreatedAt,
            fingerprint_created_at: this.fingerprintCreatedAt
        };
    }

    /**
     * Convert to database format for requesters table
     * @returns {Object} Database record format
     */
    toRequesterDatabase() {
        return {
            name: this.name,
            whatsapp_id: this.whatsappId
        };
    }

    /**
     * Convert to JSON format
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            id: this.id,
            whatsappId: this.whatsappId,
            name: this.name,
            isPriority: this.isPriority,
            hasMobileAccess: !!this.mobileToken,
            notificationsEnabled: this.notificationsEnabled,
            language: this.language
        };
    }

    /**
     * Validate the user
     * @returns {Array} Array of validation errors
     */
    validate() {
        const errors = [];

        if (!this.whatsappId) {
            errors.push('WhatsApp ID is required');
        }

        if (this.name && this.name.length > 100) {
            errors.push('Name must be 100 characters or less');
        }

        if (this.language && !['en', 'pt'].includes(this.language)) {
            errors.push('Language must be "en" or "pt"');
        }

        return errors;
    }

    /**
     * Check if user has VIP/priority status
     * @returns {boolean} True if user is a priority user
     */
    isVip() {
        return this.isPriority;
    }

    /**
     * Check if user has mobile access configured
     * @returns {boolean} True if mobile access is configured
     */
    hasMobileAccess() {
        return !!this.mobileToken;
    }

    /**
     * Generate a display name for the user
     * @returns {string} Display name
     */
    getDisplayName() {
        if (this.name) {
            return this.name;
        }
        return this.whatsappId || 'Unknown User';
    }

    /**
     * Update user name
     * @param {string} name - New name
     */
    updateName(name) {
        if (name && name.trim()) {
            this.name = name.trim();
        }
    }

    /**
     * Enable or disable notifications for this user
     * @param {boolean} enabled - Whether notifications should be enabled
     */
    setNotificationsEnabled(enabled) {
        this.notificationsEnabled = Boolean(enabled);
    }

    /**
     * Set user's preferred language
     * @param {string} language - Language code ('en' or 'pt')
     */
    setLanguage(language) {
        if (['en', 'pt'].includes(language)) {
            this.language = language;
        }
    }
}

module.exports = User;
