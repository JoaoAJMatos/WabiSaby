/**
 * Media Service Tests
 * Tests for WhatsApp media download functionality
 */

const { test, expect } = require('bun:test');
const mediaService = require('../../../src/services/media.service');

test('isValidAudioMimetype should validate audio MIME types', () => {
    expect(mediaService.isValidAudioMimetype('audio/mpeg')).toBe(true);
    expect(mediaService.isValidAudioMimetype('audio/mp3')).toBe(true);
    expect(mediaService.isValidAudioMimetype('audio/wav')).toBe(true);
    expect(mediaService.isValidAudioMimetype('audio/mp4')).toBe(true);
    expect(mediaService.isValidAudioMimetype('audio/ogg')).toBe(true);
    expect(mediaService.isValidAudioMimetype('audio/flac')).toBe(true);
    expect(mediaService.isValidAudioMimetype('audio/aac')).toBe(true);
    expect(mediaService.isValidAudioMimetype('audio/webm')).toBe(true);
});

test('isValidAudioMimetype should reject non-audio MIME types', () => {
    expect(mediaService.isValidAudioMimetype('video/mp4')).toBe(false);
    expect(mediaService.isValidAudioMimetype('image/jpeg')).toBe(false);
    expect(mediaService.isValidAudioMimetype('text/plain')).toBe(false);
    expect(mediaService.isValidAudioMimetype(null)).toBe(false);
    expect(mediaService.isValidAudioMimetype('')).toBe(false);
});

test('isValidAudioMimetype should accept audio/* prefix', () => {
    expect(mediaService.isValidAudioMimetype('audio/x-custom')).toBe(true);
    expect(mediaService.isValidAudioMimetype('audio/unknown')).toBe(true);
});

test('getFileExtension should map MIME types to extensions', () => {
    expect(mediaService.getFileExtension('audio/mpeg')).toBe('.mp3');
    expect(mediaService.getFileExtension('audio/mp3')).toBe('.mp3');
    expect(mediaService.getFileExtension('audio/wav')).toBe('.wav');
    expect(mediaService.getFileExtension('audio/mp4')).toBe('.m4a');
    expect(mediaService.getFileExtension('audio/m4a')).toBe('.m4a');
    expect(mediaService.getFileExtension('audio/ogg')).toBe('.ogg');
    expect(mediaService.getFileExtension('audio/flac')).toBe('.flac');
    expect(mediaService.getFileExtension('audio/aac')).toBe('.aac');
    expect(mediaService.getFileExtension('audio/webm')).toBe('.webm');
});

test('getFileExtension should use filename extension if provided', () => {
    expect(mediaService.getFileExtension('audio/mpeg', 'song.wav')).toBe('.wav');
    expect(mediaService.getFileExtension('audio/mp3', 'track.m4a')).toBe('.m4a');
});

test('getFileExtension should default to .mp3 for unknown MIME types', () => {
    expect(mediaService.getFileExtension('audio/unknown')).toBe('.mp3');
    expect(mediaService.getFileExtension(null)).toBe('.mp3');
});

test('isAudioMessage should identify audio messages', () => {
    const audioMessage = {
        message: {
            audioMessage: {
                mimetype: 'audio/mpeg',
                ptt: false
            }
        }
    };
    
    const pttMessage = {
        message: {
            audioMessage: {
                mimetype: 'audio/mpeg',
                ptt: true
            }
        }
    };
    
    const documentMessage = {
        message: {
            documentMessage: {
                mimetype: 'audio/mpeg',
                fileName: 'song.mp3'
            }
        }
    };
    
    const nonAudioMessage = {
        message: {
            textMessage: {
                text: 'Hello'
            }
        }
    };
    
    expect(mediaService.isAudioMessage(audioMessage)).toBe(true);
    expect(mediaService.isAudioMessage(pttMessage)).toBe(false); // PTT rejected
    expect(mediaService.isAudioMessage(documentMessage)).toBe(true);
    expect(mediaService.isAudioMessage(nonAudioMessage)).toBe(false);
});

test('isAudioMessage should handle null/undefined messages', () => {
    expect(mediaService.isAudioMessage(null)).toBe(false);
    expect(mediaService.isAudioMessage(undefined)).toBe(false);
    expect(mediaService.isAudioMessage({})).toBe(false);
    expect(mediaService.isAudioMessage({ message: null })).toBe(false);
});

// Note: Full testing of downloadMedia requires mocking Baileys functions, fs, and config
// which is complex in Bun. The above tests cover MIME type validation and message detection.
// Integration tests would test the actual download functionality.

