/**
 * Configuration Constants
 * Application-wide constants and configuration values
 */

const API_URL = '/api/queue';

// VIP Admin Password (change this to your desired password)
const VIP_ADMIN_PASSWORD = 'wabisaby2025';
const VIP_UNLOCK_KEY = 'vip_area_unlocked';
const VIP_INACTIVITY_TIMEOUT = 120000; // 2 minutes of inactivity

// Visualizer Configuration
const BAR_COUNT = 64;
const LERP_SPEED = 0.15;  // How fast bars transition (0-1, higher = faster)
const LERP_SPEED_DOWN = 0.1;
const INTENSITY_DECAY = 0.95;
const AUDIO_STALE_MS = 1500;

// Audio Playback
const MAX_PLAYBACK_RETRIES = 3;

// Quality values for settings
const qualityValues = ['64k', '128k', '192k', '256k', '320k'];

