/**
 * YouTube Services
 * Exports all YouTube-related services
 */

const apiService = require('./api.service');
const quotaService = require('./quota.service');
const searchService = require('./search.service');
const downloadService = require('./download.service');

module.exports = {
    api: apiService,
    quota: quotaService,
    search: searchService,
    download: downloadService
};
