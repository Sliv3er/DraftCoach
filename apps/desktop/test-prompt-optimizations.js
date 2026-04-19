/**
 * Stress Test Suite for DraftCoach Prompt Optimization (Round 2)
 * 
 * Tests all new logic WITHOUT needing Electron or the Gemini API.
 * Extracts and validates the pure-logic functions independently.
 * 
 * Usage: node apps/desktop/test-prompt-optimizations.js
 */

const assert = require('assert');
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    results.push(`  ❌ ${name}: ${e.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════
// Extract logic from main.js into testable standalone functions
// ════════════════════════════════════════════════════════════════════

// ── Fix #2: Valid Items Filter ──
function getValidItemsReference(itemCache) {
  if (!itemCache || !itemCache.byId) return '';
  const categories = {};
  for (const [id, item] of itemCache.byId) {
    const isBoots = item.tags && item.tags.includes('Boots');
    if (!isBoots && item.gold < 2000) continue;
    if (!isBoots && (!item.from || item.from.length === 0)) continue;
    if (item.into && item.into.length > 0) continue;
    if (!item.tags || item.tags.length === 0) continue;
    const primaryTag = item.tags[0];
    if (!categories[primaryTag]) categories[primaryTag] = [];
    if (!categories[primaryTag].includes(item.name)) {
      categories[primaryTag].push(item.name);
    }
  }
  if (Object.keys(categories).length === 0) return '';
  let ref = 'VALID COMPLETED ITEMS (Season 2026):\n';
  for (const [tag, items] of Object.entries(categories)) {
    ref += `${tag}: ${items.join(', ')}\n`;
  }
  ref += 'RULE: ONLY suggest items from this list. If an item is not here, it does NOT exist in the game.\n';
  return ref;
}

// ── Fix #5: Champion Counter Hints ──
const CHAMPION_COUNTER_HINTS = {
  'Zed': 'Zed [AD Burst] → Zhonya\'s negates R',
  'Talon': 'Talon [AD Burst] → Early armor + Sterak\'s/Zhonya\'s',
  'Fizz': 'Fizz [AP Burst] → Banshee\'s blocks R, MR rush',
  'Katarina': 'Katarina [AP/AD Hybrid] → CC interrupts R, anti-heal',
  'Malzahar': 'Malzahar [AP Suppress] → QSS removes R',
  'Mordekaiser': 'Mordekaiser [AP Bruiser] → QSS cleanses R',
  'Vayne': 'Vayne [True Dmg] → HP stacking > armor, burst < 3 autos',
  'Fiora': 'Fiora [True Dmg] → Thornmail + Frozen Heart',
  'Veigar': 'Veigar [AP Scaling] → Banshee\'s blocks E cage, MR',
  'Sylas': 'Sylas [AP Bruiser] → Anti-heal CRITICAL, MR',
  'Vladimir': 'Vladimir [AP Sustain] → Anti-heal MANDATORY',
  'Aatrox': 'Aatrox [AD Drain] → Anti-heal MANDATORY',
  'DrMundo': 'Dr. Mundo [HP Tank] → Anti-heal + % HP damage',
  'Warwick': 'Warwick [Healing Fighter] → Anti-heal, CC interrupts R',
  'Yasuo': 'Yasuo [AD Crit] → Randuin\'s (anti-crit)',
  'Yone': 'Yone [AD/AP Hybrid] → Needs armor AND MR, Randuin\'s',
  'Irelia': 'Irelia [AD Sustained] → Thornmail + Frozen Heart',
  'Tryndamere': 'Tryndamere [AD Crit] → Randuin\'s, disengage during R',
  'Kassadin': 'Kassadin [AP Scaling] → Punish early (weak pre-6)',
  'Nasus': 'Nasus [AD Scaling] → Kite, % armor pen late',
  'Akali': 'Akali [AP Assassin] → MR + HP, sweeper for shroud',
  'LeBlanc': 'LeBlanc [AP Burst] → Banshee\'s, MR rush',
  'Rengar': 'Rengar [AD Burst] → Zhonya\'s/GA, group up',
  'KhaZix': 'Kha\'Zix [AD Assassin] → Stay grouped (isolation = death)',
  'Samira': 'Samira [AD Melee ADC] → CC interrupts R',
  'Kayn': 'Kayn [Shadow/Rhaast] → Red: anti-heal + armor. Blue: MR + burst',
};

function computeEnemyProfile(enemies, champCache) {
  if (!enemies || enemies.length === 0) return '';
  let apCount = 0, adCount = 0, tankCount = 0, assassinCount = 0, hasHealing = false;
  const details = [];
  const counterHints = [];
  const healChamps = ['Soraka', 'Yuumi', 'Sona', 'Nami', 'Vladimir', 'Aatrox', 'Warwick', 'DrMundo', 'Swain', 'Fiora', 'Sylas', 'Briar', 'Belveth'];

  for (const enemy of enemies) {
    const data = champCache.get(enemy);
    if (!data) { details.push(`${enemy} [Unknown]`); continue; }
    const tags = data.tags || [];
    if (tags.includes('Mage')) apCount++;
    if (tags.includes('Marksman') || tags.includes('Fighter')) adCount++;
    if (tags.includes('Tank')) tankCount++;
    if (tags.includes('Assassin')) assassinCount++;
    if (healChamps.includes(enemy) || healChamps.includes(data.id)) hasHealing = true;
    details.push(`${enemy} [${tags.join('/')}]`);
    if (CHAMPION_COUNTER_HINTS[enemy]) counterHints.push(CHAMPION_COUNTER_HINTS[enemy]);
    else if (data.id && CHAMPION_COUNTER_HINTS[data.id]) counterHints.push(CHAMPION_COUNTER_HINTS[data.id]);
  }

  let analysis = '\nENEMY TEAM PROFILE:\n';
  analysis += `Champions: ${details.join(', ')}\n`;
  analysis += `Damage Split: ${apCount} AP / ${adCount} AD / ${tankCount} Tanks / ${assassinCount} Assassins\n`;
  if (apCount >= 3) analysis += '⚠️ HEAVY AP TEAM\n';
  if (adCount >= 3) analysis += '⚠️ HEAVY AD TEAM\n';
  if (tankCount >= 2) analysis += '⚠️ TANKY TEAM\n';
  if (assassinCount >= 2) analysis += '⚠️ ASSASSIN-HEAVY\n';
  if (hasHealing) analysis += '⚠️ ENEMY HAS HEALING\n';
  if (counterHints.length > 0) analysis += '\nCHAMPION-SPECIFIC COUNTER TIPS:\n' + counterHints.join('\n') + '\n';
  return analysis;
}

// ── Fix #7: Duplicate item dedup ──
function dedupCoreBuild(text) {
  const corrections = [];
  let corrected = text;
  const coreDedupMatch = corrected.match(/CORE BUILD\n([\s\S]*?)(?=\n(?:SITUATIONAL|JUNGLE PATH|ENEMY POWER|WIN CONDITION|YOUR POWER|\n\n))/);
  if (coreDedupMatch) {
    const coreBlock = coreDedupMatch[1];
    const coreItemLines = coreBlock.split('\n');
    const seenItems = new Set();
    const dedupedLines = [];
    let renumber = 1;
    for (const line of coreItemLines) {
      const itemMatch = line.match(/^\d+[\.\\)]\s*(.+?)(?:\s*\(.*\))?$/);
      if (itemMatch) {
        const itemKey = itemMatch[1].trim().toLowerCase();
        if (seenItems.has(itemKey)) {
          corrections.push(`Removed duplicate item: "${itemMatch[1].trim()}"`);
          continue;
        }
        seenItems.add(itemKey);
        dedupedLines.push(line.replace(/^\d+/, String(renumber)));
        renumber++;
      } else {
        dedupedLines.push(line);
      }
    }
    if (dedupedLines.length < coreItemLines.length) {
      corrected = corrected.replace(coreBlock, dedupedLines.join('\n'));
    }
  }
  return { corrected, corrections };
}

// ── Fix #8: Secondary tree validation ──
function validateSecondaryTree(text) {
  const corrections = [];
  let corrected = text;
  const primaryTreeMatch = corrected.match(/Primary:\s*(\w+)/);
  const secondaryTreeMatch = corrected.match(/Secondary:\s*(\w+)/);
  if (primaryTreeMatch && secondaryTreeMatch) {
    const primaryTree = primaryTreeMatch[1].trim().toLowerCase();
    const secondaryTree = secondaryTreeMatch[1].trim().toLowerCase();
    if (primaryTree === secondaryTree && primaryTree !== '') {
      const pairings = {
        'precision': 'Domination', 'domination': 'Precision', 'sorcery': 'Inspiration',
        'resolve': 'Precision', 'inspiration': 'Sorcery',
      };
      const replacement = pairings[primaryTree] || 'Domination';
      corrections.push(`Secondary tree same as primary → changed to "${replacement}"`);
      corrected = corrected.replace(/Secondary:\s*\w+/, `Secondary: ${replacement}`);
    }
  }
  return { corrected, corrections };
}

// ── Fix #6: Pre-computed threat analysis ──
function computeThreatAnalysis(enemies, damageSection) {
  const fedEnemy = enemies.find(e => (e.scores?.kills || 0) >= 5 || ((e.scores?.kills || 0) - (e.scores?.deaths || 0)) >= 4);
  if (fedEnemy) return `${damageSection}\nKey threat: ${fedEnemy.championName} is FED (${fedEnemy.scores?.kills}/${fedEnemy.scores?.deaths}/${fedEnemy.scores?.assists}) — prioritize countering their damage type`;
  const strongestEnemy = enemies.reduce((a, b) => ((b.scores?.kills || 0) - (b.scores?.deaths || 0)) > ((a.scores?.kills || 0) - (a.scores?.deaths || 0)) ? b : a, enemies[0]);
  return strongestEnemy ? `${damageSection}\nKey threat: ${strongestEnemy.championName} is the primary threat (${strongestEnemy.scores?.kills || 0}/${strongestEnemy.scores?.deaths || 0}/${strongestEnemy.scores?.assists || 0})` : `${damageSection}\nKey threat: No clear primary threat`;
}


// ════════════════════════════════════════════════════════════════════
// MOCK DATA
// ════════════════════════════════════════════════════════════════════

const mockItemCache = {
  byId: new Map([
    // Completed item: builds from components, doesn't build into anything
    ['3031', { name: 'Infinity Edge', gold: 3400, tags: ['Damage', 'CriticalStrike'], from: ['1038', '1018'], into: undefined }],
    ['3153', { name: 'Blade of the Ruined King', gold: 3200, tags: ['Damage', 'AttackSpeed', 'LifeSteal'], from: ['1042', '1053'], into: undefined }],
    ['3089', { name: "Rabadon's Deathcap", gold: 3600, tags: ['SpellDamage'], from: ['1058', '1026'], into: undefined }],
    ['3157', { name: "Zhonya's Hourglass", gold: 3250, tags: ['SpellDamage', 'Armor'], from: ['3191', '3108'], into: undefined }],
    ['3006', { name: "Berserker's Greaves", gold: 1100, tags: ['Boots', 'AttackSpeed'], from: ['1001'], into: undefined }],
    ['3020', { name: "Sorcerer's Shoes", gold: 1100, tags: ['Boots', 'MagicPenetration'], from: ['1001'], into: undefined }],
    ['3047', { name: "Plated Steelcaps", gold: 1100, tags: ['Boots', 'Armor'], from: ['1001', '1029'], into: undefined }],

    // Mid-tier component: builds FROM something AND INTO something → should be EXCLUDED
    ['3133', { name: "Caulfield's Warhammer", gold: 1100, tags: ['Damage', 'CooldownReduction'], from: ['1036'], into: ['6693', '3142'] }],
    ['3044', { name: 'Phage', gold: 1100, tags: ['Damage', 'Health'], from: ['1036', '1028'], into: ['3078'] }],
    ['3916', { name: 'Oblivion Orb', gold: 800, tags: ['SpellDamage'], from: ['1052'], into: ['3165'] }],

    // Cheap component: no build path FROM → should be EXCLUDED
    ['1036', { name: 'Long Sword', gold: 350, tags: ['Damage'], from: undefined, into: ['3133'] }],
    ['1052', { name: 'Amplifying Tome', gold: 435, tags: ['SpellDamage'], from: undefined, into: ['3916'] }],

    // Expensive item with no build path → should be EXCLUDED (e.g., special items)
    ['7050', { name: 'Fake Special Item', gold: 3000, tags: ['Damage'], from: undefined, into: undefined }],

    // Item with no tags → should be EXCLUDED
    ['0000', { name: 'No Tags Item', gold: 5000, tags: [], from: ['1036'], into: undefined }],
  ]),
};

const mockChampCache = new Map([
  ['Zed', { id: 'Zed', tags: ['Assassin', 'Fighter'] }],
  ['Syndra', { id: 'Syndra', tags: ['Mage'] }],
  ['Amumu', { id: 'Amumu', tags: ['Tank', 'Mage'] }],
  ['Jinx', { id: 'Jinx', tags: ['Marksman'] }],
  ['Lux', { id: 'Lux', tags: ['Mage', 'Support'] }],
  ['Vladimir', { id: 'Vladimir', tags: ['Mage'] }],
  ['Aatrox', { id: 'Aatrox', tags: ['Fighter', 'Tank'] }],
  ['Vayne', { id: 'Vayne', tags: ['Marksman', 'Assassin'] }],
  ['Malzahar', { id: 'Malzahar', tags: ['Mage', 'Assassin'] }],
  ['Yasuo', { id: 'Yasuo', tags: ['Fighter', 'Assassin'] }],
  ['Garen', { id: 'Garen', tags: ['Fighter', 'Tank'] }],
  ['Teemo', { id: 'Teemo', tags: ['Marksman', 'Assassin'] }],
  ['Draven', { id: 'Draven', tags: ['Marksman'] }],
  ['Thresh', { id: 'Thresh', tags: ['Support', 'Fighter'] }],
  ['LeeSin', { id: 'LeeSin', tags: ['Fighter', 'Assassin'] }],
]);


// ════════════════════════════════════════════════════════════════════
// TEST SUITE 1: Valid Items Filter (Fix #2)
// ════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   STRESS TEST: DraftCoach Prompt Optimization Round 2   ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('── Test Suite 1: Valid Items Filter (Fix #2) ──');

test('Completed items (3400g, has from[], no into[]) included', () => {
  const ref = getValidItemsReference(mockItemCache);
  assert(ref.includes('Infinity Edge'), 'IE should be in valid items');
  assert(ref.includes('Blade of the Ruined King'), 'BotRK should be in valid items');
  assert(ref.includes("Rabadon's Deathcap"), "Deathcap should be in valid items");
  assert(ref.includes("Zhonya's Hourglass"), "Zhonya's should be in valid items");
});

test('Boots included despite low gold cost (<2000g)', () => {
  const ref = getValidItemsReference(mockItemCache);
  assert(ref.includes("Berserker's Greaves"), 'Berserkers should be in valid items');
  assert(ref.includes("Sorcerer's Shoes"), "Sorc shoes should be in valid items");
  assert(ref.includes("Plated Steelcaps"), "Steelcaps should be in valid items");
});

test('Mid-tier components (has into[]) EXCLUDED', () => {
  const ref = getValidItemsReference(mockItemCache);
  assert(!ref.includes("Caulfield's Warhammer"), "Warhammer should NOT be in valid items (has into[])");
  assert(!ref.includes('Phage'), 'Phage should NOT be in valid items (has into[])');
  assert(!ref.includes('Oblivion Orb'), 'Oblivion Orb should NOT be in valid items (has into[])');
});

test('Cheap components (no from[], low gold) EXCLUDED', () => {
  const ref = getValidItemsReference(mockItemCache);
  assert(!ref.includes('Long Sword'), 'Long Sword should NOT be in valid items');
  assert(!ref.includes('Amplifying Tome'), 'Amplifying Tome should NOT be in valid items');
});

test('Expensive items with no build path EXCLUDED', () => {
  const ref = getValidItemsReference(mockItemCache);
  assert(!ref.includes('Fake Special Item'), 'Items with no from[] and >2000g but not boots should be excluded');
});

test('Items with no tags EXCLUDED', () => {
  const ref = getValidItemsReference(mockItemCache);
  assert(!ref.includes('No Tags Item'), 'Items with empty tags should be excluded');
});

test('Empty cache returns empty string', () => {
  assert.strictEqual(getValidItemsReference(null), '');
  assert.strictEqual(getValidItemsReference({ byId: new Map() }), '');
});

test('Output contains header and rule line', () => {
  const ref = getValidItemsReference(mockItemCache);
  assert(ref.startsWith('VALID COMPLETED ITEMS (Season 2026):'), 'Should have header');
  assert(ref.includes('RULE: ONLY suggest items from this list'), 'Should have rule line');
});


// ════════════════════════════════════════════════════════════════════
// TEST SUITE 2: Enemy Profile & Counter Hints (Fix #5)
// ════════════════════════════════════════════════════════════════════
console.log('\n── Test Suite 2: Enemy Profile & Counter Hints (Fix #5) ──');

test('3+ AP triggers HEAVY AP warning', () => {
  const profile = computeEnemyProfile(['Syndra', 'Lux', 'Vladimir'], mockChampCache);
  assert(profile.includes('⚠️ HEAVY AP TEAM'), 'Should show heavy AP warning');
});

test('3+ AD triggers HEAVY AD warning', () => {
  const profile = computeEnemyProfile(['Jinx', 'Draven', 'Yasuo'], mockChampCache);
  assert(profile.includes('⚠️ HEAVY AD TEAM'), 'Should show heavy AD warning');
});

test('2+ tanks trigger TANKY warning', () => {
  const profile = computeEnemyProfile(['Amumu', 'Aatrox', 'Garen'], mockChampCache);
  assert(profile.includes('⚠️ TANKY TEAM'), 'Should show tanky team warning');
});

test('2+ assassins trigger ASSASSIN warning', () => {
  const profile = computeEnemyProfile(['Zed', 'Vayne', 'Malzahar'], mockChampCache);
  assert(profile.includes('⚠️ ASSASSIN-HEAVY'), 'Should show assassin warning');
});

test('Healing champion triggers HEALING warning', () => {
  const profile = computeEnemyProfile(['Vladimir', 'Aatrox', 'Garen'], mockChampCache);
  assert(profile.includes('⚠️ ENEMY HAS HEALING'), 'Should show healing warning');
});

test('Counter hints show for known champions', () => {
  const profile = computeEnemyProfile(['Zed', 'Malzahar', 'Vayne'], mockChampCache);
  assert(profile.includes('CHAMPION-SPECIFIC COUNTER TIPS'), 'Should have counter tips section');
  assert(profile.includes("Zhonya's negates R"), 'Should have Zed counter hint');
  assert(profile.includes('QSS removes R'), 'Should have Malzahar counter hint');
  assert(profile.includes('HP stacking > armor'), 'Should have Vayne counter hint');
});

test('No counter hints for unknown champions', () => {
  const profile = computeEnemyProfile(['Garen', 'Thresh', 'LeeSin'], mockChampCache);
  assert(!profile.includes('CHAMPION-SPECIFIC COUNTER TIPS'), 'Should NOT have counter tips for unlisted champs');
});

test('Unknown champions show [Unknown] tag', () => {
  const profile = computeEnemyProfile(['FakeChampion123'], mockChampCache);
  assert(profile.includes('FakeChampion123 [Unknown]'), 'Unknown champs should show [Unknown]');
});

test('Empty enemies returns empty string', () => {
  assert.strictEqual(computeEnemyProfile([], mockChampCache), '');
  assert.strictEqual(computeEnemyProfile(null, mockChampCache), '');
});

test('Mixed team with all warnings', () => {
  const profile = computeEnemyProfile(['Syndra', 'Lux', 'Vladimir', 'Zed', 'Vayne'], mockChampCache);
  assert(profile.includes('HEAVY AP TEAM'), 'Should show AP warning (3 mages)');
  assert(profile.includes('ENEMY HAS HEALING'), 'Should show healing (Vladimir)');
  assert(profile.includes('ASSASSIN-HEAVY'), 'Should show assassin warning (Zed + Vayne)');
});


// ════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Duplicate Item Dedup (Fix #7)
// ════════════════════════════════════════════════════════════════════
console.log('\n── Test Suite 3: Duplicate Item Dedup (Fix #7) ──');

test('Removes duplicate items from CORE BUILD', () => {
  const input = `RUNES
Primary: Precision
Keystone: Lethal Tempo

CORE BUILD
1. Infinity Edge (crit)
2. Phantom Dancer (AS)
3. Infinity Edge (duplicate)
4. Bloodthirster (sustain)
5. Lord Dominik's Regards (pen)
6. Guardian Angel (safety)

SITUATIONAL ITEMS
Wit's End: vs AP`;
  const { corrected, corrections } = dedupCoreBuild(input);
  assert(corrections.length === 1, `Expected 1 correction, got ${corrections.length}`);
  assert(corrections[0].includes('Infinity Edge'), 'Should mention removed duplicate');
  // Count how many times "Infinity Edge" appears in CORE BUILD
  const coreMatch = corrected.match(/CORE BUILD\n([\s\S]*?)(?=\n(?:SITUATIONAL))/);
  const ieCount = (coreMatch[1].match(/Infinity Edge/g) || []).length;
  assert(ieCount === 1, `IE should appear once, got ${ieCount}`);
});

