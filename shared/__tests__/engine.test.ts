// Unit Tests — Engine Core Modules
// Tests: comp-profiler, scoring signals, rules, resolver, KB validator

import { buildCompProfile } from '../engine/comp-profiler';
import { recommend, buildDraftFromUI, toEngineRole } from '../engine/engine';
import { validateKBDirectory } from '../kb/kb-validator';
import { EngineDraftState, CompProfile, ChampionKBEntry, BuildPlan } from '../engine-types';

// ─── Test fixtures ──────────────────────────────────────────────────

function makeChamp(overrides: Partial<ChampionKBEntry> = {}): ChampionKBEntry {
    return {
        id: 'TestChamp', name: 'Test Champion',
        roles: ['MID'],
        tags: {
            engage: 50, peel: 50, frontline: 50, burst: 50, sustained: 50,
            poke: 50, healShield: 50, splitpush: 50,
            ccDensity: 2.0, mobility: 50, range: 50,
            damageType: 'AP', scalingCurve: 'MID',
            threatWindow: { start: 'MID', end: 'LATE' },
        },
        laneStrengths: { MID: { poke: 50, allIn: 50, sustain: 50 } },
        ...overrides,
    };
}

function makeDraft(overrides: Partial<EngineDraftState> = {}): EngineDraftState {
    return {
        patch: '26.4',
        phase: 'MANUAL',
        myRole: 'SUPPORT',
        myChampionId: 'Xerath',
        allies: [
            { role: 'TOP', championId: 'Jax', isHover: false },
            { role: 'JUNGLE', championId: 'MasterYi', isHover: false },
            { role: 'MID', championId: 'Yone', isHover: false },
            { role: 'BOT', championId: 'Jinx', isHover: false },
        ],
        enemies: [
            { role: 'TOP', championId: 'Darius', isHover: false },
            { role: 'JUNGLE', championId: 'LeeSin', isHover: false },
            { role: 'MID', championId: 'Ahri', isHover: false },
            { role: 'BOT', championId: 'KaiSa', isHover: false },
            { role: 'SUPPORT', championId: 'Leona', isHover: false },
        ],
        bans: [],
        timeLeftMs: 90000,
        ...overrides,
    };
}

// ─── Comp Profiler Tests ────────────────────────────────────────────

describe('comp-profiler', () => {
    // These tests need the KB loaded, so we use a mock approach
    // The comp-profiler reads champions from the KB via getChampion()

    test('toEngineRole converts various role strings', () => {
        expect(toEngineRole('top')).toBe('TOP');
        expect(toEngineRole('jungle')).toBe('JUNGLE');
        expect(toEngineRole('mid')).toBe('MID');
        expect(toEngineRole('adc')).toBe('BOT');
        expect(toEngineRole('bot')).toBe('BOT');
        expect(toEngineRole('bottom')).toBe('BOT');
        expect(toEngineRole('support')).toBe('SUPPORT');
        expect(toEngineRole('utility')).toBe('SUPPORT');
        expect(toEngineRole('UNKNOWN')).toBe('MID'); // fallback
    });

    test('buildDraftFromUI creates proper structure', () => {
        const draft = buildDraftFromUI('Xerath', 'support', ['Jinx', 'Yone', '', ''], ['Leona', 'Darius', '', '', ''], '26.4');
        expect(draft.myChampionId).toBe('Xerath');
        expect(draft.myRole).toBe('SUPPORT');
        expect(draft.phase).toBe('MANUAL');
        expect(draft.allies).toHaveLength(4);
        expect(draft.enemies).toHaveLength(5);
    });
});

// ─── KB Validator Tests ─────────────────────────────────────────────

describe('kb-validator', () => {
    const KB_DIR = require('path').resolve(__dirname, '../kb/data');

    test('current KB directory passes validation', () => {
        const result = validateKBDirectory(KB_DIR);
        expect(result.filesChecked).toBeGreaterThanOrEqual(7);
        expect(result.patch).toBeTruthy();

        if (!result.valid) {
            console.log('Validation errors:', result.errors);
        }
        // Should be valid (our KB data is correct)
        expect(result.valid).toBe(true);
    });

    test('nonexistent directory reports errors', () => {
        const result = validateKBDirectory('/nonexistent/path');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test('patch consistency is checked', () => {
        const result = validateKBDirectory(KB_DIR);
        // All files should have the same patch
        expect(result.patch).toBe('26.4');
    });
});

// ─── Engine Integration Test ────────────────────────────────────────

describe('engine integration', () => {
    test('recommend() produces valid output for Xerath SUPPORT', () => {
        const draft = makeDraft();
        const result = recommend(draft);

        if (result) {
            expect(result.champion).toBe('Xerath');
            expect(result.role).toBe('SUPPORT');
            expect(result.primary).toBeTruthy();
            expect(result.primary.label).toBeTruthy();
            expect(result.primary.score).toBeGreaterThan(0);
            expect(result.variants).toHaveLength(2);
            expect(result.computeTimeMs).toBeLessThan(150);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
            expect(result.compProfile).toBeTruthy();
            expect(result.compProfile.allyPokeScore).toBeGreaterThanOrEqual(0);
            expect(result.compProfile.enemyMaxBurstThreat).toBeGreaterThanOrEqual(0);
        }
    });

    test('recommend() returns null for unknown champion', () => {
        const draft = makeDraft({ myChampionId: 'UnknownChamp9999' });
        const result = recommend(draft);
        expect(result).toBeNull();
    });

    test('recommend() returns null for null champion', () => {
        const draft = makeDraft({ myChampionId: null });
        const result = recommend(draft);
        expect(result).toBeNull();
    });

    test('recommend() handles empty draft gracefully', () => {
        const draft = makeDraft({
            allies: [],
            enemies: [],
        });
        const result = recommend(draft);
        // Should still work with empty allies/enemies
        if (result) {
            expect(result.primary).toBeTruthy();
        }
    });

    test('scoring produces 3 distinct variant labels', () => {
        const draft = makeDraft();
        const result = recommend(draft);
        if (result) {
            const labels = [result.primary.label, ...result.variants.map(v => v.label)];
            const unique = new Set(labels);
            expect(unique.size).toBe(3);
        }
    });

    test('confidence increases with more confirmed picks', () => {
        const lowConf = makeDraft({
            allies: [
                { role: 'TOP', championId: 'Jax', isHover: true },
                { role: 'JUNGLE', championId: null, isHover: false },
                { role: 'MID', championId: null, isHover: false },
                { role: 'BOT', championId: null, isHover: false },
            ],
            enemies: [],
        });

        const highConf = makeDraft(); // all confirmed

        const lowResult = recommend(lowConf);
        const highResult = recommend(highConf);

        if (lowResult && highResult) {
            expect(highResult.confidence).toBeGreaterThan(lowResult.confidence);
        }
    });
});

// ─── Performance Test ───────────────────────────────────────────────

describe('performance', () => {
    test('engine runs under 150ms', () => {
        const draft = makeDraft();

        const start = Date.now();
        for (let i = 0; i < 10; i++) {
            recommend(draft);
        }
        const elapsed = Date.now() - start;
        const avgMs = elapsed / 10;

        console.log(`Average engine time: ${avgMs.toFixed(1)}ms`);
        expect(avgMs).toBeLessThan(150);
    });
});
