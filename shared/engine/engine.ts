// Main Engine Orchestrator
// Synchronous pipeline: draft state → BuildRecommendation in <150ms.

// Use perf_hooks for sub-ms timing in Node.js / Electron
import { performance } from 'perf_hooks';

import {
    EngineDraftState, BuildRecommendation, EngineRole
} from '../engine-types';
import { getKB, KnowledgeBase } from '../kb/kb-loader';
import { buildCompProfile } from './comp-profiler';
import { scoreAndRankVariants } from './scoring';
import { evaluateRules } from './rule-engine';
import { generateExplanations, buildDraftAnalysis } from './explainer';

/**
 * Main entry point for the local decision engine.
 *
 * Takes an EngineDraftState and produces a full BuildRecommendation
 * with primary plan + 2 alternates, triggered rules, explanations,
 * and draft analysis.
 *
 * Target: <150ms (typically <30ms).
 * 
 * NOTE: Ensure KB is initialized via initKB() before first call.
 */
export function recommend(draft: EngineDraftState): BuildRecommendation | null {
    const start = performance.now();
    
    // Get KB - must be initialized via initKB() at startup
    let kb;
    try {
        kb = getKB();
    } catch (e) {
        console.warn('KB not initialized - call initKB() at startup');
        return null;
    }

    // 1. Must have a champion selected
    if (!draft.myChampionId) return null;

    const myChamp = kb.getChampion(draft.myChampionId);
    if (!myChamp) {
        // Champion not in KB — return null (fallback to LLM)
        return null;
    }

    // 2. Build comp profile
    const compProfile = buildCompProfile(draft, kb);

    // 3. Get build template
    const template = kb.getBuildTemplate(draft.myChampionId, draft.myRole);
    if (!template) {
        // No template for this champ+role — return null (fallback to LLM)
        return null;
    }

    // 4. Score & rank 3 variants
    const [primary, alt1, alt2] = scoreAndRankVariants(template, compProfile, draft, kb);

    // 4.5. Enforce Strict Role Invariants (Summoner Spells & Starters)
    // Even if we fell back to a top-lane build for an off-meta Jungler,
    // they MUST take Smite and a jungle starter.
    for (const v of [primary, alt1, alt2]) {
        // Set role-appropriate starting items
        v.startingItems = getStartingItemsForRole(draft.myRole, kb);
        
        // Enforce max 2 starting items (always)
        v.startingItems = v.startingItems.slice(0, 2);
        
        // Set role-appropriate summoner spells
        if (draft.myRole === 'JUNGLE') {
            v.summonerSpells = ['Flash', 'Smite'];
        } else if (draft.myRole === 'SUPPORT') {
            v.summonerSpells = ['Flash', 'Ignite'];
        } else if (draft.myRole === 'BOT') {
            v.summonerSpells = ['Flash', 'Heal'];
        }
        // Top/Mid usually keep Flash/TP or Flash/Ignite from their base template.
    }

    // 5. Resolve champion names for explanations
    const champNames = {
        allies: draft.allies.map(a => {
            if (!a.championId) return '';
            return kb.getChampion(a.championId)?.name || a.championId;
        }),
        enemies: draft.enemies.map(e => {
            if (!e.championId) return '';
            return kb.getChampion(e.championId)?.name || e.championId;
        }),
    };

    // 6. Evaluate rules against all variants
    const triggeredRules = evaluateRules([primary, alt1, alt2], compProfile, draft, champNames);

    // 7. Generate template-based explanations
    const explanations = generateExplanations(triggeredRules, compProfile);

    // 8. Build draft analysis
    const draftAnalysis = buildDraftAnalysis(compProfile, draft, kb, triggeredRules);

    // 9. Calculate confidence based on confirmed picks vs hovers
    const confidence = computeConfidence(draft);

    const computeTimeMs = Math.round(performance.now() - start);

    return {
        patch: kb.patch,
        generatedAt: Date.now(),
        computeTimeMs,
        champion: draft.myChampionId,
        championName: myChamp.name,
        role: draft.myRole,
        compProfile,
        confidence,
        primary,
        variants: [alt1, alt2],
        triggeredRules,
        explanations,
        draftAnalysis,
        llmEnhancement: null,
    };
}

/**
 * Compute confidence score (0-1) based on confirmed picks vs hovers.
 * Higher confidence = more draft information is finalized.
 */
function computeConfidence(draft: EngineDraftState): number {
    let conf = 0;

    // My champion confirmed (not hover)
    if (draft.myChampionId) conf += 0.3;

    // Allies confirmed
    for (const ally of draft.allies) {
        if (ally.championId && !ally.isHover) conf += 0.1;
        else if (ally.championId && ally.isHover) conf += 0.03;
    }

    // Enemies confirmed
    for (const enemy of draft.enemies) {
        if (enemy.championId && !enemy.isHover) conf += 0.07;
        else if (enemy.championId && enemy.isHover) conf += 0.02;
    }

    return Math.min(Math.round(conf * 100) / 100, 1);
}

/**
 * Convert UI role string to EngineRole.
 */
export function toEngineRole(role: string): EngineRole {
    const map: Record<string, EngineRole> = {
        top: 'TOP', jungle: 'JUNGLE', mid: 'MID',
        adc: 'BOT', bot: 'BOT', bottom: 'BOT',
        support: 'SUPPORT', utility: 'SUPPORT',
    };
    return map[role.toLowerCase()] || 'MID';
}

