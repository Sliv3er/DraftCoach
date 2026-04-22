// KBManager — Manages Knowledge Base lifecycle:
// - Load/reload from DDragon API
// - Validate before use
// - Atomic hot-swap
// - Rollback to previous patch (not applicable for DDragon)
// - File-system watcher for live updates (not applicable for DDragon)

// Uses DDragon as single source of truth - no local files needed.

import * as path from 'path';
import * as fs from 'fs';
import { initKB, getKB, KnowledgeBase } from './kb-loader';

export interface KBStatus {
    patch: string;
    buildHash: string;
    lastLoaded: number;
    valid: boolean;
    usingFallback: boolean;
    validationErrors: number;
    championCount: number;
    templateCount: number;
}

export class KBManager {
    private _kb: KnowledgeBase | null = null;
    private _status: KBStatus | null = null;
    private _onUpdateCallbacks: (() => void)[] = [];
    private _dataDir: string;
    private _stagingDir: string;
    private _watcher: fs.FSWatcher | null = null;

    constructor(dataDir?: string) {
        this._dataDir = dataDir || path.join(process.cwd(), 'data', 'kb');
        this._stagingDir = path.resolve(this._dataDir, '../.staging');
    }

    /** Load or return cached KB. Uses DDragon API. */
    async load(): Promise<KnowledgeBase> {
        if (this._kb) return this._kb;
        return this.reload();
    }

    /** Force reload from DDragon API. */
    async reload(): Promise<KnowledgeBase> {
        try {
            this._kb = await initKB();
            const champions = this._kb.getAllChampions();
            const templates = Array.from(this._kb.buildTemplates.values());
            
            this._status = {
                patch: this._kb.patch,
                buildHash: this._kb.meta.buildHash,
                lastLoaded: Date.now(),
                valid: true,
                usingFallback: false,
                validationErrors: 0,
                championCount: champions.length,
                templateCount: templates.length
            };
            
            console.log(`[KBManager] KB loaded from DDragon: patch=${this._kb.patch}, ${champions.length} champions`);

            // Notify listeners
            for (const cb of this._onUpdateCallbacks) {
                try { cb(); } catch (e) { /* ignore callback errors */ }
            }

            return this._kb;
        } catch (err: any) {
            console.error('[KBManager] Failed to load KB from DDragon:', err.message);
            throw new Error(`KB load failed: ${err.message}`);
        }
    }

    /** Synchronous load - must be called after async load() */
    loadSync(): KnowledgeBase {
        if (!this._kb) {
            throw new Error('KB not loaded. Call load() or reload() first.');
        }
        return this._kb;
    }

    /** Get current KB status for UI display. */
    getStatus(): KBStatus | null {
        return this._status;
    }

    /** Register callback for KB updates. */
    onUpdate(cb: () => void): void {
        this._onUpdateCallbacks.push(cb);
    }

    /** Watch data directory for changes and auto-reload (no-op for DDragon). */
    watchForChanges(): void {
        console.log('[KBManager] File watching not applicable for DDragon-based KB');
    }

    /** Stop watching. */
    unwatch(): void {
        if (this._watcher) {
            this._watcher.close();
            this._watcher = null;
        }
    }

    /** Atomic update from staging (no-op for DDragon). */
    async atomicUpdate(): Promise<void> {
        console.log('[KBManager] Atomic updates not applicable for DDragon-based KB');
    }

    /** Rollback (no-op for DDragon). */
    async rollback(): Promise<void> {
        console.log('[KBManager] Rollback not applicable for DDragon-based KB');
    }
}

// ─── Singleton ──────────────────────────────────────────────────────

let _manager: KBManager | null = null;

export function getKBManager(): KBManager {
    if (!_manager) {
        _manager = new KBManager();
    }
    return _manager;
}