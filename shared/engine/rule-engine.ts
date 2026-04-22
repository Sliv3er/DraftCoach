// Rule Engine — Evaluates rules and applies effects to build plans.
// Uses RuleContext/RuleEffect interfaces.
// Items resolved via SCORED resolver (not cheapest-by-tag).
// Includes role validation and conflict detection.

import {
    BuildPlan, CompProfile, EngineDraftState,
    TriggeredRule, RuleContext, RuleEffect, ConditionTag
} from '../engine-types';
import { getKB } from '../kb/kb-loader';
import { RULES } from './rules';
import { resolveTagFromRuleCtx } from './resolver';
import { checkItemConflict } from './item-conflicts';
import { canRoleReceiveItemTag } from './role-validator';

// Maximum situational items allowed in a build
const MAX_SITUATIONAL_ITEMS = 3;

/**
 * Evaluate all rules against current state.
 * Returns deduplicated triggered rules sorted by priority.
 * Mutates build plans in-place by adding situational items, forks, etc.
 */
export function evaluateRules(
    plans: BuildPlan[],
    cp: CompProfile,
    draft: EngineDraftState,
    champNames: { allies: string[]; enemies: string[] }
): TriggeredRule[] {
    const triggered: TriggeredRule[] = [];
    const seenRuleIds = new Set<string>();

    for (const plan of plans) {
        const ctx: RuleContext = { cp, draft, plan, champNames };

        for (const rule of RULES) {
            if (rule.condition(ctx)) {
                const effect = rule.apply(ctx);
                applyEffect(effect, plan, ctx);

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
 * Includes role validation and conflict detection.
 */
function applyEffect(effect: RuleEffect, plan: BuildPlan, ctx: RuleContext): void {
    const kb = getKB();
    
    // Add situational items (resolved from tags via scored resolver)
    if (effect.situationalItemTags) {
        for (const { tag, reason } of effect.situationalItemTags) {
            // Skip if already added
            if (plan.situationalItems.some(si => si.triggerTag === tag)) continue;

            // Check role compatibility - skip items not valid for this role
            if (!canRoleReceiveItemTag(ctx.draft.myRole, tag)) {
                continue;
            }

            // Cap situational items
            if (plan.situationalItems.length >= MAX_SITUATIONAL_ITEMS) {
                break;
            }

            const item = resolveTagFromRuleCtx(tag, ctx, kb);
            if (item) {
                // Get item data for conflict checking
                const itemData = kb.getItem(item.id);
                if (!itemData) continue;

                // Collect all current items (core + situational) for conflict check
                const allCurrentItems = [
                    ...plan.coreItems.map(ci => ({ id: ci.id })),
                    ...plan.situationalItems.map(si => ({ id: si.itemId }))
                ];

                // Check for conflicts with existing items
                const conflict = checkItemConflict(item.id, allCurrentItems);
                if (!conflict.canAdd) {
                    // Skip this item - conflict detected
                    continue;
                }

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

            const swapItem = resolveTagFromRuleCtx(fork.swapTag, ctx, getKB());
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