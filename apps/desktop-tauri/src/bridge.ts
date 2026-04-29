/**
 * bridge.ts — IPC Bridge for Tauri (replaces Electron's ipcRenderer)
 * 
 * This module provides a drop-in replacement for Electron's ipcRenderer API.
 * All renderer files import from this bridge instead of 'electron'.
 * 
 * Architecture:
 *   - Port 3210: Express server from main.js (build endpoints, health, etc.)
 *   - Port 3211: IPC proxy server (handles ipcMain.handle/on channels + SSE events)
 * 
 * For HTTP-based communication (build endpoints), the existing fetch() calls
 * to http://127.0.0.1:3210 remain completely unchanged.
 */

import { invoke } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';

// ── Config ──
const IPC_PROXY_PORT = 3211;  // IPC proxy server (sidecar)
const BACKEND_PORT = 3210;    // Express backend (main.js)
const IPC_PROXY_URL = `http://127.0.0.1:${IPC_PROXY_PORT}`;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// ── Map of active listeners for cleanup ──
const listenerMap = new Map<string, UnlistenFn[]>();

// ── Window Identity ──
// Detect if this is the main window or a sub-window (overlay, scout, etc.)
// Sub-windows should NOT open their own SSE connections to avoid exhausting
// the browser's 6-connection-per-domain limit.
const _hash = window.location.hash.replace('#', '');
const _pathname = window.location.pathname;
const _route = _hash || _pathname;
const IS_MAIN_WINDOW = _route === '/' || _route === '' || _route === '/index.html';

// ── SSE Event Bus ──
// Only the MAIN window connects to the sidecar's SSE endpoint.
// It forwards events to sub-windows via Tauri's internal event system.
const sseListeners = new Map<string, Set<(...args: any[]) => void>>();
let sseConnected = false;
let sseRetryTimeout: ReturnType<typeof setTimeout> | null = null;
let sseRetryCount = 0;
const SSE_MAX_RETRY_DELAY = 30000; // 30 seconds max
const SSE_INITIAL_RETRY_DELAY = 1000; // 1 second initial

function getSseRetryDelay(): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
  const delay = Math.min(SSE_INITIAL_RETRY_DELAY * Math.pow(2, sseRetryCount), SSE_MAX_RETRY_DELAY);
  sseRetryCount++;
  return delay;
}

function dispatchSSEEvent(channel: string, args: any[]) {
  const handlers = sseListeners.get(channel);
  if (handlers) {
    for (const handler of handlers) {
      handler({}, ...(args || []));
    }
  }
}

function connectSSE() {
  if (!IS_MAIN_WINDOW) {
    // Sub-windows receive events via Tauri's inter-window event system
    console.log(`[bridge] Sub-window (${_route}) — listening for Tauri forwarded events`);
    listen('sse-forward', (event: any) => {
      const { channel, args } = event.payload as { channel: string; args: any[] };
      dispatchSSEEvent(channel, args);
    });
    return;
  }

  if (sseConnected) return;
  
  try {
    const evtSource = new EventSource(`${IPC_PROXY_URL}/api/events`);
    
    evtSource.onopen = () => {
      sseConnected = true;
      console.log('[bridge] SSE connected to sidecar (main window only)');
    };
    
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { channel, args } = data;
        
        // Dispatch locally in this window
        dispatchSSEEvent(channel, args);
        
        // Forward to ALL other Tauri windows via internal event system
        // This does NOT use HTTP — it goes through Tauri's IPC bridge
        emit('sse-forward', { channel, args }).catch(() => {});
      } catch (e) {
        // Ignore parse errors
      }
    };
    
    evtSource.onerror = () => {
      sseConnected = false;
      evtSource.close();
      // Use exponential backoff with max delay of 30s
      const delay = getSseRetryDelay();
      // Only log errors for first 3 retries to avoid console spam
      if (sseRetryCount <= 3) {
        console.log(`[bridge] SSE connection error, retrying in ${delay}ms (attempt ${sseRetryCount})`);
      }
      if (!sseRetryTimeout) {
        sseRetryTimeout = setTimeout(() => {
          sseRetryTimeout = null;
          connectSSE();
        }, delay);
      }
    };
  } catch (e) {
    // SSE not available yet, retry later with backoff
    const delay = getSseRetryDelay();
    if (!sseRetryTimeout) {
      sseRetryTimeout = setTimeout(() => {
        sseRetryTimeout = null;
        connectSSE();
      }, delay);
    }
  }
}

