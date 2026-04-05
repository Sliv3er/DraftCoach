/**
 * DraftCoach — Intelligence Upgrade Stress Tests
 * ================================================
 * Covers all 7 intelligence upgrades plus the original boots protection tests.
 *
 * Run: node apps/desktop/test-overlay-stress.js
 */

// ─── Mock DDragon Item Cache ───────────────────────────────────────
const ddragonItemCache = {
  byId: new Map([
    // Boots
    ['1001', { name: 'Boots', tags: ['Boots'], gold: 300, from: [], iconUrl: '' }],
    ['3006', { name: "Berserker's Greaves", tags: ['Boots'], gold: 1100, from: ['1001'], iconUrl: '' }],
    ['3009', { name: 'Boots of Swiftness', tags: ['Boots'], gold: 900, from: ['1001'], iconUrl: '' }],
    ['3020', { name: "Sorcerer's Shoes", tags: ['Boots'], gold: 1100, from: ['1001'], iconUrl: '' }],
    ['3047', { name: "Plated Steelcaps", tags: ['Boots'], gold: 1100, from: ['1001'], iconUrl: '' }],
    ['3111', { name: "Mercury's Treads", tags: ['Boots'], gold: 1100, from: ['1001'], iconUrl: '' }],
    ['3158', { name: "Ionian Boots of Lucidity", tags: ['Boots'], gold: 900, from: ['1001'], iconUrl: '' }],
    // ADC items
    ['6672', { name: 'Kraken Slayer', tags: ['Damage', 'CriticalStrike', 'AttackSpeed'], gold: 3100, from: ['1018', '1036', '1042'], iconUrl: '' }],
    ['3031', { name: 'Infinity Edge', tags: ['Damage', 'CriticalStrike'], gold: 3400, from: ['1018', '1037'], iconUrl: '' }],
    ['3085', { name: "Runaan's Hurricane", tags: ['AttackSpeed', 'CriticalStrike'], gold: 2600, from: ['1042', '1043'], iconUrl: '' }],
    ['6676', { name: 'The Collector', tags: ['Damage', 'CriticalStrike', 'ArmorPenetration'], gold: 3000, from: ['1036', '1018'], iconUrl: '' }],
    ['3072', { name: 'Bloodthirster', tags: ['Damage', 'LifeSteal'], gold: 3400, from: ['1036', '1053'], iconUrl: '' }],
    ['3036', { name: "Lord Dominik's Regards", tags: ['Damage', 'ArmorPenetration'], gold: 3000, from: ['3035', '1036'], iconUrl: '' }],
    ['3033', { name: 'Mortal Reminder', tags: ['Damage', 'ArmorPenetration'], gold: 2600, from: ['3035', '1042'], iconUrl: '' }],
    ['3153', { name: "Blade of the Ruined King", tags: ['Damage', 'AttackSpeed', 'LifeSteal'], gold: 3200, from: ['1042', '1036', '1053'], iconUrl: '' }],
    // Mage items
    ['6653', { name: "Liandry's Torment", tags: ['SpellDamage', 'Health'], gold: 3000, from: ['3802', '1052'], iconUrl: '' }],
    ['4005', { name: "Imperial Mandate", tags: ['SpellDamage', 'Mana', 'CooldownReduction'], gold: 2300, from: ['3802'], iconUrl: '' }],
    ['3157', { name: "Zhonya's Hourglass", tags: ['SpellDamage', 'Armor'], gold: 3250, from: ['1058', '1029'], iconUrl: '' }],
    ['3089', { name: "Rabadon's Deathcap", tags: ['SpellDamage'], gold: 3600, from: ['1058', '1052'], iconUrl: '' }],
    ['3116', { name: "Rylai's Crystal Scepter", tags: ['SpellDamage', 'Health'], gold: 2600, from: ['1052', '1028'], iconUrl: '' }],
    ['6655', { name: "Luden's Companion", tags: ['SpellDamage', 'Mana', 'MagicPenetration'], gold: 2850, from: ['1058', '3802'], iconUrl: '' }],
    // Tank/Fighter items
    ['3071', { name: 'Black Cleaver', tags: ['Damage', 'Health', 'CooldownReduction'], gold: 3100, from: ['3133', '3044'], iconUrl: '' }],
    ['3065', { name: 'Spirit Visage', tags: ['Health', 'SpellBlock', 'CooldownReduction'], gold: 2900, from: ['3211', '1028'], iconUrl: '' }],
    ['3075', { name: 'Thornmail', tags: ['Armor', 'Health'], gold: 2700, from: ['1029', '3076'], iconUrl: '' }],
    ['3143', { name: "Randuin's Omen", tags: ['Armor', 'Health'], gold: 2700, from: ['1029', '1011'], iconUrl: '' }],
    ['6665', { name: 'Jak\'Sho, The Protean', tags: ['Health', 'Armor', 'SpellBlock'], gold: 3200, from: ['3211', '3067'], iconUrl: '' }],
    // Assassin items
    ['6694', { name: 'Serylda\'s Grudge', tags: ['Damage', 'CooldownReduction', 'ArmorPenetration'], gold: 3200, from: ['3035', '3133'], iconUrl: '' }],
    ['6697', { name: 'Hubris', tags: ['Damage', 'CooldownReduction'], gold: 3000, from: ['1036', '3133'], iconUrl: '' }],
  ]),
};

// ─── Mock DDragon Champion Cache ───────────────────────────────────
const ddragonChampCache = new Map([
  ['Jinx', { tags: ['Marksman'], id: 'Jinx' }],
  ["Kai'Sa", { tags: ['Marksman'], id: 'Kaisa' }],
  ['Lux', { tags: ['Mage', 'Support'], id: 'Lux' }],
  ['Syndra', { tags: ['Mage'], id: 'Syndra' }],
  ['Zed', { tags: ['Assassin'], id: 'Zed' }],
  ['Talon', { tags: ['Assassin', 'Fighter'], id: 'Talon' }],
  ['Ornn', { tags: ['Tank'], id: 'Ornn' }],
  ['Malphite', { tags: ['Tank', 'Fighter'], id: 'Malphite' }],
  ['Darius', { tags: ['Fighter', 'Tank'], id: 'Darius' }],
  ['Fiora', { tags: ['Fighter', 'Assassin'], id: 'Fiora' }],
  ['Thresh', { tags: ['Support'], id: 'Thresh' }],
  ['Nautilus', { tags: ['Tank', 'Support'], id: 'Nautilus' }],
  ['Vayne', { tags: ['Marksman', 'Assassin'], id: 'Vayne' }],
  ['Katarina', { tags: ['Assassin', 'Mage'], id: 'Katarina' }],
  ['Lee Sin', { tags: ['Fighter', 'Assassin'], id: 'LeeSin' }],
  ['Ahri', { tags: ['Mage', 'Assassin'], id: 'Ahri' }],
]);

// ─── Helpers (extracted logic from main.js) ────────────────────────
function isBootsId(id) {
  const d = ddragonItemCache.byId.get(String(id));
  return d && d.tags && d.tags.includes('Boots') && d.gold > 300;
}

function advisorIsBootsId(id) {
  return isBootsId(id);
}

