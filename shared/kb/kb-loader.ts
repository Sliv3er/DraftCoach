// Knowledge Base Loader
// Uses DDragon as the single source of truth for all data.
// Maintains backward compatibility with existing engine imports.

import {
    ChampionKBEntry, ItemKBEntry, MatchupKBEntry, BuildTemplate,
    SynergyCounterData, ScoringWeights, KBFile, KBMeta, RuneSet,
    SynergyEntry, CounterEntry, EngineRole
} from '../engine-types';
import { getDDragonData, DDragonChampion, DDragonItem, DDragonRune } from './ddragon';

// Types for internal use that map DDragon to engine types
interface ChampionTagData {
    engage: number;
    peel: number;
    frontline: number;
    burst: number;
    sustained: number;
    poke: number;
    healShield: number;
    splitpush: number;
    ccDensity: number;
    mobility: number;
    range: number;
    damageType: 'AD' | 'AP' | 'MIXED' | 'TRUE';
    scalingCurve: 'EARLY' | 'MID' | 'LATE';
}

// Internal state that gets populated after async init
let _ddragonData: Awaited<ReturnType<typeof getDDragonData>> | null = null;

function mapDDragonChampionToKBEntry(champ: DDragonChampion): ChampionKBEntry {
    // Determine champion roles from tags
    const tags = champ.tags || [];
    const roles: EngineRole[] = [];

    if (tags.includes('Fighter')) roles.push('TOP', 'JUNGLE');
    if (tags.includes('Tank')) roles.push('TOP', 'JUNGLE', 'SUPPORT');
    if (tags.includes('Assassin')) roles.push('MID', 'JUNGLE');
    if (tags.includes('Mage')) roles.push('MID', 'BOT', 'SUPPORT');
    if (tags.includes('Marksman')) roles.push('BOT');
    if (tags.includes('Support')) roles.push('SUPPORT');

    // Default to TOP if no clear role
    if (roles.length === 0) roles.push('TOP');

    // Infer damage type from partype and stats
    let damageType: 'AD' | 'AP' | 'MIXED' | 'TRUE' = 'AD';
    if (champ.partype === 'Mana') {
        // Most mana champs are AP, but some are AD
        damageType = 'AP';
    } else if (champ.partype === 'Energy') {
        damageType = 'AD';
    } else if (!champ.partype || champ.partype === 'None') {
        // Could be mixed or true damage
        damageType = 'AD'; // Default to AD for manaless
    }

    // Estimate scaling based on base stats
    let scalingCurve: 'EARLY' | 'MID' | 'LATE' = 'MID';
    if (tags.includes('Marksman') || tags.includes('Mage')) {
        scalingCurve = 'LATE';
    } else if (tags.includes('Assassin') || tags.includes('Fighter')) {
        scalingCurve = 'MID';
    } else if (tags.includes('Tank')) {
        scalingCurve = 'EARLY';
    }

    return {
        id: champ.id,
        name: champ.name,
        roles,
        tags: {
            engage: 50,
            peel: tags.includes('Support') || tags.includes('Tank') ? 70 : 30,
            frontline: tags.includes('Tank') || tags.includes('Fighter') ? 70 : 20,
            burst: tags.includes('Assassin') || tags.includes('Mage') ? 80 : 40,
            sustained: tags.includes('Fighter') || tags.includes('Marksman') ? 70 : 40,
            poke: tags.includes('Mage') || tags.includes('Marksman') ? 70 : 30,
            healShield: tags.includes('Support') ? 60 : 20,
            splitpush: tags.includes('Fighter') || tags.includes('Marksman') ? 60 : 30,
            ccDensity: tags.includes('Tank') || tags.includes('Support') ? 70 : 30,
            mobility: tags.includes('Assassin') ? 80 : 40,
            range: tags.includes('Mage') || tags.includes('Marksman') ? 80 : 30,
            damageType,
            scalingCurve,
            threatWindow: { start: 'EARLY', end: 'LATE' }
        },
        laneStrengths: {}
    };
}

