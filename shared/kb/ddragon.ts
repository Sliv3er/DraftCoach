// DDragon Data Fetcher
// Fetches and caches all Data Dragon data needed by the engine.
// Uses native https module (more reliable than fetch API)

import * as https from 'https';

const DDRAGON_ROOT = 'https://ddragon.leagueoflegends.com';
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn';

interface DDragonChampion {
    id: string;
    name: string;
    key: string;
    tags: string[];
    partype: string;
    stats: Record<string, number>;
}

interface DDragonItem {
    id: string;
    name: string;
    description: string;
    plaintext: string;
    tags: string | string[];
    gold: { base: number; total: number; purchasable: boolean };
    maps: Record<string, boolean>;
    stats: Record<string, number>;
    effect: Record<string, string> | null;
    from: string[];
    into: string[];
    inStore: boolean;
    hideFromAll: boolean;
}

interface DDragonRune {
    id: number;
    key: string;
    name: string;
    icon: string;
    slots: DDragonRuneSlot[];
}

interface DDragonRuneSlot {
    runes: DDragonRuneRow[];
}

interface DDragonRuneRow {
    id: number;
    key: string;
    name: string;
    icon: string;
    shortDesc: string;
    longDesc: string;
}

interface DDragonVersion {
    latest: string;
}

interface DDragonMeta {
    patch: string;
    loadedAt: Date;
}

interface DDragonCache {
    version: string;
    meta: DDragonMeta;
    champions: Map<string, DDragonChampion>;
    items: Map<string, DDragonItem>;
    runes: DDragonRune[];
    runeMap: Map<number, DDragonRune>;
    runeNameMap: Map<string, DDragonRune>;
    antiHealItemIds: Set<string>;
    uniquePassiveMap: Map<string, string[]>;
    jungleStarterIds: Set<string>;
}

let _cache: DDragonCache | null = null;
let _fetchPromise: Promise<DDragonCache> | null = null;

function fetchUrl(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            }
        }, (res: any) => {
            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk: Buffer) => data += chunk.toString());
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
    });
}

export async function fetchDDragonVersion(): Promise<string> {
    const data = await fetchUrl(`${DDRAGON_ROOT}/api/versions.json`) as string[];
    return data[0];
}

async function fetchChampions(version: string): Promise<Map<string, DDragonChampion>> {
    const data = await fetchUrl(`${DDRAGON_BASE}/${version}/data/en_US/champion.json`) as { data: Record<string, DDragonChampion> };
    const champions = new Map<string, DDragonChampion>();
    for (const [key, champ] of Object.entries(data.data)) {
        champions.set(key, champ);
    }
    return champions;
}

async function fetchItems(version: string): Promise<Map<string, DDragonItem>> {
    const data = await fetchUrl(`${DDRAGON_BASE}/${version}/data/en_US/item.json`) as { data: Record<string, DDragonItem> };
    const items = new Map<string, DDragonItem>();
    for (const [key, item] of Object.entries(data.data)) {
        items.set(key, item);
    }
    return items;
}

async function fetchRunes(version: string): Promise<DDragonRune[]> {
    const data = await fetchUrl(`${DDRAGON_BASE}/${version}/data/en_US/runesReforged.json`) as DDragonRune[];
    return data;
}

