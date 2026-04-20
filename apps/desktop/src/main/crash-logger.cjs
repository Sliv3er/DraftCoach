// Crash Logger — Basic file logger with uncaughtException handler.
// Logs to userData/logs/ directory with rotation.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_LOG_FILES = 5;

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogPath() {
    return path.join(LOG_DIR, 'draftcoach.log');
}

function rotateIfNeeded() {
    const logPath = getLogPath();
    if (!fs.existsSync(logPath)) return;

    const stats = fs.statSync(logPath);
    if (stats.size < MAX_LOG_SIZE) return;

    // Rotate: draftcoach.log → draftcoach.1.log → draftcoach.2.log ...
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const src = path.join(LOG_DIR, `draftcoach.${i}.log`);
        const dst = path.join(LOG_DIR, `draftcoach.${i + 1}.log`);
        if (fs.existsSync(src)) {
            if (i + 1 >= MAX_LOG_FILES) {
                fs.unlinkSync(src);
            } else {
                fs.renameSync(src, dst);
            }
        }
    }
    fs.renameSync(logPath, path.join(LOG_DIR, 'draftcoach.1.log'));
}

function log(level, message, ...args) {
    ensureLogDir();
    rotateIfNeeded();

    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [${level}] ${message} ${args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a)
    ).join(' ')}\n`;

    fs.appendFileSync(getLogPath(), formatted, 'utf-8');

    // Also log to console
    if (level === 'ERROR') console.error(formatted.trim());
    else console.log(formatted.trim());
}

function setupCrashHandlers() {
    ensureLogDir();

    process.on('uncaughtException', (err) => {
        log('FATAL', 'Uncaught exception:', err.stack || err.message);
        // Don't exit immediately — give time to write
        setTimeout(() => process.exit(1), 1000);
    });

    process.on('unhandledRejection', (reason) => {
        log('ERROR', 'Unhandled rejection:', String(reason));
    });

    // Log app lifecycle
    log('INFO', `DraftCoach v${app.getVersion()} starting`);
    log('INFO', `Platform: ${process.platform}, Electron: ${process.versions.electron}`);

    app.on('will-quit', () => {
        log('INFO', 'DraftCoach shutting down');
    });
}

module.exports = { log, setupCrashHandlers, LOG_DIR };