function mapDDragonItemToKBEntry(item: DDragonItem, itemId: string): ItemKBEntry {
    // Determine spike timing from cost
    let spikeTiming: 'EARLY' | 'MID' | 'LATE' = 'MID';
    if (item.gold.total <= 1100) spikeTiming = 'EARLY';
    else if (item.gold.total >= 3000) spikeTiming = 'LATE';

    // Parse tags
    let itemTags: string[] = [];
    if (typeof item.tags === 'string') {
        itemTags = item.tags ? item.tags.split(' ') : [];
    } else if (Array.isArray(item.tags)) {
        itemTags = item.tags;
    }

    // Build passive keywords from description
    const passiveKeywords: string[] = [];
    if (item.description) {
        // Extract unique passive names
        const matches = item.description.match(/<li>Unique Passive: ([^<]+)/gi);
        if (matches) {
            for (const match of matches) {
                const name = match.replace(/<li>Unique Passive: /gi, '').replace(/<[^>]+>/g, '').trim();
                if (name) passiveKeywords.push(name);
            }
        }
        // Add Grievous Wounds keyword if applicable
        if (item.description.toLowerCase().includes('grievous')) {
            passiveKeywords.push('GRIEVOUS_WOUNDS');
        }
    }

    return {
        id: itemId,
        name: item.name,
        tags: itemTags,
        cost: item.gold.total,
        spikeTiming,
        statProfile: item.stats || {},
        passiveKeywords
    };
}

// Build rune templates from DDragon data
function buildRuneTemplates(champ: ChampionKBEntry): Map<string, RuneSet> {
    const templates = new Map<string, RuneSet>();

    // Common rune sets based on champion class
    const runeSets: Record<string, RuneSet> = {
        'DAMAGE': {
            primaryTree: 'Precision',
            primaryKeystone: 'Press the Attack',
            primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'],
            secondaryTree: 'Domination',
            secondarySlots: ['Taste of Blood', 'Treasure Hunter'],
            statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
        },
        'SAFETY': {
            primaryTree: 'Precision',
            primaryKeystone: 'Fleet Footwork',
            primarySlots: ['Overheal', 'Legend: Bloodline', 'Cut Down'],
            secondaryTree: 'Resolve',
            secondarySlots: ['Shield Bash', 'Revitalize'],
            statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
        },
        'UTILITY': {
            primaryTree: 'Sorcery',
            primaryKeystone: 'Arcane Comet',
            primarySlots: ['Manaflow Band', 'Transcendence', 'Scorch'],
            secondaryTree: 'Precision',
            secondarySlots: ['Presence of Mind', 'Cut Down'],
            statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
        }
    };

    // Apply defaults for this champion
    for (const [label, runes] of Object.entries(runeSets)) {
        templates.set(`${champ.id}_${champ.roles[0] || 'TOP'}_${label}`, runes);
    }

    return templates;
}

// Default weights for scoring
const DEFAULT_WEIGHTS: ScoringWeights = {
    laneMatchup: 0.20,
    teamNeeds: 0.15,
    teamDmgBalance: 0.10,
    enemyThreat: 0.15,
    synergy: 0.10,
    scalingMatch: 0.08,
    ccDensity: 0.07,
    rangeAdvantage: 0.08,
    mobilityGap: 0.07,
};

// Interface for KB - used by engine modules
export interface KnowledgeBase {
    readonly patch: string;
    readonly champions: Map<string, ChampionKBEntry>;
    readonly items: Map<string, ItemKBEntry>;
    readonly matchups: Map<string, MatchupKBEntry>;
    readonly runeTemplates: Map<string, RuneSet>;
    readonly buildTemplates: Map<string, BuildTemplate>;
    readonly synergyCounters: Map<string, SynergyCounterData>;
    readonly weights: ScoringWeights;
    readonly meta: KBMeta;
    getChampion(id: string): ChampionKBEntry | undefined;
    getItem(id: string): ItemKBEntry | undefined;
    getMatchup(champId: string, role: string, enemyId: string): MatchupKBEntry | undefined;
    getRuneTemplate(champId: string, role: string, style: string): RuneSet | undefined;
    getBuildTemplate(champId: string, role: string): BuildTemplate | undefined;
    getSynergyCounters(champId: string): SynergyCounterData | undefined;
    getAllChampions(): ChampionKBEntry[];
    getAllItems(): ItemKBEntry[];
}

