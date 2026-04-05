// 9-Signal Scoring Pipeline
// Scores 3 build variants against the CompProfile using weighted formula:
//   score = Σ(weight_i × signal_i)
//
// Signals: laneMatchup, teamNeeds, teamDmgBalance, enemyThreat,
//          synergy, scaling, ccDensity, rangeAdvantage, mobilityGap

import {
    BuildPlan, BuildLabel, CompProfile, ScoringWeights,
    EngineDraftState, BuildTemplate, RuneSet, SkillOrder
} from '../engine-types';
import { KnowledgeBase } from '../kb/kb-loader';

/**
 * Build 3 BuildPlan variants from the template and score them.
 * Returns [primary, alt1, alt2] sorted by score descending.
 */
export function scoreAndRankVariants(
    template: BuildTemplate,
    cp: CompProfile,
    draft: EngineDraftState,
    kb: KnowledgeBase
): [BuildPlan, BuildPlan, BuildPlan] {
    const labels: BuildLabel[] = ['DAMAGE', 'SAFETY', 'UTILITY'];
    const weights = kb.weights;

    const plans: BuildPlan[] = labels.map(label => {
        const variant = template.variants[label];
        const runes = kb.getRuneTemplate(template.championId, template.role, label)
            || variant.runes
            || defaultRunes();

        const plan: BuildPlan = {
            label,
            score: 0,
            runes: runes as RuneSet,
            summonerSpells: variant.summonerSpells || ['Flash', 'Exhaust'],
            skillOrder: variant.skillOrder || defaultSkillOrder(),
            startingItems: variant.startingItems,
            coreItems: variant.coreItems,
            bootChoice: variant.bootChoice,
            situationalItems: (variant.situationalPool || []).map(s => ({
                itemId: s.id,
                itemName: s.name,
                reason: `Recommended when ${s.triggerTag.toLowerCase().replace(/_/g, ' ')} is needed`,
                triggerTag: s.triggerTag,
            })),
            conditionalForks: (variant.conditionalRules || []).map(r => ({
                condition: r.condition,
                itemSwaps: [{
                    remove: r.swap.remove,
                    add: r.swap.add,
                    reason: `Swap for ${r.swap.addName} when ${r.condition.replace(/^IF_/, '').toLowerCase().replace(/_/g, ' ')}`,
                }],
            })),
        };

        plan.score = computeScore(plan, cp, draft, kb, weights);
        return plan;
    });

    plans.sort((a, b) => b.score - a.score);
    return [plans[0], plans[1], plans[2]];
}

/**
 * Compute the score for a single variant using 9 weighted signals.
 */
