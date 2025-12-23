/**
 * Centralized Language Configuration
 * 
 * This is the single source of truth for all supported languages in WabiSaby.
 * To add a new language:
 * 1. Add the language code, name, emoji, and aliases to the SUPPORTED_LANGUAGES object
 * 2. Create a translation file in locales/{code}.json
 * 3. All other parts of the application will automatically support the new language
 */

/**
 * Supported languages configuration
 * @typedef {Object} LanguageConfig
 * @property {string} code - Language code (e.g., 'en', 'pt')
 * @property {string} name - Language name in its native form (e.g., 'English', 'Português')
 * @property {string} emoji - Flag emoji for the language
 * @property {string[]} aliases - Alternative names/codes that map to this language
 */

/**
 * Map of language codes to language configuration
 * @type {Object<string, LanguageConfig>}
 */
const SUPPORTED_LANGUAGES = {
    'en': {
        code: 'en',
        name: 'English',
        emoji: '🇺🇸',
        aliases: ['english']
    },
    'pt': {
        code: 'pt',
        name: 'Português',
        emoji: '🇵🇹',
        aliases: ['portuguese', 'português']
    }
};

/**
 * Default language code
 */
const DEFAULT_LANGUAGE = 'en';

/**
 * Get all supported language codes
 * @returns {string[]} Array of language codes
 */
function getSupportedLanguageCodes() {
    return Object.keys(SUPPORTED_LANGUAGES);
}

/**
 * Get language configuration by code
 * @param {string} code - Language code
 * @returns {LanguageConfig|undefined} Language configuration or undefined if not found
 */
function getLanguageConfig(code) {
    if (!code) return undefined;
    const normalized = code.toLowerCase();
    return SUPPORTED_LANGUAGES[normalized];
}

/**
 * Get language name by code
 * @param {string} code - Language code
 * @returns {string} Language name or 'English' as fallback
 */
function getLanguageName(code) {
    const config = getLanguageConfig(code);
    return config ? config.name : SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE].name;
}

/**
 * Get language emoji by code
 * @param {string} code - Language code
 * @returns {string} Language emoji or default emoji
 */
function getLanguageEmoji(code) {
    const config = getLanguageConfig(code);
    return config ? config.emoji : SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE].emoji;
}

/**
 * Normalize a language code or alias to the canonical code
 * @param {string} input - Language code or alias
 * @returns {string|null} Normalized language code or null if invalid
 */
function normalizeLanguageCode(input) {
    if (!input) return null;
    
    const normalized = input.toLowerCase().split('-')[0]; // Handle 'en-US' -> 'en'
    
    // Check if it's a direct code
    if (SUPPORTED_LANGUAGES[normalized]) {
        return normalized;
    }
    
    // Check aliases
    for (const [code, config] of Object.entries(SUPPORTED_LANGUAGES)) {
        if (config.aliases.includes(normalized)) {
            return code;
        }
    }
    
    return null;
}

/**
 * Check if a language code is valid
 * @param {string} code - Language code to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidLanguageCode(code) {
    return normalizeLanguageCode(code) !== null;
}

/**
 * Get all language codes and names for display
 * @returns {Array<{code: string, name: string, emoji: string}>} Array of language info
 */
function getLanguagesForDisplay() {
    return Object.values(SUPPORTED_LANGUAGES).map(config => ({
        code: config.code,
        name: config.name,
        emoji: config.emoji
    }));
}

/**
 * Get language mapping object for command usage (includes aliases)
 * @returns {Object<string, string>} Map of codes/aliases to language names
 */
function getLanguageMapping() {
    const mapping = {};
    for (const [code, config] of Object.entries(SUPPORTED_LANGUAGES)) {
        mapping[code] = config.name;
        config.aliases.forEach(alias => {
            mapping[alias] = config.name;
        });
    }
    return mapping;
}

module.exports = {
    SUPPORTED_LANGUAGES,
    DEFAULT_LANGUAGE,
    getSupportedLanguageCodes,
    getLanguageConfig,
    getLanguageName,
    getLanguageEmoji,
    normalizeLanguageCode,
    isValidLanguageCode,
    getLanguagesForDisplay,
    getLanguageMapping
};

