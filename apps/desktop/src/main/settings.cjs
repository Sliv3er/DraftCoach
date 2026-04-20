// Settings Storage — Persistent user preferences.
// Stored in userData as JSON file.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

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

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            return { ...DEFAULT_SETTINGS, ...data };
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
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
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

module.exports = { loadSettings, saveSettings, getSetting, setSetting, DEFAULT_SETTINGS, SETTINGS_FILE };
