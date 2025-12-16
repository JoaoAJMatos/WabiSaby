/**
 * Rate Limit Utility Tests
 */

const { test, expect } = require('bun:test');
const {
    isRateLimitError,
    getRateLimitMessage,
    createRateLimitError
} = require('../../../src/utils/rate-limit.util');

test('isRateLimitError should detect rate limit errors', () => {
    expect(isRateLimitError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRateLimitError(new Error('Got 429'))).toBe(true);
    expect(isRateLimitError('rate limit exceeded')).toBe(true);
    expect(isRateLimitError('Too Many Requests')).toBe(true);
    expect(isRateLimitError('HTTP 429')).toBe(true);
    expect(isRateLimitError(new Error('404 Not Found'))).toBe(false);
    expect(isRateLimitError('normal error')).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
});

test('getRateLimitMessage should extract rate limit message', () => {
    const msg1 = getRateLimitMessage(new Error('429 Too Many Requests'));
    expect(msg1).toContain('Rate limited');
    expect(msg1).toContain('429');
    
    const msg2 = getRateLimitMessage('rate limit');
    expect(msg2).toContain('Rate limited');
    
    expect(getRateLimitMessage(new Error('404 Not Found'))).toBeNull();
    expect(getRateLimitMessage('normal error')).toBeNull();
});

test('createRateLimitError should create standardized error', () => {
    const error = createRateLimitError(new Error('429 Too Many Requests'));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RateLimitError');
    expect(error.message).toContain('Rate limited');
    expect(error.message).toContain('429');
});

test('createRateLimitError should handle string errors', () => {
    const error = createRateLimitError('rate limit exceeded');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RateLimitError');
    expect(error.message).toContain('Rate limited');
});