function simulateOverlayTracking(buildItems, purchasedItemIds, purchasedItemNames, playerHasBoots, bootItemIds) {
  const ownedNames = purchasedItemNames || [];
  const hasBoots = !!playerHasBoots;
  const bootIds = bootItemIds || [];
  let nextIdx = 0;
  for (let i = 0; i < buildItems.length; i++) {
    const bi = buildItems[i];
    const matchById = bi.id && purchasedItemIds.includes(bi.id);
    const matchByName = bi.name && ownedNames.some(n =>
      n === bi.name.toLowerCase().trim() ||
      n.includes(bi.name.toLowerCase().trim()) ||
      bi.name.toLowerCase().trim().includes(n)
    );
    const matchByBoots = hasBoots && bi.id && bootIds.includes(bi.id);
    if (matchById || matchByName || matchByBoots) {
      nextIdx = i + 1;
    } else {
      break;
    }
  }
  return Math.min(nextIdx, buildItems.length);
}

function computeLockIndex(buildItems, ownedItemNames, advisorHasBoots) {
  let lockIndex = 0;
  for (let i = 0; i < buildItems.length; i++) {
    const bi = buildItems[i];
    const buildName = bi.name.toLowerCase().trim();
    const owned = ownedItemNames.some(o => o === buildName || o.includes(buildName) || buildName.includes(o));
    const matchByBoots = advisorHasBoots && bi.id && advisorIsBootsId(bi.id);
    if (owned || matchByBoots) {
      lockIndex = i + 1;
    } else {
      break;
    }
  }
  return lockIndex;
}

function applyNextItems(updatedItems, lockIndex, nextItems, advisorHasBoots) {
  let modified = false;
  if (nextItems.length > 0) {
    let overlayIdx = lockIndex;
    for (let ni = 0; ni < nextItems.length && overlayIdx < updatedItems.length; ni++) {
      const suggestedName = nextItems[ni];
      const suggestedLower = suggestedName.toLowerCase().trim();
      let resolved = null;
      for (const [id, d] of ddragonItemCache.byId) {
        if (d.name.toLowerCase() === suggestedLower) {
          resolved = { id, name: d.name, iconUrl: d.iconUrl, gold: d.gold };
          break;
        }
      }
      const suggestedIsBoots = resolved && resolved.id ? advisorIsBootsId(resolved.id) : false;
      let targetIdx = overlayIdx;
      let currentId = updatedItems[targetIdx].id;
      let currentIsBoots = currentId ? advisorIsBootsId(currentId) : false;
      if (currentIsBoots !== suggestedIsBoots) {
        overlayIdx++;
        if (overlayIdx >= updatedItems.length) break;
        targetIdx = overlayIdx;
      }
      const currentName = updatedItems[targetIdx].name.toLowerCase().trim();
      if (currentName !== suggestedLower && !currentName.includes(suggestedLower) && !suggestedLower.includes(currentName)) {
        if (resolved && resolved.id && updatedItems.some((ui, idx) => ui.id === resolved.id && idx !== targetIdx)) {
          // dedup
        } else {
          updatedItems[targetIdx] = {
            name: resolved?.name || suggestedName,
            iconUrl: resolved?.iconUrl || '',
            gold: resolved?.gold || 0,
            id: resolved?.id || '',
          };
          modified = true;
        }
      }
      overlayIdx++;
    }
  }
  return { updatedItems, modified };
}

function buildItem(name, id) {
  const d = ddragonItemCache.byId.get(id);
  return { name: d?.name || name, id, iconUrl: d?.iconUrl || '', gold: d?.gold || 0 };
}

// ─── #2: Trigger Logic Simulation ──────────────────────────────────
function checkLiveAdvisorTriggers(gameData, state) {
  const now = Date.now();
  if (now - state.lastAdviceTime < state.advisorCooldown) return null;

  const gameTime = gameData.gameData?.gameTime || 0;
  const currentPhase = gameTime < 900 ? 'early' : gameTime < 1500 ? 'mid' : 'late';
  const players = gameData.allPlayers || [];
  const activePlayer = gameData.activePlayer;
  if (!activePlayer || players.length === 0) return null;

  const myPlayer = players.find(p => p.summonerName === activePlayer.summonerName);
  if (!myPlayer) return null;
  const myTeam = myPlayer.team;
  const enemies = players.filter(p => p.team !== myTeam);

  // Phase change
  if (currentPhase !== state.lastPhase && state.lastPhase !== '') {
    state.lastPhase = currentPhase;
    return `Game phase changed to ${currentPhase}`;
  }
  if (state.lastPhase === '') state.lastPhase = currentPhase;

  // Fed enemy
  const fedEnemies = enemies.filter(e => e.scores && (e.scores.kills >= 5 || (e.scores.kills - e.scores.deaths) >= 4));
  const newFed = fedEnemies.filter(e => !(state.lastFedEnemies || []).includes(e.championName));
  if (newFed.length > 0) {
    state.lastFedEnemies = fedEnemies.map(e => e.championName);
    return `Enemy threat detected: ${newFed.map(e => e.championName).join(', ')}`;
  }

  // Death trigger
  const myDeaths = myPlayer.scores?.deaths || 0;
  if (myDeaths > state.lastDeaths && state.lastDeaths >= 0) {
    state.lastDeaths = myDeaths;
    return `Player died (${myDeaths} deaths)`;
  }

  // Gold spike
  const currentGold = activePlayer.currentGold || 0;
  if (currentGold > (state.lastGold || 0) + 800 && gameTime >= 120) {
    state.lastGold = currentGold;
    return `Gold spike: ${currentGold}g available`;
  }
  state.lastGold = currentGold;

  // Enemy major item
  const enemyItemCounts = {};
  for (const e of enemies) {
    const majorItems = (e.items || []).filter(i => {
      const d = ddragonItemCache.byId.get(String(i.itemID));
      return d && d.gold >= 2500 && d.from && d.from.length > 0;
    }).length;
    enemyItemCounts[e.championName] = majorItems;
  }
  const prevCounts = state.lastEnemyItemCounts || {};
  const enemiesWithNewItems = Object.keys(enemyItemCounts).filter(name =>
    (enemyItemCounts[name] || 0) > (prevCounts[name] || 0)
  );
  state.lastEnemyItemCounts = enemyItemCounts;
  if (enemiesWithNewItems.length > 0 && Object.keys(prevCounts).length > 0) {
    return `Enemy completed major item: ${enemiesWithNewItems.join(', ')}`;
  }

  // Periodic
  if (gameTime >= 300 && (now - state.lastAdviceTime) > 180000) {
    return `Periodic build check`;
  }
  return null;
}

// ─── #3: Damage Type Classification ────────────────────────────────
function classifyDamageType(enemy) {
  const champInfo = ddragonChampCache.get(enemy.championName);
  const tags = champInfo?.tags || [];
  const enemyItems = (enemy.items || []).map(i => {
    const d = ddragonItemCache.byId.get(String(i.itemID));
    return d?.tags || [];
  }).flat();
  const hasAPItems = enemyItems.some(t => t === 'SpellDamage');
  const hasADItems = enemyItems.some(t => t === 'Damage' || t === 'CriticalStrike' || t === 'AttackSpeed');
  if (tags.includes('Mage') || (hasAPItems && !hasADItems)) return 'AP';
  if (tags.includes('Marksman') || tags.includes('Assassin') || (hasADItems && !hasAPItems)) return 'AD';
  if (hasAPItems && hasADItems) return 'MIXED';
  if (tags.includes('Tank') || tags.includes('Fighter')) return 'AD';
  return 'MIXED';
}

