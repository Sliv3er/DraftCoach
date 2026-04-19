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

// ── Config ──
const IPC_PROXY_PORT = 3211;  // IPC proxy server (sidecar)
const BACKEND_PORT = 3210;    // Express backend (main.js)
const IPC_PROXY_URL = `http://127.0.0.1:${IPC_PROXY_PORT}`;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// ── Map of active listeners for cleanup ──
const listenerMap = new Map<string, UnlistenFn[]>();

// ── SSE Event Bus ──
// Connects to the sidecar's SSE endpoint to receive push events
// (live-advice, scout-report, ping-update, etc.)
const sseListeners = new Map<string, Set<(...args: any[]) => void>>();
let sseConnected = false;
let sseRetryTimeout: ReturnType<typeof setTimeout> | null = null;

function connectSSE() {
  if (sseConnected) return;
  
  try {
    const evtSource = new EventSource(`${IPC_PROXY_URL}/api/events`);
    
    evtSource.onopen = () => {
      sseConnected = true;
      console.log('[bridge] SSE connected to sidecar');
    };
    
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { channel, args } = data;
        
        // Dispatch to registered SSE listeners
        const handlers = sseListeners.get(channel);
        if (handlers) {
          for (const handler of handlers) {
            handler({}, ...(args || []));
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };
    
    evtSource.onerror = () => {
      sseConnected = false;
      evtSource.close();
      // Retry after 3 seconds
      if (!sseRetryTimeout) {
        sseRetryTimeout = setTimeout(() => {
          sseRetryTimeout = null;
          connectSSE();
        }, 3000);
      }
    };
  } catch (e) {
    // SSE not available yet, retry later
    if (!sseRetryTimeout) {
      sseRetryTimeout = setTimeout(() => {
        sseRetryTimeout = null;
        connectSSE();
      }, 3000);
    }
  }
}

// Start SSE connection on load
connectSSE();

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

    // Backend API calls (direct Express endpoints)
    case 'get-ddragon-version':
      return fetch(`${BACKEND_URL}/api/version`).then(r => r.json()).then(d => d.version);
    
    // Pass-through to sidecar IPC proxy for all backend IPC handlers
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
      return fetch(`${IPC_PROXY_URL}/api/ipc/${channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args }),
      }).then(r => r.json()).catch(e => {
        console.warn(`[bridge] IPC call ${channel} failed:`, e);
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
  // For one-way messages, use HTTP to sidecar IPC proxy
  switch (channel) {
    case 'overlay-data':
    case 'update-overlay-items':
    case 'store-original-build':
    case 'set-ping-region':
    case 'overlay-set-ignore-mouse':
      // Send to sidecar via IPC proxy
      fetch(`${IPC_PROXY_URL}/api/ipc/${channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args }),
      }).catch(() => {});
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
