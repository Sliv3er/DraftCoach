// Settings Storage — Persistent user preferences.
// Stored in userData as JSON file.
// SECURITY: Sensitive fields (API keys, tokens) are encrypted using
// Electron's safeStorage (backed by OS keychain / DPAPI on Windows).

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

// Fields that contain secrets and MUST be encrypted on disk.
// These are stored as { __encrypted: true, data: "<base64>" } in the JSON.
const SENSITIVE_KEYS = new Set([
    'geminiApiKey',
    'riotApiKey',
]);

const DEFAULT_SETTINGS = {
    theme: 'dark',
    preferredVariant: 'auto',     // 'auto' | 'DAMAGE' | 'SAFETY' | 'UTILITY'
    lolPath: null,                // custom League of Legends install path
    llmEnhancerEnabled: true,
    geminiModel: 'gemini-3-flash-preview',  // base model setting
    generationMode: 'flash',     // 'hybrid' (Flash+Pro) or 'flash' (Flash only for speed)
    autoExportRunes: false,
    autoExportItemSet: false,
    lcuAutoConnect: true,
    showConfidence: true,
    showThreatTimers: true,
    autoOpenScout: true,          // auto-open scout window when loading screen
    autoOpenScoreboard: true,     // auto-open scoreboard when game starts
    autoOpenStats: true,          // auto-open stats window after game ends
    overlayOpacity: 0.9,          // overlay opacity (0.1 - 1.0)
    overlayScale: 1.0,            // overlay UI scale (0.5 - 2.0)
    overlayPosition: null,        // { x, y } — saved drag position, null = default
    windowBounds: null,           // { x, y, width, height }
    // Configurable hotkeys — Electron accelerator format
    hotkeyToggleOverlay: 'CommandOrControl+Alt+O',
    hotkeyHideOverlay: 'CommandOrControl+Alt+H',
    hotkeyFocusMain: 'CommandOrControl+Alt+B',
    hotkeyRegenerate: 'CommandOrControl+Alt+G',
    // Minimap Calibration
    autoMinimapCalibration: true,
    minimapSize: 250,             // px
    minimapPosition: 'bottom-right', // 'bottom-right' | 'bottom-left'
    // Network / Ping Monitor
    serverRegion: 'EUW1',             // Riot server region for ping monitor
};

/**
 * Encrypt a string using Electron's safeStorage (OS keychain / DPAPI).
 * Falls back to plain text if safeStorage is unavailable (e.g. CI, Linux without keyring).
 */
function encryptValue(plainText) {
    if (!plainText || typeof plainText !== 'string') return plainText;
    try {
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(plainText);
            return { __encrypted: true, data: encrypted.toString('base64') };
        }
    } catch (err) {
        console.warn('[settings] safeStorage encryption failed, storing as-is:', err.message);
    }
    // Fallback: store plain (better than crashing — but log a warning)
    return plainText;
}

/**
 * Decrypt a value that was encrypted by encryptValue().
 * Handles both encrypted objects and plain-text fallback values.
 */
function decryptValue(stored) {
    if (!stored) return stored;
    // If it's an encrypted object, decrypt it
    if (typeof stored === 'object' && stored.__encrypted && stored.data) {
        try {
            if (safeStorage && safeStorage.isEncryptionAvailable()) {
                const buffer = Buffer.from(stored.data, 'base64');
                return safeStorage.decryptString(buffer);
            }
        } catch (err) {
            console.warn('[settings] safeStorage decryption failed:', err.message);
            return null; // Can't decrypt — user will need to re-enter
        }
    }
    // Plain text fallback (legacy or safeStorage unavailable)
    if (typeof stored === 'string') return stored;
    return null;
}

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            const settings = { ...DEFAULT_SETTINGS };
            for (const [key, value] of Object.entries(raw)) {
                if (SENSITIVE_KEYS.has(key)) {
                    // Decrypt sensitive fields
                    settings[key] = decryptValue(value);
                } else {
                    settings[key] = value;
                }
            }
            return settings;
        }
    } catch (err) {
        console.error('[settings] Error loading settings:', err.message);
    }
    return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
    try {
        const dir = path.dirname(SETTINGS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Deep-clone so we don't mutate the original object
        const toWrite = { ...settings };
        for (const key of SENSITIVE_KEYS) {
            if (toWrite[key] && typeof toWrite[key] === 'string') {
                toWrite[key] = encryptValue(toWrite[key]);
            }
        }

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toWrite, null, 2), 'utf-8');
    } catch (err) {
        console.error('[settings] Error saving settings:', err.message);
    }
}

function getSetting(key) {
    const settings = loadSettings();
    return settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
}

function setSetting(key, value) {
    const settings = loadSettings();
    settings[key] = value;
    saveSettings(settings);
}

module.exports = { loadSettings, saveSettings, getSetting, setSetting, DEFAULT_SETTINGS, SETTINGS_FILE, SENSITIVE_KEYS };
