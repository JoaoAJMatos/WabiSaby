const { logger } = require('../utils/logger.util');
const dbService = require('../database/db.service');
const EventEmitter = require('events');

/**
 * Effects Service
 * Manages audio effects settings for ffplay playback
 */

class EffectsService extends EventEmitter {
    constructor() {
        super();
        this.effects = this.getDefaultEffects();
        this.presets = this.getPresets();
        this.clients = new Set(); // SSE clients for real-time updates
        this.load();
    }

    /**
     * Get default effects configuration
     */
    getDefaultEffects() {
        return {
            enabled: true,
            speed: 1.0,
            pitch: 1.0, // Pitch correction when speed changes
            eq: {
                bass: 0,    // -20 to +20 dB
                mid: 0,
                treble: 0
            },
            reverb: {
                enabled: false,
                roomSize: 0.5,
                damping: 0.5,
                wetLevel: 0.3
            },
            echo: {
                enabled: false,
                delay: 300,   // ms
                decay: 0.4
            },
            delay: {
                enabled: false,
                delay: 500,   // ms
                feedback: 0.3
            },
            distortion: {
                enabled: false,
                drive: 0.5
            },
            compressor: {
                enabled: false,
                threshold: -20,
                ratio: 4
            },
            limiter: {
                enabled: false,
                limit: -1
            },
            preset: 'normal'
        };
    }

    /**
     * Get available presets with their configurations
     */
    getPresets() {
        return {
            normal: {
                name: 'Normal',
                icon: 'fa-circle',
                description: 'No effects applied',
                settings: this.getDefaultEffects()
            },
            slowed: {
                name: 'Slowed',
                icon: 'fa-hourglass-half',
                description: 'Slowed down playback',
                settings: {
                    ...this.getDefaultEffects(),
                    speed: 0.85,
                    preset: 'slowed'
                }
            },
            slowedReverb: {
                name: 'Slowed + Reverb',
                icon: 'fa-water',
                description: 'Classic slowed with reverb effect',
                settings: {
                    ...this.getDefaultEffects(),
                    speed: 0.85,
                    reverb: { enabled: true, roomSize: 0.75, damping: 0.45, wetLevel: 0.45 },
                    eq: { bass: 2, mid: 0, treble: 1 },
                    preset: 'slowedReverb'
                }
            },
            speedUp: {
                name: 'Sped Up',
                icon: 'fa-forward',
                description: 'Faster playback',
                settings: {
                    ...this.getDefaultEffects(),
                    speed: 1.25,
                    preset: 'speedUp'
                }
            },
            nightcore: {
                name: 'Nightcore',
                icon: 'fa-moon',
                description: 'Fast with higher pitch',
                settings: {
                    ...this.getDefaultEffects(),
                    speed: 1.25,
                    pitch: 1.2,
                    eq: { bass: 1, mid: 1, treble: 5 },
                    compressor: { enabled: true, threshold: -18, ratio: 3 },
                    preset: 'nightcore'
                }
            },
            bassBoost: {
                name: 'Bass Boost',
                icon: 'fa-volume-up',
                description: 'Enhanced bass frequencies',
                settings: {
                    ...this.getDefaultEffects(),
                    eq: { bass: 8, mid: -1, treble: 1 },
                    compressor: { enabled: true, threshold: -16, ratio: 4 },
                    limiter: { enabled: true, limit: -0.5 },
                    preset: 'bassBoost'
                }
            },
            bathroom: {
                name: 'Bathroom',
                icon: 'fa-bath',
                description: 'Echoing bathroom effect',
                settings: {
                    ...this.getDefaultEffects(),
                    reverb: { enabled: true, roomSize: 0.85, damping: 0.25, wetLevel: 0.55 },
                    echo: { enabled: true, delay: 120, decay: 0.35 },
                    eq: { bass: -4, mid: 3, treble: -3 },
                    preset: 'bathroom'
                }
            },
            concert: {
                name: 'Concert Hall',
                icon: 'fa-building',
                description: 'Large venue reverb',
                settings: {
                    ...this.getDefaultEffects(),
                    reverb: { enabled: true, roomSize: 0.92, damping: 0.35, wetLevel: 0.4 },
                    eq: { bass: 3, mid: 2, treble: 3 },
                    compressor: { enabled: true, threshold: -20, ratio: 3 },
                    preset: 'concert'
                }
            },
            telephone: {
                name: 'Telephone',
                icon: 'fa-phone',
                description: 'Old phone effect',
                settings: {
                    ...this.getDefaultEffects(),
                    eq: { bass: -18, mid: 6, treble: -12 },
                    distortion: { enabled: true, drive: 0.25 },
                    compressor: { enabled: true, threshold: -12, ratio: 2 },
                    preset: 'telephone'
                }
            },
            underwater: {
                name: 'Underwater',
                icon: 'fa-fish',
                description: 'Muffled underwater sound',
                settings: {
                    ...this.getDefaultEffects(),
                    eq: { bass: 4, mid: -6, treble: -18 },
                    reverb: { enabled: true, roomSize: 0.75, damping: 0.75, wetLevel: 0.45 },
                    speed: 0.92,
                    preset: 'underwater'
                }
            },
            vocal: {
                name: 'Vocal Boost',
                icon: 'fa-microphone',
                description: 'Enhanced vocals',
                settings: {
                    ...this.getDefaultEffects(),
                    eq: { bass: -3, mid: 6, treble: 3 },
                    compressor: { enabled: true, threshold: -14, ratio: 4 },
                    preset: 'vocal'
                }
            },
            lofi: {
                name: 'Lo-Fi',
                icon: 'fa-compact-disc',
                description: 'Warm lo-fi aesthetic',
                settings: {
                    ...this.getDefaultEffects(),
                    speed: 0.92,
                    eq: { bass: 5, mid: -3, treble: -6 },
                    distortion: { enabled: true, drive: 0.18 },
                    reverb: { enabled: true, roomSize: 0.35, damping: 0.65, wetLevel: 0.25 },
                    preset: 'lofi'
                }
            },
            '8d': {
                name: '8D Audio',
                icon: 'fa-headphones',
                description: 'Surround sound effect',
                settings: {
                    ...this.getDefaultEffects(),
                    reverb: { enabled: true, roomSize: 0.65, damping: 0.45, wetLevel: 0.35 },
                    delay: { enabled: true, delay: 60, feedback: 0.25 },
                    eq: { bass: 1, mid: 0, treble: 2 },
                    preset: '8d'
                }
            },
            custom: {
                name: 'Custom',
                icon: 'fa-sliders-h',
                description: 'Customized effects',
                settings: {
                    ...this.getDefaultEffects(),
                    preset: 'custom'
                }
            }
        };
    }

