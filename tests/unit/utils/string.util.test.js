/**
 * String Utility Tests
 */

const { test, expect } = require('bun:test');
const {
    normalizeString,
    containsNormalized,
    wordsInOrder
} = require('../../../src/utils/string.util');

test('normalizeString should lowercase and remove special characters', () => {
    expect(normalizeString('Hello World')).toBe('hello world');
    expect(normalizeString('HELLO WORLD')).toBe('hello world');
    expect(normalizeString('Hello, World!')).toBe('hello world');
    expect(normalizeString('Hello   World')).toBe('hello world');
    expect(normalizeString('  Hello World  ')).toBe('hello world');
});

test('normalizeString should handle diacritics', () => {
    expect(normalizeString('Café')).toBe('cafe');
    expect(normalizeString('Müller')).toBe('muller');
    expect(normalizeString('José')).toBe('jose');
});

test('normalizeString should handle empty and null strings', () => {
    expect(normalizeString('')).toBe('');
    expect(normalizeString(null)).toBe('');
    expect(normalizeString(undefined)).toBe('');
});

test('containsNormalized should find strings ignoring case and special chars', () => {
    expect(containsNormalized('Hello World', 'hello')).toBe(true);
    expect(containsNormalized('Hello World', 'HELLO')).toBe(true);
    expect(containsNormalized('Hello, World!', 'hello world')).toBe(true);
    expect(containsNormalized('Hello World', 'xyz')).toBe(false);
    expect(containsNormalized('Café', 'cafe')).toBe(true);
});

test('wordsInOrder should check if words appear in order', () => {
    expect(wordsInOrder('Never Gonna Give You Up', 'Never Gonna')).toBe(true);
    expect(wordsInOrder('Never Gonna Give You Up', 'Gonna Give')).toBe(true);
    expect(wordsInOrder('Never Gonna Give You Up', 'Give You Up')).toBe(true);
    expect(wordsInOrder('Never Gonna Give You Up', 'Up Give')).toBe(false);
    expect(wordsInOrder('Never Gonna Give You Up', 'Never Up')).toBe(true);
    expect(wordsInOrder('Never Gonna Give You Up', 'Gonna Never')).toBe(false);
});

test('wordsInOrder should handle partial word matches', () => {
    expect(wordsInOrder('Hello World', 'Hell Wor')).toBe(true);
    expect(wordsInOrder('Test String', 'Tes Str')).toBe(true);
});

test('wordsInOrder should handle empty strings', () => {
    expect(wordsInOrder('', '')).toBe(true);
    expect(wordsInOrder('Hello', '')).toBe(true);
    expect(wordsInOrder('', 'Hello')).toBe(false);
});

