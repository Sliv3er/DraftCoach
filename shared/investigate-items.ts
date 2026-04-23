// Dump all DDragon items to find real current starting items
import { initKB, getKB } from './kb/kb-loader';
import { getDDragonData } from './kb/ddragon';

async function investigate() {
    const dd = await getDDragonData();
    console.log(`Patch: ${dd.version}`);
    console.log(`Total items: ${dd.items.size}`);
    
    // === JUNGLE STARTERS ===
    console.log('\n=== POTENTIAL JUNGLE STARTERS (cost <= 500, purchasable) ===');
    for (const [id, item] of dd.items) {
        if (!item.gold.purchasable) continue;
        if (item.gold.total > 500) continue;
        const name = item.name?.toLowerCase() || '';
        const tags = Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? [item.tags] : []);
        const hasJungleTag = tags.some((t: string) => t.toLowerCase().includes('jungle'));
        const isJungleName = ['jungle', 'mosstomper', 'gustwalker', 'scorchclaw', 'hailblade', 'emberknife'].some(n => name.includes(n));
        if (hasJungleTag || isJungleName) {
            console.log(`  ${id}: ${item.name} | cost=${item.gold.total} | tags=${JSON.stringify(item.tags)} | from=${JSON.stringify(item.from)}`);
        }
    }

    // === ALL ITEMS UNDER 500g ===
    console.log('\n=== ALL PURCHASABLE ITEMS <= 500g ===');
    const cheapItems: any[] = [];
    for (const [id, item] of dd.items) {
        if (!item.gold.purchasable) continue;
        if (item.inStore === false) continue;
        if (item.gold.total <= 500 && item.gold.total > 0) {
            cheapItems.push({ id, name: item.name, cost: item.gold.total, tags: item.tags, from: item.from });
        }
    }
    cheapItems.sort((a, b) => a.cost - b.cost);
    for (const item of cheapItems) {
        console.log(`  ${item.id}: ${item.name} | ${item.cost}g | tags=${JSON.stringify(item.tags)}`);
    }
    
    // === DORAN'S ITEMS ===
    console.log('\n=== DORAN\'S ITEMS ===');
    for (const [id, item] of dd.items) {
        if (item.name?.toLowerCase().includes('doran')) {
            console.log(`  ${id}: ${item.name} | ${item.gold.total}g | purchasable=${item.gold.purchasable} | inStore=${item.inStore}`);
        }
    }
    
    // === SUPPORT STARTER ITEMS ===
    console.log('\n=== SUPPORT STARTERS (Spellthief, Relic, Shoulderguards, etc) ===');
    for (const [id, item] of dd.items) {
        const name = item.name?.toLowerCase() || '';
        if (['spellthief', 'relic', 'shoulderguard', 'spectral', 'steel shoulder', 'world atlas'].some(n => name.includes(n))) {
            console.log(`  ${id}: ${item.name} | ${item.gold.total}g | purchasable=${item.gold.purchasable} | inStore=${item.inStore}`);
        }
    }
    
    // === Check specific IDs we're hardcoding ===
    console.log('\n=== CHECKING HARDCODED IDS ===');
    const hardcoded = ['1039', '1041', '1042', '1043', '1055', '1054', '1056', '2003', '3850', '3854', '3858', '3862', '3006'];
    for (const id of hardcoded) {
        const item = dd.items.get(id);
        if (item) {
            console.log(`  ${id}: ${item.name} | ${item.gold.total}g | purchasable=${item.gold.purchasable} | inStore=${item.inStore}`);
        } else {
            console.log(`  ${id}: NOT FOUND IN DDRAGON`);
        }
    }

    // === Jungle starter detection from our code ===
    console.log('\n=== OUR DETECTED JUNGLE STARTERS ===');
    console.log(`  IDs: ${Array.from(dd.jungleStarterIds).join(', ')}`);
    for (const id of dd.jungleStarterIds) {
        const item = dd.items.get(id);
        console.log(`  ${id}: ${item?.name} | ${item?.gold.total}g`);
    }
}

investigate().catch(console.error);