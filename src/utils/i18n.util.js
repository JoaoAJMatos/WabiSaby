const path = require('path');
const fs = require('fs');

/**
 * Internationalization Utility
 * Provides translation functionality for the application
 */

const translationsCache = {};

/**
 * Load translation file for a language
 * @param {string} lang - Language code (e.g., 'en', 'pt')
 * @returns {Object} Translation object
 */
function loadTranslations(lang) {
    if (translationsCache[lang]) {
        return translationsCache[lang];
    }
    
    const localesPath = path.join(__dirname, '../../locales');
    const translationFile = path.join(localesPath, `${lang}.json`);
    
    try {
        if (fs.existsSync(translationFile)) {
            const content = fs.readFileSync(translationFile, 'utf8');
            const translations = JSON.parse(content);
            translationsCache[lang] = translations;
            return translations;
        }
    } catch (error) {
        console.error(`Error loading translation file for ${lang}:`, error);
    }
    
    if (lang !== 'en') {
        return loadTranslations('en');
    }
    
    return {};
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
 * Translate a key to the specified language
 * @param {string} key - Translation key (supports dot notation, e.g., 'commands.play.added')
 * @param {string} lang - Language code (default: 'en')
 * @param {Object} params - Parameters to replace in translation (e.g., {title: 'Song Name'})
 * @returns {string} Translated string
 */
function t(key, lang = 'en', params = {}) {
    if (!key) {
        return '';
    }
    
    const normalizedLang = lang.split('-')[0].toLowerCase();
    
    const translations = loadTranslations(normalizedLang);
    
    let translation = getNestedValue(translations, key);
    
    if (translation === undefined && normalizedLang !== 'en') {
        const enTranslations = loadTranslations('en');
        translation = getNestedValue(enTranslations, key);
    }
    
    if (translation === undefined) {
        console.warn(`Translation missing for key: ${key} (lang: ${normalizedLang})`);
        return key;
    }
    
    return replaceParams(translation, params);
}

module.exports = {
    t,
    loadTranslations
};

