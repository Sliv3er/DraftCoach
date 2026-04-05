// Composition Profiler
// Takes draft state + KB → produces CompProfile with team-wide scores.

import { CompProfile, EngineDraftState, ChampionKBEntry } from '../engine-types';
import { KnowledgeBase } from '../kb/kb-loader';

/**
 * Build a full CompProfile from the current draft state.
 * Missing/unknown champions contribute 0 to scores (partial draft support).
 */
export function buildCompProfile(draft: EngineDraftState, kb: KnowledgeBase): CompProfile {
    const myChamp = draft.myChampionId ? kb.getChampion(draft.myChampionId) : undefined;
    const allyChamps: (ChampionKBEntry | undefined)[] = draft.allies
        .map(s => s.championId ? kb.getChampion(s.championId) : undefined);
    const enemyChamps: (ChampionKBEntry | undefined)[] = draft.enemies
        .map(s => s.championId ? kb.getChampion(s.championId) : undefined);

    const allAllies = [myChamp, ...allyChamps];
    const allEnemies = enemyChamps;

    return {
        // Ally scores
        allyEngageScore: avgScore(allAllies, c => c.tags.engage),
        allyPeelScore: avgScore(allAllies, c => c.tags.peel),
        allyFrontlineScore: avgScore(allAllies, c => c.tags.frontline),
        allyPokeScore: avgScore(allAllies, c => c.tags.poke),
        allyBurstScore: avgScore(allAllies, c => c.tags.burst),
        allySustainedDmgScore: avgScore(allAllies, c => c.tags.sustained),
        allyHealShieldScore: avgScore(allAllies, c => c.tags.healShield),
        allySplitScore: avgScore(allAllies, c => c.tags.splitpush),
        allyCCDensity: sumScore(allAllies, c => c.tags.ccDensity),
        allyMobilityScore: avgScore(allAllies, c => c.tags.mobility),
        allyRangeScore: avgScore(allAllies, c => c.tags.range),

        // Enemy scores (averages)
        enemyEngageScore: avgScore(allEnemies, c => c.tags.engage),
        enemyPickScore: avgScore(allEnemies, c => Math.max(c.tags.engage, c.tags.mobility) * 0.8),
        enemyBurstScore: avgScore(allEnemies, c => c.tags.burst),
        enemyDiveScore: avgScore(allEnemies, c => (c.tags.engage + c.tags.mobility) / 2),
        enemyPokeScore: avgScore(allEnemies, c => c.tags.poke),
        enemySustainedDmgScore: avgScore(allEnemies, c => c.tags.sustained),
        enemyHealShieldScore: avgScore(allEnemies, c => c.tags.healShield),
        enemyCCDensity: sumScore(allEnemies, c => c.tags.ccDensity),
        enemyMobilityScore: avgScore(allEnemies, c => c.tags.mobility),
        enemyRangeScore: avgScore(allEnemies, c => c.tags.range),

        // MAX threat metrics — single highest threat champion
        enemyMaxBurstThreat: maxScore(allEnemies, c => c.tags.burst),
        enemyMaxDiveThreat: maxScore(allEnemies, c => (c.tags.engage + c.tags.mobility) / 2),
        enemyMaxPickThreat: maxScore(allEnemies, c => Math.max(c.tags.engage, c.tags.mobility) * 0.8),

        // Damage profiles
        teamDamageProfile: calcDamageProfile(allAllies),
        enemyDamageProfile: calcDamageProfile(allEnemies),
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function avgScore(champs: (ChampionKBEntry | undefined)[], extractor: (c: ChampionKBEntry) => number): number {
    const valid = champs.filter((c): c is ChampionKBEntry => c !== undefined);
    if (valid.length === 0) return 0;
    const total = valid.reduce((sum, c) => sum + extractor(c), 0);
    return Math.round(total / valid.length);
}

function sumScore(champs: (ChampionKBEntry | undefined)[], extractor: (c: ChampionKBEntry) => number): number {
    return champs
        .filter((c): c is ChampionKBEntry => c !== undefined)
        .reduce((sum, c) => sum + extractor(c), 0);
}

function maxScore(champs: (ChampionKBEntry | undefined)[], extractor: (c: ChampionKBEntry) => number): number {
    const valid = champs.filter((c): c is ChampionKBEntry => c !== undefined);
    if (valid.length === 0) return 0;
    return Math.round(Math.max(...valid.map(c => extractor(c))));
}

function calcDamageProfile(champs: (ChampionKBEntry | undefined)[]): { ap: number; ad: number; trueDmg: number } {
    const valid = champs.filter((c): c is ChampionKBEntry => c !== undefined);
    if (valid.length === 0) return { ap: 33, ad: 34, trueDmg: 33 };

    let ap = 0, ad = 0, trueDmg = 0;
    for (const c of valid) {
        switch (c.tags.damageType) {
            case 'AP': ap += 1; break;
            case 'AD': ad += 1; break;
            case 'TRUE': trueDmg += 1; break;
            case 'MIXED': ap += 0.5; ad += 0.5; break;
        }
    }
    const total = ap + ad + trueDmg || 1;
    return {
        ap: Math.round((ap / total) * 100),
        ad: Math.round((ad / total) * 100),
        trueDmg: Math.round((trueDmg / total) * 100),
    };
}