// Build class that holds the KB data after initialization
class KBImpl implements KnowledgeBase {
    readonly patch: string;
    readonly champions: Map<string, ChampionKBEntry>;
    readonly items: Map<string, ItemKBEntry>;
    readonly matchups: Map<string, MatchupKBEntry>;
    readonly runeTemplates: Map<string, RuneSet>;
    readonly buildTemplates: Map<string, BuildTemplate>;
    readonly synergyCounters: Map<string, SynergyCounterData>;
    readonly weights: ScoringWeights;
    readonly meta: KBMeta;
    readonly ddragon: {
        champions: Map<string, DDragonChampion>;
        items: Map<string, DDragonItem>;
        runes: DDragonRune[];
    };

    constructor(dd: Awaited<ReturnType<typeof getDDragonData>>) {
        this.patch = dd.version;
        this.meta = {
            patch: dd.version,
            buildHash: 'ddragon',
            createdAt: new Date().toISOString(),
            source: 'ddragon',
            checksum: '',
            previousPatch: '',
            rollbackAvailable: false
        };
        this.weights = DEFAULT_WEIGHTS;
        
        // Map champions
        this.champions = new Map();
        for (const [key, champ] of dd.champions) {
            this.champions.set(key, mapDDragonChampionToKBEntry(champ));
        }

        // Map items
        this.items = new Map();
        for (const [key, item] of dd.items) {
            if (item.gold.purchasable && item.inStore !== false) {
                this.items.set(key, mapDDragonItemToKBEntry(item, key));
            }
        }

        // Build rune templates from champions
        this.runeTemplates = new Map();
        for (const champ of this.champions.values()) {
            const templates = buildRuneTemplates(champ);
            for (const [key, runes] of templates) {
                this.runeTemplates.set(key, runes);
            }
        }

        // Build templates - generate dynamically from DDragon items based on champion tags
        this.buildTemplates = new Map();
        const allItemsList = Array.from(this.items.values());
        for (const champ of this.champions.values()) {
            const champTags = champ.tags ? Object.keys(champ.tags).filter(k => typeof champ.tags[k as keyof typeof champ.tags] === 'number') : [];
            for (const role of champ.roles) {
                const template = generateBuildTemplate(champ, role, champTags, this.runeTemplates, allItemsList);
                this.buildTemplates.set(`${champ.id}_${role}`, template);
                if (!this.buildTemplates.has(champ.id)) {
                    this.buildTemplates.set(champ.id, template);
                }
            }
        }

        // Empty matchups and synergy (not available from DDragon)
        this.matchups = new Map();
        this.synergyCounters = new Map();

        // Store DDragon raw data
        this.ddragon = {
            champions: dd.champions,
            items: dd.items,
            runes: dd.runes
        };
    }

    getChampion(id: string): ChampionKBEntry | undefined {
        return this.champions.get(id);
    }

    getItem(id: string): ItemKBEntry | undefined {
        return this.items.get(id);
    }

    getMatchup(champId: string, role: string, enemyId: string): MatchupKBEntry | undefined {
        return undefined; // Not available from DDragon
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
        const exact = this.buildTemplates.get(`${champId}_${role}`);
        if (exact) return exact;
        return this.buildTemplates.get(champId);
    }

    getSynergyCounters(champId: string): SynergyCounterData | undefined {
        return undefined;
    }

    getAllChampions(): ChampionKBEntry[] {
        return Array.from(this.champions.values());
    }

    getAllItems(): ItemKBEntry[] {
        return Array.from(this.items.values());
    }
}