test('Renumbers items after dedup', () => {
  const input = `CORE BUILD
1. Infinity Edge (crit)
2. Phantom Dancer (AS)
3. Infinity Edge (duplicate)
4. Bloodthirster (sustain)
5. Lord Dominik's Regards (pen)
6. Guardian Angel (safety)

SITUATIONAL ITEMS
test`;
  const { corrected } = dedupCoreBuild(input);
  assert(corrected.includes('5. Guardian Angel'), 'GA should be renumbered to 5');
});

test('No changes when no duplicates', () => {
  const input = `CORE BUILD
1. Infinity Edge (crit)
2. Phantom Dancer (AS)
3. Bloodthirster (sustain)
4. Lord Dominik's Regards (pen)
5. Rapid Firecannon (range)
6. Guardian Angel (safety)

SITUATIONAL ITEMS
test`;
  const { corrections } = dedupCoreBuild(input);
  assert(corrections.length === 0, `Expected 0 corrections, got ${corrections.length}`);
});

test('Handles multiple duplicates', () => {
  const input = `CORE BUILD
1. Infinity Edge (crit)
2. Phantom Dancer (AS)
3. Infinity Edge (dup 1)
4. Phantom Dancer (dup 2)
5. Bloodthirster (sustain)
6. Guardian Angel (safety)

SITUATIONAL ITEMS
test`;
  const { corrections } = dedupCoreBuild(input);
  assert(corrections.length === 2, `Expected 2 corrections, got ${corrections.length}`);
});