// ── Backend Ready Gate ──
// The sidecar takes a few seconds to start. We use MULTIPLE strategies to
// detect readiness, because the Tauri 'backend-ready' event often fires
// BEFORE the webview JS loads (race condition).
let _resolveBackendReady: () => void;
let _backendResolved = false;
export const backendReady = new Promise<void>((resolve) => {
  _resolveBackendReady = () => {
    if (_backendResolved) return; // prevent double-resolve
    _backendResolved = true;
    resolve();
  };
});

// Strategy 1: Listen for the Rust-side 'backend-ready' event
if (typeof (window as any).__TAURI_INTERNALS__ !== 'undefined') {
  listen('backend-ready', () => {
    console.log('[bridge] Received backend-ready from Tauri event');
    _resolveBackendReady();
    connectSSE();
  });
}

// Strategy 2: Poll the sidecar health endpoint — ONLY in main window
// Sub-windows receive backend-ready via Tauri event (no HTTP needed)
if (IS_MAIN_WINDOW) {
  (function pollForBackend() {
    if (_backendResolved) return;
    fetch(`${IPC_PROXY_URL}/api/health`, { signal: AbortSignal.timeout(2000) })
      .then(r => r.json())
      .then(data => {
        if (data?.ok) {
          console.log('[bridge] Backend ready detected via health poll');
          _resolveBackendReady();
          connectSSE();
        } else {
          setTimeout(pollForBackend, 500);
        }
      })
      .catch(() => {
        setTimeout(pollForBackend, 500);
      });
  })();
} else {
  // Sub-windows: resolve backendReady after a reasonable delay if event hasn't fired
  setTimeout(() => {
    if (!_backendResolved) {
      console.log('[bridge] Sub-window backendReady timeout — resolving');
      _resolveBackendReady();
      connectSSE();
    }
  }, 5000);
}

/**
 * Replaces ipcRenderer.invoke(channel, ...args)
 * Routes to Tauri commands defined in lib.rs
 */