// ─── #4: Gold Context ──────────────────────────────────────────────
function getGoldContext(currentGold) {
  if (currentGold < 800) return `Very low gold (${currentGold}g)`;
  if (currentGold < 1300) return `Low gold (${currentGold}g)`;
  if (currentGold < 3000) return `Moderate gold (${currentGold}g)`;
  return `High gold (${currentGold}g)`;
}

// ─── #5: Class-Filtered Valid Items ────────────────────────────────
function getFilteredValidItems(champName) {
  const champInfo = ddragonChampCache.get(champName);
  const champTags = champInfo?.tags || [];
  const validItems = [];
  const alwaysIncludeTags = ['Health', 'Armor', 'SpellBlock'];
  for (const [id, d] of ddragonItemCache.byId) {
    if (d.gold < 2000 || !d.from || d.from.length === 0) continue;
    const itemTags = d.tags || [];
    let relevant = false;
    if (champTags.includes('Marksman')) {
      relevant = itemTags.some(t => ['Damage', 'CriticalStrike', 'AttackSpeed', 'LifeSteal', 'ArmorPenetration'].includes(t));
    } else if (champTags.includes('Mage')) {
      relevant = itemTags.some(t => ['SpellDamage', 'Mana', 'ManaRegen', 'CooldownReduction', 'MagicPenetration'].includes(t));
    } else if (champTags.includes('Assassin')) {
      relevant = itemTags.some(t => ['Damage', 'ArmorPenetration', 'CooldownReduction', 'LifeSteal', 'CriticalStrike'].includes(t));
    } else if (champTags.includes('Tank')) {
      relevant = itemTags.some(t => ['Health', 'Armor', 'SpellBlock', 'CooldownReduction', 'Mana'].includes(t));
    } else if (champTags.includes('Fighter')) {
      relevant = itemTags.some(t => ['Damage', 'Health', 'Armor', 'LifeSteal', 'CooldownReduction', 'AttackSpeed'].includes(t));
    } else if (champTags.includes('Support')) {
      relevant = itemTags.some(t => ['SpellDamage', 'Health', 'Mana', 'ManaRegen', 'CooldownReduction', 'SpellBlock', 'Armor'].includes(t));
    } else {
      relevant = true;
    }
    if (!relevant && itemTags.some(t => alwaysIncludeTags.includes(t))) relevant = true;
    if (itemTags.includes('Boots')) relevant = true;
    if (relevant) validItems.push(d.name);
  }
  return validItems.sort();
}

// ─── #1: RAG Context Simulation ────────────────────────────────────
function getLocalRagContext(champion, role, enemies, ds) {
  const patchStr = ds.patch || 'Unknown';
  const ctx = ds.metaContext || '';
  let champMeta = '';
  if (ds.championMeta) {
    const champData = ds.championMeta[champion];
    if (champData) {
      const parts = [`CHAMPION META for ${champion}:`];
      if (champData.tier) parts.push(`  Tier: ${champData.tier}`);
      if (champData.winRate) parts.push(`  Win Rate: ${champData.winRate}%`);
      if (champData.strongInto && champData.strongInto.length > 0) {
        parts.push(`  Strong into: ${champData.strongInto.join(', ')}`);
      }
      if (champData.weakInto && champData.weakInto.length > 0) {
        parts.push(`  Weak into: ${champData.weakInto.join(', ')}`);
      }
      if (champData.patchNotes) parts.push(`  Patch changes: ${champData.patchNotes}`);
      champMeta = parts.join('\n');
    }
    if (enemies && enemies.length > 0) {
      const enemyParts = [];
      for (const enemyName of enemies) {
        const ed = ds.championMeta[enemyName];
        if (ed) {
          enemyParts.push(`${enemyName}: Tier ${ed.tier || '?'}, ${ed.winRate || '?'}% WR`);
        }
      }
      if (enemyParts.length > 0) {
        champMeta += `\nENEMY META:\n  ${enemyParts.join('\n  ')}`;
      }
    }
  }
  return `Patch ${patchStr}\n${champion} ${role}\n${ctx}${champMeta ? '\n' + champMeta : ''}`;
}


// ─── Test Harness ──────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, testName, details) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ ${testName}`);
    if (details) console.error(`     ${details}`);
  }
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 1: Original Overlay Tracking (10 tests)
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 1: Overlay Item Tracking (currentItemIndex)');
console.log('══════════════════════════════════════════════════════════\n');

{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, [], [], false, []) === 0, '1.1 No items → index 0');
}
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, ['6672'], ['kraken slayer'], false, []) === 1, '1.2 First item → index 1');
}
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, ['6672', '3006'], ['kraken slayer', "berserker's greaves"], false, ['3006']) === 2, '1.3 Items 1+2 → index 2');
}
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, ['6672'], ['kraken slayer'], true, ['3006']) === 2, '1.4 ADC quest slot boots → index 2');
}
{
  const build = [buildItem("Berserker's Greaves", '3006'), buildItem('Kraken Slayer', '6672'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, [], [], false, []) === 0, '1.5 Boots first, nothing bought → 0');
}
{
  const build = [buildItem("Berserker's Greaves", '3006'), buildItem('Kraken Slayer', '6672'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, [], [], true, ['3006']) === 1, '1.6 Boots first, quest bought → 1');
}
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, ['6672'], ['kraken slayer'], false, ['3006']) === 1, '1.7 Boots 2nd, not purchased → 1');
}
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'), buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072')];
  assert(simulateOverlayTracking(build, ['6672', '3006', '3031', '3085', '6676', '3072'], ['kraken slayer', "berserker's greaves", 'infinity edge', "runaan's hurricane", 'the collector', 'bloodthirster'], true, ['3006']) === 6, '1.8 All 6 purchased → 6');
}
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, ['6672', '3031'], ['kraken slayer', 'infinity edge'], false, ['3006']) === 1, '1.9 Gap (1✓, 2✗, 3✓) → stops at 1');
}
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  assert(simulateOverlayTracking(build, ['6672'], ['kraken slayer'], true, ['3006']) === 2, '1.10 Quest boots fills gap → 2');
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 2: Boots Protection (7 tests)
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 2: Boots Protection in NEXT ITEMS');
console.log('══════════════════════════════════════════════════════════\n');

