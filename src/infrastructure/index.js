/**
 * Infrastructure Layer
 * Exports all infrastructure components
 */

// Import infrastructure modules
const whatsapp = require('./whatsapp');
const database = require('./database');
const storage = require('./storage');

module.exports = {
    whatsapp,
    database,
    storage
};