    /**
     * Load effects from database
     */
    load() {
        try {
            const loaded = dbService.getEffects();
            // Merge with defaults to ensure all fields exist
            this.effects = this.mergeWithDefaults(loaded);
            
            // Validate preset exists, reset to default if invalid
            // Allow 'custom' as a special preset state (set when effects are manually tweaked)
            if (this.effects.preset && this.effects.preset !== 'custom' && !this.presets[this.effects.preset]) {
                logger.warn(`Invalid preset "${this.effects.preset}" found in database, resetting to default`);
                this.effects.preset = 'normal';
                this.effects = this.mergeWithDefaults(this.effects);
            }
            
            logger.info('Effects settings loaded from database');
        } catch (err) {
            logger.error('Failed to load effects settings:', err);
            this.effects = this.getDefaultEffects();
        }
    }

    /**
     * Merge loaded settings with defaults to handle missing fields
     */
    mergeWithDefaults(loaded) {
        const defaults = this.getDefaultEffects();
        return {
            ...defaults,
            ...loaded,
            eq: { ...defaults.eq, ...loaded.eq },
            reverb: { ...defaults.reverb, ...loaded.reverb },
            echo: { ...defaults.echo, ...loaded.echo },
            delay: { ...defaults.delay, ...loaded.delay },
            distortion: { ...defaults.distortion, ...loaded.distortion },
            compressor: { ...defaults.compressor, ...loaded.compressor },
            limiter: { ...defaults.limiter, ...loaded.limiter }
        };
    }

