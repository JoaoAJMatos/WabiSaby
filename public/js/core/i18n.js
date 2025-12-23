/**
 * Frontend Internationalization Utility
 * Provides translation functionality for the web UI
 */

// Cache for loaded translations
let translationsCache = {};
let currentLanguage = window.LanguageConfig?.DEFAULT_LANGUAGE || 'en';

/**
 * Load translation file for a language
 * @param {string} lang - Language code (e.g., 'en', 'pt')
 * @returns {Promise<Object>} Translation object
 */
async function loadTranslations(lang) {
    if (translationsCache[lang]) {
        return translationsCache[lang];
    }
    
    try {
        const response = await fetch(`/locales/${lang}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load translations for ${lang}`);
        }
        const translations = await response.json();
        translationsCache[lang] = translations;
        return translations;
    } catch (error) {
        console.error(`Error loading translation file for ${lang}:`, error);
        
        // Fallback to default language if translation file doesn't exist
        const defaultLang = window.LanguageConfig.DEFAULT_LANGUAGE;
        if (lang !== defaultLang) {
            return loadTranslations(defaultLang);
        }
        
        // If even default language doesn't exist, return empty object
        return {};
    }
}

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to search
 * @param {string} path - Dot-separated path (e.g., 'commands.play.added')
 * @returns {string|undefined} Value at path or undefined
 */
function getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        } else {
            return undefined;
        }
    }
    
    return current;
}

/**
 * Replace parameters in translation string
 * @param {string} text - Translation string with placeholders
 * @param {Object} params - Parameters to replace
 * @returns {string} String with parameters replaced
 */
function replaceParams(text, params = {}) {
    if (typeof text !== 'string') {
        return text;
    }
    
    let result = text;
    Object.keys(params).forEach(key => {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        result = result.replace(regex, params[key]);
    });
    
    return result;
}

/**
 * Translate a key to the current language
 * @param {string} key - Translation key (supports dot notation, e.g., 'commands.play.added')
 * @param {Object} params - Parameters to replace in translation (e.g., {title: 'Song Name'})
 * @returns {Promise<string>} Translated string
 */
async function t(key, params = {}) {
    if (!key) {
        return '';
    }
    
    // Load translations for current language
    const translations = await loadTranslations(currentLanguage);
    
    // Get translation value
    let translation = getNestedValue(translations, key);
    
    // If translation not found, try default language fallback
    const defaultLang = window.LanguageConfig.DEFAULT_LANGUAGE;
    if (translation === undefined && currentLanguage !== defaultLang) {
        const defaultTranslations = await loadTranslations(defaultLang);
        translation = getNestedValue(defaultTranslations, key);
    }
    
    // If still not found, return the key itself
    if (translation === undefined) {
        console.warn(`Translation missing for key: ${key} (lang: ${currentLanguage})`);
        return key;
    }
    
    // Replace parameters
    return replaceParams(translation, params);
}

/**
 * Synchronous version of t() - uses cached translations
 * @param {string} key - Translation key
 * @param {Object} params - Parameters to replace
 * @returns {string} Translated string
 */
function tSync(key, params = {}) {
    if (!key) {
        return '';
    }
    
    const defaultLang = window.LanguageConfig.DEFAULT_LANGUAGE;
    const translations = translationsCache[currentLanguage] || translationsCache[defaultLang] || {};
    let translation = getNestedValue(translations, key);
    
    if (translation === undefined) {
        return key;
    }
    
    return replaceParams(translation, params);
}

/**
 * Set the current language
 * @param {string} lang - Language code (e.g., 'en', 'pt')
 */
async function setLanguage(lang) {
    const normalizedLang = window.LanguageConfig.normalizeLanguageCode(lang);
    
    if (!normalizedLang) {
        console.warn(`Invalid language code: ${lang}, defaulting to '${window.LanguageConfig.DEFAULT_LANGUAGE}'`);
        currentLanguage = window.LanguageConfig.DEFAULT_LANGUAGE;
        return;
    }
    
    currentLanguage = normalizedLang;
    
    // Load translations for the new language
    await loadTranslations(currentLanguage);
    
    // Store preference in localStorage
    localStorage.setItem('wabisaby_language', currentLanguage);
    
    // Trigger language change event
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: currentLanguage } }));
}

/**
 * Get the current language
 * @returns {string} Current language code
 */
function getLanguage() {
    return currentLanguage;
}

/**
 * Detect language from browser or localStorage
 * @returns {string} Detected language code
 */
function detectLanguage() {
    // Check localStorage first
    const stored = localStorage.getItem('wabisaby_language');
    if (stored) {
        const normalized = window.LanguageConfig.normalizeLanguageCode(stored);
        if (normalized) {
            return normalized;
        }
    }
    
    // Check browser language
    const browserLang = navigator.language || navigator.userLanguage || window.LanguageConfig.DEFAULT_LANGUAGE;
    const normalized = window.LanguageConfig.normalizeLanguageCode(browserLang);
    
    if (normalized) {
        return normalized;
    }
    
    // Default to configured default language
    return window.LanguageConfig.DEFAULT_LANGUAGE;
}

/**
 * Initialize i18n system
 * Detects language and loads translations
 */
async function init() {
    const detectedLang = detectLanguage();
    await setLanguage(detectedLang);
    
    // Preload default language as fallback
    await loadTranslations(window.LanguageConfig.DEFAULT_LANGUAGE);
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for use in modules
window.i18n = {
    t,
    tSync,
    setLanguage,
    getLanguage,
    detectLanguage,
    init
};

