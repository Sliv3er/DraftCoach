// Knowledge Base Loader
// Loads all JSON data files into memory-indexed Maps for O(1) lookup.

import {
    ChampionKBEntry, ItemKBEntry, MatchupKBEntry, BuildTemplate,
    SynergyCounterData, ScoringWeights, KBFile, KBMeta, RuneSet,
    SynergyEntry, CounterEntry
} from '../engine-types';

import championsData from './data/champions.json';
import itemsData from './data/items.json';
import matchupsData from './data/matchups.json';
import runeTemplatesData from './data/rune-templates.json';
import buildTemplatesData from './data/build-templates.json';
import synergyCountersData from './data/synergy-counters.json';
import weightsData from './data/weights.json';

export class KnowledgeBase {
    readonly patch: string;
    readonly champions: Map<string, ChampionKBEntry>;
    readonly items: Map<string, ItemKBEntry>;
    readonly matchups: Map<string, MatchupKBEntry>;
    readonly runeTemplates: Map<string, RuneSet>;
    readonly buildTemplates: Map<string, BuildTemplate>;
    readonly synergyCounters: Map<string, SynergyCounterData>;
    readonly weights: ScoringWeights;
    readonly meta: KBMeta;

    constructor() {
        const cData = championsData as KBFile<Record<string, ChampionKBEntry>>;
        this.patch = cData.meta.patch;
        this.meta = cData.meta;

        // Champions
        this.champions = new Map();
        for (const [key, val] of Object.entries(cData.data)) {
            this.champions.set(key, val as ChampionKBEntry);
        }

        // Items
        this.items = new Map();
        const iData = itemsData as KBFile<Record<string, ItemKBEntry>>;
        for (const [key, val] of Object.entries(iData.data)) {
            this.items.set(key, val as ItemKBEntry);
        }

        // Matchups
        this.matchups = new Map();
        const mData = matchupsData as KBFile<Record<string, MatchupKBEntry>>;
        for (const [key, val] of Object.entries(mData.data)) {
            this.matchups.set(key, val as MatchupKBEntry);
        }

        // Rune Templates: key = "ChampId_ROLE_STYLE"
        this.runeTemplates = new Map();
        const rData = runeTemplatesData as unknown as KBFile<Record<string, { championId: string; role: string; label: string } & RuneSet>>;
        for (const [key, val] of Object.entries(rData.data)) {
            this.runeTemplates.set(key, val as unknown as RuneSet);
        }

        // Build Templates: key = "ChampId_ROLE"
        this.buildTemplates = new Map();
        const bData = buildTemplatesData as unknown as KBFile<Record<string, BuildTemplate>>;
        for (const [key, val] of Object.entries(bData.data)) {
            this.buildTemplates.set(key, val as BuildTemplate);
        }

        // Synergy & Counters
        this.synergyCounters = new Map();
        const sData = synergyCountersData as unknown as { meta: KBMeta; synergies: Record<string, SynergyEntry>; counters: Record<string, { championId: string; counters: CounterEntry[] }> };
        for (const cid of this.champions.keys()) {
            const synergiesWith = Object.values(sData.synergies).filter(s => s.champions.includes(cid));
            const counters = sData.counters[cid]?.counters || [];
            this.synergyCounters.set(cid, { synergiesWith, counters });
        }

        // Weights
        const wData = weightsData as KBFile<ScoringWeights>;
        this.weights = wData.data;
    }

    getChampion(id: string): ChampionKBEntry | undefined {
        return this.champions.get(id);
    }

    getItem(id: string): ItemKBEntry | undefined {
        return this.items.get(id);
    }

    getMatchup(champId: string, role: string, enemyId: string): MatchupKBEntry | undefined {
        const exact = this.matchups.get(`${champId}_vs_${enemyId}_${role}`);
        if (exact) return exact;

        const champ = this.champions.get(champId);
        if (champ && champ.roles.length > 0) {
            return this.matchups.get(`${champId}_vs_${enemyId}_${champ.roles[0]}`);
        }
        return undefined;
    }

    getRuneTemplate(champId: string, role: string, style: string): RuneSet | undefined {
        const exact = this.runeTemplates.get(`${champId}_${role}_${style}`);
        if (exact) return exact;

        const champ = this.champions.get(champId);
        if (champ && champ.roles.length > 0) {
            return this.runeTemplates.get(`${champId}_${champ.roles[0]}_${style}`);
        }
        return undefined;
    }

    getBuildTemplate(champId: string, role: string): BuildTemplate | undefined {
        // Exact match for secondary roles (e.g. "Champ_ROLE")
        const exact = this.buildTemplates.get(`${champId}_${role}`);
        if (exact) return exact;

        // Fallback to base champion data which holds the primary role build
        const primary = this.buildTemplates.get(champId);
        if (primary) return primary;

        return undefined;
    }

    getSynergyCounters(champId: string): SynergyCounterData | undefined {
        return this.synergyCounters.get(champId);
    }

    /** Returns all champions as an array for iteration */
    getAllChampions(): ChampionKBEntry[] {
        return Array.from(this.champions.values());
    }

    /** Returns all items as an array for tag-based resolution */
    getAllItems(): ItemKBEntry[] {
        return Array.from(this.items.values());
    }
}

// Singleton instance
let _instance: KnowledgeBase | null = null;

export function getKB(): KnowledgeBase {
    if (!_instance) {
        _instance = new KnowledgeBase();
    }
    return _instance;
}

export function reloadKB(): KnowledgeBase {
    _instance = new KnowledgeBase();
    return _instance;
}
