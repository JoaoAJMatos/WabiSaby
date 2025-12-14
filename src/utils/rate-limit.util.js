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
    const errorMsg = error?.message || String(error) || '';
    return errorMsg.includes('429') || 
           errorMsg.includes('Too Many Requests') || 
           errorMsg.includes('rate') || 
           errorMsg.includes('Got 429');
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

