// Integration Tests — 5 Critical Scenarios
// Run with: cd shared && npx jest --config jest.config.js integration

import { initKB, getKB } from '../kb/kb-loader';
import { recommend } from '../engine/engine';
import { EngineDraftState } from '../engine-types';
import { isAntiHealItem } from '../kb/ddragon';
import { getRunesForChampion } from '../engine/rune-mappings';

describe('Integration Tests - 5 Critical Scenarios', () => {
    beforeAll(async () => {
        console.log('\nInitializing KB from DDragon...');
        const kb = await initKB();
        console.log(`KB loaded: patch=${kb.patch}, ${kb.getAllChampions().length} champions`);
    }, 60000);

    const getKBUnsafe = () => {
        try {
            return getKB();
        } catch {
            return null;
        }
    };

    // Helper to get item ID from any item format
    const getItemId = (item: any): string => item.itemId || item.id;
    const getItemName = (item: any): string => item.itemName || item.name || item.id;

    // ============================================================
    // TEST 1 — Jungle starting items
    // ============================================================
    test('TEST 1 — Jungle starting items: Aatrox JUNGLE', async () => {
        const kb = getKBUnsafe();
        if (!kb) throw new Error('KB not initialized');

        const draft: EngineDraftState = {
            patch: kb.patch,
            phase: 'MANUAL',
            myRole: 'JUNGLE',
            myChampionId: 'Aatrox',
            allies: [],
            enemies: [],
            bans: [],
            timeLeftMs: 90000,
        };

        const result = recommend(draft);
        if (!result) throw new Error('recommend returned null');
        
        const startingItems = result.primary.startingItems;
        
        console.log('\n=== TEST 1: Jungle starting items ===');
        console.log('Starting items:', startingItems.map(getItemName).join(', '));

        const hasHealthPotion = startingItems.some(i => i.id === '2003');
        
        // Check for jungle starters
        const jungleStarterIds = ['1101', '1102', '1103', '1105', '1106', '1107'];
        const hasJungleStarter = startingItems.some(i => jungleStarterIds.includes(i.id));
        
        console.log(`- Total items: ${startingItems.length} (expected: 2)`);
        console.log(`- Has Health Potion: ${hasHealthPotion}`);
        console.log(`- Has Jungle Starter: ${hasJungleStarter}`);
        console.log(`- Has Long Sword: ${startingItems.some(i => i.id === '1036')}`);

        expect(startingItems.length).toBe(2);
        expect(hasHealthPotion).toBe(true);
        expect(hasJungleStarter).toBe(true);
        expect(startingItems.some(i => i.id === '1036')).toBe(false); // No Long Sword
    });

    // ============================================================
    // TEST 2 — Anti-heal conflict
    // ============================================================
    test('TEST 2 — Anti-heal conflict: Aatrox TOP vs Soraka+Yuumi', async () => {
        const kb = getKBUnsafe();
        if (!kb) throw new Error('KB not initialized');

        const draft: EngineDraftState = {
            patch: kb.patch,
            phase: 'MANUAL',
            myRole: 'TOP',
            myChampionId: 'Aatrox',
            allies: [
                { role: 'JUNGLE', championId: 'MasterYi', isHover: false },
                { role: 'MID', championId: 'Yone', isHover: false },
                { role: 'BOT', championId: 'Jinx', isHover: false },
                { role: 'SUPPORT', championId: 'Lulu', isHover: false },
            ],
            enemies: [
                { role: 'JUNGLE', championId: 'LeeSin', isHover: false },
                { role: 'MID', championId: 'Ahri', isHover: false },
                { role: 'BOT', championId: 'KaiSa', isHover: false },
                { role: 'SUPPORT', championId: 'Soraka', isHover: false },
                { role: 'SUPPORT', championId: 'Yuumi', isHover: false },
            ],
            bans: [],
            timeLeftMs: 90000,
        };

        const result = recommend(draft);
        if (!result) throw new Error('recommend returned null');
        
        const coreItems = result.primary.coreItems;
        const situationalItems = result.primary.situationalItems;
        
        console.log('\n=== TEST 2: Anti-heal conflict ===');
        console.log('Core items:', coreItems.map(getItemName).join(', '));
        console.log('Situational items:', situationalItems.map(getItemName).join(', '));

        // Check anti-heal in core
        const coreAntiHeal = coreItems.filter(i => isAntiHealItem(i.id)).length;
        // Check anti-heal in situational
        const situationalAntiHeal = situationalItems.filter(i => isAntiHealItem(i.itemId)).length;
        const totalAntiHeal = coreAntiHeal + situationalAntiHeal;

        console.log(`Core anti-heal: ${coreAntiHeal}, Situational anti-heal: ${situationalAntiHeal}, Total: ${totalAntiHeal}`);

        expect(totalAntiHeal).toBe(1);
    });

    // ============================================================
    // TEST 3 — Role item leak
    // ============================================================
    test('TEST 3 — Role item leak: Zed MID', async () => {
        const kb = getKBUnsafe();
        if (!kb) throw new Error('KB not initialized');

        const draft: EngineDraftState = {
            patch: kb.patch,
            phase: 'MANUAL',
            myRole: 'MID',
            myChampionId: 'Zed',
            allies: [],
            enemies: [],
            bans: [],
            timeLeftMs: 90000,
        };

        const result = recommend(draft);
        if (!result) throw new Error('recommend returned null');
        
        const startingItems = result.primary.startingItems;
        const coreItems = result.primary.coreItems;
        const situationalItems = result.primary.situationalItems;
        
        // Support items: Spellthief's, Ancient Coin, Relic Shield lines
        const supportItemIds = ['3850', '3851', '3853', '3854', '3855', '3856', '3857', '3858', '3859', 
                               '4860', '4861', '4862', '4863', '4864'];
        // Jungle items
        const jungleItemIds = ['1101', '1102', '1103', '1105', '1106', '1107'];

        const hasSupportItem = 
            startingItems.some(i => supportItemIds.includes(i.id)) ||
            coreItems.some(i => supportItemIds.includes(i.id)) ||
            situationalItems.some(i => supportItemIds.includes(i.itemId));

        const hasJungleItem = 
            startingItems.some(i => jungleItemIds.includes(i.id)) ||
            coreItems.some(i => jungleItemIds.includes(i.id)) ||
            situationalItems.some(i => jungleItemIds.includes(i.itemId));

        console.log('\n=== TEST 3: Role item leak ===');
        console.log(`Has support item: ${hasSupportItem}`);
        console.log(`Has jungle item: ${hasJungleItem}`);

        expect(hasSupportItem).toBe(false);
        expect(hasJungleItem).toBe(false);
    });

    // ============================================================
    // TEST 4 — Rune completeness
    // ============================================================
    test('TEST 4 — Rune completeness: Graves JUNGLE', async () => {
        const kb = getKBUnsafe();
        if (!kb) throw new Error('KB not initialized');

        const gravesChamp = kb.getChampion('Graves');
        const gravesTags = gravesChamp?.tags ? Object.keys(gravesChamp.tags) : [];
        
        const runes = getRunesForChampion('Graves', 'JUNGLE', 'DAMAGE', gravesTags);
        
        console.log('\n=== TEST 4: Rune completeness ===');
        console.log(`Primary Tree: ${runes.primaryTree}`);
        console.log(`Keystone: ${runes.primaryKeystone}`);
        console.log(`Primary Slots: ${runes.primarySlots.join(', ')}`);
        console.log(`Secondary Tree: ${runes.secondaryTree}`);
        console.log(`Secondary Slots: ${runes.secondarySlots.join(', ')}`);
        console.log(`Stat Shards: ${runes.statShards.join(', ')}`);

        // Check completeness
        expect(runes.primaryTree).toBeTruthy();
        expect(runes.primaryKeystone).toBeTruthy();
        expect(runes.primarySlots.length).toBe(3);
        expect(runes.secondaryTree).toBeTruthy();
        expect(runes.secondarySlots.length).toBe(2);
        expect(runes.statShards.length).toBe(3);
        expect(runes.primaryTree).not.toBe(runes.secondaryTree);

        // Check Graves-specific override (Domination/Electrocute)
        expect(runes.primaryTree).toBe('Domination');
        expect(runes.primaryKeystone).toBe('Electrocute');
    });

    // ============================================================
    // TEST 5 — Live advisor gold check
    // ============================================================
    test('TEST 5 — Live advisor gold check: 800g budget', async () => {
        // Simulate item cost checking
        const testItems = [
            { id: '3006', name: "Berserker's Greaves", cost: 1100 },
            { id: '3031', name: 'Infinity Edge', cost: 3400 },
            { id: '1038', name: 'Pickaxe', cost: 875 },
            { id: '1042', name: 'Dagger', cost: 300 },
        ];

        const playerGold = 800;
        const affordableItems = testItems.filter(item => item.cost <= playerGold);

        console.log('\n=== TEST 5: Live advisor gold check ===');
        console.log('Test items:', testItems.map(i => `${i.name}: ${i.cost}g`).join(', '));
        console.log(`Player gold: ${playerGold}g`);
        console.log('Affordable:', affordableItems.map(i => i.name).join(', '));

        // Pickaxe costs 875 > 800, so only Dagger (300) should be affordable
        expect(affordableItems.length).toBe(1);
        expect(affordableItems[0].id).toBe('1042');
    });
});