test('Case-insensitive dedup', () => {
  const input = `CORE BUILD
1. Infinity Edge (crit)
2. infinity edge (dup)
3. Bloodthirster (sustain)
4. Guardian Angel (safety)
5. Phantom Dancer (AS)
6. Rapid Firecannon (range)

SITUATIONAL ITEMS
test`;
  const { corrections } = dedupCoreBuild(input);
  assert(corrections.length === 1, `Expected 1 case-insensitive dedup, got ${corrections.length}`);
});


// ════════════════════════════════════════════════════════════════════
// TEST SUITE 4: Secondary Tree Validation (Fix #8)
// ════════════════════════════════════════════════════════════════════
console.log('\n── Test Suite 4: Secondary Tree Validation (Fix #8) ──');

test('Detects and fixes same primary/secondary tree', () => {
  const input = `RUNES
Primary: Precision
Keystone: Lethal Tempo
Presence of Mind
Legend: Bloodline
Cut Down
Secondary: Precision
Triumph
Overheal
Shards: Attack Speed, Adaptive Force, Health`;
  const { corrected, corrections } = validateSecondaryTree(input);
  assert(corrections.length === 1, `Expected 1 correction, got ${corrections.length}`);
  assert(corrected.includes('Secondary: Domination'), `Expected Domination, got: ${corrected.match(/Secondary:\s*\w+/)?.[0]}`);
  assert(!corrected.includes('Secondary: Precision'), 'Should not have Precision secondary anymore');
});