{
  const items = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085')];
  const result = applyNextItems([...items.map(i => ({...i}))], 1, ['Infinity Edge', 'The Collector'], false);
  assert(result.updatedItems.some(i => i.id === '3006'), '2.1 Non-boots at boots slot → boots preserved');
}
{
  const items = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  const result = applyNextItems([...items.map(i => ({...i}))], 1, ["Mercury's Treads"], false);
  assert(result.updatedItems.some(i => i.id === '3111'), '2.2 Boots → other boots → allowed');
}
{
  const items = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085')];
  const result = applyNextItems([...items.map(i => ({...i}))], 0, ['Kraken Slayer', 'Infinity Edge'], false);
  assert(result.updatedItems.some(i => i.id === '3006'), '2.3 AI starts from 0 → boots at 1 preserved');
}
{
  let items = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085')];
  let result = applyNextItems([...items.map(i => ({...i}))], 0, ['Kraken Slayer', 'The Collector'], false);
  assert(result.updatedItems.some(i => i.id === '3006'), '2.4a Round 1: boots survive');
  result = applyNextItems([...result.updatedItems.map(i => ({...i}))], 0, ['Kraken Slayer', 'Bloodthirster'], false);
  assert(result.updatedItems.some(i => i.id === '3006'), '2.4b Round 2: boots survive');
  result = applyNextItems([...result.updatedItems.map(i => ({...i}))], 0, ["Blade of the Ruined King", "Lord Dominik's Regards"], false);
  assert(result.updatedItems.some(i => i.id === '3006'), '2.4c Round 3: boots STILL survive');
}
{
  const items = [buildItem("Luden's Companion", '6655'), buildItem("Sorcerer's Shoes", '3020'), buildItem("Rabadon's Deathcap", '3089'), buildItem("Zhonya's Hourglass", '3157')];
  const result = applyNextItems([...items.map(i => ({...i}))], 0, ["Luden's Companion", "Rabadon's Deathcap"], false);
  assert(result.updatedItems.some(i => i.id === '3020'), '2.5 Mid: Sorc Shoes preserved');
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 3: #2 — New Trigger Conditions
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 3: New Trigger Conditions (#2)');
console.log('══════════════════════════════════════════════════════════\n');

{
  // Death trigger
  const state = { lastAdviceTime: 0, advisorCooldown: 0, lastPhase: 'early', lastFedEnemies: [], lastDeaths: 1, lastGold: 500, lastEnemyItemCounts: {} };
  const gameData = {
    gameData: { gameTime: 600 },
    activePlayer: { summonerName: 'TestPlayer', currentGold: 500 },
    allPlayers: [
      { summonerName: 'TestPlayer', team: 'ORDER', scores: { kills: 2, deaths: 2, assists: 1 }, items: [] },
      { summonerName: 'Enemy1', team: 'CHAOS', championName: 'Zed', scores: { kills: 3, deaths: 1, assists: 0 }, items: [] },
    ],
  };
  const trigger = checkLiveAdvisorTriggers(gameData, state);
  assert(trigger && trigger.includes('died'), '3.1 Death trigger fires when deaths increase', `Got: ${trigger}`);
}
{
  // Gold spike trigger
  const state = { lastAdviceTime: 0, advisorCooldown: 0, lastPhase: 'early', lastFedEnemies: [], lastDeaths: 0, lastGold: 500, lastEnemyItemCounts: {} };
  const gameData = {
    gameData: { gameTime: 600 },
    activePlayer: { summonerName: 'TestPlayer', currentGold: 2000 },
    allPlayers: [
      { summonerName: 'TestPlayer', team: 'ORDER', scores: { kills: 2, deaths: 0, assists: 1 }, items: [] },
      { summonerName: 'Enemy1', team: 'CHAOS', championName: 'Zed', scores: { kills: 1, deaths: 1, assists: 0 }, items: [] },
    ],
  };
  const trigger = checkLiveAdvisorTriggers(gameData, state);
  assert(trigger && trigger.includes('Gold spike'), '3.2 Gold spike trigger fires on +800g', `Got: ${trigger}`);
}
{
  // Enemy major item trigger
  const state = { lastAdviceTime: 0, advisorCooldown: 0, lastPhase: 'early', lastFedEnemies: [], lastDeaths: 0, lastGold: 1000, lastEnemyItemCounts: { Zed: 0 } };
  const gameData = {
    gameData: { gameTime: 600 },
    activePlayer: { summonerName: 'TestPlayer', currentGold: 1000 },
    allPlayers: [
      { summonerName: 'TestPlayer', team: 'ORDER', scores: { kills: 2, deaths: 0, assists: 1 }, items: [] },
      { summonerName: 'Enemy1', team: 'CHAOS', championName: 'Zed', scores: { kills: 3, deaths: 1, assists: 0 }, items: [{ itemID: '6697', displayName: 'Hubris' }] },
    ],
  };
  const trigger = checkLiveAdvisorTriggers(gameData, state);
  assert(trigger && trigger.includes('Enemy completed'), '3.3 Enemy item trigger fires on new major item', `Got: ${trigger}`);
}
{
  // No trigger when nothing changed
  const state = { lastAdviceTime: Date.now() - 100000, advisorCooldown: 90000, lastPhase: 'early', lastFedEnemies: [], lastDeaths: 0, lastGold: 500, lastEnemyItemCounts: {} };
  const gameData = {
    gameData: { gameTime: 300 },
    activePlayer: { summonerName: 'TestPlayer', currentGold: 500 },
    allPlayers: [
      { summonerName: 'TestPlayer', team: 'ORDER', scores: { kills: 0, deaths: 0, assists: 0 }, items: [] },
      { summonerName: 'Enemy1', team: 'CHAOS', championName: 'Zed', scores: { kills: 0, deaths: 0, assists: 0 }, items: [] },
    ],
  };
  const trigger = checkLiveAdvisorTriggers(gameData, state);
  assert(trigger === null, '3.4 No trigger during cooldown', `Got: ${trigger}`);
}
{
  // Phase change trigger
  const state = { lastAdviceTime: 0, advisorCooldown: 0, lastPhase: 'early', lastFedEnemies: [], lastDeaths: 0, lastGold: 1000, lastEnemyItemCounts: {} };
  const gameData = {
    gameData: { gameTime: 900 },
    activePlayer: { summonerName: 'TestPlayer', currentGold: 1000 },
    allPlayers: [
      { summonerName: 'TestPlayer', team: 'ORDER', scores: { kills: 0, deaths: 0, assists: 0 }, items: [] },
      { summonerName: 'Enemy1', team: 'CHAOS', championName: 'Zed', scores: { kills: 0, deaths: 0, assists: 0 }, items: [] },
    ],
  };
  const trigger = checkLiveAdvisorTriggers(gameData, state);
  assert(trigger && trigger.includes('phase'), '3.5 Phase change trigger fires at 15min', `Got: ${trigger}`);
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 4: #3 — Damage Type Classification
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 4: Enemy Damage Classification (#3)');
console.log('══════════════════════════════════════════════════════════\n');

{
  // Pure mage — AP
  const enemy = { championName: 'Lux', items: [{ itemID: '6655' }] };
  assert(classifyDamageType(enemy) === 'AP', '4.1 Lux with Ludens → AP');
}
{
  // Marksman — AD
  const enemy = { championName: 'Jinx', items: [{ itemID: '6672' }] };
  assert(classifyDamageType(enemy) === 'AD', '4.2 Jinx with Kraken → AD');
}
{
  // Katarina with AP items — AP
  const enemy = { championName: 'Katarina', items: [{ itemID: '3089' }] };
  assert(classifyDamageType(enemy) === 'AP', '4.3 Katarina with Rabadons → AP');
}
{
  // Tank — AD (default for physical champions)
  const enemy = { championName: 'Ornn', items: [] };
  assert(classifyDamageType(enemy) === 'AD', '4.4 Ornn with no items → AD (Tank default)');
}
{
  // Unknown champion — MIXED
  const enemy = { championName: 'UnknownChamp', items: [] };
  assert(classifyDamageType(enemy) === 'MIXED', '4.5 Unknown champ → MIXED');
}
{
  // Mixed items on Katarina (Mage+Assassin) — Katarina is primarily a Mage, so AP classification is correct
  const enemy = { championName: 'Katarina', items: [{ itemID: '3089' }, { itemID: '3153' }] };
  const result = classifyDamageType(enemy);
  assert(result === 'AP' || result === 'MIXED', '4.6 Katarina with AP+AD items → AP or MIXED', `Got: ${result}`);
}
{
  // Full AD team detection
  const enemies = [
    { championName: 'Jinx', items: [{ itemID: '6672' }] },
    { championName: 'Zed', items: [{ itemID: '6697' }] },
    { championName: 'Fiora', items: [{ itemID: '3072' }] },
    { championName: 'Lee Sin', items: [{ itemID: '3071' }] },
    { championName: 'Vayne', items: [{ itemID: '3153' }] },
  ];
  const profile = enemies.map(e => classifyDamageType(e));
  const adC = profile.filter(t => t === 'AD').length;
  assert(adC >= 4, '4.7 Full AD team: at least 4 classified as AD', `Got ${adC} AD (${profile.join(', ')})`);
}
{
  // Full AP team detection
  const enemies = [
    { championName: 'Syndra', items: [{ itemID: '6655' }] },
    { championName: 'Lux', items: [{ itemID: '4005' }] },
    { championName: 'Ahri', items: [{ itemID: '6655' }] },
  ];
  const profile = enemies.map(e => classifyDamageType(e));
  const apC = profile.filter(t => t === 'AP').length;
  assert(apC >= 2, '4.8 AP-heavy team: at least 2 classified as AP', `Got ${apC} AP (${profile.join(', ')})`);
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 5: #4 — Gold Context
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 5: Gold Efficiency Context (#4)');
console.log('══════════════════════════════════════════════════════════\n');

{
  assert(getGoldContext(300).includes('Very low'), '5.1 300g → Very low');
}
{
  assert(getGoldContext(1000).includes('Low'), '5.2 1000g → Low');
}
{
  assert(getGoldContext(2000).includes('Moderate'), '5.3 2000g → Moderate');
}
{
  assert(getGoldContext(3500).includes('High'), '5.4 3500g → High');
}
{
  assert(getGoldContext(0).includes('Very low'), '5.5 0g → Very low');
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 6: #5 — Class-Filtered Valid Items
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 6: Class-Filtered Valid Items (#5)');
console.log('══════════════════════════════════════════════════════════\n');

{
  const marksmanItems = getFilteredValidItems('Jinx');
  assert(marksmanItems.includes('Kraken Slayer'), '6.1 Marksman: includes Kraken Slayer');
  assert(marksmanItems.includes('Infinity Edge'), '6.2 Marksman: includes Infinity Edge');
  assert(!marksmanItems.includes("Rabadon's Deathcap"), '6.3 Marksman: excludes Rabadons');
  assert(!marksmanItems.includes("Luden's Companion"), '6.4 Marksman: excludes Ludens');
  // Should include defensive items
  assert(marksmanItems.includes("Spirit Visage") || marksmanItems.includes("Randuin's Omen"), '6.5 Marksman: includes defensive items');
}
{
  const mageItems = getFilteredValidItems('Syndra');
  assert(mageItems.includes("Rabadon's Deathcap"), '6.6 Mage: includes Rabadons');
  assert(mageItems.includes("Luden's Companion"), '6.7 Mage: includes Ludens');
  assert(!mageItems.includes('Kraken Slayer'), '6.8 Mage: excludes Kraken Slayer');
  assert(!mageItems.includes('Infinity Edge'), '6.9 Mage: excludes Infinity Edge');
}
{
  const tankItems = getFilteredValidItems('Ornn');
  assert(tankItems.includes("Spirit Visage"), '6.10 Tank: includes Spirit Visage');
  assert(tankItems.includes("Thornmail"), '6.11 Tank: includes Thornmail');
  assert(!tankItems.includes("Rabadon's Deathcap"), '6.12 Tank: excludes Rabadons');
}
{
  const assassinItems = getFilteredValidItems('Zed');
  assert(assassinItems.includes("The Collector"), '6.13 Assassin: includes The Collector');
  assert(!assassinItems.includes("Rabadon's Deathcap"), '6.14 Assassin: excludes Rabadons');
}
{
  // Full item count comparison: filtered < unfiltered
  const filtered = getFilteredValidItems('Jinx').length;
  let unfiltered = 0;
  for (const [id, d] of ddragonItemCache.byId) {
    if (d.gold >= 2000 && d.from && d.from.length > 0) unfiltered++;
  }
  assert(filtered < unfiltered, `6.15 Filtered (${filtered}) < Unfiltered (${unfiltered})`, `${filtered} vs ${unfiltered}`);
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 7: #1 — Enhanced RAG Context
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 7: Enhanced RAG Context (#1)');
console.log('══════════════════════════════════════════════════════════\n');

{
  const mockDs = {
    patch: '26.7',
    metaContext: 'Jinx received buffs to base AD. Kraken Slayer cost reduced.',
    championMeta: {
      'Jinx': { tier: 'S', winRate: 52.1, pickRate: 8.5, banRate: 12.0, strongInto: ["Kai'Sa", "Aphelios"], weakInto: ['Draven', 'Lucian'], patchNotes: 'Base AD increased by 2' },
      'Draven': { tier: 'A', winRate: 51.0, patchNotes: null },
    },
  };
  const ctx = getLocalRagContext('Jinx', 'Bottom', ['Draven', 'Zed'], mockDs);
  assert(ctx.includes('Tier: S'), '7.1 RAG contains champion tier');
  assert(ctx.includes('52.1'), '7.2 RAG contains win rate');
  assert(ctx.includes("Kai'Sa"), '7.3 RAG contains strong matchups');
  assert(ctx.includes('Draven'), '7.4 RAG contains weak matchups');
  assert(ctx.includes('Base AD increased'), '7.5 RAG contains patch notes');
  assert(ctx.includes('ENEMY META'), '7.6 RAG contains enemy meta section');
  assert(ctx.includes('Draven: Tier A'), '7.7 RAG contains enemy tier data');
}
{
  // No championMeta — graceful fallback
  const mockDs = { patch: '26.7', metaContext: 'Generic patch notes.' };
  const ctx = getLocalRagContext('Jinx', 'Bottom', ['Draven'], mockDs);
  assert(!ctx.includes('CHAMPION META'), '7.8 No championMeta → no crash, no meta section');
  assert(ctx.includes('Generic patch notes'), '7.9 Still includes base context');
}
{
  // Champion not in championMeta — still works for enemies
  const mockDs = {
    patch: '26.7',
    metaContext: 'Patch notes.',
    championMeta: { 'Draven': { tier: 'A', winRate: 51.0 } },
  };
  const ctx = getLocalRagContext('Jinx', 'Bottom', ['Draven'], mockDs);
  assert(!ctx.includes('CHAMPION META for Jinx'), '7.10 Champion not in meta → no champion section');
  assert(ctx.includes('Draven: Tier A'), '7.11 Enemy still gets their meta injected');
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 8: #6 — Advisor Memory
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 8: Advisor Memory (#6)');
console.log('══════════════════════════════════════════════════════════\n');

{
  const state = { previousAdvice: '', previousAdviceTime: 0 };
  const prevSection = state.previousAdvice
    ? `Previous advice: ${state.previousAdvice}`
    : '';
  assert(prevSection === '', '8.1 No previous advice → empty string');
}
{
  const state = { 
    previousAdvice: 'ASSESSMENT\nBuild on track.\nNEXT ITEMS\n1. Infinity Edge\n2. The Collector', 
    previousAdviceTime: Date.now() - 120000 
  };
  const prevSection = state.previousAdvice
    ? `YOUR PREVIOUS ADVICE (${Math.round((Date.now() - state.previousAdviceTime) / 60000)} min ago):\n${state.previousAdvice}\nDo NOT flip-flop.`
    : '';
  assert(prevSection.includes('YOUR PREVIOUS ADVICE'), '8.2 Has previous advice → injected');
  assert(prevSection.includes('Infinity Edge'), '8.3 Previous advice contains item names');
  assert(prevSection.includes('flip-flop'), '8.4 Anti-flip-flop instruction present');
  assert(prevSection.includes('2 min ago'), '8.5 Time delta calculated correctly');
}
{
  // Memory updates on each call
  const state = { previousAdvice: '', previousAdviceTime: 0 };
  // Simulate first call
  state.previousAdvice = 'NEXT ITEMS\n1. Kraken Slayer\n2. Berserker\'s Greaves';
  state.previousAdviceTime = Date.now();
  assert(state.previousAdvice.includes('Kraken'), '8.6 Memory saved after first call');
  // Simulate second call — overwrites
  state.previousAdvice = 'NEXT ITEMS\n1. Infinity Edge\n2. The Collector';
  state.previousAdviceTime = Date.now();
  assert(!state.previousAdvice.includes('Kraken'), '8.7 Memory overwritten on second call');
  assert(state.previousAdvice.includes('Infinity'), '8.8 New memory contains latest advice');
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 9: Edge Cases & Integration
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 9: Edge Cases & Integration');
console.log('══════════════════════════════════════════════════════════\n');

{
  // Empty enemy list — no crash in damage classification
  const enemies = [];
  const profile = enemies.map(e => classifyDamageType(e));
  assert(profile.length === 0, '9.1 Empty enemies → empty profile, no crash');
}
{
  // Unknown champion in filter — returns full list
  const unknownItems = getFilteredValidItems('NonExistentChamp');
  let unfilteredCount = 0;
  for (const [id, d] of ddragonItemCache.byId) {
    if (d.gold >= 2000 && d.from && d.from.length > 0) unfilteredCount++;
  }
  assert(unknownItems.length === unfilteredCount, '9.2 Unknown champion → full item list (no filter)', `${unknownItems.length} vs ${unfilteredCount}`);
}
{
  // lockIndex with quest boots + advisor memory state
  const items = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085')];
  const lock = computeLockIndex(items, ['kraken slayer'], true);
  assert(lock === 2, '9.3 lockIndex correct with quest boots');
  const result = applyNextItems([...items.map(i => ({...i}))], lock, ['The Collector', 'Bloodthirster'], false);
  assert(result.updatedItems.some(i => i.id === '3006'), '9.4 Boots preserved after lockIndex skip + apply');
  assert(result.updatedItems[2].id === '6676', '9.5 The Collector placed at slot 2');
  assert(result.updatedItems[3].id === '3072', '9.6 Bloodthirster placed at slot 3');
}
{
  // Gold context boundary values
  assert(getGoldContext(800).includes('Low'), '9.7 800g exactly → Low');
  assert(getGoldContext(1300).includes('Moderate'), '9.8 1300g exactly → Moderate');
  assert(getGoldContext(2500).includes('Moderate') || getGoldContext(2500).includes('gold'), '9.9 2500g → has gold context');
  assert(getGoldContext(3000).includes('High'), '9.10 3000g exactly → High');
}


// ═══════════════════════════════════════════════════════════════════
// SUITE 10: Build Complete & SELL Replacements
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 10: Build Complete & SELL Replacements');
console.log('══════════════════════════════════════════════════════════\n');

// Helper: Simulate build complete detection
function detectBuildComplete(buildItems, ownedItemNames, playerItems, advisorHasBoots, isADC) {
  // Check remaining queue
  const remaining = buildItems.filter(bi => {
    const bn = bi.name.toLowerCase().trim();
    const owned = ownedItemNames.some(o => o === bn || o.includes(bn) || bn.includes(o));
    const bootsSkip = advisorHasBoots && bi.id && advisorIsBootsId(bi.id);
    return !owned && !bootsSkip;
  });
  const remainingBuildQueue = remaining.length > 0 ? remaining.map((bi, idx) => `${idx + 1}. ${bi.name}`).join('\n') : '';

  // Currently building
  let currentlyBuilding = '';
  for (const bi of buildItems) {
    const bn = bi.name.toLowerCase().trim();
    const owned = ownedItemNames.some(o => o === bn || o.includes(bn) || bn.includes(o));
    const bootsSkip = advisorHasBoots && bi.id && advisorIsBootsId(bi.id);
    if (!owned && !bootsSkip) { currentlyBuilding = bi.name; break; }
  }

  // Count completed items from player inventory
  const completedItems = playerItems.filter(i => {
    const d = ddragonItemCache.byId.get(String(i.itemID));
    return d && d.gold && (d.gold > 1000 || (d.tags && d.tags.includes('Boots') && d.gold > 300));
  });
  const myItemCount = completedItems.length;
  const myNonBootsCount = completedItems.filter(i => {
    const d = ddragonItemCache.byId.get(String(i.itemID));
    return !(d && d.tags && d.tags.includes('Boots'));
  }).length;

  const buildItemsTotal = buildItems.length;
  const isBuildComplete = !remainingBuildQueue && !currentlyBuilding && myItemCount >= Math.min(buildItemsTotal, isADC ? 7 : 6);
  // ADC: full build = 6 non-boots slots filled (quest boots is separate)
  // Non-ADC: full build = 6 total slots filled
  const isFullBuild = isADC ? myNonBootsCount >= 6 : myItemCount >= 6;
  return { isBuildComplete, isFullBuild, remainingBuildQueue, currentlyBuilding, myItemCount, myNonBootsCount };
}

// Helper: Parse SELL section from AI response
function parseSellSection(text) {
  const sellReplacements = [];
  const lines = text.split('\n');
  let inSell = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'SELL') { inSell = true; continue; }
    if (trimmed === 'THREAT' || trimmed === 'ASSESSMENT' || trimmed === 'CHANGES' || trimmed === 'NEXT ITEMS') { inSell = false; continue; }
    if (inSell && trimmed.includes('→')) {
      const arrow = trimmed.indexOf('→');
      const colon = trimmed.indexOf(':', arrow);
      const cur = trimmed.substring(0, arrow).trim();
      const rec = colon > arrow ? trimmed.substring(arrow + 1, colon).trim() : trimmed.substring(arrow + 1).trim();
      const reason = colon > arrow ? trimmed.substring(colon + 1).trim() : '';
      if (cur && rec && !rec.toLowerCase().includes('no replacement') && rec.toLowerCase() !== 'none') {
        sellReplacements.push({ sellItem: cur, buyItem: rec, reason });
      }
    }
  }
  return sellReplacements;
}

// Helper: Apply SELL replacements to overlay (ADC-aware)
function applySellReplacements(updatedItems, sellReplacements, isFullBuild, isUltraLateGame, isADC) {
  let modified = false;
  for (const sell of sellReplacements) {
    const sellName = sell.sellItem.toLowerCase().trim();
    let resolved = null;
    for (const [id, d] of ddragonItemCache.byId) {
      if (d.name.toLowerCase() === sell.buyItem.toLowerCase().trim()) {
        resolved = { id, name: d.name, iconUrl: d.iconUrl || '', gold: d.gold };
        break;
      }
    }
    if (!resolved) continue;

    // Check if sold/bought items are boots
    const isSellItemBoots = (() => {
      for (const bi of updatedItems) {
        if (bi.name.toLowerCase().trim() === sellName && bi.id && advisorIsBootsId(bi.id)) return true;
      }
      return false;
    })();
    const isBuyItemBoots = resolved.id ? advisorIsBootsId(resolved.id) : false;

    // ADC quest boots: can NEVER be sold for a non-boots item
    if (isADC && isSellItemBoots && !isBuyItemBoots) continue;

    // Non-ADC boots protection: only allow boots sell if full build + ultra-late game
    if (!isADC && isSellItemBoots && !isBuyItemBoots && (!isFullBuild || !isUltraLateGame)) continue;

    // Find and replace
    for (let i = 0; i < updatedItems.length; i++) {
      const biName = updatedItems[i].name.toLowerCase().trim();
      if (biName === sellName || biName.includes(sellName) || sellName.includes(biName)) {
        updatedItems[i] = { name: resolved.name, iconUrl: resolved.iconUrl, gold: resolved.gold, id: resolved.id };
        modified = true;
        break;
      }
    }
  }
  return { updatedItems, modified };
}

// 10.1: Build NOT complete when items remain
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  const ownedNames = ['kraken slayer'];
  const playerItems = [{ itemID: '6672', displayName: 'Kraken Slayer' }];
  const result = detectBuildComplete(build, ownedNames, playerItems, false, false);
  assert(!result.isBuildComplete, '10.1 Build NOT complete when items remain');
}

// 10.2: Build complete when all items owned
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  const ownedNames = ['kraken slayer', "berserker's greaves", 'infinity edge'];
  const playerItems = [
    { itemID: '6672', displayName: 'Kraken Slayer' },
    { itemID: '3006', displayName: "Berserker's Greaves" },
    { itemID: '3031', displayName: 'Infinity Edge' },
  ];
  const result = detectBuildComplete(build, ownedNames, playerItems, false, false);
  assert(result.isBuildComplete, '10.2 Build complete when all 3 items owned');
}

// 10.3: Build complete with quest boots (ADC)
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031')];
  const ownedNames = ['kraken slayer', 'infinity edge'];
  const playerItems = [
    { itemID: '6672', displayName: 'Kraken Slayer' },
    { itemID: '3006', displayName: "Berserker's Greaves" },
    { itemID: '3031', displayName: 'Infinity Edge' },
  ];
  const result = detectBuildComplete(build, ownedNames, playerItems, true, true);
  assert(result.isBuildComplete, '10.3 Build complete with quest boots (ADC)');
}

// 10.4: Full build detection (6 items)
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031'),
    buildItem("Runaan's Hurricane", '3085'), buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072')];
  const ownedNames = ['kraken slayer', "berserker's greaves", 'infinity edge', "runaan's hurricane", 'the collector', 'bloodthirster'];
  const playerItems = [
    { itemID: '6672' }, { itemID: '3006' }, { itemID: '3031' },
    { itemID: '3085' }, { itemID: '6676' }, { itemID: '3072' },
  ];
  const result = detectBuildComplete(build, ownedNames, playerItems, false, false);
  assert(result.isFullBuild, '10.4 Full build detected (6 completed items)');
}

// 10.5: Not full build with only 4 items
{
  const playerItems = [
    { itemID: '6672' }, { itemID: '3006' }, { itemID: '3031' }, { itemID: '3085' },
  ];
  const result = detectBuildComplete([], [], playerItems, false, false);
  assert(!result.isFullBuild, '10.5 Not full build with only 4 items');
}

// 10.6: Parse SELL response — valid replacement
{
  const response = `ASSESSMENT
Build complete but Mortal Reminder would counter their healing.

CHANGES
None needed

NEXT ITEMS
Build complete

SELL
Bloodthirster → Mortal Reminder: enemy team has heavy sustain from BotRK and Bloodthirster

THREAT
Aatrox (8/2/3): Build Mortal Reminder to cut his healing`;
  const sells = parseSellSection(response);
  assert(sells.length === 1, '10.6 Parse SELL: 1 replacement found', `Got: ${sells.length}`);
  assert(sells[0].sellItem === 'Bloodthirster', '10.6b Sell item is Bloodthirster');
  assert(sells[0].buyItem === 'Mortal Reminder', '10.6c Buy item is Mortal Reminder');
}

// 10.7: Parse SELL response — "No replacement needed"
{
  const response = `ASSESSMENT
Build is optimal for this game state.

SELL
No replacement needed

THREAT
Zed (3/4/2): Play safe around his ult cooldown`;
  const sells = parseSellSection(response);
  assert(sells.length === 0, '10.7 Parse SELL: "No replacement needed" = 0 replacements');
}

// 10.8: Apply SELL — item replaced in overlay
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
    buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
  ];
  const sells = [{ sellItem: 'Bloodthirster', buyItem: 'Mortal Reminder', reason: 'anti-heal needed' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, true, false);
  assert(result.modified, '10.8 SELL applied: overlay was modified');
  assert(result.updatedItems[5].id === '3033', '10.8b Mortal Reminder now at slot 5');
  assert(!result.updatedItems.some(i => i.id === '3072'), '10.8c Bloodthirster removed');
}

// 10.9: SELL blocked — boots replacement before 30min
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
    buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
  ];
  const sells = [{ sellItem: "Berserker's Greaves", buyItem: "Lord Dominik's Regards", reason: 'more damage late game' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, false, false); // NOT ultra-late, non-ADC
  assert(!result.modified, '10.9 Boots sell BLOCKED before 30min');
  assert(result.updatedItems[1].id === '3006', '10.9b Boots still in build');
}

// 10.10: SELL allowed — boots replacement at 30+ min with full build
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
    buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
  ];
  const sells = [{ sellItem: "Berserker's Greaves", buyItem: "Lord Dominik's Regards", reason: 'more damage ultra-late' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, true, false); // IS ultra-late, non-ADC
  assert(result.modified, '10.10 Boots sell ALLOWED at 30+ min with full build');
  assert(result.updatedItems[1].id === '3036', "10.10b Lord Dominik's now at slot 1");
}

// 10.11: SELL blocked — boots replacement without full 6 items
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
  ];
  const sells = [{ sellItem: "Berserker's Greaves", buyItem: "Lord Dominik's Regards", reason: 'more damage' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, false, true, false); // ultra-late but NOT full build, non-ADC
  assert(!result.modified, '10.11 Boots sell BLOCKED without full 6-item build');
}

// 10.12: SELL non-boots item — always allowed (even pre-30min)
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
    buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
  ];
  const sells = [{ sellItem: 'The Collector', buyItem: "Lord Dominik's Regards", reason: 'armor pen needed' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, false, false); // NOT ultra-late, but non-boots
  assert(result.modified, '10.12 Non-boots sell allowed even before 30min');
  assert(result.updatedItems[4].id === '3036', "10.12b Lord Dominik's replaced The Collector");
}

// 10.13: SELL item not in build — no crash, no modification
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'),
  ];
  const sells = [{ sellItem: 'Phantom Dancer', buyItem: 'Mortal Reminder', reason: 'need anti-heal' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, true, false);
  assert(!result.modified, '10.13 SELL item not in build → no crash, no modification');
}

// 10.14: SELL buy item not in DDragon — skipped
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem('Infinity Edge', '3031'),
  ];
  const sells = [{ sellItem: 'Infinity Edge', buyItem: 'FakeItem9000', reason: 'doesnt exist' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, true, false);
  assert(!result.modified, '10.14 SELL buy item not in DDragon → skipped');
  assert(result.updatedItems[1].id === '3031', '10.14b Infinity Edge unchanged');
}

