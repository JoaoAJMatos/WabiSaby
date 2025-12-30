/**
 * Rate Limit Utility
 * Provides shared functions for detecting and handling rate limit errors
 */

/**
 * Check if an error message indicates a rate limit error
 * @param {string|Error} error - Error message or Error object
 * @returns {boolean}
 */
function isRateLimitError(error) {
    if (!error) return false;
    
    // Check error message (case-insensitive)
    const errorMsg = (error?.message || String(error) || '').toLowerCase();
    
    // Check for common rate limit indicators
    return errorMsg.includes('429') || 
           errorMsg.includes('too many requests') || 
           errorMsg.includes('rate limit') ||
           errorMsg.includes('rate-limited') ||
           errorMsg.includes('got 429') ||
           // Check error code if available
           error?.code === 429 ||
           error?.status === 429 ||
           error?.statusCode === 429;
}

/**
 * Extract rate limit error message from error
 * @param {string|Error} error - Error message or Error object
 * @returns {string|null} Rate limit error message or null
 */
function getRateLimitMessage(error) {
    if (isRateLimitError(error)) {
        const errorMsg = error?.message || String(error) || 'Unknown error';
        return `Rate limited: ${errorMsg}`;
    }
    return null;
}

/**
 * Create a standardized rate limit error
 * @param {string|Error} originalError - Original error
 * @returns {Error} Rate limit error
 */
function createRateLimitError(originalError) {
    const errorMsg = originalError?.message || String(originalError) || 'Unknown error';
    const rateLimitError = new Error(`Rate limited: ${errorMsg}`);
    rateLimitError.name = 'RateLimitError';
    return rateLimitError;
}

module.exports = {
    isRateLimitError,
    getRateLimitMessage,
    createRateLimitError
};