/**
 * Build an EngineDraftState from the UI's simple state.
 * This is the adapter between the old manual input format and the engine.
 */
export function buildDraftFromUI(
    myChampion: string,
    role: string,
    allies: string[],
    enemies: string[],
    patch: string,
): EngineDraftState {
    const engineRole = toEngineRole(role);
    const roleAssignments: EngineRole[] = ['TOP', 'JUNGLE', 'MID', 'BOT', 'SUPPORT'];

    return {
        patch,
        phase: 'MANUAL',
        myRole: engineRole,
        myChampionId: myChampion || null,
        allies: allies.map((id, i) => ({
            role: roleAssignments.filter(r => r !== engineRole)[i] || 'TOP',
            championId: id || null,
            isHover: false,
        })),
        enemies: enemies.map((id, i) => ({
            role: roleAssignments[i] || 'TOP',
            championId: id || null,
            isHover: false,
        })),
        bans: [],
        timeLeftMs: 90000,
    };
}

/**
 * Check if the KB has data for a given champion+role combo.
 */
export function hasLocalData(champId: string, role: string): boolean {
    let kb;
    try {
        kb = getKB();
    } catch {
        return false;
    }
    const engineRole = toEngineRole(role);
    return kb.getBuildTemplate(champId, engineRole) !== undefined;
}

// ─── Starting Items ───────────────────────────────────────────────────

const STARTING_ITEMS_BY_ROLE: Record<EngineRole, { id: string; name: string }[]> = {
    'JUNGLE': [
        { id: '1103', name: 'Mosstomper Seedling' },
        { id: '2003', name: 'Health Potion' }
    ],
    'SUPPORT': [
        { id: '3865', name: 'World Atlas' },
        { id: '2003', name: 'Health Potion' }
    ],
    'BOT': [
        { id: '1055', name: "Doran's Blade" },
        { id: '2003', name: 'Health Potion' }
    ],
    'TOP': [
        { id: '1055', name: "Doran's Blade" },
        { id: '2003', name: 'Health Potion' }
    ],
    'MID': [
        { id: '1056', name: "Doran's Ring" },
        { id: '2003', name: 'Health Potion' }
    ]
};

const MAX_STARTING_ITEMS = 2;
const MAX_STARTING_GOLD = 500;

/**
 * Get appropriate starting items for a role.
 * Rules:
 * - Junglers: 1 jungle item + 1 potion
 * - Supports: 1 support item + 1 potion  
 * - Laners: 1 Doran's item + 1 potion OR Long Sword + potions
 * - NEVER more than 2 items
 * - Total cost <= 500g
 */
export function getStartingItemsForRole(
    role: EngineRole,
    kb: KnowledgeBase
): { id: string; name: string }[] {
    let items = STARTING_ITEMS_BY_ROLE[role] || STARTING_ITEMS_BY_ROLE['TOP'];
    
    // Validate cost constraint
    let totalCost = 0;
    for (const item of items) {
        const kbItem = kb.getItem(item.id);
        totalCost += kbItem?.cost || 0;
    }
    
    // If over budget, try to find cheaper alternatives
    if (totalCost > MAX_STARTING_GOLD) {
        // For now, just ensure we have at least 2 items
        items = items.slice(0, MAX_STARTING_ITEMS);
    }
    
    // Always enforce max 2 items
    return items.slice(0, MAX_STARTING_ITEMS);
}

/**
 * Validate starting items. Throws if rules are violated.
 */
export function validateStartingItems(
    items: { id: string; name: string }[],
    role: EngineRole,
    kb: KnowledgeBase
): void {
    // Rule 1: Max 2 items
    if (items.length > MAX_STARTING_ITEMS) {
        throw new Error(`Too many starting items: ${items.length} (max ${MAX_STARTING_ITEMS})`);
    }
    
    // Rule 2: Total cost <= 500g
    let totalCost = 0;
    for (const item of items) {
        const kbItem = kb.getItem(item.id);
        totalCost += kbItem?.cost || 0;
    }
    if (totalCost > MAX_STARTING_GOLD) {
        throw new Error(`Starting items cost ${totalCost}g > ${MAX_STARTING_GOLD}g`);
    }
    
    // Rule 3: Junglers must have jungle item
    if (role === 'JUNGLE') {
        const hasJungle = items.some(item => {
            const kbItem = kb.getItem(item.id);
            return kbItem?.tags?.includes('JUNGLE');
        });
        if (!hasJungle) {
            throw new Error('Jungler must start with a jungle item');
        }
    }
    
    // Rule 4: Supports should have support item
    if (role === 'SUPPORT') {
        const hasSupport = items.some(item => {
            const kbItem = kb.getItem(item.id);
            return kbItem?.tags?.includes('SUPPORT');
        });
        if (!hasSupport) {
            throw new Error('Support should start with support item');
        }
    }
    
    // Rule 5: Non-junglers should NOT have jungle items
    if (role !== 'JUNGLE') {
        const hasJungle = items.some(item => {
            const kbItem = kb.getItem(item.id);
            return kbItem?.tags?.includes('JUNGLE');
        });
        if (hasJungle) {
            throw new Error('Non-jungler cannot start with jungle item');
        }
    }
}
