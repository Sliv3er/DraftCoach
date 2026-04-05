// Rule Engine — Evaluates rules and applies effects to build plans.
// Uses RuleContext/RuleEffect interfaces.
// Items resolved via SCORED resolver (not cheapest-by-tag).

import {
    BuildPlan, CompProfile, EngineDraftState,
    TriggeredRule, RuleContext, RuleEffect, ConditionTag
} from '../engine-types';
import { KnowledgeBase } from '../kb/kb-loader';
import { RULES } from './rules';
import { resolveTagFromRuleCtx } from './resolver';

/**
 * Evaluate all rules against current state.
 * Returns deduplicated triggered rules sorted by priority.
 * Mutates build plans in-place by adding situational items, forks, etc.
 */
export function evaluateRules(
    plans: BuildPlan[],
    cp: CompProfile,
    draft: EngineDraftState,
    kb: KnowledgeBase,
    champNames: { allies: string[]; enemies: string[] }
): TriggeredRule[] {
    const triggered: TriggeredRule[] = [];
    const seenRuleIds = new Set<string>();

    for (const plan of plans) {
        const ctx: RuleContext = { cp, draft, plan, champNames };

        for (const rule of RULES) {
            if (rule.condition(ctx)) {
                const effect = rule.apply(ctx);
                applyEffect(effect, plan, kb, ctx);

                if (!seenRuleIds.has(rule.id)) {
                    seenRuleIds.add(rule.id);
                    triggered.push({
                        ruleId: rule.id,
                        priority: rule.priority,
                        condition: rule.description(ctx),
                        effect: rule.description(ctx),
                        tags: rule.tags,
                    });
                }
            }
        }
    }

    triggered.sort((a, b) => a.priority - b.priority);
    return triggered;
}

/**
 * Apply a RuleEffect to a BuildPlan.
 * Uses scored resolver instead of naive cheapest-by-tag.
 */
function applyEffect(effect: RuleEffect, plan: BuildPlan, kb: KnowledgeBase, ctx: RuleContext): void {
    // Add situational items (resolved from tags via scored resolver)
    if (effect.situationalItemTags) {
        for (const { tag, reason } of effect.situationalItemTags) {
            if (plan.situationalItems.some(si => si.triggerTag === tag)) continue;

            const item = resolveTagFromRuleCtx(tag, ctx, kb);
            if (item) {
                plan.situationalItems.push({
                    itemId: item.id,
                    itemName: item.name,
                    reason,
                    triggerTag: tag,
                });
            }
        }
    }

    // Add conditional forks
    if (effect.forks) {
        for (const fork of effect.forks) {
            if (plan.conditionalForks.some(f => f.condition === fork.condition)) continue;

            const swapItem = resolveTagFromRuleCtx(fork.swapTag, ctx, kb);
            if (swapItem) {
                const lastCore = plan.coreItems[plan.coreItems.length - 1];
                if (lastCore) {
                    plan.conditionalForks.push({
                        condition: fork.condition as ConditionTag,
                        itemSwaps: [{
                            remove: lastCore.id,
                            add: swapItem.id,
                            reason: fork.reason,
                        }],
                    });
                }
            }
        }
    }
}
