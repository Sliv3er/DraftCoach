// Rune Export — Generates rune import payloads for the LoL client.
// Uses the LCU API endpoint to set rune pages directly.

import * as https from 'https';

export interface RuneExportPayload {
    name: string;
    primaryStyleId: number;
    subStyleId: number;
    selectedPerkIds: number[];
    current: boolean;
}

// Rune tree name → Riot style ID mapping
const STYLE_IDS: Record<string, number> = {
    'Precision': 8000,
    'Domination': 8100,
    'Sorcery': 8200,
    'Resolve': 8400,
    'Inspiration': 8300,
};

// Common rune name → perk ID mapping (Season 2026 values)
const PERK_IDS: Record<string, number> = {
    // Precision Keystones
    'Press the Attack': 8005, 'Lethal Tempo': 8008, 'Fleet Footwork': 8021, 'Conqueror': 8010,
    // Precision Minor
    'Overheal': 9101, 'Triumph': 9111, 'Presence of Mind': 8009,
    'Legend: Alacrity': 9104, 'Legend: Tenacity': 9105, 'Legend: Bloodline': 9103,
    'Coup de Grace': 8014, 'Cut Down': 8017, 'Last Stand': 8299,

    // Domination Keystones
    'Electrocute': 8112, 'Dark Harvest': 8128, 'Hail of Blades': 9923,
    // Domination Minor
    'Cheap Shot': 8126, 'Taste of Blood': 8139, 'Sudden Impact': 8143,
    'Zombie Ward': 8136, 'Ghost Poro': 8120, 'Eyeball Collection': 8138,
    'Treasure Hunter': 8135, 'Ingenious Hunter': 8134, 'Relentless Hunter': 8105, 'Ultimate Hunter': 8106,

    // Sorcery Keystones
    'Summon Aery': 8214, 'Arcane Comet': 8229, 'Phase Rush': 8230,
    // Sorcery Minor
    'Nullifying Orb': 8224, 'Manaflow Band': 8226, 'Nimbus Cloak': 8275,
    'Transcendence': 8210, 'Celerity': 8234, 'Absolute Focus': 8233,
    'Scorch': 8237, 'Waterwalking': 8232, 'Gathering Storm': 8236,

    // Resolve Keystones
    'Grasp of the Undying': 8437, 'Aftershock': 8439, 'Guardian': 8465,
    // Resolve Minor
    'Demolish': 8446, 'Font of Life': 8463, 'Shield Bash': 8401,
    'Conditioning': 8429, 'Second Wind': 8444, 'Bone Plating': 8473,
    'Overgrowth': 8451, 'Revitalize': 8453, 'Unflinching': 8242,

    // Inspiration Keystones
    'Glacial Augment': 8351, 'Unsealed Spellbook': 8360, 'First Strike': 8369,
    // Inspiration Minor
    'Hextech Flashtraption': 8306, 'Magical Footwear': 8304, 'Cash Back': 8321,
    'Triple Tonic': 8313, 'Time Warp Tonic': 8352, 'Biscuit Delivery': 8345,
    'Cosmic Insight': 8347, 'Approach Velocity': 8410, 'Jack of All Trades': 8316,

    // Stat Shards
    'Adaptive Force': 5008, 'Attack Speed': 5005, 'Ability Haste': 5007,
    'Health': 5001, 'Armor': 5002, 'Magic Resist': 5003, 'Health Scaling': 5011,
    'Tenacity and Slow Resist': 5013, 'Movement Speed': 5010,
};

/**
 * Convert a BuildPlan's runes to an LCU-compatible payload.
 */
export function buildRunePayload(
    championName: string,
    planLabel: string,
    runes: { primaryTree: string; primaryKeystone: string; primarySlots: string[]; secondaryTree: string; secondarySlots: string[]; statShards: string[] }
): RuneExportPayload | null {
    const primaryStyleId = STYLE_IDS[runes.primaryTree];
    const subStyleId = STYLE_IDS[runes.secondaryTree];
    if (!primaryStyleId || !subStyleId) return null;

    const perkIds: number[] = [];

    // Keystone
    const keystoneId = PERK_IDS[runes.primaryKeystone];
    if (!keystoneId) return null;
    perkIds.push(keystoneId);

    // Primary slots
    for (const slot of runes.primarySlots) {
        const id = PERK_IDS[slot];
        if (id) perkIds.push(id);
    }

    // Secondary slots
    for (const slot of runes.secondarySlots) {
        const id = PERK_IDS[slot];
        if (id) perkIds.push(id);
    }

    // Stat shards
    for (const shard of runes.statShards) {
        const id = PERK_IDS[shard];
        if (id) perkIds.push(id);
    }

    return {
        name: `DC: ${championName} ${planLabel}`,
        primaryStyleId,
        subStyleId,
        selectedPerkIds: perkIds,
        current: true,
    };
}

/**
 * Export runes to League client via LCU API.
 * Finds or creates a rune page and sets it.
 */
export async function exportRunesToClient(
    payload: RuneExportPayload,
    port: number,
    password: string
): Promise<{ ok: boolean; error?: string }> {
    const auth = Buffer.from(`riot:${password}`).toString('base64');

    try {
        // Get existing pages
        const pages = await lcuGet<any[]>(`/lol-perks/v1/pages`, port, auth);
        if (!pages) return { ok: false, error: 'Cannot read rune pages' };

        // Find DraftCoach page to overwrite
        const dcPage = pages.find((p: any) => p.name.startsWith('DC: '));

        if (dcPage) {
            // Update existing page
            await lcuPut(`/lol-perks/v1/pages/${dcPage.id}`, port, auth, payload);
        } else {
            // Check if we can create a new page
            if (pages.length >= 25) {
                // Delete oldest non-preset page
                const deletable = pages.filter((p: any) => p.isDeletable);
                if (deletable.length > 0) {
                    await lcuDelete(`/lol-perks/v1/pages/${deletable[0].id}`, port, auth);
                }
            }
            await lcuPost(`/lol-perks/v1/pages`, port, auth, payload);
        }

        // Set as current
        await lcuPut(`/lol-perks/v1/currentpage`, port, auth, payload);

        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message || 'Export failed' };
    }
}

// ─── LCU HTTP Helpers ────────────────────────────────────────────────

function lcuRequest(method: string, path: string, port: number, auth: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port,
            path,
            method,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            rejectUnauthorized: false,
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function lcuGet<T>(path: string, port: number, auth: string): Promise<T | null> {
    return lcuRequest('GET', path, port, auth);
}

function lcuPost(path: string, port: number, auth: string, body: any): Promise<any> {
    return lcuRequest('POST', path, port, auth, body);
}

function lcuPut(path: string, port: number, auth: string, body: any): Promise<any> {
    return lcuRequest('PUT', path, port, auth, body);
}

function lcuDelete(path: string, port: number, auth: string): Promise<any> {
    return lcuRequest('DELETE', path, port, auth);
}