test('No change when trees are different', () => {
  const input = `RUNES
Primary: Precision
Keystone: Lethal Tempo
Secondary: Domination
Shards: Attack Speed, Adaptive Force, Health`;
  const { corrections } = validateSecondaryTree(input);
  assert(corrections.length === 0, 'Should not correct valid tree pairing');
});

test('Sorcery same-tree → Inspiration', () => {
  const input = `Primary: Sorcery\nSecondary: Sorcery`;
  const { corrected } = validateSecondaryTree(input);
  assert(corrected.includes('Secondary: Inspiration'), `Sorcery should pair with Inspiration`);
});

test('Resolve same-tree → Precision', () => {
  const input = `Primary: Resolve\nSecondary: Resolve`;
  const { corrected } = validateSecondaryTree(input);
  assert(corrected.includes('Secondary: Precision'), `Resolve should pair with Precision`);
});

test('Domination same-tree → Precision', () => {
  const input = `Primary: Domination\nSecondary: Domination`;
  const { corrected } = validateSecondaryTree(input);
  assert(corrected.includes('Secondary: Precision'), `Domination should pair with Precision`);
});

test('Inspiration same-tree → Sorcery', () => {
  const input = `Primary: Inspiration\nSecondary: Inspiration`;
  const { corrected } = validateSecondaryTree(input);
  assert(corrected.includes('Secondary: Sorcery'), `Inspiration should pair with Sorcery`);
});