export async function ipcInvoke(channel: string, ...args: any[]): Promise<any> {
  // Map Electron IPC channels to Tauri commands
  switch (channel) {
    // Window management
    case 'open-scout-window':
      return invoke('create_window', {
        label: 'scout', title: 'Scout Report', width: 520, height: 700,
        url: '/scout', transparent: false, alwaysOnTop: false,
        decorations: false, visible: true, skipTaskbar: false,
        minWidth: 400, minHeight: 400
      });
    case 'open-scoreboard-window':
      return invoke('create_window', {
        label: 'scoreboard', title: 'Scoreboard', width: 900, height: 380,
        url: '/scoreboard', transparent: false, alwaysOnTop: true,
        decorations: false, visible: true, skipTaskbar: false,
        minWidth: 700, minHeight: 300
      });
    case 'open-stats-window':
      return invoke('create_window', {
        label: 'stats', title: 'Stats', width: 520, height: 780,
        url: '/stats', transparent: false, alwaysOnTop: false,
        decorations: false, visible: true, skipTaskbar: false,
        minWidth: 420, minHeight: 500
      });
    
    // Window controls
    case 'stats-win-minimize':
      return invoke('minimize_window', { label: 'stats' });
    case 'stats-win-close':
      return invoke('close_window', { label: 'stats' });
    case 'scoreboard-win-hide':
      return invoke('hide_window', { label: 'scoreboard' });
    case 'scoreboard-win-minimize':
      return invoke('minimize_window', { label: 'scoreboard' });

    // Overlay mouse events
    case 'overlay-set-ignore-mouse':
      return invoke('set_ignore_mouse', { label: 'overlay', ignore: args[0] });

    // Overlay window management — create/show/hide the Tauri overlay webview
    case 'overlay-ensure':
      return invoke('create_overlay_window').catch(() => {/* already exists */});
    case 'overlay-show':
      return invoke('show_window', { label: 'overlay' }).catch(() => {});
    case 'overlay-hide':
      return invoke('hide_window', { label: 'overlay' }).catch(() => {});

    // Backend API calls (direct Express endpoints)
    case 'get-ddragon-version':
      return fetch(`${BACKEND_URL}/api/version`).then(r => r.json()).then(d => d.version);
    
    // Browse directory — use Tauri native dialog instead of Electron dialog shim
    case 'browse-directory':
      try {
        const selected = await dialogOpen({
          directory: true,
          multiple: false,
          title: 'Select League of Legends Installation Folder',
        });
        return selected || null;
      } catch (e) {
        console.warn('[bridge] browse-directory dialog failed:', e);
        return null;
      }

    // Pass-through to sidecar IPC proxy via Tauri's native invoke
    // (bypasses browser's 6-connection-per-domain HTTP limit)
    case 'lcu-champ-select':
    case 'lcu-live-game':
    case 'live-advisor-start':
    case 'live-advisor-stop':
    case 'live-advisor-status':
    case 'scout-trigger':
    case 'scout-reset':
    case 'scout-get-cached':
    case 'cooldown-start':
    case 'cooldown-reset':
    case 'fetch-player-stats':
    case 'fetch-my-stats':
    case 'analyze-single-game':
    case 'set-riot-api-key':
    case 'riot-api-check':
    case 'export-item-set':
    case 'export-runes':
    case 'set-settings':
    case 'get-settings':
    case 'save-setting':
    case 'get-setting':
    case 'set-setting':
    case 'get-autodetect-hud':
    case 're-register-shortcuts':
    case 'test-shortcut':
    case 'get-rag-status':
    case 'get-icon':
      return invoke('ipc_proxy', { channel, args }).catch((e: any) => {
        console.warn(`[bridge] IPC call ${channel} failed:`, e?.message || e);
        return null;
      });

    default:
      console.warn(`[bridge] Unknown IPC channel: ${channel}`);
      return null;
  }
}

/**
 * Replaces ipcRenderer.send(channel, ...args)
 * One-way message (fire-and-forget)
 */
export function ipcSend(channel: string, ...args: any[]): void {
  // For one-way messages, use Tauri invoke to bypass browser connection limits
  switch (channel) {
    // Overlay mouse interaction — must go directly to Tauri (not sidecar)
    case 'overlay-set-ignore-mouse':
      invoke('set_ignore_mouse', { label: 'overlay', ignore: args[0] }).catch(() => {});
      break;
    // Sidecar listeners (fire-and-forget)
    case 'overlay-data':
    case 'update-overlay-items':
    case 'store-original-build':
    case 'set-ping-region':
      // Send to sidecar via Rust IPC proxy (bypasses browser connection limit)
      invoke('ipc_send', { channel, args }).catch(() => {});
      break;
    default:
      // Use Tauri events for window-to-window communication
      emit(channel, args.length === 1 ? args[0] : args);
  }
}

// ── Push event channels from sidecar ──
// These are events that the backend pushes to the renderer
const PUSH_CHANNELS = new Set([
  'live-advice',
  'live-advisor-debug',
  'live-advisor-stopped',
  'live-advisor-started',
  'build-items-updated',
  'scout-report',
  'scout-status',
  'scout-debug',
  'riot-api-status',
  'ping-update',
  'game-ended',
  'overlay-data-update',
  'overlay-items-update',
  'overlay-visibility',
  'item-purchase-update',
  'settings-update',
  'force-regenerate',
  'cooldown-tick',
  'scoreboard-data',
  'champ-select-update',
]);

