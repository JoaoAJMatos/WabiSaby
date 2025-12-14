/**
 * String Utility
 * String normalization and matching functions
 */

/**
 * Normalize a string for comparison (lowercase, remove special chars)
 * @param {string} str - String to normalize
 * @returns {string} - Normalized string
 */
function normalizeString(str) {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^\w\s]/g, ' ')         // Remove special chars
        .replace(/\s+/g, ' ')             // Normalize whitespace
        .trim();
}

/**
 * Check if a string contains another (normalized comparison)
 * @param {string} haystack - String to search in
 * @param {string} needle - String to search for
 * @returns {boolean}
 */
function containsNormalized(haystack, needle) {
    return normalizeString(haystack).includes(normalizeString(needle));
}

/**
 * Check if words appear in same order (for better matching)
 * @param {string} text - Text to search in
 * @param {string} query - Query words
 * @returns {boolean} True if words appear in order
 */
function wordsInOrder(text, query) {
    const textWords = text.split(' ').filter(w => w.length > 0);
    const queryWords = query.split(' ').filter(w => w.length > 0);
    
    let queryIndex = 0;
    for (const word of textWords) {
        if (queryIndex < queryWords.length && word.includes(queryWords[queryIndex])) {
            queryIndex++;
        }
    }
    
    return queryIndex === queryWords.length;
}

module.exports = {
    normalizeString,
    containsNormalized,
    wordsInOrder
};