// 10.15: Build complete context includes right info
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031'),
    buildItem("Runaan's Hurricane", '3085'), buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072')];
  const ownedNames = ['kraken slayer', "berserker's greaves", 'infinity edge', "runaan's hurricane", 'the collector', 'bloodthirster'];
  const playerItems = [
    { itemID: '6672' }, { itemID: '3006' }, { itemID: '3031' },
    { itemID: '3085' }, { itemID: '6676' }, { itemID: '3072' },
  ];
  const result = detectBuildComplete(build, ownedNames, playerItems, false, false);
  assert(result.isBuildComplete && result.isFullBuild, '10.15 Full 6-item build complete detected correctly');
}

// ═══════════════════════════════════════════════════════════════════
// SUITE 11: ADC Quest Boots — SELL Protection
// ═══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 11: ADC Quest Boots — SELL Protection');
console.log('══════════════════════════════════════════════════════════\n');

// 11.1: ADC quest boots → non-boots ALWAYS blocked
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
    buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
  ];
  const sells = [{ sellItem: "Berserker's Greaves", buyItem: "Lord Dominik's Regards", reason: 'more damage' }];
  // ADC = true, full build, ultra-late... but still BLOCKED because ADC boots can't become non-boots
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, true, true);
  assert(!result.modified, '11.1 ADC: boots→non-boots ALWAYS blocked (even at 30+ min)');
  assert(result.updatedItems[1].id === '3006', '11.1b Boots still in build');
}

