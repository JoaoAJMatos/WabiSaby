/**
 * Cache Utility Tests
 */

const { test, expect, beforeEach } = require('bun:test');
const { CacheManager } = require('../../../src/utils/cache.util');

let cache;

beforeEach(() => {
    cache = new CacheManager({ ttl: 1000, maxSize: 5 });
});

test('CacheManager should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
});

test('CacheManager should return null for missing keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
});

test('CacheManager should expire entries after TTL', async () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
    
    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    expect(cache.get('key1')).toBeNull();
});

test('CacheManager should respect max size limit', () => {
    // Fill cache to max size
    for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
    }
    
    expect(cache.size()).toBe(5);
    
    // Add one more - should remove oldest
    cache.set('key5', 'value5');
    
    expect(cache.size()).toBe(5);
    expect(cache.get('key0')).toBeNull(); // Oldest should be removed
    expect(cache.get('key5')).toBe('value5'); // Newest should exist
});

test('CacheManager should not remove entry if updating existing key', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key1', 'value1updated'); // Update existing
    
    expect(cache.get('key1')).toBe('value1updated');
    expect(cache.size()).toBe(2);
});

test('CacheManager has() should check if key exists and is not expired', async () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(false);
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    expect(cache.has('key1')).toBe(false);
});

test('CacheManager delete() should remove keys', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeNull();
    expect(cache.delete('nonexistent')).toBe(false);
});

test('CacheManager clear() should remove all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    
    expect(cache.size()).toBe(0);
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
});

test('CacheManager should use default TTL and maxSize when not specified', () => {
    const defaultCache = new CacheManager();
    expect(defaultCache.ttl).toBe(5 * 60 * 1000); // 5 minutes
    expect(defaultCache.maxSize).toBe(100);
});

test('CacheManager should handle complex objects', () => {
    const obj = { name: 'Test', value: 123, nested: { data: 'value' } };
    cache.set('obj', obj);
    
    const retrieved = cache.get('obj');
    expect(retrieved).toEqual(obj);
    expect(retrieved.nested.data).toBe('value');
});