function getDefaultStartingItems(role: string): { id: string; name: string }[] {
    switch (role) {
        case 'JUNGLE':
            return [
                { id: '1103', name: 'Mosstomper Seedling' },
                { id: '2003', name: 'Health Potion' }
            ];
        case 'SUPPORT':
            return [
                { id: '3865', name: 'World Atlas' },
                { id: '2003', name: 'Health Potion' }
            ];
        case 'BOT':
            return [
                { id: '1055', name: "Doran's Blade" },
                { id: '2003', name: 'Health Potion' }
            ];
        case 'MID':
            return [
                { id: '1056', name: "Doran's Ring" },
                { id: '2003', name: 'Health Potion' }
            ];
        default: // TOP
            return [
                { id: '1055', name: "Doran's Blade" },
                { id: '2003', name: 'Health Potion' }
            ];
    }
}

function getDefaultRuneSet(): RuneSet {
    return {
        primaryTree: 'Precision',
        primaryKeystone: 'Press the Attack',
        primarySlots: ['Overheal', 'Legend: Bloodline', 'Coup de Grace'],
        secondaryTree: 'Domination',
        secondarySlots: ['Taste of Blood', 'Treasure Hunter'],
        statShards: ['Adaptive Force', 'Adaptive Force', 'Health']
    };
}

function getDefaultSkillOrder(): { first3: string[]; maxOrder: string[] } {
    return {
        first3: ['Q', 'W', 'E'],
        maxOrder: ['Q', 'W', 'E']
    };
}

function getDefaultSkillOrderTyped(): { first3: import('../engine-types').Ability[]; maxOrder: import('../engine-types').Ability[] } {
    return {
        first3: ['Q', 'W', 'E'] as import('../engine-types').Ability[],
        maxOrder: ['Q', 'W', 'E'] as import('../engine-types').Ability[]
    };
}

function getDefaultSummonerSpells(role: string): [string, string] {
    switch (role) {
        case 'JUNGLE':
            return ['Smite', 'Flash'];
        case 'SUPPORT':
            return ['Exhaust', 'Flash'];
        default:
            return ['Flash', 'Exhaust'];
    }
}

function getDefaultBoots(role: string): { id: string; name: string } {
    return { id: '3006', name: 'Berserker\'s Greaves' };
}

