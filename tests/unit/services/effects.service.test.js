/**
 * Effects Service Tests
 * Tests for audio effects management
 */

const { test, expect, beforeEach } = require('bun:test');
const { initializeDatabase, getDatabase } = require('../../../src/database/index');
const dbService = require('../../../src/database/db.service');
const effectsService = require('../../../src/services/effects.service');

beforeEach(() => {
    // Initialize database
    try {
        initializeDatabase();
    } catch (e) {
        // Database might already be initialized
    }
    
    // Reset effects to defaults
    effectsService.reset();
});

test('getDefaultEffects should return default effects configuration', () => {
    const defaults = effectsService.getDefaultEffects();
    
    expect(defaults.enabled).toBe(true);
    expect(defaults.speed).toBe(1.0);
    expect(defaults.pitch).toBe(1.0);
    expect(defaults.preset).toBe('normal');
    expect(defaults.eq.bass).toBe(0);
    expect(defaults.eq.mid).toBe(0);
    expect(defaults.eq.treble).toBe(0);
    expect(defaults.reverb.enabled).toBe(false);
    expect(defaults.echo.enabled).toBe(false);
    expect(defaults.delay.enabled).toBe(false);
    expect(defaults.distortion.enabled).toBe(false);
    expect(defaults.compressor.enabled).toBe(false);
    expect(defaults.limiter.enabled).toBe(false);
});

test('getPresets should return all available presets', () => {
    const presets = effectsService.getPresetsInfo();
    
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThan(0);
    
    // Check that presets have required fields
    presets.forEach(preset => {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('icon');
        expect(preset).toHaveProperty('description');
    });
    
    // Check for some known presets
    const presetIds = presets.map(p => p.id);
    expect(presetIds).toContain('normal');
    expect(presetIds).toContain('slowed');
    expect(presetIds).toContain('bassBoost');
});

test('getEffects should return current effects settings', () => {
    const effects = effectsService.getEffects();
    
    expect(effects).toBeDefined();
    expect(effects.enabled).toBeDefined();
    expect(effects.speed).toBeDefined();
    expect(effects.eq).toBeDefined();
    expect(effects.reverb).toBeDefined();
});

test('getEffects should return a copy, not the original object', () => {
    const effects1 = effectsService.getEffects();
    const effects2 = effectsService.getEffects();
    
    expect(effects1).not.toBe(effects2);
    effects1.speed = 2.0;
    expect(effects2.speed).not.toBe(2.0);
});

test('load should load effects from database', () => {
    // Save some effects to database
    const customEffects = {
        speed: 1.5,
        eq: { bass: 10, mid: 0, treble: 5 }
    };
    dbService.updateEffects(customEffects);
    
    // Reload
    effectsService.load();
    
    const effects = effectsService.getEffects();
    expect(effects.speed).toBe(1.5);
    expect(effects.eq.bass).toBe(10);
    expect(effects.eq.treble).toBe(5);
});

test('load should use defaults when database returns empty/null', () => {
    // Clear effects in database
    const db = getDatabase();
    db.exec('DELETE FROM settings WHERE key = "effects";');
    
    effectsService.load();
    
    const effects = effectsService.getEffects();
    expect(effects.speed).toBe(1.0);
    expect(effects.preset).toBe('normal');
});

test('load should handle database errors gracefully', () => {
    // Should not throw even if database fails
    expect(() => {
        effectsService.load();
    }).not.toThrow();
});

test('save should persist effects to database', () => {
    effectsService.updateEffects({ speed: 1.25 });
    
    // Check database
    const saved = dbService.getEffects();
    expect(saved.speed).toBe(1.25);
});

test('updateEffects should update effects and mark as custom', () => {
    const newSettings = {
        speed: 1.5,
        eq: { bass: 5 }
    };
    
    const updated = effectsService.updateEffects(newSettings);
    
    expect(updated.speed).toBe(1.5);
    expect(updated.eq.bass).toBe(5);
    expect(updated.preset).toBe('custom');
});

test('updateEffects should merge with existing effects', () => {
    effectsService.updateEffects({ speed: 1.5 });
    effectsService.updateEffects({ eq: { bass: 10 } });
    
    const effects = effectsService.getEffects();
    expect(effects.speed).toBe(1.5);
    expect(effects.eq.bass).toBe(10);
    expect(effects.eq.mid).toBe(0); // Should keep default
});

test('updateEffects should emit effects_changed event', (done) => {
    effectsService.once('effects_changed', (effects) => {
        expect(effects.speed).toBe(1.5);
        done();
    });
    
    effectsService.updateEffects({ speed: 1.5 });
});

test('applyPreset should apply preset settings', () => {
    const effects = effectsService.applyPreset('slowed');
    
    expect(effects.speed).toBe(0.85);
    expect(effects.preset).toBe('slowed');
});

test('applyPreset should throw for unknown preset', () => {
    expect(() => {
        effectsService.applyPreset('unknownPreset');
    }).toThrow('Unknown preset');
});

test('applyPreset should emit effects_changed event', (done) => {
    effectsService.once('effects_changed', (effects) => {
        expect(effects.preset).toBe('bassBoost');
        done();
    });
    
    effectsService.applyPreset('bassBoost');
});