// ════════════════════════════════════════════════════════════════════
// TEST SUITE 5: Pre-computed Threat Analysis (Fix #6)
// ════════════════════════════════════════════════════════════════════
console.log('\n── Test Suite 5: Pre-computed Threat Analysis (Fix #6) ──');

test('Fed enemy (5+ kills) detected as primary threat', () => {
  const enemies = [
    { championName: 'Zed', scores: { kills: 7, deaths: 1, assists: 3 } },
    { championName: 'Syndra', scores: { kills: 2, deaths: 3, assists: 1 } },
  ];
  const result = computeThreatAnalysis(enemies, 'DAMAGE: 1 AD / 1 AP');
  assert(result.includes('Zed is FED'), 'Should detect Zed as fed');
  assert(result.includes('7/1/3'), 'Should include KDA');
});

test('Fed enemy by KD diff (4+ kills - deaths) detected', () => {
  const enemies = [
    { championName: 'Yasuo', scores: { kills: 4, deaths: 0, assists: 2 } },
    { championName: 'Lux', scores: { kills: 1, deaths: 2, assists: 5 } },
  ];
  const result = computeThreatAnalysis(enemies, 'DAMAGE: 1 AD / 1 AP');
  assert(result.includes('Yasuo is FED'), 'Should detect Yasuo as fed (4+ KD diff)');
});

