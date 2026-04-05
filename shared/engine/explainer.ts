// Template Explanation Generator
// Produces human-readable explanations from triggered rules + comp data.
// NO LLM — pure template string interpolation.

import { TriggeredRule, CompProfile, DraftAnalysis, ThreatTimer, EngineDraftState } from '../engine-types';
import { KnowledgeBase } from '../kb/kb-loader';

/**
 * Generate explanation strings from triggered rules.
 * Caps output at 6 lines to avoid UI clutter.
 */
export function generateExplanations(
    triggeredRules: TriggeredRule[],
    cp: CompProfile,
): string[] {
    const explanations = triggeredRules
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 6)
        .map(r => r.condition);

    return explanations;
}

/**
 * Build a full DraftAnalysis from the comp profile and draft state.
 */
export function buildDraftAnalysis(
    cp: CompProfile,
    draft: EngineDraftState,
    kb: KnowledgeBase,
    triggeredRules: TriggeredRule[],
): DraftAnalysis {
    const winConditions: string[] = [];
    const warnings: string[] = [];
    const allyStrengths: string[] = [];
    const enemyThreats: string[] = [];

    // ─── Win Conditions (from triggered rules) ─────────────────
    for (const rule of triggeredRules) {
        if (rule.tags.includes('WIN_CONDITION')) {
            winConditions.push(rule.condition);
        }
        if (rule.tags.includes('WARNING') || rule.tags.includes('DONT')) {
            warnings.push(rule.condition);
        }
    }

    // Fallback win condition if none from rules
    if (winConditions.length === 0) {
        if (cp.allyBurstScore > 60) winConditions.push('Look for picks and burst combos.');
        else if (cp.allySustainedDmgScore > 60) winConditions.push('Play for sustained fights and objectives.');
        else winConditions.push('Play around your team\'s strengths and avoid unfavorable fights.');
    }

    // ─── Ally Strengths ────────────────────────────────────────
    if (cp.allyEngageScore > 50) allyStrengths.push(`Strong engage (${cp.allyEngageScore})`);
    if (cp.allyPeelScore > 50) allyStrengths.push(`Good peel (${cp.allyPeelScore})`);
    if (cp.allyFrontlineScore > 40) allyStrengths.push(`Solid frontline (${cp.allyFrontlineScore})`);
    if (cp.allyPokeScore > 50) allyStrengths.push(`Strong poke (${cp.allyPokeScore})`);
    if (cp.allyBurstScore > 60) allyStrengths.push(`High burst damage (${cp.allyBurstScore})`);
    if (cp.allySustainedDmgScore > 60) allyStrengths.push(`Strong sustained DPS (${cp.allySustainedDmgScore})`);
    if (cp.allyHealShieldScore > 40) allyStrengths.push(`Healing/shielding (${cp.allyHealShieldScore})`);

    // ─── Enemy Threats ─────────────────────────────────────────
    if (cp.enemyEngageScore > 50) enemyThreats.push(`Strong engage (${cp.enemyEngageScore})`);
    if (cp.enemyPickScore > 50) enemyThreats.push(`Pick threat (${cp.enemyPickScore})`);
    if (cp.enemyBurstScore > 60) enemyThreats.push(`High burst (${cp.enemyBurstScore})`);
    if (cp.enemyDiveScore > 55) enemyThreats.push(`Dive threat (${cp.enemyDiveScore})`);
    if (cp.enemyHealShieldScore > 40) enemyThreats.push(`Healing/shielding (${cp.enemyHealShieldScore})`);

    // ─── Lane Matchup Summary ─────────────────────────────────
    let laneMatchupSummary = 'No matchup data available.';
    if (draft.myChampionId) {
        const laneEnemy = draft.enemies.find(e => e.role === draft.myRole);
        if (laneEnemy?.championId) {
            const matchup = kb.getMatchup(draft.myChampionId, draft.myRole, laneEnemy.championId);
            if (matchup) {
                const myChamp = kb.getChampion(draft.myChampionId);
                const enemyChamp = kb.getChampion(laneEnemy.championId);
                laneMatchupSummary = `${myChamp?.name || draft.myChampionId} vs ${enemyChamp?.name || laneEnemy.championId}: Score (${matchup.score}/100) - ${matchup.earlyGame} early. ${matchup.tip}`;
            }
        }
    }

    // ─── Threat Timers ─────────────────────────────────────────
    const threatTimers: ThreatTimer[] = [];
    for (const enemy of draft.enemies) {
        if (!enemy.championId) continue;
        const champ = kb.getChampion(enemy.championId);
        if (!champ) continue;
        threatTimers.push({
            championId: enemy.championId,
            championName: champ.name,
            windowStart: champ.tags.threatWindow.start,
            windowEnd: champ.tags.threatWindow.end,
            note: `${champ.name} strongest ${champ.tags.threatWindow.start.toLowerCase()}-${champ.tags.threatWindow.end.toLowerCase()} game`,
        });
    }

    return {
        winConditions,
        warnings,
        allyStrengths,
        enemyThreats,
        laneMatchupSummary,
        threatTimers,
    };
}

function getDifficultyLabel(d: number): string {
    if (d <= 3) return 'Easy';
    if (d <= 5) return 'Even';
    if (d <= 7) return 'Hard';
    return 'Very Hard';
}
