// LCU WebSocket Adapter — Real-time League Client event stream.
// Replaces 2s polling with WebSocket for instant champ select updates.
//
// Features:
//  - WebSocket connection to LCU API
//  - Exponential backoff reconnect (0.5s, 1s, 2s, 4s, 8s max)
//  - State sync on reconnect
//  - Event handler registration for UI updates
//  - LCU Status indicator: connected/disconnected/reconnecting

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────

export type LCUStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface LCUCredentials {
    port: number;
    password: string;
    protocol: string;
    pid: number;
}

export interface LCUChampSelectSession {
    gameId: number;
    timer: { phase: string; adjustedTimeLeftInPhase: number };
    myTeam: LCUTeamMember[];
    theirTeam: LCUTeamMember[];
    bans: { myTeamBans: number[]; theirTeamBans: number[] };
    localPlayerCellId: number;
    actions: LCUAction[][];
}

export interface LCUTeamMember {
    cellId: number;
    championId: number;
    championPickIntent: number;
    assignedPosition: string;
    spell1Id: number;
    spell2Id: number;
    summonerId: number;
}

export interface LCUAction {
    actorCellId: number;
    championId: number;
    completed: boolean;
    type: 'pick' | 'ban' | 'ten_bans_reveal';
    isAllyAction: boolean;
}

export interface LCUEvent {
    type: 'session-update' | 'session-end' | 'phase-change';
    data: any;
}

// ─── Lockfile Discovery ─────────────────────────────────────────────

const LOL_SEARCH_PATHS = [
    'C:\\Riot Games\\League of Legends',
    'D:\\Riot Games\\League of Legends',
    'C:\\Program Files\\Riot Games\\League of Legends',
    'D:\\Program Files\\Riot Games\\League of Legends',
    'C:\\Games\\Riot Games\\League of Legends',
    'D:\\Games\\Riot Games\\League of Legends',
];

function findLockfile(customPath?: string): string | null {
    const paths = customPath ? [customPath] : LOL_SEARCH_PATHS;
    for (const base of paths) {
        const lockfile = path.join(base, 'lockfile');
        if (fs.existsSync(lockfile)) return lockfile;
    }
    return null;
}

function parseLockfile(lockfilePath: string): LCUCredentials | null {
    try {
        const content = fs.readFileSync(lockfilePath, 'utf-8').trim();
        const parts = content.split(':');
        if (parts.length < 5) return null;
        return {
            pid: parseInt(parts[1]),
            port: parseInt(parts[2]),
            password: parts[3],
            protocol: parts[4] || 'https',
        };
    } catch {
        return null;
    }
}

// ─── LCU WebSocket Adapter ──────────────────────────────────────────

export class LCUAdapter extends EventEmitter {
    private _status: LCUStatus = 'disconnected';
    private _credentials: LCUCredentials | null = null;
    private _ws: any = null; // WebSocket instance
    private _reconnectAttempts = 0;
    private _maxReconnectDelay = 8000;
    private _baseReconnectDelay = 500;
    private _reconnectTimer: NodeJS.Timeout | null = null;
    private _pollTimer: NodeJS.Timeout | null = null;
    private _lastSession: LCUChampSelectSession | null = null;
    private _customLolPath: string | undefined;
    private _destroyed = false;

    constructor(customLolPath?: string) {
        super();
        this._customLolPath = customLolPath;
    }

    get status(): LCUStatus { return this._status; }
    get credentials(): LCUCredentials | null { return this._credentials; }
    get lastSession(): LCUChampSelectSession | null { return this._lastSession; }

    /**
     * Start the adapter. Attempts to find lockfile and connect.
     * Falls back to polling if WebSocket is unavailable.
     */
    async start(): Promise<void> {
        if (this._destroyed) return;
        this._setStatus('connecting');

        const lockfilePath = findLockfile(this._customLolPath);
        if (!lockfilePath) {
            this._setStatus('disconnected');
            this.emit('error', new Error('League of Legends lockfile not found'));
            this._scheduleReconnect();
            return;
        }

        const creds = parseLockfile(lockfilePath);
        if (!creds) {
            this._setStatus('disconnected');
            this.emit('error', new Error('Invalid lockfile format'));
            this._scheduleReconnect();
            return;
        }

        this._credentials = creds;

        // Try WebSocket first, fall back to polling if ws module unavailable
        try {
            await this._connectWebSocket(creds);
        } catch (err) {
            console.warn('[LCU] WebSocket unavailable, falling back to polling:', (err as Error).message);
            this._startPolling(creds);
        }
    }