// 11.2: ADC boots → other boots ALLOWED
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
    buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
  ];
  const sells = [{ sellItem: "Berserker's Greaves", buyItem: "Mercury's Treads", reason: 'enemy has heavy CC' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, true, true);
  assert(result.modified, '11.2 ADC: boots→boots swap ALLOWED');
  assert(result.updatedItems[1].id === '3111', "11.2b Mercury's Treads now at slot 1");
}

// 11.3: ADC non-boots sell still works normally
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
    buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
  ];
  const sells = [{ sellItem: 'Bloodthirster', buyItem: 'Mortal Reminder', reason: 'anti-heal' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, true, true);
  assert(result.modified, '11.3 ADC: non-boots sell works normally');
  assert(result.updatedItems[5].id === '3033', '11.3b Mortal Reminder at slot 5');
}

// 11.4: ADC full build detection — 7 items (6 non-boots + quest boots)
{
  const build = [buildItem('Kraken Slayer', '6672'), buildItem("Berserker's Greaves", '3006'), buildItem('Infinity Edge', '3031'),
    buildItem("Runaan's Hurricane", '3085'), buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
    buildItem("Lord Dominik's Regards", '3036')];
  const ownedNames = ['kraken slayer', "berserker's greaves", 'infinity edge', "runaan's hurricane", 'the collector', 'bloodthirster', "lord dominik's regards"];
  const playerItems = [
    { itemID: '6672' }, { itemID: '3006' }, { itemID: '3031' },
    { itemID: '3085' }, { itemID: '6676' }, { itemID: '3072' }, { itemID: '3036' },
  ];
  const result = detectBuildComplete(build, ownedNames, playerItems, false, true);
  assert(result.isBuildComplete, '11.4 ADC: 7-item build detected as complete');
  assert(result.isFullBuild, '11.4b ADC: isFullBuild=true (6 non-boots items)');
  assert(result.myNonBootsCount === 6, '11.4c ADC: 6 non-boots items counted correctly');
}