    /**
     * Save effects to database
     */
    save() {
        try {
            dbService.updateEffects(this.effects);
            logger.info('Effects settings saved to database');
        } catch (err) {
            logger.error('Failed to save effects settings:', err);
        }
    }

    /**
     * Get current effects settings
     */
    getEffects() {
        return { ...this.effects };
    }

    /**
     * Get all available presets
     */
    getPresetsInfo() {
        return Object.entries(this.presets).map(([key, preset]) => ({
            id: key,
            name: preset.name,
            icon: preset.icon,
            description: preset.description
        }));
    }

    /**
     * Update effects settings
     */
    updateEffects(newSettings) {
        this.effects = this.mergeWithDefaults({ ...this.effects, ...newSettings });
        this.effects.preset = 'custom'; // Mark as custom when manually changed
        this.save();
        this.emit('effects_changed', this.effects);
        this.broadcastToClients(this.effects);
        return this.effects;
    }

    /**
     * Apply a preset
     */
    applyPreset(presetId) {
        const preset = this.presets[presetId];
        if (!preset) {
            throw new Error(`Unknown preset: ${presetId}`);
        }
        this.effects = { ...preset.settings };
        this.save();
        this.emit('effects_changed', this.effects);
        this.broadcastToClients(this.effects);
        return this.effects;
    }

    /**
     * Reset to default effects
     */
    reset() {
        this.effects = this.getDefaultEffects();
        this.save();
        this.emit('effects_changed', this.effects);
        this.broadcastToClients(this.effects);
        return this.effects;
    }

