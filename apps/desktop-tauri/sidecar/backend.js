/**
 * DraftCoach Backend Sidecar — Full Backend
 * 
 * This wraps the ORIGINAL main.js backend by shimming Electron-specific APIs.
 * It runs as a standalone Node.js process (Tauri sidecar).
 * 
 * Strategy:
 * 1. Create minimal shims for Electron's `app`, `ipcMain`, `BrowserWindow`, etc.
 * 2. Load the original main.js which starts the Express server on :3210
 * 3. Capture IPC handler registrations and expose them via HTTP
 * 4. Use SSE to push events (live-advice, scout-report, etc.) to the frontend
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const EventEmitter = require('events');

// ── Config ──
const RESOURCE_DIR = process.env.DRAFTCOACH_RESOURCE_DIR || path.resolve(__dirname, '..', '..');
const userData = process.env.APPDATA 
  ? path.join(process.env.APPDATA, 'DraftCoach')
  : path.join(require('os').homedir(), '.draftcoach');

// Ensure userData dir exists
if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });

// ── SSE Event Bus ──
// Frontend connects to /api/events to receive push notifications
const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

// ── IPC Handler Registry ──
// When main.js calls ipcMain.handle('channel', fn), we capture it here
const ipcHandlers = {};   // channel → async function
const ipcListeners = {};  // channel → function (for ipcMain.on)

// ── Electron API Shims ──

// Fake BrowserWindow that captures webContents.send() calls
function createFakeWindow(label) {
  const webContents = {
    send: (channel, ...args) => {
      // Broadcast to SSE clients
      eventBus.emit('ipc-event', { channel, args, target: label });
    },
    on: () => {},
    session: { clearCache: () => Promise.resolve() },
    openDevTools: () => {},
  };
  return {
    _label: label,
    _destroyed: false,
    webContents,
    isDestroyed: () => false,
    isVisible: () => true,
    isFocused: () => false,
    isMinimized: () => false,
    show: () => {},
    showInactive: () => {},
    hide: () => {},
    focus: () => {},
    minimize: () => {},
    maximize: () => {},
    restore: () => {},
    close: () => { },
    setAlwaysOnTop: () => {},
    setIgnoreMouseEvents: () => {},
    setPosition: () => {},
    setSize: () => {},
    setBounds: () => {},
    getPosition: () => [0, 0],
    getSize: () => [800, 600],
    getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    on: () => {},
    once: () => {},
    loadURL: () => {},
    loadFile: () => {},
  };
}

// Fake mainWindow, overlayWindow, etc. — main.js references these globals
const fakeMainWindow = createFakeWindow('main');
const fakeOverlayWindow = createFakeWindow('overlay');
const fakeScoutWindow = createFakeWindow('scout');
const fakeStatsWindow = createFakeWindow('stats');
const fakeScoreboardWindow = createFakeWindow('scoreboard');
const fakeTrackerWindow = createFakeWindow('tracker');

// Shim: electron module
const electronShim = {
  app: {
    getPath: (name) => {
      switch (name) {
        case 'userData': return userData;
        case 'temp': return require('os').tmpdir();
        case 'exe': return process.execPath;
        case 'home': return require('os').homedir();
        default: return userData;
      }
    },
    isPackaged: true,
    on: () => {},
    quit: () => process.exit(0),
    getName: () => 'DraftCoach',
    getVersion: () => '1.1.0',
  },
  BrowserWindow: class FakeBrowserWindow {
    constructor() { return createFakeWindow('dynamic'); }
    static getAllWindows() { return []; }
  },
  ipcMain: {
    handle: (channel, handler) => {
      ipcHandlers[channel] = handler;
    },
    on: (channel, handler) => {
      ipcListeners[channel] = handler;
    },
  },
  Menu: { setApplicationMenu: () => {} },
  globalShortcut: {
    register: () => true,
    unregister: () => {},
    unregisterAll: () => {},
  },
  screen: {
    getPrimaryDisplay: () => ({
      bounds: { width: 1920, height: 1080 },
      workArea: { width: 1920, height: 1040 },
    }),
  },
};

// ── Module Shim Injection ──
// Override require() to intercept Electron imports
const Module = require('module');

// Ensure sidecar's node_modules is in the module resolution path
// so main.cjs (loaded from a different directory) can find express, cors, etc.
const sidecarNodeModules = path.join(__dirname, 'node_modules');
if (fs.existsSync(sidecarNodeModules)) {
  if (!Module.globalPaths.includes(sidecarNodeModules)) {
    Module.globalPaths.push(sidecarNodeModules);
  }
  // Also set NODE_PATH so child processes inherit
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${process.env.NODE_PATH}${path.delimiter}${sidecarNodeModules}`
    : sidecarNodeModules;
  // Re-init Module paths to pick up NODE_PATH changes
  Module._initPaths();
}

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === 'electron') {
    // Return a fake path that we'll handle
    return '__electron_shim__';
  }
  // Try normal resolution first
  try {
    return originalResolve.call(this, request, parent, isMain, options);
  } catch (err) {
    // If it fails, try resolving from sidecar's node_modules
    if (fs.existsSync(sidecarNodeModules)) {
      try {
        return originalResolve.call(this, request, { paths: [sidecarNodeModules] }, isMain, options);
      } catch (_) {
        // Fall through to throw original error
      }
    }
    throw err;
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron' || request === '__electron_shim__') {
    return electronShim;
  }
  return originalLoad.call(this, request, parent, isMain);
};

// ── Load .env ──
const envPaths = [
  path.resolve(__dirname, '..', '..', '..', '.env'),       // DraftCoach root (dev)
  path.resolve(__dirname, '..', '..', 'desktop', '.env'),   // desktop app
  path.join(userData, '.env'),                               // user data
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.trim().startsWith('#')) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
    console.log('[sidecar] Loaded .env from:', envPath);
    break;
  }
}

// ── Now load the original main.js ──
// It will register ipcMain handlers and start the Express server on :3210

let mainJsPath = '';
const devMainPathCjs = path.resolve(__dirname, '..', '..', 'desktop', 'src', 'main', 'main.cjs');
const devMainPath = path.resolve(__dirname, '..', '..', 'desktop', 'src', 'main', 'main.js');
const prodMainPathCjs = path.resolve(__dirname, '..', 'backend', 'main.cjs');
const prodMainPath = path.resolve(__dirname, '..', 'backend', 'main.js');

if (fs.existsSync(devMainPathCjs)) {
  mainJsPath = devMainPathCjs;
} else if (fs.existsSync(devMainPath)) {
  mainJsPath = devMainPath;
} else if (fs.existsSync(prodMainPathCjs)) {
  mainJsPath = prodMainPathCjs;
} else if (fs.existsSync(prodMainPath)) {
  mainJsPath = prodMainPath;
} else {
  console.error('[sidecar] FATAL: Could not find main.cjs or main.js');
  process.exit(1);
}

console.log('[sidecar] Loading backend from:', mainJsPath);

// We need to set some globals that main.js expects
// main.js sets module-level variables like mainWindow, overlayWindow, etc.
// These are set inside functions (createWindow, etc.) which won't be called,
// but the backend functions reference them. We need to mock app.whenReady.

// Override app.whenReady — we DO want to execute the callback because 
// it calls startEmbeddedBackend() which starts the Express server.
// But the callback also calls createWindow(), createOverlayWindow(), etc.
// Those will use our FakeBrowserWindow shims and are safe to call.
electronShim.app.whenReady = () => ({
  then: (cb) => {
    console.log('[sidecar] app.whenReady -> executing callback (Express + DDragon cache warming)');
    // Execute the callback after a microtick so module-level code finishes first
    setImmediate(async () => {
      try {
        await cb();
        console.log('[sidecar] whenReady callback completed');
      } catch (err) {
        console.error('[sidecar] whenReady callback error:', err.message);
        // Still try to start a fallback server
        try {
          const express = require('express');
          const cors = require('cors');
          const fallbackApp = express();
          fallbackApp.use(cors());
          fallbackApp.use(express.json());
          fallbackApp.get('/health', (_req, res) => res.json({ ok: false, error: err.message }));
          fallbackApp.listen(3210, '127.0.0.1', () => console.log('[sidecar] Fallback server on :3210'));
        } catch (_) {}
      }
    });
  }
});

// Also need process.resourcesPath (used by main.js in production mode)
process.resourcesPath = path.resolve(__dirname, '..', '..', 'assets');

// Actually load main.js — this will:
// 1. Register all ipcMain handlers (30+) at module scope
// 2. Define all functions (generateBuild, fetchDdragonRunes, etc.)
// 3. Schedule app.whenReady callback which starts Express on :3210
// 4. Window creation functions will use our FakeBrowserWindow (no-ops)

try {
  // The main.js file uses app.getPath('userData') at module level for CACHE_DIR
  // and checks app.isPackaged — our shim handles both

  require(mainJsPath);
  console.log('[sidecar] main.js loaded successfully');
  console.log('[sidecar] Registered IPC handlers:', Object.keys(ipcHandlers).join(', '));
  console.log('[sidecar] Registered IPC listeners:', Object.keys(ipcListeners).join(', '));
} catch (err) {
  console.error('[sidecar] Failed to load main.js:', err.message);
  console.error(err.stack);
  
  // Fallback: start a minimal Express server
  try {
    const express = require('express');
    const cors = require('cors');
    const fallbackApp = express();
    fallbackApp.use(cors());
    fallbackApp.use(express.json());
    fallbackApp.get('/health', (_req, res) => res.json({ ok: false, error: 'Backend failed: ' + err.message }));
    fallbackApp.get('/api/health', (_req, res) => res.json({ ok: false, error: err.message }));
    fallbackApp.listen(3210, '127.0.0.1', () => console.log('[sidecar] Fallback server on :3210'));
  } catch (_) { console.error('[sidecar] Even fallback failed'); }
}

// ── IPC Proxy HTTP Server ──
// This provides /api/ipc/* endpoints so bridge.ts can call IPC handlers via HTTP
// The Express server from main.js runs on :3210
// We add IPC proxy routes on the SAME server by starting immediately

// ── IPC Proxy HTTP Server (using built-in http, no express dependency) ──
// Start immediately after IPC handlers are registered (main.js loaded)
// Check every 100ms for up to 10 seconds if IPC handlers aren't ready yet
let proxyReady = false;
const startProxy = () => {
  if (proxyReady) return;
  proxyReady = true;
  const PROXY_PORT = parseInt(process.env.IPC_PROXY_PORT || '3211', 10);

  const proxyServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = req.url || '/';

    // SSE endpoint — frontend subscribes to receive push events
    if (url === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      const handler = ({ channel, args, target }) => {
        res.write(`data: ${JSON.stringify({ channel, args, target })}\n\n`);
      };
      eventBus.on('ipc-event', handler);
      req.on('close', () => eventBus.removeListener('ipc-event', handler));
      return;
    }

    // Health check
    if (url === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true, pid: process.pid, uptime: process.uptime(),
        handlers: Object.keys(ipcHandlers), listeners: Object.keys(ipcListeners),
      }));
    }

    // IPC invoke proxy — POST /api/ipc/:channel
    const ipcMatch = url.match(/^\/api\/ipc\/(.+)$/);
    if (ipcMatch && req.method === 'POST') {
      const channel = decodeURIComponent(ipcMatch[1]);
      let body = '';
      for await (const chunk of req) body += chunk;
      let args = [];
      try { const parsed = JSON.parse(body); args = parsed.args || []; } catch {}

      // Try handle first (request-response)
      if (ipcHandlers[channel]) {
        try {
          const result = await ipcHandlers[channel]({}, ...args);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result !== undefined ? result : { ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // Try listener (fire-and-forget)
      if (ipcListeners[channel]) {
        try { ipcListeners[channel]({}, ...args); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `No handler: ${channel}` }));
    }

    res.writeHead(404);
    res.end('Not found');
  });

  proxyServer.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`[sidecar] IPC proxy server running on http://127.0.0.1:${PROXY_PORT}`);
  });
};

// Start proxy after a short delay to ensure main.js handlers are registered
setTimeout(startProxy, 100);

// ── Graceful Shutdown ──
process.on('SIGTERM', () => { console.log('[sidecar] SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { console.log('[sidecar] SIGINT'); process.exit(0); });
process.on('uncaughtException', (err) => { console.error('[sidecar] Uncaught:', err); });
process.on('unhandledRejection', (err) => { console.error('[sidecar] Unhandled rejection:', err); });

console.log('[sidecar] DraftCoach backend sidecar initialized');