/**
 * Replaces ipcRenderer.on(channel, handler)
 * Listens for events from Tauri backend or sidecar SSE
 */
export function ipcOn(channel: string, handler: (...args: any[]) => void): void {
  if (PUSH_CHANNELS.has(channel)) {
    // Register for SSE events from sidecar
    if (!sseListeners.has(channel)) sseListeners.set(channel, new Set());
    sseListeners.get(channel)!.add(handler);
    // Ensure SSE is connected
    connectSSE();
  } else {
    // Use Tauri event listener for window events
    listen(channel, (event) => {
      handler(event, event.payload);
    }).then(unlisten => {
      if (!listenerMap.has(channel)) listenerMap.set(channel, []);
      listenerMap.get(channel)!.push(unlisten);
    });
  }
}

/**
 * Replaces ipcRenderer.removeListener(channel, handler)
 */
export function ipcRemoveListener(channel: string, handler: any): void {
  if (PUSH_CHANNELS.has(channel)) {
    const handlers = sseListeners.get(channel);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) sseListeners.delete(channel);
    }
  } else {
    const unlisteners = listenerMap.get(channel);
    if (unlisteners) {
      const unlisten = unlisteners.pop();
      if (unlisten) unlisten();
      if (unlisteners.length === 0) listenerMap.delete(channel);
    }
  }
}

/**
 * Replaces ipcRenderer.removeAllListeners(channel)
 */
export function ipcRemoveAllListeners(channel: string): void {
  if (PUSH_CHANNELS.has(channel)) {
    sseListeners.delete(channel);
  } else {
    const unlisteners = listenerMap.get(channel);
    if (unlisteners) {
      for (const unlisten of unlisteners) unlisten();
      listenerMap.delete(channel);
    }
  }
}

// ── Window helpers (replace Electron BrowserWindow calls from renderer) ──

export async function minimizeCurrentWindow() {
  const window = getCurrentWebviewWindow();
  await window.minimize();
}

export async function closeCurrentWindow() {
  const window = getCurrentWebviewWindow();
  await window.close();
}

export async function hideCurrentWindow() {
  const window = getCurrentWebviewWindow();
  await window.hide();
}

export async function toggleMaximizeCurrentWindow() {
  const window = getCurrentWebviewWindow();
  await window.toggleMaximize();
}

// ── Global Hotkey Registration (replaces Electron globalShortcut) ──

import { register, unregisterAll, isRegistered } from '@tauri-apps/plugin-global-shortcut';

/**
 * Convert Electron-style accelerator to Tauri shortcut format.
 * Electron: "CommandOrControl+Shift+F" → Tauri: "CmdOrCtrl+Shift+F"
 */
function toTauriShortcut(electronAccelerator: string): string {
  return electronAccelerator
    .replace('CommandOrControl', 'CmdOrCtrl')
    .replace('Command', 'Cmd')
    .replace('Control', 'Ctrl');
}

/**
 * Register a global hotkey. Callback fires when the shortcut is pressed.
 * Returns true if registration succeeded.
 */
export async function registerGlobalHotkey(
  accelerator: string,
  callback: () => void
): Promise<boolean> {
  if (!accelerator || accelerator === 'none') return false;
  const shortcut = toTauriShortcut(accelerator);
  try {
    const alreadyRegistered = await isRegistered(shortcut);
    if (alreadyRegistered) return true;
    await register(shortcut, (event) => {
      if (event.state === 'Pressed') {
        callback();
      }
    });
    return true;
  } catch (e) {
    console.warn(`[bridge] Failed to register hotkey "${shortcut}":`, e);
    return false;
  }
}

/**
 * Unregister all global hotkeys.
 */
export async function unregisterAllHotkeys(): Promise<void> {
  try {
    await unregisterAll();
  } catch (e) {
    console.warn('[bridge] Failed to unregister hotkeys:', e);
  }
}