function buildDerivedData(items: Map<string, DDragonItem>): {
    antiHealItemIds: Set<string>;
    uniquePassiveMap: Map<string, string[]>;
    jungleStarterIds: Set<string>;
} {
    const antiHealItemIds = new Set<string>();
    const uniquePassiveMap = new Map<string, string[]>();
    const jungleStarterIds = new Set<string>();

    const grievousWoundsKeywords = ['grievous', 'grievous wound', 'wounds', 'anti-heal', 'anti heal'];

    for (const [id, item] of items) {
        // Skip non-purchasable / not-in-store items
        const isPurchasable = item.gold.purchasable && item.inStore !== false;

        if (item.description) {
            const descLower = item.description.toLowerCase();

            // Anti-heal detection (only purchasable items)
            if (isPurchasable && grievousWoundsKeywords.some(kw => descLower.includes(kw))) {
                if (descLower.includes('grievous') || descLower.includes('anti-heal')) {
                    antiHealItemIds.add(id);
                }
            }

            // Unique passive extraction
            const uniquePassives: string[] = [];
            const passiveMatches = item.description.match(/<li>Unique Passive: ([^<]+)/gi);
            if (passiveMatches) {
                for (const match of passiveMatches) {
                    const name = match.replace(/<li>Unique Passive: /gi, '').replace(/<[^>]+>/g, '').trim();
                    if (name) uniquePassives.push(name);
                }
            }
            if (uniquePassives.length > 0) {
                uniquePassiveMap.set(id, uniquePassives);
            }
        }

        // Jungle starter detection:
        // Must be purchasable, have Jungle tag, cost 400-500g, and NOT be a consumable/trinket/ward
        if (isPurchasable && item.gold.total >= 400 && item.gold.total <= 500) {
            const itemTags = item.tags;
            const tagsArr = typeof itemTags === 'string' ? [itemTags] : Array.isArray(itemTags) ? itemTags : [];
            const hasJungleTag = tagsArr.includes('Jungle');
            const isConsumable = tagsArr.includes('Consumable');
            const isTrinket = tagsArr.includes('Trinket');
            const isVision = tagsArr.includes('Vision');
            // Only actual jungle pet items (Scorchclaw, Gustwalker, Mosstomper)
            if (hasJungleTag && !isConsumable && !isTrinket && !isVision && tagsArr.length <= 2) {
                jungleStarterIds.add(id);
            }
        }
    }

    // Anti-heal by name (only purchasable items)
    const antiHealNames = [
        'Mortal Reminder', 'Morellonomicon', 'Thornmail', 
        'Chempunk Chainsword', 'Chemtech Putrifier', "Executioner's Calling",
        'Oblivion Orb'
    ];
    for (const [id, item] of items) {
        if (item.gold.purchasable && item.inStore !== false) {
            if (antiHealNames.some(name => item.name?.includes(name))) {
                antiHealItemIds.add(id);
            }
        }
    }

    // Jungle starter by name fallback (only purchasable)
    const jungleStarterNames = ['scorchclaw pup', 'gustwalker hatchling', 'mosstomper seedling'];
    for (const [id, item] of items) {
        if (item.gold.purchasable && item.inStore !== false) {
            if (jungleStarterNames.some(name => item.name?.toLowerCase() === name)) {
                jungleStarterIds.add(id);
            }
        }
    }

    return { antiHealItemIds, uniquePassiveMap, jungleStarterIds };
}

function buildRuneMap(runes: DDragonRune[]): {
    runeMap: Map<number, DDragonRune>;
    runeNameMap: Map<string, DDragonRune>;
} {
    const runeMap = new Map<number, DDragonRune>();
    const runeNameMap = new Map<string, DDragonRune>();

    for (const rune of runes) {
        runeMap.set(rune.id, rune);
        runeNameMap.set(rune.key, rune);
        for (const slot of rune.slots) {
            for (const r of slot.runes) {
                runeMap.set(r.id, rune);
                runeNameMap.set(r.key, rune);
            }
        }
    }

    return { runeMap, runeNameMap };
}

export async function getDDragonData(forceRefresh = false): Promise<DDragonCache> {
    if (_cache && !forceRefresh) {
        return _cache;
    }

    if (_fetchPromise) {
        return _fetchPromise;
    }

    _fetchPromise = (async () => {
        const version = await fetchDDragonVersion();
        const [champions, items, runes] = await Promise.all([
            fetchChampions(version),
            fetchItems(version),
            fetchRunes(version),
        ]);

        const derived = buildDerivedData(items);
        const { runeMap, runeNameMap } = buildRuneMap(runes);

        _cache = {
            version,
            meta: { patch: version, loadedAt: new Date() },
            champions,
            items,
            runes,
            runeMap,
            runeNameMap,
            ...derived,
        };

        return _cache;
    })();

    return _fetchPromise;
}

export function isAntiHealItem(itemId: string): boolean {
    return _cache?.antiHealItemIds.has(itemId) ?? false;
}

export function isJungleStarter(itemId: string): boolean {
    return _cache?.jungleStarterIds.has(itemId) ?? false;
}

export function getJungleStarters(): string[] {
    return Array.from(_cache?.jungleStarterIds ?? []);
}

export function getItemUniquePassives(itemId: string): string[] {
    return _cache?.uniquePassiveMap.get(itemId) ?? [];
}

export function getRuneById(id: number): DDragonRune | undefined {
    return _cache?.runeMap.get(id);
}

export function getRuneByName(name: string): DDragonRune | undefined {
    return _cache?.runeNameMap.get(name);
}

export type { DDragonChampion, DDragonItem, DDragonRune, DDragonCache, DDragonMeta };