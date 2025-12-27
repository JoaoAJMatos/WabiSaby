const { logger } = require('../../utils/logger.util');

/**
 * YouTube Quota Service
 * Manages YouTube Data API quota tracking and limits
 */
class YouTubeQuotaService {
    constructor() {
        // Quota tracking state
        this.dailyQuotaUsed = 0;
        this.quotaResetTime = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now

        // Quota constants
        this.QUOTA_LIMIT = 10000; // Default free quota per day
        this.SEARCH_COST = 100; // Cost per search.list request
        this.VIDEO_INFO_COST = 1; // Cost per videos.list request
    }

    /**
     * Check if we have quota available
     * @returns {boolean} True if quota is available for a search operation
     */
    hasQuotaAvailable() {
        // Reset quota counter if 24 hours have passed
        if (Date.now() >= this.quotaResetTime) {
            this.dailyQuotaUsed = 0;
            this.quotaResetTime = Date.now() + (24 * 60 * 60 * 1000);
            logger.info('[YouTube API] Daily quota reset');
        }

        // Check if we have enough quota for a search
        const estimatedCost = this.SEARCH_COST + (this.VIDEO_INFO_COST * 15); // Search + ~15 video details
        return (this.dailyQuotaUsed + estimatedCost) < this.QUOTA_LIMIT;
    }

    /**
     * Record quota usage
     * @param {number} cost - The cost to record
     */
    recordQuotaUsage(cost) {
        this.dailyQuotaUsed += cost;
        const remaining = this.QUOTA_LIMIT - this.dailyQuotaUsed;

        if (remaining < 1000) {
            logger.warn(`[YouTube API] Low quota remaining: ~${remaining} units`);
        } else if (remaining < 5000) {
            logger.info(`[YouTube API] Quota remaining: ~${remaining} units`);
        }
    }

    /**
     * Get quota status
     * @returns {Object} Quota status information
     */
    getQuotaStatus() {
        const remaining = this.QUOTA_LIMIT - this.dailyQuotaUsed;
        const resetTime = new Date(this.quotaResetTime);

        return {
            used: this.dailyQuotaUsed,
            limit: this.QUOTA_LIMIT,
            remaining: remaining,
            resetTime: resetTime.toISOString()
        };
    }

    /**
     * Reset quota counter (for testing)
     */
    resetQuota() {
        this.dailyQuotaUsed = 0;
        this.quotaResetTime = Date.now() + (24 * 60 * 60 * 1000);
    }

    /**
     * Get the quota constants
     */
    getQuotaConstants() {
        return {
            QUOTA_LIMIT: this.QUOTA_LIMIT,
            SEARCH_COST: this.SEARCH_COST,
            VIDEO_INFO_COST: this.VIDEO_INFO_COST
        };
    }
}

// Export singleton instance
module.exports = new YouTubeQuotaService();