function computeScore(
    plan: BuildPlan,
    cp: CompProfile,
    draft: EngineDraftState,
    kb: KnowledgeBase,
    w: ScoringWeights
): number {
    let score = 0;

    score += w.laneMatchup * signalLaneMatchup(plan, cp, draft, kb);
    score += w.teamNeeds * signalTeamNeeds(plan, cp);
    score += w.teamDmgBalance * signalDmgBalance(plan, cp);
    score += w.enemyThreat * signalEnemyThreat(plan, cp, kb);
    score += w.synergy * signalSynergy(plan, draft, kb);
    score += w.scalingMatch * signalScaling(plan, draft, kb);
    score += w.ccDensity * signalCCDensity(plan, cp);
    score += w.rangeAdvantage * signalRangeAdvantage(plan, cp);
    score += w.mobilityGap * signalMobilityGap(plan, cp);

    return Math.round(score * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════
//  SIGNAL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════

/** Signal 1: Does variant match the recommended matchup style? */
function signalLaneMatchup(plan: BuildPlan, _cp: CompProfile, draft: EngineDraftState, kb: KnowledgeBase): number {
    if (!draft.myChampionId) return 0.5;
    const enemyInLane = draft.enemies.find(e => e.role === draft.myRole);
    if (!enemyInLane?.championId) return 0.5;

    const matchup = kb.getMatchup(draft.myChampionId, draft.myRole, enemyInLane.championId);
    if (!matchup) return 0.5;

    if (matchup.earlyGame === 'disadvantage' && plan.label === 'SAFETY') return 1.0;
    if (matchup.earlyGame === 'advantage' && plan.label === 'DAMAGE') return 1.0;
    return 0.5;
}

/** Signal 2: Does team lack what this variant provides? */
function signalTeamNeeds(plan: BuildPlan, cp: CompProfile): number {
    let need = 0;
    if (cp.allyFrontlineScore < 25 && plan.label === 'SAFETY') need += 0.3;
    if (cp.allyPeelScore < 30 && plan.label === 'UTILITY') need += 0.3;
    if (cp.allyBurstScore < 30 && plan.label === 'DAMAGE') need += 0.3;
    if (cp.allyHealShieldScore < 20 && plan.label === 'UTILITY') need += 0.2;
    if (cp.allyPokeScore < 20 && plan.label === 'DAMAGE') need += 0.2;
    return Math.min(need, 1);
}

/** Signal 3: Does variant help balance AD/AP? */
function signalDmgBalance(plan: BuildPlan, cp: CompProfile): number {
    if (cp.teamDamageProfile.ad > 65 && plan.label === 'DAMAGE') return 0.7;
    if (cp.teamDamageProfile.ap > 65 && plan.label === 'UTILITY') return 0.6;
    return 0.4;
}

/** Signal 4: Does variant counter the biggest enemy threat? */
function signalEnemyThreat(plan: BuildPlan, cp: CompProfile, kb: KnowledgeBase): number {
    let score = 0;
    const allItemTags: string[] = [];

    for (const item of plan.coreItems) {
        const itemData = kb.getItem(item.id);
        if (itemData) allItemTags.push(...itemData.tags);
    }

    if (cp.enemyBurstScore > 55 && allItemTags.includes('ANTI_BURST')) score += 0.3;
    if (cp.enemyDiveScore > 55 && allItemTags.includes('ANTI_DIVE')) score += 0.3;
    if (cp.enemyHealShieldScore > 40 && allItemTags.includes('ANTI_HEAL')) score += 0.2;

    if (plan.label === 'SAFETY' && (cp.enemyBurstScore > 60 || cp.enemyDiveScore > 60)) {
        score += 0.3;
    }

    return Math.min(score, 1);
}

/** Signal 5: How well does champ synergize with allies? */
function signalSynergy(_plan: BuildPlan, draft: EngineDraftState, kb: KnowledgeBase): number {
    if (!draft.myChampionId) return 0.5;
    const synData = kb.getSynergyCounters(draft.myChampionId);
    if (!synData) return 0.5;

    const allyIds = draft.allies.map(a => a.championId).filter(Boolean) as string[];
    let score = 0;
    for (const syn of synData.synergiesWith) {
        if (allyIds.includes(syn.champions[0]) || allyIds.includes(syn.champions[1])) {
            score += syn.score / 10;
        }
    }

    // Also check if any enemy is a counter
    const enemyIds = draft.enemies.map(e => e.championId).filter(Boolean) as string[];
    for (const counter of synData.counters) {
        if (enemyIds.includes(counter.championId)) {
            score -= counter.severity === 'hard' ? 0.5 : 0.25;
        }
    }

    return Math.max(0, Math.min(score, 1));
}

/** Signal 6: Does variant match champ's power curve? */
function signalScaling(_plan: BuildPlan, draft: EngineDraftState, kb: KnowledgeBase): number {
    if (!draft.myChampionId) return 0.5;
    const champ = kb.getChampion(draft.myChampionId);
    if (!champ) return 0.5;

    if (champ.tags.scalingCurve === 'LATE' && _plan.label === 'DAMAGE') return 0.8;
    if (champ.tags.scalingCurve === 'EARLY' && _plan.label === 'DAMAGE') return 0.7;
    return 0.5;
}

/** Signal 7: CC gap — if enemy has more CC, safety/utility more valuable */
function signalCCDensity(plan: BuildPlan, cp: CompProfile): number {
    const gap = cp.enemyCCDensity - cp.allyCCDensity;
    if (gap > 5 && plan.label === 'SAFETY') return 0.8;
    if (gap > 3 && plan.label === 'UTILITY') return 0.6;
    if (gap < -3 && plan.label === 'DAMAGE') return 0.7; // we have CC advantage, go damage
    return 0.4;
}

/** Signal 8: Range gap — if team outranges, poke/DAMAGE is better */
function signalRangeAdvantage(plan: BuildPlan, cp: CompProfile): number {
    const gap = cp.allyRangeScore - cp.enemyRangeScore;
    if (gap > 20 && plan.label === 'DAMAGE') return 0.8;     // we outrange, go aggro
    if (gap < -20 && plan.label === 'SAFETY') return 0.7;    // outranged, play safe
    if (gap < -20 && plan.label === 'UTILITY') return 0.6;   // outranged, utility helps
    return 0.4;
}

/** Signal 9: Mobility gap — if enemy is much more mobile, safety matters */
function signalMobilityGap(plan: BuildPlan, cp: CompProfile): number {
    const gap = cp.enemyMobilityScore - cp.allyMobilityScore;
    if (gap > 25 && plan.label === 'SAFETY') return 0.8;
    if (gap > 15 && plan.label === 'SAFETY') return 0.6;
    if (gap < -15 && plan.label === 'DAMAGE') return 0.6; // we're faster, aggro
    return 0.4;
}

// ─── Defaults ────────────────────────────────────────────────────────

function defaultRunes(): RuneSet {
    return {
        primaryTree: 'Sorcery', primaryKeystone: 'Arcane Comet',
        primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'],
        secondaryTree: 'Domination',
        secondarySlots: ['Cheap Shot', 'Ingenious Hunter'],
        statShards: ['Adaptive Force', 'Adaptive Force', 'Health'],
    };
}

function defaultSkillOrder(): SkillOrder {
    return { first3: ['Q', 'W', 'E'], maxOrder: ['Q', 'W', 'E'] };
}