test('No fed enemies → strongest by KD chosen', () => {
  const enemies = [
    { championName: 'Syndra', scores: { kills: 3, deaths: 2, assists: 1 } },
    { championName: 'Amumu', scores: { kills: 1, deaths: 4, assists: 6 } },
  ];
  const result = computeThreatAnalysis(enemies, 'DAMAGE: mixed');
  assert(result.includes('Syndra is the primary threat'), 'Should pick Syndra as strongest (best KD)');
});

test('Includes damage section in output', () => {
  const enemies = [{ championName: 'Garen', scores: { kills: 0, deaths: 0, assists: 0 } }];
  const result = computeThreatAnalysis(enemies, 'ENEMY: 1 AD / 0 AP');
  assert(result.includes('ENEMY: 1 AD / 0 AP'), 'Should include damage section');
});


// ════════════════════════════════════════════════════════════════════
// TEST SUITE 6: Stress Tests — Edge Cases
// ════════════════════════════════════════════════════════════════════
console.log('\n── Test Suite 6: Stress Tests — Edge Cases ──');

test('Full 5-person enemy team with all warnings', () => {
  // 3 mages (AP heavy), 2 assassins, healing (Vladimir)
  const profile = computeEnemyProfile(['Syndra', 'Lux', 'Vladimir', 'Zed', 'Teemo'], mockChampCache);
  assert(profile.includes('Damage Split:'), 'Should have damage split');
  assert(profile.includes('HEAVY AP TEAM'), 'Should trigger AP warning');
  assert(profile.includes('COUNTER TIPS'), 'Should have counter tips');
});

