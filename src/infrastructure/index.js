/**
 * Infrastructure Layer
 * Exports all infrastructure components
 */

// Import infrastructure modules
const whatsapp = require('./whatsapp');
const database = require('./database');

module.exports = {
    whatsapp,
    database
};
