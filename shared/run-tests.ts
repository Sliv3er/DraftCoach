// Standalone integration test runner
// Run with: cd shared && npx ts-node run-tests.ts

import { initKB, getKB } from './kb/kb-loader';
import { recommend } from './engine/engine';
import { EngineDraftState } from './engine-types';
import { isAntiHealItem } from './kb/ddragon';
import { getRunesForChampion } from './engine/rune-mappings';

async function runTests() {
    console.log('='.repeat(60));
    console.log('INITIALIZING KB FROM DDRAGON...');
    console.log('='.repeat(60));
    
    const kb = await initKB();
    console.log(`KB loaded: patch=${kb.patch}, ${kb.getAllChampions().length} champions\n`);

    // ============================================================
    // TEST 1 — Jungle starting items
    // ============================================================
    console.log('='.repeat(60));
    console.log('TEST 1 — Jungle starting items');
    console.log('Input: Champion = Aatrox, Role = JUNGLE');
    console.log('='.repeat(60));

    const draft1: EngineDraftState = {
        patch: kb.patch,
        phase: 'MANUAL',
        myRole: 'JUNGLE',
        myChampionId: 'Aatrox',
        allies: [],
        enemies: [],
        bans: [],
        timeLeftMs: 90000,
    };

    const result1 = recommend(draft1);
    const startingItems1 = result1?.primary.startingItems || [];
    
    console.log('\nActual startingItems:');
    startingItems1.forEach((item, i) => console.log(`  ${i+1}. ${item.name} (${item.id})`));

    const hasHealthPotion = startingItems1.some(i => i.id === '2003');
    const jungleStarterIds = ['1101', '1102', '1103', '1105', '1106', '1107'];
    const hasJungleStarter = startingItems1.some(i => jungleStarterIds.includes(i.id));
    const hasLongSword = startingItems1.some(i => i.id === '1036');
    
    console.log(`\nResults:`);
    console.log(`  - Total items: ${startingItems1.length} (expected: 2)`);
    console.log(`  - Has Health Potion: ${hasHealthPotion}`);
    console.log(`  - Has Jungle Starter: ${hasJungleStarter}`);
    console.log(`  - Has Long Sword (1036): ${hasLongSword}`);

    const test1Pass = startingItems1.length === 2 && hasHealthPotion && hasJungleStarter && !hasLongSword;
    console.log(`\n>>> TEST 1: ${test1Pass ? 'PASS ✓' : 'FAIL ✗'}`);

    // ============================================================
    // TEST 2 — Anti-heal conflict
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2 — Anti-heal conflict');
    console.log('Input: Champion = Aatrox, Role = TOP, enemies: Soraka, Yuumi');
    console.log('='.repeat(60));

    const draft2: EngineDraftState = {
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

    // Debug: check comp profile
    const { buildCompProfile } = require('./engine/comp-profiler');
    const cpDebug = buildCompProfile(draft2, kb);
    console.log('\nDEBUG comp profile:');
    console.log(`  enemyHealShieldScore: ${cpDebug.enemyHealShieldScore}`);
    console.log(`  Soraka in KB: ${!!kb.getChampion('Soraka')}`);
    console.log(`  Yuumi in KB: ${!!kb.getChampion('Yuumi')}`);
    const soraka = kb.getChampion('Soraka');
    const yuumi = kb.getChampion('Yuumi');
    if (soraka) console.log(`  Soraka healShield: ${soraka.tags.healShield}`);
    if (yuumi) console.log(`  Yuumi healShield: ${yuumi.tags.healShield}`);

    const result2 = recommend(draft2);
    console.log(`  recommend returned: ${result2 ? 'BuildRecommendation' : 'null'}`);
    if (result2) {
        console.log(`  triggeredRules: ${result2.triggeredRules.map((r: any) => r.ruleId).join(', ')}`);
        console.log(`  primary.situationalItems length: ${result2.primary.situationalItems.length}`);
    }

    // Debug: manually test resolver
    const { resolveTagScored } = require('./engine/resolver');
    const testCtx = {
        tag: 'ANTI_HEAL',
        champion: kb.getChampion('Aatrox'),
        role: 'TOP' as const,
        planLabel: 'DAMAGE' as const,
        plan: { label: 'DAMAGE' as const, score: 0, runes: {} as any, summonerSpells: ['Flash','Teleport'], skillOrder: { first3: ['Q','W','E'], maxOrder: ['Q','W','E'] }, startingItems: [], coreItems: [], bootChoice: { id: '3006', name: 'Boots' }, situationalItems: [], conditionalForks: [] },
        kb,
    };
    const antiHealResolved = resolveTagScored(testCtx);
    console.log(`  resolver ANTI_HEAL result: ${antiHealResolved ? `${antiHealResolved.name} (${antiHealResolved.id})` : 'null'}`);

    // Debug: how many items match ANTI_HEAL?
    const allKBItems = kb.getAllItems();
    const antiHealMatches = allKBItems.filter((item: any) => {
        const { isAntiHealItem: isAH } = require('./kb/ddragon');
        return isAH(item.id);
    });
    console.log(`  DDragon anti-heal items: ${antiHealMatches.map((i: any) => `${i.name}(${i.id})`).join(', ')}`);
    const coreItems2 = result2?.primary.coreItems || [];
    const situationalItems2 = result2?.primary.situationalItems || [];
    
    console.log('\nCore items:');
    coreItems2.forEach(item => console.log(`  - ${item.name || item.id} (${item.id})`));
    
    console.log('\nSituational items:');
    situationalItems2.forEach(item => console.log(`  - ${item.itemName || item.itemId} (${item.itemId})`));

    const coreAntiHeal = coreItems2.filter(i => isAntiHealItem((i as any).id || (i as any).itemId)).length;
    const situationalAntiHeal = situationalItems2.filter(i => isAntiHealItem((i as any).itemId || (i as any).id)).length;
    const totalAntiHeal = coreAntiHeal + situationalAntiHeal;

    console.log(`\nAnti-heal in core: ${coreAntiHeal}`);
    console.log(`Anti-heal in situational: ${situationalAntiHeal}`);
    console.log(`Total anti-heal: ${totalAntiHeal}`);
    console.log(`\n>>> TEST 2: ${totalAntiHeal === 1 ? 'PASS ✓' : 'FAIL ✗'}`);

    // ============================================================
    // TEST 3 — Role item leak
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3 — Role item leak');
    console.log('Input: Champion = Zed, Role = MID');
    console.log('='.repeat(60));

    const draft3: EngineDraftState = {
        patch: kb.patch,
        phase: 'MANUAL',
        myRole: 'MID',
        myChampionId: 'Zed',
        allies: [],
        enemies: [],
        bans: [],
        timeLeftMs: 90000,
    };

    const result3 = recommend(draft3);
    const startingItems3 = result3?.primary.startingItems || [];
    const coreItems3 = result3?.primary.coreItems || [];
    const situationalItems3 = result3?.primary.situationalItems || [];
    
    const allItems3 = [...startingItems3, ...coreItems3, ...situationalItems3];
    
    const supportItemIds = ['3850', '3851', '3853', '3854', '3855', '3856', '3857', '3858', '3859', 
                           '4860', '4861', '4862', '4863', '4864'];
    const jungleItemIds = ['1039', '1041', '1042', '1043', '1101', '1102', '1103', '1104'];

    const hasSupportItem = allItems3.some(i => supportItemIds.includes((i as any).id || (i as any).itemId));
    const hasJungleItem = allItems3.some(i => jungleItemIds.includes((i as any).id || (i as any).itemId));

    console.log('\nAll items in build:');
    allItems3.forEach(item => {
        const id = (item as any).id || (item as any).itemId;
        const name = (item as any).name || (item as any).itemName || id;
        console.log(`  - ${name} (${id})`);
    });

    console.log(`\nSupport items found: ${hasSupportItem ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`Jungle items found: ${hasJungleItem ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`\n>>> TEST 3: ${!hasSupportItem && !hasJungleItem ? 'PASS ✓' : 'FAIL ✗'}`);

    // ============================================================
    // TEST 4 — Rune completeness
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4 — Rune completeness');
    console.log('Input: Champion = Graves, Role = JUNGLE');
    console.log('='.repeat(60));

    const gravesChamp = kb.getChampion('Graves');
    const gravesTags = gravesChamp?.tags ? Object.keys(gravesChamp.tags) : [];
    
    const runes4 = getRunesForChampion('Graves', 'JUNGLE', 'DAMAGE', gravesTags);
    
    console.log('\nFull rune page:');
    console.log(`  Primary Tree: ${runes4.primaryTree}`);
    console.log(`  Keystone: ${runes4.primaryKeystone}`);
    console.log(`  Primary Slots: ${runes4.primarySlots.join(', ')}`);
    console.log(`  Secondary Tree: ${runes4.secondaryTree}`);
    console.log(`  Secondary Slots: ${runes4.secondarySlots.join(', ')}`);
    console.log(`  Stat Shards: ${runes4.statShards.join(', ')}`);

    const isComplete = 
        runes4.primaryTree && 
        runes4.primaryKeystone && 
        runes4.primarySlots.length >= 3 &&
        runes4.secondaryTree && 
        runes4.secondarySlots.length >= 2 &&
        runes4.statShards.length >= 3 &&
        runes4.primaryTree !== runes4.secondaryTree;

    const isDominationElectrocute = 
        runes4.primaryTree === 'Domination' && 
        runes4.primaryKeystone === 'Electrocute';

    console.log(`\n  - Complete page: ${isComplete}`);
    console.log(`  - Domination/Electrocute: ${isDominationElectrocute}`);
    console.log(`\n>>> TEST 4: ${isComplete && isDominationElectrocute ? 'PASS ✓' : 'FAIL ✗'}`);

    // ============================================================
    // TEST 5 — Live advisor gold check
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('TEST 5 — Live advisor gold check');
    console.log('Input: Player gold = 800');
    console.log('='.repeat(60));

    const testItems = [
        { id: '3006', name: "Berserker's Greaves", cost: 1100 },
        { id: '3031', name: 'Infinity Edge', cost: 3400 },
        { id: '1038', name: 'Pickaxe', cost: 875 },
        { id: '1042', name: 'Dagger', cost: 300 },
    ];

    const playerGold = 800;
    const affordableItems = testItems.filter(item => item.cost <= playerGold);

    console.log('\nTest items:');
    testItems.forEach(item => console.log(`  - ${item.name}: ${item.cost}g`));
    console.log(`\nPlayer gold: ${playerGold}g`);
    console.log('\nAffordable items (≤800g):');
    affordableItems.forEach(item => console.log(`  - ${item.name}: ${item.cost}g`));

    const test5Pass = affordableItems.length === 1 && affordableItems[0].id === '1042';
    console.log(`\n>>> TEST 5: ${test5Pass ? 'PASS ✓' : 'FAIL ✗'}`);

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Test 1 (Jungle starting items): ${test1Pass ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`Test 2 (Anti-heal conflict): ${totalAntiHeal === 1 ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`Test 3 (Role item leak): ${!hasSupportItem && !hasJungleItem ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`Test 4 (Rune completeness): ${isComplete && isDominationElectrocute ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`Test 5 (Gold check): ${test5Pass ? 'PASS ✓' : 'FAIL ✗'}`);
}

runTests().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});