test('reset should restore default effects', () => {
    effectsService.updateEffects({ speed: 1.5, eq: { bass: 10 } });
    
    const reset = effectsService.reset();
    
    expect(reset.speed).toBe(1.0);
    expect(reset.eq.bass).toBe(0);
    expect(reset.preset).toBe('normal');
});

test('reset should emit effects_changed event', (done) => {
    effectsService.once('effects_changed', (effects) => {
        expect(effects.preset).toBe('normal');
        done();
    });
    
    effectsService.reset();
});

test('buildFilterChain should return empty string when effects disabled', () => {
    effectsService.updateEffects({ enabled: false, speed: 1.5 });
    
    const chain = effectsService.buildFilterChain();
    expect(chain).toBe('');
});

test('buildFilterChain should build speed filter', () => {
    effectsService.updateEffects({ enabled: true, speed: 0.85 });
    
    const chain = effectsService.buildFilterChain();
    expect(chain).toContain('atempo');
});

test('buildFilterChain should build pitch filter', () => {
    effectsService.updateEffects({ enabled: true, pitch: 1.2 });
    
    const chain = effectsService.buildFilterChain();
    expect(chain).toContain('asetrate');
    expect(chain).toContain('aresample');
});

test('buildFilterChain should build EQ filters', () => {
    effectsService.updateEffects({
        enabled: true,
        eq: { bass: 10, mid: 5, treble: -5 }
    });
    
    const chain = effectsService.buildFilterChain();
    expect(chain).toContain('bass=');
    expect(chain).toContain('treble=');
    expect(chain).toContain('equalizer=');
});

test('buildFilterChain should build reverb filter when enabled', () => {
    effectsService.updateEffects({
        enabled: true,
        reverb: { enabled: true, roomSize: 0.7, damping: 0.5, wetLevel: 0.4 }
    });
    
    const chain = effectsService.buildFilterChain();
    expect(chain).toContain('aecho');
});

test('buildFilterChain should build echo filter when enabled', () => {
    effectsService.updateEffects({
        enabled: true,
        echo: { enabled: true, delay: 300, decay: 0.4 }
    });
    
    const chain = effectsService.buildFilterChain();
    expect(chain).toContain('aecho');
});

test('buildFilterChain should build distortion filter when enabled', () => {
    effectsService.updateEffects({
        enabled: true,
        distortion: { enabled: true, drive: 0.5 }
    });
    
    const chain = effectsService.buildFilterChain();
    expect(chain).toContain('volume=');
    expect(chain).toContain('alimiter');
});

test('buildFilterChain should build compressor filter when enabled', () => {
    effectsService.updateEffects({
        enabled: true,
        compressor: { enabled: true, threshold: -20, ratio: 4 }
    });
    
    const chain = effectsService.buildFilterChain();
    expect(chain).toContain('acompressor');
});

test('buildFilterChain should handle multiple atempo filters for extreme speeds', () => {
    effectsService.updateEffects({ enabled: true, speed: 0.3 }); // Very slow
    
    const chain = effectsService.buildFilterChain();
    const atempoCount = (chain.match(/atempo/g) || []).length;
    expect(atempoCount).toBeGreaterThan(1);
});

test('validate should return empty array for valid settings', () => {
    const errors = effectsService.validate({
        speed: 1.0,
        eq: { bass: 0, mid: 0, treble: 0 }
    });
    
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBe(0);
});

test('validate should detect invalid speed', () => {
    const errors1 = effectsService.validate({ speed: 0.1 });
    expect(errors1.length).toBeGreaterThan(0);
    expect(errors1[0]).toContain('Speed');
    
    const errors2 = effectsService.validate({ speed: 5.0 });
    expect(errors2.length).toBeGreaterThan(0);
});

test('validate should detect invalid EQ values', () => {
    const errors1 = effectsService.validate({
        eq: { bass: -25 }
    });
    expect(errors1.length).toBeGreaterThan(0);
    expect(errors1[0]).toContain('EQ');
    
    const errors2 = effectsService.validate({
        eq: { treble: 25 }
    });
    expect(errors2.length).toBeGreaterThan(0);
});

test('mergeWithDefaults should merge partial effects correctly', () => {
    const partial = {
        speed: 1.5,
        eq: { bass: 10 }
    };
    
    // Access private method through load which uses mergeWithDefaults
    effectsService.updateEffects(partial);
    const effects = effectsService.getEffects();
    
    expect(effects.speed).toBe(1.5);
    expect(effects.eq.bass).toBe(10);
    expect(effects.eq.mid).toBe(0); // Should keep default
    expect(effects.eq.treble).toBe(0); // Should keep default
    expect(effects.reverb.enabled).toBe(false); // Should keep default
});

test('getPresetsInfo should return preset metadata', () => {
    const presets = effectsService.getPresetsInfo();
    
    const slowed = presets.find(p => p.id === 'slowed');
    expect(slowed).toBeDefined();
    expect(slowed.name).toBe('Slowed');
    expect(slowed.icon).toBeDefined();
    expect(slowed.description).toBeDefined();
});