function generateBuildTemplate(
    champ: ChampionKBEntry,
    role: string,
    champTags: string[],
    runeTemplates: Map<string, RuneSet>,
    allItems: ItemKBEntry[]
): BuildTemplate {
    const coreItems: { id: string; name: string; reason: string }[] = [];
    const situationalPool: { id: string; name: string; triggerTag: string }[] = [];

    const hasTag = (search: string) => champTags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const byTag = (tag: string) => allItems.filter(i => i.tags.includes(tag));

    if (hasTag('Tank') || (hasTag('Fighter') && role !== 'MID' && role !== 'BOT')) {
        coreItems.push(...byTag('Health').slice(0, 3).map(i => ({ id: i.id, name: i.name, reason: 'Core tank item' })));
        coreItems.push(...byTag('Armor').filter(i => i.cost > 1000 && i.cost < 3000).slice(0, 2).map(i => ({ id: i.id, name: i.name, reason: 'Armor for tankiness' })));
    } else if (hasTag('Assassin')) {
        coreItems.push(...byTag('CriticalStrike').slice(0, 2).map(i => ({ id: i.id, name: i.name, reason: 'Critical strike for burst' })));
        coreItems.push(...byTag('LifeSteal').slice(0, 1).map(i => ({ id: i.id, name: i.name, reason: 'Lifesteal for sustain' })));
    } else if (hasTag('Mage') || hasTag('APC')) {
        coreItems.push(...byTag('SpellDamage').filter(i => i.cost > 2500).slice(0, 2).map(i => ({ id: i.id, name: i.name, reason: 'AP damage core' })));
        coreItems.push(...byTag('Mana').filter(i => i.cost > 1000).slice(0, 1).map(i => ({ id: i.id, name: i.name, reason: 'Mana sustain' })));
    } else if (role === 'BOT' || hasTag('Marksman')) {
        coreItems.push(...byTag('CriticalStrike').slice(0, 2).map(i => ({ id: i.id, name: i.name, reason: 'ADC core crit' })));
        coreItems.push(...byTag('AttackSpeed').slice(0, 2).map(i => ({ id: i.id, name: i.name, reason: 'Attack speed for DPS' })));
    } else if (role === 'SUPPORT') {
        coreItems.push(...byTag('Health').slice(0, 2).map(i => ({ id: i.id, name: i.name, reason: 'Support health' })));
        coreItems.push(...byTag('ManaRegen').slice(0, 1).map(i => ({ id: i.id, name: i.name, reason: 'Mana regen for support' })));
    } else {
        coreItems.push(...byTag('Damage').filter(i => i.cost > 1000).slice(0, 3).map(i => ({ id: i.id, name: i.name, reason: 'AD core item' })));
    }

    for (const tag of ['Health', 'Armor', 'MagicResist', 'LifeSteal', 'SpellVamp', 'CriticalStrike', 'AttackSpeed']) {
        const items = byTag(tag).filter(i => !coreItems.find(c => c.id === i.id)).slice(0, 3);
        for (const item of items) {
            situationalPool.push({ id: item.id, name: item.name, triggerTag: tag });
        }
    }

    return {
        championId: champ.id,
        role: role as EngineRole,
        variants: {
            'DAMAGE': {
                label: 'DAMAGE',
                startingItems: getDefaultStartingItems(role),
                coreItems: coreItems.slice(0, 4),
                situationalPool,
                runes: runeTemplates.get(`${champ.id}_${role}_DAMAGE`) || getDefaultRuneSet(),
                summonerSpells: getDefaultSummonerSpells(role),
                skillOrder: getDefaultSkillOrderTyped(),
                bootChoice: getDefaultBoots(role),
            },
            'SAFETY': {
                label: 'SAFETY',
                startingItems: getDefaultStartingItems(role),
                coreItems: coreItems.slice(0, 4),
                situationalPool,
                runes: runeTemplates.get(`${champ.id}_${role}_SAFETY`) || getDefaultRuneSet(),
                summonerSpells: getDefaultSummonerSpells(role),
                skillOrder: getDefaultSkillOrderTyped(),
                bootChoice: getDefaultBoots(role),
            },
            'UTILITY': {
                label: 'UTILITY',
                startingItems: getDefaultStartingItems(role),
                coreItems: coreItems.slice(0, 4),
                situationalPool,
                runes: runeTemplates.get(`${champ.id}_${role}_UTILITY`) || getDefaultRuneSet(),
                summonerSpells: getDefaultSummonerSpells(role),
                skillOrder: getDefaultSkillOrderTyped(),
                bootChoice: getDefaultBoots(role),
            }
        }
    };
}

// Singleton instance - initialized synchronously after first async load
let _instance: KBImpl | null = null;
let _initPromise: Promise<KBImpl> | null = null;
let _initialized = false;

/**
 * Initialize the KnowledgeBase - call this ONCE at app startup.
 * After calling this, use getKB_Sync() to access the KB.
 */
export async function initKB(): Promise<KBImpl> {
    if (_instance && _initialized) {
        return _instance;
    }

    const dd = await getDDragonData();
    _instance = new KBImpl(dd);
    _initialized = true;
    return _instance;
}

/**
 * Synchronous access to KB - ONLY use after calling initKB() at startup.
 * @throws Error if KB not initialized
 */
export function getKB(): KBImpl {
    if (!_instance) {
        throw new Error('KB not initialized. Call initKB() at app startup before using the engine.');
    }
    return _instance;
}

// Backward compatibility alias
export const getKB_Sync = getKB;

export async function reloadKB(): Promise<KBImpl> {
    const dd = await getDDragonData(true);
    _instance = new KBImpl(dd);
    _initialized = true;
    return _instance;
}