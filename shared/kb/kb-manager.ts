// KBManager — Manages Knowledge Base lifecycle:
// - Load/reload from disk
// - Validate before use
// - Atomic hot-swap from staging directory
// - Rollback to previous patch
// - File-system watcher for live updates

import * as path from 'path';
import * as fs from 'fs';
import { KnowledgeBase } from './kb-loader';
import { validateKBDirectory, ValidationResult } from './kb-validator';
import {
    ChampionKBEntry, ItemKBEntry, MatchupKBEntry, BuildTemplate,
    SynergyCounterData, ScoringWeights, KBFile, KBMeta, RuneSet
} from '../engine-types';

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
    private _watcher: fs.FSWatcher | null = null;
    private _onUpdateCallbacks: Array<() => void> = [];
    private _dataDir: string;
    private _archiveDir: string;
    private _stagingDir: string;

    constructor(dataDir?: string) {
        this._dataDir = dataDir || path.resolve(__dirname, './data');
        this._archiveDir = path.resolve(this._dataDir, '../archive');
        this._stagingDir = path.resolve(this._dataDir, '../.staging');
    }

    /** Load or return cached KB. Validates on first load. */
    load(): KnowledgeBase {
        if (this._kb) return this._kb;
        return this.reload();
    }

    /** Force reload from disk with validation. */
    reload(): KnowledgeBase {
        const validation = validateKBDirectory(this._dataDir);

        if (!validation.valid) {
            console.error('[KBManager] KB validation failed:');
            for (const err of validation.errors) {
                console.error(`  ${err.file}.${err.field}: ${err.message}`);
            }

            // Try to load anyway if possible (non-crashing)
            try {
                this._kb = new KnowledgeBase();
                this._updateStatus(validation, false);
                console.warn('[KBManager] Loaded KB despite validation errors');
            } catch (loadErr: any) {
                console.error('[KBManager] Cannot load KB at all:', loadErr.message);
                // If we have a previous KB, keep it as fallback
                if (this._kb) {
                    console.warn('[KBManager] Using previous KB as fallback');
                    this._updateStatus(validation, true);
                    return this._kb;
                }
                throw new Error(`KB load failed: ${loadErr.message}`);
            }
        } else {
            this._kb = new KnowledgeBase();
            this._updateStatus(validation, false);
            console.log(`[KBManager] KB loaded: patch=${validation.patch}, ${validation.filesChecked} files`);
        }

        // Notify listeners
        for (const cb of this._onUpdateCallbacks) {
            try { cb(); } catch (e) { /* ignore callback errors */ }
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

    /** Watch data directory for changes and auto-reload. */
    watchForChanges(): void {
        if (this._watcher) return;

        try {
            this._watcher = fs.watch(this._dataDir, { persistent: false }, (eventType, filename) => {
                if (filename && filename.endsWith('.json')) {
                    console.log(`[KBManager] File changed: ${filename}, reloading...`);
                    // Debounce: wait 500ms for multiple file changes
                    setTimeout(() => {
                        try { this.reload(); } catch (e) { /* keep old KB */ }
                    }, 500);
                }
            });
            console.log('[KBManager] Watching for KB changes');
        } catch (err: any) {
            console.warn('[KBManager] Cannot watch directory:', err.message);
        }
    }

    /** Stop watching. */
    stopWatching(): void {
        if (this._watcher) {
            this._watcher.close();
            this._watcher = null;
        }
    }

    /**
     * Atomic update from a staging directory.
     * 1. Validate staging KB
     * 2. Archive current data → archive/<oldPatch>/
     * 3. Copy staging → data/
     * 4. Reload in-memory KB
     * Returns validation result.
     */
    atomicUpdateFromDir(stagingDir: string): ValidationResult {
        // 1. Validate staging
        const validation = validateKBDirectory(stagingDir);
        if (!validation.valid) {
            console.error('[KBManager] Staging KB is invalid, aborting update');
            return validation;
        }

        // 2. Archive current data
        const currentPatch = this._status?.patch || 'unknown';
        const archivePath = path.join(this._archiveDir, currentPatch);

        try {
            if (!fs.existsSync(this._archiveDir)) fs.mkdirSync(this._archiveDir, { recursive: true });
            if (!fs.existsSync(archivePath)) fs.mkdirSync(archivePath, { recursive: true });

            // Copy current files to archive
            const files = fs.readdirSync(this._dataDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                fs.copyFileSync(path.join(this._dataDir, file), path.join(archivePath, file));
            }
            console.log(`[KBManager] Archived ${files.length} files to ${archivePath}`);

            // 3. Copy staging files to data
            const stagingFiles = fs.readdirSync(stagingDir).filter(f => f.endsWith('.json'));
            for (const file of stagingFiles) {
                fs.copyFileSync(path.join(stagingDir, file), path.join(this._dataDir, file));
            }
            console.log(`[KBManager] Copied ${stagingFiles.length} files from staging`);

            // 4. Reload
            this._kb = null; // force fresh load
            this.reload();

        } catch (err: any) {
            console.error('[KBManager] Atomic update failed, rolling back:', err.message);
            this.rollbackToPrevious();
            return { ...validation, valid: false, errors: [...validation.errors, { file: 'ALL', field: '', message: `Update failed: ${err.message}`, severity: 'error' }] };
        }

        return validation;
    }

    /** Rollback to the most recent archived KB. */
    rollbackToPrevious(): boolean {
        try {
            if (!fs.existsSync(this._archiveDir)) {
                console.error('[KBManager] No archive directory found');
                return false;
            }

            // Find most recent archive by directory modification time
            const patches = fs.readdirSync(this._archiveDir)
                .filter(f => fs.statSync(path.join(this._archiveDir, f)).isDirectory())
                .sort()
                .reverse();

            if (patches.length === 0) {
                console.error('[KBManager] No archived patches found');
                return false;
            }

            const rollbackPatch = patches[0];
            const rollbackDir = path.join(this._archiveDir, rollbackPatch);
            const files = fs.readdirSync(rollbackDir).filter(f => f.endsWith('.json'));

            for (const file of files) {
                fs.copyFileSync(path.join(rollbackDir, file), path.join(this._dataDir, file));
            }

            console.log(`[KBManager] Rolled back to patch ${rollbackPatch} (${files.length} files)`);
            this._kb = null;
            this.reload();
            return true;
        } catch (err: any) {
            console.error('[KBManager] Rollback failed:', err.message);
            return false;
        }
    }

    private _updateStatus(validation: ValidationResult, usingFallback: boolean): void {
        this._status = {
            patch: this._kb?.patch || validation.patch || 'unknown',
            buildHash: this._kb?.meta?.buildHash || 'unknown',
            lastLoaded: Date.now(),
            valid: validation.valid,
            usingFallback,
            validationErrors: validation.errors.length,
            championCount: this._kb?.champions.size || 0,
            templateCount: this._kb?.buildTemplates.size || 0,
        };
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
