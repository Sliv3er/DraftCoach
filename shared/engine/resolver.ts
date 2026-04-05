// Scored Tag → Item Resolver
// Replaces the naive "cheapest by tag" resolver with a context-aware scorer.
//
// Considers:
//  - Champion damageType (AP items for AP champs, etc.)
//  - Role (SUPPORT economy vs solo lanes)
//  - Plan label (DAMAGE/SAFETY/UTILITY)
//  - Spike timing needed (EARLY/MID/LATE from champ's scalingCurve)
//  - Passive keyword overlap penalty (avoid redundant passives)
//  - Template pool bonus (prefer items already in the champ's situationalPool)
//  - Capability gates (no heal/shield items for champs without that capability)

import {
    ItemKBEntry, EngineRole, BuildLabel, BuildPlan, ChampionKBEntry,
    RuleContext
} from '../engine-types';
import { KnowledgeBase } from '../kb/kb-loader';

export interface ResolverContext {
    tag: string;
    champion: ChampionKBEntry | null;
    role: EngineRole;
    planLabel: BuildLabel;
    plan: BuildPlan;
    kb: KnowledgeBase;
}

interface ScoredItem {
    item: ItemKBEntry;
    score: number;
    reasons: string[];
}

/**
 * Resolve an item tag to the best item for the given context.
 * Returns null if no valid candidate exists.
 */
export function resolveTagScored(ctx: ResolverContext): { id: string; name: string } | null {
    const candidates = ctx.kb.getAllItems().filter(item => item.tags.includes(ctx.tag));
    if (candidates.length === 0) return null;

    // Score each candidate
    const scored: ScoredItem[] = candidates
        .filter(item => passesCapabilityGates(item, ctx))
        .map(item => scoreItem(item, ctx));

    if (scored.length === 0) return null;

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return { id: best.item.id, name: best.item.name };
}

/**
 * Resolve tag using RuleContext (convenience wrapper for rule-engine).
 */
export function resolveTagFromRuleCtx(
    tag: string,
    ruleCtx: RuleContext,
    kb: KnowledgeBase
): { id: string; name: string } | null {
    const champion = ruleCtx.draft.myChampionId
        ? kb.getChampion(ruleCtx.draft.myChampionId) || null
        : null;

    return resolveTagScored({
        tag,
        champion,
        role: ruleCtx.draft.myRole,
        planLabel: ruleCtx.plan.label,
        plan: ruleCtx.plan,
        kb,
    });
}

// ─── Capability Gates ───────────────────────────────────────────────

function passesCapabilityGates(item: ItemKBEntry, ctx: ResolverContext): boolean {
    const { champion, role } = ctx;
    const keywords = item.passiveKeywords || [];
    const tags = item.tags || [];

    // Gate: heal/shield amplifier items require champion with healShield > 20
    if (tags.includes('HEAL_SHIELD_AMP') || keywords.includes('HEAL_SHIELD_POWER')) {
        if (champion && champion.tags.healShield < 20) return false;
    }

    // Gate: support-economy items should not be picked by solo laners
    if (tags.includes('SUPPORT_ECONOMY')) {
        if (role !== 'SUPPORT') return false;
    }

    // Gate: mana items for manaless champions (future: add mana field to tags)
    // Skipped for now — would need a `usesMana` field in ChampionTags

    // Gate: don't pick an item already in the plan's core build
    const coreIds = new Set(ctx.plan.coreItems.map(ci => ci.id));
    if (coreIds.has(item.id)) return false;

    // Gate: don't pick an item already in situational pool
    const sitIds = new Set(ctx.plan.situationalItems.map(si => si.itemId));
    if (sitIds.has(item.id)) return false;

    return true;
}

// ─── Scoring ────────────────────────────────────────────────────────

function scoreItem(item: ItemKBEntry, ctx: ResolverContext): ScoredItem {
    let score = 50; // base score
    const reasons: string[] = [];

    // 1. Damage type alignment (+20 for matching, -10 for mismatched)
    score += scoreDamageTypeMatch(item, ctx, reasons);

    // 2. Role economy (+15 for appropriate cost bracket)
    score += scoreRoleEconomy(item, ctx, reasons);

    // 3. Plan label synergy (+15)
    score += scorePlanSynergy(item, ctx, reasons);

    // 4. Spike timing alignment (+10)
    score += scoreSpikeAlignment(item, ctx, reasons);

    // 5. Passive overlap penalty (-15 per redundant keyword)
    score += scorePassiveOverlap(item, ctx, reasons);

    // 6. Template pool bonus (+20 if item is in champ's template)
    score += scoreTemplatePoolBonus(item, ctx, reasons);

    return { item, score, reasons };
}

// ─── Individual Score Factors ───────────────────────────────────────