    /**
     * Build FFmpeg filter chain from current effects
     * @returns {string} Filter chain string for -af parameter
     */
    buildFilterChain() {
        const filters = [];
        
        // Check for volume normalization first (works independently of effects)
        try {
            const playbackController = require('../core/playback.controller');
            const current = playbackController.getCurrent();
            
            if (current?.songId) {
                const volumeNormalization = require('./volume-normalization.service');
                const settings = volumeNormalization.getNormalizationSettings();
                
                if (settings.enabled) {
                    const gainDb = volumeNormalization.getSongGain(current.songId);
                    if (gainDb !== 0) {
                        // Convert dB to linear gain: gain = 10^(dB/20)
                        const linearGain = Math.pow(10, gainDb / 20);
                        filters.push(`volume=${linearGain.toFixed(6)}`);
                        logger.debug(`Applied volume normalization: ${gainDb.toFixed(2)} dB (${linearGain.toFixed(3)}x)`);
                    }
                }
            }
        } catch (err) {
            // If playback controller or normalization service not available, skip
            logger.debug('Could not apply volume normalization:', err.message);
        }
        
        // If effects are disabled, apply volume and return early
        if (!this.effects.enabled) {
            // Apply manual volume control even when effects are disabled
            try {
                const player = require('../core/player');
                const volume = player.getVolume();
                if (volume !== 100) {
                    const volumeMultiplier = volume / 100;
                    filters.push(`volume=${volumeMultiplier}`);
                }
            } catch (err) {
                logger.debug('Could not get volume from player module:', err.message);
            }
            const chain = filters.join(',');
            return chain;
        }

        // Speed/Tempo adjustment using atempo (supports 0.5-2.0)
        if (this.effects.speed !== 1.0) {
            // atempo only supports 0.5-2.0, so chain multiple if needed
            let speed = this.effects.speed;
            while (speed < 0.5) {
                filters.push('atempo=0.5');
                speed = speed / 0.5;
            }
            while (speed > 2.0) {
                filters.push('atempo=2.0');
                speed = speed / 2.0;
            }
            if (speed !== 1.0) {
                filters.push(`atempo=${speed.toFixed(3)}`);
            }
        }

        // Pitch adjustment using asetrate + aresample (for nightcore effect)
        if (this.effects.pitch && this.effects.pitch !== 1.0) {
            const sampleRate = 44100;
            const newRate = Math.round(sampleRate * this.effects.pitch);
            filters.push(`asetrate=${newRate}`);
            filters.push(`aresample=${sampleRate}`);
        }

        // EQ using bass/treble filters (widely supported in ffmpeg)
        const eq = this.effects.eq;
        if (eq.bass !== 0) {
            filters.push(`bass=g=${eq.bass}:f=100:w=0.5`);
        }
        if (eq.treble !== 0) {
            filters.push(`treble=g=${eq.treble}:f=3000:w=0.5`);
        }
        // Mid requires equalizer filter
        if (eq.mid !== 0) {
            filters.push(`equalizer=f=1000:t=h:w=1000:g=${eq.mid}`);
        }

        // Reverb simulation using aecho (multiple reflections for room feel)
        if (this.effects.reverb?.enabled) {
            const rev = this.effects.reverb;
            const baseDelay = Math.round(20 + 80 * rev.roomSize);
            const decayVal = 0.3 + rev.wetLevel * 0.4;
            // Multi-tap echo for reverb simulation
            filters.push(`aecho=0.8:0.8:${baseDelay}|${baseDelay*2}|${baseDelay*3}:${decayVal.toFixed(2)}|${(decayVal*0.7).toFixed(2)}|${(decayVal*0.5).toFixed(2)}`);
        }

        // Echo effect
        if (this.effects.echo?.enabled) {
            const echo = this.effects.echo;
            filters.push(`aecho=0.8:0.9:${echo.delay}:${echo.decay.toFixed(2)}`);
        }

        // Distortion using overdrive or acrusher
        if (this.effects.distortion?.enabled) {
            const dist = this.effects.distortion;
            // Use a combination of volume boost and soft clipping
            const gain = 1 + dist.drive * 10;
            filters.push(`volume=${gain}`);
            filters.push(`alimiter=limit=0.9:attack=0.1:release=10`);
        }

        // Compressor - threshold is in dB, convert to linear (0-1)
        if (this.effects.compressor?.enabled) {
            const comp = this.effects.compressor;
            // Convert dB to linear: 10^(dB/20)
            const thresholdLinear = Math.pow(10, comp.threshold / 20);
            filters.push(`acompressor=threshold=${thresholdLinear.toFixed(4)}:ratio=${comp.ratio}:attack=5:release=50`);
        }

        // Apply manual volume control (always applied, even with effects enabled)
        try {
            const player = require('../core/player');
            const volume = player.getVolume();
            if (volume !== 100) {
                // FFmpeg volume filter: volume=0.5 means 50% (0.0 to 1.0)
                const volumeMultiplier = volume / 100;
                filters.push(`volume=${volumeMultiplier}`);
            }
        } catch (err) {
            // If player module not available, skip volume filter
            logger.debug('Could not get volume from player module:', err.message);
        }

        const chain = filters.join(',');
        return chain;
    }

    /**
     * Validate effects settings
     */
    validate(settings) {
        const errors = [];

        if (settings.speed !== undefined) {
            if (settings.speed < 0.25 || settings.speed > 3.0) {
                errors.push('Speed must be between 0.25 and 3.0');
            }
        }

        if (settings.eq) {
            ['bass', 'mid', 'treble'].forEach(band => {
                if (settings.eq[band] !== undefined) {
                    if (settings.eq[band] < -20 || settings.eq[band] > 20) {
                        errors.push(`EQ ${band} must be between -20 and +20 dB`);
                    }
                }
            });
        }

        return errors;
    }

    /**
     * Add SSE client
     */
    addClient(client) {
        this.clients.add(client);
    }

    /**
     * Remove SSE client
     */
    removeClient(client) {
        this.clients.delete(client);
    }

    /**
     * Broadcast effects update to all SSE clients
     */
    broadcastToClients(effectsData) {
        const data = JSON.stringify({
            type: 'EFFECTS_UPDATE',
            effects: effectsData,
            presets: this.getPresetsInfo()
        });
        this.clients.forEach(client => {
            try {
                client.write(`data: ${data}\n\n`);
            } catch (err) {
                // Client disconnected, remove it
                this.clients.delete(client);
            }
        });
    }
}

// Export singleton
const effectsService = new EffectsService();
module.exports = effectsService;

