// Rule Definitions — Tag-Based, 18 Rules
// Rules use RuleContext and return RuleEffect.
// Items are referenced by TAGS, not hardcoded IDs.

import {
    RuleDefinition, RuleContext, RuleEffect, CompProfile
} from '../engine-types';

export const RULES: RuleDefinition[] = [
    // ═══════════════════════════════════════════════════════
    //  ITEM MODIFICATION RULES
    // ═══════════════════════════════════════════════════════

    // ─── Anti-Heal ────────────────────────────────────────
    {
        id: 'R_ANTI_HEAL',
        priority: 2,
        category: 'ANTI_HEAL',
        tags: ['ANTI_HEAL', 'SITUATIONAL'],
        condition: ({ cp }) => cp.enemyHealShieldScore > 40,
        apply: ({ cp }) => ({
            situationalItemTags: [{ tag: 'ANTI_HEAL', reason: 'Enemy team has heavy healing/shielding — Grievous Wounds recommended' }],
        }),
        description: ({ cp }) =>
            `Enemy has strong healing/shielding (score: ${cp.enemyHealShieldScore}) — build Grievous Wounds.`,
    },

    // ─── Anti-Dive / Pick Threat ──────────────────────────
    {
        id: 'R_ANTI_DIVE',
        priority: 1,
        category: 'ANTI_DIVE',
        tags: ['ANTI_DIVE', 'SAFETY'],
        condition: ({ cp }) => cp.enemyDiveScore > 55 || cp.enemyPickScore > 55,
        apply: ({ cp }) => ({
            situationalItemTags: [{ tag: 'ANTI_DIVE', reason: 'Enemy has strong dive/pick — early Stopwatch or Zhonya\'s saves lives' }],
        }),
        description: ({ cp, champNames }) => {
            const threats = champNames.enemies.filter((n: string) => n).slice(0, 2).join(' & ');
            return `${threats || 'Enemies'} have strong dive/pick — consider defensive itemization.`;
        },
    },

    // ─── Anti-Burst (Heavy AP Enemy) ──────────────────────
    {
        id: 'R_ANTI_BURST',
        priority: 3,
        category: 'ANTI_BURST',
        tags: ['SITUATIONAL', 'MR'],
        condition: ({ cp }) => cp.enemyDamageProfile.ap > 60 || cp.enemyBurstScore > 60,
        apply: () => ({
            situationalItemTags: [{ tag: 'ANTI_BURST', reason: 'Enemy team is AP-heavy or has high burst — Spell Shield blocks key abilities' }],
        }),
        description: ({ cp }) =>
            `Enemy team is ${cp.enemyDamageProfile.ap}% AP — consider MR or Spell Shield items.`,
    },

    // ─── Anti-CC ──────────────────────────────────────────
    {
        id: 'R_ANTI_CC',
        priority: 3,
        category: 'ANTI_CC',
        tags: ['SITUATIONAL', 'ANTI_CC'],
        condition: ({ cp }) => cp.enemyCCDensity > 10,
        apply: () => ({
            situationalItemTags: [{ tag: 'ANTI_CC', reason: 'Enemy has heavy CC — cleanse items recommended for carry protection' }],
        }),
        description: ({ cp }) =>
            `Enemy has heavy CC (${cp.enemyCCDensity.toFixed(1)}s total) — cleanse/tenacity items recommended.`,
    },

    // ─── Heavy AD Enemy ───────────────────────────────────
    {
        id: 'R_HEAVY_AD_ENEMY',
        priority: 3,
        category: 'ANTI_DIVE',
        tags: ['SITUATIONAL', 'ARMOR'],
        condition: ({ cp }) => cp.enemyDamageProfile.ad > 70,
        apply: () => ({
            situationalItemTags: [{ tag: 'ARMOR', reason: 'Enemy team is AD-heavy — Armor items reduce physical damage significantly' }],
        }),
        description: ({ cp }) =>
            `Enemy team is ${cp.enemyDamageProfile.ad}% AD — consider Armor items.`,
    },

    // ═══════════════════════════════════════════════════════
    //  CONDITIONAL FORK RULES
    // ═══════════════════════════════════════════════════════

    // ─── Behind → Defensive Swap ──────────────────────────
    {
        id: 'R_BEHIND_SAFETY',
        priority: 4,
        category: 'BEHIND_RECOVERY',
        tags: ['CONDITIONAL', 'SAFETY'],
        condition: ({ plan }) => plan.label !== 'SAFETY',
        apply: ({ plan }) => ({
            forks: [{
                condition: 'IF_BEHIND',
                swapTag: 'ANTI_DIVE',
                reason: `If behind, swap last core item for a defensive option`,
            }],
        }),
        description: () =>
            `If behind, consider swapping your last core item for a defensive option.`,
    },

    // ─── Snowball → Greed Build ───────────────────────────
    {
        id: 'R_SNOWBALL_GREED',
        priority: 5,
        category: 'SNOWBALL',
        tags: ['CONDITIONAL', 'GREED'],
        condition: ({ plan }) => plan.label === 'DAMAGE',
        apply: () => ({
            forks: [{
                condition: 'IF_AHEAD',
                swapTag: 'PENETRATION',
                reason: 'If snowballing, invest in penetration to close games faster',
            }],
            strategicNotes: ['Snowball lead with vision control and objective pressure.'],
        }),
        description: () =>
            `If ahead, invest in penetration items to press your advantage.`,
    },

    // ═══════════════════════════════════════════════════════
    //  DAMAGE BALANCE WARNINGS
    // ═══════════════════════════════════════════════════════

    {
        id: 'R_DAMAGE_BALANCE_AP_HEAVY',
        priority: 3,
        category: 'DAMAGE_BALANCE',
        tags: ['DAMAGE_BALANCE'],
        condition: ({ cp }) => cp.teamDamageProfile.ap > 65,
        apply: ({ cp }) => ({
            warnings: [`Team is ${cp.teamDamageProfile.ap}% AP — enemies may stack MR.`],
        }),
        description: ({ cp }) =>
            `Team is ${cp.teamDamageProfile.ap}% AP — enemies may stack MR. Consider Void Staff if they do.`,
    },

    {
        id: 'R_DAMAGE_BALANCE_AD_HEAVY',
        priority: 3,
        category: 'DAMAGE_BALANCE',
        tags: ['DAMAGE_BALANCE'],
        condition: ({ cp }) => cp.teamDamageProfile.ad > 65,
        apply: ({ cp }) => ({
            warnings: [`Team is ${cp.teamDamageProfile.ad}% AD — enemies may stack Armor.`],
        }),
        description: ({ cp }) =>
            `Team is ${cp.teamDamageProfile.ad}% AD — enemies may stack Armor. Your AP damage helps balance.`,
    },

    // ═══════════════════════════════════════════════════════
    //  TEAM COMPOSITION WARNINGS
    // ═══════════════════════════════════════════════════════

    {
        id: 'R_LOW_PEEL_WARNING',
        priority: 2,
        category: 'WARNING',
        tags: ['WARNING', 'PEEL'],
        condition: ({ cp }) => cp.allyPeelScore < 30 && cp.enemyDiveScore > 45,
        apply: ({ cp }) => ({
            warnings: [`Team has low peel (${cp.allyPeelScore}) vs enemy dive (${cp.enemyDiveScore}). Position carefully.`],
        }),
        description: ({ cp }) =>
            `⚠ Your team has low peel (${cp.allyPeelScore}). Don't face-check — position carefully.`,
    },

    {
        id: 'R_LOW_FRONTLINE',
        priority: 3,
        category: 'WARNING',
        tags: ['WARNING', 'FRONTLINE'],
        condition: ({ cp }) => cp.allyFrontlineScore < 25,
        apply: () => ({
            warnings: ['Team lacks frontline. Avoid 5v5 engage — play around poke and picks.'],
        }),
        description: () =>
            `⚠ Team lacks frontline. Avoid 5v5 engage — play around poke and picks.`,
    },

    {
        id: 'R_DONT_SPLIT',
        priority: 3,
        category: 'WARNING',
        tags: ['WARNING', 'DONT'],
        condition: ({ cp }) => cp.enemyDiveScore > 50 && cp.allyPeelScore < 35,
        apply: () => ({
            warnings: ["Don't split without vision — enemy has strong pick tools."],
        }),
        description: () =>
            `⚠ Don't split without vision — enemy has strong pick tools.`,
    },

    // ─── Vision Safety (Support-specific) ─────────────────
    {
        id: 'R_VISION_SAFETY',
        priority: 3,
        category: 'VISION_SAFETY',
        tags: ['WARNING', 'VISION'],
        condition: ({ cp, draft }) => draft.myRole === 'SUPPORT' && cp.enemyPickScore > 45,
        apply: () => ({
            warnings: ['Prioritize vision control — enemy has strong pick potential.'],
            strategicNotes: ['Place defensive wards at flanks and jungle entrances.'],
        }),
        description: () =>
            `Prioritize vision control — enemy has strong pick potential.`,
    },

    // ═══════════════════════════════════════════════════════
    //  WIN CONDITION RULES
    // ═══════════════════════════════════════════════════════

    {
        id: 'R_WIN_CONDITION_POKE',
        priority: 5,
        category: 'WIN_CONDITION',
        tags: ['WIN_CONDITION'],
        condition: ({ cp }) => cp.allyPokeScore > 50 && cp.allyEngageScore < 35,
        apply: () => ({
            strategicNotes: ['Win condition: Siege and poke from range. Avoid extended 5v5 fights.'],
        }),
        description: () =>
            `Win condition: Siege and poke from range. Avoid extended 5v5 fights.`,
    },

    {
        id: 'R_WIN_CONDITION_TEAMFIGHT',
        priority: 5,
        category: 'WIN_CONDITION',
        tags: ['WIN_CONDITION'],
        condition: ({ cp }) => cp.allyEngageScore > 50 && cp.allyFrontlineScore > 35,
        apply: () => ({
            strategicNotes: ['Win condition: Group for teamfights — strong engage + frontline.'],
        }),
        description: () =>
            `Win condition: Group for teamfights — strong engage + frontline.`,
    },

    {
        id: 'R_WIN_CONDITION_SPLIT',
        priority: 5,
        category: 'WIN_CONDITION',
        tags: ['WIN_CONDITION'],
        condition: ({ cp }) => cp.allySplitScore > 60,
        apply: () => ({
            strategicNotes: ['Win condition: Split push — apply side lane pressure while team holds.'],
        }),
        description: () =>
            `Win condition: Split push — apply side lane pressure while team holds.`,
    },

    {
        id: 'R_WIN_CONDITION_PICK',
        priority: 5,
        category: 'WIN_CONDITION',
        tags: ['WIN_CONDITION'],
        condition: ({ cp }) => cp.allyBurstScore > 60 && cp.enemyMobilityScore < 40,
        apply: () => ({
            strategicNotes: ['Win condition: Look for picks on immobile targets. Vision control is key.'],
        }),
        description: () =>
            `Win condition: Look for picks on immobile targets. Vision control is key.`,
    },
];