function scoreDamageTypeMatch(item: ItemKBEntry, ctx: ResolverContext, reasons: string[]): number {
    if (!ctx.champion) return 0;

    const champDmg = ctx.champion.tags.damageType;
    const itemStats = item.statProfile || {};

    const hasAP = (itemStats.ap || 0) > 0 || (itemStats.abilityPower || 0) > 0;
    const hasAD = (itemStats.ad || 0) > 0 || (itemStats.attackDamage || 0) > 0;

    if (champDmg === 'AP' && hasAP) { reasons.push('AP match'); return 20; }
    if (champDmg === 'AD' && hasAD) { reasons.push('AD match'); return 20; }
    if (champDmg === 'MIXED') { reasons.push('Mixed OK'); return 10; }
    if (champDmg === 'AP' && hasAD) { reasons.push('AD for AP champ'); return -10; }
    if (champDmg === 'AD' && hasAP) { reasons.push('AP for AD champ'); return -10; }

    return 0;
}

function scoreRoleEconomy(item: ItemKBEntry, ctx: ResolverContext, reasons: string[]): number {
    const cost = item.cost || 0;
    const isSupport = ctx.role === 'SUPPORT';

    if (isSupport) {
        // Supports prefer cheaper items (< 2800g)
        if (cost <= 2400) { reasons.push('Support budget'); return 15; }
        if (cost <= 2800) { reasons.push('Support OK cost'); return 5; }
        if (cost > 3200) { reasons.push('Too expensive for support'); return -10; }
    } else {
        // Solo laners can afford expensive items
        if (cost >= 2800 && cost <= 3400) { reasons.push('Good slot efficiency'); return 10; }
        if (cost < 2000) { reasons.push('Low value for solo'); return -5; }
    }

    return 0;
}

function scorePlanSynergy(item: ItemKBEntry, ctx: ResolverContext, reasons: string[]): number {
    const tags = item.tags || [];

    switch (ctx.planLabel) {
        case 'DAMAGE':
            if (tags.includes('PENETRATION') || tags.includes('DAMAGE')) { reasons.push('Damage plan fit'); return 15; }
            if (tags.includes('DEFENSIVE') || tags.includes('UTILITY')) return -5;
            break;
        case 'SAFETY':
            if (tags.includes('DEFENSIVE') || tags.includes('ANTI_BURST') || tags.includes('ANTI_DIVE')) { reasons.push('Safety plan fit'); return 15; }
            break;
        case 'UTILITY':
            if (tags.includes('UTILITY') || tags.includes('SUPPORT') || tags.includes('ANTI_CC')) { reasons.push('Utility plan fit'); return 15; }
            break;
    }

    return 0;
}

function scoreSpikeAlignment(item: ItemKBEntry, ctx: ResolverContext, reasons: string[]): number {
    if (!ctx.champion) return 0;

    const champTiming = ctx.champion.tags.scalingCurve;
    const itemTiming = item.spikeTiming;

    if (!itemTiming) return 0;

    if (champTiming === itemTiming) { reasons.push('Timing match'); return 10; }
    if (champTiming === 'EARLY' && itemTiming === 'LATE') { reasons.push('Late item for early champ'); return -5; }
    if (champTiming === 'LATE' && itemTiming === 'EARLY') { reasons.push('Early item for late champ'); return -5; }

    return 0;
}

function scorePassiveOverlap(item: ItemKBEntry, ctx: ResolverContext, reasons: string[]): number {
    const itemKeywords = new Set(item.passiveKeywords || []);
    if (itemKeywords.size === 0) return 0;

    // Check overlap with core items' passives
    let overlapCount = 0;
    for (const coreItem of ctx.plan.coreItems) {
        const coreData = ctx.kb.getItem(coreItem.id);
        if (!coreData) continue;
        for (const kw of coreData.passiveKeywords || []) {
            if (itemKeywords.has(kw)) overlapCount++;
        }
    }

    if (overlapCount > 0) {
        reasons.push(`${overlapCount} passive overlap(s)`);
        return -15 * overlapCount;
    }

    return 0;
}

function scoreTemplatePoolBonus(item: ItemKBEntry, ctx: ResolverContext, reasons: string[]): number {
    // Check if this item appears in any of the champion's template variants
    if (!ctx.champion) return 0;

    const template = ctx.kb.getBuildTemplate(ctx.champion.id, ctx.role);
    if (!template) return 0;

    for (const label of ['DAMAGE', 'SAFETY', 'UTILITY'] as const) {
        const variant = template.variants[label];
        if (!variant) continue;

        const poolIds = (variant.situationalPool || []).map(s => s.id);
        if (poolIds.includes(item.id)) {
            reasons.push('In template pool');
            return 20;
        }
    }

    return 0;
}
