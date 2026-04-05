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
 */
export function recommend(draft: EngineDraftState): BuildRecommendation | null {
    const start = performance.now();
    const kb = getKB();

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
        if (draft.myRole === 'JUNGLE') {
            v.summonerSpells = ['Flash', 'Smite'];
            // Ensure they have a jungle starter
            if (!v.startingItems.find(i => i.name.includes('Seedling') || i.name.includes('Hatchling') || i.name.includes('Pup'))) {
                v.startingItems = [
                    { id: '1103', name: 'Mosstomper Seedling' },
                    { id: '2003', name: 'Health Potion' }
                ];
            }
        } else if (draft.myRole === 'SUPPORT') {
            if (!v.summonerSpells.includes('Ignite') && !v.summonerSpells.includes('Exhaust') && !v.summonerSpells.includes('Heal')) {
                v.summonerSpells = ['Flash', 'Ignite'];
            }
            if (!v.startingItems.find(i => i.name === 'World Atlas')) {
                v.startingItems = [
                    { id: '3862', name: 'World Atlas' },
                    { id: '2003', name: 'Health Potion' },
                    { id: '2003', name: 'Health Potion' }
                ];
            }
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
    const triggeredRules = evaluateRules([primary, alt1, alt2], compProfile, draft, kb, champNames);

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
    const kb = getKB();
    const engineRole = toEngineRole(role);
    return kb.getBuildTemplate(champId, engineRole) !== undefined;
}