    /** Stop the adapter and clean up. */
    stop(): void {
        this._destroyed = true;
        this._clearTimers();
        if (this._ws) {
            try { this._ws.close(); } catch { /* ignore */ }
            this._ws = null;
        }
        this._setStatus('disconnected');
    }

    /** Force a state sync (useful after reconnect). */
    async syncState(): Promise<LCUChampSelectSession | null> {
        if (!this._credentials) return null;
        return this._fetchSession(this._credentials);
    }

    // ─── WebSocket Connection ────────────────────────────────────────

    private async _connectWebSocket(creds: LCUCredentials): Promise<void> {
        // Dynamic import of ws module
        const WebSocket = require('ws');

        const url = `wss://127.0.0.1:${creds.port}`;
        const auth = Buffer.from(`riot:${creds.password}`).toString('base64');

        this._ws = new WebSocket(url, {
            headers: { 'Authorization': `Basic ${auth}` },
            rejectUnauthorized: false,
        });

        this._ws.on('open', () => {
            this._setStatus('connected');
            this._reconnectAttempts = 0;
            console.log('[LCU] WebSocket connected');

            // Subscribe to champ select events
            this._ws.send(JSON.stringify([5, 'OnJsonApiEvent_lol-champ-select_v1_session']));

            // Immediate state sync
            this._fetchSession(creds).then(session => {
                if (session) {
                    this._lastSession = session;
                    this.emit('session-update', session);
                }
            });
        });

        this._ws.on('message', (data: Buffer) => {
            try {
                const msg = JSON.parse(data.toString());
                if (Array.isArray(msg) && msg[0] === 8) {
                    const event = msg[2];
                    if (event?.uri?.includes('champ-select')) {
                        if (event.eventType === 'Delete') {
                            this._lastSession = null;
                            this.emit('session-end', null);
                        } else {
                            this._lastSession = event.data;
                            this.emit('session-update', event.data);
                        }
                    }
                }
            } catch (e) {
                // Ignore malformed messages
            }
        });

        this._ws.on('close', () => {
            console.log('[LCU] WebSocket closed');
            this._ws = null;
            if (!this._destroyed) {
                this._setStatus('reconnecting');
                this._scheduleReconnect();
            }
        });

        this._ws.on('error', (err: Error) => {
            console.error('[LCU] WebSocket error:', err.message);
            this.emit('error', err);
        });
    }

    // ─── Polling Fallback ────────────────────────────────────────────

    private _startPolling(creds: LCUCredentials): void {
        this._setStatus('connected');
        this._reconnectAttempts = 0;
        console.log('[LCU] Polling mode (500ms interval)');

        const poll = async () => {
            if (this._destroyed) return;
            try {
                const session = await this._fetchSession(creds);
                if (session) {
                    const changed = JSON.stringify(session) !== JSON.stringify(this._lastSession);
                    if (changed) {
                        this._lastSession = session;
                        this.emit('session-update', session);
                    }
                } else if (this._lastSession) {
                    this._lastSession = null;
                    this.emit('session-end', null);
                }
            } catch (err) {
                this._setStatus('reconnecting');
                this._scheduleReconnect();
                return;
            }
            this._pollTimer = setTimeout(poll, 500);
        };

        poll();
    }

    // ─── HTTP Session Fetch ─────────────────────────────────────────

    private async _fetchSession(creds: LCUCredentials): Promise<LCUChampSelectSession | null> {
        return new Promise((resolve) => {
            const auth = Buffer.from(`riot:${creds.password}`).toString('base64');
            const options = {
                hostname: '127.0.0.1',
                port: creds.port,
                path: '/lol-champ-select/v1/session',
                method: 'GET',
                headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
                rejectUnauthorized: false,
                timeout: 3000,
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            resolve(JSON.parse(body));
                        } catch {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
            req.end();
        });
    }

    // ─── Reconnection with Exponential Backoff ──────────────────────

    private _scheduleReconnect(): void {
        if (this._destroyed) return;

        const delay = Math.min(
            this._baseReconnectDelay * Math.pow(2, this._reconnectAttempts),
            this._maxReconnectDelay
        );

        console.log(`[LCU] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts + 1})`);
        this._setStatus('reconnecting');

        this._reconnectTimer = setTimeout(async () => {
            this._reconnectAttempts++;
            await this.start();
        }, delay);
    }

    private _clearTimers(): void {
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
    }

    private _setStatus(status: LCUStatus): void {
        if (this._status !== status) {
            this._status = status;
            this.emit('status-change', status);
        }
    }
}