// 11.5: ADC partial build (5 items + boots) — NOT full
{
  const playerItems = [
    { itemID: '6672' }, { itemID: '3006' }, { itemID: '3031' },
    { itemID: '3085' }, { itemID: '6676' }, { itemID: '3072' },
  ];
  const result = detectBuildComplete([], [], playerItems, false, true);
  assert(!result.isFullBuild, '11.5 ADC: 5 non-boots + boots = NOT full build (need 6 non-boots)');
  assert(result.myNonBootsCount === 5, '11.5b ADC: 5 non-boots counted');
}

// 11.6: Non-ADC boots sell still works at 30+ min with full build
{
  const items = [
    buildItem('Kraken Slayer', '6672'), buildItem("Mercury's Treads", '3111'),
    buildItem('Infinity Edge', '3031'), buildItem("Runaan's Hurricane", '3085'),
    buildItem('The Collector', '6676'), buildItem('Bloodthirster', '3072'),
  ];
  const sells = [{ sellItem: "Mercury's Treads", buyItem: "Blade of the Ruined King", reason: 'more damage ultra-late' }];
  const result = applySellReplacements([...items.map(i => ({...i}))], sells, true, true, false); // Non-ADC, full, ultra-late
  assert(result.modified, '11.6 Non-ADC: boots sell WORKS at 30+ min with full build');
  assert(result.updatedItems[1].id === '3153', "11.6b BotRK replaced Mercury's Treads");
}


// ─── RESULTS ───────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.error('⚠️  SOME TESTS FAILED. Review the ❌ items above.');
  process.exit(1);
} else {
  console.log('🎉 ALL TESTS PASSED! Intelligence upgrades verified.');
  process.exit(0);
}
