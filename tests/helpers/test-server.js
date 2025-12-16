/**
 * Test Server Helper Utilities
 * Provides helpers for creating Express test servers and making HTTP requests
 */

const express = require('express');

/**
 * Create a test Express app with a route mounted
 * @param {Object} router - Express router to mount
 * @param {string} path - Base path to mount router at (default: '/api')
 * @returns {Object} Express app instance
 */
function createTestApp(router, path = '/api') {
    const app = express();
    app.use(express.json());
    app.use(path, router);
    return app;
}

/**
 * Start a test server on a random available port
 * @param {Object} app - Express app instance
 * @returns {Promise<{server: Object, port: number, url: string, close: Function}>}
 */
function startTestServer(app) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            const url = `http://127.0.0.1:${port}`;
            resolve({
                server,
                port,
                url,
                close: () => new Promise((resolve) => {
                    server.close(() => resolve());
                })
            });
        });
        
        server.on('error', reject);
    });
}

/**
 * Make an HTTP request to the test server
 * @param {string} baseUrl - Base URL of the test server
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {Object} options - Request options (body, headers, etc.)
 * @returns {Promise<Response>}
 */
async function makeRequest(baseUrl, method, path, options = {}) {
    const url = `${baseUrl}${path}`;
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    
    if (options.body) {
        config.body = JSON.stringify(options.body);
    }
    
    return fetch(url, config);
}

/**
 * Parse JSON response and check status
 * @param {Response} response - Fetch response
 * @returns {Promise<Object>} Parsed JSON body
 */
async function parseJsonResponse(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`Failed to parse JSON response: ${text}`);
    }
}

module.exports = {
    createTestApp,
    startTestServer,
    makeRequest,
    parseJsonResponse
};