test('Large number of items in cache handled correctly', () => {
  const largeCache = { byId: new Map() };
  for (let i = 0; i < 500; i++) {
    largeCache.byId.set(String(10000 + i), {
      name: `Test Item ${i}`,
      gold: 2500 + (i % 3000),
      tags: ['Damage'],
      from: ['1036'],
      into: i < 200 ? ['9999'] : undefined, // First 200 are mid-tier
    });
  }
  const ref = getValidItemsReference(largeCache);
  // Should include items 200-499 (300 items) but NOT 0-199 (they have into[])
  const itemCount = (ref.match(/Test Item/g) || []).length;
  assert(itemCount === 300, `Expected 300 items, got ${itemCount}`);
});

test('CORE BUILD with no items still works', () => {
  const input = `CORE BUILD\n\nSITUATIONAL ITEMS\ntest`;
  const { corrections } = dedupCoreBuild(input);
  assert(corrections.length === 0, 'Empty core build should not crash');
});

test('Text with no CORE BUILD section handled', () => {
  const input = `RUNES\nPrimary: Precision\nSITUATIONAL ITEMS\ntest`;
  const { corrections } = dedupCoreBuild(input);
  assert(corrections.length === 0, 'Missing core build should not crash');
});

test('Text with no rune trees handled', () => {
  const input = `CORE BUILD\n1. Infinity Edge\nSITUATIONAL ITEMS\ntest`;
  const { corrections } = validateSecondaryTree(input);
  assert(corrections.length === 0, 'Missing trees should not crash');
});

test('All 5 rune trees have valid pairings', () => {
  const trees = ['Precision', 'Domination', 'Sorcery', 'Resolve', 'Inspiration'];
  for (const tree of trees) {
    const input = `Primary: ${tree}\nSecondary: ${tree}`;
    const { corrected, corrections } = validateSecondaryTree(input);
    assert(corrections.length === 1, `${tree} same-tree should be corrected`);
    const newSecondary = corrected.match(/Secondary:\s*(\w+)/)[1];
    assert(newSecondary !== tree, `${tree} secondary should change to something else, got ${newSecondary}`);
    assert(trees.includes(newSecondary), `${newSecondary} should be a valid tree name`);
  }
});


// ════════════════════════════════════════════════════════════════════
// RESULTS
// ════════════════════════════════════════════════════════════════════
console.log('\n' + results.join('\n'));
console.log(`\n╔════════════════════════════════════╗`);
console.log(`║  Results: ${passed} passed, ${failed} failed     ║`);
console.log(`╚════════════════════════════════════╝`);

if (failed > 0) {
  process.exit(1);
}
