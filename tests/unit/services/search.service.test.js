/**
 * Search Service Tests
 * Tests for YouTube search functionality
 */

const { test, expect } = require('bun:test');
const searchService = require('../../../src/services/search.service');

test('searchYouTube should be a function', () => {
    expect(typeof searchService.searchYouTube).toBe('function');
});

// Note: Full testing of searchYouTube, scoreSearchResult, executeSearchPlayDl, and executeSearch
// requires mocking:
// - youtube-api.service (searchYouTubeAPI)
// - play-dl library
// - cache.util (search cache, validation cache)
// - rate-limit.util (rate limit error handling)
//
// The search service is complex with multiple fallback strategies:
// 1. Try YouTube Data API first (if configured and quota available)
// 2. Fallback to play-dl if API fails or not configured
// 3. Score results based on title/artist matching
// 4. Cache results to reduce API calls
// 5. Handle rate limiting errors
//
// These are better suited for integration tests that can test
// the actual search process with real or mocked APIs.

